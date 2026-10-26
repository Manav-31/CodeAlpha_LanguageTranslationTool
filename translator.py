"""Translation providers.

Providers are tried in order until one succeeds:
  1. Microsoft Translator - only if AZURE_TRANSLATOR_KEY is set in .env
  2. MyMemory             - free public API, no key needed
"""

import html
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import requests

TIMEOUT = 15  # seconds per request
MYMEMORY_MAX_BYTES = 500  # MyMemory rejects longer queries
MAX_PARALLEL_REQUESTS = 4
DEFAULT_ERROR = "The translation service is unavailable right now. Check your internet connection and try again."
QUOTA_ERROR = ("The free daily translation limit has been reached. "
               "Set MYMEMORY_EMAIL in .env to raise it, or try again tomorrow.")

# Language codes where Microsoft differs from ours.
MICROSOFT_CODES = {
    "zh-CN": "zh-Hans",
    "zh-TW": "zh-Hant",
    "tl": "fil",
    "no": "nb",
    "mn": "mn-Cyrl",
    "sr": "sr-Cyrl",
}
FROM_MICROSOFT_CODES = {ms: ours for ours, ms in MICROSOFT_CODES.items()}

log = logging.getLogger(__name__)


class TranslationError(Exception):
    """Raised when no provider could translate the text. The message is safe to show users."""


class SameLanguageError(TranslationError):
    """Raised when auto-detection finds the text is already in the target language."""


def _microsoft(text, source, target):
    endpoint = os.getenv("AZURE_TRANSLATOR_ENDPOINT", "https://api.cognitive.microsofttranslator.com")
    params = {"api-version": "3.0", "to": MICROSOFT_CODES.get(target, target)}
    if source != "auto":
        params["from"] = MICROSOFT_CODES.get(source, source)
    headers = {
        "Ocp-Apim-Subscription-Key": os.getenv("AZURE_TRANSLATOR_KEY"),
        "Content-Type": "application/json",
    }
    region = os.getenv("AZURE_TRANSLATOR_REGION")
    if region:
        headers["Ocp-Apim-Subscription-Region"] = region

    resp = requests.post(
        f"{endpoint}/translate", params=params, headers=headers, json=[{"Text": text}], timeout=TIMEOUT
    )
    resp.raise_for_status()
    result = resp.json()[0]
    detected = result.get("detectedLanguage", {}).get("language")
    return result["translations"][0]["text"], FROM_MICROSOFT_CODES.get(detected, detected)


def _chunks(text, limit=MYMEMORY_MAX_BYTES):
    """Split text into pieces of at most `limit` UTF-8 bytes, breaking between words."""
    chunks, current = [], ""
    for word in re.findall(r"\S+\s*|\s+", text):
        if current and len((current + word).encode()) > limit:
            chunks.append(current)
            current = ""
        current += word
    if current:
        chunks.append(current)
    return chunks


def _mymemory_request(chunk, params):
    resp = requests.get("https://api.mymemory.translated.net/get",
                        params={**params, "q": chunk}, timeout=TIMEOUT)
    if resp.status_code == 429:
        raise TranslationError(QUOTA_ERROR)
    resp.raise_for_status()
    data = resp.json()
    if data.get("quotaFinished") or str(data.get("responseStatus")) == "429":
        raise TranslationError(QUOTA_ERROR)
    if str(data.get("responseStatus")) != "200":
        details = data.get("responseDetails") or "unknown error"
        if "DISTINCT LANGUAGES" in details.upper():
            raise SameLanguageError(details)
        raise TranslationError(f"Translation failed: {details}")
    return html.unescape(data["responseData"]["translatedText"]).strip(), data["responseData"].get("detectedLanguage")


def _mymemory(text, source, target):
    params = {"langpair": f"{'autodetect' if source == 'auto' else source}|{target}"}
    email = os.getenv("MYMEMORY_EMAIL")
    if email:
        params["de"] = email  # raises the free limit from 5,000 to 50,000 characters/day

    # Translate line by line so line breaks survive; long lines are split into
    # chunks. All chunks are sent in parallel, then put back in order.
    lines = [_chunks(line) if line.strip() else [] for line in text.split("\n")]
    pieces = [chunk for chunks in lines for chunk in chunks]
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_REQUESTS) as pool:
        results = list(pool.map(lambda chunk: _mymemory_request(chunk, params), pieces))

    translated = iter(piece for piece, _ in results)
    output = "\n".join(" ".join(next(translated) for _ in chunks) for chunks in lines)
    detected = next((lang for _, lang in results if lang), None)
    return output, detected if source == "auto" else None


@lru_cache(maxsize=256)
def translate(text, source, target):
    """Translate `text` from `source` (a language code or "auto") into `target`.

    Returns a dict with the translated text, the detected source language
    (only when source is "auto") and the name of the provider that answered.
    Results are cached in memory, so repeating a translation is instant and
    doesn't use up the API's daily limit.
    """
    providers = [("MyMemory", _mymemory)]
    if os.getenv("AZURE_TRANSLATOR_KEY"):
        providers.insert(0, ("Microsoft Translator", _microsoft))

    error = DEFAULT_ERROR
    for name, provider in providers:
        try:
            translated, detected = provider(text, source, target)
        except SameLanguageError:
            raise
        except TranslationError as exc:
            log.warning("%s failed: %s", name, exc)
            error = str(exc)
            continue
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
            log.warning("%s failed: %s", name, exc)
            continue
        if translated:
            return {"translated_text": translated, "detected_source": detected, "provider": name}
        log.warning("%s returned an empty translation", name)

    raise TranslationError(error)

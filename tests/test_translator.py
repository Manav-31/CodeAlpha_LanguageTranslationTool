import pytest
import requests

import translator
from conftest import FakeResponse, mymemory_reply


def echo_upper(url, params, timeout):
    """Fake MyMemory that 'translates' by upper-casing the query."""
    return mymemory_reply(params["q"].upper())


def test_chunks_stay_under_byte_limit_and_keep_all_text():
    text = "Technology connects people across the world. " * 40
    chunks = translator._chunks(text)
    assert len(chunks) > 1
    assert all(len(chunk.encode()) <= translator.MYMEMORY_MAX_BYTES for chunk in chunks)
    assert "".join(chunks) == text


def test_chunks_count_bytes_not_characters():
    text = "नमस्ते दुनिया " * 60  # Devanagari uses 3 bytes per character
    chunks = translator._chunks(text)
    assert all(len(chunk.encode()) <= translator.MYMEMORY_MAX_BYTES for chunk in chunks)


def test_mymemory_keeps_line_breaks(monkeypatch):
    monkeypatch.setattr(requests, "get", echo_upper)
    translated, _ = translator._mymemory("first line\n\nsecond line", "en", "fr")
    assert translated == "FIRST LINE\n\nSECOND LINE"


def test_mymemory_unescapes_html_entities(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda url, params, timeout: mymemory_reply("It&#39;s fine"))
    translated, _ = translator._mymemory("It's fine", "en", "fr")
    assert translated == "It's fine"


def test_mymemory_reports_detected_language_only_for_auto(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda url, params, timeout: mymemory_reply("Hola", detected="en"))
    assert translator._mymemory("Hello", "auto", "es")[1] == "en"
    assert translator._mymemory("Hello", "en", "es")[1] is None


def test_quota_exhausted_gives_friendly_error(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda url, params, timeout: mymemory_reply(quota=True, status=429))
    with pytest.raises(translator.TranslationError, match="daily translation limit"):
        translator.translate("Hello", "en", "fr")


def test_text_already_in_target_language(monkeypatch):
    reply = mymemory_reply(status=403, details="PLEASE SELECT TWO DISTINCT LANGUAGES")
    monkeypatch.setattr(requests, "get", lambda url, params, timeout: reply)
    with pytest.raises(translator.SameLanguageError):
        translator.translate("आप कैसे हैं?", "auto", "hi")


def test_results_are_cached(monkeypatch):
    calls = []

    def counting_get(url, params, timeout):
        calls.append(params["q"])
        return mymemory_reply("Bonjour")

    monkeypatch.setattr(requests, "get", counting_get)
    first = translator.translate("Hello", "en", "fr")
    second = translator.translate("Hello", "en", "fr")
    assert first == second
    assert len(calls) == 1


def test_microsoft_is_used_when_key_is_set(monkeypatch):
    monkeypatch.setenv("AZURE_TRANSLATOR_KEY", "test-key")
    reply = [{"detectedLanguage": {"language": "zh-Hans"}, "translations": [{"text": "Hello"}]}]
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse(reply))
    result = translator.translate("你好", "auto", "en")
    assert result == {"translated_text": "Hello", "detected_source": "zh-CN", "provider": "Microsoft Translator"}


def test_falls_back_to_mymemory_when_microsoft_fails(monkeypatch):
    monkeypatch.setenv("AZURE_TRANSLATOR_KEY", "bad-key")
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse({}, status_code=401))
    monkeypatch.setattr(requests, "get", lambda url, params, timeout: mymemory_reply("Bonjour"))
    result = translator.translate("Hello", "en", "fr")
    assert result["provider"] == "MyMemory"
    assert result["translated_text"] == "Bonjour"


def test_network_failure_gives_friendly_error(monkeypatch):
    def offline(*args, **kwargs):
        raise requests.ConnectionError("no internet")

    monkeypatch.setattr(requests, "get", offline)
    with pytest.raises(translator.TranslationError, match="internet connection"):
        translator.translate("Hello", "en", "fr")

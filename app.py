"""Tolk - a language translation web app built with Flask.

Run:  python app.py   then open http://127.0.0.1:5000
"""

import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from languages import LANGUAGES
from similarity import text_similarity
from translator import SameLanguageError, TranslationError, translate

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

MAX_CHARS = 5000

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html", languages=LANGUAGES, max_chars=MAX_CHARS)


@app.post("/api/translate")
def api_translate():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text") or "").strip()
    source = payload.get("source") or "auto"
    target = payload.get("target")

    if not text:
        return jsonify(error="Please enter some text to translate."), 400
    if len(text) > MAX_CHARS:
        return jsonify(error=f"Text is too long. The limit is {MAX_CHARS} characters."), 400
    if source != "auto" and source not in LANGUAGES:
        return jsonify(error="Unsupported source language."), 400
    if target not in LANGUAGES:
        return jsonify(error="Unsupported target language."), 400
    if source == target:
        return jsonify(error="Source and target languages are the same."), 400

    try:
        result = translate(text, source, target)
    except SameLanguageError:
        return jsonify(error=f"This text is already in {LANGUAGES[target]}. "
                             "Choose a different target language."), 400
    except TranslationError as exc:
        return jsonify(error=str(exc)), 502
    return jsonify(result)


@app.post("/api/back-translate")
def api_back_translate():
    """Translate a translation back into the original language and score how closely it matches."""
    payload = request.get_json(silent=True) or {}
    original = str(payload.get("original") or "").strip()
    translation = str(payload.get("translation") or "").strip()
    original_lang = payload.get("original_lang")
    translation_lang = payload.get("translation_lang")

    if not original or not translation:
        return jsonify(error="Translate something first, then check it."), 400
    if max(len(original), len(translation)) > MAX_CHARS:
        return jsonify(error=f"Text is too long. The limit is {MAX_CHARS} characters."), 400
    if original_lang not in LANGUAGES or translation_lang not in LANGUAGES:
        return jsonify(error="Choose the source language to check this translation."), 400
    if original_lang == translation_lang:
        return jsonify(error="Source and target languages are the same."), 400

    try:
        result = translate(translation, translation_lang, original_lang)
    except TranslationError as exc:
        return jsonify(error=str(exc)), 502
    back = result["translated_text"]
    return jsonify(back_translation=back, similarity=round(text_similarity(original, back), 2),
                   provider=result["provider"])


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")

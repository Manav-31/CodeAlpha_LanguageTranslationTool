"""Tolk - a language translation web app built with Flask.

Run:  python app.py   then open http://127.0.0.1:5000
"""

import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from languages import LANGUAGES
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


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")

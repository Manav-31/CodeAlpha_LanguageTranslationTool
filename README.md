# Tolk – Language Translation Tool

**Tolk** (Dutch and Scandinavian for "interpreter") is a web app that translates text between 130 languages. Enter text, pick the source and target languages, and get the translation instantly, with buttons to copy it or hear it read aloud. It can also check a translation by translating it back, and has a conversation mode where two people speak in their own languages and hear each other translated.

Built for **CodeAlpha AI Internship – Task 1**.

![Tolk translating English to Hindi, with the back-translation check](docs/screenshot.png)

![Conversation mode: English and Hindi speakers talking through Tolk](docs/conversation.png)

## Features

- **Conversation mode:** two people pick their languages and take turns tapping *Speak*. Tolk turns speech into text, translates it, shows both in a chat-style log and reads the translation aloud in the other language
- **Back-translation check:** translates the result back into the original language and shows how closely it matches what you wrote (for example "87% close match"), so you can spot translations that may have lost meaning
- Text input with a live character counter (up to 5,000 characters)
- Source and target language dropdowns, including **automatic language detection**
- One-click **swap** of languages (and texts)
- Translated text shown in a dedicated panel, with right-to-left support for Arabic, Hebrew, Urdu, etc.
- **Copy** buttons for the input and the translation
- **Text-to-speech** for the input and the translation
- Keyboard shortcut: <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to translate
- Clear error messages for empty input, unsupported languages, network problems and API limits
- Clean light-themed design that also works on phones

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Translation API | [MyMemory Translation API](https://mymemory.translated.net/doc/spec.php) (free, no key), optional [Microsoft Translator](https://learn.microsoft.com/azure/ai-services/translator/) |
| Frontend | HTML, CSS, JavaScript |
| Text-to-speech | Browser Web Speech API |
| Speech recognition (conversation mode) | Browser Web Speech API (Chrome, Edge) |
| Copy | Browser Clipboard API |

## How it works

```
Browser (index.html + script.js)
   │  POST /api/translate  {text, source, target}
   ▼
Flask server (app.py)  ── validates the request
   │
   ▼
translator.py  ── sends the text to the translation API
   │             (Microsoft Translator if a key is set, otherwise MyMemory)
   ▼
JSON response  {translated_text, detected_source, provider}  ──▶ shown on screen
```

The browser never calls the translation API directly. All requests go through the Flask server, so any API key stays on the server and out of the browser.

MyMemory limits each request to 500 bytes, so longer text is split into chunks (keeping line breaks), sent in parallel, and joined back together.

Translations are cached in memory while the server runs, so repeating one is instant and doesn't count against the API's daily limit.

**Back-translation check** (`similarity.py`): the translation is sent back through the same API into the original language, and the result is compared with the original text using cosine similarity over 3-character chunks ("hel", "ell", "llo"…). Character chunks work for every script, including languages without spaces such as Chinese and Japanese. It measures how closely the wording comes back, not meaning itself, so a correct translation can occasionally score lower if it returns in different words.

**Conversation mode** runs in the browser: speech recognition turns each person's speech into text in their chosen language, the text goes through `/api/translate` like any other translation, and text-to-speech reads the result aloud.

## Getting started

**Requirements:** Python 3.10+ and an internet connection.

```bash
# 1. Clone the repository
git clone https://github.com/Manav-31/CodeAlpha_LanguageTranslationTool.git
cd CodeAlpha_LanguageTranslationTool

# 2. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

### Optional configuration

Copy `.env.example` to `.env` to change these settings:

| Variable | Purpose |
|---|---|
| `MYMEMORY_EMAIL` | Raises MyMemory's free limit from 5,000 to 50,000 characters per day |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` | Use Microsoft Translator first, with MyMemory as a backup |
| `FLASK_DEBUG` | Set to `1` for auto-reload while developing |

`.env` is listed in `.gitignore`, so your keys are never committed.

## Running the tests

The tests replace the translation APIs with fakes, so they run offline and don't use any of the daily limit.

```bash
pip install -r requirements-dev.txt
pytest
```

## API

`POST /api/translate`

```json
// Request
{ "text": "Hello, how are you today?", "source": "auto", "target": "hi" }

// Response 200
{ "translated_text": "नमस्ते, आज आप कैसे हैं?", "detected_source": "en", "provider": "MyMemory" }

// Response 400 / 502
{ "error": "Please enter some text to translate." }
```

`POST /api/back-translate`

```json
// Request
{ "original": "Hello! How are you today?", "translation": "नमस्कार! आज आप कैसे हैं?", "original_lang": "en", "translation_lang": "hi" }

// Response 200
{ "back_translation": "Hello! How are you today?", "similarity": 1.0, "provider": "MyMemory" }
```

## Project structure

```
CodeAlpha_LanguageTranslationTool/
├── app.py               # Flask server and routes
├── translator.py        # Translation API calls (MyMemory, Microsoft)
├── languages.py         # Supported languages
├── similarity.py        # Match score for the back-translation check
├── templates/
│   └── index.html       # Page layout
├── static/
│   ├── style.css        # Styling (light theme, responsive)
│   ├── script.js        # Text mode, back-translation check, conversation mode
│   └── favicon.svg
├── tests/
│   ├── conftest.py      # Fake API responses shared by the tests
│   ├── test_app.py      # Request validation and error responses
│   ├── test_similarity.py  # Back-translation match score
│   └── test_translator.py  # Chunking, line breaks, caching, fallbacks
├── docs/
│   ├── screenshot.png
│   └── conversation.png
├── requirements.txt
├── requirements-dev.txt # Adds pytest
├── pytest.ini
├── .env.example
└── .gitignore
```

## Notes

- **Conversation mode** needs Chrome or Edge and permission to use the microphone. In Chrome, speech recognition is done by Google's speech service, so audio is sent to Google while you speak.
- **Text-to-speech** uses the voices installed on your device. Chrome and Edge include online voices for many languages. If a language has no voice, the app tells you instead of reading it with the wrong accent.
- **MyMemory** combines machine translation with a shared translation memory, so very short phrases occasionally return an unusual community translation. Full sentences use machine translation and are reliable.

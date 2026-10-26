import pytest

import app as app_module
from translator import SameLanguageError, TranslationError


@pytest.fixture
def client():
    return app_module.app.test_client()


def post(client, **body):
    return client.post("/api/translate", json=body)


def test_home_page_lists_languages(client):
    resp = client.get("/")
    assert resp.status_code == 200
    page = resp.get_data(as_text=True)
    assert '<option value="auto">Detect language</option>' in page
    assert '<option value="hi">Hindi</option>' in page


@pytest.mark.parametrize("body, message", [
    ({"text": "   ", "source": "auto", "target": "hi"}, "enter some text"),
    ({"text": "a" * 5001, "source": "en", "target": "fr"}, "too long"),
    ({"text": "hi", "source": "xx", "target": "fr"}, "Unsupported source"),
    ({"text": "hi", "source": "en", "target": "xx"}, "Unsupported target"),
    ({"text": "hi", "source": "en", "target": "en"}, "are the same"),
])
def test_invalid_requests_are_rejected(client, body, message):
    resp = post(client, **body)
    assert resp.status_code == 400
    assert message in resp.get_json()["error"]


def test_non_json_body_is_rejected(client):
    resp = client.post("/api/translate", data="not json")
    assert resp.status_code == 400


def test_successful_translation(client, monkeypatch):
    result = {"translated_text": "Bonjour", "detected_source": "en", "provider": "MyMemory"}
    monkeypatch.setattr(app_module, "translate", lambda text, source, target: result)
    resp = post(client, text="  Hello  ", source="auto", target="fr")
    assert resp.status_code == 200
    assert resp.get_json() == result


def test_text_already_in_target_language(client, monkeypatch):
    def already_hindi(text, source, target):
        raise SameLanguageError("PLEASE SELECT TWO DISTINCT LANGUAGES")

    monkeypatch.setattr(app_module, "translate", already_hindi)
    resp = post(client, text="आप कैसे हैं?", source="auto", target="hi")
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "This text is already in Hindi. Choose a different target language."


def test_translation_service_failure(client, monkeypatch):
    def unavailable(text, source, target):
        raise TranslationError("The translation service is unavailable right now.")

    monkeypatch.setattr(app_module, "translate", unavailable)
    resp = post(client, text="Hello", source="en", target="fr")
    assert resp.status_code == 502
    assert "unavailable" in resp.get_json()["error"]


def test_home_page_has_both_modes(client):
    page = client.get("/").get_data(as_text=True)
    assert 'id="tab-conversation"' in page
    assert 'id="mic-a"' in page and 'id="mic-b"' in page
    assert 'id="check-btn"' in page


def check(client, **body):
    return client.post("/api/back-translate", json=body)


def test_back_translation_returns_text_and_match_score(client, monkeypatch):
    def fake_translate(text, source, target):
        assert (text, source, target) == ("नमस्ते, आप कैसे हैं?", "hi", "en")
        return {"translated_text": "Hello, how are you?", "detected_source": None, "provider": "MyMemory"}

    monkeypatch.setattr(app_module, "translate", fake_translate)
    resp = check(client, original="Hello, how are you?", translation="नमस्ते, आप कैसे हैं?",
                 original_lang="en", translation_lang="hi")
    assert resp.status_code == 200
    assert resp.get_json() == {"back_translation": "Hello, how are you?", "similarity": 1.0, "provider": "MyMemory"}


@pytest.mark.parametrize("body, message", [
    ({"original": "", "translation": "x", "original_lang": "en", "translation_lang": "hi"}, "Translate something first"),
    ({"original": "hi", "translation": "x", "original_lang": "auto", "translation_lang": "hi"}, "Choose the source language"),
    ({"original": "hi", "translation": "x", "original_lang": "en", "translation_lang": "en"}, "are the same"),
    ({"original": "a" * 5001, "translation": "x", "original_lang": "en", "translation_lang": "hi"}, "too long"),
])
def test_back_translation_rejects_bad_requests(client, body, message):
    resp = check(client, **body)
    assert resp.status_code == 400
    assert message in resp.get_json()["error"]


def test_back_translation_service_failure(client, monkeypatch):
    def unavailable(text, source, target):
        raise TranslationError("The translation service is unavailable right now.")

    monkeypatch.setattr(app_module, "translate", unavailable)
    resp = check(client, original="Hello", translation="Bonjour", original_lang="en", translation_lang="fr")
    assert resp.status_code == 502

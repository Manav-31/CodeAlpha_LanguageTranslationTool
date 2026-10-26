import pytest
import requests

import translator


class FakeResponse:
    """Stands in for requests.Response so tests never hit the network."""

    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")


def mymemory_reply(translated="", status=200, details="", quota=False, detected=None):
    data = {"translatedText": translated}
    if detected:
        data["detectedLanguage"] = detected
    return FakeResponse({
        "responseData": data,
        "responseStatus": status,
        "responseDetails": details,
        "quotaFinished": quota,
    })


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    """Start every test with an empty cache and no API keys configured."""
    monkeypatch.delenv("AZURE_TRANSLATOR_KEY", raising=False)
    monkeypatch.delenv("MYMEMORY_EMAIL", raising=False)
    translator.translate.cache_clear()
    yield
    translator.translate.cache_clear()

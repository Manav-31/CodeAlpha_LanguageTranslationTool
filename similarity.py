"""How closely two texts in the same language match, for the back-translation check.

Texts are compared as bags of 3-character chunks ("hel", "ell", "llo", ...) using
cosine similarity. Character chunks work for every script, including ones that
don't put spaces between words (Chinese, Japanese), and give partial credit for
word forms that differ slightly ("wonderful" / "wonderfully").
"""

import math
import unicodedata
from collections import Counter


def _normalise(text):
    """Lowercase, and turn punctuation, symbols and runs of whitespace into single spaces."""
    kept = "".join(" " if unicodedata.category(char)[0] in "PSZ" else char for char in text.lower())
    return " ".join(kept.split())


def _trigrams(text):
    padded = f" {_normalise(text)} "
    return Counter(padded[i:i + 3] for i in range(len(padded) - 2))


def text_similarity(first, second):
    """Cosine similarity (0 to 1) between the character-trigram counts of two texts."""
    a, b = _trigrams(first), _trigrams(second)
    dot = sum(count * b[gram] for gram, count in a.items())
    length = math.sqrt(sum(c * c for c in a.values())) * math.sqrt(sum(c * c for c in b.values()))
    return dot / length if length else 0.0

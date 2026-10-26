import pytest

from similarity import text_similarity


def test_identical_texts_score_one():
    assert text_similarity("Hello, how are you?", "Hello, how are you?") == pytest.approx(1.0)


def test_case_and_punctuation_are_ignored():
    assert text_similarity("Hello, how are you?", "hello how are you") == pytest.approx(1.0)


def test_unrelated_texts_score_low():
    assert text_similarity("Hello, how are you?", "The train leaves at six.") < 0.2


def test_close_rewording_beats_a_different_sentence():
    original = "I hope you have a wonderful day."
    assert text_similarity(original, "I hope your day is wonderful.") > text_similarity(original, "The meeting starts at noon.")


def test_works_for_scripts_without_spaces_or_latin_letters():
    assert text_similarity("आप कैसे हैं?", "आप कैसे हैं") == pytest.approx(1.0)
    assert 0.3 < text_similarity("最寄りの駅はどこですか？", "一番近い駅はどこですか？") < 1.0


def test_empty_text_scores_zero():
    assert text_similarity("", "anything") == 0.0

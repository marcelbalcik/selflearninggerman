"""Parser tests against real kaikki.org entries (tests/fixtures/kaikki_sample.jsonl)."""

import json
from pathlib import Path

import pytest

from wortduell_pipeline.kaikki import (
    exclusion_reason, expansion_items, glosses, noun_genders, parse_noun, parse_verb,
)

FIXTURES = Path(__file__).parent / "fixtures" / "kaikki_sample.jsonl"


def entries(word, pos):
    rows = [json.loads(line) for line in FIXTURES.read_text(encoding="utf-8").splitlines()]
    return [e for e in rows if e["word"] == word and e["pos"] == pos and not exclusion_reason(e)]


def noun(word, gender=None):
    for e in entries(word, "noun"):
        n = parse_noun(e)
        if gender is None or n["gender"] == gender:
            return n
    raise LookupError(word)


def verb(word, separable=None):
    for e in entries(word, "verb"):
        v = parse_verb(e)
        if separable is None or v["separable"] == separable:
            return v
    raise LookupError(word)


def test_regular_noun_drops_archaic_dative():
    n = noun("Tisch")
    assert (n["gender"], n["plural"], n["gen_sg"]) == ("m", ["Tische"], ["Tisches", "Tischs"])
    assert n["forms"]["sg"]["dat"] == ["Tisch"]
    assert "archaic_dative_dropped:Tische" in n["notes"]


def test_weak_and_mixed_nouns():
    assert noun("Kollege")["weak"] and not noun("Kollege")["mixed"]
    assert noun("Name")["mixed"] and not noun("Name")["weak"]
    herz = noun("Herz")
    assert herz["mixed"] and herz["plural"] == ["Herzen"] and herz["gen_sg"] == ["Herzens"]
    # Wiktionary's own "mixed" label (der See) is not the spec's mixed declension.
    assert not noun("See", "m")["mixed"]


def test_plural_only_and_alternative_genders():
    leute = noun("Leute")
    assert leute["plural_only"] and leute["gender"] is None and leute["plural"] == ["Leute"]
    joghurt = noun("Joghurt")
    assert (joghurt["gender"], joghurt["alt_genders"]) == ("m", ["n"])
    assert joghurt["gen_sg"] == ["Joghurts"]


def test_der_see_and_die_see_are_separate_entries():
    assert noun("See", "m")["forms"]["sg"]["dat"] == ["See"]
    assert noun("See", "f")["gen_sg"] == ["See"]


def test_labelled_alternatives_are_dropped():
    assert noun("Mann")["plural"] == ["Männer"]
    items = expansion_items("Herz n (weak, genitive Herzens or (very rare) Herzes, plural Herzen)")
    assert items["genitive"] == ["Herzens"] and items["plural"] == ["Herzen"]


def test_adjectival_noun():
    n = noun("Angestellter")
    assert n["adjectival"] and n["lemma"] == "Angestellte"
    assert n["forms"]["sg"]["m"]["mixed"]["nom"] == ["Angestellter"]
    assert n["forms"]["sg"]["m"]["strong"]["dat"] == ["Angestelltem"]


def test_gender_parsing():
    assert noun_genders("Joghurt (Germany) m or (Austria) n (strong, genitive Joghurts)", "Joghurt") == ["m", "n"]


def test_verbs():
    anrufen = verb("anrufen")
    assert (anrufen["prefix"], anrufen["separable"], anrufen["partizip2"]) == ("an", True, "angerufen")
    assert anrufen["zu_infinitive"] == "anzurufen"
    assert verb("gehen")["aux"] == "sein"
    assert verb("fahren")["aux"] == "both"
    assert verb("helfen")["stem_change"] is True
    assert verb("helfen")["wiktionary_frame"]["objects"] == ["dat"]
    assert verb("übersetzen", separable=False)["partizip2"] == "übersetzt"
    assert verb("übersetzen", separable=True)["partizip2"] == "übergesetzt"


def test_glosses():
    display, accepted = glosses(entries("Tisch", "noun")[0])
    assert display.startswith("table")
    assert "table" in accepted and "desk" in accepted


@pytest.mark.parametrize("word", ["Herz", "Joghurt"])
def test_also_rare_senses_are_not_excluded(word):
    assert entries(word, "noun")

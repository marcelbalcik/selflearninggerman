"""Steps `download` and `select` (spec §11.1–2)."""

from __future__ import annotations

import json
import shutil
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

from .common import (
    KAIKKI_URL, RAW, TATOEBA_FILES, USER_AGENT, WORK, config, write_jsonl, write_report,
)
from .kaikki import exclusion_reason

KAIKKI_FILE = RAW / "kaikki-de.jsonl"


def _fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp, tmp.open("wb") as out:
        shutil.copyfileobj(resp, out, length=1 << 20)
    tmp.rename(dest)


def download(force: bool = False) -> dict[str, Any]:
    """Fetch the kaikki German dictionary and the Tatoeba files (skips existing files)."""
    files = {KAIKKI_FILE.name: KAIKKI_URL, **TATOEBA_FILES}
    fetched, kept = [], []
    for name, url in files.items():
        dest = RAW / name
        if dest.exists() and not force:
            kept.append(name)
            continue
        _fetch(url, dest)
        fetched.append(name)
    report = {
        "fetched": fetched,
        "already_present": kept,
        "sizes_mb": {n: round((RAW / n).stat().st_size / 1e6, 1) for n in files},
        "sources": files,
    }
    write_report("download", report)
    return report


def _iter_kaikki():
    with KAIKKI_FILE.open(encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


SPACY_TO_DECK = {"NOUN": "noun", "VERB": "verb", "AUX": "verb", "ADJ": "adj", "ADV": "adv"}


def _reading_counts() -> tuple[dict[str, dict[tuple[str, str], int]], dict[str, int]]:
    """For each lower-cased surface form: counts of its (lemma, deck pos) readings
    in the parsed Tatoeba corpus, and its total count across all parts of speech."""
    from .corpus import iter_parsed, parse_all

    parse_all()
    readings: dict[str, dict[tuple[str, str], int]] = defaultdict(lambda: defaultdict(int))
    totals: dict[str, int] = defaultdict(int)
    for sent in iter_parsed():
        for text, lemma, pos, *_ in sent["toks"]:
            form = text.lower()
            totals[form] += 1
            deck = SPACY_TO_DECK.get(pos)
            if deck:
                readings[form][(lemma, deck)] += 1
    return readings, totals


def _forms(entry: dict[str, Any]) -> set[str]:
    out = {entry["word"].lower()}
    for f in entry.get("forms") or []:
        for part in f.get("form", "").split():
            if part.isalpha():
                out.add(part.lower())
    return out


def _grammar_words() -> set[str]:
    """Determiners, prepositions and contractions from the core: grammar, not deck words."""
    from .common import core_cli

    g = core_cli("grammar")[0]
    words = {d["word"] for d in g["determiners"]} | set(g["contractions"])
    for group in g["prepositions"].values():
        words |= set(group)
    return words


def select() -> dict[str, Any]:
    """Rank deck lemmas by frequency and keep the top TRIAL_LEMMA_COUNT.

    wordfreq gives each surface form's frequency but ignores case and part of
    speech (`einen` is almost always the article, not the verb "to unite").
    So each form's frequency is split over its readings as spaCy found them in
    context across the whole Tatoeba corpus; only readings that exist as a
    current Wiktionary entry count. Function words (articles, pronouns,
    prepositions, conjunctions) are not deck lemmas: they are trained as
    grammar skills.
    """
    from wordfreq import top_n_list, word_frequency

    cfg = config()["PIPELINE"]
    deck_pos = set(cfg["DECK_POS"])
    limit = int(__import__("os").environ.get("WORTDUELL_LEMMAS", cfg["CORE_LEMMA_TARGET"]))

    grammar_words = _grammar_words()
    top = top_n_list("de", 60_000)
    top_set = set(top)
    forms_of: dict[tuple[str, str], set[str]] = defaultdict(set)
    exclusions: dict[str, int] = defaultdict(int)
    deck: set[tuple[str, str]] = set()
    alias: dict[tuple[str, str], tuple[str, str]] = {}
    verbs: set[str] = set()
    for entry in _iter_kaikki():
        pos = entry.get("pos")
        if pos not in deck_pos or entry.get("lang_code") != "de":
            continue
        senses = entry.get("senses") or []
        if senses and all("alt-of" in (x.get("tags") or []) for x in senses):
            # Spelling variants (Swiss `gross` for `groß`) credit their main form.
            target = ((senses[0].get("alt_of") or [{}])[0]).get("word")
            if target:
                alias[(entry["word"], pos)] = (target, pos)
            exclusions["spelling_variant"] += 1
            continue
        if pos in ("adv", "adj") and entry["word"].lower() in grammar_words:
            exclusions["function_word"] += 1
            continue
        reason = exclusion_reason(entry)
        if reason:
            exclusions[reason] += 1
            continue
        if len(entry["word"]) < 2:
            exclusions["single_letter"] += 1
            continue
        deck.add((entry["word"], pos))
        forms_of[(entry["word"], pos)] |= {f for f in _forms(entry) if f in top_set}
        if pos == "verb":
            verbs.add(entry["word"])

    readings, totals = _reading_counts()
    score: dict[tuple[str, str], float] = defaultdict(float)
    unmatched: dict[tuple[str, str], float] = defaultdict(float)
    lemmatiser_errors = 0
    for form in top:
        total = totals.get(form, 0)
        if total == 0:
            continue
        freq = word_frequency(form, "de")
        for (lemma, pos), n in readings.get(form, {}).items():
            key = alias.get((lemma, pos), (lemma, pos))
            if key not in deck:
                # spaCy's adjective/adverb split differs from Wiktionary's.
                alt = {"adj": "adv", "adv": "adj"}.get(pos)
                key = (lemma, alt) if alt and (lemma, alt) in deck else key
            if key in deck and form not in forms_of[key]:
                # spaCy lemmatiser error (`Rahmen` → `Rahm`): the form is not
                # one of this lemma's Wiktionary forms.
                lemmatiser_errors += 1
                continue
            if key in deck:
                score[key] += freq * n / total
            else:
                unmatched[key] += freq * n / total
    # Adjectives used adverbially (`gut`) are one lemma: the adverb entry's
    # score goes to the adjective.
    for (word, pos) in list(score):
        if pos == "adv" and (word, "adj") in score:
            score[(word, "adj")] += score.pop((word, "adv"))
    ranked = sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))
    selected = {key: rank + 1 for rank, (key, _) in enumerate(ranked[:limit])}

    # Second pass: keep the full entries of the selected lemmas.
    kept: list[dict[str, Any]] = []
    for entry in _iter_kaikki():
        key = (entry.get("word"), entry.get("pos"))
        if key in selected and not exclusion_reason(entry):
            entry["_rank"] = selected[key]
            entry["_score"] = score[key]
            kept.append(entry)
    write_jsonl(WORK / "selected_entries.jsonl", kept)
    (WORK / "verbs.txt").write_text("\n".join(sorted(verbs)), encoding="utf-8")

    by_pos: dict[str, int] = defaultdict(int)
    for (_, pos) in selected:
        by_pos[pos] += 1
    top_unmatched = sorted(unmatched.items(), key=lambda kv: -kv[1])[:40]
    report = {
        "method": "wordfreq 'de' form frequency, split over spaCy readings in Tatoeba",
        "selected": len(selected),
        "by_pos": dict(by_pos),
        "entries_kept": len(kept),
        "excluded_entries": dict(exclusions),
        "readings_dropped_as_lemmatiser_errors": lemmatiser_errors,
        "frequent_readings_without_wiktionary_entry": [
            f"{w} ({p})" for (w, p), _ in top_unmatched
        ],
        "ranking": [
            {"rank": r + 1, "word": w, "pos": p, "score": round(s * 1e6, 1)}
            for r, ((w, p), s) in enumerate(ranked[: limit + 50])
        ],
    }
    write_report("select", report)
    return report

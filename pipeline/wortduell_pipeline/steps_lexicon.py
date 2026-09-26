"""Steps `extract`, `crosscheck` and `gender_rules` (spec §11.3–5)."""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from .common import WORK, config, core_cli, lemma_id, read_jsonl, write_jsonl, write_report
from .kaikki import glosses, noun_input, parse_noun, parse_verb, sounds, topics

LEMMAS = WORK / "lemmas.jsonl"


def _surface(entry: dict[str, Any]) -> list[str]:
    out = {entry["word"]}
    for f in entry.get("forms") or []:
        form = f.get("form", "")
        tags = set(f.get("tags") or [])
        if tags & {"table-tags", "inflection-template", "class", "multiword-construction"}:
            continue
        for part in form.split():
            if part.isalpha():
                out.add(part)
    return sorted(out)


def _row(entry: dict[str, Any], sense_key: str) -> dict[str, Any]:
    pos = entry["pos"]
    gloss, accepted = glosses(entry)
    row: dict[str, Any] = {
        "pos": pos if pos in ("noun", "verb", "adj", "adv") else "other",
        "text": entry["word"],
        "sense_key": sense_key,
        "gloss_en": gloss,
        "glosses_accepted": accepted,
        "freq_rank": entry["_rank"],
        "topics": topics(entry),
        "sounds": sounds(entry),
        "surface": _surface(entry),
        "track": "core",
        "status": "ok",
        "issues": [],
        "notes": [],
        "source": f"en.wiktionary.org/wiki/{entry['word']} (via kaikki.org)",
    }
    if pos == "noun":
        noun = parse_noun(entry)
        row["text"] = noun["lemma"]
        row["issues"] += noun.pop("issues")
        row["notes"] += noun.pop("notes")
        row["noun"] = noun
    elif pos == "verb":
        verb = parse_verb(entry)
        row["issues"] += verb.pop("issues")
        row["verb"] = verb
    if not gloss:
        row["issues"].append("gloss_missing")
    row["id"] = lemma_id(row["pos"], row["text"], sense_key)
    return row


def extract() -> dict[str, Any]:
    """One lemma row per (word, pos); split rows when gender or separability differs."""
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for entry in read_jsonl(WORK / "selected_entries.jsonl"):
        groups[(entry["word"], entry["pos"])].append(entry)

    rows: list[dict[str, Any]] = []
    splits: list[str] = []
    for (word, pos), entries in groups.items():
        if pos == "noun":
            by_key = {}
            for e in entries:
                g = parse_noun(e)["gender"] or "pl"
                by_key.setdefault(g, e)
        elif pos == "verb":
            by_key = {}
            for e in entries:
                by_key.setdefault("sep" if parse_verb(e)["separable"] else "insep", e)
        else:
            by_key = {"": entries[0]}
        if len(by_key) > 1:
            splits.append(f"{word} ({pos}): {', '.join(by_key)}")
            for key, e in by_key.items():
                rows.append(_row(e, key))
        else:
            rows.append(_row(next(iter(by_key.values())), ""))

    for r in rows:
        if r["issues"]:
            r["status"] = "needs_review"
    rows.sort(key=lambda r: (r["freq_rank"], r["sense_key"]))
    write_jsonl(LEMMAS, rows)
    report = {
        "lemma_rows": len(rows),
        "by_pos": _count(rows, "pos"),
        "split_by_sense": splits,
        "extraction_issues": {
            r["text"]: r["issues"] for r in rows if r["issues"]
        },
    }
    write_report("extract", report)
    return report


def _count(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for r in rows:
        out[r[key]] += 1
    return dict(out)


# --- crosscheck ----------------------------------------------------------------


def _cells(table: dict[str, Any] | None) -> dict[str, list[str]]:
    """Flatten a Declension into {"sg.nom": [...], "m.weak.sg.dat": [...], …}."""
    out: dict[str, list[str]] = {}
    if not table:
        return out
    if table["kind"] == "regular":
        for num in ("sg", "pl"):
            for case, forms in (table.get(num) or {}).items():
                out[f"{num}.{case}"] = sorted(forms)
        return out
    for gender, by_decl in (table.get("sg") or {}).items():
        for decl, forms_by_case in by_decl.items():
            for case, forms in forms_by_case.items():
                out[f"{gender}.{decl}.sg.{case}"] = sorted(forms)
    for decl, forms_by_case in (table.get("pl") or {}).items():
        for case, forms in forms_by_case.items():
            out[f"pl.{decl}.{case}"] = sorted(forms)
    return out


REVIEW_FILE = WORK.parent / "review" / "decisions.json"


def review_decisions() -> dict[str, Any]:
    """Human review of report items (pipeline/review/decisions.json), applied on every run."""
    if not REVIEW_FILE.exists():
        return {"nouns": {}, "frames": {}}
    return json.loads(REVIEW_FILE.read_text(encoding="utf-8"))


def crosscheck() -> dict[str, Any]:
    """Compare every Wiktionary table with the TypeScript rule engine (`core:decline`).

    Reviewed decisions are applied first: `restrict_plural_to` keeps only the
    chosen standard plurals (and their dative) in the stored table;
    `accept_wiktionary_table` keeps the table as it is despite the mismatch.
    """
    rows = list(read_jsonl(LEMMAS))
    review = review_decisions()
    for r in rows:
        decision = None
        if r["pos"] == "noun":
            decision = review["nouns"].get(f"{r['text']} ({r['sense_key']})") if r["sense_key"] else None
            decision = decision or review["nouns"].get(r["text"])
        action = decision["action"] if decision else None
        if action in ("restrict_plural_to", "no_plural"):
            plural = decision.get("plural", []) if action == "restrict_plural_to" else []
            r["noun"]["plural"] = plural
            if not plural:
                r["noun"]["no_plural"] = True
                if r["noun"]["forms"].get("kind") == "regular":
                    r["noun"]["forms"]["pl"] = None
            else:
                r["_restrict_plural"] = True
        if action == "use_engine_table":
            r["_use_engine"] = True
        if decision:
            r["review"] = {"decision": decision["action"], "note": decision["note"],
                           "reviewer": review["reviewer"], "date": review["date"]}
    nouns = [r for r in rows if r["pos"] == "noun"
             and (r["noun"]["gender"] is not None or r["noun"]["plural_only"])]
    engine = {
        o["id"]: o
        for o in core_cli("decline", [{"id": r["id"], "noun": noun_input(r["noun"])} for r in nouns])
    }
    verbs = [r for r in rows if r["pos"] == "verb" and r["verb"]["partizip2"]]
    verb_checks = {
        o["id"]: o
        for o in core_cli("check-verbs", [
            {"id": r["id"], "verb": {
                "infinitive": r["verb"]["infinitive"], "prefix": r["verb"]["prefix"],
                "separable": r["verb"]["separable"], "partizip2": r["verb"]["partizip2"],
                "zuInfinitive": r["verb"]["zu_infinitive"],
            }} for r in verbs
        ])
    }

    mismatches: list[dict[str, Any]] = []
    for r in rows:
        if r["id"] in engine:
            out = engine[r["id"]]
            if r.pop("_use_engine", False):
                # No usable Wiktionary table: the table derived from the reviewed
                # headword data (gender, plural, genitive) is stored instead.
                r["noun"]["forms"] = out["table"]
                r["issues"] = [i for i in r["issues"] if i != "no_declension_table"]
            if r.pop("_restrict_plural", False) and r["noun"]["forms"].get("pl"):
                allowed = out["table"]["pl"] or {}
                pl = r["noun"]["forms"]["pl"]
                for case in pl:
                    pl[case] = [f for f in pl[case] if f in allowed.get(case, [])]
            wikt = _cells(r["noun"]["forms"])
            eng = _cells(out["table"])
            diff = []
            for cell in sorted(set(wikt) | set(eng)):
                w, e = wikt.get(cell, []), eng.get(cell, [])
                if w != e:
                    diff.append({"cell": cell, "wiktionary": w, "engine": e})
            accepted = r.get("review", {}).get("decision") == "accept_wiktionary_table"
            if diff and accepted:
                r["review"]["accepted_mismatch"] = diff
            elif diff:
                r["issues"].append("table_mismatch")
                r["mismatch"] = diff
                mismatches.append({"id": r["id"], "lemma": r["text"], "cells": diff})
            for issue in out["issues"]:
                r["issues"].append(f"engine:{issue}")
        if r["id"] in verb_checks:
            out = verb_checks[r["id"]]
            r["verb"]["zu_infinitive_rule"] = out["zuInfinitive"]
            for issue in out["issues"]:
                r["issues"].append(f"verb:{issue}")
        decision = r.get("review", {}).get("decision")
        if decision == "accept":
            r["review"]["accepted_issues"] = r["issues"]
            r["issues"] = []
        r["status"] = "needs_review" if r["issues"] else "ok"
        if decision == "reject":
            r["status"] = "rejected"
    write_jsonl(LEMMAS, rows)
    report = {
        "nouns_checked": len(engine),
        "verbs_checked": len(verb_checks),
        "noun_mismatches": len(mismatches),
        "reviewed": {r["text"]: r["review"] for r in rows if "review" in r},
        "mismatches": mismatches,
        "needs_review": {r["text"] + (f" ({r['sense_key']})" if r["sense_key"] else ""): r["issues"]
                         for r in rows if r["status"] == "needs_review"},
    }
    write_report("crosscheck", report)
    return report


# --- gender rules ----------------------------------------------------------------

VOWEL = "aeiouyäöü"
NUCLEUS_PAIRS = {"ai", "au", "äu", "ei", "eu", "ie", "aa", "ee", "oo"}


def syllable_count(word: str) -> int:
    """Same estimate as packages/core `syllableCount`."""
    w, count, i = word.lower(), 0, 0
    while i < len(w):
        if w[i] not in VOWEL:
            i += 1
            continue
        count += 1
        i += 2 if w[i:i + 2] in NUCLEUS_PAIRS else 1
    return count


# Seed rules (spec §4.4). Measured, never trusted: only accurate rules become hints.
SEED_RULES: list[tuple[str, str]] = [
    *[(s, "f") for s in ("ung", "heit", "keit", "schaft", "ion", "tät", "ik", "ei", "ie", "ur", "enz", "anz")],
    *[(s, "n") for s in ("chen", "lein", "ment", "um", "ma", "tum")],
    *[(s, "m") for s in ("ling", "ismus", "or", "ig", "ich", "ant", "ent")],
]


def gender_rules() -> dict[str, Any]:
    cfg = config()["PIPELINE"]
    rows = list(read_jsonl(LEMMAS))
    verbs = set((WORK / "verbs.txt").read_text(encoding="utf-8").split())
    nouns = [r for r in rows if r["pos"] == "noun" and r["noun"]["gender"]
             and not r["noun"]["plural_only"]]
    rules: list[dict[str, Any]] = []

    def measure(name: str, gender: str, match) -> None:
        hits = [r for r in nouns if syllable_count(r["text"]) >= cfg["GENDER_RULE_MIN_SYLLABLES"]
                and match(r["text"])]
        right = [r for r in hits if r["noun"]["gender"] == gender
                 or gender in r["noun"]["alt_genders"]]
        acc = len(right) / len(hits) if hits else 0.0
        active = acc >= cfg["GENDER_RULE_MIN_ACCURACY"] and len(hits) >= cfg["GENDER_RULE_MIN_N"]
        rules.append({
            "suffix": name, "gender": gender, "dataset_accuracy": round(acc, 3), "n": len(hits),
            "active": active,
            "exceptions": [r["text"] for r in hits if r not in right],
        })

    for suffix, gender in SEED_RULES:
        measure(f"-{suffix}", gender, lambda t, s=suffix: t.lower().endswith(s))
    measure("nominalised infinitive", "n", lambda t: t.lower() in verbs and t.lower().endswith("n"))

    by_id = {r["id"]: r for r in rows}
    for rule in rules:
        if not rule["active"]:
            continue
        for r in nouns:
            if r["text"] in rule["exceptions"]:
                by_id[r["id"]].setdefault("gender_exception", []).append(rule["suffix"])
    write_jsonl(LEMMAS, rows)
    (WORK / "gender_rules.json").write_text(
        json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "nouns": len(nouns),
        "note": f"hint shown only at accuracy ≥ {cfg['GENDER_RULE_MIN_ACCURACY']} "
                f"and n ≥ {cfg['GENDER_RULE_MIN_N']}",
        "rules": rules,
    }
    write_report("gender_rules", report)
    return report


def cefr_hint(rank: int) -> str | None:
    for band in config()["PIPELINE"]["CEFR_BANDS"]:
        if rank <= band["maxRank"]:
            return band["level"]
    return None


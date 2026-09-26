"""Step `export` (spec §11): content.sqlite, dictionary.sqlite and the pipeline report."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from collections import defaultdict
from typing import Any

from .common import REPO, REPORTS, WORK, read_jsonl, write_report
from .kaikki import exclusion_reason, glosses, parse_noun, parse_verb
from .steps_lexicon import LEMMAS
from .steps_corpus import SENTENCES
from .steps_source import KAIKKI_FILE

OUT = WORK / "out"


def _tally(xs) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for x in xs:
        out[x] += 1
    return out


# --- export --------------------------------------------------------------------

CONTENT_SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE lemma(
  id INTEGER PRIMARY KEY, pos TEXT NOT NULL, text TEXT NOT NULL, sense_key TEXT NOT NULL,
  gloss_en TEXT NOT NULL, glosses_accepted TEXT NOT NULL, freq_rank INTEGER, cefr_hint TEXT,
  semantic_field TEXT, theme TEXT, track TEXT NOT NULL, owner_user_id INTEGER,
  status TEXT NOT NULL, review_reasons TEXT NOT NULL, gender_exception TEXT,
  source TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE noun(
  lemma_id INTEGER PRIMARY KEY REFERENCES lemma(id), gender TEXT, alt_genders TEXT,
  plural TEXT, plural_only INTEGER NOT NULL, no_plural INTEGER NOT NULL, gen_sg TEXT,
  weak INTEGER NOT NULL, mixed INTEGER NOT NULL, adjectival INTEGER NOT NULL, forms TEXT NOT NULL,
  mismatch TEXT);
CREATE TABLE verb(
  lemma_id INTEGER PRIMARY KEY REFERENCES lemma(id), prefix TEXT, separable INTEGER NOT NULL,
  dual_prefix INTEGER NOT NULL, aux TEXT, partizip2 TEXT, praeteritum_3sg TEXT,
  praesens_1sg TEXT, praesens_2sg TEXT, praesens_3sg TEXT, stem_change INTEGER, reflexive TEXT NOT NULL,
  frame TEXT, frame_status TEXT NOT NULL, frame_sources TEXT, zu_infinitive TEXT);
CREATE TABLE sentence(
  id INTEGER PRIMARY KEY, lemma_id INTEGER NOT NULL REFERENCES lemma(id), target_facet TEXT NOT NULL,
  skill_ids TEXT NOT NULL, de TEXT NOT NULL, en TEXT, gap TEXT NOT NULL, accepted TEXT NOT NULL,
  exercise_types TEXT NOT NULL, status TEXT NOT NULL, generator TEXT NOT NULL,
  validated_at TEXT NOT NULL);
CREATE TABLE gender_rule(
  suffix TEXT PRIMARY KEY, gender TEXT NOT NULL, dataset_accuracy REAL NOT NULL, n INTEGER NOT NULL,
  active INTEGER NOT NULL);
CREATE TABLE lemma_form(lemma_id INTEGER NOT NULL REFERENCES lemma(id), form TEXT NOT NULL);
CREATE TABLE catalog_word(text TEXT NOT NULL, pos TEXT NOT NULL, gloss_en TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (text, pos));
CREATE INDEX sentence_lemma ON sentence(lemma_id);
CREATE INDEX lemma_form_form ON lemma_form(form);
"""

DICTIONARY_SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE entry(
  id INTEGER PRIMARY KEY, word TEXT NOT NULL, pos TEXT NOT NULL, gloss_en TEXT NOT NULL,
  glosses_accepted TEXT NOT NULL, data TEXT NOT NULL, issues TEXT NOT NULL);
CREATE TABLE form(form TEXT NOT NULL, entry_id INTEGER NOT NULL REFERENCES entry(id));
CREATE INDEX entry_word ON entry(word);
CREATE INDEX form_form ON form(form);
"""


def _j(v: Any) -> str | None:
    return None if v is None else json.dumps(v, ensure_ascii=False)


def export() -> dict[str, Any]:
    """content.sqlite (core track), dictionary.sqlite (all nouns/verbs) and the M1 report."""
    OUT.mkdir(parents=True, exist_ok=True)
    rows = list(read_jsonl(LEMMAS))
    sentences = list(read_jsonl(SENTENCES))
    rules = json.loads((WORK / "gender_rules.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256()
    catalog = json.loads(CATALOG_WORDS.read_text(encoding="utf-8"))
    # "schema" bumps the version when the table layout changes (M5: no audio).
    for part in (rows, sentences, rules, catalog, {"schema": 2}):
        digest.update(json.dumps(part, sort_keys=True, ensure_ascii=False).encode())
    version = digest.hexdigest()[:16]
    today = time.strftime("%Y-%m-%d")

    path = OUT / "content.sqlite"
    path.unlink(missing_ok=True)
    db = sqlite3.connect(path)
    db.executescript(CONTENT_SCHEMA)
    db.executemany("INSERT INTO meta VALUES (?, ?)", [
        ("content_version", version), ("generated_at", today),
        ("sources", "en.wiktionary.org via kaikki.org (CC BY-SA 4.0); tatoeba.org (CC BY 2.0 FR)"),
    ])
    for r in rows:
        db.execute("INSERT INTO lemma VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            r["id"], r["pos"], r["text"], r["sense_key"], r["gloss_en"], _j(r["glosses_accepted"]),
            r["freq_rank"], r.get("cefr_hint"), r.get("semantic_field"), r.get("theme"), r["track"],
            None, r["status"], _j(r["issues"]), _j(r.get("gender_exception")), r["source"], today))
        if r["pos"] == "noun":
            n = r["noun"]
            db.execute("INSERT INTO noun VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                r["id"], n["gender"], _j(n["alt_genders"]), _j(n["plural"]), int(n["plural_only"]),
                int(n["no_plural"]), _j(n["gen_sg"]), int(n["weak"]), int(n["mixed"]),
                int(n["adjectival"]), _j(n["forms"]), _j(r.get("mismatch"))))
        if r["pos"] == "verb":
            v = r["verb"]
            db.execute("INSERT INTO verb VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                r["id"], v["prefix"], int(v["separable"]), int(v["dual_prefix"]), v["aux"],
                v["partizip2"], v["praeteritum_3sg"], v.get("praesens_1sg"), v["praesens_2sg"], v["praesens_3sg"],
                None if v["stem_change"] is None else int(v["stem_change"]), v["reflexive"],
                _j(v.get("frame")), v.get("frame_status", "needs_review"), _j(v.get("frame_sources")),
                v["zu_infinitive"] or v.get("zu_infinitive_rule")))
    for r in rows:
        forms = {f for f in r.get("surface", []) if f}
        if r["pos"] == "noun" and r["noun"]["forms"]:
            forms |= {f for cell in _all_forms(r["noun"]["forms"]) for f in cell}
        db.executemany("INSERT INTO lemma_form VALUES (?, ?)", [(r["id"], f) for f in sorted(forms)])
    for s in sentences:
        db.execute("INSERT INTO sentence VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            s["id"], s["lemma_id"], s["target_facet"], _j(s["skill_ids"]), s["de"], s["en"],
            _j(s["gap"]), _j(s["accepted"]), _j(s["exercise_types"]), s["status"],
            s["generator"], s["validated_at"]))
    for g in rules:
        db.execute("INSERT INTO gender_rule VALUES (?,?,?,?,?)", (
            g["suffix"], g["gender"], g["dataset_accuracy"], g["n"], int(g["active"])))
    db.commit()
    dict_counts = _export_dictionary(version, today)
    missing = _catalog_words(db)
    db.commit()
    db.close()
    # The server imports this committed copy on startup (spec §11 "Server import").
    server_copy = REPO / "apps" / "server" / "content" / "content.sqlite"
    server_copy.parent.mkdir(parents=True, exist_ok=True)
    server_copy.write_bytes(path.read_bytes())

    report = _m1_report(rows, sentences, rules, version, dict_counts)
    report["summary"]["catalog_words_missing"] = missing
    write_report("export", report["summary"])
    return report["summary"]


CATALOG_WORDS = REPO / "pipeline" / "review" / "catalog_words.json"


def _catalog_words(db: sqlite3.Connection) -> list[str]:
    """Copy the chore catalog's words from dictionary.sqlite into content.sqlite."""
    wanted = json.loads(CATALOG_WORDS.read_text(encoding="utf-8"))
    dic = sqlite3.connect(OUT / "dictionary.sqlite")
    missing: list[str] = []
    for pos in ("noun", "verb"):
        for word in wanted[pos]:
            row = dic.execute(
                "SELECT gloss_en, data FROM entry WHERE word = ? AND pos = ? ORDER BY id LIMIT 1",
                (word, pos)).fetchone()
            if row is None:
                missing.append(word)
                continue
            db.execute("INSERT INTO catalog_word VALUES (?,?,?,?)", (word, pos, row[0], row[1]))
    dic.close()
    return missing


def _all_forms(forms: dict[str, Any]):
    """Every cell list of a stored Declension."""
    if forms.get("kind") == "regular":
        for num in ("sg", "pl"):
            for cell in (forms.get(num) or {}).values():
                yield cell
        return
    for by_decl in (forms.get("sg") or {}).values():
        for by_case in by_decl.values():
            yield from by_case.values()
    for by_case in (forms.get("pl") or {}).values():
        yield from by_case.values()


def _export_dictionary(version: str, today: str) -> dict[str, int]:
    """All German nouns, verbs, adjectives and adverbs for personal-track lookups."""
    path = OUT / "dictionary.sqlite"
    path.unlink(missing_ok=True)
    db = sqlite3.connect(path)
    db.executescript(DICTIONARY_SCHEMA)
    db.executemany("INSERT INTO meta VALUES (?, ?)", [("content_version", version), ("generated_at", today)])
    counts: dict[str, int] = defaultdict(int)
    next_id = 1
    with KAIKKI_FILE.open(encoding="utf-8") as f:
        for line in f:
            entry = json.loads(line)
            pos = entry.get("pos")
            if pos not in ("noun", "verb", "adj", "adv") or exclusion_reason(entry):
                continue
            data: dict[str, Any] = {}
            issues: list[str] = []
            if pos == "noun":
                data = parse_noun(entry)
                issues = data.pop("issues")
                data.pop("notes")
            elif pos == "verb":
                data = parse_verb(entry)
                issues = data.pop("issues")
            gloss, accepted = glosses(entry)
            db.execute("INSERT INTO entry VALUES (?,?,?,?,?,?,?)", (
                next_id, entry["word"], pos, gloss, _j(accepted), _j(data), _j(issues)))
            forms = {entry["word"].lower()}
            for fm in entry.get("forms") or []:
                form = fm.get("form", "")
                if form.isalpha():
                    forms.add(form.lower())
            db.executemany("INSERT INTO form VALUES (?, ?)", [(fm, next_id) for fm in forms])
            counts[pos] += 1
            next_id += 1
    db.commit()
    db.close()
    return dict(counts)


def _m1_report(rows, sentences, rules, version, dict_counts) -> dict[str, Any]:
    reports = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in REPORTS.glob("*.json")}
    status = _tally(r["status"] for r in rows)
    reasons = _tally(i.split(":")[0] for r in rows for i in r["issues"])
    mismatches = reports.get("crosscheck", {}).get("mismatches", [])
    summary = {
        "content_version": version,
        "lemma_rows": len(rows),
        "status": dict(status),
        "review_reasons": dict(reasons),
        "noun_table_mismatches": len(mismatches),
        "sentences": len(sentences),
        "active_gender_rules": sum(1 for g in rules if g["active"]),
        "dictionary_entries": dict_counts,
    }
    _write_markdown(rows, reports, summary, mismatches)
    return {"summary": summary}


def _write_markdown(rows, reports, summary, mismatches) -> None:
    sel = reports.get("select", {})
    val = reports.get("validate", {})
    sen = reports.get("sentences", {})
    enr = reports.get("enrich", {})
    gr = reports.get("gender_rules", {})
    L: list[str] = []
    L += ["# M1 pipeline report", "",
          f"Content version `{summary['content_version']}`. Generated by `python -m wortduell_pipeline all`.",
          "Machine-readable details: the other JSON files in this folder.", ""]
    L += ["## Summary", "",
          f"- Lemma rows: **{summary['lemma_rows']}** ({', '.join(f'{k} {v}' for k, v in sel.get('by_pos', {}).items())})",
          f"- Status: {', '.join(f'{k} {v}' for k, v in summary['status'].items())}",
          f"- Review reasons: {', '.join(f'{k} {v}' for k, v in summary['review_reasons'].items()) or 'none'}",
          f"- Noun tables that differ from the rule engine: **{summary['noun_table_mismatches']}**",
          f"- Exercise sentences: **{summary['sentences']}** ({', '.join(f'{k} {v}' for k, v in val.get('kept_by_type', {}).items())})",
          f"- Active gender hints: {summary['active_gender_rules']}",
          f"- dictionary.sqlite: {', '.join(f'{k} {v}' for k, v in summary['dictionary_entries'].items())}",
          ""]
    L += ["## What to review", "",
          "M1 is accepted when the mismatches below are real data problems and not engine bugs.",
          "For each one, the Wiktionary table wins once you confirm it (Prüfen screen, M4).", ""]
    L += ["### Noun table mismatches (Wiktionary vs. rule engine)", ""]
    if mismatches:
        L += ["| Noun | Cell | Wiktionary | Engine |", "|------|------|------------|--------|"]
        for m in mismatches:
            for c in m["cells"]:
                L.append(f"| {m['lemma']} | {c['cell']} | {', '.join(c['wiktionary']) or '—'} | "
                         f"{', '.join(c['engine']) or '—'} |")
    else:
        L.append("None.")
    L += ["", "### Other review reasons", ""]
    other = [(r["text"] + (f" ({r['sense_key']})" if r["sense_key"] else ""), r["pos"],
              [i for i in r["issues"] if i != "table_mismatch"]) for r in rows]
    other = [o for o in other if o[2]]
    if other:
        L += ["| Lemma | POS | Reasons |", "|-------|-----|---------|"]
        for text, pos, issues in other:
            L.append(f"| {text} | {pos} | {', '.join(issues)} |")
    else:
        L.append("None.")
    reviewed = reports.get("crosscheck", {}).get("reviewed", {})
    L += ["", "### Reviewed noun decisions", ""]
    if reviewed:
        L += ["| Noun | Decision | Note |", "|------|----------|------|"]
        for word, rv in reviewed.items():
            L.append(f"| {word} | {rv['decision']} | {rv['note']} |")
    else:
        L.append("None.")
    L += ["", "### Verb frames", "",
          "Proposed from Wiktionary notes plus object counts in the parsed Tatoeba sentences; "
          "the final frame is the reviewed one (pipeline/review/decisions.json).", "",
          "| Verb | Final frame | Status | Wiktionary | Corpus (uses: counts) |", "|------|-------------|--------|------------|------------------------|"]
    for r in rows:
        if r["pos"] != "verb" or "frame" not in r["verb"]:
            continue
        src = r["verb"]["frame_sources"]
        fr = r["verb"]["frame"]
        prop = ", ".join(fr["objects"] + [f"{p['prep']}+{p['case']}" for p in fr.get("preps", [])]) or "—"
        wk = ", ".join(src["wiktionary"]["objects"] + [f"{p['prep']}+{p['case']}" for p in src["wiktionary"]["preps"]]) or "—"
        counts = ", ".join(f"{k} {v}" for k, v in sorted(src["corpus"]["counts"].items(), key=lambda kv: -kv[1])[:4])
        L.append(f"| {r['text']} | {prop} | {r['verb']['frame_status']} | {wk} | {src['corpus']['uses']}: {counts or '—'} |")
    L += ["", "## Selection", "",
          f"Method: {sel.get('method', '')}. Function words are grammar skills, not deck words.", "",
          "First 60: " + ", ".join(f"{x['word']}" for x in sel.get("ranking", [])[:60]), "",
          "Frequent readings with no current Wiktionary entry (spaCy lemma errors or missing entries): "
          + ", ".join(sel.get("frequent_readings_without_wiktionary_entry", [])[:25]), ""]
    L += ["## Sentences", "",
          f"- Corpus sentences considered (length and translation filter): {sen.get('sentences_considered')}",
          f"- Gaps rejected because spaCy's case/number is not a cell of the determiner: {sen.get('gap_rejected_spacy_vs_tables', 0)}",
          f"- Rejected at validation: {json.dumps(val.get('rejected', {}), ensure_ascii=False)}",
          f"- Rejection rate by type: {json.dumps(val.get('rejection_rate_by_type', {}))}",
          f"- OK lemmas with no sentence at all: {', '.join(sen.get('ok_lemmas_without_any_sentence', [])) or 'none'}",
          f"- Not generated yet (M4 templates): {', '.join(val.get('not_generated_yet', []))}", ""]
    L += ["## Gender rules", "", str(gr.get("note", "")), "",
          "| Suffix | Gender | Accuracy | n | Active | Exceptions |", "|---|---|---|---|---|---|"]
    for g in gr.get("rules", []):
        L.append(f"| {g['suffix']} | {g['gender']} | {g['dataset_accuracy']} | {g['n']} | "
                 f"{'yes' if g['active'] else 'no'} | {', '.join(g['exceptions'][:8])} |")
    L += ["", "## Enrichment", "",
          f"- Lemmas with a semantic field: {enr.get('with_semantic_field')}; without: {enr.get('without_semantic_field')}",
          f"- CEFR hints (frequency band): {json.dumps(enr.get('cefr_hint', {}))}", ""]
    (REPORTS / "M1-REPORT.md").write_text("\n".join(L) + "\n", encoding="utf-8")

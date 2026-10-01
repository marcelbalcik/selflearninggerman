"""Steps `enrich`, `sentences` and `validate` (spec §11.6–8, no LLM)."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import date
from typing import Any

from .common import WORK, config, core_cli, read_jsonl, write_jsonl, write_report
from .corpus import iter_parsed, parse_all
from .kaikki import noun_input
from .steps_lexicon import LEMMAS, cefr_hint, review_decisions

CANDIDATES = WORK / "sentences.candidates.jsonl"
SENTENCES = WORK / "sentences.jsonl"

SPACY_CASE = {"Nom": "nom", "Acc": "akk", "Dat": "dat", "Gen": "gen"}
SPACY_NUM = {"Sing": "sg", "Plur": "pl"}
DET_LABEL = {"def": "bestimmt", "indef": "unbestimmt", "kein": "kein"}
CONTENT_POS = {"NOUN", "VERB", "ADJ", "ADV"}
TOK_TEXT, TOK_LEMMA, TOK_POS, TOK_TAG, TOK_DEP, TOK_HEAD, TOK_MORPH = range(7)


def _morph(tok: list[Any]) -> dict[str, str]:
    out = {}
    for part in (tok[TOK_MORPH] or "").split("|"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k] = v
    return out


def _children(toks: list[list[Any]]) -> dict[int, list[int]]:
    kids: dict[int, list[int]] = defaultdict(list)
    for i, t in enumerate(toks):
        if t[TOK_HEAD] != i:
            kids[t[TOK_HEAD]].append(i)
    return kids


# --- enrich --------------------------------------------------------------------


def enrich() -> dict[str, Any]:
    """Semantic field, theme and CEFR hint per lemma; verb frame proposals.

    Frames combine Wiktionary sense notes with object-case counts from the
    parsed corpus (TIGER labels: oa = accusative object, da = dative object,
    op = prepositional object). Every frame goes to review (spec §4.3).
    """
    cfg = config()["PIPELINE"]
    rows = list(read_jsonl(LEMMAS))
    verbs = {r["text"]: r for r in rows if r["pos"] == "verb"}

    parse_all()
    uses: dict[str, int] = defaultdict(int)
    objs: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for sent in iter_parsed():
        toks = sent["toks"]
        kids = None
        for i, t in enumerate(toks):
            if t[TOK_POS] not in ("VERB", "AUX") or t[TOK_LEMMA] not in verbs:
                continue
            kids = kids or _children(toks)
            verb = t[TOK_LEMMA]
            uses[verb] += 1
            seen = set()
            for k in kids.get(i, []):
                dep = toks[k][TOK_DEP]
                if dep == "oa":
                    seen.add("akk")
                elif dep == "da":
                    seen.add("dat")
                elif dep == "op" and toks[k][TOK_POS] == "ADP":
                    obj = next((toks[g] for g in kids.get(k, []) if toks[g][TOK_DEP] == "nk"), None)
                    case = SPACY_CASE.get(_morph(obj).get("Case", "")) if obj else None
                    if case in ("akk", "dat"):
                        seen.add(f"{toks[k][TOK_TEXT].lower()}+{case}")
            for s in seen:
                objs[verb][s] += 1

    disagreements = []
    for r in rows:
        r["semantic_field"] = r["topics"][0] if r["topics"] else None
        r["theme"] = r["semantic_field"]
        r["cefr_hint"] = cefr_hint(r["freq_rank"])
        if r["pos"] != "verb":
            continue
        verb = r["text"]
        n = uses.get(verb, 0)
        corpus: dict[str, Any] = {"uses": n, "counts": dict(objs.get(verb, {}))}
        c_objects, c_preps = [], []
        if n >= cfg["FRAME_MIN_CORPUS_EXAMPLES"]:
            for key, count in sorted(corpus["counts"].items(), key=lambda kv: -kv[1]):
                if count / n < cfg["FRAME_MIN_SHARE"]:
                    continue
                if "+" in key:
                    prep, case = key.split("+")
                    c_preps.append({"prep": prep, "case": case})
                else:
                    c_objects.append(key)
        wikt = r["verb"].pop("wiktionary_frame", None) or r["verb"]["frame_sources"]["wiktionary"]
        objects = [c for c in ("dat", "akk") if c in wikt["objects"] or c in c_objects]
        preps = wikt["preps"] + [p for p in c_preps if p not in wikt["preps"]]
        frame: dict[str, Any] = {"objects": objects}
        if preps:
            frame["preps"] = preps
        r["verb"]["frame"] = frame
        r["verb"]["frame_sources"] = {"wiktionary": wikt, "corpus": corpus,
                                      "corpus_proposal": {"objects": c_objects, "preps": c_preps}}
        reviewed = review_decisions()["frames"].get(verb)
        if reviewed is not None:
            r["verb"]["frame"] = {"objects": reviewed["objects"]}
            if reviewed.get("preps"):
                r["verb"]["frame"]["preps"] = reviewed["preps"]
            r["verb"]["frame_status"] = "approved"
            if reviewed.get("note"):
                r["verb"]["frame_note"] = reviewed["note"]
        else:
            r["verb"]["frame_status"] = "needs_review"
        if n >= cfg["FRAME_MIN_CORPUS_EXAMPLES"] and set(wikt["objects"]) != set(c_objects):
            disagreements.append({"verb": verb, "wiktionary": wikt["objects"],
                                  "corpus": c_objects, "corpus_uses": n})
    write_jsonl(LEMMAS, rows)
    report = {
        "with_semantic_field": sum(1 for r in rows if r["semantic_field"]),
        "without_semantic_field": sum(1 for r in rows if not r["semantic_field"]),
        "cefr_hint": _count(rows, "cefr_hint"),
        "verbs": len(verbs),
        "frames_approved": sum(1 for r in rows if r["pos"] == "verb" and r["verb"]["frame_status"] == "approved"),
        "frames_for_review": sum(1 for r in rows if r["pos"] == "verb" and r["verb"]["frame_status"] != "approved"),
        "frame_source_disagreements": disagreements,
        "semantic_fields": sorted({r["semantic_field"] for r in rows if r["semantic_field"]}),
    }
    write_report("enrich", report)
    return report


def _count(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for r in rows:
        out[str(r.get(key))] += 1
    return dict(out)


# --- sentences -------------------------------------------------------------------


def _item_id(*parts: Any) -> int:
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:12], 16)


def sentences() -> dict[str, Any]:
    """Exercise sentence candidates from the parsed corpus.

    Only lemmas with status `ok` get sentences; `needs_review` lemmas stay out
    of exercises (spec §0.3). A noun gap is the determiner + noun pair spaCy
    marks as one phrase; the case and number spaCy reads must be a cell the
    determiner can realise for this noun, else the sentence is rejected here.
    """
    cfg = config()["PIPELINE"]
    grammar = core_cli("grammar")[0]
    det_cells: dict[str, list[dict[str, str]]] = defaultdict(list)
    for d in grammar["determiners"]:
        det_cells[d["word"]].append(d)

    rows = [r for r in read_jsonl(LEMMAS)]
    ok = [r for r in rows if r["status"] == "ok"]
    nouns_by_form: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_lemma: dict[tuple[str, str], dict[str, Any]] = {}
    for r in ok:
        by_lemma[(r["text"], r["pos"])] = r
        if r["pos"] == "noun":
            for form in set(r["surface"]) | {r["text"]}:
                nouns_by_form[form].append(r)
    selected_lemmas = {r["text"] for r in rows}

    stats: dict[str, int] = defaultdict(int)
    gaps: dict[int, list[dict[str, Any]]] = defaultdict(list)
    meaning: dict[int, list[dict[str, Any]]] = defaultdict(list)
    skill_requests: list[dict[str, Any]] = []
    parse_all()
    for sent in iter_parsed():
        if not sent["en"]:
            continue
        toks = sent["toks"]
        words = [t for t in toks if t[TOK_POS] != "PUNCT"]
        if not cfg["SENTENCE_MIN_TOKENS"] <= len(words) <= cfg["SENTENCE_MAX_TOKENS"]:
            continue
        stats["sentences_considered"] += 1
        content = [t for t in toks if t[TOK_POS] in CONTENT_POS]
        known = sum(1 for t in content if t[TOK_LEMMA] in selected_lemmas)
        quality = known / len(content) if content else 0.0
        base = {"sentence_id": sent["id"], "de": sent["de"], "en": sent["en"],
                "tokens": [t[TOK_TEXT] for t in toks], "quality": round(quality, 3),
                "length": len(words)}

        seen_lemmas: set[int] = set()
        for i, t in enumerate(toks):
            deck_pos = {"NOUN": "noun", "VERB": "verb", "AUX": "verb", "ADJ": "adj", "ADV": "adv"}.get(t[TOK_POS])
            if deck_pos:
                r = by_lemma.get((t[TOK_LEMMA], deck_pos)) or (
                    by_lemma.get((t[TOK_LEMMA], "adv" if deck_pos == "adj" else "adj"))
                    if deck_pos in ("adj", "adv") else None)
                if r and r["id"] not in seen_lemmas:
                    seen_lemmas.add(r["id"])
                    meaning[r["id"]].append({**base, "token_index": i})
            if t[TOK_POS] != "NOUN" or i == 0:
                continue
            candidates = nouns_by_form.get(t[TOK_TEXT], [])
            if len(candidates) != 1:
                if len(candidates) > 1:
                    stats["gap_skipped_ambiguous_lemma"] += 1
                continue
            noun_row = candidates[0]
            det = toks[i - 1]
            if det[TOK_POS] != "DET" or det[TOK_HEAD] != i or det[TOK_TEXT].lower() not in det_cells:
                continue
            m = _morph(t)
            case = SPACY_CASE.get(m.get("Case", ""))
            num = SPACY_NUM.get(m.get("Number", ""))
            if case is None or num is None:
                stats["gap_rejected_no_morphology"] += 1
                continue
            noun = noun_row["noun"]
            slot = "pl" if num == "pl" else noun["gender"]
            fits = [d for d in det_cells[det[TOK_TEXT].lower()]
                    if d["case"] == case and (d["slot"] == slot or
                                              (num == "sg" and d["slot"] in noun["alt_genders"]))]
            if not fits:
                stats["gap_rejected_spacy_vs_tables"] += 1
                continue
            stats["gap_found"] += 1
            if case not in ("akk", "dat"):
                continue
            cls = fits[0]["cls"]
            head = toks[t[TOK_HEAD]] if t[TOK_HEAD] != i else None
            governed: dict[str, Any] | None = None
            if head and head[TOK_POS] in ("VERB", "AUX") and t[TOK_DEP] in ("oa", "da"):
                verb_row = by_lemma.get((head[TOK_LEMMA], "verb"))
                governed = {"type": "verb", "text": head[TOK_LEMMA],
                            "lemma_id": verb_row["id"] if verb_row else None}
            elif head and head[TOK_POS] == "ADP":
                governed = {"type": "prep", "text": head[TOK_TEXT].lower()}
            gap_tokens = base["tokens"][: i - 1] + ["___"] + base["tokens"][i + 1:]
            item = {
                **base,
                "lemma_id": noun_row["id"],
                "lemma": noun_row["text"],
                "gap": {
                    "tokens": gap_tokens,
                    "gap_index": i - 1,
                    "expected": f"{det[TOK_TEXT]} {t[TOK_TEXT]}",
                    "lemma_id": noun_row["id"],
                    "features": {"case": case, "number": num, "det": cls},
                    "governed_by": governed,
                    "cue": f"{noun_row['text']}, {DET_LABEL.get(cls, cls)}, {'Sg.' if num == 'sg' else 'Pl.'}",
                },
            }
            gaps[noun_row["id"]].append(item)

    per = cfg["SENTENCES_PER_TARGET"]
    rank = lambda it: (-it["quality"], it["length"], it["sentence_id"])  # noqa: E731
    out: list[dict[str, Any]] = []
    by_id = {r["id"]: r for r in rows}
    for lemma_id, items in gaps.items():
        chosen: list[dict[str, Any]] = []
        # Prefer variety: one per (case, number) first, then the best remaining.
        for it in sorted(items, key=rank):
            key = (it["gap"]["features"]["case"], it["gap"]["features"]["number"])
            if key not in {(c["gap"]["features"]["case"], c["gap"]["features"]["number"]) for c in chosen}:
                chosen.append(it)
        for it in sorted(items, key=rank):
            if len(chosen) >= per:
                break
            if it not in chosen:
                chosen.append(it)
        for it in chosen[:per]:
            noun = by_id[lemma_id]["noun"]
            f = it["gap"]["features"]
            target = "plural" if f["number"] == "pl" else "gender"
            gender = None if f["number"] == "pl" else noun["gender"]
            gov = it["gap"]["governed_by"]
            req = {"id": len(skill_requests), "num": f["number"], "case": f["case"], "gender": gender}
            if gov and gov["type"] == "prep":
                req["prep"] = gov["text"]
            skill_requests.append(req)
            out.append({**it, "kind": "kasus_luecke", "target_facet": target,
                        "_skill_req": req["id"]})
            out.append({**it, "kind": "fehlersuche", "target_facet": target,
                        "_skill_req": req["id"]})
    for lemma_id, items in meaning.items():
        for it in sorted(items, key=rank)[:per]:
            out.append({**it, "lemma_id": lemma_id, "lemma": by_id[lemma_id]["text"],
                        "kind": "bedeutung", "target_facet": "meaning_recv"})

    from .templates import generate

    templated, template_stats = generate(rows, meaning)
    out.extend(templated)
    stats.update({f"template_{k}": v for k, v in template_stats.items()})

    skills = {o["id"]: o for o in core_cli("skills", skill_requests)}
    for it in out:
        req = it.pop("_skill_req", None)
        if req is None:
            it.setdefault("skill_ids", [])
            continue
        s = skills[req]
        it["skill_ids"] = [x for x in (s["caseSkill"], s["prepSkill"]) if x]
    write_jsonl(CANDIDATES, out)
    stats["lemmas_ok"] = len(ok)
    stats["lemmas_needs_review_skipped"] = len(rows) - len(ok)
    stats["nouns_with_gap_sentences"] = len(gaps)
    stats["lemmas_with_meaning_sentences"] = len(meaning)
    stats["candidates"] = len(out)
    report = dict(stats)
    report["ok_lemmas_without_any_sentence"] = sorted(
        r["text"] for r in ok if r["id"] not in meaning and r["id"] not in gaps)
    write_report("sentences", report)
    return report


# --- validate ----------------------------------------------------------------------


def _stored_noun(row: dict[str, Any]) -> dict[str, Any]:
    """NounInput with the Wiktionary table, which wins over the rules (spec §4.2)."""
    return {**noun_input(row["noun"]), "forms": row["noun"]["forms"]}


def _same_np(a: str, b: str) -> bool:
    # Only a sentence-initial capital on the determiner may differ.
    return a == b or a[:1].lower() + a[1:] == b[:1].lower() + b[1:]


def validate() -> dict[str, Any]:
    """Recompute every gap from the stored form tables; build `fehlersuche` errors.

    - kasus_luecke: the sentence's determiner + noun must be one of the
      renderings of its (case, number, determiner) cell. Accepted variants are
      all renderings (e.g. both genders of der/das Joghurt).
    - fehlersuche: the determiner is replaced by another of the same class such
      that determiner + noun is valid in no cell at all, so exactly one token
      is wrong and the error is unambiguous.
    - bedeutung: kept as is; answers come from the lemma's accepted glosses.
    """
    rows = {r["id"]: r for r in read_jsonl(LEMMAS)}
    grammar = core_cli("grammar")[0]
    det_words: dict[str, list[str]] = defaultdict(list)
    for d in grammar["determiners"]:
        if d["word"] not in det_words[d["cls"]]:
            det_words[d["cls"]].append(d["word"])

    items = list(read_jsonl(CANDIDATES))
    gap_items = [it for it in items if it["kind"] in ("kasus_luecke", "fehlersuche")]
    requests = []
    for n, it in enumerate(gap_items):
        f = it["gap"]["features"]
        requests.append({"id": n, "noun": _stored_noun(rows[it["lemma_id"]]),
                         "spec": {"num": f["number"], "case": f["case"], "det": f["det"]}})
    rendered = {o["id"]: o.get("texts", []) for o in core_cli("render", requests)}

    # Every valid NP of each noun, for the fehlersuche uniqueness check.
    all_valid: dict[int, set[str]] = {}
    lemma_ids = sorted({it["lemma_id"] for it in gap_items})
    reqs = []
    for lid in lemma_ids:
        for num in ("sg", "pl"):
            for case in ("nom", "akk", "dat", "gen"):
                for cls in ("def", "indef", "kein", "mein", "dein", "sein", "ihr", "unser", "euer"):
                    reqs.append({"id": f"{lid}|{num}|{case}|{cls}", "noun": _stored_noun(rows[lid]),
                                 "spec": {"num": num, "case": case, "det": cls}})
    for o in core_cli("render", reqs):
        lid = int(o["id"].split("|")[0])
        all_valid.setdefault(lid, set()).update(t.lower() for t in o.get("texts", []))

    today = date.today().isoformat()
    kept: list[dict[str, Any]] = []
    rejected: dict[str, int] = defaultdict(int)
    for n, it in enumerate(gap_items):
        texts = rendered.get(n, [])
        expected = it["gap"]["expected"]
        if not any(_same_np(expected, t) for t in texts):
            rejected[f"{it['kind']}:render_mismatch"] += 1
            continue
        det_text, noun_text = expected.split(" ", 1)
        cap = det_text[:1].isupper()
        accepted = [t[:1].upper() + t[1:] if cap else t for t in texts]
        gap = dict(it["gap"])
        if it["kind"] == "kasus_luecke":
            gap["accepted"] = accepted
        else:
            cls = gap["features"]["det"]
            wrong = next((w for w in det_words[cls]
                          if w != det_text.lower() and f"{w} {noun_text}".lower() not in all_valid[it["lemma_id"]]),
                         None)
            if wrong is None:
                rejected["fehlersuche:no_unambiguous_error"] += 1
                continue
            wrong_display = wrong[:1].upper() + wrong[1:] if cap else wrong
            idx = gap["gap_index"]
            tokens = list(it["tokens"])
            tokens[idx] = wrong_display
            gap = {"tokens": tokens, "error_index": idx, "wrong": wrong_display,
                   "correct": det_text, "error_type": "determiner",
                   "lemma_id": it["lemma_id"], "features": gap["features"],
                   "governed_by": gap["governed_by"]}
            accepted = [det_text]
        kept.append(_sentence_row(it, gap, accepted, today))
    for it in items:
        if it.get("prebuilt"):
            # Template items are built from stored forms and carry their answers.
            if not it["accepted"] or not all(it["accepted"]):
                rejected[f"{it['kind']}:empty_answer"] += 1
                continue
            kept.append(_sentence_row(it, it["gap"], it["accepted"], today))
            continue
        if it["kind"] == "bedeutung":
            accepted = rows[it["lemma_id"]]["glosses_accepted"]
            if not accepted:
                rejected["bedeutung:no_accepted_glosses"] += 1
                continue
            gap = {"tokens": it["tokens"], "highlight_index": it["token_index"],
                   "lemma_id": it["lemma_id"]}
            kept.append(_sentence_row(it, gap, accepted, today))
    write_jsonl(SENTENCES, kept)
    by_kind: dict[str, int] = defaultdict(int)
    for s in kept:
        by_kind[s["exercise_types"][0]] += 1
    candidates_by_kind: dict[str, int] = defaultdict(int)
    for it in items:
        candidates_by_kind[it["kind"]] += 1
    report = {
        "candidates": len(items),
        "kept": len(kept),
        "kept_by_type": dict(by_kind),
        "rejected": dict(rejected),
        "rejection_rate_by_type": {
            k: round(1 - by_kind.get(k, 0) / v, 3) for k, v in candidates_by_kind.items()
        },
        "not_generated_here": ["komposition (runtime task, server)"],
    }
    write_report("validate", report)
    return report


def _sentence_row(it: dict[str, Any], gap: dict[str, Any], accepted: list[str], today: str) -> dict[str, Any]:
    return {
        "id": _item_id(it["lemma_id"], it["sentence_id"], it["kind"]),
        "lemma_id": it["lemma_id"],
        "target_facet": it["target_facet"],
        "skill_ids": it.get("skill_ids", []),
        "de": it["de"],
        "en": it["en"],
        "gap": gap,
        "accepted": accepted,
        "exercise_types": [it["kind"]],
        "status": "ok",
        "generator": (f"template:{it['kind']}" if str(it["sentence_id"]).startswith("t:") and it["kind"] != "diktat"
                      else f"tatoeba#{str(it['sentence_id']).split(':')[-1]}+spacy"),
        "validated_at": today,
    }

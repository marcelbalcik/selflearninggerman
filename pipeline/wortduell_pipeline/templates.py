"""Template exercises built only from stored, reviewed forms (no LLM).

- en_de_chunk: English → German with the article (`meaning_prod`), plus
  preposition chunks ("with the colleague" → "mit dem Kollegen").
- umformen: noun → dative plural, 3rd person present → Perfekt, du-form of
  stem-changing verbs.
- satzbau: the four frames of separable verbs (main clause, weil-clause,
  Perfekt, zu-infinitive) and the Perfekt of inseparable verbs.
- wer_tut_was: object-first sentences where only the case marking tells who
  does what (reviewed noun and verb lists in review/templates.json).
- diktat: short corpus sentences read aloud by the device (speechSynthesis).

German NPs come from the core renderer over the stored tables, verb forms from
the stored verb data. Every item carries its accepted answers.
"""

from __future__ import annotations

import json
from itertools import islice
from typing import Any

from .common import PIPELINE, core_cli

TEMPLATES = PIPELINE / "review" / "templates.json"

PREP_CHUNKS = [("mit", "dat", "with"), ("ohne", "akk", "without"), ("für", "akk", "for")]
AUX_1SG = {"haben": ["habe"], "sein": ["bin"], "both": ["habe", "bin"]}
AUX_3SG = {"haben": ["hat"], "sein": ["ist"], "both": ["hat", "ist"]}


def _english(row: dict[str, Any]) -> str | None:
    accepted = row.get("glosses_accepted") or []
    return accepted[0] if accepted else None


def _stored_noun(row: dict[str, Any]) -> dict[str, Any]:
    from .kaikki import noun_input

    return {**noun_input(row["noun"]), "forms": row["noun"]["forms"]}


def _item(row: dict[str, Any], kind: str, target: str, de: str, en: str | None,
          gap: dict[str, Any], accepted: list[str], skills: list[str] | None = None,
          key: str = "") -> dict[str, Any]:
    return {
        "kind": kind,
        "lemma_id": row["id"],
        "lemma": row["text"],
        "sentence_id": f"t:{kind}:{row['id']}:{key}",
        "de": de,
        "en": en,
        "tokens": de.split(),
        "target_facet": target,
        "skill_ids": skills or [],
        "gap": gap,
        "accepted": accepted,
        "prebuilt": True,
    }


def generate(rows: list[dict[str, Any]], corpus_meaning: dict[int, list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    ok = [r for r in rows if r["status"] == "ok"]
    stats: dict[str, int] = {}
    items: list[dict[str, Any]] = []

    # --- NP renderings from the core (one batch) ---------------------------------
    requests: list[dict[str, Any]] = []
    nouns = [r for r in ok if r["pos"] == "noun" and (r["noun"]["gender"] or r["noun"]["plural_only"])]
    for r in nouns:
        num = "pl" if r["noun"]["plural_only"] else "sg"
        requests.append({"id": f"{r['id']}|nom|{num}", "noun": _stored_noun(r),
                         "spec": {"num": num, "case": "nom", "det": "def"}})
        for prep, case, _ in PREP_CHUNKS:
            requests.append({"id": f"{r['id']}|{case}|{num}", "noun": _stored_noun(r),
                             "spec": {"num": num, "case": case, "det": "def"}})
        if not r["noun"]["no_plural"] and not r["noun"]["plural_only"]:
            requests.append({"id": f"{r['id']}|dat|pl", "noun": _stored_noun(r),
                             "spec": {"num": "pl", "case": "dat", "det": "def"}})
    rendered = {o["id"]: o.get("texts", []) for o in core_cli("render", requests)}
    skill_reqs = []
    for r in nouns:
        num = "pl" if r["noun"]["plural_only"] else "sg"
        g = None if num == "pl" else r["noun"]["gender"]
        for prep, case, _ in PREP_CHUNKS:
            skill_reqs.append({"id": f"{r['id']}|{prep}", "num": num, "case": case, "gender": g, "prep": prep})
        skill_reqs.append({"id": f"{r['id']}|datpl", "num": "pl", "case": "dat", "gender": None})
    skills = {o["id"]: [x for x in (o["caseSkill"], o["prepSkill"]) if x] for o in core_cli("skills", skill_reqs)}

    # --- en_de_chunk ----------------------------------------------------------------
    n = 0
    for r in ok:
        en = _english(r)
        if not en:
            continue
        if r["pos"] == "noun" and r["id"] in {x["id"] for x in nouns}:
            num = "pl" if r["noun"]["plural_only"] else "sg"
            nom = rendered.get(f"{r['id']}|nom|{num}", [])
            if nom:
                items.append(_item(r, "en_de_chunk", "meaning_prod", nom[0], f"the {en}",
                                   {"tokens": nom[0].split(), "features": {"case": "nom", "number": num, "det": "def"},
                                    "prompt": f"the {en}"}, nom, key="nom"))
                n += 1
            for prep, case, en_prep in PREP_CHUNKS[:2]:
                forms = rendered.get(f"{r['id']}|{case}|{num}", [])
                if not forms:
                    continue
                accepted = [f"{prep} {f}" for f in forms]
                items.append(_item(r, "en_de_chunk", "meaning_prod", accepted[0], f"{en_prep} the {en}",
                                   {"tokens": accepted[0].split(), "features": {"case": case, "number": num, "det": "def"},
                                    "prep": prep, "prompt": f"{en_prep} the {en}"},
                                   accepted, skills.get(f"{r['id']}|{prep}", []), key=prep))
                n += 1
        elif r["pos"] in ("verb", "adj", "adv"):
            word = r["text"]
            prompt = en if r["pos"] != "verb" else f"to {en}"
            items.append(_item(r, "en_de_chunk", "meaning_prod", word, prompt,
                               {"tokens": [word], "prompt": prompt}, [word], key="word"))
            n += 1
    stats["en_de_chunk"] = n

    # --- umformen ---------------------------------------------------------------------
    n = 0
    for r in nouns:
        if r["noun"]["no_plural"] or r["noun"]["plural_only"]:
            continue
        nom = rendered.get(f"{r['id']}|nom|sg", [])
        datpl = rendered.get(f"{r['id']}|dat|pl", [])
        if nom and datpl:
            items.append(_item(r, "umformen", "plural", datpl[0], None,
                               {"tokens": nom[0].split(), "instruction": "dat_pl", "source": nom[0]},
                               datpl, skills.get(f"{r['id']}|datpl", []), key="datpl"))
            n += 1
    for r in ok:
        v = r.get("verb")
        if r["pos"] != "verb" or not v or not v.get("partizip2") or not v.get("aux") or not v.get("praesens_3sg"):
            continue
        if v.get("reflexive") != "none":
            continue
        pres = f"er {v['praesens_3sg']}"
        perf = [f"er {aux} {v['partizip2']}" for aux in AUX_3SG[v["aux"]]]
        skill = ["verb.sep.perf"] if v["separable"] else (["verb.insep.perf"] if _inseparable(r["text"]) else [])
        items.append(_item(r, "umformen", "pp_aux", perf[0], None,
                           {"tokens": pres.split(), "instruction": "perfekt", "source": pres}, perf, skill, key="perf"))
        n += 1
        if v.get("stem_change") and v.get("praesens_2sg"):
            du = f"du {v['praesens_2sg']}"
            items.append(_item(r, "umformen", "stem_change", du, None,
                               {"tokens": ["du", "___"], "instruction": "du_form", "source": r["text"]},
                               [du], key="du"))
            n += 1
    stats["umformen"] = n

    # --- satzbau -----------------------------------------------------------------------
    cfg = json.loads(TEMPLATES.read_text(encoding="utf-8"))
    no_first_person = set(cfg.get("satzbau_exclude", []))
    n = 0
    for r in ok:
        v = r.get("verb")
        if r["pos"] != "verb" or not v or v.get("reflexive") != "none":
            continue
        frame = v.get("frame") or {"objects": []}
        if v.get("frame_status") != "approved" or frame.get("objects") not in ([], ["akk"], ["dat"]):
            continue
        # A prepositional complement (ankommen auf) or an impersonal verb
        # (stattfinden) makes "ich … heute" sentences unnatural.
        if frame.get("preps") or r["text"] in no_first_person:
            continue
        obj = {"akk": "ihn", "dat": "ihm"}.get((frame.get("objects") or [None])[0] or "", "")
        pres1 = v.get("praesens_1sg")
        part = v.get("partizip2")
        if not pres1 or not part or not v.get("aux"):
            continue
        o = f" {obj}" if obj else ""
        chunks_base = ["ich", r["text"], *([obj] if obj else []), "heute"]
        if v["separable"] and v.get("prefix") and v.get("zu_infinitive"):
            finite = pres1.split()[0]
            prefix = v["prefix"]
            frames = {
                "hauptsatz": ([f"Ich {finite}{o} heute {prefix}", f"Heute {finite} ich{o} {prefix}"], "verb.sep.v2", "separable"),
                "nebensatz": ([f"weil ich{o} heute {prefix}{finite}"], "verb.sep.sub", "separable"),
                "perfekt": ([f"Ich {aux}{o} heute {part}" for aux in AUX_1SG[v["aux"]]]
                            + [f"Heute {aux} ich{o} {part}" for aux in AUX_1SG[v["aux"]]], "verb.sep.perf", "pp_aux"),
                "zu": ([f"Ich vergesse nicht,{o} heute {v['zu_infinitive']}",
                        f"Ich vergesse nicht{o} heute {v['zu_infinitive']}"], "verb.sep.zu", "separable"),
            }
            for name, (accepted, skill, target) in frames.items():
                chunks = chunks_base if name != "zu" else ["ich vergesse nicht", r["text"], *([obj] if obj else []), "heute"]
                items.append(_item(r, "satzbau", target, accepted[0] + ".", None,
                                   {"chunks": chunks, "frame": name}, accepted, [skill], key=name))
                n += 1
        elif _inseparable(r["text"]) and frame.get("objects") == ["akk"]:
            accepted = [f"Ich {aux}{o} heute {part}" for aux in AUX_1SG[v["aux"]]] + [
                f"Heute {aux} ich{o} {part}" for aux in AUX_1SG[v["aux"]]]
            items.append(_item(r, "satzbau", "pp_aux", accepted[0] + ".", None,
                               {"chunks": chunks_base, "frame": "perfekt"}, accepted, ["verb.insep.perf"], key="perfekt"))
            n += 1
    stats["satzbau"] = n

    # --- wer_tut_was ---------------------------------------------------------------------
    animate = {r["text"]: r for r in nouns if r["text"] in cfg["animate"] and r["noun"]["gender"]}
    verbs = {r["text"]: r for r in ok if r["pos"] == "verb" and r["text"] in cfg["wer_tut_was_verbs"]
             and r["verb"].get("praesens_3sg") and " " not in r["verb"]["praesens_3sg"]}
    def_req = []
    for w, r in animate.items():
        for case in ("nom", "akk"):
            def_req.append({"id": f"{w}|{case}", "noun": _stored_noun(r),
                            "spec": {"num": "sg", "case": case, "det": "def", "gender": r["noun"]["gender"]}})
    np = {o["id"]: (o.get("texts") or [None])[0] for o in core_cli("render", def_req)}
    masc = sorted(w for w, r in animate.items() if r["noun"]["gender"] == "m")
    others = sorted(animate)
    n = 0
    for vi, (verb, vr) in enumerate(sorted(verbs.items())):
        en_verb = cfg["wer_tut_was_verbs"][verb]
        # Deterministic pairs: a masculine object first (Den Hund sieht die Frau).
        for k, obj in enumerate(islice(masc[vi % len(masc):] + masc, 4)):
            subj = others[(vi * 7 + k * 5) % len(others)]
            if subj == obj or not np.get(f"{obj}|akk") or not np.get(f"{subj}|nom"):
                continue
            de = f"{_cap(np[f'{obj}|akk'])} {vr['verb']['praesens_3sg']} {np[f'{subj}|nom']}."
            right = f"The {cfg['animate'][subj]} {en_verb} the {cfg['animate'][obj]}."
            wrong = f"The {cfg['animate'][obj]} {en_verb} the {cfg['animate'][subj]}."
            options = [right, wrong] if (vi + k) % 2 == 0 else [wrong, right]
            items.append(_item(animate[obj], "wer_tut_was", "gender", de, right,
                               {"tokens": de.split(), "options": options, "correct": options.index(right),
                                "verb_lemma_id": vr["id"], "subject_lemma_id": animate[subj]["id"]},
                               [str(options.index(right))], ["case.akk.m"], key=f"{verb}:{subj}"))
            n += 1
    stats["wer_tut_was"] = n

    # --- diktat ---------------------------------------------------------------------------
    n = 0
    for r in ok:
        for s in (corpus_meaning.get(r["id"]) or [])[:1]:
            if s["length"] > 10:
                continue
            gap = {"tokens": s["tokens"], "target_index": s["token_index"],
                   "target": s["tokens"][s["token_index"]]}
            item = _item(r, "diktat", "meaning_recv", s["de"], s["en"], gap, [s["de"]], key=str(s["sentence_id"]))
            item["sentence_id"] = f"t:diktat:{r['id']}:{s['sentence_id']}"
            items.append(item)
            n += 1
    stats["diktat"] = n
    return items, stats


def _inseparable(word: str) -> bool:
    return any(word.startswith(p) and len(word) - len(p) >= 4 for p in ("be", "emp", "ent", "er", "ge", "miss", "ver", "zer"))


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:]

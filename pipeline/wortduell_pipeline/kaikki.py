"""Parsing of kaikki.org (wiktextract) German entries into Wortduell rows.

Nothing here guesses grammar: every value comes from the entry, and anything
missing or contradictory is reported as an issue so the lemma goes to review.
"""

from __future__ import annotations

import re
from typing import Any

# Forms carrying these tags are not standard present-day German and are
# neither shown nor accepted (spec §4.2: archaic dative -e is not accepted).
NONSTANDARD_TAGS = {
    "archaic", "obsolete", "dated", "rare", "poetic", "dialectal", "colloquial",
    "nonstandard", "misspelling", "proscribed", "regional", "Switzerland", "Austria",
    "Southern-Germany", "alternative",
}
META_TAGS = {"table-tags", "inflection-template", "class"}
CASE_TAGS = {"nominative": "nom", "accusative": "akk", "dative": "dat", "genitive": "gen"}
DECL_TAGS = ("strong", "weak", "mixed")
BAD_SENSE_TAGS = {"archaic", "obsolete", "dated", "historical"}
EXCLUDE_SENSE_TAGS = {"vulgar", "offensive", "derogatory", "slur"}
ABBREV_TAGS = {"abbreviation", "initialism", "acronym", "clipping"}


def head(entry: dict[str, Any]) -> dict[str, Any] | None:
    for h in entry.get("head_templates") or []:
        if h.get("name") in ("de-noun", "de-verb", "de-adj", "de-adv", "de-proper noun"):
            return h
    return None


def is_form_of_only(entry: dict[str, Any]) -> bool:
    senses = entry.get("senses") or []
    return bool(senses) and all("form-of" in (s.get("tags") or []) for s in senses)


def usable_senses(entry: dict[str, Any]) -> list[dict[str, Any]]:
    """Current senses, main uses first (auxiliary and in-compounds uses last)."""
    out = []
    for s in entry.get("senses") or []:
        tags = set(s.get("tags") or [])
        if "form-of" in tags or tags & BAD_SENSE_TAGS or not s.get("glosses"):
            continue
        out.append(s)
    minor = {"auxiliary", "in-compounds"}
    return sorted(out, key=lambda s: bool(set(s.get("tags") or []) & minor))


def exclusion_reason(entry: dict[str, Any]) -> str | None:
    """Why an entry is not a deck candidate (spec §11 `select`), or None."""
    word = entry.get("word", "")
    if not re.fullmatch(r"[A-Za-zÄÖÜäöüß]+", word):
        return "not_a_single_word"
    if is_form_of_only(entry):
        return "form_of"
    senses = entry.get("senses") or []
    tags_all = [set(s.get("tags") or []) for s in senses]
    if any(t & ABBREV_TAGS for t in tags_all) and all(t & ABBREV_TAGS for t in tags_all):
        return "abbreviation"
    expansion = (head(entry) or {}).get("expansion", "")
    if "abbreviation" in expansion:
        return "abbreviation"
    if tags_all and all(t & EXCLUDE_SENSE_TAGS for t in tags_all):
        return "vulgar"
    if not usable_senses(entry):
        return "no_current_sense"
    return None


def top_level_tokens(text: str) -> list[str]:
    """Words of `text` outside any parentheses."""
    depth = 0
    buf = []
    for ch in text:
        if ch == "(":
            depth += 1
            buf.append(" ")
        elif ch == ")":
            depth = max(0, depth - 1)
            buf.append(" ")
        elif depth == 0:
            buf.append(ch)
    return "".join(buf).split()


def noun_genders(expansion: str, word: str) -> list[str]:
    """Genders in a de-noun head, e.g. `Joghurt (Germany) m or (Austria) n (strong, …)` → [m, n]."""
    tokens = top_level_tokens(expansion)
    if tokens and tokens[0] == word:
        tokens = tokens[1:]
    return [t for t in tokens if t in ("m", "f", "n", "pl")]


def head_forms(entry: dict[str, Any], tags: set[str]) -> list[str]:
    """Headword-line forms (no `source`) whose tags are exactly `tags`, standard only."""
    out = []
    for f in entry.get("forms") or []:
        if "source" in f:
            continue
        ftags = set(f.get("tags") or [])
        if ftags == tags and f.get("form") and f["form"] not in out:
            out.append(f["form"])
    return out


def _split_top_level(text: str, sep: str) -> list[str]:
    parts, depth, buf, i = [], 0, "", 0
    while i < len(text):
        if depth == 0 and text.startswith(sep, i):
            parts.append(buf)
            buf, i = "", i + len(sep)
            continue
        ch = text[i]
        depth += ch == "("
        depth -= ch == ")"
        buf += ch
        i += 1
    parts.append(buf)
    return parts


def expansion_items(expansion: str) -> dict[str, list[str]]:
    """Items of the grammatical parenthesis of a head line, e.g.
    `Herz n (weak, genitive Herzens or (very rare) Herzes, plural Herzen, …)` →
    {"genitive": ["Herzens"], "plural": ["Herzen"], "weak": []}.
    Alternatives that carry a label such as `(very rare)` are dropped.
    """
    # The grammatical parenthesis is the last top-level one.
    depth = 0
    start = -1
    for i, ch in enumerate(expansion):
        if ch == "(":
            if depth == 0:
                start = i
            depth += 1
        elif ch == ")":
            depth -= 1
    if start < 0:
        return {}
    body = expansion[start + 1 : expansion.rfind(")")]
    items: list[str] = []
    depth = 0
    buf = ""
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            items.append(buf.strip())
            buf = ""
        else:
            buf += ch
    items.append(buf.strip())
    out: dict[str, list[str]] = {}
    for item in items:
        m = re.match(r"^(genitive|plural|definite plural|feminine|masculine)\s+(.*)$", item)
        if not m or item in ("plural only", "no plural"):
            out[item] = []
            continue
        values = []
        for alt in _split_top_level(m.group(2), " or "):
            alt = alt.strip()
            if alt.startswith("(") or not alt:
                continue
            values.append(alt.split()[0])
        out.setdefault(m.group(1), []).extend(values)
    return out


def first_table(entry: dict[str, Any], source: str) -> list[dict[str, Any]]:
    """Forms of the first inflection table; later tables are variants."""
    table: list[dict[str, Any]] = []
    started = False
    for f in entry.get("forms") or []:
        if f.get("source") != source:
            continue
        tags = set(f.get("tags") or [])
        if "inflection-template" in tags:
            if started and table:
                break
            started = True
            continue
        if tags & META_TAGS:
            continue
        table.append(f)
    return table


def topics(entry: dict[str, Any]) -> list[str]:
    """Topical categories such as `Furniture` (orig `de:Furniture`)."""
    out: list[str] = []
    for s in usable_senses(entry):
        for c in s.get("categories") or []:
            orig = c.get("orig", "") if isinstance(c, dict) else ""
            if orig.startswith("de:") and c.get("name") not in out:
                out.append(c["name"])
    return out


_PAREN = re.compile(r"\([^)]*\)")
_LEADING = re.compile(r"^(to|the|a|an)\s+", re.I)


def _clean_gloss(text: str) -> str:
    text = _PAREN.sub("", text)
    text = re.sub(r"\[[^\]]*\]", "", text)
    return re.split(r";|:", text)[0].strip().rstrip(".,").strip()


def glosses(entry: dict[str, Any]) -> tuple[str, list[str]]:
    """Display gloss (up to two main senses) and the accepted-answer list for `bedeutung`."""
    senses = usable_senses(entry)
    shown: list[str] = []
    accepted: list[str] = []
    for s in senses:
        main = _clean_gloss(s["glosses"][0])
        minor = {"in-compounds", "auxiliary"} & set(s.get("tags") or [])
        if main and not minor and len(shown) < 2 and main not in shown:
            shown.append(main)
        for g in s["glosses"]:
            for part in re.split(r"[,;]", _clean_gloss(g)):
                part = _LEADING.sub("", part.strip()).strip()
                words = part.split()
                if not part or len(words) > 4 or re.search(r"used to|example|specific use", part, re.I):
                    continue
                if part.lower() not in accepted:
                    accepted.append(part.lower())
    if not shown and senses:
        # Only minor uses (e.g. modal verbs tagged auxiliary): show those.
        shown = [_clean_gloss(senses[0]["glosses"][0])]
    return "; ".join(shown), accepted


# --- nouns -------------------------------------------------------------------


def _table_to_declension(table: list[dict[str, Any]], adjectival: bool) -> dict[str, Any]:
    empty = lambda: {"nom": [], "akk": [], "dat": [], "gen": []}  # noqa: E731
    if adjectival:
        sg = {d: empty() for d in DECL_TAGS}
        pl = {d: empty() for d in DECL_TAGS}
    else:
        sg, pl = empty(), empty()
    dropped: list[str] = []
    for f in table:
        tags = set(f.get("tags") or [])
        form = f.get("form", "")
        if tags & NONSTANDARD_TAGS or not form or form == "-":
            dropped.append(form)
            continue
        case = next((CASE_TAGS[t] for t in tags if t in CASE_TAGS), None)
        if case is None:
            continue
        num = "pl" if "plural" in tags else "sg"
        if adjectival:
            decl = next((d for d in DECL_TAGS if d in tags), None)
            if decl is None:
                continue
            cell = (sg if num == "sg" else pl)[decl][case]
        else:
            cell = (sg if num == "sg" else pl)[case]
        if form not in cell:
            cell.append(form)
    return {"sg": sg, "pl": pl, "dropped": dropped}


def _has_forms(forms: dict[str, list[str]]) -> bool:
    return any(forms[c] for c in forms)


def parse_noun(entry: dict[str, Any]) -> dict[str, Any]:
    """Headword data and the Wiktionary form table of a noun entry."""
    word = entry["word"]
    h = head(entry)
    expansion = h["expansion"] if h else ""
    issues: list[str] = []
    notes: list[str] = []
    genders = noun_genders(expansion, word) if h else []
    plural_only = "pl" in genders or "plural only" in expansion
    genders = [g for g in genders if g != "pl"]
    adjectival = "adjectival" in expansion
    gender = genders[0] if genders else None
    if gender is None and not plural_only:
        issues.append("gender_missing")
    weak = bool(re.search(r"\(weak\b|, weak\b", expansion)) and not adjectival
    items = expansion_items(expansion)
    # The chosen head line first: kaikki's form list merges all head lines.
    gen_sg = items.get("genitive") or head_forms(entry, {"genitive"})
    # The spec's "mixed" (der Name, das Herz): weak endings plus genitive -ns.
    # Wiktionary's own "mixed" label (der See) means something else and is ignored.
    mixed = weak and any(g.endswith("ns") for g in gen_sg)
    if mixed:
        weak = False
    no_plural = "no plural" in expansion or (
        not plural_only and not head_forms(entry, {"plural"}) and "plural" not in items
        and "plural" not in expansion
    )
    plural = [] if no_plural else (items.get("plural") or head_forms(entry, {"plural"}))
    if plural_only and not plural:
        plural = [word]

    table = first_table(entry, "declension")
    decl = _table_to_declension(table, adjectival)
    if not table:
        issues.append("no_declension_table")
    if decl["dropped"]:
        notes.append("nonstandard_forms_dropped:" + ",".join(sorted(set(decl["dropped"]))))

    lemma_text = word
    forms: dict[str, Any]
    if adjectival:
        weak_nom = decl["sg"]["weak"]["nom"]
        if weak_nom:
            lemma_text = weak_nom[0]
        sg_by_gender = {gender: decl["sg"]} if gender else {}
        forms = {"kind": "adjectival", "sg": sg_by_gender,
                 "pl": decl["pl"] if _has_forms(decl["pl"]["weak"]) else None}
    else:
        sg = decl["sg"]
        pl = decl["pl"]
        # Archaic dative -e (dem Kinde, dem Ergebnisse) is not accepted even when
        # unmarked: it is the -es genitive without its final s.
        if gender in ("m", "n") and not weak and not mixed:
            archaic = {f"{word}e"} | {g[:-1] for g in gen_sg if g.endswith("es")}
            for form in sorted(archaic - {word}):
                if form in sg["dat"]:
                    sg["dat"].remove(form)
                    notes.append(f"archaic_dative_dropped:{form}")
        forms = {"kind": "regular",
                 "sg": None if plural_only or not _has_forms(sg) else sg,
                 "pl": None if no_plural or not _has_forms(pl) else pl}
    return {
        "lemma": lemma_text,
        "gender": gender,
        "alt_genders": genders[1:],
        "plural": plural,
        "plural_only": plural_only,
        "no_plural": no_plural,
        "gen_sg": gen_sg,
        "weak": weak,
        "mixed": mixed,
        "adjectival": adjectival,
        "forms": forms,
        "issues": issues,
        "notes": notes,
    }


def noun_input(noun: dict[str, Any]) -> dict[str, Any]:
    """The TypeScript `NounInput` for the rule engine (without the stored table)."""
    return {
        "lemma": noun["lemma"],
        "gender": noun["gender"],
        "altGenders": noun["alt_genders"],
        "plural": noun["plural"],
        "pluralOnly": noun["plural_only"],
        "noPlural": noun["no_plural"],
        "genSg": noun["gen_sg"],
        "weak": noun["weak"],
        "mixed": noun["mixed"],
        "adjectival": noun["adjectival"],
    }


# --- verbs -------------------------------------------------------------------

SEP_PREFIXES = [
    "zusammen", "weiter", "zurück", "heraus", "herein", "hinaus", "hinein", "herum",
    "herunter", "hinunter", "herauf", "hinauf", "vorbei", "fort", "fest", "nach", "auf",
    "aus", "bei", "ein", "her", "hin", "los", "mit", "weg", "vor", "ab", "an", "zu",
]
DUAL_PREFIXES = ["wieder", "hinter", "durch", "wider", "unter", "über", "voll", "um"]


def _conj(entry: dict[str, Any], tags: set[str]) -> str | None:
    for f in first_table(entry, "conjugation"):
        if set(f.get("tags") or []) == tags:
            return f.get("form")
    return None


def parse_verb(entry: dict[str, Any]) -> dict[str, Any]:
    word = entry["word"]
    h = head(entry)
    issues: list[str] = []
    arg = ((h or {}).get("args") or {}).get("1", "")
    m = re.match(r"^([a-zäöü]+)\.", arg)
    pres3 = (head_forms(entry, {"present", "singular", "third-person"}) or [None])[0]
    prefix = None
    if m:
        prefix = m.group(1)
    elif pres3 and " " in pres3:
        prefix = pres3.split()[-1]
    separable = prefix is not None and word.startswith(prefix)
    if prefix is not None and not separable:
        issues.append("prefix_not_at_start")
    base = word[len(prefix):] if separable and prefix else word
    dual = any(word.startswith(p) and len(word) > len(p) + 3 for p in DUAL_PREFIXES)

    aux_forms = set(head_forms(entry, {"auxiliary"}))
    aux = "both" if aux_forms == {"haben", "sein"} else (next(iter(aux_forms)) if aux_forms else None)
    if aux is None:
        issues.append("aux_missing")
    partizip2 = (head_forms(entry, {"participle", "past"}) or [None])[0]
    if partizip2 is None:
        issues.append("partizip2_missing")
    praet = (head_forms(entry, {"past"}) or [None])[0]
    pres2 = _conj(entry, {"indicative", "present", "second-person", "singular"})
    # Only the form tagged `infinitive-zu` (a zu- prefix like zugeben is not it).
    zu_inf = next(
        (f["form"] for f in first_table(entry, "conjugation")
         if "infinitive-zu" in (f.get("tags") or [])),
        None,
    )
    pres1 = _conj(entry, {"first-person", "indicative", "present", "singular"})
    stem_change = None
    if pres3:
        stem = re.sub(r"e?n$", "", base)
        finite = pres3.split()[0]
        stem_change = finite not in (stem + "t", stem + "et", stem)
    senses = usable_senses(entry)
    first_tags = set((senses[0].get("tags") if senses else None) or [])
    reflexive = "akk" if "reflexive" in first_tags else "none"
    return {
        "infinitive": word,
        "prefix": prefix if separable else None,
        "separable": separable,
        "dual_prefix": dual,
        "aux": aux,
        "partizip2": partizip2,
        "praeteritum_3sg": praet,
        "praesens_1sg": pres1,
        "praesens_2sg": pres2,
        "praesens_3sg": pres3,
        "stem_change": stem_change,
        "reflexive": reflexive,
        "zu_infinitive": zu_inf,
        "wiktionary_frame": wiktionary_frame(entry),
        "issues": issues,
    }


_BRACKET = re.compile(r"\[with ([^\]]*)\]", re.I)
_PREP_FRAME = re.compile(r"^([a-zäöü]+)\s*\(\+\s*(accusative|dative)\)", re.I)


def wiktionary_frame(entry: dict[str, Any]) -> dict[str, Any]:
    """Case frame hints from the first two current senses; a proposal, never final.

    Only the first alternative of a `[with …]` note counts, so regional variants
    such as `[with accusative or (Switzerland) dative]` do not add a dative.
    """
    objects: list[str] = []
    preps: list[dict[str, str]] = []
    for s in usable_senses(entry)[:2]:
        tags = set(s.get("tags") or [])
        text = " ".join(s.get("raw_glosses") or s.get("glosses") or [])
        if "transitive" in tags and "akk" not in objects:
            objects.append("akk")
        for bm in _BRACKET.finditer(text):
            first = bm.group(1).split(" or ")[0].strip()
            if first.startswith("dative") and "dat" not in objects:
                objects.append("dat")
            elif first.startswith("accusative") and "akk" not in objects:
                objects.append("akk")
            pm = _PREP_FRAME.match(first)
            if pm:
                case = "akk" if pm.group(2).lower() == "accusative" else "dat"
                p = {"prep": pm.group(1).lower(), "case": case}
                if p not in preps:
                    preps.append(p)
    return {"objects": objects, "preps": preps}

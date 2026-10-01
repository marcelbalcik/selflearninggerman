"""Tatoeba corpus: parse every German sentence once with spaCy and cache it.

The parse feeds three steps: lemma frequencies by reading (`select`), verb
frame counts (`enrich`) and exercise sentences (`sentences`).
"""

from __future__ import annotations

import bz2
import gzip
import json
import warnings
from pathlib import Path
from typing import Any, Iterator

from .common import RAW, SPACY_MODEL, WORK

PARSED = WORK / "tatoeba.parsed.jsonl.gz"


def _tsv(name: str) -> Iterator[list[str]]:
    with bz2.open(RAW / name, "rt", encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n").split("\t")


def english_translations() -> dict[int, str]:
    """German sentence id → first linked English sentence."""
    links: dict[int, int] = {}
    for parts in _tsv("deu-eng_links.tsv.bz2"):
        de, en = int(parts[0]), int(parts[1])
        links.setdefault(de, en)
    wanted = set(links.values())
    english: dict[int, str] = {}
    for parts in _tsv("eng_sentences.tsv.bz2"):
        sid = int(parts[0])
        if sid in wanted:
            english[sid] = parts[2]
    return {de: english[en] for de, en in links.items() if en in english}


def _token_rows(doc) -> list[list[Any]]:
    rows = []
    for t in doc:
        lemma = t.lemma_
        if t.pos_ in ("VERB", "AUX"):
            # Separable verbs: "ruft … an" → lemma "anrufen".
            particle = next((c for c in t.children if c.dep_ == "svp"), None)
            if particle is not None and particle.text.isalpha():
                lemma = particle.text.lower() + lemma
        rows.append([t.text, lemma, t.pos_, t.tag_, t.dep_, t.head.i, str(t.morph)])
    return rows


def parse_all(force: bool = False, n_process: int = 4) -> Path:
    """Parse all Tatoeba German sentences (≈ 7 min on 4 cores); cached."""
    if PARSED.exists() and not force:
        return PARSED
    import spacy

    warnings.filterwarnings("ignore", message=r"\[W095\]")
    nlp = spacy.load(SPACY_MODEL, disable=["ner"])
    en = english_translations()
    rows = [(int(p[0]), p[2]) for p in _tsv("deu_sentences.tsv.bz2")]
    tmp = PARSED.with_suffix(".part")
    with gzip.open(tmp, "wt", encoding="utf-8") as out:
        texts = (text for _, text in rows)
        for (sid, text), doc in zip(rows, nlp.pipe(texts, batch_size=1000, n_process=n_process)):
            out.write(json.dumps(
                {"id": sid, "de": text, "en": en.get(sid), "toks": _token_rows(doc)},
                ensure_ascii=False) + "\n")
    tmp.rename(PARSED)
    return PARSED


def iter_parsed() -> Iterator[dict[str, Any]]:
    with gzip.open(PARSED, "rt", encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)

"""Shared paths, JSON Lines helpers, reports and the bridge to the TypeScript core."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Iterator

REPO = Path(__file__).resolve().parents[2]
PIPELINE = REPO / "pipeline"
REPORTS = PIPELINE / "reports"
WORK = Path(os.environ.get("WORTDUELL_WORK", PIPELINE / "work"))
RAW = WORK / "raw"

KAIKKI_URL = "https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl"
TATOEBA_BASE = "https://downloads.tatoeba.org/exports/per_language"
TATOEBA_FILES = {
    "deu_sentences.tsv.bz2": f"{TATOEBA_BASE}/deu/deu_sentences.tsv.bz2",
    "deu-eng_links.tsv.bz2": f"{TATOEBA_BASE}/deu/deu-eng_links.tsv.bz2",
    "eng_sentences.tsv.bz2": f"{TATOEBA_BASE}/eng/eng_sentences.tsv.bz2",
}
SPACY_MODEL = "de_core_news_md"
USER_AGENT = "WortduellPipeline/0.1 (private two-person vocabulary app; non-commercial)"


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def write_report(step: str, data: dict[str, Any]) -> Path:
    """Every step writes pipeline/reports/<step>.json (spec §11)."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / f"{step}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def lemma_id(pos: str, text: str, sense_key: str) -> int:
    """Stable across content versions, so re-imports never orphan user cards.

    48 bits keeps the id a safe JavaScript integer.
    """
    digest = hashlib.sha1(f"{pos}|{text}|{sense_key}".encode()).hexdigest()
    return int(digest[:12], 16)


def core_cli(command: str, rows: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Run `pnpm core:cli <command> --json` with JSON Lines in and out."""
    payload = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows or [])
    proc = subprocess.run(
        ["pnpm", "--silent", "core:cli", command, "--json"],
        cwd=REPO,
        input=payload,
        capture_output=True,
        text=True,
        check=True,
    )
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


@lru_cache(maxsize=1)
def config() -> dict[str, Any]:
    """The single config module packages/core/src/config.ts (spec §0.4)."""
    return core_cli("config")[0]

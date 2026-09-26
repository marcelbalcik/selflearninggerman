"""`python -m wortduell_pipeline <step>`; each step writes pipeline/reports/<step>.json."""

from __future__ import annotations

import argparse
import json
import time
import warnings

warnings.filterwarnings("ignore", message=r"\[W095\]")

STEPS = [
    "download", "select", "extract", "crosscheck", "gender_rules",
    "enrich", "sentences", "validate", "audio", "export",
]


def run(step: str) -> dict:
    if step == "download":
        from .steps_source import download
        return download()
    if step == "select":
        from .steps_source import select
        return select()
    if step in ("extract", "crosscheck", "gender_rules"):
        from . import steps_lexicon
        return getattr(steps_lexicon, step)()
    if step in ("enrich", "sentences", "validate"):
        from . import steps_corpus
        return getattr(steps_corpus, step)()
    if step in ("audio", "export"):
        from . import steps_output
        return getattr(steps_output, step)()
    raise SystemExit(f"unknown step {step}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="wortduell_pipeline", description=__doc__)
    parser.add_argument("step", choices=[*STEPS, "all"])
    parser.add_argument("--from", dest="start", choices=STEPS, help="with `all`: start here")
    args = parser.parse_args()
    steps = STEPS[STEPS.index(args.start):] if args.step == "all" and args.start else (
        STEPS if args.step == "all" else [args.step])
    for step in steps:
        t0 = time.time()
        report = run(step)
        summary = {k: v for k, v in report.items() if not isinstance(v, (list, dict))}
        print(f"[{step}] {time.time() - t0:.0f}s {json.dumps(summary, ensure_ascii=False)}")

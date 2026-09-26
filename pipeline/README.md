# Content pipeline

Builds `content.sqlite` (core deck) and `dictionary.sqlite` (all German nouns,
verbs, adjectives and adverbs; the chore catalog's words come from it) from free data only:

- **Wiktionary** via kaikki.org (grammar, glosses), CC BY-SA 4.0
- **Tatoeba** German–English sentences, CC BY 2.0 FR
- **spaCy** `de_core_news_md` (parsing, run locally)
- **wordfreq** (frequencies)

No LLM or paid API is used (docs/DECISIONS.md).

## Setup

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e 'pipeline[dev]'
# spaCy model: from Hugging Face (github.com may be blocked)
curl -L -o de_core_news_md-3.7.0-py3-none-any.whl \
  https://huggingface.co/spacy/de_core_news_md/resolve/main/de_core_news_md-any-py3-none-any.whl
pip install --no-deps de_core_news_md-3.7.0-py3-none-any.whl
pnpm install   # the pipeline calls the TypeScript core through `pnpm core:cli`
```

## Run

```bash
cd pipeline
python -m wortduell_pipeline all          # every step, in order
python -m wortduell_pipeline crosscheck   # one step
python -m wortduell_pipeline all --from enrich
python -m pytest                          # parser tests
```

| Step           | Does                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `download`     | kaikki German JSONL and Tatoeba files into `work/raw/` (skips existing)                                      |
| `select`       | top `PIPELINE.TRIAL_LEMMA_COUNT` lemmas: wordfreq frequency split over spaCy readings in Tatoeba             |
| `extract`      | gender, plural, form tables, verb data, glosses; splits senses by gender/separability                        |
| `crosscheck`   | every noun table against the rule engine (`pnpm core:decline --json`), verb rules; mismatch → `needs_review` |
| `gender_rules` | accuracy of each suffix rule on the selected nouns                                                           |
| `enrich`       | semantic field/theme (Wiktionary topics), CEFR hint (frequency band), verb frame proposals                   |
| `sentences`    | exercise candidates from parsed Tatoeba sentences                                                            |
| `validate`     | gaps recomputed from the form tables; `fehlersuche` errors built and checked                                 |
| `export`       | `work/out/content.sqlite`, `work/out/dictionary.sqlite`, `reports/M1-REPORT.md`                              |

Every step writes `reports/<step>.json`. The Tatoeba parse is cached in
`work/tatoeba.parsed.jsonl.gz` (about 7 minutes on 4 cores the first time).
All tunable numbers come from `packages/core/src/config.ts`.

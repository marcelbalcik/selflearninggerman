/**
 * Command-line bridge for the Python pipeline (spec §11 `crosscheck`). Reads
 * JSON Lines on stdin, writes JSON Lines on stdout.
 *
 *   config          print every config value as one JSON object
 *   decline         {id, noun: NounInput}             → {id, table, issues}
 *   render          {id, noun, spec: NpSpec}          → {id, texts}
 *   check-verbs     {id, verb: VerbInput}             → {id, zuInfinitive, issues}
 *   skills          {id, num, case, gender, prep?}    → {id, caseSkill, prepSkill}
 *   grammar         print determiner cells, contractions and preposition classes
 */
import { createInterface } from 'node:readline';
import * as config from '../src/config';
import { CONTRACTIONS, DET_CLASSES, determiner } from '../src/determiners';
import {
  ACCUSATIVE_PREPOSITIONS,
  DATIVE_PREPOSITIONS,
  TWO_WAY_PREPOSITIONS,
  prepSkillFor,
} from '../src/prepositions';
import { caseSkillFor } from '../src/rating';
import { CASES, SLOTS } from '../src/types';
import { checkNoun, declineByRules, renderNp } from '../src/declension';
import type { NpSpec } from '../src/declension';
import type { Case, Gender, GramNumber, NounInput } from '../src/types';
import { checkVerb, zuInfinitive } from '../src/verbs';
import type { VerbInput } from '../src/verbs';

type Handler = (row: Record<string, unknown>) => Record<string, unknown>;

const handlers: Record<string, Handler> = {
  decline: (row) => {
    const noun = row.noun as NounInput;
    return { id: row.id, table: declineByRules(noun), issues: checkNoun(noun) };
  },
  render: (row) => {
    const texts = renderNp(row.noun as NounInput, row.spec as NpSpec).map((f) => f.text);
    return { id: row.id, texts };
  },
  skills: (row) => {
    const kase = row.case as Case;
    const prep = row.prep as string | undefined;
    return {
      id: row.id,
      caseSkill: caseSkillFor(row.num as GramNumber, kase, (row.gender as Gender | null) ?? null),
      prepSkill: prep === undefined ? null : prepSkillFor(prep, kase),
    };
  },
  'check-verbs': (row) => {
    const verb = row.verb as VerbInput;
    return { id: row.id, zuInfinitive: zuInfinitive(verb), issues: checkVerb(verb) };
  },
};

async function main(): Promise<void> {
  const command = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (command === 'config') {
    process.stdout.write(`${JSON.stringify(config)}\n`);
    return;
  }
  if (command === 'grammar') {
    const determiners: { word: string; cls: string; slot: string; case: string }[] = [];
    for (const cls of DET_CLASSES) {
      for (const kase of CASES) {
        for (const slot of SLOTS) {
          const word = determiner(cls, slot, kase);
          if (word !== null) determiners.push({ word, cls, slot, case: kase });
        }
      }
    }
    const prepositions = {
      dat: DATIVE_PREPOSITIONS,
      akk: ACCUSATIVE_PREPOSITIONS,
      twoWay: TWO_WAY_PREPOSITIONS,
    };
    process.stdout.write(
      `${JSON.stringify({ determiners, contractions: CONTRACTIONS, prepositions })}\n`,
    );
    return;
  }
  const handler = command === undefined ? undefined : handlers[command];
  if (handler === undefined) {
    process.stderr.write(`usage: cli <config|${Object.keys(handlers).join('|')}> --json\n`);
    process.exitCode = 2;
    return;
  }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    let out: Record<string, unknown>;
    try {
      out = handler(row);
    } catch (err) {
      out = { id: row.id, error: String(err) };
    }
    process.stdout.write(`${JSON.stringify(out)}\n`);
  }
}

void main();

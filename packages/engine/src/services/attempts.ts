/**
 * The attempt pipeline (spec M2): grade → classify → rate → update cards → log.
 * The server's grade is authoritative (spec §2).
 */
import {
  displayTable,
  gradeClosed,
  gradeDiktat,
  gradeFehlersuche,
  gradeGloss,
  gradeSentence,
  gradeNp,
  lemmaFacetKey,
  markAnswer,
  medianLatencyMs,
  rateNpAttempt,
  resolveAmbiguous,
  sentenceFacets,
  skillFacetKey,
  successRating,
} from '@wortduell/core';
import type {
  DetClass,
  FacetKey,
  FacetRating,
  Gender,
  NpGrade,
  NpRatingContext,
  NpTarget,
  PrepSkill,
} from '@wortduell/core';
import type { Db } from '../db';
import { Ids } from '../ids';
import { meaningChoice } from '../choices';
import { json } from '../db';
import { nounInput } from '../repo';
import type { Lemma, Repo, Sentence } from '../repo';
import type { Cards, ReviewContext } from './cards';

export interface AttemptInput {
  sentenceId: number;
  answer: string;
  /** `fehlersuche`: index of the tapped token. */
  tappedIndex?: number;
  latencyMs: number;
  hintUsed?: boolean;
  context?: 'session' | 'duel' | 'exam';
  /** Duel or exam item this attempt answers. */
  round?: { duelId?: number; examId?: number; index: number };
}

export interface Feedback {
  attemptId: number;
  correct: boolean;
  expected: string;
  answer: string;
  errorClass: string | null;
  secondary: string[];
  notes: string[];
  marks: { text: string; status: string }[];
  followUp: NpGrade['followUp'];
  ratings: FacetRating[];
  /** Declension strip of the noun (spec §6 feedback panel). */
  forms: ReturnType<typeof displayTable> | null;
}

export class AttemptError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Attempts {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly cards: Cards,
    private readonly ids: Ids = new Ids(),
  ) {}

  submit(userId: number, input: AttemptInput, now: Date): Feedback {
    const sentence = this.repo.sentence(input.sentenceId);
    if (!sentence || sentence.status !== 'ok')
      throw new AttemptError(404, 'sentence not available');
    const lemma = this.repo.lemma(sentence.lemmaId);
    if (!lemma) throw new AttemptError(404, 'lemma not found');
    if (!this.cards.isIntroduced(userId, lemma.id)) {
      throw new AttemptError(409, 'lemma not introduced yet');
    }
    const context: ReviewContext = input.context ?? 'session';
    const median = this.medianLatency(userId, sentence.exerciseType);
    const speed = {
      latencyMs: input.latencyMs,
      medianLatencyMs: median,
      // No hints in the duel or the exam (docs/DECISIONS.md).
      hintUsed: context === 'session' && input.hintUsed === true,
    };

    let grade: NpGrade | null = null;
    let correct = false;
    let expected = '';
    let typo = false;
    let errorClass: string | null = null;
    let ratings: FacetRating[] = [];
    const implicated = this.implicated(userId, sentence, lemma, now);

    const extra = this.repo.extraAccepted(sentence.id);
    const simple = (
      g: { correct: boolean; expected: string; typoTolerated: boolean },
      wrongClass: string,
    ) => {
      correct = g.correct;
      expected = g.expected;
      typo = g.typoTolerated;
      errorClass = correct ? null : wrongClass;
      ratings = correct
        ? implicated.map((facet) => ({ facet, rating: successRating(speed, typo) }))
        : [
            { facet: lemmaFacetKey(lemma.id, sentence.targetFacet), rating: 'again' as const },
            ...sentence.skillIds.map((sk) => ({
              facet: skillFacetKey(sk),
              rating: 'again' as const,
            })),
          ];
    };

    if (extra.length > 0 && gradeSentence(extra, input.answer).correct) {
      // Accepted earlier through an approved dispute.
      simple({ correct: true, expected: input.answer, typoTolerated: false }, '');
    } else if (
      sentence.exerciseType === 'kasus_luecke' ||
      (sentence.exerciseType === 'en_de_chunk' && sentence.gap.features) ||
      (sentence.exerciseType === 'umformen' && sentence.gap.instruction === 'dat_pl')
    ) {
      const target = npTarget(sentence, lemma);
      grade = gradeNp(target, input.answer);
      correct = grade.correct;
      expected = matchCase(grade.expected, sentence.gap.expected);
      typo = grade.typoTolerated;
      errorClass = grade.errorClass;
      const meaning = sentence.exerciseType === 'en_de_chunk' ? 'meaning_prod' : 'meaning_recv';
      ratings = rateNpAttempt(
        grade,
        this.ratingContext(sentence, lemma, implicated, meaning),
        speed,
      );
    } else if (sentence.exerciseType === 'fehlersuche') {
      const g = gradeFehlersuche(
        sentence.gap as Required<Pick<typeof sentence.gap, 'tokens' | 'error_index' | 'wrong'>> & {
          correct: string;
        },
        input.tappedIndex ?? -1,
        input.answer,
      );
      correct = g.correct;
      expected = g.expected;
      errorClass = correct ? null : g.foundError ? 'wrong_correction' : 'wrong_token';
      ratings = correct
        ? implicated.map((facet) => ({ facet, rating: successRating(speed, false) }))
        : [{ facet: lemmaFacetKey(lemma.id, sentence.targetFacet), rating: 'again' }];
    } else if (sentence.exerciseType === 'bedeutung') {
      // A tapped option; typed meanings (older logs) are still graded as typed.
      const choice = meaningChoice(this.repo, lemma, sentence.id);
      const g = choice.options.includes(input.answer)
        ? { correct: input.answer === choice.answer, expected: choice.answer, typoTolerated: false }
        : gradeGloss(sentence.accepted, input.answer);
      correct = g.correct;
      expected = g.correct ? g.expected : choice.answer;
      typo = g.typoTolerated;
      errorClass = correct ? null : 'wrong_meaning';
      ratings = [
        {
          facet: lemmaFacetKey(lemma.id, 'meaning_recv'),
          rating: correct ? successRating(speed, typo) : 'again',
        },
      ];
    } else if (sentence.exerciseType === 'en_de_chunk' || sentence.exerciseType === 'umformen') {
      simple(gradeClosed(sentence.accepted, input.answer), 'wrong_form');
    } else if (sentence.exerciseType === 'satzbau') {
      simple(gradeSentence(sentence.accepted, input.answer), 'no_match');
    } else if (sentence.exerciseType === 'wer_tut_was') {
      const right = sentence.accepted[0] ?? '';
      const options = sentence.gap.options ?? [];
      simple(
        {
          correct: input.answer.trim() === right,
          expected: options[Number(right)] ?? right,
          typoTolerated: false,
        },
        'case_error',
      );
    } else if (sentence.exerciseType === 'diktat') {
      const g = gradeDiktat(sentence.de, sentence.gap.target ?? '', input.answer);
      simple(
        { ...g, typoTolerated: g.correct && g.typoTolerated },
        g.targetCorrect ? 'too_many_slips' : 'wrong_word',
      );
    } else {
      throw new AttemptError(400, `exercise type ${sentence.exerciseType} not supported`);
    }

    const pending = grade?.errorClass === 'ambiguous';
    const attemptId = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO attempt (id, user_id, sentence_id, exercise_type, answer_raw, correct, error_class,
             classification, latency_ms, context, ts, pending_followup, duel_id, exam_id, item_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.ids.next(),
          userId,
          sentence.id,
          sentence.exerciseType,
          input.answer,
          correct ? 1 : 0,
          errorClass,
          grade ? JSON.stringify(grade) : null,
          Math.round(input.latencyMs),
          context,
          now.toISOString(),
          pending ? 1 : 0,
          input.round?.duelId ?? null,
          input.round?.examId ?? null,
          input.round?.index ?? null,
        );
      const id = Number(info.lastInsertRowid);
      if (!pending) ratings = this.apply(userId, ratings, now, id, context);
      return id;
    })();

    const feedback: Feedback = {
      attemptId,
      correct,
      expected,
      answer: input.answer,
      errorClass,
      secondary: grade?.secondary ?? [],
      notes: [...(grade?.notes ?? []), ...(typo && !grade ? ['typo_tolerated'] : [])],
      marks:
        sentence.exerciseType === 'wer_tut_was' || sentence.exerciseType === 'bedeutung'
          ? []
          : markAnswer(expected, input.answer.trim()),
      followUp: grade?.followUp ?? null,
      ratings: pending ? [] : ratings,
      forms: lemma.noun ? displayTable(nounInput(lemma)) : null,
    };
    if (context !== 'session') {
      // Shown only at the end of the duel or exam.
      this.db
        .prepare('UPDATE attempt SET feedback = ? WHERE id = ?')
        .run(JSON.stringify(feedback), attemptId);
    }
    return feedback;
  }

  /** Settle an `ambiguous` attempt with the one-tap gender answer (spec §7.3). */
  followUp(userId: number, attemptId: number, gender: Gender, now: Date): FacetRating[] {
    const row = this.db
      .prepare<
        [number, number],
        {
          sentence_id: number;
          classification: string;
          pending_followup: number;
          latency_ms: number;
        }
      >(
        'SELECT sentence_id, classification, pending_followup, latency_ms FROM attempt WHERE id = ? AND user_id = ?',
      )
      .get(attemptId, userId);
    if (!row) throw new AttemptError(404, 'attempt not found');
    if (row.pending_followup !== 1) throw new AttemptError(409, 'no follow-up pending');
    const sentence = this.repo.sentence(row.sentence_id) as Sentence;
    const lemma = this.repo.lemma(sentence.lemmaId) as Lemma;
    const target = npTarget(sentence, lemma);
    const grade = resolveAmbiguous(json<NpGrade>(row.classification) as NpGrade, target, gender);
    const implicated = this.implicated(userId, sentence, lemma, now);
    const proposed = rateNpAttempt(grade, this.ratingContext(sentence, lemma, implicated), {
      latencyMs: row.latency_ms,
      medianLatencyMs: row.latency_ms,
      hintUsed: false,
    });
    return this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE attempt SET pending_followup = 0, error_class = ?, classification = ? WHERE id = ?',
        )
        .run(grade.errorClass, JSON.stringify(grade), attemptId);
      return this.apply(userId, proposed, now, attemptId, 'session');
    })();
  }

  private apply(
    userId: number,
    ratings: FacetRating[],
    now: Date,
    attemptId: number,
    context: ReviewContext,
  ): FacetRating[] {
    // Only ratings that reached an unlocked card count (and are reported back).
    return ratings.filter(
      (r) => this.cards.rate(userId, r.facet, r.rating, now, attemptId, context) !== null,
    );
  }

  /** Implicated facets the user has unlocked cards for; skill cards are created on first use. */
  private implicated(userId: number, sentence: Sentence, lemma: Lemma, now: Date): FacetKey[] {
    const facets = sentenceFacets({
      lemmaId: lemma.id,
      targetFacet: sentence.targetFacet,
      exerciseType: sentence.exerciseType,
      skillIds: sentence.skillIds,
      features: sentence.gap.features ?? null,
      governor: sentence.gap.governed_by ?? null,
      nounIsWeak: lemma.noun ? lemma.noun.weak || lemma.noun.mixed : false,
    });
    const keys: FacetKey[] = [];
    for (const f of facets.lexical) {
      const key = lemmaFacetKey(f.lemmaId, f.facet);
      if (this.cards.get(userId, key)?.unlocked === 1) keys.push(key);
    }
    for (const s of facets.skills) {
      this.cards.ensureSkill(userId, s, now);
      keys.push(skillFacetKey(s));
    }
    return keys;
  }

  private ratingContext(
    sentence: Sentence,
    lemma: Lemma,
    implicated: FacetKey[],
    meaning: 'meaning_recv' | 'meaning_prod' = 'meaning_recv',
  ): NpRatingContext {
    const f = sentence.gap.features;
    const gov = sentence.gap.governed_by;
    const prepSkill = sentence.skillIds.find((s): s is PrepSkill => s.startsWith('prep.'));
    return {
      lemmaId: lemma.id,
      num: f?.number ?? 'sg',
      case: f?.case ?? 'nom',
      gender: f?.number === 'pl' ? null : (lemma.noun?.gender ?? null),
      primary: lemmaFacetKey(lemma.id, sentence.targetFacet),
      meaning: lemmaFacetKey(lemma.id, meaning),
      governor:
        gov?.type === 'verb' && gov.lemma_id
          ? { kind: 'verb', lemmaId: gov.lemma_id }
          : gov?.type === 'prep' && prepSkill
            ? { kind: 'prep', skill: prepSkill }
            : null,
      implicated,
    };
  }

  /** Rolling median latency per user and exercise type (spec §5.3). */
  private medianLatency(userId: number, type: Sentence['exerciseType']): number {
    const rows = this.db
      .prepare<[number, string], { latency_ms: number }>(
        `SELECT latency_ms FROM attempt WHERE user_id = ? AND exercise_type = ? AND voided = 0
         ORDER BY ts DESC, id DESC LIMIT 200`,
      )
      .all(userId, type)
      .map((r) => r.latency_ms)
      .reverse();
    return medianLatencyMs(rows, type);
  }
}

export function npTarget(sentence: Sentence, lemma: Lemma): NpTarget {
  const f =
    sentence.gap.features ??
    (sentence.gap.instruction === 'dat_pl'
      ? { case: 'dat' as const, number: 'pl' as const, det: 'def' }
      : undefined);
  if (!f || !lemma.noun) throw new AttemptError(500, 'sentence has no noun gap');
  return {
    noun: nounInput(lemma),
    num: f.number,
    case: f.case,
    det: f.det as DetClass,
    ...(sentence.gap.prep ? { prep: sentence.gap.prep } : {}),
  };
}

/** Keep a sentence-initial capital from the sentence (`Die Texte`). */
function matchCase(expected: string, inSentence: string | undefined): string {
  if (!inSentence || !/^[A-ZÄÖÜ]/u.test(inSentence)) return expected;
  return expected.charAt(0).toUpperCase() + expected.slice(1);
}

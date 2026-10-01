/**
 * Learning-day arithmetic in Europe/Berlin (spec §8.1). A day starts at
 * TIME.DAY_BOUNDARY_HOUR local time, a week on Monday at that hour, a month on
 * the 1st at that hour. Business logic never reads the wall clock: it passes
 * instants from an injected `Clock` (see clock.ts).
 */
import { TIME } from './config';

/** A learning day, `YYYY-MM-DD` (the local calendar date at or after the boundary). */
export type DayKey = string;

export interface Clock {
  now(): Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME.TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface LocalParts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

function localParts(instant: Date): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of formatter.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    y: parts.year ?? 0,
    m: parts.month ?? 0,
    d: parts.day ?? 0,
    h: parts.hour ?? 0,
    min: parts.minute ?? 0,
    s: parts.second ?? 0,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function keyFromUtcDate(date: Date): DayKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseKey(key: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

/** Add calendar days to a day key. */
export function addDays(key: DayKey, days: number): DayKey {
  const { y, m, d } = parseKey(key);
  return keyFromUtcDate(new Date(Date.UTC(y, m - 1, d + days)));
}

/** The learning day an instant belongs to. */
export function dayKey(instant: Date): DayKey {
  const p = localParts(instant);
  const key = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  return p.h < TIME.DAY_BOUNDARY_HOUR ? addDays(key, -1) : key;
}

/** Offset of Berlin local time from UTC at an instant, in ms. */
function offsetMs(instant: Date): number {
  const p = localParts(instant);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a learning day starts (its boundary hour, local time). DST-safe. */
export function dayStart(key: DayKey): Date {
  const { y, m, d } = parseKey(key);
  const localAsUtc = Date.UTC(y, m - 1, d, TIME.DAY_BOUNDARY_HOUR);
  // Two passes settle the offset across a DST change.
  let guess = localAsUtc - offsetMs(new Date(localAsUtc));
  guess = localAsUtc - offsetMs(new Date(guess));
  return new Date(guess);
}

/** Monday of the learning week, used as the week key's anchor. */
export function weekStartDay(key: DayKey): DayKey {
  const { y, m, d } = parseKey(key);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((weekday + 6) % 7));
}

/** ISO week key, e.g. `2026-W39`. */
export function weekKey(key: DayKey): string {
  const monday = weekStartDay(key);
  const thursday = addDays(monday, 3);
  const { y } = parseKey(thursday);
  const jan4 = weekStartDay(`${y}-01-04`);
  const { y: jy, m: jm, d: jd } = parseKey(jan4);
  const { y: my, m: mm, d: md } = parseKey(monday);
  const weeks =
    Math.round((Date.UTC(my, mm - 1, md) - Date.UTC(jy, jm - 1, jd)) / (7 * DAY_MS)) + 1;
  return `${y}-W${pad(weeks)}`;
}

/** Month key, e.g. `2026-09`. */
export function monthKey(key: DayKey): string {
  return key.slice(0, 7);
}

/** Days between two instants (fractional). */
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

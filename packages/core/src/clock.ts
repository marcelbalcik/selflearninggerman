/** The only place that reads the wall clock (spec §0.5). */
import type { Clock } from './time';

export const systemClock: Clock = { now: () => new Date() };

/** A settable clock for tests and simulations. */
export class FakeClock implements Clock {
  private t: number;

  constructor(start: Date | string) {
    this.t = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.t);
  }

  set(instant: Date | string): void {
    this.t = new Date(instant).getTime();
  }

  advance(ms: number): void {
    this.t += ms;
  }
}

/** The wall clock shifted by a fixed offset (development and end-to-end tests only). */
export function offsetClock(offsetMs: number): Clock {
  return { now: () => new Date(Date.now() + offsetMs) };
}

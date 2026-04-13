/**
 * @module duration
 *
 * Typed time primitives using nominal branding for unit safety.
 *
 * **Why Duration instead of raw numbers?**
 * `setTimeout(300)` and `timeout(300)` have the same signature but one is
 * milliseconds and the other might be seconds. Duration brands the number
 * with a phantom type so `Duration.seconds(5)` cannot be passed where a
 * raw `number` is expected, eliminating a class of unit-mismatch bugs.
 *
 * Internally stored as milliseconds. All arithmetic preserves the brand.
 */

import type { Eq } from "../core/eq.js";
import type { Ord } from "../core/ord.js";
import type { Type } from "./nominal.js";

/**
 * A branded number representing a time duration in milliseconds.
 *
 * Construct via {@link Duration} factory methods. The brand prevents
 * accidental interchange with raw numbers.
 *
 * @example
 * ```ts
 * const timeout = Duration.seconds(30);
 * Duration.toMilliseconds(timeout); // 30000
 * ```
 */
export type Duration = Type<"Duration", number>;

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Brand a raw number as Duration.
 * Duration = number & { [__brand]: 'Duration' }, so number overlaps
 * with Duration and a single assertion is sufficient.
 */
const brand = (ms: number): Duration => ms as Duration;

/**
 * Extract the raw millisecond value from a Duration.
 * No cast needed: Duration extends number, so the assignment is safe.
 */
const unbrand = (d: Duration): number => d;

// ── Factories ───────────────────────────────────────────────────────────────

const milliseconds = (ms: number): Duration => brand(ms);
const seconds = (s: number): Duration => brand(s * 1_000);
const minutes = (m: number): Duration => brand(m * 60_000);
const hours = (h: number): Duration => brand(h * 3_600_000);
const days = (d: number): Duration => brand(d * 86_400_000);

// ── Conversions ─────────────────────────────────────────────────────────────

const toMilliseconds = (d: Duration): number => unbrand(d);
const toSeconds = (d: Duration): number => unbrand(d) / 1_000;
const toMinutes = (d: Duration): number => unbrand(d) / 60_000;
const toHours = (d: Duration): number => unbrand(d) / 3_600_000;

// ── Arithmetic ──────────────────────────────────────────────────────────────

const add = (a: Duration, b: Duration): Duration => brand(unbrand(a) + unbrand(b));

const subtract = (a: Duration, b: Duration): Duration => brand(unbrand(a) - unbrand(b));

const multiply = (d: Duration, factor: number): Duration => brand(unbrand(d) * factor);

// ── Predicates ──────────────────────────────────────────────────────────────

const isZero = (d: Duration): boolean => unbrand(d) === 0;
const isPositive = (d: Duration): boolean => unbrand(d) > 0;

// ── Typeclass instances ─────────────────────────────────────────────────────

const durationEq: Eq<Duration> = Object.freeze({
  equals: (a: Duration, b: Duration): boolean => unbrand(a) === unbrand(b),
});

const sign = (n: number): -1 | 0 | 1 => (n < 0 ? -1 : n > 0 ? 1 : 0);

const durationOrd: Ord<Duration> = Object.freeze({
  equals: durationEq.equals,
  compare: (a: Duration, b: Duration): -1 | 0 | 1 => sign(unbrand(a) - unbrand(b)),
});

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format a duration as a human-readable string.
 * Uses the largest appropriate unit: "2h 30m 15s", "500ms", "0ms".
 */
const format = (d: Duration): string => {
  const ms = unbrand(d);
  const absMs = Math.abs(ms);
  const prefix = ms < 0 ? "-" : "";

  if (absMs === 0) return "0ms";

  const days = Math.floor(absMs / 86_400_000);
  const hours = Math.floor((absMs % 86_400_000) / 3_600_000);
  const mins = Math.floor((absMs % 3_600_000) / 60_000);
  const secs = Math.floor((absMs % 60_000) / 1_000);
  const remainMs = absMs % 1_000;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0) parts.push(`${secs}s`);
  if (remainMs > 0) parts.push(`${remainMs}ms`);

  return prefix + parts.join(" ");
};

// ── Zero constant ───────────────────────────────────────────────────────────

const zeroDuration: Duration = brand(0);

// ── Public namespace (const/type merge) ─────────────────────────────────────

/**
 * Create and manipulate type-safe time durations.
 *
 * Callable factories produce branded Duration values from human-readable
 * units. Arithmetic operations preserve the brand. Conversion functions
 * extract the raw number in the desired unit.
 *
 * @example
 * ```ts
 * const timeout = Duration.seconds(30);
 * const doubled = Duration.multiply(timeout, 2);
 * Duration.toMilliseconds(doubled); // 60000
 *
 * const total = Duration.add(Duration.minutes(5), Duration.seconds(30));
 * Duration.toSeconds(total); // 330
 * ```
 */
export const Duration: {
  /** Create a Duration from milliseconds. */
  readonly milliseconds: (ms: number) => Duration;
  /** Create a Duration from seconds. */
  readonly seconds: (s: number) => Duration;
  /** Create a Duration from minutes. */
  readonly minutes: (m: number) => Duration;
  /** Create a Duration from hours. */
  readonly hours: (h: number) => Duration;
  /** Create a Duration from days. */
  readonly days: (d: number) => Duration;
  /** Extract the raw millisecond value. */
  readonly toMilliseconds: (d: Duration) => number;
  /** Convert to seconds. */
  readonly toSeconds: (d: Duration) => number;
  /** Convert to minutes. */
  readonly toMinutes: (d: Duration) => number;
  /** Convert to hours. */
  readonly toHours: (d: Duration) => number;
  /** Add two durations. */
  readonly add: (a: Duration, b: Duration) => Duration;
  /** Subtract b from a. */
  readonly subtract: (a: Duration, b: Duration) => Duration;
  /** Multiply a duration by a numeric factor. */
  readonly multiply: (d: Duration, factor: number) => Duration;
  /** Check whether the duration is exactly zero. */
  readonly isZero: (d: Duration) => boolean;
  /** Check whether the duration is greater than zero. */
  readonly isPositive: (d: Duration) => boolean;
  /** Format the duration as a human-readable string. */
  readonly format: (d: Duration) => string;
  /** A zero-length duration constant. */
  readonly zero: Duration;
  /** Equality instance for Duration. */
  readonly eq: Eq<Duration>;
  /** Ordering instance for Duration. */
  readonly ord: Ord<Duration>;
} = {
  milliseconds,
  seconds,
  minutes,
  hours,
  days,
  toMilliseconds,
  toSeconds,
  toMinutes,
  toHours,
  add,
  subtract,
  multiply,
  isZero,
  isPositive,
  format,
  zero: zeroDuration,
  eq: durationEq,
  ord: durationOrd,
};

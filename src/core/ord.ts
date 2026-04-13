/**
 * @module ord
 *
 * Composable ordering typeclasses extending {@link Eq}.
 *
 * **Why Ord extends Eq?**
 * Every total order implies equality: `compare(a, b) === 0` means `a` equals `b`.
 * Extending Eq means any Ord can be passed to functions expecting Eq, and the
 * equality check is derived automatically from the comparison function.
 *
 * **How to use with pipe/flow:**
 * ```ts
 * const byAge = Ord.contramap(Ord.number, (u: User) => u.age);
 * const sorted = users.sortBy(byAge.compare);
 * ```
 */

import type { Eq } from "./eq.js";

/**
 * Ordering comparison for values of type T.
 *
 * Extends {@link Eq} so any Ord can be used where Eq is expected.
 * The `compare` function returns `-1`, `0`, or `1` (normalized).
 *
 * @example
 * ```ts
 * const byAge = Ord.contramap(Ord.number, (u: User) => u.age);
 * byAge.compare({ age: 20 }, { age: 30 }); // -1
 * ```
 */
export interface Ord<T> extends Eq<T> {
  /** Compare two values, returning -1, 0, or 1. */
  readonly compare: (a: T, b: T) => -1 | 0 | 1;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Normalize a numeric comparison result to -1, 0, or 1. */
const sign = (n: number): -1 | 0 | 1 => (n < 0 ? -1 : n > 0 ? 1 : 0);

const fromCompare = <T>(compare: (a: T, b: T) => number): Ord<T> =>
  Object.freeze({
    compare: (a: T, b: T): -1 | 0 | 1 => sign(compare(a, b)),
    equals: (a: T, b: T): boolean => compare(a, b) === 0,
  });

// ── Built-in instances ──────────────────────────────────────────────────────

const stringOrd: Ord<string> = fromCompare((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const numberOrd: Ord<number> = fromCompare((a, b) => a - b);
const dateOrd: Ord<Date> = fromCompare((a, b) => a.getTime() - b.getTime());

// ── Combinators ─────────────────────────────────────────────────────────────

const reverseOrd = <T>(ord: Ord<T>): Ord<T> => fromCompare((a, b) => ord.compare(b, a));

const contramapOrd = <A, B>(ord: Ord<A>, f: (b: B) => A): Ord<B> =>
  fromCompare((a, b) => ord.compare(f(a), f(b)));

const minOrd =
  <T>(ord: Ord<T>) =>
  (a: T, b: T): T =>
    ord.compare(a, b) <= 0 ? a : b;

const maxOrd =
  <T>(ord: Ord<T>) =>
  (a: T, b: T): T =>
    ord.compare(a, b) >= 0 ? a : b;

const clampOrd =
  <T>(ord: Ord<T>, low: T, high: T) =>
  (value: T): T =>
    ord.compare(value, low) < 0 ? low : ord.compare(value, high) > 0 ? high : value;

const betweenOrd =
  <T>(ord: Ord<T>, low: T, high: T) =>
  (value: T): boolean =>
    ord.compare(value, low) >= 0 && ord.compare(value, high) <= 0;

// ── Public namespace (const/type merge) ─────────────────────────────────────

/**
 * Create and compose ordering comparisons.
 *
 * Callable as a factory (`Ord(compare)`) and as a namespace for built-in
 * instances and combinators.
 *
 * @example
 * ```ts
 * Ord.number.compare(1, 2);         // -1
 * Ord.reverse(Ord.number).compare(1, 2); // 1
 *
 * const byAge = Ord.contramap(Ord.number, (u: User) => u.age);
 * Ord.clamp(Ord.number, 0, 100)(150);   // 100
 * ```
 */
export const Ord: {
  /** Create an Ord from a comparison function. */
  <T>(compare: (a: T, b: T) => number): Ord<T>;
  /** Create an Ord from a comparison function. */
  readonly fromCompare: <T>(compare: (a: T, b: T) => number) => Ord<T>;
  /** String ordering via locale-independent comparison. */
  readonly string: Ord<string>;
  /** Numeric ordering via subtraction. */
  readonly number: Ord<number>;
  /** Date ordering via getTime() comparison. */
  readonly date: Ord<Date>;
  /** Reverse the ordering direction. */
  readonly reverse: <T>(ord: Ord<T>) => Ord<T>;
  /** Derive an Ord for B from an Ord for A via a projection function. */
  readonly contramap: <A, B>(ord: Ord<A>, f: (b: B) => A) => Ord<B>;
  /** Return the smaller of two values. */
  readonly min: <T>(ord: Ord<T>) => (a: T, b: T) => T;
  /** Return the larger of two values. */
  readonly max: <T>(ord: Ord<T>) => (a: T, b: T) => T;
  /** Clamp a value between low and high bounds. */
  readonly clamp: <T>(ord: Ord<T>, low: T, high: T) => (value: T) => T;
  /** Check whether a value falls within the inclusive range [low, high]. */
  readonly between: <T>(ord: Ord<T>, low: T, high: T) => (value: T) => boolean;
} = Object.assign(<T>(compare: (a: T, b: T) => number): Ord<T> => fromCompare(compare), {
  fromCompare,
  string: stringOrd,
  number: numberOrd,
  date: dateOrd,
  reverse: reverseOrd,
  contramap: contramapOrd,
  min: minOrd,
  max: maxOrd,
  clamp: clampOrd,
  between: betweenOrd,
});

/**
 * @module validation
 *
 * Error-accumulating validation: like {@link Result} but collects **all**
 * errors instead of short-circuiting on the first one.
 *
 * Use `Result` when you need railway-oriented chaining (stop at the first
 * failure). Use `Validation` when you need to report every problem at once
 * (form validation, config parsing, batch checks).
 *
 * Two public interfaces (`Valid`, `Invalid`) define the contract.
 * Module-private classes (`ValidImpl`, `InvalidImpl`) provide the
 * implementation. Methods live on prototypes so instances carry only
 * their payload, keeping GC pressure low.
 *
 * The `Validation` const/type merge lets callers use
 * `Validation.collect()` in value position and `Validation<T, E>` in
 * type position.
 */

import type { Option } from "./option.js";
import { None, Some } from "./option.js";
import type { Result } from "./result.js";
import { Err, Ok } from "./result.js";

/** Pattern-match arms for {@link Validation.match}. */
export interface ValidationMatcher<T, E, U> {
  /** Handler for the Valid variant. */
  readonly Valid: (value: T) => U;
  /** Handler for the Invalid variant. */
  readonly Invalid: (errors: readonly E[]) => U;
}

// ── Public interfaces ────────────────────────────────────────────────────────

/**
 * The success variant of {@link Validation}.
 *
 * Wraps a value of type `T`. Combining two `Valid` values via `zip` or
 * `ap` produces a new `Valid`.
 *
 * Construct via the {@link Valid} factory: `Valid(42)`.
 */
export interface Valid<T, E> {
  /** Discriminant tag for pattern matching. */
  readonly tag: "Valid";
  /** Whether this is a Valid variant. Always `true`. */
  readonly isValid: true;
  /** Whether this is an Invalid variant. Always `false`. */
  readonly isInvalid: false;
  /** The wrapped success value. */
  readonly value: T;

  /** Apply `fn` to the success value, returning a new `Valid`. */
  map<U>(fn: (value: T) => U): Validation<U, E>;
  /** No-op on `Valid`: the error channel is empty. */
  mapErr<F>(fn: (error: E) => F): Validation<T, F>;
  /**
   * Chain into a dependent computation that may fail.
   *
   * Note: `flatMap` **short-circuits** like Result because the next
   * validation may depend on the current value. Use `zip` or `ap`
   * for independent validations that should accumulate errors.
   */
  flatMap<U>(fn: (value: T) => Validation<U, E>): Validation<U, E>;
  /** Run a side-effect on the success value without altering the Validation. */
  tap(fn: (value: T) => void): Validation<T, E>;
  /** No-op on `Valid`: no errors to tap. */
  tapErr(fn: (errors: readonly E[]) => void): Validation<T, E>;
  /** Extract the success value. */
  unwrap(): T;
  /** Return the success value, ignoring the fallback. */
  unwrapOr(fallback: T): T;
  /** Return the success value, ignoring the recovery function. */
  unwrapOrElse(fn: (errors: readonly E[]) => T): T;
  /** Throws: there are no errors to extract from `Valid`. */
  unwrapErr(): never;
  /** Exhaustively handle both variants. */
  match<U>(m: ValidationMatcher<T, E, U>): U;
  /** Convert to `Some(value)`. */
  toOption(): Option<T>;
  /** Convert to `Ok(value)`. */
  toResult(): Result<T, readonly E[]>;
  /**
   * Combine two `Valid` values into a tuple, **accumulating** errors.
   *
   * If both are Valid, returns `Valid([a, b])`.
   * If one or both are Invalid, all errors are collected.
   */
  zip<U>(other: Validation<U, E>): Validation<[T, U], E>;
  /**
   * Applicative apply: apply a wrapped function to this value,
   * **accumulating** errors from both sides.
   */
  ap<U>(fnValidation: Validation<(value: T) => U, E>): Validation<U, E>;
  /** Serialize as `{ tag: 'Valid', value: T }`. */
  toJSON(): { tag: "Valid"; value: T };
  /** Human-readable string representation. */
  toString(): string;
}

/**
 * The failure variant of {@link Validation}.
 *
 * Wraps a non-empty array of errors. Combining two `Invalid` values
 * via `zip` or `ap` concatenates their error arrays.
 *
 * Construct via the {@link Invalid} factory: `Invalid('required')`.
 */
export interface Invalid<T, E> {
  /** Discriminant tag for pattern matching. */
  readonly tag: "Invalid";
  /** Whether this is a Valid variant. Always `false`. */
  readonly isValid: false;
  /** Whether this is an Invalid variant. Always `true`. */
  readonly isInvalid: true;
  /** The wrapped error array (guaranteed non-empty). */
  readonly errors: readonly E[];

  /** No-op on `Invalid`: the value channel is empty. */
  map<U>(fn: (value: T) => U): Validation<U, E>;
  /** Apply `fn` to each error, returning a new `Invalid`. */
  mapErr<F>(fn: (error: E) => F): Validation<T, F>;
  /** Short-circuit: propagate this `Invalid` without calling `fn`. */
  flatMap<U>(fn: (value: T) => Validation<U, E>): Validation<U, E>;
  /** No-op on `Invalid`: no value to tap. */
  tap(fn: (value: T) => void): Validation<T, E>;
  /** Run a side-effect on the errors without altering the Validation. */
  tapErr(fn: (errors: readonly E[]) => void): Validation<T, E>;
  /** Throws: there is no success value to extract from `Invalid`. */
  unwrap(): never;
  /** Return the fallback since this is `Invalid`. */
  unwrapOr(fallback: T): T;
  /** Recover from the errors by calling `fn`. */
  unwrapOrElse(fn: (errors: readonly E[]) => T): T;
  /** Extract the error array. */
  unwrapErr(): readonly E[];
  /** Exhaustively handle both variants. */
  match<U>(m: ValidationMatcher<T, E, U>): U;
  /** Convert to `None` (the success value is absent). */
  toOption(): Option<T>;
  /** Convert to `Err(errors)`. */
  toResult(): Result<T, readonly E[]>;
  /** Accumulate errors from both sides. */
  zip<U>(other: Validation<U, E>): Validation<[T, U], E>;
  /** Accumulate errors from both sides. */
  ap<U>(fnValidation: Validation<(value: T) => U, E>): Validation<U, E>;
  /** Serialize as `{ tag: 'Invalid', errors: E[] }`. */
  toJSON(): { tag: "Invalid"; errors: readonly E[] };
  /** Human-readable string representation. */
  toString(): string;
}

/**
 * A discriminated union representing either a valid value (`Valid<T>`) or
 * accumulated errors (`Invalid<E>`).
 *
 * Unlike {@link Result} which short-circuits on the first error,
 * `Validation` collects all errors via `zip` and `ap`.
 *
 * @example
 * ```ts
 * const name = validateName(input);   // Validation<string, string>
 * const age  = validateAge(input);    // Validation<number, string>
 *
 * // Collects errors from BOTH validations:
 * const user = name.zip(age).map(([n, a]) => ({ name: n, age: a }));
 * ```
 */
export type Validation<T, E> = Valid<T, E> | Invalid<T, E>;

// ── Private implementation ───────────────────────────────────────────────────

interface ValidationMethods<T, E> {
  map<U>(fn: (value: T) => U): Validation<U, E>;
  mapErr<F>(fn: (error: E) => F): Validation<T, F>;
  flatMap<U>(fn: (value: T) => Validation<U, E>): Validation<U, E>;
  tap(fn: (value: T) => void): Validation<T, E>;
  tapErr(fn: (errors: readonly E[]) => void): Validation<T, E>;
  unwrap(): T;
  unwrapOr(fallback: T): T;
  unwrapOrElse(fn: (errors: readonly E[]) => T): T;
  unwrapErr(): never | readonly E[];
  match<U>(m: ValidationMatcher<T, E, U>): U;
  toOption(): Option<T>;
  toResult(): Result<T, readonly E[]>;
  zip<U>(other: Validation<U, E>): Validation<[T, U], E>;
  ap<U>(fnValidation: Validation<(value: T) => U, E>): Validation<U, E>;
  toJSON(): { tag: "Valid"; value: T } | { tag: "Invalid"; errors: readonly E[] };
  toString(): string;
}

class ValidImpl<T, E> implements Valid<T, E>, ValidationMethods<T, E> {
  readonly tag = "Valid" as const;
  constructor(readonly value: T) {}

  get isValid(): true {
    return true;
  }
  get isInvalid(): false {
    return false;
  }

  map<U>(fn: (value: T) => U): Validation<U, E> {
    return new ValidImpl(fn(this.value));
  }
  mapErr<F>(_fn: (error: E) => F): Validation<T, F> {
    return castValid(this);
  }
  flatMap<U>(fn: (value: T) => Validation<U, E>): Validation<U, E> {
    return fn(this.value);
  }
  tap(fn: (value: T) => void): Validation<T, E> {
    fn(this.value);
    return this;
  }
  tapErr(_fn: (errors: readonly E[]) => void): Validation<T, E> {
    return this;
  }
  unwrap(): T {
    return this.value;
  }
  unwrapOr(_fallback: T): T {
    return this.value;
  }
  unwrapOrElse(_fn: (errors: readonly E[]) => T): T {
    return this.value;
  }
  unwrapErr(): never {
    throw new TypeError(`unwrapErr called on Valid(${String(this.value)})`);
  }
  match<U>(m: ValidationMatcher<T, E, U>): U {
    return m.Valid(this.value);
  }
  toOption(): Option<T> {
    return Some(this.value);
  }
  toResult(): Result<T, readonly E[]> {
    return Ok(this.value);
  }
  zip<U>(other: Validation<U, E>): Validation<[T, U], E> {
    return other.isValid ? new ValidImpl([this.value, other.value]) : castInvalid(other);
  }
  ap<U>(fnValidation: Validation<(value: T) => U, E>): Validation<U, E> {
    return fnValidation.isValid
      ? new ValidImpl(fnValidation.value(this.value))
      : castInvalid(fnValidation);
  }
  toJSON(): { tag: "Valid"; value: T } {
    return { tag: "Valid", value: this.value };
  }
  toString(): string {
    return `Valid(${String(this.value)})`;
  }
}

class InvalidImpl<T, E> implements Invalid<T, E>, ValidationMethods<T, E> {
  readonly tag = "Invalid" as const;
  constructor(readonly errors: readonly E[]) {}

  get isValid(): false {
    return false;
  }
  get isInvalid(): true {
    return true;
  }

  map<U>(_fn: (value: T) => U): Validation<U, E> {
    return castInvalid(this);
  }
  mapErr<F>(fn: (error: E) => F): Validation<T, F> {
    return new InvalidImpl(this.errors.map(fn));
  }
  flatMap<U>(_fn: (value: T) => Validation<U, E>): Validation<U, E> {
    return castInvalid(this);
  }
  tap(_fn: (value: T) => void): Validation<T, E> {
    return this;
  }
  tapErr(fn: (errors: readonly E[]) => void): Validation<T, E> {
    fn(this.errors);
    return this;
  }
  unwrap(): never {
    throw new TypeError(`unwrap called on Invalid(${String(this.errors)})`);
  }
  unwrapOr(fallback: T): T {
    return fallback;
  }
  unwrapOrElse(fn: (errors: readonly E[]) => T): T {
    return fn(this.errors);
  }
  unwrapErr(): readonly E[] {
    return this.errors;
  }
  match<U>(m: ValidationMatcher<T, E, U>): U {
    return m.Invalid(this.errors);
  }
  toOption(): Option<T> {
    return None;
  }
  toResult(): Result<T, readonly E[]> {
    return Err(this.errors);
  }
  zip<U>(other: Validation<U, E>): Validation<[T, U], E> {
    return other.isInvalid ? new InvalidImpl([...this.errors, ...other.errors]) : castInvalid(this);
  }
  ap<U>(fnValidation: Validation<(value: T) => U, E>): Validation<U, E> {
    return fnValidation.isInvalid
      ? new InvalidImpl([...this.errors, ...fnValidation.errors])
      : castInvalid(this);
  }
  toJSON(): { tag: "Invalid"; errors: readonly E[] } {
    return { tag: "Invalid", errors: this.errors };
  }
  toString(): string {
    return `Invalid(${String(this.errors)})`;
  }
}

// ── Variance helpers ─────────────────────────────────────────────────────────
//
// Same rationale as Result's castOk/castErr.
// Valid carries no errors; Invalid carries no value.

/** Widen the value-type of an Invalid. */
const castInvalid = <T, E>(r: Invalid<T, E>): Validation<never, E> =>
  r as unknown as Validation<never, E>;

/** Widen the error-type of a Valid. */
const castValid = <T, E>(r: Valid<T, E>): Validation<T, never> =>
  r as unknown as Validation<T, never>;

/**
 * Create a successful {@link Validation} wrapping `value`.
 *
 * @example
 * ```ts
 * const v = Valid(42);   // Validation<number, never>
 * v.unwrap();            // 42
 * ```
 */
export const Valid = <T>(value: T): Validation<T, never> => new ValidImpl(value);

/**
 * Create a failed {@link Validation} with one or more errors.
 *
 * @example
 * ```ts
 * Invalid('required');              // Validation<never, string>
 * Invalid(['too short', 'no @']);   // Validation<never, string>
 * ```
 */
export const Invalid = <E>(errorOrErrors: E | readonly E[]): Validation<never, E> =>
  new InvalidImpl(Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors]);

/**
 * Collect an array of Validations into a single Validation of an array.
 *
 * Unlike {@link collectResults} which short-circuits, this accumulates
 * all errors from every Invalid in the array.
 *
 * @example
 * ```ts
 * Validation.collect([Valid(1), Valid(2)]).unwrap();     // [1, 2]
 * Validation.collect([Invalid('a'), Invalid('b')]);     // Invalid(['a', 'b'])
 * ```
 */
const collectValidations = <T, E>(
  validations: readonly Validation<T, E>[],
): Validation<readonly T[], E> => {
  const values: T[] = [];
  const errors: E[] = [];
  for (const v of validations) {
    if (v.isValid) {
      values.push(v.value);
    } else {
      errors.push(...v.errors);
    }
  }
  return errors.length > 0 ? new InvalidImpl(errors) : new ValidImpl(values);
};

/**
 * Map each element through a fallible function, accumulating all errors.
 *
 * @example
 * ```ts
 * Validation.traverse([1, -2, 3], n =>
 *   n > 0 ? Valid(n) : Invalid(`${n} is negative`)
 * );
 * // Invalid(['-2 is negative'])
 * ```
 */
const traverseValidations = <A, T, E>(
  items: readonly A[],
  fn: (item: A) => Validation<T, E>,
): Validation<readonly T[], E> => {
  const values: T[] = [];
  const errors: E[] = [];
  for (const item of items) {
    const v = fn(item);
    if (v.isValid) {
      values.push(v.value);
    } else {
      errors.push(...v.errors);
    }
  }
  return errors.length > 0 ? new InvalidImpl(errors) : new ValidImpl(values);
};

/**
 * Create a Validation from a predicate.
 *
 * @example
 * ```ts
 * Validation.fromPredicate(5, n => n > 0, 'must be positive');
 * // Valid(5)
 * ```
 */
const fromPredicate = <T, E>(value: T, predicate: (v: T) => boolean, error: E): Validation<T, E> =>
  predicate(value) ? new ValidImpl(value) : new InvalidImpl([error]);

/**
 * Convert a Result to a Validation.
 *
 * Ok becomes Valid, Err becomes Invalid with a single error.
 */
const fromResult = <T, E>(result: Result<T, E>): Validation<T, E> =>
  result.isOk ? new ValidImpl(result.value) : new InvalidImpl([result.error]);

/** Validation namespace with constructors and collection utilities. */
export const Validation: {
  /** Wrap a value in Valid. */
  readonly Valid: <T>(value: T) => Validation<T, never>;
  /** Wrap one or more errors in Invalid. */
  readonly Invalid: <E>(errorOrErrors: E | readonly E[]) => Validation<never, E>;
  /** Collect Validations, accumulating all errors. */
  readonly collect: <T, E>(validations: readonly Validation<T, E>[]) => Validation<readonly T[], E>;
  /** Map each item through a fallible function, accumulating errors. */
  readonly traverse: <A, T, E>(
    items: readonly A[],
    fn: (item: A) => Validation<T, E>,
  ) => Validation<readonly T[], E>;
  /** Create a Validation from a predicate. */
  readonly fromPredicate: <T, E>(
    value: T,
    predicate: (v: T) => boolean,
    error: E,
  ) => Validation<T, E>;
  /** Convert a Result to a Validation (Err becomes single-error Invalid). */
  readonly fromResult: <T, E>(result: Result<T, E>) => Validation<T, E>;
  /** Pattern match on a Validation value. */
  readonly match: <T, E, U>(validation: Validation<T, E>, matcher: ValidationMatcher<T, E, U>) => U;
  /** Type guard for Validation values. */
  readonly is: (value: unknown) => value is Validation<unknown, unknown>;
} = {
  Valid,
  Invalid,
  collect: collectValidations,
  traverse: traverseValidations,
  fromPredicate,
  fromResult,
  match: <T, E, U>(validation: Validation<T, E>, matcher: ValidationMatcher<T, E, U>): U =>
    validation.match(matcher),
  is: (value): value is Validation<unknown, unknown> =>
    value instanceof ValidImpl || value instanceof InvalidImpl,
};

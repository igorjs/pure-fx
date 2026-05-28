// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module data/immutable
 *
 * The shared protocol for pure-fx immutable value types: a Symbol brand plus a
 * minimal contract. Every value is runtime-frozen; the only way to derive a
 * changed value is `produce`/functional methods returning a new frozen value.
 */

/** Global-registry brand — survives bundler/module duplication and realms. */
export const IMMUTABLE: unique symbol = Symbol.for("@igorjs/pure-fx/immutable");

/** Any frozen pure-fx value; `TMut` is its natural mutable JS form. */
export interface Immutable<TMut> {
  readonly [IMMUTABLE]: true;
  /** Structural equality; non-immutable / different-kind operands return false. */
  equals(other: unknown): boolean;
  toJSON(): unknown;
  /** A fresh, deeply-mutable copy. Mutating it never affects this value. */
  toMutable(): TMut;
}

/** A structural {@link Immutable} supporting copy-on-write edits via a revocable draft. */
export interface Producible<TMut> extends Immutable<TMut> {
  /**
   * Apply `recipe` to a mutable draft and return a new frozen value. The draft
   * is valid ONLY during the recipe: it is revoked when `recipe` returns, so a
   * leaked draft throws on any later use.
   */
  produce(recipe: (draft: TMut) => void): this;
}

const isImmutableValue = (v: unknown): v is Immutable<unknown> =>
  v !== null && typeof v === "object" && (v as Record<symbol, unknown>)[IMMUTABLE] === true;

/**
 * Helper namespace for the immutable protocol. Merges with the {@link Immutable}
 * interface via TypeScript declaration merging, so `Immutable` is usable as both
 * a type and a value.
 */
export const Immutable = {
  /** Type guard for any value implementing the protocol. */
  is: isImmutableValue,
  /** Brand-aware equality: delegates to `.equals` for immutables, else `Object.is`. */
  equals: (a: unknown, b: unknown): boolean =>
    isImmutableValue(a) ? a.equals(b) : Object.is(a, b),
  /** Functional `produce` wrapper. */
  produce: <T>(v: Producible<T>, recipe: (draft: T) => void): Producible<T> => v.produce(recipe),
};

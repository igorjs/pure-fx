/**
 * @module lens
 *
 * Composable optics for reading and updating nested immutable data.
 *
 * **Why Lens instead of direct .set()/.update()?**
 * Record's `.set()` and `.update()` work for one level. For deeply nested
 * structures, you need to chain multiple updates. Lenses compose: build
 * a lens for each nesting level, compose them, and apply the composed lens
 * to read or update any depth in one pass. The curried API integrates
 * naturally with `pipe` and `flow`.
 *
 * **Lens vs Optional:**
 * A Lens always succeeds (the target exists). An Optional may miss
 * (returns Option). Use Lens for required fields, Optional for nullable
 * fields and array indices.
 */

import type { Option } from "./option.js";
import { None, Some } from "./option.js";

// ── Lens ────────────────────────────────────────────────────────────────────

/**
 * A total optic: the target always exists in the source.
 *
 * @example
 * ```ts
 * const name = Lens.prop<User>()('name');
 * name.get(user);              // 'Alice'
 * name.set('Bob')(user);       // { ...user, name: 'Bob' }
 * name.modify(s => s.toUpperCase())(user);
 * ```
 */
export interface Lens<S, A> {
  readonly get: (source: S) => A;
  readonly set: (value: A) => (source: S) => S;
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly compose: <B>(other: Lens<A, B>) => Lens<S, B>;
  readonly composeOptional: <B>(other: LensOptional<A, B>) => LensOptional<S, B>;
}

/**
 * A partial optic: the target may not exist in the source.
 *
 * @example
 * ```ts
 * const at1 = LensOptional.index<number>(1);
 * at1.getOption([10, 20, 30]); // Some(20)
 * at1.getOption([10]);         // None
 * ```
 */
export interface LensOptional<S, A> {
  readonly getOption: (source: S) => Option<A>;
  readonly set: (value: A) => (source: S) => S;
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly compose: <B>(other: LensOptional<A, B>) => LensOptional<S, B>;
}

// ── Lens implementation ─────────────────────────────────────────────────────

const createLens = <S, A>(get: (s: S) => A, set: (a: A, s: S) => S): Lens<S, A> => {
  const lens: Lens<S, A> = Object.freeze({
    get,
    set: (value: A) => (source: S) => set(value, source),
    modify: (fn: (a: A) => A) => (source: S) => set(fn(get(source)), source),
    compose: <B>(other: Lens<A, B>): Lens<S, B> =>
      createLens(
        (s: S) => other.get(get(s)),
        (b: B, s: S) => set(other.set(b)(get(s)), s),
      ),
    composeOptional: <B>(other: LensOptional<A, B>): LensOptional<S, B> =>
      createOptional(
        (s: S) => other.getOption(get(s)),
        (b: B, s: S) => set(other.set(b)(get(s)), s),
      ),
  });
  return lens;
};

// ── Optional implementation ─────────────────────────────────────────────────

const createOptional = <S, A>(
  getOption: (s: S) => Option<A>,
  set: (a: A, s: S) => S,
): LensOptional<S, A> => {
  const optional: LensOptional<S, A> = Object.freeze({
    getOption,
    set: (value: A) => (source: S) => set(value, source),
    modify: (fn: (a: A) => A) => (source: S) => {
      const current = getOption(source);
      return current.isSome ? set(fn(current.value), source) : source;
    },
    compose: <B>(other: LensOptional<A, B>): LensOptional<S, B> =>
      createOptional(
        (s: S) => {
          const a = getOption(s);
          return a.isSome ? other.getOption(a.value) : None;
        },
        (b: B, s: S) => {
          const a = getOption(s);
          return a.isSome ? set(other.set(b)(a.value), s) : s;
        },
      ),
  });
  return optional;
};

// ── Public Lens namespace ───────────────────────────────────────────────────

/**
 * Create composable lenses for immutable data access and updates.
 *
 * @example
 * ```ts
 * // Single property lens
 * const name = Lens.prop<User>()('name');
 *
 * // Composed deep lens
 * const street = Lens.prop<User>()('address')
 *   .compose(Lens.prop<Address>()('street'));
 *
 * // With pipe
 * pipe(user, street.modify(s => s.toUpperCase()));
 *
 * // Custom lens
 * const myLens = Lens.from(getter, setter);
 * ```
 */
export const Lens: {
  readonly prop: <S>() => <K extends keyof S>(key: K) => Lens<S, S[K]>;
  readonly from: <S, A>(get: (s: S) => A, set: (a: A, s: S) => S) => Lens<S, A>;
  readonly id: <S>() => Lens<S, S>;
} = {
  prop:
    <S>() =>
    <K extends keyof S>(key: K): Lens<S, S[K]> =>
      createLens(
        (s: S) => s[key],
        (a: S[K], s: S) => ({ ...s, [key]: a }) as S,
      ),

  from: <S, A>(get: (s: S) => A, set: (a: A, s: S) => S): Lens<S, A> => createLens(get, set),

  id: <S>(): Lens<S, S> =>
    createLens(
      (s: S) => s,
      (a: S) => a,
    ),
};

// ── Public Optional namespace ───────────────────────────────────────────────

/**
 * Create composable optionals for partial data access.
 *
 * @example
 * ```ts
 * // Array index access
 * const second = LensOptional.index<number>(1);
 * second.getOption([10, 20]); // Some(20)
 * second.getOption([10]);     // None
 *
 * // Nullable field
 * const bio = LensOptional.fromNullable<User>()('bio');
 * bio.getOption(user); // Some('...') or None
 * ```
 */
export const LensOptional: {
  readonly index: <T>(i: number) => LensOptional<readonly T[], T>;
  readonly fromNullable: <S>() => <K extends keyof S>(key: K) => LensOptional<S, NonNullable<S[K]>>;
  readonly from: <S, A>(
    getOption: (s: S) => Option<A>,
    set: (a: A, s: S) => S,
  ) => LensOptional<S, A>;
} = {
  index: <T>(i: number): LensOptional<readonly T[], T> =>
    createOptional(
      (arr: readonly T[]) => {
        const n = i < 0 ? arr.length + i : i;
        return n >= 0 && n < arr.length ? Some(arr[n] as T) : None;
      },
      (value: T, arr: readonly T[]) => {
        const n = i < 0 ? arr.length + i : i;
        if (n < 0 || n >= arr.length) return arr;
        const copy = arr.slice() as T[];
        copy[n] = value;
        return copy;
      },
    ),

  fromNullable:
    <S>() =>
    <K extends keyof S>(key: K): LensOptional<S, NonNullable<S[K]>> =>
      createOptional(
        (s: S) => {
          const v = s[key];
          return v === null || v === undefined ? None : Some(v as NonNullable<S[K]>);
        },
        (a: NonNullable<S[K]>, s: S) => ({ ...s, [key]: a }) as S,
      ),

  from: <S, A>(getOption: (s: S) => Option<A>, set: (a: A, s: S) => S): LensOptional<S, A> =>
    createOptional(getOption, set),
};

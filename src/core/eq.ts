/**
 * @module eq
 *
 * Composable equality typeclasses for structural comparison.
 *
 * **Why Eq instead of raw `===`?**
 * Primitive equality (`===`) works for strings and numbers but fails for
 * objects, dates, and domain types. `Eq<T>` abstracts comparison into a
 * composable unit: combine field-level Eq instances with `Eq.struct`,
 * derive Eq for new types with `Eq.contramap`, and pass Eq instances to
 * generic algorithms like deduplication and grouping.
 *
 * **How composition works:**
 * `Eq.contramap` lifts an existing Eq through a projection function.
 * `Eq.struct` combines per-field Eq instances into an Eq for the whole object.
 * Both return frozen instances so equality definitions are immutable.
 */

/**
 * Equality comparison for values of type T.
 *
 * @example
 * ```ts
 * const eqUser = Eq.struct({ id: Eq.number, name: Eq.string });
 * eqUser.equals({ id: 1, name: 'A' }, { id: 1, name: 'A' }); // true
 * ```
 */
export interface Eq<T> {
  readonly equals: (a: T, b: T) => boolean;
}

// ── Internal factories ──────────────────────────────────────────────────────

const fromEquals = <T>(equals: (a: T, b: T) => boolean): Eq<T> => Object.freeze({ equals });

// ── Built-in instances ──────────────────────────────────────────────────────

const stringEq: Eq<string> = fromEquals((a, b) => a === b);
const numberEq: Eq<number> = fromEquals((a, b) => a === b);
const booleanEq: Eq<boolean> = fromEquals((a, b) => a === b);
const dateEq: Eq<Date> = fromEquals((a, b) => a.getTime() === b.getTime());

// ── Combinators ─────────────────────────────────────────────────────────────

const structEq = <T extends Record<string, unknown>>(
  eqs: { readonly [K in keyof T]: Eq<T[K]> },
): Eq<T> => {
  const keys = Object.keys(eqs);
  return fromEquals((a, b) => {
    for (const key of keys) {
      // Safe: key comes from Object.keys(eqs) so it exists in a and b
      const eq = (eqs as Record<string, Eq<unknown>>)[key]!;
      if (!eq.equals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  });
};

const contramapEq = <A, B>(eq: Eq<A>, f: (b: B) => A): Eq<B> =>
  fromEquals((a, b) => eq.equals(f(a), f(b)));

// ── Public namespace (const/type merge) ─────────────────────────────────────

/**
 * Create and compose equality comparisons.
 *
 * Callable as a factory (`Eq(fn)`) and as a namespace for built-in
 * instances and combinators.
 *
 * @example
 * ```ts
 * Eq.string.equals('a', 'a');  // true
 *
 * const byAge = Eq.contramap(Eq.number, (u: User) => u.age);
 *
 * const eqUser = Eq.struct({ id: Eq.number, name: Eq.string });
 * ```
 */
export const Eq: {
  <T>(equals: (a: T, b: T) => boolean): Eq<T>;
  readonly fromEquals: <T>(equals: (a: T, b: T) => boolean) => Eq<T>;
  readonly string: Eq<string>;
  readonly number: Eq<number>;
  readonly boolean: Eq<boolean>;
  readonly date: Eq<Date>;
  readonly struct: <T extends Record<string, unknown>>(
    eqs: { readonly [K in keyof T]: Eq<T[K]> },
  ) => Eq<T>;
  readonly contramap: <A, B>(eq: Eq<A>, f: (b: B) => A) => Eq<B>;
} = Object.assign(<T>(equals: (a: T, b: T) => boolean): Eq<T> => fromEquals(equals), {
  fromEquals,
  string: stringEq,
  number: numberEq,
  boolean: booleanEq,
  date: dateEq,
  struct: structEq,
  contramap: contramapEq,
});

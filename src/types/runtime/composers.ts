// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module types/runtime/composers
 *
 * Generic composers that build a new {@link TypeDef} from one or more inner
 * TypeDefs. Each composer:
 *
 * 1. Composes the underlying `Schema.*` primitives.
 * 2. Deep-freezes the parsed output so consumers cannot mutate it.
 * 3. Generates a structural tag like `` `Vec<Email>` `` for error messages.
 *
 * Composer instances are cached per inner TypeDef (keyed by reference) so
 * `Vec(Email) === Vec(Email)` holds within a process. This avoids redundant
 * prototype creation and makes identity-based tests easier.
 */

import type { Option } from "../../core/option.js";
import { None, Some } from "../../core/option.js";
import { List, Record } from "../../data/constructors.js";
import { HashMap, type ImmutableHashMap } from "../../data/hash-map.js";
import { deepFreezeRaw } from "../../data/internals.js";
import type { ImmutableList } from "../../data/list.js";
import type { ImmutableRecord } from "../../data/record.js";
import { Schema, type SchemaError, type SchemaType } from "../../data/schema.js";
import type { Type } from "../nominal.js";
import { TypeDef, type TypeDefStatic } from "../type-def.js";

// ── Cache helpers ─────────────────────────────────────────────────────────────

// Why: composers are referentially transparent — same inner(s) produce the
// same class. Each composer owns its own cache (sharing across composers would
// cause Vec(Int) and Maybe(Int) to collide on the same key).

const makeMemo1 = <V>() => {
  const cache = new WeakMap<object, V>();
  return (key: object, build: () => V): V => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = build();
    cache.set(key, value);
    return value;
  };
};

const makeMemo2 = <V>() => {
  const cache = new WeakMap<object, WeakMap<object, V>>();
  return (a: object, b: object, build: () => V): V => {
    let inner = cache.get(a);
    if (!inner) {
      inner = new WeakMap<object, V>();
      cache.set(a, inner);
    }
    const hit = inner.get(b);
    if (hit !== undefined) return hit;
    const value = build();
    inner.set(b, value);
    return value;
  };
};

const vecMemo = makeMemo1<unknown>();
const pairMemo = makeMemo2<unknown>();
const dictMemo = makeMemo2<unknown>();
const maybeMemo = makeMemo1<unknown>();
const eitherMemo = makeMemo2<unknown>();
const listOfMemo = makeMemo1<unknown>();
const mapOfMemo = makeMemo2<unknown>();

// Why: TypeDef.parse runs schema.parse(input), which (for composers) returns
// arrays/objects we want to freeze before handing back to the caller. The
// schema's .transform() hook lets us deep-freeze after a successful parse.
const deepFreezeT = <T>(value: T): T => {
  if (value !== null && typeof value === "object") deepFreezeRaw(value);
  return value;
};

// ── Vec(T) ────────────────────────────────────────────────────────────────────

/**
 * Build a {@link TypeDef} class that validates a homogeneous array, returning a
 * deep-frozen `readonly T[]` snapshot.
 *
 * Pushing, splicing, or mutating elements raises a `TypeError`. Element brand
 * survives: indexing into a parsed `Vec(Email)` yields `Type<'Email', string>`.
 * For a pure-fx {@link ImmutableList} with a functional API + copy-on-write
 * `produce`, use {@link ListOf} instead.
 *
 * @example
 * ```ts
 * class UserIds extends Vec(UserId) {}
 * const r = UserIds.parse(['u_001', 'u_002']);
 * if (r.isOk) {
 *   r.value[0]              // Type<'UserId', string>
 *   r.value.push('u_003');  // throws (frozen)
 * }
 * ```
 *
 * @param inner The TypeDef class for the element type.
 */
export const Vec = <Tag extends string, T>(inner: TypeDefStatic<Tag, T>) =>
  vecMemo(inner as unknown as object, () =>
    TypeDef(
      `Vec<${inner.tag}>` as const,
      // Why: Schema.array yields readonly T[] structurally; the brand is a
      // phantom only, so the runtime value is a deep-frozen array snapshot.
      Schema.array(inner.schema).transform(arr => deepFreezeT(arr as readonly Type<Tag, T>[])),
    ),
  ) as ReturnType<typeof TypeDef<`Vec<${Tag}>`, readonly Type<Tag, T>[]>>;

// ── Pair(A, B) ────────────────────────────────────────────────────────────────

/**
 * Build a {@link TypeDef} class that validates a 2-tuple `[A, B]`.
 *
 * Equivalent to `Tuple(a, b)` but reads better at call sites:
 * `Pair(Latitude, Longitude)` versus `Tuple(Latitude, Longitude)`.
 *
 * @example
 * ```ts
 * class GeoPoint extends Pair(Latitude, Longitude) {}
 * GeoPoint.parse([51.5, -0.1]);  // Ok([Latitude, Longitude])
 * ```
 */
export const Pair = <ATag extends string, A, BTag extends string, B>(
  a: TypeDefStatic<ATag, A>,
  b: TypeDefStatic<BTag, B>,
) =>
  pairMemo(a as unknown as object, b as unknown as object, () =>
    TypeDef(
      `Pair<${a.tag},${b.tag}>` as const,
      Schema.tuple(a.schema, b.schema).transform(t => {
        const out = t as readonly [Type<ATag, A>, Type<BTag, B>];
        return deepFreezeT(out);
      }),
    ),
  ) as ReturnType<typeof TypeDef<`Pair<${ATag},${BTag}>`, readonly [Type<ATag, A>, Type<BTag, B>]>>;

// ── Tuple(...) ────────────────────────────────────────────────────────────────

/**
 * Build a {@link TypeDef} class that validates a fixed-length n-tuple where
 * each position has its own TypeDef.
 *
 * Tuples are NOT cached (the rest-args input space is unbounded). If you need
 * a stable identity, hold the returned class in a const.
 *
 * @example
 * ```ts
 * class Row extends Tuple(Str, Int, Bool) {}
 * Row.parse(['a', 1, true]);
 * ```
 */
export const Tuple = <Items extends readonly TypeDefStatic<string, unknown>[]>(...items: Items) => {
  const schemas = items.map(i => i.schema);
  const tag = `Tuple<${items.map(i => i.tag).join(",")}>`;
  type Brands = {
    readonly [K in keyof Items]: Items[K] extends TypeDefStatic<infer Tag, infer T>
      ? Type<Tag & string, T>
      : never;
  };
  // Why: Schema.tuple expects a spread of schemas. The runtime brand on each
  // element is structurally the underlying value, so we transform-cast.
  const schema = Schema.tuple(...(schemas as unknown as readonly SchemaType<unknown>[])).transform(
    t => deepFreezeT(t as unknown as Brands),
  );
  return TypeDef(tag, schema);
};

// ── Dict(K, V) ────────────────────────────────────────────────────────────────

/**
 * Build a {@link TypeDef} class that validates a string-keyed object record.
 *
 * The key TypeDef must be backed by a string-based schema (the JS runtime
 * coerces all object keys to strings); the value TypeDef validates each
 * value. Keys are NOT validated against the key TypeDef's schema in v0; the
 * key brand is phantom-only.
 *
 * @example
 * ```ts
 * class Headers extends Dict(Str, Str) {}
 * const r = Headers.parse({ 'content-type': 'application/json' });
 * if (r.isOk) r.value['content-type']; // Type<'Str', string>
 * ```
 *
 * For a pure-fx {@link ImmutableHashMap} (functional API + `produce`), use
 * {@link MapOf} instead.
 */
export const Dict = <KTag extends string, K extends string, VTag extends string, V>(
  key: TypeDefStatic<KTag, K>,
  value: TypeDefStatic<VTag, V>,
) =>
  dictMemo(key as unknown as object, value as unknown as object, () =>
    TypeDef(
      `Dict<${key.tag},${value.tag}>` as const,
      // Why: Schema.record yields a plain record structurally; deep-freeze it
      // into a snapshot. Keys are string-coerced; the key brand is phantom-only.
      Schema.record(value.schema).transform(obj =>
        deepFreezeT(obj as Readonly<Record<Type<KTag, K> & string, Type<VTag, V>>>),
      ),
    ),
  ) as ReturnType<
    typeof TypeDef<`Dict<${KTag},${VTag}>`, Readonly<Record<Type<KTag, K> & string, Type<VTag, V>>>>
  >;

// ── ListOf(T) ───────────────────────────────────────────────────────────────

/**
 * Like {@link Vec}, but returns a pure-fx {@link ImmutableList} (functional API
 * + copy-on-write `produce`) instead of a frozen array.
 *
 * @example
 * ```ts
 * class UserIds extends ListOf(UserId) {}
 * const r = UserIds.parse(['u_001']);
 * if (r.isOk) r.value.append('u_002'); // new ImmutableList
 * ```
 */
export const ListOf = <Tag extends string, T>(inner: TypeDefStatic<Tag, T>) =>
  listOfMemo(inner as unknown as object, () =>
    TypeDef(
      `ListOf<${inner.tag}>` as const,
      Schema.array(inner.schema).transform(arr => List(arr as readonly Type<Tag, T>[])),
    ),
  ) as ReturnType<typeof TypeDef<`ListOf<${Tag}>`, ImmutableList<Type<Tag, T>>>>;

// ── MapOf(K, V) ───────────────────────────────────────────────────────────────

/**
 * Like {@link Dict}, but returns a pure-fx {@link ImmutableHashMap} (functional
 * API + copy-on-write `produce`) instead of a frozen object.
 *
 * @example
 * ```ts
 * class Headers extends MapOf(Str, Str) {}
 * const r = Headers.parse({ 'content-type': 'application/json' });
 * if (r.isOk) r.value.get('content-type'); // Option<Type<'Str', string>>
 * ```
 */
export const MapOf = <KTag extends string, K extends string, VTag extends string, V>(
  key: TypeDefStatic<KTag, K>,
  value: TypeDefStatic<VTag, V>,
) =>
  mapOfMemo(key as unknown as object, value as unknown as object, () =>
    TypeDef(
      `MapOf<${key.tag},${value.tag}>` as const,
      Schema.record(value.schema).transform(obj =>
        HashMap.fromObject(obj as Readonly<Record<string, Type<VTag, V>>>),
      ),
    ),
  ) as ReturnType<
    typeof TypeDef<
      `MapOf<${KTag},${VTag}>`,
      ImmutableHashMap<Type<KTag, K> & string, Type<VTag, V>>
    >
  >;

// ── Maybe(T) ──────────────────────────────────────────────────────────────────

/**
 * Build a {@link TypeDef} class that validates the JSON shape of an
 * {@link Option} and returns a proper `Option<T>` value.
 *
 * Accepted input shapes:
 * - `{ tag: 'Some', value: T }` → `Some(T)`
 * - `{ tag: 'None' }` → `None`
 * - `null` → `None`
 * - `undefined` → `None`
 *
 * @example
 * ```ts
 * class OptionalEmail extends Maybe(Email) {}
 * OptionalEmail.parse({ tag: 'Some', value: 'a@b.com' }); // Ok(Some(...))
 * OptionalEmail.parse(null);                              // Ok(None)
 * ```
 */
export const Maybe = <Tag extends string, T>(inner: TypeDefStatic<Tag, T>) =>
  maybeMemo(inner as unknown as object, () => {
    // Why: build a Schema.union over four input shapes and have each branch
    // transform to the same Option<T> output type. This avoids needing a
    // custom parse function (which the public Schema API does not expose).
    const someBranch = Schema.object({
      tag: Schema.literal("Some"),
      value: inner.schema,
    }).transform(v => Some(v.value as Type<Tag, T>) as Option<Type<Tag, T>>);
    const noneBranch = Schema.object({ tag: Schema.literal("None") }).transform(
      _ => None as Option<Type<Tag, T>>,
    );
    const nullBranch = Schema.guard((v): v is null => v === null, "null").transform(
      _ => None as Option<Type<Tag, T>>,
    );
    const undefinedBranch = Schema.guard(
      (v): v is undefined => v === undefined,
      "undefined",
    ).transform(_ => None as Option<Type<Tag, T>>);
    const schema: SchemaType<Option<Type<Tag, T>>> = Schema.union(
      someBranch,
      noneBranch,
      nullBranch,
      undefinedBranch,
    );
    return TypeDef(`Maybe<${inner.tag}>` as const, schema);
  }) as ReturnType<typeof TypeDef<`Maybe<${Tag}>`, Option<Type<Tag, T>>>>;

// ── Either(L, R) ──────────────────────────────────────────────────────────────

/**
 * Result of an {@link Either} parse: a tagged sum type carrying either a
 * `Left(L)` or a `Right(R)` value.
 */
export type EitherValue<L, R> =
  | { readonly tag: "Left"; readonly value: L }
  | { readonly tag: "Right"; readonly value: R };

/**
 * Build a {@link TypeDef} class that validates a tagged sum type.
 *
 * Unlike {@link Maybe}, `Either` has no success/failure bias: `Left` and
 * `Right` are equally valid outcomes. Use it for JSON-encoded sum types
 * where both branches carry data.
 *
 * Accepted input shapes:
 * - `{ tag: 'Left', value: L }` → `{ tag: 'Left', value: L }`
 * - `{ tag: 'Right', value: R }` → `{ tag: 'Right', value: R }`
 *
 * @example
 * ```ts
 * class Outcome extends Either(NetError, Response) {}
 * Outcome.parse({ tag: 'Right', value: { ... } });
 * ```
 */
export const Either = <LTag extends string, L, RTag extends string, R>(
  left: TypeDefStatic<LTag, L>,
  right: TypeDefStatic<RTag, R>,
) =>
  eitherMemo(left as unknown as object, right as unknown as object, () => {
    const leftShape = Schema.object({
      tag: Schema.literal("Left" as const),
      value: left.schema,
    });
    const rightShape = Schema.object({
      tag: Schema.literal("Right" as const),
      value: right.schema,
    });
    const schema = Schema.union(leftShape, rightShape).transform(v => {
      const out = v as EitherValue<Type<LTag, L>, Type<RTag, R>>;
      return deepFreezeT(out);
    });
    return TypeDef(`Either<${left.tag},${right.tag}>` as const, schema);
  }) as ReturnType<
    typeof TypeDef<`Either<${LTag},${RTag}>`, EitherValue<Type<LTag, L>, Type<RTag, R>>>
  >;

// ── Struct({...}) ───────────────────────────────────────────────────────────

/** Field map accepted by {@link Struct}: each value is a TypeDef class. */
type StructFields = Readonly<Record<string, TypeDefStatic<string, unknown>>>;

/** The branded {@link ImmutableRecord} value produced by parsing a {@link Struct}. */
type StructValue<F extends StructFields> = ImmutableRecord<{
  [K in keyof F]: TypeDef.Infer<F[K]>;
}>;

/**
 * Build a {@link TypeDef} class that validates a heterogeneous object where each
 * field has its own TypeDef, returning an immutable {@link ImmutableRecord}.
 *
 * Unlike {@link Dict} (homogeneous, string-keyed), `Struct` validates a fixed
 * set of named fields, each with its own type. Not memoized (the field-map
 * input space is unbounded, like {@link Tuple}); hold the returned class in a
 * `const`/`class`.
 *
 * @example
 * ```ts
 * class User extends Struct({ id: UserId, email: Email }) {}
 * const r = User.parse({ id: 'u_1', email: 'a@b.com' });
 * if (r.isOk) r.value.id; // Type<'UserId', string>
 * ```
 */
export const Struct = <F extends StructFields>(fields: F) => {
  const shape: Record<string, SchemaType<unknown>> = {};
  const keys = Object.keys(fields);
  for (const [key, def] of Object.entries(fields)) shape[key] = def.schema;
  const tag = `Struct<${keys.join(",")}>`;
  // Why: Schema.object validates each field; Record() wraps the validated plain
  // object in an ImmutableRecord. The per-field brands are phantom, so the
  // runtime value is the validated object.
  const schema = Schema.object(shape).transform(
    obj => Record(obj as object) as StructValue<F>,
  ) as SchemaType<StructValue<F>>;
  return TypeDef(tag, schema);
};

// Why: re-export SchemaError so consumers don't need to import it from data/
// when working purely with TypeDef classes built from composers.
export type { SchemaError };

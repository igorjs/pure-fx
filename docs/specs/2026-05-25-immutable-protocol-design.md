# pure-fx — `Immutable` protocol for value types (design)

**Status:** approved (brainstorm) · **Date:** 2026-05-25
**Scope:** v0.3 — implemented together with finishing the v0.2 runtime types
(`Vec`/`Dict`→frozen snapshots + `ListOf`/`MapOf` opt-in collections).
**Location:** `docs/specs/` (kept out of the published `files`/jsr `include`).

## Context

pure-fx's immutable value types evolved independently and expose inconsistent
contracts:

| Type | brand | `equals` | `toJSON` | `toMutable` | controlled mutation |
|---|:--:|:--:|:--:|:--:|---|
| `ImmutableRecord<T>` | `$immutable` | ✓ | ✓ | ✓ | `set`/`update`/`produce`/`merge` |
| `ImmutableList<T>` | `$immutable` | ✓ | ✓ | ✓ | `append`/`map`/`filter`/`flatMap` |
| `ImmutableHashMap<K,V>` | **none** | ✓ | ✓ | **none** | `set`/`merge`/`map`/`filter` |
| `NonEmptyList<T>` | `$immutable` | ✓ | ✓ | ✓ | `map`/`append`/`flatMap` |
| `DateTimeValue` | **none** | ✓ | **none** | **none** | none (no modifiers) |

Only `Record` has `produce`; `HashMap` lacks the brand *and* `toMutable`;
`DateTimeValue` can't be modified. The `$immutable` marker is a plain string,
and because `ImmutableList` is a Proxy that exposes it only through the `get`
trap, `"$immutable" in list` is `false` — a real `isImmutable` bug.

This spec unifies these under one **protocol** (shared interface + `Symbol`
brand) with **copy-on-write** semantics: every value is runtime-frozen, and the
only way to derive a changed value is `produce`/functional methods returning a
new frozen value. No mutable/builder types.

## Goals / Non-goals

**Goals**
- One `Symbol`-branded protocol implemented by all in-scope value types.
- Layered: `Immutable<TMut>` (universal) + `Producible<TMut>` (structural).
- `isImmutable`/`isWrappable` key off the brand (ends the `"$immutable" in` bug class).
- Bring `HashMap`/`DateTimeValue` to the full contract; add `DateTimeValue` modifiers.
- `produce` drafts are **scope-bound and revoked** after the recipe (borrow-safety).

**Non-goals**
- No mutable/builder types (copy-on-write only).
- No compile-time "draft brand" — the draft (mutable representation) is already a
  distinct type from the frozen wrapper, so a phantom brand adds no value here.
- No general borrow checker — TS lacks linear types/lifetimes, and JS is
  single-threaded so the data-race payoff doesn't apply.
- `StableVec` stays mutable (excluded); core sum types (`Option`/`Result`/
  `Validation`/`ADT`/`Duration`) keep their own protocols.
- No change to `Vec`/`Dict` semantics (frozen native snapshots).

## Design

### 1. Brand + interfaces (`src/data/immutable.ts`, new)

```ts
/** Global-registry symbol: survives bundler/module duplication and realms. */
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

/** A structural Immutable supporting copy-on-write edits. */
export interface Producible<TMut> extends Immutable<TMut> {
  /**
   * Apply `recipe` to a mutable draft and return a new frozen value. The draft
   * is valid ONLY during the recipe: it is revoked when `recipe` returns, so a
   * leaked draft throws on any later use (see §5).
   */
  produce(recipe: (draft: TMut) => void): this;
}
```

The symbol is non-enumerable — never appears in `toJSON`, `Object.keys`, or spreads.

### 2. The `$immutable` string marker is removed

All types drop `$immutable: true` and define a non-enumerable `[IMMUTABLE]: true`.
**Breaking** for code reading `.$immutable` (acceptable pre-1.0).

### 3. Per-type mapping

| Type | implements | `toMutable()` | `produce` draft |
|---|---|---|---|
| `ImmutableRecord<T>` | `Producible<T>` | plain object `T` | object (today's structural-sharing proxy draft, now revocable) |
| `ImmutableList<T>` | `Producible<T[]>` | `T[]` | mutable array → `createListProxy` |
| `ImmutableHashMap<K,V>` | `Producible<Map<K,V>>` | `Map<K,V>` | mutable `Map` → `HashMap.fromMap` |
| `NonEmptyList<T>` | `Producible<T[]>` | `T[]` | mutable array; **throws if recipe leaves it empty** |
| `DateTimeValue` | `Immutable<Date>` | fresh `Date` | — (scalar; see §4) |

New members: `HashMap` gains `[IMMUTABLE]`, `toMutable()`, `produce()`;
`List`/`NonEmptyList` gain `produce()`; `DateTimeValue` gains `[IMMUTABLE]`,
`toJSON()`, `toMutable()` + modifiers (§4). `equals(other)` widens to `unknown`.

### 4. `DateTimeValue` — full copy-on-write value

- Implements `Immutable<Date>`: `[IMMUTABLE]`, `equals`, `toJSON()` (ISO string),
  `toMutable(): Date` (a **fresh** `Date` each call — mutating it never affects the value).
- Immutable modifiers, each returning a **new** `DateTimeValue`:
  - `plus(d: Duration): DateTimeValue`
  - `minus(d: Duration): DateTimeValue`
  - `withEpochMillis(ms: number): DateTimeValue`
  - `withEpochNanos(ns: bigint): DateTimeValue`
- Reuses `Duration` (ms) for arithmetic; nanosecond precision preserved (ms→ns).

### 5. Revocable scoped drafts (borrow-safety)

`produce` builds the draft with `Proxy.revocable` (or, for `Record`, revokes its
existing draft proxy). When the recipe returns, the draft is **revoked**; any
subsequent access throws `TypeError: draft used after produce() returned`. This
gives the draft a scope-bounded lifetime — the one borrow-checker-style
guarantee that's both achievable in JS and genuinely useful (prevents the
leaked-draft footgun that types cannot catch). `Record`'s simple-value drafts
already finalize after the recipe; this formalizes and enforces it for all
`Producible` types.

### 6. `isImmutable` / `isWrappable` (`internals.ts`, `constructors.ts`)

```ts
export const isImmutable = (v: unknown): v is Immutable<unknown> =>
  v !== null && typeof v === "object" && (v as Record<symbol, unknown>)[IMMUTABLE] === true;

export const isWrappable = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  if ((v as Record<symbol, unknown>)[IMMUTABLE] === true) return false; // skip immutables
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null || Array.isArray(v);
};
```
For the `ImmutableList` proxy, `[IMMUTABLE]` is defined on the **raw array before
freezing**, so `Reflect.get(target, IMMUTABLE)` exposes it through the existing
get trap — no trap special-casing, and the marker can't be missed.

### 7. Helper namespace (`src/data/immutable.ts`)

```ts
export const Immutable = {
  is: (v: unknown): v is Immutable<unknown> => isImmutable(v),
  equals: (a: unknown, b: unknown): boolean =>
    isImmutable(a) ? a.equals(b) : Object.is(a, b),
  produce: <T>(v: Producible<T>, recipe: (draft: T) => void) => v.produce(recipe),
};
```
(`Immutable` type + value merge via TS declaration merging.)

### 8. Reconciliation with v0.2 runtime types

- `Struct`→`ImmutableRecord`, `ListOf`→`ImmutableList`, `MapOf`→`ImmutableHashMap`
  are full `Producible` protocol members.
- `Vec`→frozen `readonly T[]`, `Dict`→frozen `Readonly<Record>` stay lightweight
  **frozen native snapshots** — deliberately not protocol members. Documented as
  *snapshot (Vec/Dict) vs collection (ListOf/MapOf/Struct)*.

## Files

- **New:** `src/data/immutable.ts` (`IMMUTABLE`, `Immutable`, `Producible`, helpers).
- **Edit:** `src/data/{record,list,hash-map,non-empty-list}.ts` (drop `$immutable`,
  add `[IMMUTABLE]`, fill `toMutable`/`produce`, revocable drafts, widen `equals`),
  `src/types/runtime/date-time.ts` (brand + `toJSON`/`toMutable` + modifiers),
  `src/data/internals.ts` + `constructors.ts` (`isImmutable`/`isWrappable` via
  symbol; `Draft` revocation), `src/types/runtime/composers.ts` (`Vec`/`Dict`→
  frozen; add `ListOf`/`MapOf`), barrels.

## Error handling

- `produce`: using a draft after the recipe returns throws `TypeError`.
  `NonEmptyList.produce` throws if the recipe empties the list.
- `DateTimeValue` modifiers never throw on valid `Duration`/numbers.

## Migration / versioning

- Removing `$immutable`, widening `equals`, and `Vec`/`Dict` returning frozen
  natives (vs the unreleased v0.2-PR ImmutableList/HashMap) are the breaking
  surface → minor `0.3.0` pre-1.0. Everything else additive.

## Testing

- Per type: `[IMMUTABLE]` present + non-enumerable; `isImmutable` true; `equals`
  incl. cross-type → false; `toJSON`; `toMutable` returns a fresh copy whose
  mutation doesn't affect the source; `produce` round-trip (result frozen,
  original untouched).
- **Revoked draft:** capturing the draft and using it after `produce` returns throws.
- `NonEmptyList.produce` empty-recipe throws.
- `DateTimeValue`: `plus`/`minus`/`withEpochMillis`/`withEpochNanos` return new
  values, original unchanged, ns precision preserved; `toMutable()` distinct `Date` each call.
- `isWrappable`/`isImmutable` updated; `ImmutableList` brand visible via the proxy.
- v0.2: `Vec`/`Dict` frozen-native; `ListOf`/`MapOf`/`Struct` are `Producible`.
- Cross-type `Immutable.is`/`Immutable.equals`. Coverage ≥90% (ideally 100%) on new/changed code.

## Verification

`corepack pnpm run build && check && lint && test`, `test:types`, c8 coverage on
changed files, and `node --expose-gc bench/bench.mjs` to confirm no regression on
the `Record`/`List` hot paths (a non-enumerable symbol on the frozen target is
the same cost class as the prior string marker).

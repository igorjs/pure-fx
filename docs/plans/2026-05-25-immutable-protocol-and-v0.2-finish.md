# Immutable Protocol + v0.2 Finish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert `Vec`/`Dict` to frozen native snapshots and add opt-in `ListOf`/`MapOf` (finishing v0.2), then introduce a `Symbol`-branded `Immutable`/`Producible` protocol adopted by `Record`/`List`/`HashMap`/`NonEmptyList`/`DateTimeValue`, with copy-on-write `produce` (revocable drafts) and `DateTimeValue` modifiers.

**Architecture:** A new `src/data/immutable.ts` defines the `IMMUTABLE` symbol, the `Immutable<TMut>`/`Producible<TMut>` interfaces, and an `Immutable` helper namespace. Each value type implements the protocol its own optimal way (Record keeps its structural-sharing draft; List/HashMap use copy-mutate-rebuild). `isImmutable`/`isWrappable` switch from the stringy `$immutable` to the symbol. `Vec`/`Dict` go back to deep-frozen arrays/objects; `ListOf`/`MapOf`/`Struct` are the protocol collections.

**Tech Stack:** TypeScript (tsgo), `@igorjs/pure-test` (against compiled `dist/`), biome, pnpm@11 via corepack, c8.

**Branch:** continue on `feat/v0.2.0-runtime-types` (already has DateTime/Struct/Vec-as-ImmutableList + the nesting/isImmutable fixes + bench). All commits SSH-signed + `Signed-off-by` (`git commit -s`).

---

## Conventions

- Run from repo root with `corepack pnpm ...`. After editing `package.json`, run `corepack pnpm install` once (refreshes pnpm's deps-state, else `run` scripts ENOENT).
- Loop: edit `src/` → `corepack pnpm run build` → `corepack pnpm test`. Tests import compiled `dist/`.
- Commit each task: `git commit -s -m "..."` (signed + signed-off; 1Password will prompt).
- Coverage: `corepack pnpm dlx c8@latest --reporter=text --src=src --include='dist/data/immutable.js' --include='dist/data/<file>.js' -- node node_modules/@igorjs/pure-test/bin/pure-test.mjs tests/`.

## File Structure

- **New** `src/data/immutable.ts` — `IMMUTABLE` symbol, `Immutable`/`Producible` interfaces, `Immutable` helper namespace, shared `revocableDraft` helper.
- **Edit** `src/data/{list,record,hash-map,non-empty-list}.ts` — adopt the protocol (brand, `toMutable`, `produce`, widen `equals`, drop `$immutable`).
- **Edit** `src/data/internals.ts` — `isWrappable` via symbol; `deepFreezeRaw` skip via symbol.
- **Edit** `src/data/constructors.ts` — `isImmutable` via symbol.
- **Edit** `src/types/runtime/composers.ts` — `Vec`/`Dict`→frozen; add `ListOf`/`MapOf`.
- **Edit** `src/types/runtime/date-time.ts` — brand + `toJSON`/`toMutable` + modifiers.
- **Edit** barrels: `src/data/index.ts`, `src/types/runtime/index.ts`, `src/types/index.ts`, `src/index.ts`.
- **Edit** `docs/types.md`, `docs/data.md`, `CHANGELOG.md`, `README.md`, `package.json`, `jsr.json`.
- **Tests**: new `tests/immutable.test.js`; update `tests/runtime-types.test.js`, `tests/type-def.test.js`.

---

## Phase A — Finish v0.2 (`Vec`/`Dict` → frozen, add `ListOf`/`MapOf`)

### Task 1: Revert `Vec` to a deep-frozen array

**Files:** Modify `src/types/runtime/composers.ts`; Test `tests/runtime-types.test.js`, `tests/type-def.test.js`.

- [ ] **Step 1: Update the Vec test to expect a frozen array** — in `tests/runtime-types.test.js`, replace the `describe("Vec returns ImmutableList", …)` block with:

```js
describe("Vec returns a frozen array", () => {
  class Tag extends TypeDef("Tag", Schema.string) {}
  it("parses into a frozen readonly array", () => {
    const r = Vec(Tag).parse(["a", "b"]);
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(Array.isArray(r.value)).toBe(true);
      expect(r.value[0]).toBe("a");
      expect(Object.isFrozen(r.value)).toBe(true);
      expect(() => { r.value.push("c"); }).toThrow();
    }
  });
  it("rejects non-arrays and bad elements", () => {
    expect(Vec(Tag).parse("nope").isErr).toBe(true);
    expect(Vec(Tag).parse([1]).isErr).toBe(true);
  });
  it("is cached by inner reference", () => { expect(Vec(Tag)).toBe(Vec(Tag)); });
});
```

- [ ] **Step 2: Run to verify it fails** — `corepack pnpm run build && corepack pnpm test` → FAIL (`r.value` is currently an ImmutableList, `Array.isArray` false / `.push` not a frozen-array throw).

- [ ] **Step 3: Revert the `Vec` implementation** — in `src/types/runtime/composers.ts` replace the `Vec` export with:

```ts
export const Vec = <Tag extends string, T>(inner: TypeDefStatic<Tag, T>) =>
  vecMemo(inner as unknown as object, () =>
    TypeDef(
      `Vec<${inner.tag}>` as const,
      // Schema.array yields readonly T[] structurally; the brand is phantom, so
      // the runtime value is a deep-frozen array (a lightweight snapshot).
      Schema.array(inner.schema).transform(arr => deepFreezeT(arr as readonly Type<Tag, T>[])),
    ),
  ) as ReturnType<typeof TypeDef<`Vec<${Tag}>`, readonly Type<Tag, T>[]>>;
```

- [ ] **Step 4: Update existing Vec assertions in `tests/type-def.test.js`** — restore the v0.1 frozen-array expectations (these were changed when Vec returned a List): `Vec(Int).parse([1,2,3]).value[0]).toBe(1)`, the "deep-freezes the parsed output" test (`r.value.push(4)` throws + `Object.isFrozen(r.value)` true), the class-extension test (`r.value[0]).toBe(10)`), and the nested `Vec(Vec(Int)).value[0][1]).toBe(2)` / `Dict(Str,Vec(Int)).value.a[0]).toBe(1)` cases. Run `grep -nE "Vec|toMutable|\\.at\\(" tests/type-def.test.js` to find them.

- [ ] **Step 5: Build + test** — `corepack pnpm run build && corepack pnpm test` → all pass.

- [ ] **Step 6: Commit** — `git add src/types/runtime/composers.ts tests/runtime-types.test.js tests/type-def.test.js && git commit -s -m "feat(types): Vec returns a frozen array (revert ImmutableList)"`

### Task 2: Revert `Dict` to a deep-frozen object

**Files:** Modify `src/types/runtime/composers.ts`; Test `tests/runtime-types.test.js`, `tests/type-def.test.js`.

- [ ] **Step 1: Update the Dict test** — replace the `describe("Dict returns ImmutableHashMap", …)` block in `tests/runtime-types.test.js`:

```js
describe("Dict returns a frozen object", () => {
  it("parses into a frozen record", () => {
    const r = Dict(Str, Str).parse({ "x-id": "1" });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value["x-id"]).toBe("1");
      expect(Object.isFrozen(r.value)).toBe(true);
    }
  });
  it("rejects non-objects and bad values", () => {
    expect(Dict(Str, Str).parse(null).isErr).toBe(true);
    expect(Dict(Str, Str).parse({ k: 1 }).isErr).toBe(true);
  });
  it("is cached by inner references", () => { expect(Dict(Str, Str)).toBe(Dict(Str, Str)); });
});
```

- [ ] **Step 2: Run to verify it fails** — build + test → FAIL.

- [ ] **Step 3: Revert `Dict`** — replace the `Dict` export in `composers.ts`:

```ts
export const Dict = <KTag extends string, K extends string, VTag extends string, V>(
  key: TypeDefStatic<KTag, K>,
  value: TypeDefStatic<VTag, V>,
) =>
  dictMemo(key as unknown as object, value as unknown as object, () =>
    TypeDef(
      `Dict<${key.tag},${value.tag}>` as const,
      Schema.record(value.schema).transform(obj =>
        deepFreezeT(obj as Readonly<Record<Type<KTag, K> & string, Type<VTag, V>>>),
      ),
    ),
  ) as ReturnType<
    typeof TypeDef<`Dict<${KTag},${VTag}>`, Readonly<Record<Type<KTag, K> & string, Type<VTag, V>>>>
  >;
```

- [ ] **Step 4: Restore Dict assertions in `tests/type-def.test.js`** — `Dict(Str,Int).parse({a:1,b:2}).value.a).toBe(1)`, the "deep-freezes" test (`Object.isFrozen(r.value)` true), and `Dict(UserId,User).value.u_001.name`.

- [ ] **Step 5: Build + test** → all pass.

- [ ] **Step 6: Commit** — `git add -A && git commit -s -m "feat(types): Dict returns a frozen object (revert ImmutableHashMap)"`

### Task 3: Add `ListOf(T)` → `ImmutableList`

**Files:** Modify `src/types/runtime/composers.ts`, barrels; Test `tests/runtime-types.test.js`.

- [ ] **Step 1: Write the failing test**

```js
describe("ListOf returns ImmutableList", () => {
  class Tag extends TypeDef("Tag", Schema.string) {}
  it("parses into an ImmutableList", () => {
    const r = ListOf(Tag).parse(["a", "b"]);
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.toMutable()).toEqual(["a", "b"]);
      expect(r.value.append("c").toMutable()).toEqual(["a", "b", "c"]);
    }
  });
  it("is cached by inner reference", () => { expect(ListOf(Tag)).toBe(ListOf(Tag)); });
});
```

- [ ] **Step 2: Run to verify it fails** — build fails (`ListOf` not exported).

- [ ] **Step 3: Add memo + `ListOf`** — in `composers.ts` add `const listOfMemo = makeMemo1<unknown>();` next to the other memos, ensure `import { List } from "../../data/constructors.js";` and `import type { ImmutableList } from "../../data/list.js";` are present, and append:

```ts
/**
 * Like {@link Vec}, but returns a pure-fx {@link ImmutableList} (functional API +
 * copy-on-write `produce`) instead of a frozen array.
 */
export const ListOf = <Tag extends string, T>(inner: TypeDefStatic<Tag, T>) =>
  listOfMemo(inner as unknown as object, () =>
    TypeDef(
      `ListOf<${inner.tag}>` as const,
      Schema.array(inner.schema).transform(arr => List(arr as readonly Type<Tag, T>[])),
    ),
  ) as ReturnType<typeof TypeDef<`ListOf<${Tag}>`, ImmutableList<Type<Tag, T>>>>;
```

- [ ] **Step 4: Export `ListOf`** — add to the composer re-export in `src/types/runtime/index.ts`, `src/types/index.ts`, and `src/index.ts` (mirror the existing `Vec` export lines).

- [ ] **Step 5: Build + test** → pass.

- [ ] **Step 6: Commit** — `git commit -s -am "feat(types): add ListOf composer (ImmutableList)"`

### Task 4: Add `MapOf(K,V)` → `ImmutableHashMap`

**Files:** Modify `src/types/runtime/composers.ts`, barrels; Test `tests/runtime-types.test.js`.

- [ ] **Step 1: Write the failing test**

```js
describe("MapOf returns ImmutableHashMap", () => {
  it("parses into an ImmutableHashMap", () => {
    const r = MapOf(Str, Str).parse({ "x-id": "1" });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.size).toBe(1);
      expect(r.value.get("x-id").isSome).toBe(true);
    }
  });
  it("is cached by inner references", () => { expect(MapOf(Str, Str)).toBe(MapOf(Str, Str)); });
});
```

- [ ] **Step 2: Run to verify it fails** — build fails (`MapOf` not exported).

- [ ] **Step 3: Add memo + `MapOf`** — add `const mapOfMemo = makeMemo2<unknown>();`, ensure `import { HashMap, type ImmutableHashMap } from "../../data/hash-map.js";` present, and append:

```ts
/**
 * Like {@link Dict}, but returns a pure-fx {@link ImmutableHashMap} (functional
 * API + copy-on-write `produce`) instead of a frozen object.
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
    typeof TypeDef<`MapOf<${KTag},${VTag}>`, ImmutableHashMap<Type<KTag, K> & string, Type<VTag, V>>>
  >;
```

- [ ] **Step 4: Export `MapOf`** — add to the three barrels (mirror `Dict`).

- [ ] **Step 5: Build + test** → pass.

- [ ] **Step 6: Commit** — `git commit -s -am "feat(types): add MapOf composer (ImmutableHashMap)"`

---

## Phase B — `Immutable` protocol core

### Task 5: Create `src/data/immutable.ts`

**Files:** Create `src/data/immutable.ts`; Modify `src/data/index.ts`; Test `tests/immutable.test.js` (new).

- [ ] **Step 1: Write the failing test** (new `tests/immutable.test.js`)

```js
import { describe, expect, it } from "@igorjs/pure-test";
import { IMMUTABLE, Immutable } from "@igorjs/pure-fx";

describe("Immutable protocol core", () => {
  it("IMMUTABLE is the global-registry symbol", () => {
    expect(IMMUTABLE).toBe(Symbol.for("@igorjs/pure-fx/immutable"));
  });
  it("Immutable.is recognises branded values only", () => {
    const fake = { [IMMUTABLE]: true, equals: () => false, toJSON: () => null, toMutable: () => ({}) };
    expect(Immutable.is(fake)).toBe(true);
    expect(Immutable.is({})).toBe(false);
    expect(Immutable.is(null)).toBe(false);
    expect(Immutable.is(5)).toBe(false);
  });
  it("Immutable.equals delegates for immutables, Object.is otherwise", () => {
    const a = { [IMMUTABLE]: true, equals: o => o === a, toJSON: () => null, toMutable: () => ({}) };
    expect(Immutable.equals(a, a)).toBe(true);
    expect(Immutable.equals(a, {})).toBe(false);
    expect(Immutable.equals(2, 2)).toBe(true);
    expect(Immutable.equals(2, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — build fails (`IMMUTABLE`/`Immutable` not exported).

- [ ] **Step 3: Create `src/data/immutable.ts`**

```ts
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

/** A structural Immutable supporting copy-on-write edits via a revocable draft. */
export interface Producible<TMut> extends Immutable<TMut> {
  produce(recipe: (draft: TMut) => void): this;
}

const isImmutableValue = (v: unknown): v is Immutable<unknown> =>
  v !== null && typeof v === "object" && (v as Record<symbol, unknown>)[IMMUTABLE] === true;

/** Helper namespace (merges with the `Immutable` type via declaration merging). */
export const Immutable = {
  /** Type guard for any value implementing the protocol. */
  is: isImmutableValue,
  /** Brand-aware equality: delegates to `.equals` for immutables, else `Object.is`. */
  equals: (a: unknown, b: unknown): boolean =>
    isImmutableValue(a) ? a.equals(b) : Object.is(a, b),
  /** Functional `produce` wrapper. */
  produce: <T>(v: Producible<T>, recipe: (draft: T) => void): Producible<T> => v.produce(recipe),
};
```

- [ ] **Step 4: Export from `src/data/index.ts`** — add:

```ts
/** Shared protocol brand for immutable value types. */
export { IMMUTABLE, Immutable } from "./immutable.js";
/** Structural immutable-value protocol interfaces. */
export type { Producible } from "./immutable.js";
```
And re-export from `src/index.ts` (mirror an existing `data` re-export line):
```ts
export { IMMUTABLE, Immutable } from "./data/immutable.js";
export type { Producible } from "./data/immutable.js";
```

- [ ] **Step 5: Build + test** → pass. Run `corepack pnpm run check` (tsgo) → clean.

- [ ] **Step 6: Commit** — `git add src/data/immutable.ts src/data/index.ts src/index.ts tests/immutable.test.js && git commit -s -m "feat(data): add Immutable/Producible protocol + IMMUTABLE brand"`

### Task 6: Add a revocable-draft helper

**Files:** Modify `src/data/internals.ts`; Test `tests/immutable.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/immutable.test.js`) — exercised indirectly later, but lock the helper contract now via List in Task 8. For this task, add a direct unit by temporarily importing the helper is not possible (internal). Instead, assert the behavior through `List.produce` in Task 8. **Skip a test here; this task only adds the helper.** (No test step — pure refactor consumed by later tasks.)

- [ ] **Step 2: Implement `revocableDraft` in `src/data/internals.ts`** — append:

```ts
/**
 * Run `recipe` against a revocable Proxy over `target`, then revoke it so a
 * leaked draft throws on later use. Returns `target` (mutated in place by the
 * recipe) for the caller to rebuild into a frozen value.
 *
 * The Proxy is transparent (forwards all traps) except that, once revoked,
 * every operation throws `TypeError: Cannot perform 'get' on a proxy that has
 * been revoked` — which we normalize is unnecessary; the native message is clear.
 */
export const revocableDraft = <T extends object>(target: T, recipe: (draft: T) => void): T => {
  const { proxy, revoke } = Proxy.revocable(target, {});
  try {
    recipe(proxy as T);
  } finally {
    revoke();
  }
  return target;
};
```

- [ ] **Step 3: Build** — `corepack pnpm run build` → clean (unused until Task 8; that's fine, it's exported/internal). Run `corepack pnpm run lint` — if biome flags it as unused, proceed (it's consumed in Task 8 within the same PR; or temporarily mark with a usage in Task 8 before committing). To avoid an unused-export lint error, **commit this together with Task 8** rather than standalone.

- [ ] **Step 4: (Deferred commit — bundled with Task 8.)**

### Task 7: `ImmutableList` adopts the protocol

**Files:** Modify `src/data/list.ts`; Test `tests/immutable.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { List } from "@igorjs/pure-fx";
describe("ImmutableList implements Immutable/Producible", () => {
  it("carries the brand and isImmutable", () => {
    const l = List([1, 2, 3]);
    expect(Immutable.is(l)).toBe(true);
    expect(Object.keys(l).includes(String(IMMUTABLE))).toBe(false); // non-enumerable
  });
  it("produce returns a new frozen list, original untouched", () => {
    const l = List([1, 2, 3]);
    const l2 = l.produce(d => { d.push(4); d[0] = 9; });
    expect(l2.toMutable()).toEqual([9, 2, 3, 4]);
    expect(l.toMutable()).toEqual([1, 2, 3]);
  });
  it("revokes the draft after produce (leaked draft throws)", () => {
    let stolen;
    List([1]).produce(d => { stolen = d; });
    expect(() => { stolen.push(2); }).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — build fails (`produce` not on List; brand check fails).

- [ ] **Step 3: Implement** — in `src/data/list.ts`:
  (a) `import { IMMUTABLE } from "./immutable.js";` and `import { revocableDraft } from "./internals.js";` (add to existing import).
  (b) In `buildListMethods`, add a `produce` method and keep `$immutable` removed (replace it):

```ts
  produce(recipe: (draft: T[]) => void): ImmutableList<T> {
    const copy = raw.slice() as T[];
    revocableDraft(copy, recipe);
    return createListProxy(copy);
  },
  // replace `$immutable: true as const,` with nothing here; brand goes on raw (below)
```
  (c) In `createListProxy`, define the brand on `raw` **before** returning (raw is not frozen — proxy enforces immutability — but define non-enumerable symbol so `Reflect.get` exposes it):
```ts
export const createListProxy = <T>(raw: readonly T[]): ImmutableList<T> => {
  const cached = LIST_PROXY_CACHE.get(raw);
  if (cached) return cached as ImmutableList<T>;
  Object.defineProperty(raw, IMMUTABLE, { value: true, enumerable: false });
  LIST_METHODS.set(raw, buildListMethods(raw));
  const proxy = new Proxy(raw, LIST_HANDLER as ProxyHandler<readonly T[]>) as unknown as ImmutableList<T>;
  LIST_PROXY_CACHE.set(raw, proxy);
  return proxy;
};
```
  (d) Add `[IMMUTABLE]` and `produce` to the `ListMethods<T>` / `ImmutableList<T>` interface, remove `$immutable`, and widen `equals(other: ImmutableList<T>)` → `equals(other: unknown)`.
  (e) `LIST_METHOD_KEYS` is derived from the methods object keys; ensure `produce` is included and `$immutable` removed. Verify the get-trap still resolves `produce`.

- [ ] **Step 4: Build + test** → the List protocol tests pass; existing list tests still pass (Vec uses frozen arrays now, not List, so unaffected). If any test referenced `list.$immutable`, update to `Immutable.is(list)`.

- [ ] **Step 5: Commit (bundles Task 6)** — `git add src/data/list.ts src/data/internals.ts tests/immutable.test.js && git commit -s -m "feat(data): ImmutableList implements Immutable/Producible with revocable produce"`

### Task 8: `ImmutableRecord` adopts the protocol

**Files:** Modify `src/data/record.ts`; Test `tests/immutable.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { Record } from "@igorjs/pure-fx";
describe("ImmutableRecord implements Immutable/Producible", () => {
  it("carries the brand", () => { expect(Immutable.is(Record({ a: 1 }))).toBe(true); });
  it("produce still works and revokes the draft", () => {
    const r = Record({ a: 1, b: 2 });
    const r2 = r.produce(d => { d.a = 9; });
    expect(r2.toMutable()).toEqual({ a: 9, b: 2 });
    expect(r.toMutable()).toEqual({ a: 1, b: 2 });
    let stolen;
    r.produce(d => { stolen = d; });
    expect(() => { stolen.a = 5; }).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `Immutable.is(record)` false (still on `$immutable` string; `isImmutable`/brand not symbol yet) and/or leaked-draft doesn't throw.

- [ ] **Step 3: Implement** — in `src/data/record.ts`:
  (a) `import { IMMUTABLE } from "./immutable.js";`
  (b) Replace the prototype `$immutable` definition with the symbol:
```ts
  Object.defineProperty(proto, IMMUTABLE, { value: true, enumerable: false });
```
  (remove the old `Object.defineProperty(proto, "$immutable", { value: true, enumerable: false });`).
  (c) Wrap the existing `produce` draft so it is revoked after the recipe. The current `produce` builds a draft via `createDraft(this._raw, mutations)`; revoke that proxy in a `finally`. Update `createDraft` in `internals.ts` to return `{ draft, revoke }` OR wrap the produced draft with `Proxy.revocable`. Minimal approach — in `proto.produce`:
```ts
  proto.produce = function (this: any, recipe: (draft: any) => void) {
    const mutations: Mutation[] = [];
    const draft = createDraft(this._raw, mutations);
    const { proxy, revoke } = Proxy.revocable(draft as object, {});
    try { recipe(proxy); } finally { revoke(); }
    return createRecord(applyMutations(this._raw, mutations));
  };
```
  (d) Widen `equals(other: ImmutableRecord<T>)` → `equals(other: unknown)` in the interface and the prototype method (the impl already coerces `other._raw`).
  (e) Update the `ImmutableRecord`/`RecordMethods` types: drop `$immutable`, add `readonly [IMMUTABLE]: true`.

- [ ] **Step 4: Build + test** → pass. Fix any test referencing `record.$immutable` → `Immutable.is(record)`.

- [ ] **Step 5: Commit** — `git add src/data/record.ts src/data/internals.ts tests/immutable.test.js && git commit -s -m "feat(data): ImmutableRecord adopts IMMUTABLE brand + revocable produce"`

### Task 9: `ImmutableHashMap` adopts the protocol

**Files:** Modify `src/data/hash-map.ts`; Test `tests/immutable.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { HashMap } from "@igorjs/pure-fx";
describe("ImmutableHashMap implements Immutable/Producible", () => {
  const m = HashMap.of([["a", 1], ["b", 2]]);
  it("carries the brand and toMutable", () => {
    expect(Immutable.is(m)).toBe(true);
    const native = m.toMutable();
    expect(native instanceof Map).toBe(true);
    expect(native.get("a")).toBe(1);
    native.set("a", 99);                 // mutate the copy
    expect(m.get("a").isSome && m.get("a").value).toBe(1); // source unchanged
  });
  it("produce returns a new map, original untouched, draft revoked", () => {
    const m2 = m.produce(d => { d.set("c", 3); d.delete("a"); });
    expect(m2.size).toBe(2);
    expect(m2.get("c").isSome).toBe(true);
    expect(m.size).toBe(2);
    let stolen; m.produce(d => { stolen = d; });
    expect(() => stolen.set("x", 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `Immutable.is(m)` false; `toMutable`/`produce` not functions.

- [ ] **Step 3: Implement** — in `src/data/hash-map.ts`:
  (a) `import { IMMUTABLE } from "./immutable.js";` and `import { revocableDraft } from "./internals.js";`
  (b) On `HashMapImpl`, add `readonly [IMMUTABLE] = true as const;` (a class field; non-enumerable is not required for a class instance but make it non-enumerable for cleanliness via a constructor `Object.defineProperty` if `toJSON` enumerates — `toJSON` returns `[K,V][]` explicitly, so a plain field is safe).
  (c) Add methods to the class + `ImmutableHashMap<K,V>` interface:
```ts
  toMutable(): Map<K, V> {
    const out = new Map<K, V>();
    for (const [k, v] of this) out.set(k, v);
    return out;
  }
  produce(recipe: (draft: Map<K, V>) => void): ImmutableHashMap<K, V> {
    const copy = this.toMutable();
    revocableDraft(copy, recipe);
    return HashMap.fromMap(copy);
  }
```
  (d) Widen `equals(other: ImmutableHashMap<K,V>)` → `equals(other: unknown)` (guard the type inside).
  (e) Add `readonly [IMMUTABLE]: true; toMutable(): Map<K,V>; produce(recipe): ImmutableHashMap<K,V>;` to the interface.

- [ ] **Step 4: Build + test** → pass.

- [ ] **Step 5: Commit** — `git add src/data/hash-map.ts tests/immutable.test.js && git commit -s -m "feat(data): ImmutableHashMap adopts protocol (brand, toMutable, produce)"`

### Task 10: `NonEmptyList` adopts the protocol (with non-empty `produce` guard)

**Files:** Modify `src/data/non-empty-list.ts`; Test `tests/immutable.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { NonEmptyList } from "@igorjs/pure-fx";
describe("NonEmptyList implements Immutable/Producible", () => {
  it("brand + produce keeps non-empty", () => {
    const nel = NonEmptyList.of(1, 2, 3);
    expect(Immutable.is(nel)).toBe(true);
    const nel2 = nel.produce(d => { d.push(4); });
    expect(nel2.toMutable()).toEqual([1, 2, 3, 4]);
  });
  it("produce throws if recipe empties it", () => {
    const nel = NonEmptyList.of(1);
    expect(() => nel.produce(d => { d.length = 0; })).toThrow();
  });
});
```
(Confirm the constructor: `grep -nE "NonEmptyList\\.(of|from)" src/data/non-empty-list.ts` and adjust `NonEmptyList.of(...)` to the real factory.)

- [ ] **Step 2: Run to verify it fails** — `Immutable.is` false / no `produce`.

- [ ] **Step 3: Implement** — in `src/data/non-empty-list.ts`: `import { IMMUTABLE } from "./immutable.js"; import { revocableDraft } from "./internals.js";` Replace `$immutable: true` with the brand on the underlying value (same pattern as List — define on the raw array pre-freeze, or as a method-object entry consistent with the file's existing approach). Add:
```ts
  produce(recipe: (draft: T[]) => void): NonEmptyList<T> {
    const copy = this.toMutable();
    revocableDraft(copy, recipe);
    if (copy.length === 0) {
      throw new TypeError("NonEmptyList.produce: recipe left the list empty");
    }
    return NonEmptyList.fromArrayUnsafe(copy); // use the file's internal non-empty constructor
  }
```
Widen `equals` to `unknown`. Add `[IMMUTABLE]`/`produce` to the interface. (Check the file's internal constructor name with `grep -nE "fromArray|unsafe|create" src/data/non-empty-list.ts`.)

- [ ] **Step 4: Build + test** → pass.

- [ ] **Step 5: Commit** — `git add src/data/non-empty-list.ts tests/immutable.test.js && git commit -s -m "feat(data): NonEmptyList adopts protocol (brand, produce with non-empty guard)"`

---

## Phase C — Wire detection to the symbol; remove `$immutable`

### Task 11: `isImmutable` / `isWrappable` / `deepFreezeRaw` key off the symbol

**Files:** Modify `src/data/constructors.ts`, `src/data/internals.ts`; Test `tests/runtime-types.test.js` (existing isImmutable test), `tests/immutable.test.js`.

- [ ] **Step 1: Update tests** — the existing `tests/runtime-types.test.js` `isImmutable` test should still pass (List/Record now branded by symbol). Add an assertion that the old string marker is gone:
```js
it("no longer exposes the legacy $immutable string marker", () => {
  expect("$immutable" in Record({ a: 1 })).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(List([1]).$raw ?? {}, "$immutable")).toBe(false);
});
```

- [ ] **Step 2: Run to verify** — current `isImmutable` (string-based) now returns `false` for symbol-branded types → existing isImmutable test FAILS.

- [ ] **Step 3: Implement** —
  `src/data/constructors.ts`:
```ts
import { IMMUTABLE } from "./immutable.js";
export const isImmutable = (
  val: unknown,
): val is ImmutableRecord<object> | ImmutableList<unknown> =>
  val !== null && typeof val === "object" && (val as Record<symbol, unknown>)[IMMUTABLE] === true;
```
  `src/data/internals.ts` — `isWrappable` and `deepFreezeRaw` switch the marker check to the symbol:
```ts
import { IMMUTABLE } from "./immutable.js";
// in deepFreezeRaw, replace the $immutable check:
if ((obj as Record<symbol, unknown>)[IMMUTABLE] === true) return;
// in isWrappable, replace the $immutable check:
if ((v as Record<symbol, unknown>)[IMMUTABLE] === true) return false;
```
  **Watch for a circular import**: `internals.ts` ← `immutable.ts`? `immutable.ts` has no imports from `internals`, so `internals → immutable` is fine (one-way).

- [ ] **Step 4: Build + test** → all pass; `corepack pnpm run check` clean.

- [ ] **Step 5: Commit** — `git add src/data/constructors.ts src/data/internals.ts tests/ && git commit -s -m "refactor(data): isImmutable/isWrappable/deepFreeze key off IMMUTABLE symbol; drop \$immutable"`

---

## Phase D — `DateTimeValue` protocol + modifiers

### Task 12: `DateTimeValue` adopts `Immutable` + copy-on-write modifiers

**Files:** Modify `src/types/runtime/date-time.ts`; Test `tests/runtime-types.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { Immutable, Duration } from "@igorjs/pure-fx";
describe("DateTimeValue is an Immutable value with modifiers", () => {
  const t = DateTimeValue.fromEpochMillis(1_700_000_000_000);
  it("carries the brand, toJSON, toMutable", () => {
    expect(Immutable.is(t)).toBe(true);
    expect(t.toJSON()).toBe("2023-11-14T22:13:20.000Z");
    const d = t.toMutable();
    expect(d instanceof Date).toBe(true);
    d.setFullYear(2000);                       // mutate copy
    expect(t.toEpochMillis()).toBe(1_700_000_000_000); // source unchanged
    expect(t.toMutable()).not.toBe(t.toMutable());     // fresh each call
  });
  it("plus/minus/withEpochMillis return new values", () => {
    const t2 = t.plus(Duration.hours(1));
    expect(t2.toEpochMillis()).toBe(1_700_000_000_000 + 3_600_000);
    expect(t.toEpochMillis()).toBe(1_700_000_000_000);
    expect(t.minus(Duration.hours(1)).toEpochMillis()).toBe(1_700_000_000_000 - 3_600_000);
    expect(t.withEpochMillis(0).toEpochMillis()).toBe(0);
    expect(t.withEpochNanos(5n).epochNanos).toBe(5n);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `Immutable.is(t)` false; `toJSON`/`toMutable`/`plus`/… missing.

- [ ] **Step 3: Implement** — in `src/types/runtime/date-time.ts`:
  (a) `import { IMMUTABLE } from "../../data/immutable.js"; import { Duration } from "../duration.js";`
  (b) In the `DateTimeValue` constructor, after `this.epochNanos = epochNanos;` add the brand before freezing:
```ts
  Object.defineProperty(this, IMMUTABLE, { value: true, enumerable: false });
```
  (c) Add methods:
```ts
  toJSON(): string { return this.toISO(); }
  toMutable(): Date { return this.toDate(); } // toDate() already returns a fresh Date
  plus(d: Duration): DateTimeValue {
    return new DateTimeValue(this.epochNanos + BigInt(Duration.toMilliseconds(d)) * NS_PER_MS);
  }
  minus(d: Duration): DateTimeValue {
    return new DateTimeValue(this.epochNanos - BigInt(Duration.toMilliseconds(d)) * NS_PER_MS);
  }
  withEpochMillis(ms: number): DateTimeValue { return DateTimeValue.fromEpochMillis(ms); }
  withEpochNanos(ns: bigint): DateTimeValue { return DateTimeValue.fromEpochNanos(ns); }
```
  (Confirm `Duration.toMilliseconds` exists: `grep -nE "toMilliseconds" src/types/duration.ts`. If the export differs, adjust.)
  (d) Declare a class field `declare readonly [IMMUTABLE]: true;` so the type satisfies `Immutable<Date>`.

- [ ] **Step 4: Build + test** → pass.

- [ ] **Step 5: Commit** — `git add src/types/runtime/date-time.ts tests/runtime-types.test.js && git commit -s -m "feat(types): DateTimeValue implements Immutable + plus/minus/withEpoch* modifiers"`

---

## Phase E — Docs, CHANGELOG, version, final verification

### Task 13: Docs + CHANGELOG + version + full verification

**Files:** Modify `docs/types.md`, `docs/data.md`, `CHANGELOG.md`, `README.md`, `package.json`, `jsr.json`.

- [ ] **Step 1: `docs/types.md`** — update the composer table: `Vec`→`readonly T[]` (frozen), `Dict`→`Readonly<Record>` (frozen); add `ListOf`→`ImmutableList`, `MapOf`→`ImmutableHashMap` rows; note `Struct`/`ListOf`/`MapOf` are `Producible`. Add `DateTimeValue` modifier docs (`plus`/`minus`/`withEpochMillis`/`withEpochNanos`).

- [ ] **Step 2: `docs/data.md`** — add an "Immutable protocol" section documenting `IMMUTABLE`, `Immutable`/`Producible`, `Immutable.is`/`equals`/`produce`, and that `Record`/`List`/`HashMap`/`NonEmptyList` are `Producible` with `produce` + revocable drafts.

- [ ] **Step 3: `CHANGELOG.md`** — replace the v0.2.0 section with a `## [0.3.0]` section: Added — `Immutable`/`Producible` protocol + `IMMUTABLE`; `produce` on List/HashMap/NonEmptyList; `DateTimeValue` modifiers; `ListOf`/`MapOf`/`Struct`/`DateTime` runtime types. Changed (BREAKING) — removed `$immutable` (use `Immutable.is`); `equals` widened to `unknown`; `Vec`/`Dict` return frozen natives. (Keep the earlier DateTime/Struct Added entries.)

- [ ] **Step 4: Bump version** — `package.json` and `jsr.json` `0.2.0` → `0.3.0`. Then `corepack pnpm install` (refresh deps-state).

- [ ] **Step 5: `README.md`** — types row: add `ListOf`, `MapOf`, `Immutable`, `Producible`.

- [ ] **Step 6: Full verification**:
```
corepack pnpm run build && corepack pnpm run check && corepack pnpm run lint && corepack pnpm test && corepack pnpm run test:types
```
Expected: all green. Then coverage on changed files (≥90%, ideally 100%):
```
corepack pnpm dlx c8@latest --reporter=text --src=src \
  --include='dist/data/immutable.js' --include='dist/data/list.js' --include='dist/data/record.js' \
  --include='dist/data/hash-map.js' --include='dist/data/non-empty-list.js' \
  --include='dist/types/runtime/date-time.js' --include='dist/types/runtime/composers.js' \
  -- node node_modules/@igorjs/pure-test/bin/pure-test.mjs tests/
```
Add targeted tests for any uncovered branch. Then bench (no hot-path regression):
```
corepack pnpm run build && node --expose-gc bench/bench.mjs
```

- [ ] **Step 7: Commit** — `git add docs/types.md docs/data.md CHANGELOG.md README.md package.json jsr.json tests/ && git commit -s -m "docs: document Immutable protocol + ListOf/MapOf + DateTime modifiers; bump to 0.3.0"`

---

## Self-Review

**Spec coverage:** brand+interfaces (T5), `$immutable` removal (T11), per-type adoption (T7–T10), `isImmutable`/`isWrappable` via symbol (T11), revocable drafts (T6 helper + T7–T10), `DateTimeValue` brand+modifiers (T12), `Vec`/`Dict`→frozen (T1–T2), `ListOf`/`MapOf` (T3–T4), Struct→ImmutableRecord (unchanged, already shipped), docs/CHANGELOG/version (T13) — all spec sections mapped.

**Placeholder scan:** code steps carry concrete code; the few "confirm the factory name with grep" notes are verification of existing-symbol names (`NonEmptyList` constructor, `Duration.toMilliseconds`), to be checked at execution — not deferred implementation.

**Type consistency:** `IMMUTABLE` symbol, `Immutable<TMut>`/`Producible<TMut>`, `produce(recipe: (draft: TMut) => void): this`, `toMutable()` returns the mutable form per type (object/array/Map/Date), `revocableDraft(target, recipe)` helper signature consistent across T7/T9/T10, `equals(other: unknown)` widening applied uniformly.

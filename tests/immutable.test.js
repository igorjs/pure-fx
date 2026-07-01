// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * immutable.test.js - Tests for the Immutable/Producible protocol.
 *
 * Covers: IMMUTABLE brand, Immutable.is/equals helpers, and per-type adoption
 * (brand + toMutable + revocable produce) for List/Record/HashMap/NonEmptyList.
 *
 * Uses @igorjs/pure-test. Tests the compiled dist/ output, not the source.
 */

import { HashMap, IMMUTABLE, Immutable, List, NonEmptyList, Record } from "@igorjs/pure-fx";
import { describe, expect, it } from "@igorjs/pure-test";

describe("Immutable protocol core", () => {
  it("IMMUTABLE is the global-registry symbol", () => {
    expect(IMMUTABLE).toBe(Symbol.for("@igorjs/pure-fx/immutable"));
  });

  it("Immutable.is recognises branded values only", () => {
    const fake = {
      [IMMUTABLE]: true,
      equals: () => false,
      toJSON: () => null,
      toMutable: () => ({}),
    };
    expect(Immutable.is(fake)).toBe(true);
    expect(Immutable.is({})).toBe(false);
    expect(Immutable.is(null)).toBe(false);
    expect(Immutable.is(5)).toBe(false);
  });

  it("Immutable.equals delegates for immutables, Object.is otherwise", () => {
    const a = {
      [IMMUTABLE]: true,
      equals: o => o === a,
      toJSON: () => null,
      toMutable: () => ({}),
    };
    expect(Immutable.equals(a, a)).toBe(true);
    expect(Immutable.equals(a, {})).toBe(false);
    expect(Immutable.equals(2, 2)).toBe(true);
    expect(Immutable.equals(2, 3)).toBe(false);
  });
});

describe("ImmutableList implements Immutable/Producible", () => {
  it("carries the brand (non-enumerable)", () => {
    const l = List([1, 2, 3]);
    expect(Immutable.is(l)).toBe(true);
    expect(Object.keys(l)).not.toContain("$immutable");
  });
  it("produce returns a new frozen list, original untouched", () => {
    const l = List([1, 2, 3]);
    const l2 = l.produce(d => {
      d.push(4);
      d[0] = 9;
    });
    expect(l2.toMutable()).toEqual([9, 2, 3, 4]);
    expect(l.toMutable()).toEqual([1, 2, 3]);
  });
  it("revokes the draft after produce (leaked draft throws)", () => {
    let stolen;
    List([1]).produce(d => {
      stolen = d;
    });
    expect(() => {
      stolen.push(2);
    }).toThrow();
  });
});

describe("ImmutableRecord implements Immutable/Producible", () => {
  it("carries the brand", () => {
    expect(Immutable.is(Record({ a: 1 }))).toBe(true);
  });
  it("produce works and revokes the draft", () => {
    const r = Record({ a: 1, b: 2 });
    const r2 = r.produce(d => {
      d.a = 9;
    });
    expect(r2.toMutable()).toEqual({ a: 9, b: 2 });
    expect(r.toMutable()).toEqual({ a: 1, b: 2 });
    let stolen;
    r.produce(d => {
      stolen = d;
    });
    expect(() => {
      stolen.a = 5;
    }).toThrow();
  });
});

describe("ImmutableHashMap implements Immutable/Producible", () => {
  const m = HashMap.of([
    ["a", 1],
    ["b", 2],
  ]);
  it("carries the brand and toMutable returns a fresh Map", () => {
    expect(Immutable.is(m)).toBe(true);
    const native = m.toMutable();
    expect(native instanceof Map).toBe(true);
    expect(native.get("a")).toBe(1);
    native.set("a", 99);
    expect(m.get("a").isSome && m.get("a").value).toBe(1); // source unchanged
  });
  it("produce returns a new map, original untouched, draft revoked", () => {
    const m2 = m.produce(d => {
      d.set("c", 3);
      d.delete("a");
    });
    expect(m2.size).toBe(2);
    expect(m2.get("c").isSome).toBe(true);
    expect(m.size).toBe(2);
    let stolen;
    m.produce(d => {
      stolen = d;
    });
    expect(() => stolen.set("x", 1)).toThrow();
  });
});

describe("NonEmptyList implements Immutable/Producible", () => {
  it("brand + produce keeps non-empty", () => {
    const nel = NonEmptyList.of(1, 2, 3);
    expect(Immutable.is(nel)).toBe(true);
    const nel2 = nel.produce(d => {
      d.push(4);
    });
    expect(nel2.toMutable()).toEqual([1, 2, 3, 4]);
  });
  it("produce throws if recipe empties it", () => {
    const nel = NonEmptyList.of(1);
    expect(() =>
      nel.produce(d => {
        d.length = 0;
      }),
    ).toThrow();
  });
});

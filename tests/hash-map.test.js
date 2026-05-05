/**
 * hash-map.test.js - Tests for immutable HashMap (HAMT-backed).
 *
 * Uses @igorjs/pure-test.
 * Run: node --test tests/hash-map.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const { HashMap } = await import("../dist/index.js");

// =============================================================================
// 1. Constructors
// =============================================================================

describe("HashMap.empty", () => {
  it("creates an empty map", () => {
    const m = HashMap.empty();
    expect(m.size).toBe(0);
  });
});

describe("HashMap.of", () => {
  it("creates a map from entries", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    expect(m.size).toBe(2);
    expect(m.get("a").unwrap()).toBe(1);
    expect(m.get("b").unwrap()).toBe(2);
  });

  it("last entry wins on duplicate keys", () => {
    const m = HashMap.of([
      ["a", 1],
      ["a", 2],
    ]);
    expect(m.size).toBe(1);
    expect(m.get("a").unwrap()).toBe(2);
  });
});

describe("HashMap.fromMap", () => {
  it("creates from a native Map", () => {
    const native = new Map([
      ["x", 10],
      ["y", 20],
    ]);
    const m = HashMap.fromMap(native);
    expect(m.size).toBe(2);
    expect(m.get("x").unwrap()).toBe(10);
  });
});

describe("HashMap.fromObject", () => {
  it("creates from a plain object", () => {
    const m = HashMap.fromObject({ name: "Alice", city: "Sydney" });
    expect(m.size).toBe(2);
    expect(m.get("name").unwrap()).toBe("Alice");
  });
});

// =============================================================================
// 2. get / has / set / delete
// =============================================================================

describe("get", () => {
  it("returns Some for existing key", () => {
    const m = HashMap.of([["a", 1]]);
    const v = m.get("a");
    expect(v.isSome).toBe(true);
    expect(v.unwrap()).toBe(1);
  });

  it("returns None for missing key", () => {
    const m = HashMap.empty();
    expect(m.get("nope").isNone).toBe(true);
  });
});

describe("has", () => {
  it("returns true for existing key", () => {
    const m = HashMap.of([["a", 1]]);
    expect(m.has("a")).toBe(true);
  });

  it("returns false for missing key", () => {
    expect(HashMap.empty().has("x")).toBe(false);
  });
});

describe("set", () => {
  it("adds a new entry", () => {
    const m = HashMap.empty().set("a", 1);
    expect(m.size).toBe(1);
    expect(m.get("a").unwrap()).toBe(1);
  });

  it("updates an existing entry", () => {
    const m = HashMap.of([["a", 1]]).set("a", 99);
    expect(m.size).toBe(1);
    expect(m.get("a").unwrap()).toBe(99);
  });

  it("does not mutate the original", () => {
    const m1 = HashMap.of([["a", 1]]);
    const m2 = m1.set("b", 2);
    expect(m1.size).toBe(1);
    expect(m1.has("b")).toBe(false);
    expect(m2.size).toBe(2);
  });

  it("returns same instance when setting identical value", () => {
    const m = HashMap.of([["a", 1]]);
    expect(m.set("a", 1)).toBe(m);
  });
});

describe("delete", () => {
  it("removes an existing entry", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]).delete("a");
    expect(m.size).toBe(1);
    expect(m.has("a")).toBe(false);
    expect(m.get("b").unwrap()).toBe(2);
  });

  it("returns same instance when deleting missing key", () => {
    const m = HashMap.of([["a", 1]]);
    expect(m.delete("zzz")).toBe(m);
  });

  it("does not mutate the original", () => {
    const m1 = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const m2 = m1.delete("a");
    expect(m1.size).toBe(2);
    expect(m2.size).toBe(1);
  });
});

// =============================================================================
// 3. Immutability / structural sharing
// =============================================================================

describe("structural sharing", () => {
  it("original is unchanged after set", () => {
    const m1 = HashMap.of([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const m2 = m1.set("d", 4);
    expect(m1.size).toBe(3);
    expect(m2.size).toBe(4);
    expect(m1.has("d")).toBe(false);
    expect(m2.has("d")).toBe(true);
  });

  it("original is unchanged after delete", () => {
    const m1 = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const m2 = m1.delete("a");
    expect(m1.size).toBe(2);
    expect(m2.size).toBe(1);
    expect(m1.has("a")).toBe(true);
  });
});

// =============================================================================
// 4. merge
// =============================================================================

describe("merge", () => {
  it("merges two maps (other wins on conflict)", () => {
    const a = HashMap.of([
      ["x", 1],
      ["y", 2],
    ]);
    const b = HashMap.of([
      ["y", 99],
      ["z", 3],
    ]);
    const merged = a.merge(b);
    expect(merged.size).toBe(3);
    expect(merged.get("x").unwrap()).toBe(1);
    expect(merged.get("y").unwrap()).toBe(99);
    expect(merged.get("z").unwrap()).toBe(3);
  });
});

// =============================================================================
// 5. map / filter / reduce / forEach
// =============================================================================

describe("map", () => {
  it("transforms values", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]).map(v => v * 10);
    expect(m.get("a").unwrap()).toBe(10);
    expect(m.get("b").unwrap()).toBe(20);
  });
});

describe("filter", () => {
  it("keeps matching entries", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]).filter(v => v > 1);
    expect(m.size).toBe(2);
    expect(m.has("a")).toBe(false);
    expect(m.has("b")).toBe(true);
  });
});

describe("reduce", () => {
  it("folds all entries", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const sum = m.reduce((acc, v) => acc + v, 0);
    expect(sum).toBe(6);
  });
});

describe("forEach", () => {
  it("visits every entry", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const keys = [];
    m.forEach((_v, k) => {
      keys.push(k);
    });
    expect(keys.length).toBe(2);
    expect(keys.includes("a")).toBe(true);
    expect(keys.includes("b")).toBe(true);
  });
});

// =============================================================================
// 6. find / every / some
// =============================================================================

describe("find", () => {
  it("returns Some for matching entry", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const found = m.find(v => v === 2);
    expect(found.isSome).toBe(true);
    expect(found.unwrap()).toEqual(["b", 2]);
  });

  it("returns None when no match", () => {
    const m = HashMap.of([["a", 1]]);
    expect(m.find(v => v === 999).isNone).toBe(true);
  });
});

describe("every", () => {
  it("returns true when all match", () => {
    const m = HashMap.of([
      ["a", 2],
      ["b", 4],
    ]);
    expect(m.every(v => v % 2 === 0)).toBe(true);
  });

  it("returns false when one fails", () => {
    const m = HashMap.of([
      ["a", 2],
      ["b", 3],
    ]);
    expect(m.every(v => v % 2 === 0)).toBe(false);
  });

  it("returns true for empty map", () => {
    expect(HashMap.empty().every(() => false)).toBe(true);
  });
});

describe("some", () => {
  it("returns true when at least one matches", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    expect(m.some(v => v === 2)).toBe(true);
  });

  it("returns false when none match", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    expect(m.some(v => v === 99)).toBe(false);
  });
});

// =============================================================================
// 7. Iteration: keys / values / entries / Symbol.iterator
// =============================================================================

describe("keys", () => {
  it("yields all keys", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const keys = [...m.keys()];
    expect(keys.length).toBe(2);
    expect(keys.includes("a")).toBe(true);
    expect(keys.includes("b")).toBe(true);
  });
});

describe("values", () => {
  it("yields all values", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const values = [...m.values()];
    expect(values.length).toBe(2);
    expect(values.includes(1)).toBe(true);
    expect(values.includes(2)).toBe(true);
  });
});

describe("entries", () => {
  it("yields [key, value] pairs", () => {
    const m = HashMap.of([["a", 1]]);
    const entries = [...m.entries()];
    expect(entries).toEqual([["a", 1]]);
  });
});

describe("Symbol.iterator", () => {
  it("supports for-of", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const pairs = [];
    for (const pair of m) {
      pairs.push(pair);
    }
    expect(pairs.length).toBe(2);
  });

  it("supports spread", () => {
    const m = HashMap.of([["x", 42]]);
    const arr = [...m];
    expect(arr).toEqual([["x", 42]]);
  });
});

// =============================================================================
// 8. equals
// =============================================================================

describe("equals", () => {
  it("returns true for identical maps", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    expect(m.equals(m)).toBe(true);
  });

  it("returns true for structurally equal maps", () => {
    const a = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const b = HashMap.of([
      ["b", 2],
      ["a", 1],
    ]);
    expect(a.equals(b)).toBe(true);
  });

  it("returns false for different sizes", () => {
    const a = HashMap.of([["a", 1]]);
    const b = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    expect(a.equals(b)).toBe(false);
  });

  it("returns false for different values", () => {
    const a = HashMap.of([["a", 1]]);
    const b = HashMap.of([["a", 2]]);
    expect(a.equals(b)).toBe(false);
  });

  it("returns false for different keys", () => {
    const a = HashMap.of([["a", 1]]);
    const b = HashMap.of([["b", 1]]);
    expect(a.equals(b)).toBe(false);
  });
});

// =============================================================================
// 9. toMap / toArray / toJSON / toString
// =============================================================================

describe("toMap", () => {
  it("converts to native Map", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const native = m.toMap();
    expect(native instanceof Map).toBe(true);
    expect(native.get("a")).toBe(1);
    expect(native.size).toBe(2);
  });
});

describe("toArray", () => {
  it("converts to [K, V][] array", () => {
    const m = HashMap.of([["a", 1]]);
    const arr = m.toArray();
    expect(arr).toEqual([["a", 1]]);
  });
});

describe("toJSON", () => {
  it("returns same as toArray", () => {
    const m = HashMap.of([["a", 1]]);
    expect(m.toJSON()).toEqual(m.toArray());
  });
});

describe("toString", () => {
  it("formats entries", () => {
    const m = HashMap.of([["a", 1]]);
    expect(m.toString()).toBe("HashMap(a => 1)");
  });

  it("formats empty map", () => {
    expect(HashMap.empty().toString()).toBe("HashMap()");
  });
});

// =============================================================================
// 10. HashMap.is
// =============================================================================

describe("HashMap.is", () => {
  it("returns true for HashMap", () => {
    expect(HashMap.is(HashMap.of([["a", 1]]))).toBe(true);
  });

  it("returns true for empty HashMap", () => {
    expect(HashMap.is(HashMap.empty())).toBe(true);
  });

  it("returns false for non-HashMap", () => {
    expect(HashMap.is(new Map())).toBe(false);
    expect(HashMap.is({})).toBe(false);
    expect(HashMap.is(null)).toBe(false);
  });
});

// =============================================================================
// 11. Non-string keys
// =============================================================================

describe("non-string keys", () => {
  it("supports number keys", () => {
    const m = HashMap.of([
      [1, "one"],
      [2, "two"],
    ]);
    expect(m.get(1).unwrap()).toBe("one");
    expect(m.get(2).unwrap()).toBe("two");
    expect(m.size).toBe(2);
  });

  it("supports object keys (by reference)", () => {
    const k1 = { id: 1 };
    const k2 = { id: 2 };
    const m = HashMap.of([
      [k1, "first"],
      [k2, "second"],
    ]);
    expect(m.get(k1).unwrap()).toBe("first");
    expect(m.size).toBe(2);
  });
});

// =============================================================================
// 12. Scale test
// =============================================================================

describe("scale", () => {
  it("handles 10,000 entries correctly", () => {
    let m = HashMap.empty();
    for (let i = 0; i < 10_000; i++) {
      m = m.set(`key-${i}`, i);
    }
    expect(m.size).toBe(10_000);
    expect(m.get("key-0").unwrap()).toBe(0);
    expect(m.get("key-9999").unwrap()).toBe(9999);
    expect(m.get("key-5000").unwrap()).toBe(5000);

    // Delete half
    for (let i = 0; i < 5_000; i++) {
      m = m.delete(`key-${i}`);
    }
    expect(m.size).toBe(5_000);
    expect(m.has("key-0")).toBe(false);
    expect(m.get("key-5000").unwrap()).toBe(5000);
  });
});

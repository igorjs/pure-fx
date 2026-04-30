/**
 * hash-map.test.js - Tests for immutable HashMap (HAMT-backed).
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/hash-map.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { HashMap } = await import("../dist/index.js");

// =============================================================================
// 1. Constructors
// =============================================================================

describe("HashMap.empty", () => {
  it("creates an empty map", () => {
    const m = HashMap.empty();
    assert.equal(m.size, 0);
  });
});

describe("HashMap.of", () => {
  it("creates a map from entries", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    assert.equal(m.size, 2);
    assert.equal(m.get("a").unwrap(), 1);
    assert.equal(m.get("b").unwrap(), 2);
  });

  it("last entry wins on duplicate keys", () => {
    const m = HashMap.of([
      ["a", 1],
      ["a", 2],
    ]);
    assert.equal(m.size, 1);
    assert.equal(m.get("a").unwrap(), 2);
  });
});

describe("HashMap.fromMap", () => {
  it("creates from a native Map", () => {
    const native = new Map([
      ["x", 10],
      ["y", 20],
    ]);
    const m = HashMap.fromMap(native);
    assert.equal(m.size, 2);
    assert.equal(m.get("x").unwrap(), 10);
  });
});

describe("HashMap.fromObject", () => {
  it("creates from a plain object", () => {
    const m = HashMap.fromObject({ name: "Alice", city: "Sydney" });
    assert.equal(m.size, 2);
    assert.equal(m.get("name").unwrap(), "Alice");
  });
});

// =============================================================================
// 2. get / has / set / delete
// =============================================================================

describe("get", () => {
  it("returns Some for existing key", () => {
    const m = HashMap.of([["a", 1]]);
    const v = m.get("a");
    assert.equal(v.isSome, true);
    assert.equal(v.unwrap(), 1);
  });

  it("returns None for missing key", () => {
    const m = HashMap.empty();
    assert.equal(m.get("nope").isNone, true);
  });
});

describe("has", () => {
  it("returns true for existing key", () => {
    const m = HashMap.of([["a", 1]]);
    assert.equal(m.has("a"), true);
  });

  it("returns false for missing key", () => {
    assert.equal(HashMap.empty().has("x"), false);
  });
});

describe("set", () => {
  it("adds a new entry", () => {
    const m = HashMap.empty().set("a", 1);
    assert.equal(m.size, 1);
    assert.equal(m.get("a").unwrap(), 1);
  });

  it("updates an existing entry", () => {
    const m = HashMap.of([["a", 1]]).set("a", 99);
    assert.equal(m.size, 1);
    assert.equal(m.get("a").unwrap(), 99);
  });

  it("does not mutate the original", () => {
    const m1 = HashMap.of([["a", 1]]);
    const m2 = m1.set("b", 2);
    assert.equal(m1.size, 1);
    assert.equal(m1.has("b"), false);
    assert.equal(m2.size, 2);
  });

  it("returns same instance when setting identical value", () => {
    const m = HashMap.of([["a", 1]]);
    assert.equal(m.set("a", 1), m);
  });
});

describe("delete", () => {
  it("removes an existing entry", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]).delete("a");
    assert.equal(m.size, 1);
    assert.equal(m.has("a"), false);
    assert.equal(m.get("b").unwrap(), 2);
  });

  it("returns same instance when deleting missing key", () => {
    const m = HashMap.of([["a", 1]]);
    assert.equal(m.delete("zzz"), m);
  });

  it("does not mutate the original", () => {
    const m1 = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const m2 = m1.delete("a");
    assert.equal(m1.size, 2);
    assert.equal(m2.size, 1);
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
    assert.equal(m1.size, 3);
    assert.equal(m2.size, 4);
    assert.equal(m1.has("d"), false);
    assert.equal(m2.has("d"), true);
  });

  it("original is unchanged after delete", () => {
    const m1 = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const m2 = m1.delete("a");
    assert.equal(m1.size, 2);
    assert.equal(m2.size, 1);
    assert.equal(m1.has("a"), true);
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
    assert.equal(merged.size, 3);
    assert.equal(merged.get("x").unwrap(), 1);
    assert.equal(merged.get("y").unwrap(), 99);
    assert.equal(merged.get("z").unwrap(), 3);
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
    assert.equal(m.get("a").unwrap(), 10);
    assert.equal(m.get("b").unwrap(), 20);
  });
});

describe("filter", () => {
  it("keeps matching entries", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]).filter(v => v > 1);
    assert.equal(m.size, 2);
    assert.equal(m.has("a"), false);
    assert.equal(m.has("b"), true);
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
    assert.equal(sum, 6);
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
    assert.equal(keys.length, 2);
    assert.ok(keys.includes("a"));
    assert.ok(keys.includes("b"));
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
    assert.equal(found.isSome, true);
    assert.deepEqual(found.unwrap(), ["b", 2]);
  });

  it("returns None when no match", () => {
    const m = HashMap.of([["a", 1]]);
    assert.equal(m.find(v => v === 999).isNone, true);
  });
});

describe("every", () => {
  it("returns true when all match", () => {
    const m = HashMap.of([
      ["a", 2],
      ["b", 4],
    ]);
    assert.equal(
      m.every(v => v % 2 === 0),
      true,
    );
  });

  it("returns false when one fails", () => {
    const m = HashMap.of([
      ["a", 2],
      ["b", 3],
    ]);
    assert.equal(
      m.every(v => v % 2 === 0),
      false,
    );
  });

  it("returns true for empty map", () => {
    assert.equal(
      HashMap.empty().every(() => false),
      true,
    );
  });
});

describe("some", () => {
  it("returns true when at least one matches", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    assert.equal(
      m.some(v => v === 2),
      true,
    );
  });

  it("returns false when none match", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    assert.equal(
      m.some(v => v === 99),
      false,
    );
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
    assert.equal(keys.length, 2);
    assert.ok(keys.includes("a"));
    assert.ok(keys.includes("b"));
  });
});

describe("values", () => {
  it("yields all values", () => {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    const values = [...m.values()];
    assert.equal(values.length, 2);
    assert.ok(values.includes(1));
    assert.ok(values.includes(2));
  });
});

describe("entries", () => {
  it("yields [key, value] pairs", () => {
    const m = HashMap.of([["a", 1]]);
    const entries = [...m.entries()];
    assert.deepEqual(entries, [["a", 1]]);
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
    assert.equal(pairs.length, 2);
  });

  it("supports spread", () => {
    const m = HashMap.of([["x", 42]]);
    const arr = [...m];
    assert.deepEqual(arr, [["x", 42]]);
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
    assert.equal(m.equals(m), true);
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
    assert.equal(a.equals(b), true);
  });

  it("returns false for different sizes", () => {
    const a = HashMap.of([["a", 1]]);
    const b = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    assert.equal(a.equals(b), false);
  });

  it("returns false for different values", () => {
    const a = HashMap.of([["a", 1]]);
    const b = HashMap.of([["a", 2]]);
    assert.equal(a.equals(b), false);
  });

  it("returns false for different keys", () => {
    const a = HashMap.of([["a", 1]]);
    const b = HashMap.of([["b", 1]]);
    assert.equal(a.equals(b), false);
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
    assert.ok(native instanceof Map);
    assert.equal(native.get("a"), 1);
    assert.equal(native.size, 2);
  });
});

describe("toArray", () => {
  it("converts to [K, V][] array", () => {
    const m = HashMap.of([["a", 1]]);
    const arr = m.toArray();
    assert.deepEqual(arr, [["a", 1]]);
  });
});

describe("toJSON", () => {
  it("returns same as toArray", () => {
    const m = HashMap.of([["a", 1]]);
    assert.deepEqual(m.toJSON(), m.toArray());
  });
});

describe("toString", () => {
  it("formats entries", () => {
    const m = HashMap.of([["a", 1]]);
    assert.equal(m.toString(), "HashMap(a => 1)");
  });

  it("formats empty map", () => {
    assert.equal(HashMap.empty().toString(), "HashMap()");
  });
});

// =============================================================================
// 10. HashMap.is
// =============================================================================

describe("HashMap.is", () => {
  it("returns true for HashMap", () => {
    assert.equal(HashMap.is(HashMap.of([["a", 1]])), true);
  });

  it("returns true for empty HashMap", () => {
    assert.equal(HashMap.is(HashMap.empty()), true);
  });

  it("returns false for non-HashMap", () => {
    assert.equal(HashMap.is(new Map()), false);
    assert.equal(HashMap.is({}), false);
    assert.equal(HashMap.is(null), false);
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
    assert.equal(m.get(1).unwrap(), "one");
    assert.equal(m.get(2).unwrap(), "two");
    assert.equal(m.size, 2);
  });

  it("supports object keys (by reference)", () => {
    const k1 = { id: 1 };
    const k2 = { id: 2 };
    const m = HashMap.of([
      [k1, "first"],
      [k2, "second"],
    ]);
    assert.equal(m.get(k1).unwrap(), "first");
    assert.equal(m.size, 2);
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
    assert.equal(m.size, 10_000);
    assert.equal(m.get("key-0").unwrap(), 0);
    assert.equal(m.get("key-9999").unwrap(), 9999);
    assert.equal(m.get("key-5000").unwrap(), 5000);

    // Delete half
    for (let i = 0; i < 5_000; i++) {
      m = m.delete(`key-${i}`);
    }
    assert.equal(m.size, 5_000);
    assert.equal(m.has("key-0"), false);
    assert.equal(m.get("key-5000").unwrap(), 5000);
  });
});

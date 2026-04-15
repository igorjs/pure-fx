/**
 * stable-vec.test.js - Tests for StableVec data structure.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/stable-vec.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { StableVec } = await import("../dist/index.js");

describe("StableVec", () => {
  it("insert and get", () => {
    const v = StableVec.create();
    const h = v.insert("hello");
    assert.ok(v.get(h).isSome);
    assert.equal(v.get(h).unwrap(), "hello");
    assert.equal(v.length, 1);
  });

  it("remove invalidates handle", () => {
    const v = StableVec.create();
    const h = v.insert(42);
    assert.equal(v.remove(h), true);
    assert.ok(v.get(h).isNone);
    assert.equal(v.isValid(h), false);
    assert.equal(v.length, 0);
  });

  it("remove returns false for stale handle", () => {
    const v = StableVec.create();
    const h = v.insert(1);
    v.remove(h);
    assert.equal(v.remove(h), false);
  });

  it("slot reuse bumps generation", () => {
    const v = StableVec.create();
    const h1 = v.insert("first");
    v.remove(h1);
    const h2 = v.insert("second");
    assert.equal(h2.index, h1.index);
    assert.equal(h2.generation, h1.generation + 1);
    assert.ok(v.get(h1).isNone);
    assert.equal(v.get(h2).unwrap(), "second");
  });

  it("remove keeps data dense via swap", () => {
    const v = StableVec.create();
    const h1 = v.insert("a");
    const h2 = v.insert("b");
    const h3 = v.insert("c");
    v.remove(h2);
    assert.equal(v.length, 2);
    assert.equal(v.get(h1).unwrap(), "a");
    assert.equal(v.get(h3).unwrap(), "c");
    assert.ok(v.get(h2).isNone);
  });

  it("iterates over dense data", () => {
    const v = StableVec.create();
    v.insert(10);
    v.insert(20);
    v.insert(30);
    const items = [...v];
    assert.equal(items.length, 3);
    assert.ok(items.includes(10));
    assert.ok(items.includes(20));
    assert.ok(items.includes(30));
  });

  it("iterate after removals has no gaps", () => {
    const v = StableVec.create();
    v.insert(1);
    const h2 = v.insert(2);
    v.insert(3);
    v.insert(4);
    v.remove(h2);
    const items = [...v];
    assert.equal(items.length, 3);
    assert.ok(items.every(n => typeof n === "number"));
  });

  it("entries yields handle-value pairs", () => {
    const v = StableVec.create();
    v.insert("x");
    v.insert("y");
    const entries = [...v.entries()];
    assert.equal(entries.length, 2);
    assert.ok(entries.some(([h, val]) => val === "x" && v.isValid(h)));
    assert.ok(entries.some(([h, val]) => val === "y" && v.isValid(h)));
  });

  it("forEach visits all live elements", () => {
    const v = StableVec.create();
    v.insert(1);
    v.insert(2);
    v.insert(3);
    let sum = 0;
    v.forEach(val => {
      sum += val;
    });
    assert.equal(sum, 6);
  });

  it("toArray returns snapshot", () => {
    const v = StableVec.create();
    v.insert(10);
    v.insert(20);
    const arr = v.toArray();
    assert.equal(arr.length, 2);
    arr.push(30);
    assert.equal(v.length, 2);
  });

  it("clear removes all and frees slots", () => {
    const v = StableVec.create();
    const h1 = v.insert(1);
    const h2 = v.insert(2);
    v.clear();
    assert.equal(v.length, 0);
    assert.equal(v.isValid(h1), false);
    assert.equal(v.isValid(h2), false);
    const h3 = v.insert(3);
    assert.equal(v.get(h3).unwrap(), 3);
  });

  it("capacity tracks total slots including free", () => {
    const v = StableVec.create();
    assert.equal(v.capacity, 0);
    const h1 = v.insert(1);
    v.insert(2);
    assert.equal(v.capacity, 2);
    v.remove(h1);
    assert.equal(v.capacity, 2);
    assert.equal(v.length, 1);
  });

  it("many insert-remove cycles reuse slots", () => {
    const v = StableVec.create();
    const handles = [];
    for (let i = 0; i < 100; i++) handles.push(v.insert(i));
    for (const h of handles) v.remove(h);
    assert.equal(v.length, 0);
    assert.equal(v.capacity, 100);
    for (let i = 0; i < 100; i++) v.insert(i + 1000);
    assert.equal(v.length, 100);
    assert.equal(v.capacity, 100);
  });
});

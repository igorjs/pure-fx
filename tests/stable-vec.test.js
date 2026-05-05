/**
 * stable-vec.test.js - Tests for StableVec data structure.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const { StableVec } = await import("../dist/index.js");

describe("StableVec", () => {
  it("insert and get", () => {
    const v = StableVec.create();
    const h = v.insert("hello");
    expect(v.get(h).isSome).toBe(true);
    expect(v.get(h).unwrap()).toBe("hello");
    expect(v.length).toBe(1);
  });

  it("remove invalidates handle", () => {
    const v = StableVec.create();
    const h = v.insert(42);
    expect(v.remove(h)).toBe(true);
    expect(v.get(h).isNone).toBe(true);
    expect(v.isValid(h)).toBe(false);
    expect(v.length).toBe(0);
  });

  it("remove returns false for stale handle", () => {
    const v = StableVec.create();
    const h = v.insert(1);
    v.remove(h);
    expect(v.remove(h)).toBe(false);
  });

  it("slot reuse bumps generation", () => {
    const v = StableVec.create();
    const h1 = v.insert("first");
    v.remove(h1);
    const h2 = v.insert("second");
    expect(h2.index).toBe(h1.index);
    expect(h2.generation).toBe(h1.generation + 1);
    expect(v.get(h1).isNone).toBe(true);
    expect(v.get(h2).unwrap()).toBe("second");
  });

  it("remove keeps data dense via swap", () => {
    const v = StableVec.create();
    const h1 = v.insert("a");
    const h2 = v.insert("b");
    const h3 = v.insert("c");
    v.remove(h2);
    expect(v.length).toBe(2);
    expect(v.get(h1).unwrap()).toBe("a");
    expect(v.get(h3).unwrap()).toBe("c");
    expect(v.get(h2).isNone).toBe(true);
  });

  it("iterates over dense data", () => {
    const v = StableVec.create();
    v.insert(10);
    v.insert(20);
    v.insert(30);
    const items = [...v];
    expect(items.length).toBe(3);
    expect(items).toContain(10);
    expect(items).toContain(20);
    expect(items).toContain(30);
  });

  it("iterate after removals has no gaps", () => {
    const v = StableVec.create();
    v.insert(1);
    const h2 = v.insert(2);
    v.insert(3);
    v.insert(4);
    v.remove(h2);
    const items = [...v];
    expect(items.length).toBe(3);
    expect(items.every(n => typeof n === "number")).toBe(true);
  });

  it("entries yields handle-value pairs", () => {
    const v = StableVec.create();
    v.insert("x");
    v.insert("y");
    const entries = [...v.entries()];
    expect(entries.length).toBe(2);
    expect(entries.some(([h, val]) => val === "x" && v.isValid(h))).toBe(true);
    expect(entries.some(([h, val]) => val === "y" && v.isValid(h))).toBe(true);
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
    expect(sum).toBe(6);
  });

  it("toArray returns snapshot", () => {
    const v = StableVec.create();
    v.insert(10);
    v.insert(20);
    const arr = v.toArray();
    expect(arr.length).toBe(2);
    arr.push(30);
    expect(v.length).toBe(2);
  });

  it("clear removes all and frees slots", () => {
    const v = StableVec.create();
    const h1 = v.insert(1);
    const h2 = v.insert(2);
    v.clear();
    expect(v.length).toBe(0);
    expect(v.isValid(h1)).toBe(false);
    expect(v.isValid(h2)).toBe(false);
    const h3 = v.insert(3);
    expect(v.get(h3).unwrap()).toBe(3);
  });

  it("capacity tracks total slots including free", () => {
    const v = StableVec.create();
    expect(v.capacity).toBe(0);
    const h1 = v.insert(1);
    v.insert(2);
    expect(v.capacity).toBe(2);
    v.remove(h1);
    expect(v.capacity).toBe(2);
    expect(v.length).toBe(1);
  });

  it("many insert-remove cycles reuse slots", () => {
    const v = StableVec.create();
    const handles = [];
    for (let i = 0; i < 100; i++) handles.push(v.insert(i));
    for (const h of handles) v.remove(h);
    expect(v.length).toBe(0);
    expect(v.capacity).toBe(100);
    for (let i = 0; i < 100; i++) v.insert(i + 1000);
    expect(v.length).toBe(100);
    expect(v.capacity).toBe(100);
  });
});

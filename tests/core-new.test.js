/**
 * core-new.test.js - Tests for Eq, Ord, Match, State, Lens, optics,
 * Result/Option traverse/sequence, Task traverse/sequence/ap,
 * and List sortByOrd/uniqBy/groupBy.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Eq,
  Ord,
  Match,
  State,
  Lens,
  LensOptional,
  Prism,
  Traversal,
  Iso,
  Ok,
  Err,
  Some,
  None,
  Result,
  Option,
  Task,
  List,
  ErrType,
  pipe,
} = await import("../dist/index.js");

// =============================================================================
// 1. Eq
// =============================================================================

describe("Eq", () => {
  describe("Eq.string", () => {
    it("returns true for equal strings", () => {
      expect(Eq.string.equals("hello", "hello")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(Eq.string.equals("hello", "world")).toBe(false);
    });

    it("returns true for empty strings", () => {
      expect(Eq.string.equals("", "")).toBe(true);
    });

    it("is case-sensitive", () => {
      expect(Eq.string.equals("Hello", "hello")).toBe(false);
    });
  });

  describe("Eq.number", () => {
    it("returns true for equal numbers", () => {
      expect(Eq.number.equals(42, 42)).toBe(true);
    });

    it("returns false for different numbers", () => {
      expect(Eq.number.equals(1, 2)).toBe(false);
    });

    it("handles zero", () => {
      expect(Eq.number.equals(0, 0)).toBe(true);
    });

    it("handles negative numbers", () => {
      expect(Eq.number.equals(-5, -5)).toBe(true);
      expect(Eq.number.equals(-5, 5)).toBe(false);
    });

    it("handles floating point", () => {
      expect(Eq.number.equals(0.1 + 0.2, 0.3)).toBe(false);
    });
  });

  describe("Eq.boolean", () => {
    it("returns true for equal booleans", () => {
      expect(Eq.boolean.equals(true, true)).toBe(true);
      expect(Eq.boolean.equals(false, false)).toBe(true);
    });

    it("returns false for different booleans", () => {
      expect(Eq.boolean.equals(true, false)).toBe(false);
      expect(Eq.boolean.equals(false, true)).toBe(false);
    });
  });

  describe("Eq.date", () => {
    it("returns true for dates with the same timestamp", () => {
      const d1 = new Date("2024-01-01");
      const d2 = new Date("2024-01-01");
      expect(Eq.date.equals(d1, d2)).toBe(true);
    });

    it("returns false for different dates", () => {
      const d1 = new Date("2024-01-01");
      const d2 = new Date("2024-06-15");
      expect(Eq.date.equals(d1, d2)).toBe(false);
    });

    it("compares by time value, not reference", () => {
      const d1 = new Date(1000);
      const d2 = new Date(1000);
      expect(d1).not.toBe(d2);
      expect(Eq.date.equals(d1, d2)).toBe(true);
    });
  });

  describe("Eq.struct", () => {
    it("compares flat structs field-by-field", () => {
      const eqUser = Eq.struct({ id: Eq.number, name: Eq.string });
      expect(eqUser.equals({ id: 1, name: "Alice" }, { id: 1, name: "Alice" })).toBe(true);
      expect(eqUser.equals({ id: 1, name: "Alice" }, { id: 2, name: "Alice" })).toBe(false);
      expect(eqUser.equals({ id: 1, name: "Alice" }, { id: 1, name: "Bob" })).toBe(false);
    });

    it("supports nested structs", () => {
      const eqAddress = Eq.struct({ city: Eq.string, zip: Eq.string });
      const eqUser = Eq.struct({ name: Eq.string, address: eqAddress });

      const u1 = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const u2 = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const u3 = { name: "Alice", address: { city: "Sydney", zip: "2000" } };

      expect(eqUser.equals(u1, u2)).toBe(true);
      expect(eqUser.equals(u1, u3)).toBe(false);
    });

    it("returns true for empty struct", () => {
      const eqEmpty = Eq.struct({});
      expect(eqEmpty.equals({}, {})).toBe(true);
    });
  });

  describe("Eq.contramap", () => {
    it("derives equality through a projection function", () => {
      const eqByLength = Eq.contramap(Eq.number, s => s.length);
      expect(eqByLength.equals("abc", "def")).toBe(true);
      expect(eqByLength.equals("abc", "ab")).toBe(false);
    });

    it("derives Eq for objects by projecting a field", () => {
      const eqById = Eq.contramap(Eq.number, u => u.id);
      expect(eqById.equals({ id: 1, name: "Alice" }, { id: 1, name: "Bob" })).toBe(true);
      expect(eqById.equals({ id: 1 }, { id: 2 })).toBe(false);
    });
  });

  describe("Eq (callable factory)", () => {
    it("creates a custom Eq from a function", () => {
      const eqModulo = Eq((a, b) => a % 3 === b % 3);
      expect(eqModulo.equals(4, 7)).toBe(true);
      expect(eqModulo.equals(4, 5)).toBe(false);
    });
  });

  describe("frozen instances", () => {
    it("built-in Eq instances are frozen", () => {
      expect(Object.isFrozen(Eq.string)).toBe(true);
      expect(Object.isFrozen(Eq.number)).toBe(true);
      expect(Object.isFrozen(Eq.boolean)).toBe(true);
      expect(Object.isFrozen(Eq.date)).toBe(true);
    });

    it("Eq.struct returns a frozen instance", () => {
      const eq = Eq.struct({ x: Eq.number });
      expect(Object.isFrozen(eq)).toBe(true);
    });

    it("Eq.contramap returns a frozen instance", () => {
      const eq = Eq.contramap(Eq.number, s => s.length);
      expect(Object.isFrozen(eq)).toBe(true);
    });

    it("Eq factory returns a frozen instance", () => {
      const eq = Eq((a, b) => a === b);
      expect(Object.isFrozen(eq)).toBe(true);
    });
  });
});

// =============================================================================
// 2. Ord
// =============================================================================

describe("Ord", () => {
  describe("Ord.number", () => {
    it("returns -1 when a < b", () => {
      expect(Ord.number.compare(1, 2)).toBe(-1);
    });

    it("returns 0 when a === b", () => {
      expect(Ord.number.compare(5, 5)).toBe(0);
    });

    it("returns 1 when a > b", () => {
      expect(Ord.number.compare(10, 3)).toBe(1);
    });

    it("handles negative numbers", () => {
      expect(Ord.number.compare(-5, -3)).toBe(-1);
      expect(Ord.number.compare(-3, -5)).toBe(1);
    });

    it("derives equals from compare", () => {
      expect(Ord.number.equals(5, 5)).toBe(true);
      expect(Ord.number.equals(5, 6)).toBe(false);
    });
  });

  describe("Ord.string", () => {
    it("compares strings lexicographically", () => {
      expect(Ord.string.compare("apple", "banana")).toBe(-1);
      expect(Ord.string.compare("banana", "apple")).toBe(1);
      expect(Ord.string.compare("same", "same")).toBe(0);
    });

    it("handles empty strings", () => {
      expect(Ord.string.compare("", "a")).toBe(-1);
      expect(Ord.string.compare("a", "")).toBe(1);
      expect(Ord.string.compare("", "")).toBe(0);
    });
  });

  describe("Ord.date", () => {
    it("compares dates by time value", () => {
      const earlier = new Date("2024-01-01");
      const later = new Date("2024-12-31");
      expect(Ord.date.compare(earlier, later)).toBe(-1);
      expect(Ord.date.compare(later, earlier)).toBe(1);
      expect(Ord.date.compare(earlier, new Date("2024-01-01"))).toBe(0);
    });
  });

  describe("Ord.reverse", () => {
    it("reverses the ordering", () => {
      const reversed = Ord.reverse(Ord.number);
      expect(reversed.compare(1, 2)).toBe(1);
      expect(reversed.compare(2, 1)).toBe(-1);
      expect(reversed.compare(5, 5)).toBe(0);
    });

    it("double reverse restores original ordering", () => {
      const doubleReversed = Ord.reverse(Ord.reverse(Ord.number));
      expect(doubleReversed.compare(1, 2)).toBe(-1);
      expect(doubleReversed.compare(2, 1)).toBe(1);
    });
  });

  describe("Ord.contramap", () => {
    it("derives ordering through a projection function", () => {
      const byAge = Ord.contramap(Ord.number, u => u.age);
      expect(byAge.compare({ age: 20 }, { age: 30 })).toBe(-1);
      expect(byAge.compare({ age: 30 }, { age: 20 })).toBe(1);
      expect(byAge.compare({ age: 25 }, { age: 25 })).toBe(0);
    });

    it("derives ordering by string length", () => {
      const byLength = Ord.contramap(Ord.number, s => s.length);
      expect(byLength.compare("ab", "abc")).toBe(-1);
      expect(byLength.compare("abc", "ab")).toBe(1);
      expect(byLength.compare("ab", "cd")).toBe(0);
    });
  });

  describe("Ord.min", () => {
    it("returns the smaller of two values", () => {
      const min = Ord.min(Ord.number);
      expect(min(3, 7)).toBe(3);
      expect(min(7, 3)).toBe(3);
    });

    it("returns the first value when equal", () => {
      const min = Ord.min(Ord.number);
      expect(min(5, 5)).toBe(5);
    });

    it("works with strings", () => {
      const min = Ord.min(Ord.string);
      expect(min("banana", "apple")).toBe("apple");
    });
  });

  describe("Ord.max", () => {
    it("returns the larger of two values", () => {
      const max = Ord.max(Ord.number);
      expect(max(3, 7)).toBe(7);
      expect(max(7, 3)).toBe(7);
    });

    it("returns the first value when equal", () => {
      const max = Ord.max(Ord.number);
      expect(max(5, 5)).toBe(5);
    });

    it("works with strings", () => {
      const max = Ord.max(Ord.string);
      expect(max("apple", "banana")).toBe("banana");
    });
  });

  describe("Ord.clamp", () => {
    it("returns value when within bounds", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      expect(clamp(50)).toBe(50);
    });

    it("clamps to low when below", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      expect(clamp(-10)).toBe(0);
    });

    it("clamps to high when above", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      expect(clamp(150)).toBe(100);
    });

    it("returns boundary values when at boundary", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      expect(clamp(0)).toBe(0);
      expect(clamp(100)).toBe(100);
    });

    it("works with strings", () => {
      const clamp = Ord.clamp(Ord.string, "b", "d");
      expect(clamp("a")).toBe("b");
      expect(clamp("c")).toBe("c");
      expect(clamp("e")).toBe("d");
    });
  });

  describe("Ord.between", () => {
    it("returns true when value is within bounds", () => {
      const between = Ord.between(Ord.number, 0, 100);
      expect(between(50)).toBe(true);
    });

    it("returns true at exact boundaries", () => {
      const between = Ord.between(Ord.number, 0, 100);
      expect(between(0)).toBe(true);
      expect(between(100)).toBe(true);
    });

    it("returns false when below lower bound", () => {
      const between = Ord.between(Ord.number, 0, 100);
      expect(between(-1)).toBe(false);
    });

    it("returns false when above upper bound", () => {
      const between = Ord.between(Ord.number, 0, 100);
      expect(between(101)).toBe(false);
    });
  });

  describe("Ord (callable factory)", () => {
    it("creates a custom Ord from a compare function", () => {
      const byAbsValue = Ord((a, b) => Math.abs(a) - Math.abs(b));
      expect(byAbsValue.compare(-3, 2)).toBe(1);
      expect(byAbsValue.compare(2, -3)).toBe(-1);
      expect(byAbsValue.compare(-3, 3)).toBe(0);
    });

    it("normalises compare result to -1, 0, or 1", () => {
      const ord = Ord((a, b) => a - b); // may return values other than -1/0/1
      expect(ord.compare(1, 100)).toBe(-1);
      expect(ord.compare(100, 1)).toBe(1);
      expect(ord.compare(5, 5)).toBe(0);
    });
  });

  describe("frozen instances", () => {
    it("built-in Ord instances are frozen", () => {
      expect(Object.isFrozen(Ord.number)).toBe(true);
      expect(Object.isFrozen(Ord.string)).toBe(true);
      expect(Object.isFrozen(Ord.date)).toBe(true);
    });
  });
});

// =============================================================================
// 3. Match
// =============================================================================

describe("Match", () => {
  describe("tag-based matching with .with()", () => {
    it("matches Ok tag", () => {
      const result = Match(Ok(42))
        .with({ tag: "Ok" }, r => r.value * 2)
        .with({ tag: "Err" }, r => 0)
        .exhaustive();

      expect(result).toBe(84);
    });

    it("matches Err tag", () => {
      const result = Match(Err("fail"))
        .with({ tag: "Ok" }, r => r.value)
        .with({ tag: "Err" }, r => `Error: ${r.error}`)
        .exhaustive();

      expect(result).toBe("Error: fail");
    });

    it("matches Option tags", () => {
      const matchSome = Match(Some(10))
        .with({ tag: "Some" }, o => o.value + 5)
        .with({ tag: "None" }, () => -1)
        .exhaustive();

      expect(matchSome).toBe(15);

      const matchNone = Match(None)
        .with({ tag: "Some" }, o => o.value)
        .with({ tag: "None" }, () => -1)
        .exhaustive();

      expect(matchNone).toBe(-1);
    });
  });

  describe(".when() predicate guards", () => {
    it("matches the first true predicate", () => {
      const label = Match(95)
        .when(
          n => n >= 90,
          () => "A",
        )
        .when(
          n => n >= 80,
          () => "B",
        )
        .when(
          n => n >= 70,
          () => "C",
        )
        .otherwise(() => "F");

      expect(label).toBe("A");
    });

    it("falls through to later predicates", () => {
      const label = Match(85)
        .when(
          n => n >= 90,
          () => "A",
        )
        .when(
          n => n >= 80,
          () => "B",
        )
        .otherwise(() => "F");

      expect(label).toBe("B");
    });

    it("reaches otherwise when no predicate matches", () => {
      const label = Match(50)
        .when(
          n => n >= 90,
          () => "A",
        )
        .when(
          n => n >= 80,
          () => "B",
        )
        .otherwise(() => "F");

      expect(label).toBe("F");
    });
  });

  describe(".otherwise() fallback", () => {
    it("provides a catch-all for unmatched values", () => {
      const result = Match({ tag: "Unknown", data: 123 })
        .with({ tag: "Ok" }, () => "ok")
        .with({ tag: "Err" }, () => "err")
        .otherwise(v => `fallback: ${v.tag}`);

      expect(result).toBe("fallback: Unknown");
    });

    it("is not reached when a prior arm matches", () => {
      const result = Match(Ok(1))
        .with({ tag: "Ok" }, r => r.value)
        .otherwise(() => -1);

      expect(result).toBe(1);
    });
  });

  describe(".exhaustive()", () => {
    it("succeeds when all variants are handled", () => {
      const result = Match(Ok(10))
        .with({ tag: "Ok" }, r => r.value)
        .with({ tag: "Err" }, () => 0)
        .exhaustive();

      expect(result).toBe(10);
    });

    it("throws TypeError when no pattern matches", () => {
      expect(() => {
        Match({ tag: "Unexpected" })
          .with({ tag: "Ok" }, () => 1)
          .with({ tag: "Err" }, () => 2)
          .exhaustive();
      }).toThrow();
    });
  });

  describe("chaining multiple .with() arms", () => {
    it("handles many tag-based arms", () => {
      const classify = value =>
        Match(value)
          .with({ tag: "Ok" }, r => `ok:${r.value}`)
          .with({ tag: "Err" }, r => `err:${r.error}`)
          .otherwise(() => "unknown");

      expect(classify(Ok("yes"))).toBe("ok:yes");
      expect(classify(Err("no"))).toBe("err:no");
      expect(classify({ tag: "Other" })).toBe("unknown");
    });

    it("mixes .with() and .when() arms", () => {
      const result = Match(Ok(42))
        .with({ tag: "Err" }, () => "error")
        .when(
          v => v.tag === "Ok" && v.value > 100,
          () => "large ok",
        )
        .with({ tag: "Ok" }, r => `ok:${r.value}`)
        .exhaustive();

      expect(result).toBe("ok:42");
    });
  });

  describe("matching non-tagged values", () => {
    it("uses .when() for primitive matching", () => {
      const result = Match("hello")
        .when(
          s => s.length > 10,
          () => "long",
        )
        .when(
          s => s.length > 3,
          () => "medium",
        )
        .otherwise(() => "short");

      expect(result).toBe("medium");
    });
  });
});

// =============================================================================
// 4. State
// =============================================================================

describe("State", () => {
  describe("State.of", () => {
    it("wraps a value without modifying state", () => {
      const s = State.of(42);
      const [value, state] = s.run("initial");
      expect(value).toBe(42);
      expect(state).toBe("initial");
    });

    it("works with different state types", () => {
      const s = State.of("hello");
      const [value, state] = s.run(0);
      expect(value).toBe("hello");
      expect(state).toBe(0);
    });
  });

  describe("State.get", () => {
    it("reads the current state as the value", () => {
      const s = State.get();
      const [value, state] = s.run(99);
      expect(value).toBe(99);
      expect(state).toBe(99);
    });

    it("does not modify the state", () => {
      const s = State.get();
      const [_, state] = s.run("keep");
      expect(state).toBe("keep");
    });
  });

  describe("State.set", () => {
    it("replaces the state", () => {
      const s = State.set("new");
      const [value, state] = s.run("old");
      expect(value).toBe(undefined);
      expect(state).toBe("new");
    });
  });

  describe("State.modify", () => {
    it("transforms the state via a function", () => {
      const s = State.modify(n => n + 1);
      const [value, state] = s.run(10);
      expect(value).toBe(undefined);
      expect(state).toBe(11);
    });

    it("applies transformation correctly", () => {
      const double = State.modify(n => n * 2);
      const [_, state] = double.run(5);
      expect(state).toBe(10);
    });
  });

  describe(".map", () => {
    it("transforms the produced value", () => {
      const s = State.of(10).map(n => n * 3);
      const [value, state] = s.run("s");
      expect(value).toBe(30);
      expect(state).toBe("s");
    });
  });

  describe(".flatMap", () => {
    it("chains state computations", () => {
      const s = State.get()
        .flatMap(n => State.set(n + 1))
        .flatMap(() => State.get());

      const [value, state] = s.run(10);
      expect(value).toBe(11);
      expect(state).toBe(11);
    });

    it("threads state through multiple steps", () => {
      const increment = State.get().flatMap(n => State.set(n + 1).map(() => n));

      const program = increment.flatMap(first => increment.map(second => [first, second]));

      const [values, finalState] = program.run(0);
      expect(values).toEqual([0, 1]);
      expect(finalState).toBe(2);
    });
  });

  describe(".tap", () => {
    it("runs a side-effect without modifying the computation", () => {
      const sideEffects = [];
      const s = State.of(42).tap(v => sideEffects.push(v));
      const [value, state] = s.run("s");
      expect(value).toBe(42);
      expect(state).toBe("s");
      expect(sideEffects).toEqual([42]);
    });
  });

  describe(".eval", () => {
    it("returns only the value, discarding final state", () => {
      const value = State.of(42).eval("ignored");
      expect(value).toBe(42);
    });

    it("discards state changes", () => {
      const value = State.modify(n => n + 100)
        .flatMap(() => State.of("result"))
        .eval(0);
      expect(value).toBe("result");
    });
  });

  describe(".exec", () => {
    it("returns only the final state, discarding the value", () => {
      const finalState = State.modify(n => n + 5).exec(10);
      expect(finalState).toBe(15);
    });

    it("discards the produced value", () => {
      const finalState = State.of("ignored").exec(42);
      expect(finalState).toBe(42);
    });
  });

  describe("composing multiple state operations", () => {
    it("counter increment example", () => {
      const counter = State.get().flatMap(n => State.set(n + 1).map(() => n));

      // Run three times to get three increments
      const program = counter.flatMap(a => counter.flatMap(b => counter.map(c => [a, b, c])));

      const [values, finalState] = program.run(0);
      expect(values).toEqual([0, 1, 2]);
      expect(finalState).toBe(3);
    });

    it("stack push/pop example", () => {
      const push = n => State.modify(s => [...s, n]);
      const pop = State.get().flatMap(s =>
        s.length > 0 ? State.set(s.slice(0, -1)).map(() => s[s.length - 1]) : State.of(undefined),
      );

      const program = push(1)
        .flatMap(() => push(2))
        .flatMap(() => push(3))
        .flatMap(() => pop);

      const [value, state] = program.run([]);
      expect(value).toBe(3);
      expect(state).toEqual([1, 2]);
    });
  });
});

// =============================================================================
// 5. Lens / LensOptional / Prism / Traversal
// =============================================================================

describe("Lens", () => {
  describe("Lens.prop", () => {
    it("gets a property from an object", () => {
      const name = Lens.prop()("name");
      expect(name.get({ name: "Alice", age: 30 })).toBe("Alice");
    });

    it("sets a property on an object immutably", () => {
      const name = Lens.prop()("name");
      const original = { name: "Alice", age: 30 };
      const updated = name.set("Bob")(original);
      expect(updated.name).toBe("Bob");
      expect(updated.age).toBe(30);
      expect(original.name).toBe("Alice");
    });

    it("modifies a property on an object immutably", () => {
      const name = Lens.prop()("name");
      const result = name.modify(s => s.toUpperCase())({ name: "alice", age: 30 });
      expect(result.name).toBe("ALICE");
      expect(result.age).toBe(30);
    });

    it("works with nested objects via get", () => {
      const address = Lens.prop()("address");
      const obj = { address: { city: "Melbourne" } };
      expect(address.get(obj)).toEqual({ city: "Melbourne" });
    });
  });

  describe("Lens.compose", () => {
    it("composes two lenses for deep access", () => {
      const address = Lens.prop()("address");
      const city = Lens.prop()("city");
      const deepCity = address.compose(city);

      const user = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };

      expect(deepCity.get(user)).toBe("Melbourne");
    });

    it("sets deeply nested property immutably", () => {
      const address = Lens.prop()("address");
      const city = Lens.prop()("city");
      const deepCity = address.compose(city);

      const user = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const updated = deepCity.set("Sydney")(user);

      expect(updated.address.city).toBe("Sydney");
      expect(updated.address.zip).toBe("3000");
      expect(updated.name).toBe("Alice");
      expect(user.address.city).toBe("Melbourne");
    });

    it("modifies deeply nested property", () => {
      const address = Lens.prop()("address");
      const city = Lens.prop()("city");
      const deepCity = address.compose(city);

      const user = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const updated = deepCity.modify(c => c.toUpperCase())(user);

      expect(updated.address.city).toBe("MELBOURNE");
    });
  });

  describe("Lens.id", () => {
    it("identity lens gets the whole object", () => {
      const id = Lens.id();
      const obj = { a: 1, b: 2 };
      expect(id.get(obj)).toEqual(obj);
    });

    it("identity lens set replaces the whole object", () => {
      const id = Lens.id();
      const original = { a: 1 };
      const replacement = { a: 99 };
      const result = id.set(replacement)(original);
      expect(result).toEqual(replacement);
    });

    it("identity lens modify transforms the whole object", () => {
      const id = Lens.id();
      const result = id.modify(obj => ({ ...obj, added: true }))({ x: 1 });
      expect(result).toEqual({ x: 1, added: true });
    });

    it("composing with id is a no-op", () => {
      const name = Lens.prop()("name");
      const composed = Lens.id().compose(name);
      expect(composed.get({ name: "test" })).toBe("test");
    });
  });

  describe("Lens.from", () => {
    it("creates a custom lens from get/set", () => {
      const headLens = Lens.from(
        arr => arr[0],
        (value, arr) => [value, ...arr.slice(1)],
      );

      expect(headLens.get([10, 20, 30])).toBe(10);
      expect(headLens.set(99)([10, 20, 30])).toEqual([99, 20, 30]);
    });
  });
});

describe("LensOptional", () => {
  describe("LensOptional.index", () => {
    it("gets from a valid index", () => {
      const at1 = LensOptional.index(1);
      const result = at1.getOption([10, 20, 30]);
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe(20);
    });

    it("returns None for out-of-bounds index", () => {
      const at5 = LensOptional.index(5);
      const result = at5.getOption([10, 20, 30]);
      expect(result.isNone).toBe(true);
    });

    it("returns None for empty array", () => {
      const at0 = LensOptional.index(0);
      expect(at0.getOption([]).isNone).toBe(true);
    });

    it("supports negative indices", () => {
      const atLast = LensOptional.index(-1);
      const result = atLast.getOption([10, 20, 30]);
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe(30);
    });

    it("returns None for negative index beyond array length", () => {
      const atNeg5 = LensOptional.index(-5);
      expect(atNeg5.getOption([10, 20]).isNone).toBe(true);
    });

    it("sets at a valid index immutably", () => {
      const at1 = LensOptional.index(1);
      const original = [10, 20, 30];
      const updated = at1.set(99)(original);
      expect(updated).toEqual([10, 99, 30]);
      expect(original).toEqual([10, 20, 30]);
    });

    it("returns original array when setting at out-of-bounds index", () => {
      const at5 = LensOptional.index(5);
      const original = [10, 20];
      const result = at5.set(99)(original);
      expect(result).toEqual([10, 20]);
    });

    it("modifies at a valid index", () => {
      const at0 = LensOptional.index(0);
      const result = at0.modify(n => n * 10)([5, 6, 7]);
      expect(result).toEqual([50, 6, 7]);
    });

    it("modify is a no-op for out-of-bounds index", () => {
      const at5 = LensOptional.index(5);
      const original = [1, 2];
      const result = at5.modify(n => n * 10)(original);
      expect(result).toBe(original);
    });
  });

  describe("LensOptional.fromNullable", () => {
    it("returns Some when the field is present", () => {
      const bio = LensOptional.fromNullable()("bio");
      const user = { name: "Alice", bio: "Developer" };
      const result = bio.getOption(user);
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe("Developer");
    });

    it("returns None when the field is null", () => {
      const bio = LensOptional.fromNullable()("bio");
      const user = { name: "Alice", bio: null };
      expect(bio.getOption(user).isNone).toBe(true);
    });

    it("returns None when the field is undefined", () => {
      const bio = LensOptional.fromNullable()("bio");
      const user = { name: "Alice", bio: undefined };
      expect(bio.getOption(user).isNone).toBe(true);
    });

    it("sets a nullable field", () => {
      const bio = LensOptional.fromNullable()("bio");
      const updated = bio.set("New bio")({ name: "Alice", bio: null });
      expect(updated.bio).toBe("New bio");
      expect(updated.name).toBe("Alice");
    });
  });

  describe("LensOptional.compose", () => {
    it("composes two optionals", () => {
      const at0 = LensOptional.index(0);
      const at1 = LensOptional.index(1);

      // Access index 0 of outer, then index 1 of inner
      const composed = at0.compose(at1);

      const data = [
        [10, 20, 30],
        [40, 50],
      ];
      const result = composed.getOption(data);
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe(20);
    });

    it("returns None when first optional misses", () => {
      const at5 = LensOptional.index(5);
      const at0 = LensOptional.index(0);
      const composed = at5.compose(at0);

      expect(composed.getOption([[1]]).isNone).toBe(true);
    });
  });

  describe("Lens.composeOptional", () => {
    it("composes a lens with an optional", () => {
      const items = Lens.prop()("items");
      const at0 = LensOptional.index(0);
      const firstItem = items.composeOptional(at0);

      const data = { items: [10, 20, 30] };
      expect(firstItem.getOption(data).unwrap()).toBe(10);
    });

    it("returns None when optional part misses", () => {
      const items = Lens.prop()("items");
      const at5 = LensOptional.index(5);
      const fifthItem = items.composeOptional(at5);

      const data = { items: [10, 20] };
      expect(fifthItem.getOption(data).isNone).toBe(true);
    });
  });
});

describe("Prism", () => {
  describe("Prism.from", () => {
    it("getOption returns Some on matching variant", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      const result = strPrism.getOption("hello");
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe("hello");
    });

    it("getOption returns None on non-matching variant", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      expect(strPrism.getOption(42).isNone).toBe(true);
    });

    it("reverseGet constructs the sum type", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      expect(strPrism.reverseGet("test")).toBe("test");
    });

    it("modify transforms matching values", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      expect(strPrism.modify(s => s.toUpperCase())("hello")).toBe("HELLO");
    });

    it("modify leaves non-matching values unchanged", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      expect(strPrism.modify(s => s.toUpperCase())(42)).toBe(42);
    });

    it("works with Ok/Err prism on Result", () => {
      const okPrism = Prism.from(
        r => (r.isOk ? Some(r.value) : None),
        v => Ok(v),
      );

      expect(okPrism.getOption(Ok(42)).unwrap()).toBe(42);
      expect(okPrism.getOption(Err("fail")).isNone).toBe(true);
      expect(okPrism.reverseGet(10).isOk).toBe(true);
      expect(okPrism.reverseGet(10).unwrap()).toBe(10);
    });
  });

  describe("Prism.compose", () => {
    it("composes two prisms", () => {
      // First prism: extract string from string|number
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );

      // Second prism: extract first char from string (only if non-empty)
      const headPrism = Prism.from(
        s => (s.length > 0 ? Some(s[0]) : None),
        c => c,
      );

      const composed = strPrism.compose(headPrism);

      expect(composed.getOption("hello").unwrap()).toBe("h");
      expect(composed.getOption("").isNone).toBe(true);
      expect(composed.getOption(42).isNone).toBe(true);
      expect(composed.reverseGet("A")).toBe("A");
    });
  });

  describe("Prism.toOptional", () => {
    it("converts a prism to a LensOptional", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );

      const opt = strPrism.toOptional();
      expect(opt.getOption("hello").unwrap()).toBe("hello");
      expect(opt.getOption(42).isNone).toBe(true);
    });
  });

  describe("frozen instances", () => {
    it("prisms are frozen", () => {
      const p = Prism.from(
        v => Some(v),
        v => v,
      );
      expect(Object.isFrozen(p)).toBe(true);
    });
  });
});

describe("Traversal", () => {
  describe("Traversal.fromArray", () => {
    it("getAll returns all elements", () => {
      const t = Traversal.fromArray();
      expect(t.getAll([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it("getAll returns empty array for empty input", () => {
      const t = Traversal.fromArray();
      expect(t.getAll([])).toEqual([]);
    });

    it("modify transforms all elements", () => {
      const t = Traversal.fromArray();
      expect(t.modify(n => n * 2)([1, 2, 3])).toEqual([2, 4, 6]);
    });

    it("modify on empty array returns empty array", () => {
      const t = Traversal.fromArray();
      expect(t.modify(n => n * 2)([])).toEqual([]);
    });

    it("set replaces all elements with the same value", () => {
      const t = Traversal.fromArray();
      expect(t.set(0)([1, 2, 3])).toEqual([0, 0, 0]);
    });

    it("set on empty array returns empty array", () => {
      const t = Traversal.fromArray();
      expect(t.set(99)([])).toEqual([]);
    });

    it("works with string arrays", () => {
      const t = Traversal.fromArray();
      expect(t.modify(s => s.toUpperCase())(["a", "b", "c"])).toEqual(["A", "B", "C"]);
    });
  });

  describe("Traversal.from", () => {
    it("creates a custom traversal", () => {
      // Traverse over values of an object
      const t = Traversal.from(
        obj => Object.values(obj),
        (fn, obj) => {
          const result = {};
          for (const key of Object.keys(obj)) {
            result[key] = fn(obj[key]);
          }
          return result;
        },
      );

      expect(t.getAll({ a: 1, b: 2 })).toEqual([1, 2]);
      expect(t.modify(n => n * 10)({ a: 1, b: 2 })).toEqual({ a: 10, b: 20 });
      expect(t.set(0)({ a: 1, b: 2 })).toEqual({ a: 0, b: 0 });
    });
  });

  describe("frozen instances", () => {
    it("traversals are frozen", () => {
      const t = Traversal.fromArray();
      expect(Object.isFrozen(t)).toBe(true);
    });
  });
});

// =============================================================================
// 6. Result.traverse / Result.sequence / Option.traverse / Option.sequence
// =============================================================================

describe("Result.traverse", () => {
  it("collects all successes", () => {
    const result = Result.traverse([1, 2, 3], n => Ok(n * 2));
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([2, 4, 6]);
  });

  it("short-circuits on the first failure", () => {
    let count = 0;
    const result = Result.traverse([1, -2, 3, -4], n => {
      count++;
      return n > 0 ? Ok(n) : Err(`negative: ${n}`);
    });
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("negative: -2");
    expect(count).toBe(2);
  });

  it("returns Ok with empty array for empty input", () => {
    const result = Result.traverse([], n => Ok(n));
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("single element success", () => {
    const result = Result.traverse([42], n => Ok(n));
    expect(result.unwrap()).toEqual([42]);
  });

  it("single element failure", () => {
    const result = Result.traverse([42], () => Err("fail"));
    expect(result.isErr).toBe(true);
  });
});

describe("Result.sequence (alias for collect)", () => {
  it("collects all Ok results", () => {
    const result = Result.sequence([Ok(1), Ok(2), Ok(3)]);
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3]);
  });

  it("short-circuits on first Err", () => {
    const result = Result.sequence([Ok(1), Err("bad"), Ok(3)]);
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("bad");
  });

  it("handles empty array", () => {
    const result = Result.sequence([]);
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("single Err", () => {
    const result = Result.sequence([Err("only error")]);
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("only error");
  });
});

describe("Result.fromNullable", () => {
  it("non-null value returns Ok", () => {
    const result = Result.fromNullable(42, () => "was null");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(42);
  });

  it("null returns Err", () => {
    const result = Result.fromNullable(null, () => "was null");
    expect(result.isErr).toBe(true);
    expect(result.error).toBe("was null");
  });

  it("undefined returns Err", () => {
    const result = Result.fromNullable(undefined, () => "missing");
    expect(result.isErr).toBe(true);
    expect(result.error).toBe("missing");
  });

  it("falsy values (0, empty string, false) return Ok", () => {
    expect(Result.fromNullable(0, () => "err").isOk).toBe(true);
    expect(Result.fromNullable("", () => "err").isOk).toBe(true);
    expect(Result.fromNullable(false, () => "err").isOk).toBe(true);
  });
});

describe("Result.partition", () => {
  it("separates Ok and Err values", () => {
    const results = [Ok(1), Err("a"), Ok(2), Err("b"), Ok(3)];
    const { ok, err } = Result.partition(results);
    expect(ok).toEqual([1, 2, 3]);
    expect(err).toEqual(["a", "b"]);
  });

  it("all Ok returns empty err array", () => {
    const { ok, err } = Result.partition([Ok(1), Ok(2)]);
    expect(ok).toEqual([1, 2]);
    expect(err).toEqual([]);
  });

  it("all Err returns empty ok array", () => {
    const { ok, err } = Result.partition([Err("x"), Err("y")]);
    expect(ok).toEqual([]);
    expect(err).toEqual(["x", "y"]);
  });

  it("empty array returns empty groups", () => {
    const { ok, err } = Result.partition([]);
    expect(ok).toEqual([]);
    expect(err).toEqual([]);
  });
});

describe("Option.partition", () => {
  it("separates Some and None values", () => {
    const options = [Some(1), None, Some(2), None, Some(3)];
    const { some, none } = Option.partition(options);
    expect(some).toEqual([1, 2, 3]);
    expect(none).toBe(2);
  });

  it("all Some returns zero none count", () => {
    const { some, none } = Option.partition([Some("a"), Some("b")]);
    expect(some).toEqual(["a", "b"]);
    expect(none).toBe(0);
  });

  it("all None returns empty some array", () => {
    const { some, none } = Option.partition([None, None, None]);
    expect(some).toEqual([]);
    expect(none).toBe(3);
  });

  it("empty array returns empty result", () => {
    const { some, none } = Option.partition([]);
    expect(some).toEqual([]);
    expect(none).toBe(0);
  });
});

describe("Option.traverse", () => {
  it("collects all present values", () => {
    const result = Option.traverse([1, 2, 3], n => Some(n * 10));
    expect(result.isSome).toBe(true);
    expect(result.unwrap()).toEqual([10, 20, 30]);
  });

  it("short-circuits on first None", () => {
    let count = 0;
    const result = Option.traverse([1, 2, 3], n => {
      count++;
      return n === 2 ? None : Some(n);
    });
    expect(result.isNone).toBe(true);
    expect(count).toBe(2);
  });

  it("returns Some with empty array for empty input", () => {
    const result = Option.traverse([], () => None);
    expect(result.isSome).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });
});

describe("Option.sequence (alias for collect)", () => {
  it("collects all Some values", () => {
    const result = Option.sequence([Some(1), Some(2), Some(3)]);
    expect(result.isSome).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3]);
  });

  it("short-circuits on first None", () => {
    const result = Option.sequence([Some(1), None, Some(3)]);
    expect(result.isNone).toBe(true);
  });

  it("handles empty array", () => {
    const result = Option.sequence([]);
    expect(result.isSome).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("single None", () => {
    const result = Option.sequence([None]);
    expect(result.isNone).toBe(true);
  });
});

// =============================================================================
// 7. Task.traverse / Task.sequence / Task.ap
// =============================================================================

describe("Task.traverse", () => {
  it("runs all items in parallel and collects results", async () => {
    const result = await Task.traverse([1, 2, 3], n => Task(async () => Ok(n * 10))).run();

    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([10, 20, 30]);
  });

  it("short-circuits on first error (collects after parallel execution)", async () => {
    const result = await Task.traverse([1, -2, 3], n =>
      Task(async () => (n > 0 ? Ok(n) : Err(`negative: ${n}`))),
    ).run();

    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("negative: -2");
  });

  it("handles empty array", async () => {
    const result = await Task.traverse([], n => Task.of(n)).run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("all tasks execute (parallel semantics)", async () => {
    const executed = [];
    await Task.traverse([1, 2, 3], n =>
      Task(async () => {
        executed.push(n);
        return Ok(n);
      }),
    ).run();

    // All three should have executed since they run in parallel
    expect(executed.length).toBe(3);
  });
});

describe("Task.sequence", () => {
  it("runs all tasks in parallel and collects Ok results", async () => {
    const tasks = [Task.of(1), Task.of(2), Task.of(3)];
    const result = await Task.sequence(tasks).run();

    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3]);
  });

  it("short-circuits when any task returns Err", async () => {
    const tasks = [Task.of(1), Task(async () => Err("fail")), Task.of(3)];
    const result = await Task.sequence(tasks).run();

    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("fail");
  });

  it("handles empty task list", async () => {
    const result = await Task.sequence([]).run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });
});

describe("Task.ap", () => {
  it("applies a function task to a value task (both Ok)", async () => {
    const fnTask = Task.of(n => n * 2);
    const argTask = Task.of(21);
    const result = await Task.ap(fnTask, argTask).run();

    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toBe(42);
  });

  it("returns Err when function task fails", async () => {
    const fnTask = Task(async () => Err("fn failed"));
    const argTask = Task.of(21);
    const result = await Task.ap(fnTask, argTask).run();

    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("fn failed");
  });

  it("returns Err when argument task fails", async () => {
    const fnTask = Task.of(n => n * 2);
    const argTask = Task(async () => Err("arg failed"));
    const result = await Task.ap(fnTask, argTask).run();

    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("arg failed");
  });

  it("returns first Err when both tasks fail", async () => {
    const fnTask = Task(async () => Err("fn failed"));
    const argTask = Task(async () => Err("arg failed"));
    const result = await Task.ap(fnTask, argTask).run();

    expect(result.isErr).toBe(true);
    // fn is checked first
    expect(result.unwrapErr()).toBe("fn failed");
  });

  it("runs both tasks in parallel", async () => {
    const executed = [];
    const fnTask = Task(async () => {
      executed.push("fn");
      return Ok(n => n + 1);
    });
    const argTask = Task(async () => {
      executed.push("arg");
      return Ok(10);
    });

    const result = await Task.ap(fnTask, argTask).run();
    expect(result.unwrap()).toBe(11);
    expect(executed.length).toBe(2);
  });
});

// =============================================================================
// 8. List.sortByOrd / List.uniqBy / List.groupBy
// =============================================================================

describe("List.sortByOrd", () => {
  it("sorts using Ord.number in ascending order", () => {
    const list = List([3, 1, 4, 1, 5, 9, 2, 6]);
    const sorted = list.sortByOrd(Ord.number);
    expect([...sorted]).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  it("sorts in descending order with Ord.reverse", () => {
    const list = List([3, 1, 4, 1, 5]);
    const sorted = list.sortByOrd(Ord.reverse(Ord.number));
    expect([...sorted]).toEqual([5, 4, 3, 1, 1]);
  });

  it("does not mutate the original list", () => {
    const list = List([3, 1, 2]);
    const sorted = list.sortByOrd(Ord.number);
    expect([...list]).toEqual([3, 1, 2]);
    expect([...sorted]).toEqual([1, 2, 3]);
  });

  it("handles empty list", () => {
    const list = List([]);
    const sorted = list.sortByOrd(Ord.number);
    expect([...sorted]).toEqual([]);
  });

  it("handles single element list", () => {
    const list = List([42]);
    const sorted = list.sortByOrd(Ord.number);
    expect([...sorted]).toEqual([42]);
  });

  it("sorts strings", () => {
    const list = List(["banana", "apple", "cherry"]);
    const sorted = list.sortByOrd(Ord.string);
    expect([...sorted]).toEqual(["apple", "banana", "cherry"]);
  });

  it("sorts by derived ordering", () => {
    const byAge = Ord.contramap(Ord.number, u => u.age);
    const list = List([
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 20 },
      { name: "Bob", age: 25 },
    ]);

    const sorted = list.sortByOrd(byAge);
    expect(sorted.at(0).unwrap().name).toBe("Alice");
    expect(sorted.at(1).unwrap().name).toBe("Bob");
    expect(sorted.at(2).unwrap().name).toBe("Charlie");
  });
});

describe("List.uniqBy", () => {
  it("deduplicates using Eq.number", () => {
    const list = List([1, 2, 3, 2, 1, 4, 3]);
    const unique = list.uniqBy(Eq.number);
    expect([...unique]).toEqual([1, 2, 3, 4]);
  });

  it("preserves first occurrence", () => {
    const eqById = Eq.contramap(Eq.number, u => u.id);
    const list = List([
      { id: 1, name: "first" },
      { id: 2, name: "second" },
      { id: 1, name: "duplicate" },
    ]);

    const unique = list.uniqBy(eqById);
    expect(unique.length).toBe(2);
    expect(unique.at(0).unwrap().name).toBe("first");
    expect(unique.at(1).unwrap().name).toBe("second");
  });

  it("handles empty list", () => {
    const list = List([]);
    const unique = list.uniqBy(Eq.number);
    expect([...unique]).toEqual([]);
  });

  it("handles all-unique list", () => {
    const list = List([1, 2, 3, 4]);
    const unique = list.uniqBy(Eq.number);
    expect([...unique]).toEqual([1, 2, 3, 4]);
  });

  it("handles all-same list", () => {
    const list = List([5, 5, 5, 5]);
    const unique = list.uniqBy(Eq.number);
    expect([...unique]).toEqual([5]);
  });

  it("deduplicates strings", () => {
    const list = List(["a", "b", "a", "c", "b"]);
    const unique = list.uniqBy(Eq.string);
    expect([...unique]).toEqual(["a", "b", "c"]);
  });

  it("uses custom Eq for deduplication", () => {
    // Case-insensitive string equality
    const eqCaseInsensitive = Eq((a, b) => a.toLowerCase() === b.toLowerCase());
    const list = List(["Hello", "HELLO", "hello", "World"]);
    const unique = list.uniqBy(eqCaseInsensitive);
    expect(unique.length).toBe(2);
    expect(unique.at(0).unwrap()).toBe("Hello");
    expect(unique.at(1).unwrap()).toBe("World");
  });

  it("does not mutate the original list", () => {
    const list = List([1, 2, 1]);
    const unique = list.uniqBy(Eq.number);
    expect([...list]).toEqual([1, 2, 1]);
    expect([...unique]).toEqual([1, 2]);
  });
});

describe("List.groupBy", () => {
  it("groups elements by a key function", () => {
    const list = List([1, 2, 3, 4, 5, 6]);
    const groups = list.groupBy(n => (n % 2 === 0 ? "even" : "odd"));

    expect([...groups.even]).toEqual([2, 4, 6]);
    expect([...groups.odd]).toEqual([1, 3, 5]);
  });

  it("returns correct record of lists", () => {
    const list = List(["apple", "avocado", "banana", "blueberry", "cherry"]);
    const grouped = list.groupBy(s => s[0]);

    expect([...grouped["a"]]).toEqual(["apple", "avocado"]);
    expect([...grouped["b"]]).toEqual(["banana", "blueberry"]);
    expect([...grouped["c"]]).toEqual(["cherry"]);
  });

  it("handles empty list", () => {
    const list = List([]);
    const groups = list.groupBy(() => "any");
    expect(Object.keys(groups)).toEqual([]);
  });

  it("single group for all-same key", () => {
    const list = List([1, 2, 3]);
    const groups = list.groupBy(() => "all");
    expect([...groups["all"]]).toEqual([1, 2, 3]);
  });

  it("each element in its own group", () => {
    const list = List(["a", "b", "c"]);
    const groups = list.groupBy(s => s);
    expect([...groups["a"]]).toEqual(["a"]);
    expect([...groups["b"]]).toEqual(["b"]);
    expect([...groups["c"]]).toEqual(["c"]);
  });

  it("preserves order within groups", () => {
    const list = List([
      { dept: "engineering", name: "Alice" },
      { dept: "sales", name: "Bob" },
      { dept: "engineering", name: "Charlie" },
      { dept: "sales", name: "Diana" },
    ]);

    const groups = list.groupBy(u => u.dept);
    const eng = groups["engineering"];
    const sales = groups["sales"];

    expect(eng.at(0).unwrap().name).toBe("Alice");
    expect(eng.at(1).unwrap().name).toBe("Charlie");
    expect(sales.at(0).unwrap().name).toBe("Bob");
    expect(sales.at(1).unwrap().name).toBe("Diana");
  });

  it("result lists are immutable", () => {
    const list = List([1, 2, 3]);
    const groups = list.groupBy(n => (n % 2 === 0 ? "even" : "odd"));

    expect(groups.odd.$immutable).toBe(true);
    expect(groups.even.$immutable).toBe(true);
  });
});

// =============================================================================
// Iso
// =============================================================================

describe("Iso", () => {
  // Celsius <-> Fahrenheit: a classic lossless conversion
  const celsiusToFahrenheit = Iso.from(
    c => (c * 9) / 5 + 32,
    f => ((f - 32) * 5) / 9,
  );

  describe("get / reverseGet roundtrip", () => {
    it("get converts S to A", () => {
      expect(celsiusToFahrenheit.get(0)).toBe(32);
      expect(celsiusToFahrenheit.get(100)).toBe(212);
    });

    it("reverseGet converts A back to S", () => {
      expect(celsiusToFahrenheit.reverseGet(32)).toBe(0);
      expect(celsiusToFahrenheit.reverseGet(212)).toBe(100);
    });

    it("roundtrip: reverseGet(get(s)) === s", () => {
      const value = 37;
      expect(celsiusToFahrenheit.reverseGet(celsiusToFahrenheit.get(value))).toBe(value);
    });

    it("roundtrip: get(reverseGet(a)) === a", () => {
      const value = 98.6;
      const result = celsiusToFahrenheit.get(celsiusToFahrenheit.reverseGet(value));
      expect(Math.abs(result - value) < 1e-10).toBe(true);
    });
  });

  describe("modify", () => {
    it("applies transformation through the iso", () => {
      // Double the fahrenheit value of 0C (32F) -> 64F -> back to celsius
      const result = celsiusToFahrenheit.modify(f => f * 2)(0);
      // 0C -> 32F -> 64F -> ~17.78C
      const expected = ((64 - 32) * 5) / 9;
      expect(Math.abs(result - expected) < 1e-10).toBe(true);
    });

    it("identity function returns same value", () => {
      expect(celsiusToFahrenheit.modify(x => x)(100)).toBe(100);
    });
  });

  describe("compose", () => {
    it("chains two Isos", () => {
      // string <-> number[] (char codes)
      const strToCharCodes = Iso.from(
        s => Array.from(s).map(c => c.charCodeAt(0)),
        codes => codes.map(c => String.fromCharCode(c)).join(""),
      );

      // number[] <-> string (JSON)
      const codesToJson = Iso.from(
        codes => JSON.stringify(codes),
        json => JSON.parse(json),
      );

      const composed = strToCharCodes.compose(codesToJson);

      const json = composed.get("AB");
      expect(json).toBe("[65,66]");

      const back = composed.reverseGet("[65,66]");
      expect(back).toBe("AB");
    });

    it("composed roundtrip holds", () => {
      const double = Iso.from(
        n => n * 2,
        n => n / 2,
      );
      const addTen = Iso.from(
        n => n + 10,
        n => n - 10,
      );
      const composed = double.compose(addTen);

      expect(composed.get(5)).toBe(20);
      expect(composed.reverseGet(20)).toBe(5);
    });
  });

  describe("reverse", () => {
    it("swaps get and reverseGet", () => {
      const reversed = celsiusToFahrenheit.reverse();

      // reversed.get is the original reverseGet (fahrenheit -> celsius)
      expect(reversed.get(32)).toBe(0);
      expect(reversed.get(212)).toBe(100);

      // reversed.reverseGet is the original get (celsius -> fahrenheit)
      expect(reversed.reverseGet(0)).toBe(32);
      expect(reversed.reverseGet(100)).toBe(212);
    });

    it("double reverse is equivalent to original", () => {
      const doubleReversed = celsiusToFahrenheit.reverse().reverse();
      expect(doubleReversed.get(100)).toBe(212);
      expect(doubleReversed.reverseGet(212)).toBe(100);
    });
  });

  describe("toLens", () => {
    it("returns a working Lens", () => {
      const lens = celsiusToFahrenheit.toLens();

      expect(lens.get(0)).toBe(32);
      expect(lens.get(100)).toBe(212);
    });

    it("lens.set replaces the value through reverseGet", () => {
      const lens = celsiusToFahrenheit.toLens();

      // set fahrenheit to 212, get back celsius
      const result = lens.set(212)(0);
      expect(result).toBe(100);
    });

    it("lens.modify works", () => {
      const lens = celsiusToFahrenheit.toLens();

      // 0C -> 32F, double -> 64F -> back to celsius
      const result = lens.modify(f => f * 2)(0);
      const expected = ((64 - 32) * 5) / 9;
      expect(Math.abs(result - expected) < 1e-10).toBe(true);
    });
  });

  describe("toPrism", () => {
    it("returns a working Prism", () => {
      const prism = celsiusToFahrenheit.toPrism();

      const result = prism.getOption(100);
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe(212);
    });

    it("reverseGet constructs the source", () => {
      const prism = celsiusToFahrenheit.toPrism();

      expect(prism.reverseGet(212)).toBe(100);
    });

    it("prism.modify works", () => {
      const prism = celsiusToFahrenheit.toPrism();

      const result = prism.modify(f => f + 1)(0);
      // 0C -> 32F -> 33F -> back to celsius
      const expected = ((33 - 32) * 5) / 9;
      expect(Math.abs(result - expected) < 1e-10).toBe(true);
    });
  });

  describe("Iso.id", () => {
    it("get returns the same value", () => {
      const id = Iso.id();
      expect(id.get(42)).toBe(42);
      expect(id.get("hello")).toBe("hello");
    });

    it("reverseGet returns the same value", () => {
      const id = Iso.id();
      expect(id.reverseGet(42)).toBe(42);
    });

    it("modify applies fn directly", () => {
      const id = Iso.id();
      expect(id.modify(n => n + 1)(41)).toBe(42);
    });

    it("reverse of id is still id", () => {
      const id = Iso.id();
      const rev = id.reverse();
      expect(rev.get(42)).toBe(42);
      expect(rev.reverseGet(42)).toBe(42);
    });
  });

  describe("frozen instances", () => {
    it("isos are frozen", () => {
      const iso = Iso.from(
        n => n.toString(),
        s => Number(s),
      );
      expect(Object.isFrozen(iso)).toBe(true);
    });

    it("composed isos are frozen", () => {
      const a = Iso.from(
        n => n * 2,
        n => n / 2,
      );
      const b = Iso.from(
        n => n + 1,
        n => n - 1,
      );
      expect(Object.isFrozen(a.compose(b))).toBe(true);
    });

    it("reversed isos are frozen", () => {
      const iso = Iso.from(
        n => n * 2,
        n => n / 2,
      );
      expect(Object.isFrozen(iso.reverse())).toBe(true);
    });
  });
});

// =============================================================================
// ErrType cause chain
// =============================================================================

describe("ErrType cause chain", () => {
  const NotFound = ErrType("NotFound");
  const DbError = ErrType("DbError");

  it("creates error with cause from a native Error", () => {
    const original = new Error("connection refused");
    const err = NotFound("User not found", { cause: original });
    expect(err.cause).toBe(original);
    expect(err.message).toBe("User not found");
    expect(err.tag).toBe("NotFound");
  });

  it("cause is preserved on the frozen instance", () => {
    const original = new TypeError("bad input");
    const err = NotFound("gone", { cause: original });
    expect(Object.isFrozen(err)).toBe(true);
    expect(err.cause).toBe(original);
  });

  it("cause defaults to undefined when not provided", () => {
    const err = NotFound("gone");
    expect(err.cause).toBe(undefined);
  });

  it("toString appends cause when present", () => {
    const original = new Error("timeout");
    const err = NotFound("User not found", { cause: original });
    const str = err.toString();
    expect(str.startsWith("NotFound(NOT_FOUND): User not found [caused by: ")).toBe(true);
    expect(str.includes("timeout")).toBe(true);
  });

  it("toString omits cause suffix when cause is undefined", () => {
    const err = NotFound("User not found");
    expect(err.toString()).toBe("NotFound(NOT_FOUND): User not found");
  });

  it("toJSON includes cause when it is a native Error", () => {
    const original = new Error("disk full");
    const err = NotFound("write failed", { cause: original });
    const json = err.toJSON();
    expect(json.cause).toEqual({ name: "Error", message: "disk full" });
  });

  it("toJSON includes cause as-is for primitive values", () => {
    const err = NotFound("failed", { cause: "some reason" });
    const json = err.toJSON();
    expect(json.cause).toBe("some reason");
  });

  it("toJSON omits cause key when cause is undefined", () => {
    const err = NotFound("gone");
    const json = err.toJSON();
    expect("cause" in json).toBe(false);
  });

  it("toJSON serializes ErrType cause via its own toJSON", () => {
    const inner = DbError("connection lost");
    const outer = NotFound("User not found", { cause: inner });
    const json = outer.toJSON();
    expect(json.cause.tag).toBe("DbError");
    expect(json.cause.code).toBe("DB_ERROR");
    expect(json.cause.message).toBe("connection lost");
    expect("stack" in json.cause).toBe(false);
  });

  it("backward compatibility: plain metadata object still works", () => {
    const err = NotFound("User not found", { userId: "u_123", role: "admin" });
    expect(err.metadata).toEqual({ userId: "u_123", role: "admin" });
    expect(err.cause).toBe(undefined);
    expect(err.tag).toBe("NotFound");
    expect(err.message).toBe("User not found");
  });

  it("backward compatibility: metadata is deep frozen", () => {
    const err = NotFound("gone", { nested: { value: 1 } });
    expect(() => {
      err.metadata.nested.value = 2;
    }).toThrow();
  });

  it("options-style: metadata and cause together", () => {
    const original = new Error("timeout");
    const err = NotFound("User not found", {
      cause: original,
      metadata: { userId: "u_456" },
    });
    expect(err.cause).toBe(original);
    expect(err.metadata).toEqual({ userId: "u_456" });
  });

  it("nested causes: ErrType wrapping ErrType wrapping Error", () => {
    const root = new Error("ECONNREFUSED");
    const mid = DbError("query failed", { cause: root });
    const outer = NotFound("User not found", { cause: mid });

    // Outer cause is the mid ErrType
    expect(outer.cause).toBe(mid);
    expect(outer.cause.tag).toBe("DbError");

    // Mid cause is the root Error
    expect(mid.cause).toBe(root);
    expect(mid.cause.message).toBe("ECONNREFUSED");

    // toString chain
    expect(outer.toString().includes("[caused by: ")).toBe(true);
    expect(mid.toString().includes("[caused by: ")).toBe(true);

    // toJSON chain
    const outerJson = outer.toJSON();
    expect(outerJson.cause.tag).toBe("DbError");
    expect(outerJson.cause.cause).toEqual({ name: "Error", message: "ECONNREFUSED" });
  });

  it("ErrType.is() still works with cause field present", () => {
    const err = NotFound("gone", { cause: new Error("x") });
    expect(ErrType.is(err)).toBe(true);
    expect(NotFound.is(err)).toBe(true);
  });

  it("Constructor.is() still rejects wrong error types with cause", () => {
    const Forbidden = ErrType("Forbidden");
    const err = NotFound("gone", { cause: new Error("x") });
    expect(Forbidden.is(err)).toBe(false);
  });
});

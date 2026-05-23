/**
 * type-def.test.js - Tests for TypeDef factory + v0 catalogue.
 *
 * Covers:
 *   - TypeDef factory: tag/schema/new/parse/validate/is/unsafe/non-instantiable
 *   - 7 scalars: Str, Num, Int, UInt, Bool, Bytes, Nil
 *   - 6 composers: Vec, Pair, Tuple, Dict, Maybe, Either
 *   - Brand survival, frozen output, composer caching, nested error paths
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  TypeDef,
  Schema,
  // scalars
  Str,
  Num,
  Int,
  UInt,
  Bool,
  Bytes,
  Nil,
  // composers
  Vec,
  Pair,
  Tuple,
  Dict,
  Maybe,
  Either,
  // helpers from core
  Some,
  None,
  Option,
} = await import("../dist/index.js");

// =============================================================================
// 1. TypeDef factory
// =============================================================================

describe("TypeDef factory", () => {
  describe("tag and schema", () => {
    it("exposes the tag string", () => {
      expect(Str.tag).toBe("Str");
      expect(Int.tag).toBe("Int");
      expect(UInt.tag).toBe("UInt");
    });

    it("exposes the underlying schema", () => {
      expect(typeof Str.schema.parse).toBe("function");
      expect(typeof Int.schema.parse).toBe("function");
    });
  });

  describe(".parse(unknown)", () => {
    it("returns Ok with branded value on success", () => {
      const r = Str.parse("hello");
      expect(r.isOk).toBe(true);
      expect(r.value).toBe("hello");
    });

    it("returns Err with SchemaError on failure", () => {
      const r = Str.parse(42);
      expect(r.isErr).toBe(true);
      expect(r.error.expected).toBe("string");
    });

    it("error includes path information", () => {
      const r = Str.parse(null);
      expect(r.isErr).toBe(true);
      expect(Array.isArray(r.error.path)).toBe(true);
    });
  });

  describe(".new(typed)", () => {
    it("validates typed input and returns Ok", () => {
      const r = Int.new(42);
      expect(r.isOk).toBe(true);
      expect(r.value).toBe(42);
    });

    it("rejects typed input that fails the schema (runtime check still runs)", () => {
      // Int.new(1.5) — the schema rejects non-integers even with typed input
      const r = Int.new(1.5);
      expect(r.isErr).toBe(true);
    });
  });

  describe(".validate(unknown)", () => {
    it("returns Valid for valid input", () => {
      const v = Int.validate(42);
      expect(v.isValid).toBe(true);
      expect(v.value).toBe(42);
    });

    it("returns Invalid for invalid input with array of errors", () => {
      const v = Int.validate("not a number");
      expect(v.isInvalid).toBe(true);
      expect(v.errors.length).toBe(1);
      expect(v.errors[0].expected).toBe("number");
    });
  });

  describe(".is(unknown)", () => {
    it("returns true for valid input", () => {
      expect(Str.is("hello")).toBe(true);
      expect(Int.is(42)).toBe(true);
    });

    it("returns false for invalid input", () => {
      expect(Str.is(42)).toBe(false);
      expect(Int.is("x")).toBe(false);
      expect(Int.is(1.5)).toBe(false);
    });
  });

  describe(".unsafe(value)", () => {
    it("returns the value when valid", () => {
      const v = Int.unsafe(42);
      expect(v).toBe(42);
    });

    it("throws TypeError in dev mode on invalid input", () => {
      // NODE_ENV is undefined or 'test' here, not 'production', so the dev check runs.
      let threw = false;
      try {
        Int.unsafe(1.5);
      } catch (e) {
        threw = true;
        expect(e instanceof TypeError).toBe(true);
        expect(e.message.includes("Int")).toBe(true);
      }
      expect(threw).toBe(true);
    });
  });

  describe("instantiation", () => {
    it("throws when calling new on the TypeDef class directly", () => {
      let threw = false;
      try {
        new Str();
      } catch (e) {
        threw = true;
        expect(e instanceof TypeError).toBe(true);
        expect(e.message.includes("cannot be instantiated")).toBe(true);
      }
      expect(threw).toBe(true);
    });
  });

  describe("user-defined TypeDef via class extends", () => {
    it("inherits all static methods from the base", () => {
      class UserId extends TypeDef("UserId", Schema.uuid) {}
      expect(UserId.tag).toBe("UserId");
      const r = UserId.parse("550e8400-e29b-41d4-a716-446655440000");
      expect(r.isOk).toBe(true);
      expect(UserId.is("not-a-uuid")).toBe(false);
    });

    it("two user-defined TypeDefs with different tags are distinct", () => {
      class UserId extends TypeDef("UserId", Schema.string) {}
      class PostId extends TypeDef("PostId", Schema.string) {}
      expect(UserId.tag).toBe("UserId");
      expect(PostId.tag).toBe("PostId");
      expect(UserId).not.toBe(PostId);
    });
  });
});

// =============================================================================
// 2. Scalar primitives
// =============================================================================

describe("Str", () => {
  it("accepts any string", () => {
    expect(Str.parse("").isOk).toBe(true);
    expect(Str.parse("hello").isOk).toBe(true);
    expect(Str.parse("multi\nline").isOk).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(Str.parse(42).isErr).toBe(true);
    expect(Str.parse(true).isErr).toBe(true);
    expect(Str.parse(null).isErr).toBe(true);
    expect(Str.parse(undefined).isErr).toBe(true);
    expect(Str.parse({}).isErr).toBe(true);
    expect(Str.parse([]).isErr).toBe(true);
  });
});

describe("Num", () => {
  it("accepts finite numbers", () => {
    expect(Num.parse(0).isOk).toBe(true);
    expect(Num.parse(-1).isOk).toBe(true);
    expect(Num.parse(1.5).isOk).toBe(true);
    expect(Num.parse(Number.MAX_SAFE_INTEGER).isOk).toBe(true);
  });

  it("accepts Infinity (only NaN is rejected)", () => {
    expect(Num.parse(Infinity).isOk).toBe(true);
    expect(Num.parse(-Infinity).isOk).toBe(true);
  });

  it("rejects NaN", () => {
    expect(Num.parse(NaN).isErr).toBe(true);
  });

  it("rejects non-numbers", () => {
    expect(Num.parse("42").isErr).toBe(true);
    expect(Num.parse(true).isErr).toBe(true);
    expect(Num.parse(null).isErr).toBe(true);
  });
});

describe("Int", () => {
  it("accepts integers", () => {
    expect(Int.parse(0).isOk).toBe(true);
    expect(Int.parse(-1).isOk).toBe(true);
    expect(Int.parse(42).isOk).toBe(true);
    expect(Int.parse(Number.MAX_SAFE_INTEGER).isOk).toBe(true);
  });

  it("rejects non-integers", () => {
    expect(Int.parse(1.5).isErr).toBe(true);
    expect(Int.parse(0.1).isErr).toBe(true);
    expect(Int.parse(NaN).isErr).toBe(true);
    expect(Int.parse(Infinity).isErr).toBe(true);
  });

  it("rejects non-numbers", () => {
    expect(Int.parse("42").isErr).toBe(true);
    expect(Int.parse(null).isErr).toBe(true);
  });
});

describe("UInt", () => {
  it("accepts non-negative integers", () => {
    expect(UInt.parse(0).isOk).toBe(true);
    expect(UInt.parse(1).isOk).toBe(true);
    expect(UInt.parse(42).isOk).toBe(true);
  });

  it("rejects negative integers", () => {
    expect(UInt.parse(-1).isErr).toBe(true);
    expect(UInt.parse(-42).isErr).toBe(true);
  });

  it("rejects non-integers", () => {
    expect(UInt.parse(1.5).isErr).toBe(true);
    expect(UInt.parse(-0.5).isErr).toBe(true);
  });
});

describe("Bool", () => {
  it("accepts booleans", () => {
    expect(Bool.parse(true).isOk).toBe(true);
    expect(Bool.parse(false).isOk).toBe(true);
  });

  it("does not coerce truthy non-booleans", () => {
    expect(Bool.parse(1).isErr).toBe(true);
    expect(Bool.parse(0).isErr).toBe(true);
    expect(Bool.parse("true").isErr).toBe(true);
    expect(Bool.parse("").isErr).toBe(true);
    expect(Bool.parse(null).isErr).toBe(true);
  });
});

describe("Bytes", () => {
  it("accepts Uint8Array", () => {
    const arr = new Uint8Array([1, 2, 3]);
    const r = Bytes.parse(arr);
    expect(r.isOk).toBe(true);
    expect(r.value).toBe(arr);
  });

  it("accepts Node Buffer (which extends Uint8Array)", () => {
    // Buffer is available on Node; skip on environments without it
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from([1, 2, 3]);
      expect(Bytes.parse(buf).isOk).toBe(true);
    }
  });

  it("rejects ArrayBuffer", () => {
    const buf = new ArrayBuffer(8);
    expect(Bytes.parse(buf).isErr).toBe(true);
  });

  it("rejects plain arrays", () => {
    expect(Bytes.parse([1, 2, 3]).isErr).toBe(true);
  });

  it("rejects strings, numbers, null, undefined", () => {
    expect(Bytes.parse("hex").isErr).toBe(true);
    expect(Bytes.parse(42).isErr).toBe(true);
    expect(Bytes.parse(null).isErr).toBe(true);
    expect(Bytes.parse(undefined).isErr).toBe(true);
  });
});

describe("Nil", () => {
  it("accepts only literal null", () => {
    const r = Nil.parse(null);
    expect(r.isOk).toBe(true);
    expect(r.value).toBe(null);
  });

  it("rejects undefined", () => {
    expect(Nil.parse(undefined).isErr).toBe(true);
  });

  it("rejects 0, empty string, false (truthy/falsy non-null)", () => {
    expect(Nil.parse(0).isErr).toBe(true);
    expect(Nil.parse("").isErr).toBe(true);
    expect(Nil.parse(false).isErr).toBe(true);
  });

  it("rejects empty object and array", () => {
    expect(Nil.parse({}).isErr).toBe(true);
    expect(Nil.parse([]).isErr).toBe(true);
  });
});

// =============================================================================
// 3. Composers — Vec
// =============================================================================

describe("Vec", () => {
  it("validates an array of inner type into an ImmutableList", () => {
    const r = Vec(Int).parse([1, 2, 3]);
    expect(r.isOk).toBe(true);
    expect(r.value.length).toBe(3);
    expect(r.value.toMutable()).toEqual([1, 2, 3]);
  });

  it("accepts empty array", () => {
    expect(Vec(Int).parse([]).isOk).toBe(true);
  });

  it("rejects non-array input", () => {
    expect(Vec(Int).parse("not an array").isErr).toBe(true);
    expect(Vec(Int).parse({}).isErr).toBe(true);
    expect(Vec(Int).parse(null).isErr).toBe(true);
  });

  it("reports nested error path on element failure", () => {
    const r = Vec(Int).parse([1, "bad", 3]);
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["1"]);
    expect(r.error.expected).toBe("number");
  });

  it("returns an immutable list (mutation methods return new lists)", () => {
    const r = Vec(Int).parse([1, 2, 3]);
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      const after = r.value.append(4);
      expect(after.length).toBe(4);
      expect(r.value.length).toBe(3); // original unchanged
    }
  });

  it("caches per inner TypeDef (referential equality)", () => {
    const a = Vec(Int);
    const b = Vec(Int);
    expect(a).toBe(b);
  });

  it("different inner TypeDefs produce different Vec classes", () => {
    expect(Vec(Int)).not.toBe(Vec(Str));
  });

  it("has the expected tag", () => {
    expect(Vec(Int).tag).toBe("Vec<Int>");
  });

  it("supports class extension to give a named brand", () => {
    class Scores extends Vec(Int) {}
    expect(Scores.tag).toBe("Vec<Int>");
    const r = Scores.parse([10, 20, 30]);
    expect(r.isOk).toBe(true);
    expect(r.value.toMutable()).toEqual([10, 20, 30]);
  });
});

// =============================================================================
// 4. Composers — Pair
// =============================================================================

describe("Pair", () => {
  it("validates a 2-tuple", () => {
    const r = Pair(Str, Int).parse(["hello", 42]);
    expect(r.isOk).toBe(true);
    expect(r.value[0]).toBe("hello");
    expect(r.value[1]).toBe(42);
  });

  it("rejects wrong-length array", () => {
    expect(Pair(Str, Int).parse(["only one"]).isErr).toBe(true);
    expect(Pair(Str, Int).parse(["a", 1, 2]).isErr).toBe(true);
  });

  it("rejects non-array", () => {
    expect(Pair(Str, Int).parse({ 0: "a", 1: 1 }).isErr).toBe(true);
    expect(Pair(Str, Int).parse(null).isErr).toBe(true);
  });

  it("reports per-position error path", () => {
    const r = Pair(Str, Int).parse(["ok", "not int"]);
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["1"]);
  });

  it("deep-freezes the parsed output", () => {
    const r = Pair(Str, Int).parse(["a", 1]);
    expect(Object.isFrozen(r.value)).toBe(true);
  });

  it("caches per (A, B) pair", () => {
    expect(Pair(Str, Int)).toBe(Pair(Str, Int));
  });

  it("different argument order produces different classes", () => {
    expect(Pair(Str, Int)).not.toBe(Pair(Int, Str));
  });

  it("has the expected tag", () => {
    expect(Pair(Str, Int).tag).toBe("Pair<Str,Int>");
  });
});

// =============================================================================
// 5. Composers — Tuple
// =============================================================================

describe("Tuple", () => {
  it("validates a fixed-length n-tuple", () => {
    const r = Tuple(Str, Int, Bool).parse(["a", 1, true]);
    expect(r.isOk).toBe(true);
    expect(r.value[0]).toBe("a");
    expect(r.value[1]).toBe(1);
    expect(r.value[2]).toBe(true);
  });

  it("rejects wrong-length array", () => {
    expect(Tuple(Str, Int, Bool).parse(["a", 1]).isErr).toBe(true);
    expect(Tuple(Str, Int, Bool).parse(["a", 1, true, "extra"]).isErr).toBe(true);
  });

  it("reports per-position error", () => {
    const r = Tuple(Str, Int, Bool).parse(["a", "wrong", true]);
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["1"]);
  });

  it("works for 1-element tuple", () => {
    const r = Tuple(Str).parse(["only"]);
    expect(r.isOk).toBe(true);
  });

  it("has the expected tag", () => {
    expect(Tuple(Str, Int, Bool).tag).toBe("Tuple<Str,Int,Bool>");
  });
});

// =============================================================================
// 6. Composers — Dict
// =============================================================================

describe("Dict", () => {
  it("validates string-keyed records into an ImmutableHashMap", () => {
    const r = Dict(Str, Int).parse({ a: 1, b: 2 });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.size).toBe(2);
      const a = r.value.get("a");
      const b = r.value.get("b");
      expect(a.isSome).toBe(true);
      expect(b.isSome).toBe(true);
      if (a.isSome) expect(a.value).toBe(1);
      if (b.isSome) expect(b.value).toBe(2);
    }
  });

  it("accepts empty object", () => {
    expect(Dict(Str, Int).parse({}).isOk).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(Dict(Str, Int).parse(null).isErr).toBe(true);
    expect(Dict(Str, Int).parse([]).isErr).toBe(true);
    expect(Dict(Str, Int).parse("not an object").isErr).toBe(true);
  });

  it("reports value-level error path", () => {
    const r = Dict(Str, Int).parse({ a: 1, b: "wrong" });
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["b"]);
  });

  it("returns an immutable hash map (set returns a new map)", () => {
    const r = Dict(Str, Int).parse({ a: 1 });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      const m2 = r.value.set("b", 2);
      expect(m2.size).toBe(2);
      expect(r.value.size).toBe(1); // original unchanged
    }
  });

  it("caches per (K, V) pair", () => {
    expect(Dict(Str, Int)).toBe(Dict(Str, Int));
  });

  it("has the expected tag", () => {
    expect(Dict(Str, Int).tag).toBe("Dict<Str,Int>");
  });
});

// =============================================================================
// 7. Composers — Maybe
// =============================================================================

describe("Maybe", () => {
  it("parses {tag: 'Some', value} into Some", () => {
    const r = Maybe(Int).parse({ tag: "Some", value: 42 });
    expect(r.isOk).toBe(true);
    expect(Option.is(r.value)).toBe(true);
    expect(r.value.isSome).toBe(true);
    expect(r.value.unwrap()).toBe(42);
  });

  it("parses {tag: 'None'} into None", () => {
    const r = Maybe(Int).parse({ tag: "None" });
    expect(r.isOk).toBe(true);
    expect(r.value.isNone).toBe(true);
  });

  it("parses null into None", () => {
    const r = Maybe(Int).parse(null);
    expect(r.isOk).toBe(true);
    expect(r.value.isNone).toBe(true);
  });

  it("parses undefined into None", () => {
    const r = Maybe(Int).parse(undefined);
    expect(r.isOk).toBe(true);
    expect(r.value.isNone).toBe(true);
  });

  it("validates the inner value", () => {
    const r = Maybe(Int).parse({ tag: "Some", value: "not int" });
    expect(r.isErr).toBe(true);
  });

  it("rejects unknown shapes", () => {
    expect(Maybe(Int).parse({ tag: "Other" }).isErr).toBe(true);
    expect(Maybe(Int).parse(42).isErr).toBe(true);
    expect(Maybe(Int).parse("string").isErr).toBe(true);
  });

  it("caches per inner TypeDef", () => {
    expect(Maybe(Int)).toBe(Maybe(Int));
  });

  it("has the expected tag", () => {
    expect(Maybe(Int).tag).toBe("Maybe<Int>");
  });
});

// =============================================================================
// 8. Composers — Either
// =============================================================================

describe("Either", () => {
  it("parses {tag: 'Left', value} into a Left", () => {
    const r = Either(Str, Int).parse({ tag: "Left", value: "err" });
    expect(r.isOk).toBe(true);
    expect(r.value.tag).toBe("Left");
    expect(r.value.value).toBe("err");
  });

  it("parses {tag: 'Right', value} into a Right", () => {
    const r = Either(Str, Int).parse({ tag: "Right", value: 42 });
    expect(r.isOk).toBe(true);
    expect(r.value.tag).toBe("Right");
    expect(r.value.value).toBe(42);
  });

  it("validates the Left value", () => {
    const r = Either(Str, Int).parse({ tag: "Left", value: 42 });
    expect(r.isErr).toBe(true);
  });

  it("validates the Right value", () => {
    const r = Either(Str, Int).parse({ tag: "Right", value: "not int" });
    expect(r.isErr).toBe(true);
  });

  it("rejects unknown tag", () => {
    expect(Either(Str, Int).parse({ tag: "Middle", value: 1 }).isErr).toBe(true);
  });

  it("rejects missing tag", () => {
    expect(Either(Str, Int).parse({ value: 1 }).isErr).toBe(true);
  });

  it("deep-freezes the parsed value", () => {
    const r = Either(Str, Int).parse({ tag: "Right", value: 42 });
    expect(Object.isFrozen(r.value)).toBe(true);
  });

  it("caches per (L, R) pair", () => {
    expect(Either(Str, Int)).toBe(Either(Str, Int));
  });

  it("has the expected tag", () => {
    expect(Either(Str, Int).tag).toBe("Either<Str,Int>");
  });
});

// =============================================================================
// 9. Composition: composers nest
// =============================================================================

describe("nested composers", () => {
  it("Vec(Vec(Int)) validates 2D arrays", () => {
    const r = Vec(Vec(Int)).parse([
      [1, 2],
      [3, 4],
    ]);
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      // Nested lists: use .at() (index access on object-like elements wraps as record)
      const row0 = r.value.at(0);
      expect(row0.isSome).toBe(true);
      if (row0.isSome) {
        const cell = row0.value.at(1);
        expect(cell.isSome).toBe(true);
        if (cell.isSome) expect(cell.value).toBe(2);
      }
    }
  });

  it("Vec(Vec(Int)) reports deeply nested error path", () => {
    const r = Vec(Vec(Int)).parse([
      [1, 2],
      [3, "bad"],
    ]);
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["1", "1"]);
  });

  it("Dict(Str, Vec(Int)) validates a record of arrays", () => {
    const r = Dict(Str, Vec(Int)).parse({ a: [1, 2], b: [3, 4] });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      const a = r.value.get("a");
      expect(a.isSome).toBe(true);
      if (a.isSome) {
        const first = a.value.at(0);
        expect(first.isSome).toBe(true);
        if (first.isSome) expect(first.value).toBe(1);
      }
    }
  });

  it("Maybe(Vec(Int)) handles missing array", () => {
    const r = Maybe(Vec(Int)).parse(null);
    expect(r.isOk).toBe(true);
    expect(r.value.isNone).toBe(true);
  });

  it("Maybe(Vec(Int)) handles present array", () => {
    const r = Maybe(Vec(Int)).parse({ tag: "Some", value: [1, 2, 3] });
    expect(r.isOk).toBe(true);
    expect(r.value.isSome).toBe(true);
    expect(r.value.unwrap()[0]).toBe(1);
  });

  it("Pair(Str, Maybe(Int)) parses optional second element", () => {
    const r = Pair(Str, Maybe(Int)).parse(["a", null]);
    expect(r.isOk).toBe(true);
    expect(r.value[1].isNone).toBe(true);
  });
});

// =============================================================================
// 10. User-defined types compose with the catalogue
// =============================================================================

describe("user-defined types interop with catalogue composers", () => {
  it("Vec works with a user-defined TypeDef", () => {
    class Email extends TypeDef("Email", Schema.email) {}
    const r = Vec(Email).parse(["a@b.com", "c@d.com"]);
    expect(r.isOk).toBe(true);
    expect(r.value[0]).toBe("a@b.com");
  });

  it("Vec(Email) reports email errors on the element", () => {
    class Email extends TypeDef("Email", Schema.email) {}
    const r = Vec(Email).parse(["a@b.com", "not-an-email"]);
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["1"]);
    expect(r.error.expected).toBe("email");
  });

  it("Dict with user-defined key brand", () => {
    class UserId extends TypeDef("UserId", Schema.string) {}
    class User extends TypeDef("User", Schema.object({ name: Schema.string })) {}
    const r = Dict(UserId, User).parse({ u_001: { name: "Alice" } });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      const u = r.value.get("u_001");
      expect(u.isSome).toBe(true);
      if (u.isSome) expect(u.value.name).toBe("Alice");
    }
  });

  it("Either with two user-defined types", () => {
    class NetError extends TypeDef("NetError", Schema.object({ kind: Schema.string })) {}
    class Response extends TypeDef("Response", Schema.object({ status: Schema.number })) {}
    const okR = Either(NetError, Response).parse({
      tag: "Right",
      value: { status: 200 },
    });
    expect(okR.isOk).toBe(true);
    expect(okR.value.tag).toBe("Right");
    expect(okR.value.value.status).toBe(200);

    const errR = Either(NetError, Response).parse({
      tag: "Left",
      value: { kind: "timeout" },
    });
    expect(errR.isOk).toBe(true);
    expect(errR.value.tag).toBe("Left");
  });
});

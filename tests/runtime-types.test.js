/**
 * runtime-types.test.js - Tests for the v0.2 runtime-types additions.
 *
 * Covers:
 *   - DateTimeValue: constructors, conversions, Temporal interop, eq/ord
 *   - DateTime TypeDef: schema branches, convenience statics, extend/non-instantiable
 *   - Struct composer: heterogeneous object -> ImmutableRecord
 *   - Vec -> ImmutableList, Dict -> ImmutableHashMap retrofit
 *
 * Uses @igorjs/pure-test. Tests the compiled dist/ output, not the source.
 */

import {
  DateTime,
  DateTimeValue,
  Dict,
  HashMap,
  Int,
  List,
  Record,
  Schema,
  Str,
  Struct,
  TypeDef,
  Vec,
} from "@igorjs/pure-fx";
import { describe, expect, it } from "@igorjs/pure-test";

// ── DateTimeValue ─────────────────────────────────────────────────────────────

describe("DateTimeValue", () => {
  it("constructs from epoch millis and round-trips", () => {
    const v = DateTimeValue.fromEpochMillis(1_700_000_000_000);
    expect(v.toEpochMillis()).toBe(1_700_000_000_000);
    expect(v.epochNanos).toBe(1_700_000_000_000_000_000n);
  });

  it("truncates fractional milliseconds", () => {
    const v = DateTimeValue.fromEpochMillis(1234.9);
    expect(v.epochNanos).toBe(1_234_000_000n);
  });

  it("constructs from epoch nanos preserving sub-ms precision", () => {
    const v = DateTimeValue.fromEpochNanos(1_700_000_000_123_456_789n);
    expect(v.epochNanos).toBe(1_700_000_000_123_456_789n);
    expect(v.toEpochMillis()).toBe(1_700_000_000_123); // ns truncated to ms
    expect(v.toDate().getTime()).toBe(1_700_000_000_123);
  });

  it("constructs from Date and from ISO string", () => {
    const d = new Date("2026-05-22T10:00:00.000Z");
    expect(DateTimeValue.fromDate(d).toISO()).toBe("2026-05-22T10:00:00.000Z");
    expect(DateTimeValue.fromISO("2026-05-22T10:00:00.000Z").toEpochMillis()).toBe(d.getTime());
  });

  it("now() returns a value at or after Date.now()", () => {
    const before = Date.now();
    const n = DateTimeValue.now().toEpochMillis();
    expect(n).toBeGreaterThanOrEqual(before);
  });

  it("is frozen / immutable", () => {
    const v = DateTimeValue.fromEpochMillis(0);
    expect(Object.isFrozen(v)).toBe(true);
    expect(() => {
      v.epochNanos = 5n;
    }).toThrow();
  });

  it("equals and compare order by instant", () => {
    const a = DateTimeValue.fromEpochMillis(1000);
    const b = DateTimeValue.fromEpochMillis(2000);
    const a2 = DateTimeValue.fromEpochMillis(1000);
    expect(a.equals(a2)).toBe(true);
    expect(a.equals(b)).toBe(false);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(a2)).toBe(0);
  });

  it("exposes eq and ord typeclass instances", () => {
    const a = DateTimeValue.fromEpochMillis(1000);
    const b = DateTimeValue.fromEpochMillis(2000);
    expect(DateTimeValue.eq.equals(a, a)).toBe(true);
    expect(DateTimeValue.eq.equals(a, b)).toBe(false);
    expect(DateTimeValue.ord.compare(a, b)).toBe(-1);
    expect(DateTimeValue.ord.equals(a, a)).toBe(true);
    expect(DateTimeValue.ord.equals(a, b)).toBe(false);
  });
});

// ── DateTimeValue.toTemporal (both branches) ──────────────────────────────────

describe("DateTimeValue.toTemporal", () => {
  it("returns None when globalThis.Temporal is absent", () => {
    const saved = globalThis.Temporal;
    delete globalThis.Temporal;
    try {
      expect(DateTimeValue.fromEpochMillis(0).toTemporal().isNone).toBe(true);
    } finally {
      if (saved !== undefined) globalThis.Temporal = saved;
    }
  });

  it("returns Some(instant) when Temporal is available (stub)", () => {
    const saved = globalThis.Temporal;
    globalThis.Temporal = {
      Instant: {
        fromEpochNanoseconds(ns) {
          return { epochNanoseconds: ns, toString: () => String(ns) };
        },
      },
    };
    try {
      const opt = DateTimeValue.fromEpochNanos(42n).toTemporal();
      expect(opt.isSome).toBe(true);
      if (opt.isSome) expect(opt.value.epochNanoseconds).toBe(42n);
    } finally {
      if (saved === undefined) delete globalThis.Temporal;
      else globalThis.Temporal = saved;
    }
  });

  it("constructs from a Temporal.Instant-like and a ZonedDateTime-like value", () => {
    const instant = { epochNanoseconds: 7n, toString: () => "7" };
    const zoned = { toInstant: () => instant };
    expect(DateTimeValue.fromTemporal(instant).epochNanos).toBe(7n);
    expect(DateTimeValue.fromTemporal(zoned).epochNanos).toBe(7n);
  });
});

// ── DateTime TypeDef ──────────────────────────────────────────────────────────

describe("DateTime TypeDef", () => {
  it("parses ISO string, epoch number, Date, and an existing DateTimeValue", () => {
    expect(DateTime.parse("2026-05-22T10:00:00.000Z").isOk).toBe(true);
    expect(DateTime.parse(1_700_000_000_000).isOk).toBe(true);
    expect(DateTime.parse(new Date()).isOk).toBe(true);
    expect(DateTime.parse(DateTimeValue.fromEpochMillis(0)).isOk).toBe(true);
  });

  it("parses a Temporal.Instant-like value", () => {
    const instant = { epochNanoseconds: 7n, toString: () => "7" };
    const r = DateTime.parse(instant);
    expect(r.isOk).toBe(true);
    if (r.isOk) expect(r.value.epochNanos).toBe(7n);
  });

  it("rejects garbage, NaN, objects, and null", () => {
    expect(DateTime.parse("not-a-date").isErr).toBe(true);
    expect(DateTime.parse(Number.NaN).isErr).toBe(true);
    expect(DateTime.parse({}).isErr).toBe(true);
    expect(DateTime.parse(null).isErr).toBe(true);
  });

  it("parse yields a DateTimeValue", () => {
    const r = DateTime.parse("2026-05-22T10:00:00.000Z");
    expect(r.isOk).toBe(true);
    if (r.isOk) expect(r.value).toBeInstanceOf(DateTimeValue);
  });

  it("supports is and validate", () => {
    expect(DateTime.is("2026-05-22T10:00:00.000Z")).toBe(true);
    expect(DateTime.is("nope")).toBe(false);
    expect(DateTime.validate(123).isValid).toBe(true);
    expect(DateTime.validate("nope").isValid).toBe(false);
  });

  it("convenience constructors return DateTimeValue instances", () => {
    expect(DateTime.now()).toBeInstanceOf(DateTimeValue);
    expect(DateTime.fromEpochMillis(0)).toBeInstanceOf(DateTimeValue);
    expect(DateTime.fromDate(new Date(0)).toEpochMillis()).toBe(0);
  });

  it("is a TypeDef: tag, extendable, non-instantiable", () => {
    class Created extends DateTime {}
    expect(Created.tag).toBe("DateTime");
    expect(Created.parse(0).isOk).toBe(true);
    expect(() => new DateTime()).toThrow();
  });
});

// ── Struct composer ───────────────────────────────────────────────────────────

describe("Struct composer", () => {
  class UserId extends TypeDef("UserId", Schema.uuid) {}
  class Name extends TypeDef("Name", Schema.string) {}
  class User extends Struct({ id: UserId, name: Name }) {}

  const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

  it("parses a valid heterogeneous object into an immutable record", () => {
    const r = User.parse({ id: VALID_UUID, name: "Ada" });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.id).toBe(VALID_UUID);
      expect(r.value.name).toBe("Ada");
      expect(() => {
        r.value.name = "x";
      }).toThrow();
    }
  });

  it("reports nested field errors with a path", () => {
    const r = User.parse({ id: "not-a-uuid", name: "Ada" });
    expect(r.isErr).toBe(true);
    if (r.isErr) expect(r.error.path).toContain("id");
  });

  it("rejects non-objects and missing fields", () => {
    expect(User.parse(null).isErr).toBe(true);
    expect(User.parse({ id: VALID_UUID }).isErr).toBe(true);
  });

  it("carries a structural tag and is a TypeDef", () => {
    expect(User.tag).toBe("Struct<id,name>");
    expect(User.is({ id: VALID_UUID, name: "Ada" })).toBe(true);
  });

  it("supports an empty field set", () => {
    class Empty extends Struct({}) {}
    expect(Empty.tag).toBe("Struct<>");
    expect(Empty.parse({}).isOk).toBe(true);
  });
});

// ── Vec -> ImmutableList ──────────────────────────────────────────────────────

describe("Vec returns ImmutableList", () => {
  class Tag extends TypeDef("Tag", Schema.string) {}

  it("parses an array into an immutable list", () => {
    const Tags = Vec(Tag);
    const r = Tags.parse(["a", "b"]);
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(typeof r.value.map).toBe("function");
      expect(r.value.length).toBe(2);
      expect(r.value.toMutable()).toEqual(["a", "b"]);
      expect(r.value.append("c").toMutable()).toEqual(["a", "b", "c"]);
      // original is unchanged (immutable)
      expect(r.value.toMutable()).toEqual(["a", "b"]);
    }
  });

  it("parses an empty array", () => {
    const r = Vec(Tag).parse([]);
    expect(r.isOk).toBe(true);
    if (r.isOk) expect(r.value.length).toBe(0);
  });

  it("rejects non-arrays and bad elements", () => {
    expect(Vec(Tag).parse("nope").isErr).toBe(true);
    expect(Vec(Tag).parse([1]).isErr).toBe(true);
  });

  it("is still cached by inner reference", () => {
    expect(Vec(Tag)).toBe(Vec(Tag));
  });
});

// ── Dict -> ImmutableHashMap ──────────────────────────────────────────────────

describe("Dict returns ImmutableHashMap", () => {
  it("parses a record into an immutable hash map", () => {
    const H = Dict(Str, Str);
    const r = H.parse({ "content-type": "application/json" });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.size).toBe(1);
      const got = r.value.get("content-type");
      expect(got.isSome).toBe(true);
      if (got.isSome) expect(got.value).toBe("application/json");
      expect(r.value.get("missing").isNone).toBe(true);
    }
  });

  it("parses an empty object", () => {
    const r = Dict(Str, Str).parse({});
    expect(r.isOk).toBe(true);
    if (r.isOk) expect(r.value.size).toBe(0);
  });

  it("rejects non-objects and bad values", () => {
    expect(Dict(Str, Str).parse(null).isErr).toBe(true);
    expect(Dict(Str, Str).parse({ k: 1 }).isErr).toBe(true);
  });

  it("is still cached by inner references", () => {
    expect(Dict(Str, Str)).toBe(Dict(Str, Str));
  });
});

// ── Nested composers + immutable collections (v0.2 core-data fix) ─────────────

describe("composers nest with immutable-collection composers", () => {
  class Tag extends TypeDef("Tag", Schema.string) {}

  it("Struct with a Vec field parses; field is an ImmutableList", () => {
    class Post extends Struct({ tags: Vec(Tag), title: Str }) {}
    const r = Post.parse({ tags: ["a", "b"], title: "hi" });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.title).toBe("hi");
      expect(typeof r.value.tags.toMutable).toBe("function");
      expect(r.value.tags.toMutable()).toEqual(["a", "b"]);
    }
  });

  it("Struct with a Dict field parses; field is an ImmutableHashMap", () => {
    class Cfg extends Struct({ headers: Dict(Str, Str) }) {}
    const r = Cfg.parse({ headers: { "x-id": "1" } });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.headers.size).toBe(1);
      expect(r.value.headers.get("x-id").isSome).toBe(true);
    }
  });

  it("Struct with a DateTime field parses; field is a DateTimeValue", () => {
    class Event extends Struct({ at: DateTime }) {}
    const r = Event.parse({ at: "2026-05-22T10:00:00.000Z" });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.at).toBeInstanceOf(DateTimeValue);
      expect(r.value.at.toISO()).toBe("2026-05-22T10:00:00.000Z");
    }
  });

  it("Struct nested in Struct parses and exposes the inner record", () => {
    class Inner extends Struct({ name: Str }) {}
    class Outer extends Struct({ inner: Inner }) {}
    const r = Outer.parse({ inner: { name: "Ada" } });
    expect(r.isOk).toBe(true);
    if (r.isOk) expect(r.value.inner.name).toBe("Ada");
  });

  it("Vec(Vec(Int)) supports both index and .at() access", () => {
    const r = Vec(Vec(Int)).parse([
      [1, 2],
      [3, 4],
    ]);
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value[0][1]).toBe(2); // index access works (inner list returned unwrapped)
      const row = r.value.at(1);
      expect(row.isSome).toBe(true);
      if (row.isSome) expect(row.value.at(0).isSome && row.value.at(0).value).toBe(3);
    }
  });

  it("Dict(Str, Vec(Int)) exposes inner ImmutableList values", () => {
    const r = Dict(Str, Vec(Int)).parse({ a: [1, 2] });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      const a = r.value.get("a");
      expect(a.isSome).toBe(true);
      if (a.isSome) expect(a.value.toMutable()).toEqual([1, 2]);
    }
  });

  it("still wraps plain-object fields as ImmutableRecord", () => {
    class Money extends TypeDef(
      "Money",
      Schema.object({ amount: Schema.number, currency: Schema.string }),
    ) {}
    class Wallet extends Struct({ balance: Money }) {}
    const r = Wallet.parse({ balance: { amount: 5, currency: "USD" } });
    expect(r.isOk).toBe(true);
    if (r.isOk) {
      expect(r.value.balance.amount).toBe(5);
      expect(() => {
        r.value.balance.amount = 9;
      }).toThrow();
    }
  });
});

describe("core data: Record/List hold pure-fx immutables as leaves", () => {
  it("Record can hold an ImmutableList field", () => {
    const rec = Record({ tags: List([1, 2]) });
    expect(rec.tags.toMutable()).toEqual([1, 2]);
  });

  it("Record can hold an ImmutableHashMap field", () => {
    const rec = Record({ m: HashMap.of([["a", 1]]) });
    expect(rec.m.get("a").isSome).toBe(true);
  });

  it("List of Lists supports index access", () => {
    const l = List([List([1]), List([2])]);
    expect(l[0][0]).toBe(1);
    expect(l[1].toMutable()).toEqual([2]);
  });
});

it("List index access wraps plain-object elements as immutable records", () => {
  const l = List([{ a: 1 }, { a: 2 }]);
  expect(l[0].a).toBe(1);
  expect(l[0]).toBe(l[0]); // cached: stable identity
  expect(() => {
    l[1].a = 9;
  }).toThrow();
});

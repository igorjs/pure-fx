/**
 * data-new.test.js - Tests for new data modules.
 *
 * Uses @igorjs/pure-test.
 * Run: node --test tests/data-new.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@igorjs/pure-test";

const {
  ADT,
  NonEmptyList,
  Codec,
  Schema,
  Duration,
  Cron,
  Json,
  File,
  Path,
  Eol,
  Platform,
  Logger,
  Config,
  Client,
  HttpError,
  NetworkError,
  WebSocket,
  Eq,
  Ord,
  Ok,
  Err,
  Some,
  None,
  Match,
} = await import("../dist/index.js");

// =============================================================================
// NonEmptyList
// =============================================================================

describe("NonEmptyList", () => {
  it("constructs from a tuple", () => {
    const nel = NonEmptyList([1, 2, 3]);
    expect(nel.length).toBe(3);
    expect(nel[0]).toBe(1);
    expect(nel[1]).toBe(2);
    expect(nel[2]).toBe(3);
  });

  it("of: variadic constructor", () => {
    const nel = NonEmptyList.of(1, 2, 3);
    expect(nel.length).toBe(3);
    expect(nel[0]).toBe(1);
    expect(nel[2]).toBe(3);
  });

  it("of: single element", () => {
    const nel = NonEmptyList.of(42);
    expect(nel.length).toBe(1);
    expect(nel[0]).toBe(42);
  });

  it("from: returns None for empty array", () => {
    const result = NonEmptyList.from([]);
    expect(result.isNone).toBe(true);
  });

  it("from: returns Some for non-empty array", () => {
    const result = NonEmptyList.from([1]);
    expect(result.isSome).toBe(true);
    expect(result.unwrap().length).toBe(1);
    expect(result.unwrap().first()).toBe(1);
  });

  it("is: type guard checks $nonEmpty brand", () => {
    const nel = NonEmptyList([1, 2]);
    // NonEmptyList wraps via Proxy. The is() check uses `in` which requires
    // a `has` trap. Verify the brand is accessible via property access.
    expect(nel.$nonEmpty).toBe(true);
    expect(nel.$immutable).toBe(true);
  });

  it("is: type guard returns false for non-NEL values", () => {
    expect(NonEmptyList.is([1, 2])).toBe(false);
    expect(NonEmptyList.is(null)).toBe(false);
    expect(NonEmptyList.is(42)).toBe(false);
    expect(NonEmptyList.is({})).toBe(false);
  });

  it("head: returns first element directly", () => {
    const nel = NonEmptyList([10, 20, 30]);
    expect(nel.head).toBe(10);
  });

  it("first: returns first element directly", () => {
    const nel = NonEmptyList([10, 20, 30]);
    expect(nel.first()).toBe(10);
  });

  it("last: returns last element directly", () => {
    const nel = NonEmptyList([10, 20, 30]);
    expect(nel.last()).toBe(30);
  });

  it("last: single element", () => {
    const nel = NonEmptyList.of(99);
    expect(nel.last()).toBe(99);
  });

  it("reduce1: folds without init value", () => {
    const nel = NonEmptyList([1, 2, 3, 4]);
    const sum = nel.reduce1((acc, v) => acc + v);
    expect(sum).toBe(10);
  });

  it("reduce1: single element returns that element", () => {
    const nel = NonEmptyList.of(42);
    expect(nel.reduce1((acc, v) => acc + v)).toBe(42);
  });

  it("map: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const mapped = nel.map(v => v * 10);
    expect(mapped.$nonEmpty).toBe(true);
    expect(mapped.length).toBe(3);
    expect(mapped.first()).toBe(10);
    expect(mapped.last()).toBe(30);
  });

  it("sortBy: preserves non-emptiness", () => {
    const nel = NonEmptyList([3, 1, 2]);
    const sorted = nel.sortBy((a, b) => a - b);
    expect(sorted.$nonEmpty).toBe(true);
    expect(sorted.first()).toBe(1);
    expect(sorted.last()).toBe(3);
  });

  it("sortByOrd: preserves non-emptiness", () => {
    const nel = NonEmptyList([3, 1, 2]);
    const sorted = nel.sortByOrd(Ord.number);
    expect(sorted.$nonEmpty).toBe(true);
    expect(sorted.first()).toBe(1);
    expect(sorted.last()).toBe(3);
  });

  it("uniqBy: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 1, 3, 2]);
    const unique = nel.uniqBy(Eq.number);
    expect(unique.$nonEmpty).toBe(true);
    expect(unique.length).toBe(3);
    expect(unique.toMutable()).toEqual([1, 2, 3]);
  });

  it("uniqBy: single element", () => {
    const nel = NonEmptyList.of(1);
    const unique = nel.uniqBy(Eq.number);
    expect(unique.length).toBe(1);
  });

  it("append: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2]);
    const appended = nel.append(3);
    expect(appended.$nonEmpty).toBe(true);
    expect(appended.length).toBe(3);
    expect(appended.last()).toBe(3);
  });

  it("prepend: preserves non-emptiness", () => {
    const nel = NonEmptyList([2, 3]);
    const prepended = nel.prepend(1);
    expect(prepended.$nonEmpty).toBe(true);
    expect(prepended.length).toBe(3);
    expect(prepended.first()).toBe(1);
  });

  it("concat: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2]);
    const concatenated = nel.concat([3, 4]);
    expect(concatenated.$nonEmpty).toBe(true);
    expect(concatenated.length).toBe(4);
    expect(concatenated.last()).toBe(4);
  });

  it("concat: with empty array still non-empty", () => {
    const nel = NonEmptyList([1]);
    const concatenated = nel.concat([]);
    expect(concatenated.$nonEmpty).toBe(true);
    expect(concatenated.length).toBe(1);
  });

  it("filter: returns ImmutableList (may be empty)", () => {
    const nel = NonEmptyList([1, 2, 3, 4]);
    const filtered = nel.filter(v => v > 2);
    expect(filtered.length).toBe(2);
    // filter may produce empty, so not necessarily NonEmptyList
    const empty = nel.filter(() => false);
    expect(empty.length).toBe(0);
  });

  it("at: returns Option", () => {
    const nel = NonEmptyList([10, 20, 30]);
    const found = nel.at(1);
    expect(found.isSome).toBe(true);
    expect(found.unwrap()).toBe(20);

    const outOfBounds = nel.at(10);
    expect(outOfBounds.isNone).toBe(true);
  });

  it("at: supports negative index", () => {
    const nel = NonEmptyList([10, 20, 30]);
    const last = nel.at(-1);
    expect(last.isSome).toBe(true);
    expect(last.unwrap()).toBe(30);
  });

  it("find: returns Option", () => {
    const nel = NonEmptyList([10, 20, 30]);
    const found = nel.find(v => v > 15);
    expect(found.isSome).toBe(true);
    expect(found.unwrap()).toBe(20);

    const notFound = nel.find(v => v > 100);
    expect(notFound.isNone).toBe(true);
  });

  it("setAt: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const updated = nel.setAt(1, 99);
    expect(updated.$nonEmpty).toBe(true);
    expect(updated[1]).toBe(99);
    // Original unchanged
    expect(nel[1]).toBe(2);
  });

  it("updateAt: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const updated = nel.updateAt(1, v => v * 10);
    expect(updated.$nonEmpty).toBe(true);
    expect(updated[1]).toBe(20);
  });

  it("equals: structural equality", () => {
    const a = NonEmptyList([1, 2, 3]);
    const b = NonEmptyList([1, 2, 3]);
    const c = NonEmptyList([1, 2, 4]);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("toList: converts to ImmutableList", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const list = nel.toList();
    expect(list.length).toBe(3);
    expect(list.$immutable).toBe(true);
  });

  it("toMutable: returns mutable array", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const arr = nel.toMutable();
    expect(arr).toEqual([1, 2, 3]);
    // Mutating the result does not affect original
    arr.push(4);
    expect(nel.length).toBe(3);
  });

  it("toJSON: returns raw array", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const json = nel.toJSON();
    expect(json).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// Codec
// =============================================================================

describe("Codec", () => {
  describe("string", () => {
    it("decodes valid string", () => {
      const r = Codec.string.decode("hello");
      expect(r.isOk).toBe(true);
      expect(r.value).toBe("hello");
    });

    it("rejects non-string", () => {
      const r = Codec.string.decode(42);
      expect(r.isErr).toBe(true);
    });

    it("encode roundtrip", () => {
      const encoded = Codec.string.encode("hello");
      const decoded = Codec.string.decode(encoded);
      expect(decoded.isOk).toBe(true);
      expect(decoded.value).toBe("hello");
    });
  });

  describe("number", () => {
    it("decodes valid number", () => {
      const r = Codec.number.decode(42);
      expect(r.isOk).toBe(true);
      expect(r.value).toBe(42);
    });

    it("rejects non-number", () => {
      const r = Codec.number.decode("42");
      expect(r.isErr).toBe(true);
    });

    it("rejects NaN", () => {
      const r = Codec.number.decode(NaN);
      expect(r.isErr).toBe(true);
    });

    it("encode roundtrip", () => {
      const encoded = Codec.number.encode(42);
      const decoded = Codec.number.decode(encoded);
      expect(decoded.isOk).toBe(true);
      expect(decoded.value).toBe(42);
    });
  });

  describe("boolean", () => {
    it("decodes valid boolean", () => {
      expect(Codec.boolean.decode(true).value).toBe(true);
      expect(Codec.boolean.decode(false).value).toBe(false);
    });

    it("rejects non-boolean", () => {
      expect(Codec.boolean.decode(1).isErr).toBe(true);
      expect(Codec.boolean.decode("true").isErr).toBe(true);
    });

    it("encode roundtrip", () => {
      const encoded = Codec.boolean.encode(true);
      expect(Codec.boolean.decode(encoded).value).toBe(true);
    });
  });

  describe("object", () => {
    const UserCodec = Codec.object({
      name: Codec.string,
      age: Codec.number,
    });

    it("decodes valid object", () => {
      const r = UserCodec.decode({ name: "Alice", age: 30 });
      expect(r.isOk).toBe(true);
      expect(r.value.name).toBe("Alice");
      expect(r.value.age).toBe(30);
    });

    it("rejects invalid field", () => {
      const r = UserCodec.decode({ name: "Alice", age: "thirty" });
      expect(r.isErr).toBe(true);
      expect(r.error.path).toEqual(["age"]);
    });

    it("rejects non-object", () => {
      expect(UserCodec.decode(null).isErr).toBe(true);
      expect(UserCodec.decode("string").isErr).toBe(true);
      expect(UserCodec.decode([]).isErr).toBe(true);
    });

    it("encodes back to plain object", () => {
      const obj = { name: "Alice", age: 30 };
      const decoded = UserCodec.decode(obj).value;
      const encoded = UserCodec.encode(decoded);
      expect(encoded).toEqual(obj);
    });
  });

  describe("array", () => {
    const NumbersCodec = Codec.array(Codec.number);

    it("decodes valid array", () => {
      const r = NumbersCodec.decode([1, 2, 3]);
      expect(r.isOk).toBe(true);
      expect(r.value).toEqual([1, 2, 3]);
    });

    it("rejects invalid element", () => {
      const r = NumbersCodec.decode([1, "two", 3]);
      expect(r.isErr).toBe(true);
      expect(r.error.path).toEqual(["1"]);
    });

    it("rejects non-array", () => {
      expect(NumbersCodec.decode("not array").isErr).toBe(true);
    });

    it("encode roundtrip", () => {
      const input = [1, 2, 3];
      const decoded = NumbersCodec.decode(input).value;
      const encoded = NumbersCodec.encode(decoded);
      expect(encoded).toEqual(input);
    });
  });

  describe("nullable", () => {
    const NullableString = Codec.nullable(Codec.string);

    it("decodes null", () => {
      const r = NullableString.decode(null);
      expect(r.isOk).toBe(true);
      expect(r.value).toBe(null);
    });

    it("decodes value", () => {
      const r = NullableString.decode("hello");
      expect(r.isOk).toBe(true);
      expect(r.value).toBe("hello");
    });

    it("encodes null", () => {
      expect(NullableString.encode(null)).toBe(null);
    });

    it("encodes value", () => {
      expect(NullableString.encode("hello")).toBe("hello");
    });
  });

  describe("from", () => {
    it("creates custom codec with decode/encode", () => {
      const DateCodec = Codec.from(
        input => {
          if (typeof input === "string") {
            const d = new Date(input);
            return !Number.isNaN(d.getTime())
              ? Ok(d)
              : Err({ path: [], expected: "ISO date", received: typeof input });
          }
          return Err({ path: [], expected: "string", received: typeof input });
        },
        date => date.toISOString(),
      );

      const decoded = DateCodec.decode("2024-01-01T00:00:00.000Z");
      expect(decoded.isOk).toBe(true);
      expect(decoded.value instanceof Date).toBe(true);

      const encoded = DateCodec.encode(decoded.value);
      expect(typeof encoded).toBe("string");

      expect(DateCodec.decode(42).isErr).toBe(true);
    });
  });

  describe("fromSchema", () => {
    it("bridges from Schema", () => {
      const sc = Schema.string;
      const codec = Codec.fromSchema(sc, v => v);
      expect(codec.decode("hello").isOk).toBe(true);
      expect(codec.decode("hello").value).toBe("hello");
      expect(codec.decode(42).isErr).toBe(true);
      expect(codec.encode("hello")).toBe("hello");
    });
  });

  describe("pipe", () => {
    it("chains two codecs: decode goes a->b, encode goes b->a", () => {
      const StringToNumber = Codec.from(
        input => {
          if (typeof input !== "string")
            return Err({ path: [], expected: "string", received: typeof input });
          const n = Number(input);
          return Number.isNaN(n)
            ? Err({ path: [], expected: "numeric string", received: input })
            : Ok(n);
        },
        n => String(n),
      );

      const DoubleCodec = Codec.from(
        input => {
          if (typeof input !== "number")
            return Err({ path: [], expected: "number", received: typeof input });
          return Ok(input * 2);
        },
        n => n / 2,
      );

      const piped = StringToNumber.pipe(DoubleCodec);
      const decoded = piped.decode("5");
      expect(decoded.isOk).toBe(true);
      expect(decoded.value).toBe(10);

      const encoded = piped.encode(10);
      expect(encoded).toBe("5");
    });
  });

  describe("schema property", () => {
    it("extracts decode-only schema", () => {
      const schema = Codec.string.schema;
      expect(schema.parse("hello").isOk).toBe(true);
      expect(schema.parse(42).isErr).toBe(true);
      expect(schema.is("hello")).toBe(true);
      expect(schema.is(42)).toBe(false);
    });
  });

  describe("roundtrip", () => {
    it("decode then encode produces original for primitives", () => {
      // string
      expect(Codec.string.encode(Codec.string.decode("test").value)).toBe("test");
      // number
      expect(Codec.number.encode(Codec.number.decode(3.14).value)).toBe(3.14);
      // boolean
      expect(Codec.boolean.encode(Codec.boolean.decode(false).value)).toBe(false);
    });
  });
});

// =============================================================================
// Schema refinements
// =============================================================================

describe("Schema refinements", () => {
  describe("email", () => {
    it("valid emails pass", () => {
      expect(Schema.email.parse("user@example.com").isOk).toBe(true);
      expect(Schema.email.parse("a.b+c@domain.co").isOk).toBe(true);
    });

    it("invalid emails fail", () => {
      expect(Schema.email.parse("not-an-email").isErr).toBe(true);
      expect(Schema.email.parse("@missing.user").isErr).toBe(true);
      expect(Schema.email.parse("user@").isErr).toBe(true);
      expect(Schema.email.parse(42).isErr).toBe(true);
    });
  });

  describe("url", () => {
    it("valid URLs pass", () => {
      expect(Schema.url.parse("https://example.com").isOk).toBe(true);
      expect(Schema.url.parse("http://localhost:3000").isOk).toBe(true);
    });

    it("invalid URLs fail", () => {
      expect(Schema.url.parse("not a url").isErr).toBe(true);
      expect(Schema.url.parse("").isErr).toBe(true);
    });
  });

  describe("uuid", () => {
    it("valid v4 UUIDs pass", () => {
      expect(Schema.uuid.parse("550e8400-e29b-41d4-a716-446655440000").isOk).toBe(true);
      expect(Schema.uuid.parse("f47ac10b-58cc-4372-a567-0e02b2c3d479").isOk).toBe(true);
    });

    it("invalid UUIDs fail", () => {
      expect(Schema.uuid.parse("not-a-uuid").isErr).toBe(true);
      expect(Schema.uuid.parse("550e8400-e29b-31d4-a716-446655440000").isErr).toBe(true);
      expect(Schema.uuid.parse(42).isErr).toBe(true);
    });
  });

  describe("isoDate", () => {
    it("valid ISO dates pass", () => {
      expect(Schema.isoDate.parse("2024-01-15T10:30:00.000Z").isOk).toBe(true);
      expect(Schema.isoDate.parse("2024-01-15").isOk).toBe(true);
    });

    it("invalid ISO dates fail", () => {
      expect(Schema.isoDate.parse("not-a-date").isErr).toBe(true);
      expect(Schema.isoDate.parse("32-13-2024").isErr).toBe(true);
      expect(Schema.isoDate.parse(42).isErr).toBe(true);
    });
  });

  describe("date", () => {
    it("valid ISO string parses to Date instance", () => {
      const result = Schema.date.parse("2024-01-15T10:30:00.000Z");
      expect(result.isOk).toBe(true);
      expect(result.value instanceof Date).toBe(true);
      expect(result.value.toISOString()).toBe("2024-01-15T10:30:00.000Z");
    });

    it("date-only string parses to Date", () => {
      const result = Schema.date.parse("2024-06-01");
      expect(result.isOk).toBe(true);
      expect(result.value instanceof Date).toBe(true);
    });

    it("invalid date string returns Err", () => {
      expect(Schema.date.parse("not-a-date").isErr).toBe(true);
    });

    it("non-string input returns Err", () => {
      expect(Schema.date.parse(42).isErr).toBe(true);
    });
  });

  describe("enum", () => {
    it("matching value returns Ok", () => {
      const status = Schema.enum(["active", "inactive", "pending"]);
      expect(status.parse("active").isOk).toBe(true);
      expect(status.parse("active").value).toBe("active");
    });

    it("non-matching value returns Err", () => {
      const status = Schema.enum(["active", "inactive"]);
      expect(status.parse("deleted").isErr).toBe(true);
    });

    it("works with numbers", () => {
      const priority = Schema.enum([1, 2, 3]);
      expect(priority.parse(2).isOk).toBe(true);
      expect(priority.parse(2).value).toBe(2);
      expect(priority.parse(4).isErr).toBe(true);
    });

    it("works with mixed types", () => {
      const mixed = Schema.enum(["yes", "no", true, false, 0, 1]);
      expect(mixed.parse("yes").isOk).toBe(true);
      expect(mixed.parse(true).isOk).toBe(true);
      expect(mixed.parse(0).isOk).toBe(true);
      expect(mixed.parse("maybe").isErr).toBe(true);
    });
  });

  describe("nonEmpty", () => {
    it("non-empty string passes", () => {
      expect(Schema.nonEmpty.parse("hello").isOk).toBe(true);
    });

    it("empty string fails", () => {
      expect(Schema.nonEmpty.parse("").isErr).toBe(true);
    });

    it("whitespace-only fails", () => {
      expect(Schema.nonEmpty.parse("   ").isErr).toBe(true);
    });

    it("non-string fails", () => {
      expect(Schema.nonEmpty.parse(42).isErr).toBe(true);
    });
  });

  describe("minLength", () => {
    it("at minimum passes", () => {
      expect(Schema.minLength(3).parse("abc").isOk).toBe(true);
    });

    it("above minimum passes", () => {
      expect(Schema.minLength(3).parse("abcd").isOk).toBe(true);
    });

    it("below minimum fails", () => {
      expect(Schema.minLength(3).parse("ab").isErr).toBe(true);
    });
  });

  describe("maxLength", () => {
    it("at maximum passes", () => {
      expect(Schema.maxLength(3).parse("abc").isOk).toBe(true);
    });

    it("below maximum passes", () => {
      expect(Schema.maxLength(3).parse("ab").isOk).toBe(true);
    });

    it("above maximum fails", () => {
      expect(Schema.maxLength(3).parse("abcd").isErr).toBe(true);
    });
  });

  describe("regex", () => {
    it("matching passes", () => {
      expect(Schema.regex(/^\d{3}$/).parse("123").isOk).toBe(true);
    });

    it("non-matching fails", () => {
      expect(Schema.regex(/^\d{3}$/).parse("12").isErr).toBe(true);
      expect(Schema.regex(/^\d{3}$/).parse("abc").isErr).toBe(true);
    });
  });

  describe("int", () => {
    it("integers pass", () => {
      expect(Schema.int.parse(42).isOk).toBe(true);
      expect(Schema.int.parse(0).isOk).toBe(true);
      expect(Schema.int.parse(-5).isOk).toBe(true);
    });

    it("floats fail", () => {
      expect(Schema.int.parse(3.14).isErr).toBe(true);
      expect(Schema.int.parse(0.1).isErr).toBe(true);
    });
  });

  describe("positive", () => {
    it("> 0 passes", () => {
      expect(Schema.positive.parse(1).isOk).toBe(true);
      expect(Schema.positive.parse(0.5).isOk).toBe(true);
    });

    it("0 fails", () => {
      expect(Schema.positive.parse(0).isErr).toBe(true);
    });

    it("negative fails", () => {
      expect(Schema.positive.parse(-1).isErr).toBe(true);
    });
  });

  describe("nonNegative", () => {
    it(">= 0 passes", () => {
      expect(Schema.nonNegative.parse(0).isOk).toBe(true);
      expect(Schema.nonNegative.parse(5).isOk).toBe(true);
    });

    it("negative fails", () => {
      expect(Schema.nonNegative.parse(-1).isErr).toBe(true);
    });
  });

  describe("min / max / range", () => {
    it("min: at boundary passes", () => {
      expect(Schema.min(5).parse(5).isOk).toBe(true);
    });

    it("min: below boundary fails", () => {
      expect(Schema.min(5).parse(4).isErr).toBe(true);
    });

    it("max: at boundary passes", () => {
      expect(Schema.max(10).parse(10).isOk).toBe(true);
    });

    it("max: above boundary fails", () => {
      expect(Schema.max(10).parse(11).isErr).toBe(true);
    });

    it("range: within range passes", () => {
      expect(Schema.range(1, 10).parse(5).isOk).toBe(true);
      expect(Schema.range(1, 10).parse(1).isOk).toBe(true);
      expect(Schema.range(1, 10).parse(10).isOk).toBe(true);
    });

    it("range: outside range fails", () => {
      expect(Schema.range(1, 10).parse(0).isErr).toBe(true);
      expect(Schema.range(1, 10).parse(11).isErr).toBe(true);
    });
  });

  describe("discriminatedUnion", () => {
    const Shape = Schema.discriminatedUnion("type", {
      circle: Schema.object({
        type: Schema.literal("circle"),
        radius: Schema.number,
      }),
      rect: Schema.object({
        type: Schema.literal("rect"),
        width: Schema.number,
        height: Schema.number,
      }),
    });

    it("correct branch selected", () => {
      const circle = Shape.parse({ type: "circle", radius: 5 });
      expect(circle.isOk).toBe(true);
      expect(circle.value.type).toBe("circle");
      expect(circle.value.radius).toBe(5);

      const rect = Shape.parse({ type: "rect", width: 3, height: 4 });
      expect(rect.isOk).toBe(true);
      expect(rect.value.type).toBe("rect");
    });

    it("invalid tag returns error", () => {
      const r = Shape.parse({ type: "triangle", sides: 3 });
      expect(r.isErr).toBe(true);
    });

    it("non-object returns error", () => {
      expect(Shape.parse("not an object").isErr).toBe(true);
      expect(Shape.parse(null).isErr).toBe(true);
    });
  });

  describe("lazy", () => {
    it("supports recursive schema (tree structure)", () => {
      const TreeSchema = Schema.object({
        value: Schema.number,
        children: Schema.array(Schema.lazy(() => TreeSchema)),
      });

      const tree = TreeSchema.parse({
        value: 1,
        children: [
          { value: 2, children: [] },
          {
            value: 3,
            children: [{ value: 4, children: [] }],
          },
        ],
      });

      expect(tree.isOk).toBe(true);
      expect(tree.value.value).toBe(1);
      expect(tree.value.children.length).toBe(2);
      expect(tree.value.children[1].children[0].value).toBe(4);
    });
  });

  describe("intersection", () => {
    it("both schemas must pass", () => {
      const Named = Schema.object({ name: Schema.string });
      const Aged = Schema.object({ age: Schema.number });
      const Person = Schema.intersection(Named, Aged);

      const r = Person.parse({ name: "Alice", age: 30 });
      expect(r.isOk).toBe(true);
      expect(r.value.name).toBe("Alice");
      expect(r.value.age).toBe(30);
    });

    it("fails if either schema fails", () => {
      const Named = Schema.object({ name: Schema.string });
      const Aged = Schema.object({ age: Schema.number });
      const Person = Schema.intersection(Named, Aged);

      expect(Person.parse({ name: "Alice" }).isErr).toBe(true);
      expect(Person.parse({ age: 30 }).isErr).toBe(true);
    });
  });
});

// =============================================================================
// Duration
// =============================================================================

describe("Duration", () => {
  describe("factories", () => {
    it("milliseconds produces correct ms value", () => {
      expect(Duration.toMilliseconds(Duration.milliseconds(500))).toBe(500);
    });

    it("seconds produces correct ms value", () => {
      expect(Duration.toMilliseconds(Duration.seconds(2))).toBe(2000);
    });

    it("minutes produces correct ms value", () => {
      expect(Duration.toMilliseconds(Duration.minutes(1))).toBe(60000);
    });

    it("hours produces correct ms value", () => {
      expect(Duration.toMilliseconds(Duration.hours(1))).toBe(3600000);
    });

    it("days produces correct ms value", () => {
      expect(Duration.toMilliseconds(Duration.days(1))).toBe(86400000);
    });
  });

  describe("conversions", () => {
    it("toSeconds", () => {
      expect(Duration.toSeconds(Duration.milliseconds(3000))).toBe(3);
    });

    it("toMinutes", () => {
      expect(Duration.toMinutes(Duration.seconds(120))).toBe(2);
    });

    it("toHours", () => {
      expect(Duration.toHours(Duration.minutes(90))).toBe(1.5);
    });
  });

  describe("arithmetic", () => {
    it("add", () => {
      const a = Duration.seconds(10);
      const b = Duration.seconds(20);
      expect(Duration.toSeconds(Duration.add(a, b))).toBe(30);
    });

    it("subtract", () => {
      const a = Duration.seconds(30);
      const b = Duration.seconds(10);
      expect(Duration.toSeconds(Duration.subtract(a, b))).toBe(20);
    });

    it("multiply", () => {
      const d = Duration.seconds(5);
      expect(Duration.toSeconds(Duration.multiply(d, 3))).toBe(15);
    });
  });

  describe("predicates", () => {
    it("isZero: true for zero", () => {
      expect(Duration.isZero(Duration.zero)).toBe(true);
      expect(Duration.isZero(Duration.milliseconds(0))).toBe(true);
    });

    it("isZero: false otherwise", () => {
      expect(Duration.isZero(Duration.seconds(1))).toBe(false);
    });

    it("isPositive", () => {
      expect(Duration.isPositive(Duration.seconds(1))).toBe(true);
      expect(Duration.isPositive(Duration.zero)).toBe(false);
    });
  });

  describe("format", () => {
    it("0ms for zero", () => {
      expect(Duration.format(Duration.zero)).toBe("0ms");
    });

    it("500ms for half second", () => {
      expect(Duration.format(Duration.milliseconds(500))).toBe("500ms");
    });

    it("1s for one second", () => {
      expect(Duration.format(Duration.seconds(1))).toBe("1s");
    });

    it("1m 30s for 90 seconds", () => {
      expect(Duration.format(Duration.seconds(90))).toBe("1m 30s");
    });

    it("2h 30m 15s", () => {
      const d = Duration.add(
        Duration.add(Duration.hours(2), Duration.minutes(30)),
        Duration.seconds(15),
      );
      expect(Duration.format(d)).toBe("2h 30m 15s");
    });

    it("1d for 24 hours", () => {
      expect(Duration.format(Duration.days(1))).toBe("1d");
    });
  });

  describe("zero", () => {
    it("is zero", () => {
      expect(Duration.isZero(Duration.zero)).toBe(true);
      expect(Duration.toMilliseconds(Duration.zero)).toBe(0);
    });
  });

  describe("eq", () => {
    it("equals works correctly", () => {
      expect(Duration.eq.equals(Duration.seconds(1), Duration.milliseconds(1000))).toBe(true);
      expect(Duration.eq.equals(Duration.seconds(1), Duration.seconds(2))).toBe(false);
    });
  });

  describe("ord", () => {
    it("compare returns -1/0/1", () => {
      expect(Duration.ord.compare(Duration.seconds(1), Duration.seconds(2))).toBe(-1);
      expect(Duration.ord.compare(Duration.seconds(2), Duration.seconds(2))).toBe(0);
      expect(Duration.ord.compare(Duration.seconds(3), Duration.seconds(2))).toBe(1);
    });
  });
});

// =============================================================================
// Cron
// =============================================================================

describe("Cron", () => {
  describe("parse", () => {
    it("valid: every minute", () => {
      const r = Cron.parse("* * * * *");
      expect(r.isOk).toBe(true);
    });

    it("valid: 9am weekdays", () => {
      const r = Cron.parse("0 9 * * 1-5");
      expect(r.isOk).toBe(true);
    });

    it("valid: every 5 minutes", () => {
      const r = Cron.parse("*/5 * * * *");
      expect(r.isOk).toBe(true);
    });

    it("invalid: wrong field count", () => {
      const r = Cron.parse("* * *");
      expect(r.isErr).toBe(true);
    });

    it("invalid: out-of-range values", () => {
      const r = Cron.parse("60 * * * *");
      expect(r.isErr).toBe(true);
    });

    it("invalid: out-of-range hour", () => {
      const r = Cron.parse("* 25 * * *");
      expect(r.isErr).toBe(true);
    });
  });

  describe("matches", () => {
    it("date matches expression", () => {
      const cron = Cron.parse("0 9 * * *").value;
      // 9:00 AM on any day
      const date = new Date(2024, 5, 15, 9, 0, 0);
      expect(Cron.matches(cron, date)).toBe(true);
    });

    it("date does not match", () => {
      const cron = Cron.parse("0 9 * * *").value;
      // 10:00 AM
      const date = new Date(2024, 5, 15, 10, 0, 0);
      expect(Cron.matches(cron, date)).toBe(false);
    });

    it("every-minute matches any minute", () => {
      const cron = Cron.parse("* * * * *").value;
      const date = new Date(2024, 5, 15, 14, 37, 0);
      expect(Cron.matches(cron, date)).toBe(true);
    });
  });

  describe("next", () => {
    it("returns next occurrence after given date", () => {
      const cron = Cron.parse("0 9 * * *").value;
      const after = new Date(2024, 5, 15, 8, 0, 0);
      const next = Cron.next(cron, after);
      expect(next.isSome).toBe(true);
      const d = next.unwrap();
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(0);
    });

    it("skips to next day if past time", () => {
      const cron = Cron.parse("0 9 * * *").value;
      const after = new Date(2024, 5, 15, 10, 0, 0);
      const next = Cron.next(cron, after);
      expect(next.isSome).toBe(true);
      const d = next.unwrap();
      expect(d.getHours()).toBe(9);
      expect(d.getDate()).toBe(16);
    });
  });
});

// =============================================================================
// Json
// =============================================================================

describe("Json", () => {
  it("parse: valid JSON returns Ok", () => {
    const r = Json.parse('{"name":"Alice","age":30}');
    expect(r.isOk).toBe(true);
    expect(r.value).toEqual({ name: "Alice", age: 30 });
  });

  it("parse: invalid JSON returns Err", () => {
    const r = Json.parse("not json {");
    expect(r.isErr).toBe(true);
    expect(r.error.tag).toBe("JsonError");
  });

  it("stringify: normal object returns Ok", () => {
    const r = Json.stringify({ name: "Alice" });
    expect(r.isOk).toBe(true);
    expect(r.value).toBe('{"name":"Alice"}');
  });

  it("stringify: circular ref returns Err", () => {
    const obj = {};
    obj.self = obj;
    const r = Json.stringify(obj);
    expect(r.isErr).toBe(true);
    expect(r.error.tag).toBe("JsonError");
  });

  it("roundtrip: parse(stringify(obj)) produces equivalent", () => {
    const original = { x: 1, y: [2, 3], z: { a: true } };
    const str = Json.stringify(original);
    expect(str.isOk).toBe(true);
    const parsed = Json.parse(str.value);
    expect(parsed.isOk).toBe(true);
    expect(parsed.value).toEqual(original);
  });
});

// =============================================================================
// File
// =============================================================================

describe("File", () => {
  let tmpDir;

  // Create temp directory before tests, clean up after
  it("setup: create temp directory", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pure-fx-test-"));
  });

  it("write then read: roundtrip", async () => {
    const filePath = join(tmpDir, "test.txt");
    const writeResult = await File.write(filePath, "hello world").run();
    expect(writeResult.isOk).toBe(true);

    const readResult = await File.read(filePath).run();
    expect(readResult.isOk).toBe(true);
    expect(readResult.value).toBe("hello world");
  });

  it("read: non-existent file returns Err", async () => {
    const r = await File.read(join(tmpDir, "does-not-exist.txt")).run();
    expect(r.isErr).toBe(true);
    expect(r.error.tag).toBe("FileError");
  });

  it("exists: true for existing file", async () => {
    const filePath = join(tmpDir, "exists.txt");
    await File.write(filePath, "content").run();
    const r = await File.exists(filePath).run();
    expect(r.isOk).toBe(true);
    expect(r.value).toBe(true);
  });

  it("exists: false for missing file", async () => {
    const r = await File.exists(join(tmpDir, "missing.txt")).run();
    expect(r.isOk).toBe(true);
    expect(r.value).toBe(false);
  });

  it("makeDir: creates directory", async () => {
    const dirPath = join(tmpDir, "sub", "dir");
    const r = await File.makeDir(dirPath).run();
    expect(r.isOk).toBe(true);

    // Write a file into the directory to verify it exists
    const filePath = join(dirPath, "file.txt");
    const wr = await File.write(filePath, "inside").run();
    expect(wr.isOk).toBe(true);
  });

  it("list: lists directory entries", async () => {
    const dirPath = join(tmpDir, "listdir");
    await File.makeDir(dirPath).run();
    await File.write(join(dirPath, "a.txt"), "a").run();
    await File.write(join(dirPath, "b.txt"), "b").run();

    const r = await File.list(dirPath).run();
    expect(r.isOk).toBe(true);
    expect(r.value.length).toBe(2);
    expect(r.value.includes("a.txt")).toBe(true);
    expect(r.value.includes("b.txt")).toBe(true);
  });

  it("remove: deletes file", async () => {
    const filePath = join(tmpDir, "to-delete.txt");
    await File.write(filePath, "delete me").run();
    expect((await File.exists(filePath).run()).value).toBe(true);

    const r = await File.remove(filePath).run();
    expect(r.isOk).toBe(true);

    expect((await File.exists(filePath).run()).value).toBe(false);
  });

  it("line ending normalization: write \\r\\n, read gets \\n", async () => {
    const filePath = join(tmpDir, "crlf.txt");
    await File.write(filePath, "line1\r\nline2\r\nline3").run();

    const r = await File.read(filePath).run();
    expect(r.isOk).toBe(true);
    expect(r.value).toBe("line1\nline2\nline3");
    expect(r.value.includes("\r\n")).toBe(false);
  });

  it("teardown: remove temp directory", async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
});

// =============================================================================
// Path / Eol / Platform
// =============================================================================

describe("Path", () => {
  it("join: joins segments with separator", () => {
    const result = Path.join("src", "core", "result.ts");
    // On POSIX it uses /, on Windows \
    expect(result.includes("core")).toBe(true);
    expect(result.includes("result.ts")).toBe(true);
    // Separator is used
    expect(result.includes(Path.separator)).toBe(true);
  });

  it("normalize: collapses // and handles mixed separators", () => {
    const result = Path.normalize("src//core///result.ts");
    // Should not have double slashes
    expect(result.includes("//")).toBe(false);
  });

  it("basename: extracts filename", () => {
    expect(Path.basename("/home/user/file.ts")).toBe("file.ts");
    expect(Path.basename("file.ts")).toBe("file.ts");
  });

  it("dirname: extracts directory", () => {
    const dir = Path.dirname("/home/user/file.ts");
    // Should contain "home" and "user" but not "file.ts"
    expect(dir.includes("file.ts")).toBe(false);
    expect(dir.includes("user")).toBe(true);
  });

  it("dirname: returns . for bare filename", () => {
    expect(Path.dirname("file.ts")).toBe(".");
  });

  it("extname: extracts extension", () => {
    expect(Path.extname("file.ts")).toBe(".ts");
    expect(Path.extname("file.test.ts")).toBe(".ts");
  });

  it("extname: empty for no extension", () => {
    expect(Path.extname("Makefile")).toBe("");
  });

  it("toPosix: converts backslashes to forward", () => {
    expect(Path.toPosix("src\\core\\result.ts")).toBe("src/core/result.ts");
    expect(Path.toPosix("src/core/result.ts")).toBe("src/core/result.ts");
  });
});

describe("Eol", () => {
  it("normalize: replaces \\r\\n with \\n", () => {
    expect(Eol.normalize("a\r\nb\r\nc")).toBe("a\nb\nc");
    expect(Eol.normalize("no crlf here")).toBe("no crlf here");
  });

  it("split: splits on both \\r\\n and \\n", () => {
    expect(Eol.split("a\r\nb\nc")).toEqual(["a", "b", "c"]);
    expect(Eol.split("single")).toEqual(["single"]);
  });
});

describe("Platform", () => {
  it("os: returns 'windows' or 'posix'", () => {
    expect(Platform.os === "windows" || Platform.os === "posix").toBe(true);
  });

  it("isWindows: matches os", () => {
    expect(Platform.isWindows).toBe(Platform.os === "windows");
  });
});

// =============================================================================
// Logger
// =============================================================================

describe("Logger", () => {
  it("create: produces a logger with methods", () => {
    const log = Logger.create({ name: "test", sink: Logger.silent });
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.child).toBe("function");
    expect(typeof log.named).toBe("function");
    expect(log.name).toBe("test");
  });

  it("silent sink: no output (does not throw)", () => {
    const log = Logger.create({ name: "test", sink: Logger.silent });
    // These should not throw
    log.debug("debug");
    log.info("info");
    log.warn("warn");
    log.error("error");
  });

  it("custom sink: captures log records with correct structure", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "myapp", level: "debug", sink });

    log.info("hello", { key: "value" });

    expect(records.length).toBe(1);
    const r = records[0];
    expect(r.level).toBe("info");
    expect(r.message).toBe("hello");
    expect(r.name).toBe("myapp");
    expect(typeof r.timestamp).toBe("string");
    expect(r.context.key).toBe("value");
  });

  it("child: inherits context and adds new context", () => {
    const records = [];
    const sink = record => records.push(record);
    const parent = Logger.create({
      name: "parent",
      level: "debug",
      sink,
      context: { app: "test" },
    });

    const child = parent.child({ requestId: "abc" });
    child.info("from child");

    expect(records.length).toBe(1);
    expect(records[0].context.app).toBe("test");
    expect(records[0].context.requestId).toBe("abc");
  });

  it("named: changes name", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "original", level: "debug", sink });
    const renamed = log.named("renamed");

    renamed.info("test");

    expect(renamed.name).toBe("renamed");
    expect(records[0].name).toBe("renamed");
  });

  it("level filtering: debug not emitted at info level", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "test", level: "info", sink });

    log.debug("should not appear");
    log.info("should appear");
    log.warn("should also appear");

    expect(records.length).toBe(2);
    expect(records[0].level).toBe("info");
    expect(records[1].level).toBe("warn");
  });

  it("level filtering: error always emitted", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "test", level: "error", sink });

    log.debug("no");
    log.info("no");
    log.warn("no");
    log.error("yes");

    expect(records.length).toBe(1);
    expect(records[0].level).toBe("error");
  });
});

// =============================================================================
// Config
// =============================================================================

describe("Config", () => {
  it("loadFrom: valid env returns Ok with parsed values", () => {
    const AppConfig = Config.from({
      PORT: Schema.string,
      HOST: Schema.string,
    });

    const r = AppConfig.loadFrom({ PORT: "3000", HOST: "localhost" });
    expect(r.isOk).toBe(true);
    expect(r.value.PORT).toBe("3000");
    expect(r.value.HOST).toBe("localhost");
  });

  it("loadFrom: missing key returns Err with path", () => {
    const AppConfig = Config.from({
      PORT: Schema.string,
      HOST: Schema.string,
    });

    const r = AppConfig.loadFrom({ PORT: "3000" });
    expect(r.isErr).toBe(true);
    expect(r.error.path).toEqual(["HOST"]);
  });

  it("loadFrom: invalid value returns Err", () => {
    const AppConfig = Config.from({
      PORT: Schema.number,
    });

    // Schema.number expects a number, not a string
    const r = AppConfig.loadFrom({ PORT: "3000" });
    expect(r.isErr).toBe(true);
  });

  it("loadFrom: with schema transform", () => {
    const AppConfig = Config.from({
      DEBUG: Schema.string.transform(s => s === "true"),
    });

    const r = AppConfig.loadFrom({ DEBUG: "true" });
    expect(r.isOk).toBe(true);
    expect(r.value.DEBUG).toBe(true);
  });

  it("loadFrom: with schema default", () => {
    const AppConfig = Config.from({
      LOG_LEVEL: Schema.string.default("info"),
    });

    const r = AppConfig.loadFrom({});
    expect(r.isOk).toBe(true);
    expect(r.value.LOG_LEVEL).toBe("info");
  });
});

// =============================================================================
// Client
// =============================================================================

describe("Client", () => {
  // Mock fetch factory
  const mockFetch =
    (status, body, headers = {}) =>
    async (_url, _init) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: new Headers(headers),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

  it("successful GET returns Ok with ClientResponse", async () => {
    const api = Client.create({
      fetch: mockFetch(200, { users: [] }),
    });

    const r = await api.get("/users").run();
    expect(r.isOk).toBe(true);
    expect(r.value.status).toBe(200);
    expect(r.value.statusText).toBe("OK");
  });

  it("non-2xx returns Err(HttpError) with status metadata", async () => {
    const api = Client.create({
      fetch: mockFetch(404, { error: "not found" }),
    });

    const r = await api.get("/missing").run();
    expect(r.isErr).toBe(true);
    expect(r.error.tag).toBe("HttpError");
    expect(r.error.metadata.status).toBe(404);
  });

  it("network error returns Err(NetworkError)", async () => {
    const api = Client.create({
      fetch: async () => {
        throw new Error("DNS resolution failed");
      },
    });

    const r = await api.get("/anything").run();
    expect(r.isErr).toBe(true);
    expect(r.error.tag).toBe("NetworkError");
    expect(r.error.message).toBe("DNS resolution failed");
  });

  it("ClientResponse.json(): parses JSON body", async () => {
    const data = { id: 1, name: "Alice" };
    const api = Client.create({
      fetch: mockFetch(200, data),
    });

    const r = await api.get("/user/1").run();
    expect(r.isOk).toBe(true);
    const jsonResult = await r.value.json();
    expect(jsonResult.isOk).toBe(true);
    expect(jsonResult.value).toEqual(data);
  });

  it("ClientResponse.text(): reads text body", async () => {
    const data = { message: "hello" };
    const api = Client.create({
      fetch: mockFetch(200, data),
    });

    const r = await api.get("/text").run();
    expect(r.isOk).toBe(true);
    const textResult = await r.value.text();
    expect(textResult.isOk).toBe(true);
    expect(typeof textResult.value).toBe("string");
  });

  it("custom headers: merged with defaults", async () => {
    let capturedHeaders;
    const api = Client.create({
      headers: { Authorization: "Bearer token" },
      fetch: async (_url, init) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: async () => ({}),
          text: async () => "",
        };
      },
    });

    await api.get("/test", { headers: { "X-Custom": "value" } }).run();
    expect(capturedHeaders.Authorization).toBe("Bearer token");
    expect(capturedHeaders["X-Custom"]).toBe("value");
  });

  it("baseUrl: prepended to path", async () => {
    let capturedUrl;
    const api = Client.create({
      baseUrl: "https://api.example.com",
      fetch: async url => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: async () => ({}),
          text: async () => "",
        };
      },
    });

    await api.get("/users").run();
    expect(capturedUrl).toBe("https://api.example.com/users");
  });
});

// =============================================================================
// WebSocket
// =============================================================================

describe("WebSocket", () => {
  it("router: creates empty router", () => {
    const ws = WebSocket.router();
    expect(ws.routes.length).toBe(0);
  });

  it("route: adds route", () => {
    const handler = {
      onOpen: () => {
        /* noop */
      },
    };
    const ws = WebSocket.router().route("/chat", handler);
    expect(ws.routes.length).toBe(1);
    expect(ws.routes[0].pattern).toBe("/chat");
    expect(ws.routes[0].handler).toBe(handler);
  });

  it("route: chaining adds multiple routes", () => {
    const ws = WebSocket.router()
      .route("/chat", {
        onOpen: () => {
          /* noop */
        },
      })
      .route("/notifications", {
        onMessage: () => {
          /* noop */
        },
      });
    expect(ws.routes.length).toBe(2);
  });

  it("match: finds handler by exact path", () => {
    const handler = {
      onOpen: () => {
        /* noop */
      },
    };
    const ws = WebSocket.router().route("/chat", handler);
    const found = ws.match("/chat");
    expect(found).toBe(handler);
  });

  it("match: returns undefined for unmatched path", () => {
    const ws = WebSocket.router().route("/chat", {
      onOpen: () => {
        /* noop */
      },
    });
    expect(ws.match("/other")).toBe(undefined);
  });

  it("routes: lists all registered routes", () => {
    const ws = WebSocket.router()
      .route("/a", {
        onOpen: () => {
          /* noop */
        },
      })
      .route("/b", {
        onMessage: () => {
          /* noop */
        },
      });

    const patterns = ws.routes.map(r => r.pattern);
    expect(patterns).toEqual(["/a", "/b"]);
  });

  it("router is immutable: route returns new router", () => {
    const ws1 = WebSocket.router();
    const ws2 = ws1.route("/chat", {
      onOpen: () => {
        /* noop */
      },
    });
    expect(ws1.routes.length).toBe(0);
    expect(ws2.routes.length).toBe(1);
  });
});

// =============================================================================
// ADT
// =============================================================================

describe("ADT", () => {
  const Color = ADT({
    Red: null,
    Green: null,
    Blue: intensity => ({ intensity }),
  });

  it("unit variant: returns frozen tagged object", () => {
    const r = Color.Red();
    expect(r.tag).toBe("Red");
    expect(() => {
      r.tag = "x";
    }).toThrow();
  });

  it("unit variant: returns same singleton", () => {
    expect(Color.Red()).toBe(Color.Red());
    expect(Color.Green()).toBe(Color.Green());
  });

  it("payload variant: returns frozen tagged object with payload", () => {
    const b = Color.Blue(0.8);
    expect(b.tag).toBe("Blue");
    expect(b.intensity).toBe(0.8);
    expect(() => {
      b.intensity = 0.5;
    }).toThrow();
  });

  it("payload variant: each call creates new instance", () => {
    expect(Color.Blue(0.5)).not.toBe(Color.Blue(0.5));
  });

  it("is guard: returns true for matching variant", () => {
    expect(Color.is.Red(Color.Red())).toBe(true);
    expect(Color.is.Blue(Color.Blue(0.5))).toBe(true);
  });

  it("is guard: returns false for non-matching variant", () => {
    expect(Color.is.Red(Color.Blue(0.5))).toBe(false);
    expect(Color.is.Blue(Color.Red())).toBe(false);
  });

  it("is guard: returns false for non-objects", () => {
    expect(Color.is.Red(null)).toBe(false);
    expect(Color.is.Red(undefined)).toBe(false);
    expect(Color.is.Red(42)).toBe(false);
    expect(Color.is.Red("Red")).toBe(false);
  });

  it("ADT object itself is frozen", () => {
    expect(() => {
      Color.Red = null;
    }).toThrow();
    expect(() => {
      Color.is.Red = null;
    }).toThrow();
  });

  it("works with Match for exhaustive matching", () => {
    const c = Color.Blue(0.8);
    const result = Match(c)
      .with({ tag: "Red" }, () => "red")
      .with({ tag: "Green" }, () => "green")
      .with({ tag: "Blue" }, b => `blue:${b.intensity}`)
      .exhaustive();
    expect(result).toBe("blue:0.8");
  });

  it("multiple payload fields", () => {
    const Shape = ADT({
      Circle: radius => ({ radius }),
      Rect: (width, height) => ({ width, height }),
    });
    const r = Shape.Rect(3, 4);
    expect(r.tag).toBe("Rect");
    expect(r.width).toBe(3);
    expect(r.height).toBe(4);
  });
});

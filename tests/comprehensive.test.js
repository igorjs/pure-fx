/**
 * comprehensive.test.js - Exhaustive tests for Result, Option, Task, Schema,
 * Record, List, and namespace methods. Fills coverage gaps.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Ok,
  Err,
  Result,
  Some,
  None,
  Option,
  Task,
  Schema,
  Record,
  List,
  pipe,
  flow,
  match,
  tryCatch,
  ErrType,
  Duration,
  Cron,
  Valid,
  Invalid,
  Validation,
  HashMap,
} = await import("../dist/index.js");

// =============================================================================
// Result - Ok variant
// =============================================================================

describe("Result (Ok)", () => {
  it("map transforms value", () => {
    expect(
      Ok(2)
        .map(n => n * 3)
        .unwrap(),
    ).toBe(6);
  });

  it("mapErr is a no-op", () => {
    const r = Ok(1).mapErr(() => "nope");
    expect(r.unwrap()).toBe(1);
  });

  it("flatMap chains to Ok", () => {
    expect(
      Ok(5)
        .flatMap(n => Ok(n + 1))
        .unwrap(),
    ).toBe(6);
  });

  it("flatMap chains to Err", () => {
    expect(Ok(5).flatMap(() => Err("fail")).isErr).toBe(true);
  });

  it("tap runs side-effect and returns same", () => {
    let seen = 0;
    const r = Ok(42).tap(v => {
      seen = v;
    });
    expect(seen).toBe(42);
    expect(r.unwrap()).toBe(42);
  });

  it("tapErr is a no-op", () => {
    let called = false;
    Ok(1).tapErr(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("unwrap returns value", () => {
    expect(Ok("hi").unwrap()).toBe("hi");
  });

  it("unwrapOr returns value (ignores fallback)", () => {
    expect(Ok(1).unwrapOr(99)).toBe(1);
  });

  it("unwrapOrElse returns value (ignores fn)", () => {
    expect(Ok(1).unwrapOrElse(() => 99)).toBe(1);
  });

  it("unwrapErr throws on Ok", () => {
    expect(() => Ok(1).unwrapErr()).toThrow();
  });

  it("match calls Ok handler", () => {
    expect(Ok(10).match({ Ok: v => v + 1, Err: () => -1 })).toBe(11);
  });

  it("toOption returns Some", () => {
    const opt = Ok(42).toOption();
    expect(opt.isSome).toBe(true);
    expect(opt.unwrap()).toBe(42);
  });

  it("zip two Ok values", () => {
    const r = Ok("a").zip(Ok(1));
    expect(r.unwrap()).toEqual(["a", 1]);
  });

  it("zip Ok with Err returns Err", () => {
    expect(Ok(1).zip(Err("e")).isErr).toBe(true);
  });

  it("ap applies wrapped function", () => {
    const r = Ok(5).ap(Ok(n => n * 2));
    expect(r.unwrap()).toBe(10);
  });

  it("ap with Err function returns Err", () => {
    expect(Ok(5).ap(Err("no fn")).isErr).toBe(true);
  });

  it("toJSON serializes correctly", () => {
    expect(Ok(42).toJSON()).toEqual({ tag: "Ok", value: 42 });
  });

  it("toString formats correctly", () => {
    expect(Ok(42).toString()).toBe("Ok(42)");
  });
});

// =============================================================================
// Result - Err variant
// =============================================================================

describe("Result (Err)", () => {
  it("map is a no-op", () => {
    expect(Err("e").map(() => 99).isErr).toBe(true);
  });

  it("mapErr transforms error", () => {
    expect(
      Err("e")
        .mapErr(e => e.toUpperCase())
        .unwrapErr(),
    ).toBe("E");
  });

  it("flatMap is a no-op", () => {
    expect(
      Err("e")
        .flatMap(() => Ok(99))
        .unwrapErr(),
    ).toBe("e");
  });

  it("tap is a no-op", () => {
    let called = false;
    Err("e").tap(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("tapErr runs side-effect", () => {
    let seen = "";
    Err("oops").tapErr(e => {
      seen = e;
    });
    expect(seen).toBe("oops");
  });

  it("unwrap throws on Err", () => {
    expect(() => Err("e").unwrap()).toThrow();
  });

  it("unwrapOr returns fallback", () => {
    expect(Err("e").unwrapOr(99)).toBe(99);
  });

  it("unwrapOrElse calls recovery fn", () => {
    expect(Err("err").unwrapOrElse(e => e.length)).toBe(3);
  });

  it("unwrapErr returns error", () => {
    expect(Err("oops").unwrapErr()).toBe("oops");
  });

  it("match calls Err handler", () => {
    expect(Err("e").match({ Ok: () => -1, Err: e => e.length })).toBe(1);
  });

  it("toOption returns None", () => {
    expect(Err("e").toOption().isNone).toBe(true);
  });

  it("zip Err with Ok returns Err", () => {
    expect(Err("e").zip(Ok(1)).isErr).toBe(true);
  });

  it("zip Err with Err returns first Err", () => {
    expect(Err("first").zip(Err("second")).unwrapErr()).toBe("first");
  });

  it("ap Err propagates", () => {
    expect(Err("e").ap(Ok(n => n)).isErr).toBe(true);
  });

  it("toJSON serializes correctly", () => {
    expect(Err("oops").toJSON()).toEqual({ tag: "Err", error: "oops" });
  });

  it("toString formats correctly", () => {
    expect(Err("oops").toString()).toBe("Err(oops)");
  });
});

// =============================================================================
// Result namespace
// =============================================================================

describe("Result namespace", () => {
  it("fromNullable returns Ok for non-null", () => {
    expect(Result.fromNullable(42, () => "null").unwrap()).toBe(42);
  });

  it("fromNullable returns Err for null", () => {
    expect(Result.fromNullable(null, () => "was null").isErr).toBe(true);
  });

  it("fromNullable returns Err for undefined", () => {
    expect(Result.fromNullable(undefined, () => "undef").isErr).toBe(true);
  });

  it("fromNullable treats 0 as Ok", () => {
    expect(Result.fromNullable(0, () => "null").unwrap()).toBe(0);
  });

  it("fromNullable treats empty string as Ok", () => {
    expect(Result.fromNullable("", () => "null").unwrap()).toBe("");
  });

  it("collect succeeds with all Ok", () => {
    expect(Result.collect([Ok(1), Ok(2), Ok(3)]).unwrap()).toEqual([1, 2, 3]);
  });

  it("collect fails on first Err", () => {
    const r = Result.collect([Ok(1), Err("a"), Ok(3), Err("b")]);
    expect(r.unwrapErr()).toBe("a");
  });

  it("collect with empty array returns Ok([])", () => {
    expect(Result.collect([]).unwrap()).toEqual([]);
  });

  it("sequence is alias for collect", () => {
    expect(Result.sequence([Ok(1), Ok(2)]).unwrap()).toEqual([1, 2]);
  });

  it("traverse maps and collects", () => {
    const r = Result.traverse([1, 2, 3], n => (n > 0 ? Ok(n * 10) : Err("neg")));
    expect(r.unwrap()).toEqual([10, 20, 30]);
  });

  it("traverse short-circuits on first Err", () => {
    const r = Result.traverse([1, -1, 2], n => (n > 0 ? Ok(n) : Err(`${n} neg`)));
    expect(r.unwrapErr()).toBe("-1 neg");
  });

  it("partition separates Ok and Err", () => {
    const { ok, err } = Result.partition([Ok(1), Err("a"), Ok(2), Err("b")]);
    expect(ok).toEqual([1, 2]);
    expect(err).toEqual(["a", "b"]);
  });

  it("partition with all Ok", () => {
    const { ok, err } = Result.partition([Ok(1), Ok(2)]);
    expect(ok).toEqual([1, 2]);
    expect(err).toEqual([]);
  });

  it("partition with all Err", () => {
    const { ok, err } = Result.partition([Err("a"), Err("b")]);
    expect(ok).toEqual([]);
    expect(err).toEqual(["a", "b"]);
  });

  it("is returns true for Ok and Err", () => {
    expect(Result.is(Ok(1))).toBe(true);
    expect(Result.is(Err("e"))).toBe(true);
  });

  it("is returns false for non-Result", () => {
    expect(Result.is(42)).toBe(false);
    expect(Result.is(null)).toBe(false);
    expect(Result.is(Some(1))).toBe(false);
  });
});

// =============================================================================
// Option - Some variant
// =============================================================================

describe("Option (Some)", () => {
  it("map transforms value", () => {
    expect(
      Some(3)
        .map(n => n * 2)
        .unwrap(),
    ).toBe(6);
  });

  it("flatMap chains to Some", () => {
    expect(
      Some(5)
        .flatMap(n => Some(n + 1))
        .unwrap(),
    ).toBe(6);
  });

  it("flatMap chains to None", () => {
    expect(Some(5).flatMap(() => None).isNone).toBe(true);
  });

  it("filter keeps matching value", () => {
    expect(
      Some(10)
        .filter(n => n > 5)
        .unwrap(),
    ).toBe(10);
  });

  it("filter drops non-matching value", () => {
    expect(Some(3).filter(n => n > 5).isNone).toBe(true);
  });

  it("tap runs side-effect", () => {
    let seen = 0;
    Some(42).tap(v => {
      seen = v;
    });
    expect(seen).toBe(42);
  });

  it("unwrap returns value", () => {
    expect(Some("x").unwrap()).toBe("x");
  });

  it("unwrapOr returns value", () => {
    expect(Some(1).unwrapOr(99)).toBe(1);
  });

  it("unwrapOrElse returns value", () => {
    expect(Some(1).unwrapOrElse(() => 99)).toBe(1);
  });

  it("toResult returns Ok", () => {
    expect(Some(42).toResult("err").unwrap()).toBe(42);
  });

  it("zip two Some values", () => {
    expect(Some("a").zip(Some(1)).unwrap()).toEqual(["a", 1]);
  });

  it("zip Some with None returns None", () => {
    expect(Some(1).zip(None).isNone).toBe(true);
  });

  it("ap applies wrapped function", () => {
    expect(
      Some(5)
        .ap(Some(n => n * 2))
        .unwrap(),
    ).toBe(10);
  });

  it("or returns self", () => {
    expect(Some(1).or(Some(99)).unwrap()).toBe(1);
  });

  it("toJSON serializes correctly", () => {
    expect(Some(42).toJSON()).toEqual({ tag: "Some", value: 42 });
  });

  it("toString formats correctly", () => {
    expect(Some(42).toString()).toBe("Some(42)");
  });
});

// =============================================================================
// Option - None variant
// =============================================================================

describe("Option (None)", () => {
  it("map is a no-op", () => {
    expect(None.map(() => 99).isNone).toBe(true);
  });

  it("flatMap is a no-op", () => {
    expect(None.flatMap(() => Some(99)).isNone).toBe(true);
  });

  it("filter is a no-op", () => {
    expect(None.filter(() => true).isNone).toBe(true);
  });

  it("tap is a no-op", () => {
    let called = false;
    None.tap(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("unwrap throws", () => {
    expect(() => None.unwrap()).toThrow();
  });

  it("unwrapOr returns fallback", () => {
    expect(None.unwrapOr(99)).toBe(99);
  });

  it("unwrapOrElse calls fn", () => {
    expect(None.unwrapOrElse(() => 99)).toBe(99);
  });

  it("toResult returns Err", () => {
    expect(None.toResult("missing").isErr).toBe(true);
    expect(None.toResult("missing").unwrapErr()).toBe("missing");
  });

  it("zip returns None", () => {
    expect(None.zip(Some(1)).isNone).toBe(true);
  });

  it("ap returns None", () => {
    expect(None.ap(Some(n => n)).isNone).toBe(true);
  });

  it("or returns the other", () => {
    expect(None.or(Some(99)).unwrap()).toBe(99);
  });

  it("or with None returns None", () => {
    expect(None.or(None).isNone).toBe(true);
  });

  it("toJSON serializes correctly", () => {
    expect(None.toJSON()).toEqual({ tag: "None" });
  });

  it("toString formats correctly", () => {
    expect(None.toString()).toBe("None");
  });
});

// =============================================================================
// Option namespace
// =============================================================================

describe("Option namespace", () => {
  it("fromNullable returns Some for non-null", () => {
    expect(Option.fromNullable(42).unwrap()).toBe(42);
  });

  it("fromNullable returns None for null", () => {
    expect(Option.fromNullable(null).isNone).toBe(true);
  });

  it("fromNullable returns None for undefined", () => {
    expect(Option.fromNullable(undefined).isNone).toBe(true);
  });

  it("fromNullable treats 0 as Some", () => {
    expect(Option.fromNullable(0).unwrap()).toBe(0);
  });

  it("fromNullable treats false as Some", () => {
    expect(Option.fromNullable(false).unwrap()).toBe(false);
  });

  it("collect succeeds with all Some", () => {
    expect(Option.collect([Some(1), Some(2)]).unwrap()).toEqual([1, 2]);
  });

  it("collect fails on first None", () => {
    expect(Option.collect([Some(1), None, Some(3)]).isNone).toBe(true);
  });

  it("sequence is alias for collect", () => {
    expect(Option.sequence([Some("a"), Some("b")]).unwrap()).toEqual(["a", "b"]);
  });

  it("traverse maps and collects", () => {
    const r = Option.traverse([1, 2, 3], n => Some(n * 10));
    expect(r.unwrap()).toEqual([10, 20, 30]);
  });

  it("traverse short-circuits on None", () => {
    const r = Option.traverse([1, 0, 3], n => (n > 0 ? Some(n) : None));
    expect(r.isNone).toBe(true);
  });

  it("partition separates Some and None", () => {
    const { some, none } = Option.partition([Some(1), None, Some(2), None]);
    expect(some).toEqual([1, 2]);
    expect(none).toBe(2);
  });

  it("is returns true for Some and None", () => {
    expect(Option.is(Some(1))).toBe(true);
    expect(Option.is(None)).toBe(true);
  });

  it("is returns false for non-Option", () => {
    expect(Option.is(42)).toBe(false);
    expect(Option.is(Ok(1))).toBe(false);
  });
});

// =============================================================================
// Task
// =============================================================================

describe("Task", () => {
  it("Task.of creates successful Task", async () => {
    const r = await Task.of(42).run();
    expect(r.unwrap()).toBe(42);
  });

  it("Task.fromResult wraps Ok", async () => {
    const r = await Task.fromResult(Ok(1)).run();
    expect(r.unwrap()).toBe(1);
  });

  it("Task.fromResult wraps Err", async () => {
    const r = await Task.fromResult(Err("e")).run();
    expect(r.unwrapErr()).toBe("e");
  });

  it("map transforms success", async () => {
    const r = await Task.of(5)
      .map(n => n * 2)
      .run();
    expect(r.unwrap()).toBe(10);
  });

  it("mapErr transforms error", async () => {
    const t = Task(() => Promise.resolve(Err("low")));
    const r = await t.mapErr(e => e.toUpperCase()).run();
    expect(r.unwrapErr()).toBe("LOW");
  });

  it("flatMap chains tasks", async () => {
    const r = await Task.of(5)
      .flatMap(n => Task.of(n + 1))
      .run();
    expect(r.unwrap()).toBe(6);
  });

  it("flatMap short-circuits on error", async () => {
    let called = false;
    const r = await Task(() => Promise.resolve(Err("e")))
      .flatMap(() => {
        called = true;
        return Task.of(99);
      })
      .run();
    expect(called).toBe(false);
    expect(r.isErr).toBe(true);
  });

  it("tap runs side-effect on success", async () => {
    let seen = 0;
    await Task.of(42)
      .tap(v => {
        seen = v;
      })
      .run();
    expect(seen).toBe(42);
  });

  it("tapErr runs side-effect on error", async () => {
    let seen = "";
    await Task(() => Promise.resolve(Err("oops")))
      .tapErr(e => {
        seen = e;
      })
      .run();
    expect(seen).toBe("oops");
  });

  it("zip combines two successful Tasks", async () => {
    const r = await Task.of("a").zip(Task.of(1)).run();
    expect(r.unwrap()).toEqual(["a", 1]);
  });

  it("zip propagates first error", async () => {
    const r = await Task(() => Promise.resolve(Err("e")))
      .zip(Task.of(1))
      .run();
    expect(r.isErr).toBe(true);
  });

  it("runGetOr returns value on success", async () => {
    expect(await Task.of(42).runGetOr(0)).toBe(42);
  });

  it("runGetOr returns fallback on error", async () => {
    expect(await Task(() => Promise.resolve(Err("e"))).runGetOr(0)).toBe(0);
  });

  it("Task.all runs all tasks", async () => {
    const r = await Task.all([Task.of(1), Task.of(2), Task.of(3)]).run();
    expect(r.unwrap()).toEqual([1, 2, 3]);
  });

  it("Task.all short-circuits on first error", async () => {
    const r = await Task.all([Task.of(1), Task(() => Promise.resolve(Err("e")))]).run();
    expect(r.isErr).toBe(true);
  });

  it("Task.race returns first to complete", async () => {
    const r = await Task.race([
      Task.of(42),
      Task(() => new Promise(resolve => setTimeout(() => resolve(Ok(99)), 100))),
    ]).run();
    expect(r.unwrap()).toBe(42);
  });

  it("Task.allSettled collects all results", async () => {
    const results = await Task.allSettled([
      Task.of(1),
      Task(() => Promise.resolve(Err("e"))),
      Task.of(3),
    ]).run();
    const arr = results.unwrap();
    expect(arr[0].isOk).toBe(true);
    expect(arr[1].isErr).toBe(true);
    expect(arr[2].isOk).toBe(true);
  });

  it("Task.traverse maps and sequences", async () => {
    const r = await Task.traverse([1, 2, 3], n => Task.of(n * 10)).run();
    expect(r.unwrap()).toEqual([10, 20, 30]);
  });

  it("Task.sequence sequences tasks", async () => {
    const r = await Task.sequence([Task.of(1), Task.of(2)]).run();
    expect(r.unwrap()).toEqual([1, 2]);
  });

  it("Task.ap applies function task to value task", async () => {
    const r = await Task.ap(
      Task.of(n => n * 3),
      Task.of(10),
    ).run();
    expect(r.unwrap()).toBe(30);
  });

  it("Task.is returns true for Tasks", async () => {
    expect(Task.is(Task.of(1))).toBe(true);
  });

  it("Task.is returns false for non-Tasks", async () => {
    expect(Task.is(42)).toBe(false);
    expect(Task.is(Promise.resolve(1))).toBe(false);
  });

  it("memoize caches result", async () => {
    let calls = 0;
    const t = Task(() => {
      calls++;
      return Promise.resolve(Ok(42));
    }).memoize();
    await t.run();
    await t.run();
    expect(calls).toBe(1);
  });
});

// =============================================================================
// Schema edge cases
// =============================================================================

describe("Schema edge cases", () => {
  it("nested object errors include path", () => {
    const s = Schema.object({
      user: Schema.object({
        name: Schema.string,
      }),
    });
    const r = s.parse({ user: { name: 123 } });
    expect(r.isErr).toBe(true);
    const err = r.unwrapErr();
    expect(err.path).toEqual(["user", "name"]);
  });

  it("array errors include index in path", () => {
    const s = Schema.array(Schema.number);
    const r = s.parse([1, "two", 3]);
    expect(r.isErr).toBe(true);
    expect(r.unwrapErr().path).toEqual(["1"]);
  });

  it("optional accepts undefined", () => {
    const s = Schema.string.optional();
    expect(s.parse(undefined).unwrap()).toBe(undefined);
    expect(s.parse("hi").unwrap()).toBe("hi");
  });

  it("default provides fallback for undefined/null", () => {
    const s = Schema.number.default(0);
    expect(s.parse(undefined).unwrap()).toBe(0);
    expect(s.parse(null).unwrap()).toBe(0);
    expect(s.parse(5).unwrap()).toBe(5);
  });

  it("transform converts parsed value", () => {
    const s = Schema.string.transform(s => s.length);
    expect(s.parse("hello").unwrap()).toBe(5);
  });

  it("refine adds custom validation", () => {
    const s = Schema.number.refine(n => n > 0, "positive");
    expect(s.parse(5).isOk).toBe(true);
    expect(s.parse(-1).isErr).toBe(true);
  });

  it("is acts as type guard", () => {
    expect(Schema.string.is("hello")).toBe(true);
    expect(Schema.string.is(123)).toBe(false);
  });

  it("literal validates exact value", () => {
    const s = Schema.literal("active");
    expect(s.parse("active").unwrap()).toBe("active");
    expect(s.parse("inactive").isErr).toBe(true);
  });

  it("enum validates set of values", () => {
    const s = Schema.enum(["a", "b", "c"]);
    expect(s.parse("b").unwrap()).toBe("b");
    expect(s.parse("d").isErr).toBe(true);
  });

  it("union tries schemas in order", () => {
    const s = Schema.union(Schema.string, Schema.number);
    expect(s.parse("hi").unwrap()).toBe("hi");
    expect(s.parse(42).unwrap()).toBe(42);
    expect(s.parse(true).isErr).toBe(true);
  });

  it("intersection validates both schemas", () => {
    const a = Schema.object({ name: Schema.string });
    const b = Schema.object({ age: Schema.number });
    const s = Schema.intersection(a, b);
    const r = s.parse({ name: "Alice", age: 30 });
    expect(r.isOk).toBe(true);
    expect(r.unwrap()).toEqual({ name: "Alice", age: 30 });
  });

  it("lazy supports recursive schemas", () => {
    const TreeSchema = Schema.object({
      value: Schema.number,
      children: Schema.array(Schema.lazy(() => TreeSchema)),
    });
    const r = TreeSchema.parse({
      value: 1,
      children: [{ value: 2, children: [] }],
    });
    expect(r.isOk).toBe(true);
  });

  it("discriminatedUnion validates by tag", () => {
    const s = Schema.discriminatedUnion("type", {
      circle: Schema.object({ type: Schema.literal("circle"), radius: Schema.number }),
      rect: Schema.object({
        type: Schema.literal("rect"),
        width: Schema.number,
        height: Schema.number,
      }),
    });
    expect(s.parse({ type: "circle", radius: 5 }).isOk).toBe(true);
    expect(s.parse({ type: "rect", width: 1, height: 2 }).isOk).toBe(true);
    expect(s.parse({ type: "triangle" }).isErr).toBe(true);
  });

  it("tuple validates positional types", () => {
    const s = Schema.tuple(Schema.string, Schema.number, Schema.boolean);
    expect(s.parse(["hi", 42, true]).unwrap()).toEqual(["hi", 42, true]);
    expect(s.parse(["hi", "42"]).isErr).toBe(true);
  });

  it("record validates string-keyed objects", () => {
    const s = Schema.record(Schema.number);
    const r = s.parse({ a: 1, b: 2 });
    expect(r.unwrap()).toEqual({ a: 1, b: 2 });
    expect(s.parse({ a: "nope" }).isErr).toBe(true);
  });

  it("numeric refinements work", () => {
    expect(Schema.int.parse(5).isOk).toBe(true);
    expect(Schema.int.parse(5.5).isErr).toBe(true);
    expect(Schema.positive.parse(1).isOk).toBe(true);
    expect(Schema.positive.parse(0).isErr).toBe(true);
    expect(Schema.nonNegative.parse(0).isOk).toBe(true);
    expect(Schema.nonNegative.parse(-1).isErr).toBe(true);
    expect(Schema.min(5).parse(5).isOk).toBe(true);
    expect(Schema.min(5).parse(4).isErr).toBe(true);
    expect(Schema.max(10).parse(10).isOk).toBe(true);
    expect(Schema.max(10).parse(11).isErr).toBe(true);
    expect(Schema.range(1, 10).parse(5).isOk).toBe(true);
    expect(Schema.range(1, 10).parse(0).isErr).toBe(true);
  });

  it("string refinements work", () => {
    expect(Schema.nonEmpty.parse("hi").isOk).toBe(true);
    expect(Schema.nonEmpty.parse("  ").isErr).toBe(true);
    expect(Schema.minLength(3).parse("abc").isOk).toBe(true);
    expect(Schema.minLength(3).parse("ab").isErr).toBe(true);
    expect(Schema.maxLength(3).parse("abc").isOk).toBe(true);
    expect(Schema.maxLength(3).parse("abcd").isErr).toBe(true);
    expect(Schema.email.parse("a@b.c").isOk).toBe(true);
    expect(Schema.email.parse("not-email").isErr).toBe(true);
  });
});

// =============================================================================
// Record methods
// =============================================================================

describe("Record methods", () => {
  it("set creates new record with updated field", () => {
    const r = Record({ name: "Alice", age: 30 });
    const r2 = r.set(o => o.age, 31);
    expect(r.age).toBe(30);
    expect(r2.age).toBe(31);
  });

  it("update transforms a field", () => {
    const r = Record({ count: 0 });
    const r2 = r.update(
      o => o.count,
      c => c + 1,
    );
    expect(r2.count).toBe(1);
  });

  it("merge shallow-merges fields", () => {
    const r = Record({ a: 1, b: 2 });
    const r2 = r.merge({ b: 99 });
    expect(r2.a).toBe(1);
    expect(r2.b).toBe(99);
  });

  it("at returns Option", () => {
    const r = Record({ name: "Bob" });
    expect(r.at(o => o.name).unwrap()).toBe("Bob");
  });

  it("equals compares structurally", () => {
    const a = Record({ x: 1 });
    const b = Record({ x: 1 });
    const c = Record({ x: 2 });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("toMutable returns mutable copy", () => {
    const r = Record({ a: 1 });
    const m = r.toMutable();
    m.a = 99;
    expect(r.a).toBe(1);
    expect(m.a).toBe(99);
  });

  it("produce allows draft mutations", () => {
    const r = Record({ name: "Alice", age: 30 });
    const r2 = r.produce(d => {
      d.name = "Bob";
      d.age = 31;
    });
    expect(r.name).toBe("Alice");
    expect(r2.name).toBe("Bob");
    expect(r2.age).toBe(31);
  });

  it("$raw returns frozen data", () => {
    const r = Record({ x: 1 });
    expect(r.$raw.x).toBe(1);
    expect(Object.isFrozen(r.$raw)).toBe(true);
  });

  it("toJSON returns plain object", () => {
    const r = Record({ a: 1, b: "two" });
    const json = r.toJSON();
    expect(json).toEqual({ a: 1, b: "two" });
  });
});

// =============================================================================
// List methods
// =============================================================================

describe("List methods", () => {
  it("append adds to end", () => {
    const l = List([1, 2, 3]).append(4);
    expect(l.length).toBe(4);
    expect(l[3]).toBe(4);
  });

  it("prepend adds to start", () => {
    const l = List([2, 3]).prepend(1);
    expect(l[0]).toBe(1);
    expect(l.length).toBe(3);
  });

  it("setAt replaces element", () => {
    const l = List(["a", "b", "c"]).setAt(1, "B");
    expect(l[1]).toBe("B");
  });

  it("updateAt transforms element", () => {
    const l = List([1, 2, 3]).updateAt(1, n => n * 10);
    expect(l[1]).toBe(20);
  });

  it("removeAt removes element", () => {
    const l = List([1, 2, 3]).removeAt(1);
    expect([...l]).toEqual([1, 3]);
  });

  it("map transforms elements", () => {
    const l = List([1, 2, 3]).map(n => n * 2);
    expect([...l]).toEqual([2, 4, 6]);
  });

  it("filter keeps matching elements", () => {
    const l = List([1, 2, 3, 4]).filter(n => n % 2 === 0);
    expect([...l]).toEqual([2, 4]);
  });

  it("reduce folds elements", () => {
    expect(List([1, 2, 3]).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("find returns Option", () => {
    expect(
      List([1, 2, 3])
        .find(n => n === 2)
        .unwrap(),
    ).toBe(2);
    expect(List([1, 2, 3]).find(n => n === 99).isNone).toBe(true);
  });

  it("at supports negative indices", () => {
    const l = List([10, 20, 30]);
    expect(l.at(-1).unwrap()).toBe(30);
    expect(l.at(-2).unwrap()).toBe(20);
  });

  it("first and last return Option", () => {
    const l = List([1, 2, 3]);
    expect(l.first().unwrap()).toBe(1);
    expect(l.last().unwrap()).toBe(3);
    expect(List([]).first().isNone).toBe(true);
    expect(List([]).last().isNone).toBe(true);
  });

  it("concat joins lists", () => {
    const l = List([1, 2]).concat(List([3, 4]));
    expect([...l]).toEqual([1, 2, 3, 4]);
  });

  it("slice returns sub-range", () => {
    const l = List([1, 2, 3, 4, 5]).slice(1, 4);
    expect([...l]).toEqual([2, 3, 4]);
  });

  it("flatMap maps and flattens", () => {
    const l = List([1, 2, 3]).flatMap(n => [n, n * 10]);
    expect([...l]).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("equals compares structurally", () => {
    expect(List([1, 2]).equals(List([1, 2]))).toBe(true);
    expect(List([1, 2]).equals(List([1, 3]))).toBe(false);
  });

  it("toMutable returns plain array", () => {
    const arr = List([1, 2]).toMutable();
    arr.push(3);
    expect(arr.length).toBe(3);
  });

  it("supports spread and iteration", () => {
    const l = List([1, 2, 3]);
    expect([...l]).toEqual([1, 2, 3]);
  });

  it("supports destructuring", () => {
    const [a, b] = List([10, 20]);
    expect(a).toBe(10);
    expect(b).toBe(20);
  });
});

// =============================================================================
// pipe / flow / match / tryCatch standalone
// =============================================================================

describe("pipe and flow", () => {
  it("pipe threads value through functions", () => {
    const r = pipe(
      5,
      n => n * 2,
      n => n + 1,
    );
    expect(r).toBe(11);
  });

  it("flow composes functions", () => {
    const fn = flow(
      n => n * 2,
      n => n + 1,
    );
    expect(fn(5)).toBe(11);
  });

  it("standalone match works with Result", () => {
    expect(match(Ok(10), { Ok: v => v, Err: () => -1 })).toBe(10);
  });

  it("standalone match works with Option", () => {
    expect(match(Some("hi"), { Some: s => s.length, None: () => 0 })).toBe(2);
  });

  it("standalone tryCatch catches", () => {
    const r = tryCatch(
      () => JSON.parse("invalid"),
      e => String(e),
    );
    expect(r.isErr).toBe(true);
  });

  it("standalone tryCatch succeeds", () => {
    const r = tryCatch(() => JSON.parse('{"a":1}'));
    expect(r.unwrap()).toEqual({ a: 1 });
  });
});

// =============================================================================
// Duration and Cron
// =============================================================================

describe("Duration", () => {
  it("creates from milliseconds", () => {
    expect(Duration.milliseconds(500)).toBe(500);
  });

  it("creates from seconds", () => {
    expect(Duration.seconds(2)).toBe(2000);
  });

  it("creates from minutes", () => {
    expect(Duration.minutes(1)).toBe(60000);
  });

  it("creates from hours", () => {
    expect(Duration.hours(1)).toBe(3600000);
  });

  it("creates from days", () => {
    expect(Duration.days(1)).toBe(86400000);
  });

  it("format returns human-readable string", () => {
    const formatted = Duration.format(Duration.hours(2) + Duration.minutes(30));
    expect(formatted.includes("2h")).toBe(true);
    expect(formatted.includes("30m")).toBe(true);
  });
});

describe("Cron", () => {
  it("validates standard cron expressions", () => {
    expect(Cron.parse("* * * * *").isOk).toBe(true);
    expect(Cron.parse("0 9 * * 1-5").isOk).toBe(true);
  });

  it("rejects invalid expressions", () => {
    expect(Cron.parse("invalid").isErr).toBe(true);
    expect(Cron.parse("* * *").isErr).toBe(true);
  });
});

// =============================================================================
// ErrType
// =============================================================================

describe("ErrType", () => {
  it("creates tagged error with tag and message", () => {
    const MyError = ErrType("MyError");
    const e = MyError("something went wrong");
    expect(e.tag).toBe("MyError");
    expect(e.message).toBe("something went wrong");
  });

  it("has name alias for tag", () => {
    const AppError = ErrType("AppError");
    const e = AppError("oops");
    expect(e.name).toBe("AppError");
  });

  it("has auto-derived code", () => {
    const AppError = ErrType("AppError");
    const e = AppError("oops");
    expect(typeof e.code).toBe("string");
    expect(e.code.length > 0).toBe(true);
  });

  it("toString includes tag and message", () => {
    const AppError = ErrType("AppError");
    const e = AppError("oops");
    expect(e.toString().includes("AppError")).toBe(true);
    expect(e.toString().includes("oops")).toBe(true);
  });

  it("different ErrTypes have different tags", () => {
    const A = ErrType("A");
    const B = ErrType("B");
    expect(A("x").tag).not.toBe(B("x").tag);
  });

  it("ErrType.is detects ErrType instances", () => {
    const MyErr = ErrType("MyErr");
    expect(ErrType.is(MyErr("x"))).toBe(true);
    expect(ErrType.is({ tag: "fake" })).toBe(false);
    expect(ErrType.is(42)).toBe(false);
  });
});

/**
 * comprehensive.test.js - Exhaustive tests for Result, Option, Task, Schema,
 * Record, List, and namespace methods. Fills coverage gaps.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
    assert.equal(
      Ok(2)
        .map(n => n * 3)
        .unwrap(),
      6,
    );
  });

  it("mapErr is a no-op", () => {
    const r = Ok(1).mapErr(() => "nope");
    assert.equal(r.unwrap(), 1);
  });

  it("flatMap chains to Ok", () => {
    assert.equal(
      Ok(5)
        .flatMap(n => Ok(n + 1))
        .unwrap(),
      6,
    );
  });

  it("flatMap chains to Err", () => {
    assert.equal(Ok(5).flatMap(() => Err("fail")).isErr, true);
  });

  it("tap runs side-effect and returns same", () => {
    let seen = 0;
    const r = Ok(42).tap(v => {
      seen = v;
    });
    assert.equal(seen, 42);
    assert.equal(r.unwrap(), 42);
  });

  it("tapErr is a no-op", () => {
    let called = false;
    Ok(1).tapErr(() => {
      called = true;
    });
    assert.equal(called, false);
  });

  it("unwrap returns value", () => {
    assert.equal(Ok("hi").unwrap(), "hi");
  });

  it("unwrapOr returns value (ignores fallback)", () => {
    assert.equal(Ok(1).unwrapOr(99), 1);
  });

  it("unwrapOrElse returns value (ignores fn)", () => {
    assert.equal(
      Ok(1).unwrapOrElse(() => 99),
      1,
    );
  });

  it("unwrapErr throws on Ok", () => {
    assert.throws(() => Ok(1).unwrapErr(), TypeError);
  });

  it("match calls Ok handler", () => {
    assert.equal(Ok(10).match({ Ok: v => v + 1, Err: () => -1 }), 11);
  });

  it("toOption returns Some", () => {
    const opt = Ok(42).toOption();
    assert.equal(opt.isSome, true);
    assert.equal(opt.unwrap(), 42);
  });

  it("zip two Ok values", () => {
    const r = Ok("a").zip(Ok(1));
    assert.deepEqual(r.unwrap(), ["a", 1]);
  });

  it("zip Ok with Err returns Err", () => {
    assert.equal(Ok(1).zip(Err("e")).isErr, true);
  });

  it("ap applies wrapped function", () => {
    const r = Ok(5).ap(Ok(n => n * 2));
    assert.equal(r.unwrap(), 10);
  });

  it("ap with Err function returns Err", () => {
    assert.equal(Ok(5).ap(Err("no fn")).isErr, true);
  });

  it("toJSON serializes correctly", () => {
    assert.deepEqual(Ok(42).toJSON(), { tag: "Ok", value: 42 });
  });

  it("toString formats correctly", () => {
    assert.equal(Ok(42).toString(), "Ok(42)");
  });
});

// =============================================================================
// Result - Err variant
// =============================================================================

describe("Result (Err)", () => {
  it("map is a no-op", () => {
    assert.equal(Err("e").map(() => 99).isErr, true);
  });

  it("mapErr transforms error", () => {
    assert.equal(
      Err("e")
        .mapErr(e => e.toUpperCase())
        .unwrapErr(),
      "E",
    );
  });

  it("flatMap is a no-op", () => {
    assert.equal(
      Err("e")
        .flatMap(() => Ok(99))
        .unwrapErr(),
      "e",
    );
  });

  it("tap is a no-op", () => {
    let called = false;
    Err("e").tap(() => {
      called = true;
    });
    assert.equal(called, false);
  });

  it("tapErr runs side-effect", () => {
    let seen = "";
    Err("oops").tapErr(e => {
      seen = e;
    });
    assert.equal(seen, "oops");
  });

  it("unwrap throws on Err", () => {
    assert.throws(() => Err("e").unwrap(), TypeError);
  });

  it("unwrapOr returns fallback", () => {
    assert.equal(Err("e").unwrapOr(99), 99);
  });

  it("unwrapOrElse calls recovery fn", () => {
    assert.equal(
      Err("err").unwrapOrElse(e => e.length),
      3,
    );
  });

  it("unwrapErr returns error", () => {
    assert.equal(Err("oops").unwrapErr(), "oops");
  });

  it("match calls Err handler", () => {
    assert.equal(Err("e").match({ Ok: () => -1, Err: e => e.length }), 1);
  });

  it("toOption returns None", () => {
    assert.equal(Err("e").toOption().isNone, true);
  });

  it("zip Err with Ok returns Err", () => {
    assert.equal(Err("e").zip(Ok(1)).isErr, true);
  });

  it("zip Err with Err returns first Err", () => {
    assert.equal(Err("first").zip(Err("second")).unwrapErr(), "first");
  });

  it("ap Err propagates", () => {
    assert.equal(Err("e").ap(Ok(n => n)).isErr, true);
  });

  it("toJSON serializes correctly", () => {
    assert.deepEqual(Err("oops").toJSON(), { tag: "Err", error: "oops" });
  });

  it("toString formats correctly", () => {
    assert.equal(Err("oops").toString(), "Err(oops)");
  });
});

// =============================================================================
// Result namespace
// =============================================================================

describe("Result namespace", () => {
  it("fromNullable returns Ok for non-null", () => {
    assert.equal(Result.fromNullable(42, () => "null").unwrap(), 42);
  });

  it("fromNullable returns Err for null", () => {
    assert.equal(Result.fromNullable(null, () => "was null").isErr, true);
  });

  it("fromNullable returns Err for undefined", () => {
    assert.equal(Result.fromNullable(undefined, () => "undef").isErr, true);
  });

  it("fromNullable treats 0 as Ok", () => {
    assert.equal(Result.fromNullable(0, () => "null").unwrap(), 0);
  });

  it("fromNullable treats empty string as Ok", () => {
    assert.equal(Result.fromNullable("", () => "null").unwrap(), "");
  });

  it("collect succeeds with all Ok", () => {
    assert.deepEqual(Result.collect([Ok(1), Ok(2), Ok(3)]).unwrap(), [1, 2, 3]);
  });

  it("collect fails on first Err", () => {
    const r = Result.collect([Ok(1), Err("a"), Ok(3), Err("b")]);
    assert.equal(r.unwrapErr(), "a");
  });

  it("collect with empty array returns Ok([])", () => {
    assert.deepEqual(Result.collect([]).unwrap(), []);
  });

  it("sequence is alias for collect", () => {
    assert.deepEqual(Result.sequence([Ok(1), Ok(2)]).unwrap(), [1, 2]);
  });

  it("traverse maps and collects", () => {
    const r = Result.traverse([1, 2, 3], n => (n > 0 ? Ok(n * 10) : Err("neg")));
    assert.deepEqual(r.unwrap(), [10, 20, 30]);
  });

  it("traverse short-circuits on first Err", () => {
    const r = Result.traverse([1, -1, 2], n => (n > 0 ? Ok(n) : Err(`${n} neg`)));
    assert.equal(r.unwrapErr(), "-1 neg");
  });

  it("partition separates Ok and Err", () => {
    const { ok, err } = Result.partition([Ok(1), Err("a"), Ok(2), Err("b")]);
    assert.deepEqual(ok, [1, 2]);
    assert.deepEqual(err, ["a", "b"]);
  });

  it("partition with all Ok", () => {
    const { ok, err } = Result.partition([Ok(1), Ok(2)]);
    assert.deepEqual(ok, [1, 2]);
    assert.deepEqual(err, []);
  });

  it("partition with all Err", () => {
    const { ok, err } = Result.partition([Err("a"), Err("b")]);
    assert.deepEqual(ok, []);
    assert.deepEqual(err, ["a", "b"]);
  });

  it("is returns true for Ok and Err", () => {
    assert.equal(Result.is(Ok(1)), true);
    assert.equal(Result.is(Err("e")), true);
  });

  it("is returns false for non-Result", () => {
    assert.equal(Result.is(42), false);
    assert.equal(Result.is(null), false);
    assert.equal(Result.is(Some(1)), false);
  });
});

// =============================================================================
// Option - Some variant
// =============================================================================

describe("Option (Some)", () => {
  it("map transforms value", () => {
    assert.equal(
      Some(3)
        .map(n => n * 2)
        .unwrap(),
      6,
    );
  });

  it("flatMap chains to Some", () => {
    assert.equal(
      Some(5)
        .flatMap(n => Some(n + 1))
        .unwrap(),
      6,
    );
  });

  it("flatMap chains to None", () => {
    assert.equal(Some(5).flatMap(() => None).isNone, true);
  });

  it("filter keeps matching value", () => {
    assert.equal(
      Some(10)
        .filter(n => n > 5)
        .unwrap(),
      10,
    );
  });

  it("filter drops non-matching value", () => {
    assert.equal(Some(3).filter(n => n > 5).isNone, true);
  });

  it("tap runs side-effect", () => {
    let seen = 0;
    Some(42).tap(v => {
      seen = v;
    });
    assert.equal(seen, 42);
  });

  it("unwrap returns value", () => {
    assert.equal(Some("x").unwrap(), "x");
  });

  it("unwrapOr returns value", () => {
    assert.equal(Some(1).unwrapOr(99), 1);
  });

  it("unwrapOrElse returns value", () => {
    assert.equal(
      Some(1).unwrapOrElse(() => 99),
      1,
    );
  });

  it("toResult returns Ok", () => {
    assert.equal(Some(42).toResult("err").unwrap(), 42);
  });

  it("zip two Some values", () => {
    assert.deepEqual(Some("a").zip(Some(1)).unwrap(), ["a", 1]);
  });

  it("zip Some with None returns None", () => {
    assert.equal(Some(1).zip(None).isNone, true);
  });

  it("ap applies wrapped function", () => {
    assert.equal(
      Some(5)
        .ap(Some(n => n * 2))
        .unwrap(),
      10,
    );
  });

  it("or returns self", () => {
    assert.equal(Some(1).or(Some(99)).unwrap(), 1);
  });

  it("toJSON serializes correctly", () => {
    assert.deepEqual(Some(42).toJSON(), { tag: "Some", value: 42 });
  });

  it("toString formats correctly", () => {
    assert.equal(Some(42).toString(), "Some(42)");
  });
});

// =============================================================================
// Option - None variant
// =============================================================================

describe("Option (None)", () => {
  it("map is a no-op", () => {
    assert.equal(None.map(() => 99).isNone, true);
  });

  it("flatMap is a no-op", () => {
    assert.equal(None.flatMap(() => Some(99)).isNone, true);
  });

  it("filter is a no-op", () => {
    assert.equal(None.filter(() => true).isNone, true);
  });

  it("tap is a no-op", () => {
    let called = false;
    None.tap(() => {
      called = true;
    });
    assert.equal(called, false);
  });

  it("unwrap throws", () => {
    assert.throws(() => None.unwrap(), TypeError);
  });

  it("unwrapOr returns fallback", () => {
    assert.equal(None.unwrapOr(99), 99);
  });

  it("unwrapOrElse calls fn", () => {
    assert.equal(
      None.unwrapOrElse(() => 99),
      99,
    );
  });

  it("toResult returns Err", () => {
    assert.equal(None.toResult("missing").isErr, true);
    assert.equal(None.toResult("missing").unwrapErr(), "missing");
  });

  it("zip returns None", () => {
    assert.equal(None.zip(Some(1)).isNone, true);
  });

  it("ap returns None", () => {
    assert.equal(None.ap(Some(n => n)).isNone, true);
  });

  it("or returns the other", () => {
    assert.equal(None.or(Some(99)).unwrap(), 99);
  });

  it("or with None returns None", () => {
    assert.equal(None.or(None).isNone, true);
  });

  it("toJSON serializes correctly", () => {
    assert.deepEqual(None.toJSON(), { tag: "None" });
  });

  it("toString formats correctly", () => {
    assert.equal(None.toString(), "None");
  });
});

// =============================================================================
// Option namespace
// =============================================================================

describe("Option namespace", () => {
  it("fromNullable returns Some for non-null", () => {
    assert.equal(Option.fromNullable(42).unwrap(), 42);
  });

  it("fromNullable returns None for null", () => {
    assert.equal(Option.fromNullable(null).isNone, true);
  });

  it("fromNullable returns None for undefined", () => {
    assert.equal(Option.fromNullable(undefined).isNone, true);
  });

  it("fromNullable treats 0 as Some", () => {
    assert.equal(Option.fromNullable(0).unwrap(), 0);
  });

  it("fromNullable treats false as Some", () => {
    assert.equal(Option.fromNullable(false).unwrap(), false);
  });

  it("collect succeeds with all Some", () => {
    assert.deepEqual(Option.collect([Some(1), Some(2)]).unwrap(), [1, 2]);
  });

  it("collect fails on first None", () => {
    assert.equal(Option.collect([Some(1), None, Some(3)]).isNone, true);
  });

  it("sequence is alias for collect", () => {
    assert.deepEqual(Option.sequence([Some("a"), Some("b")]).unwrap(), ["a", "b"]);
  });

  it("traverse maps and collects", () => {
    const r = Option.traverse([1, 2, 3], n => Some(n * 10));
    assert.deepEqual(r.unwrap(), [10, 20, 30]);
  });

  it("traverse short-circuits on None", () => {
    const r = Option.traverse([1, 0, 3], n => (n > 0 ? Some(n) : None));
    assert.equal(r.isNone, true);
  });

  it("partition separates Some and None", () => {
    const { some, none } = Option.partition([Some(1), None, Some(2), None]);
    assert.deepEqual(some, [1, 2]);
    assert.equal(none, 2);
  });

  it("is returns true for Some and None", () => {
    assert.equal(Option.is(Some(1)), true);
    assert.equal(Option.is(None), true);
  });

  it("is returns false for non-Option", () => {
    assert.equal(Option.is(42), false);
    assert.equal(Option.is(Ok(1)), false);
  });
});

// =============================================================================
// Task
// =============================================================================

describe("Task", () => {
  it("Task.of creates successful Task", async () => {
    const r = await Task.of(42).run();
    assert.equal(r.unwrap(), 42);
  });

  it("Task.fromResult wraps Ok", async () => {
    const r = await Task.fromResult(Ok(1)).run();
    assert.equal(r.unwrap(), 1);
  });

  it("Task.fromResult wraps Err", async () => {
    const r = await Task.fromResult(Err("e")).run();
    assert.equal(r.unwrapErr(), "e");
  });

  it("map transforms success", async () => {
    const r = await Task.of(5)
      .map(n => n * 2)
      .run();
    assert.equal(r.unwrap(), 10);
  });

  it("mapErr transforms error", async () => {
    const t = Task(() => Promise.resolve(Err("low")));
    const r = await t.mapErr(e => e.toUpperCase()).run();
    assert.equal(r.unwrapErr(), "LOW");
  });

  it("flatMap chains tasks", async () => {
    const r = await Task.of(5)
      .flatMap(n => Task.of(n + 1))
      .run();
    assert.equal(r.unwrap(), 6);
  });

  it("flatMap short-circuits on error", async () => {
    let called = false;
    const r = await Task(() => Promise.resolve(Err("e")))
      .flatMap(() => {
        called = true;
        return Task.of(99);
      })
      .run();
    assert.equal(called, false);
    assert.equal(r.isErr, true);
  });

  it("tap runs side-effect on success", async () => {
    let seen = 0;
    await Task.of(42)
      .tap(v => {
        seen = v;
      })
      .run();
    assert.equal(seen, 42);
  });

  it("tapErr runs side-effect on error", async () => {
    let seen = "";
    await Task(() => Promise.resolve(Err("oops")))
      .tapErr(e => {
        seen = e;
      })
      .run();
    assert.equal(seen, "oops");
  });

  it("zip combines two successful Tasks", async () => {
    const r = await Task.of("a").zip(Task.of(1)).run();
    assert.deepEqual(r.unwrap(), ["a", 1]);
  });

  it("zip propagates first error", async () => {
    const r = await Task(() => Promise.resolve(Err("e")))
      .zip(Task.of(1))
      .run();
    assert.equal(r.isErr, true);
  });

  it("runGetOr returns value on success", async () => {
    assert.equal(await Task.of(42).runGetOr(0), 42);
  });

  it("runGetOr returns fallback on error", async () => {
    assert.equal(await Task(() => Promise.resolve(Err("e"))).runGetOr(0), 0);
  });

  it("Task.all runs all tasks", async () => {
    const r = await Task.all([Task.of(1), Task.of(2), Task.of(3)]).run();
    assert.deepEqual(r.unwrap(), [1, 2, 3]);
  });

  it("Task.all short-circuits on first error", async () => {
    const r = await Task.all([Task.of(1), Task(() => Promise.resolve(Err("e")))]).run();
    assert.equal(r.isErr, true);
  });

  it("Task.race returns first to complete", async () => {
    const r = await Task.race([
      Task.of(42),
      Task(() => new Promise(resolve => setTimeout(() => resolve(Ok(99)), 100))),
    ]).run();
    assert.equal(r.unwrap(), 42);
  });

  it("Task.allSettled collects all results", async () => {
    const results = await Task.allSettled([
      Task.of(1),
      Task(() => Promise.resolve(Err("e"))),
      Task.of(3),
    ]).run();
    const arr = results.unwrap();
    assert.equal(arr[0].isOk, true);
    assert.equal(arr[1].isErr, true);
    assert.equal(arr[2].isOk, true);
  });

  it("Task.traverse maps and sequences", async () => {
    const r = await Task.traverse([1, 2, 3], n => Task.of(n * 10)).run();
    assert.deepEqual(r.unwrap(), [10, 20, 30]);
  });

  it("Task.sequence sequences tasks", async () => {
    const r = await Task.sequence([Task.of(1), Task.of(2)]).run();
    assert.deepEqual(r.unwrap(), [1, 2]);
  });

  it("Task.ap applies function task to value task", async () => {
    const r = await Task.ap(
      Task.of(n => n * 3),
      Task.of(10),
    ).run();
    assert.equal(r.unwrap(), 30);
  });

  it("Task.is returns true for Tasks", async () => {
    assert.equal(Task.is(Task.of(1)), true);
  });

  it("Task.is returns false for non-Tasks", async () => {
    assert.equal(Task.is(42), false);
    assert.equal(Task.is(Promise.resolve(1)), false);
  });

  it("memoize caches result", async () => {
    let calls = 0;
    const t = Task(() => {
      calls++;
      return Promise.resolve(Ok(42));
    }).memoize();
    await t.run();
    await t.run();
    assert.equal(calls, 1);
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
    assert.equal(r.isErr, true);
    const err = r.unwrapErr();
    assert.deepEqual(err.path, ["user", "name"]);
  });

  it("array errors include index in path", () => {
    const s = Schema.array(Schema.number);
    const r = s.parse([1, "two", 3]);
    assert.equal(r.isErr, true);
    assert.deepEqual(r.unwrapErr().path, ["1"]);
  });

  it("optional accepts undefined", () => {
    const s = Schema.string.optional();
    assert.equal(s.parse(undefined).unwrap(), undefined);
    assert.equal(s.parse("hi").unwrap(), "hi");
  });

  it("default provides fallback for undefined/null", () => {
    const s = Schema.number.default(0);
    assert.equal(s.parse(undefined).unwrap(), 0);
    assert.equal(s.parse(null).unwrap(), 0);
    assert.equal(s.parse(5).unwrap(), 5);
  });

  it("transform converts parsed value", () => {
    const s = Schema.string.transform(s => s.length);
    assert.equal(s.parse("hello").unwrap(), 5);
  });

  it("refine adds custom validation", () => {
    const s = Schema.number.refine(n => n > 0, "positive");
    assert.equal(s.parse(5).isOk, true);
    assert.equal(s.parse(-1).isErr, true);
  });

  it("is acts as type guard", () => {
    assert.equal(Schema.string.is("hello"), true);
    assert.equal(Schema.string.is(123), false);
  });

  it("literal validates exact value", () => {
    const s = Schema.literal("active");
    assert.equal(s.parse("active").unwrap(), "active");
    assert.equal(s.parse("inactive").isErr, true);
  });

  it("enum validates set of values", () => {
    const s = Schema.enum(["a", "b", "c"]);
    assert.equal(s.parse("b").unwrap(), "b");
    assert.equal(s.parse("d").isErr, true);
  });

  it("union tries schemas in order", () => {
    const s = Schema.union(Schema.string, Schema.number);
    assert.equal(s.parse("hi").unwrap(), "hi");
    assert.equal(s.parse(42).unwrap(), 42);
    assert.equal(s.parse(true).isErr, true);
  });

  it("intersection validates both schemas", () => {
    const a = Schema.object({ name: Schema.string });
    const b = Schema.object({ age: Schema.number });
    const s = Schema.intersection(a, b);
    const r = s.parse({ name: "Alice", age: 30 });
    assert.equal(r.isOk, true);
    assert.deepEqual(r.unwrap(), { name: "Alice", age: 30 });
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
    assert.equal(r.isOk, true);
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
    assert.equal(s.parse({ type: "circle", radius: 5 }).isOk, true);
    assert.equal(s.parse({ type: "rect", width: 1, height: 2 }).isOk, true);
    assert.equal(s.parse({ type: "triangle" }).isErr, true);
  });

  it("tuple validates positional types", () => {
    const s = Schema.tuple(Schema.string, Schema.number, Schema.boolean);
    assert.deepEqual(s.parse(["hi", 42, true]).unwrap(), ["hi", 42, true]);
    assert.equal(s.parse(["hi", "42"]).isErr, true);
  });

  it("record validates string-keyed objects", () => {
    const s = Schema.record(Schema.number);
    const r = s.parse({ a: 1, b: 2 });
    assert.deepEqual(r.unwrap(), { a: 1, b: 2 });
    assert.equal(s.parse({ a: "nope" }).isErr, true);
  });

  it("numeric refinements work", () => {
    assert.equal(Schema.int.parse(5).isOk, true);
    assert.equal(Schema.int.parse(5.5).isErr, true);
    assert.equal(Schema.positive.parse(1).isOk, true);
    assert.equal(Schema.positive.parse(0).isErr, true);
    assert.equal(Schema.nonNegative.parse(0).isOk, true);
    assert.equal(Schema.nonNegative.parse(-1).isErr, true);
    assert.equal(Schema.min(5).parse(5).isOk, true);
    assert.equal(Schema.min(5).parse(4).isErr, true);
    assert.equal(Schema.max(10).parse(10).isOk, true);
    assert.equal(Schema.max(10).parse(11).isErr, true);
    assert.equal(Schema.range(1, 10).parse(5).isOk, true);
    assert.equal(Schema.range(1, 10).parse(0).isErr, true);
  });

  it("string refinements work", () => {
    assert.equal(Schema.nonEmpty.parse("hi").isOk, true);
    assert.equal(Schema.nonEmpty.parse("  ").isErr, true);
    assert.equal(Schema.minLength(3).parse("abc").isOk, true);
    assert.equal(Schema.minLength(3).parse("ab").isErr, true);
    assert.equal(Schema.maxLength(3).parse("abc").isOk, true);
    assert.equal(Schema.maxLength(3).parse("abcd").isErr, true);
    assert.equal(Schema.email.parse("a@b.c").isOk, true);
    assert.equal(Schema.email.parse("not-email").isErr, true);
  });
});

// =============================================================================
// Record methods
// =============================================================================

describe("Record methods", () => {
  it("set creates new record with updated field", () => {
    const r = Record({ name: "Alice", age: 30 });
    const r2 = r.set(o => o.age, 31);
    assert.equal(r.age, 30);
    assert.equal(r2.age, 31);
  });

  it("update transforms a field", () => {
    const r = Record({ count: 0 });
    const r2 = r.update(
      o => o.count,
      c => c + 1,
    );
    assert.equal(r2.count, 1);
  });

  it("merge shallow-merges fields", () => {
    const r = Record({ a: 1, b: 2 });
    const r2 = r.merge({ b: 99 });
    assert.equal(r2.a, 1);
    assert.equal(r2.b, 99);
  });

  it("at returns Option", () => {
    const r = Record({ name: "Bob" });
    assert.equal(r.at(o => o.name).unwrap(), "Bob");
  });

  it("equals compares structurally", () => {
    const a = Record({ x: 1 });
    const b = Record({ x: 1 });
    const c = Record({ x: 2 });
    assert.equal(a.equals(b), true);
    assert.equal(a.equals(c), false);
  });

  it("toMutable returns mutable copy", () => {
    const r = Record({ a: 1 });
    const m = r.toMutable();
    m.a = 99;
    assert.equal(r.a, 1);
    assert.equal(m.a, 99);
  });

  it("produce allows draft mutations", () => {
    const r = Record({ name: "Alice", age: 30 });
    const r2 = r.produce(d => {
      d.name = "Bob";
      d.age = 31;
    });
    assert.equal(r.name, "Alice");
    assert.equal(r2.name, "Bob");
    assert.equal(r2.age, 31);
  });

  it("$raw returns frozen data", () => {
    const r = Record({ x: 1 });
    assert.equal(r.$raw.x, 1);
    assert.equal(Object.isFrozen(r.$raw), true);
  });

  it("toJSON returns plain object", () => {
    const r = Record({ a: 1, b: "two" });
    const json = r.toJSON();
    assert.deepEqual(json, { a: 1, b: "two" });
  });
});

// =============================================================================
// List methods
// =============================================================================

describe("List methods", () => {
  it("append adds to end", () => {
    const l = List([1, 2, 3]).append(4);
    assert.equal(l.length, 4);
    assert.equal(l[3], 4);
  });

  it("prepend adds to start", () => {
    const l = List([2, 3]).prepend(1);
    assert.equal(l[0], 1);
    assert.equal(l.length, 3);
  });

  it("setAt replaces element", () => {
    const l = List(["a", "b", "c"]).setAt(1, "B");
    assert.equal(l[1], "B");
  });

  it("updateAt transforms element", () => {
    const l = List([1, 2, 3]).updateAt(1, n => n * 10);
    assert.equal(l[1], 20);
  });

  it("removeAt removes element", () => {
    const l = List([1, 2, 3]).removeAt(1);
    assert.deepEqual([...l], [1, 3]);
  });

  it("map transforms elements", () => {
    const l = List([1, 2, 3]).map(n => n * 2);
    assert.deepEqual([...l], [2, 4, 6]);
  });

  it("filter keeps matching elements", () => {
    const l = List([1, 2, 3, 4]).filter(n => n % 2 === 0);
    assert.deepEqual([...l], [2, 4]);
  });

  it("reduce folds elements", () => {
    assert.equal(
      List([1, 2, 3]).reduce((a, b) => a + b, 0),
      6,
    );
  });

  it("find returns Option", () => {
    assert.equal(
      List([1, 2, 3])
        .find(n => n === 2)
        .unwrap(),
      2,
    );
    assert.equal(List([1, 2, 3]).find(n => n === 99).isNone, true);
  });

  it("at supports negative indices", () => {
    const l = List([10, 20, 30]);
    assert.equal(l.at(-1).unwrap(), 30);
    assert.equal(l.at(-2).unwrap(), 20);
  });

  it("first and last return Option", () => {
    const l = List([1, 2, 3]);
    assert.equal(l.first().unwrap(), 1);
    assert.equal(l.last().unwrap(), 3);
    assert.equal(List([]).first().isNone, true);
    assert.equal(List([]).last().isNone, true);
  });

  it("concat joins lists", () => {
    const l = List([1, 2]).concat(List([3, 4]));
    assert.deepEqual([...l], [1, 2, 3, 4]);
  });

  it("slice returns sub-range", () => {
    const l = List([1, 2, 3, 4, 5]).slice(1, 4);
    assert.deepEqual([...l], [2, 3, 4]);
  });

  it("flatMap maps and flattens", () => {
    const l = List([1, 2, 3]).flatMap(n => [n, n * 10]);
    assert.deepEqual([...l], [1, 10, 2, 20, 3, 30]);
  });

  it("equals compares structurally", () => {
    assert.equal(List([1, 2]).equals(List([1, 2])), true);
    assert.equal(List([1, 2]).equals(List([1, 3])), false);
  });

  it("toMutable returns plain array", () => {
    const arr = List([1, 2]).toMutable();
    arr.push(3);
    assert.equal(arr.length, 3);
  });

  it("supports spread and iteration", () => {
    const l = List([1, 2, 3]);
    assert.deepEqual([...l], [1, 2, 3]);
  });

  it("supports destructuring", () => {
    const [a, b] = List([10, 20]);
    assert.equal(a, 10);
    assert.equal(b, 20);
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
    assert.equal(r, 11);
  });

  it("flow composes functions", () => {
    const fn = flow(
      n => n * 2,
      n => n + 1,
    );
    assert.equal(fn(5), 11);
  });

  it("standalone match works with Result", () => {
    assert.equal(match(Ok(10), { Ok: v => v, Err: () => -1 }), 10);
  });

  it("standalone match works with Option", () => {
    assert.equal(match(Some("hi"), { Some: s => s.length, None: () => 0 }), 2);
  });

  it("standalone tryCatch catches", () => {
    const r = tryCatch(
      () => JSON.parse("invalid"),
      e => String(e),
    );
    assert.equal(r.isErr, true);
  });

  it("standalone tryCatch succeeds", () => {
    const r = tryCatch(() => JSON.parse('{"a":1}'));
    assert.deepEqual(r.unwrap(), { a: 1 });
  });
});

// =============================================================================
// Duration and Cron
// =============================================================================

describe("Duration", () => {
  it("creates from milliseconds", () => {
    assert.equal(Duration.milliseconds(500), 500);
  });

  it("creates from seconds", () => {
    assert.equal(Duration.seconds(2), 2000);
  });

  it("creates from minutes", () => {
    assert.equal(Duration.minutes(1), 60000);
  });

  it("creates from hours", () => {
    assert.equal(Duration.hours(1), 3600000);
  });

  it("creates from days", () => {
    assert.equal(Duration.days(1), 86400000);
  });

  it("format returns human-readable string", () => {
    const formatted = Duration.format(Duration.hours(2) + Duration.minutes(30));
    assert.ok(formatted.includes("2h"));
    assert.ok(formatted.includes("30m"));
  });
});

describe("Cron", () => {
  it("validates standard cron expressions", () => {
    assert.equal(Cron.parse("* * * * *").isOk, true);
    assert.equal(Cron.parse("0 9 * * 1-5").isOk, true);
  });

  it("rejects invalid expressions", () => {
    assert.equal(Cron.parse("invalid").isErr, true);
    assert.equal(Cron.parse("* * *").isErr, true);
  });
});

// =============================================================================
// ErrType
// =============================================================================

describe("ErrType", () => {
  it("creates tagged error with tag and message", () => {
    const MyError = ErrType("MyError");
    const e = MyError("something went wrong");
    assert.equal(e.tag, "MyError");
    assert.equal(e.message, "something went wrong");
  });

  it("has name alias for tag", () => {
    const AppError = ErrType("AppError");
    const e = AppError("oops");
    assert.equal(e.name, "AppError");
  });

  it("has auto-derived code", () => {
    const AppError = ErrType("AppError");
    const e = AppError("oops");
    assert.equal(typeof e.code, "string");
    assert.ok(e.code.length > 0);
  });

  it("toString includes tag and message", () => {
    const AppError = ErrType("AppError");
    const e = AppError("oops");
    assert.ok(e.toString().includes("AppError"));
    assert.ok(e.toString().includes("oops"));
  });

  it("different ErrTypes have different tags", () => {
    const A = ErrType("A");
    const B = ErrType("B");
    assert.notEqual(A("x").tag, B("x").tag);
  });

  it("ErrType.is detects ErrType instances", () => {
    const MyErr = ErrType("MyErr");
    assert.equal(ErrType.is(MyErr("x")), true);
    assert.equal(ErrType.is({ tag: "fake" }), false);
    assert.equal(ErrType.is(42), false);
  });
});

/**
 * runtime.test.js - Runtime correctness tests.
 *
 * Uses @igorjs/pure-test.
 * Run: node --test tests/runtime.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Record,
  List,
  Schema,
  Ok,
  Err,
  Some,
  None,
  Result,
  Option,
  match,
  tryCatch,
  pipe,
  flow,
  Lazy,
  Task,
  isImmutable,
  ErrType,
  Program,
} = await import("../dist/index.js");

// ═══════════════════════════════════════════════════════════════════════════════
// Record
// ═══════════════════════════════════════════════════════════════════════════════

describe("Record", () => {
  const user = Record({
    name: "John Doe",
    age: 21,
    address: { city: "New York", geo: { lat: -33.87 } },
    tags: ["fp", "ts"],
  });

  it("reads shallow properties", () => {
    expect(user.name).toBe("John Doe");
    expect(user.age).toBe(21);
  });

  it("reads nested properties", () => {
    expect(user.address.city).toBe("New York");
    expect(user.address.geo.lat).toBe(-33.87);
  });

  it("nested objects are full Records", () => {
    expect(user.address.$immutable).toBe(true);
    expect(typeof user.address.set).toBe("function");
    expect(typeof user.address.update).toBe("function");
    expect(typeof user.address.produce).toBe("function");
  });

  it("blocks mutation at runtime", () => {
    expect(() => {
      user.name = "X";
    }).toThrow();
    expect(() => {
      user.address.city = "X";
    }).toThrow();
  });

  it("set() returns new Record", () => {
    const moved = user.set(u => u.address.city, "San Francisco");
    expect(moved.address.city).toBe("San Francisco");
    expect(user.address.city).toBe("New York");
  });

  it("update() transforms value", () => {
    const upper = user.update(
      u => u.name,
      n => n.toUpperCase(),
    );
    expect(upper.name).toBe("JOHN DOE");
    expect(user.name).toBe("John Doe");
  });

  it("produce() batch mutations", () => {
    const produced = user.produce(d => {
      d.name = "Jack Doe";
      d.address.city = "Melbourne";
    });
    expect(produced.name).toBe("Jack Doe");
    expect(produced.address.city).toBe("Melbourne");
    expect(user.name).toBe("John Doe");
    expect(user.address.city).toBe("New York");
  });

  it("produce() blocks mutating array methods", () => {
    const rec = Record({ items: [1, 2, 3] });
    const methods = [
      "push",
      "pop",
      "shift",
      "unshift",
      "splice",
      "sort",
      "reverse",
      "fill",
      "copyWithin",
    ];
    for (const method of methods) {
      expect(() => rec.produce(d => d.items[method]())).toThrow();
    }
  });

  it("produce() allows spread on nested arrays", () => {
    const rec = Record({ items: [1, 2, 3] });
    const updated = rec.produce(d => {
      d.items = [...d.items, 4];
    });
    expect([...updated.items.$raw]).toEqual([1, 2, 3, 4]);
    expect([...rec.items.$raw]).toEqual([1, 2, 3]);
  });

  it("merge() shallow merges", () => {
    const merged = user.merge({ age: 99 });
    expect(merged.age).toBe(99);
    expect(merged.name).toBe("John Doe");
    expect(user.age).toBe(21);
  });

  it("at() returns Option", () => {
    expect(user.at(u => u.name).isSome).toBe(true);
    expect(user.at(u => u.name).unwrap()).toBe("John Doe");

    const withNull = Record({ x: null });
    expect(withNull.at(r => r.x).isNone).toBe(true);
  });

  it("equals() structural comparison", () => {
    const a = Record({ x: 1, y: { z: 2 } });
    const b = Record({ x: 1, y: { z: 2 } });
    const c = Record({ x: 1, y: { z: 3 } });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("toMutable() deep clones", () => {
    const mut = user.toMutable();
    mut.name = "Mutable";
    expect(mut.name).toBe("Mutable");
    expect(user.name).toBe("John Doe");
  });

  it("toJSON() returns raw data", () => {
    const json = user.toJSON();
    expect(json.name).toBe("John Doe");
  });

  it("$immutable brand", () => {
    expect(user.$immutable).toBe(true);
    expect(isImmutable(user)).toBe(true);
    expect(isImmutable({})).toBe(false);
  });

  it("Record.clone() defensive copy", () => {
    const source = { name: "External" };
    const safe = Record.clone(source);
    source.name = "Mutated";
    expect(safe.name).toBe("External");
  });

  it("Record.clone() deep copies nested objects", () => {
    const source = { data: { value: "original", nested: { x: 1 } } };
    const safe = Record.clone(source);
    source.data.value = "mutated";
    source.data.nested.x = 999;
    expect(safe.data.value).toBe("original");
    expect(safe.data.nested.x).toBe(1);
  });

  it("child proxy cache identity", () => {
    expect(user.address).toBe(user.address);
    expect(user.address.geo).toBe(user.address.geo);
  });

  it("empty Record", () => {
    const empty = Record({});
    expect(empty.$immutable).toBe(true);
    expect(empty.toJSON()).toEqual({});
    expect(empty.equals(Record({}))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// List
// ═══════════════════════════════════════════════════════════════════════════════

describe("List", () => {
  const nums = List([3, 1, 4, 1, 5]);

  it("index access", () => {
    expect(nums[0]).toBe(3);
    expect(nums[4]).toBe(5);
    expect(nums.length).toBe(5);
  });

  it("blocks mutation", () => {
    expect(() => {
      nums[0] = 99;
    }).toThrow();
  });

  it("append/prepend", () => {
    expect([...nums.append(9)]).toEqual([3, 1, 4, 1, 5, 9]);
    expect([...nums.prepend(0)]).toEqual([0, 3, 1, 4, 1, 5]);
    expect(nums.length).toBe(5);
  });

  it("setAt/updateAt/removeAt", () => {
    expect(nums.setAt(0, 99)[0]).toBe(99);
    expect(nums.updateAt(0, n => n * 10)[0]).toBe(30);
    expect(nums.removeAt(0).length).toBe(4);
  });

  it("map/filter/reduce", () => {
    expect([...nums.map(n => n * 2)]).toEqual([6, 2, 8, 2, 10]);
    expect([...nums.filter(n => n > 3)]).toEqual([4, 5]);
    expect(nums.reduce((a, n) => a + n, 0)).toBe(14);
  });

  it("find/findIndex return Option", () => {
    expect(nums.find(n => n === 4).isSome).toBe(true);
    expect(nums.find(n => n === 4).unwrap()).toBe(4);
    expect(nums.find(n => n === 99).isNone).toBe(true);
    expect(nums.findIndex(n => n === 4).unwrap()).toBe(2);
  });

  it("at/first/last return Option", () => {
    expect(nums.at(0).unwrap()).toBe(3);
    expect(nums.at(-1).unwrap()).toBe(5);
    expect(nums.at(99).isNone).toBe(true);
    expect(nums.first().unwrap()).toBe(3);
    expect(nums.last().unwrap()).toBe(5);
    expect(List([]).first().isNone).toBe(true);
  });

  it("sortBy", () => {
    expect([...nums.sortBy((a, b) => a - b)]).toEqual([1, 1, 3, 4, 5]);
    expect(nums[0]).toBe(3);
  });

  it("concat/slice/flatMap", () => {
    expect([...nums.slice(0, 2)]).toEqual([3, 1]);
    expect([...nums.concat([6, 7])]).toEqual([3, 1, 4, 1, 5, 6, 7]);
    expect([...nums.flatMap(n => [n, n])]).toEqual([3, 3, 1, 1, 4, 4, 1, 1, 5, 5]);
  });

  it("equals", () => {
    expect(List([1, 2]).equals(List([1, 2]))).toBe(true);
    expect(List([1, 2]).equals(List([1, 3]))).toBe(false);
  });

  it("nested records in lists", () => {
    const users = List([
      { id: "u1", name: "John Doe" },
      { id: "u2", name: "Gislaine" },
    ]);
    expect(users[0].name).toBe("John Doe");
    expect(users[0].$immutable).toBe(true);
  });

  it("empty List", () => {
    const empty = List([]);
    expect(empty.length).toBe(0);
    expect(empty.first().isNone).toBe(true);
    expect(empty.last().isNone).toBe(true);
    expect(empty.find(() => true).isNone).toBe(true);
    expect([...empty]).toEqual([]);
    expect(empty.equals(List([]))).toBe(true);
  });

  it("toMutable() deep clones", () => {
    const items = List([{ x: 1 }, { x: 2 }]);
    const mut = items.toMutable();
    mut[0].x = 99;
    expect(items[0].x).toBe(1);
  });

  it("List.clone() defensive copy", () => {
    const source = [{ id: 1 }];
    const safe = List.clone(source);
    source[0].id = 999;
    expect(safe[0].id).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Result
// ═══════════════════════════════════════════════════════════════════════════════

describe("Result", () => {
  it("Ok/Err construction", () => {
    expect(Ok(42).tag).toBe("Ok");
    expect(Ok(42).value).toBe(42);
    expect(Ok(42).isOk).toBe(true);
    expect(Ok(42).isErr).toBe(false);
    expect(Err("fail").tag).toBe("Err");
    expect(Err("fail").error).toBe("fail");
    expect(Err("fail").isErr).toBe(true);
  });

  it("map/mapErr", () => {
    expect(
      Ok(2)
        .map(n => n * 3)
        .unwrap(),
    ).toBe(6);
    expect(Err("x").map(() => 99).isErr).toBe(true);
    expect(
      Err("x")
        .mapErr(e => e.toUpperCase())
        .unwrapErr(),
    ).toBe("X");
  });

  it("flatMap", () => {
    expect(
      Ok(2)
        .flatMap(n => Ok(n * 3))
        .unwrap(),
    ).toBe(6);
    expect(Ok(2).flatMap(() => Err("nope")).isErr).toBe(true);
    expect(Err("x").flatMap(() => Ok(99)).isErr).toBe(true);
  });

  it("tap/tapErr", () => {
    let tapped = 0;
    Ok(42).tap(v => {
      tapped = v;
    });
    expect(tapped).toBe(42);
    Err("x").tapErr(e => {
      tapped = e.length;
    });
    expect(tapped).toBe(1);

    // tap on Err is no-op
    let didTap = false;
    Err("x").tap(() => {
      didTap = true;
    });
    expect(didTap).toBe(false);

    // tapErr on Ok is no-op
    let didTapErr = false;
    Ok(42).tapErr(() => {
      didTapErr = true;
    });
    expect(didTapErr).toBe(false);
  });

  it("unwrap/unwrapOr/unwrapOrElse", () => {
    expect(Ok(42).unwrap()).toBe(42);
    expect(() => Err("x").unwrap()).toThrow();
    expect(Ok(42).unwrapOr(0)).toBe(42);
    expect(Err("x").unwrapOr(0)).toBe(0);
    expect(Err("x").unwrapOrElse(e => e.length)).toBe(1);
  });

  it("unwrapErr throws on Ok", () => {
    expect(() => Ok(42).unwrapErr()).toThrow();
    expect(Err("boom").unwrapErr()).toBe("boom");
  });

  it("match", () => {
    expect(Ok(42).match({ Ok: v => v * 2, Err: () => -1 })).toBe(84);
    expect(Err("x").match({ Ok: () => 0, Err: e => e })).toBe("x");
  });

  it("zip", () => {
    const [a, b] = Ok(1).zip(Ok(2)).unwrap();
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(Ok(1).zip(Err("x")).isErr).toBe(true);
    expect(Err("y").zip(Ok(1)).isErr).toBe(true);
  });

  it("ap - applicative apply", () => {
    const double = n => n * 2;
    expect(Ok(21).ap(Ok(double)).unwrap()).toBe(42);
    expect(Ok(21).ap(Err("no fn")).isErr).toBe(true);
    expect(Err("no val").ap(Ok(double)).isErr).toBe(true);
    expect(Err("no val").ap(Err("no fn")).isErr).toBe(true);
  });

  it("toOption", () => {
    expect(Ok(42).toOption().unwrap()).toBe(42);
    expect(Err("x").toOption().isNone).toBe(true);
  });

  it("Result.collect", () => {
    expect(Result.collect([Ok(1), Ok(2), Ok(3)]).unwrap()).toEqual([1, 2, 3]);
    expect(Result.collect([Ok(1), Err("x"), Ok(3)]).isErr).toBe(true);
  });

  it("Result.collect with empty array", () => {
    const result = Result.collect([]);
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("Result.tryCatch", () => {
    expect(Result.tryCatch(() => 42).unwrap()).toBe(42);
    expect(
      Result.tryCatch(
        () => {
          throw new Error("boom");
        },
        e => e.message,
      ).unwrapErr(),
    ).toBe("boom");
  });

  it("Result.Ok / Result.Err aliases", () => {
    expect(Result.Ok(42).unwrap()).toBe(42);
    expect(Result.Err("fail").unwrapErr()).toBe("fail");
  });

  it("Result.match standalone", () => {
    expect(Result.match(Ok(42), { Ok: v => v * 2, Err: () => -1 })).toBe(84);
    expect(Result.match(Err("x"), { Ok: () => 0, Err: e => e })).toBe("x");
  });

  it("Result.is type guard", () => {
    expect(Result.is(Ok(1))).toBe(true);
    expect(Result.is(Err("x"))).toBe(true);
    expect(Result.is(Some(1))).toBe(false);
    expect(Result.is(42)).toBe(false);
    expect(Result.is(null)).toBe(false);
  });

  it("toString/toJSON", () => {
    expect(Ok(42).toString()).toBe("Ok(42)");
    expect(Err("x").toString()).toBe("Err(x)");
    expect(Ok(42).toJSON()).toEqual({ tag: "Ok", value: 42 });
    expect(Err("x").toJSON()).toEqual({ tag: "Err", error: "x" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Option
// ═══════════════════════════════════════════════════════════════════════════════

describe("Option", () => {
  it("Some/None construction", () => {
    expect(Some(42).tag).toBe("Some");
    expect(Some(42).value).toBe(42);
    expect(Some(42).isSome).toBe(true);
    expect(None.tag).toBe("None");
    expect(None.isNone).toBe(true);
  });

  it("map/flatMap/filter", () => {
    expect(
      Some(2)
        .map(n => n * 3)
        .unwrap(),
    ).toBe(6);
    expect(None.map(() => 99).isNone).toBe(true);
    expect(
      Some(2)
        .flatMap(n => Some(n * 3))
        .unwrap(),
    ).toBe(6);
    expect(Some(2).filter(n => n > 5).isNone).toBe(true);
    expect(
      Some(10)
        .filter(n => n > 5)
        .unwrap(),
    ).toBe(10);
  });

  it("tap", () => {
    let tapped = 0;
    Some(42).tap(v => {
      tapped = v;
    });
    expect(tapped).toBe(42);

    // tap on None is no-op
    let didTap = false;
    None.tap(() => {
      didTap = true;
    });
    expect(didTap).toBe(false);
  });

  it("unwrap/unwrapOr/unwrapOrElse", () => {
    expect(Some(42).unwrap()).toBe(42);
    expect(() => None.unwrap()).toThrow();
    expect(None.unwrapOr(0)).toBe(0);
    expect(None.unwrapOrElse(() => 99)).toBe(99);
  });

  it("match", () => {
    expect(Some(42).match({ Some: v => v, None: () => -1 })).toBe(42);
    expect(None.match({ Some: () => 0, None: () => -1 })).toBe(-1);
  });

  it("zip/or", () => {
    const [a, b] = Some(1).zip(Some(2)).unwrap();
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(Some(1).zip(None).isNone).toBe(true);
    expect(None.or(Some(42)).unwrap()).toBe(42);
    expect(Some(1).or(Some(99)).unwrap()).toBe(1);
  });

  it("ap - applicative apply", () => {
    const double = n => n * 2;
    expect(Some(21).ap(Some(double)).unwrap()).toBe(42);
    expect(Some(21).ap(None).isNone).toBe(true);
    expect(None.ap(Some(double)).isNone).toBe(true);
    expect(None.ap(None).isNone).toBe(true);
  });

  it("toResult", () => {
    expect(Some(42).toResult("missing").unwrap()).toBe(42);
    expect(None.toResult("missing").unwrapErr()).toBe("missing");
  });

  it("Option.fromNullable", () => {
    expect(Option.fromNullable("hello").unwrap()).toBe("hello");
    expect(Option.fromNullable(null).isNone).toBe(true);
    expect(Option.fromNullable(undefined).isNone).toBe(true);
    expect(Option.fromNullable(0).unwrap()).toBe(0);
    expect(Option.fromNullable("").unwrap()).toBe("");
  });

  it("Option.collect", () => {
    expect(Option.collect([Some(1), Some(2)]).unwrap()).toEqual([1, 2]);
    expect(Option.collect([Some(1), None]).isNone).toBe(true);
  });

  it("Option.collect with empty array", () => {
    const result = Option.collect([]);
    expect(result.isSome).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("Option.Some / Option.None aliases", () => {
    expect(Option.Some(42).unwrap()).toBe(42);
    expect(Option.None.isNone).toBe(true);
  });

  it("Option.match standalone", () => {
    expect(Option.match(Some(42), { Some: v => v * 2, None: () => -1 })).toBe(84);
    expect(Option.match(None, { Some: () => 0, None: () => -1 })).toBe(-1);
  });

  it("Option.is type guard", () => {
    expect(Option.is(Some(1))).toBe(true);
    expect(Option.is(None)).toBe(true);
    expect(Option.is(Ok(1))).toBe(false);
    expect(Option.is(42)).toBe(false);
    expect(Option.is(null)).toBe(false);
  });

  it("toString/toJSON", () => {
    expect(Some(42).toString()).toBe("Some(42)");
    expect(None.toString()).toBe("None");
    expect(Some(42).toJSON()).toEqual({ tag: "Some", value: 42 });
    expect(None.toJSON()).toEqual({ tag: "None" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// pipe / flow
// ═══════════════════════════════════════════════════════════════════════════════

describe("pipe", () => {
  it("passes value through stages", () => {
    expect(
      pipe(
        10,
        n => n + 1,
        n => n * 2,
      ),
    ).toBe(22);
    expect(pipe("hello", s => s.toUpperCase())).toBe("HELLO");
  });

  it("single arg returns value", () => {
    expect(pipe(42)).toBe(42);
  });

  it("9-stage pipeline (max overload)", () => {
    const result = pipe(
      1,
      n => n + 1, // 2
      n => n * 2, // 4
      n => n + 1, // 5
      n => n * 2, // 10
      n => n + 1, // 11
      n => n * 2, // 22
      n => n + 1, // 23
      n => n * 2, // 46
    );
    expect(result).toBe(46);
  });
});

describe("flow", () => {
  it("composes left-to-right", () => {
    const fn = flow(
      n => n + 1,
      n => n * 2,
    );
    expect(fn(10)).toBe(22);
  });

  it("single fn passes through", () => {
    const fn = flow(n => n * 3);
    expect(fn(10)).toBe(30);
  });

  it("6-stage composition (max overload)", () => {
    const fn = flow(
      n => n + 1,
      n => n * 2,
      n => n + 1,
      n => n * 2,
      n => n + 1,
      n => n * 2,
    );
    expect(fn(1)).toBe(22);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Lazy
// ═══════════════════════════════════════════════════════════════════════════════

describe("Lazy", () => {
  it("evaluates once on first access", () => {
    let count = 0;
    const lazy = Lazy(() => {
      count++;
      return 42;
    });
    expect(lazy.isEvaluated).toBe(false);
    expect(lazy.value).toBe(42);
    expect(lazy.isEvaluated).toBe(true);
    expect(lazy.value).toBe(42);
    expect(count).toBe(1);
  });

  it("map returns new deferred Lazy", () => {
    const lazy = Lazy(() => 21);
    const doubled = lazy.map(n => n * 2);
    expect(doubled.isEvaluated).toBe(false);
    expect(doubled.value).toBe(42);
  });

  it("flatMap chains", () => {
    const lazy = Lazy(() => 21).flatMap(n => Lazy(() => n * 2));
    expect(lazy.value).toBe(42);
  });

  it("toOption/toResult handle exceptions", () => {
    const good = Lazy(() => 42);
    expect(good.toOption().unwrap()).toBe(42);

    const bad = Lazy(() => {
      throw new Error("boom");
    });
    expect(bad.toOption().isNone).toBe(true);
    expect(bad.toResult(e => e.message).unwrapErr()).toBe("boom");
  });

  it("unwrapOr handles exceptions", () => {
    const bad = Lazy(() => {
      throw new Error();
    });
    expect(bad.unwrapOr(99)).toBe(99);
  });

  it("toString() shows evaluation state", () => {
    const lazy = Lazy(() => 42);
    expect(lazy.toString()).toBe("Lazy(<pending>)");
    lazy.value; // force evaluation
    expect(lazy.toString()).toBe("Lazy(42)");
  });

  it("[Symbol.dispose]() releases value and thunk", () => {
    const lazy = Lazy(() => 42);
    lazy.value; // evaluate
    expect(lazy.isDisposed).toBe(false);

    lazy[Symbol.dispose]();
    expect(lazy.isDisposed).toBe(true);
    expect(() => lazy.value).toThrow();
    expect(lazy.toString()).toBe("Lazy(<disposed>)");
  });

  it("[Symbol.dispose]() works on unevaluated Lazy", () => {
    const lazy = Lazy(() => 42);
    expect(lazy.isEvaluated).toBe(false);

    lazy[Symbol.dispose]();
    expect(lazy.isDisposed).toBe(true);
    expect(() => lazy.value).toThrow();
  });

  it("disposed Lazy propagates to derived instances", () => {
    const parent = Lazy(() => 21);
    const child = parent.map(n => n * 2);

    parent[Symbol.dispose]();
    // child's thunk references parent.value, which now throws
    expect(() => child.value).toThrow();
  });

  it("[Symbol.dispose]() marks lazy as disposed and prevents further access", () => {
    const lazy = Lazy(() => "scoped");
    expect(lazy.value).toBe("scoped");
    expect(lazy.isDisposed).toBe(false);

    // Manually call dispose (equivalent to `using` declaration exiting scope)
    lazy[Symbol.dispose]();

    expect(lazy.isDisposed).toBe(true);
    expect(() => lazy.value).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task", () => {
  it("run() executes and returns Result", async () => {
    const task = Task(async () => Ok(42));
    const result = await task.run();
    expect(result.unwrap()).toBe(42);
  });

  it("map transforms success", async () => {
    const result = await Task(async () => Ok(21))
      .map(n => n * 2)
      .run();
    expect(result.unwrap()).toBe(42);
  });

  it("mapErr transforms error", async () => {
    const result = await Task(async () => Err("x"))
      .mapErr(e => e.toUpperCase())
      .run();
    expect(result.unwrapErr()).toBe("X");
  });

  it("flatMap chains", async () => {
    const result = await Task(async () => Ok(21))
      .flatMap(n => Task(async () => Ok(n * 2)))
      .run();
    expect(result.unwrap()).toBe(42);
  });

  it("flatMap short-circuits on error", async () => {
    let ran = false;
    const result = await Task(async () => Err("stop"))
      .flatMap(() =>
        Task(async () => {
          ran = true;
          return Ok(99);
        }),
      )
      .run();
    expect(result.isErr).toBe(true);
    expect(ran).toBe(false);
  });

  it("tap runs side-effect on success", async () => {
    let tapped = 0;
    await Task(async () => Ok(42))
      .tap(v => {
        tapped = v;
      })
      .run();
    expect(tapped).toBe(42);
  });

  it("tap does not run on error", async () => {
    let didTap = false;
    await Task(async () => Err("x"))
      .tap(() => {
        didTap = true;
      })
      .run();
    expect(didTap).toBe(false);
  });

  it("tapErr runs side-effect on error", async () => {
    let tapped = "";
    await Task(async () => Err("fail"))
      .tapErr(e => {
        tapped = e;
      })
      .run();
    expect(tapped).toBe("fail");
  });

  it("tapErr does not run on success", async () => {
    let didTap = false;
    await Task(async () => Ok(42))
      .tapErr(() => {
        didTap = true;
      })
      .run();
    expect(didTap).toBe(false);
  });

  it("unwrapOr provides fallback", async () => {
    const okResult = await Task(async () => Ok(42))
      .unwrapOr(0)
      .run();
    expect(okResult.unwrap()).toBe(42);

    const errResult = await Task(async () => Err("x"))
      .unwrapOr(99)
      .run();
    expect(errResult.unwrap()).toBe(99);
  });

  it("runGetOr extracts value or uses fallback", async () => {
    expect(await Task(async () => Ok(42)).runGetOr(0)).toBe(42);
    expect(await Task(async () => Err("x")).runGetOr(99)).toBe(99);
  });

  it("Task.of wraps value", async () => {
    expect((await Task.of(42).run()).unwrap()).toBe(42);
  });

  it("Task.fromResult wraps Result", async () => {
    expect((await Task.fromResult(Ok(42)).run()).unwrap()).toBe(42);
    expect((await Task.fromResult(Err("x")).run()).isErr).toBe(true);
  });

  it("Task.fromPromise catches rejections", async () => {
    const result = await Task.fromPromise(
      () => Promise.reject(new Error("boom")),
      e => e.message,
    ).run();
    expect(result.unwrapErr()).toBe("boom");
  });

  it("Task.all parallel execution", async () => {
    const result = await Task.all([Task.of(1), Task.of(2), Task.of(3)]).run();
    expect(result.unwrap()).toEqual([1, 2, 3]);
  });

  it("Task.all short-circuits", async () => {
    const result = await Task.all([Task.of(1), Task.fromResult(Err("x"))]).run();
    expect(result.isErr).toBe(true);
  });

  it("Task.all with empty array", async () => {
    const result = await Task.all([]).run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("zip runs parallel", async () => {
    const result = await Task.of(1).zip(Task.of(2)).run();
    const [a, b] = result.unwrap();
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it("memoize caches result", async () => {
    let count = 0;
    const task = Task(async () => {
      count++;
      return Ok(42);
    }).memoize();
    const a = await task.run();
    const b = await task.run();
    expect(a.unwrap()).toBe(42);
    expect(b.unwrap()).toBe(42);
    expect(count).toBe(1);
  });

  it("memoize with error", async () => {
    let count = 0;
    const task = Task(async () => {
      count++;
      return Err("fail");
    }).memoize();
    const a = await task.run();
    const b = await task.run();
    expect(a.isErr).toBe(true);
    expect(b.isErr).toBe(true);
    expect(count).toBe(1);
  });

  it("memoize concurrent runs share same promise", async () => {
    let count = 0;
    const task = Task(async () => {
      count++;
      await new Promise(r => setTimeout(r, 10));
      return Ok(count);
    }).memoize();
    const [a, b] = await Promise.all([task.run(), task.run()]);
    expect(a.unwrap()).toBe(1);
    expect(b.unwrap()).toBe(1);
    expect(count).toBe(1);
  });

  it("timeout succeeds before deadline", async () => {
    const task = Task(async () => Ok("fast")).timeout(1000, () => "timeout");
    const result = await task.run();
    expect(result.unwrap()).toBe("fast");
  });

  it("timeout fires error on deadline", async () => {
    const task = Task(async () => {
      await new Promise(r => setTimeout(r, 200));
      return Ok("slow");
    }).timeout(10, () => "timeout");
    const result = await task.run();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("timeout");
  });

  it("retry succeeds on second attempt", async () => {
    let attempt = 0;
    const task = Task(async () => {
      attempt++;
      return attempt < 2 ? Err("fail") : Ok("ok");
    }).retry(3);
    const result = await task.run();
    expect(result.unwrap()).toBe("ok");
    expect(attempt).toBe(2);
  });

  it("retry exhausts attempts", async () => {
    let attempt = 0;
    const task = Task(async () => {
      attempt++;
      return Err(`fail-${attempt}`);
    }).retry(3);
    const result = await task.run();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("fail-3");
    expect(attempt).toBe(3);
  });

  it("Task.race first settled wins", async () => {
    const slow = Task(async () => {
      await new Promise(r => setTimeout(r, 200));
      return Ok("slow");
    });
    const fast = Task(async () => Ok("fast"));
    const result = await Task.race([slow, fast]).run();
    expect(result.unwrap()).toBe("fast");
  });

  it("Task.allSettled collects all", async () => {
    const result = await Task.allSettled([Task.of(1), Task.fromResult(Err("x")), Task.of(3)]).run();
    expect(result.isOk).toBe(true);
    const settled = result.unwrap();
    expect(settled.length).toBe(3);
    expect(settled[0].unwrap()).toBe(1);
    expect(settled[1].isErr).toBe(true);
    expect(settled[2].unwrap()).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════════

describe("Schema", () => {
  it("string/number/boolean", () => {
    expect(Schema.string.parse("hello").isOk).toBe(true);
    expect(Schema.string.parse(42).isErr).toBe(true);
    expect(Schema.number.parse(42).isOk).toBe(true);
    expect(Schema.number.parse(NaN).isErr).toBe(true);
    expect(Schema.boolean.parse(true).isOk).toBe(true);
  });

  it("object validates shape", () => {
    const S = Schema.object({ name: Schema.string, age: Schema.number });
    const result = S.parse({ name: "John Doe", age: 21 });
    expect(result.isOk).toBe(true);
    expect(result.unwrap().name).toBe("John Doe");
  });

  it("object returns validated plain object", () => {
    const S = Schema.object({ name: Schema.string });
    const result = S.parse({ name: "John Doe" });
    expect(result.isOk).toBe(true);
    expect(result.unwrap().name).toBe("John Doe");
  });

  it("object error path", () => {
    const S = Schema.object({ user: Schema.object({ name: Schema.string }) });
    const result = S.parse({ user: { name: 42 } });
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().path).toEqual(["user", "name"]);
  });

  it("object with empty shape", () => {
    const S = Schema.object({});
    const result = S.parse({});
    expect(result.isOk).toBe(true);
  });

  it("object rejects non-objects", () => {
    const S = Schema.object({ name: Schema.string });
    expect(S.parse(null).isErr).toBe(true);
    expect(S.parse([]).isErr).toBe(true);
    expect(S.parse("string").isErr).toBe(true);
  });

  it("array", () => {
    const S = Schema.array(Schema.number);
    const result = S.parse([1, 2, 3]);
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3]);
    expect(S.parse([1, "x"]).isErr).toBe(true);
  });

  it("literal/union", () => {
    const S = Schema.union(Schema.literal("a"), Schema.literal("b"));
    expect(S.parse("a").isOk).toBe(true);
    expect(S.parse("c").isErr).toBe(true);
  });

  it("refine", () => {
    const Port = Schema.number.refine(n => n >= 1 && n <= 65535, "port");
    expect(Port.parse(8080).isOk).toBe(true);
    expect(Port.parse(99999).isErr).toBe(true);
  });

  it("transform", () => {
    const Upper = Schema.string.transform(s => s.toUpperCase());
    expect(Upper.parse("hello").unwrap()).toBe("HELLO");
  });

  it("optional", () => {
    const S = Schema.string.optional();
    expect(S.parse(undefined).isOk).toBe(true);
    expect(S.parse("hello").isOk).toBe(true);
  });

  it("default", () => {
    const S = Schema.number.default(42);
    expect(S.parse(undefined).unwrap()).toBe(42);
    expect(S.parse(null).unwrap()).toBe(42);
    expect(S.parse(10).unwrap()).toBe(10);
  });

  it("is() type guard", () => {
    expect(Schema.string.is("hello")).toBe(true);
    expect(Schema.string.is(42)).toBe(false);
  });

  it("record (string-keyed map)", () => {
    const S = Schema.record(Schema.number);
    const result = S.parse({ a: 1, b: 2 });
    expect(result.isOk).toBe(true);
  });

  it("tuple", () => {
    const S = Schema.tuple(Schema.string, Schema.number);
    const result = S.parse(["hello", 42]);
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual(["hello", 42]);
    expect(S.parse(["hello"]).isErr).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// deepEqual - edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("deepEqual edge cases", () => {
  it("detects different keys with same count", () => {
    const a = Record({ x: 1, y: 2 });
    const b = Record({ x: 1, z: 2 });
    expect(a.equals(b)).toBe(false);
  });

  it("handles nested arrays in equality", () => {
    const a = Record({ data: [1, [2, 3]] });
    const b = Record({ data: [1, [2, 3]] });
    const c = Record({ data: [1, [2, 4]] });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ErrType
// ═══════════════════════════════════════════════════════════════════════════════

describe("ErrType", () => {
  const NotFound = ErrType("NotFound");
  const Forbidden = ErrType("Forbidden");

  it("constructor produces frozen error with correct fields", () => {
    const err = NotFound("User not found", { userId: "u_123" });
    expect(err.tag).toBe("NotFound");
    expect(err.name).toBe("NotFound");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("User not found");
    expect(err.metadata).toEqual({ userId: "u_123" });
    expect(typeof err.timestamp).toBe("number");
    expect(Object.isFrozen(err)).toBe(true);
  });

  it("auto-derives SCREAMING_SNAKE code from PascalCase tag", () => {
    expect(ErrType("RateLimited")("").code).toBe("RATE_LIMITED");
    expect(ErrType("Forbidden")("").code).toBe("FORBIDDEN");
    expect(ErrType("NotFound")("").code).toBe("NOT_FOUND");
    expect(ErrType("DBError")("").code).toBe("DB_ERROR");
  });

  it("accepts explicit code override", () => {
    const Custom = ErrType("DbError", "DB_ERR");
    expect(Custom.code).toBe("DB_ERR");
    expect(Custom("fail").code).toBe("DB_ERR");
  });

  it("tag/name/code match defined values", () => {
    const err = Forbidden("Access denied");
    expect(err.tag).toBe("Forbidden");
    expect(err.name).toBe("Forbidden");
    expect(err.code).toBe("FORBIDDEN");
  });

  it("metadata defaults to empty object when omitted", () => {
    const err = NotFound("gone");
    expect(err.metadata).toEqual({});
    expect(Object.isFrozen(err.metadata)).toBe(true);
  });

  it("metadata is deep frozen", () => {
    const err = NotFound("gone", { nested: { value: 1 } });
    expect(() => {
      err.metadata.nested.value = 2;
    }).toThrow();
  });

  it("timestamp is a recent epoch ms number", () => {
    const before = Date.now();
    const err = NotFound("gone");
    const after = Date.now();
    expect(err.timestamp >= before).toBe(true);
    expect(err.timestamp <= after).toBe(true);
  });

  it("stack is always captured as a string", () => {
    const err = NotFound("gone");
    expect(typeof err.stack).toBe("string");
  });

  it("toJSON() excludes stack, includes all other fields", () => {
    const err = NotFound("User not found", { userId: "u_123" });
    const json = err.toJSON();
    expect(json.tag).toBe("NotFound");
    expect(json.name).toBe("NotFound");
    expect(json.code).toBe("NOT_FOUND");
    expect(json.message).toBe("User not found");
    expect(json.metadata).toEqual({ userId: "u_123" });
    expect(typeof json.timestamp).toBe("number");
    expect("stack" in json).toBe(false);
  });

  it("toString() formats as Tag(CODE): message", () => {
    const err = NotFound("User not found");
    expect(err.toString()).toBe("NotFound(NOT_FOUND): User not found");
  });

  it("toResult() wraps in Err", () => {
    const err = NotFound("gone");
    const result = err.toResult();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe(err);
  });

  it("ErrType.is() returns true for instances", () => {
    const err = NotFound("gone");
    expect(ErrType.is(err)).toBe(true);
  });

  it("ErrType.is() returns false for plain objects/null/primitives", () => {
    expect(ErrType.is(null)).toBe(false);
    expect(ErrType.is(undefined)).toBe(false);
    expect(ErrType.is(42)).toBe(false);
    expect(ErrType.is("string")).toBe(false);
    expect(ErrType.is({ tag: "X" })).toBe(false);
    expect(ErrType.is({ tag: "X", code: "Y", message: "z" })).toBe(false);
  });

  it("Constructor.is() matches specific error type", () => {
    const err = NotFound("gone");
    expect(NotFound.is(err)).toBe(true);
    expect(Forbidden.is(err)).toBe(false);
  });

  it("Constructor.is() rejects non-ErrType values", () => {
    expect(NotFound.is(null)).toBe(false);
    expect(NotFound.is({ tag: "NotFound", code: "NOT_FOUND" })).toBe(false);
  });

  it("Constructor.tag and .code are readable", () => {
    expect(NotFound.tag).toBe("NotFound");
    expect(NotFound.code).toBe("NOT_FOUND");
    expect(Forbidden.tag).toBe("Forbidden");
    expect(Forbidden.code).toBe("FORBIDDEN");
  });

  it("error instance is frozen (property assignment throws)", () => {
    const err = NotFound("gone");
    expect(() => {
      err.tag = "Other";
    }).toThrow();
    expect(() => {
      err.message = "changed";
    }).toThrow();
  });

  it("composes with Result.match()", () => {
    const err = NotFound("gone");
    const result = err.toResult();
    const output = result.match({
      Ok: () => "ok",
      Err: e => `${e.tag}: ${e.message}`,
    });
    expect(output).toBe("NotFound: gone");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Standalone aliases: match, tryCatch
// ═══════════════════════════════════════════════════════════════════════════════

describe("match (standalone)", () => {
  it("matches Result", () => {
    expect(match(Ok(42), { Ok: v => v * 2, Err: () => -1 })).toBe(84);
    expect(match(Err("x"), { Ok: () => 0, Err: e => e })).toBe("x");
  });

  it("matches Option", () => {
    expect(match(Some(42), { Some: v => v * 2, None: () => -1 })).toBe(84);
    expect(match(None, { Some: () => 0, None: () => -1 })).toBe(-1);
  });
});

describe("tryCatch (standalone)", () => {
  it("catches and wraps", () => {
    expect(tryCatch(() => 42).unwrap()).toBe(42);
    expect(
      tryCatch(
        () => {
          throw new Error("boom");
        },
        e => e.message,
      ).unwrapErr(),
    ).toBe("boom");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Program
// ═══════════════════════════════════════════════════════════════════════════════

describe("Program", () => {
  it("execute() returns Ok result from Task", async () => {
    const prog = Program("test-ok", Task.of(42));
    const result = await prog.execute();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toBe(42);
  });

  it("execute() returns Err result from Task", async () => {
    const prog = Program("test-err", Task.fromResult(Err("fail")));
    const result = await prog.execute();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr()).toBe("fail");
  });

  it("execute() accepts effect function", async () => {
    const prog = Program("test-fn", () => Task.of("hello"));
    const result = await prog.execute();
    expect(result.unwrap()).toBe("hello");
  });

  it("execute() passes AbortSignal to effect", async () => {
    const ac = new AbortController();
    const prog = Program("test-signal", signal => Task(async () => Ok(signal.aborted)));

    const before = await prog.execute(ac.signal);
    expect(before.unwrap()).toBe(false);

    ac.abort();
    const after = await prog.execute(ac.signal);
    expect(after.unwrap()).toBe(true);
  });

  it("execute() provides default signal when none given", async () => {
    const prog = Program("test-default-signal", signal =>
      Task(async () => Ok(signal instanceof AbortSignal)),
    );
    const result = await prog.execute();
    expect(result.unwrap()).toBe(true);
  });

  it("execute() can be called multiple times", async () => {
    let count = 0;
    const prog = Program("test-multi", () => Task(async () => Ok(++count)));
    expect((await prog.execute()).unwrap()).toBe(1);
    expect((await prog.execute()).unwrap()).toBe(2);
  });

  it("execute() works with Task pipelines", async () => {
    const prog = Program("test-pipe", () =>
      Task.of(10)
        .map(n => n * 2)
        .flatMap(n => (n > 15 ? Task.of(n) : Task.fromResult(Err("too small")))),
    );
    const result = await prog.execute();
    expect(result.unwrap()).toBe(20);
  });

  it("execute() works with ErrType errors", async () => {
    const AppError = ErrType("AppError");
    const prog = Program("test-errtype", () =>
      Task.fromResult(AppError("something broke").toResult()),
    );
    const result = await prog.execute();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().tag).toBe("AppError");
    expect(result.unwrapErr().message).toBe("something broke");
  });
});

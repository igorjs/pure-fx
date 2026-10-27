// SPDX-License-Identifier: Apache-2.0
/** Result, Option and Task basics. */
export async function run(lib, t) {
  const { Ok, Err, Some, None, Result, Option, Task } = lib;

  t.section("Result");
  const ok = Ok(42);
  t.check(ok.isOk && ok.map(x => x * 2).unwrap() === 84, "Ok.map");
  t.check(ok.flatMap(x => Err(`no ${x}`)).isErr, "Ok.flatMap into Err");
  t.eq(Err("e").unwrapOr(7), 7, "Err.unwrapOr");
  t.eq(
    Err("e")
      .mapErr(e => e.toUpperCase())
      .unwrapErr(),
    "E",
    "Err.mapErr",
  );
  t.check(Result.collect([Ok(1), Err("x")]).isErr, "Result.collect short-circuits");
  t.eq(Result.fromNullable(0, () => "e").unwrap(), 0, "Result.fromNullable keeps 0");

  t.section("Option");
  t.eq(
    Some(10)
      .map(x => x + 5)
      .unwrap(),
    15,
    "Some.map",
  );
  t.check(None.isNone && None.map(() => 1).isNone, "None.map stays None");
  t.eq(None.unwrapOr(9), 9, "None.unwrapOr");
  t.eq(Option.fromNullable(0).unwrap(), 0, "Option.fromNullable keeps 0");

  t.section("Task");
  t.eq(
    (
      await Task.of(5)
        .flatMap(n => Task.of(n * 2))
        .run()
    ).unwrap(),
    10,
    "Task.flatMap",
  );
  t.check((await Task(() => Promise.resolve(Err("f"))).run()).isErr, "Task carries Err");
  t.eq((await Task.all([Task.of(1), Task.of(2)]).run()).unwrap().length, 2, "Task.all");
}

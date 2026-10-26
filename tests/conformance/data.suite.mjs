// SPDX-License-Identifier: Apache-2.0
/** Value equality and produce on arrays and records. */
export async function run(lib, t) {
  const { Record, List, Eq } = lib;

  t.section("equality");
  t.check(Eq.number.equals(1, 1) && !Eq.number.equals(1, 2), "Eq.number");
  t.check(
    Record({ d: new Date(1000) }).equals(Record({ d: new Date(1000) })),
    "Record.equals compares Dates by time",
  );
  t.check(
    !Record({ d: new Date(1000) }).equals(Record({ d: new Date(2000) })),
    "Record.equals tells different Dates apart",
  );
  t.check(
    Record({ m: new Map([["k", { n: 1 }]]) }).equals(Record({ m: new Map([["k", { n: 1 }]]) })),
    "Record.equals compares Maps by contents",
  );
  t.check(
    Record({ s: new Set([1, 2]) }).equals(Record({ s: new Set([2, 1]) })),
    "Record.equals compares Sets by contents",
  );
  t.check(!Record({ d: new Date(1000) }).equals(Record({ d: {} })), "Date is not a plain object");

  t.section("produce");
  t.eq(
    JSON.stringify(
      List([1, 2, 3])
        .produce(d => {
          d.length = 1;
        })
        .toJSON(),
    ),
    "[1]",
    "List.produce honours length truncation",
  );
  t.eq(
    JSON.stringify(
      List([1])
        .produce(d => {
          d.push(2);
        })
        .toJSON(),
    ),
    "[1,2]",
    "List.produce honours push",
  );
  const rec = Record({ items: [1, 2, 3] });
  const next = rec.produce(d => {
    d.items.push(4);
  });
  t.eq(JSON.stringify(next.toJSON().items), "[1,2,3,4]", "Record.produce on a nested array");
  t.eq(JSON.stringify(rec.toJSON().items), "[1,2,3]", "Record.produce leaves the original");
}

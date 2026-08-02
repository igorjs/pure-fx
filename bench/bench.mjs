// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * bench.mjs - Throughput (ops/sec) + memory footprint for hot paths.
 *
 * Zero-dependency: Node perf_hooks + process.memoryUsage. Run memory section
 * accurately with --expose-gc. Benches the compiled dist/.
 *
 *   node --expose-gc bench/bench.mjs
 *
 * New-feature paths (DateTime/Struct/Vec/Dict) only run when those exports
 * exist, so the same file runs against main (core paths only) for comparison.
 */

import { performance } from "node:perf_hooks";
import * as fx from "../dist/index.js";

const { Record, List, Schema, TypeDef } = fx;
const { DateTime, DateTimeValue, Struct, Vec, Dict, Str, Int } = fx; // undefined on main

// ── harness ───────────────────────────────────────────────────────────────

const DURATION_MS = 800;
const WARMUP_MS = 150;
const BATCH = 500;

const fmt = n => Math.round(n).toLocaleString("en-US");

function bench(name, fn) {
  let t = performance.now() + WARMUP_MS;
  while (performance.now() < t) fn();
  let iters = 0;
  const start = performance.now();
  const end = start + DURATION_MS;
  while (performance.now() < end) {
    for (let i = 0; i < BATCH; i++) fn();
    iters += BATCH;
  }
  const secs = (performance.now() - start) / 1000;
  return { name, ops: iters / secs };
}

function memPerItem(name, make, n = 100_000) {
  if (!global.gc) return { name, note: "(run with --expose-gc)" };
  const hold = new Array(n);
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) hold[i] = make(i);
  global.gc();
  const after = process.memoryUsage().heapUsed;
  // subtract the ~8-byte pointer slot the holding array adds per item
  const perItem = (after - before) / n - 8;
  if (hold.length === -1) console.log(hold); // keep alive
  return { name, perItem, n };
}

// ── fixtures ────────────────────────────────────────────────────────────────

const results = [];
const memResults = [];

// Core paths (exist on main too) — sensitive to the isWrappable change.
{
  const recPrim = Record({ a: 1, b: 2, c: 3 });
  const recObj = Record({ nested: { x: 1, y: 2 } });
  const listInt = List([1, 2, 3, 4, 5]);
  const listObj = List([{ x: 1 }, { x: 2 }, { x: 3 }]);

  results.push(bench("Record field get (primitive)", () => recPrim.a));
  results.push(bench("Record field get (object, wrap+cache)", () => recObj.nested.x));
  results.push(bench("Record create (3 keys) + get", () => Record({ a: 1, b: 2 }).a));
  results.push(bench("List index get (int)", () => listInt[2]));
  results.push(bench("List index get (object, wrap+cache)", () => listObj[1].x));
  results.push(bench("List create (5) + map", () => List([1, 2, 3, 4, 5]).map(n => n + 1)));

  memResults.push(memPerItem("Record({a,b,c})", () => Record({ a: 1, b: 2, c: 3 })));
  memResults.push(memPerItem("List([1..5])", () => List([1, 2, 3, 4, 5])));
}

// New-feature paths (branch only).
if (DateTime) {
  const ISO = "2026-05-22T10:00:00.000Z";
  const dtv = DateTimeValue.fromEpochMillis(1_700_000_000_000);
  const dtv2 = DateTimeValue.fromEpochMillis(1_700_000_001_000);

  class UserId extends TypeDef("UserId", Schema.uuid) {}
  class User extends Struct({ id: UserId, name: Str, age: Int }) {}
  const userInput = { id: "550e8400-e29b-41d4-a716-446655440000", name: "Ada", age: 30 };

  const Ints10 = Vec(Int);
  const arr10 = Array.from({ length: 10 }, (_, i) => i);
  const Headers = Dict(Str, Str);
  const obj10 = Object.fromEntries(arr10.map(i => [`k${i}`, `v${i}`]));

  results.push(bench("DateTime.parse(ISO string)", () => DateTime.parse(ISO)));
  results.push(bench("DateTime.parse(epoch millis)", () => DateTime.parse(1_700_000_000_000)));
  results.push(bench("DateTimeValue.fromEpochMillis", () => DateTimeValue.fromEpochMillis(1_700_000_000_000)));
  results.push(bench("DateTimeValue.toISO", () => dtv.toISO()));
  results.push(bench("DateTimeValue.toDate", () => dtv.toDate()));
  results.push(bench("DateTimeValue.toTemporal (absent)", () => dtv.toTemporal()));
  results.push(bench("DateTimeValue.compare", () => dtv.compare(dtv2)));
  results.push(bench("Struct.parse (3 fields)", () => User.parse(userInput)));
  results.push(bench("Vec(Int).parse (len 10)", () => Ints10.parse(arr10)));
  results.push(bench("Dict(Str,Str).parse (10 keys)", () => Headers.parse(obj10)));

  memResults.push(memPerItem("DateTimeValue", i => DateTimeValue.fromEpochMillis(1_700_000_000_000 + i)));
  memResults.push(
    memPerItem("Struct.parse result", () => {
      const r = User.parse(userInput);
      return r.isOk ? r.value : null;
    }),
  );
  memResults.push(
    memPerItem("Vec(Int).parse(len 10) result", () => {
      const r = Ints10.parse(arr10);
      return r.isOk ? r.value : null;
    }),
  );
}

// ── report ────────────────────────────────────────────────────────────────

const label = DateTime ? "feat/v0.2.0 (DateTime present)" : "main (core only)";
const pad = Math.max(...results.map(r => r.name.length));
console.log(`\n=== Throughput — ${label} ===`);
console.log(`${"hot path".padEnd(pad)}   ops/sec`);
console.log("-".repeat(pad + 14));
for (const r of results) console.log(`${r.name.padEnd(pad)}   ${fmt(r.ops).padStart(11)}`);

console.log(`\n=== Memory (retained bytes/item) ===`);
for (const m of memResults) {
  if (m.note) console.log(`${m.name}: ${m.note}`);
  else console.log(`${m.name.padEnd(pad)}   ${fmt(m.perItem).padStart(6)} B/item  (n=${m.n})`);
}
console.log("");

// Emit machine-readable line for cross-branch diffing.
console.log(
  `JSON ${JSON.stringify(Object.fromEntries(results.map(r => [r.name, Math.round(r.ops)])))}`,
);

// SPDX-License-Identifier: Apache-2.0
/** Run every conformance suite against `lib` and return the combined totals. */
import { run as runAsync } from "./async.suite.mjs";
import { run as runCore } from "./core.suite.mjs";
import { run as runData } from "./data.suite.mjs";
import { createT } from "./harness.mjs";
import { run as runIo } from "./io.suite.mjs";
import { run as runServer } from "./server.suite.mjs";

const SUITES = [
  ["core", runCore],
  ["data", runData],
  ["async", runAsync],
  ["io", runIo],
  ["server", runServer],
];

export const runSuites = async (lib, env) => {
  const t = createT(env);
  for (const [name, run] of SUITES) {
    try {
      await run(lib, t);
    } catch (err) {
      t.section(name);
      t.fail(`suite threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return t.report();
};

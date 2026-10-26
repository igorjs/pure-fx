// SPDX-License-Identifier: Apache-2.0
/**
 * Tiny assert/report helper shared by the conformance suites. It has no
 * dependencies so the same code runs on Node, Bun and Workers.
 *
 * `env` describes what the lane can do: `runtime`, and on Node and Bun the
 * helpers `serve` and `rawRequest` plus `spawn: true`.
 */
export const createT = env => {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const logs = [];
  let group = "";

  const record = (ok, message) => {
    if (ok) passed++;
    else {
      failed++;
      logs.push(`FAIL ${group}: ${message}`);
    }
  };

  return {
    env,
    section(name) {
      group = name;
    },
    check(condition, message) {
      record(Boolean(condition), message);
    },
    eq(actual, expected, message) {
      const ok = Object.is(actual, expected);
      record(ok, ok ? message : `${message} (got ${String(actual)}, want ${String(expected)})`);
    },
    skip(message, reason) {
      skipped++;
      logs.push(`SKIP ${group}: ${message} (${reason})`);
    },
    fail(message) {
      record(false, message);
    },
    report() {
      return { passed, failed, skipped, logs };
    },
  };
};

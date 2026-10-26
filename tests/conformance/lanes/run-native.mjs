// SPDX-License-Identifier: Apache-2.0
/** Conformance lane entry for Node and Bun. Prints a CONFORMANCE_RESULT line. */

import { runSuites } from "../run-suites.mjs";
import { nativeEnv } from "./native-env.mjs";

const runtime = typeof globalThis.Bun === "undefined" ? "node" : "bun";
const lib = await import("../../../dist/index.js");
const adapter =
  runtime === "bun" ? (await import("../../../dist/runtime/adapter/bun.js")).bunAdapter : undefined;

const { passed, failed, skipped, logs } = await runSuites(lib, nativeEnv(runtime, adapter));
for (const line of logs) process.stdout.write(`${line}\n`);
process.stdout.write(`CONFORMANCE_RESULT ${JSON.stringify({ passed, failed, skipped })}\n`);
process.exit(failed > 0 ? 1 : 0);

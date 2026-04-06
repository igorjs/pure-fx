/**
 * parallel-programs.js
 *
 * Demonstrates running two servers and a background worker concurrently.
 * All share one AbortSignal: Ctrl+C gracefully shuts down everything.
 *
 * Run: node examples/parallel-programs.js
 * Stop: Ctrl+C
 *
 * Test:
 *   curl http://localhost:3000/health
 *   curl http://localhost:3001/metrics
 */

import { Program, Task, Ok, Server, json } from "../dist/index.js";

// ── Server 1: Public API on port 3000 ───────────────────────────────────────

const publicApi = Server("public-api")
  .get("/health", () => json({ status: "ok" }))
  .get("/users", () => json([{ id: 1, name: "Alice" }]));

// ── Server 2: Admin API on port 3001 ────────────────────────────────────────

const adminApi = Server("admin-api")
  .get("/metrics", () =>
    json({
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
    }),
  )
  .get("/health", () => json({ status: "ok", role: "admin" }));

// ── Background worker ───────────────────────────────────────────────────────

const worker = (signal) =>
  Task(async () => {
    let tick = 0;
    while (!signal.aborted) {
      tick++;
      console.log(`  [worker] tick ${tick}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    console.log(`  [worker] stopped after ${tick} ticks`);
    return Ok(undefined);
  });

// ── Compose and run ─────────────────────────────────────────────────────────

Program("my-app", (signal) =>
  Task.all([
    publicApi.serve({ port: 3000, signal }),
    adminApi.serve({ port: 3001, signal }),
    worker(signal),
  ]),
).run();

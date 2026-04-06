/**
 * parallel-programs.js
 *
 * Demonstrates running two programs concurrently under a single lifecycle.
 * Both share one AbortSignal: Ctrl+C gracefully shuts down both.
 *
 * Run: node examples/parallel-programs.js
 * Stop: Ctrl+C (both programs shut down together)
 */

import { Program, Task, Ok, Err, Duration, Server, json } from "../dist/index.js";

// ── Program 1: HTTP Server ──────────────────────────────────────────────────

const httpServer = (signal) => {
  const app = Server("api")
    .get("/health", () => json({ status: "ok", uptime: process.uptime() }))
    .get("/time", () => json({ time: new Date().toISOString() }));

  // Server.listen() returns a Program, but we need a Task for Program.all.
  // Use the server's fetch handler with a manual listener instead.
  return Task(async () => {
    const http = await import("node:http");

    const server = http.createServer(async (req, res) => {
      const url = `http://localhost:3000${req.url}`;
      const request = new Request(url, { method: req.method });
      const response = await app.fetch(request);

      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    });

    await new Promise((resolve) => {
      server.listen(3000, () => {
        console.log("  HTTP server listening on http://localhost:3000");
      });

      signal.addEventListener("abort", () => {
        server.close(() => resolve(undefined));
      });
    });

    return Ok(undefined);
  });
};

// ── Program 2: Background Worker ────────────────────────────────────────────

const backgroundWorker = (signal) =>
  Task(async () => {
    let tick = 0;

    while (!signal.aborted) {
      tick++;
      console.log(`  [worker] tick ${tick} - processing jobs...`);

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`  [worker] shutting down after ${tick} ticks`);
    return Ok(undefined);
  });

// ── Run Both Concurrently ───────────────────────────────────────────────────

Program.all(
  "my-app",
  [
    { name: "api", effect: httpServer },
    { name: "worker", effect: backgroundWorker },
  ],
  { teardownTimeoutMs: 5000 },
).run();

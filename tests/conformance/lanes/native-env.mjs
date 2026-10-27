// SPDX-License-Identifier: Apache-2.0
/** Lane environment for Node and Bun: real sockets and child processes. */
import { connect, createServer } from "node:net";

const HOST = "127.0.0.1";
const CLIENT_TIMEOUT_MS = 3000;
const SETTLE_MS = 40;
const MAX_READY_ATTEMPTS = 50;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The adapter cannot report its bound port, so reserve a free one first. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Send raw bytes and resolve with the parsed status line and body. */
const rawRequest = (port, text) =>
  new Promise((resolve, reject) => {
    const socket = connect(port, HOST);
    const chunks = [];
    socket.setTimeout(CLIENT_TIMEOUT_MS, () => socket.destroy(new Error("raw request timed out")));
    socket.on("data", chunk => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const status = Number(raw.split(" ")[1]);
      resolve({ status, body: raw.slice(raw.indexOf("\r\n\r\n") + 4) });
    });
    socket.write(text);
  });

const waitUntilReady = async baseUrl => {
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(`${baseUrl}/ready`, { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
      return;
    } catch (err) {
      if (attempt > MAX_READY_ATTEMPTS) throw err;
      await sleep(SETTLE_MS);
    }
  }
};

export const nativeEnv = (runtime, adapter) => ({
  runtime,
  spawn: true,
  rawRequest,
  async serve(app, options) {
    const port = await freePort();
    const controller = new AbortController();
    const served = app
      .serve({ port, hostname: HOST, signal: controller.signal, ...options }, adapter)
      .run();
    const baseUrl = `http://${HOST}:${port}`;
    await waitUntilReady(baseUrl);
    return {
      send: (path, init) =>
        fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) }),
      rawGet: (path, ...headerLines) =>
        rawRequest(
          port,
          [`GET ${path} HTTP/1.1`, ...headerLines, "Connection: close", "", ""].join("\r\n"),
        ),
      close: async () => {
        controller.abort();
        await served;
      },
    };
  },
});

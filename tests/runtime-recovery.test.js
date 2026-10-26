// SPDX-License-Identifier: Apache-2.0
/**
 * runtime-recovery.test.js - Os detection on runtimes without
 * process.getBuiltinModule, and Workers request metadata on bodied requests.
 *
 * Tests the compiled dist/ output (black-box).
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@igorjs/pure-test";

const { toWorkersHandler } = await import("../dist/runtime/adapter/workers.js");

const distUrl = path => new URL(`../dist/${path}`, import.meta.url).href;

describe("Os without process.getBuiltinModule", () => {
  it("recovers the real node:os adapter once the async require settles", () => {
    // Arrange
    const script = `
      process.getBuiltinModule = undefined;
      const { Os } = await import(${JSON.stringify(distUrl("runtime/os.js"))});
      Os.hostname();
      await new Promise(resolve => setTimeout(resolve, 50));
      console.log(JSON.stringify({ some: Os.hostname().isSome, platform: Os.platform() }));
    `;

    // Act
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });

    // Assert
    const result = JSON.parse(stdout.trim());
    expect(result.some).toBe(true);
    expect(result.platform).not.toBe("unknown");
  });
});

describe("toWorkersHandler request metadata", () => {
  const capture = async (method, body, mutate) => {
    let seen;
    const handler = toWorkersHandler({
      fetch: async req => {
        seen = req;
        await req.text();
        return new Response("ok");
      },
    });
    const controller = new AbortController();
    const request = new Request("http://example.test/x", {
      method,
      body,
      signal: controller.signal,
    });
    request.cf = { country: "BR" };
    mutate?.(controller);
    await handler.fetch(
      request,
      {},
      { waitUntil: () => undefined, passThroughException: () => undefined },
    );
    return seen;
  };

  for (const method of ["POST", "PUT", "PATCH"]) {
    it(`keeps cf on a ${method} request with a body`, async () => {
      // Arrange / Act
      const seen = await capture(method, "hello");

      // Assert
      expect(seen.cf).toEqual({ country: "BR" });
    });

    it(`propagates an abort on a ${method} request with a body`, async () => {
      // Arrange / Act
      const seen = await capture(method, "hello", c => c.abort());

      // Assert
      expect(seen.signal.aborted).toBe(true);
    });
  }
});

// SPDX-License-Identifier: Apache-2.0
/**
 * smoke-install.test.mjs - Unit tests for the post-release smoke helpers and
 * an integration run of the script against a locally packed tarball.
 *
 * The Bun and Workers lanes run when `bun` is on PATH and `miniflare`
 * resolves. When one is missing the lane fails under CI and is skipped
 * (with a logged reason) elsewhere.
 *
 * Run: pnpm test
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "@igorjs/pure-test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(projectRoot, "scripts", "smoke-install.mjs");
const { publicSubpaths, waitForVersion } = await import(pathToFileURL(scriptPath).href);

const PACKAGE_NAME = "@igorjs/pure-fx";
const VERSION = "9.9.9";
const NOT_FOUND = { status: 404 };
const FOUND = { status: 200 };
const POLL_TIMEOUT_MS = 1_000;
const POLL_INTERVAL_MS = 100;
const SCRIPT_TIMEOUT_MS = 180_000;

const exportsMap = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).exports;

function hasBinary(name) {
  return spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0;
}

function hasMiniflare() {
  try {
    createRequire(import.meta.url).resolve("miniflare");
    return true;
  } catch {
    return false;
  }
}

/** Runs `body` when `available`; otherwise fails under CI and skips with a reason elsewhere. */
function laneOrSkip(name, available, body) {
  if (available) return body();
  if (process.env.CI) throw new Error(`${name} lane unavailable in CI`);
  process.stderr.write(`skip: ${name} lane unavailable on this machine\n`);
}

function runSmoke(runtime, args) {
  return spawnSync(runtime, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: SCRIPT_TIMEOUT_MS,
  });
}

describe("publicSubpaths", () => {
  it("lists every importable subpath and skips type-only entries", () => {
    // Arrange
    const map = {
      ".": { types: "./a.d.ts", import: "./a.js" },
      "./runtime": { types: "./b.d.ts", import: "./b.js" },
      "./types-only": { types: "./c.d.ts" },
      "./package.json": "./package.json",
    };

    // Act
    const subpaths = publicSubpaths(map);

    // Assert
    expect(subpaths).toEqual([PACKAGE_NAME, `${PACKAGE_NAME}/runtime`]);
  });

  it("covers the real exports map", () => {
    // Arrange
    const expected = Object.keys(exportsMap).length;

    // Act
    const subpaths = publicSubpaths(exportsMap);

    // Assert
    expect(subpaths.length).toBe(expected);
    expect(subpaths).toContain(PACKAGE_NAME);
    expect(subpaths).toContain(`${PACKAGE_NAME}/runtime`);
    expect(subpaths).toContain(`${PACKAGE_NAME}/runtime/adapter/node`);
  });
});

describe("waitForVersion", () => {
  it("resolves once the registry answers 200 after two 404s", async () => {
    // Arrange
    const answers = [NOT_FOUND, NOT_FOUND, FOUND];
    const fetch = async () => answers.shift();
    let sleeps = 0;
    const sleep = async () => {
      sleeps += 1;
    };

    // Act
    await waitForVersion({
      fetch,
      url: "https://registry.test/pkg/9.9.9",
      timeoutMs: POLL_TIMEOUT_MS,
      intervalMs: POLL_INTERVAL_MS,
      sleep,
    });

    // Assert
    expect(answers.length).toBe(0);
    expect(sleeps).toBe(2);
  });

  it("rejects naming the version and the waited time when it never appears", async () => {
    // Arrange
    const fetch = async () => NOT_FOUND;
    const sleep = async () => undefined;
    let message = "";

    // Act
    try {
      await waitForVersion({
        fetch,
        url: `https://registry.test/pkg/${VERSION}`,
        timeoutMs: POLL_TIMEOUT_MS,
        intervalMs: POLL_INTERVAL_MS,
        sleep,
      });
    } catch (error) {
      message = error.message;
    }

    // Assert
    expect(message).toContain(VERSION);
    expect(message).toContain(String(POLL_TIMEOUT_MS));
  });
});

describe("smoke-install script", () => {
  let tmp = "";
  let tarball = "";

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "smoke-install-test-"));
    execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", tmp], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    tarball = join(
      tmp,
      readdirSync(tmp).find(name => name.endsWith(".tgz")),
    );
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("imports every public subpath from a packed tarball on Node", () => {
    // Arrange
    const args = ["--tarball", tarball];

    // Act
    const result = runSmoke(process.execPath, args);

    // Assert
    expect(result.status).toBe(0);
  });

  it("imports every public subpath from a packed tarball on Bun", () => {
    laneOrSkip("bun", hasBinary("bun"), () => {
      // Arrange
      const args = ["--tarball", tarball];

      // Act
      const result = runSmoke("bun", args);

      // Assert
      expect(result.status).toBe(0);
    });
  });

  it("runs the core entry inside Miniflare", () => {
    laneOrSkip("workers", hasMiniflare(), () => {
      // Arrange
      const args = ["--tarball", tarball, "--workers"];

      // Act
      const result = runSmoke(process.execPath, args);

      // Assert
      expect(result.status).toBe(0);
    });
  });

  it("exits 1 naming the cause when the tarball is missing", () => {
    // Arrange
    const args = ["--tarball", join(tmp, "missing.tgz")];

    // Act
    const result = runSmoke(process.execPath, args);

    // Assert
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing.tgz");
  });
});

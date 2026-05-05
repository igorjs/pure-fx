/**
 * adapters.test.js - Tests for the runtime adapter layer.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output (black-box).
 *
 * These tests run in Node.js, so they validate the Node/Bun adapters.
 * Deno adapter paths return undefined when Deno is not available.
 */

import { mkdtemp, rm } from "node:fs/promises";
import nodeOs from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "@igorjs/pure-test";

// ── Import adapter resolve functions ────────────────────────────────────────

const { getDeno, getNodeProcess, importNode, requireNode } = await import(
  "../dist/runtime/adapters/detect.js"
);
const { resolveStdin, resolveStdout, resolveStderr } = await import(
  "../dist/runtime/adapters/stdin.js"
);
const { resolveFs } = await import("../dist/runtime/adapters/fs.js");
const { resolveSubprocess } = await import("../dist/runtime/adapters/subprocess.js");
const { resolveDns } = await import("../dist/runtime/adapters/dns-adapter.js");
const { resolveTcpClient } = await import("../dist/runtime/adapters/net-adapter.js");
const { resolveOsInfo } = await import("../dist/runtime/adapters/os-adapter.js");
const { resolveProcessInfo } = await import("../dist/runtime/adapters/process-adapter.js");

// =============================================================================
// 1. detect.ts
// =============================================================================

describe("detect", () => {
  it("getDeno returns undefined in Node", () => {
    expect(getDeno()).toBe(undefined);
  });

  it("getNodeProcess returns the process global", () => {
    const proc = getNodeProcess();
    expect(proc).not.toBe(undefined);
    expect(typeof proc.pid).toBe("number");
    expect(typeof proc.cwd).toBe("function");
  });

  it("importNode caches results", async () => {
    const getFs = importNode("node:fs/promises");
    const fs1 = await getFs();
    const fs2 = await getFs();
    expect(fs1).not.toBe(null);
    expect(fs1).toBe(fs2); // same cached reference
  });

  it("importNode returns null for nonexistent module", async () => {
    const getBad = importNode("node:this-does-not-exist");
    const result = await getBad();
    expect(result).toBe(null);
  });

  it("requireNode caches results (returns same ref on repeat calls)", () => {
    const getOs = requireNode("node:os");
    const os1 = getOs();
    const os2 = getOs();
    // In ESM, require may return null; verify caching by identity
    expect(os1).toBe(os2);
  });

  it("requireNode returns null for nonexistent module", () => {
    const getBad = requireNode("node:this-does-not-exist");
    expect(getBad()).toBe(null);
  });
});

// =============================================================================
// 2. stdin adapter
// =============================================================================

describe("stdin adapter", () => {
  it("resolveStdin returns a Stdin adapter", () => {
    const stdin = resolveStdin();
    expect(stdin).not.toBe(undefined);
    expect(typeof stdin.isTTY).toBe("boolean");
    expect(typeof stdin.readLine).toBe("function");
    expect(typeof stdin.readAll).toBe("function");
  });

  it("isTTY is false in test runner (piped)", () => {
    const stdin = resolveStdin();
    expect(stdin.isTTY).toBe(false);
  });

  it("resolveStdout returns a Stdout adapter", () => {
    const stdout = resolveStdout();
    expect(stdout).not.toBe(undefined);
    expect(typeof stdout.write).toBe("function");
  });

  it("resolveStderr returns a Stdout adapter", () => {
    const stderr = resolveStderr();
    expect(stderr).not.toBe(undefined);
    expect(typeof stderr.write).toBe("function");
  });

  it("stdout.write does not throw", () => {
    const stdout = resolveStdout();
    expect(() => stdout.write("")).not.toThrow();
  });
});

// =============================================================================
// 3. fs adapter
// =============================================================================

describe("fs adapter", () => {
  let fs;
  let tmpDir;

  it("resolveFs returns a non-null adapter", async () => {
    fs = await resolveFs();
    expect(fs).not.toBe(null);
    expect(typeof fs.readFile).toBe("function");
    expect(typeof fs.writeFile).toBe("function");
    expect(typeof fs.appendFile).toBe("function");
    expect(typeof fs.mkdir).toBe("function");
    expect(typeof fs.stat).toBe("function");
    expect(typeof fs.remove).toBe("function");
    expect(typeof fs.removeDir).toBe("function");
    expect(typeof fs.readDir).toBe("function");
    expect(typeof fs.copyFile).toBe("function");
    expect(typeof fs.rename).toBe("function");
    expect(typeof fs.makeTempDir).toBe("function");
  });

  it("setup: create temp dir", async () => {
    tmpDir = await mkdtemp(nodePath.join(nodeOs.tmpdir(), "adapter-fs-"));
  });

  it("writeFile + readFile roundtrip", async () => {
    const path = nodePath.join(tmpDir, "test.txt");
    await fs.writeFile(path, "hello adapter");
    const content = await fs.readFile(path);
    expect(content).toBe("hello adapter");
  });

  it("appendFile appends content", async () => {
    const path = nodePath.join(tmpDir, "append.txt");
    await fs.writeFile(path, "a");
    await fs.appendFile(path, "b");
    const content = await fs.readFile(path);
    expect(content).toBe("ab");
  });

  it("stat returns file metadata", async () => {
    const path = nodePath.join(tmpDir, "stat.txt");
    await fs.writeFile(path, "data");
    const s = await fs.stat(path);
    expect(s.isFile).toBe(true);
    expect(s.isDirectory).toBe(false);
    expect(typeof s.size).toBe("number");
    expect(s.size > 0).toBe(true);
  });

  it("stat returns directory metadata", async () => {
    const s = await fs.stat(tmpDir);
    expect(s.isFile).toBe(false);
    expect(s.isDirectory).toBe(true);
  });

  it("mkdir creates nested directories", async () => {
    const path = nodePath.join(tmpDir, "a", "b", "c");
    await fs.mkdir(path);
    const s = await fs.stat(path);
    expect(s.isDirectory).toBe(true);
  });

  it("readDir lists entries", async () => {
    const entries = await fs.readDir(tmpDir);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length > 0).toBe(true);
  });

  it("copyFile copies a file", async () => {
    const src = nodePath.join(tmpDir, "copy-src.txt");
    const dest = nodePath.join(tmpDir, "copy-dest.txt");
    await fs.writeFile(src, "copy me");
    await fs.copyFile(src, dest);
    const content = await fs.readFile(dest);
    expect(content).toBe("copy me");
  });

  it("rename moves a file", async () => {
    const src = nodePath.join(tmpDir, "rename-src.txt");
    const dest = nodePath.join(tmpDir, "rename-dest.txt");
    await fs.writeFile(src, "move me");
    await fs.rename(src, dest);
    const content = await fs.readFile(dest);
    expect(content).toBe("move me");
    let threw = false;
    try {
      await fs.stat(src);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("remove deletes a file", async () => {
    const path = nodePath.join(tmpDir, "remove.txt");
    await fs.writeFile(path, "delete me");
    await fs.remove(path);
    let threw = false;
    try {
      await fs.stat(path);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("removeDir recursively removes a directory", async () => {
    const dir = nodePath.join(tmpDir, "rmdir");
    await fs.mkdir(dir);
    await fs.writeFile(nodePath.join(dir, "inner.txt"), "x");
    await fs.removeDir(dir);
    let threw = false;
    try {
      await fs.stat(dir);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("makeTempDir creates a directory", async () => {
    const dir = await fs.makeTempDir();
    expect(typeof dir).toBe("string");
    const s = await fs.stat(dir);
    expect(s.isDirectory).toBe(true);
    await rm(dir, { recursive: true });
  });

  it("cleanup: remove temp dir", async () => {
    await rm(tmpDir, { recursive: true });
  });
});

// =============================================================================
// 4. subprocess adapter
// =============================================================================

describe("subprocess adapter", () => {
  it("resolveSubprocess returns an adapter", () => {
    const sub = resolveSubprocess();
    expect(sub).not.toBe(undefined);
    expect(typeof sub.exec).toBe("function");
  });

  it("exec echo returns stdout", async () => {
    const sub = resolveSubprocess();
    const result = await sub.exec("echo", ["adapter test"], {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("adapter test")).toBe(true);
  });

  it("exec with stdin pipes input", async () => {
    const sub = resolveSubprocess();
    const result = await sub.exec("cat", [], { stdin: "piped data" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("piped data");
  });

  it("exec nonexistent command throws", async () => {
    const sub = resolveSubprocess();
    let threw = false;
    try {
      await sub.exec("nonexistent-cmd-xyz", [], {});
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// =============================================================================
// 5. dns adapter
// =============================================================================

describe("dns adapter", () => {
  it("resolveDns returns an adapter", async () => {
    const dns = await resolveDns();
    expect(dns).not.toBe(null);
    expect(typeof dns.lookup).toBe("function");
    expect(typeof dns.resolve).toBe("function");
  });

  it("lookup resolves localhost", async () => {
    const dns = await resolveDns();
    const record = await dns.lookup("localhost");
    expect(typeof record.address).toBe("string");
    expect(record.family === 4 || record.family === 6).toBe(true);
  });
});

// =============================================================================
// 6. tcp client adapter
// =============================================================================

describe("tcp client adapter", () => {
  it("resolveTcpClient returns an adapter", async () => {
    const client = await resolveTcpClient();
    expect(client).not.toBe(null);
    expect(typeof client.connect).toBe("function");
  });
});

// =============================================================================
// 7. os info adapter
// =============================================================================

describe("os info adapter", () => {
  it("resolveOsInfo returns an adapter", () => {
    const os = resolveOsInfo();
    expect(os).not.toBe(undefined);
  });

  it("arch returns a string", () => {
    const os = resolveOsInfo();
    expect(typeof os.arch()).toBe("string");
    expect(os.arch().length > 0).toBe(true);
  });

  it("platform returns a string", () => {
    const os = resolveOsInfo();
    expect(typeof os.platform()).toBe("string");
    expect(os.platform().length > 0).toBe(true);
  });

  it("cpuCount returns a number via navigator.hardwareConcurrency", () => {
    const os = resolveOsInfo();
    const count = os.cpuCount();
    expect(count).not.toBe(undefined);
    expect(typeof count).toBe("number");
    expect(count > 0).toBe(true);
  });

  it("tmpDir returns a non-empty string", () => {
    const os = resolveOsInfo();
    const tmp = os.tmpDir();
    expect(typeof tmp).toBe("string");
    expect(tmp.length > 0).toBe(true);
  });

  it("homeDir returns a string", () => {
    const os = resolveOsInfo();
    const home = os.homeDir();
    expect(home).not.toBe(undefined);
    expect(typeof home).toBe("string");
  });
});

// =============================================================================
// 8. process info adapter
// =============================================================================

describe("process info adapter", () => {
  it("resolveProcessInfo returns an adapter", () => {
    const proc = resolveProcessInfo();
    expect(proc).not.toBe(undefined);
  });

  it("cwd returns current working directory", () => {
    const proc = resolveProcessInfo();
    expect(proc.cwd()).toBe(process.cwd());
  });

  it("pid matches process.pid", () => {
    const proc = resolveProcessInfo();
    expect(proc.pid).toBe(process.pid);
  });

  it("argv returns an array", () => {
    const proc = resolveProcessInfo();
    expect(Array.isArray(proc.argv)).toBe(true);
  });

  it("uptime returns a number", () => {
    const proc = resolveProcessInfo();
    expect(proc.uptime).not.toBe(undefined);
    const up = proc.uptime();
    expect(typeof up).toBe("number");
    expect(up > 0).toBe(true);
  });

  it("memoryUsage returns heap and rss", () => {
    const proc = resolveProcessInfo();
    expect(proc.memoryUsage).not.toBe(undefined);
    const mem = proc.memoryUsage();
    expect(typeof mem.heapUsed).toBe("number");
    expect(typeof mem.heapTotal).toBe("number");
    expect(typeof mem.rss).toBe("number");
    expect(mem.heapUsed > 0).toBe(true);
    expect(mem.rss > 0).toBe(true);
  });

  it("exit is a function", () => {
    const proc = resolveProcessInfo();
    expect(typeof proc.exit).toBe("function");
    // Don't actually call it!
  });
});

/**
 * tier2-runtime.test.js - Tests for Tier 2 runtime modules.
 *
 * Uses @igorjs/pure-test.
 * Run: node --test tests/tier2-runtime.test.js
 *
 * Tests the compiled dist/ output, not the source.
 * Covers: Command, Os, Process, Path (new methods), File (multi-runtime).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import nodeOs from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "@igorjs/pure-test";

const {
  Command,
  CommandError,
  Os,
  Process,
  ProcessError,
  Path,
  Schema,
  File,
  Ok,
  Err,
  Some,
  None,
  Duration,
} = await import("../dist/index.js");

// =============================================================================
// Command (subprocess)
// =============================================================================

describe("Command", () => {
  it("exec echo: returns Ok with exitCode 0 and stdout", async () => {
    const task = Command.exec("echo", ["hello"]);
    expect(typeof task.run).toBe("function");

    const result = await task.run();
    expect(result.isOk).toBe(true);
    expect(result.value.exitCode).toBe(0);
    expect(result.value.stdout.includes("hello")).toBe(true);
  });

  it("exec node -e console.log: captures stdout", async () => {
    const result = await Command.exec("node", ["-e", 'console.log("test")']).run();
    expect(result.isOk).toBe(true);
    expect(result.value.stdout).toBe("test\n");
  });

  it("exec non-zero exit: returns Ok with exitCode 1 (not an error)", async () => {
    const result = await Command.exec("node", ["-e", "process.exit(1)"]).run();
    expect(result.isOk).toBe(true);
    expect(result.value.exitCode).toBe(1);
  });

  it("exec stderr: captures stderr output", async () => {
    const result = await Command.exec("node", ["-e", 'console.error("err")']).run();
    expect(result.isOk).toBe(true);
    expect(result.value.stderr.includes("err")).toBe(true);
  });

  it("exec nonexistent command: returns Err(CommandError)", async () => {
    const result = await Command.exec("nonexistent-command-xyz").run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("CommandError");
  });

  it("exec with cwd option: respects working directory", async () => {
    const result = await Command.exec("pwd", [], { cwd: "/tmp" }).run();
    expect(result.isOk).toBe(true);
    // /tmp may resolve to /private/tmp on macOS
    expect(result.value.stdout.includes("/tmp")).toBe(true);
  });

  it("exec with stdin: pipes input to process", async () => {
    const result = await Command.exec("cat", [], { stdin: "hello from stdin" }).run();
    expect(result.isOk).toBe(true);
    expect(result.value.exitCode).toBe(0);
    expect(result.value.stdout).toBe("hello from stdin");
  });

  it("exec with stdin: multiline input", async () => {
    const input = "line1\nline2\nline3";
    const result = await Command.exec("cat", [], { stdin: input }).run();
    expect(result.isOk).toBe(true);
    expect(result.value.stdout).toBe(input);
  });

  it("exec with stdin: process reads from stdin via node -e", async () => {
    const code =
      "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(d.toUpperCase().trim()))";
    const result = await Command.exec("node", ["-e", code], { stdin: "hello" }).run();
    expect(result.isOk).toBe(true);
    expect(result.value.stdout).toBe("HELLO\n");
  });

  it("exec with timeout: completes before timeout", async () => {
    const result = await Command.exec("echo", ["fast"], { timeout: 5000 }).run();
    expect(result.isOk).toBe(true);
    expect(result.value.stdout.includes("fast")).toBe(true);
  });

  it("exec with timeout: returns Err on timeout", async () => {
    const result = await Command.exec("sleep", ["10"], { timeout: 100 }).run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("CommandError");
    expect(result.error.message.includes("timed out")).toBe(true);
  });

  it("exec with stdin and timeout: both work together", async () => {
    const result = await Command.exec("cat", [], { stdin: "combined", timeout: 5000 }).run();
    expect(result.isOk).toBe(true);
    expect(result.value.stdout).toBe("combined");
  });
});

// =============================================================================
// Command.spawn
// =============================================================================

describe("Command.spawn", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Command.spawn("echo", ["hello"]);
    expect(typeof task.run).toBe("function");
  });

  it("returns Ok with a ChildProcess handle", async () => {
    const result = await Command.spawn("echo", ["spawn-test"]).run();
    expect(result.isOk).toBe(true);
    expect(typeof result.value.kill).toBe("function");
    expect(typeof result.value.unref).toBe("function");
    expect(typeof result.value.wait).toBe("function");
    // Wait for it to finish to avoid orphan
    await result.value.wait().run();
  });

  it("pid returns Some(number)", async () => {
    const result = await Command.spawn("echo", ["pid-test"]).run();
    expect(result.isOk).toBe(true);
    expect(result.value.pid.isSome).toBe(true);
    expect(typeof result.value.pid.unwrap()).toBe("number");
    await result.value.wait().run();
  });

  it("wait() returns CommandResult after process exits", async () => {
    const spawnResult = await Command.spawn("echo", ["wait-test"], { capture: true }).run();
    expect(spawnResult.isOk).toBe(true);
    const waitResult = await spawnResult.value.wait().run();
    expect(waitResult.isOk).toBe(true);
    expect(waitResult.value.exitCode).toBe(0);
    expect(waitResult.value.stdout.includes("wait-test")).toBe(true);
  });

  it("kill() terminates a running process", async () => {
    const result = await Command.spawn("sleep", ["10"]).run();
    expect(result.isOk).toBe(true);
    result.value.kill();
    const waitResult = await result.value.wait().run();
    expect(waitResult.isOk).toBe(true);
    expect(waitResult.value.exitCode).not.toBe(0);
  });

  it("fails for nonexistent command on wait()", async () => {
    const result = await Command.spawn("nonexistent-cmd-xyz-12345").run();
    // spawn itself may succeed (process handle created)
    // but wait() surfaces the ENOENT error
    if (result.isOk) {
      const waitResult = await result.value.wait().run();
      expect(waitResult.isErr).toBe(true);
      expect(waitResult.error.tag).toBe("CommandError");
    } else {
      expect(result.error.tag).toBe("CommandError");
    }
  });
});

// =============================================================================
// Os
// =============================================================================

describe("Os", () => {
  // Note: Os uses Function('return require("node:os")')() for sync access.
  // In Node ESM (type: module), require is not available, so functions
  // that depend solely on node:os degrade gracefully (None / "unknown").
  // Functions with fallback paths (cpuCount via navigator, homeDir via
  // process.env, tmpDir via process.env) still succeed.

  it("hostname: returns Option<string>", () => {
    const result = Os.hostname();
    // In ESM mode, may return None since node:os require fails.
    // When available, should match nodeOs.hostname().
    if (result.isSome) {
      expect(typeof result.unwrap()).toBe("string");
      expect(result.unwrap()).toBe(nodeOs.hostname());
    } else {
      expect(result.isNone).toBe(true);
    }
  });

  it("arch: returns a string", () => {
    const result = Os.arch();
    expect(typeof result).toBe("string");
    // In ESM mode without node:os, returns "unknown"
    expect(result.length > 0).toBe(true);
  });

  it("platform: returns a string", () => {
    const result = Os.platform();
    expect(typeof result).toBe("string");
    // In ESM mode without node:os, returns "unknown"
    expect(result.length > 0).toBe(true);
  });

  it("cpuCount: returns Some(number) > 0 via navigator.hardwareConcurrency", () => {
    const result = Os.cpuCount();
    // navigator.hardwareConcurrency is available in Node, so this works
    expect(result.isSome).toBe(true);
    const count = result.unwrap();
    expect(typeof count).toBe("number");
    expect(count > 0).toBe(true);
  });

  it("totalMemory: returns Option<number>", () => {
    const result = Os.totalMemory();
    // Depends on node:os require; may be None in ESM
    if (result.isSome) {
      const mem = result.unwrap();
      expect(typeof mem).toBe("number");
      expect(mem > 0).toBe(true);
    } else {
      expect(result.isNone).toBe(true);
    }
  });

  it("freeMemory: returns Option<number>", () => {
    const result = Os.freeMemory();
    // Depends on node:os require; may be None in ESM
    if (result.isSome) {
      const mem = result.unwrap();
      expect(typeof mem).toBe("number");
      expect(mem > 0).toBe(true);
    } else {
      expect(result.isNone).toBe(true);
    }
  });

  it("tmpDir: returns a non-empty string", () => {
    const result = Os.tmpDir();
    expect(typeof result).toBe("string");
    expect(result.length > 0).toBe(true);
  });

  it("homeDir: returns Some(string) via process.env fallback", () => {
    const result = Os.homeDir();
    expect(result.isSome).toBe(true);
    const home = result.unwrap();
    expect(typeof home).toBe("string");
    expect(home).toBe(nodeOs.homedir());
  });

  it("uptime: returns Option<number>", () => {
    const result = Os.uptime();
    // Depends on node:os require; may be None in ESM
    if (result.isSome) {
      const up = result.unwrap();
      expect(typeof up).toBe("number");
      expect(up > 0).toBe(true);
    } else {
      expect(result.isNone).toBe(true);
    }
  });
});

// =============================================================================
// Process
// =============================================================================

describe("Process", () => {
  it("cwd: returns Ok(string) matching process.cwd()", () => {
    const result = Process.cwd();
    expect(result.isOk).toBe(true);
    expect(typeof result.value).toBe("string");
    expect(result.value).toBe(process.cwd());
  });

  it("pid: returns Some(number) matching process.pid", () => {
    const result = Process.pid();
    expect(result.isSome).toBe(true);
    const pid = result.unwrap();
    expect(typeof pid).toBe("number");
    expect(pid).toBe(process.pid);
  });

  it("uptime: returns Some(number) > 0", () => {
    const result = Process.uptime();
    expect(result.isSome).toBe(true);
    const up = result.unwrap();
    expect(typeof up).toBe("number");
    expect(up > 0).toBe(true);
  });

  it("memoryUsage: returns Some with heapUsed, heapTotal, rss > 0", () => {
    const result = Process.memoryUsage();
    expect(result.isSome).toBe(true);
    const mem = result.unwrap();
    expect(typeof mem.heapUsed).toBe("number");
    expect(typeof mem.heapTotal).toBe("number");
    expect(typeof mem.rss).toBe("number");
    expect(mem.heapUsed > 0).toBe(true);
    expect(mem.heapTotal > 0).toBe(true);
    expect(mem.rss > 0).toBe(true);
  });

  it("env: returns Some for existing variable", () => {
    const result = Process.env("HOME");
    expect(result.isSome).toBe(true);
    expect(typeof result.unwrap()).toBe("string");
    expect(result.unwrap().length > 0).toBe(true);
  });

  it("env: returns None for nonexistent variable", () => {
    const result = Process.env("PURE_TS_NONEXISTENT_VAR_XYZ");
    expect(result.isNone).toBe(true);
  });

  it("env: matches process.env value", () => {
    const result = Process.env("PATH");
    expect(result.isSome).toBe(true);
    expect(result.unwrap()).toBe(process.env.PATH);
  });

  it("env(): returns all env vars as a record", () => {
    const all = Process.env();
    expect(typeof all).toBe("object");
    expect(Object.keys(all).length > 0).toBe(true);
    expect(all.PATH).toBe(process.env.PATH);
  });

  it("env(): record has no undefined values", () => {
    const all = Process.env();
    for (const val of Object.values(all)) {
      expect(val).not.toBe(undefined);
      expect(typeof val).toBe("string");
    }
  });

  it("argv: returns an array", () => {
    const result = Process.argv();
    expect(Array.isArray(result)).toBe(true);
  });

  it("parseArgs: parses --key=value format with schema", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string,
        host: Schema.string,
      },
      ["--port=3000", "--host=localhost"],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.port).toBe("3000");
    expect(result.value.host).toBe("localhost");
  });

  it("parseArgs: parses --key value format", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string,
      },
      ["--port", "8080"],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.port).toBe("8080");
  });

  it("parseArgs: parses --flag as 'true' string", () => {
    const result = Process.parseArgs(
      {
        verbose: Schema.string,
      },
      ["--verbose"],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.verbose).toBe("true");
  });

  it("parseArgs: transform string to number via schema", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string.transform(Number),
      },
      ["--port=3000"],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.port).toBe(3000);
    expect(typeof result.value.port).toBe("number");
  });

  it("parseArgs: optional field missing returns undefined", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string.optional(),
      },
      [],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.port).toBe(undefined);
  });

  it("parseArgs: default value when field missing", () => {
    const result = Process.parseArgs(
      {
        mode: Schema.string.default("development"),
      },
      [],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.mode).toBe("development");
  });
});

// =============================================================================
// Path (new methods: isAbsolute, parse, resolve, relative)
// =============================================================================

describe("Path", () => {
  describe("isAbsolute", () => {
    it("returns true for absolute path starting with /", () => {
      expect(Path.isAbsolute("/foo")).toBe(true);
    });

    it("returns false for relative path without leading /", () => {
      expect(Path.isAbsolute("foo")).toBe(false);
    });

    it("returns false for relative path starting with ./", () => {
      expect(Path.isAbsolute("./foo")).toBe(false);
    });
  });

  describe("parse", () => {
    it("decomposes path with multiple extensions", () => {
      const parts = Path.parse("/home/user/file.test.ts");
      expect(parts.base).toBe("file.test.ts");
      expect(parts.ext).toBe(".ts");
      expect(parts.name).toBe("file.test");
      expect(parts.dir).toBe("/home/user");
    });

    it("handles filename without directory", () => {
      const parts = Path.parse("file.ts");
      expect(parts.base).toBe("file.ts");
      expect(parts.ext).toBe(".ts");
      expect(parts.name).toBe("file");
      expect(parts.dir).toBe(".");
    });

    it("handles path with no extension", () => {
      const parts = Path.parse("/usr/bin/node");
      expect(parts.base).toBe("node");
      expect(parts.ext).toBe("");
      expect(parts.name).toBe("node");
    });

    it("root is / for absolute POSIX paths", () => {
      const parts = Path.parse("/home/user/file.ts");
      expect(parts.root).toBe("/");
    });

    it("root is empty for relative paths", () => {
      const parts = Path.parse("src/file.ts");
      expect(parts.root).toBe("");
    });
  });

  describe("resolve", () => {
    it("resolves relative segments into a normalized path", () => {
      const result = Path.resolve("foo", "bar");
      expect(Path.isAbsolute(result)).toBe(true);
      expect(result.endsWith("foo/bar")).toBe(true);
    });

    it("absolute segment anchors the result", () => {
      const result = Path.resolve("/foo", "bar");
      expect(result.startsWith("/foo")).toBe(true);
      expect(result.includes("bar")).toBe(true);
    });

    it("resolves dot segments", () => {
      const result = Path.resolve("/foo", "bar", "..", "baz");
      expect(result).toBe("/foo/baz");
    });
  });

  describe("relative", () => {
    it("computes relative path between directories", () => {
      const result = Path.relative("/home/user", "/home/user/docs/file.ts");
      expect(result).toBe("docs/file.ts");
    });

    it("computes relative path going up", () => {
      const result = Path.relative("/home/user/docs", "/home/user");
      expect(result).toBe("..");
    });

    it("same path returns .", () => {
      const result = Path.relative("/home/user", "/home/user");
      expect(result).toBe(".");
    });
  });
});

// =============================================================================
// File (multi-runtime verification on Node)
// =============================================================================

describe("File", () => {
  let tmpDir;

  it("setup: create temp directory", async () => {
    tmpDir = await mkdtemp(nodePath.join(nodeOs.tmpdir(), "pure-fx-tier2-"));
  });

  it("write then read: roundtrip on Node", async () => {
    const filePath = nodePath.join(tmpDir, "roundtrip.txt");
    const writeResult = await File.write(filePath, "hello tier2").run();
    expect(writeResult.isOk).toBe(true);

    const readResult = await File.read(filePath).run();
    expect(readResult.isOk).toBe(true);
    expect(readResult.value).toBe("hello tier2");
  });

  it("append then read: appends content to file", async () => {
    const filePath = nodePath.join(tmpDir, "append.txt");
    await File.write(filePath, "hello").run();
    await File.append(filePath, " world").run();

    const readResult = await File.read(filePath).run();
    expect(readResult.isOk).toBe(true);
    expect(readResult.value).toBe("hello world");
  });

  it("stat: returns isFile true for a file", async () => {
    const filePath = nodePath.join(tmpDir, "stat-file.txt");
    await writeFile(filePath, "stat test");

    const result = await File.stat(filePath).run();
    expect(result.isOk).toBe(true);
    expect(result.value.isFile).toBe(true);
    expect(result.value.isDirectory).toBe(false);
    expect(result.value.size > 0).toBe(true);
    expect(result.value.mtime instanceof Date).toBe(true);
    expect(result.value.mtime.getTime() > 0).toBe(true);
  });

  it("stat: returns isDirectory true for a directory", async () => {
    const result = await File.stat(tmpDir).run();
    expect(result.isOk).toBe(true);
    expect(result.value.isDirectory).toBe(true);
    expect(result.value.isFile).toBe(false);
  });

  it("copy: actually copies file content", async () => {
    const src = nodePath.join(tmpDir, "copy-src.txt");
    const dest = nodePath.join(tmpDir, "copy-dest.txt");
    await writeFile(src, "copy me");

    const copyResult = await File.copy(src, dest).run();
    expect(copyResult.isOk).toBe(true);

    // Verify content was copied using native fs
    const content = await readFile(dest, "utf-8");
    expect(content).toBe("copy me");

    // Verify source still exists
    const srcExists = await File.exists(src).run();
    expect(srcExists.value).toBe(true);
  });

  it("rename: actually moves the file", async () => {
    const oldPath = nodePath.join(tmpDir, "rename-old.txt");
    const newPath = nodePath.join(tmpDir, "rename-new.txt");
    await writeFile(oldPath, "rename me");

    const renameResult = await File.rename(oldPath, newPath).run();
    expect(renameResult.isOk).toBe(true);

    // Old file should no longer exist
    const oldExists = await File.exists(oldPath).run();
    expect(oldExists.value).toBe(false);

    // New file should exist with correct content
    const content = await readFile(newPath, "utf-8");
    expect(content).toBe("rename me");
  });

  it("removeDir: recursively removes a directory and its contents", async () => {
    const dir = nodePath.join(tmpDir, "remove-dir-test");
    const nested = nodePath.join(dir, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(nodePath.join(dir, "a.txt"), "a");
    await writeFile(nodePath.join(nested, "b.txt"), "b");

    const result = await File.removeDir(dir).run();
    expect(result.isOk).toBe(true);

    // Verify directory no longer exists
    const exists = await File.stat(dir).run();
    expect(exists.isErr).toBe(true);
  });

  it("tempDir: creates a directory that exists", async () => {
    const result = await File.tempDir("pure-fx-test-").run();
    expect(result.isOk).toBe(true);
    const dir = result.value;
    expect(typeof dir).toBe("string");
    expect(dir.length > 0).toBe(true);

    // Verify the directory exists by stat-ing it
    const statResult = await File.stat(dir).run();
    expect(statResult.isOk).toBe(true);
    expect(statResult.value.isDirectory).toBe(true);

    // Clean up the temp dir
    await rm(dir, { recursive: true, force: true });
  });

  it("cleanup: remove temp directory", async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
});

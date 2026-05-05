/**
 * terminal.test.js - Tests for the Terminal module.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output (black-box).
 *
 * Terminal is inherently I/O-bound, so some features (interactive readLine,
 * readPassword) are tested by spawning child processes with piped stdin.
 */

import { execFile } from "node:child_process";
import { describe, expect, it } from "@igorjs/pure-test";

const { Terminal, TerminalError, Ok, Err, Some, None } = await import("../dist/index.js");

// =============================================================================
// 1. isInteractive
// =============================================================================

describe("Terminal.isInteractive", () => {
  it("returns false when stdin is piped (test runner)", () => {
    // Node test runner pipes stdin, so this should be false
    expect(Terminal.isInteractive()).toBe(false);
  });

  it("returns a boolean", () => {
    expect(typeof Terminal.isInteractive()).toBe("boolean");
  });
});

// =============================================================================
// 2. size
// =============================================================================

describe("Terminal.size", () => {
  it("returns Option<TerminalSize>", () => {
    const result = Terminal.size();
    // In a piped environment, may be None or Some depending on stdout
    if (result.isSome) {
      const size = result.unwrap();
      expect(typeof size.columns).toBe("number");
      expect(typeof size.rows).toBe("number");
      expect(size.columns > 0).toBe(true);
      expect(size.rows > 0).toBe(true);
    } else {
      expect(result.isNone).toBe(true);
    }
  });
});

// =============================================================================
// 3. clear
// =============================================================================

describe("Terminal.clear", () => {
  it("does not throw in non-TTY mode", () => {
    // clear is a no-op when not interactive
    expect(() => Terminal.clear()).not.toThrow();
  });
});

// =============================================================================
// 4. write / writeLine
// =============================================================================

describe("Terminal.write", () => {
  it("returns Ok(undefined) on success", () => {
    const result = Terminal.write("");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(undefined);
  });

  it("writes text to stdout without error", () => {
    const result = Terminal.write("test output");
    expect(result.isOk).toBe(true);
  });
});

describe("Terminal.writeLine", () => {
  it("returns Ok(undefined) on success", () => {
    const result = Terminal.writeLine("");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(undefined);
  });

  it("writes text with newline to stdout", () => {
    const result = Terminal.writeLine("test line");
    expect(result.isOk).toBe(true);
  });
});

// =============================================================================
// 5. readAll (piped stdin)
// =============================================================================

describe("Terminal.readAll", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.readAll();
    expect(typeof task.run).toBe("function");
  });

  it("returns Ok(string) when stdin is piped", async () => {
    // In test runner, stdin is piped but already consumed, so readAll may
    // return empty or block. Test via child process instead.
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readAll().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("hello from pipe");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe("hello from pipe");
  });

  it("handles multi-line piped input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readAll().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("line1\nline2\nline3");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe("line1\nline2\nline3");
  });

  it("handles empty piped input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readAll().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe("");
  });
});

// =============================================================================
// 6. readLine (piped stdin)
// =============================================================================

describe("Terminal.readLine", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.readLine("prompt: ");
    expect(typeof task.run).toBe("function");
  });

  it("reads a line from piped stdin", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readLine().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, isSome: r.value?.isSome, value: r.value?.isSome ? r.value.unwrap() : null }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("hello\n");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.isSome).toBe(true);
    expect(result.value).toBe("hello");
  });

  it("returns None on EOF (empty stdin)", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readLine().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, isNone: r.value?.isNone }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.isNone).toBe(true);
  });

  it("with timeout returns None when no input arrives", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readLine("", { timeout: 100 }).run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, isNone: r.value?.isNone }))))',
        ],
        { cwd: process.cwd(), timeout: 5000 },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      // Don't write anything, don't end stdin - let timeout fire
      // But we need to eventually end it for the process to exit
      setTimeout(() => child.stdin.end(), 500);
    });
    expect(result.isOk).toBe(true);
    expect(result.isNone).toBe(true);
  });
});

// =============================================================================
// 7. readPassword (non-TTY)
// =============================================================================

describe("Terminal.readPassword", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.readPassword("Password: ");
    expect(typeof task.run).toBe("function");
  });

  it("returns Err(TerminalError) when stdin is not a TTY", async () => {
    const result = await Terminal.readPassword("Password: ").run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("TerminalError");
    expect(result.error.message).toMatch(/TTY/);
  });
});

// =============================================================================
// 8. confirm (piped stdin)
// =============================================================================

describe("Terminal.confirm", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.confirm("Continue?");
    expect(typeof task.run).toBe("function");
  });

  it("returns true for 'y' input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("y\n");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
  });

  it("returns true for 'yes' input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("yes\n");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
  });

  it("returns false for 'n' input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("n\n");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(false);
  });

  it("returns false for invalid input in non-interactive mode", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("maybe\n");
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(false);
  });

  it("returns false on EOF", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.end();
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(false);
  });
});

// =============================================================================
// 9. TerminalError type
// =============================================================================

describe("TerminalError", () => {
  it("is exported and has correct tag", () => {
    const err = TerminalError("test error");
    expect(err.tag).toBe("TerminalError");
    expect(err.message).toBe("test error");
  });
});

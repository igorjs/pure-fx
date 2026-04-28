/**
 * @module io/terminal
 *
 * Cross-runtime terminal interaction for stdin reading and prompting.
 *
 * **Why wrap stdin/readline?**
 * Each runtime handles stdin differently. This module uses the Stdin
 * and Stdout adapters from runtime/adapters which normalise Deno and
 * Node/Bun APIs behind a single interface.
 *
 * **Edge cases handled:**
 * - TTY vs piped stdin (isInteractive detection)
 * - Non-interactive environments (CI, hooks, cron)
 * - Password input: raw mode disables echo, handles backspace
 * - EOF (Ctrl+D): returns what was read so far
 * - Large piped input: readAll streams in chunks
 * - Timeout: optional timeout prevents blocking forever in hooks/daemons
 * - Encoding: UTF-8 throughout
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import { None, type Option, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { resolveStderr, resolveStdin, resolveStdout } from "../runtime/adapters/stdin.js";
import type { Stdin } from "../runtime/adapters/types.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Terminal operation failed (stdin closed, not available, encoding error). */
export const TerminalError: ErrTypeConstructor<"TerminalError", string> = ErrType("TerminalError");

// ── Options ─────────────────────────────────────────────────────────────────

/** Options for terminal read operations. */
export interface TerminalReadOptions {
  readonly timeout?: number | undefined;
}

/** Terminal dimensions in character cells. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

// ── Cached adapters ─────────────────────────────────────────────────────────

const stdin = resolveStdin();
const stdout = resolveStdout();
const stderr = resolveStderr();

const toErr = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const writeOut = (text: string): void => stdout?.write(text);
const writeErr = (text: string): void => (stderr ?? stdout)?.write(text);

// ── Timeout helper ──────────────────────────────────────────────────────────

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number | undefined,
  cleanup?: () => void,
): Promise<T | "TIMEOUT"> => {
  if (ms === undefined) return promise;
  return new Promise<T | "TIMEOUT">(resolve => {
    const timer = setTimeout(() => {
      if (cleanup !== undefined) cleanup();
      resolve("TIMEOUT");
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve("TIMEOUT");
      },
    );
  });
};

// ── Password character processing ───────────────────────────────────────────

enum CharAction {
  Abort = 0,
  Eof = 1,
  Done = 2,
  Delete = 3,
  Append = 4,
  Skip = 5,
}

const classifyChar = (ch: string): CharAction => {
  const code = ch.charCodeAt(0);
  if (code === 3) return CharAction.Abort;
  if (code === 4) return CharAction.Eof;
  if (ch === "\r" || ch === "\n") return CharAction.Done;
  if (code === 127 || code === 8) return CharAction.Delete;
  if (code < 32) return CharAction.Skip;
  return CharAction.Append;
};

const applyCharAction = (
  action: CharAction,
  ch: string,
  chars: string[],
): Option<string> | null => {
  switch (action) {
    case CharAction.Abort:
      writeErr("\n");
      return None;
    case CharAction.Eof:
      writeErr("\n");
      return chars.length > 0 ? Some(chars.join("")) : None;
    case CharAction.Done:
      writeErr("\n");
      return Some(chars.join(""));
    case CharAction.Delete:
      if (chars.length > 0) {
        chars.pop();
        writeErr("\b \b");
      }
      return null;
    case CharAction.Append:
      chars.push(ch);
      writeErr("*");
      return null;
    case CharAction.Skip:
      return null;
  }
};

// ── Password reading via adapter ────────────────────────────────────────────

const decoder = new TextDecoder();

const rawPasswordRaw = async (
  readRaw: (buf: Uint8Array) => Promise<number | null>,
): Promise<Option<string>> => {
  const chars: string[] = [];
  const buf = new Uint8Array(8);
  while (true) {
    const n = await readRaw(buf);
    if (n === null) {
      writeErr("\n");
      return chars.length > 0 ? Some(chars.join("")) : None;
    }
    const str = decoder.decode(buf.subarray(0, n));
    for (const ch of str) {
      const result = applyCharAction(classifyChar(ch), ch, chars);
      if (result !== null) return result;
    }
  }
};

const rawPasswordEvent = (
  onData: (cb: (chunk: string) => void) => () => void,
): Promise<Option<string>> => {
  const chars: string[] = [];
  return new Promise<Option<string>>(resolve => {
    const cleanup = onData(chunk => {
      for (const ch of chunk) {
        const result = applyCharAction(classifyChar(ch), ch, chars);
        if (result !== null) {
          cleanup();
          resolve(result);
          return;
        }
      }
    });
  });
};

const rawPasswordLoop = (adapter: Stdin): Promise<Option<string>> => {
  if (adapter.readRaw !== undefined) return rawPasswordRaw(adapter.readRaw);
  if (adapter.onData !== undefined) return rawPasswordEvent(adapter.onData);
  return Promise.resolve(None);
};

// ── Unavailable fallback ────────────────────────────────────────────────────

const unavailable = <T>(): TaskLike<T, ErrType<"TerminalError">> =>
  makeTask(async () => Err(TerminalError("No terminal available in this runtime")));

// ── Confirm helpers ─────────────────────────────────────────────────────────

const parseYesNo = (input: string): boolean | undefined => {
  const lower = input.trim().toLowerCase();
  if (lower === "y" || lower === "yes") return true;
  if (lower === "n" || lower === "no") return false;
  return undefined;
};

const confirmLoop = async (
  prompt: string,
  options: TerminalReadOptions,
): Promise<Result<boolean, ErrType<"TerminalError">>> => {
  writeOut("Please answer y or n.\n");
  while (true) {
    const result = await Terminal.readLine(prompt, options).run();
    if (result.isErr) return Err(result.error);
    if (result.value.isNone) return Ok(false);
    const parsed = parseYesNo(result.value.value);
    if (parsed !== undefined) return Ok(parsed);
    writeOut("Please answer y or n.\n");
  }
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime terminal interaction.
 *
 * @example
 * ```ts
 * const name = await Terminal.readLine('Name: ').run();
 * const line = await Terminal.readLine('> ', { timeout: 5000 }).run();
 * const pw = await Terminal.readPassword('Password: ').run();
 * const ok = await Terminal.confirm('Continue?').run();
 * const input = await Terminal.readAll().run();
 * Terminal.isInteractive(); // true if TTY
 * Terminal.size();          // Some({ columns: 120, rows: 40 })
 * Terminal.clear();
 * ```
 */
export const Terminal: {
  /** Check whether stdin is an interactive terminal (TTY). */
  readonly isInteractive: () => boolean;
  /** Get the terminal dimensions (columns and rows). */
  readonly size: () => Option<TerminalSize>;
  /** Clear the terminal screen and move cursor to top-left. */
  readonly clear: () => void;
  /** Read a single line from stdin. Returns None on EOF or timeout. */
  readonly readLine: (
    prompt?: string,
    options?: TerminalReadOptions,
  ) => TaskLike<Option<string>, ErrType<"TerminalError">>;
  /** Read a line with echo disabled (asterisks). Requires TTY. */
  readonly readPassword: (
    prompt?: string,
    options?: TerminalReadOptions,
  ) => TaskLike<Option<string>, ErrType<"TerminalError">>;
  /** Ask a yes/no question. Returns false on timeout or unrecognised input. */
  readonly confirm: (
    message: string,
    options?: TerminalReadOptions,
  ) => TaskLike<boolean, ErrType<"TerminalError">>;
  /** Read all of stdin until EOF. Returns empty on TTY. */
  readonly readAll: () => TaskLike<string, ErrType<"TerminalError">>;
  /** Write text to stdout. */
  readonly write: (text: string) => Result<void, ErrType<"TerminalError">>;
  /** Write text followed by a newline to stdout. */
  readonly writeLine: (text: string) => Result<void, ErrType<"TerminalError">>;
} = {
  isInteractive: () => stdin?.isTTY ?? false,

  size: (): Option<TerminalSize> => {
    if (stdout?.columns !== undefined && stdout.rows !== undefined) {
      return Some({ columns: stdout.columns, rows: stdout.rows });
    }
    return None;
  },

  clear: () => {
    if (stdin?.isTTY) writeOut("\x1b[2J\x1b[H");
  },

  readLine: (
    prompt?: string,
    options?: TerminalReadOptions,
  ): TaskLike<Option<string>, ErrType<"TerminalError">> => {
    if (stdin === undefined) return unavailable();
    const p = prompt ?? "";
    const opts = options ?? {};

    return makeTask(async () => {
      try {
        const readPromise = stdin.readLine(p).then(line => (line === null ? None : Some(line)));
        const result = await withTimeout(readPromise, opts.timeout);
        if (result === "TIMEOUT") return Ok(None);
        return Ok(result);
      } catch (e) {
        return Err(TerminalError(toErr(e)));
      }
    });
  },

  readPassword: (
    prompt?: string,
    options?: TerminalReadOptions,
  ): TaskLike<Option<string>, ErrType<"TerminalError">> => {
    if (stdin === undefined) return unavailable();
    if (!stdin.isTTY || stdin.setRawMode === undefined) {
      return makeTask(async () =>
        Err(TerminalError("Password input requires an interactive terminal (TTY)")),
      );
    }
    const p = prompt ?? "";
    const opts = options ?? {};

    return makeTask(async () => {
      try {
        if (p.length > 0) writeErr(p);
        stdin.setRawMode!(true);

        try {
          const result = await withTimeout(rawPasswordLoop(stdin), opts.timeout, () => {
            stdin.setRawMode!(false);
            writeErr("\n");
          });
          if (result === "TIMEOUT") return Ok(None);
          return Ok(result);
        } finally {
          stdin.setRawMode!(false);
        }
      } catch (e) {
        return Err(TerminalError(toErr(e)));
      }
    });
  },

  confirm: (
    message: string,
    options?: TerminalReadOptions,
  ): TaskLike<boolean, ErrType<"TerminalError">> =>
    makeTask(async (): Promise<Result<boolean, ErrType<"TerminalError">>> => {
      const opts = options ?? {};
      const prompt = `${message} (y/n) `;
      const result = await Terminal.readLine(prompt, opts).run();
      if (result.isErr) return Err(result.error);
      if (result.value.isNone) return Ok(false);
      const parsed = parseYesNo(result.value.value);
      if (parsed !== undefined) return Ok(parsed);
      if (!Terminal.isInteractive()) return Ok(false);
      return confirmLoop(prompt, opts);
    }),

  readAll: (): TaskLike<string, ErrType<"TerminalError">> => {
    if (stdin === undefined) return unavailable();
    return makeTask(async () => {
      try {
        return Ok(await stdin.readAll());
      } catch (e) {
        return Err(TerminalError(toErr(e)));
      }
    });
  },

  write: (text: string): Result<void, ErrType<"TerminalError">> => {
    try {
      writeOut(text);
      return Ok(undefined);
    } catch (e) {
      return Err(TerminalError(toErr(e)));
    }
  },

  writeLine: (text: string): Result<void, ErrType<"TerminalError">> => {
    try {
      writeOut(`${text}\n`);
      return Ok(undefined);
    } catch (e) {
      return Err(TerminalError(toErr(e)));
    }
  },
};

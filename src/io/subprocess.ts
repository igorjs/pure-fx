/**
 * @module io/subprocess
 *
 * Cross-runtime subprocess execution returning Task instead of throwing.
 *
 * **Why wrap child_process / Deno.Command / Bun.spawn?**
 * Each runtime has its own subprocess API with different shapes, error
 * semantics, and output types. This module detects the runtime via
 * globalThis and dispatches to the correct API, returning a unified
 * CommandResult wrapped in TaskLike. Non-zero exit codes are not errors:
 * only spawn failures (command not found, timeout, permission denied)
 * produce Err(CommandError).
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// -- Error types -------------------------------------------------------------

/** Subprocess execution failed (command not found, timeout, spawn error). */
export const CommandError: ErrTypeConstructor<"CommandError", string> = ErrType("CommandError");

// -- Task-like ---------------------------------------------------------------

/** Task-like interface for lazy async subprocess execution. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

const mkTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });

// -- Command result ----------------------------------------------------------

/** Output of a subprocess execution. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// -- Command options ---------------------------------------------------------

/** Options for subprocess execution. */
interface CommandOptions {
  readonly cwd?: string | undefined;
  readonly env?: Record<string, string> | undefined;
  readonly timeout?: number | undefined;
}

// -- Structural types for runtime APIs ---------------------------------------

/** Structural type for Deno.Command output. */
interface DenoCommandOutput {
  readonly code: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

/** Structural type for Deno.Command constructor. */
interface DenoCommandCtor {
  new (
    cmd: string,
    opts?: {
      args?: readonly string[];
      cwd?: string;
      env?: Record<string, string>;
    },
  ): { output(): Promise<DenoCommandOutput> };
}

/** Structural type for Bun.spawnSync result. */
interface BunSpawnSyncResult {
  readonly exitCode: number;
  readonly stdout: { toString(): string };
  readonly stderr: { toString(): string };
}

/** Structural type for the node:child_process module. */
interface NodeChildProcess {
  execFile(
    cmd: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string>; timeout?: number },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
}

// -- Runtime detection -------------------------------------------------------

/** Structural type for Deno global with Command constructor. */
interface DenoGlobal {
  Command: DenoCommandCtor;
}

/** Structural type for Bun global with spawnSync. */
interface BunGlobal {
  spawnSync(
    cmd: readonly string[],
    opts?: { cwd?: string; env?: Record<string, string> },
  ): BunSpawnSyncResult;
}

// -- Helpers -----------------------------------------------------------------

/**
 * Build a Deno/Bun spawn options object, omitting undefined properties.
 * Required by exactOptionalPropertyTypes: passing `cwd: undefined` is
 * not assignable to `cwd?: string`.
 */
const buildSpawnOpts = (
  options: CommandOptions,
): { cwd?: string; env?: Record<string, string> } => {
  const result: { cwd?: string; env?: Record<string, string> } = {};
  if (options.cwd !== undefined) result.cwd = options.cwd;
  if (options.env !== undefined) result.env = options.env;
  return result;
};

// -- Execution strategies ----------------------------------------------------

const execDeno = (
  denoCommand: DenoCommandCtor,
  cmd: string,
  args: readonly string[],
  options: CommandOptions,
): TaskLike<CommandResult, ErrType<"CommandError">> =>
  mkTask(async () => {
    try {
      const proc = new denoCommand(cmd, { args, ...buildSpawnOpts(options) });
      const output = await proc.output();
      const decoder = new TextDecoder();
      return Ok({
        exitCode: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
      });
    } catch (e) {
      return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
    }
  });

const execBun = (
  bun: BunGlobal,
  cmd: string,
  args: readonly string[],
  options: CommandOptions,
): TaskLike<CommandResult, ErrType<"CommandError">> =>
  mkTask(async () => {
    try {
      const result = bun.spawnSync([cmd, ...args], buildSpawnOpts(options));
      return Ok({
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      });
    } catch (e) {
      return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
    }
  });

const execNode = (
  cmd: string,
  args: readonly string[],
  options: CommandOptions,
): TaskLike<CommandResult, ErrType<"CommandError">> =>
  mkTask(async () => {
    try {
      // Dynamic import keeps the module compilable without Node.js types
      const cp: NodeChildProcess = await (Function(
        'return import("node:child_process")',
      )() as Promise<NodeChildProcess>);

      const nodeOpts: { cwd?: string; env?: Record<string, string>; timeout?: number } =
        buildSpawnOpts(options);
      if (options.timeout !== undefined) nodeOpts.timeout = options.timeout;

      return await new Promise<Result<CommandResult, ErrType<"CommandError">>>(resolve => {
        cp.execFile(cmd, args, nodeOpts, (error, stdout, stderr) => {
          if (error !== null) {
            // Node's execFile fires the callback with error on non-zero exit.
            // Extract the exit code when available; otherwise treat as spawn failure.
            const exitCode = (error as unknown as { code?: number | string }).code;
            if (typeof exitCode === "number") {
              resolve(Ok({ exitCode, stdout, stderr }));
            } else {
              resolve(Err(CommandError(error.message, { cmd, args, code: exitCode })));
            }
          } else {
            resolve(Ok({ exitCode: 0, stdout, stderr }));
          }
        });
      });
    } catch (e) {
      return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
    }
  });

// -- Public API --------------------------------------------------------------

/**
 * Cross-runtime subprocess execution.
 *
 * Detects the runtime (Deno, Bun, Node) via globalThis and dispatches
 * to the appropriate subprocess API. Returns TaskLike so execution is
 * lazy until `.run()` is called.
 *
 * Non-zero exit codes are **not** errors: the full stdout/stderr/exitCode
 * is returned in Ok. Only actual failures (command not found, timeout,
 * spawn error) produce Err(CommandError).
 *
 * @example
 * ```ts
 * const result = await Command.exec('echo', ['hello']).run();
 * // Result<CommandResult, ErrType<'CommandError'>>
 *
 * if (result.isOk) {
 *   console.log(result.value.stdout); // 'hello\n'
 * }
 * ```
 */
export const Command: {
  /** Execute a command with optional arguments and options. */
  readonly exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ) => TaskLike<CommandResult, ErrType<"CommandError">>;
} = {
  exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ): TaskLike<CommandResult, ErrType<"CommandError">> => {
    const resolvedArgs = args ?? [];
    const resolvedOptions: CommandOptions = options ?? {};

    // Check Deno first (Deno.Command)
    const deno = (globalThis as unknown as { Deno?: DenoGlobal }).Deno;
    if (deno?.Command !== undefined) {
      return execDeno(deno.Command, cmd, resolvedArgs, resolvedOptions);
    }

    // Check Bun (Bun.spawnSync)
    const bun = (globalThis as unknown as { Bun?: BunGlobal }).Bun;
    if (bun?.spawnSync !== undefined) {
      return execBun(bun, cmd, resolvedArgs, resolvedOptions);
    }

    // Fallback to Node.js child_process
    return execNode(cmd, resolvedArgs, resolvedOptions);
  },
};

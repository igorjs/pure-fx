/**
 * @module io
 *
 * Type-safe wrappers for common I/O operations.
 *
 * **Why IO wrappers?**
 * `JSON.parse` throws on invalid input. `fs.readFile` throws on missing files.
 * `fetch` throws on network errors and treats 404 as success. These wrappers
 * return `Result` or `Task` so errors are values, not exceptions. Every
 * failure path is visible in the type signature.
 */

import type { Result } from "./core/result.js";
import { castErr, Err, Ok } from "./core/result.js";
import { ErrType, type ErrTypeConstructor } from "./types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** JSON parse or stringify failed. */
export const JsonError: ErrTypeConstructor<"JsonError", string> = ErrType("JsonError");

/** File system operation failed. */
export const FileError: ErrTypeConstructor<"FileError", string> = ErrType("FileError");

// ── JSON ────────────────────────────────────────────────────────────────────

/**
 * Type-safe JSON operations that return Result instead of throwing.
 *
 * @example
 * ```ts
 * Json.parse('{"name":"Alice"}');  // Ok({ name: 'Alice' })
 * Json.parse('not json');          // Err(JsonError('...'))
 *
 * Json.stringify({ name: 'Alice' }); // Ok('{"name":"Alice"}')
 * Json.stringify(circular);          // Err(JsonError('...'))
 * ```
 */
export const Json: {
  /** Parse a JSON string. Returns Result instead of throwing. */
  readonly parse: <T = unknown>(input: string) => Result<T, ErrType<"JsonError">>;
  /** Stringify a value. Returns Result instead of throwing on circular refs. */
  readonly stringify: (
    value: unknown,
    replacer?: (key: string, value: unknown) => unknown,
    space?: number,
  ) => Result<string, ErrType<"JsonError">>;
} = {
  parse: <T = unknown>(input: string): Result<T, ErrType<"JsonError">> => {
    try {
      return Ok(JSON.parse(input) as T);
    } catch (e) {
      return Err(JsonError(e instanceof Error ? e.message : String(e)));
    }
  },
  stringify: (
    value: unknown,
    replacer?: (key: string, value: unknown) => unknown,
    space?: number,
  ): Result<string, ErrType<"JsonError">> => {
    try {
      return Ok(JSON.stringify(value, replacer, space));
    } catch (e) {
      return Err(JsonError(e instanceof Error ? e.message : String(e)));
    }
  },
};

// ── File system ─────────────────────────────────────────────────────────────

/** Task-like interface. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

const mkTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });

/** Structural type for the fs/promises module. */
interface FsPromises {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
}

/** Lazy-load fs/promises to stay runtime-agnostic. */
const getFsPromises = async (): Promise<Result<FsPromises, ErrType<"FileError">>> => {
  try {
    // Dynamic import avoids bundling node:fs for non-Node runtimes
    const fs: FsPromises = await (Function(
      'return import("node:fs/promises")',
    )() as Promise<FsPromises>);
    return Ok(fs);
  } catch {
    return Err(FileError("File system is not available in this runtime"));
  }
};

/**
 * Type-safe file system operations that return Task instead of throwing.
 *
 * Uses dynamic import for `node:fs/promises` so the module compiles
 * without Node.js types. Operations return `Task` (lazy, composable).
 *
 * @example
 * ```ts
 * const content = await File.readText('./config.json').run();
 * // Result<string, ErrType<'FileError'>>
 *
 * const parsed = content.flatMap(text => Json.parse(text));
 *
 * await File.writeText('./output.json', '{"ok":true}').run();
 * ```
 */
export const File: {
  /** Read a file as UTF-8 text. */
  readonly readText: (path: string) => TaskLike<string, ErrType<"FileError">>;
  /** Write UTF-8 text to a file (creates or overwrites). */
  readonly writeText: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  /** Check if a path exists and is a file. */
  readonly exists: (path: string) => TaskLike<boolean, ErrType<"FileError">>;
  /** Create a directory (recursive). */
  readonly mkdir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** Delete a file. */
  readonly remove: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** List files in a directory. */
  readonly readDir: (path: string) => TaskLike<readonly string[], ErrType<"FileError">>;
} = {
  readText: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        return Ok(await fsResult.value.readFile(path, "utf-8"));
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  writeText: (path: string, content: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.writeFile(path, content, "utf-8");
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  exists: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        const stat = await fsResult.value.stat(path);
        return Ok(stat.isFile());
      } catch {
        return Ok(false);
      }
    }),

  mkdir: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.mkdir(path, { recursive: true });
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  remove: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.unlink(path);
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  readDir: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        return Ok(await fsResult.value.readdir(path));
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),
};

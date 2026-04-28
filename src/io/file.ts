/**
 * @module io/file
 *
 * Type-safe file system operations that return Task instead of throwing.
 *
 * **Why wrap file I/O?**
 * Every runtime's file API throws on missing files, permission errors, and
 * invalid paths. Wrapping in Task makes failures values, not exceptions.
 *
 * **Multi-runtime strategy:**
 * Uses the Fs adapter from runtime/adapters which normalises Deno, Node,
 * and Bun file system APIs behind a single interface.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import { Err, Ok } from "../core/result.js";
import { resolveFs } from "../runtime/adapters/fs.js";
import type { Fs } from "../runtime/adapters/types.js";
import { Eol } from "../runtime/platform.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** File system operation failed. */
export const FileError: ErrTypeConstructor<"FileError", string> = ErrType("FileError");

// ── File stat result ────────────────────────────────────────────────────────

/** Metadata returned by File.stat. */
export interface FileStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mtime: Date | undefined;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const toErr = (e: unknown, meta?: Record<string, unknown>): ErrType<"FileError", string> =>
  FileError(e instanceof Error ? e.message : String(e), meta);

const NO_FS = "File system is not available in this runtime";

let cachedFs: Fs | null | undefined;

const getFs = async (): Promise<Fs | null> => {
  if (cachedFs !== undefined) return cachedFs;
  cachedFs = await resolveFs();
  return cachedFs;
};

const withFs = <T>(
  fn: (fs: Fs) => Promise<T>,
  meta?: Record<string, unknown>,
): TaskLike<T, ErrType<"FileError">> =>
  makeTask(async () => {
    const fs = await getFs();
    if (fs === null) return Err(FileError(NO_FS));
    try {
      return Ok(await fn(fs));
    } catch (e) {
      return Err(toErr(e, meta));
    }
  });

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Type-safe file system operations that return Task instead of throwing.
 *
 * Multi-runtime: detects Deno (native API), then Node/Bun (node:fs/promises).
 * Gracefully returns Err in runtimes without filesystem (Workers, browsers).
 *
 * @example
 * ```ts
 * const content = await File.read('./config.json').run();
 * // Result<string, ErrType<'FileError'>>
 *
 * await File.write('./output.json', '{"ok":true}').run();
 * ```
 */
export const File: {
  /** Read a text file as a UTF-8 string. */
  readonly read: (path: string) => TaskLike<string, ErrType<"FileError">>;
  /** Write a string to a file, creating or overwriting it. */
  readonly write: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  /** Append a string to a file. */
  readonly append: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  /** Check whether a file exists. */
  readonly exists: (path: string) => TaskLike<boolean, ErrType<"FileError">>;
  /** Create a directory recursively. */
  readonly makeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** Remove a file. */
  readonly remove: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** Remove a directory recursively. */
  readonly removeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** List entries in a directory. */
  readonly list: (path: string) => TaskLike<readonly string[], ErrType<"FileError">>;
  /** Get file or directory metadata. */
  readonly stat: (path: string) => TaskLike<FileStat, ErrType<"FileError">>;
  /** Copy a file from src to dest. */
  readonly copy: (src: string, dest: string) => TaskLike<void, ErrType<"FileError">>;
  /** Rename or move a file. */
  readonly rename: (oldPath: string, newPath: string) => TaskLike<void, ErrType<"FileError">>;
  /** Create a temporary directory with optional prefix. */
  readonly tempDir: (prefix?: string) => TaskLike<string, ErrType<"FileError">>;
} = {
  read: path => withFs(fs => fs.readFile(path).then(Eol.normalize), { path }),
  write: (path, content) => withFs(fs => fs.writeFile(path, content), { path }),
  append: (path, content) => withFs(fs => fs.appendFile(path, content), { path }),
  exists: path =>
    makeTask(async () => {
      const fs = await getFs();
      if (fs === null) return Err(FileError(NO_FS));
      try {
        const s = await fs.stat(path);
        return Ok(s.isFile);
      } catch {
        return Ok(false);
      }
    }),
  makeDir: path => withFs(fs => fs.mkdir(path), { path }),
  remove: path => withFs(fs => fs.remove(path), { path }),
  removeDir: path => withFs(fs => fs.removeDir(path), { path }),
  list: path => withFs(fs => fs.readDir(path), { path }),
  stat: path => withFs(fs => fs.stat(path), { path }),
  copy: (src, dest) => withFs(fs => fs.copyFile(src, dest), { src, dest }),
  rename: (oldPath, newPath) => withFs(fs => fs.rename(oldPath, newPath), { oldPath, newPath }),
  tempDir: prefix => withFs(fs => fs.makeTempDir(prefix)),
};

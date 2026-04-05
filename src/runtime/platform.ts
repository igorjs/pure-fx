/**
 * @module runtime/platform
 *
 * Runtime platform detection and OS-aware constants.
 *
 * **Why detect at runtime instead of importing node:os?**
 * Importing `node:os` or `node:path` binds the module to Node.js. This
 * module detects the platform from `globalThis.process.platform` (Node/Bun)
 * or `globalThis.Deno.build.os` (Deno), falling back to POSIX defaults
 * for unknown runtimes (browsers, Cloudflare Workers). All access is
 * structural: no `node:` imports, no type declarations.
 */

// ── Detection ───────────────────────────────────────────────────────────────

type PlatformId = "windows" | "posix";

/**
 * Detect the current platform from available globals.
 * Checks Node/Bun first (process.platform), then Deno (Deno.build.os),
 * defaults to POSIX for browsers and edge runtimes.
 */
const detectPlatform = (): PlatformId => {
  const proc = (globalThis as unknown as { process?: { platform?: string } }).process;
  if (proc?.platform === "win32") return "windows";

  const deno = (globalThis as unknown as { Deno?: { build?: { os?: string } } }).Deno;
  if (deno?.build?.os === "windows") return "windows";

  return "posix";
};

const PLATFORM: PlatformId = detectPlatform();

// ── EOL ─────────────────────────────────────────────────────────────────────

/**
 * Line ending constants and normalisation.
 *
 * @example
 * ```ts
 * Eol.native            // '\r\n' on Windows, '\n' elsewhere
 * Eol.normalise(text)   // replace all \r\n with \n
 * Eol.split(text)       // split on \r\n or \n
 * ```
 */
export const Eol: {
  /** Line feed (Unix, macOS, Linux). */
  readonly lf: "\n";
  /** Carriage return + line feed (Windows). */
  readonly crlf: "\r\n";
  /** The native line ending for the current platform. */
  readonly native: string;
  /** Normalise all line endings to \n. */
  readonly normalise: (text: string) => string;
  /** Split text into lines, handling both \r\n and \n. */
  readonly split: (text: string) => readonly string[];
} = {
  lf: "\n",
  crlf: "\r\n",
  native: PLATFORM === "windows" ? "\r\n" : "\n",
  normalise: (text: string): string => text.replace(/\r\n/g, "\n"),
  split: (text: string): readonly string[] => text.split(/\r?\n/),
};

// ── Path ────────────────────────────────────────────────────────────────────

const POSIX_SEP = "/";
const WIN_SEP = "\\";

/**
 * OS-aware path operations without node:path dependency.
 *
 * Handles separator differences between Windows and POSIX.
 * All operations accept both `/` and `\` as input separators
 * and output the native separator.
 *
 * @example
 * ```ts
 * Path.join('src', 'core', 'result.ts')  // 'src/core/result.ts' (POSIX)
 *                                        // 'src\\core\\result.ts' (Windows)
 * Path.normalise('src\\core//result.ts') // 'src/core/result.ts' (POSIX)
 * Path.basename('/home/user/file.ts')    // 'file.ts'
 * Path.dirname('/home/user/file.ts')     // '/home/user'
 * Path.extname('file.test.ts')           // '.ts'
 * ```
 */
export const Path: {
  /** The native path separator for the current platform. */
  readonly separator: string;
  /** Join path segments using the native separator. */
  readonly join: (...segments: readonly string[]) => string;
  /** Normalise separators and remove redundant slashes. */
  readonly normalise: (path: string) => string;
  /** Extract the file name from a path (last segment). */
  readonly basename: (path: string) => string;
  /** Extract the directory portion of a path. */
  readonly dirname: (path: string) => string;
  /** Extract the file extension (including the dot). */
  readonly extname: (path: string) => string;
  /** Convert all separators to forward slash. Useful for URLs and cross-platform storage. */
  readonly toPosix: (path: string) => string;
} = {
  separator: PLATFORM === "windows" ? WIN_SEP : POSIX_SEP,

  join: (...segments: readonly string[]): string => {
    const sep = PLATFORM === "windows" ? WIN_SEP : POSIX_SEP;
    const joined = segments.filter(s => s.length > 0).join(sep);
    return normaliseSlashes(joined, sep);
  },

  normalise: (path: string): string => {
    const sep = PLATFORM === "windows" ? WIN_SEP : POSIX_SEP;
    return normaliseSlashes(path, sep);
  },

  basename: (path: string): string => {
    const normalised = toForwardSlash(path);
    const lastSlash = normalised.lastIndexOf("/");
    return lastSlash === -1 ? normalised : normalised.slice(lastSlash + 1);
  },

  dirname: (path: string): string => {
    const normalised = toForwardSlash(path);
    const lastSlash = normalised.lastIndexOf("/");
    if (lastSlash === -1) return ".";
    if (lastSlash === 0) return "/";
    const dir = normalised.slice(0, lastSlash);
    return PLATFORM === "windows" ? dir.replace(/\//g, WIN_SEP) : dir;
  },

  extname: (path: string): string => {
    const base = Path.basename(path);
    const lastDot = base.lastIndexOf(".");
    if (lastDot <= 0) return "";
    return base.slice(lastDot);
  },

  toPosix: (path: string): string => toForwardSlash(path),
};

// ── Internal helpers ────────────────────────────────────────────────────────

/** Replace all backslashes with forward slashes. */
const toForwardSlash = (path: string): string => path.replace(/\\/g, "/");

/** Normalise a path: unify separators, collapse runs, remove trailing. */
const normaliseSlashes = (path: string, sep: string): string => {
  // Unify both separators to forward slash for processing
  let result = toForwardSlash(path);
  // Collapse multiple consecutive slashes
  result = result.replace(/\/+/g, "/");
  // Remove trailing slash (unless root)
  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  // Convert to native separator
  if (sep === WIN_SEP) {
    result = result.replace(/\//g, WIN_SEP);
  }
  return result;
};

// ── Platform info ───────────────────────────────────────────────────────────

/**
 * Platform detection utilities.
 *
 * @example
 * ```ts
 * Platform.os       // 'windows' | 'posix'
 * Platform.isWindows // true on Windows
 * ```
 */
export const Platform: {
  /** The detected platform family. */
  readonly os: PlatformId;
  /** Whether the current platform is Windows. */
  readonly isWindows: boolean;
} = {
  os: PLATFORM,
  isWindows: PLATFORM === "windows",
};

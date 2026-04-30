/**
 * @module io/ffi
 *
 * Cross-runtime Foreign Function Interface for loading and calling native
 * shared libraries (.so, .dylib, .dll).
 *
 * Provides a unified API across:
 * - **Node 25+**: `node:ffi` (experimental, requires `--allow-ffi`)
 * - **Deno**: `Deno.dlopen()` (requires `--allow-ffi`)
 * - **Bun**: `bun:ffi`
 *
 * All operations return Result or Task, making failure paths explicit.
 *
 * @example
 * ```ts
 * const lib = FFI.open(`./libmath.${FFI.suffix}`, {
 *   add: { parameters: ['i32', 'i32'], result: 'i32' },
 *   pi:  { parameters: [], result: 'f64' },
 * });
 *
 * if (lib.isOk) {
 *   const { symbols, close } = lib.value;
 *   console.log(symbols.add(2, 3));  // 5
 *   console.log(symbols.pi());       // 3.14159...
 *   close();
 * }
 * ```
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error type ──────────────────────────────────────────────────────────────

/** FFI operation failed. */
export const FfiError: ErrTypeConstructor<"FfiError", string> = ErrType("FfiError");

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Supported FFI scalar types.
 *
 * Common across all runtimes (Deno, Bun, Node 25+):
 * - Integers: `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `i64`, `u64`
 * - Floats: `f32`, `f64`
 * - Other: `void`, `bool`, `pointer`, `buffer`
 */
export type FfiType =
  | "void"
  | "bool"
  | "i8"
  | "u8"
  | "i16"
  | "u16"
  | "i32"
  | "u32"
  | "i64"
  | "u64"
  | "f32"
  | "f64"
  | "pointer"
  | "buffer";

/** Definition of a single native function symbol. */
export interface FfiSymbolDefinition {
  /** Parameter types in order. */
  readonly parameters: readonly FfiType[];
  /** Return type. */
  readonly result: FfiType;
}

/** A map of symbol names to their definitions. */
export type FfiSymbols = Record<string, FfiSymbolDefinition>;

/** A loaded dynamic library with callable symbols. */
export interface FfiLibrary<S extends FfiSymbols> {
  /** Callable native functions, keyed by symbol name. */
  readonly symbols: { readonly [K in keyof S]: (...args: readonly unknown[]) => unknown };
  /** Close the library and release the native handle. */
  readonly close: () => void;
}

// ── Runtime detection ───────────────────────────────────────────────────────

interface DenoGlobal {
  dlopen(
    path: string,
    symbols: Record<string, FfiSymbolDefinition>,
  ): {
    symbols: Record<string, (...args: readonly unknown[]) => unknown>;
    close(): void;
  };
  build: { os: string };
}

const getDeno = (): DenoGlobal | undefined =>
  typeof globalThis !== "undefined" && "Deno" in globalThis
    ? (globalThis as unknown as { Deno: DenoGlobal }).Deno
    : undefined;

const isBun = (): boolean => typeof globalThis !== "undefined" && "Bun" in globalThis;

// ── Node type mapping ───────────────────────────────────────────────────────
// node:ffi uses slightly different type names for some types

const nodeTypeMap: Record<string, string> = {
  i8: "int8",
  u8: "uint8",
  i16: "int16",
  u16: "uint16",
  i32: "int32",
  u32: "uint32",
  i64: "int64",
  u64: "uint64",
  f32: "float32",
  f64: "float64",
  bool: "bool",
  void: "void",
  pointer: "pointer",
  buffer: "buffer",
};

const toNodeType = (t: FfiType): string => nodeTypeMap[t] ?? t;

const toNodeDefinitions = (
  symbols: FfiSymbols,
): Record<string, { parameters: readonly string[]; result: string }> => {
  const result: Record<string, { parameters: readonly string[]; result: string }> = {};
  for (const key of Object.keys(symbols)) {
    const sym = symbols[key]!;
    result[key] = {
      parameters: sym.parameters.map(toNodeType),
      result: toNodeType(sym.result),
    };
  }
  return result;
};

// ── Platform suffix ─────────────────────────────────────────────────────────

const detectSuffix = (): string => {
  const deno = getDeno();
  if (deno) {
    return deno.build.os === "windows" ? "dll" : deno.build.os === "darwin" ? "dylib" : "so";
  }
  if (typeof globalThis !== "undefined" && "process" in globalThis) {
    const proc = (globalThis as unknown as { process: { platform: string } }).process;
    return proc.platform === "win32" ? "dll" : proc.platform === "darwin" ? "dylib" : "so";
  }
  return "so";
};

// ── Implementation ──────────────────────────────────────────────────────────

const openDeno = <S extends FfiSymbols>(
  path: string,
  symbols: S,
): Result<FfiLibrary<S>, ErrType<"FfiError">> => {
  try {
    const deno = getDeno()!;
    const lib = deno.dlopen(path, symbols);
    return Ok({
      symbols: lib.symbols as FfiLibrary<S>["symbols"],
      close: () => lib.close(),
    });
  } catch (e) {
    return Err(FfiError(e instanceof Error ? e.message : String(e)));
  }
};

const openBun = <S extends FfiSymbols>(
  path: string,
  symbols: S,
): Result<FfiLibrary<S>, ErrType<"FfiError">> => {
  try {
    // Dynamic require to avoid TS errors in non-Bun environments
    const bunFfi = Function('return require("bun:ffi")')() as {
      dlopen(
        path: string,
        symbols: Record<string, FfiSymbolDefinition>,
      ): {
        symbols: Record<string, (...args: readonly unknown[]) => unknown>;
        close(): void;
      };
    };
    const lib = bunFfi.dlopen(path, symbols);
    return Ok({
      symbols: lib.symbols as FfiLibrary<S>["symbols"],
      close: () => lib.close(),
    });
  } catch (e) {
    return Err(FfiError(e instanceof Error ? e.message : String(e)));
  }
};

const openNode = <S extends FfiSymbols>(
  path: string,
  symbols: S,
): Result<FfiLibrary<S>, ErrType<"FfiError">> => {
  try {
    const nodeFfi = Function('return require("node:ffi")')() as {
      dlopen(
        path: string,
        definitions: Record<string, { parameters: readonly string[]; result: string }>,
      ): {
        lib: { close(): void };
        functions: Record<string, (...args: readonly unknown[]) => unknown>;
      };
    };
    const { lib, functions } = nodeFfi.dlopen(path, toNodeDefinitions(symbols));
    return Ok({
      symbols: functions as FfiLibrary<S>["symbols"],
      close: () => lib.close(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("No such built-in module")) {
      return Err(
        FfiError("FFI not available. Node 25+ with --allow-ffi required, or use Deno/Bun."),
      );
    }
    return Err(FfiError(msg));
  }
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime Foreign Function Interface.
 *
 * Load native shared libraries and call their exported functions from
 * JavaScript. Works on Deno, Bun, and Node 25+.
 *
 * @example
 * ```ts
 * // Load a C library
 * const lib = FFI.open(`./libcalc.${FFI.suffix}`, {
 *   add: { parameters: ['i32', 'i32'], result: 'i32' },
 * });
 *
 * if (lib.isOk) {
 *   console.log(lib.value.symbols.add(2, 3)); // 5
 *   lib.value.close();
 * }
 *
 * // Load a system library
 * const libc = FFI.open(FFI.systemLib('c'), {
 *   getpid: { parameters: [], result: 'i32' },
 * });
 * ```
 */
export const FFI: {
  /**
   * Open a dynamic library and bind symbols.
   *
   * Returns `Ok` with callable symbols and a close function,
   * or `Err(FfiError)` if the library can't be loaded.
   */
  readonly open: <S extends FfiSymbols>(
    path: string,
    symbols: S,
  ) => Result<FfiLibrary<S>, ErrType<"FfiError">>;

  /**
   * Platform-specific shared library file extension.
   *
   * - `"dylib"` on macOS
   * - `"so"` on Linux
   * - `"dll"` on Windows
   */
  readonly suffix: string;

  /**
   * Resolve a system library name to its platform-specific path.
   *
   * - macOS: `"c"` -> `"libc.dylib"`
   * - Linux: `"c"` -> `"libc.so.6"` (libc special case), others -> `"lib{name}.so"`
   * - Windows: `"c"` -> `"msvcrt.dll"`, others -> `"{name}.dll"`
   */
  readonly systemLib: (name: string) => string;

  /** All supported FFI types as a frozen object for reference. */
  readonly types: {
    readonly VOID: "void";
    readonly BOOL: "bool";
    readonly I8: "i8";
    readonly U8: "u8";
    readonly I16: "i16";
    readonly U16: "u16";
    readonly I32: "i32";
    readonly U32: "u32";
    readonly I64: "i64";
    readonly U64: "u64";
    readonly F32: "f32";
    readonly F64: "f64";
    readonly POINTER: "pointer";
    readonly BUFFER: "buffer";
  };

  /** Whether FFI is available in the current runtime. */
  readonly isAvailable: () => boolean;
} = {
  open: <S extends FfiSymbols>(
    path: string,
    symbols: S,
  ): Result<FfiLibrary<S>, ErrType<"FfiError">> => {
    if (getDeno()) return openDeno(path, symbols);
    if (isBun()) return openBun(path, symbols);
    return openNode(path, symbols);
  },

  suffix: detectSuffix(),

  systemLib: (name: string): string => {
    const s = detectSuffix();
    if (s === "dylib") return `lib${name}.dylib`;
    if (s === "dll") {
      if (name === "c") return "msvcrt.dll";
      return `${name}.dll`;
    }
    // Linux
    if (name === "c") return "libc.so.6";
    return `lib${name}.so`;
  },

  types: Object.freeze({
    VOID: "void" as const,
    BOOL: "bool" as const,
    I8: "i8" as const,
    U8: "u8" as const,
    I16: "i16" as const,
    U16: "u16" as const,
    I32: "i32" as const,
    U32: "u32" as const,
    I64: "i64" as const,
    U64: "u64" as const,
    F32: "f32" as const,
    F64: "f64" as const,
    POINTER: "pointer" as const,
    BUFFER: "buffer" as const,
  }),

  isAvailable: (): boolean => {
    if (getDeno() || isBun()) return true;
    try {
      Function('return require("node:ffi")')();
      return true;
    } catch {
      return false;
    }
  },
};

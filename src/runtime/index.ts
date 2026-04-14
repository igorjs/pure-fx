/**
 * @module runtime
 *
 * HTTP server, program lifecycle, logging, configuration, and cross-runtime utilities.
 *
 * Server, Program, Logger, Config, Os, Process, Path, Eol, Platform.
 *
 * @example
 * ```ts
 * import { Config, Logger, Process } from '@igorjs/pure-fx/runtime'
 *
 * const log = Logger.create({ level: 'info' });
 * const cwd = Process.cwd();
 * ```
 */
/** Typed environment variable validation and access. */
export { Config } from "./config.js";
/** Structured logger with configurable levels and formatters. */
export { Logger } from "./logger.js";
/** Cross-runtime OS information (hostname, arch, memory). */
export { Os } from "./os.js";
/** Line ending constants and normalization. */
/** OS-aware path manipulation without node:path dependency. */
/** Parsed path components (root, dir, base, ext, name). */
/** Runtime platform detection (isWindows, isPosix). */
export { Eol, Path, type PathParts, Platform } from "./platform.js";
/** Cross-runtime process info, cwd, env, args, and exit namespace. */
/** Error returned when a process operation fails. */
export { Process, ProcessError } from "./process.js";

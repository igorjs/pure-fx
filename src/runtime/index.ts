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
export { Config } from "./config.js";
export { Logger } from "./logger.js";
export { Os } from "./os.js";
export { Eol, Path, type PathParts, Platform } from "./platform.js";
export { Process, ProcessError } from "./process.js";

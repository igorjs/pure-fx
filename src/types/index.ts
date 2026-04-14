/**
 * @module types
 *
 * Structured errors, nominal types, and time primitives.
 *
 * ErrType, Type (nominal branding), Duration, Cron.
 *
 * @example
 * ```ts
 * import { ErrType, Duration } from '@igorjs/pure-fx/types'
 *
 * const NotFound = ErrType('NotFound');
 * const timeout = Duration.seconds(30);
 * ```
 */
/** Cron expression parser and validator. */
export { Cron, type CronExpression } from "./cron.js";
/** Type-safe duration with unit conversions. */
export { Duration } from "./duration.js";
/** Structured error type constructor with tag-based discrimination. */
export { ErrType, type ErrTypeConstructor } from "./error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./nominal.js";

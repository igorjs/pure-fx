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
/** Cron expression parser and validator namespace. */
/** A validated cron expression string (5-field standard format). */
export { Cron, type CronExpression } from "./cron.js";
/** Type-safe duration namespace with unit conversions. */
export { Duration } from "./duration.js";
/** Structured error type constructor with tag-based discrimination. */
/** Callable constructor that creates tagged, immutable error instances. */
export { ErrType, type ErrTypeConstructor } from "./error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./nominal.js";

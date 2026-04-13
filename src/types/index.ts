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
export { Cron, type CronExpression } from "./cron.js";
export { Duration } from "./duration.js";
export { ErrType, type ErrTypeConstructor } from "./error.js";
export type { Type } from "./nominal.js";

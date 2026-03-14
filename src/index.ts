/**
 * @module @igorjs/pure-ts
 *
 * Pure TS: immutability micro-framework for TypeScript.
 *
 *   Record({ name: 'John Doe', age: 21 })  - immutable objects
 *   List([1, 2, 3])                        - immutable arrays
 *   Ok(value) / Err(error)                 - Result monad
 *   Some(value) / None                     - Option monad
 *   Schema.object({ ... })                 - boundary validation → immutable
 *   pipe(value, fn1, fn2)                  - left-to-right data transformation
 *   flow(fn1, fn2, fn3)                    - point-free function composition
 *   Lazy(() => expensive())                - deferred & cached computation
 *   Task(async () => ...)                  - composable async Result
 *   Type<'UserId', string>                 - nominal typing (zero runtime)
 *
 * Everything returns immutable values. Errors are values, never thrown.
 * Zero dependencies. Methods live on prototypes. GC-friendly.
 */

export { type Result, type ResultMatcher, Ok, Err, collectResults, tryCatch } from './result.js';
export { type Option, type OptionMatcher, Some, None, fromNullable, collectOptions } from './option.js';
export { pipe, flow } from './pipe.js';
export { Lazy } from './lazy.js';
export { Task } from './task.js';
export { type Type } from './nominal.js';
export { type DeepReadonly } from './internals.js';
export { type RecordMethods, type ImmutableRecord } from './record.js';
export { type ListMethods, type ImmutableList } from './list.js';
export { Record, List, isImmutable } from './constructors.js';
export { type SchemaError, type SchemaType, Schema } from './schema.js';

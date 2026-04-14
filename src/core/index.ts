/**
 * @module core
 *
 * Foundational types and composition utilities.
 *
 * Result, Option, pipe, flow, Match, Eq, Ord, State, and optics (Lens, Iso, Prism, Traversal).
 *
 * @example
 * ```ts
 * import { Ok, Err, pipe, Match } from '@igorjs/pure-ts/core'
 *
 * const result = pipe(Ok(42), r => r.map(n => n * 2));
 * ```
 */
/** Typed equality comparison. */
export { Eq } from "./eq.js";
/** Optics for immutable nested data access and updates. */
export { Iso, Lens, LensOptional, Prism, Traversal } from "./lens.js";
/** Exhaustive pattern matching with compile-time coverage. */
export { Match } from "./match.js";
/** Option type and constructors for nullable value handling. */
export { None, Option, type OptionMatcher, Some } from "./option.js";
/** Typed ordering and comparison. */
export { Ord } from "./ord.js";
/** Left-to-right function composition and piping. */
export { flow, pipe } from "./pipe.js";
/** Result type and constructors for error-as-value handling. */
export { Err, Ok, Result, type ResultMatcher, tryCatch } from "./result.js";
/** Pure state monad for threading state through computations. */
export { State } from "./state.js";

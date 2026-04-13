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
export { Eq } from "./eq.js";
export { Iso, Lens, LensOptional, Prism, Traversal } from "./lens.js";
export { Match } from "./match.js";
export { None, Option, type OptionMatcher, Some } from "./option.js";
export { Ord } from "./ord.js";
export { flow, pipe } from "./pipe.js";
export { Err, Ok, Result, type ResultMatcher, tryCatch } from "./result.js";
export { State } from "./state.js";

// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module types/runtime
 *
 * Barrel for the TypeDef catalogue.
 *
 * Re-exports the seven JS-native primitives (`Str`, `Num`, `Int`, `UInt`,
 * `Bool`, `Bytes`, `Nil`), the `DateTime` instant primitive, and the generic
 * composers (`Vec`, `Pair`, `Tuple`, `Dict`, `Maybe`, `Either`, `Struct`).
 */

export {
  Dict,
  Either,
  type EitherValue,
  ListOf,
  MapOf,
  Maybe,
  Pair,
  Struct,
  Tuple,
  Vec,
} from "./composers.js";
export { DateTime, DateTimeValue, type TemporalInstant } from "./date-time.js";
export { Bool, Bytes, Int, Nil, Num, Str, UInt } from "./scalars.js";

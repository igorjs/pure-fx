// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module types/runtime
 *
 * Barrel for the v0 TypeDef catalogue.
 *
 * Re-exports the seven JS-native primitives (`Str`, `Num`, `Int`, `UInt`,
 * `Bool`, `Bytes`, `Nil`) and the six generic composers (`Vec`, `Pair`,
 * `Tuple`, `Dict`, `Maybe`, `Either`).
 */

export { Dict, Either, type EitherValue, Maybe, Pair, Tuple, Vec } from "./composers.js";
export { Bool, Bytes, Int, Nil, Num, Str, UInt } from "./scalars.js";

// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module types/runtime/scalars
 *
 * JS-native primitive types branded as {@link TypeDef} classes.
 *
 * Each export is a one-liner over an existing {@link Schema} primitive.
 * They earn their place by giving the JS primitives a distinct name and
 * a uniform `parse`/`new`/`validate`/`is`/`unsafe` surface so users can
 * extend them without writing the boilerplate themselves:
 *
 * ```ts
 * class Username extends Str {}   // adds compile-time distinctness
 * class Score extends Int {}
 * ```
 *
 * Application-specific types (Email, Uuid, Url, etc.) are NOT in the
 * catalogue: they are one-line user-side definitions, e.g.
 * `class Email extends TypeDef('Email', Schema.email) {}`.
 */

import { Schema } from "../../data/schema.js";
import { TypeDef } from "../type-def.js";

/**
 * Any JS `string` value.
 *
 * @example
 * ```ts
 * class Title extends Str {}
 * Title.parse('Hello');  // Ok
 * Title.parse(42);       // Err
 * ```
 */
export class Str extends TypeDef("Str", Schema.string) {}

/**
 * Any JS `number` value (excluding `NaN`). Permits non-integers and
 * infinities; use {@link Int} or {@link UInt} for integer constraints.
 *
 * @example
 * ```ts
 * Num.parse(1.5);    // Ok
 * Num.parse(NaN);    // Err
 * ```
 */
export class Num extends TypeDef("Num", Schema.number) {}

/**
 * An integer `number` (no fractional part). Backed by `Schema.int`, so
 * `Number.isInteger(value)` must hold.
 *
 * @example
 * ```ts
 * Int.parse(42);     // Ok
 * Int.parse(1.5);    // Err
 * ```
 */
export class Int extends TypeDef("Int", Schema.int) {}

/**
 * A non-negative integer (`>= 0`). Combines `Schema.int` with a
 * non-negativity refinement.
 *
 * @example
 * ```ts
 * UInt.parse(0);     // Ok
 * UInt.parse(-1);    // Err
 * ```
 */
export class UInt extends TypeDef(
  "UInt",
  Schema.int.refine(n => n >= 0, "non-negative"),
) {}

/**
 * Any JS `boolean` value.
 *
 * @example
 * ```ts
 * Bool.parse(true);  // Ok
 * Bool.parse(1);     // Err  (not coerced)
 * ```
 */
export class Bool extends TypeDef("Bool", Schema.boolean) {}

/**
 * A `Uint8Array` instance. Node `Buffer` is accepted because it extends
 * `Uint8Array`; `ArrayBuffer` is rejected.
 *
 * @example
 * ```ts
 * Bytes.parse(new Uint8Array([1, 2, 3]));   // Ok
 * Bytes.parse(new ArrayBuffer(8));           // Err
 * ```
 */
export class Bytes extends TypeDef(
  "Bytes",
  Schema.guard((v): v is Uint8Array => v instanceof Uint8Array, "Uint8Array"),
) {}

/**
 * Strictly the literal value `null`. Use this when a field must be `null`
 * (not merely absent). For optional fields, prefer `Schema.optional()` or
 * `Maybe(T)`.
 *
 * @example
 * ```ts
 * Nil.parse(null);       // Ok
 * Nil.parse(undefined);  // Err
 * Nil.parse(0);          // Err
 * ```
 */
export class Nil extends TypeDef(
  "Nil",
  Schema.guard((v): v is null => v === null, "null"),
) {}

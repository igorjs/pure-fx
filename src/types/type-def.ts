// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module type-def
 *
 * Branded type factory backed by a {@link SchemaType}.
 *
 * **Why TypeDef?**
 * `Schema` validates unknown input but produces structurally-typed values.
 * `Type<Name, Base>` brands a value at the type level but has no runtime
 * validator. `TypeDef` combines them: a single class that owns the schema,
 * the brand, and a uniform `parse`/`new`/`validate`/`is`/`unsafe` surface.
 *
 * **Pattern:**
 * ```ts
 * class UserId extends TypeDef('UserId', Schema.uuid) {}
 *
 * UserId.parse(input)    // Result<Type<'UserId', string>, SchemaError>
 * UserId.is(input)       // input is Type<'UserId', string>
 * UserId.tag === 'UserId'
 * ```
 *
 * Extend `class extends` to give each tag a distinct prototype and a named
 * class for debugging. Static methods are inherited; instances are forbidden.
 */

import { castErr, Ok, type Result } from "../core/result.js";
import { Validation } from "../core/validation.js";
import type { SchemaError, SchemaType } from "../data/schema.js";
import type { Type } from "./nominal.js";

/**
 * Structural shape that all classes returned by {@link TypeDef} satisfy.
 *
 * Composers (`Vec`, `Pair`, `Dict`, ...) accept any value matching this shape
 * as the inner type. The full class also carries static
 * `parse`/`new`/`validate`/`is`/`unsafe` methods, but composers only need
 * access to `tag`, `schema`, and the phantom `_brand`.
 */
export interface TypeDefStatic<Tag extends string, T> {
  /** The branding tag. */
  readonly tag: Tag;
  /** The underlying schema. */
  readonly schema: SchemaType<T>;
  /** Phantom: the branded value type. */
  readonly _brand: Type<Tag, T>;
}

// Why: NODE_ENV may be undefined in browsers/edge runtimes; optional chaining keeps the check safe.
const isProduction = (): boolean => {
  // biome-ignore lint/suspicious/noExplicitAny: deliberate untyped global access for cross-runtime safety
  const proc = (globalThis as any).process;
  return proc?.env?.NODE_ENV === "production";
};

/**
 * Create a branded type from a tag and a validation schema.
 *
 * Returns an abstract class. Extend with `class Foo extends TypeDef('Foo',
 * schema) {}` to give the type a name and distinct prototype.
 *
 * The returned class exposes static methods only; instantiation throws.
 *
 * @example Defining a branded UUID type
 * ```ts
 * import { TypeDef, Schema } from '@igorjs/pure-fx'
 *
 * class UserId extends TypeDef('UserId', Schema.uuid) {}
 *
 * const r = UserId.parse('550e8400-e29b-41d4-a716-446655440000');
 * if (r.isOk) {
 *   // r.value is typed as Type<'UserId', string>
 * }
 * ```
 *
 * @example Extracting the branded value type
 * ```ts
 * type UserIdValue = TypeDef.Infer<typeof UserId>;
 * // = Type<'UserId', string>
 * ```
 *
 * @param tag Unique branding tag used in error messages and the phantom brand.
 * @param schema The underlying validator for inbound values.
 */
export function TypeDef<Tag extends string, T>(tag: Tag, schema: SchemaType<T>) {
  abstract class TypeDefBase {
    /** The branding tag (also used in error messages). */
    static readonly tag: Tag = tag;
    /** The underlying schema used for validation. */
    static readonly schema: SchemaType<T> = schema;
    /**
     * Phantom static for type extraction via {@link TypeDef.Infer}. Never
     * read at runtime.
     */
    declare static readonly _brand: Type<Tag, T>;

    /**
     * Construct from a typed value. Same validation as `parse`, but the
     * `value` parameter is typed `T` instead of `unknown`, so the call site
     * gets compile-time feedback for obvious mistakes.
     *
     * @param value A value already typed as `T`.
     * @returns Ok with the branded value, or Err with the schema failure.
     */
    static new(value: T): Result<Type<Tag, T>, SchemaError> {
      const r = schema.parse(value);
      if (r.isErr) return castErr(r);
      // Why: Type<Tag, T> is a phantom brand; the value is structurally T at runtime.
      return Ok(r.value as Type<Tag, T>);
    }

    /**
     * Parse unknown input. Returns Ok with the branded value on success or
     * Err with a {@link SchemaError} describing the failure.
     *
     * @param input Untrusted unknown value.
     */
    static parse(input: unknown): Result<Type<Tag, T>, SchemaError> {
      const r = schema.parse(input);
      if (r.isErr) return castErr(r);
      // Why: Type<Tag, T> is a phantom brand; structurally identical at runtime.
      return Ok(r.value as Type<Tag, T>);
    }

    /**
     * Validate unknown input and return a {@link Validation} that
     * accumulates errors. Useful when collecting multiple field errors at
     * once (e.g. form validation).
     *
     * @param input Untrusted unknown value.
     */
    static validate(input: unknown): Validation<Type<Tag, T>, SchemaError> {
      return Validation.fromResult(TypeDefBase.parse(input));
    }

    /**
     * Type guard: returns `true` if `input` parses successfully against the
     * schema. Narrows the input type to the branded value on the true
     * branch.
     *
     * @param input Untrusted unknown value.
     */
    static is(input: unknown): input is Type<Tag, T> {
      return schema.parse(input).isOk;
    }

    /**
     * Cast a known-good value to the branded type without re-validation in
     * production. In development (`NODE_ENV !== 'production'`) the schema
     * runs as a sanity check and throws on failure.
     *
     * Use only when you have already validated the value via `parse`, `new`,
     * or a database/contract guarantee. Misuse defeats the brand.
     *
     * @param value A value already known to satisfy `T`.
     */
    static unsafe(value: T): Type<Tag, T> {
      if (!isProduction()) {
        const r = schema.parse(value);
        if (r.isErr) {
          throw new TypeError(
            `TypeDef(${tag}).unsafe: value failed schema check (expected ${r.error.expected})`,
          );
        }
      }
      // Why: phantom brand; the value is structurally T at runtime.
      return value as Type<Tag, T>;
    }

    /**
     * TypeDef classes are validators, not data carriers: construction is
     * forbidden. The constructor exists only so subclasses can `extend`;
     * any attempt to `new` either the base or a subclass throws.
     */
    constructor() {
      throw new TypeError(`${tag} is a TypeDef class and cannot be instantiated`);
    }
  }
  return TypeDefBase;
}

/** Type-level utilities for {@link TypeDef}. */
export namespace TypeDef {
  /**
   * Extract the branded value type from a `TypeDef` class.
   *
   * @example
   * ```ts
   * class Email extends TypeDef('Email', Schema.email) {}
   * type EmailValue = TypeDef.Infer<typeof Email>;  // Type<'Email', string>
   * ```
   */
  export type Infer<C> = C extends { readonly _brand: infer V } ? V : never;
}

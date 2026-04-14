/**
 * @module data
 *
 * Immutable data structures, validation, encoding, and algebraic data types.
 *
 * Record, List, NonEmptyList, Schema, Codec, and ADT.
 *
 * @example
 * ```ts
 * import { Schema, Record, ADT } from '@igorjs/pure-fx/data'
 *
 * const UserSchema = Schema.object({ name: Schema.string, age: Schema.number });
 * const user = Record({ name: 'Alice', age: 30 });
 * ```
 */
export { ADT } from "./adt.js";
export { Codec, type CodecType } from "./codec.js";
export { isImmutable, List, Record } from "./constructors.js";
/** Recursively marks all properties as readonly. */
export type { DeepReadonly } from "./internals.js";
/** An immutable array with functional methods. */
export type { ImmutableList, ListMethods } from "./list.js";
export { NonEmptyList } from "./non-empty-list.js";
/** An immutable object with type-safe update methods. */
export type { ImmutableRecord, RecordMethods } from "./record.js";
export { Schema, type SchemaError, type SchemaType } from "./schema.js";

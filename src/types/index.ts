// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

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

// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Eq are visible from this entrypoint. */
export type { Eq } from "../core/eq.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { Option } from "../core/option.js";
/** Re-exported so public signatures that reference OptionMatcher are visible from this entrypoint. */
export type { OptionMatcher } from "../core/option.js";
/** Re-exported so public signatures that reference SomeVariant are visible from this entrypoint. */
export type { SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Ord are visible from this entrypoint. */
export type { Ord } from "../core/ord.js";
/** Re-exported so public signatures that reference Err are visible from this entrypoint. */
export type { Err } from "../core/result.js";
/** Re-exported so public signatures that reference Ok are visible from this entrypoint. */
export type { Ok } from "../core/result.js";
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
export type { Result } from "../core/result.js";
/** Re-exported so public signatures that reference ResultMatcher are visible from this entrypoint. */
export type { ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference SchemaError are visible from this entrypoint. */
export type { SchemaError } from "../data/schema.js";

/** Cron expression parser and validator namespace. */
export { Cron } from "./cron.js";
/** A validated cron expression string (5-field standard format). */
export type { CronExpression } from "./cron.js";
/** Type-safe duration namespace with unit conversions. */
export { Duration } from "./duration.js";
/** Structured error type constructor with tag-based discrimination. */
export { ErrType } from "./error.js";
/** Callable constructor that creates tagged, immutable error instances. */
export type { ErrTypeConstructor } from "./error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./nominal.js";

/** Branded-type factory with parse/new/validate/is/unsafe surface. */
export { TypeDef } from "./type-def.js";
/** Structural shape of any class returned by `TypeDef(...)`. */
export type { TypeDefStatic } from "./type-def.js";

// ── Runtime catalogue (v0) ─────────────────────────────────────────────

/** Branded JS `boolean` primitive. */
export { Bool } from "./runtime/scalars.js";
/** Branded `Uint8Array` primitive (accepts Node `Buffer`). */
export { Bytes } from "./runtime/scalars.js";
/** Branded integer `number` primitive. */
export { Int } from "./runtime/scalars.js";
/** Branded literal-`null` primitive. */
export { Nil } from "./runtime/scalars.js";
/** Branded `number` primitive (any finite/infinite non-NaN). */
export { Num } from "./runtime/scalars.js";
/** Branded `string` primitive. */
export { Str } from "./runtime/scalars.js";
/** Branded non-negative integer primitive. */
export { UInt } from "./runtime/scalars.js";

/** String-keyed object-record composer (returns `ImmutableHashMap`). */
export { Dict } from "./runtime/composers.js";
/** Tagged sum-type composer (`Left | Right`). */
export { Either } from "./runtime/composers.js";
/** Tagged sum value produced by parsing an {@link Either}. */
export type { EitherValue } from "./runtime/composers.js";
/** Optional-value composer that parses JSON `Option<T>` shapes. */
export { Maybe } from "./runtime/composers.js";
/** 2-tuple composer. */
export { Pair } from "./runtime/composers.js";
/** Heterogeneous object composer over named TypeDefs (returns `ImmutableRecord`). */
export { Struct } from "./runtime/composers.js";
/** Fixed-length n-tuple composer. */
export { Tuple } from "./runtime/composers.js";
/** Homogeneous-array composer (returns `ImmutableList`). */
export { Vec } from "./runtime/composers.js";

/** Temporal-aware instant TypeDef (extend to create domain instants). */
export { DateTime } from "./runtime/date-time.js";
/** Immutable instant value (epoch nanoseconds) produced by parsing {@link DateTime}. */
export { DateTimeValue } from "./runtime/date-time.js";
/** Minimal structural `Temporal.Instant` shape returned by `DateTimeValue.toTemporal`. */
export type { TemporalInstant } from "./runtime/date-time.js";

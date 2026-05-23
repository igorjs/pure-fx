// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module types/runtime/date-time
 *
 * A Temporal-aware instant primitive. {@link DateTimeValue} is the immutable
 * runtime value (epoch nanoseconds as `bigint`); {@link DateTime} is the
 * {@link TypeDef} validator users extend.
 *
 * Temporal is feature-detected at runtime — pure-fx bundles no polyfill and
 * declares no dependency. On runtimes without `globalThis.Temporal`,
 * {@link DateTimeValue.toTemporal} returns `None`; everything else works via
 * `Date`/`bigint`.
 */

import type { Eq } from "../../core/eq.js";
import { None, type Option, Some } from "../../core/option.js";
import type { Ord } from "../../core/ord.js";
import { Schema, type SchemaType } from "../../data/schema.js";
import type { Type } from "../nominal.js";
import { TypeDef } from "../type-def.js";

const NS_PER_MS = 1_000_000n;

/** Minimal structural subset of `Temporal.Instant` used by this module. */
export interface TemporalInstant {
  readonly epochNanoseconds: bigint;
  toString(): string;
}
interface TemporalInstantCtor {
  fromEpochNanoseconds(epochNanoseconds: bigint): TemporalInstant;
}
interface TemporalGlobal {
  readonly Instant: TemporalInstantCtor;
}
/** A `Temporal.ZonedDateTime`-like value (only `toInstant` is required). */
interface TemporalZonedLike {
  toInstant(): TemporalInstant;
}

const getTemporal = (): TemporalGlobal | undefined =>
  (globalThis as { Temporal?: TemporalGlobal }).Temporal;

const isZoned = (t: TemporalInstant | TemporalZonedLike): t is TemporalZonedLike =>
  typeof (t as TemporalZonedLike).toInstant === "function";

/**
 * Immutable instant value stored as nanoseconds since the Unix epoch (UTC).
 *
 * `Date`-based conversions are millisecond-precision; full nanosecond fidelity
 * is preserved in {@link epochNanos} and via {@link toTemporal}.
 */
export class DateTimeValue {
  /** Nanoseconds since the Unix epoch (UTC). */
  readonly epochNanos: bigint;

  private constructor(epochNanos: bigint) {
    this.epochNanos = epochNanos;
    Object.freeze(this);
  }

  /** From integer nanoseconds since the epoch. */
  static fromEpochNanos(epochNanos: bigint): DateTimeValue {
    return new DateTimeValue(epochNanos);
  }

  /** From milliseconds since the epoch (fractional ms are truncated). */
  static fromEpochMillis(ms: number): DateTimeValue {
    return new DateTimeValue(BigInt(Math.trunc(ms)) * NS_PER_MS);
  }

  /** From a `Date` (millisecond precision). */
  static fromDate(d: Date): DateTimeValue {
    return new DateTimeValue(BigInt(d.getTime()) * NS_PER_MS);
  }

  /** From an ISO-8601 string (millisecond precision via `Date`). */
  static fromISO(s: string): DateTimeValue {
    return DateTimeValue.fromDate(new Date(s));
  }

  /** From a `Temporal.Instant` or `Temporal.ZonedDateTime` (nanosecond precision). */
  static fromTemporal(t: TemporalInstant | TemporalZonedLike): DateTimeValue {
    const instant = isZoned(t) ? t.toInstant() : t;
    return new DateTimeValue(instant.epochNanoseconds);
  }

  /** Current instant (millisecond precision via `Date.now()`). */
  static now(): DateTimeValue {
    return DateTimeValue.fromEpochMillis(Date.now());
  }

  /** Milliseconds since the epoch (truncates sub-millisecond precision). */
  toEpochMillis(): number {
    return Number(this.epochNanos / NS_PER_MS);
  }

  /** A `Date` (millisecond precision). */
  toDate(): Date {
    return new Date(this.toEpochMillis());
  }

  /** ISO-8601 string (millisecond precision). */
  toISO(): string {
    return this.toDate().toISOString();
  }

  /**
   * A `Temporal.Instant` (full nanosecond precision) when `globalThis.Temporal`
   * is available, else `None`. Never throws.
   */
  toTemporal(): Option<TemporalInstant> {
    const T = getTemporal();
    return T ? Some(T.Instant.fromEpochNanoseconds(this.epochNanos)) : None;
  }

  /** Instant equality. */
  equals(other: DateTimeValue): boolean {
    return this.epochNanos === other.epochNanos;
  }

  /** Compare by instant: -1, 0, or 1. */
  compare(other: DateTimeValue): -1 | 0 | 1 {
    return this.epochNanos < other.epochNanos ? -1 : this.epochNanos > other.epochNanos ? 1 : 0;
  }

  /** {@link Eq} instance ordering by instant. */
  static readonly eq: Eq<DateTimeValue> = Object.freeze({
    equals: (a: DateTimeValue, b: DateTimeValue) => a.equals(b),
  });

  /** {@link Ord} instance ordering by instant. */
  static readonly ord: Ord<DateTimeValue> = Object.freeze({
    equals: (a: DateTimeValue, b: DateTimeValue) => a.equals(b),
    compare: (a: DateTimeValue, b: DateTimeValue) => a.compare(b),
  });
}

// ── DateTime TypeDef ──────────────────────────────────────────────────────────

const isDate = Schema.guard((v): v is Date => v instanceof Date, "Date");
const isTemporalInstant = Schema.guard(
  (v): v is TemporalInstant =>
    typeof v === "object" &&
    v !== null &&
    typeof (v as { epochNanoseconds?: unknown }).epochNanoseconds === "bigint",
  "Temporal.Instant",
);
const isDateTimeValue = Schema.guard(
  (v): v is DateTimeValue => v instanceof DateTimeValue,
  "DateTimeValue",
);

/**
 * Schema accepting an ISO string, epoch milliseconds, a `Date`, a
 * `Temporal.Instant`, or an existing {@link DateTimeValue}; produces a
 * {@link DateTimeValue}. Branch order: existing value → Date → Temporal →
 * ISO string → epoch number.
 */
const dateTimeSchema: SchemaType<DateTimeValue> = Schema.union(
  isDateTimeValue,
  isDate.transform(d => DateTimeValue.fromDate(d)),
  isTemporalInstant.transform(t => DateTimeValue.fromTemporal(t)),
  Schema.isoDate.transform(s => DateTimeValue.fromISO(s)),
  Schema.number.transform(n => DateTimeValue.fromEpochMillis(n)),
);

/** Branded value type produced by parsing {@link DateTime}. */
type DateTimeBrand = Type<"DateTime", DateTimeValue>;

/**
 * Temporal-aware instant {@link TypeDef}. Extend it to create domain instants:
 * `class CreatedAt extends DateTime {}`.
 *
 * @example
 * ```ts
 * class CreatedAt extends DateTime {}
 * CreatedAt.parse('2026-05-22T10:00:00Z'); // Result<Type<'DateTime', DateTimeValue>, SchemaError>
 * ```
 */
export class DateTime extends TypeDef("DateTime", dateTimeSchema) {
  /** Current instant as a branded value. */
  static now(): DateTimeBrand {
    return DateTimeValue.now() as DateTimeBrand;
  }
  /** Branded value from epoch milliseconds. */
  static fromEpochMillis(ms: number): DateTimeBrand {
    return DateTimeValue.fromEpochMillis(ms) as DateTimeBrand;
  }
  /** Branded value from a `Date`. */
  static fromDate(d: Date): DateTimeBrand {
    return DateTimeValue.fromDate(d) as DateTimeBrand;
  }
}

# Types

Structured errors, nominal types, and time primitives.

## ErrType

Structured, immutable error constructors with discriminant tags.

```ts
import { ErrType } from '@igorjs/pure-fx'

// Define error kinds
const NotFound = ErrType('NotFound');           // code: 'NOT_FOUND' (auto-derived)
const Forbidden = ErrType('Forbidden');         // code: 'FORBIDDEN'
const DbError = ErrType('DbError', 'DB_ERR');  // explicit code

// Create instances (frozen, immutable)
const err = NotFound('User not found', { userId: 'u_123' });
err.tag;       // 'NotFound'
err.code;      // 'NOT_FOUND'
err.message;   // 'User not found'
err.metadata;  // { userId: 'u_123' }
err.timestamp; // Date.now()
err.stack;     // stack trace

// Cause chains (Error.cause convention)
const inner = DbError('connection refused');
const outer = NotFound('user lookup failed', { cause: inner });
outer.cause;           // the DbError instance
outer.toString();      // "NotFound(NOT_FOUND): user lookup failed [caused by: DbError(DB_ERR): connection refused]"

// Type guards
NotFound.is(err);   // true, narrows type
Forbidden.is(err);  // false
ErrType.is(err);    // true (any ErrType)

// Convert to Result
err.toResult();     // Err(err)

// Serialize
err.toJSON();       // { tag, code, message, metadata, timestamp, cause }
```

## Type (Nominal)

Branded types that prevent mixing structurally identical values.

```ts
import type { Type } from '@igorjs/pure-fx'

type UserId = Type<'UserId', string>;
type OrderId = Type<'OrderId', string>;

const userId = 'u_123' as UserId;
const orderId = 'o_456' as OrderId;

// These are both strings, but TypeScript prevents mixing:
function getUser(id: UserId) { /* ... */ }
getUser(userId);   // OK
getUser(orderId);  // TYPE ERROR
```

## TypeDef

`Type<...>` is type-level-only. `TypeDef` adds runtime validation: each
branded type owns its schema and a uniform `parse`/`new`/`validate`/`is`/
`unsafe` surface.

```ts
import { TypeDef, Schema } from '@igorjs/pure-fx'

class UserId extends TypeDef('UserId', Schema.uuid) {}

UserId.parse(input);    // Result<Type<'UserId', string>, SchemaError>
UserId.is(input);       // input is Type<'UserId', string>
UserId.tag;             // 'UserId'

// Validation with error accumulation:
UserId.validate(input); // Validation<Type<'UserId', string>, SchemaError>

// Dev-mode-checked passthrough (zero cost in production):
const u = UserId.unsafe(knownGoodString);
```

Extract the branded value type with `TypeDef.Infer`:

```ts
type UserIdValue = TypeDef.Infer<typeof UserId>;
// = Type<'UserId', string>
```

`TypeDef` classes are validators, not data carriers: `new UserId()` throws.

### v0 Catalogue

Seven JS-native primitives ship branded, with a uniform static surface so
you can extend them directly:

| Type | Backs | Notes |
|------|-------|-------|
| `Str` | `string` | any string |
| `Num` | `number` | rejects `NaN`, allows `Infinity` |
| `Int` | `number` | `Number.isInteger(value)` must hold |
| `UInt` | `number` | non-negative integer |
| `Bool` | `boolean` | strict, no coercion |
| `Bytes` | `Uint8Array` | accepts Node `Buffer`, rejects `ArrayBuffer` |
| `Nil` | `null` | strictly the literal `null` |

```ts
import { Str, Int, UInt, Bool, Bytes, Nil } from '@igorjs/pure-fx'

class Username extends Str {}
class Score extends Int {}

Username.parse('alice');  // Result<Type<'Str', string>, SchemaError>
Score.parse(42);
```

### Composers

Nine generic factories build new branded types from existing ones. `Vec`,
`Dict`, `Pair`, `Tuple`, `Either` return **deep-frozen native snapshots**;
`Struct`, `ListOf`, `MapOf` return **pure-fx [Immutable](data.md#immutable-protocol)
collections** (functional API + copy-on-write `produce`). Reference-keyed
composers are cached so `Vec(X) === Vec(X)` holds (`Tuple`/`Struct` take
unbounded shapes and are not cached — hold them in a `const`/`class`).

| Composer | Validates | Returns |
|----------|-----------|---------|
| `Vec(T)` | `T[]` | frozen `readonly T[]` branded |
| `Pair(A, B)` | `[A, B]` | frozen `readonly [A, B]` branded |
| `Tuple(...T)` | n-tuple | frozen `readonly [...T]` branded |
| `Dict(K, V)` | string-keyed record | frozen `Readonly<Record<K, V>>` branded |
| `ListOf(T)` | `T[]` | `ImmutableList<T>` branded |
| `MapOf(K, V)` | string-keyed record | `ImmutableHashMap<K, V>` branded |
| `Struct({...})` | named heterogeneous object | `ImmutableRecord<{...}>` branded |
| `Maybe(T)` | `{tag:'Some',value:T} \| {tag:'None'} \| null \| undefined` | `Option<T>` branded |
| `Either(L, R)` | `{tag:'Left',value:L} \| {tag:'Right',value:R}` | tagged sum branded |

`Vec`/`Dict` are lightweight **snapshots** (a branded frozen array/object) — use
plain indexing/property access. `ListOf`/`MapOf` are the **collection** variants:
access their parsed values through the collection API (`.at(i)`, `.get(key)`,
`.size`, `.produce(...)`). `Struct` is the heterogeneous counterpart to `Dict`/
`MapOf`: each field has its own TypeDef.

```ts
import { TypeDef, Schema, Struct } from '@igorjs/pure-fx'

class UserId extends TypeDef('UserId', Schema.uuid) {}
class Email  extends TypeDef('Email',  Schema.email) {}

class User extends Struct({ id: UserId, email: Email }) {}

const r = User.parse({ id: '550e8400-e29b-41d4-a716-446655440000', email: 'a@b.com' });
if (r.isOk) {
  r.value.id;     // Type<'UserId', string>
  r.value.email;  // Type<'Email', string>
  // r.value is an ImmutableRecord — assignment throws
}
```

```ts
import { TypeDef, Schema, Vec, Pair, Dict, Maybe, Either } from '@igorjs/pure-fx'

class Email   extends TypeDef('Email',   Schema.email) {}
class Latitude  extends TypeDef('Latitude',  Schema.number.refine(n => n >= -90 && n <= 90,  'lat')) {}
class Longitude extends TypeDef('Longitude', Schema.number.refine(n => n >= -180 && n <= 180, 'lng')) {}

class Emails    extends Vec(Email) {}
class GeoPoint  extends Pair(Latitude, Longitude) {}
class Headers   extends Dict(Str, Str) {}
class MaybeEmail extends Maybe(Email) {}
```

### Defining your own types

The catalogue is deliberately minimal. Application types are one-line
user-side definitions:

```ts
import { TypeDef, Schema } from '@igorjs/pure-fx'

class Email   extends TypeDef('Email',   Schema.email) {}
class Uuid    extends TypeDef('Uuid',    Schema.uuid) {}
class HttpUrl extends TypeDef('HttpUrl', Schema.url) {}

class Port extends TypeDef(
  'Port',
  Schema.int.refine(n => n >= 1 && n <= 65535, 'port'),
) {}

class Money extends TypeDef('Money', Schema.object({
  amount:   Schema.string.refine(s => /^-?\d+(\.\d+)?$/.test(s), 'decimal'),
  currency: Schema.string.refine(s => s.length === 3, 'iso 4217'),
})) {}
```

Then compose freely:

```ts
class Wallet extends Dict(Str, Money) {}
class Failure extends Either(HttpError, NetworkError) {}
```

## DateTime

A Temporal-aware instant primitive. `DateTime` is a `TypeDef` you can extend;
parsing yields a `DateTimeValue` — an immutable instant stored as epoch
nanoseconds (`bigint`).

```ts
import { DateTime, DateTimeValue } from '@igorjs/pure-fx'

class CreatedAt extends DateTime {}

// Parse accepts an ISO string, epoch millis, a Date, a Temporal.Instant /
// ZonedDateTime, or an existing DateTimeValue:
const r = CreatedAt.parse('2026-05-22T10:00:00.000Z');
// Result<Type<'DateTime', DateTimeValue>, SchemaError>

if (r.isOk) {
  r.value.epochNanos;     // bigint (full nanosecond precision)
  r.value.toDate();        // Date (millisecond precision)
  r.value.toISO();         // '2026-05-22T10:00:00.000Z'
  r.value.toEpochMillis(); // 1747908000000
  r.value.toTemporal();    // Option<Temporal.Instant> (Some when available)
}

// Convenience constructors return branded values directly:
DateTime.now();
DateTime.fromEpochMillis(1_700_000_000_000);
DateTime.fromDate(new Date());
```

`DateTimeValue` is comparable: `equals(other)`, `compare(other)` (`-1 | 0 | 1`),
and the typeclass instances `DateTimeValue.eq` / `DateTimeValue.ord` (ordered by
instant).

**Zero-dependency Temporal interop.** pure-fx bundles no polyfill and declares no
dependency. `globalThis.Temporal` is feature-detected at runtime: when present,
`toTemporal()` returns `Some(Temporal.Instant)` with full nanosecond precision;
when absent (older runtimes), it returns `None` and everything else continues to
work via `Date`/`bigint`. `Date`-based conversions (`toDate`, `toISO`,
`fromISO`, `fromDate`, `fromEpochMillis`) are millisecond-precision; full
nanosecond fidelity is preserved in `epochNanos` and through Temporal values.

`DateTimeValue` implements the [Immutable protocol](data.md#immutable-protocol)
(`Immutable.is(dt) === true`). Modifiers are copy-on-write — they always return a
**new** value, never mutating in place:

```ts
const later = dt.plus(Duration.hours(1));    // new DateTimeValue
const reset = dt.withEpochMillis(0);          // new DateTimeValue
dt.toMutable();                                // a fresh Date (interop)
```

**Static constructors:** `now`, `fromEpochMillis`, `fromEpochNanos`, `fromDate`,
`fromISO`, `fromTemporal`

**Instance:** `epochNanos`, `toEpochMillis`, `toDate`, `toISO`, `toJSON`,
`toMutable`, `toTemporal`, `equals`, `compare`

**Copy-on-write modifiers:** `plus(Duration)`, `minus(Duration)`,
`withEpochMillis`, `withEpochNanos`

**Typeclass instances:** `eq`, `ord`

## Duration

Typed time values in milliseconds with conversions.

```ts
import { Duration } from '@igorjs/pure-fx'

const d = Duration.seconds(90);    // 90000 (milliseconds)
Duration.toSeconds(d);              // 90
Duration.toMinutes(d);              // 1.5

Duration.minutes(5);                // 300000
Duration.hours(1);                  // 3600000
Duration.days(7);                   // 604800000
Duration.toHours(Duration.minutes(90)); // 1.5

// Arithmetic
const total = Duration.add(Duration.minutes(5), Duration.seconds(30));
Duration.toSeconds(total);          // 330
Duration.subtract(Duration.hours(1), Duration.minutes(15));
Duration.multiply(Duration.seconds(10), 3);

// Predicates and formatting
Duration.isZero(Duration.zero);     // true
Duration.isPositive(Duration.seconds(1)); // true
Duration.format(Duration.add(Duration.hours(2), Duration.minutes(30)));
// "2h 30m"

// Typeclass instances
Duration.eq.equals(Duration.seconds(1), Duration.milliseconds(1000)); // true
Duration.ord.compare(Duration.seconds(1), Duration.seconds(2));       // -1

// Used in APIs that accept Duration:
Stream.interval(Duration.seconds(1));
Retry.exponential({ base: Duration.milliseconds(100) });
```

**Factories:** `milliseconds`, `seconds`, `minutes`, `hours`, `days`

**Conversions:** `toMilliseconds`, `toSeconds`, `toMinutes`, `toHours`

**Arithmetic:** `add`, `subtract`, `multiply`

**Predicates:** `isZero`, `isPositive`

**Other:** `format`, `zero`, `eq`, `ord`

## Cron

Cron expression parser with field validation.

```ts
import { Cron } from '@igorjs/pure-fx'

const expr = Cron.parse('*/5 * * * *');
// Result<CronExpression, SchemaError>

// Next occurrence after a given date
if (expr.isOk) {
  const next = Cron.next(expr.value);        // Option<Date>
  const nextAfter = Cron.next(expr.value, new Date('2025-01-01'));

  // Check if a date matches the schedule
  Cron.matches(expr.value, new Date());      // boolean
}
```

**Static:** `parse`, `next`, `matches`

---

Previous: [Data](data.md) | Next: [Async](async.md)

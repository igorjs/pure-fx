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

Six generic factories build new branded types from existing ones. Outputs
are deep-frozen at runtime; composers are cached per inner reference so
`Vec(X) === Vec(X)` holds.

| Composer | Validates | Returns |
|----------|-----------|---------|
| `Vec(T)` | `T[]` | `readonly T[]` branded |
| `Pair(A, B)` | `[A, B]` | `readonly [A, B]` branded |
| `Tuple(...T)` | n-tuple | `readonly [...T]` branded |
| `Dict(K, V)` | string-keyed record | `Readonly<Record<K, V>>` branded |
| `Maybe(T)` | `{tag:'Some',value:T} \| {tag:'None'} \| null \| undefined` | `Option<T>` branded |
| `Either(L, R)` | `{tag:'Left',value:L} \| {tag:'Right',value:R}` | tagged sum branded |

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

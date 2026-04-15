# Types

Structured errors, nominal types, and time primitives.

## ErrType

Structured, immutable error constructors with discriminant tags.

```ts
import { ErrType } from '@igorjs/pure-ts'

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
import type { Type } from '@igorjs/pure-ts'

type UserId = Type<'UserId', string>;
type OrderId = Type<'OrderId', string>;

const userId = 'u_123' as UserId;
const orderId = 'o_456' as OrderId;

// These are both strings, but TypeScript prevents mixing:
function getUser(id: UserId) { /* ... */ }
getUser(userId);   // OK
getUser(orderId);  // TYPE ERROR
```

## Duration

Typed time values in milliseconds with conversions.

```ts
import { Duration } from '@igorjs/pure-ts'

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
import { Cron } from '@igorjs/pure-ts'

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

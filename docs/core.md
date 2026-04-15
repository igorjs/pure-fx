# Core

Foundational types and composition utilities.

## Result\<T, E\>

A value that is either `Ok(value)` or `Err(error)`. Replaces try/catch.

```ts
import { Ok, Err, Result } from '@igorjs/pure-fx'

const parse = (input: string): Result<number, string> => {
  const n = Number(input);
  return Number.isNaN(n) ? Err('not a number') : Ok(n);
};

const result = parse('42');

// Pattern match
result.match({
  Ok: n => console.log(`Got ${n}`),
  Err: e => console.log(`Failed: ${e}`),
});

// Chain operations (short-circuits on Err)
const doubled = parse('21')
  .map(n => n * 2)
  .flatMap(n => n > 0 ? Ok(n) : Err('must be positive'));

// Collect array of Results
Result.collect([Ok(1), Ok(2), Ok(3)]); // Ok([1, 2, 3])
Result.collect([Ok(1), Err('x')]);     // Err('x')

// Convert nullable
Result.fromNullable(maybeValue, () => 'was null');

// Partition without short-circuiting
Result.partition([Ok(1), Err('a'), Ok(2)]); // { ok: [1, 2], err: ['a'] }
```

**Methods:** `map`, `mapErr`, `flatMap`, `tap`, `tapErr`, `zip`, `ap`, `match`, `unwrap`, `unwrapOr`, `unwrapOrElse`, `unwrapErr`, `toOption`, `toJSON`, `toString`, `isOk`, `isErr`

**Static:** `Ok`, `Err`, `tryCatch`, `fromNullable`, `collect`, `sequence`, `traverse`, `partition`, `match`, `is`

## Option\<T\>

A value that is either `Some(value)` or `None`. Replaces null checks.

```ts
import { Some, None, Option } from '@igorjs/pure-fx'

const find = (id: string): Option<User> =>
  users.has(id) ? Some(users.get(id)) : None;

find('u1').map(u => u.name).unwrapOr('anonymous');

// Convert nullable
Option.fromNullable(document.getElementById('app'));

// Collect array of Options
Option.collect([Some(1), Some(2)]); // Some([1, 2])
Option.collect([Some(1), None]);    // None

// Partition
Option.partition([Some(1), None, Some(2)]); // { some: [1, 2], none: 1 }

// Filter, or, toResult
Some(5).filter(n => n > 3);         // Some(5)
Some(1).filter(n => n > 3);         // None
None.or(Some(99));                   // Some(99)
Some('ok').toResult('missing');      // Ok('ok')
```

**Methods:** `map`, `flatMap`, `filter`, `tap`, `zip`, `ap`, `or`, `match`, `unwrap`, `unwrapOr`, `unwrapOrElse`, `toResult`, `toJSON`, `toString`, `isSome`, `isNone`

**Static:** `Some`, `None`, `fromNullable`, `collect`, `sequence`, `traverse`, `partition`, `match`, `is`

## pipe / flow

```ts
import { pipe, flow } from '@igorjs/pure-fx'

// pipe: apply value through functions left-to-right
const result = pipe(5, n => n * 2, n => n + 1); // 11

// flow: compose functions into a new function
const transform = flow(n => n * 2, n => n + 1);
transform(5); // 11
```

## Match

Exhaustive pattern matching on tagged unions.

```ts
import { Match, Ok, Err } from '@igorjs/pure-fx'

const result = Ok(42);

Match(result)
  .with({ tag: 'Ok' }, r => `value: ${r.value}`)
  .with({ tag: 'Err' }, r => `error: ${r.error}`)
  .exhaustive(); // compile error if any variant unhandled

// Predicate guards
Match(value)
  .when(n => n > 100, () => 'big')
  .when(n => n > 0, () => 'small')
  .otherwise(() => 'zero or negative');
```

## Eq / Ord

Typeclass instances for equality and ordering.

```ts
import { Eq, Ord } from '@igorjs/pure-fx'

const byAge = Ord.fromCompare<User>((a, b) => a.age - b.age);
const sorted = [...users].sort(byAge.compare);

const byName = Eq.fromEquals<User>((a, b) => a.name === b.name);
byName.equals(user1, user2);
```

## State\<S, A\>

State monad for threading state through pure computations.

```ts
import { State } from '@igorjs/pure-fx'

const counter = State.get<number>()
  .flatMap(n => State.set(n + 1).map(() => n));

counter.run(0);  // [0, 1] - [returnValue, finalState]
counter.run(5);  // [5, 6]
```

## Lens / LensOptional / Prism / Traversal / Iso

Composable optics for immutable data access and updates.

```ts
import { Lens, LensOptional, Iso } from '@igorjs/pure-fx'

// Property lens
const name = Lens.prop<User>()('name');
name.get(user);              // 'Alice'
name.set('Bob')(user);       // { ...user, name: 'Bob' }

// Composed deep lens
const street = Lens.prop<User>()('address')
  .compose(Lens.prop<Address>()('street'));

// Optional (nullable field)
const bio = LensOptional.fromNullable<User>()('bio');
bio.getOption(user); // Some('...') or None

// Iso (invertible transformation)
const celsius = Iso.from<number, number>(
  c => c * 9/5 + 32,   // to fahrenheit
  f => (f - 32) * 5/9,  // back to celsius
);
celsius.get(100);          // 212
celsius.reverseGet(212);   // 100
celsius.reverse().get(212); // 100
```

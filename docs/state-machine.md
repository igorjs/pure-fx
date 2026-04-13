# StateMachine

Type-safe finite state machine with compile-time transition validation, runtime Result-based validation, guards, actions, and entry/exit hooks.

## Basic Usage

```ts
import { StateMachine } from '@igorjs/pure-ts'

const machine = StateMachine({
  initial: 'idle',
  states: { idle: {}, loading: {}, success: {}, error: {} },
  transitions: {
    idle:    { FETCH: 'loading' },
    loading: { RESOLVE: 'success', REJECT: 'error' },
    success: { RESET: 'idle' },
    error:   { RETRY: 'loading', RESET: 'idle' },
  },
});
```

## Compile-Time Safety

The `transition` method only accepts events that are valid for the current state. Invalid events are type errors:

```ts
// Compiles: FETCH is valid in 'idle'
machine.transition('idle', ctx, 'FETCH');     // ['loading', ctx]

// TYPE ERROR: RESOLVE is not valid in 'idle'
machine.transition('idle', ctx, 'RESOLVE');
//                               ~~~~~~~~~
// Argument of type '"RESOLVE"' is not assignable
```

## Runtime Validation

The `send` method accepts any string and returns `Result`:

```ts
const result = machine.send('idle', ctx, 'FETCH');
// Result<[string, Context], InvalidTransition>

if (result.isOk) {
  const [nextState, nextCtx] = result.value;
}
if (result.isErr) {
  console.log(result.error.message); // "Event 'RESOLVE' not valid in state 'idle'"
}
```

## Guards

Predicates that can block transitions at runtime even when the event is valid:

```ts
const door = StateMachine({
  initial: 'locked',
  states: { locked: {}, unlocked: {} },
  transitions: {
    locked: {
      UNLOCK: {
        target: 'unlocked',
        guard: ctx => ctx.hasKey, // only if they have a key
      },
    },
    unlocked: { LOCK: 'locked' },
  },
});

door.send('locked', { hasKey: false }, 'UNLOCK');
// Err(InvalidTransition("Guard blocked 'UNLOCK' in state 'locked'"))

door.send('locked', { hasKey: true }, 'UNLOCK');
// Ok(['unlocked', { hasKey: true }])
```

## Actions

Transform context during a transition:

```ts
const counter = StateMachine({
  initial: 'idle',
  states: { idle: {}, active: {} },
  transitions: {
    idle: {
      START: {
        target: 'active',
        action: ctx => ({ ...ctx, count: ctx.count + 1 }),
      },
    },
    active: { STOP: 'idle' },
  },
});

const result = counter.send('idle', { count: 0 }, 'START');
// Ok(['active', { count: 1 }])
```

## Entry/Exit Hooks

State-level hooks that fire on every entry or exit:

```ts
const workflow = StateMachine({
  initial: 'draft',
  states: {
    draft: {
      onExit: ctx => ({ ...ctx, leftDraft: true }),
    },
    review: {
      onEntry: ctx => ({ ...ctx, enteredReview: true }),
      onExit: ctx => ({ ...ctx, leftReview: true }),
    },
    published: {
      onEntry: ctx => ({ ...ctx, publishedAt: Date.now() }),
    },
  },
  transitions: {
    draft: { SUBMIT: 'review' },
    review: { APPROVE: 'published', REJECT: 'draft' },
    published: {},
  },
});
```

**Execution order:** `source.onExit` -> `transition.action` -> `target.onEntry`

## Introspection

```ts
machine.initial;                    // 'idle'
machine.states;                     // ['idle', 'loading', 'success', 'error']
machine.events('idle');             // ['FETCH']
machine.events('loading');          // ['RESOLVE', 'REJECT']
machine.canTransition('idle', 'FETCH');    // true
machine.canTransition('idle', 'RESOLVE');  // false
```

## Full Example: Traffic Light

```ts
const light = StateMachine({
  initial: 'red',
  states: {
    red:    { onEntry: ctx => ({ ...ctx, color: 'red' }) },
    green:  { onEntry: ctx => ({ ...ctx, color: 'green' }) },
    yellow: { onEntry: ctx => ({ ...ctx, color: 'yellow' }) },
  },
  transitions: {
    red:    { TIMER: 'green' },
    green:  { TIMER: 'yellow' },
    yellow: { TIMER: 'red' },
  },
});

let [state, ctx] = ['red', { color: 'red' }];
[state, ctx] = light.transition(state, ctx, 'TIMER'); // green
[state, ctx] = light.transition(state, ctx, 'TIMER'); // yellow
[state, ctx] = light.transition(state, ctx, 'TIMER'); // red
```

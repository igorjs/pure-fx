/**
 * integration-web.mjs - Comprehensive cross-runtime smoke test for all pure and
 * web-standard modules.
 *
 * Tests every module that requires no runtime-specific APIs: core (Result,
 * Option, Validation, pipe, Match, Eq, Ord, State, Lens, Prism), data
 * (Schema, Codec, Record, List, HashMap, NonEmptyList, StableVec, ADT),
 * async (Task, Stream, Lazy, Retry, Semaphore, Cache, Channel, Queue,
 * EventEmitter, StateMachine, CircuitBreaker, Pool, Timer, Env),
 * types (Duration, Cron, ErrType), and io (Json, Crypto, Encoding, Url,
 * Clone, Compression).
 *
 * Designed to run in restricted environments: Cloudflare Workers (miniflare)
 * and browsers (Playwright). Uses only console.log for output.
 *
 * Run directly:    node tests/integration-web.mjs
 * Via miniflare:   see tests/workers/worker.mjs
 * Via Playwright:  see tests/browser/browser.test.mjs
 */

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: smoke test is intentionally a single large function
export async function runIntegrationWeb(lib) {
  let passed = 0;
  let failed = 0;
  const logs = [];

  const log = msg => logs.push(msg);
  const assert = (condition, message) => {
    if (!condition) {
      log(`  FAIL: ${message}`);
      failed++;
    } else {
      log(`  ok: ${message}`);
      passed++;
    }
  };
  const section = name => log(`\n--- ${name} ---`);

  const {
    Ok,
    Err,
    Some,
    None,
    Result,
    Option,
    Valid,
    Invalid,
    Validation,
    pipe,
    flow,
    Match,
    Eq,
    Ord,
    State,
    Lens,
    Prism,
    Iso,
    Traversal,
    Record,
    List,
    NonEmptyList,
    HashMap,
    StableVec,
    ADT,
    Schema,
    Codec,
    ErrType,
    Duration,
    Cron,
    Task,
    Stream,
    Lazy,
    Env,
    Retry,
    Semaphore,
    Mutex,
    Cache,
    Channel,
    Queue,
    EventEmitter,
    StateMachine,
    CircuitBreaker,
    Timer,
    Json,
    Encoding,
    Url,
    Crypto,
    Clone,
    Compression,
    LensOptional,
    RateLimiter,
    Pool,
    tryCatch,
    isImmutable,
    makeTask,
    File,
    Command,
    Process,
    Os,
    Dns,
    Net,
    Terminal,
    FFI,
  } = lib;

  // ── Core: Result ────────────────────────────────────────────────────────

  section("Result");
  {
    const ok = Ok(42);
    assert(ok.isOk === true, "Ok(42).isOk");
    assert(ok.value === 42, "Ok(42).value === 42");
    assert(ok.map(x => x * 2).unwrap() === 84, "Ok.map");
    assert(ok.flatMap(x => Ok(x + 1)).unwrap() === 43, "Ok.flatMap");
    assert(ok.unwrapOr(0) === 42, "Ok.unwrapOr");
    assert(ok.toOption().isSome, "Ok.toOption");
    assert(ok.zip(Ok(1)).unwrap()[1] === 1, "Ok.zip");
    assert(ok.ap(Ok(n => n + 1)).unwrap() === 43, "Ok.ap");

    const err = Err("fail");
    assert(err.isErr === true, "Err.isErr");
    assert(err.map(() => 99).isErr, "Err.map stays Err");
    assert(err.mapErr(e => e.toUpperCase()).unwrapErr() === "FAIL", "Err.mapErr");
    assert(err.unwrapOr(0) === 0, "Err.unwrapOr");
    assert(err.toOption().isNone, "Err.toOption");

    assert(Result.collect([Ok(1), Ok(2)]).unwrap().length === 2, "Result.collect");
    assert(Result.collect([Ok(1), Err("x")]).isErr, "Result.collect short-circuits");
    assert(Result.traverse([1, 2], n => Ok(n * 10)).unwrap()[1] === 20, "Result.traverse");
    assert(Result.fromNullable(0, () => "e").unwrap() === 0, "Result.fromNullable(0)");
    assert(Result.fromNullable(null, () => "e").isErr, "Result.fromNullable(null)");
    const { ok: oks, err: errs } = Result.partition([Ok(1), Err("a"), Ok(2)]);
    assert(oks.length === 2 && errs.length === 1, "Result.partition");
    assert(Result.is(Ok(1)) && !Result.is(42), "Result.is");
  }

  // ── Core: Option ────────────────────────────────────────────────────────

  section("Option");
  {
    const some = Some(10);
    assert(some.isSome && some.unwrap() === 10, "Some(10)");
    assert(some.map(x => x + 5).unwrap() === 15, "Some.map");
    assert(some.filter(x => x > 5).isSome, "Some.filter pass");
    assert(some.filter(x => x > 20).isNone, "Some.filter fail");
    assert(some.zip(Some(1)).unwrap()[0] === 10, "Some.zip");
    assert(some.or(Some(99)).unwrap() === 10, "Some.or");

    assert(None.isNone === true, "None.isNone");
    assert(None.map(() => 99).isNone, "None.map");
    assert(None.unwrapOr(99) === 99, "None.unwrapOr");
    assert(None.or(Some(99)).unwrap() === 99, "None.or");

    assert(Option.fromNullable(0).unwrap() === 0, "Option.fromNullable(0)");
    assert(Option.fromNullable(null).isNone, "Option.fromNullable(null)");
    assert(Option.collect([Some(1), Some(2)]).unwrap().length === 2, "Option.collect");
    assert(Option.is(Some(1)) && !Option.is(42), "Option.is");
  }

  // ── Core: Validation ───────────────────────────────────────────────────

  section("Validation");
  {
    assert(Valid(42).isValid && Valid(42).value === 42, "Valid(42)");
    assert(Invalid("e").isInvalid, "Invalid('e')");
    assert(Invalid(["a", "b"]).errors.length === 2, "Invalid array");

    const v = Valid(1).zip(Valid(2));
    assert(v.isValid && v.value[0] === 1, "Valid.zip");

    const errs = Invalid("a").zip(Invalid("b"));
    assert(errs.isInvalid && errs.errors.length === 2, "Invalid.zip accumulates");

    const collected = Validation.collect([Valid(1), Invalid("x"), Valid(3), Invalid("y")]);
    assert(collected.isInvalid && collected.errors.length === 2, "Validation.collect");

    assert(Validation.fromResult(Ok(1)).isValid, "Validation.fromResult(Ok)");
    assert(Validation.fromResult(Err("e")).isInvalid, "Validation.fromResult(Err)");
  }

  // ── Core: pipe / flow ──────────────────────────────────────────────────

  section("pipe / flow");
  assert(
    pipe(
      5,
      x => x * 2,
      x => x + 1,
    ) === 11,
    "pipe(5, *2, +1)",
  );
  assert(
    flow(
      x => x * 3,
      x => x - 1,
    )(4) === 11,
    "flow(*3, -1)(4)",
  );

  // ── Core: Match ────────────────────────────────────────────────────────

  section("Match");
  {
    const val = Match(2)
      .when(
        v => v === 2,
        () => "two",
      )
      .otherwise(() => "other");
    assert(val === "two", "Match(2) returns 'two'");

    const val2 = Match(99)
      .when(
        v => v === 1,
        () => "one",
      )
      .otherwise(() => "other");
    assert(val2 === "other", "Match fallback");
  }

  // ── Core: Eq / Ord ────────────────────────────────────────────────────

  section("Eq / Ord");
  assert(Eq.string.equals("a", "a"), "Eq.string equal");
  assert(!Eq.string.equals("a", "b"), "Eq.string not equal");
  assert(Eq.number.equals(1, 1), "Eq.number equal");
  assert(Ord.number.compare(1, 2) < 0, "Ord.number 1 < 2");
  assert(Ord.string.compare("b", "a") > 0, "Ord.string b > a");

  // ── Core: State ────────────────────────────────────────────────────────

  section("State");
  {
    const inc = State.of(42);
    const [val, newState] = inc.run("initial");
    assert(val === 42 && newState === "initial", "State.of run");

    const doubled = inc.map(v => v * 2);
    const [val2] = doubled.run("s");
    assert(val2 === 84, "State.map");

    const get = State.get();
    const [gotten] = get.run(99);
    assert(gotten === 99, "State.get");
  }

  // ── Core: Lens ─────────────────────────────────────────────────────────

  section("Lens / Prism / Iso");
  {
    const nameLens = Lens.from(
      obj => obj.name,
      (val, obj) => ({ ...obj, name: val }),
    );
    const obj = { name: "Alice", age: 30 };
    assert(nameLens.get(obj) === "Alice", "Lens.get");
    assert(nameLens.set("Bob")(obj).name === "Bob", "Lens.set");
    assert(nameLens.modify(s => s.toUpperCase())(obj).name === "ALICE", "Lens.modify");

    const numPrism = Prism.from(
      v => (typeof v === "number" ? Some(v) : None),
      v => v,
    );
    assert(numPrism.getOption(42).unwrap() === 42, "Prism.getOption Some");
    assert(numPrism.getOption("hi").isNone, "Prism.getOption None");

    const celsius = Iso.from(
      c => (c * 9) / 5 + 32,
      f => ((f - 32) * 5) / 9,
    );
    assert(celsius.get(0) === 32, "Iso.get");
    assert(celsius.reverseGet(32) === 0, "Iso.reverseGet");
  }

  // ── Data: Schema ───────────────────────────────────────────────────────

  section("Schema");
  {
    assert(Schema.number.parse(42).unwrap() === 42, "Schema.number");
    assert(Schema.string.parse("hi").unwrap() === "hi", "Schema.string");
    assert(Schema.boolean.parse(true).unwrap() === true, "Schema.boolean");
    assert(Schema.number.parse("x").isErr, "Schema.number rejects string");

    const obj = Schema.object({ name: Schema.string, age: Schema.number });
    assert(obj.parse({ name: "A", age: 1 }).isOk, "Schema.object valid");
    assert(obj.parse({ name: 1, age: 1 }).isErr, "Schema.object invalid");

    assert(Schema.array(Schema.number).parse([1, 2]).isOk, "Schema.array");
    assert(Schema.literal("x").parse("x").isOk, "Schema.literal");
    assert(Schema.email.parse("a@b.c").isOk, "Schema.email");
    assert(Schema.int.parse(5).isOk, "Schema.int");
    assert(Schema.positive.parse(1).isOk, "Schema.positive");
  }

  // ── Data: Codec ────────────────────────────────────────────────────────

  section("Codec");
  {
    const numCodec = Codec.number;
    assert(numCodec.decode(42).isOk, "Codec.number.decode");
    assert(numCodec.encode(42) === 42, "Codec.number.encode");

    const strCodec = Codec.string;
    assert(strCodec.decode("hi").isOk, "Codec.string.decode");
  }

  // ── Data: Record / List ────────────────────────────────────────────────

  section("Record / List");
  {
    const rec = Record({ name: "test", age: 25 });
    assert(rec.name === "test", "Record access");
    const updated = rec.produce(d => {
      d.age = 26;
    });
    assert(updated.age === 26 && rec.age === 25, "Record.produce");
    assert(rec.equals(Record({ name: "test", age: 25 })), "Record.equals");

    const list = List([3, 1, 4]);
    assert(list.length === 3, "List.length");
    assert(list.map(x => x * 2)[0] === 6, "List.map");
    assert(list.filter(x => x > 2).length === 2, "List.filter");
    assert(list.find(x => x === 1).unwrap() === 1, "List.find");
    assert(list.at(-1).unwrap() === 4, "List.at(-1)");
    assert(list.append(5).length === 4, "List.append");
    assert(list.prepend(0)[0] === 0, "List.prepend");
  }

  // ── Data: HashMap ──────────────────────────────────────────────────────

  section("HashMap");
  {
    const m = HashMap.of([
      ["a", 1],
      ["b", 2],
    ]);
    assert(m.size === 2, "HashMap.size");
    assert(m.get("a").unwrap() === 1, "HashMap.get");
    assert(m.has("b"), "HashMap.has");
    assert(!m.has("z"), "HashMap.has missing");

    const m2 = m.set("c", 3);
    assert(m2.size === 3 && m.size === 2, "HashMap.set immutable");
    assert(m2.delete("a").size === 2, "HashMap.delete");

    const mapped = m.map(v => v * 10);
    assert(mapped.get("a").unwrap() === 10, "HashMap.map");
    assert(m.filter(v => v > 1).size === 1, "HashMap.filter");
    assert(
      m.equals(
        HashMap.of([
          ["b", 2],
          ["a", 1],
        ]),
      ),
      "HashMap.equals",
    );

    assert(HashMap.fromObject({ x: 1 }).get("x").unwrap() === 1, "HashMap.fromObject");
    assert(HashMap.is(m) && !HashMap.is(new Map()), "HashMap.is");
  }

  // ── Data: NonEmptyList ─────────────────────────────────────────────────

  section("NonEmptyList");
  {
    const nel = NonEmptyList.of(1, 2, 3);
    assert(nel.head === 1, "NonEmptyList.head");
    assert(nel.length === 3, "NonEmptyList.length");
    assert(nel[1] === 2, "NonEmptyList index access");

    const from = NonEmptyList.from([10, 20]);
    assert(from.isSome && from.unwrap().head === 10, "NonEmptyList.from");
    assert(NonEmptyList.from([]).isNone, "NonEmptyList.from empty");
  }

  // ── Data: StableVec ────────────────────────────────────────────────────

  section("StableVec");
  {
    const vec = StableVec.create();
    const h1 = vec.insert("a");
    const h2 = vec.insert("b");
    assert(vec.get(h1).unwrap() === "a", "StableVec.get");
    assert(vec.length === 2, "StableVec.length");
    assert(vec.remove(h1) === true, "StableVec.remove");
    assert(vec.get(h1).isNone, "StableVec stale handle");
    assert(vec.length === 1, "StableVec.length after remove");
    assert(vec.isValid(h2), "StableVec.isValid");
  }

  // ── Data: ADT ──────────────────────────────────────────────────────────

  section("ADT");
  {
    const Shape = ADT({
      Circle: radius => ({ radius }),
      Rect: (w, h) => ({ w, h }),
    });
    const c = Shape.Circle(5);
    assert(c.tag === "Circle", "ADT tag");
    assert(c.radius === 5, "ADT value");
    assert(Shape.is.Circle(c), "ADT type guard");

    const r = Shape.Rect(3, 4);
    assert(r.tag === "Rect" && r.w === 3, "ADT Rect");

    const area = Match(c)
      .when(
        v => v.tag === "Circle",
        v => Math.PI * v.radius * v.radius,
      )
      .otherwise(() => 0);
    assert(Math.abs(area - Math.PI * 25) < 0.001, "ADT + Match");
  }

  // ── Types: Duration / Cron / ErrType ───────────────────────────────────

  section("Duration / Cron / ErrType");
  {
    assert(Duration.seconds(2) === 2000, "Duration.seconds");
    assert(Duration.minutes(1) === 60000, "Duration.minutes");
    assert(typeof Duration.format(90000) === "string", "Duration.format");

    assert(Cron.parse("* * * * *").isOk, "Cron.parse valid");
    assert(Cron.parse("invalid").isErr, "Cron.parse invalid");

    const MyErr = ErrType("MyErr");
    const e = MyErr("oops");
    assert(e.tag === "MyErr", "ErrType tag");
    assert(e.message === "oops", "ErrType message");
    assert(ErrType.is(e), "ErrType.is");
  }

  // ── Async: Task ────────────────────────────────────────────────────────

  section("Task");
  {
    const r = await Task.of(42).run();
    assert(r.isOk && r.value === 42, "Task.of");

    const mapped = await Task.of(10)
      .map(x => x + 5)
      .run();
    assert(mapped.unwrap() === 15, "Task.map");

    const chained = await Task.of(5)
      .flatMap(n => Task.of(n * 2))
      .run();
    assert(chained.unwrap() === 10, "Task.flatMap");

    const all = await Task.all([Task.of(1), Task.of(2)]).run();
    assert(all.unwrap().length === 2, "Task.all");

    const fromErr = await Task.fromResult(Err("e")).run();
    assert(fromErr.isErr, "Task.fromResult(Err)");
  }

  // ── Async: Stream ──────────────────────────────────────────────────────

  section("Stream");
  {
    const r = await Stream.of(1, 2, 3).collect().run();
    assert(r.isOk && r.value.length === 3, "Stream.of + collect");

    const filtered = await Stream.of(1, 2, 3, 4)
      .filter(x => x % 2 === 0)
      .collect()
      .run();
    assert(filtered.unwrap().length === 2, "Stream.filter");

    const mapped = await Stream.of(1, 2)
      .map(x => x * 10)
      .collect()
      .run();
    assert(mapped.unwrap()[0] === 10, "Stream.map");
  }

  // ── Async: Lazy ────────────────────────────────────────────────────────

  section("Lazy");
  {
    let calls = 0;
    const lazy = Lazy(() => {
      calls++;
      return 42;
    });
    assert(calls === 0, "Lazy deferred");
    assert(lazy.value === 42, "Lazy.value");
    const _ = lazy.value;
    assert(calls === 1, "Lazy memoized");
  }

  // ── Async: Env ─────────────────────────────────────────────────────────

  section("Env");
  {
    const greet = Env.access().map(ctx => `Hello ${ctx.name}`);
    const r = await greet.run({ name: "World" });
    assert(r.unwrap() === "Hello World", "Env.run");
  }

  // ── Async: Semaphore / Mutex ───────────────────────────────────────────

  section("Semaphore / Mutex");
  {
    const sem = Semaphore.create(2);
    assert(sem.available() === 2, "Semaphore initial available");
    const r1 = await sem.acquire();
    assert(sem.available() === 1, "Semaphore after acquire");
    r1();
    assert(sem.available() === 2, "Semaphore after release");

    const mtx = Mutex.create();
    const val = await mtx.wrap(Task.of(42)).run();
    assert(val.isOk && val.value === 42, "Mutex.wrap");
  }

  // ── Async: Cache ───────────────────────────────────────────────────────

  section("Cache");
  {
    const cache = Cache.create({ maxSize: 10 });
    cache.set("k", 42);
    assert(cache.get("k").unwrap() === 42, "Cache.get hit");
    assert(cache.get("missing").isNone, "Cache.get miss");
    assert(cache.size() === 1, "Cache.size");
    cache.delete("k");
    assert(cache.get("k").isNone, "Cache after delete");
  }

  // ── Async: Channel ────────────────────────────────────────────────────

  section("Channel");
  {
    const ch = Channel.unbounded();
    await ch.send(1);
    await ch.send(2);
    ch.close();
    const items = [];
    for await (const item of ch.receive()) {
      items.push(item);
    }
    assert(items.length === 2 && items[0] === 1, "Channel send/receive");
  }

  // ── Async: EventEmitter ───────────────────────────────────────────────

  section("EventEmitter");
  {
    const ee = EventEmitter.create();
    let received = 0;
    const handler = val => {
      received = val;
    };
    ee.on("test", handler);
    ee.emit("test", 42);
    assert(received === 42, "EventEmitter emit/on");
    ee.off("test", handler);
    ee.emit("test", 99);
    assert(received === 42, "EventEmitter off stops listener");
  }

  // ── Async: StateMachine ───────────────────────────────────────────────

  section("StateMachine");
  {
    const sm = StateMachine({
      states: {
        idle: {},
        running: {},
      },
      transitions: {
        idle: { start: "running" },
        running: { stop: "idle" },
      },
      initial: "idle",
    });
    assert(sm.initial === "idle", "StateMachine initial");
    const r = sm.send("idle", undefined, "start");
    assert(r.isOk, "StateMachine transition");
    assert(r.value[0] === "running", "StateMachine new state");
    const r2 = sm.send("running", undefined, "start");
    assert(r2.isErr, "StateMachine invalid transition");
  }

  // ── Async: Timer ──────────────────────────────────────────────────────

  section("Timer");
  {
    const start = Timer.now();
    await Timer.sleep(10).run();
    const elapsed = Timer.now() - start;
    assert(elapsed >= 5, "Timer.sleep waited");
  }

  // ── IO: Json ───────────────────────────────────────────────────────────

  section("Json");
  assert(Json.parse('{"a":1}').unwrap().a === 1, "Json.parse");
  assert(Json.parse("{bad}").isErr, "Json.parse invalid");
  assert(Json.stringify({ b: 2 }).unwrap() === '{"b":2}', "Json.stringify");

  // ── IO: Encoding ──────────────────────────────────────────────────────

  section("Encoding");
  {
    const bytes = Encoding.utf8.encode("hello");
    assert(bytes instanceof Uint8Array && bytes.length === 5, "Encoding.utf8.encode");
    assert(Encoding.utf8.decode(bytes).unwrap() === "hello", "Encoding.utf8.decode");
    assert(Encoding.hex.encode(bytes) === "68656c6c6f", "Encoding.hex.encode");
    assert(Encoding.hex.decode("68656c6c6f").isOk, "Encoding.hex.decode");
    assert(typeof Encoding.base64.encode(bytes) === "string", "Encoding.base64.encode");
  }

  // ── IO: Url ────────────────────────────────────────────────────────────

  section("Url");
  {
    const u = Url.parse("https://example.com/path?q=1");
    assert(u.isOk && u.value.hostname === "example.com", "Url.parse");
    assert(Url.parse("not a url").isErr, "Url.parse invalid");
  }

  // ── IO: Crypto ─────────────────────────────────────────────────────────

  section("Crypto");
  {
    const uuid = Crypto.uuid();
    assert(typeof uuid === "string" && uuid.length === 36, "Crypto.uuid");

    const bytes = Crypto.randomBytes(16);
    assert(bytes.isOk && bytes.value.length === 16, "Crypto.randomBytes");

    const ri = Crypto.randomInt(0, 100);
    assert(ri.isOk && ri.value >= 0 && ri.value < 100, "Crypto.randomInt");

    const hash = await Crypto.hash("SHA-256", "hello").run();
    assert(hash.isOk && hash.value.length === 32, "Crypto.hash");

    const hex = await Crypto.hashHex("SHA-256", "hello").run();
    assert(hex.isOk && hex.value.length === 64, "Crypto.hashHex");

    assert(
      Crypto.timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
      "timingSafeEqual true",
    );
    assert(
      !Crypto.timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
      "timingSafeEqual false",
    );

    // HMAC
    const hmacKey = (await Crypto.generateKey.hmac("SHA-256").run()).unwrap();
    const sig = (await Crypto.hmac.sign(hmacKey, "data").run()).unwrap();
    const valid = (await Crypto.hmac.verify(hmacKey, sig, "data").run()).unwrap();
    assert(valid === true, "HMAC sign/verify");

    // AES-GCM
    const aesKey = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const enc = (await Crypto.aesGcm.encrypt(aesKey, "secret").run()).unwrap();
    const dec = (await Crypto.aesGcm.decrypt(aesKey, enc.iv, enc.data).run()).unwrap();
    assert(new TextDecoder().decode(dec) === "secret", "AES-GCM roundtrip");

    // ECDSA
    const ecPair = (await Crypto.generateKey.ecdsa("P-256").run()).unwrap();
    const ecSig = (await Crypto.ecdsa.sign(ecPair.privateKey, "msg").run()).unwrap();
    const ecValid = (await Crypto.ecdsa.verify(ecPair.publicKey, ecSig, "msg").run()).unwrap();
    assert(ecValid === true, "ECDSA sign/verify");

    // PBKDF2
    const derived = (
      await Crypto.pbkdf2.deriveBits("pass", new Uint8Array(16), 1000, "SHA-256", 256).run()
    ).unwrap();
    assert(derived.length === 32, "PBKDF2 deriveBits");

    // ECDH
    const alice = (await Crypto.generateKey.ecdh("P-256").run()).unwrap();
    const bob = (await Crypto.generateKey.ecdh("P-256").run()).unwrap();
    const sharedA = (
      await Crypto.ecdh.deriveBits(alice.privateKey, bob.publicKey, 256).run()
    ).unwrap();
    const sharedB = (
      await Crypto.ecdh.deriveBits(bob.privateKey, alice.publicKey, 256).run()
    ).unwrap();
    assert(sharedA.length === 32, "ECDH deriveBits length");
    let ecdhMatch = true;
    for (let i = 0; i < sharedA.length; i++) {
      if (sharedA[i] !== sharedB[i]) {
        ecdhMatch = false;
        break;
      }
    }
    assert(ecdhMatch, "ECDH shared secret matches");
  }

  // ── IO: Clone ──────────────────────────────────────────────────────────

  section("Clone");
  {
    const original = { a: 1, b: { c: 2 } };
    const cloned = Clone.deep(original);
    assert(cloned.isOk, "Clone.deep succeeds");
    assert(cloned.value.b.c === 2, "Clone.deep preserves values");
    assert(cloned.value !== original, "Clone.deep returns new object");
    assert(cloned.value.b !== original.b, "Clone.deep deep copies");
  }

  // ── Retry ──────────────────────────────────────────────────────────────

  section("Retry");
  {
    let attempts = 0;
    const policy = Retry.policy().maxAttempts(3).delay(1).build();
    const task = Retry.apply(
      policy,
      Task(() => {
        attempts++;
        if (attempts < 3) return Promise.resolve(Err("fail"));
        return Promise.resolve(Ok("done"));
      }),
    );
    const r = await task.run();
    assert(r.isOk && r.value === "done", "Retry succeeds after retries");
    assert(attempts === 3, `Retry attempted ${attempts} times`);
  }

  // ── CircuitBreaker ────────────────────────────────────────────────────

  section("CircuitBreaker");
  {
    const cb = CircuitBreaker.create({ threshold: 2, resetTimeout: 100 });
    assert(cb.state() === "closed", "CircuitBreaker starts closed");
    await cb.protect(Task.of(1)).run();
    assert(cb.state() === "closed", "CircuitBreaker stays closed on success");
  }

  // ── RateLimiter ───────────────────────────────────────────────────────

  section("RateLimiter");
  {
    const rl = RateLimiter.create({ capacity: 2, refillRate: 1, refillInterval: 1000 });
    assert(rl.tryAcquire() === true, "RateLimiter first acquire");
    assert(rl.tryAcquire() === true, "RateLimiter second acquire");
    assert(rl.tryAcquire() === false, "RateLimiter exhausted");
  }

  // ── Pool ──────────────────────────────────────────────────────────────

  section("Pool");
  {
    let created = 0;
    const pool = Pool.create({
      create: async () => {
        created++;
        return { id: created };
      },
      maxSize: 2,
    });
    const r = await pool.use(async resource => resource.id).run();
    assert(r.isOk && r.value === 1, "Pool.use");
    await pool.drain();
  }

  // ── LensOptional ──────────────────────────────────────────────────────

  section("LensOptional / Traversal");
  {
    const opt = LensOptional.index(1);
    assert(opt.getOption([10, 20, 30]).unwrap() === 20, "LensOptional.getOption");
    assert(opt.set(99)([10, 20, 30])[1] === 99, "LensOptional.set");

    const t = Traversal.fromArray();
    assert(t.getAll([1, 2, 3]).length === 3, "Traversal.getAll");
    assert(t.modify(x => x * 10)([1, 2])[0] === 10, "Traversal.modify");
  }

  // ── tryCatch / isImmutable / makeTask ─────────────────────────────────

  section("tryCatch / isImmutable / makeTask");
  {
    assert(tryCatch(() => JSON.parse('{"a":1}')).isOk, "tryCatch success");
    assert(tryCatch(() => JSON.parse("bad"), String).isErr, "tryCatch catches");
    assert(isImmutable(Record({ x: 1 })), "isImmutable Record");
    assert(!isImmutable({}), "isImmutable plain object");
    const t = makeTask(async () => Ok(42));
    assert((await t.run()).unwrap() === 42, "makeTask");
  }

  // ── Compression ───────────────────────────────────────────────────────

  section("Compression");
  {
    const input = new TextEncoder().encode("compress me");
    const gz = await Compression.gzip(input).run();
    assert(gz.isOk, "Compression.gzip");
    const ungz = await Compression.gunzip(gz.value).run();
    assert(
      ungz.isOk && new TextDecoder().decode(ungz.value) === "compress me",
      "Compression roundtrip",
    );
  }

  // ── Deep Result coverage ──────────────────────────────────────────────

  section("Result (deep)");
  {
    assert(
      Ok(1)
        .flatMap(n => Ok(n + 1))
        .unwrap() === 2,
      "Result.flatMap",
    );
    assert(Err("e").flatMap(() => Ok(1)).isErr, "Result.flatMap short-circuits");
    assert(
      Err("e")
        .mapErr(e => `${e}!`)
        .unwrapErr() === "e!",
      "Err.mapErr",
    );
    let tapped = 0;
    Ok(42).tap(v => {
      tapped = v;
    });
    assert(tapped === 42, "Ok.tap");
    assert(Ok(1).unwrapOrElse(() => 99) === 1, "Ok.unwrapOrElse");
    assert(Err("e").unwrapOrElse(() => 99) === 99, "Err.unwrapOrElse");
    assert(Ok(42).toJSON().tag === "Ok", "Ok.toJSON");
    assert(Ok(42).toString() === "Ok(42)", "Ok.toString");
    assert(Ok(1).zip(Ok(2)).unwrap()[1] === 2, "Ok.zip");
    assert(
      Ok(5)
        .ap(Ok(n => n * 2))
        .unwrap() === 10,
      "Ok.ap",
    );
    const { ok, err } = Result.partition([Ok(1), Err("a"), Ok(2)]);
    assert(ok.length === 2 && err.length === 1, "Result.partition");
  }

  // ── Deep Option coverage ──────────────────────────────────────────────

  section("Option (deep)");
  {
    assert(
      Some(1)
        .flatMap(n => Some(n + 1))
        .unwrap() === 2,
      "Option.flatMap",
    );
    assert(Some(5).filter(n => n > 3).isSome, "Some.filter pass");
    assert(Some(1).filter(n => n > 3).isNone, "Some.filter fail");
    assert(None.or(Some(99)).unwrap() === 99, "None.or");
    assert(Some(1).toResult("err").isOk, "Some.toResult");
    assert(None.toResult("err").isErr, "None.toResult");
    assert(Some(42).toJSON().tag === "Some", "Some.toJSON");
    assert(Some(1).zip(Some(2)).unwrap()[0] === 1, "Some.zip");
    assert(
      Some(5)
        .ap(Some(n => n * 2))
        .unwrap() === 10,
      "Some.ap",
    );
    const { some, none } = Option.partition([Some(1), None, Some(2)]);
    assert(some.length === 2 && none === 1, "Option.partition");
  }

  // ── Deep Task coverage ────────────────────────────────────────────────

  section("Task (deep)");
  {
    const chained = await Task.of(5)
      .flatMap(n => Task.of(n * 2))
      .run();
    assert(chained.unwrap() === 10, "Task.flatMap");

    const errTask = Task(() => Promise.resolve(Err("fail")));
    const mapped = await errTask.mapErr(e => `${e}!`).run();
    assert(mapped.unwrapErr() === "fail!", "Task.mapErr");

    let tapped = 0;
    await Task.of(42)
      .tap(v => {
        tapped = v;
      })
      .run();
    assert(tapped === 42, "Task.tap");

    const zipped = await Task.of("a").zip(Task.of(1)).run();
    assert(zipped.unwrap()[0] === "a", "Task.zip");

    const settled = await Task.allSettled([Task.of(1), errTask]).run();
    assert(settled.unwrap()[0].isOk && settled.unwrap()[1].isErr, "Task.allSettled");

    const ap = await Task.ap(
      Task.of(n => n * 3),
      Task.of(10),
    ).run();
    assert(ap.unwrap() === 30, "Task.ap");

    assert(Task.is(Task.of(1)) && !Task.is(42), "Task.is");

    const fromProm = await Task.fromPromise(() => Promise.resolve(42)).run();
    assert(fromProm.unwrap() === 42, "Task.fromPromise");

    let memo = 0;
    const memoized = Task(() => {
      memo++;
      return Promise.resolve(Ok(1));
    }).memoize();
    await memoized.run();
    await memoized.run();
    assert(memo === 1, "Task.memoize");
  }

  // ── Runtime modules: graceful degradation ──────────────────────────────
  // These modules depend on runtime APIs (File, Command, Process, Os, etc.)
  // In full runtimes (Node/Deno/Bun) they should work.
  // In restricted environments (Workers/Browser) they should return
  // Err/None instead of throwing.

  section("Runtime modules (graceful degradation)");
  {
    // File: methods that always fail on invalid/missing paths
    const fileErrors = [
      ["read", await File.read("/x").run()],
      ["write", await File.write("/x", "d").run()],
      ["append", await File.append("/x", "d").run()],
      ["makeDir", await File.makeDir("/x").run()],
      ["remove", await File.remove("/x").run()],
      ["list", await File.list("/x").run()],
      ["stat", await File.stat("/x").run()],
      ["copy", await File.copy("/x", "/y").run()],
      ["rename", await File.rename("/x", "/y").run()],
      ["readBytes", await File.readBytes("/x").run()],
      ["writeBytes", await File.writeBytes("/x", new Uint8Array()).run()],
      ["symlink", await File.symlink("/x", "/y").run()],
      ["link", await File.link("/x", "/y").run()],
      ["chmod", await File.chmod("/x", 0o644).run()],
      ["chown", await File.chown("/x", 0, 0).run()],
      ["truncate", await File.truncate("/x").run()],
      ["realPath", await File.realPath("/x").run()],
      ["readLink", await File.readLink("/x").run()],
      ["lstat", await File.lstat("/x").run()],
    ];
    for (const [name, result] of fileErrors) {
      assert(result.isErr, `File.${name} returns Err`);
      assert(result.error.tag === "FileError", `File.${name} error has FileError tag`);
    }

    // File.exists: Ok(false) when FS available, Err(FileError) when not
    const existsResult = await File.exists("/nonexistent/path/xyz.txt").run();
    assert(
      (existsResult.isOk && existsResult.value === false) ||
        (existsResult.isErr && existsResult.error.tag === "FileError"),
      "File.exists returns Ok(false) or Err(FileError)",
    );

    // File.removeDir: Ok when path doesn't exist (idempotent), Err when no FS
    const removeDirResult = await File.removeDir("/nonexistent/path").run();
    assert(
      removeDirResult.isOk || (removeDirResult.isErr && removeDirResult.error.tag === "FileError"),
      "File.removeDir returns Ok or Err(FileError)",
    );

    // File.tempDir: Ok when FS available, Err when no FS
    const tempDirResult = await File.tempDir("test-").run();
    if (tempDirResult.isOk) {
      await File.removeDir(tempDirResult.value).run();
    }
    assert(
      tempDirResult.isOk || (tempDirResult.isErr && tempDirResult.error.tag === "FileError"),
      "File.tempDir returns Ok or Err(FileError)",
    );

    // Command: nonexistent command
    const badCmd = await Command.exec("nonexistent-command-xyz-99999").run();
    assert(badCmd.isErr, "Command.exec nonexistent returns Err");
    assert(badCmd.error.tag === "CommandError", "Command error has CommandError tag");

    // Process: should always have pid and cwd
    const pid = Process.pid();
    assert(pid.isSome || pid.isNone, "Process.pid returns Option");
    const cwd = Process.cwd();
    assert(cwd.isOk || cwd.isErr, "Process.cwd returns Result");

    // Process: env for missing var returns None
    const missingEnv = Process.env("NONEXISTENT_ENV_VAR_XYZ_99999");
    assert(missingEnv.isNone, "Process.env missing var returns None");

    // Os: all methods return Option or string, never throw
    assert(typeof Os.arch() === "string", "Os.arch returns string");
    assert(typeof Os.platform() === "string", "Os.platform returns string");
    assert(typeof Os.tmpDir() === "string", "Os.tmpDir returns string");
    const hostname = Os.hostname();
    assert(hostname.isSome || hostname.isNone, "Os.hostname returns Option");
    const cpuCount = Os.cpuCount();
    assert(cpuCount.isSome || cpuCount.isNone, "Os.cpuCount returns Option");
    const totalMem = Os.totalMemory();
    assert(totalMem.isSome || totalMem.isNone, "Os.totalMemory returns Option");

    // FFI: isAvailable returns boolean, open returns Result
    assert(typeof FFI.isAvailable() === "boolean", "FFI.isAvailable returns boolean");
    assert(typeof FFI.suffix === "string", "FFI.suffix returns string");
    const ffiResult = FFI.open("/nonexistent/lib.so", { fn: { parameters: [], result: "void" } });
    assert(ffiResult.isErr, "FFI.open nonexistent lib returns Err");

    // Dns: resolve nonexistent domain
    const badDns = await Dns.resolve("this-domain-does-not-exist-xyz99.invalid").run();
    assert(badDns.isErr, "Dns.resolve invalid domain returns Err");

    // Terminal: properties return correct types
    assert(typeof Terminal.isInteractive() === "boolean", "Terminal.isInteractive returns boolean");
    const termSize = Terminal.size();
    assert(termSize.isSome || termSize.isNone, "Terminal.size returns Option");
  }

  // ── Error type tags ───────────────────────────────────────────────────

  section("Error type tags");
  {
    // Verify all error types have correct tags when returned
    const fileErr = await File.read("/nonexistent").run();
    if (fileErr.isErr) assert(fileErr.error.tag === "FileError", "FileError.tag");

    const cmdErr = await Command.exec("nonexistent-xyz").run();
    if (cmdErr.isErr) assert(cmdErr.error.tag === "CommandError", "CommandError.tag");

    const cryptoBytes = Crypto.randomBytes(-1);
    if (cryptoBytes.isErr) assert(cryptoBytes.error.tag === "CryptoError", "CryptoError.tag");
  }

  // ── Summary ────────────────────────────────────────────────────────────

  log(`\n========================================`);
  log(`Integration test (web): ${passed} passed, ${failed} failed`);
  log(`========================================`);

  return { passed, failed, logs };
}

// Self-execute when run directly (Node/Deno/Bun)
if (typeof process !== "undefined" || typeof Deno !== "undefined") {
  const lib = await import("../dist/index.js");
  const { passed, failed, logs } = await runIntegrationWeb(lib);
  for (const line of logs) {
    console.log(line);
  }
  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * integration.test.js - Cross-module integration & full program simulation.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 *
 * Proves that modules compose correctly at their boundaries:
 * Schema->Record, Result<->Option, ErrType->Task, pipe/flow with monads, etc.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Record,
  List,
  Schema,
  Ok,
  Err,
  Some,
  None,
  Result,
  Option,
  match,
  tryCatch,
  pipe,
  flow,
  Lazy,
  Task,
  isImmutable,
  ErrType,
  Program,
} = await import("../dist/index.js");

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1: Cross-Module Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Schema -> Record -> List pipeline", () => {
  const ProductSchema = Schema.object({
    id: Schema.number,
    name: Schema.string,
    price: Schema.number.refine(n => n > 0, "positive price"),
  });

  const rawProducts = [
    { id: 1, name: "Widget", price: 9.99 },
    { id: 2, name: "Gadget", price: 24.95 },
    { id: 3, name: "Gizmo", price: 14.5 },
  ];

  it("parses raw objects into plain validated data and collects with Result.collect", () => {
    const results = rawProducts.map(p => ProductSchema.parse(p));
    const collected = Result.collect(results);
    expect(collected.isOk).toBe(true);

    const products = collected.unwrap();
    expect(products.length).toBe(3);
    expect(products[0].name).toBe("Widget");
    expect(products[1].name).toBe("Gadget");
  });

  it("converts parsed Records to List and queries with Option-returning methods", () => {
    const parsed = rawProducts.map(p => ProductSchema.parse(p).unwrap());
    const list = List(parsed);

    expect(list.length).toBe(3);
    expect(list.first().unwrap().name).toBe("Widget");
    expect(list.last().unwrap().name).toBe("Gizmo");
    expect(list.at(1).unwrap().name).toBe("Gadget");

    const found = list.find(p => p.name === "Gadget");
    expect(found.isSome).toBe(true);
    expect(found.unwrap().price).toBe(24.95);

    const missing = list.find(p => p.name === "Nope");
    expect(missing.isNone).toBe(true);
  });

  it("schema failure stays in Result and never reaches Record/List", () => {
    const bad = { id: "not-a-number", name: "Bad", price: 10 };
    const result = ProductSchema.parse(bad);
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().path).toEqual(["id"]);
    expect(result.unwrapErr().expected).toBe("number");
  });
});

describe("Result <-> Option conversions", () => {
  it("Ok -> toOption -> Some -> toResult -> Ok round-trip", () => {
    const original = Ok(42);
    const opt = original.toOption();
    expect(opt.isSome).toBe(true);
    expect(opt.unwrap()).toBe(42);

    const backToResult = opt.toResult("missing");
    expect(backToResult.isOk).toBe(true);
    expect(backToResult.unwrap()).toBe(42);
  });

  it("Err -> toOption -> None -> toResult(newError) -> Err round-trip", () => {
    const original = Err("first error");
    const opt = original.toOption();
    expect(opt.isNone).toBe(true);

    const backToResult = opt.toResult("replacement error");
    expect(backToResult.isErr).toBe(true);
    expect(backToResult.unwrapErr()).toBe("replacement error");
  });

  it("Option.fromNullable chains into toResult for null-safe lookup", () => {
    const lookup = key => {
      const map = { admin: "Alice", user: "Bob" };
      return Option.fromNullable(map[key]);
    };

    const found = lookup("admin").toResult("not found");
    expect(found.isOk).toBe(true);
    expect(found.unwrap()).toBe("Alice");

    const missing = lookup("guest").toResult("not found");
    expect(missing.isErr).toBe(true);
    expect(missing.unwrapErr()).toBe("not found");
  });
});

describe("ErrType -> Result -> Task error pipeline", () => {
  const ValidationError = ErrType("ValidationError");
  const NetworkError = ErrType("NetworkError");

  it("happy path: both Tasks succeed through flatMap chain", async () => {
    const validate = value => Task(async () => Ok(value));
    const save = value => Task(async () => Ok({ saved: true, value }));

    const result = await validate("data")
      .flatMap(v => save(v))
      .run();

    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual({ saved: true, value: "data" });
  });

  it("validation failure short-circuits flatMap", async () => {
    let secondRan = false;
    const validate = () =>
      Task.fromResult(ValidationError("bad input", { field: "email" }).toResult());
    const save = () =>
      Task(async () => {
        secondRan = true;
        return Ok("saved");
      });

    const result = await validate()
      .flatMap(() => save())
      .run();

    expect(result.isErr).toBe(true);
    expect(secondRan).toBe(false);
    const err = result.unwrapErr();
    expect(err.tag).toBe("ValidationError");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.metadata).toEqual({ field: "email" });
  });

  it("network failure propagates with full ErrType structure", async () => {
    const fetchData = () =>
      Task.fromResult(NetworkError("connection refused", { host: "api.example.com" }).toResult());

    const result = await fetchData()
      .map(d => d.toUpperCase())
      .run();

    expect(result.isErr).toBe(true);
    const err = result.unwrapErr();
    expect(err.tag).toBe("NetworkError");
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toBe("connection refused");
    expect(err.metadata).toEqual({ host: "api.example.com" });
    expect(typeof err.timestamp).toBe("number");
  });
});

describe("pipe/flow with monadic types", () => {
  it("pipe threads value through Schema.parse -> Result.map -> toOption -> unwrapOr", () => {
    const EmailSchema = Schema.string.refine(s => s.includes("@"), "email");

    const result = pipe(
      "user@example.com",
      input => EmailSchema.parse(input),
      r => r.map(v => v.toUpperCase()),
      r => r.toOption(),
      opt => opt.unwrapOr("INVALID"),
    );

    expect(result).toBe("USER@EXAMPLE.COM");
  });

  it("schema failure flows through Err -> None -> fallback", () => {
    const EmailSchema = Schema.string.refine(s => s.includes("@"), "email");

    const result = pipe(
      "not-an-email",
      input => EmailSchema.parse(input),
      r => r.map(v => v.toUpperCase()),
      r => r.toOption(),
      opt => opt.unwrapOr("INVALID"),
    );

    expect(result).toBe("INVALID");
  });

  it("flow creates a reusable validation pipeline", () => {
    const normalise = flow(
      s => s.trim(),
      s => s.toLowerCase(),
    );

    expect(normalise("  HELLO@WORLD.COM  ")).toBe("hello@world.com");
    expect(normalise("TEST")).toBe("test");
  });
});

describe("Lazy with Schema + Record", () => {
  it("Lazy defers schema parsing, evaluates once, wraps into Record", () => {
    let evalCount = 0;
    const UserSchema = Schema.object({ name: Schema.string, age: Schema.number });

    const lazy = Lazy(() => {
      evalCount++;
      return Record(UserSchema.parse({ name: "Alice", age: 30 }).unwrap());
    });

    expect(lazy.isEvaluated).toBe(false);
    expect(evalCount).toBe(0);

    const record = lazy.value;
    expect(record.$immutable).toBe(true);
    expect(record.name).toBe("Alice");
    expect(evalCount).toBe(1);

    // Second access: no re-evaluation
    const again = lazy.value;
    expect(again.name).toBe("Alice");
    expect(evalCount).toBe(1);
  });

  it("Lazy.toResult converts thrown exceptions from failed parsing", () => {
    const lazy = Lazy(() => {
      const r = Schema.number.parse("not a number");
      return r.unwrap(); // throws on Err
    });

    const result = lazy.toResult(e => e.message);
    expect(result.isErr).toBe(true);
  });

  it("Lazy.toOption returns None on error", () => {
    const lazy = Lazy(() => {
      throw new Error("boom");
    });

    expect(lazy.toOption().isNone).toBe(true);
  });
});

describe("List of Results -> Result.collect -> Task", () => {
  it("validates items, collects, and feeds into Task pipeline", async () => {
    const PositiveNum = Schema.number.refine(n => n > 0, "positive");
    const items = [1, 2, 3, 4, 5];

    const results = items.map(n => PositiveNum.parse(n));
    const collected = Result.collect(results);
    expect(collected.isOk).toBe(true);

    const task = Task.fromResult(collected).map(nums => nums.reduce((a, b) => a + b, 0));
    const output = await task.run();
    expect(output.unwrap()).toBe(15);
  });

  it("Result.collect short-circuits on first invalid; Task.map never runs", async () => {
    let taskRan = false;
    const PositiveNum = Schema.number.refine(n => n > 0, "positive");
    const items = [1, -2, 3];

    const results = items.map(n => PositiveNum.parse(n));
    const collected = Result.collect(results);
    expect(collected.isErr).toBe(true);

    const task = Task.fromResult(collected).map(nums => {
      taskRan = true;
      return nums.reduce((a, b) => a + b, 0);
    });
    const output = await task.run();
    expect(output.isErr).toBe(true);
    expect(taskRan).toBe(false);
  });
});

describe("Record.produce with nested structures", () => {
  it("batch-mutates via produce, original untouched, converts to List", () => {
    const order = Record({
      id: "order-1",
      items: [
        { sku: "A", qty: 2 },
        { sku: "B", qty: 1 },
      ],
    });

    const updated = order.produce(d => {
      d.items = [...d.items, { sku: "C", qty: 5 }];
    });

    // Original untouched
    expect(order.items.$raw.length).toBe(2);
    // Updated has new item
    expect(updated.items.$raw.length).toBe(3);

    // Convert to List for querying
    const itemList = List([...updated.items.$raw]);
    expect(itemList.length).toBe(3);
    expect(itemList.find(i => i.sku === "C").unwrap().qty).toBe(5);
    expect(itemList.last().unwrap().sku).toBe("C");
  });
});

describe("Nested Schema -> Record methods", () => {
  const AddressSchema = Schema.object({
    city: Schema.string,
    zip: Schema.string,
  });

  const UserSchema = Schema.object({
    name: Schema.string,
    address: AddressSchema,
  });

  it("nested Schema.object returns plain validated data", () => {
    const result = UserSchema.parse({ name: "Bob", address: { city: "Melbourne", zip: "3000" } });
    expect(result.isOk).toBe(true);

    const user = result.unwrap();
    expect(user.name).toBe("Bob");
    expect(user.address.city).toBe("Melbourne");
  });

  it("wrapping parsed data in Record enables set/update/at", () => {
    const user = Record(
      UserSchema.parse({
        name: "Bob",
        address: { city: "Melbourne", zip: "3000" },
      }).unwrap(),
    );

    expect(user.$immutable).toBe(true);
    expect(user.address.$immutable).toBe(true);

    const moved = user.set(u => u.address.city, "Sydney");
    expect(moved.address.city).toBe("Sydney");
    expect(user.address.city).toBe("Melbourne");

    const upperName = user.update(
      u => u.name,
      n => n.toUpperCase(),
    );
    expect(upperName.name).toBe("BOB");

    const cityOpt = user.at(u => u.address.city);
    expect(cityOpt.isSome).toBe(true);
    expect(cityOpt.unwrap()).toBe("Melbourne");
  });

  it("nested validation errors include full path", () => {
    const result = UserSchema.parse({ name: "Bob", address: { city: 42, zip: "3000" } });
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().path).toEqual(["address", "city"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2: Full Program Simulation - Order Processing Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe("Program: Order Processing Pipeline", () => {
  // -- Error types --
  const ValidationError = ErrType("ValidationError");
  const PricingError = ErrType("PricingError");
  const InventoryError = ErrType("InventoryError");

  // -- Schemas --
  const ItemSchema = Schema.object({
    sku: Schema.string,
    name: Schema.string,
    qty: Schema.number.refine(n => Number.isInteger(n) && n > 0, "positive integer"),
    unitPrice: Schema.number.refine(n => n > 0, "positive price"),
  });

  const CustomerSchema = Schema.object({
    email: Schema.string.refine(s => s.includes("@"), "valid email"),
    name: Schema.string,
  });

  const OrderSchema = Schema.object({
    orderId: Schema.string,
    customer: CustomerSchema,
    items: Schema.array(ItemSchema),
    discountCode: Schema.string.optional(),
  });

  // -- Helpers --
  const lineTotal = item => item.qty * item.unitPrice;

  const lookupDiscount = code => {
    const discounts = { SAVE10: 0.1, SAVE20: 0.2 };
    return Option.fromNullable(discounts[code]);
  };

  const makeTaxCalculator = rate => Lazy(() => rate);

  // -- Async checks --
  const checkPricing = items =>
    Task(async () => {
      for (const item of items) {
        if (item.unitPrice > 1000) {
          return PricingError(`Price too high for ${item.name}`, {
            sku: item.sku,
            unitPrice: item.unitPrice,
          }).toResult();
        }
      }
      return Ok(true);
    });

  const checkInventory = items =>
    Task(async () => {
      for (const item of items) {
        if (item.qty > 100) {
          return InventoryError(`Insufficient stock for ${item.name}`, {
            sku: item.sku,
            requested: item.qty,
          }).toResult();
        }
      }
      return Ok(true);
    });

  // -- Pipeline builder --
  const processOrder = rawInput => {
    return Program("order-processor", () => {
      // Step 1: Schema validation
      const parseResult = OrderSchema.parse(rawInput);
      if (parseResult.isErr) {
        const schemaErr = parseResult.unwrapErr();
        return Task.fromResult(
          ValidationError(`Invalid order: ${schemaErr.expected} at ${schemaErr.path.join(".")}`, {
            path: schemaErr.path,
          }).toResult(),
        );
      }

      const order = parseResult.unwrap();
      const items = order.items;

      // Step 2: Validate all items individually with Result.collect
      const itemResults = items.map((raw, i) => {
        const parsed = ItemSchema.parse(raw);
        return parsed.isOk ? Ok(parsed.unwrap()) : parsed.mapErr(e => `item[${i}]: ${e.expected}`);
      });
      const collectedItems = Result.collect(itemResults);
      if (collectedItems.isErr) {
        return Task.fromResult(
          ValidationError(`Item validation failed: ${collectedItems.unwrapErr()}`).toResult(),
        );
      }

      const validItems = collectedItems.unwrap();

      // Step 3: pipe to calculate subtotal from line totals
      const subtotal = pipe(
        validItems,
        items => items.map(item => lineTotal(item)),
        totals => totals.reduce((sum, t) => sum + t, 0),
      );

      // Step 4: Lazy tax calculator
      const taxCalc = makeTaxCalculator(0.1);
      const tax = taxCalc.value * subtotal;

      // Step 5: Option.fromNullable for discount code
      const discountRate = pipe(
        order.discountCode,
        code => Option.fromNullable(code === undefined ? undefined : code),
        opt => opt.flatMap(c => lookupDiscount(c)),
        opt => opt.unwrapOr(0),
      );
      const discount = subtotal * discountRate;

      // Step 6: checkPricing.zip(checkInventory) for parallel async checks
      return checkPricing(items)
        .zip(checkInventory(items))
        .map(() => ({
          orderId: order.orderId,
          subtotal,
          tax: Math.round(tax * 100) / 100,
          discount: Math.round(discount * 100) / 100,
          total: Math.round((subtotal + tax - discount) * 100) / 100,
          itemCount: validItems.length,
        }));
    });
  };

  // -- Valid order fixtures --
  const validOrderWithDiscount = {
    orderId: "ORD-001",
    customer: { email: "alice@example.com", name: "Alice" },
    items: [
      { sku: "W1", name: "Widget", qty: 2, unitPrice: 9.99 },
      { sku: "G1", name: "Gadget", qty: 1, unitPrice: 24.95 },
    ],
    discountCode: "SAVE10",
  };

  const validOrderNoDiscount = {
    orderId: "ORD-002",
    customer: { email: "bob@example.com", name: "Bob" },
    items: [{ sku: "W1", name: "Widget", qty: 3, unitPrice: 10.0 }],
  };

  // -- Tests --

  it("happy path with discount: full pipeline Schema->Record->List->pipe->Lazy->Option->Task.zip->Program", async () => {
    const prog = processOrder(validOrderWithDiscount);
    const result = await prog.execute();

    expect(result.isOk).toBe(true);
    const summary = result.unwrap();
    expect(summary.orderId).toBe("ORD-001");
    // subtotal: (2 * 9.99) + (1 * 24.95) = 19.98 + 24.95 = 44.93
    expect(summary.subtotal).toBe(44.93);
    // tax: 44.93 * 0.1 = 4.493 -> 4.49
    expect(summary.tax).toBe(4.49);
    // discount: 44.93 * 0.1 = 4.493 -> 4.49
    expect(summary.discount).toBe(4.49);
    // total: 44.93 + 4.49 - 4.49 = 44.93
    expect(summary.total).toBe(44.93);
    expect(summary.itemCount).toBe(2);
  });

  it("happy path no discount: Option.fromNullable(undefined) -> None -> unwrapOr(0)", async () => {
    const prog = processOrder(validOrderNoDiscount);
    const result = await prog.execute();

    expect(result.isOk).toBe(true);
    const summary = result.unwrap();
    expect(summary.orderId).toBe("ORD-002");
    expect(summary.subtotal).toBe(30);
    expect(summary.tax).toBe(3);
    expect(summary.discount).toBe(0);
    expect(summary.total).toBe(33);
    expect(summary.itemCount).toBe(1);
  });

  it("invalid discount code: lookupDiscount returns None, pipeline still succeeds", async () => {
    const order = {
      ...validOrderNoDiscount,
      discountCode: "BOGUS",
    };
    const result = await processOrder(order).execute();

    expect(result.isOk).toBe(true);
    expect(result.unwrap().discount).toBe(0);
  });

  it("schema validation failure: bad email wrapped in ValidationError", async () => {
    const order = {
      orderId: "ORD-BAD",
      customer: { email: "not-an-email", name: "Bad" },
      items: [{ sku: "X", name: "X", qty: 1, unitPrice: 1 }],
    };
    const result = await processOrder(order).execute();

    expect(result.isErr).toBe(true);
    const err = result.unwrapErr();
    expect(err.tag).toBe("ValidationError");
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("pricing error: unitPrice > 1000 triggers PricingError in Task.zip", async () => {
    const order = {
      orderId: "ORD-EXPENSIVE",
      customer: { email: "rich@example.com", name: "Rich" },
      items: [{ sku: "D1", name: "Diamond", qty: 1, unitPrice: 5000 }],
    };
    const result = await processOrder(order).execute();

    expect(result.isErr).toBe(true);
    const err = result.unwrapErr();
    expect(err.tag).toBe("PricingError");
    expect(err.code).toBe("PRICING_ERROR");
    expect(err.metadata).toEqual({ sku: "D1", unitPrice: 5000 });
  });

  it("inventory error: qty > 100 triggers InventoryError in Task.zip", async () => {
    const order = {
      orderId: "ORD-BULK",
      customer: { email: "bulk@example.com", name: "Bulk" },
      items: [{ sku: "B1", name: "Bolt", qty: 500, unitPrice: 0.5 }],
    };
    const result = await processOrder(order).execute();

    expect(result.isErr).toBe(true);
    const err = result.unwrapErr();
    expect(err.tag).toBe("InventoryError");
    expect(err.code).toBe("INVENTORY_ERROR");
    expect(err.metadata).toEqual({ sku: "B1", requested: 500 });
  });

  it("match() on final result: exhaustive Ok/Err pattern matching", async () => {
    const okResult = await processOrder(validOrderWithDiscount).execute();
    const okOutput = match(okResult, {
      Ok: summary => `Order ${summary.orderId} total: ${summary.total}`,
      Err: err => `Failed: ${err.message}`,
    });
    expect(okOutput).toBe("Order ORD-001 total: 44.93");

    const errResult = await processOrder({
      orderId: "X",
      customer: { email: "bad", name: "X" },
      items: [{ sku: "X", name: "X", qty: 1, unitPrice: 1 }],
    }).execute();
    const errOutput = match(errResult, {
      Ok: () => "should not reach",
      Err: err => `Failed: ${err.tag}`,
    });
    expect(errOutput).toBe("Failed: ValidationError");
  });

  it("isImmutable verification: Record-wrapped parsed data is immutable", async () => {
    const parsed = OrderSchema.parse(validOrderWithDiscount);
    expect(parsed.isOk).toBe(true);

    // Schema returns plain data; wrap in Record for immutability
    const order = Record(parsed.unwrap());
    expect(isImmutable(order)).toBe(true);
    expect(isImmutable(order.customer)).toBe(true);
    expect(order.items.$immutable).toBe(true);
  });

  it("tryCatch integration: wraps JSON.parse errors into ValidationError", () => {
    const safeParse = input =>
      tryCatch(
        () => JSON.parse(input),
        e => ValidationError(`Invalid JSON: ${e.message}`),
      );

    const good = safeParse('{"ok":true}');
    expect(good.isOk).toBe(true);
    expect(good.unwrap()).toEqual({ ok: true });

    const bad = safeParse("{broken");
    expect(bad.isErr).toBe(true);
    expect(bad.unwrapErr().tag).toBe("ValidationError");
    expect(bad.unwrapErr().code).toBe("VALIDATION_ERROR");
  });

  it("flow composes reusable transformers", () => {
    const calculateTotal = flow(
      items => items.map(i => i.qty * i.unitPrice),
      totals => totals.reduce((sum, t) => sum + t, 0),
      subtotal => ({ subtotal, tax: subtotal * 0.1, total: subtotal * 1.1 }),
    );

    const result = calculateTotal([
      { qty: 2, unitPrice: 10 },
      { qty: 1, unitPrice: 5 },
    ]);

    expect(result.subtotal).toBe(25);
    expect(result.tax).toBe(2.5);
    expect(Math.round(result.total * 100) / 100).toBe(27.5);
  });
});

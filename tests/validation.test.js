/**
 * validation.test.js - Tests for Validation (error-accumulating variant of Result).
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/validation.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { Valid, Invalid, Validation, Ok, Err, Some, None } = await import("../dist/index.js");

// =============================================================================
// 1. Constructors
// =============================================================================

describe("Valid", () => {
  it("creates a Valid with tag and value", () => {
    const v = Valid(42);
    assert.equal(v.tag, "Valid");
    assert.equal(v.value, 42);
    assert.equal(v.isValid, true);
    assert.equal(v.isInvalid, false);
  });
});

describe("Invalid", () => {
  it("creates Invalid from a single error", () => {
    const v = Invalid("oops");
    assert.equal(v.tag, "Invalid");
    assert.deepEqual(v.errors, ["oops"]);
    assert.equal(v.isValid, false);
    assert.equal(v.isInvalid, true);
  });

  it("creates Invalid from an array of errors", () => {
    const v = Invalid(["a", "b"]);
    assert.deepEqual(v.errors, ["a", "b"]);
  });
});

// =============================================================================
// 2. map / mapErr
// =============================================================================

describe("map", () => {
  it("transforms the value on Valid", () => {
    const v = Valid(10).map(n => n * 2);
    assert.equal(v.isValid, true);
    assert.equal(v.value, 20);
  });

  it("is a no-op on Invalid", () => {
    const v = Invalid("err").map(() => 999);
    assert.equal(v.isInvalid, true);
    assert.deepEqual(v.errors, ["err"]);
  });
});

describe("mapErr", () => {
  it("is a no-op on Valid", () => {
    const v = Valid(1).mapErr(() => "nope");
    assert.equal(v.isValid, true);
    assert.equal(v.value, 1);
  });

  it("transforms each error on Invalid", () => {
    const v = Invalid(["a", "b"]).mapErr(e => e.toUpperCase());
    assert.deepEqual(v.errors, ["A", "B"]);
  });
});

// =============================================================================
// 3. flatMap
// =============================================================================

describe("flatMap", () => {
  it("chains on Valid", () => {
    const v = Valid(5).flatMap(n => (n > 0 ? Valid(n * 2) : Invalid("negative")));
    assert.equal(v.value, 10);
  });

  it("short-circuits on Invalid", () => {
    const v = Invalid("first").flatMap(() => Valid(99));
    assert.deepEqual(v.errors, ["first"]);
  });

  it("chains to Invalid", () => {
    const v = Valid(-1).flatMap(n => (n > 0 ? Valid(n) : Invalid("negative")));
    assert.deepEqual(v.errors, ["negative"]);
  });
});

// =============================================================================
// 4. tap / tapErr
// =============================================================================

describe("tap", () => {
  it("runs side-effect on Valid and returns same instance", () => {
    let called = false;
    const v = Valid(1);
    const result = v.tap(() => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(result, v);
  });

  it("is a no-op on Invalid", () => {
    let called = false;
    Invalid("e").tap(() => {
      called = true;
    });
    assert.equal(called, false);
  });
});

describe("tapErr", () => {
  it("is a no-op on Valid", () => {
    let called = false;
    Valid(1).tapErr(() => {
      called = true;
    });
    assert.equal(called, false);
  });

  it("runs side-effect on Invalid and returns same instance", () => {
    let captured;
    const v = Invalid(["a", "b"]);
    const result = v.tapErr(errs => {
      captured = errs;
    });
    assert.deepEqual(captured, ["a", "b"]);
    assert.equal(result, v);
  });
});

// =============================================================================
// 5. unwrap / unwrapOr / unwrapOrElse / unwrapErr
// =============================================================================

describe("unwrap", () => {
  it("returns value on Valid", () => {
    assert.equal(Valid(42).unwrap(), 42);
  });

  it("throws on Invalid", () => {
    assert.throws(() => Invalid("e").unwrap(), TypeError);
  });
});

describe("unwrapOr", () => {
  it("returns value on Valid", () => {
    assert.equal(Valid(1).unwrapOr(99), 1);
  });

  it("returns fallback on Invalid", () => {
    assert.equal(Invalid("e").unwrapOr(99), 99);
  });
});

describe("unwrapOrElse", () => {
  it("returns value on Valid", () => {
    assert.equal(
      Valid(1).unwrapOrElse(() => 99),
      1,
    );
  });

  it("calls recovery fn on Invalid", () => {
    const result = Invalid(["a", "b"]).unwrapOrElse(errs => errs.length);
    assert.equal(result, 2);
  });
});

describe("unwrapErr", () => {
  it("returns errors on Invalid", () => {
    assert.deepEqual(Invalid(["a"]).unwrapErr(), ["a"]);
  });

  it("throws on Valid", () => {
    assert.throws(() => Valid(1).unwrapErr(), TypeError);
  });
});

// =============================================================================
// 6. match
// =============================================================================

describe("match", () => {
  it("calls Valid handler", () => {
    const result = Valid(10).match({
      Valid: v => v + 1,
      Invalid: () => -1,
    });
    assert.equal(result, 11);
  });

  it("calls Invalid handler with errors array", () => {
    const result = Invalid(["a", "b"]).match({
      Valid: () => "nope",
      Invalid: errs => errs.join(","),
    });
    assert.equal(result, "a,b");
  });
});

// =============================================================================
// 7. toOption / toResult
// =============================================================================

describe("toOption", () => {
  it("returns Some on Valid", () => {
    const opt = Valid(42).toOption();
    assert.equal(opt.isSome, true);
    assert.equal(opt.unwrap(), 42);
  });

  it("returns None on Invalid", () => {
    const opt = Invalid("e").toOption();
    assert.equal(opt.isNone, true);
  });
});

describe("toResult", () => {
  it("returns Ok on Valid", () => {
    const r = Valid(42).toResult();
    assert.equal(r.isOk, true);
    assert.equal(r.unwrap(), 42);
  });

  it("returns Err with errors array on Invalid", () => {
    const r = Invalid(["a", "b"]).toResult();
    assert.equal(r.isErr, true);
    assert.deepEqual(r.unwrapErr(), ["a", "b"]);
  });
});

// =============================================================================
// 8. zip (error accumulation)
// =============================================================================

describe("zip", () => {
  it("combines two Valid values into a tuple", () => {
    const v = Valid("hello").zip(Valid(42));
    assert.equal(v.isValid, true);
    assert.deepEqual(v.value, ["hello", 42]);
  });

  it("collects errors from Invalid + Valid", () => {
    const v = Invalid("a").zip(Valid(1));
    assert.equal(v.isInvalid, true);
    assert.deepEqual(v.errors, ["a"]);
  });

  it("collects errors from Valid + Invalid", () => {
    const v = Valid(1).zip(Invalid("b"));
    assert.equal(v.isInvalid, true);
    assert.deepEqual(v.errors, ["b"]);
  });

  it("accumulates errors from both Invalid values", () => {
    const v = Invalid(["a", "b"]).zip(Invalid(["c"]));
    assert.equal(v.isInvalid, true);
    assert.deepEqual(v.errors, ["a", "b", "c"]);
  });

  it("chains multiple zips to accumulate many errors", () => {
    const a = Invalid("name required");
    const b = Invalid("age invalid");
    const c = Invalid("email missing");
    const combined = a.zip(b).zip(c);
    assert.deepEqual(combined.errors, ["name required", "age invalid", "email missing"]);
  });
});

// =============================================================================
// 9. ap (applicative, error accumulation)
// =============================================================================

describe("ap", () => {
  it("applies function from Valid to Valid", () => {
    const v = Valid(10).ap(Valid(n => n * 2));
    assert.equal(v.isValid, true);
    assert.equal(v.value, 20);
  });

  it("collects errors from Invalid value + Valid function", () => {
    const v = Invalid("e").ap(Valid(_n => 0));
    assert.deepEqual(v.errors, ["e"]);
  });

  it("collects errors from Valid value + Invalid function", () => {
    const v = Valid(1).ap(Invalid("fn err"));
    assert.deepEqual(v.errors, ["fn err"]);
  });

  it("accumulates errors from both Invalid sides", () => {
    const v = Invalid(["a"]).ap(Invalid(["b"]));
    assert.deepEqual(v.errors, ["a", "b"]);
  });
});

// =============================================================================
// 10. toJSON / toString
// =============================================================================

describe("toJSON", () => {
  it("serializes Valid", () => {
    assert.deepEqual(Valid(42).toJSON(), { tag: "Valid", value: 42 });
  });

  it("serializes Invalid", () => {
    assert.deepEqual(Invalid(["a"]).toJSON(), { tag: "Invalid", errors: ["a"] });
  });
});

describe("toString", () => {
  it("formats Valid", () => {
    assert.equal(Valid(42).toString(), "Valid(42)");
  });

  it("formats Invalid", () => {
    assert.equal(Invalid(["a", "b"]).toString(), "Invalid(a,b)");
  });
});

// =============================================================================
// 11. Validation namespace
// =============================================================================

describe("Validation.collect", () => {
  it("collects all Valid values", () => {
    const v = Validation.collect([Valid(1), Valid(2), Valid(3)]);
    assert.equal(v.isValid, true);
    assert.deepEqual(v.value, [1, 2, 3]);
  });

  it("accumulates all errors from Invalid values", () => {
    const v = Validation.collect([Valid(1), Invalid("a"), Valid(3), Invalid("b")]);
    assert.equal(v.isInvalid, true);
    assert.deepEqual(v.errors, ["a", "b"]);
  });

  it("returns Valid for empty array", () => {
    const v = Validation.collect([]);
    assert.equal(v.isValid, true);
    assert.deepEqual(v.value, []);
  });
});

describe("Validation.traverse", () => {
  it("maps and collects all valid results", () => {
    const v = Validation.traverse([1, 2, 3], n => Valid(n * 10));
    assert.deepEqual(v.value, [10, 20, 30]);
  });

  it("accumulates errors from failing items", () => {
    const v = Validation.traverse([1, -2, 3, -4], n =>
      n > 0 ? Valid(n) : Invalid(`${n} is negative`),
    );
    assert.deepEqual(v.errors, ["-2 is negative", "-4 is negative"]);
  });
});

describe("Validation.fromPredicate", () => {
  it("returns Valid when predicate passes", () => {
    const v = Validation.fromPredicate(5, n => n > 0, "must be positive");
    assert.equal(v.isValid, true);
    assert.equal(v.value, 5);
  });

  it("returns Invalid when predicate fails", () => {
    const v = Validation.fromPredicate(-1, n => n > 0, "must be positive");
    assert.deepEqual(v.errors, ["must be positive"]);
  });
});

describe("Validation.fromResult", () => {
  it("converts Ok to Valid", () => {
    const v = Validation.fromResult(Ok(42));
    assert.equal(v.isValid, true);
    assert.equal(v.value, 42);
  });

  it("converts Err to single-error Invalid", () => {
    const v = Validation.fromResult(Err("fail"));
    assert.deepEqual(v.errors, ["fail"]);
  });
});

describe("Validation.match", () => {
  it("delegates to instance match", () => {
    const r1 = Validation.match(Valid(1), { Valid: v => v, Invalid: () => -1 });
    assert.equal(r1, 1);
    const r2 = Validation.match(Invalid("e"), {
      Valid: () => -1,
      Invalid: errs => errs.length,
    });
    assert.equal(r2, 1);
  });
});

describe("Validation.is", () => {
  it("returns true for Valid", () => {
    assert.equal(Validation.is(Valid(1)), true);
  });

  it("returns true for Invalid", () => {
    assert.equal(Validation.is(Invalid("e")), true);
  });

  it("returns false for non-Validation", () => {
    assert.equal(Validation.is(42), false);
    assert.equal(Validation.is(Ok(1)), false);
    assert.equal(Validation.is(null), false);
  });
});

// =============================================================================
// 12. Real-world: form validation example
// =============================================================================

describe("form validation example", () => {
  const validateName = name =>
    name.trim().length > 0 ? Valid(name.trim()) : Invalid("name is required");

  const validateAge = age => {
    if (typeof age !== "number" || Number.isNaN(age)) return Invalid("age must be a number");
    if (age < 0 || age > 150) return Invalid("age must be between 0 and 150");
    return Valid(age);
  };

  const validateEmail = email =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? Valid(email) : Invalid("invalid email format");

  it("collects all validation errors at once", () => {
    const result = Validation.collect([
      validateName(""),
      validateAge(-5),
      validateEmail("not-an-email"),
    ]);
    assert.equal(result.isInvalid, true);
    assert.deepEqual(result.errors, [
      "name is required",
      "age must be between 0 and 150",
      "invalid email format",
    ]);
  });

  it("returns all values when everything is valid", () => {
    const result = Validation.collect([
      validateName("Alice"),
      validateAge(30),
      validateEmail("alice@example.com"),
    ]);
    assert.equal(result.isValid, true);
    assert.deepEqual(result.value, ["Alice", 30, "alice@example.com"]);
  });

  it("uses zip for structured combination", () => {
    const result = validateName("Alice")
      .zip(validateAge(30))
      .map(([name, age]) => ({ name, age }));
    assert.equal(result.isValid, true);
    assert.deepEqual(result.value, { name: "Alice", age: 30 });
  });

  it("zip accumulates errors from independent validations", () => {
    const result = validateName("")
      .zip(validateAge(-5))
      .map(([name, age]) => ({ name, age }));
    assert.equal(result.isInvalid, true);
    assert.deepEqual(result.errors, ["name is required", "age must be between 0 and 150"]);
  });
});

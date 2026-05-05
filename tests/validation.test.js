/**
 * validation.test.js - Tests for Validation (error-accumulating variant of Result).
 *
 * Uses @igorjs/pure-test.
 * Run: node --test tests/validation.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const { Valid, Invalid, Validation, Ok, Err, Some, None } = await import("../dist/index.js");

// =============================================================================
// 1. Constructors
// =============================================================================

describe("Valid", () => {
  it("creates a Valid with tag and value", () => {
    const v = Valid(42);
    expect(v.tag).toBe("Valid");
    expect(v.value).toBe(42);
    expect(v.isValid).toBe(true);
    expect(v.isInvalid).toBe(false);
  });
});

describe("Invalid", () => {
  it("creates Invalid from a single error", () => {
    const v = Invalid("oops");
    expect(v.tag).toBe("Invalid");
    expect(v.errors).toEqual(["oops"]);
    expect(v.isValid).toBe(false);
    expect(v.isInvalid).toBe(true);
  });

  it("creates Invalid from an array of errors", () => {
    const v = Invalid(["a", "b"]);
    expect(v.errors).toEqual(["a", "b"]);
  });
});

// =============================================================================
// 2. map / mapErr
// =============================================================================

describe("map", () => {
  it("transforms the value on Valid", () => {
    const v = Valid(10).map(n => n * 2);
    expect(v.isValid).toBe(true);
    expect(v.value).toBe(20);
  });

  it("is a no-op on Invalid", () => {
    const v = Invalid("err").map(() => 999);
    expect(v.isInvalid).toBe(true);
    expect(v.errors).toEqual(["err"]);
  });
});

describe("mapErr", () => {
  it("is a no-op on Valid", () => {
    const v = Valid(1).mapErr(() => "nope");
    expect(v.isValid).toBe(true);
    expect(v.value).toBe(1);
  });

  it("transforms each error on Invalid", () => {
    const v = Invalid(["a", "b"]).mapErr(e => e.toUpperCase());
    expect(v.errors).toEqual(["A", "B"]);
  });
});

// =============================================================================
// 3. flatMap
// =============================================================================

describe("flatMap", () => {
  it("chains on Valid", () => {
    const v = Valid(5).flatMap(n => (n > 0 ? Valid(n * 2) : Invalid("negative")));
    expect(v.value).toBe(10);
  });

  it("short-circuits on Invalid", () => {
    const v = Invalid("first").flatMap(() => Valid(99));
    expect(v.errors).toEqual(["first"]);
  });

  it("chains to Invalid", () => {
    const v = Valid(-1).flatMap(n => (n > 0 ? Valid(n) : Invalid("negative")));
    expect(v.errors).toEqual(["negative"]);
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
    expect(called).toBe(true);
    expect(result).toBe(v);
  });

  it("is a no-op on Invalid", () => {
    let called = false;
    Invalid("e").tap(() => {
      called = true;
    });
    expect(called).toBe(false);
  });
});

describe("tapErr", () => {
  it("is a no-op on Valid", () => {
    let called = false;
    Valid(1).tapErr(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("runs side-effect on Invalid and returns same instance", () => {
    let captured;
    const v = Invalid(["a", "b"]);
    const result = v.tapErr(errs => {
      captured = errs;
    });
    expect(captured).toEqual(["a", "b"]);
    expect(result).toBe(v);
  });
});

// =============================================================================
// 5. unwrap / unwrapOr / unwrapOrElse / unwrapErr
// =============================================================================

describe("unwrap", () => {
  it("returns value on Valid", () => {
    expect(Valid(42).unwrap()).toBe(42);
  });

  it("throws on Invalid", () => {
    expect(() => Invalid("e").unwrap()).toThrow();
  });
});

describe("unwrapOr", () => {
  it("returns value on Valid", () => {
    expect(Valid(1).unwrapOr(99)).toBe(1);
  });

  it("returns fallback on Invalid", () => {
    expect(Invalid("e").unwrapOr(99)).toBe(99);
  });
});

describe("unwrapOrElse", () => {
  it("returns value on Valid", () => {
    expect(Valid(1).unwrapOrElse(() => 99)).toBe(1);
  });

  it("calls recovery fn on Invalid", () => {
    const result = Invalid(["a", "b"]).unwrapOrElse(errs => errs.length);
    expect(result).toBe(2);
  });
});

describe("unwrapErr", () => {
  it("returns errors on Invalid", () => {
    expect(Invalid(["a"]).unwrapErr()).toEqual(["a"]);
  });

  it("throws on Valid", () => {
    expect(() => Valid(1).unwrapErr()).toThrow();
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
    expect(result).toBe(11);
  });

  it("calls Invalid handler with errors array", () => {
    const result = Invalid(["a", "b"]).match({
      Valid: () => "nope",
      Invalid: errs => errs.join(","),
    });
    expect(result).toBe("a,b");
  });
});

// =============================================================================
// 7. toOption / toResult
// =============================================================================

describe("toOption", () => {
  it("returns Some on Valid", () => {
    const opt = Valid(42).toOption();
    expect(opt.isSome).toBe(true);
    expect(opt.unwrap()).toBe(42);
  });

  it("returns None on Invalid", () => {
    const opt = Invalid("e").toOption();
    expect(opt.isNone).toBe(true);
  });
});

describe("toResult", () => {
  it("returns Ok on Valid", () => {
    const r = Valid(42).toResult();
    expect(r.isOk).toBe(true);
    expect(r.unwrap()).toBe(42);
  });

  it("returns Err with errors array on Invalid", () => {
    const r = Invalid(["a", "b"]).toResult();
    expect(r.isErr).toBe(true);
    expect(r.unwrapErr()).toEqual(["a", "b"]);
  });
});

// =============================================================================
// 8. zip (error accumulation)
// =============================================================================

describe("zip", () => {
  it("combines two Valid values into a tuple", () => {
    const v = Valid("hello").zip(Valid(42));
    expect(v.isValid).toBe(true);
    expect(v.value).toEqual(["hello", 42]);
  });

  it("collects errors from Invalid + Valid", () => {
    const v = Invalid("a").zip(Valid(1));
    expect(v.isInvalid).toBe(true);
    expect(v.errors).toEqual(["a"]);
  });

  it("collects errors from Valid + Invalid", () => {
    const v = Valid(1).zip(Invalid("b"));
    expect(v.isInvalid).toBe(true);
    expect(v.errors).toEqual(["b"]);
  });

  it("accumulates errors from both Invalid values", () => {
    const v = Invalid(["a", "b"]).zip(Invalid(["c"]));
    expect(v.isInvalid).toBe(true);
    expect(v.errors).toEqual(["a", "b", "c"]);
  });

  it("chains multiple zips to accumulate many errors", () => {
    const a = Invalid("name required");
    const b = Invalid("age invalid");
    const c = Invalid("email missing");
    const combined = a.zip(b).zip(c);
    expect(combined.errors).toEqual(["name required", "age invalid", "email missing"]);
  });
});

// =============================================================================
// 9. ap (applicative, error accumulation)
// =============================================================================

describe("ap", () => {
  it("applies function from Valid to Valid", () => {
    const v = Valid(10).ap(Valid(n => n * 2));
    expect(v.isValid).toBe(true);
    expect(v.value).toBe(20);
  });

  it("collects errors from Invalid value + Valid function", () => {
    const v = Invalid("e").ap(Valid(_n => 0));
    expect(v.errors).toEqual(["e"]);
  });

  it("collects errors from Valid value + Invalid function", () => {
    const v = Valid(1).ap(Invalid("fn err"));
    expect(v.errors).toEqual(["fn err"]);
  });

  it("accumulates errors from both Invalid sides", () => {
    const v = Invalid(["a"]).ap(Invalid(["b"]));
    expect(v.errors).toEqual(["a", "b"]);
  });
});

// =============================================================================
// 10. toJSON / toString
// =============================================================================

describe("toJSON", () => {
  it("serializes Valid", () => {
    expect(Valid(42).toJSON()).toEqual({ tag: "Valid", value: 42 });
  });

  it("serializes Invalid", () => {
    expect(Invalid(["a"]).toJSON()).toEqual({ tag: "Invalid", errors: ["a"] });
  });
});

describe("toString", () => {
  it("formats Valid", () => {
    expect(Valid(42).toString()).toBe("Valid(42)");
  });

  it("formats Invalid", () => {
    expect(Invalid(["a", "b"]).toString()).toBe("Invalid(a,b)");
  });
});

// =============================================================================
// 11. Validation namespace
// =============================================================================

describe("Validation.collect", () => {
  it("collects all Valid values", () => {
    const v = Validation.collect([Valid(1), Valid(2), Valid(3)]);
    expect(v.isValid).toBe(true);
    expect(v.value).toEqual([1, 2, 3]);
  });

  it("accumulates all errors from Invalid values", () => {
    const v = Validation.collect([Valid(1), Invalid("a"), Valid(3), Invalid("b")]);
    expect(v.isInvalid).toBe(true);
    expect(v.errors).toEqual(["a", "b"]);
  });

  it("returns Valid for empty array", () => {
    const v = Validation.collect([]);
    expect(v.isValid).toBe(true);
    expect(v.value).toEqual([]);
  });
});

describe("Validation.traverse", () => {
  it("maps and collects all valid results", () => {
    const v = Validation.traverse([1, 2, 3], n => Valid(n * 10));
    expect(v.value).toEqual([10, 20, 30]);
  });

  it("accumulates errors from failing items", () => {
    const v = Validation.traverse([1, -2, 3, -4], n =>
      n > 0 ? Valid(n) : Invalid(`${n} is negative`),
    );
    expect(v.errors).toEqual(["-2 is negative", "-4 is negative"]);
  });
});

describe("Validation.fromPredicate", () => {
  it("returns Valid when predicate passes", () => {
    const v = Validation.fromPredicate(5, n => n > 0, "must be positive");
    expect(v.isValid).toBe(true);
    expect(v.value).toBe(5);
  });

  it("returns Invalid when predicate fails", () => {
    const v = Validation.fromPredicate(-1, n => n > 0, "must be positive");
    expect(v.errors).toEqual(["must be positive"]);
  });
});

describe("Validation.fromResult", () => {
  it("converts Ok to Valid", () => {
    const v = Validation.fromResult(Ok(42));
    expect(v.isValid).toBe(true);
    expect(v.value).toBe(42);
  });

  it("converts Err to single-error Invalid", () => {
    const v = Validation.fromResult(Err("fail"));
    expect(v.errors).toEqual(["fail"]);
  });
});

describe("Validation.match", () => {
  it("delegates to instance match", () => {
    const r1 = Validation.match(Valid(1), { Valid: v => v, Invalid: () => -1 });
    expect(r1).toBe(1);
    const r2 = Validation.match(Invalid("e"), {
      Valid: () => -1,
      Invalid: errs => errs.length,
    });
    expect(r2).toBe(1);
  });
});

describe("Validation.is", () => {
  it("returns true for Valid", () => {
    expect(Validation.is(Valid(1))).toBe(true);
  });

  it("returns true for Invalid", () => {
    expect(Validation.is(Invalid("e"))).toBe(true);
  });

  it("returns false for non-Validation", () => {
    expect(Validation.is(42)).toBe(false);
    expect(Validation.is(Ok(1))).toBe(false);
    expect(Validation.is(null)).toBe(false);
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
    expect(result.isInvalid).toBe(true);
    expect(result.errors).toEqual([
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
    expect(result.isValid).toBe(true);
    expect(result.value).toEqual(["Alice", 30, "alice@example.com"]);
  });

  it("uses zip for structured combination", () => {
    const result = validateName("Alice")
      .zip(validateAge(30))
      .map(([name, age]) => ({ name, age }));
    expect(result.isValid).toBe(true);
    expect(result.value).toEqual({ name: "Alice", age: 30 });
  });

  it("zip accumulates errors from independent validations", () => {
    const result = validateName("")
      .zip(validateAge(-5))
      .map(([name, age]) => ({ name, age }));
    expect(result.isInvalid).toBe(true);
    expect(result.errors).toEqual(["name is required", "age must be between 0 and 150"]);
  });
});

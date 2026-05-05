/**
 * io-tier1.test.js - Comprehensive tests for Tier 1 IO modules:
 * Crypto, Url, Encoding, Clone, Compression, Timer.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Crypto,
  CryptoError,
  Url,
  UrlError,
  Encoding,
  EncodingError,
  Clone,
  CloneError,
  Compression,
  CompressionError,
  Timer,
  TimeoutError,
  Duration,
  Ok,
  Err,
  Some,
  None,
} = await import("../dist/index.js");

// =============================================================================
// 1. Crypto
// =============================================================================

describe("Crypto", () => {
  describe("Crypto.uuid()", () => {
    it("returns a string", () => {
      const id = Crypto.uuid();
      expect(typeof id).toBe("string");
    });

    it("matches UUID v4 format", () => {
      const id = Crypto.uuid();
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(id).toMatch(uuidV4Regex);
    });

    it("two calls produce different values", () => {
      const a = Crypto.uuid();
      const b = Crypto.uuid();
      expect(a).not.toBe(b);
    });
  });

  describe("Crypto.randomBytes()", () => {
    it("returns Ok with Uint8Array of correct length", () => {
      const result = Crypto.randomBytes(16);
      expect(result.isOk).toBe(true);
      expect(result.value instanceof Uint8Array).toBe(true);
      expect(result.value.length).toBe(16);
    });

    it("returns Ok for length 0", () => {
      const result = Crypto.randomBytes(0);
      expect(result.isOk).toBe(true);
      expect(result.value.length).toBe(0);
    });

    it("returns Err for negative length", () => {
      const result = Crypto.randomBytes(-1);
      expect(result.isErr).toBe(true);
    });
  });

  describe("Crypto.hash()", () => {
    it("SHA-256 of string returns Ok(Uint8Array) with 32 bytes", async () => {
      const result = await Crypto.hash("SHA-256", "hello").run();
      expect(result.isOk).toBe(true);
      expect(result.value instanceof Uint8Array).toBe(true);
      expect(result.value.length).toBe(32);
    });

    it("SHA-512 of string returns 64 bytes", async () => {
      const result = await Crypto.hash("SHA-512", "hello").run();
      expect(result.isOk).toBe(true);
      expect(result.value.length).toBe(64);
    });

    it("accepts Uint8Array input", async () => {
      const input = new TextEncoder().encode("hello");
      const result = await Crypto.hash("SHA-256", input).run();
      expect(result.isOk).toBe(true);
      expect(result.value.length).toBe(32);
    });

    it("produces consistent output for the same input", async () => {
      const a = await Crypto.hash("SHA-256", "hello").run();
      const b = await Crypto.hash("SHA-256", "hello").run();
      expect(a.value).toEqual(b.value);
    });

    it("produces different output for different input", async () => {
      const a = await Crypto.hash("SHA-256", "hello").run();
      const b = await Crypto.hash("SHA-256", "world").run();
      expect(a.value).not.toEqual(b.value);
    });
  });

  describe("Crypto.timingSafeEqual()", () => {
    it("returns true for identical byte arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      expect(Crypto.timingSafeEqual(a, a)).toBe(true);
    });

    it("returns true for equal but distinct byte arrays", () => {
      const a = new Uint8Array([10, 20, 30]);
      const b = new Uint8Array([10, 20, 30]);
      expect(Crypto.timingSafeEqual(a, b)).toBe(true);
    });

    it("returns false for different byte arrays", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      expect(Crypto.timingSafeEqual(a, b)).toBe(false);
    });

    it("returns false for different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2]);
      expect(Crypto.timingSafeEqual(a, b)).toBe(false);
    });

    it("returns true for two empty arrays", () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);
      expect(Crypto.timingSafeEqual(a, b)).toBe(true);
    });
  });
});

// =============================================================================
// 2. Url
// =============================================================================

describe("Url", () => {
  describe("Url.parse()", () => {
    it("parses a valid URL and returns Ok(URL)", () => {
      const result = Url.parse("https://example.com/path?q=1");
      expect(result.isOk).toBe(true);
      expect(result.value.hostname).toBe("example.com");
      expect(result.value.pathname).toBe("/path");
      expect(result.value.searchParams.get("q")).toBe("1");
    });

    it("returns Err(UrlError) for invalid URL", () => {
      const result = Url.parse("not a url");
      expect(result.isErr).toBe(true);
      expect(UrlError.is(result.error)).toBe(true);
    });

    it("parses a relative URL with base", () => {
      const result = Url.parse("/path", "https://example.com");
      expect(result.isOk).toBe(true);
      expect(result.value.href).toBe("https://example.com/path");
    });

    it("returns Err for empty string", () => {
      const result = Url.parse("");
      expect(result.isErr).toBe(true);
    });

    it("parses URL with port and fragment", () => {
      const result = Url.parse("https://example.com:8080/api#section");
      expect(result.isOk).toBe(true);
      expect(result.value.port).toBe("8080");
      expect(result.value.hash).toBe("#section");
    });
  });

  describe("Url.searchParams()", () => {
    it("builds query string from object", () => {
      const qs = Url.searchParams({ q: "1", page: "2" });
      // URLSearchParams may order keys by insertion order
      expect(qs.includes("q=1")).toBe(true);
      expect(qs.includes("page=2")).toBe(true);
    });

    it("returns empty string for empty object", () => {
      const qs = Url.searchParams({});
      expect(qs).toBe("");
    });

    it("encodes special characters", () => {
      const qs = Url.searchParams({ q: "hello world" });
      expect(qs.includes("hello+world") || qs.includes("hello%20world")).toBe(true);
    });
  });

  describe("Url.parseSearchParams()", () => {
    it("parses a query string into an object", () => {
      const result = Url.parseSearchParams("q=1&page=2");
      expect(result).toEqual({ q: "1", page: "2" });
    });

    it("strips leading ? from query string", () => {
      const result = Url.parseSearchParams("?q=1");
      expect(result).toEqual({ q: "1" });
    });

    it("returns empty object for empty string", () => {
      const result = Url.parseSearchParams("");
      expect(result).toEqual({});
    });

    it("handles URL-encoded values", () => {
      const result = Url.parseSearchParams("name=John+Doe&city=New%20York");
      expect(result.name).toBe("John Doe");
      expect(result.city).toBe("New York");
    });
  });
});

// =============================================================================
// 3. Encoding
// =============================================================================

describe("Encoding", () => {
  describe("Encoding.base64", () => {
    it("encodes bytes to base64 string", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      expect(Encoding.base64.encode(bytes)).toBe("SGVsbG8=");
    });

    it("decodes base64 string to Ok(Uint8Array)", () => {
      const result = Encoding.base64.decode("SGVsbG8=");
      expect(result.isOk).toBe(true);
      expect(Array.from(result.value)).toEqual([72, 101, 108, 108, 111]);
    });

    it("returns Err(EncodingError) for invalid base64", () => {
      const result = Encoding.base64.decode("!!!invalid!!!");
      expect(result.isErr).toBe(true);
      expect(EncodingError.is(result.error)).toBe(true);
    });

    it("roundtrip: encode then decode produces original bytes", () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const encoded = Encoding.base64.encode(original);
      const decoded = Encoding.base64.decode(encoded);
      expect(decoded.isOk).toBe(true);
      expect(Array.from(decoded.value)).toEqual(Array.from(original));
    });

    it("handles empty input", () => {
      const encoded = Encoding.base64.encode(new Uint8Array([]));
      expect(encoded).toBe("");
      const decoded = Encoding.base64.decode("");
      expect(decoded.isOk).toBe(true);
      expect(decoded.value.length).toBe(0);
    });
  });

  describe("Encoding.hex", () => {
    it("encodes bytes to lowercase hex string", () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      expect(Encoding.hex.encode(bytes)).toBe("deadbeef");
    });

    it("decodes hex string to Ok(Uint8Array)", () => {
      const result = Encoding.hex.decode("deadbeef");
      expect(result.isOk).toBe(true);
      expect(Array.from(result.value)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    it("returns Err for invalid hex characters", () => {
      const result = Encoding.hex.decode("xyz");
      expect(result.isErr).toBe(true);
      expect(EncodingError.is(result.error)).toBe(true);
    });

    it("returns Err for odd-length hex string", () => {
      const result = Encoding.hex.decode("abc");
      expect(result.isErr).toBe(true);
      expect(result.error.message.includes("even length")).toBe(true);
    });

    it("roundtrip: encode then decode", () => {
      const original = new Uint8Array([0, 15, 16, 255]);
      const hex = Encoding.hex.encode(original);
      const decoded = Encoding.hex.decode(hex);
      expect(decoded.isOk).toBe(true);
      expect(Array.from(decoded.value)).toEqual(Array.from(original));
    });

    it("handles empty input", () => {
      expect(Encoding.hex.encode(new Uint8Array([]))).toBe("");
      const decoded = Encoding.hex.decode("");
      expect(decoded.isOk).toBe(true);
      expect(decoded.value.length).toBe(0);
    });
  });

  describe("Encoding.utf8", () => {
    it("encodes a string to Uint8Array", () => {
      const result = Encoding.utf8.encode("Hello");
      expect(result instanceof Uint8Array).toBe(true);
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it("decodes Uint8Array to Ok(string)", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const result = Encoding.utf8.decode(bytes);
      expect(result.isOk).toBe(true);
      expect(result.value).toBe("Hello");
    });

    it("roundtrip: encode then decode", () => {
      const original = "Hello, world! Unicode: \u00e9\u00e0\u00fc";
      const bytes = Encoding.utf8.encode(original);
      const decoded = Encoding.utf8.decode(bytes);
      expect(decoded.isOk).toBe(true);
      expect(decoded.value).toBe(original);
    });

    it("handles empty string", () => {
      const bytes = Encoding.utf8.encode("");
      expect(bytes.length).toBe(0);
      const decoded = Encoding.utf8.decode(new Uint8Array([]));
      expect(decoded.isOk).toBe(true);
      expect(decoded.value).toBe("");
    });

    it("handles multi-byte characters", () => {
      const bytes = Encoding.utf8.encode("\u{1F600}"); // emoji
      expect(bytes.length > 1).toBe(true);
      const decoded = Encoding.utf8.decode(bytes);
      expect(decoded.isOk).toBe(true);
      expect(decoded.value).toBe("\u{1F600}");
    });
  });
});

// =============================================================================
// 4. Clone
// =============================================================================

describe("Clone", () => {
  describe("Clone.deep()", () => {
    it("deeply clones a plain object", () => {
      const original = { a: 1, b: [2, 3] };
      const result = Clone.deep(original);
      expect(result.isOk).toBe(true);
      expect(result.value).toEqual(original);
    });

    it("produces a distinct object (mutations do not affect original)", () => {
      const original = { a: 1, b: [2, 3] };
      const result = Clone.deep(original);
      expect(result.isOk).toBe(true);
      result.value.a = 999;
      result.value.b.push(999);
      expect(original.a).toBe(1);
      expect(original.b).toEqual([2, 3]);
    });

    it("works for primitives", () => {
      const result = Clone.deep(42);
      expect(result.isOk).toBe(true);
      expect(result.value).toBe(42);
    });

    it("works for strings", () => {
      const result = Clone.deep("hello");
      expect(result.isOk).toBe(true);
      expect(result.value).toBe("hello");
    });

    it("works for null", () => {
      const result = Clone.deep(null);
      expect(result.isOk).toBe(true);
      expect(result.value).toBe(null);
    });

    it("works for dates", () => {
      const original = new Date("2024-01-01T00:00:00Z");
      const result = Clone.deep(original);
      expect(result.isOk).toBe(true);
      expect(result.value instanceof Date).toBe(true);
      expect(result.value.toISOString()).toBe(original.toISOString());
      // Verify it is a distinct Date instance
      expect(result.value).not.toBe(original);
    });

    it("deeply clones nested structures", () => {
      const original = { x: { y: { z: [1, 2, 3] } } };
      const result = Clone.deep(original);
      expect(result.isOk).toBe(true);
      result.value.x.y.z.push(4);
      expect(original.x.y.z).toEqual([1, 2, 3]);
    });

    it("returns Err(CloneError) for objects with function properties", () => {
      const obj = { fn: () => undefined };
      const result = Clone.deep(obj);
      expect(result.isErr).toBe(true);
      expect(CloneError.is(result.error)).toBe(true);
    });

    it("works for arrays", () => {
      const original = [1, [2, 3], { a: 4 }];
      const result = Clone.deep(original);
      expect(result.isOk).toBe(true);
      expect(result.value).toEqual(original);
    });
  });
});

// =============================================================================
// 5. Compression
// =============================================================================

describe("Compression", () => {
  const te = new TextEncoder();
  const td = new TextDecoder();

  describe("gzip/gunzip", () => {
    it("gzip returns Ok(Uint8Array)", async () => {
      const data = te.encode("hello world");
      const result = await Compression.gzip(data).run();
      expect(result.isOk).toBe(true);
      expect(result.value instanceof Uint8Array).toBe(true);
    });

    it("compressed data differs from input", async () => {
      const data = te.encode("hello world");
      const result = await Compression.gzip(data).run();
      expect(result.isOk).toBe(true);
      expect(Array.from(result.value)).not.toEqual(Array.from(data));
    });

    it("roundtrip: gzip then gunzip restores original data", async () => {
      const data = te.encode("hello world");
      const compressed = await Compression.gzip(data).run();
      expect(compressed.isOk).toBe(true);
      const decompressed = await Compression.gunzip(compressed.value).run();
      expect(decompressed.isOk).toBe(true);
      expect(td.decode(decompressed.value)).toBe("hello world");
    });

    it("works with empty data", async () => {
      const data = new Uint8Array([]);
      const compressed = await Compression.gzip(data).run();
      expect(compressed.isOk).toBe(true);
      const decompressed = await Compression.gunzip(compressed.value).run();
      expect(decompressed.isOk).toBe(true);
      expect(decompressed.value.length).toBe(0);
    });

    it("works with larger data", async () => {
      const text = "The quick brown fox jumps over the lazy dog. ".repeat(1000);
      const data = te.encode(text);
      const compressed = await Compression.gzip(data).run();
      expect(compressed.isOk).toBe(true);
      // Compressed should be significantly smaller than input for repetitive data
      expect(compressed.value.length < data.length).toBe(true);
      const decompressed = await Compression.gunzip(compressed.value).run();
      expect(decompressed.isOk).toBe(true);
      expect(td.decode(decompressed.value)).toBe(text);
    });
  });

  describe("deflate/inflate", () => {
    it("roundtrip: deflate then inflate restores original data", async () => {
      const data = te.encode("compress me with deflate");
      const compressed = await Compression.deflate(data).run();
      expect(compressed.isOk).toBe(true);
      expect(compressed.value instanceof Uint8Array).toBe(true);
      const decompressed = await Compression.inflate(compressed.value).run();
      expect(decompressed.isOk).toBe(true);
      expect(td.decode(decompressed.value)).toBe("compress me with deflate");
    });

    it("works with empty data", async () => {
      const data = new Uint8Array([]);
      const compressed = await Compression.deflate(data).run();
      expect(compressed.isOk).toBe(true);
      const decompressed = await Compression.inflate(compressed.value).run();
      expect(decompressed.isOk).toBe(true);
      expect(decompressed.value.length).toBe(0);
    });

    it("works with larger data", async () => {
      const text = "ABCDEFGHIJ".repeat(1000);
      const data = te.encode(text);
      const compressed = await Compression.deflate(data).run();
      expect(compressed.isOk).toBe(true);
      expect(compressed.value.length < data.length).toBe(true);
      const decompressed = await Compression.inflate(compressed.value).run();
      expect(decompressed.isOk).toBe(true);
      expect(td.decode(decompressed.value)).toBe(text);
    });
  });
});

// =============================================================================
// 6. Timer
// =============================================================================

describe("Timer", () => {
  describe("Timer.sleep()", () => {
    it("resolves Ok(undefined) after the given duration", async () => {
      const start = Date.now();
      const result = await Timer.sleep(Duration.milliseconds(10)).run();
      const elapsed = Date.now() - start;
      expect(result.isOk).toBe(true);
      expect(result.value).toBe(undefined);
      expect(elapsed >= 5).toBe(true);
    });
  });

  describe("Timer.now()", () => {
    it("returns a number greater than 0", () => {
      const t = Timer.now();
      expect(typeof t).toBe("number");
      expect(t > 0).toBe(true);
    });

    it("subsequent calls are non-decreasing", () => {
      const a = Timer.now();
      const b = Timer.now();
      expect(b >= a).toBe(true);
    });
  });

  describe("Timer.delay()", () => {
    it("runs task after the specified delay", async () => {
      const task = { run: () => Promise.resolve(Ok(42)) };
      const start = Date.now();
      const result = await Timer.delay(Duration.milliseconds(10), task).run();
      const elapsed = Date.now() - start;
      expect(result.isOk).toBe(true);
      expect(result.value).toBe(42);
      expect(elapsed >= 5).toBe(true);
    });
  });

  describe("Timer.deadline()", () => {
    it("succeeds if task completes before deadline", async () => {
      const fastTask = { run: () => Promise.resolve(Ok("done")) };
      const result = await Timer.deadline(Duration.milliseconds(50), fastTask).run();
      expect(result.isOk).toBe(true);
      expect(result.value).toBe("done");
    });

    it("returns Err(TimeoutError) if task exceeds deadline", async () => {
      const slowTask = {
        run: () => new Promise(r => setTimeout(() => r(Ok("late")), 200)),
      };
      const result = await Timer.deadline(Duration.milliseconds(10), slowTask).run();
      expect(result.isErr).toBe(true);
      expect(TimeoutError.is(result.error)).toBe(true);
      expect(result.error.message.includes("exceeded")).toBe(true);
    });
  });

  describe("Timer.interval()", () => {
    it("returns an object with take and collect methods", () => {
      const stream = Timer.interval(Duration.milliseconds(10));
      expect(typeof stream.take).toBe("function");
      expect(typeof stream.collect).toBe("function");
    });
  });
});

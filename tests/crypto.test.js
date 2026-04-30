/**
 * crypto.test.js - Tests for expanded Crypto module (full Web Crypto API).
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/crypto.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { Crypto } = await import("../dist/index.js");

// =============================================================================
// 1. randomInt
// =============================================================================

describe("Crypto.randomInt", () => {
  it("returns Ok with value in [min, max)", () => {
    const r = Crypto.randomInt(0, 10);
    assert.equal(r.isOk, true);
    const v = r.unwrap();
    assert.ok(v >= 0 && v < 10);
  });

  it("returns different values across calls (statistical)", () => {
    const values = new Set();
    for (let i = 0; i < 50; i++) {
      values.add(Crypto.randomInt(0, 1000).unwrap());
    }
    assert.ok(values.size > 1);
  });

  it("returns Err when min >= max", () => {
    assert.equal(Crypto.randomInt(10, 10).isErr, true);
    assert.equal(Crypto.randomInt(10, 5).isErr, true);
  });

  it("works with range of 1", () => {
    const r = Crypto.randomInt(5, 6);
    assert.equal(r.unwrap(), 5);
  });
});

// =============================================================================
// 2. hashHex
// =============================================================================

describe("Crypto.hashHex", () => {
  it("returns hex string for SHA-256", async () => {
    const r = await Crypto.hashHex("SHA-256", "hello").run();
    assert.equal(r.isOk, true);
    const hex = r.unwrap();
    assert.equal(typeof hex, "string");
    assert.equal(hex.length, 64);
    assert.match(hex, /^[0-9a-f]+$/);
  });

  it("produces consistent output", async () => {
    const a = await Crypto.hashHex("SHA-256", "test").run();
    const b = await Crypto.hashHex("SHA-256", "test").run();
    assert.equal(a.unwrap(), b.unwrap());
  });

  it("SHA-512 produces 128 hex chars", async () => {
    const r = await Crypto.hashHex("SHA-512", "hello").run();
    assert.equal(r.unwrap().length, 128);
  });
});

// =============================================================================
// 3. HMAC
// =============================================================================

describe("Crypto.hmac", () => {
  it("sign and verify round-trip", async () => {
    const key = (await Crypto.generateKey.hmac("SHA-256").run()).unwrap();
    const sig = (await Crypto.hmac.sign(key, "hello world").run()).unwrap();
    assert.ok(sig instanceof Uint8Array);
    assert.ok(sig.length > 0);

    const valid = (await Crypto.hmac.verify(key, sig, "hello world").run()).unwrap();
    assert.equal(valid, true);
  });

  it("verify fails with wrong data", async () => {
    const key = (await Crypto.generateKey.hmac("SHA-256").run()).unwrap();
    const sig = (await Crypto.hmac.sign(key, "hello").run()).unwrap();
    const valid = (await Crypto.hmac.verify(key, sig, "wrong").run()).unwrap();
    assert.equal(valid, false);
  });

  it("verify fails with wrong key", async () => {
    const key1 = (await Crypto.generateKey.hmac("SHA-256").run()).unwrap();
    const key2 = (await Crypto.generateKey.hmac("SHA-256").run()).unwrap();
    const sig = (await Crypto.hmac.sign(key1, "hello").run()).unwrap();
    const valid = (await Crypto.hmac.verify(key2, sig, "hello").run()).unwrap();
    assert.equal(valid, false);
  });
});

// =============================================================================
// 4. AES-GCM
// =============================================================================

describe("Crypto.aesGcm", () => {
  it("encrypt and decrypt round-trip", async () => {
    const key = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const encrypted = (await Crypto.aesGcm.encrypt(key, "secret message").run()).unwrap();
    assert.ok(encrypted.iv instanceof Uint8Array);
    assert.equal(encrypted.iv.length, 12);
    assert.ok(encrypted.data instanceof Uint8Array);

    const decrypted = (
      await Crypto.aesGcm.decrypt(key, encrypted.iv, encrypted.data).run()
    ).unwrap();
    assert.equal(new TextDecoder().decode(decrypted), "secret message");
  });

  it("decrypt fails with wrong key", async () => {
    const key1 = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const key2 = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const encrypted = (await Crypto.aesGcm.encrypt(key1, "secret").run()).unwrap();
    const result = await Crypto.aesGcm.decrypt(key2, encrypted.iv, encrypted.data).run();
    assert.equal(result.isErr, true);
  });

  it("supports additional data", async () => {
    const key = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const aad = new TextEncoder().encode("metadata");
    const encrypted = (await Crypto.aesGcm.encrypt(key, "payload", aad).run()).unwrap();
    const decrypted = (
      await Crypto.aesGcm.decrypt(key, encrypted.iv, encrypted.data, aad).run()
    ).unwrap();
    assert.equal(new TextDecoder().decode(decrypted), "payload");
  });

  it("decrypt fails with wrong additional data", async () => {
    const key = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const aad = new TextEncoder().encode("correct");
    const encrypted = (await Crypto.aesGcm.encrypt(key, "payload", aad).run()).unwrap();
    const wrongAad = new TextEncoder().encode("wrong");
    const result = await Crypto.aesGcm.decrypt(key, encrypted.iv, encrypted.data, wrongAad).run();
    assert.equal(result.isErr, true);
  });
});

// =============================================================================
// 5. AES-CBC
// =============================================================================

describe("Crypto.aesCbc", () => {
  it("encrypt and decrypt round-trip", async () => {
    const key = (await Crypto.generateKey.aesCbc(256).run()).unwrap();
    const encrypted = (await Crypto.aesCbc.encrypt(key, "cbc secret").run()).unwrap();
    assert.equal(encrypted.iv.length, 16);

    const decrypted = (
      await Crypto.aesCbc.decrypt(key, encrypted.iv, encrypted.data).run()
    ).unwrap();
    assert.equal(new TextDecoder().decode(decrypted), "cbc secret");
  });
});

// =============================================================================
// 6. ECDSA
// =============================================================================

describe("Crypto.ecdsa", () => {
  it("sign and verify round-trip", async () => {
    const pair = (await Crypto.generateKey.ecdsa("P-256").run()).unwrap();
    const sig = (await Crypto.ecdsa.sign(pair.privateKey, "data to sign").run()).unwrap();
    assert.ok(sig instanceof Uint8Array);

    const valid = (await Crypto.ecdsa.verify(pair.publicKey, sig, "data to sign").run()).unwrap();
    assert.equal(valid, true);
  });

  it("verify fails with tampered data", async () => {
    const pair = (await Crypto.generateKey.ecdsa("P-256").run()).unwrap();
    const sig = (await Crypto.ecdsa.sign(pair.privateKey, "original").run()).unwrap();
    const valid = (await Crypto.ecdsa.verify(pair.publicKey, sig, "tampered").run()).unwrap();
    assert.equal(valid, false);
  });

  it("supports P-384 curve", async () => {
    const pair = (await Crypto.generateKey.ecdsa("P-384").run()).unwrap();
    const sig = (await Crypto.ecdsa.sign(pair.privateKey, "hello", "SHA-384").run()).unwrap();
    const valid = (
      await Crypto.ecdsa.verify(pair.publicKey, sig, "hello", "SHA-384").run()
    ).unwrap();
    assert.equal(valid, true);
  });
});

// =============================================================================
// 7. RSA-PSS
// =============================================================================

describe("Crypto.rsaPss", () => {
  it("sign and verify round-trip", async () => {
    const pair = (await Crypto.generateKey.rsaPss(2048, "SHA-256").run()).unwrap();
    const sig = (await Crypto.rsaPss.sign(pair.privateKey, "rsa data").run()).unwrap();
    assert.ok(sig instanceof Uint8Array);

    const valid = (await Crypto.rsaPss.verify(pair.publicKey, sig, "rsa data").run()).unwrap();
    assert.equal(valid, true);
  });

  it("verify fails with wrong data", async () => {
    const pair = (await Crypto.generateKey.rsaPss(2048, "SHA-256").run()).unwrap();
    const sig = (await Crypto.rsaPss.sign(pair.privateKey, "correct").run()).unwrap();
    const valid = (await Crypto.rsaPss.verify(pair.publicKey, sig, "wrong").run()).unwrap();
    assert.equal(valid, false);
  });
});

// =============================================================================
// 8. RSA-OAEP
// =============================================================================

describe("Crypto.rsaOaep", () => {
  it("encrypt and decrypt round-trip", async () => {
    const pair = (await Crypto.generateKey.rsaOaep(2048, "SHA-256").run()).unwrap();
    const encrypted = (await Crypto.rsaOaep.encrypt(pair.publicKey, "rsa secret").run()).unwrap();
    assert.ok(encrypted instanceof Uint8Array);

    const decrypted = (await Crypto.rsaOaep.decrypt(pair.privateKey, encrypted).run()).unwrap();
    assert.equal(new TextDecoder().decode(decrypted), "rsa secret");
  });
});

// =============================================================================
// 9. PBKDF2
// =============================================================================

describe("Crypto.pbkdf2", () => {
  it("derives consistent key from password", async () => {
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const a = (
      await Crypto.pbkdf2.deriveBits("password123", salt, 100000, "SHA-256", 256).run()
    ).unwrap();
    const b = (
      await Crypto.pbkdf2.deriveBits("password123", salt, 100000, "SHA-256", 256).run()
    ).unwrap();
    assert.equal(a.length, 32);
    assert.deepEqual(a, b);
  });

  it("different passwords produce different keys", async () => {
    const salt = new Uint8Array(16);
    const a = (await Crypto.pbkdf2.deriveBits("pass1", salt, 1000, "SHA-256", 256).run()).unwrap();
    const b = (await Crypto.pbkdf2.deriveBits("pass2", salt, 1000, "SHA-256", 256).run()).unwrap();
    assert.notDeepEqual(a, b);
  });
});

// =============================================================================
// 10. HKDF
// =============================================================================

describe("Crypto.hkdf", () => {
  it("derives key material", async () => {
    const ikm = new Uint8Array(32);
    const salt = new Uint8Array(16);
    const info = new TextEncoder().encode("context");
    const result = (await Crypto.hkdf.deriveBits(ikm, salt, info, "SHA-256", 256).run()).unwrap();
    assert.equal(result.length, 32);
  });
});

// =============================================================================
// 11. ECDH
// =============================================================================

describe("Crypto.ecdh", () => {
  it("derives shared secret between two key pairs", async () => {
    const alice = (await Crypto.generateKey.ecdh("P-256").run()).unwrap();
    const bob = (await Crypto.generateKey.ecdh("P-256").run()).unwrap();

    const sharedA = (
      await Crypto.ecdh.deriveBits(alice.privateKey, bob.publicKey, 256).run()
    ).unwrap();
    const sharedB = (
      await Crypto.ecdh.deriveBits(bob.privateKey, alice.publicKey, 256).run()
    ).unwrap();

    assert.equal(sharedA.length, 32);
    assert.deepEqual(sharedA, sharedB);
  });
});

// =============================================================================
// 12. Key export/import
// =============================================================================

describe("Crypto.exportKey / importKey", () => {
  it("export and re-import AES key as raw", async () => {
    const key = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    const exported = (await Crypto.exportKey("raw", key).run()).unwrap();
    assert.ok(exported instanceof Uint8Array);
    assert.equal(exported.length, 32);

    const imported = (
      await Crypto.importKey.raw(exported, { name: "AES-GCM" }, ["encrypt", "decrypt"]).run()
    ).unwrap();
    assert.ok(imported);

    // Verify the imported key works
    const encrypted = (await Crypto.aesGcm.encrypt(imported, "test").run()).unwrap();
    const decrypted = (
      await Crypto.aesGcm.decrypt(imported, encrypted.iv, encrypted.data).run()
    ).unwrap();
    assert.equal(new TextDecoder().decode(decrypted), "test");
  });

  it("export and re-import as JWK", async () => {
    const key = (await Crypto.generateKey.hmac("SHA-256").run()).unwrap();
    const jwk = (await Crypto.exportKey("jwk", key).run()).unwrap();
    assert.equal(typeof jwk, "object");
    assert.ok("kty" in jwk);

    const imported = (
      await Crypto.importKey.jwk(jwk, { name: "HMAC", hash: "SHA-256" }, ["sign", "verify"]).run()
    ).unwrap();

    const sig = (await Crypto.hmac.sign(imported, "data").run()).unwrap();
    const valid = (await Crypto.hmac.verify(imported, sig, "data").run()).unwrap();
    assert.equal(valid, true);
  });
});

// =============================================================================
// 13. Key wrapping
// =============================================================================

describe("Crypto.wrapKey / unwrapKey", () => {
  it("wrap and unwrap an AES key with another AES key", async () => {
    const dataKey = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
    // Import a key with wrapKey/unwrapKey usages
    const rawKey = Crypto.randomBytes(32).unwrap();
    const wrapKey = (
      await Crypto.importKey.raw(rawKey, { name: "AES-GCM" }, ["wrapKey", "unwrapKey"]).run()
    ).unwrap();

    const iv = Crypto.randomBytes(12).unwrap();
    const wrapped = (
      await Crypto.wrapKey("raw", dataKey, wrapKey, { name: "AES-GCM", iv }).run()
    ).unwrap();
    assert.ok(wrapped instanceof Uint8Array);

    const unwrapped = (
      await Crypto.unwrapKey(
        "raw",
        wrapped,
        wrapKey,
        { name: "AES-GCM", iv },
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"],
      ).run()
    ).unwrap();
    assert.ok(unwrapped);

    // Verify the unwrapped key works
    const encrypted = (await Crypto.aesGcm.encrypt(unwrapped, "wrapped test").run()).unwrap();
    const decrypted = (
      await Crypto.aesGcm.decrypt(unwrapped, encrypted.iv, encrypted.data).run()
    ).unwrap();
    assert.equal(new TextDecoder().decode(decrypted), "wrapped test");
  });
});

// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module io/crypto
 *
 * Batteries-included wrapper for the Web Crypto API (globalThis.crypto).
 *
 * Covers the full Web Crypto surface: hashing, HMAC, symmetric encryption
 * (AES-GCM/CBC), asymmetric signing (ECDSA, RSA-PSS), asymmetric encryption
 * (RSA-OAEP), key derivation (PBKDF2, HKDF), key exchange (ECDH), key
 * management (generate, import, export, wrap, unwrap), and random generation.
 *
 * All async operations return TaskLike. All fallible sync operations return
 * Result. Uses only web standard APIs available in Node 22+, Deno, and Bun.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Cryptographic operation failed. */
export const CryptoError: ErrTypeConstructor<"CryptoError", string> = ErrType("CryptoError");

// ── Structural types for Web Crypto API ─────────────────────────────────────
// Why: tsconfig uses "lib": ["es2024"] without DOM types. Access crypto
// structurally to avoid requiring @types/node or DOM lib.

type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
type AesLength = 128 | 192 | 256;
type NamedCurve = "P-256" | "P-384" | "P-521";
type KeyFormat = "raw" | "jwk" | "pkcs8" | "spki";
type KeyUsage =
  | "encrypt"
  | "decrypt"
  | "sign"
  | "verify"
  | "deriveKey"
  | "deriveBits"
  | "wrapKey"
  | "unwrapKey";

/** Structural descriptor for a Web Crypto key. */
export interface CryptoKeyDescriptor {
  /** Key type (e.g. "public", "private", "secret"). */
  readonly type: string;
  /** Whether the key material can be exported. */
  readonly extractable: boolean;
  /** Algorithm parameters associated with the key. */
  readonly algorithm: Record<string, unknown>;
  /** Permitted operations for this key. */
  readonly usages: readonly string[];
}

/** Structural descriptor for an asymmetric key pair. */
export interface CryptoKeyPairDescriptor {
  /** The public key of the pair. */
  readonly publicKey: CryptoKeyDescriptor;
  /** The private key of the pair. */
  readonly privateKey: CryptoKeyDescriptor;
}

interface SubtleCrypto {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  sign(
    algorithm: string | Record<string, unknown>,
    key: CryptoKeyDescriptor,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  verify(
    algorithm: string | Record<string, unknown>,
    key: CryptoKeyDescriptor,
    signature: Uint8Array,
    data: Uint8Array,
  ): Promise<boolean>;
  encrypt(
    algorithm: Record<string, unknown>,
    key: CryptoKeyDescriptor,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  decrypt(
    algorithm: Record<string, unknown>,
    key: CryptoKeyDescriptor,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  generateKey(
    algorithm: Record<string, unknown>,
    extractable: boolean,
    keyUsages: readonly KeyUsage[],
  ): Promise<CryptoKeyDescriptor | CryptoKeyPairDescriptor>;
  importKey(
    format: KeyFormat,
    keyData: Uint8Array | Record<string, unknown>,
    algorithm: string | Record<string, unknown>,
    extractable: boolean,
    keyUsages: readonly KeyUsage[],
  ): Promise<CryptoKeyDescriptor>;
  exportKey(
    format: KeyFormat,
    key: CryptoKeyDescriptor,
  ): Promise<ArrayBuffer | Record<string, unknown>>;
  deriveBits(
    algorithm: Record<string, unknown>,
    baseKey: CryptoKeyDescriptor,
    length: number,
  ): Promise<ArrayBuffer>;
  wrapKey(
    format: KeyFormat,
    key: CryptoKeyDescriptor,
    wrappingKey: CryptoKeyDescriptor,
    wrapAlgorithm: Record<string, unknown>,
  ): Promise<ArrayBuffer>;
  unwrapKey(
    format: KeyFormat,
    wrappedKey: Uint8Array,
    unwrappingKey: CryptoKeyDescriptor,
    unwrapAlgorithm: Record<string, unknown>,
    unwrappedKeyAlgorithm: string | Record<string, unknown>,
    extractable: boolean,
    keyUsages: readonly KeyUsage[],
  ): Promise<CryptoKeyDescriptor>;
}

interface WebCrypto {
  randomUUID(): string;
  getRandomValues(array: Uint8Array): Uint8Array;
  readonly subtle: SubtleCrypto;
}

/** Access globalThis.crypto structurally. */
const getCrypto = (): WebCrypto => (globalThis as unknown as { crypto: WebCrypto }).crypto;

// ── Helpers ─────────────────────────────────────────────────────────────────

const toBytes = (data: string | Uint8Array): Uint8Array =>
  typeof data === "string" ? new TextEncoder().encode(data) : data;

const toHex = (bytes: Uint8Array): string => {
  const hex: string[] = [];
  for (const b of bytes) {
    hex.push(b.toString(16).padStart(2, "0"));
  }
  return hex.join("");
};

const wrapErr = (e: unknown): ErrType<"CryptoError"> =>
  CryptoError(e instanceof Error ? e.message : String(e));

const cryptoTask = <T>(fn: () => Promise<T>): TaskLike<T, ErrType<"CryptoError">> =>
  makeTask(async () => {
    try {
      return Ok(await fn());
    } catch (e) {
      return Err(wrapErr(e));
    }
  });

// ── Crypto ──────────────────────────────────────────────────────────────────

/**
 * Batteries-included cryptographic operations using the Web Crypto API.
 *
 * All methods use `globalThis.crypto` which is available in Node 22+,
 * Deno, and Bun without any imports.
 *
 * @example
 * ```ts
 * // Random
 * Crypto.uuid();                         // 'f47ac10b-58cc-...'
 * Crypto.randomBytes(32);                // Ok(Uint8Array[32])
 * Crypto.randomInt(1, 100);              // Ok(42)
 *
 * // Hashing
 * await Crypto.hash('SHA-256', 'hello').run();     // Ok(Uint8Array)
 * await Crypto.hashHex('SHA-256', 'hello').run();  // Ok('2cf24d...')
 *
 * // HMAC
 * const key = await Crypto.generateKey.hmac('SHA-256').run();
 * const sig = await Crypto.hmac.sign(key, 'hello').run();
 * await Crypto.hmac.verify(key, sig, 'hello').run();  // Ok(true)
 *
 * // AES-GCM
 * const aesKey = await Crypto.generateKey.aesGcm(256).run();
 * const encrypted = await Crypto.aesGcm.encrypt(aesKey, 'secret').run();
 * const decrypted = await Crypto.aesGcm.decrypt(aesKey, encrypted.iv, encrypted.data).run();
 * ```
 */
export const Crypto: {
  // ── Random ──
  /** Generate a random UUID v4. Never fails. */
  readonly uuid: () => string;
  /** Generate cryptographically random bytes. */
  readonly randomBytes: (length: number) => Result<Uint8Array, ErrType<"CryptoError">>;
  /** Generate a random integer in [min, max) without modulo bias. */
  readonly randomInt: (min: number, max: number) => Result<number, ErrType<"CryptoError">>;

  // ── Hashing ──
  /** Hash data using a digest algorithm. */
  readonly hash: (
    algorithm: HashAlgorithm,
    data: string | Uint8Array,
  ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  /** Hash data and return the result as a hex string. */
  readonly hashHex: (
    algorithm: HashAlgorithm,
    data: string | Uint8Array,
  ) => TaskLike<string, ErrType<"CryptoError">>;
  /** Constant-time comparison of two byte arrays to prevent timing attacks. */
  readonly timingSafeEqual: (a: Uint8Array, b: Uint8Array) => boolean;

  // ── HMAC ──
  readonly hmac: {
    /** Sign data with an HMAC key. */
    readonly sign: (
      key: CryptoKeyDescriptor,
      data: string | Uint8Array,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
    /** Verify an HMAC signature. */
    readonly verify: (
      key: CryptoKeyDescriptor,
      signature: Uint8Array,
      data: string | Uint8Array,
    ) => TaskLike<boolean, ErrType<"CryptoError">>;
  };

  // ── AES-GCM ──
  readonly aesGcm: {
    /** Encrypt data with AES-GCM. Returns iv and ciphertext. */
    readonly encrypt: (
      key: CryptoKeyDescriptor,
      data: string | Uint8Array,
      additionalData?: Uint8Array,
    ) => TaskLike<{ readonly iv: Uint8Array; readonly data: Uint8Array }, ErrType<"CryptoError">>;
    /** Decrypt AES-GCM ciphertext. */
    readonly decrypt: (
      key: CryptoKeyDescriptor,
      iv: Uint8Array,
      data: Uint8Array,
      additionalData?: Uint8Array,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  };

  // ── AES-CBC ──
  readonly aesCbc: {
    /** Encrypt data with AES-CBC. Returns iv and ciphertext. */
    readonly encrypt: (
      key: CryptoKeyDescriptor,
      data: string | Uint8Array,
    ) => TaskLike<{ readonly iv: Uint8Array; readonly data: Uint8Array }, ErrType<"CryptoError">>;
    /** Decrypt AES-CBC ciphertext. */
    readonly decrypt: (
      key: CryptoKeyDescriptor,
      iv: Uint8Array,
      data: Uint8Array,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  };

  // ── ECDSA ──
  readonly ecdsa: {
    /** Sign data with an ECDSA private key. */
    readonly sign: (
      key: CryptoKeyDescriptor,
      data: string | Uint8Array,
      hash?: HashAlgorithm,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
    /** Verify an ECDSA signature with a public key. */
    readonly verify: (
      key: CryptoKeyDescriptor,
      signature: Uint8Array,
      data: string | Uint8Array,
      hash?: HashAlgorithm,
    ) => TaskLike<boolean, ErrType<"CryptoError">>;
  };

  // ── RSA-PSS ──
  readonly rsaPss: {
    /** Sign data with an RSA-PSS private key. */
    readonly sign: (
      key: CryptoKeyDescriptor,
      data: string | Uint8Array,
      saltLength?: number,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
    /** Verify an RSA-PSS signature with a public key. */
    readonly verify: (
      key: CryptoKeyDescriptor,
      signature: Uint8Array,
      data: string | Uint8Array,
      saltLength?: number,
    ) => TaskLike<boolean, ErrType<"CryptoError">>;
  };

  // ── RSA-OAEP ──
  readonly rsaOaep: {
    /** Encrypt data with an RSA-OAEP public key. */
    readonly encrypt: (
      key: CryptoKeyDescriptor,
      data: string | Uint8Array,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
    /** Decrypt data with an RSA-OAEP private key. */
    readonly decrypt: (
      key: CryptoKeyDescriptor,
      data: Uint8Array,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  };

  // ── Key derivation ──
  readonly pbkdf2: {
    /** Derive key bits from a password using PBKDF2. */
    readonly deriveBits: (
      password: string | Uint8Array,
      salt: Uint8Array,
      iterations: number,
      hash: HashAlgorithm,
      bits: number,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  };
  readonly hkdf: {
    /** Derive key bits using HKDF. */
    readonly deriveBits: (
      keyMaterial: Uint8Array,
      salt: Uint8Array,
      info: Uint8Array,
      hash: HashAlgorithm,
      bits: number,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  };

  // ── ECDH ──
  readonly ecdh: {
    /** Derive shared secret bits from an ECDH private key and a public key. */
    readonly deriveBits: (
      privateKey: CryptoKeyDescriptor,
      publicKey: CryptoKeyDescriptor,
      bits: number,
    ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  };

  // ── Key management ──
  readonly generateKey: {
    /** Generate an HMAC key. */
    readonly hmac: (hash: HashAlgorithm) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
    /** Generate an AES-GCM key. */
    readonly aesGcm: (length: AesLength) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
    /** Generate an AES-CBC key. */
    readonly aesCbc: (length: AesLength) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
    /** Generate an ECDSA key pair. */
    readonly ecdsa: (
      curve: NamedCurve,
    ) => TaskLike<CryptoKeyPairDescriptor, ErrType<"CryptoError">>;
    /** Generate an RSA-PSS key pair. */
    readonly rsaPss: (
      modulusLength: number,
      hash: HashAlgorithm,
    ) => TaskLike<CryptoKeyPairDescriptor, ErrType<"CryptoError">>;
    /** Generate an RSA-OAEP key pair. */
    readonly rsaOaep: (
      modulusLength: number,
      hash: HashAlgorithm,
    ) => TaskLike<CryptoKeyPairDescriptor, ErrType<"CryptoError">>;
    /** Generate an ECDH key pair. */
    readonly ecdh: (curve: NamedCurve) => TaskLike<CryptoKeyPairDescriptor, ErrType<"CryptoError">>;
  };

  readonly importKey: {
    /** Import a raw symmetric key. */
    readonly raw: (
      keyData: Uint8Array,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
    /** Import a key from JWK format. */
    readonly jwk: (
      keyData: Record<string, unknown>,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
    /** Import a key from PKCS8 format (private keys). */
    readonly pkcs8: (
      keyData: Uint8Array,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
    /** Import a key from SPKI format (public keys). */
    readonly spki: (
      keyData: Uint8Array,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
  };

  /** Export a key to the specified format. */
  readonly exportKey: (
    format: KeyFormat,
    key: CryptoKeyDescriptor,
  ) => TaskLike<Uint8Array | Record<string, unknown>, ErrType<"CryptoError">>;

  /** Wrap a key with a wrapping key. */
  readonly wrapKey: (
    format: KeyFormat,
    key: CryptoKeyDescriptor,
    wrappingKey: CryptoKeyDescriptor,
    wrapAlgorithm: Record<string, unknown>,
  ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;

  /** Unwrap a key with an unwrapping key. */
  readonly unwrapKey: (
    format: KeyFormat,
    wrappedKey: Uint8Array,
    unwrappingKey: CryptoKeyDescriptor,
    unwrapAlgorithm: Record<string, unknown>,
    unwrappedKeyAlgorithm: string | Record<string, unknown>,
    extractable: boolean,
    keyUsages: readonly KeyUsage[],
  ) => TaskLike<CryptoKeyDescriptor, ErrType<"CryptoError">>;
} = {
  // ── Random ──────────────────────────────────────────────────────────────

  uuid: (): string => getCrypto().randomUUID(),

  randomBytes: (length: number): Result<Uint8Array, ErrType<"CryptoError">> => {
    try {
      return Ok(getCrypto().getRandomValues(new Uint8Array(length)));
    } catch (e) {
      return Err(wrapErr(e));
    }
  },

  randomInt: (min: number, max: number): Result<number, ErrType<"CryptoError">> => {
    if (min >= max) return Err(CryptoError("min must be less than max"));
    try {
      const range = max - min;
      // Use rejection sampling to avoid modulo bias
      const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
      const maxValid = 256 ** bytesNeeded;
      const limit = maxValid - (maxValid % range);
      const bytes = new Uint8Array(bytesNeeded);
      let value: number;
      do {
        getCrypto().getRandomValues(bytes);
        value = 0;
        for (let i = 0; i < bytesNeeded; i++) {
          value = value * 256 + (bytes[i] ?? 0);
        }
      } while (value >= limit);
      return Ok(min + (value % range));
    } catch (e) {
      return Err(wrapErr(e));
    }
  },

  // ── Hashing ─────────────────────────────────────────────────────────────

  hash: (algorithm: HashAlgorithm, data: string | Uint8Array) =>
    cryptoTask(async () => {
      const buffer = await getCrypto().subtle.digest(algorithm, toBytes(data));
      return new Uint8Array(buffer);
    }),

  hashHex: (algorithm: HashAlgorithm, data: string | Uint8Array) =>
    cryptoTask(async () => {
      const buffer = await getCrypto().subtle.digest(algorithm, toBytes(data));
      return toHex(new Uint8Array(buffer));
    }),

  timingSafeEqual: (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    return diff === 0;
  },

  // ── HMAC ────────────────────────────────────────────────────────────────

  hmac: {
    sign: (key: CryptoKeyDescriptor, data: string | Uint8Array) =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.sign("HMAC", key, toBytes(data));
        return new Uint8Array(buffer);
      }),
    verify: (key: CryptoKeyDescriptor, signature: Uint8Array, data: string | Uint8Array) =>
      cryptoTask(() => getCrypto().subtle.verify("HMAC", key, signature, toBytes(data))),
  },

  // ── AES-GCM ─────────────────────────────────────────────────────────────

  aesGcm: {
    encrypt: (key: CryptoKeyDescriptor, data: string | Uint8Array, additionalData?: Uint8Array) =>
      cryptoTask(async () => {
        const iv = getCrypto().getRandomValues(new Uint8Array(12));
        const algo: Record<string, unknown> = { name: "AES-GCM", iv };
        if (additionalData) algo["additionalData"] = additionalData;
        const buffer = await getCrypto().subtle.encrypt(algo, key, toBytes(data));
        return { iv, data: new Uint8Array(buffer) } as const;
      }),
    decrypt: (
      key: CryptoKeyDescriptor,
      iv: Uint8Array,
      data: Uint8Array,
      additionalData?: Uint8Array,
    ) =>
      cryptoTask(async () => {
        const algo: Record<string, unknown> = { name: "AES-GCM", iv };
        if (additionalData) algo["additionalData"] = additionalData;
        const buffer = await getCrypto().subtle.decrypt(algo, key, data);
        return new Uint8Array(buffer);
      }),
  },

  // ── AES-CBC ─────────────────────────────────────────────────────────────

  aesCbc: {
    encrypt: (key: CryptoKeyDescriptor, data: string | Uint8Array) =>
      cryptoTask(async () => {
        const iv = getCrypto().getRandomValues(new Uint8Array(16));
        const buffer = await getCrypto().subtle.encrypt(
          { name: "AES-CBC", iv },
          key,
          toBytes(data),
        );
        return { iv, data: new Uint8Array(buffer) } as const;
      }),
    decrypt: (key: CryptoKeyDescriptor, iv: Uint8Array, data: Uint8Array) =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.decrypt({ name: "AES-CBC", iv }, key, data);
        return new Uint8Array(buffer);
      }),
  },

  // ── ECDSA ───────────────────────────────────────────────────────────────

  ecdsa: {
    sign: (key: CryptoKeyDescriptor, data: string | Uint8Array, hash: HashAlgorithm = "SHA-256") =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.sign(
          { name: "ECDSA", hash: { name: hash } },
          key,
          toBytes(data),
        );
        return new Uint8Array(buffer);
      }),
    verify: (
      key: CryptoKeyDescriptor,
      signature: Uint8Array,
      data: string | Uint8Array,
      hash: HashAlgorithm = "SHA-256",
    ) =>
      cryptoTask(() =>
        getCrypto().subtle.verify(
          { name: "ECDSA", hash: { name: hash } },
          key,
          signature,
          toBytes(data),
        ),
      ),
  },

  // ── RSA-PSS ─────────────────────────────────────────────────────────────

  rsaPss: {
    sign: (key: CryptoKeyDescriptor, data: string | Uint8Array, saltLength: number = 32) =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.sign(
          { name: "RSA-PSS", saltLength },
          key,
          toBytes(data),
        );
        return new Uint8Array(buffer);
      }),
    verify: (
      key: CryptoKeyDescriptor,
      signature: Uint8Array,
      data: string | Uint8Array,
      saltLength: number = 32,
    ) =>
      cryptoTask(() =>
        getCrypto().subtle.verify({ name: "RSA-PSS", saltLength }, key, signature, toBytes(data)),
      ),
  },

  // ── RSA-OAEP ────────────────────────────────────────────────────────────

  rsaOaep: {
    encrypt: (key: CryptoKeyDescriptor, data: string | Uint8Array) =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.encrypt({ name: "RSA-OAEP" }, key, toBytes(data));
        return new Uint8Array(buffer);
      }),
    decrypt: (key: CryptoKeyDescriptor, data: Uint8Array) =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.decrypt({ name: "RSA-OAEP" }, key, data);
        return new Uint8Array(buffer);
      }),
  },

  // ── Key derivation ──────────────────────────────────────────────────────

  pbkdf2: {
    deriveBits: (
      password: string | Uint8Array,
      salt: Uint8Array,
      iterations: number,
      hash: HashAlgorithm,
      bits: number,
    ) =>
      cryptoTask(async () => {
        const subtle = getCrypto().subtle;
        const baseKey = await subtle.importKey("raw", toBytes(password), "PBKDF2", false, [
          "deriveBits",
        ]);
        const buffer = await subtle.deriveBits(
          { name: "PBKDF2", salt, iterations, hash: { name: hash } },
          baseKey,
          bits,
        );
        return new Uint8Array(buffer);
      }),
  },

  hkdf: {
    deriveBits: (
      keyMaterial: Uint8Array,
      salt: Uint8Array,
      info: Uint8Array,
      hash: HashAlgorithm,
      bits: number,
    ) =>
      cryptoTask(async () => {
        const subtle = getCrypto().subtle;
        const baseKey = await subtle.importKey("raw", keyMaterial, "HKDF", false, ["deriveBits"]);
        const buffer = await subtle.deriveBits(
          { name: "HKDF", salt, info, hash: { name: hash } },
          baseKey,
          bits,
        );
        return new Uint8Array(buffer);
      }),
  },

  // ── ECDH ────────────────────────────────────────────────────────────────

  ecdh: {
    deriveBits: (privateKey: CryptoKeyDescriptor, publicKey: CryptoKeyDescriptor, bits: number) =>
      cryptoTask(async () => {
        const buffer = await getCrypto().subtle.deriveBits(
          { name: "ECDH", public: publicKey },
          privateKey,
          bits,
        );
        return new Uint8Array(buffer);
      }),
  },

  // ── Key management ──────────────────────────────────────────────────────

  generateKey: {
    hmac: (hash: HashAlgorithm) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey({ name: "HMAC", hash: { name: hash } }, true, [
            "sign",
            "verify",
          ]) as Promise<CryptoKeyDescriptor>,
      ),
    aesGcm: (length: AesLength) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey({ name: "AES-GCM", length }, true, [
            "encrypt",
            "decrypt",
          ]) as Promise<CryptoKeyDescriptor>,
      ),
    aesCbc: (length: AesLength) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey({ name: "AES-CBC", length }, true, [
            "encrypt",
            "decrypt",
          ]) as Promise<CryptoKeyDescriptor>,
      ),
    ecdsa: (curve: NamedCurve) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey({ name: "ECDSA", namedCurve: curve }, true, [
            "sign",
            "verify",
          ]) as Promise<CryptoKeyPairDescriptor>,
      ),
    rsaPss: (modulusLength: number, hash: HashAlgorithm) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey(
            {
              name: "RSA-PSS",
              modulusLength,
              publicExponent: new Uint8Array([1, 0, 1]),
              hash: { name: hash },
            },
            true,
            ["sign", "verify"],
          ) as Promise<CryptoKeyPairDescriptor>,
      ),
    rsaOaep: (modulusLength: number, hash: HashAlgorithm) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey(
            {
              name: "RSA-OAEP",
              modulusLength,
              publicExponent: new Uint8Array([1, 0, 1]),
              hash: { name: hash },
            },
            true,
            ["encrypt", "decrypt"],
          ) as Promise<CryptoKeyPairDescriptor>,
      ),
    ecdh: (curve: NamedCurve) =>
      cryptoTask(
        () =>
          getCrypto().subtle.generateKey({ name: "ECDH", namedCurve: curve }, true, [
            "deriveBits",
          ]) as Promise<CryptoKeyPairDescriptor>,
      ),
  },

  importKey: {
    raw: (
      keyData: Uint8Array,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => cryptoTask(() => getCrypto().subtle.importKey("raw", keyData, algorithm, true, usages)),
    jwk: (
      keyData: Record<string, unknown>,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => cryptoTask(() => getCrypto().subtle.importKey("jwk", keyData, algorithm, true, usages)),
    pkcs8: (
      keyData: Uint8Array,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => cryptoTask(() => getCrypto().subtle.importKey("pkcs8", keyData, algorithm, true, usages)),
    spki: (
      keyData: Uint8Array,
      algorithm: string | Record<string, unknown>,
      usages: readonly KeyUsage[],
    ) => cryptoTask(() => getCrypto().subtle.importKey("spki", keyData, algorithm, true, usages)),
  },

  exportKey: (format: KeyFormat, key: CryptoKeyDescriptor) =>
    cryptoTask(async () => {
      const result = await getCrypto().subtle.exportKey(format, key);
      if (result instanceof ArrayBuffer)
        return new Uint8Array(result) as Uint8Array | Record<string, unknown>;
      return result;
    }),

  wrapKey: (
    format: KeyFormat,
    key: CryptoKeyDescriptor,
    wrappingKey: CryptoKeyDescriptor,
    wrapAlgorithm: Record<string, unknown>,
  ) =>
    cryptoTask(async () => {
      const buffer = await getCrypto().subtle.wrapKey(format, key, wrappingKey, wrapAlgorithm);
      return new Uint8Array(buffer);
    }),

  unwrapKey: (
    format: KeyFormat,
    wrappedKey: Uint8Array,
    unwrappingKey: CryptoKeyDescriptor,
    unwrapAlgorithm: Record<string, unknown>,
    unwrappedKeyAlgorithm: string | Record<string, unknown>,
    extractable: boolean,
    keyUsages: readonly KeyUsage[],
  ) =>
    cryptoTask(() =>
      getCrypto().subtle.unwrapKey(
        format,
        wrappedKey,
        unwrappingKey,
        unwrapAlgorithm,
        unwrappedKeyAlgorithm,
        extractable,
        keyUsages,
      ),
    ),
};

/**
 * @module io/compression
 *
 * Type-safe compression and decompression via CompressionStream.
 *
 * **Why wrap CompressionStream / DecompressionStream?**
 * The web standard Compression Streams API is async and stream-based,
 * requiring boilerplate to collect the output into a single Uint8Array.
 * These wrappers handle the piping and collection, returning Task for
 * lazy, composable async operations. Available in Node 22.15+, Deno 1.38+,
 * and Bun with no imports required.
 *
 * **Implementation note:** Uses `Blob.stream().pipeThrough()` to pipe data
 * through the transform stream. This is the web standard approach and handles
 * backpressure correctly across all runtimes. Earlier versions used manual
 * writer/reader coordination which deadlocked on Deno.
 *
 * **Troubleshooting:**
 * - If compression hangs, ensure Deno >= 1.38 (older versions have buggy
 *   CompressionStream).
 * - Workers/Browser: CompressionStream may not be available in all
 *   environments. Operations return `Err(CompressionError(...))` if missing.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Compression or decompression operation failed. */
export const CompressionError: ErrTypeConstructor<"CompressionError", string> =
  ErrType("CompressionError");

// ── Structural types for Compression Streams API ────────────────────────────
// Why: tsconfig uses "lib": ["es2024"] without DOM types. Define the
// minimal structural interfaces needed for CompressionStream/DecompressionStream.

interface StreamReader<T> {
  read(): Promise<{ done: boolean; value: T }>;
}

interface ReadableStreamLike<T> {
  getReader(): StreamReader<T>;
  pipeThrough(transform: TransformStreamLike): ReadableStreamLike<Uint8Array>;
}

interface TransformStreamLike {
  readonly readable: ReadableStreamLike<Uint8Array>;
}

interface BlobLike {
  stream(): ReadableStreamLike<Uint8Array>;
}

interface BlobConstructor {
  new (parts: readonly Uint8Array[]): BlobLike;
}

interface CompressionStreamConstructor {
  new (format: string): TransformStreamLike;
}

interface DecompressionStreamConstructor {
  new (format: string): TransformStreamLike;
}

const getBlob = (): BlobConstructor => (globalThis as unknown as { Blob: BlobConstructor }).Blob;

const getCompressionStream = (): CompressionStreamConstructor =>
  (globalThis as unknown as { CompressionStream: CompressionStreamConstructor }).CompressionStream;

const getDecompressionStream = (): DecompressionStreamConstructor =>
  (globalThis as unknown as { DecompressionStream: DecompressionStreamConstructor })
    .DecompressionStream;

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Pipe data through a transform stream and collect the output.
 *
 * Uses the web standard Blob.stream().pipeThrough() pattern which
 * handles backpressure correctly across all runtimes (Node, Deno, Bun).
 */
const pipeThrough = async (
  data: Uint8Array,
  transform: TransformStreamLike,
): Promise<Uint8Array> => {
  const stream = new (getBlob())([data]).stream().pipeThrough(transform);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

/**
 * Create a compression Task using the given format.
 */
const compressWithFormat = (
  data: Uint8Array,
  format: string,
): TaskLike<Uint8Array, ErrType<"CompressionError">> =>
  makeTask(async () => {
    try {
      const Ctor = getCompressionStream();
      return Ok(await pipeThrough(data, new Ctor(format)));
    } catch (e) {
      return Err(CompressionError(e instanceof Error ? e.message : String(e)));
    }
  });

const decompressWithFormat = (
  data: Uint8Array,
  format: string,
): TaskLike<Uint8Array, ErrType<"CompressionError">> =>
  makeTask(async () => {
    try {
      const Ctor = getDecompressionStream();
      return Ok(await pipeThrough(data, new Ctor(format)));
    } catch (e) {
      return Err(CompressionError(e instanceof Error ? e.message : String(e)));
    }
  });

// ── Compression ─────────────────────────────────────────────────────────────

/**
 * Type-safe compression and decompression using web standard streams.
 *
 * Uses CompressionStream and DecompressionStream available in
 * Node 22.15+, Deno, and Bun.
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode('hello world');
 *
 * const compressed = await Compression.gzip(data).run();
 * // Ok(Uint8Array[...])
 *
 * const decompressed = await Compression.gunzip(compressed.unwrap()).run();
 * // Ok(Uint8Array[...]) -> 'hello world'
 * ```
 */
export const Compression: {
  /** Compress data using gzip. */
  readonly gzip: (data: Uint8Array) => TaskLike<Uint8Array, ErrType<"CompressionError">>;
  /** Decompress gzip data. */
  readonly gunzip: (data: Uint8Array) => TaskLike<Uint8Array, ErrType<"CompressionError">>;
  /** Compress data using deflate (raw). */
  readonly deflate: (data: Uint8Array) => TaskLike<Uint8Array, ErrType<"CompressionError">>;
  /** Decompress deflate (raw) data. */
  readonly inflate: (data: Uint8Array) => TaskLike<Uint8Array, ErrType<"CompressionError">>;
} = {
  gzip: (data: Uint8Array) => compressWithFormat(data, "gzip"),
  gunzip: (data: Uint8Array) => decompressWithFormat(data, "gzip"),
  deflate: (data: Uint8Array) => compressWithFormat(data, "deflate-raw"),
  inflate: (data: Uint8Array) => decompressWithFormat(data, "deflate-raw"),
};

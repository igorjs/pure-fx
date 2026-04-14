/**
 * @module io
 *
 * Type-safe wrappers for common I/O and web standard operations.
 *
 * Every operation that can fail returns Result or Task, making error
 * paths explicit in the type system. No exceptions, no invisible
 * control flow.
 */

/** Structured cloning using the web standard algorithm. */
export { Clone, CloneError } from "./clone.js";
/** Web standard compression and decompression streams. */
export { Compression, CompressionError } from "./compression.js";
/** Web standard cryptographic hashing, encryption, and random bytes. */
export { Crypto, CryptoError } from "./crypto.js";
/** Cross-runtime DNS resolution returning Result. */
export { Dns, DnsError, type DnsRecord } from "./dns.js";
/** Base64, hex, and UTF-8 encoding and decoding. */
export { Encoding, EncodingError } from "./encoding.js";
/** Cross-runtime file read, write, append, stat, and remove. */
export { File, FileError, type FileStat } from "./file.js";
/** Safe JSON parse and stringify returning Result. */
export { Json, JsonError } from "./json.js";
/** Cross-runtime TCP client connections. */
export { Net, NetError, type TcpConnection } from "./net.js";
/** Cross-runtime subprocess execution with typed results. */
export { Command, CommandError, type CommandOptions, type CommandResult } from "./subprocess.js";
/** URL parsing and manipulation returning Result. */
export { Url, UrlError } from "./url.js";

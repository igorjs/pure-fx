/**
 * @module io
 *
 * Type-safe wrappers for common I/O and web standard operations.
 *
 * Every operation that can fail returns Result or Task, making error
 * paths explicit in the type system. No exceptions, no invisible
 * control flow.
 */

/** Structured cloning namespace using the web standard algorithm. */
/** Error returned when a deep clone operation fails. */
export { Clone, CloneError } from "./clone.js";
/** Web standard compression and decompression namespace. */
/** Error returned when compression or decompression fails. */
export { Compression, CompressionError } from "./compression.js";
/** Web standard cryptographic hashing, encryption, and random bytes namespace. */
/** Error returned when a cryptographic operation fails. */
export { Crypto, CryptoError } from "./crypto.js";
/** Cross-runtime DNS resolution namespace returning Task. */
/** Error returned when DNS resolution fails. */
/** A resolved DNS address with IP family. */
export { Dns, DnsError, type DnsRecord } from "./dns.js";
/** Base64, hex, and UTF-8 encoding and decoding namespace. */
/** Error returned when an encoding or decoding operation fails. */
export { Encoding, EncodingError } from "./encoding.js";
/** Cross-runtime file read, write, append, stat, and remove namespace. */
/** Error returned when a file system operation fails. */
/** Metadata returned by File.stat (isFile, isDirectory, size, mtime). */
export { File, FileError, type FileStat } from "./file.js";
/** Safe JSON parse and stringify namespace returning Result. */
/** Error returned when JSON parse or stringify fails. */
export { Json, JsonError } from "./json.js";
/** Cross-runtime TCP client namespace. */
/** Error returned when a TCP connection or communication fails. */
/** A connected TCP socket with send, receive, and close operations. */
export { Net, NetError, type TcpConnection } from "./net.js";
/** Cross-runtime subprocess execution namespace. */
/** Error returned when subprocess execution fails. */
/** Options for subprocess execution (cwd, env, timeout, stdin). */
/** Output of a subprocess execution (exitCode, stdout, stderr). */
export { Command, CommandError, type CommandOptions, type CommandResult } from "./subprocess.js";
/** URL parsing and manipulation namespace returning Result. */
/** Error returned when URL parsing or construction fails. */
export { Url, UrlError } from "./url.js";

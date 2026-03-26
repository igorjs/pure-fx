/**
 * structuredClone is an HTML spec API (not ECMAScript), available in
 * Node 17+ and all modern browsers. Not included in any ES lib target.
 */
declare function structuredClone<T>(value: T): T;

/**
 * V8's Error.captureStackTrace (Node 22+, Deno 2+, Chromium).
 * Not part of ECMAScript but universally available in V8 environments.
 */
interface ErrorConstructor {
  captureStackTrace?(target: object, constructorOpt?: (...args: never[]) => unknown): void;
}

/**
 * WHATWG AbortController / AbortSignal (Node 16+, all modern browsers).
 * Not part of ECMAScript but universally available.
 */
declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}

declare class AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Minimal `process` declarations for Node 22+ / Bun / Deno.
 * Only the subset used by Program (signals + exit).
 */
declare const process: {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  exit(code?: number): never;
};

/**
 * WHATWG Timer API. Available in all JS runtimes (Node, Deno, Bun, browsers).
 * Not part of ECMAScript but universally available.
 */
declare function setTimeout(callback: () => void, ms?: number): number;
declare function clearTimeout(id: number): void;

/**
 * Console API (WHATWG). Available in all JS runtimes.
 */
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

/**
 * Explicit Resource Management (ECMAScript 2024).
 * Enables `using` / `await using` declarations for deterministic cleanup.
 * Available in Node 22+, Deno 2+, and modern browsers.
 */
interface SymbolConstructor {
  readonly dispose: unique symbol;
  readonly asyncDispose: unique symbol;
}

interface Disposable {
  [Symbol.dispose](): void;
}

interface AsyncDisposable {
  [Symbol.asyncDispose](): PromiseLike<void>;
}

// ── WHATWG URL API (Node 10+, Deno 1.0+, Bun, browsers) ────────────────────

declare class URL {
  constructor(url: string, base?: string);
  readonly href: string;
  readonly origin: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}

declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | readonly [string, string][]);
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  forEach(callback: (value: string, key: string) => void): void;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  [Symbol.iterator](): IterableIterator<[string, string]>;
  toString(): string;
}

// ── WHATWG Fetch API (Node 18+, Deno 1.0+, Bun, browsers) ──────────────────

type HeadersInit = Headers | Record<string, string> | readonly [string, string][];

declare class Headers {
  constructor(init?: HeadersInit);
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  forEach(callback: (value: string, key: string) => void): void;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

type BodyInit = ReadableStream<Uint8Array> | ArrayBuffer | string | null | undefined;

interface RequestInit {
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: BodyInit;
  readonly signal?: AbortSignal;
}

declare class Request {
  constructor(input: string | Request, init?: RequestInit);
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  readonly signal: AbortSignal;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  clone(): Request;
}

interface ResponseInit {
  readonly status?: number;
  readonly statusText?: string;
  readonly headers?: HeadersInit;
}

declare class Response {
  constructor(body?: BodyInit, init?: ResponseInit);
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  clone(): Response;
}

// ── WHATWG Streams API (Node 18+, Deno 1.0+, Bun, browsers) ────────────────

interface ReadableStreamDefaultController<R> {
  enqueue(chunk: R): void;
  close(): void;
  error(reason?: unknown): void;
}

interface ReadableStreamDefaultReader<R> {
  read(): Promise<{ done: false; value: R } | { done: true; value: undefined }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

declare class ReadableStream<R = Uint8Array> {
  constructor(source?: {
    start?(controller: ReadableStreamDefaultController<R>): void | Promise<void>;
    pull?(controller: ReadableStreamDefaultController<R>): void | Promise<void>;
    cancel?(reason?: unknown): void | Promise<void>;
  });
  getReader(): ReadableStreamDefaultReader<R>;
  readonly locked: boolean;
}

interface WritableStreamDefaultWriter<W> {
  write(chunk: W): Promise<void>;
  close(): Promise<void>;
  releaseLock(): void;
}

declare class WritableStream<W = Uint8Array> {
  getWriter(): WritableStreamDefaultWriter<W>;
  readonly locked: boolean;
}

// ── WHATWG Encoding API (Node 11+, Deno 1.0+, Bun, browsers) ───────────────

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: ArrayBuffer | Uint8Array): string;
}

/**
 * Base64 decoding (WHATWG HTML spec). Used by Lambda adapter for
 * base64-encoded request bodies.
 */
declare function atob(data: string): string;
declare function btoa(data: string): string;

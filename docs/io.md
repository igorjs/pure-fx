# IO

Type-safe wrappers for file system, subprocess, encoding, and network operations. All operations return `Result` or `Task`.

## File

Multi-runtime file system operations (Node, Deno, Bun).

```ts
import { File } from '@igorjs/pure-fx'

// Read/write
const content = await File.read('./config.json').run();     // Result<string, FileError>
await File.write('./out.txt', 'hello').run();               // Result<void, FileError>
await File.append('./log.txt', 'new line\n').run();

// Stat (includes mtime)
const stat = await File.stat('./file.txt').run();
stat.value.isFile;      // true
stat.value.size;        // 1234
stat.value.mtime;       // Date

// Delete a single file
await File.remove('./old.txt').run();

// Directory operations
await File.makeDir('./a/b/c').run();        // recursive
await File.removeDir('./tmp').run();         // recursive
await File.list('./src').run();              // Result<string[], FileError>

// Other
await File.exists('./file.txt').run();       // Result<boolean, FileError>
await File.copy('./a.txt', './b.txt').run();
await File.rename('./old.txt', './new.txt').run();
await File.tempDir('prefix-').run();         // Result<string, FileError>

// Binary read/write
await File.writeBytes('./img.bin', new Uint8Array([0xFF, 0xD8])).run();
const bytes = await File.readBytes('./img.bin').run(); // Result<Uint8Array, FileError>

// Symlinks and hard links
await File.symlink('./target.txt', './link.txt').run();
await File.link('./existing.txt', './hardlink.txt').run();
const target = await File.readLink('./link.txt').run(); // Result<string, FileError>

// File metadata (without following symlinks)
const lstat = await File.lstat('./link.txt').run();

// Permissions (POSIX only)
await File.chmod('./script.sh', 0o755).run();
await File.chown('./file.txt', 1000, 1000).run();

// Truncate and resolve
await File.truncate('./file.txt', 100).run();   // truncate to 100 bytes
const abs = await File.realPath('./relative').run(); // resolve to absolute
```

**Error handling:** All File operations return `Task<T, FileError>`. On failure, `FileError` contains the OS error message (e.g. `ENOENT: no such file or directory`). Use `.isErr` to check, `.error.message` for details.

**Runtime notes:**
- Binary operations (`readBytes`/`writeBytes`) available on all runtimes.
- `chmod`/`chown` are POSIX-only. On Windows they return `Err`.
- `symlink` requires appropriate permissions on Windows.

## Command

Cross-runtime subprocess execution.

```ts
import { Command } from '@igorjs/pure-fx'

const result = await Command.exec('echo', ['hello']).run();
// Result<CommandResult, CommandError>

result.value.exitCode; // 0
result.value.stdout;   // 'hello\n'
result.value.stderr;   // ''

// With options
await Command.exec('cat', [], {
  stdin: 'piped input',   // pipe string to stdin
  cwd: '/tmp',            // working directory
  timeout: 5000,          // kill after 5 seconds
  env: { NODE_ENV: 'test' },
}).run();

// Non-zero exit is Ok (not Err)
const bad = await Command.exec('false').run();
bad.isOk;           // true
bad.value.exitCode;  // 1

// Only spawn failures are Err
const missing = await Command.exec('nonexistent').run();
missing.isErr;       // true
missing.error.tag;   // 'CommandError'

// Fire-and-forget background process
const child = await Command.spawn('node', ['server.js']).run();
if (child.isOk) {
  console.log('PID:', child.value.pid);
  child.value.kill();  // or child.value.unref() to detach
}
```

## Json

Safe JSON parse/stringify returning Result.

```ts
import { Json } from '@igorjs/pure-fx'

Json.parse('{"a":1}');    // Ok({ a: 1 })
Json.parse('{bad}');      // Err(JsonError(...))
Json.stringify({ b: 2 }); // Ok('{"b":2}')
```

## Encoding

Base64, hex, and UTF-8 encoding/decoding.

```ts
import { Encoding } from '@igorjs/pure-fx'

const bytes = Encoding.utf8.encode('hello');
Encoding.base64.encode(bytes);   // 'aGVsbG8='
Encoding.hex.encode(bytes);      // '68656c6c6f'

Encoding.base64.decode('aGVsbG8='); // Ok(Uint8Array)
Encoding.hex.decode('68656c6c6f');  // Ok(Uint8Array)
Encoding.utf8.decode(bytes);        // Ok('hello')
```

## Compression

Gzip and deflate compression via web standard `CompressionStream`. Uses `Blob.stream().pipeThrough()` for correct backpressure handling across all runtimes.

```ts
import { Compression } from '@igorjs/pure-fx'

const data = new TextEncoder().encode('hello world');
const compressed = await Compression.gzip(data).run();
const decompressed = await Compression.gunzip(compressed.unwrap()).run();

// Also supports deflate-raw
const deflated = await Compression.deflate(data).run();
const inflated = await Compression.inflate(deflated.unwrap()).run();
```

**Runtime notes:** Requires `CompressionStream` support (Node 22.15+, Deno 1.38+, Bun). Returns `Err(CompressionError(...))` if unavailable.

## Url

URL parsing and manipulation returning Result.

```ts
import { Url } from '@igorjs/pure-fx'

Url.parse('https://example.com/path?q=1');
// Ok({ hostname: 'example.com', pathname: '/path', ... })

Url.parse('not a url'); // Err(UrlError(...))
```

## Clone

Type-safe deep cloning via the web standard `structuredClone` API. Returns `Result` instead of throwing on non-cloneable types.

```ts
import { Clone } from '@igorjs/pure-fx'

const original = { nested: { value: 42 } };
const cloned = Clone.deep(original);
// Ok({ nested: { value: 42 } }) - fully independent copy

Clone.deep({ fn: () => {} });
// Err(CloneError('... could not be cloned')) - functions are not cloneable
```

## Dns

Cross-runtime DNS resolution with IPv4/IPv6 support.

```ts
import { Dns } from '@igorjs/pure-fx'

// Resolve A/AAAA records
const records = await Dns.resolve('example.com', 'A').run();
// Ok(['93.184.216.34'])

// Lookup with automatic IPv4/IPv6 fallback
const addr = await Dns.lookup('example.com').run();
// Ok({ address: '93.184.216.34', family: 4 })
// Falls back to AAAA if no A records exist
```

## Net

Cross-runtime TCP client.

```ts
import { Net } from '@igorjs/pure-fx'

const conn = await Net.connect({ host: 'localhost', port: 8080 }).run();
if (conn.isOk) {
  await conn.value.send('PING\n');
  const data = await conn.value.receive();
  conn.value.close();
}
```

## Terminal

Cross-runtime terminal interaction for stdin reading, prompting, and password input. Handles TTY detection, piped input, timeouts, and EOF across Node, Deno, and Bun.

```ts
import { Terminal } from '@igorjs/pure-fx'

// Check if running interactively
Terminal.isInteractive(); // true if TTY, false if piped/CI

// Read a line with prompt
const name = await Terminal.readLine('Name: ').run();
// Ok(Some("Alice")) or Ok(None) on EOF

// Read with timeout (prevents blocking in hooks/daemons)
const line = await Terminal.readLine('> ', { timeout: 5000 }).run();
// Ok(None) if no input within 5 seconds

// Read password (masked with asterisks, handles backspace)
const pw = await Terminal.readPassword('Password: ').run();
// Ok(Some("secret")) or Ok(None) on Ctrl+C/Ctrl+D

// Yes/no confirmation (re-prompts on invalid input)
const ok = await Terminal.confirm('Deploy to production?').run();
// Ok(true) or Ok(false)

// Read all piped stdin (non-blocking on TTY)
// echo "data" | node app.js
const input = await Terminal.readAll().run();
// Ok("data\n")

// Terminal size
const size = Terminal.size();
// Some({ columns: 120, rows: 40 }) or None

// Clear screen
Terminal.clear();

// Write to stdout
Terminal.write('loading...');
Terminal.writeLine('done');
```

## WebSocket

Type-safe WebSocket routing with event handlers. Defines routes and handlers; actual upgrade is handled by the runtime adapter (Bun, Deno, or Node).

```ts
import { WebSocket } from '@igorjs/pure-fx'

const ws = WebSocket.router()
  .route('/chat', {
    onOpen: conn => conn.send('Welcome!'),
    onMessage: (conn, msg) => conn.send(`Echo: ${msg}`),
    onClose: () => console.log('disconnected'),
  })
  .route('/notifications', {
    onOpen: conn => subscribe(conn),
    onError: (conn, err) => console.log('ws error', err),
  });

// Pass ws.routes to your runtime adapter
ws.routes;       // readonly WebSocketRoute[]
ws.match('/chat'); // WebSocketHandler | undefined
```

## FFI

Cross-runtime Foreign Function Interface for loading and calling native shared libraries (.so, .dylib, .dll). Wraps `Deno.dlopen`, `bun:ffi`, and `node:ffi` behind a unified API.

### Basic usage

```ts
import { FFI } from '@igorjs/pure-fx'

// Always check availability first
if (!FFI.isAvailable()) {
  console.log('FFI not available in this runtime');
}

// Load a native library and define function signatures
const lib = FFI.open(`./libmath.${FFI.suffix}`, {
  add: { parameters: ['i32', 'i32'], result: 'i32' },
  pi:  { parameters: [], result: 'f64' },
});

if (lib.isOk) {
  const { symbols, close } = lib.value;
  console.log(symbols.add(2, 3));  // 5
  console.log(symbols.pi());       // 3.14159...
  close(); // always close when done
} else {
  console.log(lib.error.message);  // error details
}
```

### System libraries

Use `FFI.systemLib()` to resolve platform-specific paths for system libraries:

```ts
// Resolves to: libc.dylib (macOS), libc.so.6 (Linux), msvcrt.dll (Windows)
const libc = FFI.open(FFI.systemLib('c'), {
  getpid: { parameters: [], result: 'i32' },
  getuid: { parameters: [], result: 'u32' },
});

if (libc.isOk) {
  console.log('PID:', libc.value.symbols.getpid());
  console.log('UID:', libc.value.symbols.getuid());
  libc.value.close();
}
```

### Type system

FFI supports the following types for function parameters and return values:

| FFI Type | JS Type | C Type | Size |
|----------|---------|--------|------|
| `void` | `undefined` | `void` | 0 |
| `bool` | `boolean` | `bool` | 1 |
| `i8` / `u8` | `number` | `int8_t` / `uint8_t` | 1 |
| `i16` / `u16` | `number` | `int16_t` / `uint16_t` | 2 |
| `i32` / `u32` | `number` | `int32_t` / `uint32_t` | 4 |
| `i64` / `u64` | `bigint` | `int64_t` / `uint64_t` | 8 |
| `f32` / `f64` | `number` | `float` / `double` | 4 / 8 |
| `pointer` | opaque | `void*` | ptr |
| `buffer` | `Uint8Array` | `uint8_t*` | ptr |

Types are available as constants: `FFI.types.I32`, `FFI.types.F64`, `FFI.types.POINTER`, etc.

### Platform library suffix

`FFI.suffix` returns the correct shared library extension for the current OS:

| Platform | Suffix |
|----------|--------|
| macOS | `dylib` |
| Linux | `so` |
| Windows | `dll` |

```ts
// Build a cross-platform library path
const libPath = `./target/release/libcalc.${FFI.suffix}`;
```

### API reference

| Method | Returns | Description |
|--------|---------|-------------|
| `FFI.open(path, symbols)` | `Result<FfiLibrary, FfiError>` | Load a library and bind symbols |
| `FFI.isAvailable()` | `boolean` | Check if FFI is supported in this runtime |
| `FFI.suffix` | `string` | Platform library extension (`dylib`/`so`/`dll`) |
| `FFI.systemLib(name)` | `string` | Resolve system library path |
| `FFI.types` | `object` | Type constants for symbol definitions |

`FfiLibrary` contains:
- `symbols` - Object with callable native functions (keyed by symbol name)
- `close()` - Release the native library handle

### Runtime requirements

| Runtime | Support | Flags needed |
|---------|---------|-------------|
| **Deno 2+** | Full | `--allow-ffi` |
| **Bun** | Full | None |
| **Node 25+** | Experimental | `--allow-ffi` |
| **Node 22-24** | Not available | `FFI.open()` returns `Err` |
| **Workers/Browser** | Not available | `FFI.open()` returns `Err` |

### Error handling

`FFI.open()` returns `Result<FfiLibrary, FfiError>`. Common errors:

```ts
const result = FFI.open('./missing.so', { fn: { parameters: [], result: 'void' } });
if (result.isErr) {
  switch (true) {
    case result.error.message.includes('not available'):
      // Runtime doesn't support FFI (Node <25, Workers, Browser)
      // Fix: upgrade to Node 25+ or use Deno/Bun
      break;
    case result.error.message.includes('not found'):
    case result.error.message.includes('No such file'):
      // Library file doesn't exist
      // Fix: check path, use FFI.systemLib() for system libs
      break;
    case result.error.message.includes('symbol'):
      // Function name doesn't match library exports
      // Fix: check with `nm -D lib.so` (Linux) or `nm -gU lib.dylib` (macOS)
      break;
  }
}
```

### Writing a C library for FFI

```c
// calc.c - compile with: gcc -shared -o libcalc.dylib calc.c
#include <math.h>

int add(int a, int b) { return a + b; }
double circle_area(double radius) { return M_PI * radius * radius; }
```

```ts
// calc.ts
import { FFI } from '@igorjs/pure-fx'

const lib = FFI.open(`./libcalc.${FFI.suffix}`, {
  add:         { parameters: ['i32', 'i32'], result: 'i32' },
  circle_area: { parameters: ['f64'], result: 'f64' },
});

if (lib.isOk) {
  console.log(lib.value.symbols.add(2, 3));          // 5
  console.log(lib.value.symbols.circle_area(5.0));    // 78.539...
  lib.value.close();
}
```

### Writing a Rust library for FFI

```rust
// lib.rs - compile with: cargo build --release
#[no_mangle]
pub extern "C" fn fibonacci(n: u32) -> u32 {
    if n <= 1 { return n; }
    fibonacci(n - 1) + fibonacci(n - 2)
}
```

```ts
import { FFI } from '@igorjs/pure-fx'

const lib = FFI.open(`./target/release/libfib.${FFI.suffix}`, {
  fibonacci: { parameters: ['u32'], result: 'u32' },
});

if (lib.isOk) {
  console.log(lib.value.symbols.fibonacci(10)); // 55
  lib.value.close();
}
```

## Crypto (expanded)

Full Web Crypto API coverage. All operations return `Result` or `Task`.

```ts
import { Crypto } from '@igorjs/pure-fx'

// Random
Crypto.uuid();                          // 'f47ac10b-...'
Crypto.randomBytes(32);                 // Ok(Uint8Array)
Crypto.randomInt(1, 100);              // Ok(42)

// Hashing
await Crypto.hash('SHA-256', 'hello').run();     // Ok(Uint8Array)
await Crypto.hashHex('SHA-256', 'hello').run();  // Ok('2cf24d...')

// HMAC
const key = (await Crypto.generateKey.hmac('SHA-256').run()).unwrap();
const sig = (await Crypto.hmac.sign(key, 'data').run()).unwrap();
await Crypto.hmac.verify(key, sig, 'data').run(); // Ok(true)

// AES-GCM encryption
const aesKey = (await Crypto.generateKey.aesGcm(256).run()).unwrap();
const encrypted = (await Crypto.aesGcm.encrypt(aesKey, 'secret').run()).unwrap();
const decrypted = await Crypto.aesGcm.decrypt(aesKey, encrypted.iv, encrypted.data).run();

// ECDSA signatures
const pair = (await Crypto.generateKey.ecdsa('P-256').run()).unwrap();
const ecSig = (await Crypto.ecdsa.sign(pair.privateKey, 'message').run()).unwrap();
await Crypto.ecdsa.verify(pair.publicKey, ecSig, 'message').run(); // Ok(true)

// Key derivation
await Crypto.pbkdf2.deriveBits('password', salt, 100000, 'SHA-256', 256).run();
await Crypto.hkdf.deriveBits(keyMaterial, salt, info, 'SHA-256', 256).run();

// Key exchange (ECDH)
const alice = (await Crypto.generateKey.ecdh('P-256').run()).unwrap();
const bob = (await Crypto.generateKey.ecdh('P-256').run()).unwrap();
const shared = await Crypto.ecdh.deriveBits(alice.privateKey, bob.publicKey, 256).run();

// Key import/export
const exported = await Crypto.exportKey('jwk', key).run();
const imported = await Crypto.importKey.jwk(jwk, algorithm, usages).run();

// Key wrapping
const wrapped = await Crypto.wrapKey('raw', dataKey, wrapKey, { name: 'AES-GCM', iv }).run();
```

**Full API:** `uuid`, `randomBytes`, `randomInt`, `hash`, `hashHex`, `timingSafeEqual`, `hmac.sign/verify`, `aesGcm.encrypt/decrypt`, `aesCbc.encrypt/decrypt`, `ecdsa.sign/verify`, `rsaPss.sign/verify`, `rsaOaep.encrypt/decrypt`, `pbkdf2.deriveBits`, `hkdf.deriveBits`, `ecdh.deriveBits`, `generateKey.*`, `importKey.*`, `exportKey`, `wrapKey`, `unwrapKey`.

---

Previous: [Async](async.md) | Next: [Runtime](runtime.md)

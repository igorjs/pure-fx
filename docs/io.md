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
```

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
```

## Json

Safe JSON parse/stringify returning Result.

```ts
import { Json } from '@igorjs/pure-fx'

Json.parse('{"a":1}');    // Ok({ a: 1 })
Json.parse('{bad}');      // Err(JsonError(...))
Json.stringify({ b: 2 }); // Ok('{"b":2}')
```

## Crypto / Encoding / Compression / Url

Web standard API wrappers returning Result.

```ts
import { Crypto, Encoding, Compression, Url } from '@igorjs/pure-fx'

// Encoding
const bytes = Encoding.utf8.encode('hello');
Encoding.base64.encode(bytes);   // 'aGVsbG8='
Encoding.hex.encode(bytes);      // '68656c6c6f'

// Crypto (async, uses Web Crypto API)
const hash = await Crypto.sha256('data').run();
const hmac = await Crypto.hmac('sha256', key, 'data').run();

// Compression
const compressed = await Compression.gzip(data).run();
const decompressed = await Compression.gunzip(compressed).run();

// URL parsing
Url.parse('https://example.com/path?q=1');
// Ok({ hostname: 'example.com', pathname: '/path', ... })
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

## Dns / Net

Cross-runtime DNS resolution and TCP client.

```ts
import { Dns, Net } from '@igorjs/pure-fx'

const records = await Dns.resolve('example.com', 'A').run();
const conn = await Net.connect({ host: 'localhost', port: 8080 }).run();
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

Cross-runtime Foreign Function Interface for loading native shared libraries. Works on Deno, Bun, and Node 25+.

```ts
import { FFI } from '@igorjs/pure-fx'

// Check availability
if (!FFI.isAvailable()) {
  console.log('FFI not available in this runtime');
}

// Load a native library
const lib = FFI.open(`./libmath.${FFI.suffix}`, {
  add: { parameters: ['i32', 'i32'], result: 'i32' },
  pi:  { parameters: [], result: 'f64' },
});

if (lib.isOk) {
  const { symbols, close } = lib.value;
  console.log(symbols.add(2, 3));  // 5
  console.log(symbols.pi());       // 3.14159...
  close(); // release the library
}

// System libraries
const libc = FFI.open(FFI.systemLib('c'), {
  getpid: { parameters: [], result: 'i32' },
});

// Supported types
FFI.types.I32;     // 'i32'
FFI.types.F64;     // 'f64'
FFI.types.POINTER; // 'pointer'
FFI.types.BUFFER;  // 'buffer'
FFI.types.VOID;    // 'void'
FFI.types.BOOL;    // 'bool'
```

**Runtime requirements:**
- **Deno**: `deno run --allow-ffi`
- **Bun**: Works out of the box
- **Node 25+**: `node --allow-ffi` (experimental)
- **Node 22-24**: Not available. Returns `Err(FfiError(...))`.

**Platform library extensions:**
- macOS: `.dylib`
- Linux: `.so`
- Windows: `.dll`

Use `FFI.suffix` to get the correct extension for the current platform.

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

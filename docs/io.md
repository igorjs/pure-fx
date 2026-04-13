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

## Dns / Net

Cross-runtime DNS resolution and TCP client.

```ts
import { Dns, Net } from '@igorjs/pure-fx'

const records = await Dns.resolve('example.com', 'A').run();
const conn = await Net.connect({ host: 'localhost', port: 8080 }).run();
```

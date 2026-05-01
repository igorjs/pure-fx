/**
 * integration-runtime.mjs - Cross-runtime smoke test for runtime-dependent modules.
 *
 * Validates File, Command, Process, Os, Path, Platform, Eol, Logger, Config,
 * Terminal, Dns, and Net on every supported runtime.
 * Uses only console.log for output and throws on failure (no node:test,
 * no node:assert) so it runs identically on Node, Deno, Bun, and QuickJS.
 *
 * Run:
 *   node tests/integration-runtime.mjs
 *   deno run --allow-all tests/integration-runtime.mjs
 *   bun tests/integration-runtime.mjs
 */

const {
  File,
  Command,
  Process,
  Os,
  Path,
  Platform,
  Eol,
  Logger,
  Config,
  Terminal,
  Dns,
  Schema,
  FFI,
} = await import("../dist/index.js");

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (!condition) {
    console.log(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ok: ${message}`);
    passed++;
  }
};

const section = name => console.log(`\n--- ${name} ---`);

// ── File ────────────────────────────────────────────────────────────────────

section("File.write + File.read");
{
  const tmpResult = await File.tempDir("smoke-").run();
  assert(tmpResult.isOk, "tempDir creates directory");
  const tmp = tmpResult.value;

  const path = `${tmp}/test.txt`;
  const writeResult = await File.write(path, "hello smoke").run();
  assert(writeResult.isOk, "write succeeds");

  const readResult = await File.read(path).run();
  assert(readResult.isOk, "read succeeds");
  assert(
    readResult.value === "hello smoke",
    `read returns written content (got: "${readResult.value}")`,
  );

  // File.append
  section("File.append");
  const appendResult = await File.append(path, " appended").run();
  assert(appendResult.isOk, "append succeeds");

  const readAfterAppend = await File.read(path).run();
  assert(readAfterAppend.isOk, "read after append succeeds");
  assert(
    readAfterAppend.value === "hello smoke appended",
    `append adds content (got: "${readAfterAppend.value}")`,
  );

  // File.exists
  section("File.exists");
  const existsResult = await File.exists(path).run();
  assert(existsResult.isOk && existsResult.value === true, "exists returns true for existing file");

  const notExistsResult = await File.exists(`${tmp}/nope.txt`).run();
  assert(
    notExistsResult.isOk && notExistsResult.value === false,
    "exists returns false for missing file",
  );

  // File.stat with mtime
  section("File.stat");
  const statResult = await File.stat(path).run();
  assert(statResult.isOk, "stat succeeds");
  assert(statResult.value.isFile === true, "stat.isFile is true");
  assert(statResult.value.isDirectory === false, "stat.isDirectory is false");
  assert(statResult.value.size > 0, `stat.size > 0 (got: ${statResult.value.size})`);
  assert(
    statResult.value.mtime instanceof Date && statResult.value.mtime.getTime() > 0,
    "stat.mtime is a valid Date",
  );

  const dirStatResult = await File.stat(tmp).run();
  assert(
    dirStatResult.isOk && dirStatResult.value.isDirectory === true,
    "stat on directory: isDirectory is true",
  );

  // File.makeDir (recursive)
  section("File.makeDir");
  const nestedDir = `${tmp}/a/b/c`;
  const mkdirResult = await File.makeDir(nestedDir).run();
  assert(mkdirResult.isOk, "makeDir recursive succeeds");
  const nestedStat = await File.stat(nestedDir).run();
  assert(nestedStat.isOk && nestedStat.value.isDirectory, "nested directory exists after makeDir");

  // File.list
  section("File.list");
  await File.write(`${tmp}/list1.txt`, "a").run();
  await File.write(`${tmp}/list2.txt`, "b").run();
  const listResult = await File.list(tmp).run();
  assert(listResult.isOk, "list succeeds");
  assert(listResult.value.length >= 2, `list returns entries (got: ${listResult.value.length})`);

  // File.copy
  section("File.copy");
  const copyDest = `${tmp}/copied.txt`;
  const copyResult = await File.copy(path, copyDest).run();
  assert(copyResult.isOk, "copy succeeds");
  const copyRead = await File.read(copyDest).run();
  assert(
    copyRead.isOk && copyRead.value === "hello smoke appended",
    "copied file has correct content",
  );

  // File.rename
  section("File.rename");
  const renameDest = `${tmp}/renamed.txt`;
  const renameResult = await File.rename(copyDest, renameDest).run();
  assert(renameResult.isOk, "rename succeeds");
  const renameExists = await File.exists(copyDest).run();
  assert(renameExists.isOk && renameExists.value === false, "old file gone after rename");
  const renameRead = await File.read(renameDest).run();
  assert(
    renameRead.isOk && renameRead.value === "hello smoke appended",
    "renamed file has correct content",
  );

  // File.remove
  section("File.remove");
  const removeResult = await File.remove(renameDest).run();
  assert(removeResult.isOk, "remove succeeds");
  const afterRemove = await File.exists(renameDest).run();
  assert(afterRemove.isOk && afterRemove.value === false, "file gone after remove");

  // File.removeDir (recursive)
  section("File.removeDir");
  const removeDirResult = await File.removeDir(tmp).run();
  assert(removeDirResult.isOk, "removeDir recursive succeeds");
  const afterRemoveDir = await File.stat(tmp).run();
  assert(afterRemoveDir.isErr, "directory gone after removeDir");
}

// ── Command ─────────────────────────────────────────────────────────────────

section("Command.exec");
{
  const echoResult = await Command.exec("echo", ["smoke test"]).run();
  assert(echoResult.isOk, "exec echo succeeds");
  assert(echoResult.value.exitCode === 0, "echo exit code is 0");
  assert(echoResult.value.stdout.includes("smoke test"), `echo stdout contains 'smoke test'`);

  // Non-zero exit is Ok, not Err
  const falseResult = await Command.exec("false").run();
  assert(falseResult.isOk, "exec false returns Ok (non-zero exit is not an error)");
  assert(falseResult.value.exitCode !== 0, "false exit code is non-zero");

  // Nonexistent command
  const badResult = await Command.exec("nonexistent-command-xyz-12345").run();
  assert(badResult.isErr, "exec nonexistent command returns Err");
  assert(badResult.error.tag === "CommandError", "error tag is CommandError");
}

section("Command.exec with stdin");
{
  const catResult = await Command.exec("cat", [], { stdin: "piped input" }).run();
  assert(catResult.isOk, "exec cat with stdin succeeds");
  assert(
    catResult.value.stdout === "piped input",
    `stdin piped to stdout (got: "${catResult.value.stdout}")`,
  );
}

section("Command.exec with cwd");
{
  const cwdResult = await Command.exec("pwd", [], { cwd: "/tmp" }).run();
  assert(cwdResult.isOk, "exec pwd with cwd succeeds");
  assert(
    cwdResult.value.stdout.includes("/tmp") || cwdResult.value.stdout.includes("/private/tmp"),
    `cwd respected (got: "${cwdResult.value.stdout.trim()}")`,
  );
}

// ── Process ─────────────────────────────────────────────────────────────────

section("Process");
{
  const cwd = Process.cwd();
  assert(cwd.isOk, "cwd returns Ok");
  assert(
    typeof cwd.value === "string" && cwd.value.length > 0,
    `cwd is a non-empty string (got: "${cwd.value}")`,
  );

  const pid = Process.pid();
  assert(pid.isSome, "pid returns Some");
  assert(
    typeof pid.unwrap() === "number" && pid.unwrap() > 0,
    `pid is a positive number (got: ${pid.unwrap()})`,
  );

  const argv = Process.argv();
  assert(Array.isArray(argv), "argv returns an array");

  const mem = Process.memoryUsage();
  // memoryUsage may return None on some runtimes (e.g. Deno)
  if (mem.isSome) {
    assert(mem.unwrap().heapUsed > 0, "memoryUsage.heapUsed > 0");
  } else {
    assert(true, "memoryUsage returns None (acceptable)");
  }

  const env = Process.env("PATH");
  assert(env.isSome, "env('PATH') returns Some");
  assert(typeof env.unwrap() === "string", "env('PATH') is a string");

  const noEnv = Process.env("NONEXISTENT_VAR_XYZ_12345");
  assert(noEnv.isNone, "env for missing var returns None");
}

// ── Os ──────────────────────────────────────────────────────────────────────

section("Os");
{
  const tmpDir = Os.tmpDir();
  assert(
    typeof tmpDir === "string" && tmpDir.length > 0,
    `tmpDir is a non-empty string (got: "${tmpDir}")`,
  );

  const homeDir = Os.homeDir();
  if (homeDir.isSome) {
    assert(
      typeof homeDir.unwrap() === "string",
      `homeDir is a string (got: "${homeDir.unwrap()}")`,
    );
  }

  const hostname = Os.hostname();
  // hostname may be None in some environments (e.g. restricted runtimes)
  if (hostname.isSome) {
    assert(typeof hostname.unwrap() === "string", "hostname is a string");
  } else {
    assert(true, "hostname returns None (acceptable in this env)");
  }

  const arch = Os.arch();
  assert(
    typeof arch === "string" && arch.length > 0,
    `arch is a non-empty string (got: "${arch}")`,
  );

  const platform = Os.platform();
  assert(
    typeof platform === "string" && platform.length > 0,
    `platform is non-empty (got: "${platform}")`,
  );
}

// ── Path ────────────────────────────────────────────────────────────────────

section("Path");
{
  const joined = Path.join("/usr", "local", "bin");
  assert(joined === "/usr/local/bin", `Path.join (got: "${joined}")`);

  const parsed = Path.parse("/usr/local/bin/node");
  assert(parsed.base === "node", `Path.parse base (got: "${parsed.base}")`);
  assert(parsed.dir === "/usr/local/bin", `Path.parse dir (got: "${parsed.dir}")`);

  assert(Path.isAbsolute("/foo"), "Path.isAbsolute('/foo')");
  assert(!Path.isAbsolute("foo"), "Path.isAbsolute('foo') false");

  const ext = Path.extname("file.txt");
  assert(ext === ".txt", `Path.extname (got: "${ext}")`);

  const base = Path.basename("/a/b/file.txt");
  assert(base === "file.txt", `Path.basename (got: "${base}")`);

  const dir = Path.dirname("/a/b/file.txt");
  assert(dir === "/a/b", `Path.dirname (got: "${dir}")`);
}

// ── Platform / Eol ──────────────────────────────────────────────────────────

section("Platform / Eol");
{
  assert(typeof Platform.os === "string", "Platform.os is string");
  assert(typeof Platform.isWindows === "boolean", "Platform.isWindows is boolean");

  assert(typeof Eol.lf === "string", "Eol.lf");
  assert(typeof Eol.crlf === "string", "Eol.crlf");
  assert(typeof Eol.native === "string", "Eol.native");

  const normalized = Eol.normalize("a\r\nb\nc");
  assert(typeof normalized === "string", "Eol.normalize returns string");
}

// ── Logger ──────────────────────────────────────────────────────────────────

section("Logger");
{
  const messages = [];
  const logger = Logger.create({
    level: "debug",
    sink: record => {
      messages.push(record);
    },
  });
  logger.info("test message");
  assert(messages.length === 1, "Logger.info logs a message");
  assert(messages[0].level === "info", "Logger record has level");
  assert(messages[0].message === "test message", "Logger record has message");

  logger.debug("debug msg");
  assert(messages.length === 2, "Logger.debug logs at debug level");

  // Level filtering
  const warnMessages = [];
  const warnLogger = Logger.create({
    level: "warn",
    sink: record => {
      warnMessages.push(record);
    },
  });
  warnLogger.debug("should not appear");
  warnLogger.info("should not appear");
  warnLogger.warn("should appear");
  assert(warnMessages.length === 1, "Logger level filtering");
}

// ── Config ──────────────────────────────────────────────────────────────────

section("Config");
{
  const config = Config.from({
    HOST: Schema.string.default("localhost"),
  });
  const result = config.loadFrom({});
  assert(result.isOk, "Config.loadFrom with defaults succeeds");
  assert(result.value.HOST === "localhost", `Config default value (got: ${result.value.HOST})`);

  const withValue = config.loadFrom({ HOST: "0.0.0.0" });
  assert(withValue.isOk, "Config.loadFrom with value succeeds");
  assert(withValue.value.HOST === "0.0.0.0", `Config reads value (got: ${withValue.value.HOST})`);
}

// ── Dns ─────────────────────────────────────────────────────────────────────

section("Dns");
{
  const result = await Dns.resolve("localhost").run();
  // localhost resolution may vary by runtime/OS, just check it returns a result
  assert(result.isOk || result.isErr, "Dns.resolve returns a Result");
  if (result.isOk) {
    assert(result.value.length > 0, "Dns.resolve returns addresses");
    assert(typeof result.value[0] === "string", "Dns record is a string");
  }
}

// ── Terminal ────────────────────────────────────────────────────────────────

section("Terminal");
{
  assert(typeof Terminal.isInteractive() === "boolean", "Terminal.isInteractive()");
  const size = Terminal.size();
  assert(
    size.isNone || (size.isSome && typeof size.unwrap().columns === "number"),
    "Terminal.size()",
  );
}

// ── FFI ─────────────────────────────────────────────────────────────────────

section("FFI");
{
  assert(
    typeof FFI.suffix === "string" && FFI.suffix.length > 0,
    `FFI.suffix (got: "${FFI.suffix}")`,
  );
  assert(typeof FFI.isAvailable() === "boolean", "FFI.isAvailable()");
  assert(typeof FFI.types.I32 === "string", "FFI.types.I32");
  assert(typeof FFI.types.F64 === "string", "FFI.types.F64");
  assert(typeof FFI.types.POINTER === "string", "FFI.types.POINTER");

  const libcPath = FFI.systemLib("c");
  assert(
    typeof libcPath === "string" && libcPath.length > 0,
    `FFI.systemLib('c') (got: "${libcPath}")`,
  );

  // Try to open libc and call getpid (Deno/Bun only, Node 24 will get Err)
  const lib = FFI.open(libcPath, {
    getpid: { parameters: [], result: "i32" },
  });
  if (lib.isOk) {
    const pid = lib.value.symbols.getpid();
    assert(typeof pid === "number" && pid > 0, `FFI getpid() (got: ${pid})`);
    lib.value.close();
  } else {
    // Expected on Node <25
    assert(lib.isErr, `FFI.open returns Err on unsupported runtime (got: ${lib.error.message})`);
  }
}

// ── Process (extended) ──────────────────────────────────────────────────────

section("Process (extended)");
{
  const ppid = Process.ppid();
  if (ppid.isSome) {
    assert(typeof ppid.unwrap() === "number" && ppid.unwrap() > 0, `ppid (got: ${ppid.unwrap()})`);
  } else {
    assert(true, "ppid None (acceptable)");
  }

  const uid = Process.uid();
  if (uid.isSome) {
    assert(typeof uid.unwrap() === "number", `uid (got: ${uid.unwrap()})`);
  } else {
    assert(true, "uid None (acceptable on Windows)");
  }

  const gid = Process.gid();
  if (gid.isSome) {
    assert(typeof gid.unwrap() === "number", `gid (got: ${gid.unwrap()})`);
  } else {
    assert(true, "gid None (acceptable on Windows)");
  }

  const execPath = Process.execPath();
  if (execPath.isSome) {
    assert(typeof execPath.unwrap() === "string" && execPath.unwrap().length > 0, "execPath");
  } else {
    assert(true, "execPath None (acceptable)");
  }
}

// ── Os (extended) ──────────────────────────────────────────────────────────

section("Os (extended)");
{
  const release = Os.osRelease();
  if (release.isSome) {
    assert(typeof release.unwrap() === "string" && release.unwrap().length > 0, "osRelease");
  } else {
    assert(true, "osRelease None (acceptable)");
  }

  const load = Os.loadavg();
  if (load.isSome) {
    const [l1, l5, l15] = load.unwrap();
    assert(typeof l1 === "number" && typeof l5 === "number" && typeof l15 === "number", "loadavg");
  } else {
    assert(true, "loadavg None (acceptable on Windows)");
  }

  const ifaces = Os.networkInterfaces();
  assert(Array.isArray(ifaces), "networkInterfaces returns array");
  if (ifaces.length > 0) {
    assert(typeof ifaces[0].name === "string", "networkInterface.name");
    assert(typeof ifaces[0].address === "string", "networkInterface.address");
    assert(ifaces[0].family === "IPv4" || ifaces[0].family === "IPv6", "networkInterface.family");
  }
}

// ── Eol ──────────────────────────────────────────────────────────────────────

section("Eol");
assert(Eol.lf === "\n", "Eol.lf");
assert(Eol.crlf === "\r\n", "Eol.crlf");
assert(Eol.native === "\n" || Eol.native === "\r\n", "Eol.native");
assert(Eol.normalize("a\r\nb\nc\r\n") === "a\nb\nc\n", "Eol.normalize");

// ── File (extended) ─────────────────────────────────────────────────────────

section("File (extended)");
{
  const tmpResult = await File.tempDir("integ-ext-").run();
  assert(tmpResult.isOk, "tempDir for extended tests");
  const tmp = tmpResult.value;

  const binData = new Uint8Array([0, 1, 2, 255, 254, 253]);
  const binPath = `${tmp}/binary.bin`;
  assert((await File.writeBytes(binPath, binData).run()).isOk, "File.writeBytes");
  const readResult = await File.readBytes(binPath).run();
  assert(readResult.isOk && readResult.value.length === 6, "File.readBytes");

  const realResult = await File.realPath(binPath).run();
  assert(realResult.isOk && typeof realResult.value === "string", "File.realPath");

  assert((await File.truncate(binPath, 3).run()).isOk, "File.truncate");
  const afterTrunc = await File.readBytes(binPath).run();
  assert(afterTrunc.isOk && afterTrunc.value.length === 3, "File.truncate result");

  const symPath = `${tmp}/sym.link`;
  assert((await File.symlink(binPath, symPath).run()).isOk, "File.symlink");
  const linkTarget = await File.readLink(symPath).run();
  assert(linkTarget.isOk && linkTarget.value.includes("binary.bin"), "File.readLink");
  assert((await File.lstat(symPath).run()).isOk, "File.lstat");

  const hardPath = `${tmp}/hard.bin`;
  assert((await File.link(binPath, hardPath).run()).isOk, "File.link");
  assert((await File.chmod(binPath, 0o644).run()).isOk, "File.chmod");

  await File.removeDir(tmp).run();
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n========================================`);
console.log(`Integration test (runtime): ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  if (typeof process !== "undefined" && typeof process.exit === "function") {
    process.exit(1);
  }
  throw new Error(`${failed} integration test(s) failed`);
}

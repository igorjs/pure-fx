// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/types
 *
 * Unified adapter interfaces for cross-runtime capabilities.
 *
 * Each interface defines a normalised contract that hides runtime
 * differences (Node vs Deno vs Bun). Implementations live in the
 * per-capability adapter files alongside their resolve functions.
 *
 * These types are internal. Public modules (File, Terminal, Command,
 * etc.) depend on them but do not re-export them.
 */

// ── Stdin / Stdout ──────────────────────────────────────────────────────────

/** Normalised stdin access. */
export interface Stdin {
  /** Whether stdin is connected to an interactive terminal. */
  readonly isTTY: boolean;
  /**
   * Read a single line. Returns null on EOF.
   * When interactive, displays the prompt before reading.
   */
  readLine(prompt: string): Promise<string | null>;
  /** Read all remaining stdin until EOF. */
  readAll(): Promise<string>;
  /** Enable or disable raw mode (character-at-a-time, no echo). */
  setRawMode?(mode: boolean): void;
  /** Read raw bytes in raw mode. Returns null on EOF. */
  readRaw?(buf: Uint8Array): Promise<number | null>;
  /** Register a data listener (Node-style). Returns cleanup function. */
  onData?(cb: (chunk: string) => void): () => void;
}

/** Normalised stdout/stderr access. */
export interface Stdout {
  /** Write text to the output stream. */
  write(text: string): void;
  /** Terminal width in columns, if available. */
  readonly columns?: number | undefined;
  /** Terminal height in rows, if available. */
  readonly rows?: number | undefined;
}

// ── File system ─────────────────────────────────────────────────────────────

/** Stat result normalised across runtimes. */
export interface FsStat {
  /** True if the path is a regular file. */
  readonly isFile: boolean;
  /** True if the path is a directory. */
  readonly isDirectory: boolean;
  /** Size in bytes. */
  readonly size: number;
  /** Last modification time, if available. */
  readonly mtime: Date | undefined;
}

/** Normalised async file system operations. */
export interface Fs {
  /** Read file contents as UTF-8 string. */
  readFile(path: string): Promise<string>;
  /** Write UTF-8 string to file. */
  writeFile(path: string, content: string): Promise<void>;
  /** Append UTF-8 string to file. */
  appendFile(path: string, content: string): Promise<void>;
  /** Create directory recursively. */
  mkdir(path: string): Promise<void>;
  /** Get file or directory metadata. */
  stat(path: string): Promise<FsStat>;
  /** Remove a file. */
  remove(path: string): Promise<void>;
  /** Remove a directory recursively. */
  removeDir(path: string): Promise<void>;
  /** List entry names in a directory. */
  readDir(path: string): Promise<readonly string[]>;
  /** Copy a file to a new path. */
  copyFile(src: string, dest: string): Promise<void>;
  /** Rename or move a file. */
  rename(oldPath: string, newPath: string): Promise<void>;
  /** Create a temporary directory. */
  makeTempDir(prefix?: string): Promise<string>;
  /** Read file contents as raw bytes. */
  readBytes?(path: string): Promise<Uint8Array>;
  /** Write raw bytes to file. */
  writeBytes?(path: string, data: Uint8Array): Promise<void>;
  /** Create a symbolic link. */
  symlink?(target: string, path: string): Promise<void>;
  /** Create a hard link. */
  link?(existingPath: string, newPath: string): Promise<void>;
  /** Change file permissions. */
  chmod?(path: string, mode: number): Promise<void>;
  /** Change file ownership. */
  chown?(path: string, uid: number, gid: number): Promise<void>;
  /** Truncate file to given length. */
  truncate?(path: string, len?: number): Promise<void>;
  /** Resolve canonical absolute path. */
  realPath?(path: string): Promise<string>;
  /** Read the target of a symbolic link. */
  readLink?(path: string): Promise<string>;
  /** Like stat but does not follow symlinks. */
  lstat?(path: string): Promise<FsStat>;
}

// ── Subprocess ──────────────────────────────────────────────────────────────

/** Options for spawning a subprocess. */
export interface SubprocessOptions {
  /** Working directory for the subprocess. */
  readonly cwd?: string | undefined;
  /** Environment variables to set. */
  readonly env?: Record<string, string> | undefined;
  /** Timeout in milliseconds. */
  readonly timeout?: number | undefined;
  /** String piped to the subprocess stdin. */
  readonly stdin?: string | undefined;
}

/** Result of a subprocess execution. */
export interface SubprocessResult {
  /** Exit code of the process. */
  readonly exitCode: number;
  /** Captured standard output. */
  readonly stdout: string;
  /** Captured standard error. */
  readonly stderr: string;
}

/** A spawned background process. */
export interface SpawnedProcess {
  /** Process ID, if available. */
  readonly pid: number | undefined;
  /** Kill the process. */
  kill(signal?: string): void;
  /** Detach the child so the parent can exit independently. */
  unref(): void;
  /** Wait for the process to exit and collect output. */
  wait(): Promise<SubprocessResult>;
}

/** Options for spawning a background process. */
export interface SpawnOptions {
  /** Working directory for the process. */
  readonly cwd?: string | undefined;
  /** Environment variables to set. */
  readonly env?: Record<string, string> | undefined;
  /** Pipe stdout/stderr and collect output (default: inherit). */
  readonly capture?: boolean | undefined;
}

/** Normalised subprocess execution. */
export interface Subprocess {
  /** Execute a command and wait for completion. */
  exec(cmd: string, args: readonly string[], options: SubprocessOptions): Promise<SubprocessResult>;
  /** Spawn a background process. */
  spawn(cmd: string, args: readonly string[], options: SpawnOptions): Promise<SpawnedProcess>;
}

// ── DNS ─────────────────────────────────────────────────────────────────────

/** Normalised DNS resolution. */
export interface Dns {
  /** Resolve hostname to an IP address. */
  lookup(hostname: string): Promise<{ address: string; family: 4 | 6 }>;
  /** Query DNS records by type. */
  resolve(hostname: string, type: string): Promise<readonly string[]>;
}

// ── TCP / Net ───────────────────────────────────────────────────────────────

/** A raw TCP connection returned by the adapter. */
export interface TcpSocket {
  /** Send data over the connection. */
  send(data: string | Uint8Array): Promise<void>;
  /** Receive the next chunk of data. */
  receive(): Promise<Uint8Array>;
  /** Close the connection. */
  close(): void;
}

/** Normalised TCP client. */
export interface TcpClient {
  /** Open a TCP connection to host:port. */
  connect(options: { host: string; port: number }): Promise<TcpSocket>;
}

// ── OS info ─────────────────────────────────────────────────────────────────

/** Normalised OS information. */
export interface OsInfo {
  /** System hostname. */
  hostname(): string | undefined;
  /** CPU architecture string. */
  arch(): string;
  /** Operating system name. */
  platform(): string;
  /** Number of logical CPU cores. */
  cpuCount(): number | undefined;
  /** Total system memory in bytes. */
  totalMemory(): number | undefined;
  /** Free system memory in bytes. */
  freeMemory(): number | undefined;
  /** Default temporary directory path. */
  tmpDir(): string;
  /** Current user home directory. */
  homeDir(): string | undefined;
  /** System uptime in seconds. */
  uptime(): number | undefined;
  /** OS release/version string. */
  osRelease?(): string | undefined;
  /** 1, 5, and 15 minute load averages. */
  loadavg?(): readonly [number, number, number] | undefined;
  /** Available network interfaces. */
  networkInterfaces?(): readonly NetworkInterface[];
}

// ── Process ─────────────────────────────────────────────────────────────────

/** Memory usage stats. */
export interface ProcessMemory {
  /** Used V8 heap in bytes. */
  readonly heapUsed: number;
  /** Total V8 heap allocated in bytes. */
  readonly heapTotal: number;
  /** Resident set size in bytes. */
  readonly rss: number;
}

/** Normalised process information. */
export interface ProcessInfo {
  /** Current working directory. */
  cwd(): string;
  /** Process ID. */
  readonly pid: number;
  /** Parent process ID. */
  readonly ppid?: number;
  /** Command-line arguments. */
  readonly argv: readonly string[];
  /** Get all environment variables. */
  env(): Record<string, string>;
  /** Get a single environment variable. */
  env(key: string): string | undefined;
  /** Terminate the process. */
  exit(code?: number): never;
  /** Process uptime in seconds. */
  uptime?(): number;
  /** Current memory usage stats. */
  memoryUsage?(): ProcessMemory;
  /** Effective user ID. */
  uid?(): number | undefined;
  /** Effective group ID. */
  gid?(): number | undefined;
  /** Path to the runtime executable. */
  execPath?(): string;
}

/** Network interface address info. */
export interface NetworkInterface {
  /** Interface name (e.g. "eth0"). */
  readonly name: string;
  /** IP address. */
  readonly address: string;
  /** Address family. */
  readonly family: "IPv4" | "IPv6";
  /** MAC address, if available. */
  readonly mac?: string;
  /** True if loopback or internal. */
  readonly internal: boolean;
}

// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/fs
 *
 * File system adapter implementations for Deno and Node/Bun.
 */

import { getDeno, importNode } from "./detect.js";
import type { Fs, FsStat } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

interface NodeFs {
  readFile(path: string, encoding: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: string | Uint8Array, encoding?: string): Promise<void>;
  appendFile(path: string, data: string, encoding: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mtime: Date;
  }>;
  lstat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mtime: Date;
  }>;
  unlink(path: string): Promise<void>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  copyFile(src: string, dest: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  symlink(target: string, path: string): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  chown(path: string, uid: number, gid: number): Promise<void>;
  truncate(path: string, len?: number): Promise<void>;
  realpath(path: string): Promise<string>;
  readlink(path: string): Promise<string>;
}

const getNodeFs = importNode<NodeFs>("node:fs/promises");

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoFs = (): Fs | undefined => {
  const deno = getDeno();
  if (deno?.readTextFile === undefined) return undefined;

  return {
    readFile: path => deno.readTextFile!(path),
    writeFile: (path, content) => deno.writeTextFile!(path, content),
    appendFile: (path, content) => deno.writeTextFile!(path, content, { append: true }),
    mkdir: path => deno.mkdir!(path, { recursive: true }).then(() => undefined),
    stat: async (path): Promise<FsStat> => {
      const s = await deno.stat!(path);
      return {
        isFile: s.isFile,
        isDirectory: s.isDirectory,
        size: s.size,
        mtime: s.mtime ?? undefined,
      };
    },
    remove: path => deno.remove!(path),
    removeDir: path => deno.remove!(path, { recursive: true }),
    readDir: async path => {
      const entries: string[] = [];
      for await (const entry of deno.readDir!(path)) entries.push(entry.name);
      return entries;
    },
    copyFile: (src, dest) => deno.copyFile!(src, dest),
    rename: (oldPath, newPath) => deno.rename!(oldPath, newPath),
    makeTempDir: prefix => {
      const opts: { prefix?: string } = {};
      if (prefix !== undefined) opts.prefix = prefix;
      return deno.makeTempDir!(opts);
    },
    ...(deno.readFile ? { readBytes: (path: string) => deno.readFile!(path) } : {}),
    ...(deno.writeFile
      ? { writeBytes: (path: string, data: Uint8Array) => deno.writeFile!(path, data) }
      : {}),
    ...(deno.symlink
      ? { symlink: (target: string, path: string) => deno.symlink!(target, path) }
      : {}),
    ...(deno.link
      ? { link: (existingPath: string, newPath: string) => deno.link!(existingPath, newPath) }
      : {}),
    ...(deno.chmod ? { chmod: (path: string, mode: number) => deno.chmod!(path, mode) } : {}),
    ...(deno.chown
      ? { chown: (path: string, uid: number, gid: number) => deno.chown!(path, uid, gid) }
      : {}),
    ...(deno.truncate
      ? { truncate: (path: string, len?: number) => deno.truncate!(path, len) }
      : {}),
    ...(deno.realPath ? { realPath: (path: string) => deno.realPath!(path) } : {}),
    ...(deno.readLink ? { readLink: (path: string) => deno.readLink!(path) } : {}),
    ...(deno.lstat
      ? {
          lstat: async (path: string): Promise<FsStat> => {
            const s = await deno.lstat!(path);
            return {
              isFile: s.isFile,
              isDirectory: s.isDirectory,
              size: s.size,
              mtime: s.mtime ?? undefined,
            };
          },
        }
      : {}),
  };
};

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeFs = async (): Promise<Fs | null> => {
  const nfs = await getNodeFs();
  if (nfs === null) return null;

  return {
    readFile: path => nfs.readFile(path, "utf-8"),
    writeFile: (path, content) => nfs.writeFile(path, content, "utf-8"),
    appendFile: (path, content) => nfs.appendFile(path, content, "utf-8"),
    mkdir: path => nfs.mkdir(path, { recursive: true }).then(() => undefined),
    stat: async (path): Promise<FsStat> => {
      const s = await nfs.stat(path);
      return { isFile: s.isFile(), isDirectory: s.isDirectory(), size: s.size, mtime: s.mtime };
    },
    remove: path => nfs.unlink(path),
    removeDir: path => nfs.rm(path, { recursive: true, force: true }),
    readDir: path => nfs.readdir(path),
    copyFile: (src, dest) => nfs.copyFile(src, dest),
    rename: (oldPath, newPath) => nfs.rename(oldPath, newPath),
    makeTempDir: prefix => nfs.mkdtemp(prefix ?? "pure-ts-"),
    readBytes: path => nfs.readFile(path) as Promise<Uint8Array>,
    writeBytes: (path, data) => nfs.writeFile(path, data),
    symlink: (target, path) => nfs.symlink(target, path),
    link: (existingPath, newPath) => nfs.link(existingPath, newPath),
    chmod: (path, mode) => nfs.chmod(path, mode),
    chown: (path, uid, gid) => nfs.chown(path, uid, gid),
    truncate: (path, len) => nfs.truncate(path, len),
    realPath: path => nfs.realpath(path),
    readLink: path => nfs.readlink(path),
    lstat: async (path): Promise<FsStat> => {
      const s = await nfs.lstat(path);
      return { isFile: s.isFile(), isDirectory: s.isDirectory(), size: s.size, mtime: s.mtime };
    },
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the file system adapter for the current runtime. */
export const resolveFs = async (): Promise<Fs | null> => {
  const deno = createDenoFs();
  if (deno !== undefined) return deno;
  return createNodeFs();
};

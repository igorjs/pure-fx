// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/fs
 *
 * File system adapter implementations for Node/Bun.
 */

import { importNode } from "./detect.js";
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

const getNodeFs = importNode<NodeFs>("fs/promises");

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
    removeDir: path => nfs.rm(path, { recursive: true, force: false }),
    readDir: path => nfs.readdir(path),
    copyFile: (src, dest) => nfs.copyFile(src, dest),
    rename: (oldPath, newPath) => nfs.rename(oldPath, newPath),
    makeTempDir: prefix => nfs.mkdtemp(prefix ?? "pure-fx-"),
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
  return createNodeFs();
};

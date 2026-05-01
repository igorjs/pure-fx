#!/usr/bin/env node

/**
 * Verify all .ts source files have the SPDX license header.
 * Run: node scripts/check-license-headers.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const HEADER = "// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0";

async function findTsFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      files.push(...(await findTsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

const files = await findTsFiles("src");
const missing = [];

for (const file of files) {
  const content = await readFile(file, "utf-8");
  if (!content.startsWith(HEADER)) {
    missing.push(file);
  }
}

if (missing.length > 0) {
  console.error(`Missing license header in ${missing.length} file(s):`);
  for (const f of missing) {
    console.error(`  ${f}`);
  }
  console.error(`\nExpected first line: ${HEADER}`);
  process.exit(1);
} else {
  console.log(`All ${files.length} source files have license headers.`);
}

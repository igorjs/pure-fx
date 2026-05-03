// license-headers.mjs - Verify and optionally fix SPDX license headers.
//
// Usage:
//   node scripts/license-headers.mjs              # check all src .ts files
//   node scripts/license-headers.mjs --fix        # auto-add missing headers
//   node scripts/license-headers.mjs --fix a.ts   # fix specific files

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HEADER = "// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0";

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const explicit = args.filter((a) => !a.startsWith("-") && a.endsWith(".ts"));

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
};

const files = explicit.length > 0 ? explicit : await walk("src");
const missing = [];

for (const file of files) {
  const content = await readFile(file, "utf-8");
  if (content.startsWith(HEADER)) continue;

  if (fix) {
    await writeFile(file, `${HEADER}\n\n${content}`);
    missing.push(file);
  } else {
    missing.push(file);
  }
}

if (missing.length > 0 && fix) {
  process.stdout.write(`Added license header to ${missing.length} file(s).\n`);
} else if (missing.length > 0) {
  process.stderr.write(`Missing license header in ${missing.length} file(s):\n`);
  for (const f of missing) {
    process.stderr.write(`  ${f}\n`);
  }
  process.stderr.write(`\nExpected first line: ${HEADER}\n`);
  process.stderr.write(`Run with --fix to auto-add.\n`);
  process.exit(1);
} else {
  process.stdout.write(`All ${files.length} source files have license headers.\n`);
}

/**
 * build.mjs - Clean build with comment stripping.
 *
 * 1. Remove dist/
 * 2. Compile with tsgo
 * 3. Strip JSDoc and decoration comments from .js output
 *
 * Why strip: The .d.ts files carry all JSDoc for IDE tooltips. The .js files
 * are only read by the runtime engine, which ignores comments. Stripping them
 * cuts JS output by ~46% without losing any consumer-facing documentation.
 * Consumers' bundlers (esbuild, Rollup, Vite) would strip them again anyway.
 *
 * Run by: `pnpm run build`
 */

import { execSync } from "node:child_process";
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

// -- Clean + compile ----------------------------------------------------------

await rm("./dist", { recursive: true, force: true });
execSync("tsgo", { stdio: "inherit" });

// -- Strip comments from .js output -------------------------------------------

const DIST = "./dist";

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
};

const jsFiles = await walk(DIST);

for (const path of jsFiles) {
  let code = await readFile(path, "utf8");

  // Strip block comments (safe: pure-fx source has no string literals containing "/*")
  code = code.replace(/[ \t]*\/\*[\s\S]*?\*\/\n?/g, "");

  // Strip single-line decoration comments, preserve sourceMappingURL
  code = code.replace(/^[ \t]*\/\/(?!#).*\n?/gm, "");

  // Collapse runs of blank lines
  code = code.replace(/\n{3,}/g, "\n");

  code = code.trim() + "\n";
  await writeFile(path, code);
}

process.stdout.write(`Build complete: ${jsFiles.length} JS files stripped.\n`);

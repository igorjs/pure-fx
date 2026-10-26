// SPDX-License-Identifier: Apache-2.0
/**
 * jsr-exports.test.mjs - Keeps jsr.json exports in step with package.json.
 *
 * Every public package.json export (except ./package.json) must exist in
 * jsr.json and point at the source file that builds to the npm import target,
 * and jsr.json must not export any key package.json lacks.
 *
 * Run: pnpm test
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@igorjs/pure-test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = name => JSON.parse(readFileSync(join(projectRoot, name), "utf8"));

function expectedSource(entry) {
  const target = typeof entry === "string" ? entry : entry.import;
  return target.replace(/^\.\/dist\//, "./src/").replace(/\.js$/, ".ts");
}

/** Returns a list of human-readable problems; empty when the manifests agree. */
function findProblems(npmExports, jsrExports, fileExists) {
  const problems = [];
  for (const [key, entry] of Object.entries(npmExports)) {
    if (key === "./package.json") continue;
    const want = expectedSource(entry);
    if (!(key in jsrExports)) problems.push(`missing ${key}`);
    else if (jsrExports[key] !== want)
      problems.push(`mismatch ${key}: ${jsrExports[key]} != ${want}`);
    else if (!fileExists(want)) problems.push(`no file ${want}`);
  }
  for (const key of Object.keys(jsrExports)) {
    if (!(key in npmExports)) problems.push(`extra ${key}`);
  }
  return problems;
}

describe("jsr.json exports", () => {
  it("matches every public package.json export", () => {
    // Arrange
    const npm = readJson("package.json").exports;
    const jsr = readJson("jsr.json").exports;

    // Act
    const problems = findProblems(npm, jsr, rel => existsSync(join(projectRoot, rel)));

    // Assert
    expect(problems).toEqual([]);
  });

  it("reports a missing key", () => {
    // Arrange
    const npm = { "./a": { import: "./dist/a/index.js" } };

    // Act
    const problems = findProblems(npm, {}, () => true);

    // Assert
    expect(problems).toEqual(["missing ./a"]);
  });

  it("reports a mismatched target", () => {
    // Arrange
    const npm = { "./a": { import: "./dist/a/index.js" } };
    const jsr = { "./a": "./src/b/index.ts" };

    // Act
    const problems = findProblems(npm, jsr, () => true);

    // Assert
    expect(problems).toEqual(["mismatch ./a: ./src/b/index.ts != ./src/a/index.ts"]);
  });

  it("reports a missing source file", () => {
    // Arrange
    const npm = { "./a": { import: "./dist/a/index.js" } };
    const jsr = { "./a": "./src/a/index.ts" };

    // Act
    const problems = findProblems(npm, jsr, () => false);

    // Assert
    expect(problems).toEqual(["no file ./src/a/index.ts"]);
  });

  it("reports a jsr key that package.json lacks", () => {
    // Arrange
    const npm = { "./a": { import: "./dist/a/index.js" }, "./package.json": "./package.json" };
    const jsr = { "./a": "./src/a/index.ts", "./internal": "./src/internal.ts" };

    // Act
    const problems = findProblems(npm, jsr, () => true);

    // Assert
    expect(problems).toEqual(["extra ./internal"]);
  });
});

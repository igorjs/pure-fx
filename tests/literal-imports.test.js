// SPDX-License-Identifier: Apache-2.0
/**
 * literal-imports.test.js - No code generation from strings.
 *
 * Cloudflare Workers forbids Function("...") and eval. The only non-literal
 * import() allowed in src/ is the importNodeBuiltin helper. Also loads every
 * public subpath of dist/ under Node and inside Miniflare without nodejs_compat.
 */

import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "@igorjs/pure-test";
import { Miniflare } from "miniflare";
import { esModules } from "../scripts/miniflare-modules.mjs";

const ROOT = resolve(new URL("../", import.meta.url).pathname);
const MINIFLARE_TIMEOUT_MS = 20000;

// ── Source scanning ─────────────────────────────────────────────────────────

const blank = text => text.replace(/[^\n]/g, " ");

const lineCommentEnd = (source, from) => {
  const end = source.indexOf("\n", from);
  return end === -1 ? source.length : end;
};

const blockCommentEnd = (source, from) => {
  const end = source.indexOf("*/", from + 2);
  return end === -1 ? source.length : end + 2;
};

const stringEnd = (source, from) => {
  const quote = source[from];
  let j = from + 1;
  while (j < source.length && source[j] !== quote) j += source[j] === "\\" ? 2 : 1;
  return j + 1;
};

/** Replace comments with spaces (newlines kept), skipping string and template literals. */
const stripComments = source => {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const pair = source.slice(i, i + 2);
    let end = i + 1;
    let keep = source[i];
    if (pair === "//") {
      end = lineCommentEnd(source, i);
      keep = "";
    } else if (pair === "/*") {
      end = blockCommentEnd(source, i);
      keep = blank(source.slice(i, end));
    } else if ("\"'`".includes(source[i])) {
      end = stringEnd(source, i);
      keep = source.slice(i, end);
    }
    out += keep;
    i = end;
  }
  return out;
};

const FORBIDDEN = [
  ["Function constructor call", /\bFunction\s*\(/],
  [".constructor( call", /\.constructor\s*\(/],
  [
    "import( or require( with a non-literal argument",
    /\b(?:import|require)\s*\(\s*(?!(?:"[^"\\$`]*"|'[^'\\$`]*')\s*[),])/,
    true,
  ],
];

const HELPER_FILE = "src/runtime/adapters/detect.ts";
const HELPER = /export const importNodeBuiltin\b[^;]*;/;

/** Blank the importNodeBuiltin helper, the one place a computed import() is allowed. */
const withoutHelper = (code, file) =>
  file.endsWith(HELPER_FILE) ? code.replace(HELPER, match => blank(match)) : code;

const findViolations = (source, file = "") => {
  const code = stripComments(source);
  const importCode = withoutHelper(code, file);
  const found = [];
  for (const [label, pattern, helperAllowed] of FORBIDDEN) {
    const lines = (helperAllowed ? importCode : code).split("\n");
    lines.forEach((line, idx) => {
      if (pattern.test(line)) found.push({ label, line: idx + 1, text: line.trim() });
    });
  }
  return found;
};

const listTs = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTs(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });

const HELPER_SOURCE = [
  "export const importNodeBuiltin = <T>(name: string): Promise<T> =>",
  "  import(`node:$" + "{name}`) as Promise<T>;",
].join("\n");

describe("literal imports: source scan", () => {
  it.each([
    ["Function constructor", 'const x = Function("return 1")();', 1],
    ["Function with space", "const x = Function ('return 1');", 1],
    ["constructor call", "const F = (() => {}).constructor('return 1');", 1],
    ["variable import", "const m = await import(name);", 1],
    ["template import", `const m = await import(\`node:\${name}\`);`, 1],
    ["variable require", "const m = require(name);", 1],
    ["computed import outside the helper", HELPER_SOURCE, 1],
    ["literal import", 'const m = await import("node:http");', 0],
    ["literal require", "const m = require('node:os');", 0],
    ["type import", 'type T = import("./x.js").T;', 0],
  ])("%s", (_name, source, expected) => {
    // Arrange / Act
    const found = findViolations(source);

    // Assert
    expect(found.length).toBe(expected);
  });

  it("allows the computed import inside importNodeBuiltin in detect.ts", () => {
    // Arrange / Act
    const found = findViolations(HELPER_SOURCE, HELPER_FILE);

    // Assert
    expect(found.length).toBe(0);
  });

  it("still flags Function inside importNodeBuiltin", () => {
    // Arrange
    const source = 'export const importNodeBuiltin = (n) => Function("return import(n)")();';

    // Act
    const found = findViolations(source, HELPER_FILE);

    // Assert
    expect(found.length).toBe(1);
  });

  it("ignores patterns inside comments", () => {
    // Arrange
    const source = '// Function("x")\n/* import(name)\n .constructor( */\nconst a = 1;';

    // Act
    const found = findViolations(source);

    // Assert
    expect(found.length).toBe(0);
  });

  it("does not treat // inside a string as a comment", () => {
    // Arrange
    const source = 'const u = "http://x.test"; const y = Function("return 1");';

    // Act
    const found = findViolations(source);

    // Assert
    expect(found.length).toBe(1);
  });

  it("flags no violations in src/", () => {
    // Arrange
    const files = listTs(join(ROOT, "src"));

    // Act
    const violations = files.flatMap(file =>
      findViolations(readFileSync(file, "utf-8"), file.slice(ROOT.length)).map(
        v => `${file.slice(ROOT.length)}:${v.line} ${v.label}: ${v.text}`,
      ),
    );

    // Assert
    expect(violations).toEqual([]);
  });
});

// ── Built output ────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const SUBPATHS = Object.entries(pkg.exports).map(([key, value]) => [key, value.import]);

describe("literal imports: dist under Node", () => {
  it.each(SUBPATHS)("imports %s", async (_key, target) => {
    // Arrange
    const url = new URL(join(ROOT, target), "file:///").href;

    // Act
    const mod = await import(url);

    // Assert
    expect(typeof mod).toBe("object");
  });
});

const importInMiniflare = async (key, target) => {
  const entry = join(ROOT, `.tmp-literal-imports-${process.pid}.mjs`);
  writeFileSync(
    entry,
    `import * as m from ${JSON.stringify(`./${target.replace(/^\.\//, "")}`)};
export default { fetch: () => new Response(String(Object.keys(m).length)) };
`,
  );
  const mf = new Miniflare({
    modules: esModules(entry, join(ROOT, "dist")),
    modulesRoot: ROOT,
    compatibilityDate: "2024-01-01",
  });
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${key} timed out`)), MINIFLARE_TIMEOUT_MS);
    });
    const resp = await Promise.race([mf.dispatchFetch("http://localhost/"), timeout]);
    return resp.status;
  } finally {
    clearTimeout(timer);
    await mf.dispose();
    rmSync(entry, { force: true });
  }
};

describe("literal imports: dist inside Miniflare", () => {
  it.each(SUBPATHS)("imports %s", async (key, target) => {
    // Arrange / Act
    const status = await importInMiniflare(key, target);

    // Assert
    expect(status).toBe(200);
  });
});

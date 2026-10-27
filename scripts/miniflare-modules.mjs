// SPDX-License-Identifier: Apache-2.0
/**
 * Explicit Miniflare module list for the built package.
 *
 * Miniflare's automatic collector rejects every computed import() specifier,
 * including the one in importNodeBuiltin. A bundler such as wrangler leaves it
 * alone, so the harnesses list the ES modules by hand instead.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

const listJs = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listJs(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });

/** The worker entry followed by every .js file under distDir, as ES modules. */
export const esModules = (entry, distDir) =>
  [entry, ...listJs(distDir)].map(path => ({ type: "ESModule", path }));

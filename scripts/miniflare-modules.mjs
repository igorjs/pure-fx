// SPDX-License-Identifier: Apache-2.0
/**
 * Explicit Miniflare module list for the built package.
 *
 * Miniflare's automatic collector rejects every computed import() specifier,
 * including the one in importNodeBuiltin. A bundler such as wrangler leaves it
 * alone, so the harnesses list the ES modules by hand instead. Also holds the
 * timeout race the Miniflare harnesses share.
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

/** Rejects with `message` when `promise` has not settled within `ms`; the timer is always cleared. */
export const withTimeout = (promise, ms, message) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

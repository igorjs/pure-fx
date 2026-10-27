// SPDX-License-Identifier: Apache-2.0
/**
 * Release tag safeguard: the tag must be an annotated tag GitHub verified as
 * signed, and its commit must be reachable from origin/main.
 *
 * CLI: GITHUB_TOKEN, GITHUB_REPOSITORY and RELEASE_TAG come from the
 * environment; exits 1 with the reason when the tag is rejected.
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createGitHubApi } from "./release-ci.mjs";

const MAIN_REF = "origin/main";

const isAncestorOfMain = (sha, cwd) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, MAIN_REF], { cwd, stdio: "pipe" });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
};

/** Returns `{ ok: true }` or `{ ok: false, reason }`. */
export async function verifyReleaseTag({ api, tag, cwd }) {
  const ref = await api.getRef(`tags/${tag}`);
  if (!ref) return { ok: false, reason: `Tag ${tag} does not exist.` };
  if (ref.object.type !== "tag") {
    return { ok: false, reason: `Tag ${tag} is lightweight; releases need an annotated, signed tag.` };
  }
  const tagObject = await api.getTag(ref.object.sha);
  if (!tagObject.verification?.verified) {
    return { ok: false, reason: `Tag ${tag} has no verified signature.` };
  }
  if (!isAncestorOfMain(tagObject.object.sha, cwd)) {
    return { ok: false, reason: `Tag ${tag} points at a commit that is not an ancestor of ${MAIN_REF}.` };
  }
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository, RELEASE_TAG: tag } = process.env;
  if (!token || !repository || !tag) {
    process.stderr.write("Error: GITHUB_TOKEN, GITHUB_REPOSITORY and RELEASE_TAG are required.\n");
    process.exit(1);
  }
  const api = createGitHubApi({ token, repository, fetch });
  const result = await verifyReleaseTag({ api, tag, cwd: process.cwd() });
  if (!result.ok) {
    process.stderr.write(`Error: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(`Tag ${tag} is signed and on main.\n`);
}

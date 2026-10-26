// SPDX-License-Identifier: Apache-2.0
/**
 * CI release flow (`node scripts/release.mjs --ci`).
 *
 * Computes the next version from conventional commits, then creates the
 * release commit on main and an annotated tag through the GitHub Git Data
 * API, so the App-signed commit and tag need no local key. It does not create
 * the GitHub release. Every step is safe to re-run: an existing tag exits 0,
 * and a release commit without its tag gets only the tag.
 *
 * All text (commit subjects, notes) travels in JSON request bodies; nothing
 * is interpolated into a shell or an output file.
 */

import {
  CHANGELOG_HEADER,
  computeNextVersion,
  groupChangelog,
  insertChangelogSection,
  latestSemverTag,
  renderChangelogSection,
} from "./release-lib.mjs";

const BARE_SEMVER = /^\d+\.\d+\.\d+$/;
const NO_CHANGES = "No user-facing changes";
const API_ROOT = "https://api.github.com";

const parts = (version) => version.split(".").map(Number);
const isGreater = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  const i = x.findIndex((n, k) => n !== y[k]);
  return i !== -1 && x[i] > y[i];
};

/** Thin wrapper over the Git Data API: one method per operation. */
export function createGitHubApi({ token, repository, fetch }) {
  const request = async (method, path, body) => {
    const response = await fetch(`${API_ROOT}/repos/${repository}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${path} failed with status ${response.status}.`);
    }
    return response.json();
  };
  return {
    getRef: (ref) => request("GET", `/git/ref/${ref}`),
    getTag: (sha) => request("GET", `/git/tags/${sha}`),
    getCommit: (sha) => request("GET", `/git/commits/${sha}`),
    createBlob: (content) => request("POST", "/git/blobs", { content, encoding: "utf-8" }),
    createTree: (body) => request("POST", "/git/trees", body),
    createCommit: (body) => request("POST", "/git/commits", body),
    updateRef: (ref, sha) => request("PATCH", `/git/refs/${ref}`, { sha, force: false }),
    createTag: (body) => request("POST", "/git/tags", body),
    createRef: (ref, sha) => request("POST", "/git/refs", { ref, sha }),
  };
}

const parseArgs = (argv) => {
  const at = argv.indexOf("--version");
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("-n"),
    override: at === -1 ? null : (argv[at + 1] ?? ""),
  };
};

/** Picks the version to release, or a reason it cannot be (`error`) or need not be (`version: null`). */
const chooseVersion = ({ override, commits, baseVersion }) => {
  if (override === null) return { version: computeNextVersion(commits, baseVersion) };
  if (!BARE_SEMVER.test(override)) {
    return { error: `--version must be a bare MAJOR.MINOR.PATCH (got "${override}").` };
  }
  if (!isGreater(override, baseVersion)) {
    return { error: `--version ${override} must be greater than the base v${baseVersion}.` };
  }
  return { version: override };
};

const withVersion = (json, version) =>
  `${JSON.stringify({ ...JSON.parse(json), version }, null, 2)}\n`;

const buildChanges = async ({ fs, version, section, link }) => {
  let changelog;
  try {
    changelog = await fs.readFile("CHANGELOG.md");
  } catch {
    changelog = CHANGELOG_HEADER;
  }
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(
      `CHANGELOG.md already has a section for ${version} but tag v${version} is missing and HEAD is not its release commit. Tag the existing release commit by hand.`,
    );
  }
  // Only these three paths ever reach the tree, which is the release allowlist.
  return {
    "package.json": withVersion(await fs.readFile("package.json"), version),
    "jsr.json": withVersion(await fs.readFile("jsr.json"), version),
    "CHANGELOG.md": insertChangelogSection(changelog, section, version, link),
  };
};

const createReleaseCommit = async ({ api, head, headCommit, changes, message }) => {
  const tree = await Promise.all(
    Object.entries(changes).map(async ([path, content]) => {
      const blob = await api.createBlob(content);
      return { path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );
  const newTree = await api.createTree({ base_tree: headCommit.tree.sha, tree });
  const created = await api.createCommit({ message, tree: newTree.sha, parents: [head] });
  await api.updateRef("heads/main", created.sha);
  return created.sha;
};

/** Runs the CI release flow and returns the process exit code. */
export async function runCiRelease(argv, deps) {
  const { api, git, fs, now, log, repository } = deps;
  const { dryRun, override } = parseArgs(argv);
  try {
    log("[1/5] Checking the working tree");
    if (git.status().length > 0) {
      log("Error: the working tree is not clean.");
      return 1;
    }

    log("[2/5] Choosing the version");
    const base = latestSemverTag(git.tags());
    const baseVersion = base ? base.slice(1) : "0.0.0";
    const commits = git.logSince(base ?? "");
    const chosen = chooseVersion({ override, commits, baseVersion });
    if (chosen.error) {
      log(`Error: ${chosen.error}`);
      return 1;
    }
    if (chosen.version === null) {
      log("Nothing to release: no releasable commits since the last tag.");
      return 0;
    }
    const { version } = chosen;
    const tag = `v${version}`;

    const url = `https://github.com/${repository}`;
    const section = renderChangelogSection({
      version,
      date: now().toISOString().slice(0, 10),
      groups: groupChangelog(commits),
      emptyBody: NO_CHANGES,
    });
    const link = base
      ? `[${version}]: ${url}/compare/${base}...${tag}`
      : `[${version}]: ${url}/releases/tag/${tag}`;

    if (dryRun) {
      log(`[dry-run] Would release ${tag}. No files written, no API calls made.`);
      log(section);
      return 0;
    }

    log(`[3/5] Checking whether ${tag} already exists`);
    if (await api.getRef(`tags/${tag}`)) {
      log(`Tag ${tag} already exists, nothing to do.`);
      return 0;
    }

    log("[4/5] Creating the release commit");
    const head = (await api.getRef("heads/main")).object.sha;
    const headCommit = await api.getCommit(head);
    let commitSha = head;
    if (headCommit.message.startsWith(`chore(release): ${tag}`)) {
      log(`HEAD is already the release commit for ${tag}, creating only the tag.`);
    } else {
      const changes = await buildChanges({ fs, version, section, link });
      commitSha = await createReleaseCommit({
        api,
        head,
        headCommit,
        changes,
        message: `chore(release): ${tag}\n\n${section}\n`,
      });
    }

    log("[5/5] Creating the annotated tag");
    const tagObject = await api.createTag({
      tag,
      message: tag,
      object: commitSha,
      type: "commit",
    });
    await api.createRef(`refs/tags/${tag}`, tagObject.sha);
    log(`Released ${tag}`);
    return 0;
  } catch (error) {
    log(`Error: ${error.message}`);
    return 1;
  }
}

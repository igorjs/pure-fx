// SPDX-License-Identifier: Apache-2.0
/**
 * Pure release helpers shared by the local flow (release.mjs) and the CI flow
 * (release-ci.mjs): commit parsing, bump rules, changelog rendering.
 */

import { execSync } from "node:child_process";

export const run = (cmd, opts) => {
  const result = execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...opts });
  return result ? result.trim() : "";
};

// -- Pure functions (exported for tests) --------------------------------------

const CONVENTIONAL_SUBJECT = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;
const RECORD_FORMAT = "%h%x1f%s%x1f%b%x1e";

const BUMP_PATCH = 1;
const BUMP_MINOR = 2;
const BUMP_MAJOR = 3;

// Commit types that release, and the bump each one gives.
const TYPE_BUMPS = { feat: BUMP_MINOR, fix: BUMP_PATCH, perf: BUMP_PATCH };

const BREAKING_LABEL = "Breaking";
const OTHER_LABEL = "Other";

const NOTE_CATEGORIES = [
  { type: "feat", label: "Features" },
  { type: "fix", label: "Bug Fixes" },
  { type: "perf", label: "Performance" },
  { type: "refactor", label: "Refactoring" },
  { type: "test", label: "Tests" },
  { type: "docs", label: "Documentation" },
  { type: "ci", label: "CI" },
  { type: "build", label: "Build" },
  { type: "chore", label: "Chores" },
];

// Keep a Changelog headings for the user-facing sections of CHANGELOG.md.
const CHANGELOG_HEADINGS = new Map([
  [BREAKING_LABEL, "Breaking"],
  ["Features", "Added"],
  ["Bug Fixes", "Fixed"],
  ["Performance", "Changed"],
]);

/** Arguments for `git tag`; refuses to build an unsigned tag. */
export function tagCommandFor(tag, signingKey) {
  if (!signingKey) {
    throw new Error("No git signing key is configured (user.signingkey); releases need a signed tag.");
  }
  return ["tag", "-s", tag, "-m", tag];
}

/** The only files a release commit may change. */
export const ALLOWED_RELEASE_FILES = ["package.json", "jsr.json", "CHANGELOG.md"];

/** Throws when any path is outside the release allowlist. */
export function assertAllowedChanges(paths) {
  const stray = paths.filter((p) => !ALLOWED_RELEASE_FILES.includes(p));
  if (stray.length > 0) {
    throw new Error(`Release may only change ${ALLOWED_RELEASE_FILES.join(", ")}; got ${stray.join(", ")}.`);
  }
}

export const CHANGELOG_HEADER = [
  "# Changelog",
  "",
  "All notable changes to this project will be documented in this file.",
  "",
  "The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).",
  "",
].join("\n");

/**
 * Renders a Keep a Changelog section for the grouped commits. Returns
 * `emptyBody` as the section body when no group is user-facing, or null when
 * `emptyBody` is not given.
 */
export function renderChangelogSection({ version, date, groups, emptyBody = null }) {
  const sections = groups
    .filter((group) => CHANGELOG_HEADINGS.has(group.label))
    .map((group) => {
      const entries = group.commits.map((c) => {
        const text = describeCommit(c);
        return `- ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
      });
      return `### ${CHANGELOG_HEADINGS.get(group.label)}\n${entries.join("\n")}`;
    });
  if (sections.length === 0 && emptyBody === null) return null;
  const body = sections.length > 0 ? sections.join("\n\n") : emptyBody;
  return `## [${version}] - ${date}\n\n${body}`;
}

/**
 * Inserts a section before the first version entry (or at the end), then
 * adds `versionLink` at the top of the links block unless the version
 * already has one.
 */
export function insertChangelogSection(content, section, version, versionLink) {
  const firstVersion = content.indexOf("\n## [");
  let next =
    firstVersion !== -1
      ? `${content.slice(0, firstVersion)}\n${section}\n${content.slice(firstVersion)}`
      : `${content.trimEnd()}\n\n${section}\n`;
  if (!next.includes(`[${version}]:`)) {
    const firstLink = next.search(/\n\[[^\]]+\]: https?:\/\//);
    next =
      firstLink !== -1
        ? `${next.slice(0, firstLink + 1)}${versionLink}\n${next.slice(firstLink + 1)}`
        : `${next.trimEnd()}\n\n${versionLink}\n`;
  }
  return next;
}

/** Parses one `git log` record (hash, subject, body) into a commit, or null. */
export function parseCommit(record) {
  const [hash = "", subject = "", body = ""] = record.replace(/^\n+/, "").split("\x1f");
  const match = CONVENTIONAL_SUBJECT.exec(subject.trim());
  if (!match) return null;
  const [, type, scope = null, bang, description] = match;
  return {
    hash: hash.trim(),
    type,
    scope,
    breaking: bang === "!" || BREAKING_FOOTER.test(body),
    description,
  };
}

/**
 * Returns the next version for the commits, or null when nothing releases.
 * Below 1.0 a breaking change bumps minor; from 1.0 it bumps major.
 */
export function computeNextVersion(commits, current) {
  const [major, minor, patch] = current.split(".").map(Number);
  const bump = Math.max(
    0,
    ...commits.map((c) => (c.breaking ? BUMP_MAJOR : (TYPE_BUMPS[c.type] ?? 0))),
  );
  if (bump === 0) return null;
  const level = major === 0 ? Math.min(bump, BUMP_MINOR) : bump;
  if (level === BUMP_MAJOR) return `${major + 1}.0.0`;
  if (level === BUMP_MINOR) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Groups commits into ordered sections: Breaking first (every breaking
 * commit, once), then one section per known type, then Other.
 */
export function groupChangelog(commits) {
  const sections = [];
  const add = (label, items) => {
    if (items.length > 0) sections.push({ label, commits: items });
  };
  add(BREAKING_LABEL, commits.filter((c) => c.breaking));
  const rest = commits.filter((c) => !c.breaking);
  for (const cat of NOTE_CATEGORIES) {
    add(cat.label, rest.filter((c) => c.type === cat.type));
  }
  const known = new Set(NOTE_CATEGORIES.map((cat) => cat.type));
  add(OTHER_LABEL, rest.filter((c) => !known.has(c.type)));
  return sections;
}

/** Lists the tags reachable from HEAD, so a tag on an unmerged branch is never the base. */
export function reachableTags({ cwd } = {}) {
  return run("git tag --merged HEAD", { cwd }).split("\n").filter(Boolean);
}

/** Picks the highest plain `vMAJOR.MINOR.PATCH` tag, or null. */
export function latestSemverTag(tags) {
  const parse = (tag) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)?.slice(1).map(Number);
  const isNewer = (a, b) => a.find((n, i) => n !== b[i]) > b.find((n, i) => n !== a[i]);
  let best = null;
  for (const tag of tags) {
    const parts = parse(tag);
    if (!parts) continue;
    if (best === null || isNewer(parts, parse(best))) best = tag;
  }
  return best;
}

export const describeCommit = (c) =>
  c.type === null || NOTE_CATEGORIES.some((cat) => cat.type === c.type)
    ? c.description
    : `${c.type}${c.scope ? `(${c.scope})` : ""}: ${c.description}`;

/** Reads the commits after `tag` (all history when empty) up to `to`. */
export function readCommitsSince(tag, { cwd, to = "HEAD" } = {}) {
  const range = tag ? `${tag}..${to}` : to;
  const raw = run(`git log --format=${RECORD_FORMAT} ${range}`, { cwd });
  return raw
    .split("\x1e")
    .filter((rec) => rec.trim().length > 0)
    .map(
      (rec) =>
        parseCommit(rec) ?? {
          hash: rec.replace(/^\n+/, "").split("\x1f")[0].trim(),
          type: null,
          scope: null,
          breaking: false,
          description: rec.replace(/^\n+/, "").split("\x1f")[1] ?? "",
        },
    );
}

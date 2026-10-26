// SPDX-License-Identifier: Apache-2.0
/**
 * release.test.mjs - Bump rules, commit parsing and changelog grouping of
 * scripts/release.mjs, plus the commit range read from a real temp git repo.
 *
 * Run: pnpm test
 */

import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@igorjs/pure-test";
import {
  computeNextVersion,
  groupChangelog,
  latestSemverTag,
  parseCommit,
  readCommitsSince,
} from "../scripts/release.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────────

const commit = (type, { breaking = false, scope = null } = {}) => ({
  hash: "abc1234",
  type,
  scope,
  breaking,
  description: "something",
});

const record = (subject, body = "") => `abc1234\x1f${subject}\x1f${body}\x1e`;

// ── computeNextVersion ──────────────────────────────────────────────────────

describe("computeNextVersion", () => {
  const cases = [
    ["an empty list gives none", [], "0.3.0", null],
    [
      "only chore, docs and ci gives none",
      [commit("chore"), commit("docs"), commit("ci")],
      "0.3.0",
      null,
    ],
    ["one fix gives patch", [commit("fix")], "0.3.0", "0.3.1"],
    ["one perf gives patch", [commit("perf")], "0.3.0", "0.3.1"],
    ["one feat gives minor", [commit("feat")], "0.3.0", "0.4.0"],
    [
      "a breaking feat below 1.0 gives minor",
      [commit("feat", { breaking: true, scope: "x" })],
      "0.3.0",
      "0.4.0",
    ],
    [
      "a breaking chore below 1.0 gives minor",
      [commit("chore", { breaking: true })],
      "0.3.0",
      "0.4.0",
    ],
    ["mixed fix and feat gives minor", [commit("fix"), commit("feat")], "0.3.0", "0.4.0"],
    [
      "breaking plus feat gives one minor bump",
      [commit("feat", { breaking: true }), commit("feat")],
      "0.3.0",
      "0.4.0",
    ],
    [
      "a breaking feat at 1.2.3 gives major",
      [commit("feat", { breaking: true })],
      "1.2.3",
      "2.0.0",
    ],
    ["a feat at 1.2.3 gives minor", [commit("feat")], "1.2.3", "1.3.0"],
    ["a fix at 1.2.3 gives patch", [commit("fix")], "1.2.3", "1.2.4"],
  ];

  for (const [name, commits, current, expected] of cases) {
    it(name, () => {
      // Arrange
      // (commits and current come from the case table)

      // Act
      const next = computeNextVersion(commits, current);

      // Assert
      expect(next).toBe(expected);
    });
  }

  it("a BREAKING CHANGE footer gives minor below 1.0", () => {
    // Arrange
    const parsed = parseCommit(record("refactor: reshape api", "BREAKING CHANGE: api reshaped"));

    // Act
    const next = computeNextVersion([parsed], "0.3.0");

    // Assert
    expect(next).toBe("0.4.0");
  });
});

// ── parseCommit ─────────────────────────────────────────────────────────────

describe("parseCommit", () => {
  it("reads type, scope, description and the bang marker", () => {
    // Arrange
    const rec = record("feat(x)!: drop y");

    // Act
    const parsed = parseCommit(rec);

    // Assert
    expect(parsed.hash).toBe("abc1234");
    expect(parsed.type).toBe("feat");
    expect(parsed.scope).toBe("x");
    expect(parsed.breaking).toBe(true);
    expect(parsed.description).toBe("drop y");
  });

  it("flags a BREAKING CHANGE footer in the body", () => {
    // Arrange
    const rec = record("fix: tighten parser", "Details.\n\nBREAKING CHANGE: input is stricter");

    // Act
    const parsed = parseCommit(rec);

    // Assert
    expect(parsed.breaking).toBe(true);
  });

  it("does not flag a plain commit as breaking", () => {
    // Arrange
    const rec = record("fix: tighten parser", "Just a body.");

    // Act
    const parsed = parseCommit(rec);

    // Assert
    expect(parsed.breaking).toBe(false);
  });

  it("returns null for a non-conventional subject", () => {
    // Arrange
    const rec = record("Merge branch 'main'");

    // Act
    const parsed = parseCommit(rec);

    // Assert
    expect(parsed).toBe(null);
  });
});

// ── groupChangelog ──────────────────────────────────────────────────────────

describe("groupChangelog", () => {
  it("lists a breaking feat under Breaking and not under Features", () => {
    // Arrange
    const breaking = parseCommit(record("feat(x)!: drop y"));
    const plain = parseCommit(record("feat: add z"));

    // Act
    const sections = groupChangelog([breaking, plain]);

    // Assert
    expect(sections.map(s => s.label).join(",")).toBe("Breaking,Features");
    expect(sections[0].commits.map(c => c.description).join(",")).toBe("drop y");
    expect(sections[1].commits.map(c => c.description).join(",")).toBe("add z");
  });
});

// ── latestSemverTag ─────────────────────────────────────────────────────────

describe("latestSemverTag", () => {
  it("picks the highest plain semver tag and ignores prereleases", () => {
    // Arrange
    const tags = ["v0.1.0", "v0.10.0", "v0.3.0", "v1.0.0-rc.1", "nightly"];

    // Act
    const tag = latestSemverTag(tags);

    // Assert
    expect(tag).toBe("v0.10.0");
  });

  it("returns null when no tag is a plain semver tag", () => {
    // Arrange
    const tags = ["nightly"];

    // Act
    const tag = latestSemverTag(tags);

    // Assert
    expect(tag).toBe(null);
  });
});

// ── readCommitsSince (real git repo) ────────────────────────────────────────

describe("readCommitsSince", () => {
  let dir;
  const git = cmd => execSync(`git ${cmd}`, { cwd: dir, stdio: "pipe" });
  const commitFile = (name, message) => {
    writeFileSync(join(dir, name), name);
    git(`add ${name}`);
    git(`commit -q -m "${message}"`);
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "release-test-"));
    mkdirSync(dir, { recursive: true });
    git("init -q");
    git("config user.email test@example.com");
    git("config user.name Test");
    git("config commit.gpgsign false");
    git("config tag.gpgsign false");
    commitFile("a", "feat: before the tag");
    git("tag v0.3.0");
    commitFile("b", "fix: after the tag");
    commitFile("c", "chore: also after");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns only the commits after the tag", () => {
    // Arrange
    const tag = "v0.3.0";

    // Act
    const commits = readCommitsSince(tag, { cwd: dir });

    // Assert
    expect(commits.map(c => c.type).join(",")).toBe("chore,fix");
  });

  it("gives the expected next version for that range", () => {
    // Arrange
    const commits = readCommitsSince("v0.3.0", { cwd: dir });

    // Act
    const next = computeNextVersion(commits, "0.3.0");

    // Assert
    expect(next).toBe("0.3.1");
  });
});

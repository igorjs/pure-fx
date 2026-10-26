// SPDX-License-Identifier: Apache-2.0
/**
 * release.test.mjs - Bump rules, commit parsing and changelog grouping of
 * scripts/release-lib.mjs, plus the commit range read from a real temp git repo.
 *
 * Run: pnpm test
 */

import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@igorjs/pure-test";
import { createGitHubApi, runCiRelease } from "../scripts/release-ci.mjs";
import {
  ALLOWED_RELEASE_FILES,
  assertAllowedChanges,
  computeNextVersion,
  groupChangelog,
  latestSemverTag,
  parseCommit,
  readCommitsSince,
  tagCommandFor,
} from "../scripts/release-lib.mjs";

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

// ── --ci mode ───────────────────────────────────────────────────────────────

const WRITE_CALLS = new Set([
  "createBlob",
  "createTree",
  "createCommit",
  "updateRef",
  "createTag",
  "createRef",
]);

const ciCommit = (type, description = "something", { breaking = false } = {}) => ({
  hash: "abc1234",
  type,
  scope: null,
  breaking,
  description,
});

const CI_FILES = {
  "package.json": `${JSON.stringify({ name: "x", version: "0.3.0" }, null, 2)}\n`,
  "jsr.json": `${JSON.stringify({ name: "@x/y", version: "0.3.0" }, null, 2)}\n`,
  "CHANGELOG.md": [
    "# Changelog",
    "",
    "## [0.3.0] - 2026-05-25",
    "",
    "### Added",
    "- Old thing",
    "",
    "[0.3.0]: https://github.com/o/r/releases/tag/v0.3.0",
    "",
  ].join("\n"),
};

const makeCi = ({
  commits = [ciCommit("feat", "add thing")],
  tags = ["v0.3.0"],
  status = "",
  tagRef = null,
  headMessage = "feat: previous",
} = {}) => {
  const calls = [];
  const writes = [];
  const lines = [];
  const call =
    (name, result) =>
    (...args) => {
      calls.push({ name, args });
      return Promise.resolve(result(...args));
    };
  const api = {
    getRef: call("getRef", ref =>
      ref.startsWith("tags/") ? tagRef : { object: { sha: "head1" } },
    ),
    getCommit: call("getCommit", () => ({ message: headMessage, tree: { sha: "tree0" } })),
    createBlob: call("createBlob", () => ({ sha: `blob${calls.length}` })),
    createTree: call("createTree", () => ({ sha: "tree1" })),
    createCommit: call("createCommit", () => ({ sha: "commit1" })),
    updateRef: call("updateRef", () => ({})),
    createTag: call("createTag", () => ({ sha: "tagobj1" })),
    createRef: call("createRef", () => ({})),
  };
  const deps = {
    api,
    git: { status: () => status, tags: () => tags, logSince: () => commits },
    fs: {
      readFile: path => {
        if (!(path in CI_FILES)) throw new Error(`ENOENT ${path}`);
        return CI_FILES[path];
      },
      writeFile: (path, content) => writes.push({ path, content }),
    },
    now: () => new Date("2026-10-26T12:00:00Z"),
    log: msg => lines.push(msg),
    repository: "o/r",
  };
  const mutations = () => calls.filter(c => WRITE_CALLS.has(c.name));
  return { deps, calls, writes, lines, mutations };
};

describe("runCiRelease", () => {
  it("exits 0 with no writes and no API calls when nothing is releasable", async () => {
    // Arrange
    const ci = makeCi({ commits: [ciCommit("chore"), ciCommit("docs")] });

    // Act
    const code = await runCiRelease([], ci.deps);

    // Assert
    expect(code).toBe(0);
    expect(ci.writes.length).toBe(0);
    expect(ci.calls.length).toBe(0);
  });

  it("creates blobs, tree, commit, ref update, tag object and tag ref in order", async () => {
    // Arrange
    const ci = makeCi();

    // Act
    const code = await runCiRelease([], ci.deps);

    // Assert
    expect(code).toBe(0);
    expect(
      ci
        .mutations()
        .map(c => c.name)
        .join(","),
    ).toBe(
      "createBlob,createBlob,createBlob,createTree,createCommit,updateRef,createTag,createRef",
    );
    const commitCall = ci.calls.find(c => c.name === "createCommit");
    expect(commitCall.args[0].message.startsWith("chore(release): v0.4.0")).toBe(true);
    expect(commitCall.args[0].parents.join(",")).toBe("head1");
    expect(ci.writes.length).toBe(0);
  });

  it("updates only the allowlisted files with the new version and a dated section", async () => {
    // Arrange
    const ci = makeCi();

    // Act
    await runCiRelease([], ci.deps);

    // Assert
    const blobs = ci.calls.filter(c => c.name === "createBlob").map(c => c.args[0]);
    const tree = ci.calls.find(c => c.name === "createTree").args[0];
    expect(
      tree.tree
        .map(e => e.path)
        .sort()
        .join(","),
    ).toBe([...ALLOWED_RELEASE_FILES].sort().join(","));
    expect(tree.base_tree).toBe("tree0");
    expect(blobs.some(b => b.includes('"version": "0.4.0"'))).toBe(true);
    expect(blobs.some(b => b.includes("## [0.4.0] - 2026-10-26"))).toBe(true);
  });

  it("creates only the tag when HEAD is already the release commit", async () => {
    // Arrange
    const ci = makeCi({
      commits: [ciCommit("feat", "add thing"), ciCommit("chore", "release v0.4.0")],
      headMessage: "chore(release): v0.4.0\n\nnotes",
    });

    // Act
    const code = await runCiRelease([], ci.deps);

    // Assert
    expect(code).toBe(0);
    expect(
      ci
        .mutations()
        .map(c => c.name)
        .join(","),
    ).toBe("createTag,createRef");
    expect(ci.calls.find(c => c.name === "createTag").args[0].object).toBe("head1");
  });

  it("exits 0 with no writes when the tag already exists", async () => {
    // Arrange
    const ci = makeCi({ tagRef: { object: { sha: "tagobj0" } } });

    // Act
    const code = await runCiRelease([], ci.deps);

    // Assert
    expect(code).toBe(0);
    expect(ci.mutations().length).toBe(0);
    expect(ci.writes.length).toBe(0);
  });

  it("prints the version and makes no writes and no API calls on --dry-run", async () => {
    // Arrange
    const ci = makeCi();

    // Act
    const code = await runCiRelease(["--dry-run"], ci.deps);

    // Assert
    expect(code).toBe(0);
    expect(ci.calls.length).toBe(0);
    expect(ci.writes.length).toBe(0);
    expect(ci.lines.join("\n").includes("0.4.0")).toBe(true);
  });

  it("releases --version 1.0.0 from only chore commits with a No user-facing changes section", async () => {
    // Arrange
    const ci = makeCi({ commits: [ciCommit("chore")] });

    // Act
    const code = await runCiRelease(["--version", "1.0.0"], ci.deps);

    // Assert
    expect(code).toBe(0);
    const changelog = ci.calls
      .filter(c => c.name === "createBlob")
      .map(c => c.args[0])
      .find(b => b.includes("# Changelog"));
    expect(changelog.includes("## [1.0.0] - 2026-10-26")).toBe(true);
    expect(changelog.includes("No user-facing changes")).toBe(true);
  });

  it("aborts on a dirty tree with no writes", async () => {
    // Arrange
    const ci = makeCi({ status: " M src/index.ts" });

    // Act
    const code = await runCiRelease([], ci.deps);

    // Assert
    expect(code).toBe(1);
    expect(ci.mutations().length).toBe(0);
    expect(ci.writes.length).toBe(0);
  });

  for (const bad of ["0.1.0", "0.3.0", "1.0.0-rc.1", "v1.0.0"]) {
    it(`aborts with no writes for --version ${bad}`, async () => {
      // Arrange
      const ci = makeCi();

      // Act
      const code = await runCiRelease(["--version", bad], ci.deps);

      // Assert
      expect(code).toBe(1);
      expect(ci.mutations().length).toBe(0);
      expect(ci.writes.length).toBe(0);
    });
  }

  it("passes a commit subject with shell metacharacters through as literal text", async () => {
    // Arrange
    const nasty = "Handle $(id) and `whoami`";
    const ci = makeCi({ commits: [ciCommit("feat", nasty)] });

    // Act
    const code = await runCiRelease([], ci.deps);

    // Assert
    expect(code).toBe(0);
    const message = ci.calls.find(c => c.name === "createCommit").args[0].message;
    expect(message.includes(nasty)).toBe(true);
  });
});

describe("assertAllowedChanges", () => {
  it("accepts the release files", () => {
    // Arrange
    const paths = ["package.json", "jsr.json", "CHANGELOG.md"];

    // Act
    const act = () => assertAllowedChanges(paths);

    // Assert
    expect(act).not.toThrow();
  });

  it("rejects a path outside the allowlist", () => {
    // Arrange
    const paths = ["package.json", "README.md"];

    // Act
    const act = () => assertAllowedChanges(paths);

    // Assert
    expect(act).toThrow();
  });
});

describe("createGitHubApi", () => {
  const respond = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  it("returns null from getRef on a 404", async () => {
    // Arrange
    const fetch = async () => respond(404, { message: "Not Found" });
    const api = createGitHubApi({ token: "t", repository: "o/r", fetch });

    // Act
    const ref = await api.getRef("tags/v1.0.0");

    // Assert
    expect(ref).toBe(null);
  });

  it("sends a non-forced ref update with the bearer token", async () => {
    // Arrange
    const seen = [];
    const fetch = async (url, init) => {
      seen.push({ url, init });
      return respond(200, {});
    };
    const api = createGitHubApi({ token: "tok", repository: "o/r", fetch });

    // Act
    await api.updateRef("heads/main", "sha1");

    // Assert
    expect(seen[0].url).toBe("https://api.github.com/repos/o/r/git/refs/heads/main");
    expect(seen[0].init.method).toBe("PATCH");
    expect(seen[0].init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(seen[0].init.body).force).toBe(false);
  });
});

// ── tagCommandFor ───────────────────────────────────────────────────────────

describe("tagCommandFor", () => {
  it("returns the signed tag arguments when a signing key is set", () => {
    // Arrange
    const key = "ABCDEF0123456789";

    // Act
    const args = tagCommandFor("v1.2.3", key);

    // Assert
    expect(args).toEqual(["tag", "-s", "v1.2.3", "-m", "v1.2.3"]);
  });

  it("throws instead of falling back to an unsigned tag when the key is empty", () => {
    // Arrange
    const act = () => tagCommandFor("v1.2.3", "");

    // Act and Assert
    expect(act).toThrow();
  });
});

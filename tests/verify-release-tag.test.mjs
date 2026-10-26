// SPDX-License-Identifier: Apache-2.0
/**
 * verify-release-tag.test.mjs - Tag signature and ancestry checks of
 * scripts/verify-release-tag.mjs, with a fake API and a real temp git repo.
 *
 * Run: pnpm test
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@igorjs/pure-test";
import { verifyReleaseTag } from "../scripts/verify-release-tag.mjs";

const TAG = "v1.2.3";
const TAG_OBJECT_SHA = "t".repeat(40);

let dir;
let mainSha;
let sideSha;

const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();

const commitFile = name => {
  writeFileSync(join(dir, name), name);
  git("add", name);
  git("commit", "-q", "-m", name);
  return git("rev-parse", "HEAD");
};

const fakeApi = ({ refType = "tag", verified = true, commitSha }) => ({
  getRef: async () => ({
    object: { type: refType, sha: refType === "tag" ? TAG_OBJECT_SHA : commitSha },
  }),
  getTag: async () => ({ verification: { verified }, object: { sha: commitSha } }),
});

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "verify-tag-test-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  commitFile("a");
  mainSha = commitFile("b");
  git("update-ref", "refs/remotes/origin/main", mainSha);
  git("checkout", "-q", "-b", "side");
  sideSha = commitFile("c");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("verifyReleaseTag", () => {
  it("accepts a verified annotated tag on a commit reachable from origin/main", async () => {
    // Arrange
    const api = fakeApi({ commitSha: mainSha });

    // Act
    const result = await verifyReleaseTag({ api, tag: TAG, cwd: dir });

    // Assert
    expect(result.ok).toBe(true);
  });

  it("rejects a tag whose signature is not verified", async () => {
    // Arrange
    const api = fakeApi({ verified: false, commitSha: mainSha });

    // Act
    const result = await verifyReleaseTag({ api, tag: TAG, cwd: dir });

    // Assert
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("signature");
  });

  it("rejects a tagged commit that is not an ancestor of origin/main", async () => {
    // Arrange
    const api = fakeApi({ commitSha: sideSha });

    // Act
    const result = await verifyReleaseTag({ api, tag: TAG, cwd: dir });

    // Assert
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("origin/main");
  });

  it("rejects a lightweight tag whose ref points straight at a commit", async () => {
    // Arrange
    const api = fakeApi({ refType: "commit", commitSha: mainSha });

    // Act
    const result = await verifyReleaseTag({ api, tag: TAG, cwd: dir });

    // Assert
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("annotated");
  });
});

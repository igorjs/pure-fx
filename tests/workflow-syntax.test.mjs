// SPDX-License-Identifier: Apache-2.0
/**
 * workflow-syntax.test.mjs - Static checks on .github/workflows/*.yml.
 *
 * Fails when a workflow contains a Terraform-style `$$` escape (for example
 * `$${VAR}`). GitHub Actions does not unescape it, so the shell receives a
 * literal `$$` (the PID) followed by the name, and the step misbehaves.
 *
 * Also fails when a secret read by a workflow is not documented in
 * docs/repo-setup.md under "Actions secrets", or a BOT_APP_* secret is not
 * documented under "Dependabot secrets".
 *
 * Also fails when a job does not set its own job-level `permissions`.
 *
 * Also fails when an action is not pinned to a 40-character commit SHA,
 * except the SLSA generator reusable workflow, which must be referenced by tag.
 *
 * Run: pnpm test
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@igorjs/pure-test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = join(projectRoot, ".github", "workflows");

// `$$` followed by a name or brace. A bare shell PID (`$$ `) does not match.
const TERRAFORM_ESCAPE = /\$\$[A-Za-z_{]/;

const SECRET_REF = /\bsecrets\.([A-Z][A-Z0-9_]*)/g;
const SETUP_DOC = "docs/repo-setup.md";
const ACTIONS_HEADING = "## Actions secrets";
const DEPENDABOT_HEADING = "## Dependabot secrets";
const BOT_SECRET_PREFIX = "BOT_APP_";

const SHA_PIN = /^[0-9a-f]{40}$/;
const USES_LINE = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/;
const JOB_START = /^ {2}([A-Za-z0-9_-]+):\s*$/;
const JOB_PERMISSIONS = /^ {4}permissions:/;
const TOP_LEVEL_KEY = /^\S/;
// SLSA verification requires this reusable workflow to be referenced by tag.
const PIN_ALLOWLIST = [
  "slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function readWorkflows() {
  return readdirSync(workflowsDir)
    .filter(name => name.endsWith(".yml"))
    .sort()
    .map(name => ({
      path: `.github/workflows/${name}`,
      text: readFileSync(join(workflowsDir, name), "utf8"),
    }));
}

function findTerraformEscapes(text) {
  return text
    .split("\n")
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(hit => TERRAFORM_ESCAPE.test(hit.text));
}

function collectSecretNames(workflows) {
  const names = new Set();
  for (const { text } of workflows) {
    for (const match of text.matchAll(SECRET_REF)) names.add(match[1]);
  }
  names.delete("GITHUB_TOKEN");
  return [...names].sort();
}

function sectionOf(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex(line => line.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

function missingBacktickedNames(section, names) {
  return names.filter(name => !section.includes(`\`${name}\``));
}

function jobsWithoutPermissions(text) {
  const jobs = [];
  let inJobs = false;
  for (const line of text.split("\n")) {
    if (line === "jobs:") {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    const start = JOB_START.exec(line);
    if (start) {
      jobs.push({ id: start[1], hasPermissions: false });
    } else if (TOP_LEVEL_KEY.test(line) && !line.startsWith("#")) {
      inJobs = false;
    } else if (JOB_PERMISSIONS.test(line) && jobs.length > 0) {
      jobs[jobs.length - 1].hasPermissions = true;
    }
  }
  return jobs.filter(job => !job.hasPermissions).map(job => job.id);
}

function unpinnedUses(text) {
  const hits = [];
  for (const line of text.split("\n")) {
    const match = USES_LINE.exec(line);
    if (!match) continue;
    const target = match[1];
    if (target.startsWith("./") || target.startsWith("docker://")) continue;
    const [name, ref = ""] = target.split("@");
    if (PIN_ALLOWLIST.includes(name)) continue;
    if (!SHA_PIN.test(ref)) hits.push(`${name}: ${ref}`);
  }
  return hits;
}

// ── Rolling release helpers ─────────────────────────────────────────────────

const ROLLING_RELEASE = ".github/workflows/rolling-release.yml";
const VERSION_PATTERN = "^[0-9]+\\.[0-9]+\\.[0-9]+$";
const IF_THEN = /^\s*if\s+(.*?);\s*then\b/;
const FI = /^\s*fi\b/;
const RUN_KEY = /^(\s*)(?:-\s+)?run:\s*(.*)$/;

const expr = name => `${"$"}{{ ${name} }}`;

function readRollingRelease() {
  return readFileSync(join(projectRoot, ROLLING_RELEASE), "utf8");
}

/** Lines of every `run:` block, inline or multi-line. */
function runBlockLines(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = RUN_KEY.exec(lines[i]);
    if (!match) continue;
    if (match[2] !== "" && !/^[|>]/.test(match[2])) out.push(match[2]);
    const indent = match[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const body = lines[j];
      if (body.trim() !== "" && body.search(/\S/) <= indent) break;
      out.push(body);
    }
  }
  return out;
}

function runBlocksInterpolatingInputs(text) {
  return runBlockLines(text).filter(line => /inputs\.(version|dry_run)/.test(line));
}

function activeLines(text) {
  return text.split("\n").filter(line => !line.trim().startsWith("#"));
}

/** Lines holding `flag` that are not inside an `if ...; then` naming `guard`. */
function ungatedFlagLines(text, flag, guard) {
  const stack = [];
  const hits = [];
  for (const line of text.split("\n")) {
    const open = IF_THEN.exec(line);
    if (open) {
      stack.push(open[1]);
      continue;
    }
    if (FI.test(line)) {
      stack.pop();
      continue;
    }
    if (line.includes(flag) && !stack.some(cond => cond.includes(guard))) hits.push(line.trim());
  }
  return hits;
}

function uncommentedScheduleLines(text) {
  return text.split("\n").filter(line => /^\s*schedule:/.test(line));
}

function validationPrecedesRelease(text) {
  const lines = text.split("\n");
  const validate = lines.findIndex(line => line.includes(VERSION_PATTERN));
  const release = lines.findIndex(line => line.includes("scripts/release.mjs"));
  return validate !== -1 && release !== -1 && validate < release;
}

// ── Release workflow helpers ────────────────────────────────────────────────

const readWorkflow = name => readFileSync(join(workflowsDir, name), "utf8");

/** Lines of one job's block, from its `  id:` line to the next job. */
function jobBlock(text, id) {
  const lines = text.split("\n");
  const start = lines.indexOf(`  ${id}:`);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => JOB_START.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The `- ` step of a block containing `marker`, up to the next step. */
function stepContaining(block, marker) {
  const steps = block.split(/^ {6}- /m);
  return steps.find(step => step.includes(marker)) ?? "";
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("workflow syntax", () => {
  it("a Terraform escape fixture trips the check", () => {
    // Arrange
    const escaped = 'TAG="$${X}"';
    const bareShellPid = 'echo $$ "$VAR"';

    // Act
    const escapedHits = findTerraformEscapes(escaped);
    const bareHits = findTerraformEscapes(bareShellPid);

    // Assert
    expect(escapedHits.length).toBe(1);
    expect(bareHits.length).toBe(0);
  });

  it("no workflow contains a Terraform escape", () => {
    // Arrange
    const workflows = readWorkflows();

    // Act
    const hits = workflows.flatMap(({ path, text }) =>
      findTerraformEscapes(text).map(hit => `${path}:${hit.line}: ${hit.text.trim()}`),
    );

    // Assert
    expect(hits).toEqual([]);
  });

  it("a secret missing from the Actions section is reported", () => {
    // Arrange
    const markdown = `${ACTIONS_HEADING}\n\n- \`A_ONE\`\n`;

    // Act
    const missing = missingBacktickedNames(sectionOf(markdown, ACTIONS_HEADING), [
      "A_ONE",
      "A_TWO",
    ]);

    // Assert
    expect(missing).toEqual(["A_TWO"]);
  });

  it("a BOT_APP secret missing from the Dependabot section is reported", () => {
    // Arrange
    const markdown = `${DEPENDABOT_HEADING}\n\n- \`BOT_APP_CLIENT_ID\`\n`;

    // Act
    const missing = missingBacktickedNames(sectionOf(markdown, DEPENDABOT_HEADING), [
      "BOT_APP_CLIENT_ID",
      "BOT_APP_PRIVATE_KEY",
    ]);

    // Assert
    expect(missing).toEqual(["BOT_APP_PRIVATE_KEY"]);
  });

  it("a missing heading yields an empty section", () => {
    // Arrange
    const markdown = "# Title\n\n## Other\ntext";

    // Act
    const section = sectionOf(markdown, ACTIONS_HEADING);

    // Assert
    expect(section).toBe("");
  });

  it("every secret a workflow reads is documented under Actions secrets", () => {
    // Arrange
    const doc = readFileSync(join(projectRoot, SETUP_DOC), "utf8");
    const names = collectSecretNames(readWorkflows());

    // Act
    const missing = missingBacktickedNames(sectionOf(doc, ACTIONS_HEADING), names);

    // Assert
    expect(missing).toEqual([]);
  });

  it("every BOT_APP secret is documented under Dependabot secrets", () => {
    // Arrange
    const doc = readFileSync(join(projectRoot, SETUP_DOC), "utf8");
    const names = collectSecretNames(readWorkflows()).filter(name =>
      name.startsWith(BOT_SECRET_PREFIX),
    );

    // Act
    const missing = missingBacktickedNames(sectionOf(doc, DEPENDABOT_HEADING), names);

    // Assert
    expect(missing).toEqual([]);
  });

  it("a job without a permissions key is reported", () => {
    // Arrange
    const text = [
      "name: x",
      "jobs:",
      "  with-perms:",
      "    runs-on: ubuntu-latest",
      "    permissions:",
      "      contents: read",
      "  without-perms:",
      "    runs-on: ubuntu-latest",
      "",
    ].join("\n");

    // Act
    const missing = jobsWithoutPermissions(text);

    // Assert
    expect(missing).toEqual(["without-perms"]);
  });

  it("a tag-pinned action is reported and the SLSA generator is allowed", () => {
    // Arrange
    const text = [
      "      - uses: actions/checkout@v6",
      "      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0",
      "    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0",
    ].join("\n");

    // Act
    const hits = unpinnedUses(text);

    // Assert
    expect(hits.length).toBe(1);
    expect(hits[0]).toBe("actions/checkout: v6");
  });

  it("every job in every workflow sets job-level permissions", () => {
    // Arrange
    const workflows = readWorkflows();

    // Act
    const missing = workflows.flatMap(({ path, text }) =>
      jobsWithoutPermissions(text).map(job => `${path}: ${job}`),
    );

    // Assert
    expect(missing).toEqual([]);
  });

  it("every action is pinned to a commit SHA", () => {
    // Arrange
    const workflows = readWorkflows();

    // Act
    const hits = workflows.flatMap(({ path, text }) =>
      unpinnedUses(text).map(hit => `${path}: ${hit}`),
    );

    // Assert
    expect(hits).toEqual([]);
  });

  it("an inputs expression inside a run block is reported", () => {
    // Arrange
    const bad = [
      `      - run: echo ${expr("inputs.version")}`,
      "      - run: |",
      `          x=${expr("inputs.dry_run")}`,
    ].join("\n");
    const good = [
      "        env:",
      `          RELEASE_VERSION: ${expr("inputs.version")}`,
      '        run: echo "$RELEASE_VERSION"',
    ].join("\n");

    // Act
    const badHits = runBlocksInterpolatingInputs(bad);
    const goodHits = runBlocksInterpolatingInputs(good);

    // Assert
    expect(badHits.length).toBe(2);
    expect(goodHits).toEqual([]);
  });

  it("a flag outside its conditional is reported", () => {
    // Arrange
    const bad = [
      "args=(--ci --dry-run)",
      'if [[ -n "$RELEASE_VERSION" ]]; then',
      "  args+=(--dry-run)",
      "fi",
    ].join("\n");
    const good = ['if [[ "$DRY_RUN" == "true" ]]; then', "  args+=(--dry-run)", "fi"].join("\n");

    // Act
    const badHits = ungatedFlagLines(bad, "--dry-run", "DRY_RUN");
    const goodHits = ungatedFlagLines(good, "--dry-run", "DRY_RUN");

    // Assert
    expect(badHits.length).toBe(2);
    expect(goodHits).toEqual([]);
  });

  it("an uncommented schedule line is reported", () => {
    // Arrange
    const bad = "on:\n  schedule:\n    - cron: '0 6 * * 1'";
    const good = "on:\n  # schedule:\n  #   - cron: '0 6 * * 1'";

    // Act
    const badHits = uncommentedScheduleLines(bad);
    const goodHits = uncommentedScheduleLines(good);

    // Assert
    expect(badHits.length).toBe(1);
    expect(goodHits).toEqual([]);
  });

  it("rolling release is dispatchable with dry_run boolean and version string inputs", () => {
    // Arrange
    const lines = activeLines(readRollingRelease());

    // Act
    const text = lines.join("\n");

    // Assert
    expect(text).toMatch(/^ {2}workflow_dispatch:/m);
    expect(text).toMatch(/^ {6}dry_run:\n(?: {8}.*\n)*? {8}type: boolean/m);
    expect(text).toMatch(/^ {6}version:\n(?: {8}.*\n)*? {8}type: string/m);
  });

  it("rolling release passes inputs only through env, never a run block", () => {
    // Arrange
    const text = readRollingRelease();

    // Act
    const hits = runBlocksInterpolatingInputs(text);

    // Assert
    expect(hits).toEqual([]);
    expect(text).toContain(`RELEASE_VERSION: ${expr("inputs.version")}`);
    expect(text).toContain(`DRY_RUN: ${expr("inputs.dry_run")}`);
  });

  it("rolling release validates the version before the release step", () => {
    // Arrange
    const text = readRollingRelease();

    // Act
    const ordered = validationPrecedesRelease(text);

    // Assert
    expect(ordered).toBe(true);
  });

  it("rolling release gates --dry-run and --version on their inputs", () => {
    // Arrange
    const text = activeLines(readRollingRelease()).join("\n");

    // Act
    const dryRunHits = ungatedFlagLines(text, "--dry-run", "DRY_RUN");
    const versionHits = ungatedFlagLines(text, "--version", "RELEASE_VERSION");

    // Assert
    expect(text).toContain("--dry-run");
    expect(text).toContain("--version");
    expect(dryRunHits).toEqual([]);
    expect(versionHits).toEqual([]);
  });

  it("rolling release schedule stays commented out", () => {
    // Arrange
    const text = readRollingRelease();

    // Act
    const hits = uncommentedScheduleLines(text);

    // Assert
    expect(hits).toEqual([]);
  });

  it("release verifies the tag only on a tag push", () => {
    // Arrange
    const resolve = jobBlock(readWorkflow("release.yml"), "resolve");

    // Act
    const step = stepContaining(resolve, "verify-release-tag.mjs");

    // Assert
    expect(step).toContain("if: github.event_name == 'push'");
  });

  it("release resolve checks out full history", () => {
    // Arrange
    const resolve = jobBlock(readWorkflow("release.yml"), "resolve");

    // Act
    const step = stepContaining(resolve, "actions/checkout");

    // Assert
    expect(step).toContain("fetch-depth: 0");
  });

  it("release provenance job creates a draft release", () => {
    // Arrange
    const job = jobBlock(readWorkflow("release.yml"), "slsa_provenance");

    // Act and Assert
    expect(job).toContain("draft-release: true");
  });

  it("release publishes the draft with an App token, not the workflow token", () => {
    // Arrange
    const job = jobBlock(readWorkflow("release.yml"), "publish-gh");

    // Act
    const tokenStep = stepContaining(job, "actions/create-github-app-token");
    const releaseStep = stepContaining(job, "softprops/action-gh-release");
    const id = /^\s*id:\s*(\S+)/m.exec(tokenStep)?.[1] ?? "";

    // Assert
    expect(id).not.toBe("");
    expect(releaseStep).toContain(`token: ${expr(`steps.${id}.outputs.token`)}`);
    expect(releaseStep).toContain("draft: false");
  });

  it("publish skips prerelease events for both registries", () => {
    // Arrange
    const text = readWorkflow("publish.yml");

    // Act
    const npm = jobBlock(text, "publish-npm");
    const jsr = jobBlock(text, "publish-jsr");

    // Assert
    expect(/^ {4}if:.*!github\.event\.release\.prerelease/m.test(npm)).toBe(true);
    expect(/^ {4}if:.*!github\.event\.release\.prerelease/m.test(jsr)).toBe(true);
  });
});

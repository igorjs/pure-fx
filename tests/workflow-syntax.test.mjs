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
});

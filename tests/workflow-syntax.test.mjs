// SPDX-License-Identifier: Apache-2.0
/**
 * workflow-syntax.test.mjs - Static checks on .github/workflows/*.yml.
 *
 * Fails when a workflow contains a Terraform-style `$$` escape (for example
 * `$${VAR}`). GitHub Actions does not unescape it, so the shell receives a
 * literal `$$` (the PID) followed by the name, and the step misbehaves.
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
});

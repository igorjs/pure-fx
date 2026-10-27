# Repository setup

The maintainer owns the GitHub and registry settings listed here. Nothing in the repository creates them. They must exist on github.com and the package registries for the workflows to run. Each item names the workflow file that reads it.

## Actions secrets

Repository scope.

- `BOT_APP_CLIENT_ID`: client id of the bot GitHub App. Read by `.github/workflows/auto-update-pr.yml` (the check step and `actions/create-github-app-token`), and by the release workflows once they land.
- `BOT_APP_PRIVATE_KEY`: private key of the same App. Same consumers.
- `BOT_APP_ID`: present today and read by no workflow, because the App token action takes the client id.

The built-in workflow token is provided by GitHub and is not a configured secret.

## Dependabot secrets

A workflow run triggered by Dependabot sees only the Dependabot secret scope. `.github/workflows/auto-update-pr.yml` runs on push to main, and a Dependabot merge is such a push. These secrets also exist in that scope:

- `BOT_APP_CLIENT_ID`
- `BOT_APP_PRIVATE_KEY`

## Environments

| Name | Reviewers | Deployment policy | Used by |
|------|-----------|-------------------|---------|
| `release` | none | tag `v*` | `.github/workflows/release.yml`, job `publish-gh` |
| `npm-publish` | `igorjs` | tag `v*` | `.github/workflows/publish.yml`, job `publish-npm` |
| `jsr-publish` | `igorjs` | tag `v*` | `.github/workflows/publish.yml`, job `publish-jsr` |

The environment URL shown on the release page comes from the `detect` job outputs in `publish.yml`.

## Rulesets

Branch ruleset "Protect default branch" targets the default branch and is active.

- Rules: `deletion`, `non_fast_forward`, `required_signatures`, `pull_request`, `required_status_checks`.
- Required status check: `lint-and-test`, a job in `.github/workflows/ci.yml`. It is the only required check. The browser job runs inside the Playwright container image without harden-runner, which does not support container jobs.
- Pull request rule: one approving review, code owner review required, stale reviews dismissed on push, review threads must be resolved, an extra approval for unattributed changes, squash merge only.
- Bypass actors: the repository Admin role and the bot GitHub App, both always.

Tag ruleset "Protect release tags" covers `refs/tags/v*` and is active.

- Rules: `creation`, `deletion`, `non_fast_forward`.
- Bypass actors: the same two as the branch ruleset. Only the bot App or an admin can create a `v*` tag.

## Code owners

`.github/CODEOWNERS` assigns `*` and `.github/` to `@igorjs`. The code owner review rule in the branch ruleset depends on this file.

## Registries

- npm: `.github/workflows/publish.yml` runs `npm publish --provenance` under the `npm-publish` environment with `id-token: write`. Configure npm Trusted Publishing on npmjs.com for `@igorjs/pure-fx`, pointing at this repository and the `publish.yml` workflow.
- JSR: the same workflow publishes under the `jsr-publish` environment with OIDC. Link the package to this repository on jsr.io using GitHub Actions publishing.

## Before merging a change to a formerly managed file

This repository used to receive its workflow files, `CODEOWNERS`, `.npmrc`, `pnpm-workspace.yaml` and `scripts/release.mjs` from a Terraform module. Before a hand edit to any of those files is merged, confirm Terraform no longer manages them. Otherwise the next apply can overwrite the edit.

The check is a `terraform plan` for this repository that shows zero `github_repository_file` changes, while the repository, ruleset, environment and secret resources are unchanged. Three things to handle on the Terraform side:

- Removing state alone is not enough. The file resources overwrite on create and their manage flags default to true. The next plan recreates the files. `.npmrc` has no flag.
- The publish flag also owns the `npm-publish` and `jsr-publish` environments.
- Deleting the module block can destroy the rulesets.

## Release signing check

The rolling release (`node scripts/release.mjs --ci`) creates the release commit and tag through the Git Data API, so GitHub signs them for the App. Confirm that works before turning it on:

1. In a scratch repository, add a branch ruleset with `required_signatures` and the App as a bypass actor. Mint an installation token with `contents: write`.
2. Create a commit with `POST /repos/{owner}/{repo}/git/blobs`, `/git/trees` and `/git/commits` (send no `signature` field), then `PATCH /git/refs/heads/main`.
3. Call `GET /repos/{owner}/{repo}/commits/{sha}`. `commit.verification.verified` must be `true`.
4. Create an annotated tag with `POST /git/tags`, then `POST /git/refs` for `refs/tags/vX`. Call `GET /git/tags/{sha}`. `verification.verified` must be `true`.

If either check is `false`, do not enable the rolling release. Switch to a release PR with auto-merge instead. The rolling release stays off until both checks pass.

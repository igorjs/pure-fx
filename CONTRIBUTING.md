# Contributing to Pure TS

Thank you for your interest in contributing. This document explains the process and requirements.

## Before You Start

1. **Check existing issues** to see if someone is already working on what you want to change.
2. **Open an issue first** for significant changes (new modules, API changes, architecture). Small fixes and documentation improvements can go straight to a PR.
3. **Read the [Code of Conduct](CODE_OF_CONDUCT.md)** if one exists.

## Requirements

Every contribution must satisfy two legal requirements:

### 1. Developer Certificate of Origin (DCO)

All commits must include a `Signed-off-by` trailer certifying that you have the right to submit the code. Add it with:

```bash
git commit --signoff -m "your commit message"
```

This adds a line like:

```
Signed-off-by: Your Name <your@email.com>
```

The DCO bot will check every commit in your PR. If any commit is missing the trailer, the bot will comment with instructions.

### 2. Contributor License Agreement (CLA)

First-time contributors must sign a CLA. This grants the project a license to use your contribution and protects both you and the project.

**Individual contributors:** Sign the [Individual CLA](.github/CLA.md) by commenting on your first PR with:

```
I have read the CLA Document and I hereby sign the CLA.
```

The CLA bot will record your signature automatically. You only need to do this once across all repositories maintained by igorjs.

**Corporate contributors:** If you are contributing on behalf of your employer, your organisation must sign the [Corporate CLA](.github/CCLA.md). Email the signed document to oss@mail.igorjs.io. Individual employees listed as Designated Employees do not need to sign the Individual CLA separately.

## Development

### Setup

```bash
git clone https://github.com/igorjs/pure-ts.git
cd pure-ts
pnpm install
```

### Workflow

```bash
pnpm run lint       # biome check
pnpm run check      # type-check (tsgo)
pnpm run build      # build to dist/
pnpm test           # unit tests (node --test)
pnpm run test:types # type-level tests
```

### Pre-commit and Pre-push Hooks

The repository has git hooks that run automatically:

- **Pre-commit:** Adds SPDX license headers to new `.ts` files if missing.
- **Pre-push:** Runs license header check, lint, type-check, build, and tests. Push is blocked if any check fails.

### Code Style

- All source files must start with `// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0`
- Follow existing patterns: public interfaces, private impl classes, const/type merge for namespaces
- Use `Result` and `Option` instead of exceptions
- Zero runtime dependencies. Always.
- All new modules must work on Node, Deno, and Bun. Runtime-specific code goes in adapters.

### Tests

- Unit tests use `node:test` and live in `tests/`
- Integration tests are runtime-agnostic `.mjs` files that run on Node, Deno, Bun, Workers, and Browser
- New features need both unit tests and integration test coverage
- Run `node tests/integration-web.mjs` and `deno run --allow-all tests/integration-web.mjs` to verify cross-runtime compatibility

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add Validation module
fix(runtime): wire up Deno memoryUsage
docs: update FFI troubleshooting guide
test: add HashMap integration tests
```

Always sign commits: `git commit --signoff --gpg-sign`

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your changes with tests.
3. Ensure all checks pass: `pnpm run lint && pnpm run check && pnpm run build && pnpm test`
4. Sign the CLA (first-time only).
5. Submit a PR with a clear description of what and why.
6. Address review feedback.

## Reporting Bugs

Open a GitHub issue with:
- Runtime and version (Node 24, Deno 2.7, etc.)
- Minimal reproduction code
- Expected vs actual behavior
- Error messages (full stack trace)

## Security Vulnerabilities

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE), subject to the terms of the [CLA](.github/CLA.md).

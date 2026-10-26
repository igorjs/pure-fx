# CLI example

`notes-cli.mjs` formats a note. It is built on `Program`, with `Schema` validating the input and
`Result` carrying the outcome.

```sh
pnpm run build
node examples/cli/notes-cli.mjs add "buy milk" --tag home    # [home] buy milk
bun examples/cli/notes-cli.mjs add                           # error on stderr
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| 0 | Success, the note is printed on stdout. |
| 2 | User error such as a missing title or unknown command (`USER_ERROR_EXIT_CODE`), message on stderr. |
| 1 | Unexpected thrown error, the code `Program` uses for defects. Set `NOTES_CLI_CRASH=1` to see it. |

The CLI calls `Program.execute()` and owns the exit codes, because `run()` can only exit 0 or 1
and logs lifecycle lines.

## Test

```sh
pnpm run test:examples
```

Runs the CLI on Node and on Bun and asserts each exit code and an output line. A missing runtime
is skipped locally and fails the run with `--ci` or `CI=1`.

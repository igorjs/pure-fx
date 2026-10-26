// SPDX-License-Identifier: Apache-2.0
/**
 * Notes formatter CLI built on Program, Schema, Result and Task.
 *
 * Usage: node examples/cli/notes-cli.mjs add <title> [--tag <tag>]
 *   exit 0  prints the formatted note
 *   exit 2  bad arguments (USER_ERROR_EXIT_CODE), message on stderr
 *   exit 1  unexpected failure, the code Program uses for defects
 * Set NOTES_CLI_CRASH=1 to trigger an unexpected failure.
 */

import { Err, ErrType, Program, Schema, Task } from "@igorjs/pure-fx";

const USER_ERROR_EXIT_CODE = 2;
const DEFECT_EXIT_CODE = 1;

const UsageError = ErrType("UsageError", "USAGE_ERROR");

const NoteInput = Schema.object({
  title: Schema.string.refine(s => s.trim().length > 0, "non-empty title"),
  tag: Schema.string.default("general"),
});

/** Turn argv into the raw object the schema validates. */
const parseArgs = argv => {
  const [command, title, ...rest] = argv;
  if (command !== "add") return { command, title: undefined };
  const flag = rest.indexOf("--tag");
  return { command, title, tag: flag === -1 ? undefined : rest[flag + 1] };
};

const run = argv =>
  Task(async () => {
    if (process.env.NOTES_CLI_CRASH === "1") throw new Error("crash requested");
    const { command, ...raw } = parseArgs(argv);
    if (command !== "add") {
      return Err(UsageError(`unknown command "${command ?? ""}", expected: add <title>`));
    }
    return NoteInput.parse(raw)
      .map(note => `[${note.tag}] ${note.title.trim()}`)
      .mapErr(e =>
        UsageError(`${e.path.join(".") || "input"}: expected ${e.expected}, got ${e.received}`),
      );
  });

const main = Program("notes-cli", () => run(process.argv.slice(2)));

try {
  const result = await main.execute();
  result.match({
    Ok: line => {
      console.log(line);
      process.exit(0);
    },
    Err: error => {
      console.error(`error: ${error.message}`);
      process.exit(USER_ERROR_EXIT_CODE);
    },
  });
} catch (unexpected) {
  console.error(`unexpected error: ${unexpected.message}`);
  process.exit(DEFECT_EXIT_CODE);
}

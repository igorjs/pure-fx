// SPDX-License-Identifier: Apache-2.0
/** Command against a missing binary. Needs a process runtime. */
export async function run(lib, t) {
  t.section("Command");
  if (!t.env.spawn) {
    t.skip("spawn a missing binary", `not applicable on ${t.env.runtime}: no child processes`);
    return;
  }
  const missing = `pure-fx-missing-${Math.random().toString(36).slice(2)}`;
  const result = await lib.Command.spawn(missing, [], { capture: true }).run();
  t.check(result.isErr, "spawning a missing binary returns Err");
}

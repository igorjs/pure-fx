import { Program, Task } from "../../dist/index.js";

await Program(
  "test",
  Task.fromPromise(() => Promise.reject("silent-fail"), String),
  { silent: true },
).run();

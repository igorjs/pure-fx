// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

import { Program, Task } from "../../dist/index.js";

// Task never resolves (ignores abort) - only exits via double-signal force kill
await Program(
  "test",
  Task.fromPromise(
    () =>
      new Promise(resolve => {
        setTimeout(() => resolve("timeout"), 60_000);
      }),
  ),
).run();

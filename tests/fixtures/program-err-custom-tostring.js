// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

import { Err, Program, Task } from "../../dist/index.js";

const custom = {
  toString() {
    return "CustomErr";
  },
};
await Program("test", Task.fromResult(Err(custom))).run();

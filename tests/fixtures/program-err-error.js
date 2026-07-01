// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

import { Err, Program, Task } from "../../dist/index.js";

await Program("test", Task.fromResult(Err(new Error("boom")))).run();

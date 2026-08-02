// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

import { Program, Task } from "../../dist/index.js";

await Program("test", Task.of(42)).run();

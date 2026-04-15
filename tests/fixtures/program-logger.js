import { Logger, Program, Task } from "../../dist/index.js";

const log = Logger.create({ name: "custom", sink: Logger.json });
await Program("test", Task.of(42), { logger: log }).run();

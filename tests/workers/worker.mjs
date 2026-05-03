/**
 * Worker wrapper for running smoke-core tests inside miniflare.
 *
 * Miniflare runs this as a CF Worker module. The smoke test is inlined
 * via the bundled dist/ output. Results are returned as JSON via fetch.
 */

import * as lib from "../../dist/index.js";
import { runSmokeCore } from "../smoke-core.mjs";

// biome-ignore lint/style/noDefaultExport: CF Workers require export default
export default {
  async fetch() {
    const { passed, failed, logs } = await runSmokeCore(lib);
    return new Response(JSON.stringify({ passed, failed, logs }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};

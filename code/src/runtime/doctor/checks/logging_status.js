"use strict";

// Logging infrastructure Doctor check.
// Verifies that the logs/ directory exists and is accessible.
// log_writer.js creates it lazily on first write, so WARN on fresh install
// is expected before the first log write occurs.
// Read-only: existence check via L2 fs.exists.

module.exports = {
  id: "logging_status",
  description: "Checks logs/ directory presence: WARN if missing, PASS if present",

  async fn(ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    // Path A: lazy require to avoid circular dependency at module load time.
    const { getDefaultRegistry } = require("../../tools/_registry");
    const reg = getDefaultRegistry();

    const result = await reg.invoke("fs.exists", { path: "logs" }, { root });

    if (result.status !== "SUCCESS") {
      return {
        status: "WARN",
        detail: "could not check logs/ directory — fs.exists failed: " +
                (result.error || "unknown error")
      };
    }

    if (!result.output.exists) {
      return {
        status: "WARN",
        detail: "logs/ directory not yet created — will be initialized on first log write"
      };
    }

    if (result.output.type !== "dir") {
      return {
        status: "WARN",
        detail: "logs/ path exists but is not a directory — check manually"
      };
    }

    return { status: "PASS", detail: "logs/ directory present" };
  }
};

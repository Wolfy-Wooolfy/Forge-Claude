"use strict";

// Metrics window Doctor check.
// Verifies that runtime_health.metrics_window_24h is present in
// progress/status.json with all 7 required fields.
// WARN if block absent (boot hook hasn't run yet) or fields missing.
// PASS once the API server has started once and ensureMetricsWindow24h()
// populated the block.
// Read-only: status.json read via L2 fs.read_file.

const REQUIRED_FIELDS = [
  "window_start_ts",
  "api_requests_total",
  "api_errors_total",
  "provider_calls_total",
  "provider_cost_usd",
  "backup_last_created_ts",
  "backup_last_verified_ts"
];

module.exports = {
  id: "metrics_available",
  description: "Checks runtime_health.metrics_window_24h in status.json: WARN if absent or incomplete",

  async fn(ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    // Path A: lazy require to avoid circular dependency at module load time.
    const { getDefaultRegistry } = require("../../tools/_registry");
    const reg = getDefaultRegistry();

    const result = await reg.invoke(
      "fs.read_file",
      { path: "progress/status.json" },
      { root }
    );

    if (result.status !== "SUCCESS") {
      return {
        status: "WARN",
        detail: "progress/status.json unreadable — metrics window unavailable"
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(result.output.content);
    } catch (_) {
      return {
        status: "WARN",
        detail: "progress/status.json parse error — metrics window unavailable"
      };
    }

    const w = parsed && parsed.runtime_health && parsed.runtime_health.metrics_window_24h;

    if (!w || typeof w !== "object") {
      return {
        status: "WARN",
        detail: "metrics_window_24h not initialized — start the API server once to populate"
      };
    }

    const missing = REQUIRED_FIELDS.filter((f) => !(f in w));
    if (missing.length > 0) {
      return {
        status: "WARN",
        detail: "metrics_window_24h present but missing fields: " + missing.join(", ")
      };
    }

    return {
      status: "PASS",
      detail: "metrics_window_24h initialized (window_start: " + (w.window_start_ts || "unknown") + ")"
    };
  }
};

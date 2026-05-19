"use strict";

// Metrics boot hook — initializes runtime_health.metrics_window_24h in
// progress/status.json if the block is absent (additive, idempotent).
//
// Direct fs.readFileSync + fs.writeFileSync follows the established
// runDoctor.js._patchStatusRuntimeHealth codebase pattern for status.json
// updates. NOT covered by §ARC-6 (which scopes to log_writer.js only).
// Justified by precedent — status.json updates throughout the codebase use
// this direct-fs pattern (see runDoctor.js lines 96-108).

const fs   = require("fs");
const path = require("path");

const DEFAULT_METRICS_WINDOW = {
  window_start_ts:       null,   // set to current ISO string on initialization
  api_requests_total:    0,
  api_errors_total:      0,
  provider_calls_total:  0,
  provider_cost_usd:     0.0,
  backup_last_created_ts: null,
  backup_last_verified_ts: null
};

/**
 * Ensure progress/status.json has runtime_health.metrics_window_24h.
 * If the block already exists (subsequent boots), leaves it unchanged.
 * Called from createWorkspaceApiServer().start() before server.listen().
 */
function ensureMetricsWindow24h({ root }) {
  const statusPath = path.join(path.resolve(root || process.cwd()), "progress", "status.json");

  let cur;
  try {
    cur = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch (_) {
    return;  // status.json missing or malformed — best-effort, do not throw
  }

  const health = cur.runtime_health || {};

  // Idempotent: only initialize if the block is missing
  if (health.metrics_window_24h && typeof health.metrics_window_24h === "object") {
    return;
  }

  cur.runtime_health = Object.assign({}, health, {
    metrics_window_24h: Object.assign({}, DEFAULT_METRICS_WINDOW, {
      window_start_ts: new Date().toISOString()
    })
  });

  try {
    fs.writeFileSync(statusPath, JSON.stringify(cur, null, 2) + "\n", "utf8");
  } catch (_) {
    // best-effort — boot hook failure must never crash the API server
  }
}

module.exports = { ensureMetricsWindow24h };

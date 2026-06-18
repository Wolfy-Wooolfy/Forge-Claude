"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Writes a loopback signal to <projectRoot>/forge_tests/loopback_signal.json.
 * Used by the orchestrator to detect harness completion and trigger next steps.
 *
 * §ARC-10 Exception: fs.writeFileSync / fs.mkdirSync permitted here — built-project
 * harness writer to the EXTERNAL project root (<projectRoot>/forge_tests/), which the
 * Forge-scoped L2 fs tools / L3 policy cannot target. See
 * docs/10_runtime/18_AGENT_ROLES_CONTRACT.md §ARC-10.
 *
 * @param {object} summary   Output of verdict_aggregator.aggregate().summary
 * @param {string} projectRoot  Absolute path to project root.
 * @returns {{ signal_path: string }}
 */
function emit(summary, projectRoot) {
  const signal = {
    emitted_at: new Date().toISOString(),
    overall_status: summary.overall_status,
    total: summary.total,
    pass: summary.pass,
    fail: summary.fail,
    error: summary.error,
    failed_ids: summary.scenarios
      .filter((s) => s.status !== "PASS")
      .map((s) => s.id),
  };

  const signalDir = path.join(projectRoot, "forge_tests");
  if (!fs.existsSync(signalDir)) {
    fs.mkdirSync(signalDir, { recursive: true });
  }

  const signalPath = path.join(signalDir, "loopback_signal.json");
  fs.writeFileSync(signalPath, JSON.stringify(signal, null, 2), "utf8");

  return { signal_path: signalPath };
}

module.exports = { emit };

"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Aggregates individual scenario results into a summary report and writes it
 * to <projectRoot>/forge_tests/last_report.json.
 *
 * §ARC-10 Exception: fs.writeFileSync / fs.mkdirSync permitted here — built-project
 * harness writer to the EXTERNAL project root (<projectRoot>/forge_tests/), which the
 * Forge-scoped L2 fs tools / L3 policy cannot target. See
 * docs/10_runtime/18_AGENT_ROLES_CONTRACT.md §ARC-10.
 *
 * @param {object[]} results   Array of runScenario() return values.
 * @param {string}   projectRoot  Absolute path to project root.
 * @returns {{ summary: object, report_path: string }}
 */
function aggregate(results, projectRoot) {
  const pass   = results.filter((r) => r.status === "PASS").length;
  const fail   = results.filter((r) => r.status === "FAIL").length;
  const error  = results.filter((r) => r.status === "ERROR").length;
  const total  = results.length;

  const overallStatus = fail === 0 && error === 0 ? "PASS" : "FAIL";

  const summary = {
    total,
    pass,
    fail,
    error,
    overall_status: overallStatus,
    ran_at: new Date().toISOString(),
    scenarios: results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      duration_ms: r.duration_ms,
      assertions: r.assertions || [],
      error: r.error || null,
    })),
  };

  const reportDir = path.join(projectRoot, "forge_tests");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, "last_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");

  return { summary, report_path: reportPath };
}

module.exports = { aggregate };

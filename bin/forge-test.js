#!/usr/bin/env node
"use strict";

const path = require("path");
const fs   = require("fs");

// Load .env from project root (mirrors forge-doctor.js behaviour)
;(function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) { /* best-effort */ }
}());

const ROOT = path.resolve(__dirname, "..");

const { runScenarios } = require(
  path.join(ROOT, "code", "src", "testing", "scenario_runner")
);

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function _parseArgs(argv) {
  const args = argv.slice(2);
  const scenarios = [];
  let i = 0;
  while (i < args.length) {
    if ((args[i] === "--scenario" || args[i] === "-s") && args[i + 1]) {
      scenarios.push(args[i + 1]);
      i += 2;
    } else {
      i++;
    }
  }
  return { scenarios: scenarios.length > 0 ? scenarios : null };
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const { scenarios } = _parseArgs(process.argv);

    console.log("\n── Forge Self-Test Harness ──────────────────────────────────────\n");

    const report = await runScenarios({ root: ROOT, scenarios });

    for (const s of report.scenarios) {
      const icon = s.status === "PASS" ? "✓" : s.status === "SKIP" ? "○" : "✗";
      const line = "  " + icon + "  " + s.id.padEnd(6) + " " + s.name;
      console.log(line);

      if (s.skip_reason) {
        console.log("         skip: " + s.skip_reason);
      }

      if (s.error) {
        console.error("         error: " + s.error);
      }

      for (const a of (s.assertions || [])) {
        if (!a.passed) {
          console.error("         FAIL assertion [" + a.type + "]: " + a.detail);
        }
      }
    }

    console.log("\n─────────────────────────────────────────────────────────────────");
    const ok = report.ok ? "ALL PASS" : "FAILURES DETECTED";
    console.log(ok + " — " + report.summary);
    console.log("duration: " + report.duration_ms + "ms\n");

    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    console.error("forge-test crashed:", err);
    process.exit(2);
  }
})();

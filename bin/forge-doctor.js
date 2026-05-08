#!/usr/bin/env node
"use strict";

const path = require("path");
const fs   = require("fs");

// Load .env from project root into process.env (no dotenv dependency needed)
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

const { runDoctor } = require(path.join(__dirname, "..", "code", "src", "runtime", "doctor", "runDoctor"));

(async () => {
  try {
    const report = await runDoctor({ root: path.resolve(__dirname, "..") });

    const status = report.ok ? "✓ HEALTHY" : "✗ ISSUES";
    console.log("\n" + status + " — " + report.summary + "\n");

    for (const c of report.checks) {
      const icon = c.status === "PASS" ? "✓" : c.status === "WARN" ? "⚠" : "✗";
      console.log("  " + icon + "  " + c.id.padEnd(28) + " " + c.detail);
    }

    console.log("\n  duration: " + report.duration_ms + "ms");
    if (report.report_path) console.log("  report:   " + report.report_path);
    console.log("");

    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    console.error("Doctor crashed:", err);
    process.exit(2);
  }
})();

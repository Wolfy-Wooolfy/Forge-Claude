#!/usr/bin/env node
"use strict";

/**
 * bin/forge-live-smoke.js
 * CLI for running live smoke tests against real LLM providers.
 *
 * Usage:
 *   node bin/forge-live-smoke.js [--provider openai] [--model gpt-4o-mini] [--dry-run]
 *
 * Options:
 *   --provider <id>   Provider to use (default: openai)
 *   --model <id>      Model to use (default: gpt-4o-mini)
 *   --dry-run         Show probe plan without making real API calls
 *   --help            Show this help
 *
 * Cost cap: $7.00 hard / $5.00 soft warn
 * Results saved to: artifacts/live_smoke/<timestamp>.json
 */

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..");

// Load API key from .env if not already in environment
function _loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!process.env.OPENAI_API_KEY && fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^OPENAI_API_KEY=(.+)/);
      if (m) { process.env.OPENAI_API_KEY = m[1].trim(); break; }
    }
  }
}

// Ensure live_smoke project vision exists (vision_locked: true for non-mock providers)
function _ensureVision() {
  const visionDir  = path.join(ROOT, "artifacts", "projects", "live_smoke");
  const visionPath = path.join(visionDir, "vision.md");
  if (!fs.existsSync(visionPath)) {
    fs.mkdirSync(visionDir, { recursive: true });
    fs.writeFileSync(visionPath, [
      "---",
      "project_id: live_smoke",
      "project_name: Live Smoke Test",
      "domain: test",
      "vision_version: 1",
      "vision_locked: true",
      "amendments_history: []",
      "goals:",
      "  primary: live smoke test",
      "  secondary: []",
      "constraints: []",
      "non_goals: []",
      "---",
      "",
      "# Live Smoke Test Vision"
    ].join("\n"), "utf8");
  }
}

_loadEnv();
_ensureVision();
// Live smoke requires TEST mode: auto-approves role.invoke and agent.invoke calls
// while still routing to real LLM providers
if (!process.env.FORGE_PERMISSION_MODE) {
  process.env.FORGE_PERMISSION_MODE = "TEST";
}

function parseArgs(argv) {
  const args = { provider: "openai", model: "gpt-4o-mini", dry_run: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider" && argv[i + 1]) { args.provider = argv[++i]; }
    else if (argv[i] === "--model"    && argv[i + 1]) { args.model    = argv[++i]; }
    else if (argv[i] === "--dry-run") { args.dry_run = true; }
    else if (argv[i] === "--help") {
      console.log(module.exports.__doc__ || "");
      process.exit(0);
    }
  }
  return args;
}

function colWidth(str, w) {
  return String(str).padEnd(w).slice(0, w);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  const { runLiveSmoke, ROLE_PROBES, HARD_CAP_USD, SOFT_WARN_USD } = require(
    path.join(ROOT, "code", "src", "runtime", "live_smoke_runner")
  );

  console.log("\n── Forge Live Smoke Test ─────────────────────────────────────────");
  console.log("  Provider  :", args.provider);
  console.log("  Model     :", args.model);
  console.log("  Hard cap  : $" + HARD_CAP_USD.toFixed(2));
  console.log("  Soft warn : $" + SOFT_WARN_USD.toFixed(2));
  if (args.dry_run) console.log("  Mode      : DRY RUN (no real API calls)");
  console.log("  Roles     :", ROLE_PROBES.map(p => p.role_id).join(", "));
  console.log("");

  let completed = 0;
  function onProgress(ev) {
    completed++;
    const rolePad  = colWidth(ev.role_id, 18);
    const statusPad = colWidth(ev.status || "...", 10);
    const costStr  = ev.cost_usd != null ? ("$" + ev.cost_usd.toFixed(4)).padStart(9) : "         ";
    const totalStr = ev.totalCost != null ? " | running total: $" + ev.totalCost.toFixed(4) : "";

    if (ev.warning === "SOFT_CAP_WARN") {
      console.log("  WARN  Budget soft cap ($" + SOFT_WARN_USD.toFixed(2) + ") reached — continuing to hard cap");
    }

    if (ev.status === "SKIPPED") {
      console.log("  SKIP  " + rolePad + " HARD_CAP_REACHED");
      return;
    }
    if (ev.status === "DRY_RUN") {
      console.log("  DRY   " + rolePad);
      return;
    }

    const valid = ev.assessment && ev.assessment.valid;
    const icon  = ev.status === "SUCCESS" && valid ? "  ✓" : "  ✗";
    const note  = ev.assessment ? " [" + ev.assessment.note + "]" : "";
    console.log(icon + "   " + rolePad + statusPad + costStr + totalStr + note);
  }

  let report;
  try {
    report = await runLiveSmoke({
      root:       ROOT,
      provider:   args.provider,
      model:      args.model,
      dry_run:    args.dry_run,
      onProgress
    });
  } catch (err) {
    console.error("\nFATAL: live smoke runner threw:", err.message);
    process.exit(2);
  }

  const { summary } = report;
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("  Total roles  :", summary.total);
  console.log("  PASS         :", summary.pass);
  console.log("  FAIL         :", summary.fail);
  console.log("  SKIPPED/DRY  :", summary.skipped);
  console.log("  Total cost   : $" + report.total_cost_usd.toFixed(4));
  if (report._saved_to) console.log("  Report saved :", report._saved_to);

  if (summary.fail > 0) {
    console.error("\nLIVE SMOKE FAILED: " + summary.fail + " role(s) did not pass");
    process.exit(1);
  } else if (args.dry_run) {
    console.log("\nDRY RUN complete — no API calls made");
    process.exit(0);
  } else {
    console.log("\nLIVE SMOKE PASSED");
    process.exit(0);
  }
})().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(2);
});

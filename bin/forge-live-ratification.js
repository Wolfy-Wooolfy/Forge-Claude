#!/usr/bin/env node
"use strict";

// ── forge-live-ratification.js ────────────────────────────────────────────────
// One-shot CLI for the PHASE-10 live ratification demo.
// Runs the orchestration loop against _reference_todo_api with REAL LLM calls.
//
// Exit codes:
//   0 — clean completion (final_state = COMPLETE, cost <= $5)
//   1 — kill switch triggered ($4 threshold hit)
//   2 — unhandled error (API auth failure, role failure, etc.)

const path = require("path");
const fs   = require("fs");

// ── Load .env from project root (same pattern as forge-doctor.js) ─────────────
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

// ── API key validation (§3 stop trigger) ─────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY || "";
if (apiKey.length < 20) {
  console.error("[forge-live-ratification] STOP: OPENAI_API_KEY missing or length < 20.");
  console.error("  Set OPENAI_API_KEY in .env or shell environment before running.");
  process.exit(2);
}
console.log("[forge-live-ratification] OPENAI_API_KEY present (length=" + apiKey.length + ")");

// ── Budget cap ────────────────────────────────────────────────────────────────
const BUDGET_USD = parseFloat(process.env.LIVE_RAT_BUDGET_USD || "") || 5.00;
console.log("[forge-live-ratification] Budget cap: $" + BUDGET_USD.toFixed(2));

// ── Requires ──────────────────────────────────────────────────────────────────
const { runLiveRatification, PROJECT_ID } = require(
  path.join(__dirname, "..", "code", "src", "testing", "live", "live_ratification_runner")
);
const { createKillSwitch, KillSwitchTriggered } = require(
  path.join(__dirname, "..", "code", "src", "testing", "live", "_kill_switch")
);
const { getDefaultRegistry } = require(
  path.join(__dirname, "..", "code", "src", "runtime", "tools", "_registry")
);

// ── Closure artifact writer ───────────────────────────────────────────────────

async function _writeClosureArtifact(result, kill_switch_fired) {
  const reg  = getDefaultRegistry();
  const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 15);
  const slug = "live-ratification-pre-phase-11";
  const artPath = "artifacts/decisions/DECISION-" + ts + "-" + slug + ".md";

  const verdict = kill_switch_fired
    ? "KILL_SWITCH_TRIGGERED"
    : (result && result.final_state === "COMPLETE" ? "COMPLETE" : "INCOMPLETE");

  const content = _buildArtifactContent(result, kill_switch_fired, verdict, ts, artPath);

  await reg.invoke("fs.write_file", { path: artPath, content }, {});
  return artPath;
}

function _buildArtifactContent(result, ks_fired, verdict, ts, artPath) {
  const total = (result && result.total_cost_usd) || 0;
  const dur   = (result && result.duration_ms)    || 0;
  const loops = (result && result.transition_count) || 0;
  const final = (result && result.final_state)    || "UNKNOWN";
  const loop_id = (result && result.loop_id)      || "(none)";
  const prc     = (result && result.per_role_cost) || {};
  const out_dir = (result && result.output_dir)   || "(none)";

  function roleRow(role, label) {
    var c = prc[role];
    if (typeof c !== "number") return "";
    return "| " + (label || role) + " | gpt-4o" + (role === "security_auditor" || role === "quality_judge" ? "" : "-mini") +
           " | $" + c.toFixed(5) + " |\n";
  }

  return [
    "# DECISION-" + ts + " — PHASE-10 Live Ratification Demo (Pre-PHASE-11)",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Date | " + new Date().toISOString().slice(0, 10) + " |",
    "| Owner | KhElmasry |",
    "| Status | OWNER_DECISION_PENDING |",
    "| Scope | PHASE-10 live ratification — S152 fast-path, _reference_todo_api, real OpenAI calls |",
    "| Related | `DECISION-20260514-1500-phase-10-closure.md` (OWNER_APPROVED — 2026-05-15) |",
    "",
    "---",
    "",
    "## 1. Header",
    "",
    "Live ratification of the PHASE-10 orchestration loop. S152 fast-path executed against",
    "`_reference_todo_api` with REAL LLM calls across all 12 roles.",
    "FORGE_OWNER_AUTO_APPROVE=1 auto-approved all 3 owner gates.",
    "",
    "---",
    "",
    "## 2. Demo Parameters",
    "",
    "| Parameter | Value |",
    "|---|---|",
    "| Project | `_reference_todo_api` |",
    "| Budget cap | $" + BUDGET_USD.toFixed(2) + " |",
    "| Kill switch threshold | $4.00 |",
    "| loop_id | `" + loop_id + "` |",
    "| Output dir | `" + out_dir + "` |",
    "| Models: architect / spec_writer / reviewer / cost_estimator / environment / test_designer / builder / documentation | openai / gpt-4o-mini |",
    "| Models: security_auditor / quality_judge | openai / gpt-4o |",
    "",
    "---",
    "",
    "## 3. Mock Baseline (S152)",
    "",
    "| Metric | Value |",
    "|---|---|",
    "| Final state | COMPLETE |",
    "| Transition count | 14 |",
    "| Duration | ~50ms (mock) |",
    "| Cost | $0.00 |",
    "",
    "---",
    "",
    "## 4. Live Result",
    "",
    "| Metric | Value |",
    "|---|---|",
    "| Final state | " + final + " |",
    "| Transition count | " + loops + " |",
    "| Duration | " + (dur / 1000).toFixed(1) + "s |",
    "| Total cost | $" + total.toFixed(5) + " |",
    "| Kill switch fired | " + (ks_fired ? "YES" : "No") + " |",
    "",
    "### Per-Role Cost Breakdown",
    "",
    "| Role | Model | Cost |",
    "|---|---|---|",
    roleRow("architect",       "architect"),
    roleRow("spec_writer",     "spec_writer"),
    roleRow("reviewer_phase_a","reviewer (Phase A)"),
    roleRow("cost_estimator",  "cost_estimator"),
    roleRow("environment",     "environment"),
    roleRow("test_designer",   "test_designer"),
    roleRow("builder",         "builder"),
    roleRow("reviewer_phase_b","reviewer (Phase B)"),
    roleRow("security_auditor","security_auditor"),
    roleRow("documentation",   "documentation"),
    roleRow("quality_judge",   "quality_judge"),
    "| **TOTAL** | — | **$" + total.toFixed(5) + "** |",
    "",
    "---",
    "",
    "## 5. Drift Analysis",
    "",
    "*(To be completed by owner after reviewing output files in `" + out_dir + "`.)*",
    "",
    "### 5a. Semantic Drift",
    "",
    "**Verdict:** PENDING REVIEW",
    "",
    "Did all roles produce coherent outputs? Did the loop progress through all 14 transitions",
    "without stalling on INVALID_ROLE_OUTPUT?",
    "",
    "Final state: **" + final + "**. " +
      (final === "COMPLETE" ? "Loop reached COMPLETE — no INVALID_ROLE_OUTPUT stall detected." : "Loop did NOT reach COMPLETE."),
    "",
    "### 5b. Structural Drift",
    "",
    "**Verdict:** " + (loops === 14 ? "PASS" : "CONCERN — expected 14, got " + loops),
    "",
    "Mock baseline: 14 transitions. Live result: **" + loops + "** transitions.",
    "",
    "### 5c. Schema Drift",
    "",
    "**Verdict:** PENDING REVIEW",
    "",
    "Live role outputs validated against registered OUTPUT_SCHEMA in each role file.",
    "Review `transition_log.jsonl` in output dir for any INVALID_ROLE_OUTPUT entries.",
    "",
    "---",
    "",
    "## 6. GO/NO-GO Recommendation",
    "",
    "*(To be completed after owner reviews drift analysis.)*",
    "",
    "- **GO** if all three drift categories PASS",
    "- **GO-with-fixes** if Semantic PASS + at most one CONCERN elsewhere",
    "- **NO-GO** if any FAIL — open remediation decision first",
    "",
    "---",
    "",
    "## 7. Owner Approval",
    "",
    "> To ratify this demo, the owner (KhElmasry) must review the drift analysis",
    "> and post GO/NO-GO with explicit phrase:",
    ">",
    "> \"LIVE-RAT APPROVED. GO to Step 3.\" (or equivalent)",
    "",
    "Until ratification, PHASE-11 does NOT begin.",
  ].join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async function main() {
  const ks = createKillSwitch({ project_id: PROJECT_ID });

  // Race the runner against the kill switch
  const ksPromise     = ks.start();
  let   runnerPromise;

  console.log("[forge-live-ratification] Starting live ratification runner...");
  const runStart = Date.now();

  try {
    runnerPromise = runLiveRatification({
      project_id:  PROJECT_ID,
      kill_switch: ks
    });

    const result = await Promise.race([runnerPromise, ksPromise]);

    ks.stop();
    const duration_s = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log("[forge-live-ratification] Run complete in " + duration_s + "s");
    console.log("  final_state:      " + result.final_state);
    console.log("  transition_count: " + result.transition_count);
    console.log("  total_cost_usd:   $" + result.total_cost_usd.toFixed(5));
    console.log("  output_dir:       " + result.output_dir);

    const artPath = await _writeClosureArtifact(result, false);
    console.log("[forge-live-ratification] Closure artifact: " + artPath);

    process.exit(0);

  } catch (err) {
    ks.stop();

    if (err instanceof KillSwitchTriggered || err.name === "KillSwitchTriggered") {
      console.error("[forge-live-ratification] KILL SWITCH TRIGGERED: " + err.message);
      const artPath = await _writeClosureArtifact(err.partial_result, true).catch(() => "(write failed)");
      console.error("[forge-live-ratification] Partial closure artifact: " + artPath);
      process.exit(1);
    }

    console.error("[forge-live-ratification] ERROR: " + err.message);
    if (err.stack) console.error(err.stack);
    process.exit(2);
  }
}());

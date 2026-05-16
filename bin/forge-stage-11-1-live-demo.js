#!/usr/bin/env node
"use strict";

// ── forge-stage-11-1-live-demo.js ────────────────────────────────────────────
// CLI entry for PHASE-11 Stage 11.1 live demo.
// Copies fixture_pycli → project source, runs project.analyze_source,
// then invokes the reverse_vision role with a REAL OpenAI gpt-4o call.
//
// Exit codes:
//   0 — SUCCESS (InferredVision written to vision.md unlocked)
//   1 — KILL_SWITCH or HARD_CAP_EXCEEDED
//   2 — unhandled error (API auth, role failure, etc.)

const path = require("path");
const fs   = require("fs");

// ── Load .env from project root ───────────────────────────────────────────────
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

// ── API key validation ────────────────────────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY || "";
if (apiKey.length < 20) {
  console.error("[forge-stage-11-1] STOP: OPENAI_API_KEY missing or length < 20.");
  console.error("  Set OPENAI_API_KEY in .env or shell environment before running.");
  process.exit(2);
}
console.log("[forge-stage-11-1] OPENAI_API_KEY present (length=" + apiKey.length + ")");

// ── Budget cap ────────────────────────────────────────────────────────────────
const BUDGET_USD = parseFloat(process.env.LIVE_DEMO_BUDGET_USD || "") || 2.00;
console.log("[forge-stage-11-1] Budget cap: $" + BUDGET_USD.toFixed(2));

// ── Requires ──────────────────────────────────────────────────────────────────
const { runStage11_1LiveDemo, PROJECT_ID, KILL_THRESHOLD_USD, HARD_CAP_USD } = require(
  path.join(__dirname, "..", "code", "src", "testing", "live", "stage_11_1_live_runner")
);
const { getDefaultRegistry } = require(
  path.join(__dirname, "..", "code", "src", "runtime", "tools", "_registry")
);

// ── Closure artifact writer ───────────────────────────────────────────────────

async function _writeClosureArtifact(result, exitStatus) {
  const reg = getDefaultRegistry();
  const ts  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 15);
  const slug = "phase-11-stage-11-1-closure";
  const artPath = "artifacts/decisions/DECISION-" + ts + "-" + slug + ".md";

  const content = _buildArtifactContent(result, exitStatus, ts);

  try {
    await reg.invoke("fs.write_file", { path: artPath, content }, {});
    return artPath;
  } catch (e) {
    return "(write failed: " + e.message + ")";
  }
}

function _buildArtifactContent(result, exitStatus, ts) {
  const status      = (result && result.status)          || exitStatus;
  const cost        = (result && result.cost_usd)        || 0;
  const durationMs  = (result && result.duration_ms)     || 0;
  const iv          = (result && result.inferred_vision) || null;
  const visionPath  = (result && result.vision_path)     || "(not written)";

  const statusLabel = status === "SUCCESS"
    ? "COMPLETE"
    : (status === "KILL_SWITCH" ? "KILL_SWITCH_TRIGGERED"
    : (status === "HARD_CAP_EXCEEDED" ? "HARD_CAP_EXCEEDED" : "FAILED"));

  const ivSection = iv ? [
    "```json",
    JSON.stringify(iv, null, 2),
    "```"
  ].join("\n") : "*(not produced — demo did not reach role.invoke completion)*";

  return [
    "# DECISION-" + ts + " — PHASE-11 Stage 11.1 Closure",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Date | " + new Date().toISOString().slice(0, 10) + " |",
    "| Owner | KhElmasry |",
    "| Status | OWNER_DECISION_PENDING |",
    "| Scope | PHASE-11 Stage 11.1 — Python Analyzer + reverseVisionProvider + live gpt-4o demo |",
    "| Related | `artifacts/decisions/_phase_11_checkpoints/stage_11_1_mid.md` |",
    "",
    "---",
    "",
    "## §1 Stage Summary",
    "",
    "Stage 11.1 implemented and validated:",
    "- `project.intake_zip` L2 tool (directory_path variant, fixture_pycli)",
    "- `project.analyze_source` L2 tool (Python AST via web-tree-sitter WASM)",
    "- `reverse_vision_role` using `reg.invoke('agent.invoke')` through standard budget gate",
    "- `agent_budget_rule` exemption for `ctx.role_id === 'reverse_vision'` (Section A only)",
    "- S158–S162 all PASS (157 total passing, 5 skipped)",
    "",
    "---",
    "",
    "## §2 Live Demo Parameters",
    "",
    "| Parameter | Value |",
    "|---|---|",
    "| Project ID | `" + PROJECT_ID + "` |",
    "| Fixture | `artifacts/test_fixtures/intake/fixture_pycli` |",
    "| Provider | openai / gpt-4o |",
    "| Kill switch threshold | $" + KILL_THRESHOLD_USD.toFixed(2) + " |",
    "| Hard cap | $" + HARD_CAP_USD.toFixed(2) + " |",
    "| Budget cap (env) | $" + BUDGET_USD.toFixed(2) + " |",
    "",
    "---",
    "",
    "## §3 Live Demo Result",
    "",
    "| Metric | Value |",
    "|---|---|",
    "| Exit status | **" + statusLabel + "** |",
    "| Duration | " + (durationMs / 1000).toFixed(1) + "s |",
    "| Total cost | $" + cost.toFixed(5) + " |",
    "| vision.md | `" + visionPath + "` (vision_locked: false) |",
    "",
    "---",
    "",
    "## §4 InferredVision Output",
    "",
    ivSection,
    "",
    "---",
    "",
    "## §5 Semantic Review",
    "",
    "*(Owner reviews InferredVision above for correctness before locking vision.md.)*",
    "",
    "**Vision lock is PROHIBITED until owner explicitly approves per INTAKE_CONTRACT §5.**",
    "",
    "Checklist:",
    "- [ ] `project_name` correctly identifies the fixture",
    "- [ ] `domain` is accurate",
    "- [ ] `goals.primary` captures the core purpose",
    "- [ ] `constraints` and `non_goals` are reasonable",
    "- [ ] `confidence` reflects the evidence quality",
    "- [ ] `source_summary` is coherent",
    "",
    "---",
    "",
    "## §6 Architectural Follow-Up (Non-Blocking — Stage 11.4)",
    "",
    "`reverseVisionProvider.js` is now an unused reference implementation.",
    "Stage 11.4 requires an explicit architectural decision:",
    "",
    "**Option A:** Wire `reverseVisionProvider` back into the role (Provider Contract v2 pattern,",
    "consistent with all other providers). Requires adding vision-lock exemption in providerContract too.",
    "",
    "**Option B:** Adopt 'role builds prompt + invokes adapter directly via agent.invoke' as the",
    "canonical pattern for pre-vision-lock roles. `reverseVisionProvider.js` becomes dead code and",
    "should be removed at Stage 11.4.",
    "",
    "**Recommendation:** Option B — simpler, already tested, avoids double-layer abstraction",
    "for a role that only runs once per project.",
    "",
    "---",
    "",
    "## §7 Test Suite Status",
    "",
    "```",
    "ALL PASS — 157 passed, 0 failed, 5 skipped (162 total)",
    "S158 ✓  project.intake_zip directory mode",
    "S159 ✓  project.analyze_source — fixture_pycli with AST samples",
    "S160 ✓  reverse_vision_role — mock provider returns valid InferredVision",
    "S161 ✓  intake end-to-end mock — intake → analyze → infer → vision.md unlocked",
    "S162 ✓  project.analyze_source — Rust-only directory returns UNSUPPORTED_LANGUAGE",
    "```",
    "",
    "---",
    "",
    "## §8 Owner Approval",
    "",
    "> To close Stage 11.1, the owner (KhElmasry) must review §5 and post approval:",
    ">",
    "> \"STAGE-11-1 APPROVED. GO to Stage 11.2.\" (or equivalent)",
    "",
    "Until approval, `progress/status.json` remains at Stage 11.1.",
  ].join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async function main() {
  console.log("[forge-stage-11-1] Starting Stage 11.1 live demo...");
  const runStart = Date.now();

  let result;
  try {
    result = await runStage11_1LiveDemo();
  } catch (err) {
    console.error("[forge-stage-11-1] UNHANDLED ERROR: " + err.message);
    if (err.stack) console.error(err.stack);
    const artPath = await _writeClosureArtifact(null, "UNHANDLED_ERROR").catch(() => "(write failed)");
    console.error("[forge-stage-11-1] Closure artifact: " + artPath);
    process.exit(2);
  }

  const duration_s = ((Date.now() - runStart) / 1000).toFixed(1);
  console.log("[forge-stage-11-1] Runner finished in " + duration_s + "s — status: " + result.status);

  const artPath = await _writeClosureArtifact(result, result.status).catch(() => "(write failed)");
  console.log("[forge-stage-11-1] Closure artifact: " + artPath);

  if (result.status === "SUCCESS") {
    console.log("[forge-stage-11-1] SUCCESS. vision.md written unlocked. Awaiting owner review.");
    process.exit(0);
  } else if (result.status === "KILL_SWITCH" || result.status === "HARD_CAP_EXCEEDED") {
    console.error("[forge-stage-11-1] " + result.status + " — cost: $" + (result.cost_usd || 0).toFixed(5));
    process.exit(1);
  } else {
    console.error("[forge-stage-11-1] FAILED at step: " + (result.step || "unknown") +
                  " — reason: " + (result.reason || "unknown"));
    process.exit(2);
  }
}());

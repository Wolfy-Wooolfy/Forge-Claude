#!/usr/bin/env node
"use strict";

// ── forge-stage-11-2-live-demo.js ────────────────────────────────────────────
// CLI entry for PHASE-11 Stage 11.2 live demo.
// Copies fixture_nextjs → project source, runs project.analyze_source (detects
// TypeScript + Next.js framework), then invokes reverse_vision role with a
// REAL OpenAI gpt-4o call using the v2 prompt (web_application domain awareness).
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
  console.error("[forge-stage-11-2] STOP: OPENAI_API_KEY missing or length < 20.");
  console.error("  Set OPENAI_API_KEY in .env or shell environment before running.");
  process.exit(2);
}
console.log("[forge-stage-11-2] OPENAI_API_KEY present (length=" + apiKey.length + ")");

// ── Budget cap ────────────────────────────────────════════════════════════════
const BUDGET_USD = parseFloat(process.env.LIVE_DEMO_BUDGET_USD || "") || 1.00;
console.log("[forge-stage-11-2] Budget cap: $" + BUDGET_USD.toFixed(2));

// ── Requires ──────────────────────────────────────────────────────────────────
const { runStage11_2LiveDemo, PROJECT_ID, KILL_THRESHOLD_USD, HARD_CAP_USD } = require(
  path.join(__dirname, "..", "code", "src", "testing", "live", "stage_11_2_live_runner")
);
const { getDefaultRegistry } = require(
  path.join(__dirname, "..", "code", "src", "runtime", "tools", "_registry")
);

// ── Closure artifact writer ───────────────────────────────────────────────────

async function _writeClosureArtifact(result, exitStatus) {
  const reg = getDefaultRegistry();
  const ts  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 15);
  const slug = "phase-11-stage-11-2-closure";
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
  const status     = (result && result.status)          || exitStatus;
  const cost       = (result && result.cost_usd)        || 0;
  const durationMs = (result && result.duration_ms)     || 0;
  const iv         = (result && result.inferred_vision) || null;
  const visionPath = (result && result.vision_path)     || "(not written)";

  const statusLabel = status === "SUCCESS"
    ? "COMPLETE"
    : (status === "KILL_SWITCH" ? "KILL_SWITCH_TRIGGERED"
    : (status === "HARD_CAP_EXCEEDED" ? "HARD_CAP_EXCEEDED" : "FAILED"));

  const ivSection = iv ? [
    "```json",
    JSON.stringify(iv, null, 2),
    "```"
  ].join("\n") : "*(not produced — demo did not reach role.invoke completion)*";

  const domainNote = iv
    ? (iv.domain === "web_application"
        ? "✓ PASS — model correctly selected `web_application` (Next.js framework mapping propagated)"
        : "⚠ SOFT REGRESSION — model returned `" + iv.domain + "` instead of `web_application`. " +
          "Prompt reinforcement may be needed. Not a STOP per §5 spec — record for owner judgment.")
    : "(domain not available)";

  return [
    "# DECISION-" + ts + " — PHASE-11 Stage 11.2 Closure",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Date | " + new Date().toISOString().slice(0, 10) + " |",
    "| Owner | KhElmasry |",
    "| Status | OWNER_DECISION_PENDING |",
    "| Scope | PHASE-11 Stage 11.2 — JS/TS Analyzer + Next.js Framework Detection + live gpt-4o demo |",
    "| Related | `artifacts/decisions/_phase_11_checkpoints/stage_11_2_mid.md` |",
    "",
    "---",
    "",
    "## §1 Stage Summary",
    "",
    "Stage 11.2 implemented and validated:",
    "- WASM grammars vendored: `javascript.wasm` v0.25.0 (411KB) + `typescript.wasm` v0.23.2 (1.4MB)",
    "- `intake_tools.js` extended: EXT_MAP for JS/TS/JSX/MJS/TSX, three lazy WASM parsers,",
    "  `_extractJsSymbols`, `_extractTsSymbols`, `_parsePackageJson`, `_parseTsconfig`,",
    "  `_detectJsFramework`, `detected_framework` output field",
    "- `fixture_nextjs` created: 9 files, ~197 LOC, Next.js 14 App Router task tracker in TypeScript",
    "- `reverse_vision_v2` prompt: `web_application` in domain enum, framework→domain mapping",
    "- `reverse_vision_role.js` updated: loads v2 prompt, `detected_framework` in INPUT_SCHEMA,",
    "  JS manifest blocks (package.json, tsconfig, next_config) in `_buildPrompt`",
    "- S163–S167 all PASS (new); S158–S162 regression-free",
    "- SU total: 162 passed, 0 failed, 5 skipped (167 total)",
    "",
    "---",
    "",
    "## §2 Live Demo Parameters",
    "",
    "| Parameter | Value |",
    "|---|---|",
    "| Project ID | `" + PROJECT_ID + "` |",
    "| Fixture | `artifacts/test_fixtures/intake/fixture_nextjs` |",
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
    "**Domain check (critical):** " + domainNote,
    "",
    "*(Owner reviews InferredVision above for correctness before locking vision.md.)*",
    "",
    "**Vision lock is PROHIBITED until owner explicitly approves per INTAKE_CONTRACT §5.**",
    "",
    "Checklist:",
    "- [ ] `project_name` correctly identifies the fixture (expected: `nextjs_tasks_demo` or similar)",
    "- [ ] `domain` = `web_application` (NOT `web_api` — Next.js is full-stack, not just API)",
    "- [ ] `goals.primary` mentions Next.js / web app / tasks (not just API)",
    "- [ ] `detected_languages` includes `typescript`",
    "- [ ] `confidence` = `HIGH` (good signal: manifest + framework + AST)",
    "- [ ] `non_goals` includes something about no database persistence (in-memory store)",
    "- [ ] `source_summary` is coherent and mentions Next.js or web application",
    "",
    "---",
    "",
    "## §6 Architectural Follow-Up (Non-Blocking — Stage 11.4)",
    "",
    "`reverseVisionProvider.js` remains an unused reference implementation.",
    "Stage 11.4 decision still pending: Option A (re-wire provider) vs Option B (role-as-canon).",
    "Reference: Stage 11.1 closure §6.",
    "",
    "---",
    "",
    "## §7 Test Suite Status",
    "",
    "```",
    "ALL PASS — 162 passed, 0 failed, 5 skipped (167 total)",
    "S158 ✓  project.intake_zip directory mode (Python fixture — regression)",
    "S159 ✓  project.analyze_source — fixture_pycli (Python — regression)",
    "S160 ✓  reverse_vision_role — mock provider Python fixture (regression)",
    "S161 ✓  intake end-to-end mock — Python fixture vision.md (regression)",
    "S162 ✓  project.analyze_source — Rust-only UNSUPPORTED_LANGUAGE (regression)",
    "S163 ✓  project.analyze_source — JavaScript file detects 'javascript'",
    "S164 ✓  project.analyze_source — TypeScript file detects 'typescript'",
    "S165 ✓  project.analyze_source — fixture_nextjs → typescript + framework=next",
    "S166 ✓  reverse_vision_role — mock Next.js source_tree → domain=web_application",
    "S167 ✓  intake end-to-end mock — fixture_nextjs → vision.md domain=web_application",
    "```",
    "",
    "---",
    "",
    "## §8 Owner Approval",
    "",
    "> To close Stage 11.2, the owner (KhElmasry) must review §5 and post approval:",
    ">",
    "> \"STAGE-11-2 APPROVED. GO to Stage 11.3.\" (or equivalent)",
    "",
    "Until approval, `progress/status.json` remains at Stage 11.2.",
  ].join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async function main() {
  console.log("[forge-stage-11-2] Starting Stage 11.2 live demo...");
  const runStart = Date.now();

  let result;
  try {
    result = await runStage11_2LiveDemo();
  } catch (err) {
    console.error("[forge-stage-11-2] UNHANDLED ERROR: " + err.message);
    if (err.stack) console.error(err.stack);
    const artPath = await _writeClosureArtifact(null, "UNHANDLED_ERROR").catch(() => "(write failed)");
    console.error("[forge-stage-11-2] Closure artifact: " + artPath);
    process.exit(2);
  }

  const duration_s = ((Date.now() - runStart) / 1000).toFixed(1);
  console.log("[forge-stage-11-2] Runner finished in " + duration_s + "s — status: " + result.status);

  const artPath = await _writeClosureArtifact(result, result.status).catch(() => "(write failed)");
  console.log("[forge-stage-11-2] Closure artifact: " + artPath);

  if (result.status === "SUCCESS") {
    console.log("[forge-stage-11-2] SUCCESS. vision.md written unlocked. Awaiting owner review.");
    process.exit(0);
  } else if (result.status === "KILL_SWITCH" || result.status === "HARD_CAP_EXCEEDED") {
    console.error("[forge-stage-11-2] " + result.status + " — cost: $" + (result.cost_usd || 0).toFixed(5));
    process.exit(1);
  } else {
    console.error("[forge-stage-11-2] FAILED at step: " + (result.step || "unknown") +
                  " — reason: " + (result.reason || "unknown"));
    process.exit(2);
  }
}());

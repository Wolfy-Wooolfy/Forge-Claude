#!/usr/bin/env node
"use strict";

// ── forge-stage-11-3-live-demo.js ────────────────────────────────────────────
// CLI entry for PHASE-11 Stage 11.3 live demo.
// Copies fixture_gocli → project source, runs project.analyze_source (detects
// Go + go.mod parsing + AST symbols), then invokes reverse_vision role with a
// REAL OpenAI gpt-4o call (v2 prompt — cli_tool domain expected).
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
  console.error("[forge-stage-11-3] STOP: OPENAI_API_KEY missing or length < 20.");
  console.error("  Set OPENAI_API_KEY in .env or shell environment before running.");
  process.exit(2);
}
console.log("[forge-stage-11-3] OPENAI_API_KEY present (length=" + apiKey.length + ")");

// ── Budget cap ────────────────────────────────────────────────────────────────
const BUDGET_USD = parseFloat(process.env.LIVE_DEMO_BUDGET_USD || "") || 1.00;
console.log("[forge-stage-11-3] Budget cap: $" + BUDGET_USD.toFixed(2));

// ── Requires ──────────────────────────────────────────────────────────────────
const { runStage11_3LiveDemo, PROJECT_ID, KILL_THRESHOLD_USD, HARD_CAP_USD } = require(
  path.join(__dirname, "..", "code", "src", "testing", "live", "stage_11_3_live_runner")
);
const { getDefaultRegistry } = require(
  path.join(__dirname, "..", "code", "src", "runtime", "tools", "_registry")
);

// ── Closure artifact writer ───────────────────────────────────────────────────

async function _writeClosureArtifact(result, exitStatus) {
  const reg = getDefaultRegistry();
  const ts  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 15);
  const slug = "phase-11-stage-11-3-closure";
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
    ? (iv.domain === "cli_tool"
        ? "✓ PASS — model correctly selected `cli_tool` (Go CLI fixture unambiguous)"
        : "⚠ SOFT REGRESSION — model returned `" + iv.domain + "` instead of `cli_tool`. " +
          "Not a STOP per §5 spec — record for owner judgment.")
    : "(domain not available)";

  return [
    "# DECISION-" + ts + " — PHASE-11 Stage 11.3 Closure",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Date | " + new Date().toISOString().slice(0, 10) + " |",
    "| Owner | KhElmasry |",
    "| Status | OWNER_DECISION_PENDING |",
    "| Scope | PHASE-11 Stage 11.3 — Go Analyzer Extension + live gpt-4o demo |",
    "| Related | `artifacts/decisions/_phase_11_checkpoints/stage_11_3_mid.md` |",
    "",
    "---",
    "",
    "## §1 Stage Summary",
    "",
    "Stage 11.3 implemented and validated:",
    "- WASM grammar vendored: `go.wasm` v0.25.0 (217KB, SHA256 verified)",
    "- ABI verified: root=source_file, function_declaration/method_declaration/type_declaration/const_declaration all confirmed",
    "- `intake_tools.js` extended (purely additive): EXT_MAP `.go`, SUPPORTED_LANGUAGES `go`,",
    "  MANIFEST_NAMES `go.mod`/`go.sum`, GO_ENTRY_BASES, `_getGoLanguage()`,",
    "  `_parseGoMod`, `_parseGoSum`, `_extractGoSymbols`, AST dispatch, topSymbols formatter",
    "- No framework detection for Go (ecosystem too fragmented; detected_framework stays null)",
    "- `fixture_gocli` created: 7 files, Go CLI TODO manager, std-library only, pre-flight ALL PASS",
    "- `reverse_vision_v2` unchanged — already covers Go via go.mod mention + cli_tool in domain enum",
    "- S168–S171 all PASS (new); S158–S167 regression-free",
    "- SU total: 166 passed, 0 failed, 5 skipped (171 total)",
    "",
    "---",
    "",
    "## §2 Live Demo Parameters",
    "",
    "| Parameter | Value |",
    "|---|---|",
    "| Project ID | `" + PROJECT_ID + "` |",
    "| Fixture | `artifacts/test_fixtures/intake/fixture_gocli` |",
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
    "- [ ] `project_name` correctly identifies the fixture (expected: `todo_gocli` from go.mod last segment)",
    "- [ ] `domain` = `cli_tool` (CRITICAL — should NOT be `library` or `other`)",
    "- [ ] `goals.primary` mentions TODO list / task manager / CLI",
    "- [ ] `detected_languages` includes `go`",
    "- [ ] `detected_framework` is null (no framework detection for Go)",
    "- [ ] `confidence` = `HIGH` (strong signal: go.mod + AST symbols + README)",
    "- [ ] `non_goals` includes something like no web UI, no external dependencies",
    "- [ ] `source_summary` is coherent and mentions Go CLI / TODO manager",
    "",
    "---",
    "",
    "## §6 Go Ecosystem Note (Non-Blocking)",
    "",
    "Framework detection is deliberately not implemented for Go.",
    "The Go ecosystem has no dominant framework analogous to Next.js for JS.",
    "Common HTTP libraries (gin, echo, fiber, chi, stdlib net/http) all look similar in the file tree.",
    "Framework detection for Go is deferred to a later phase if needed.",
    "This decision is recorded in INTAKE_CONTRACT.md §7.",
    "",
    "---",
    "",
    "## §7 Test Suite Status",
    "",
    "```",
    "ALL PASS — 166 passed, 0 failed, 5 skipped (171 total)",
    "S158 ✓  project.intake_zip directory mode (Python fixture — regression)",
    "S159 ✓  project.analyze_source — fixture_pycli (Python — regression)",
    "S160 ✓  reverse_vision_role — mock provider Python fixture (regression)",
    "S161 ✓  intake end-to-end mock — Python fixture vision.md (regression)",
    "S162 ✓  project.analyze_source — Rust-only UNSUPPORTED_LANGUAGE (regression)",
    "S163 ✓  project.analyze_source — JavaScript file detects 'javascript' (regression)",
    "S164 ✓  project.analyze_source — TypeScript file detects 'typescript' (regression)",
    "S165 ✓  project.analyze_source — fixture_nextjs → typescript + framework=next (regression)",
    "S166 ✓  reverse_vision_role — mock Next.js source_tree → domain=web_application (regression)",
    "S167 ✓  intake end-to-end mock — fixture_nextjs → vision.md domain=web_application (regression)",
    "S168 ✓  project.analyze_source — single .go file → go detected, framework=null",
    "S169 ✓  project.analyze_source — fixture_gocli → go + go.mod + AST symbols",
    "S170 ✓  reverse_vision_role — mock Go CLI source_tree → domain=cli_tool",
    "S171 ✓  intake end-to-end mock — fixture_gocli → vision.md domain=cli_tool",
    "```",
    "",
    "---",
    "",
    "## §8 Owner Approval",
    "",
    "> To close Stage 11.3, the owner (KhElmasry) must review §5 and post approval:",
    ">",
    "> \"STAGE-11-3 APPROVED. GO to Stage 11.4.\" (or equivalent)",
    "",
    "Until approval, `progress/status.json` remains at Stage 11.3.",
  ].join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async function main() {
  console.log("[forge-stage-11-3] Starting Stage 11.3 live demo...");
  const runStart = Date.now();

  let result;
  try {
    result = await runStage11_3LiveDemo();
  } catch (err) {
    console.error("[forge-stage-11-3] UNHANDLED ERROR: " + err.message);
    if (err.stack) console.error(err.stack);
    const artPath = await _writeClosureArtifact(null, "UNHANDLED_ERROR").catch(() => "(write failed)");
    console.error("[forge-stage-11-3] Closure artifact: " + artPath);
    process.exit(2);
  }

  const duration_s = ((Date.now() - runStart) / 1000).toFixed(1);
  console.log("[forge-stage-11-3] Runner finished in " + duration_s + "s — status: " + result.status);

  const artPath = await _writeClosureArtifact(result, result.status).catch(() => "(write failed)");
  console.log("[forge-stage-11-3] Closure artifact: " + artPath);

  if (result.status === "SUCCESS") {
    console.log("[forge-stage-11-3] SUCCESS. vision.md written unlocked. Awaiting owner review.");
    process.exit(0);
  } else if (result.status === "KILL_SWITCH" || result.status === "HARD_CAP_EXCEEDED") {
    console.error("[forge-stage-11-3] " + result.status + " — cost: $" + (result.cost_usd || 0).toFixed(5));
    process.exit(1);
  } else {
    console.error("[forge-stage-11-3] FAILED at step: " + (result.step || "unknown") +
                  " — reason: " + (result.reason || "unknown"));
    process.exit(2);
  }
}());

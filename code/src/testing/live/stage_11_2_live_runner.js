"use strict";

// ── stage_11_2_live_runner.js ─────────────────────────────────────────────────
// Live demo for PHASE-11 Stage 11.2 — JS/TS Analyzer + Next.js Framework Detection.
// Single role invocation (no orchestration loop).
//
// Flow:
//   1. project.intake_zip   — copy fixture_nextjs → artifacts/projects/<id>/source/
//   2. project.analyze_source — SourceTreeAnalysis (detected_framework="next")
//   3. role.invoke reverse_vision — real OpenAI call (gpt-4o), v2 prompt with FRAMEWORK field
//   4. fs.write_file vision.md (unlocked) — INTAKE_CONTRACT §5 auto-lock PROHIBITED
//   5. agent.read_ledger — report final cost
//
// Kill switch: polls cost every 5s, aborts if >= KILL_THRESHOLD_USD ($0.75).
// Hard cap: $1.00 — checked after role.invoke completes.
//
// Track A: no direct fs.*, no new OpenAI(), no child_process, no fetch().

const path = require("path");
const { getDefaultRegistry } = require("../../runtime/tools/_registry");

const PROJECT_ID         = "stage_11_2_live_demo";
const PROVIDER           = "openai";
const MODEL              = "gpt-4o";
const KILL_THRESHOLD_USD = 0.75;
const HARD_CAP_USD       = 1.00;
const POLL_INTERVAL_MS   = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _reg() { return getDefaultRegistry(); }

function _log(msg) { console.log("[stage-11-2-live] " + msg); }

async function _readProjectCost(project_id, ctx) {
  const r = await _reg().invoke("agent.read_ledger", { project_id }, ctx || {});
  return (r && r.status === "SUCCESS" && r.output && r.output.total_cost) || 0;
}

// ── Kill switch ───────────────────────────────────────────────────────────────

function KillSwitchError(msg, cost_usd) {
  this.name     = "KillSwitchError";
  this.message  = msg;
  this.cost_usd = cost_usd;
}
KillSwitchError.prototype = Object.create(Error.prototype);
KillSwitchError.prototype.constructor = KillSwitchError;

function _createKillSwitch(project_id, ctx) {
  var _fired    = false;
  var _interval = null;
  var _reject   = null;

  async function _poll() {
    if (_fired) return;
    var cost;
    try { cost = await _readProjectCost(project_id, ctx); } catch (_e) { return; }
    if (cost >= KILL_THRESHOLD_USD) {
      _fired = true;
      _stop();
      if (_reject) {
        _reject(new KillSwitchError(
          "Kill switch: cost $" + cost.toFixed(5) + " >= threshold $" + KILL_THRESHOLD_USD,
          cost
        ));
      }
    }
  }

  function _stop() {
    if (_interval) { clearInterval(_interval); _interval = null; }
    _reject = null;
  }

  function start() {
    return new Promise(function(resolve, reject) {
      _reject = reject;
      _interval = setInterval(function() { _poll().catch(function(_e) {}); }, POLL_INTERVAL_MS);
    });
  }

  function stop()     { _stop(); }
  function hasFired() { return _fired; }

  return { start, stop, hasFired };
}

// ── Vision.md builder ─────────────────────────────────────────────────────────

function _buildVisionMd(project_id, iv) {
  const { serializeFrontmatter } = require("../../ai_os/schemas/visionSchema");
  const fm = {
    project_id,
    project_name:       iv.project_name,
    domain:             iv.domain,
    vision_version:     1,
    vision_locked:      false,
    vision_locked_at:   null,
    locked_by_role:     null,
    amendments_history: [],
    goals: {
      primary:   iv.goals.primary,
      secondary: iv.goals.secondary
    },
    constraints: iv.constraints,
    non_goals:   iv.non_goals
  };
  return serializeFrontmatter(fm) +
    "\n\n# Project Vision: " + iv.project_name + "\n" +
    "\n## Source Summary\n\n" + (iv.source_summary || "") + "\n" +
    "\n## Detected Languages\n\n" + (iv.detected_languages || []).join(", ") + "\n" +
    "\n## Confidence\n\n" + (iv.confidence || "MEDIUM") + "\n";
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function runStage11_2LiveDemo() {
  const ROOT    = process.cwd();
  const ctx     = { root: ROOT, project_id: PROJECT_ID };
  const startTs = Date.now();

  _log("═══════════════════════════════════════════════════════════");
  _log("PHASE-11 Stage 11.2 Live Demo");
  _log("Project: " + PROJECT_ID);
  _log("Provider: " + PROVIDER + " / " + MODEL);
  _log("Kill switch: $" + KILL_THRESHOLD_USD + "  |  Hard cap: $" + HARD_CAP_USD);
  _log("═══════════════════════════════════════════════════════════");

  // ── Step 1: intake_zip ──────────────────────────────────────────────────────
  _log("Step 1/5: intake_zip — copying fixture_nextjs...");
  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_nextjs");

  const intakeRes = await _reg().invoke(
    "project.intake_zip",
    { project_id: PROJECT_ID, directory_path: fixturePath },
    ctx
  );

  if (!intakeRes || (intakeRes.status !== "SUCCESS" &&
      !(intakeRes.status === "FAILED" && intakeRes.metadata && intakeRes.metadata.reason === "TARGET_NOT_EMPTY"))) {
    const reason = (intakeRes && intakeRes.metadata && intakeRes.metadata.reason) || "UNKNOWN";
    return { status: "FAILED", step: "intake_zip", reason, duration_ms: Date.now() - startTs };
  }

  if (intakeRes.status === "SUCCESS") {
    _log("  OK — " + intakeRes.output.file_count + " files, " +
         (intakeRes.output.languages_detected || []).join(", "));
  } else {
    _log("  Source already exists (TARGET_NOT_EMPTY) — proceeding with existing source.");
  }

  // ── Step 2: analyze_source ──────────────────────────────────────────────────
  _log("Step 2/5: analyze_source...");
  const analyzeRes = await _reg().invoke(
    "project.analyze_source",
    { project_id: PROJECT_ID },
    ctx
  );

  if (!analyzeRes || analyzeRes.status !== "SUCCESS") {
    const reason = (analyzeRes && analyzeRes.metadata && analyzeRes.metadata.reason) || "UNKNOWN";
    return { status: "FAILED", step: "analyze_source", reason, duration_ms: Date.now() - startTs };
  }

  const sourceTree = analyzeRes.output;
  _log("  OK — " + sourceTree.file_count + " files, " + sourceTree.detected_languages.join(", "));
  _log("  AST samples: " + sourceTree.ast_samples.length + " files parsed");
  if (sourceTree.detected_framework) {
    _log("  Framework detected: " + sourceTree.detected_framework);
  }
  if (sourceTree.entry_points && sourceTree.entry_points.length > 0) {
    _log("  Entry points: " + sourceTree.entry_points.join(", "));
  }

  // ── Step 3: role.invoke reverse_vision (real OpenAI call) ──────────────────
  _log("Step 3/5: role.invoke reverse_vision (REAL LLM CALL — v2 prompt with FRAMEWORK field)...");
  _log("  Kill switch polling every " + (POLL_INTERVAL_MS / 1000) + "s.");

  const ks = _createKillSwitch(PROJECT_ID, ctx);
  const ksPromise = ks.start();

  let roleResult;
  const roleStart = Date.now();
  try {
    roleResult = await Promise.race([
      _reg().invoke(
        "role.invoke",
        {
          role_id:    "reverse_vision",
          project_id: PROJECT_ID,
          provider:   PROVIDER,
          model:      MODEL,
          input: {
            schema_version: "1.0.0",
            project_id:     PROJECT_ID,
            source_tree:    sourceTree
          }
        },
        Object.assign({ role_id: "reverse_vision" }, ctx)
      ),
      ksPromise
    ]);
  } catch (err) {
    ks.stop();
    if (err.name === "KillSwitchError") {
      _log("  KILL SWITCH FIRED: " + err.message);
      return {
        status:      "KILL_SWITCH",
        step:        "role.invoke",
        cost_usd:    err.cost_usd,
        duration_ms: Date.now() - startTs
      };
    }
    return { status: "FAILED", step: "role.invoke", reason: err.message, duration_ms: Date.now() - startTs };
  } finally {
    ks.stop();
  }

  const roleDurationMs = Date.now() - roleStart;

  if (!roleResult || roleResult.status !== "SUCCESS") {
    const reason = (roleResult && roleResult.metadata && roleResult.metadata.reason) || "ROLE_FAILED";
    const detail = (roleResult && roleResult.metadata && roleResult.metadata.detail) || null;
    _log("  FAILED — " + reason + (detail ? ": " + detail : ""));
    return { status: "FAILED", step: "role.invoke", reason, detail, duration_ms: Date.now() - startTs };
  }

  const iv = {
    project_name:       roleResult.output.project_name,
    domain:             roleResult.output.domain,
    goals:              roleResult.output.goals,
    constraints:        roleResult.output.constraints,
    non_goals:          roleResult.output.non_goals,
    detected_languages: roleResult.output.detected_languages,
    source_summary:     roleResult.output.source_summary,
    confidence:         roleResult.output.confidence
  };

  _log("  OK in " + (roleDurationMs / 1000).toFixed(1) + "s");
  _log("  project_name:       " + iv.project_name);
  _log("  domain:             " + iv.domain + (iv.domain === "web_application" ? " ✓" : " ← CHECK"));
  _log("  confidence:         " + iv.confidence);
  _log("  detected_languages: " + iv.detected_languages.join(", "));
  _log("  goals.primary:      " + iv.goals.primary);

  // Hard cap check
  const costAfterRole = await _readProjectCost(PROJECT_ID, ctx);
  _log("  cost after role.invoke: $" + costAfterRole.toFixed(5));
  if (costAfterRole > HARD_CAP_USD) {
    _log("  HARD CAP EXCEEDED — aborting before vision write");
    return {
      status:          "HARD_CAP_EXCEEDED",
      step:            "post_role",
      cost_usd:        costAfterRole,
      inferred_vision: iv,
      duration_ms:     Date.now() - startTs
    };
  }

  // ── Step 4: write vision.md (UNLOCKED — auto-lock PROHIBITED per §5) ────────
  _log("Step 4/5: writing vision.md (unlocked, INTAKE_CONTRACT §5)...");
  const visionContent = _buildVisionMd(PROJECT_ID, iv);
  const visionPath    = path.join("artifacts", "projects", PROJECT_ID, "vision.md");

  const writeRes = await _reg().invoke(
    "fs.write_file",
    { path: visionPath, content: visionContent },
    ctx
  );

  if (!writeRes || writeRes.status !== "SUCCESS") {
    const reason = (writeRes && writeRes.metadata && writeRes.metadata.reason) || "WRITE_FAILED";
    _log("  FAILED — " + reason);
    return {
      status:          "FAILED",
      step:            "fs.write_file",
      reason,
      inferred_vision: iv,
      duration_ms:     Date.now() - startTs
    };
  }
  _log("  OK — " + visionPath + " (vision_locked: false)");

  // ── Step 5: final cost ──────────────────────────────────────────────────────
  _log("Step 5/5: reading final cost from ledger...");
  const finalCost  = await _readProjectCost(PROJECT_ID, ctx);
  const durationMs = Date.now() - startTs;

  _log("═══════════════════════════════════════════════════════════");
  _log("COMPLETE");
  _log("  Final cost:     $" + finalCost.toFixed(5));
  _log("  Total duration: " + (durationMs / 1000).toFixed(1) + "s");
  _log("  vision.md:      " + visionPath + " (unlocked)");
  _log("  domain:         " + iv.domain + (iv.domain === "web_application" ? " ✓ (expected)" : " ← SOFT REGRESSION — record in closure §5"));
  _log("═══════════════════════════════════════════════════════════");

  return {
    status:          "SUCCESS",
    project_id:      PROJECT_ID,
    inferred_vision: iv,
    vision_path:     visionPath,
    cost_usd:        finalCost,
    duration_ms:     durationMs
  };
}

module.exports = { runStage11_2LiveDemo, PROJECT_ID, KILL_THRESHOLD_USD, HARD_CAP_USD };

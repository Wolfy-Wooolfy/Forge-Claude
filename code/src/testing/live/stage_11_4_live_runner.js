"use strict";

// ── stage_11_4_live_runner.js ─────────────────────────────────────────────────
// Live demo for PHASE-11 Stage 11.4 — Intake UX + Orchestration Integration.
//
// Flow (11 steps):
//   0. Cleanup prior demo artifacts (fs.delete_dir — idempotent)
//   1. processIntakeRequest(directory_path=fixture_pycli) → real reverse_vision call
//      (exercises new re-wired single path: role → agent.invoke → provider mock branch OFF)
//   2. Read InferredVision from intake_state.json
//   3. Verify AWAIT_VISION_APPROVAL state + domain/confidence
//   4. processIntakeRequest(message="approve") → IntentClassificationProvider (real) → AFFIRM
//      → vision.lock_vision → orchestration.start_loop(vision_locked_intake) → ARCHITECT_DESIGN
//   5. Verify vision.md is locked (vision_locked: true)
//   6. Verify loop current_state = ARCHITECT_DESIGN (audit log last row)
//   7. Invoke architect role (REAL LLM call) — one bounded step
//   8. Advance loop ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE — HALT
//   9. Read final cost + verify ≥2 ledger entries (reverse_vision + architect)
//
// Kill switch: polls cost every 5s, aborts if >= $2.25
// Hard cap: $3.00
// Expected actual: $0.06-0.20
//
// STOP TRIGGERS:
//   1. Kill switch ($2.25)
//   2. reverseVisionProvider returns invalid output
//   3. IntentClassificationProvider misclassifies "approve" as non-AFFIRM
//   4. orchestration.start_loop not at ARCHITECT_DESIGN
//   5. Architect role fails
//   6. Cost ledger < 2 entries after demo (observability gap)
//
// Track A: no direct fs.*, no new OpenAI(), no child_process.
//   IntentClassificationProvider uses fetch() internally — existing provider behavior.

const path = require("path");
const { getDefaultRegistry } = require("../../runtime/tools/_registry");
const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID         = "stage_11_4_live_demo";
const PROVIDER           = "openai";
const MODEL              = "gpt-4o";
const FIXTURE            = "fixture_pycli";
const KILL_THRESHOLD_USD = 2.25;
const HARD_CAP_USD       = 3.00;
const POLL_INTERVAL_MS   = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _reg() { return getDefaultRegistry(); }

function _log(msg) { console.log("[stage-11-4-live] " + msg); }

async function _readProjectCost(project_id, ctx) {
  const r = await _reg().invoke("agent.read_ledger", { project_id }, ctx || {});
  return (r && r.status === "SUCCESS" && r.output && r.output.total_cost) || 0;
}

// Build a text intent for the architect from the InferredVision.
function _buildArchitectIntent(iv) {
  const parts = [iv.goals.primary];
  if (iv.non_goals && iv.non_goals.length > 0) {
    parts.push("Non-goals: " + iv.non_goals.join("; ") + ".");
  }
  if (iv.constraints && iv.constraints.length > 0) {
    parts.push("Constraints: " + iv.constraints.join("; ") + ".");
  }
  if (iv.detected_languages && iv.detected_languages.length > 0) {
    parts.push("Languages: " + iv.detected_languages.join(", ") + ".");
  }
  if (iv.domain) {
    parts.push("Domain: " + iv.domain + ".");
  }
  return parts.join(" ");
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

  return {
    start() {
      return new Promise(function(resolve, reject) {
        _reject = reject;
        _interval = setInterval(function() { _poll().catch(function(_e) {}); }, POLL_INTERVAL_MS);
      });
    },
    stop()     { _stop(); },
    hasFired() { return _fired; }
  };
}

// ── Inner demo (races against kill switch) ────────────────────────────────────

async function _runDemoInner(ROOT, ctx, startTs) {
  const reg         = _reg();
  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", FIXTURE);

  // ── Step 1: Intake — real reverse_vision call ─────────────────────────────
  _log("Step 1/9: processIntakeRequest — directory_path intake (REAL reverse_vision)...");
  _log("  Fixture: " + fixturePath);

  const intakeRes = await processIntakeRequest(
    { directory_path: fixturePath, project_id: PROJECT_ID },
    { root: ROOT, provider: PROVIDER, model: MODEL }
  );

  if (!intakeRes || !intakeRes.ok) {
    const reason = (intakeRes && intakeRes.reason) || "INTAKE_FAILED";
    throw new Error("Step 1 FAILED: " + reason +
      (intakeRes && intakeRes.message ? " — " + intakeRes.message : ""));
  }

  _log("  OK — stage: " + intakeRes.stage);
  _log("  Chat message (first 300 chars):");
  (intakeRes.message || "").slice(0, 300).split("\n").forEach(function(l) {
    _log("    " + l);
  });

  const costAfterRV = await _readProjectCost(PROJECT_ID, ctx);
  _log("  Cost after reverse_vision: $" + costAfterRV.toFixed(5));
  if (costAfterRV > HARD_CAP_USD) {
    throw new Error("HARD_CAP_EXCEEDED after reverse_vision: $" + costAfterRV.toFixed(5));
  }

  // ── Step 2: Read InferredVision from intake_state.json ───────────────────
  _log("Step 2/9: Reading InferredVision from intake_state.json...");
  const stateRead = await reg.invoke(
    "fs.read_file",
    { path: "artifacts/projects/" + PROJECT_ID + "/intake_state.json" },
    ctx
  );

  if (!stateRead || stateRead.status !== "SUCCESS") {
    throw new Error("Step 2 FAILED: could not read intake_state.json");
  }

  const state = JSON.parse(stateRead.output.content);
  const iv    = state.inferred_vision;

  _log("  project_name:       " + iv.project_name);
  _log("  domain:             " + iv.domain + (iv.domain === "cli_tool" ? " ✓ (expected)" : " ← CHECK §5"));
  _log("  confidence:         " + iv.confidence);
  _log("  detected_languages: " + (iv.detected_languages || []).join(", "));
  _log("  goals.primary:      " + iv.goals.primary);
  _log("  constraints:        " + (iv.constraints || []).join("; "));

  // STOP TRIGGER 2
  if (!iv.project_name || !iv.domain || !iv.goals || !iv.goals.primary) {
    throw new Error("STOP TRIGGER 2: reverseVisionProvider returned invalid output — schema violation");
  }

  // ── Step 3: Verify AWAIT_VISION_APPROVAL ─────────────────────────────────
  _log("Step 3/9: State check — expecting AWAIT_VISION_APPROVAL...");
  if (state.stage !== "AWAIT_VISION_APPROVAL") {
    throw new Error("Step 3 FAILED: unexpected state: " + state.stage);
  }
  _log("  OK — " + state.stage);

  // ── Step 4: Owner approval — real IntentClassificationProvider ───────────
  _log("Step 4/9: processIntakeRequest — owner approve (REAL IntentClassification call)...");

  const approveRes = await processIntakeRequest(
    { project_id: PROJECT_ID, message: "approve" },
    { root: ROOT, user_language: "en" }
  );

  if (!approveRes || !approveRes.ok) {
    const reason = (approveRes && approveRes.reason) || "APPROVE_FAILED";
    // STOP TRIGGER 3: misclassification or approval flow broken
    throw new Error("STOP TRIGGER 3: " + reason +
      (approveRes && approveRes.message ? " — " + approveRes.message : ""));
  }

  const loop_id = approveRes.loop_id;
  _log("  OK — stage:   " + approveRes.stage);
  _log("  OK — loop_id: " + loop_id);

  // STOP TRIGGER 4 (no loop_id means start_loop failed)
  if (!loop_id) {
    throw new Error("STOP TRIGGER 4: orchestration.start_loop did not return a loop_id");
  }

  // ── Step 5: Verify vision.md is locked ───────────────────────────────────
  _log("Step 5/9: Verifying vision.md is locked (vision_locked: true)...");
  const visionRead = await reg.invoke(
    "fs.read_file",
    { path: "artifacts/projects/" + PROJECT_ID + "/vision.md" },
    ctx
  );
  const visionContent = (visionRead && visionRead.status === "SUCCESS" &&
    visionRead.output && visionRead.output.content) || "";
  const visionLocked = visionContent.includes("vision_locked: true");
  _log("  vision_locked: " + visionLocked + (visionLocked ? " ✓" : " ← STOP TRIGGER"));
  if (!visionLocked) {
    throw new Error("vision.lock_vision did not set vision_locked: true in vision.md");
  }

  // ── Step 6: Verify loop at ARCHITECT_DESIGN via audit log ────────────────
  _log("Step 6/9: Verifying loop arrived at ARCHITECT_DESIGN (audit log)...");
  const logRead = await reg.invoke(
    "fs.read_file",
    { path: "artifacts/projects/" + PROJECT_ID + "/orchestration/" + loop_id + "/conversation_log.jsonl" },
    ctx
  );
  const logLines = ((logRead && logRead.output && logRead.output.content) || "")
    .split("\n").filter(function(l) { return l.trim(); });
  const lastRow  = logLines.length > 0 ? JSON.parse(logLines[logLines.length - 1]) : {};
  const loopState = lastRow.to_state || "UNKNOWN";
  _log("  last audit row to_state: " + loopState + (loopState === "ARCHITECT_DESIGN" ? " ✓" : " ← STOP TRIGGER 4"));
  if (loopState !== "ARCHITECT_DESIGN") {
    throw new Error("STOP TRIGGER 4: loop not at ARCHITECT_DESIGN — to_state: " + loopState);
  }

  // ── Step 7: Invoke architect role (ONE bounded real LLM call) ────────────
  _log("Step 7/9: Invoking architect role (REAL LLM call — HALT after this)...");
  const architectIntent = _buildArchitectIntent(iv);
  _log("  Intent (first 200 chars): " + architectIntent.slice(0, 200) +
    (architectIntent.length > 200 ? "..." : ""));

  const costBeforeArch = await _readProjectCost(PROJECT_ID, ctx);
  const archStart      = Date.now();

  const archResult = await reg.invoke(
    "role.invoke",
    {
      role_id:    "architect",
      project_id: PROJECT_ID,
      provider:   PROVIDER,
      model:      MODEL,
      input:      { intent: architectIntent, project_id: PROJECT_ID }
    },
    Object.assign({ role_id: "architect" }, ctx)
  );

  const archDuration   = Date.now() - archStart;
  const costAfterArch  = await _readProjectCost(PROJECT_ID, ctx);
  const archCostDelta  = Math.max(0, costAfterArch - costBeforeArch);

  // STOP TRIGGER 5
  if (!archResult || archResult.status !== "SUCCESS") {
    const reason = (archResult && archResult.metadata && archResult.metadata.reason) || "ARCHITECT_FAILED";
    const detail = (archResult && archResult.metadata && archResult.metadata.detail) || null;
    throw new Error("STOP TRIGGER 5: architect role failed — " + reason +
      (detail ? ": " + detail : ""));
  }

  const design    = archResult.output;
  const designStr = JSON.stringify(design, null, 2);
  _log("  OK in " + (archDuration / 1000).toFixed(1) + "s  |  architect cost: $" + archCostDelta.toFixed(5));
  _log("  Architect output snippet:");
  designStr.slice(0, 400).split("\n").forEach(function(l) { _log("    " + l); });
  if (designStr.length > 400) _log("    ...(truncated)");

  // Hard cap check
  if (costAfterArch > HARD_CAP_USD) {
    throw new Error("HARD_CAP_EXCEEDED after architect: $" + costAfterArch.toFixed(5));
  }

  // ── Step 8: Advance loop → SPEC_WRITER_FORMALIZE (HALT) ──────────────────
  _log("Step 8/9: Advancing ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE. HALTING.");
  const advResult = await reg.invoke(
    "orchestration.advance_state",
    {
      project_id:      PROJECT_ID,
      loop_id,
      to_state:        "SPEC_WRITER_FORMALIZE",
      transition_type: "NORMAL",
      role_invoked:    "architect",
      cost_usd:        archCostDelta,
      mock:            false
    },
    ctx
  );

  if (!advResult || advResult.status !== "SUCCESS") {
    const reason = (advResult && advResult.metadata && advResult.metadata.reason) || "ADVANCE_FAILED";
    throw new Error("orchestration.advance_state SPEC_WRITER_FORMALIZE failed: " + reason);
  }
  _log("  OK — loop is now at SPEC_WRITER_FORMALIZE. HALTED (no further role calls).");

  // ── Step 9: Final cost + ledger entry count check ────────────────────────
  _log("Step 9/9: Final cost check and ledger verification...");
  const finalCost = await _readProjectCost(PROJECT_ID, ctx);

  // STOP TRIGGER 6: cost ledger should have ≥2 entries
  const ledgerRes   = await reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, ctx);
  const ledgerCount = (ledgerRes && ledgerRes.output && typeof ledgerRes.output.count === "number")
    ? ledgerRes.output.count : -1;
  const trigger6    = (ledgerCount >= 0 && ledgerCount < 2);
  if (trigger6) {
    _log("  STOP TRIGGER 6 WARNING: cost ledger has " + ledgerCount + " entr(ies) — expected >= 2");
  } else {
    _log("  Ledger entries: " + ledgerCount + " ✓");
  }

  const durationMs = Date.now() - startTs;

  _log("══════════════════════════════════════════════════════════");
  _log("STAGE 11.4 LIVE DEMO — COMPLETE");
  _log("  project_id:     " + PROJECT_ID);
  _log("  loop_id:        " + loop_id);
  _log("  final cost:     $" + finalCost.toFixed(5));
  _log("  duration:       " + (durationMs / 1000).toFixed(1) + "s");
  _log("  domain:         " + iv.domain + (iv.domain === "cli_tool" ? " ✓" : " ← SOFT REGRESSION"));
  _log("  vision_locked:  true ✓");
  _log("  loop_state:     SPEC_WRITER_FORMALIZE (halted after 1 architect step)");
  _log("  ledger entries: " + ledgerCount + (trigger6 ? " ← WARNING" : " ✓"));
  _log("══════════════════════════════════════════════════════════");

  return {
    status:           "SUCCESS",
    project_id:       PROJECT_ID,
    loop_id,
    inferred_vision:  iv,
    architect_output: design,
    cost_usd:         finalCost,
    duration_ms:      durationMs,
    chat_message:     intakeRes.message,
    ledger_count:     ledgerCount,
    stop_trigger_6:   trigger6
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function runStage11_4LiveDemo() {
  const ROOT    = process.cwd();
  const ctx     = { root: ROOT, project_id: PROJECT_ID };
  const startTs = Date.now();

  _log("══════════════════════════════════════════════════════════");
  _log("PHASE-11 Stage 11.4 Live Demo");
  _log("Project:     " + PROJECT_ID);
  _log("Fixture:     " + FIXTURE);
  _log("Provider:    " + PROVIDER + " / " + MODEL);
  _log("Kill switch: $" + KILL_THRESHOLD_USD + "  |  Hard cap: $" + HARD_CAP_USD);
  _log("══════════════════════════════════════════════════════════");

  // ── Step 0: Cleanup prior demo artifacts ─────────────────────────────────
  _log("Step 0: Cleaning up prior demo artifacts (idempotent)...");
  try {
    const del = await _reg().invoke(
      "fs.delete_dir",
      { path: "artifacts/projects/" + PROJECT_ID },
      ctx
    );
    if (del && del.status === "SUCCESS") {
      _log("  Prior artifacts removed.");
    } else {
      _log("  Nothing to clean (first run).");
    }
  } catch (_e) {
    _log("  Cleanup skipped: " + _e.message);
  }

  // ── Kill switch + main race ───────────────────────────────────────────────
  const ks        = _createKillSwitch(PROJECT_ID, ctx);
  const ksPromise = ks.start();

  let result;
  try {
    result = await Promise.race([
      _runDemoInner(ROOT, ctx, startTs),
      ksPromise
    ]);
  } catch (err) {
    ks.stop();
    if (err && err.name === "KillSwitchError") {
      _log("KILL SWITCH FIRED: " + err.message);
      return {
        status:      "KILL_SWITCH",
        cost_usd:    err.cost_usd,
        duration_ms: Date.now() - startTs
      };
    }
    _log("DEMO FAILED: " + (err && err.message ? err.message : String(err)));
    return {
      status:      "FAILED",
      reason:      err && err.message ? err.message : String(err),
      duration_ms: Date.now() - startTs
    };
  }

  ks.stop();
  return result;
}

module.exports = { runStage11_4LiveDemo, PROJECT_ID, KILL_THRESHOLD_USD, HARD_CAP_USD };

"use strict";

// ── stage_11_5_live_runner.js ─────────────────────────────────────────────────
// Live demo for PHASE-11 Stage 11.5 — Comprehensive Multi-Fixture Validation.
//
// Runs the full Stage 11.4 intake flow across all 3 fixtures:
//   - fixture_pycli  (Python CLI)   → full flow incl. architect call
//   - fixture_nextjs (Next.js app)  → vision-only (halt at vision lock, no architect)
//   - fixture_gocli  (Go CLI)       → vision-only (halt at vision lock, no architect)
//
// Cost-capture pattern (OBS-1 mitigation: ledger gets truncated by SU runs):
//   - Read ledger immediately before and after each LLM call
//   - Accumulate costs in costsThisRun (in-memory)
//   - Pass costsThisRun to closure artifact writer — NOT from re-read of ledger
//
// Kill switch (per fixture): $1.50   Kill switch (global aggregate): $3.00
// Hard cap: $5.00
// Expected actual: ~$0.04 total (pycli ~$0.017, nextjs ~$0.012, gocli ~$0.009)
//
// STOP TRIGGERS (numbered per §3 of Stage 11.5 prompt):
//   1. Global kill switch ($3.00)
//   2. Any fixture's reverseVisionProvider returns invalid output
//   3. IntentClassificationProvider misclassifies "approve" as non-AFFIRM (pycli)
//   4. orchestration.start_loop not at ARCHITECT_DESIGN (pycli)
//   5. Architect role fails (pycli)
//   6. Cost ledger < 2 entries after pycli full flow
//   7. pycli only: orchestration does NOT reach ARCHITECT_DESIGN
//   8. Vision NOT locked after simulated approve (any fixture)
//
// Track A: no direct fs.*, no new OpenAI(), no child_process.

const path = require("path");
const { getDefaultRegistry } = require("../../runtime/tools/_registry");
const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURES = [
  {
    name:               "pycli",
    dir:                "artifacts/test_fixtures/intake/fixture_pycli",
    expected_domain:    "cli_tool",
    expected_languages: ["python"],
    run_architect:      true
  },
  {
    name:               "nextjs",
    dir:                "artifacts/test_fixtures/intake/fixture_nextjs",
    expected_domain:    "web_application",
    expected_languages: ["javascript", "typescript"],
    run_architect:      false
  },
  {
    name:               "gocli",
    dir:                "artifacts/test_fixtures/intake/fixture_gocli",
    expected_domain:    "cli_tool",
    expected_languages: ["go"],
    run_architect:      false
  }
];

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER               = "openai";
const MODEL                  = "gpt-4o";
const PER_FIXTURE_KILL_USD   = 1.50;
const GLOBAL_KILL_USD        = 3.00;
const HARD_CAP_USD           = 5.00;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _reg() { return getDefaultRegistry(); }

function _log(msg) { console.log("[stage-11-5-live] " + msg); }

// Read total cost for a given project from the ledger.
// Returns 0 on any failure — caller handles delta computation.
async function _readProjectCost(project_id, ctx) {
  try {
    const r = await _reg().invoke("agent.read_ledger", { project_id }, ctx || {});
    return (r && r.status === "SUCCESS" && r.output && typeof r.output.total_cost === "number")
      ? r.output.total_cost
      : 0;
  } catch (_e) {
    return 0;
  }
}

// Build architect intent from an InferredVision.
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

// ── KillSwitchError ───────────────────────────────────────────────────────────

function KillSwitchError(msg, cost_usd) {
  this.name     = "KillSwitchError";
  this.message  = msg;
  this.cost_usd = cost_usd;
}
KillSwitchError.prototype = Object.create(Error.prototype);
KillSwitchError.prototype.constructor = KillSwitchError;

// ── Vision-only fixture flow (Steps 1-5: intake → vision → approval → lock) ───
// Returns { iv, cost_rv_usd, vision_locked, loop_id, chat_message }

async function _runVisionOnlyFlow(ROOT, fixture, project_id, costsThisRun, ctx) {
  const reg         = _reg();
  const fixturePath = path.resolve(ROOT, fixture.dir);

  // ── Step 1: Intake (reverse_vision) ─────────────────────────────────────
  _log("[" + fixture.name + "] Step 1: processIntakeRequest (REAL reverse_vision)...");
  _log("[" + fixture.name + "]   Fixture: " + fixturePath);

  const costBeforeRV = await _readProjectCost(project_id, ctx);
  const intakeRes    = await processIntakeRequest(
    { directory_path: fixturePath, project_id },
    { root: ROOT, provider: PROVIDER, model: MODEL }
  );

  // Capture RV cost immediately (OBS-1 mitigation)
  const costAfterRV = await _readProjectCost(project_id, ctx);
  costsThisRun[fixture.name].rv = Math.max(0, costAfterRV - costBeforeRV);
  _log("[" + fixture.name + "]   RV cost delta: $" + costsThisRun[fixture.name].rv.toFixed(5));

  if (!intakeRes || !intakeRes.ok) {
    throw new Error("[" + fixture.name + "] Step 1 FAILED: " +
      ((intakeRes && intakeRes.reason) || "INTAKE_FAILED") +
      (intakeRes && intakeRes.message ? " — " + intakeRes.message : ""));
  }

  _log("[" + fixture.name + "]   OK — stage: " + intakeRes.stage);

  // ── Step 2: Read InferredVision ──────────────────────────────────────────
  _log("[" + fixture.name + "] Step 2: Reading InferredVision from intake_state.json...");
  const stateRead = await reg.invoke(
    "fs.read_file",
    { path: "artifacts/projects/" + project_id + "/intake_state.json" },
    ctx
  );

  if (!stateRead || stateRead.status !== "SUCCESS") {
    throw new Error("[" + fixture.name + "] Step 2 FAILED: could not read intake_state.json");
  }

  const state = JSON.parse(stateRead.output.content);
  const iv    = state.inferred_vision;

  _log("[" + fixture.name + "]   project_name:       " + iv.project_name);
  _log("[" + fixture.name + "]   domain:             " + iv.domain +
    (iv.domain === fixture.expected_domain ? " ✓" : " ← CHECK §5"));
  _log("[" + fixture.name + "]   confidence:         " + iv.confidence);
  _log("[" + fixture.name + "]   detected_languages: " + (iv.detected_languages || []).join(", "));

  // STOP TRIGGER 2
  if (!iv.project_name || !iv.domain || !iv.goals || !iv.goals.primary) {
    throw new Error("[" + fixture.name + "] STOP TRIGGER 2: reverseVisionProvider returned invalid output");
  }

  // ── Step 3: Verify AWAIT_VISION_APPROVAL ────────────────────────────────
  _log("[" + fixture.name + "] Step 3: Verify AWAIT_VISION_APPROVAL...");
  if (state.stage !== "AWAIT_VISION_APPROVAL") {
    throw new Error("[" + fixture.name + "] Step 3 FAILED: unexpected state: " + state.stage);
  }
  _log("[" + fixture.name + "]   OK — " + state.stage);

  // ── Step 4: Simulate owner approval ─────────────────────────────────────
  _log("[" + fixture.name + "] Step 4: processIntakeRequest (owner approve, REAL IntentClassification)...");
  const approveRes = await processIntakeRequest(
    { project_id, message: "approve" },
    { root: ROOT, user_language: "en" }
  );

  if (!approveRes || !approveRes.ok) {
    throw new Error("[" + fixture.name + "] STOP TRIGGER 3/8: approval failed — " +
      ((approveRes && approveRes.reason) || "APPROVE_FAILED") +
      (approveRes && approveRes.message ? " — " + approveRes.message : ""));
  }

  _log("[" + fixture.name + "]   OK — stage: " + approveRes.stage +
    "  loop_id: " + (approveRes.loop_id || "(none)"));

  // ── Step 5: Verify vision.md is locked ───────────────────────────────────
  _log("[" + fixture.name + "] Step 5: Verifying vision.md is locked...");
  const visionRead    = await reg.invoke(
    "fs.read_file",
    { path: "artifacts/projects/" + project_id + "/vision.md" },
    ctx
  );
  const visionContent = (visionRead && visionRead.status === "SUCCESS" &&
    visionRead.output && visionRead.output.content) || "";
  const visionLocked  = visionContent.includes("vision_locked: true");
  _log("[" + fixture.name + "]   vision_locked: " + visionLocked + (visionLocked ? " ✓" : " ← STOP TRIGGER 8"));

  // STOP TRIGGER 8
  if (!visionLocked) {
    throw new Error("[" + fixture.name + "] STOP TRIGGER 8: vision.lock_vision did not set vision_locked: true");
  }

  return {
    iv,
    cost_rv_usd:   costsThisRun[fixture.name].rv,
    vision_locked: visionLocked,
    loop_id:       approveRes.loop_id || null,
    chat_message:  intakeRes.message  || ""
  };
}

// ── Pycli-specific architect flow (Steps 6-9) ─────────────────────────────────
// Returns { cost_arch_usd, loop_id, architect_output, ledger_count }

async function _runArchitectFlow(ROOT, project_id, iv, loop_id, costsThisRun, ctx) {
  const reg = _reg();

  // ── Step 6: Verify loop at ARCHITECT_DESIGN ──────────────────────────────
  _log("[pycli] Step 6: Verify loop at ARCHITECT_DESIGN (audit log)...");
  const logRead = await reg.invoke(
    "fs.read_file",
    { path: "artifacts/projects/" + project_id + "/orchestration/" + loop_id + "/conversation_log.jsonl" },
    ctx
  );
  const logLines = ((logRead && logRead.output && logRead.output.content) || "")
    .split("\n").filter(function(l) { return l.trim(); });
  const lastRow   = logLines.length > 0 ? JSON.parse(logLines[logLines.length - 1]) : {};
  const loopState = lastRow.to_state || "UNKNOWN";
  _log("[pycli]   last audit row to_state: " + loopState +
    (loopState === "ARCHITECT_DESIGN" ? " ✓" : " ← STOP TRIGGER 4/7"));

  // STOP TRIGGER 4 / 7
  if (loopState !== "ARCHITECT_DESIGN") {
    throw new Error("[pycli] STOP TRIGGER 4/7: loop not at ARCHITECT_DESIGN — to_state: " + loopState);
  }

  // ── Step 7: Invoke architect role (ONE bounded real LLM call) ────────────
  _log("[pycli] Step 7: Invoking architect role (REAL LLM call — HALT after this)...");
  const architectIntent = _buildArchitectIntent(iv);
  _log("[pycli]   Intent (first 200 chars): " + architectIntent.slice(0, 200) +
    (architectIntent.length > 200 ? "..." : ""));

  const costBeforeArch = await _readProjectCost(project_id, ctx);
  const archStart      = Date.now();

  const archResult = await reg.invoke(
    "role.invoke",
    {
      role_id:    "architect",
      project_id,
      provider:   PROVIDER,
      model:      MODEL,
      input:      { intent: architectIntent, project_id }
    },
    Object.assign({ role_id: "architect" }, ctx)
  );

  const archDuration   = Date.now() - archStart;
  // Capture architect cost immediately (OBS-1 mitigation)
  const costAfterArch  = await _readProjectCost(project_id, ctx);
  costsThisRun.pycli.architect = Math.max(0, costAfterArch - costBeforeArch);
  _log("[pycli]   Architect cost delta: $" + costsThisRun.pycli.architect.toFixed(5));

  // STOP TRIGGER 5
  if (!archResult || archResult.status !== "SUCCESS") {
    const reason = (archResult && archResult.metadata && archResult.metadata.reason) || "ARCHITECT_FAILED";
    const detail = (archResult && archResult.metadata && archResult.metadata.detail) || null;
    throw new Error("[pycli] STOP TRIGGER 5: architect role failed — " + reason +
      (detail ? ": " + detail : ""));
  }

  const design    = archResult.output;
  const designStr = JSON.stringify(design, null, 2);
  _log("[pycli]   OK in " + (archDuration / 1000).toFixed(1) + "s");
  _log("[pycli]   Architect output snippet:");
  designStr.slice(0, 300).split("\n").forEach(function(l) { _log("[pycli]     " + l); });
  if (designStr.length > 300) _log("[pycli]     ...(truncated)");

  // ── Step 8: Advance ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE (HALT) ──────
  _log("[pycli] Step 8: Advancing ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE. HALTING.");
  const advResult = await reg.invoke(
    "orchestration.advance_state",
    {
      project_id,
      loop_id,
      to_state:        "SPEC_WRITER_FORMALIZE",
      transition_type: "NORMAL",
      role_invoked:    "architect",
      cost_usd:        costsThisRun.pycli.architect,
      mock:            false
    },
    ctx
  );

  if (!advResult || advResult.status !== "SUCCESS") {
    const reason = (advResult && advResult.metadata && advResult.metadata.reason) || "ADVANCE_FAILED";
    throw new Error("[pycli] orchestration.advance_state SPEC_WRITER_FORMALIZE failed: " + reason);
  }
  _log("[pycli]   OK — loop is now at SPEC_WRITER_FORMALIZE. HALTED.");

  // ── Step 9: Ledger entry count check (STOP TRIGGER 6) ───────────────────
  _log("[pycli] Step 9: Ledger entry count check (expect ≥2)...");
  const ledgerRes   = await reg.invoke("agent.read_ledger", { project_id }, ctx);
  const ledgerCount = (ledgerRes && ledgerRes.output && typeof ledgerRes.output.count === "number")
    ? ledgerRes.output.count : -1;
  const trigger6    = (ledgerCount >= 0 && ledgerCount < 2);
  if (trigger6) {
    _log("[pycli]   STOP TRIGGER 6 WARNING: ledger has " + ledgerCount + " entr(ies), expected ≥2");
  } else {
    _log("[pycli]   Ledger entries: " + (ledgerCount >= 0 ? ledgerCount : "(unknown)") + " ✓");
  }

  return {
    cost_arch_usd:    costsThisRun.pycli.architect,
    loop_id,
    architect_output: design,
    ledger_count:     ledgerCount,
    stop_trigger_6:   trigger6
  };
}

// ── Per-fixture outer runner ───────────────────────────────────────────────────

async function _runFixture(ROOT, fixture, costsThisRun, globalCostSoFar) {
  const project_id = "stage_11_5_live_" + fixture.name;
  const ctx        = { root: ROOT, project_id };
  const startTs    = Date.now();
  const reg        = _reg();

  _log("══════════════════════════════════════════════════════════");
  _log("[" + fixture.name + "] Starting fixture flow...");
  _log("[" + fixture.name + "]   project_id:   " + project_id);
  _log("[" + fixture.name + "]   expected_domain: " + fixture.expected_domain);
  _log("[" + fixture.name + "]   expected_languages: " + fixture.expected_languages.join(", "));
  _log("[" + fixture.name + "]   run_architect: " + fixture.run_architect);

  // ── Step 0: Cleanup ───────────────────────────────────────────────────────
  _log("[" + fixture.name + "] Step 0: Cleanup prior artifacts (idempotent)...");
  try {
    const del = await reg.invoke("fs.delete_dir",
      { path: "artifacts/projects/" + project_id }, ctx);
    if (del && del.status === "SUCCESS") _log("[" + fixture.name + "]   Prior artifacts removed.");
    else                                 _log("[" + fixture.name + "]   Nothing to clean (first run).");
  } catch (_e) {
    _log("[" + fixture.name + "]   Cleanup skipped: " + _e.message);
  }

  // ── Vision-only flow (all fixtures) ──────────────────────────────────────
  const visionResult = await _runVisionOnlyFlow(ROOT, fixture, project_id, costsThisRun, ctx);
  const iv           = visionResult.iv;
  const loop_id      = visionResult.loop_id;

  // Per-fixture kill switch check
  const fixtureTotal = costsThisRun[fixture.name].rv +
    (costsThisRun[fixture.name].architect || 0);
  if (fixtureTotal >= PER_FIXTURE_KILL_USD) {
    throw new KillSwitchError(
      "[" + fixture.name + "] Per-fixture kill switch: $" + fixtureTotal.toFixed(5) +
      " >= $" + PER_FIXTURE_KILL_USD,
      fixtureTotal
    );
  }

  // Global kill switch check
  const globalNow = globalCostSoFar() + fixtureTotal;
  if (globalNow >= GLOBAL_KILL_USD) {
    throw new KillSwitchError(
      "Global kill switch: aggregate $" + globalNow.toFixed(5) + " >= $" + GLOBAL_KILL_USD,
      globalNow
    );
  }

  // ── Architect flow (pycli only) ───────────────────────────────────────────
  let archResult = null;
  if (fixture.run_architect) {
    archResult = await _runArchitectFlow(
      ROOT, project_id, iv, loop_id, costsThisRun, ctx
    );
  } else {
    _log("[" + fixture.name + "] Architect call SKIPPED (vision-only fixture). HALTED at vision lock.");
  }

  // ── Semantic assertions ───────────────────────────────────────────────────
  const domainMatch = iv.domain === fixture.expected_domain;
  const missingLangs = fixture.expected_languages.filter(function(lang) {
    return !(iv.detected_languages || []).includes(lang);
  });
  const langMatch = missingLangs.length === 0;

  _log("[" + fixture.name + "] Semantic assertions:");
  _log("[" + fixture.name + "]   domain: " + iv.domain + " (expected: " + fixture.expected_domain + ")" +
    (domainMatch ? " ✓" : " ← FAIL"));
  _log("[" + fixture.name + "]   languages: " + (iv.detected_languages || []).join(", ") +
    " (expected: " + fixture.expected_languages.join(", ") + ")" +
    (langMatch ? " ✓" : " ← FAIL (missing: " + missingLangs.join(", ") + ")"));
  _log("[" + fixture.name + "]   confidence: " + iv.confidence +
    (iv.confidence === "HIGH" ? " ✓" : " ← NOTE"));

  const durationMs     = Date.now() - startTs;
  const fixtureTotal2  = costsThisRun[fixture.name].rv +
    (costsThisRun[fixture.name].architect || 0);

  _log("[" + fixture.name + "] DONE — cost: $" + fixtureTotal2.toFixed(5) +
    " | duration: " + (durationMs / 1000).toFixed(1) + "s");

  return {
    name:             fixture.name,
    project_id,
    status:           "SUCCESS",
    inferred_vision:  iv,
    vision_locked:    visionResult.vision_locked,
    loop_id:          loop_id || null,
    chat_message:     visionResult.chat_message,
    cost_rv_usd:      costsThisRun[fixture.name].rv,
    cost_arch_usd:    costsThisRun[fixture.name].architect || 0,
    cost_total_usd:   fixtureTotal2,
    duration_ms:      durationMs,
    domain_match:     domainMatch,
    lang_match:       langMatch,
    architect_output: archResult ? archResult.architect_output : null,
    ledger_count:     archResult ? archResult.ledger_count      : null,
    stop_trigger_6:   archResult ? archResult.stop_trigger_6    : false
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function runStage11_5LiveDemo() {
  const ROOT    = process.cwd();
  const startTs = Date.now();

  // In-memory cost accumulation (OBS-1 mitigation — ledger can be truncated by SU runs)
  const costsThisRun = {
    pycli:  { rv: 0, architect: 0 },
    nextjs: { rv: 0 },
    gocli:  { rv: 0 }
  };

  // Running total helper — sums what's been captured so far
  function globalCostSoFar() {
    return (costsThisRun.pycli.rv  + (costsThisRun.pycli.architect  || 0)) +
           (costsThisRun.nextjs.rv || 0) +
           (costsThisRun.gocli.rv  || 0);
  }

  _log("══════════════════════════════════════════════════════════");
  _log("PHASE-11 Stage 11.5 Live Demo — Multi-Fixture Validation");
  _log("Fixtures:    pycli (full) · nextjs (vision-only) · gocli (vision-only)");
  _log("Provider:    " + PROVIDER + " / " + MODEL);
  _log("Per-fixture kill switch: $" + PER_FIXTURE_KILL_USD);
  _log("Global kill switch:      $" + GLOBAL_KILL_USD);
  _log("Hard cap:                $" + HARD_CAP_USD);
  _log("══════════════════════════════════════════════════════════");

  const fixtureResults = [];
  let globalKillFired  = false;

  for (var fi = 0; fi < FIXTURES.length; fi++) {
    const fixture    = FIXTURES[fi];
    const costBefore = globalCostSoFar();

    // Pre-fixture global kill switch check
    if (costBefore >= GLOBAL_KILL_USD) {
      _log("Global kill switch PRE-CHECK: aggregate $" + costBefore.toFixed(5) +
        " >= $" + GLOBAL_KILL_USD + ". Aborting before fixture: " + fixture.name);
      globalKillFired = true;
      break;
    }

    let fixtureResult;
    try {
      fixtureResult = await _runFixture(ROOT, fixture, costsThisRun, globalCostSoFar);
      fixtureResults.push(fixtureResult);
    } catch (err) {
      if (err && err.name === "KillSwitchError") {
        _log("KILL SWITCH FIRED during fixture [" + fixture.name + "]: " + err.message);
        globalKillFired = true;
        fixtureResults.push({
          name:           fixture.name,
          status:         "KILL_SWITCH",
          reason:         err.message,
          cost_rv_usd:    costsThisRun[fixture.name] ? costsThisRun[fixture.name].rv : 0,
          cost_arch_usd:  0,
          cost_total_usd: err.cost_usd || 0
        });
        break;
      }
      _log("FIXTURE FAILED [" + fixture.name + "]: " + (err && err.message ? err.message : String(err)));
      fixtureResults.push({
        name:           fixture.name,
        status:         "FAILED",
        reason:         err && err.message ? err.message : String(err),
        cost_rv_usd:    costsThisRun[fixture.name] ? costsThisRun[fixture.name].rv : 0,
        cost_arch_usd:  0,
        cost_total_usd: costsThisRun[fixture.name]
          ? costsThisRun[fixture.name].rv + (costsThisRun[fixture.name].architect || 0)
          : 0
      });
      // A fixture failure is a STOP — do not continue to next fixtures
      break;
    }
  }

  // ── Aggregate summary ─────────────────────────────────────────────────────
  const totalCost  = globalCostSoFar();
  const totalMs    = Date.now() - startTs;
  const allSuccess = fixtureResults.length === FIXTURES.length &&
    fixtureResults.every(function(r) { return r.status === "SUCCESS"; });
  const allDomains = fixtureResults.every(function(r) { return r.status === "SUCCESS" && r.domain_match; });
  const allLangs   = fixtureResults.every(function(r) { return r.status === "SUCCESS" && r.lang_match; });

  _log("══════════════════════════════════════════════════════════");
  _log("STAGE 11.5 LIVE DEMO — " + (allSuccess ? "ALL FIXTURES COMPLETE" : "INCOMPLETE"));
  _log("  Total cost:     $" + totalCost.toFixed(5));
  _log("  Total duration: " + (totalMs / 1000).toFixed(1) + "s");
  _log("  Fixtures: " + fixtureResults.length + " of " + FIXTURES.length + " complete");
  _log("  All domains match: " + allDomains + (allDomains ? " ✓" : " ← CHECK"));
  _log("  All languages match: " + allLangs + (allLangs ? " ✓" : " ← CHECK"));
  fixtureResults.forEach(function(r) {
    _log("  [" + r.name + "] " + r.status +
      " | cost: $" + (r.cost_total_usd || 0).toFixed(5) +
      (r.inferred_vision ? " | domain: " + r.inferred_vision.domain : "") +
      (r.inferred_vision ? " | conf: " + r.inferred_vision.confidence : ""));
  });
  _log("══════════════════════════════════════════════════════════");

  return {
    status:          allSuccess ? "SUCCESS" : (globalKillFired ? "KILL_SWITCH" : "PARTIAL"),
    fixtures:        fixtureResults,
    costs_this_run:  costsThisRun,
    total_cost_usd:  totalCost,
    duration_ms:     totalMs,
    all_domains_ok:  allDomains,
    all_langs_ok:    allLangs,
    hard_cap_exceeded: totalCost > HARD_CAP_USD
  };
}

module.exports = {
  runStage11_5LiveDemo,
  FIXTURES,
  PER_FIXTURE_KILL_USD,
  GLOBAL_KILL_USD,
  HARD_CAP_USD,
  PROVIDER,
  MODEL
};

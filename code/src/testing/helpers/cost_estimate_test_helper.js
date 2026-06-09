"use strict";

// S273-S276 helpers — PHASE-25 Cost Estimate Bridge.
//
// S273: happy-path — loop seeded COST_ESTIMATE, mock returns valid estimate → ENV_REPORT
// S274: wrong-state guard — loop at REVIEWER_SPEC → estimate_error:WRONG_STATE, advanced:false
// S275: input-missing — loop at COST_ESTIMATE, no spec/design files → INPUT_NOT_FOUND, advanced:false
// S276: role-failure — mock returns invalid output (fails OUTPUT_SCHEMA) → ESTIMATE_FAILED, advanced:false
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync
// are used here only for test fixture setup, not in production code.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

function _ensureProjectDir(projectId) {
  const projectDir = path.join(PROJECTS_ROOT, projectId);
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

function _writeState(projectDir, state) {
  fs.writeFileSync(
    path.join(projectDir, "project_state.json"),
    JSON.stringify(state, null, 2),
    "utf8"
  );
}

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

function _makeDesignFixture() {
  return {
    design_summary: "A task management REST API using Node.js and SQLite.",
    components: [{ name: "API Server", tech: "Node.js/Express", purpose: "Handles HTTP requests" }],
    data_flow: "Client → API Server → SQLite → response",
    technology_choices: [{ category: "language", choice: "JavaScript", rationale: "team expertise" }],
    integration_points: [{ name: "REST API", type: "API", notes: "JSON endpoints" }],
    identified_risks: [{ risk: "Data loss", severity: "LOW", mitigation: "Backups" }]
  };
}

function _makeSpecFixture() {
  return {
    scope: "REST API لإدارة المهام باستخدام Node.js وSQLite.",
    decisions: [{ decision: "استخدام Express.js كإطار HTTP", rationale: "إعداد بسيط" }],
    acceptance_criteria: [{ id: "AC-1", description: "POST /tasks يُعيد 201 على مدخل صالح" }],
    files_to_create: [{ path: "src/app.js", purpose: "نقطة دخول Express" }],
    files_to_modify: [],
    out_of_scope: ["مزامنة الوقت الحقيقي"]
  };
}

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

// Seed a loop at COST_ESTIMATE:
// start_loop (intake) → ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC → COST_ESTIMATE.
// Writes spec.json + architect_design.json only if opts.writeFiles is true.
async function _seedLoopAtCostEstimate(projectId, loopId, opts) {
  const writeFiles = opts && opts.writeFiles !== false;
  const reg = require("../../runtime/tools/_registry").getDefaultRegistry();

  await reg.invoke("orchestration.start_loop", {
    project_id:          projectId,
    loop_id:             loopId,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  // ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE
  await reg.invoke("orchestration.advance_state", {
    project_id:      projectId,
    loop_id:         loopId,
    to_state:        "SPEC_WRITER_FORMALIZE",
    transition_type: "NORMAL",
    role_invoked:    "architect"
  }, { root: ROOT });

  // SPEC_WRITER_FORMALIZE → REVIEWER_SPEC
  await reg.invoke("orchestration.advance_state", {
    project_id:      projectId,
    loop_id:         loopId,
    to_state:        "REVIEWER_SPEC",
    transition_type: "NORMAL",
    role_invoked:    "spec_writer"
  }, { root: ROOT });

  const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);
  fs.mkdirSync(orchDir, { recursive: true });

  if (writeFiles) {
    fs.writeFileSync(
      path.join(orchDir, "architect_design.json"),
      JSON.stringify(_makeDesignFixture(), null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(orchDir, "spec.json"),
      JSON.stringify(_makeSpecFixture(), null, 2),
      "utf8"
    );
  }

  // REVIEWER_SPEC → COST_ESTIMATE
  await reg.invoke("orchestration.advance_state", {
    project_id:      projectId,
    loop_id:         loopId,
    to_state:        "COST_ESTIMATE",
    transition_type: "NORMAL",
    role_invoked:    "reviewer"
  }, { root: ROOT });
}

// ── S273 — happy-path: COST_ESTIMATE → ENV_REPORT, estimate present ───────────

async function runS273EstimateCostHappyPath() {
  const PID     = "s273_estimate_happy";
  const LOOP_ID = "s273-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S273 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtCostEstimate(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.estimateCost({
      project_id:           PID,
      loop_id:              LOOP_ID,
      estimate_provider:    "mock",
      estimate_model:       "mock",
      estimate_scenario_id: "S273"
    });

    const advanced_to_env_report = result.advanced_to === "ENV_REPORT";
    const estimate_present       = result.estimate && typeof result.estimate.summary === "string";
    const has_phases             = Array.isArray(result.estimate && result.estimate.phases);

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_env_report = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ENV_REPORT";

    return { advanced_to_env_report, estimate_present, has_phases, graph_state_env_report };
  } finally {
    _cleanup(PID);
  }
}

// ── S274 — wrong-state guard: loop at REVIEWER_SPEC → WRONG_STATE ─────────────

async function runS274WrongState() {
  const PID     = "s274_wrong_state";
  const LOOP_ID = "s274-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S274 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at REVIEWER_SPEC only (do NOT advance to COST_ESTIMATE)
    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    await reg.invoke("orchestration.start_loop", {
      project_id: PID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake"
    }, { root: ROOT });
    await reg.invoke("orchestration.advance_state", {
      project_id: PID, loop_id: LOOP_ID,
      to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect"
    }, { root: ROOT });
    await reg.invoke("orchestration.advance_state", {
      project_id: PID, loop_id: LOOP_ID,
      to_state: "REVIEWER_SPEC", transition_type: "NORMAL", role_invoked: "spec_writer"
    }, { root: ROOT });

    const engine = _makeEngine();
    const result = await engine.estimateCost({
      project_id:        PID,
      loop_id:           LOOP_ID,
      estimate_provider: "mock"
    });

    const ok_true                  = result.ok === true;
    const estimate_error_wrong     = result.estimate_error === "WRONG_STATE";
    const advanced_false           = result.advanced !== true;
    const current_state_echoed     = result.current_state === "REVIEWER_SPEC";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_reviewer_spec = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "REVIEWER_SPEC";

    return { ok_true, estimate_error_wrong, advanced_false, current_state_echoed, graph_still_reviewer_spec };
  } finally {
    _cleanup(PID);
  }
}

// ── S275 — input-missing: COST_ESTIMATE but no spec/design files → INPUT_NOT_FOUND

async function runS275InputNotFound() {
  const PID     = "s275_input_missing";
  const LOOP_ID = "s275-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S275 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at COST_ESTIMATE but do NOT write spec/design files
    await _seedLoopAtCostEstimate(PID, LOOP_ID, { writeFiles: false });

    const engine = _makeEngine();
    const result = await engine.estimateCost({
      project_id:        PID,
      loop_id:           LOOP_ID,
      estimate_provider: "mock"
    });

    const ok_true                   = result.ok === true;
    const estimate_error_not_found  = result.estimate_error === "INPUT_NOT_FOUND";
    const advanced_false            = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_cost_estimate = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "COST_ESTIMATE";

    return { ok_true, estimate_error_not_found, advanced_false, graph_still_cost_estimate };
  } finally {
    _cleanup(PID);
  }
}

// ── S276 — role-failure: mock returns invalid output → ESTIMATE_FAILED, no advance

async function runS276RoleFailure() {
  const PID     = "s276_role_failure";
  const LOOP_ID = "s276-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S276 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtCostEstimate(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.estimateCost({
      project_id:           PID,
      loop_id:              LOOP_ID,
      estimate_provider:    "mock",
      estimate_model:       "gpt-4o",  // proves model_used echoes the resolved value
      estimate_scenario_id: "S276"     // mock returns invalid JSON → fails OUTPUT_SCHEMA → non-SUCCESS
    });

    const ok_true            = result.ok === true;
    const estimate_error_set = typeof result.estimate_error === "string" && result.estimate_error.length > 0;
    const advanced_false     = result.advanced !== true;
    const model_used_gpt4o   = result.model_used === "gpt-4o";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_cost_estimate = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "COST_ESTIMATE";

    return { ok_true, estimate_error_set, advanced_false, model_used_gpt4o, graph_still_cost_estimate };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS273EstimateCostHappyPath,
  runS274WrongState,
  runS275InputNotFound,
  runS276RoleFailure
};

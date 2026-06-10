"use strict";

// S284-S287 helpers — PHASE-27 Design Tests Bridge.
//
// S284: happy-path — loop seeded TEST_DESIGN, mock returns valid test plan → BUILDER,
//       test_plan.json written.
// S285: wrong-state guard — loop at ENV_REPORT → test_error:WRONG_STATE, advanced:false.
// S286: input-missing — loop at TEST_DESIGN, no spec/design files → INPUT_NOT_FOUND, advanced:false.
// S287: role-failure — mock returns invalid output (fails OUTPUT_SCHEMA) → TEST_DESIGN_FAILED, advanced:false.
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

// Seed a loop at TEST_DESIGN:
// start_loop → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC → COST_ESTIMATE → ENV_REPORT
//   → (Gate 1 APPROVE) → TEST_DESIGN.
// Writes spec.json + architect_design.json only if opts.writeFiles is true.
async function _seedLoopAtTestDesign(projectId, loopId, opts) {
  const writeFiles = opts && opts.writeFiles !== false;
  const reg = require("../../runtime/tools/_registry").getDefaultRegistry();

  await reg.invoke("orchestration.start_loop", {
    project_id:          projectId,
    loop_id:             loopId,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "REVIEWER_SPEC", transition_type: "NORMAL", role_invoked: "spec_writer"
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

  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "ENV_REPORT", transition_type: "NORMAL", role_invoked: "cost_estimator"
  }, { root: ROOT });

  // Gate 1 APPROVE: ENV_REPORT → TEST_DESIGN
  await reg.invoke("orchestration.respond", {
    project_id: projectId,
    loop_id:    loopId,
    gate_id:    1,
    response:   "APPROVE"
  }, { root: ROOT });
}

// ── S284 — happy-path: TEST_DESIGN, role runs, test_plan.json written, advances BUILDER ──

async function runS284DesignTestsHappyPath() {
  const PID     = "s284_design_happy";
  const LOOP_ID = "s284-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S284 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtTestDesign(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.designTests({
      project_id:          PID,
      loop_id:             LOOP_ID,
      test_provider:       "mock",
      test_model:          "mock",
      test_scenario_id:    "S284"
    });

    const advanced_to_builder  = result.advanced_to === "BUILDER";
    const test_plan_present    = result.test_plan && Array.isArray(result.test_plan.scenarios);
    const has_coverage_summary = result.test_plan && typeof result.test_plan.coverage_summary === "object";
    const advanced_true        = result.advanced === true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_builder = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "BUILDER";

    // Refinement: verify test_plan.json was persisted to disk
    const planPath = path.join(ROOT, "artifacts", "projects", PID,
      "orchestration", LOOP_ID, "test_plan.json");
    const test_plan_file_written = fs.existsSync(planPath);

    return {
      advanced_to_builder, test_plan_present, has_coverage_summary,
      advanced_true, graph_state_builder, test_plan_file_written
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S285 — wrong-state guard: loop at ENV_REPORT → WRONG_STATE ────────────────

async function runS285WrongState() {
  const PID     = "s285_wrong_state";
  const LOOP_ID = "s285-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S285 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at ENV_REPORT only (do NOT fire Gate 1 to advance to TEST_DESIGN)
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
    await reg.invoke("orchestration.advance_state", {
      project_id: PID, loop_id: LOOP_ID,
      to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
    }, { root: ROOT });
    await reg.invoke("orchestration.advance_state", {
      project_id: PID, loop_id: LOOP_ID,
      to_state: "ENV_REPORT", transition_type: "NORMAL", role_invoked: "cost_estimator"
    }, { root: ROOT });

    const engine = _makeEngine();
    const result = await engine.designTests({
      project_id:    PID,
      loop_id:       LOOP_ID,
      test_provider: "mock"
    });

    const ok_true              = result.ok === true;
    const test_error_wrong     = result.test_error === "WRONG_STATE";
    const advanced_false       = result.advanced !== true;
    const current_state_echoed = result.current_state === "ENV_REPORT";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_env_report = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ENV_REPORT";

    return { ok_true, test_error_wrong, advanced_false, current_state_echoed, graph_still_env_report };
  } finally {
    _cleanup(PID);
  }
}

// ── S286 — input-missing: TEST_DESIGN but no spec/design files → INPUT_NOT_FOUND ─

async function runS286InputNotFound() {
  const PID     = "s286_input_missing";
  const LOOP_ID = "s286-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S286 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at TEST_DESIGN but do NOT write spec/design files
    await _seedLoopAtTestDesign(PID, LOOP_ID, { writeFiles: false });

    const engine = _makeEngine();
    const result = await engine.designTests({
      project_id:    PID,
      loop_id:       LOOP_ID,
      test_provider: "mock"
    });

    const ok_true                  = result.ok === true;
    const test_error_not_found     = result.test_error === "INPUT_NOT_FOUND";
    const advanced_false           = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_test_design = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "TEST_DESIGN";

    return { ok_true, test_error_not_found, advanced_false, graph_still_test_design };
  } finally {
    _cleanup(PID);
  }
}

// ── S287 — role-failure: mock returns invalid output → TEST_DESIGN_FAILED, no advance ─

async function runS287RoleFailure() {
  const PID     = "s287_role_failure";
  const LOOP_ID = "s287-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S287 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtTestDesign(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.designTests({
      project_id:       PID,
      loop_id:          LOOP_ID,
      test_provider:    "mock",
      test_model:       "gpt-4o",  // proves model_used echoes the resolved value
      test_scenario_id: "S287"     // mock returns invalid JSON → fails OUTPUT_SCHEMA → non-SUCCESS
    });

    const ok_true             = result.ok === true;
    const test_error_set      = typeof result.test_error === "string" && result.test_error.length > 0;
    const advanced_false      = result.advanced !== true;
    const model_used_gpt4o    = result.model_used === "gpt-4o";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_test_design = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "TEST_DESIGN";

    return { ok_true, test_error_set, advanced_false, model_used_gpt4o, graph_still_test_design };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS284DesignTestsHappyPath,
  runS285WrongState,
  runS286InputNotFound,
  runS287RoleFailure
};

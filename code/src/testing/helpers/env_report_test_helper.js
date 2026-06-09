"use strict";

// S277-S283 helpers — PHASE-26 Env Report Bridge + Gate 1.
//
// S277: happy-path — loop seeded ENV_REPORT, mock returns valid env report,
//       env_report.json written, gate_pending:1, loop stays ENV_REPORT.
// S278: wrong-state guard — loop at COST_ESTIMATE → env_error:WRONG_STATE, advanced:false.
// S279: input-missing — loop at ENV_REPORT, no spec/design files → INPUT_NOT_FOUND, advanced:false.
// S280: role-failure — mock returns invalid output (fails OUTPUT_SCHEMA) → ENV_REPORT_FAILED, advanced:false.
// S281: respond APPROVE — loop at ENV_REPORT → gate fires → advanced_to:TEST_DESIGN.
// S282: respond REJECT — loop at ENV_REPORT → gate fires → advanced_to:ESCALATED.
// S283: respond invalid — invalid response token → INVALID_GATE_RESPONSE, advanced:false.
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

// Seed a loop at ENV_REPORT:
// start_loop (intake) → ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC
//   → COST_ESTIMATE → ENV_REPORT.
// Writes spec.json + architect_design.json only if opts.writeFiles is true.
async function _seedLoopAtEnvReport(projectId, loopId, opts) {
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
}

// ── S277 — happy-path: ENV_REPORT, role runs, env_report.json written, gate_pending:1 ──

async function runS277EnvReportHappyPath() {
  const PID     = "s277_env_happy";
  const LOOP_ID = "s277-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S277 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtEnvReport(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.reportEnv({
      project_id:       PID,
      loop_id:          LOOP_ID,
      env_provider:     "mock",
      env_model:        "mock",
      env_scenario_id:  "S277"
    });

    const gate_pending_1     = result.gate_pending === 1;
    const advanced_false     = result.advanced === false;
    const env_report_present = result.env_report && typeof result.env_report.target_environment === "string";
    const has_summary        = typeof (result.env_report && result.env_report.summary) === "string";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_env_report = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ENV_REPORT";

    // Refinement 1: verify env_report.json was persisted
    const reportPath = path.join(ROOT, "artifacts", "projects", PID,
      "orchestration", LOOP_ID, "env_report.json");
    const env_report_file_written = fs.existsSync(reportPath);

    return {
      gate_pending_1, advanced_false, env_report_present,
      has_summary, graph_still_env_report, env_report_file_written
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S278 — wrong-state guard: loop at COST_ESTIMATE → WRONG_STATE ─────────────

async function runS278WrongState() {
  const PID     = "s278_wrong_state";
  const LOOP_ID = "s278-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S278 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at COST_ESTIMATE (not ENV_REPORT)
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

    const engine = _makeEngine();
    const result = await engine.reportEnv({
      project_id:   PID,
      loop_id:      LOOP_ID,
      env_provider: "mock"
    });

    const ok_true              = result.ok === true;
    const env_error_wrong      = result.env_error === "WRONG_STATE";
    const advanced_false       = result.advanced !== true;
    const current_state_echoed = result.current_state === "COST_ESTIMATE";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_cost_estimate = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "COST_ESTIMATE";

    return { ok_true, env_error_wrong, advanced_false, current_state_echoed, graph_still_cost_estimate };
  } finally {
    _cleanup(PID);
  }
}

// ── S279 — input-missing: ENV_REPORT but no spec/design files → INPUT_NOT_FOUND ─

async function runS279InputNotFound() {
  const PID     = "s279_input_missing";
  const LOOP_ID = "s279-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S279 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at ENV_REPORT but do NOT write spec/design files
    await _seedLoopAtEnvReport(PID, LOOP_ID, { writeFiles: false });

    const engine = _makeEngine();
    const result = await engine.reportEnv({
      project_id:   PID,
      loop_id:      LOOP_ID,
      env_provider: "mock"
    });

    const ok_true                = result.ok === true;
    const env_error_not_found    = result.env_error === "INPUT_NOT_FOUND";
    const advanced_false         = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_env_report = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ENV_REPORT";

    return { ok_true, env_error_not_found, advanced_false, graph_still_env_report };
  } finally {
    _cleanup(PID);
  }
}

// ── S280 — role-failure: mock returns invalid output → ENV_REPORT_FAILED, no advance ─

async function runS280RoleFailure() {
  const PID     = "s280_role_failure";
  const LOOP_ID = "s280-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S280 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtEnvReport(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.reportEnv({
      project_id:      PID,
      loop_id:         LOOP_ID,
      env_provider:    "mock",
      env_model:       "gpt-4o",
      env_scenario_id: "S280"
    });

    const ok_true           = result.ok === true;
    const env_error_set     = typeof result.env_error === "string" && result.env_error.length > 0;
    const advanced_false    = result.advanced !== true;
    const model_used_gpt4o  = result.model_used === "gpt-4o";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_env_report = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ENV_REPORT";

    return { ok_true, env_error_set, advanced_false, model_used_gpt4o, graph_still_env_report };
  } finally {
    _cleanup(PID);
  }
}

// ── S281 — respond APPROVE: loop ENV_REPORT → gate fires → TEST_DESIGN ────────

async function runS281RespondApprove() {
  const PID     = "s281_respond_approve";
  const LOOP_ID = "s281-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S281 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtEnvReport(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id: PID,
      loop_id:    LOOP_ID,
      gate_id:    1,
      response:   "APPROVE"
    });

    const ok_true              = result.ok === true;
    const advanced_true        = result.advanced === true;
    const advanced_to_test     = result.advanced_to === "TEST_DESIGN";
    const gate_id_1            = result.gate_id === 1;
    const response_approve     = result.response === "APPROVE";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_test_design = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "TEST_DESIGN";

    return { ok_true, advanced_true, advanced_to_test, gate_id_1, response_approve, graph_test_design };
  } finally {
    _cleanup(PID);
  }
}

// ── S282 — respond REJECT: loop ENV_REPORT → gate fires → ESCALATED ───────────

async function runS282RespondReject() {
  const PID     = "s282_respond_reject";
  const LOOP_ID = "s282-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S282 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtEnvReport(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id: PID,
      loop_id:    LOOP_ID,
      gate_id:    1,
      response:   "REJECT"
    });

    const ok_true              = result.ok === true;
    const advanced_true        = result.advanced === true;
    const advanced_to_escalated = result.advanced_to === "ESCALATED";
    const gate_id_1            = result.gate_id === 1;
    const response_reject      = result.response === "REJECT";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_escalated = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ESCALATED";

    return { ok_true, advanced_true, advanced_to_escalated, gate_id_1, response_reject, graph_escalated };
  } finally {
    _cleanup(PID);
  }
}

// ── S283 — respond invalid: bad response token → INVALID_GATE_RESPONSE ────────

async function runS283RespondInvalid() {
  const PID     = "s283_respond_invalid";
  const LOOP_ID = "s283-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S283 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtEnvReport(PID, LOOP_ID, { writeFiles: true });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id: PID,
      loop_id:    LOOP_ID,
      gate_id:    1,
      response:   "INVALID_RESPONSE_TOKEN"
    });

    const ok_true                = result.ok === true;
    const gate_error_invalid     = result.gate_error === "INVALID_GATE_RESPONSE";
    const advanced_false         = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_env_report = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ENV_REPORT";

    return { ok_true, gate_error_invalid, advanced_false, graph_still_env_report };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS277EnvReportHappyPath,
  runS278WrongState,
  runS279InputNotFound,
  runS280RoleFailure,
  runS281RespondApprove,
  runS282RespondReject,
  runS283RespondInvalid
};

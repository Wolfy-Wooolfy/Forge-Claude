"use strict";

// PHASE-34 — Deployment bridge (deployProject) + Gate 3 (respondGate) test helpers.
//
// MID scope (this checkpoint): S315 (skip path), S316 (gated happy path), S317 (Gate 3
// APPROVE with selected_target → LIVE_DELIVERABLE — positive proof of LOCK-1). The fail-
// closed guards (wrong-state / input-not-found / role-failure / APPROVE-missing-target),
// Gate 3 REJECT→ESCALATED, and finalizeDeliverable (→COMPLETE) are added in STEP A.
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync /
// fs.existsSync / fs.readFileSync are used here only for test fixture setup and
// assertions, not in production code.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

function _ensureProjectDir(projectId) {
  const d = path.join(PROJECTS_ROOT, projectId);
  fs.mkdirSync(d, { recursive: true });
  return d;
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

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
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
    acceptance_criteria: [
      { id: "AC-1", description: "POST /todos يُعيد 201 على مدخل صالح" },
      { id: "AC-2", description: "PUT /todos/:id غير موجود يُعيد 404" }
    ],
    files_to_create: [
      { path: "src/controllers/todoController.js", purpose: "معالجات CRUD" }
    ],
    files_to_modify: [],
    out_of_scope: ["مزامنة الوقت الحقيقي"]
  };
}

async function _currentState(projectId, loopId) {
  const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
  const statusResult = await reg.invoke("orchestration.get_status", {
    project_id: projectId, loop_id: loopId
  }, { root: ROOT });
  return (statusResult && statusResult.status === "SUCCESS")
    ? statusResult.output.current_state : null;
}

async function _readLog(projectId, loopId) {
  const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
  const logResult = await reg.invoke("orchestration.read_log", {
    project_id: projectId, loop_id: loopId
  }, { root: ROOT });
  return (logResult && logResult.status === "SUCCESS") ? logResult.output.rows : [];
}

function _readDeploymentPlan(projectId, loopId) {
  const p = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "deployment_plan.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function _deploymentPlanExists(projectId, loopId) {
  return fs.existsSync(
    path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "deployment_plan.json")
  );
}

// Seed a loop to DEPLOYMENT_OR_END. Drives the full normal path to QUALITY_JUDGE, then
// fires Gate 2 APPROVE_SHIP (QUALITY_JUDGE → DEPLOYMENT_OR_END). orchestration.respond
// supplies its own gate_responder, so no FORGE_OWNER_AUTO_APPROVE is needed.
// opts.writeInputs (default true) → write spec.json + architect_design.json (gated path needs them)
async function _seedLoopAtDeploymentOrEnd(projectId, loopId, opts) {
  const o           = opts || {};
  const writeInputs = o.writeInputs !== false;

  const reg     = require("../../runtime/tools/_registry").getDefaultRegistry();
  const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);

  await reg.invoke("orchestration.start_loop", {
    project_id: projectId, loop_id: loopId, owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  const NORMAL_TO_GATE1 = [
    ["SPEC_WRITER_FORMALIZE", "architect"],
    ["REVIEWER_SPEC",         "spec_writer"],
    ["COST_ESTIMATE",         "reviewer"],
    ["ENV_REPORT",            "cost_estimator"]
  ];
  for (const [to, role] of NORMAL_TO_GATE1) {
    await reg.invoke("orchestration.advance_state", {
      project_id: projectId, loop_id: loopId,
      to_state: to, transition_type: "NORMAL", role_invoked: role
    }, { root: ROOT });
  }

  // Gate 1 APPROVE → TEST_DESIGN
  await reg.invoke("orchestration.respond", {
    project_id: projectId, loop_id: loopId, gate_id: 1, response: "APPROVE"
  }, { root: ROOT });

  const NORMAL_TO_QJ = [
    ["BUILDER",                    "test_designer"],
    ["RUN_TESTS",                  "builder"],
    ["REVIEWER_CODE_AND_SECURITY", "builtproject"],
    ["DOCUMENTATION",              "reviewer"],
    ["QUALITY_JUDGE",              "documentation"]
  ];
  for (const [to, role] of NORMAL_TO_QJ) {
    await reg.invoke("orchestration.advance_state", {
      project_id: projectId, loop_id: loopId,
      to_state: to, transition_type: "NORMAL", role_invoked: role
    }, { root: ROOT });
  }

  // Gate 2 APPROVE_SHIP → DEPLOYMENT_OR_END
  await reg.invoke("orchestration.respond", {
    project_id: projectId, loop_id: loopId, gate_id: 2, response: "APPROVE_SHIP"
  }, { root: ROOT });

  fs.mkdirSync(orchDir, { recursive: true });
  if (writeInputs) {
    fs.writeFileSync(path.join(orchDir, "architect_design.json"),
      JSON.stringify(_makeDesignFixture(), null, 2), "utf8");
    fs.writeFileSync(path.join(orchDir, "spec.json"),
      JSON.stringify(_makeSpecFixture(), null, 2), "utf8");
  }
}

// ── S315 — skip path: deployment_enabled=false → VACUOUS_SKIP → LIVE_DELIVERABLE ──
// LOCK-4: reuse orchestration.advance_state(transition_type:"VACUOUS_SKIP"). No role,
// no gate; no deployment_plan written.

async function runS315DeploySkipPath() {
  const PID     = "s315_deploy_skip";
  const LOOP_ID = "s315-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S315 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // No inputs needed — the skip path never reads spec/design.
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false });

    const engine = _makeEngine();
    const result = await engine.deployProject({
      project_id:         PID,
      loop_id:            LOOP_ID,
      deployment_enabled: false
    });

    const advanced_true              = result.advanced === true;
    const advanced_to_live           = result.advanced_to === "LIVE_DELIVERABLE";
    const skipped_true               = result.skipped === true;
    const no_deployment_plan_written = !_deploymentPlanExists(PID, LOOP_ID);
    const graph_live_deliverable     = (await _currentState(PID, LOOP_ID)) === "LIVE_DELIVERABLE";

    const rows = await _readLog(PID, LOOP_ID);
    const vacuousRow = rows.find(r => r.transition_type === "VACUOUS_SKIP" &&
      r.from_state === "DEPLOYMENT_OR_END" && r.to_state === "LIVE_DELIVERABLE");
    const vacuous_skip_row_present = !!vacuousRow;
    const vacuous_skip_no_role     = !!vacuousRow && (vacuousRow.role_invoked === null ||
      vacuousRow.role_invoked === undefined);
    const no_gate3_row             = !rows.some(r => r.owner_gate_id === 3);

    return {
      advanced_true, advanced_to_live, skipped_true, no_deployment_plan_written,
      graph_live_deliverable, vacuous_skip_row_present, vacuous_skip_no_role, no_gate3_row
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S316 — gated happy path: role SUCCESS → deployment_plan persisted → gate_pending:3,
// advanced:false, loop STAYS at DEPLOYMENT_OR_END (no advance; awaits owner Gate 3). ──

async function runS316DeployGatedHappyPath() {
  const PID     = "s316_deploy_gated_happy";
  const LOOP_ID = "s316-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S316 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Gated path needs spec.json + architect_design.json on disk.
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: true });

    const engine = _makeEngine();
    const result = await engine.deployProject({
      project_id:         PID,
      loop_id:            LOOP_ID,
      deploy_provider:    "mock",
      deploy_model:       "mock-dep-s316",
      deploy_scenario_id: "S316"
      // deployment_enabled omitted → default (undefined) → gated path (LOCK-6)
    });

    const gate_pending_3 = result.gate_pending === 3;
    const advanced_false = result.advanced === false;
    const deployment_plan_present = !!(result.deployment_plan &&
      typeof result.deployment_plan.target_environment === "string" &&
      typeof result.deployment_plan.summary === "string");

    const dp = _readDeploymentPlan(PID, LOOP_ID);
    const deployment_plan_written = !!(dp && dp.target_environment && dp.summary);

    const graph_still_deployment_or_end = (await _currentState(PID, LOOP_ID)) === "DEPLOYMENT_OR_END";

    return {
      gate_pending_3, advanced_false, deployment_plan_present,
      deployment_plan_written, graph_still_deployment_or_end
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S317 — respond-gate3 APPROVE (with selected_target) → LIVE_DELIVERABLE ─────────
// Positive proof of LOCK-1: respondGate forwards body.selected_target into
// orchestration.respond → fireGate. Had it NOT been forwarded, fireGate(3,"APPROVE")
// would throw (Gate 3 APPROVE requires selected_target) → GATE_RESPOND_FAILED →
// advanced:false → this scenario would FAIL. Green here = selected_target flows end-to-end.

async function runS317RespondGate3Approve() {
  const PID     = "s317_gate3_approve";
  const LOOP_ID = "s317-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S317 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // respondGate only needs the loop parked at DEPLOYMENT_OR_END.
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id:      PID,
      loop_id:         LOOP_ID,
      gate_id:         3,
      response:        "APPROVE",
      selected_target: "vercel-production"
    });

    const ok_true                = result.ok === true;
    const advanced_true          = result.advanced === true;
    const advanced_to_live       = result.advanced_to === "LIVE_DELIVERABLE";
    const gate_id_3              = result.gate_id === 3;
    const response_approve       = result.response === "APPROVE";
    const graph_live_deliverable = (await _currentState(PID, LOOP_ID)) === "LIVE_DELIVERABLE";

    const rows = await _readLog(PID, LOOP_ID);
    const gate3Row = rows.find(r => r.transition_type === "GATE_APPROVE" &&
      r.owner_gate_id === 3 && r.from_state === "DEPLOYMENT_OR_END" &&
      r.to_state === "LIVE_DELIVERABLE");
    const gate3_approve_row_present = !!gate3Row;

    return {
      ok_true, advanced_true, advanced_to_live, gate_id_3, response_approve,
      graph_live_deliverable, gate3_approve_row_present
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS315DeploySkipPath,
  runS316DeployGatedHappyPath,
  runS317RespondGate3Approve
};

"use strict";

// PHASE-34 — Deployment bridge (deployProject) + Gate 3 (respondGate) test helpers.
//
// MID: S315 (skip path), S316 (gated happy path), S317 (Gate 3 APPROVE with selected_target
// → LIVE_DELIVERABLE — positive proof of LOCK-1).
// STEP A: S318 (Gate 3 REJECT→ESCALATED), S319 (deploy WRONG_STATE), S320 (INPUT_NOT_FOUND),
// S321 (role-failure: DEPLOY_PARSE_FAILED + DEPLOYMENT_FAILED), S322 (Gate 3 APPROVE WITHOUT
// selected_target → fail-closed — negative proof of LOCK-1), S323 (finalizeDeliverable
// LIVE_DELIVERABLE→COMPLETE, LOCK-5), S324 (finalize wrong-state).
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

// Seed a loop along the normal path. Drives to QUALITY_JUDGE, then (unless stopped earlier)
// fires Gate 2 APPROVE_SHIP (QUALITY_JUDGE → DEPLOYMENT_OR_END), then (if requested) a
// VACUOUS_SKIP advance to LIVE_DELIVERABLE. orchestration.respond supplies its own
// gate_responder, so no FORGE_OWNER_AUTO_APPROVE is needed.
//   opts.writeInputs (default true)              → write spec.json + architect_design.json
//   opts.stopAt ("DEPLOYMENT_OR_END" default | "QUALITY_JUDGE" | "LIVE_DELIVERABLE")
async function _seedLoopAtDeploymentOrEnd(projectId, loopId, opts) {
  const o           = opts || {};
  const writeInputs = o.writeInputs !== false;
  const stopAt      = o.stopAt || "DEPLOYMENT_OR_END";

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

  // Now at QUALITY_JUDGE. Write inputs before any further advance.
  fs.mkdirSync(orchDir, { recursive: true });
  if (writeInputs) {
    fs.writeFileSync(path.join(orchDir, "architect_design.json"),
      JSON.stringify(_makeDesignFixture(), null, 2), "utf8");
    fs.writeFileSync(path.join(orchDir, "spec.json"),
      JSON.stringify(_makeSpecFixture(), null, 2), "utf8");
  }

  if (stopAt === "QUALITY_JUDGE") return;

  // Gate 2 APPROVE_SHIP → DEPLOYMENT_OR_END
  await reg.invoke("orchestration.respond", {
    project_id: projectId, loop_id: loopId, gate_id: 2, response: "APPROVE_SHIP"
  }, { root: ROOT });

  if (stopAt === "DEPLOYMENT_OR_END") return;

  if (stopAt === "LIVE_DELIVERABLE") {
    // VACUOUS_SKIP advance (deployment disabled) parks the loop at LIVE_DELIVERABLE.
    await reg.invoke("orchestration.advance_state", {
      project_id: projectId, loop_id: loopId,
      to_state: "LIVE_DELIVERABLE", transition_type: "VACUOUS_SKIP"
    }, { root: ROOT });
  }
}

function _readSummary(projectId, loopId) {
  const p = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "orchestration_summary.md");
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function _summaryExists(projectId, loopId) {
  return fs.existsSync(
    path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "orchestration_summary.md")
  );
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

// ── S318 — respond-gate3 REJECT → ESCALATED ───────────────────────────────────
// Reuses the existing fireGate(3,"REJECT") → _NEXT_STATE["3:REJECT"]="ESCALATED" path
// (no new mechanism). REJECT needs no selected_target.

async function runS318RespondGate3Reject() {
  const PID     = "s318_gate3_reject";
  const LOOP_ID = "s318-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S318 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id: PID, loop_id: LOOP_ID, gate_id: 3, response: "REJECT"
    });

    const ok_true               = result.ok === true;
    const advanced_true         = result.advanced === true;
    const advanced_to_escalated = result.advanced_to === "ESCALATED";
    const gate_id_3            = result.gate_id === 3;
    const response_reject       = result.response === "REJECT";
    const graph_escalated       = (await _currentState(PID, LOOP_ID)) === "ESCALATED";

    const rows = await _readLog(PID, LOOP_ID);
    const rejectRow = rows.find(r => r.transition_type === "GATE_REJECT" &&
      r.owner_gate_id === 3 && r.from_state === "DEPLOYMENT_OR_END" &&
      r.to_state === "ESCALATED");
    const gate3_reject_row_present = !!rejectRow;

    return {
      ok_true, advanced_true, advanced_to_escalated, gate_id_3, response_reject,
      graph_escalated, gate3_reject_row_present
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S319 — deploy WRONG_STATE: loop parked at QUALITY_JUDGE (not DEPLOYMENT_OR_END) ──

async function runS319DeployWrongState() {
  const PID     = "s319_deploy_wrong_state";
  const LOOP_ID = "s319-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S319 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Stop short of DEPLOYMENT_OR_END (do not fire Gate 2).
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: true, stopAt: "QUALITY_JUDGE" });

    const engine = _makeEngine();
    const result = await engine.deployProject({
      project_id:         PID,
      loop_id:            LOOP_ID,
      deploy_provider:    "mock",
      deploy_model:       "mock-dep-s316",
      deploy_scenario_id: "S316"
    });

    const deploy_error_wrong_state  = result.deploy_error === "WRONG_STATE";
    const advanced_false            = result.advanced !== true;
    const no_deployment_plan_written = !_deploymentPlanExists(PID, LOOP_ID);
    const graph_unchanged           = (await _currentState(PID, LOOP_ID)) === "QUALITY_JUDGE";

    return {
      deploy_error_wrong_state, advanced_false, no_deployment_plan_written, graph_unchanged
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S320 — deploy INPUT_NOT_FOUND: spec/design absent → INPUT_NOT_FOUND ────────

async function runS320DeployInputNotFound() {
  const PID     = "s320_deploy_input_missing";
  const LOOP_ID = "s320-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S320 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // At DEPLOYMENT_OR_END (gated path) but no spec.json / architect_design.json on disk.
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false });

    const engine = _makeEngine();
    const result = await engine.deployProject({
      project_id:         PID,
      loop_id:            LOOP_ID,
      deploy_provider:    "mock",
      deploy_model:       "mock-dep-s316",
      deploy_scenario_id: "S316"
      // deployment_enabled omitted → gated path → reads spec/design → absent → INPUT_NOT_FOUND
    });

    const deploy_error_input_not_found = result.deploy_error === "INPUT_NOT_FOUND";
    const advanced_false               = result.advanced !== true;
    const no_deployment_plan_written   = !_deploymentPlanExists(PID, LOOP_ID);
    const graph_still_deployment_or_end = (await _currentState(PID, LOOP_ID)) === "DEPLOYMENT_OR_END";

    return {
      deploy_error_input_not_found, advanced_false,
      no_deployment_plan_written, graph_still_deployment_or_end
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S321 — deploy role-failure: two variants, both fail-closed (no write, no advance) ──
// (a) mock returns non-JSON → deployment role INVALID_ROLE_OUTPUT → DEPLOY_PARSE_FAILED.
// (b) spec.json parses to a non-object → deployment role INPUT_SCHEMA INVALID_INPUT (a
//     reason OTHER than INVALID_ROLE_OUTPUT) → DEPLOYMENT_FAILED (via metadata.reason).

async function runS321DeployRoleFailure() {
  const PID = "s321_deploy_role_failure";

  const LOOP_A = "s321-loop-parse";
  const LOOP_B = "s321-loop-fail";

  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S321 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_A, last_updated_at: new Date().toISOString()
    });

    const engine = _makeEngine();

    // (a) DEPLOY_PARSE_FAILED — mock non-JSON output → INVALID_ROLE_OUTPUT.
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_A, { writeInputs: true });
    const resA = await engine.deployProject({
      project_id:         PID,
      loop_id:            LOOP_A,
      deploy_provider:    "mock",
      deploy_model:       "mock-dep-s321",
      deploy_scenario_id: "S321"
    });
    const parse_failed             = resA.deploy_error === "DEPLOY_PARSE_FAILED";
    const parse_advanced_false     = resA.advanced !== true;
    const parse_no_write           = !_deploymentPlanExists(PID, LOOP_A);
    const parse_state_unchanged    = (await _currentState(PID, LOOP_A)) === "DEPLOYMENT_OR_END";

    // (b) DEPLOYMENT_FAILED — spec.json parses to a non-object → role INVALID_INPUT.
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_B, { writeInputs: true });
    const orchDirB = path.join(PROJECTS_ROOT, PID, "orchestration", LOOP_B);
    // valid JSON, but parses to a string (not an object) → fails deployment INPUT_SCHEMA.
    fs.writeFileSync(path.join(orchDirB, "spec.json"),
      JSON.stringify("corrupt_non_object_spec"), "utf8");
    const resB = await engine.deployProject({
      project_id:         PID,
      loop_id:            LOOP_B,
      deploy_provider:    "mock",
      deploy_model:       "mock-dep-s316",
      deploy_scenario_id: "S316"
    });
    const deployment_failed        = resB.deploy_error === "DEPLOYMENT_FAILED";
    const fail_advanced_false      = resB.advanced !== true;
    const fail_no_write            = !_deploymentPlanExists(PID, LOOP_B);
    const fail_state_unchanged     = (await _currentState(PID, LOOP_B)) === "DEPLOYMENT_OR_END";

    return {
      parse_failed, parse_advanced_false, parse_no_write, parse_state_unchanged,
      deployment_failed, fail_advanced_false, fail_no_write, fail_state_unchanged
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S322 — Gate 3 APPROVE WITHOUT selected_target → fail-closed (negative LOCK-1) ──
// fireGate throws when APPROVE lacks selected_target → orchestration.respond returns
// non-SUCCESS → respondGate returns gate_error, advanced:false, graph unchanged.

async function runS322RespondGate3ApproveMissingTarget() {
  const PID     = "s322_gate3_missing_target";
  const LOOP_ID = "s322-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S322 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id: PID, loop_id: LOOP_ID, gate_id: 3, response: "APPROVE"
      // selected_target intentionally OMITTED
    });

    const advanced_false        = result.advanced !== true;
    const gate_error_present     = typeof result.gate_error === "string" && result.gate_error.length > 0;
    const gate_error_mentions_target = gate_error_present && /selected_target/.test(result.gate_error);
    const graph_unchanged        = (await _currentState(PID, LOOP_ID)) === "DEPLOYMENT_OR_END";

    const rows = await _readLog(PID, LOOP_ID);
    const no_gate3_approve_row = !rows.some(r => r.transition_type === "GATE_APPROVE" &&
      r.owner_gate_id === 3);

    return {
      advanced_false, gate_error_present, gate_error_mentions_target,
      graph_unchanged, no_gate3_approve_row
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S323 — finalizeDeliverable: LIVE_DELIVERABLE → COMPLETE (LOCK-5) ───────────
// Reuses summary_writer.writeSummary(): orchestration_summary.md persisted, then advance
// to COMPLETE.

async function runS323FinalizeDeliverable() {
  const PID     = "s323_finalize";
  const LOOP_ID = "s323-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S323 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false, stopAt: "LIVE_DELIVERABLE" });

    const summary_absent_before = !_summaryExists(PID, LOOP_ID);

    const engine = _makeEngine();
    const result = await engine.finalizeDeliverable({ project_id: PID, loop_id: LOOP_ID });

    const ok_true             = result.ok === true;
    const advanced_true       = result.advanced === true;
    const advanced_to_complete = result.advanced_to === "COMPLETE";
    const summary_path_present = typeof result.summary_path === "string" && result.summary_path.length > 0;
    const summary_written      = _summaryExists(PID, LOOP_ID);
    const graph_complete       = (await _currentState(PID, LOOP_ID)) === "COMPLETE";

    const summary = _readSummary(PID, LOOP_ID);
    const summary_has_content = !!(summary && /Orchestration Loop Summary/.test(summary));

    return {
      summary_absent_before, ok_true, advanced_true, advanced_to_complete,
      summary_path_present, summary_written, graph_complete, summary_has_content
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S324 — finalizeDeliverable wrong-state: loop NOT at LIVE_DELIVERABLE ───────

async function runS324FinalizeWrongState() {
  const PID     = "s324_finalize_wrong_state";
  const LOOP_ID = "s324-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S324 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Parked at DEPLOYMENT_OR_END (not LIVE_DELIVERABLE).
    await _seedLoopAtDeploymentOrEnd(PID, LOOP_ID, { writeInputs: false });

    const engine = _makeEngine();
    const result = await engine.finalizeDeliverable({ project_id: PID, loop_id: LOOP_ID });

    const finalize_error_wrong_state = result.finalize_error === "WRONG_STATE";
    const advanced_false             = result.advanced !== true;
    const no_summary_written         = !_summaryExists(PID, LOOP_ID);
    const graph_unchanged            = (await _currentState(PID, LOOP_ID)) === "DEPLOYMENT_OR_END";

    return {
      finalize_error_wrong_state, advanced_false, no_summary_written, graph_unchanged
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS315DeploySkipPath,
  runS316DeployGatedHappyPath,
  runS317RespondGate3Approve,
  runS318RespondGate3Reject,
  runS319DeployWrongState,
  runS320DeployInputNotFound,
  runS321DeployRoleFailure,
  runS322RespondGate3ApproveMissingTarget,
  runS323FinalizeDeliverable,
  runS324FinalizeWrongState
};

"use strict";

// S261-S266 helpers — PHASE-23 Reviewer Spec Bridge.
//
// S261: APPROVED, no findings        → COST_ESTIMATE
// S262: REJECTED + BLOCKER finding   → ESCALATED
// S263: APPROVED_WITH_CONCERNS, WARN → COST_ESTIMATE, findings present
// S264: state guard (wrong state)    → review_error:WRONG_STATE, advanced:false
// S265: role failure (invalid output)→ review_error set, model_used:"gpt-4o", no advance
// S266: APPROVED + BLOCKER finding   → ESCALATED (proves branch is BLOCKER-based, not verdict)
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

// Seed a loop at REVIEWER_SPEC: start_loop → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC.
// Writes both architect_design.json and spec.json so D3 reads succeed.
async function _seedLoopAtReviewerSpec(projectId, loopId) {
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

  const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);
  fs.mkdirSync(orchDir, { recursive: true });

  fs.writeFileSync(
    path.join(orchDir, "architect_design.json"),
    JSON.stringify(_makeDesignFixture(), null, 2),
    "utf8"
  );

  // SPEC_WRITER_FORMALIZE → REVIEWER_SPEC
  await reg.invoke("orchestration.advance_state", {
    project_id:      projectId,
    loop_id:         loopId,
    to_state:        "REVIEWER_SPEC",
    transition_type: "NORMAL",
    role_invoked:    "spec_writer"
  }, { root: ROOT });

  fs.writeFileSync(
    path.join(orchDir, "spec.json"),
    JSON.stringify(_makeSpecFixture(), null, 2),
    "utf8"
  );
}

// ── S261 — APPROVED, no findings → COST_ESTIMATE ─────────────────────────────

async function runS261ReviewApproved() {
  const PID     = "s261_review_approved";
  const LOOP_ID = "s261-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S261 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReviewerSpec(PID, LOOP_ID);

    const engine = _makeEngine();
    const result = await engine.reviewSpec({
      project_id:         PID,
      loop_id:            LOOP_ID,
      review_provider:    "mock",
      review_model:       "mock",
      review_scenario_id: "S261"
    });

    const advanced_to_cost_estimate = result.advanced_to === "COST_ESTIMATE";
    const verdict_approved          = result.verdict === "APPROVED";
    const no_blockers               = Array.isArray(result.findings) && result.findings.length === 0;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_cost_estimate = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "COST_ESTIMATE";

    return { advanced_to_cost_estimate, verdict_approved, no_blockers, graph_state_cost_estimate };
  } finally {
    _cleanup(PID);
  }
}

// ── S262 — REJECTED + BLOCKER finding → ESCALATED ────────────────────────────

async function runS262ReviewRejectedBlocker() {
  const PID     = "s262_review_rejected";
  const LOOP_ID = "s262-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S262 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReviewerSpec(PID, LOOP_ID);

    const engine = _makeEngine();
    const result = await engine.reviewSpec({
      project_id:         PID,
      loop_id:            LOOP_ID,
      review_provider:    "mock",
      review_model:       "mock",
      review_scenario_id: "S262"
    });

    const advanced_to_escalated = result.advanced_to === "ESCALATED";
    const verdict_rejected      = result.verdict === "REJECTED";
    const has_blocker_finding   = Array.isArray(result.findings) &&
      result.findings.some(f => f && f.severity === "BLOCKER");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_escalated = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ESCALATED";

    return { advanced_to_escalated, verdict_rejected, has_blocker_finding, graph_state_escalated };
  } finally {
    _cleanup(PID);
  }
}

// ── S263 — APPROVED_WITH_CONCERNS + WARN findings → COST_ESTIMATE ─────────────

async function runS263ApprovedWithConcerns() {
  const PID     = "s263_review_concerns";
  const LOOP_ID = "s263-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S263 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReviewerSpec(PID, LOOP_ID);

    const engine = _makeEngine();
    const result = await engine.reviewSpec({
      project_id:         PID,
      loop_id:            LOOP_ID,
      review_provider:    "mock",
      review_model:       "mock",
      review_scenario_id: "S263"
    });

    const advanced_to_cost_estimate = result.advanced_to === "COST_ESTIMATE";
    const verdict_concerns          = result.verdict === "APPROVED_WITH_CONCERNS";
    const findings_present          = Array.isArray(result.findings) && result.findings.length > 0;
    const no_blocker_in_findings    = Array.isArray(result.findings) &&
      !result.findings.some(f => f && f.severity === "BLOCKER");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_cost_estimate = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "COST_ESTIMATE";

    return {
      advanced_to_cost_estimate, verdict_concerns, findings_present,
      no_blocker_in_findings, graph_state_cost_estimate
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S264 — state guard: loop at SPEC_WRITER_FORMALIZE → WRONG_STATE ──────────

async function runS264StateGuard() {
  const PID     = "s264_state_guard";
  const LOOP_ID = "s264-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S264 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at SPEC_WRITER_FORMALIZE (not REVIEWER_SPEC) — state guard must fire
    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    await reg.invoke("orchestration.start_loop", {
      project_id: PID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake"
    }, { root: ROOT });
    await reg.invoke("orchestration.advance_state", {
      project_id: PID, loop_id: LOOP_ID,
      to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect"
    }, { root: ROOT });

    const engine = _makeEngine();
    const result = await engine.reviewSpec({
      project_id:      PID,
      loop_id:         LOOP_ID,
      review_provider: "mock"
    });

    const ok_true              = result.ok === true;
    const review_error_wrong   = result.review_error === "WRONG_STATE";
    const advanced_false       = result.advanced !== true;
    const current_state_echoed = result.current_state === "SPEC_WRITER_FORMALIZE";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_spec_writer = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "SPEC_WRITER_FORMALIZE";

    return {
      ok_true, review_error_wrong, advanced_false, current_state_echoed, graph_still_spec_writer
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S265 — role failure → review_error set, model_used:"gpt-4o", no advance ──
//
// Uses review_provider:"mock" + review_model:"gpt-4o" (explicit backend-owned value) +
// review_scenario_id:"S265" (mock returns invalid JSON → fails OUTPUT_SCHEMA → role
// returns non-SUCCESS). Proves: failure return carries model_used (no _test_force_timeout).

async function runS265RoleFailure() {
  const PID     = "s265_role_failure";
  const LOOP_ID = "s265-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S265 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReviewerSpec(PID, LOOP_ID);

    const engine = _makeEngine();
    const result = await engine.reviewSpec({
      project_id:         PID,
      loop_id:            LOOP_ID,
      review_provider:    "mock",
      review_model:       "gpt-4o",  // explicit: proves model_used echoes the resolved value
      review_scenario_id: "S265"     // mock returns invalid JSON → role fails INVALID_ROLE_OUTPUT
    });

    const ok_true                  = result.ok === true;
    const review_error_set         = typeof result.review_error === "string" && result.review_error.length > 0;
    const advanced_false           = result.advanced !== true;
    const model_used_gpt4o         = result.model_used === "gpt-4o";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_reviewer_spec = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "REVIEWER_SPEC";

    return {
      ok_true, review_error_set, advanced_false, model_used_gpt4o, graph_still_reviewer_spec
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S266 — APPROVED verdict + BLOCKER finding → ESCALATED ────────────────────
//
// Locks the D6 branch: verdict APPROVED but ≥1 BLOCKER → ESCALATED.
// Proves branch follows BLOCKER-count, not verdict enum.

async function runS266ApprovedWithBlockerEscalates() {
  const PID     = "s266_approved_blocker";
  const LOOP_ID = "s266-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S266 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReviewerSpec(PID, LOOP_ID);

    const engine = _makeEngine();
    const result = await engine.reviewSpec({
      project_id:         PID,
      loop_id:            LOOP_ID,
      review_provider:    "mock",
      review_model:       "mock",
      review_scenario_id: "S266"  // APPROVED + BLOCKER finding
    });

    const advanced_to_escalated = result.advanced_to === "ESCALATED";
    const verdict_approved      = result.verdict === "APPROVED";
    const has_blocker           = Array.isArray(result.findings) &&
      result.findings.some(f => f && f.severity === "BLOCKER");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_escalated = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ESCALATED";

    return { advanced_to_escalated, verdict_approved, has_blocker, graph_state_escalated };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS261ReviewApproved,
  runS262ReviewRejectedBlocker,
  runS263ApprovedWithConcerns,
  runS264StateGuard,
  runS265RoleFailure,
  runS266ApprovedWithBlockerEscalates
};

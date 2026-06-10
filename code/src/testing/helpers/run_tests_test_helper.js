"use strict";

// S288-S292 helpers — PHASE-29 Run Tests Bridge.
//
// S288: happy-path — loop seeded RUN_TESTS, PASS report injected → REVIEWER_CODE_AND_SECURITY,
//       scenarios bridged to forge_tests/scenarios/.
// S289: wrong-state guard — loop at BUILDER → test_error:WRONG_STATE, advanced:false.
// S290: input-missing — loop at RUN_TESTS, no test_plan.json → INPUT_NOT_FOUND, advanced:false.
// S291: failing-report → loop-back to BUILDER with LOOP_BACK audit row from_state=RUN_TESTS.
// S292: deps-install-failure → DEPS_INSTALL_FAILED, advanced:false.
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync
// are used here only for test fixture setup, not in production code.

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

function _makeTestPlanFixture() {
  return {
    role_id: "test_designer",
    scenarios: [
      {
        id:          "T-1",
        name:        "get_todos_returns_200",
        description: "GET /todos returns 200",
        category:    "http",
        fixture:     "fresh_db",
        setup:       { actions: [{ type: "start_server", command: "node server.js", wait_for_port: 3000, timeout_ms: 5000 }] },
        execution:   { type: "http_request", method: "GET", url: "http://localhost:3000/todos" },
        assertions:  [{ type: "http_status_equals", expected: 200 }],
        teardown:    { actions: [{ type: "stop_server" }] },
        metadata:    { covers_ac: ["AC-1"], estimated_duration_ms: 500 }
      },
      {
        id:          "T-2",
        name:        "create_todo_returns_201",
        description: "POST /todos returns 201",
        category:    "http",
        fixture:     "fresh_db",
        setup:       { actions: [{ type: "start_server", command: "node server.js", wait_for_port: 3000, timeout_ms: 5000 }] },
        execution:   { type: "http_request", method: "POST", url: "http://localhost:3000/todos",
                       headers: { "Content-Type": "application/json" }, body: { title: "Test" } },
        assertions:  [{ type: "http_status_equals", expected: 201 }],
        teardown:    { actions: [{ type: "stop_server" }] },
        metadata:    { covers_ac: ["AC-2"], estimated_duration_ms: 500 }
      }
    ],
    coverage_summary: { acs_total: 2, acs_covered: 2, gaps: [] }
  };
}

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

// Advance a loop from its current state to RUN_TESTS, writing test_plan.json.
// If writeTestPlan is false, skips writing the plan (for INPUT_NOT_FOUND test).
async function _seedLoopAtRunTests(projectId, loopId, opts) {
  const writeTestPlan = !opts || opts.writeTestPlan !== false;
  const reg     = require("../../runtime/tools/_registry").getDefaultRegistry();
  const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);

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
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "ENV_REPORT", transition_type: "NORMAL", role_invoked: "cost_estimator"
  }, { root: ROOT });
  await reg.invoke("orchestration.respond", {
    project_id: projectId, loop_id: loopId, gate_id: 1, response: "APPROVE"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "BUILDER", transition_type: "NORMAL", role_invoked: "test_designer"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "RUN_TESTS", transition_type: "NORMAL", role_invoked: "builder"
  }, { root: ROOT });

  fs.mkdirSync(orchDir, { recursive: true });
  if (writeTestPlan) {
    fs.writeFileSync(
      path.join(orchDir, "test_plan.json"),
      JSON.stringify(_makeTestPlanFixture(), null, 2),
      "utf8"
    );
  }
}

// ── S288 — happy-path: RUN_TESTS, PASS report → REVIEWER_CODE_AND_SECURITY ────

async function runS288HappyPath() {
  const PID     = "s288_run_tests_happy";
  const LOOP_ID = "s288-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S288 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtRunTests(PID, LOOP_ID, { writeTestPlan: true });

    const engine = _makeEngine();
    const result = await engine.runTests({
      project_id:                       PID,
      loop_id:                          LOOP_ID,
      _test_skip_npm_install:           true,
      _test_force_run_scenarios_result: { overall_status: "PASS", total: 2, pass: 2, fail: 0, error: 0 }
    });

    const advanced_true        = result.advanced === true;
    const advanced_to_reviewer = result.advanced_to === "REVIEWER_CODE_AND_SECURITY";
    const report_status_pass   = !!(result.report_summary && result.report_summary.overall_status === "PASS");

    // Verify scenarios were bridged to disk
    const scenDir = path.join(ROOT, "artifacts", "projects", PID, "forge_tests", "scenarios");
    const scenarios_bridged = fs.existsSync(scenDir) && fs.readdirSync(scenDir).length === 2;

    // Verify graph state
    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_reviewer = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "REVIEWER_CODE_AND_SECURITY";

    return { advanced_true, advanced_to_reviewer, scenarios_bridged, report_status_pass, graph_state_reviewer };
  } finally {
    _cleanup(PID);
  }
}

// ── S289 — wrong-state guard: loop at BUILDER → WRONG_STATE ──────────────────

async function runS289WrongState() {
  const PID     = "s289_wrong_state";
  const LOOP_ID = "s289-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S289 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed only up to BUILDER (do NOT advance to RUN_TESTS)
    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    await reg.invoke("orchestration.start_loop", {
      project_id: PID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake"
    }, { root: ROOT });
    await reg.invoke("orchestration.advance_state", {
      project_id: PID, loop_id: LOOP_ID,
      to_state: "BUILDER", transition_type: "NORMAL", role_invoked: "test_designer"
    }, { root: ROOT });

    const engine = _makeEngine();
    const result = await engine.runTests({ project_id: PID, loop_id: LOOP_ID });

    const ok_true              = result.ok === true;
    const test_error_wrong     = result.test_error === "WRONG_STATE";
    const advanced_false       = result.advanced !== true;
    const current_state_echoed = result.current_state === "BUILDER";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_builder = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "BUILDER";

    return { ok_true, test_error_wrong, advanced_false, current_state_echoed, graph_still_builder };
  } finally {
    _cleanup(PID);
  }
}

// ── S290 — input-missing: RUN_TESTS but no test_plan.json → INPUT_NOT_FOUND ───

async function runS290InputNotFound() {
  const PID     = "s290_input_missing";
  const LOOP_ID = "s290-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S290 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Seed at RUN_TESTS but do NOT write test_plan.json
    await _seedLoopAtRunTests(PID, LOOP_ID, { writeTestPlan: false });

    const engine = _makeEngine();
    const result = await engine.runTests({ project_id: PID, loop_id: LOOP_ID });

    const ok_true              = result.ok === true;
    const test_error_not_found = result.test_error === "INPUT_NOT_FOUND";
    const advanced_false       = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_run_tests = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "RUN_TESTS";

    return { ok_true, test_error_not_found, advanced_false, graph_still_run_tests };
  } finally {
    _cleanup(PID);
  }
}

// ── S291 — failing-report → loop-back to BUILDER; audit row from_state=RUN_TESTS ─

async function runS291FailReportLoopBack() {
  const PID     = "s291_fail_loop_back";
  const LOOP_ID = "s291-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S291 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtRunTests(PID, LOOP_ID, { writeTestPlan: true });

    const engine = _makeEngine();
    const result = await engine.runTests({
      project_id:                       PID,
      loop_id:                          LOOP_ID,
      _test_skip_npm_install:           true,
      _test_force_run_scenarios_result: { overall_status: "FAIL", total: 2, pass: 1, fail: 1, error: 0 }
    });

    const advanced_true     = result.advanced === true;
    const advanced_to_builder = result.advanced_to === "BUILDER";
    const loop_back_true    = result.loop_back === true;
    const report_status_fail = !!(result.report_summary && result.report_summary.overall_status === "FAIL");

    // Verify graph state = BUILDER
    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_builder = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "BUILDER";

    // Verify iteration_count was incremented
    const iteration_count_incremented = statusResult.status === "SUCCESS" &&
      statusResult.output.iteration_count === 1;

    // RULING 2b: verify LOOP_BACK audit row has from_state === "RUN_TESTS"
    const logResult = await reg.invoke("orchestration.read_log", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const auditRows = (logResult && logResult.status === "SUCCESS") ? logResult.output.rows : [];
    const loopBackRow = auditRows.find(r => r.transition_type === "LOOP_BACK");
    const audit_loop_back_from_state_run_tests = !!(loopBackRow &&
      loopBackRow.from_state === "RUN_TESTS");

    return {
      advanced_true, advanced_to_builder, loop_back_true, report_status_fail,
      graph_state_builder, iteration_count_incremented,
      audit_loop_back_from_state_run_tests
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S292 — deps-install-failure → DEPS_INSTALL_FAILED, no advance ─────────────

async function runS292DepsInstallFailed() {
  const PID     = "s292_deps_fail";
  const LOOP_ID = "s292-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S292 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtRunTests(PID, LOOP_ID, { writeTestPlan: true });

    const engine = _makeEngine();
    const result = await engine.runTests({
      project_id:                  PID,
      loop_id:                     LOOP_ID,
      _test_force_npm_install_fail: true
      // _test_skip_npm_install is NOT set — force_fail fires within the install block
    });

    const ok_true          = result.ok === true;
    const deps_fail_error  = result.test_error === "DEPS_INSTALL_FAILED";
    const advanced_false   = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_run_tests = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "RUN_TESTS";

    return { ok_true, deps_fail_error, advanced_false, graph_still_run_tests };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS288HappyPath,
  runS289WrongState,
  runS290InputNotFound,
  runS291FailReportLoopBack,
  runS292DepsInstallFailed
};

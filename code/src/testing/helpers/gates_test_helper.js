"use strict";

// Testing infrastructure for Stage 10.3 scenarios (S145–S148).
// Not part of the production runtime — called exclusively by module_call scenarios.

// Lazy requires to avoid circular-dependency / early-load issues
function _loopState()  { return require("../../runtime/orchestration/loop_state"); }
function _gates()      { return require("../../runtime/orchestration/approval_gates"); }
function _controller() { return require("../../runtime/orchestration/iteration_controller"); }
function _toolsReg()   { return require("../../runtime/tools/_registry").getDefaultRegistry(); }

// ── S145 helper — iteration cap triggers escalation ──────────────────────────
// Sets iteration_count = ITERATION_CAP (5) on a fresh loop, then calls
// tryAdvanceForLoopBack. Expects escalation (no increment, state → ESCALATED).

async function runS145Sequence(ctx) {
  const ls     = _loopState();
  const ctrl   = _controller();
  const reg    = _toolsReg();
  const ctxObj = ctx || {};

  const projectId = "test_s145";
  const loopId    = "test-loop-s145";

  // Set up loop at QUALITY_JUDGE with iteration_count = ITERATION_CAP (5)
  await ls.createLoop(projectId, loopId, ctxObj);
  const graph = await ls.loadLoop(projectId, loopId, ctxObj);
  graph.iteration_count  = ctrl.ITERATION_CAP;   // 5
  graph.current_state    = "QUALITY_JUDGE";
  graph.last_advanced_at = new Date().toISOString();
  await ls.saveLoop(projectId, loopId, graph, ctxObj);

  // Verify cap is seen as exceeded before the call
  const capCheck = ctrl.checkCap(graph);

  // tryAdvanceForLoopBack — should escalate, NOT increment
  const result = await ctrl.tryAdvanceForLoopBack(projectId, loopId, ctxObj);

  // Load updated graph
  const updated = await ls.loadLoop(projectId, loopId, ctxObj);

  // Check escalation file exists
  let escalationFileExists = false;
  if (result.escalation_path) {
    const existsResult = await reg.invoke(
      "fs.exists",
      { path: result.escalation_path },
      ctxObj
    );
    escalationFileExists = !!(existsResult.output && existsResult.output.exists);
  }

  // Check audit log for ESCALATE row
  const logPath = "artifacts/projects/" + projectId + "/orchestration/" + loopId +
                  "/conversation_log.jsonl";
  const logResult = await reg.invoke("fs.read_file", { path: logPath }, ctxObj);
  let escalateAuditRowPresent = false;
  if (logResult.status === "SUCCESS") {
    const lines = logResult.output.content.trim().split("\n").filter(Boolean);
    escalateAuditRowPresent = lines.some(function(line) {
      try {
        const row = JSON.parse(line);
        return row.transition_type === "ESCALATE" && row.to_state === "ESCALATED";
      } catch (_e) {
        return false;
      }
    });
  }

  return {
    cap_exceeded:                  capCheck.exceeded === true,
    iteration_count_after:         updated ? updated.iteration_count : -1,
    escalation_triggered:          result.escalated === true,
    escalation_path_includes_loop: !!(result.escalation_path &&
                                      result.escalation_path.includes(loopId)),
    escalation_file_exists:        escalationFileExists,
    final_state:                   updated ? updated.current_state : null,
    escalate_audit_row_present:    escalateAuditRowPresent
  };
}

// ── S146 helper — gate 1 blocks until approve ─────────────────────────────────
// Positive path: FORGE_OWNER_AUTO_APPROVE=1 → Gate 1 auto-APPROVE → TEST_DESIGN.
// Negative path: no gate_responder + env unset → throws "would block indefinitely".

async function runS146Sequence(ctx) {
  const ls     = _loopState();
  const ctxObj = ctx || {};
  const { fireGate } = _gates();

  const projectId = "test_s146";

  // ── Positive path ─────────────────────────────────────────────────────────
  const loopIdApprove = "test-loop-s146-approve";
  await ls.createLoop(projectId, loopIdApprove, ctxObj);
  const approveGraph = await ls.loadLoop(projectId, loopIdApprove, ctxObj);
  approveGraph.current_state    = "ENV_REPORT";
  approveGraph.last_advanced_at = new Date().toISOString();
  await ls.saveLoop(projectId, loopIdApprove, approveGraph, ctxObj);

  let approveResponse  = null;
  let approveNextState = null;

  const savedEnv = process.env.FORGE_OWNER_AUTO_APPROVE;
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";
  try {
    const r = await fireGate(1, projectId, loopIdApprove, {}, ctxObj);
    approveResponse  = r.response;
    approveNextState = r.next_state;
  } finally {
    if (savedEnv === undefined) {
      delete process.env.FORGE_OWNER_AUTO_APPROVE;
    } else {
      process.env.FORGE_OWNER_AUTO_APPROVE = savedEnv;
    }
  }

  // ── Negative path ─────────────────────────────────────────────────────────
  const loopIdBlock = "test-loop-s146-block";
  await ls.createLoop(projectId, loopIdBlock, ctxObj);
  const blockGraph = await ls.loadLoop(projectId, loopIdBlock, ctxObj);
  blockGraph.current_state    = "ENV_REPORT";
  blockGraph.last_advanced_at = new Date().toISOString();
  await ls.saveLoop(projectId, loopIdBlock, blockGraph, ctxObj);

  let blockThrows             = false;
  let blockErrorIncludesGateId = false;

  const savedEnv2 = process.env.FORGE_OWNER_AUTO_APPROVE;
  delete process.env.FORGE_OWNER_AUTO_APPROVE;
  try {
    await fireGate(1, projectId, loopIdBlock, {}, ctxObj);
  } catch (err) {
    blockThrows              = true;
    blockErrorIncludesGateId = err.message.includes("gate 1");
  } finally {
    if (savedEnv2 !== undefined) {
      process.env.FORGE_OWNER_AUTO_APPROVE = savedEnv2;
    }
  }

  return {
    approve_response:              approveResponse,
    approve_next_state:            approveNextState,
    block_throws:                  blockThrows,
    block_error_includes_gate_id:  blockErrorIncludesGateId
  };
}

// ── S147 helper — gate 2 reject loops back to builder ─────────────────────────
// Sets up loop at QUALITY_JUDGE (iteration_count=0), calls fireGate(2) with a
// gate_responder that returns REJECT_AND_LOOP. Expects BUILDER next_state and
// iteration_count incremented to 1.

async function runS147Sequence(ctx) {
  const ls     = _loopState();
  const ctxObj = ctx || {};
  const { fireGate } = _gates();

  const projectId = "test_s147";
  const loopId    = "test-loop-s147";

  await ls.createLoop(projectId, loopId, ctxObj);
  const graph = await ls.loadLoop(projectId, loopId, ctxObj);
  graph.current_state    = "QUALITY_JUDGE";
  graph.iteration_count  = 0;
  graph.last_advanced_at = new Date().toISOString();
  await ls.saveLoop(projectId, loopId, graph, ctxObj);

  const gateCtx = Object.assign({}, ctxObj, {
    gate_responder: async function(/* envelope */) {
      return { response: "REJECT_AND_LOOP" };
    }
  });

  const result  = await fireGate(2, projectId, loopId, {}, gateCtx);
  const updated = await ls.loadLoop(projectId, loopId, ctxObj);

  return {
    next_state:      result.next_state,
    escalated:       result.escalated,
    iteration_count: updated ? updated.iteration_count : -1,
    persisted_state: updated ? updated.current_state    : null
  };
}

// ── S148 helper — conservative-fire semantics for shouldSkipGate3 ────────────
// Pure function: tests shouldSkipGate3 with 5 representative inputs.
// Option A (DECISION-20260514-1000): gate fires by default; skips ONLY when
// deployment_enabled is explicitly false. Missing/null/undefined → fire.
// No I/O — safe to call synchronously.

function runS148Checks() {
  const { shouldSkipGate3 } = _gates();

  return {
    case1_false_skips:             shouldSkipGate3({ deployment_enabled: false }) === true,
    case2_true_does_not_skip:      shouldSkipGate3({ deployment_enabled: true  }) === false,
    case3_empty_fires:             shouldSkipGate3({}) === false,
    case4_null_fires:              shouldSkipGate3(null) === false,
    case5_false_with_extras_skips: shouldSkipGate3({ deployment_enabled: false, extra: "data" }) === true
  };
}

module.exports = {
  runS145Sequence,
  runS146Sequence,
  runS147Sequence,
  runS148Checks
};

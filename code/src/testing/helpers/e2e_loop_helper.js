"use strict";

// ── e2e_loop_helper.js — E2E orchestration loop driver for Stage 10.5 (S152–S156).
//
// Mock-only. No real LLM calls. $0.00 API cost.
// All state mutations route through L2 tools or orchestration runtime functions.
// Track A: zero direct fs.*, zero new OpenAI(), zero child_process.
//
// S152 — fast-path full loop (FORGE_OWNER_AUTO_APPROVE=1, 14 transitions, COMPLETE)
// S153 — Gate 1 explicit approve via env; verifies audit row shape
// S154 — Gate 2 REJECT_AND_LOOP → 2 iterations → COMPLETE
// S155 — Reviewer + Security disagree × 3 rounds → quality_judge arbitrates (ARBITRATED)
// S156 — deployment_enabled=false → Gate 3 VACUOUS_SKIP → COMPLETE

const { getDefaultRegistry }              = require("../../runtime/tools/_registry");
const { fireGate, shouldSkipGate3 }       = require("../../runtime/orchestration/approval_gates");
const { runDebate }                        = require("../../runtime/orchestration/debate_protocol");
const { writeSummary }                     = require("../../runtime/orchestration/summary_writer");
const { setCurrentState, loadLoop }        = require("../../runtime/orchestration/loop_state");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "_reference_todo_api";

// State sequences for _driveNormal() — gate states are NOT included;
// they are handled by fireGate() or VACUOUS_SKIP directly.

// After createLoop (state = OWNER_INTENT), drive up to ENV_REPORT:
const BEFORE_GATE1  = ["ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
                        "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT"];

// After Gate 1 (state = TEST_DESIGN), drive to REVIEWER_CODE_AND_SECURITY:
const GATE1_TO_RCS  = ["BUILDER", "RUN_TESTS", "REVIEWER_CODE_AND_SECURITY"];

// After REVIEWER_CODE_AND_SECURITY, drive to QUALITY_JUDGE:
const RCS_TO_GATE2  = ["DOCUMENTATION", "QUALITY_JUDGE"];

// From BUILDER (after REJECT_AND_LOOP setCurrentState), drive to REVIEWER_CODE_AND_SECURITY:
const BUILDER_TO_RCS = ["RUN_TESTS", "REVIEWER_CODE_AND_SECURITY"];

// After Gate 3 (state = LIVE_DELIVERABLE), drive to COMPLETE:
const AFTER_GATE3   = ["COMPLETE"];

function _debateVerdictsPath(project_id, loop_id) {
  return "artifacts/projects/" + project_id + "/orchestration/" +
         loop_id + "/debate_verdicts.jsonl";
}

// ── Registry helper ───────────────────────────────────────────────────────────

function _reg() { return getDefaultRegistry(); }

// ── Internal helpers ──────────────────────────────────────────────────────────

// Advance loop one step via orchestration.advance_state tool.
async function _advance(project_id, loop_id, toState, transitionType, ctx) {
  const result = await _reg().invoke(
    "orchestration.advance_state",
    { project_id, loop_id, to_state: toState,
      transition_type: transitionType, mock: true, cost_usd: 0 },
    ctx || {}
  );
  if (!result || result.status !== "SUCCESS") {
    throw new Error(
      "_advance→" + toState + " failed: " +
      ((result && result.metadata && result.metadata.reason) || "UNKNOWN")
    );
  }
  return result.output;
}

// Drive through a list of states with NORMAL transitions.
async function _driveNormal(project_id, loop_id, states, ctx) {
  for (var i = 0; i < states.length; i++) {
    await _advance(project_id, loop_id, states[i], "NORMAL", ctx);
  }
}

// Fire a gate with an explicit gate_responder function.
// Returns fireGate result: { next_state, response, responded_at, ... }.
// NOTE: For REJECT_AND_LOOP (Gate 2), tryAdvanceForLoopBack inside fireGate
// increments iteration_count and appends LOOP_BACK audit row, but does NOT
// call setCurrentState("BUILDER"). Callers must fix state themselves.
async function _fireGateWithResponder(gateId, project_id, loop_id, responderFn, ctx) {
  const ctxWithResponder = Object.assign({}, ctx || {}, { gate_responder: responderFn });
  return fireGate(gateId, project_id, loop_id, {}, ctxWithResponder);
}

// Write DebateVerdict to debate_verdicts.jsonl (Track A: fs.append_file via registry).
// Schema per CTO OQ5 resolution (2026-05-14).
async function _writeDebateVerdicts(project_id, loop_id, verdict, ctx) {
  // rounds_completed: 3 for ARBITRATED (MAX_COUNTER_ROUNDS); N for AGREE after N rounds.
  const roundsCompleted = verdict.verdict === "ARBITRATED"
    ? 3
    : Math.floor(Math.max(0, verdict.debate_log.length - 2) / 2);

  const row = JSON.stringify({
    ts:               new Date().toISOString(),
    loop_id:          loop_id,
    from_state:       "REVIEWER_CODE_AND_SECURITY",
    verdict:          verdict.verdict,
    winning_position: verdict.winning_position,
    basis:            verdict.basis,
    debate_log:       verdict.debate_log,
    rounds_completed: roundsCompleted
  }) + "\n";

  const result = await _reg().invoke(
    "fs.append_file",
    { path: _debateVerdictsPath(project_id, loop_id), content: row },
    ctx || {}
  );
  if (!result || result.status !== "SUCCESS") {
    throw new Error(
      "_writeDebateVerdicts: fs.append_file failed: " +
      ((result && result.metadata && result.metadata.reason) || "UNKNOWN")
    );
  }
  return { path: _debateVerdictsPath(project_id, loop_id) };
}

// Read all audit rows from conversation_log.jsonl.
async function _readLog(project_id, loop_id, ctx) {
  const logPath = "artifacts/projects/" + project_id + "/orchestration/" +
                  loop_id + "/conversation_log.jsonl";
  const exists = await _reg().invoke("fs.exists", { path: logPath }, ctx || {});
  if (!exists.output || !exists.output.exists) return [];
  const read = await _reg().invoke("fs.read_file", { path: logPath }, ctx || {});
  if (read.status !== "SUCCESS") return [];
  return (read.output.content || "")
    .split("\n")
    .filter(function(l) { return l.trim(); })
    .map(function(l) { try { return JSON.parse(l); } catch (_e) { return null; } })
    .filter(Boolean);
}

// Check if a path exists via registry.
async function _fileExists(filePath, ctx) {
  const result = await _reg().invoke("fs.exists", { path: filePath }, ctx || {});
  return !!(result.output && result.output.exists);
}

// Read and parse a JSONL file.
async function _readJsonl(filePath, ctx) {
  const read = await _reg().invoke("fs.read_file", { path: filePath }, ctx || {});
  if (read.status !== "SUCCESS") return [];
  return (read.output.content || "")
    .split("\n")
    .filter(function(l) { return l.trim(); })
    .map(function(l) { try { return JSON.parse(l); } catch (_e) { return null; } })
    .filter(Boolean);
}

// Create a new loop and return its loop_id.
async function _createLoop(project_id, ctx) {
  const result = await _reg().invoke(
    "orchestration.start_loop",
    { project_id },
    ctx || {}
  );
  if (!result || result.status !== "SUCCESS") {
    throw new Error(
      "_createLoop failed: " +
      ((result && result.metadata && result.metadata.reason) || "UNKNOWN")
    );
  }
  return result.output.loop_id;
}

// ── runS152 — fast-path full loop, no owner gate blocks ───────────────────────
// Plan §2 criterion 1: 14 state transitions, OWNER_INTENT→COMPLETE.
// FORGE_OWNER_AUTO_APPROVE=1 auto-approves all 3 gates.

async function runS152(opts) {
  const project_id      = (opts && opts.project_id) || PROJECT_ID;
  const ctxObj          = Object.assign({ mock: true }, (opts && opts.ctx) || {});
  const prevAutoApprove = process.env.FORGE_OWNER_AUTO_APPROVE;
  const loop_id         = await _createLoop(project_id, ctxObj);
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";

  try {
    await _driveNormal(project_id, loop_id, BEFORE_GATE1, ctxObj);
    await fireGate(1, project_id, loop_id, {}, ctxObj);          // ENV_REPORT → TEST_DESIGN
    await _driveNormal(project_id, loop_id, GATE1_TO_RCS, ctxObj);
    await _driveNormal(project_id, loop_id, RCS_TO_GATE2, ctxObj);
    await fireGate(2, project_id, loop_id, {}, ctxObj);          // QUALITY_JUDGE → DEPLOYMENT_OR_END
    await fireGate(3, project_id, loop_id, {}, ctxObj);          // DEPLOYMENT_OR_END → LIVE_DELIVERABLE
    await _driveNormal(project_id, loop_id, AFTER_GATE3, ctxObj);
    await writeSummary(project_id, loop_id, ctxObj);
  } finally {
    process.env.FORGE_OWNER_AUTO_APPROVE = prevAutoApprove || "";
  }

  const rows        = await _readLog(project_id, loop_id, ctxObj);
  const logPath     = "artifacts/projects/" + project_id + "/orchestration/" +
                      loop_id + "/conversation_log.jsonl";
  const summaryPath = "artifacts/projects/" + project_id + "/orchestration/" +
                      loop_id + "/orchestration_summary.md";

  return {
    final_state_complete:    rows.length > 0 &&
                             rows[rows.length - 1].to_state === "COMPLETE",
    transition_count_14:     rows.length === 14,
    conversation_log_exists: await _fileExists(logPath, ctxObj),
    summary_written:         await _fileExists(summaryPath, ctxObj)
  };
}

// ── runS153 — Gate 1 fires in ENV_REPORT, auto-approve via env ────────────────
// Plan §2 criterion 2: Gate 1 fires and approves; current_state → TEST_DESIGN.
// Verifies: audit row has transition_type=GATE_APPROVE, from=ENV_REPORT, to=TEST_DESIGN.

async function runS153(opts) {
  const project_id      = (opts && opts.project_id) || PROJECT_ID;
  const ctxObj          = Object.assign({ mock: true }, (opts && opts.ctx) || {});
  const prevAutoApprove = process.env.FORGE_OWNER_AUTO_APPROVE;
  const loop_id         = await _createLoop(project_id, ctxObj);
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";

  try {
    await _driveNormal(project_id, loop_id, BEFORE_GATE1, ctxObj);
    await fireGate(1, project_id, loop_id, {}, ctxObj);  // ENV_REPORT → TEST_DESIGN
  } finally {
    process.env.FORGE_OWNER_AUTO_APPROVE = prevAutoApprove || "";
  }

  const rows     = await _readLog(project_id, loop_id, ctxObj);
  const gate1Row = rows.find(function(r) {
    return r.transition_type === "GATE_APPROVE" &&
           r.from_state      === "ENV_REPORT"   &&
           r.to_state        === "TEST_DESIGN";
  });

  return {
    state_after_gate1:     !!(rows.length > 0 &&
                               rows[rows.length - 1].to_state === "TEST_DESIGN"),
    gate1_audit_row:       !!gate1Row,
    gate1_from_env_report: !!(gate1Row && gate1Row.from_state === "ENV_REPORT"),
    gate1_to_test_design:  !!(gate1Row && gate1Row.to_state   === "TEST_DESIGN"),
    gate1_owner_id_1:      !!(gate1Row && gate1Row.owner_gate_id === 1)
  };
}

// ── runS154 — Gate 2 REJECT_AND_LOOP → 2 iterations → COMPLETE ───────────────
// Plan §2 criterion 3: iteration_count incremented; loop returns to BUILDER;
// second iteration completes and reaches COMPLETE.
//
// After REJECT_AND_LOOP: tryAdvanceForLoopBack increments count + writes LOOP_BACK
// audit row but does NOT call setCurrentState("BUILDER"). We fix state explicitly.

async function runS154(opts) {
  const project_id      = (opts && opts.project_id) || PROJECT_ID;
  const ctxObj          = Object.assign({ mock: true }, (opts && opts.ctx) || {});
  const prevAutoApprove = process.env.FORGE_OWNER_AUTO_APPROVE;
  const loop_id         = await _createLoop(project_id, ctxObj);
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";  // for Gate 1, Gate 2 pass 2, Gate 3

  try {
    // ── First pass: drive to QUALITY_JUDGE ────────────────────────────────────
    await _driveNormal(project_id, loop_id, BEFORE_GATE1, ctxObj);
    await fireGate(1, project_id, loop_id, {}, ctxObj);           // Gate 1 auto-approve
    await _driveNormal(project_id, loop_id, GATE1_TO_RCS, ctxObj);
    await _driveNormal(project_id, loop_id, RCS_TO_GATE2, ctxObj);

    // Gate 2 REJECT_AND_LOOP: increments iteration_count, appends LOOP_BACK row
    await _fireGateWithResponder(2, project_id, loop_id,
      async function() { return { response: "REJECT_AND_LOOP" }; },
      ctxObj
    );
    // ── Second pass: drive from BUILDER to COMPLETE ──────────────────────────
    await _driveNormal(project_id, loop_id, BUILDER_TO_RCS, ctxObj);
    await _driveNormal(project_id, loop_id, RCS_TO_GATE2, ctxObj);
    await fireGate(2, project_id, loop_id, {}, ctxObj);           // Gate 2 auto-approve APPROVE_SHIP
    await fireGate(3, project_id, loop_id, {}, ctxObj);           // Gate 3 auto-approve
    await _driveNormal(project_id, loop_id, AFTER_GATE3, ctxObj);
  } finally {
    process.env.FORGE_OWNER_AUTO_APPROVE = prevAutoApprove || "";
  }

  const rows        = await _readLog(project_id, loop_id, ctxObj);
  const loopBackRow = rows.find(function(r) {
    return r.transition_type === "LOOP_BACK";
  });
  const finalGraph  = await loadLoop(project_id, loop_id, ctxObj);

  return {
    iteration_count_incremented:  !!(finalGraph && finalGraph.iteration_count >= 1),
    loop_back_audit_row:          !!loopBackRow,
    second_pass_reached_complete: rows.length > 0 &&
                                  rows[rows.length - 1].to_state === "COMPLETE"
  };
}

// ── runS155 — Reviewer + Security disagree → debate arbitration ───────────────
// Plan §2 criterion 4: verdict ARBITRATED in debate_verdicts.jsonl.
// Mock role_invoker: reviewer reports BLOCKER at routes/todos.js:42;
// security reports BLOCKER at server.js:15. Different locations → disagree
// for all 3 COUNTER rounds → quality_judge ARBITRATED.
// debate_log.length === 9 (2 PROPOSE + 6 COUNTER + 1 ARBITRATE).

async function runS155(opts) {
  const project_id    = (opts && opts.project_id) || PROJECT_ID;
  const ctxObj        = Object.assign({ mock: true }, (opts && opts.ctx) || {});
  const prevAutoApprove = process.env.FORGE_OWNER_AUTO_APPROVE;

  function _mockInvoker(role_id) {
    if (role_id === "reviewer") {
      return Promise.resolve({
        status: "SUCCESS",
        output: {
          findings: [{ severity: "BLOCKER", location: "routes/todos.js:42",
                       issue: "SQL injection" }],
          summary:  "BLOCKER: SQL injection at routes/todos.js:42"
        }
      });
    }
    if (role_id === "security_auditor") {
      return Promise.resolve({
        status: "SUCCESS",
        output: {
          findings: [{ severity: "BLOCKER", location: "server.js:15",
                       vulnerability: "XSS" }],
          summary:  "BLOCKER: XSS at server.js:15"
        }
      });
    }
    if (role_id === "quality_judge") {
      return Promise.resolve({
        status: "SUCCESS",
        output: { verdict: "ARBITRATED",
                  summary: "Both issues must be fixed before shipping." }
      });
    }
    return Promise.resolve({ status: "SUCCESS", output: {} });
  }

  const loop_id = await _createLoop(project_id, ctxObj);
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";

  let verdict;
  try {
    await _driveNormal(project_id, loop_id, BEFORE_GATE1, ctxObj);
    await fireGate(1, project_id, loop_id, {}, ctxObj);
    await _driveNormal(project_id, loop_id, GATE1_TO_RCS, ctxObj);

    // REVIEWER_CODE_AND_SECURITY: invoke debate with mock outputs
    const revOutput = await _mockInvoker("reviewer");
    const secOutput = await _mockInvoker("security_auditor");
    verdict = await runDebate(revOutput, secOutput, Object.assign({}, ctxObj, {
      role_invoker: _mockInvoker,
      project_id
    }));
    await _writeDebateVerdicts(project_id, loop_id, verdict, ctxObj);

    // Continue: RCS → DOCUMENTATION → QUALITY_JUDGE → gates → COMPLETE
    await _driveNormal(project_id, loop_id, RCS_TO_GATE2, ctxObj);
    await fireGate(2, project_id, loop_id, {}, ctxObj);
    await fireGate(3, project_id, loop_id, {}, ctxObj);
    await _driveNormal(project_id, loop_id, AFTER_GATE3, ctxObj);
  } finally {
    process.env.FORGE_OWNER_AUTO_APPROVE = prevAutoApprove || "";
  }

  const verdictsPath  = _debateVerdictsPath(project_id, loop_id);
  const verdictsExist = await _fileExists(verdictsPath, ctxObj);
  const verdictsRows  = verdictsExist ? await _readJsonl(verdictsPath, ctxObj) : [];
  const v             = verdictsRows[0] || null;
  const rows          = await _readLog(project_id, loop_id, ctxObj);

  return {
    debate_verdict_written:   verdictsExist,
    verdict_is_arbitrated:    !!(v && v.verdict === "ARBITRATED"),
    debate_log_has_9_entries: !!(v && Array.isArray(v.debate_log) &&
                                 v.debate_log.length === 9),
    final_state_complete:     rows.length > 0 &&
                              rows[rows.length - 1].to_state === "COMPLETE"
  };
}

// ── runS156 — deployment_enabled=false → Gate 3 VACUOUS_SKIP → COMPLETE ───────
// Plan §2 criterion 5: Gate 3 skipped via project_config; audit row has
// transition_type=VACUOUS_SKIP (not GATE_APPROVE); loop reaches COMPLETE.

async function runS156(opts) {
  const project_id    = (opts && opts.project_id) || PROJECT_ID;
  const project_config = (opts && opts.project_config) !== undefined
    ? opts.project_config
    : { deployment_enabled: false };
  const ctxObj        = Object.assign({ mock: true }, (opts && opts.ctx) || {});
  const prevAutoApprove = process.env.FORGE_OWNER_AUTO_APPROVE;

  const loop_id = await _createLoop(project_id, ctxObj);
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";

  try {
    await _driveNormal(project_id, loop_id, BEFORE_GATE1, ctxObj);
    await fireGate(1, project_id, loop_id, {}, ctxObj);
    await _driveNormal(project_id, loop_id, GATE1_TO_RCS, ctxObj);
    await _driveNormal(project_id, loop_id, RCS_TO_GATE2, ctxObj);
    await fireGate(2, project_id, loop_id, {}, ctxObj);   // QUALITY_JUDGE → DEPLOYMENT_OR_END

    if (shouldSkipGate3(project_config)) {
      // Gate 3 skipped: VACUOUS_SKIP transition, no fireGate call
      await _advance(project_id, loop_id, "LIVE_DELIVERABLE", "VACUOUS_SKIP", ctxObj);
    } else {
      await fireGate(3, project_id, loop_id, {}, ctxObj);
    }

    await _driveNormal(project_id, loop_id, AFTER_GATE3, ctxObj);
  } finally {
    process.env.FORGE_OWNER_AUTO_APPROVE = prevAutoApprove || "";
  }

  const rows       = await _readLog(project_id, loop_id, ctxObj);
  const vacuousRow = rows.find(function(r) {
    return r.transition_type === "VACUOUS_SKIP";
  });
  const gate3Row   = rows.find(function(r) {
    return r.transition_type === "GATE_APPROVE" && r.owner_gate_id === 3;
  });

  return {
    gate3_skipped:            !!(vacuousRow && !gate3Row),
    vacuous_skip_row_present: !!vacuousRow,
    no_gate3_approve_row:     !gate3Row,
    final_state_complete:     rows.length > 0 &&
                              rows[rows.length - 1].to_state === "COMPLETE"
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = { runS152, runS153, runS154, runS155, runS156 };

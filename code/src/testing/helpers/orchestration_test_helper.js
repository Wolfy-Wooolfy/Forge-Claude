"use strict";

// Testing infrastructure for Stage 10.1 orchestration scenarios.
// Not part of the production runtime — called exclusively by module_call scenarios.

const path = require("path");

// Lazy requires to avoid circular-dependency / early-load issues
function _graph()     { return require("../runtime/orchestration/conversation_graph"); }
function _loopState() { return require("../runtime/orchestration/loop_state"); }
function _regModule() { return require("../runtime/orchestration/_registry"); }
function _toolsReg()  { return require("../tools/_registry").getDefaultRegistry(); }

// ── S139 helper — state-machine checks ───────────────────────────────────────
// Runs 4 deterministic checks against conversation_graph.js pure functions
// plus one createLoop check (to confirm initial state is OWNER_INTENT).
// Cleans up the throwaway project immediately before returning.

async function runS139Checks(ctx) {
  const cg    = _graph();
  const ls    = _loopState();
  const reg   = _toolsReg();
  const ctxObj = ctx || {};

  const t1 = cg.validateTransition("OWNER_INTENT",  "ARCHITECT_DESIGN", "intent_captured");
  const t2 = cg.validateTransition("OWNER_INTENT",  "BUILDER",          "anything");
  const t3 = cg.validateTransition("COMPLETE",      "OWNER_INTENT",     "anything");

  // createLoop check — uses a fixed project_id so we can clean up deterministically
  const testProjectId = "_s139_temp";
  const testLoopId    = "test-loop-s139";
  let initialState    = null;
  let loopError       = null;

  try {
    const graph  = await ls.createLoop(testProjectId, testLoopId, ctxObj);
    initialState = graph.current_state;
  } catch (err) {
    loopError = err.message;
  } finally {
    // Always clean up — even if createLoop failed partway through
    try {
      await reg.invoke(
        "fs.delete_dir",
        { path: "artifacts/projects/" + testProjectId },
        ctxObj
      );
    } catch (_e) { /* best-effort cleanup */ }
  }

  return {
    initial_state_owner_intent:               initialState === "OWNER_INTENT",
    transition_owner_to_architect_allowed:    t1.allowed  === true,
    transition_owner_to_builder_allowed:      t2.allowed  === false,
    transition_complete_to_any_allowed:       t3.allowed  === false,
    loop_error:                               loopError   || null
  };
}

// ── S140 helper — loop state persists across steps ────────────────────────────
// 1. createLoop with fixed IDs
// 2. Append 4 nodes (1 initial + 3 transitions)
// 3. Append 3 audit rows (one per transition)
// 4. Set current_state to match last transition destination
// 5. loadLoop (simulated process restart) and verify graph content
// 6. Count JSONL rows
// 7. Validate each audit row against AuditLogRow schema
// Cleanup is handled by scenario cleanup_project field (not here).

async function runS140Sequence(ctx) {
  const ls     = _loopState();
  const reg    = _toolsReg();
  const ctxObj = ctx || {};

  const projectId = "test_s140";
  const loopId    = "test-loop-s140";

  // 1 — create loop
  const graph = await ls.createLoop(projectId, loopId, ctxObj);
  const graphExists = !!(graph && graph.loop_id === loopId);

  const now = () => new Date().toISOString();

  // 2 — append 4 nodes (initial OWNER_INTENT node + 3 transition nodes)
  await ls.appendNode(projectId, loopId, {
    node_id: "n0", role_id: "owner_intent_capture", timestamp: now(),
    invocation_id: "inv0", mock_mode: true, cost_usd: 0
  }, ctxObj);
  await ls.appendNode(projectId, loopId, {
    node_id: "n1", role_id: "architect", timestamp: now(),
    invocation_id: "inv1", mock_mode: true, cost_usd: 0
  }, ctxObj);
  await ls.appendNode(projectId, loopId, {
    node_id: "n2", role_id: "spec_writer", timestamp: now(),
    invocation_id: "inv2", mock_mode: true, cost_usd: 0
  }, ctxObj);
  await ls.appendNode(projectId, loopId, {
    node_id: "n3", role_id: "reviewer", timestamp: now(),
    invocation_id: "inv3", mock_mode: true, cost_usd: 0
  }, ctxObj);

  // 3 — append 3 audit rows (one per state transition)
  const rows = [
    { ts: now(), loop_id: loopId, from_state: "OWNER_INTENT",     to_state: "ARCHITECT_DESIGN",       transition_type: "NORMAL", mock: true, cost_usd: 0, role_invoked: "architect",  owner_gate_id: null },
    { ts: now(), loop_id: loopId, from_state: "ARCHITECT_DESIGN", to_state: "SPEC_WRITER_FORMALIZE",  transition_type: "NORMAL", mock: true, cost_usd: 0, role_invoked: "spec_writer", owner_gate_id: null },
    { ts: now(), loop_id: loopId, from_state: "SPEC_WRITER_FORMALIZE", to_state: "REVIEWER_SPEC",     transition_type: "NORMAL", mock: true, cost_usd: 0, role_invoked: "reviewer",   owner_gate_id: null }
  ];
  for (const row of rows) {
    await ls.appendAuditRow(projectId, loopId, row, ctxObj);
  }

  // 4 — set current state to last transition destination
  await ls.setCurrentState(projectId, loopId, "REVIEWER_SPEC", ctxObj);

  // 5 — reload loop (simulates process restart)
  const reloaded = await ls.loadLoop(projectId, loopId, ctxObj);

  // 6 — count JSONL rows
  const logPath    = "artifacts/projects/" + projectId + "/orchestration/" + loopId + "/conversation_log.jsonl";
  const readResult = await reg.invoke("fs.read_file", { path: logPath }, ctxObj);
  let   auditRows  = -1;
  let   allRowsValid = false;

  if (readResult.status === "SUCCESS") {
    const lines = readResult.output.content.trim().split("\n").filter(Boolean);
    auditRows = lines.length;

    // 7 — validate each row against AuditLogRow required fields
    const REQUIRED = ["ts", "loop_id", "from_state", "to_state", "transition_type", "mock", "cost_usd"];
    allRowsValid = lines.every(line => {
      try {
        const parsed = JSON.parse(line);
        return REQUIRED.every(f => f in parsed);
      } catch (_e) {
        return false;
      }
    });
  }

  return {
    graph_exists:       graphExists,
    nodes_count:        reloaded ? reloaded.nodes.length : -1,
    current_state:      reloaded ? reloaded.current_state : null,
    audit_rows:         auditRows,
    all_rows_valid:     allRowsValid,
    reloaded_matches:   !!(reloaded && reloaded.loop_id === loopId && reloaded.project_id === projectId)
  };
}

// ── S141 helper — boot validation checks ─────────────────────────────────────
// 4 deterministic validate() calls — no I/O, pure logic checks.

function runS141Checks() {
  const reg   = _regModule();
  const cg    = _graph();

  // 1 — normal: all 17 states, ITERATION_CAP = 5 → should pass
  const r1    = reg.validate();

  // 2 — 16-state array → should fail (count mismatch)
  const r2    = reg.validate({ states_override: cg.STATES.slice(0, 16) });

  // 3 — wrong iteration cap → should fail
  const r3    = reg.validate({ iteration_cap_override: 4 });

  // 4 — 17 IDs but one misspelled → should fail (unknown ID + missing ID)
  const misspelled = cg.STATES.slice();
  const misspelledArr = [
    ...misspelled.slice(0, 16),
    "OWNER_INTNT"   // typo: ABORTED_BY_OWNER replaced with garbage
  ];
  const r4    = reg.validate({ states_override: misspelledArr });

  return {
    base_ok:           r1.ok    === true,
    base_errors_empty: Array.isArray(r1.errors) && r1.errors.length === 0,
    short_fails:       r2.ok    === false,
    cap_fails:         r3.ok    === false,
    misspell_fails:    r4.ok    === false
  };
}

module.exports = { runS139Checks, runS140Sequence, runS141Checks };

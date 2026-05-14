"use strict";

// ── ITERATION CAP SEMANTICS (contract v1.2.0 §6.2, §11.2, §2.2) ───────────────
// Path B (binding): exceeded := iteration_count >= ITERATION_CAP
// The counter NEVER exceeds ITERATION_CAP (= 5) in any persisted graph.
// tryAdvanceForLoopBack checks BEFORE incrementing:
//   - count >= ITERATION_CAP → triggerEscalation, do NOT increment
//   - count <  ITERATION_CAP → increment (max stored = ITERATION_CAP), LOOP_BACK row
// Authority: DECISION-20260513-1500-orchestration-loop-iteration-cap-clarification-v1-2-0.md

const { ITERATION_CAP }                  = require("./conversation_graph");
const { loadLoop, saveLoop,
        appendAuditRow, setCurrentState } = require("./loop_state");
const { getDefaultRegistry }             = require("../tools/_registry");

// ── Pure helpers ───────────────────────────────────────────────────────────────

// (graph) → { exceeded: bool, count: int, cap: int }
// exceeded = true means: a REJECT_AND_LOOP at this point would escalate.
function checkCap(graph) {
  const count = (graph && typeof graph.iteration_count === "number")
    ? graph.iteration_count : 0;
  return { exceeded: count >= ITERATION_CAP, count, cap: ITERATION_CAP };
}

// ── Escalation path helper ─────────────────────────────────────────────────────

function _escalationPath(project_id, loop_id, ts) {
  const tsSafe = ts.replace(/[:.]/g, "-");
  return "artifacts/projects/" + project_id +
         "/orchestration/" + loop_id +
         "/escalation_" + tsSafe + ".md";
}

function _escalationContent(project_id, loop_id, ts, reason, graph) {
  return [
    "# Loop Escalation — " + loop_id,
    "",
    "Project: " + project_id,
    "Loop ID: " + loop_id,
    "Timestamp: " + ts,
    "Reason: " + reason,
    "",
    "## Final State",
    "- iteration_count: " + (graph ? graph.iteration_count : "unknown"),
    "- current_state: "  + (graph ? graph.current_state   : "unknown"),
    "- nodes: "          + (graph && Array.isArray(graph.nodes) ? graph.nodes.length : 0),
    "- edges: "          + (graph && Array.isArray(graph.edges) ? graph.edges.length : 0),
    "",
    "## Owner action required",
    "- Inspect this report",
    "- Decide whether to start a new loop or abandon the project",
    "- No automatic restart will occur"
  ].join("\n");
}

// ── triggerEscalation ──────────────────────────────────────────────────────────
// async (project_id, loop_id, reason, ctx) → { escalation_path, ts }
// Side effects:
//   1. Writes escalation markdown at v1.1.0 path (orchestration/<loop_id>/escalation_<ts>.md)
//   2. Appends ESCALATE audit row (reason in markdown only — schema additionalProperties:false)
//   3. setCurrentState → "ESCALATED"

async function triggerEscalation(project_id, loop_id, reason, ctx) {
  const ctxObj  = ctx || {};
  const graph   = await loadLoop(project_id, loop_id, ctxObj);
  if (!graph) {
    throw new Error("triggerEscalation: loop not found: " + loop_id);
  }

  const ts      = new Date().toISOString();
  const escPath = _escalationPath(project_id, loop_id, ts);
  const content = _escalationContent(project_id, loop_id, ts, reason, graph);

  const writeResult = await getDefaultRegistry().invoke(
    "fs.write_file",
    { path: escPath, content },
    ctxObj
  );
  if (!writeResult || writeResult.status !== "SUCCESS") {
    throw new Error("triggerEscalation: failed to write escalation artifact: " +
      ((writeResult && writeResult.metadata && writeResult.metadata.reason) || "UNKNOWN"));
  }

  await appendAuditRow(project_id, loop_id, {
    ts,
    loop_id,
    from_state:       graph.current_state,
    to_state:         "ESCALATED",
    transition_type:  "ESCALATE",
    role_invoked:     null,
    mock:             ctxObj.mock || false,
    cost_usd:         0,
    owner_gate_id:    null
  }, ctxObj);

  await setCurrentState(project_id, loop_id, "ESCALATED", ctxObj);

  return { escalation_path: escPath, ts };
}

// ── tryAdvanceForLoopBack ──────────────────────────────────────────────────────
// async (project_id, loop_id, ctx)
//   → { advanced: bool, escalated: bool, graph, escalation_path? }
//
// Atomic check-then-act for Gate 2 REJECT_AND_LOOP path.
// If cap not exceeded: increment count, append LOOP_BACK row, return to BUILDER.
// If cap exceeded: triggerEscalation (no increment), return escalated outcome.

async function tryAdvanceForLoopBack(project_id, loop_id, ctx) {
  const ctxObj = ctx || {};
  const graph  = await loadLoop(project_id, loop_id, ctxObj);
  if (!graph) {
    throw new Error("tryAdvanceForLoopBack: loop not found: " + loop_id);
  }

  const capCheck = checkCap(graph);

  if (capCheck.exceeded) {
    const { escalation_path, ts } = await triggerEscalation(
      project_id, loop_id, "iteration_cap_exceeded", ctxObj
    );
    const updatedGraph = await loadLoop(project_id, loop_id, ctxObj);
    return {
      advanced:        false,
      escalated:       true,
      graph:           updatedGraph,
      escalation_path
    };
  }

  // Cap not exceeded: increment and continue
  graph.iteration_count += 1;
  await saveLoop(project_id, loop_id, graph, ctxObj);

  await appendAuditRow(project_id, loop_id, {
    ts:              new Date().toISOString(),
    loop_id,
    from_state:      "QUALITY_JUDGE",
    to_state:        "BUILDER",
    transition_type: "LOOP_BACK",
    role_invoked:    null,
    mock:            ctxObj.mock || false,
    cost_usd:        0,
    owner_gate_id:   2
  }, ctxObj);

  return { advanced: true, escalated: false, graph };
}

// ── Export ─────────────────────────────────────────────────────────────────────

module.exports = {
  ITERATION_CAP,
  checkCap,
  tryAdvanceForLoopBack,
  triggerEscalation
};

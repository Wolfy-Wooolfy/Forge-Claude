"use strict";

const crypto = require("crypto");

const { getDefaultRegistry, resetDefaultRegistry } = require("../tools/_registry");
const { validateGraph, STATES }                    = require("./conversation_graph");

// ── AuditLogRow validation (contract §12.2) ───────────────────────────────────

const AUDIT_REQUIRED       = ["ts", "loop_id", "from_state", "to_state", "transition_type", "mock", "cost_usd"];
const AUDIT_OPTIONAL       = Object.freeze(["role_invoked", "owner_gate_id"]);
const AUDIT_ALLOWED        = Object.freeze([...AUDIT_REQUIRED, ...AUDIT_OPTIONAL]);
const VALID_TRANSITION_TYPES = Object.freeze(
  ["NORMAL", "GATE_APPROVE", "GATE_REJECT", "LOOP_BACK", "ESCALATE", "ABORT", "VACUOUS_SKIP"]
);

function _validateAuditRow(row) {
  const errors = [];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return ["row must be a plain object"];
  }
  for (const field of AUDIT_REQUIRED) {
    if (!(field in row)) errors.push("missing required field: " + field);
  }
  if (errors.length > 0) return errors;

  if (typeof row.ts      !== "string") errors.push("ts must be a string");
  if (typeof row.loop_id !== "string") errors.push("loop_id must be a string");

  if (!STATES.includes(row.from_state))
    errors.push("from_state '" + row.from_state + "' is not a valid state ID");
  if (!STATES.includes(row.to_state))
    errors.push("to_state '" + row.to_state + "' is not a valid state ID");
  if (!VALID_TRANSITION_TYPES.includes(row.transition_type))
    errors.push("transition_type '" + row.transition_type + "' is not valid");

  if (typeof row.mock    !== "boolean") errors.push("mock must be a boolean");
  if (typeof row.cost_usd !== "number" || row.cost_usd < 0)
    errors.push("cost_usd must be a non-negative number");

  // Contract §12.2: additionalProperties: false
  for (const key of Object.keys(row)) {
    if (!AUDIT_ALLOWED.includes(key)) {
      errors.push("unexpected field: " + key + " (contract §12.2 additionalProperties:false)");
    }
  }

  return errors;
}

// ── Path helpers (contract §12.1 path, with loop_id subdirectory per PROMPT §1.2) ──

function _graphPath(project_id, loop_id) {
  return "artifacts/projects/" + project_id + "/orchestration/" + loop_id + "/graph.json";
}

function _logPath(project_id, loop_id) {
  return "artifacts/projects/" + project_id + "/orchestration/" + loop_id + "/conversation_log.jsonl";
}

// ── Registry helper ───────────────────────────────────────────────────────────

function _reg() {
  return getDefaultRegistry();
}

// ── Loop lifecycle ────────────────────────────────────────────────────────────

async function createLoop(project_id, loop_id, ctx) {
  const id  = loop_id || crypto.randomUUID();
  const now = new Date().toISOString();

  const graph = {
    project_id,
    loop_id:         id,
    iteration_count: 0,
    current_state:   "OWNER_INTENT",
    nodes:           [],
    edges:           [],
    started_at:      now,
    last_advanced_at: now
  };

  const validation = validateGraph(graph);
  if (!validation.valid) {
    throw new Error("createLoop: initial graph invalid: " + validation.errors.join("; "));
  }

  const result = await _reg().invoke(
    "fs.write_file",
    { path: _graphPath(project_id, id), content: JSON.stringify(graph, null, 2) },
    ctx || {}
  );
  if (result.status !== "SUCCESS") {
    throw new Error("createLoop: fs.write_file failed: " +
      ((result.metadata && result.metadata.reason) || result.status));
  }

  return graph;
}

async function loadLoop(project_id, loop_id, ctx) {
  const existsResult = await _reg().invoke(
    "fs.exists",
    { path: _graphPath(project_id, loop_id) },
    ctx || {}
  );
  if (!existsResult.output || !existsResult.output.exists) return null;

  const readResult = await _reg().invoke(
    "fs.read_file",
    { path: _graphPath(project_id, loop_id) },
    ctx || {}
  );
  if (readResult.status !== "SUCCESS") return null;

  try {
    return JSON.parse(readResult.output.content);
  } catch (_e) {
    return null;
  }
}

async function saveLoop(project_id, loop_id, graph, ctx) {
  const validation = validateGraph(graph);
  if (!validation.valid) {
    throw new Error("saveLoop: graph invalid: " + validation.errors.join("; "));
  }

  const result = await _reg().invoke(
    "fs.write_file",
    { path: _graphPath(project_id, loop_id), content: JSON.stringify(graph, null, 2) },
    ctx || {}
  );
  if (result.status !== "SUCCESS") {
    throw new Error("saveLoop: fs.write_file failed: " +
      ((result.metadata && result.metadata.reason) || result.status));
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function appendNode(project_id, loop_id, node, ctx) {
  const graph = await loadLoop(project_id, loop_id, ctx);
  if (!graph) throw new Error("appendNode: loop not found: " + loop_id);
  graph.nodes.push(node);
  graph.last_advanced_at = new Date().toISOString();
  await saveLoop(project_id, loop_id, graph, ctx);
  return graph;
}

async function recordTransition(project_id, loop_id, edge, ctx) {
  const graph = await loadLoop(project_id, loop_id, ctx);
  if (!graph) throw new Error("recordTransition: loop not found: " + loop_id);
  graph.edges.push(edge);
  graph.last_advanced_at = new Date().toISOString();
  await saveLoop(project_id, loop_id, graph, ctx);
  return graph;
}

async function setCurrentState(project_id, loop_id, new_state, ctx) {
  const graph = await loadLoop(project_id, loop_id, ctx);
  if (!graph) throw new Error("setCurrentState: loop not found: " + loop_id);
  graph.current_state    = new_state;
  graph.last_advanced_at = new Date().toISOString();
  await saveLoop(project_id, loop_id, graph, ctx);
  return graph;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

async function appendAuditRow(project_id, loop_id, row, ctx) {
  const errors = _validateAuditRow(row);
  if (errors.length > 0) {
    throw new Error("appendAuditRow: invalid row: " + errors.join("; "));
  }

  const result = await _reg().invoke(
    "fs.append_file",
    { path: _logPath(project_id, loop_id), content: JSON.stringify(row) + "\n" },
    ctx || {}
  );
  if (result.status !== "SUCCESS") {
    throw new Error("appendAuditRow: fs.append_file failed: " +
      ((result.metadata && result.metadata.reason) || result.status));
  }
}

// ── Read-only helpers ─────────────────────────────────────────────────────────

async function getGraph(project_id, loop_id, ctx) {
  return loadLoop(project_id, loop_id, ctx);
}

async function getCurrentState(project_id, loop_id, ctx) {
  const graph = await loadLoop(project_id, loop_id, ctx);
  return graph ? graph.current_state : null;
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  createLoop,
  loadLoop,
  saveLoop,
  appendNode,
  recordTransition,
  setCurrentState,
  appendAuditRow,
  getGraph,
  getCurrentState
};

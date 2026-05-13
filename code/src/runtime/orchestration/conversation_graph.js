"use strict";

// ── State machine constants (contract §2.1) ───────────────────────────────────
// 14 forward states + 3 terminal states = 17 total.
// OWNER_GATE_1/2/3 are NOT state IDs — they are edge guards on transitions.

const STATES = Object.freeze([
  "OWNER_INTENT", "ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
  "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT", "TEST_DESIGN",
  "BUILDER", "RUN_TESTS", "REVIEWER_CODE_AND_SECURITY", "DOCUMENTATION",
  "QUALITY_JUDGE", "DEPLOYMENT_OR_END", "LIVE_DELIVERABLE",
  "COMPLETE", "ESCALATED", "ABORTED_BY_OWNER"
]);

const TERMINAL_STATES = Object.freeze(["COMPLETE", "ESCALATED", "ABORTED_BY_OWNER"]);

// Literal constant — contract §6.1 forbids runtime override.
// Boot validator checks this with strict equality (=== 5), not >=.
const ITERATION_CAP = 5;

// ── Transition table (contract §2.2, verbatim — all 28 rows) ─────────────────
// from: null  = loop-created entry point (no predecessor state).
// from: "*"   = any non-terminal state wildcard (hard-failure / abort rows).
// gate_check: null = transition fires unconditionally on trigger.

const TRANSITION_TABLE = Object.freeze([
  {
    from: null,
    to:          "OWNER_INTENT",
    trigger:     "orchestration.start_loop invoked",
    gate_check:  null
  },
  {
    from:        "OWNER_INTENT",
    to:          "ARCHITECT_DESIGN",
    trigger:     "Owner intent captured in graph",
    gate_check:  null
  },
  {
    from:        "ARCHITECT_DESIGN",
    to:          "SPEC_WRITER_FORMALIZE",
    trigger:     "role.invoke(architect) → SUCCESS",
    gate_check:  null
  },
  {
    from:        "SPEC_WRITER_FORMALIZE",
    to:          "REVIEWER_SPEC",
    trigger:     "role.invoke(spec_writer) → SUCCESS",
    gate_check:  null
  },
  {
    from:        "REVIEWER_SPEC",
    to:          "COST_ESTIMATE",
    trigger:     "Reviewer Phase A output has zero BLOCKER issues",
    gate_check:  null
  },
  {
    from:        "REVIEWER_SPEC",
    to:          "ESCALATED",
    trigger:     "Reviewer Phase A output has ≥1 BLOCKER issue",
    gate_check:  null
  },
  {
    from:        "COST_ESTIMATE",
    to:          "ENV_REPORT",
    trigger:     "role.invoke(cost_estimator) → SUCCESS",
    gate_check:  null
  },
  {
    from:        "ENV_REPORT",
    to:          "ENV_REPORT",
    trigger:     "role.invoke(environment) → SUCCESS; blocks on Gate 1",
    gate_check:  "Gate 1 — BLOCK"
  },
  {
    from:        "ENV_REPORT",
    to:          "TEST_DESIGN",
    trigger:     "Gate 1 owner response = APPROVE",
    gate_check:  "Gate 1 APPROVE"
  },
  {
    from:        "ENV_REPORT",
    to:          "ESCALATED",
    trigger:     "Gate 1 owner response = REJECT",
    gate_check:  "Gate 1 REJECT"
  },
  {
    from:        "TEST_DESIGN",
    to:          "BUILDER",
    trigger:     "role.invoke(test_designer) → SUCCESS",
    gate_check:  null
  },
  {
    from:        "BUILDER",
    to:          "RUN_TESTS",
    trigger:     "role.invoke(builder) → SUCCESS",
    gate_check:  null
  },
  {
    from:        "RUN_TESTS",
    to:          "REVIEWER_CODE_AND_SECURITY",
    trigger:     "builtproject.run_scenarios completes",
    gate_check:  null
  },
  {
    from:        "REVIEWER_CODE_AND_SECURITY",
    to:          "DOCUMENTATION",
    trigger:     "Debate resolves (AGREE or ARBITRATED); no unresolved BLOCKER",
    gate_check:  null
  },
  {
    from:        "REVIEWER_CODE_AND_SECURITY",
    to:          "ESCALATED",
    trigger:     "Unresolved BLOCKER after debate; or hard failure",
    gate_check:  null
  },
  {
    from:        "DOCUMENTATION",
    to:          "QUALITY_JUDGE",
    trigger:     "role.invoke(documentation) → SUCCESS",
    gate_check:  null
  },
  {
    from:        "QUALITY_JUDGE",
    to:          "QUALITY_JUDGE",
    trigger:     "role.invoke(quality_judge) → SUCCESS; blocks on Gate 2",
    gate_check:  "Gate 2 — BLOCK"
  },
  {
    from:        "QUALITY_JUDGE",
    to:          "DEPLOYMENT_OR_END",
    trigger:     "Gate 2 owner response = APPROVE_SHIP",
    gate_check:  "Gate 2 APPROVE_SHIP"
  },
  {
    from:        "QUALITY_JUDGE",
    to:          "DEPLOYMENT_OR_END",
    trigger:     "Gate 2 owner response = APPROVE_WITH_CAVEATS; caveats logged in audit trail",
    gate_check:  "Gate 2 APPROVE_WITH_CAVEATS"
  },
  {
    from:        "QUALITY_JUDGE",
    to:          "BUILDER",
    trigger:     "Gate 2 owner response = REJECT_AND_LOOP; iteration_count ≤ ITERATION_CAP",
    gate_check:  "Gate 2 REJECT_AND_LOOP"
  },
  {
    from:        "QUALITY_JUDGE",
    to:          "ESCALATED",
    trigger:     "Gate 2 REJECT_AND_LOOP; iteration_count > ITERATION_CAP",
    gate_check:  "Cap exceeded"
  },
  {
    from:        "DEPLOYMENT_OR_END",
    to:          "LIVE_DELIVERABLE",
    trigger:     "deployment_enabled = false; Gate 3 vacuous skip",
    gate_check:  null
  },
  {
    from:        "DEPLOYMENT_OR_END",
    to:          "DEPLOYMENT_OR_END",
    trigger:     "deployment_enabled = true; blocks on Gate 3",
    gate_check:  "Gate 3 — BLOCK"
  },
  {
    from:        "DEPLOYMENT_OR_END",
    to:          "LIVE_DELIVERABLE",
    trigger:     "Gate 3 owner response = APPROVE; deploy tools execute",
    gate_check:  "Gate 3 APPROVE"
  },
  {
    from:        "DEPLOYMENT_OR_END",
    to:          "ESCALATED",
    trigger:     "Gate 3 owner response = REJECT",
    gate_check:  "Gate 3 REJECT"
  },
  {
    from:        "LIVE_DELIVERABLE",
    to:          "COMPLETE",
    trigger:     "orchestration_summary.md written; audit trail finalized",
    gate_check:  null
  },
  {
    from:        "*",
    to:          "ESCALATED",
    trigger:     "Hard failure: L3 deny · schema validation fail · budget exceeded · missing role",
    gate_check:  null
  },
  {
    from:        "*",
    to:          "ABORTED_BY_OWNER",
    trigger:     "orchestration.abort tool invoked",
    gate_check:  null
  }
]);

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isValidState(state) {
  return STATES.includes(state);
}

function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

function getAllowedTransitions(from_state) {
  const result       = [];
  const isNonTerminal = !TERMINAL_STATES.includes(from_state);
  for (const row of TRANSITION_TABLE) {
    if (row.from === null) continue;
    if (row.from === from_state || (row.from === "*" && isNonTerminal)) {
      result.push({ to: row.to, trigger: row.trigger, gate_check: row.gate_check });
    }
  }
  return result;
}

// trigger parameter is informational — matching is from+to only (triggers are not
// unique keys; a from→to pair may fire on different triggers at runtime).
function validateTransition(from, to /*, trigger */) {
  if (TERMINAL_STATES.includes(from)) {
    return { allowed: false, reason: "Terminal state '" + from + "' has no outgoing transitions" };
  }
  const isNonTerminal = !TERMINAL_STATES.includes(from);
  for (const row of TRANSITION_TABLE) {
    if (row.from === null) continue;
    const fromMatch = row.from === from || (row.from === "*" && isNonTerminal);
    if (fromMatch && row.to === to) {
      return { allowed: true, gate_check: row.gate_check || null };
    }
  }
  return { allowed: false, reason: "No transition defined from '" + from + "' to '" + to + "'" };
}

// ── Graph schema validation (contract §3.3, hand-coded predicates) ────────────

function validateGraph(graph) {
  const errors = [];

  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { valid: false, errors: ["graph must be a plain object"] };
  }

  const required = [
    "project_id", "loop_id", "iteration_count", "current_state",
    "nodes", "edges", "started_at", "last_advanced_at"
  ];
  for (const field of required) {
    if (!(field in graph)) errors.push("missing required field: " + field);
  }
  if (errors.length > 0) return { valid: false, errors };

  if (typeof graph.project_id !== "string" || !graph.project_id)
    errors.push("project_id must be a non-empty string");
  if (typeof graph.loop_id !== "string" || !graph.loop_id)
    errors.push("loop_id must be a non-empty string");

  if (typeof graph.iteration_count !== "number" || !Number.isInteger(graph.iteration_count))
    errors.push("iteration_count must be an integer");
  else if (graph.iteration_count < 0 || graph.iteration_count > ITERATION_CAP)
    errors.push("iteration_count must be 0–" + ITERATION_CAP);

  if (!STATES.includes(graph.current_state))
    errors.push("current_state '" + graph.current_state + "' is not a valid state ID");

  if (!Array.isArray(graph.nodes))  errors.push("nodes must be an array");
  if (!Array.isArray(graph.edges))  errors.push("edges must be an array");

  if (typeof graph.started_at !== "string")
    errors.push("started_at must be a string (ISO 8601)");
  if (typeof graph.last_advanced_at !== "string")
    errors.push("last_advanced_at must be a string (ISO 8601)");

  return { valid: errors.length === 0, errors };
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  STATES,
  TERMINAL_STATES,
  TRANSITION_TABLE,
  ITERATION_CAP,

  isValidState,
  isTerminalState,
  getAllowedTransitions,
  validateTransition,
  validateGraph
};

"use strict";

// ── GATE RESPONSE OPTIONS (contract §7.2–7.4, binding) ───────────────────────
// Gate 1 (ENV_REPORT):          APPROVE | REJECT
// Gate 2 (QUALITY_JUDGE):       APPROVE_SHIP | APPROVE_WITH_CAVEATS | REJECT_AND_LOOP
// Gate 3 (DEPLOYMENT_OR_END):   APPROVE (requires payload.selected_target) | REJECT
//
// ── CTX.GATE_RESPONDER CONVENTION ─────────────────────────────────────────────
// Production: ctx has no gate_responder → gate blocks indefinitely pending owner
//             response via orchestration.respond (Stage 10.4). fireGate throws if
//             neither gate_responder nor FORGE_OWNER_AUTO_APPROVE is available.
// Tests:      ctx.gate_responder is an async (envelope) → { response[, selected_target] }
//             function that returns the owner's response token + any extras.
//             Gate 3 APPROVE must include { response: "APPROVE", selected_target: "..." }.
// Auto-test:  FORGE_OWNER_AUTO_APPROVE=1 provides non-blocking defaults:
//               Gate 1 → { response: "APPROVE" }
//               Gate 2 → { response: "APPROVE_SHIP" }
//               Gate 3 → { response: "APPROVE", selected_target: "_test_default" }
// Track A:    grep "gate_responder" in runtime/ outside this file → 0.
//             grep "gate_responder" in testing/ outside gates_test_helper.js → 0.

const { loadLoop, appendAuditRow, setCurrentState }  = require("./loop_state");
const { tryAdvanceForLoopBack }                      = require("./iteration_controller");

// ── Constants ─────────────────────────────────────────────────────────────────

const GATE_IDS = Object.freeze([1, 2, 3]);

const GATE_HOST_STATES = Object.freeze({
  1: "ENV_REPORT",
  2: "QUALITY_JUDGE",
  3: "DEPLOYMENT_OR_END"
});

const GATE_RESPONSE_OPTIONS = Object.freeze({
  1: Object.freeze(["APPROVE", "REJECT"]),
  2: Object.freeze(["APPROVE_SHIP", "APPROVE_WITH_CAVEATS", "REJECT_AND_LOOP"]),
  3: Object.freeze(["APPROVE", "REJECT"])
});

// next_state for each gate×response (Gate 2 REJECT_AND_LOOP resolved by tryAdvanceForLoopBack)
const _NEXT_STATE = Object.freeze({
  "1:APPROVE":              "TEST_DESIGN",
  "1:REJECT":               "ESCALATED",
  "2:APPROVE_SHIP":         "DEPLOYMENT_OR_END",
  "2:APPROVE_WITH_CAVEATS": "DEPLOYMENT_OR_END",
  "3:APPROVE":              "LIVE_DELIVERABLE",
  "3:REJECT":               "ESCALATED"
});

// FORGE_OWNER_AUTO_APPROVE=1 defaults (§10.2 — test harness only)
const _AUTO_RESPONSE = Object.freeze({
  1: { response: "APPROVE" },
  2: { response: "APPROVE_SHIP" },
  3: { response: "APPROVE", selected_target: "_test_default" }
});

// ── validateGateEnvelope ──────────────────────────────────────────────────────
// (envelope) → { valid: bool, errors: string[] }
// Validates OwnerGateEnvelope shape per contract §7.1.
// If response is present, also validates it against GATE_RESPONSE_OPTIONS[gate_id].
// Gate 3 APPROVE: requires payload.selected_target.

function validateGateEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { valid: false, errors: ["envelope must be a plain object"] };
  }

  const required = ["gate_id", "project_id", "loop_id", "payload", "timeout_behavior"];
  for (const f of required) {
    if (!(f in envelope)) errors.push("missing required field: " + f);
  }
  if (errors.length > 0) return { valid: false, errors };

  if (!GATE_IDS.includes(envelope.gate_id))
    errors.push("gate_id must be 1, 2, or 3");
  if (typeof envelope.project_id !== "string" || !envelope.project_id)
    errors.push("project_id must be a non-empty string");
  if (typeof envelope.loop_id !== "string" || !envelope.loop_id)
    errors.push("loop_id must be a non-empty string");
  if (!envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload))
    errors.push("payload must be a plain object");
  if (envelope.timeout_behavior !== "BLOCK_INDEFINITELY")
    errors.push("timeout_behavior must be BLOCK_INDEFINITELY");

  if (errors.length > 0) return { valid: false, errors };

  if (envelope.response !== null && envelope.response !== undefined) {
    const valid_opts = GATE_RESPONSE_OPTIONS[envelope.gate_id];
    if (!valid_opts.includes(envelope.response)) {
      errors.push("response '" + envelope.response + "' is not valid for Gate " + envelope.gate_id);
    }
    if (envelope.gate_id === 3 && envelope.response === "APPROVE") {
      if (!envelope.payload.selected_target) {
        errors.push("Gate 3 APPROVE requires payload.selected_target");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── shouldSkipGate3 ───────────────────────────────────────────────────────────
// Pure. (project_config) → bool
// Returns true when Gate 3 should be vacuously skipped (contract §7.4).
// Skips ONLY when deployment_enabled is explicitly false.
// Missing/null/undefined defaults to fire (conservative per
// DECISION-20260514-1000 Option A, mirrors PROMPT §1.2).

function shouldSkipGate3(project_config) {
  if (!project_config || typeof project_config !== "object") return false;
  return project_config.deployment_enabled === false;
}

// ── fireGate ──────────────────────────────────────────────────────────────────
// async (gate_id, project_id, loop_id, payload, ctx)
//   → { envelope, response, responded_at, next_state[, escalated, escalation_path] }
//
// Resolves owner response, then:
//   Gate 2 REJECT_AND_LOOP → delegates to tryAdvanceForLoopBack (which owns the
//     LOOP_BACK / ESCALATE audit row and state mutation).
//   All other responses → appends GATE_APPROVE or GATE_REJECT audit row,
//     calls setCurrentState, returns next_state.
//
// Throws if no responder is available (timeout_behavior: BLOCK_INDEFINITELY).

async function fireGate(gate_id, project_id, loop_id, payload, ctx) {
  const ctxObj = ctx || {};

  if (!GATE_IDS.includes(gate_id)) {
    throw new Error("fireGate: invalid gate_id: " + gate_id);
  }

  const envelope = {
    gate_id,
    project_id,
    loop_id,
    payload:          payload || {},
    timeout_behavior: "BLOCK_INDEFINITELY",
    responded_at:     null,
    response:         null
  };

  const envCheck = validateGateEnvelope(envelope);
  if (!envCheck.valid) {
    throw new Error("fireGate: invalid envelope: " + envCheck.errors.join("; "));
  }

  // ── Resolve owner response ─────────────────────────────────────────────────
  let respData;

  if (typeof ctxObj.gate_responder === "function") {
    respData = await ctxObj.gate_responder(envelope);
  } else if (process.env.FORGE_OWNER_AUTO_APPROVE === "1") {
    respData = _AUTO_RESPONSE[gate_id];
  } else {
    throw new Error(
      "fireGate: gate " + gate_id + " would block indefinitely — " +
      "no gate_responder in ctx and FORGE_OWNER_AUTO_APPROVE is not set"
    );
  }

  const response        = respData && respData.response;
  const selected_target = respData && respData.selected_target;
  const responded_at    = new Date().toISOString();

  if (!GATE_RESPONSE_OPTIONS[gate_id].includes(response)) {
    throw new Error(
      "fireGate: gate_responder returned invalid response '" + response +
      "' for Gate " + gate_id
    );
  }

  // Gate 3 APPROVE: selected_target is mandatory (contract §7.4 hard restriction)
  if (gate_id === 3 && response === "APPROVE" && !selected_target) {
    throw new Error("fireGate: Gate 3 APPROVE requires selected_target");
  }

  envelope.responded_at = responded_at;
  envelope.response     = response;
  if (gate_id === 3 && selected_target) {
    envelope.payload = Object.assign({}, envelope.payload, { selected_target });
  }

  // ── Gate 2 REJECT_AND_LOOP: delegate to iteration controller ───────────────
  if (gate_id === 2 && response === "REJECT_AND_LOOP") {
    const adv = await tryAdvanceForLoopBack(project_id, loop_id, ctxObj);
    return {
      envelope,
      response,
      responded_at,
      next_state:      adv.escalated ? "ESCALATED" : "BUILDER",
      escalated:       adv.escalated,
      escalation_path: adv.escalation_path || null
    };
  }

  // ── All other responses: append audit row + set state ─────────────────────
  const next_state      = _NEXT_STATE[gate_id + ":" + response];
  const from_state      = GATE_HOST_STATES[gate_id];
  const transition_type = response.startsWith("APPROVE") ? "GATE_APPROVE" : "GATE_REJECT";

  const graph = await loadLoop(project_id, loop_id, ctxObj);
  if (!graph) {
    throw new Error("fireGate: loop not found: " + loop_id);
  }

  await appendAuditRow(project_id, loop_id, {
    ts:              responded_at,
    loop_id,
    from_state,
    to_state:        next_state,
    transition_type,
    role_invoked:    null,
    mock:            ctxObj.mock || false,
    cost_usd:        0,
    owner_gate_id:   gate_id
  }, ctxObj);

  await setCurrentState(project_id, loop_id, next_state, ctxObj);

  return { envelope, response, responded_at, next_state };
}

// ── Export ─────────────────────────────────────────────────────────────────────

module.exports = {
  GATE_IDS,
  GATE_HOST_STATES,
  GATE_RESPONSE_OPTIONS,
  validateGateEnvelope,
  shouldSkipGate3,
  fireGate
};

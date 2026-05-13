"use strict";

const { STATES, ITERATION_CAP } = require("./conversation_graph");
const { listRoles }              = require("../agents/_role_registry");

// Contract §2.1 state IDs — hardcoded for cross-check against conversation_graph.js.
// If these two lists ever diverge, validate() will catch it.
const CONTRACT_STATES = Object.freeze([
  "OWNER_INTENT", "ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
  "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT", "TEST_DESIGN",
  "BUILDER", "RUN_TESTS", "REVIEWER_CODE_AND_SECURITY", "DOCUMENTATION",
  "QUALITY_JUDGE", "DEPLOYMENT_OR_END", "LIVE_DELIVERABLE",
  "COMPLETE", "ESCALATED", "ABORTED_BY_OWNER"
]);

// Required role_ids per contract §13.2.3
const REQUIRED_ROLE_IDS = Object.freeze([
  "architect", "spec_writer", "reviewer", "cost_estimator",
  "environment", "builder", "security_auditor", "test_designer",
  "documentation", "quality_judge", "deployment", "research"
]);

// ── validate ──────────────────────────────────────────────────────────────────
// Accepts optional overrides for testability (contract §13.2 — fail-closed).
// overrides.states_override:        substitute array for STATES check
// overrides.iteration_cap_override: substitute value for ITERATION_CAP check

function validate(overrides) {
  const opts         = overrides || {};
  const statesToCheck = "states_override" in opts ? opts.states_override : STATES;
  const capToCheck    = "iteration_cap_override" in opts ? opts.iteration_cap_override : ITERATION_CAP;
  const errors       = [];

  // Check 1 — exactly 17 state IDs
  if (!Array.isArray(statesToCheck) || statesToCheck.length !== 17) {
    errors.push(
      "state ID count: expected 17, got " +
      (Array.isArray(statesToCheck) ? statesToCheck.length : "non-array")
    );
    return { ok: false, errors };
  }

  // Check 2 — set equality against contract list
  const contractSet = new Set(CONTRACT_STATES);
  const moduleSet   = new Set(statesToCheck);

  for (const id of CONTRACT_STATES) {
    if (!moduleSet.has(id)) errors.push("missing state ID: " + id);
  }
  for (const id of statesToCheck) {
    if (!contractSet.has(id)) errors.push("unknown state ID (not in contract §2.1): " + id);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Check 3 — ITERATION_CAP === 5 (strict equality, contract §13.2.2)
  if (capToCheck !== 5) {
    errors.push("ITERATION_CAP: expected strict 5, got " + capToCheck);
    return { ok: false, errors };
  }

  // Check 4 — required role_ids exist in role registry (vacuous pass if no roles called yet)
  let registeredRoles;
  try {
    registeredRoles = new Set(listRoles().map(r => r.id));
  } catch (err) {
    errors.push("role registry unavailable: " + err.message);
    return { ok: false, errors };
  }
  for (const roleId of REQUIRED_ROLE_IDS) {
    if (!registeredRoles.has(roleId)) {
      errors.push("missing required role: " + roleId);
    }
  }

  return { ok: errors.length === 0, errors };
}

function isHealthy() {
  try {
    return validate().ok;
  } catch (_e) {
    return false;
  }
}

module.exports = { validate, isHealthy };

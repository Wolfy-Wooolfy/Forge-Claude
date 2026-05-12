"use strict";

// KB Budget Guard — checks and enforces per-project spend caps.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §9 (budget thresholds)
// @see docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md §budget (vision override)

const { sumCost } = require("./cost_ledger");
const {
  BUDGET_DEFAULT_USD,
  BUDGET_WARN_THRESHOLD
} = require("./_constants");

// ── Vision budget read ────────────────────────────────────────────────────────

function _readVisionBudget(project_id, root) {
  try {
    const { createVisionEngine } = require("../../ai_os/visionEngine");
    const ve = createVisionEngine({ root: root || process.cwd() });
    const fm = ve.readVisionSync(project_id);
    if (!fm) return null;
    const kb_max = fm.budget && typeof fm.budget.kb_lifecycle_usd_max === "number"
      ? fm.budget.kb_lifecycle_usd_max
      : null;
    return (kb_max != null && kb_max > 0) ? kb_max : null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check current spend against the budget.
 * Vision-override: reads budget.kb_lifecycle_usd_max from project vision if available.
 * @param {string} project_id
 * @param {{ root?: string, budget_usd?: number }} options
 * @returns {{ status: "NORMAL"|"WARN_70PCT"|"EXCEEDED", total_usd: number, budget_usd: number, ratio: number }}
 */
function checkBudget(project_id, options) {
  const opts       = options || {};
  const budget_usd = opts.budget_usd != null
    ? opts.budget_usd
    : (_readVisionBudget(project_id, opts.root) || BUDGET_DEFAULT_USD);
  const { total_usd } = sumCost(project_id, opts);
  const ratio = total_usd / budget_usd;

  let status;
  if (ratio >= 1.0) {
    status = "EXCEEDED";
  } else if (ratio >= BUDGET_WARN_THRESHOLD) {
    status = "WARN_70PCT";
  } else {
    status = "NORMAL";
  }

  return { status, total_usd, budget_usd, ratio };
}

/**
 * Throw if budget is exceeded.
 * @param {string} project_id
 * @param {{ root?: string, budget_usd?: number }} options
 * @throws {Error} BUDGET_EXCEEDED when ratio >= 1.0
 */
function enforceBudget(project_id, options) {
  const result = checkBudget(project_id, options);
  if (result.status === "EXCEEDED") {
    const err = new Error(
      "BUDGET_EXCEEDED: project " + project_id +
      " spent $" + result.total_usd.toFixed(4) +
      " of $" + result.budget_usd.toFixed(2) + " budget"
    );
    err.code   = "BUDGET_EXCEEDED";
    err.detail = result;
    throw err;
  }
}

/**
 * Log a warning to stderr if spend is at or above 70% threshold.
 * Non-fatal — callers that want hard enforcement should use enforceBudget().
 * @param {string} project_id
 * @param {{ root?: string, budget_usd?: number }} options
 */
function logWarnIfNeeded(project_id, options) {
  const result = checkBudget(project_id, options);
  if (result.status === "WARN_70PCT" || result.status === "EXCEEDED") {
    process.stderr.write(
      "[budget_guard] WARNING " + result.status + ": project=" + project_id +
      " spent=$" + result.total_usd.toFixed(4) +
      " budget=$" + result.budget_usd.toFixed(2) +
      " (" + Math.round(result.ratio * 100) + "%)\n"
    );
  }
}

module.exports = { checkBudget, enforceBudget, logWarnIfNeeded };

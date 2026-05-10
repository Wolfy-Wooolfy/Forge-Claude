"use strict";

const ledger = require("./cost_ledger");

// Default caps when project vision has no budget fields.
const DEFAULT_MAX_PER_ITERATION_USD = 5.00;
const DEFAULT_MAX_TOTAL_USD         = 50.00;

// ── Vision read (sync, same pattern as container_privilege_rule) ──────────────

function _readVisionCaps(projectId, root) {
  try {
    const { createVisionEngine } = require("../../ai_os/visionEngine");
    const ve = createVisionEngine({ root: root || process.cwd() });
    const fm = ve.readVisionSync(projectId);
    if (!fm) return null;
    return {
      max_total_usd:         typeof fm.max_total_usd         === "number" ? fm.max_total_usd         : DEFAULT_MAX_TOTAL_USD,
      max_per_iteration_usd: typeof fm.max_per_iteration_usd === "number" ? fm.max_per_iteration_usd : DEFAULT_MAX_PER_ITERATION_USD
    };
  } catch {
    return null;
  }
}

// ── checkBudget ───────────────────────────────────────────────────────────────
//
// Returns one of:
//   { allow: true,  warn: null }
//   { allow: true,  warn: "BUDGET_80_PCT" }
//   { allow: false, reason: "BUDGET_95_PCT_REQUIRES_APPROVAL" }
//   { allow: false, reason: "BUDGET_EXCEEDED" }

function checkBudget(project_id, estimated_cost_usd, options) {
  const root = (options && options.root) || process.cwd();

  // Read vision caps — if project not found, use defaults (not a hard block).
  const caps = _readVisionCaps(project_id, root) || {
    max_total_usd:         DEFAULT_MAX_TOTAL_USD,
    max_per_iteration_usd: DEFAULT_MAX_PER_ITERATION_USD
  };

  const totalSpent   = ledger.getTotalCost(project_id, { root });
  const projected    = totalSpent + (estimated_cost_usd || 0);
  const cap          = caps.max_total_usd;

  if (cap <= 0) return { allow: true, warn: null };

  const pct = projected / cap;

  if (pct >= 1.0) return { allow: false, reason: "BUDGET_EXCEEDED" };
  if (pct >= 0.95) return { allow: false, reason: "BUDGET_95_PCT_REQUIRES_APPROVAL" };
  if (pct >= 0.80) return { allow: true,  warn:   "BUDGET_80_PCT" };

  return { allow: true, warn: null };
}

module.exports = { checkBudget };

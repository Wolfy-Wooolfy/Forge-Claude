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

// ── Legacy sentinel spend (PHASE-55 W-1 — R-11(ii) + R-21) ────────────────────
//
// Legacy Stage-A provider calls are metered by the openAiAdapter seam under the
// sentinel project_id below (they carry no project attribution at the seam), so
// the cap must fold them in or they stay invisible to the number it reads.
//
// R-21 lifetime bound (CTO-F-D: an unbounded global total is a delayed denial of
// service — once cumulative legacy spend crosses a cap, every NEW project would
// be born BUDGET_EXCEEDED). Predicate as implemented:
//   legacy_total(P) = Σ cost_usd_actual over rows r where
//     r.project_id === "_legacy_stage_a" AND r.ts >= min{ r'.ts : r'.project_id === P }
//   and legacy_total(P) = 0 when P has no ledger rows at all — a brand-new
//   project can never be blocked by historical legacy spend.
// Declared limitation: legacy spend before P's first agent-ledger row (e.g. P's
// own pre-pipeline ideation turns) is not counted; bounded-correct afterwards.

const LEGACY_SENTINEL_PROJECT_ID = "_legacy_stage_a";

function _legacySpendSince(project_id, root) {
  if (!project_id || project_id === LEGACY_SENTINEL_PROJECT_ID) return 0;
  const own = ledger.readEntries({ project_id }, { root });
  if (own.length === 0) return 0;
  let firstTs = own[0].ts;
  for (const r of own) {
    if (typeof r.ts === "string" && r.ts < firstTs) firstTs = r.ts;
  }
  const rows = ledger.readEntries(
    { project_id: LEGACY_SENTINEL_PROJECT_ID, since: firstTs }, { root });
  let total = 0;
  for (const r of rows) {
    total += (typeof r.cost_usd_actual === "number" ? r.cost_usd_actual : 0);
  }
  return Math.round(total * 100000) / 100000;
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

  const totalSpent   = ledger.getTotalCost(project_id, { root }) +
                       _legacySpendSince(project_id, root);
  const projected    = totalSpent + (estimated_cost_usd || 0);
  const cap          = caps.max_total_usd;

  if (cap <= 0) return { allow: true, warn: null };

  const pct = projected / cap;

  if (pct >= 1.0) return { allow: false, reason: "BUDGET_EXCEEDED" };
  if (pct >= 0.95) return { allow: false, reason: "BUDGET_95_PCT_REQUIRES_APPROVAL" };
  if (pct >= 0.80) return { allow: true,  warn:   "BUDGET_80_PCT" };

  return { allow: true, warn: null };
}

// ── budgetStatus (PHASE-56 W-3 — R-5) ─────────────────────────────────────────
//
// Reports the SAME numbers checkBudget reads, so the owner can be told what is
// left before a new MVP slice is derived. Deliberately additive: checkBudget above
// is not touched by a single character, so the L3 rule at
// permission/rules/agent_budget_rule.js:87 is provably unaffected by this phase.
//
// The spend figure is the cap's own figure: this project's ledger total PLUS the
// legacy Stage-A sentinel spend that occurred within this project's lifetime
// (PHASE-55 W-1, R-11(ii)/R-21). Nothing is re-derived here.
//
// KNOWN LIMITATION, carried forward verbatim from PHASE-55 R-25 and restated for
// the owner in docs: the cap counts spend from a project's FIRST ledger activity
// onward, so ideation turns that precede any build activity are VISIBLE in the
// ledger but NOT counted against the cap. `remaining_usd` inherits that bound.
//
// (project_id, options) → { cap_usd, spent_usd, remaining_usd, pct }
// Never throws. A project with no vision reads the same defaults checkBudget uses.
function budgetStatus(project_id, options) {
  const root = (options && options.root) || process.cwd();

  const caps = _readVisionCaps(project_id, root) || {
    max_total_usd:         DEFAULT_MAX_TOTAL_USD,
    max_per_iteration_usd: DEFAULT_MAX_PER_ITERATION_USD
  };

  const spent = ledger.getTotalCost(project_id, { root }) +
                _legacySpendSince(project_id, root);
  const cap   = caps.max_total_usd;

  return {
    cap_usd:       cap,
    spent_usd:     Math.round(spent * 100000) / 100000,
    remaining_usd: cap > 0 ? Math.round((cap - spent) * 100000) / 100000 : Infinity,
    pct:           cap > 0 ? spent / cap : 0
  };
}

module.exports = { checkBudget, budgetStatus };

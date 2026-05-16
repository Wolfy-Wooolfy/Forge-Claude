"use strict";

const path = require("path");

// L3 rule: fires at Step 1.8 in permissionPolicy.authorize().
// Handles two concerns for agent.* tools:
//   A — Vision lock (non-mock providers require locked vision, per §2-D10)
//   B — Budget enforcement (per §2-D5)

function createAgentBudgetRule(options) {
  const _root = path.resolve((options && options.root) || process.cwd());

  // ── Vision engine (lazy, same pattern as container_privilege_rule) ────────

  let _ve = null;
  function _visionEngine() {
    if (!_ve) {
      const { createVisionEngine } = require("../../../ai_os/visionEngine");
      _ve = createVisionEngine({ root: _root });
    }
    return _ve;
  }

  // ── Budget enforcer (lazy) ─────────────────────────────────────────────────

  let _enforcer = null;
  function _budgetEnforcer() {
    if (!_enforcer) {
      _enforcer = require("../../agents/budget_enforcer");
    }
    return _enforcer;
  }

  // ── Cost estimator (lazy) ──────────────────────────────────────────────────

  let _contract = null;
  function _adapterContract() {
    if (!_contract) {
      _contract = require("../../agents/_adapter_contract");
    }
    return _contract;
  }

  // ── check ──────────────────────────────────────────────────────────────────

  function check(tool, input, ctx) {
    if (!tool || !tool.name || !tool.name.startsWith("agent.")) return { denied: false };

    // Only agent.invoke has side effects and needs full gate.
    // Other agent.* tools (list_available, estimate_cost, read_ledger) are READ_ONLY.
    if (tool.name !== "agent.invoke") return { denied: false };

    const projectId = input && input.project_id ? String(input.project_id) : null;
    const provider  = input && input.provider   ? String(input.provider)   : null;
    const isMock    = provider === "mock";

    // ── A: Vision lock (non-mock only, §2-D10) ────────────────────────────
    // Exemption: reverse_vision role runs before vision exists (intake flow).
    // Vision-lock check is skipped for this role; budget check (Section B) still applies.
    // See INTAKE_CONTRACT §5 (reverse_vision exemption).

    const roleId = ctx && ctx.role_id ? String(ctx.role_id) : null;

    if (!isMock && projectId && roleId !== "reverse_vision") {
      try {
        const frontmatter = _visionEngine().readVisionSync(projectId);
        if (!frontmatter) {
          return { denied: true, reason: "VISION_NOT_FOUND", detail: null };
        }
        if (!frontmatter.vision_locked) {
          return { denied: true, reason: "VISION_NOT_LOCKED", detail: null };
        }
      } catch {
        return { denied: true, reason: "VISION_NOT_FOUND", detail: null };
      }
    }

    // ── B: Budget enforcement (mock bypasses, §2-D7) ─────────────────────

    if (isMock) return { denied: false };

    if (projectId) {
      try {
        const prompt = (input && input.prompt) ? String(input.prompt) : "";
        const { estimated_usd } = _adapterContract().estimateCost(provider || "mock", prompt.length, 2);

        const budget = _budgetEnforcer().checkBudget(projectId, estimated_usd, { root: _root });

        if (!budget.allow) {
          return { denied: true, reason: budget.reason, detail: null };
        }
        // warn is logged but not blocking — permissionPolicy emits to audit
      } catch { /* budget check failures are non-blocking — log but allow */ }
    }

    return { denied: false };
  }

  return { check };
}

module.exports = { createAgentBudgetRule };

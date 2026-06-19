"use strict";

const path = require("path");

const {
  fromEnv, resolveActiveContext, isDataMode, dataModeSatisfies
} = require("./permissionMode");
const { checkHardDeny, checkScope }   = require("./permissionRules");
const { getDefaultPrompter }          = require("./permissionPrompter");
const { appendAuditEntry }            = require("../audit/toolAuditLog");
const { createVisionLockRule }           = require("./rules/vision_lock_rule");
const { createShellVisionLockRule }      = require("./rules/shell_vision_lock_rule");
const { createContainerPrivilegeRule }   = require("./rules/container_privilege_rule");
const { createAgentBudgetRule }          = require("./rules/agent_budget_rule");
const { createResearchHostRule }         = require("./rules/research_host_rule");
const { createBuiltprojectVisionRule }   = require("./rules/builtproject_vision_rule");

const PERMISSION_AUDIT_REL = path.join("artifacts", "audit", "permission_audit.jsonl");

// ── Audit helpers ─────────────────────────────────────────────────────────────

function _permAuditPath(root) {
  return require("path").resolve(root || process.cwd(), PERMISSION_AUDIT_REL);
}

function _auditDecision(root, entry) {
  try {
    const fs  = require("fs");
    const file = _permAuditPath(root);
    const dir  = require("path").dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file,
      JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + "\n",
      "utf8"
    );
  } catch { /* audit failures are silent */ }

  // Also append to the cross-cutting tool_audit.jsonl
  try {
    appendAuditEntry(root, Object.assign({ kind: "permission" }, entry));
  } catch { /* silent */ }
}

// ── Policy factory ────────────────────────────────────────────────────────────

function createPolicy(options) {
  const opts    = options || {};
  const root    = opts.root || process.cwd();

  let active_mode       = opts.active_mode       || fromEnv();

  // PHASE-40 (C2 deferral (a) close) — ambient active-project register: the policy-scoped
  // "active project", parallel to active_mode. Set/cleared by an operation entry-point via
  // setActiveProject(); checkScope consults it when the per-call ctx carries no explicit
  // active_project_id, closing the ctx-less cross-project write hole. null → no ambient
  // constraint (the carve-out that preserves {root}-only bootstrap/creation, tests, and any
  // write outside a declared operation).
  let active_project    = opts.active_project    || null;

  // PHASE-36 C3 (STEP A) — PROMPT-mode boot fail-fast.
  // If the resolved control mode is PROMPT and NO respond surface is wired, every gated
  // operation would call prompter.request(), block for the full DEFAULT_TIMEOUT_MS (~5 min),
  // then settle DENY/"TIMEOUT" — a silent stall, not an honest failure. There are no
  // interactive permission endpoints (/api/permission/*) implemented, so refuse to start
  // instead of stalling. The data modes (WORKSPACE_WRITE / READ_ONLY / DANGER_FULL_ACCESS →
  // control_mode null) and TEST control mode are UNAFFECTED — only a real PROMPT boot fails.
  // opts.prompt_respond_surface is the future-proof opt-in: a caller that DOES wire a
  // responder (e.g. the self-test harness' auto-deny prompter) passes true. The runtime
  // PROMPT branches in authorize() are left untouched.
  {
    const { control_mode: _bootControlMode } = resolveActiveContext(active_mode, {});
    if (_bootControlMode === "PROMPT" && opts.prompt_respond_surface !== true) {
      throw new Error(
        "Forge permission policy refusing to start in PROMPT control mode: no respond surface " +
        "is wired (interactive permission endpoints are not implemented), so every gated " +
        "operation would stall for DEFAULT_TIMEOUT_MS and then DENY. Set " +
        "FORGE_PERMISSION_MODE=WORKSPACE_WRITE (or TEST for CI), or wire a respond surface and " +
        "pass { prompt_respond_surface: true }."
      );
    }
  }

  let inherited_data_mode = opts.inherited_data_mode || null;
  const prompter        = opts.prompter          || getDefaultPrompter();
  const on_decision     = opts.on_decision       || null; // optional callback

  const _visionRules          = [createVisionLockRule({ root })];
  const _shellVisionRules     = [createShellVisionLockRule({ root })];
  const _containerPrivRules   = [createContainerPrivilegeRule({ root })];
  const _agentBudgetRules     = [createAgentBudgetRule({ root })];
  const _researchHostRules         = [createResearchHostRule({ getActiveMode: () => active_mode })];
  const _builtprojectVisionRules   = [createBuiltprojectVisionRule({ root, getActiveMode: () => active_mode })];

  // ── authorize ──────────────────────────────────────────────────────────────

  async function authorize(tool, input, ctx) {
    const base = {
      tool:          tool.name,
      required_mode: tool.required_mode,
      active_mode
    };

    function emit(result, stage) {
      const entry = Object.assign({}, base, { stage, allow: result.allow, reason: result.reason });
      _auditDecision(root, entry);
      if (typeof on_decision === "function") {
        try { on_decision(entry); } catch { /* silent */ }
      }
      return result;
    }

    // Step 1 — Hard deny
    const hd = checkHardDeny(tool, input, ctx, root);
    if (hd.denied) {
      return emit(
        { allow: false, reason: hd.reason, detail: hd.detail, rule_id: hd.rule_id },
        "hard_deny"
      );
    }

    // Step 1.5 — Vision lock rules (docs write gate)
    for (const rule of _visionRules) {
      const vl = rule.check(tool, input, ctx || {});
      if (vl.denied) {
        return emit({ allow: false, reason: vl.reason }, "vision_lock");
      }
    }

    // Step 1.6 — Shell vision lock rules (shell command project gate)
    for (const rule of _shellVisionRules) {
      const sv = rule.check(tool, input, ctx || {});
      if (sv.denied) {
        return emit({ allow: false, reason: sv.reason }, "shell_vision_lock");
      }
    }

    // Step 1.7 — Container privilege rules (DENY-severity violations + build-specific gates)
    for (const rule of _containerPrivRules) {
      const cp = rule.check(tool, input, ctx || {});
      if (cp.denied) {
        return emit({ allow: false, reason: cp.reason, detail: cp.detail || null }, "container_privilege");
      }
    }

    // Step 1.8 — Agent budget rules (vision lock + budget caps for agent.invoke)
    for (const rule of _agentBudgetRules) {
      const ab = rule.check(tool, input, ctx || {});
      if (ab.denied) {
        return emit({ allow: false, reason: ab.reason, detail: ab.detail || null }, "agent_budget");
      }
    }

    // Step 1.9 — Research host rules (explicit named deny for research.search_web in READ_ONLY)
    for (const rule of _researchHostRules) {
      const rh = rule.check(tool, input, ctx || {});
      if (rh.denied) {
        return emit({ allow: false, reason: rh.reason, detail: rh.detail || null }, "research_host");
      }
    }

    // Step 1.10 — Builtproject vision rules (scope + vision_lock gate for builtproject.run_scenarios)
    for (const rule of _builtprojectVisionRules) {
      const bv = rule.check(tool, input, ctx || {});
      if (bv.denied) {
        return emit({ allow: false, reason: bv.reason, detail: bv.detail || null }, "builtproject_vision");
      }
    }

    // Step 2 — Resolve active context
    const { data_mode, control_mode } = resolveActiveContext(active_mode, { inherited_data_mode });

    // Step 3 — Read-only tool: always allow
    if (tool.required_mode === "READ_ONLY" || tool.is_read_only) {
      return emit({ allow: true, reason: "READ_ONLY" }, "read_only");
    }

    // Step 4 — Mode comparison + scope check
    // TEST control mode also satisfies PROMPT-mode tools (auto-approves; no interactive session in CI)
    const dataAllows = isDataMode(tool.required_mode)
      ? dataModeSatisfies(data_mode, tool.required_mode)
      : (control_mode === tool.required_mode || control_mode === "TEST");

    const scopeCheck = checkScope(tool, input, ctx, data_mode, root, active_project);
    const scopeOk    = !scopeCheck.applicable || scopeCheck.allowed !== false;

    if (dataAllows && scopeOk) {
      if (control_mode === "TEST") {
        return emit({ allow: true, reason: "TEST_MODE_ALLOWED" }, "test_mode");
      }
      if (control_mode === "PROMPT") {
        const r = await prompter.request({ tool, input, ctx: ctx || {} });
        const allowed = r.decision === "ALLOW";
        return emit({
          allow:  allowed,
          reason: allowed ? "PROMPT_ALLOWED" : (r.reason || "PROMPT_DENIED"),
          detail: r.detail
        }, "prompt");
      }
      return emit({ allow: true, reason: "MODE_SATISFIED" }, "mode_satisfied");
    }

    // Step 5 — Denial path

    // Scope blocked takes precedence
    if (!scopeOk) {
      return emit(
        { allow: false, reason: scopeCheck.reason, detail: scopeCheck.detail },
        "scope"
      );
    }

    // Mode insufficient
    if (control_mode === "TEST") {
      return emit({
        allow:  false,
        reason: "TEST_MODE_DENIED",
        detail: "tool requires '" + tool.required_mode + "' but data mode is '" + data_mode + "'"
      }, "test_mode");
    }

    if (control_mode === "PROMPT") {
      const r = await prompter.request({ tool, input, ctx: ctx || {} });
      const allowed = r.decision === "ALLOW";
      return emit({
        allow:  allowed,
        reason: allowed ? "PROMPT_ALLOWED_ESCALATION" : (r.reason || "PROMPT_DENIED"),
        detail: r.detail
      }, "prompt_escalation");
    }

    return emit({
      allow:  false,
      reason: "INSUFFICIENT_MODE",
      detail: "tool '" + tool.name + "' requires '" + tool.required_mode +
              "'; active data mode is '" + data_mode + "'"
    }, "mode");
  }

  // ── setActiveMode / getActiveMode ──────────────────────────────────────────

  function setActiveMode(mode) {
    active_mode = mode;
  }

  function getActiveMode() {
    return active_mode;
  }

  // PHASE-40 — ambient active-project register (see `active_project` decl above). An
  // operation entry-point declares its project: setActiveProject(id); try {…} finally
  // { setActiveProject(null) }. checkScope consults it as the active-project reference
  // when the per-call ctx carries no explicit active_project_id.
  function setActiveProject(id) {
    active_project = id || null;
  }

  function getActiveProject() {
    return active_project;
  }

  return { authorize, setActiveMode, getActiveMode, setActiveProject, getActiveProject };
}

// ── installDefaultPolicy ──────────────────────────────────────────────────────

function installDefaultPolicy(toolRegistry) {
  const policy = getDefaultPolicy();
  if (toolRegistry && typeof toolRegistry.setAuthorizeFunction === "function") {
    toolRegistry.setAuthorizeFunction(
      (tool, input, ctx) => policy.authorize(tool, input, ctx)
    );
  }
  return policy;
}

// ── Default singleton ─────────────────────────────────────────────────────────

let _default = null;

function getDefaultPolicy() {
  if (!_default) _default = createPolicy();
  return _default;
}

function resetDefaultPolicy() {
  _default = null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createPolicy,
  getDefaultPolicy,
  resetDefaultPolicy,
  installDefaultPolicy
};

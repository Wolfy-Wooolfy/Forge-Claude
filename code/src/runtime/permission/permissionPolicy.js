"use strict";

const path = require("path");

const {
  fromEnv, resolveActiveContext, isDataMode, dataModeSatisfies
} = require("./permissionMode");
const { checkHardDeny, checkScope }   = require("./permissionRules");
const { getDefaultPrompter }          = require("./permissionPrompter");
const { appendAuditEntry }            = require("../audit/toolAuditLog");
const { createVisionLockRule }        = require("./rules/vision_lock_rule");

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
  let inherited_data_mode = opts.inherited_data_mode || null;
  const prompter        = opts.prompter          || getDefaultPrompter();
  const on_decision     = opts.on_decision       || null; // optional callback

  const _visionRules    = [createVisionLockRule({ root })];

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
    const hd = checkHardDeny(tool, input, ctx);
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

    const scopeCheck = checkScope(tool, input, ctx, data_mode);
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

  return { authorize, setActiveMode, getActiveMode };
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

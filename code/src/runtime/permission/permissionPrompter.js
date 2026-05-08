"use strict";

const crypto = require("crypto");
const path   = require("path");

const { appendAuditEntry } = require("../audit/toolAuditLog");

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── Input summariser (mirrors _contract.js summariser) ───────────────────────

function _summariseValue(v) {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v))             return "[array len=" + v.length + "]";
  if (typeof v === "object")        return "[object]";
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

function _summariseTool(tool, input) {
  const summary = { tool: tool.name };
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input)) {
      summary[k] = _summariseValue(v);
    }
  }
  return summary;
}

// ── Prompter factory ──────────────────────────────────────────────────────────

function createPrompter(options) {
  const opts       = options || {};
  const timeout_ms = opts.timeout_ms || DEFAULT_TIMEOUT_MS;
  const root       = opts.root       || process.cwd();

  const _pending = new Map(); // permission_request_id → entry

  // ── request ────────────────────────────────────────────────────────────────

  async function request({ tool, input, ctx }) {
    const id         = "preq_" + crypto.randomBytes(8).toString("hex");
    const started_at = new Date().toISOString();
    const summary    = _summariseTool(tool, input);
    const project_id = ctx && ctx.project_id || null;

    return new Promise((resolve) => {
      let settled = false;

      function settle(decision, reason, detail) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        _pending.delete(id);
        resolve({ decision, reason, detail: detail || null });
      }

      const timer = setTimeout(() => {
        _tryAudit(root, {
          kind: "permission_prompt", action: "timeout",
          permission_request_id: id, tool: tool.name, project_id
        });
        settle("DENY", "TIMEOUT", "Permission request timed out after " + timeout_ms + "ms");
      }, timeout_ms);

      // Keep timer unref'd so it doesn't block process exit in tests
      if (timer.unref) timer.unref();

      _pending.set(id, {
        permission_request_id: id,
        started_at,
        tool:       tool.name,
        summary,
        ctx_project_id: project_id,
        _settle:    settle,
        _timer:     timer
      });

      _tryAudit(root, {
        kind: "permission_prompt", action: "requested",
        permission_request_id: id, tool: tool.name,
        summary, project_id, started_at
      });
    });
  }

  // ── listPending ────────────────────────────────────────────────────────────

  function listPending() {
    return Array.from(_pending.values()).map(e => ({
      permission_request_id: e.permission_request_id,
      started_at:            e.started_at,
      tool:                  e.tool,
      summary:               e.summary,
      ctx_project_id:        e.ctx_project_id
    }));
  }

  // ── getPending ─────────────────────────────────────────────────────────────

  function getPending(id) {
    const e = _pending.get(id);
    if (!e) return null;
    return {
      permission_request_id: e.permission_request_id,
      started_at:            e.started_at,
      tool:                  e.tool,
      summary:               e.summary,
      ctx_project_id:        e.ctx_project_id
    };
  }

  // ── respond ────────────────────────────────────────────────────────────────

  function respond(id, decision, options) {
    const opts2 = options || {};
    const entry = _pending.get(id);
    if (!entry) return { ok: false, reason: "NOT_FOUND" };
    if (decision !== "ALLOW" && decision !== "DENY") {
      return { ok: false, reason: "INVALID_DECISION" };
    }

    _tryAudit(root, {
      kind: "permission_prompt", action: "responded",
      permission_request_id: id, tool: entry.tool,
      decision, note: opts2.note || null,
      ctx_project_id: entry.ctx_project_id
    });

    const reason = decision === "ALLOW" ? "PROMPT_ALLOWED" : "PROMPT_DENIED";
    entry._settle(decision, reason, opts2.note || null);
    return { ok: true };
  }

  // ── cancelAll ─────────────────────────────────────────────────────────────

  function cancelAll(reason) {
    for (const [id, entry] of _pending.entries()) {
      _tryAudit(root, {
        kind: "permission_prompt", action: "cancelled",
        permission_request_id: id, tool: entry.tool,
        cancel_reason: reason || "cancelAll called"
      });
      entry._settle("DENY", "CANCELLED", reason || "Server shutdown");
    }
  }

  return { request, listPending, getPending, respond, cancelAll };
}

// ── Audit helper ──────────────────────────────────────────────────────────────

function _tryAudit(root, entry) {
  try {
    appendAuditEntry(root, entry);
  } catch { /* never throws */ }
}

// ── Default singleton ─────────────────────────────────────────────────────────

let _default = null;

function getDefaultPrompter() {
  if (!_default) _default = createPrompter();
  return _default;
}

function resetDefaultPrompter() {
  if (_default) _default.cancelAll("prompter reset");
  _default = null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createPrompter,
  getDefaultPrompter,
  resetDefaultPrompter,
  DEFAULT_TIMEOUT_MS
};

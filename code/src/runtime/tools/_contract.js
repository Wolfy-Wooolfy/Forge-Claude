"use strict";

const { validateAgainstSchema } = require("../../providers/_contract/providerContract");

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const VALID_MODES  = ["READ_ONLY", "WORKSPACE_WRITE", "DANGER_FULL_ACCESS", "PROMPT", "TEST"];

class ToolContractError extends Error {
  constructor(message, reason, context) {
    super(message);
    this.name    = "ToolContractError";
    this.reason  = reason  || "INVALID_TOOL_SPEC";
    this.context = context || null;
  }
}

// ── Envelope helpers ──────────────────────────────────────────────────────

function ok(output, metadata) {
  return { status: "SUCCESS", output: output !== undefined ? output : null,
           metadata: metadata || {} };
}

function denied(reason, detail, context) {
  return { status: "DENIED", output: null,
           metadata: { reason: reason || "DENIED", detail: detail || null, context: context || null } };
}

function failed(reason, detail, context) {
  return { status: "FAILED", output: null,
           metadata: { reason: reason || "FAILED", detail: detail || null, context: context || null } };
}

function previewed(diff, metadata) {
  return { status: "PREVIEWED", output: { diff: diff !== undefined ? diff : null },
           metadata: metadata || {} };
}

// ── Input summariser (audit — never writes full content) ──────────────────

function _summariseValue(v) {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v))             return "[array len=" + v.length + "]";
  if (typeof v === "object")        return "[object]";
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

function _summariseInput(input) {
  if (!input || typeof input !== "object") return _summariseValue(input);
  const out = {};
  for (const [k, v] of Object.entries(input)) out[k] = _summariseValue(v);
  return out;
}

// ── Spec validation ───────────────────────────────────────────────────────

function validateToolSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== "object") throw new ToolContractError("spec must be an object");

  if (typeof spec.name !== "string" || !TOOL_NAME_RE.test(spec.name)) {
    errs.push("name must match /^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$/, got: " + JSON.stringify(spec.name));
  }
  if (typeof spec.description !== "string" || !spec.description.trim()) {
    errs.push("description must be a non-empty string");
  }
  if (!VALID_MODES.includes(spec.required_mode)) {
    errs.push("required_mode must be one of " + VALID_MODES.join("|") + ", got: " + JSON.stringify(spec.required_mode));
  }
  if (!spec.input_schema  || typeof spec.input_schema  !== "object") errs.push("input_schema must be an object");
  if (!spec.output_schema || typeof spec.output_schema !== "object") errs.push("output_schema must be an object");
  if (typeof spec.execute !== "function") errs.push("execute must be a function");

  const isWriteTool = spec.required_mode !== "READ_ONLY" && !spec.is_read_only;
  if (isWriteTool && typeof spec.preview !== "function") {
    errs.push("write tools (required_mode != READ_ONLY and !is_read_only) must have preview()");
  }

  if (errs.length > 0) {
    throw new ToolContractError(
      "Tool '" + (spec.name || "?") + "' spec invalid:\n  " + errs.join("\n  "),
      "INVALID_TOOL_SPEC",
      { name: spec.name, issues: errs }
    );
  }
  return true;
}

// ── defineTool ────────────────────────────────────────────────────────────

function defineTool(spec) {
  validateToolSpec(spec);

  function validateInput(input) {
    return validateAgainstSchema(input, spec.input_schema, "input");
  }

  function validateOutput(output) {
    return validateAgainstSchema(output, spec.output_schema, "output");
  }

  function audit(input, envelope) {
    return {
      tool:          spec.name,
      ts:            new Date().toISOString(),
      status:        envelope && envelope.status,
      reason:        envelope && envelope.metadata && envelope.metadata.reason || null,
      input_summary: _summariseInput(input)
    };
  }

  const noopPreview = spec.is_read_only || spec.required_mode === "READ_ONLY"
    ? () => previewed({ note: "read-only tool, no side effect" })
    : null;

  return Object.assign({}, spec, {
    validateInput,
    validateOutput,
    audit,
    preview: spec.preview || noopPreview || spec.preview
  });
}

module.exports = {
  defineTool,
  validateToolSpec,
  ToolContractError,
  TOOL_NAME_RE,
  VALID_MODES,
  ok,
  denied,
  failed,
  previewed
};

"use strict";

const fs   = require("fs");
const path = require("path");

const { validateToolSpec, ToolContractError, failed, denied } = require("./_contract");
const { appendAuditEntry }                                    = require("../audit/toolAuditLog");

const DEFAULT_TOOLS_DIR = __dirname;

// ── permit-all default (PHASE-3 wires real policy) ───────────────────────────

function permitAll(/* toolName, input, ctx */) {
  return { allowed: true };
}

// ── Registry factory ──────────────────────────────────────────────────────────

function createRegistry(options) {
  const opts      = options || {};
  const root      = opts.root      || process.cwd();
  const tools_dir = opts.tools_dir || DEFAULT_TOOLS_DIR;

  let _authorize = opts.authorize || permitAll;
  const _tools   = new Map();   // name → tool object

  // ── load ──────────────────────────────────────────────────────────────────

  function load() {
    let files;
    try {
      files = fs.readdirSync(tools_dir).filter(f =>
        f.endsWith("_tools.js") && !f.startsWith("_")
      );
    } catch (e) {
      throw new Error("TOOL_REGISTRY_FAILED: cannot read tools_dir '" + tools_dir + "': " + e.message);
    }

    for (const file of files) {
      const filePath = path.join(tools_dir, file);
      let exports_;
      try {
        exports_ = require(filePath);
      } catch (e) {
        throw new Error("TOOL_REGISTRY_FAILED: require('" + file + "') threw: " + e.message);
      }

      // Normalise to array
      let toolList;
      if (Array.isArray(exports_)) {
        toolList = exports_;
      } else if (exports_ && Array.isArray(exports_.tools)) {
        toolList = exports_.tools;
      } else if (exports_ && typeof exports_.execute === "function") {
        toolList = [exports_];
      } else {
        throw new Error("TOOL_REGISTRY_FAILED: '" + file + "' export must be Tool, Tool[], or {tools:[]}");
      }

      for (const tool of toolList) {
        try {
          validateToolSpec(tool);
        } catch (e) {
          throw new Error("TOOL_REGISTRY_FAILED: " + e.message);
        }
        if (_tools.has(tool.name)) {
          throw new Error("TOOL_REGISTRY_FAILED: duplicate tool name '" + tool.name + "' in '" + file + "'");
        }
        _tools.set(tool.name, tool);
      }
    }
  }

  // ── getters ───────────────────────────────────────────────────────────────

  function list() {
    return Array.from(_tools.values());
  }

  function get(name) {
    return _tools.get(name) || null;
  }

  function has(name) {
    return _tools.has(name);
  }

  function setAuthorizeFunction(fn) {
    if (typeof fn !== "function") throw new TypeError("authorize must be a function");
    _authorize = fn;
  }

  // ── invoke ────────────────────────────────────────────────────────────────

  async function invoke(name, input, ctx) {
    const context = ctx || {};

    // Step 1 — lookup
    const tool = _tools.get(name);
    if (!tool) {
      const env = failed("TOOL_NOT_FOUND", "No tool registered with name '" + name + "'");
      _tryAudit(root, name, input, env);
      return env;
    }

    // Step 2 — validate input (validateAgainstSchema returns issues[])
    const inputErrors = tool.validateInput(input);
    if (inputErrors && inputErrors.length > 0) {
      const env = failed("INVALID_INPUT", inputErrors.join("; "));
      _tryAudit(root, name, input, env);
      return env;
    }

    // Step 3 — authorize
    let authResult;
    try {
      authResult = _authorize(name, input, context);
    } catch (e) {
      const env = failed("AUTHORIZATION_ERROR", e.message);
      _tryAudit(root, name, input, env);
      return env;
    }
    if (authResult && authResult.allowed === false) {
      const env = denied(
        authResult.reason  || "AUTHORIZATION_DENIED",
        authResult.detail  || null,
        authResult.context || null
      );
      _tryAudit(root, name, input, env);
      return env;
    }

    // Step 4 — preview or execute
    const previewOnly = !!(context.preview_only);
    let envelope;

    if (previewOnly) {
      try {
        envelope = await tool.preview(input, context);
      } catch (e) {
        envelope = failed("PREVIEW_ERROR", e.message);
        _tryAudit(root, name, input, envelope);
        return envelope;
      }
      _tryAudit(root, name, input, envelope);
      return envelope;
    }

    let rawOutput;
    try {
      rawOutput = await tool.execute(input, Object.assign({ root }, context));
    } catch (e) {
      envelope = failed("EXECUTE_ERROR", e.message);
      _tryAudit(root, name, input, envelope);
      return envelope;
    }

    // Normalise: if execute returned a plain value (not an envelope), wrap it
    if (rawOutput && typeof rawOutput === "object" &&
        (rawOutput.status === "SUCCESS" || rawOutput.status === "DENIED" ||
         rawOutput.status === "FAILED"  || rawOutput.status === "PREVIEWED")) {
      envelope = rawOutput;
    } else {
      envelope = { status: "SUCCESS", output: rawOutput !== undefined ? rawOutput : null, metadata: {} };
    }

    // Step 5 — validate output (SUCCESS only; validateAgainstSchema returns issues[])
    if (envelope.status === "SUCCESS") {
      const outErrors = tool.validateOutput(envelope.output);
      if (outErrors && outErrors.length > 0) {
        envelope = failed("INVALID_OUTPUT", outErrors.join("; "));
        _tryAudit(root, name, input, envelope);
        return envelope;
      }
    }

    // Step 6 — audit
    _tryAudit(root, name, input, envelope);
    return envelope;
  }

  // ── healthSummary ─────────────────────────────────────────────────────────

  function healthSummary() {
    const tools  = list();
    const byMode = {};
    for (const t of tools) {
      byMode[t.required_mode] = (byMode[t.required_mode] || 0) + 1;
    }
    return {
      total:   tools.length,
      by_mode: byMode,
      names:   tools.map(t => t.name)
    };
  }

  return { load, list, get, has, invoke, setAuthorizeFunction, healthSummary };
}

// ── audit helper (never throws) ───────────────────────────────────────────────

function _tryAudit(root, name, input, envelope) {
  try {
    appendAuditEntry(root, {
      tool:          name,
      status:        envelope && envelope.status,
      reason:        envelope && envelope.metadata && envelope.metadata.reason || null,
      input_summary: _summariseInput(input)
    });
  } catch { /* audit failures are silent — tool result is still returned */ }
}

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

// ── Default singleton ─────────────────────────────────────────────────────────

let _defaultRegistry = null;

function getDefaultRegistry() {
  if (!_defaultRegistry) {
    _defaultRegistry = createRegistry();
    _defaultRegistry.load();
  }
  return _defaultRegistry;
}

function resetDefaultRegistry() {
  _defaultRegistry = null;
}

module.exports = {
  createRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  DEFAULT_TOOLS_DIR,
  permitAll
};

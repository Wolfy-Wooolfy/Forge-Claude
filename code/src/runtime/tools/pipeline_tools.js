"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");

// Pipeline status is stored in progress/status.json (the canonical status file).
// These tools read/write that file via the root path.

function _statusPath(root) {
  return path.resolve(root, "progress", "status.json");
}

function _readStatus(root) {
  const file = _statusPath(root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function _writeStatus(root, data) {
  const file = _statusPath(root);
  const dir  = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ── 1. pipeline.run_module ────────────────────────────────────────────────────

const run_module = defineTool({
  name: "pipeline.run_module",
  description: "Invoke a named pipeline module by requiring it and calling executeModule({ root, context }).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      module_name: { type: "string" },
      context:     { type: "object" }
    },
    required: ["module_name"]
  },
  output_schema: {
    type: "object",
    properties: {
      module_name: { type: "string" },
      status:      { type: "string" },
      output:      {}
    },
    required: ["module_name", "status"]
  },

  preview(input) {
    return Promise.resolve(previewed({
      operation:   "pipeline.run_module",
      module_name: input.module_name,
      note:        "Would invoke pipeline module '" + input.module_name + "'"
    }));
  },

  async execute(input, ctx) {
    const root    = (ctx && ctx.root) || process.cwd();
    const modPath = path.resolve(root, "code", "src", "modules", input.module_name);

    let mod;
    try {
      mod = require(modPath);
    } catch (e) {
      return failed("EXECUTE_ERROR", "Cannot load module '" + input.module_name + "': " + e.message);
    }

    if (typeof mod.executeModule !== "function") {
      return failed("EXECUTE_ERROR", "Module '" + input.module_name + "' does not export executeModule()");
    }

    let result;
    try {
      result = await mod.executeModule({ root, context: input.context || {} });
    } catch (e) {
      return failed("EXECUTE_ERROR", "Module '" + input.module_name + "' threw: " + e.message);
    }

    return ok({
      module_name: input.module_name,
      status:      (result && result.status) || "UNKNOWN",
      output:      result || null
    });
  }
});

// ── 2. pipeline.advance_stage ─────────────────────────────────────────────────

const advance_stage = defineTool({
  name: "pipeline.advance_stage",
  description: "Update progress/status.json to advance current_stage and current_task.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      next_stage:   { type: "string" },
      current_task: { type: "string" },
      next_step:    { type: "string" }
    },
    required: ["next_stage", "current_task"]
  },
  output_schema: {
    type: "object",
    properties: {
      previous_stage: { type: "string" },
      next_stage:     { type: "string" },
      current_task:   { type: "string" }
    },
    required: ["next_stage", "current_task"]
  },

  preview(input, ctx) {
    const root   = (ctx && ctx.root) || process.cwd();
    const status = _readStatus(root);
    return Promise.resolve(previewed({
      operation:      "pipeline.advance_stage",
      previous_stage: status ? status.current_stage : null,
      next_stage:     input.next_stage,
      current_task:   input.current_task,
      note:           "Would update progress/status.json"
    }));
  },

  async execute(input, ctx) {
    const root   = (ctx && ctx.root) || process.cwd();
    const status = _readStatus(root);
    if (!status) {
      return failed("STATUS_NOT_FOUND", "progress/status.json not found");
    }

    const previousStage = status.current_stage;
    status.current_stage = input.next_stage;
    status.current_task  = input.current_task;
    if (input.next_step) status.next_step = input.next_step;

    _writeStatus(root, status);

    return ok({
      previous_stage: previousStage,
      next_stage:     input.next_stage,
      current_task:   input.current_task
    });
  }
});

// ── 3. pipeline.mark_blocked ──────────────────────────────────────────────────

const mark_blocked = defineTool({
  name: "pipeline.mark_blocked",
  description: "Append a blocking question to progress/status.json.blocking_questions.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      reason:  { type: "string" },
      detail:  { type: "string" },
      context: { type: "object" }
    },
    required: ["reason"]
  },
  output_schema: {
    type: "object",
    properties: {
      blocking_questions_count: { type: "number" }
    },
    required: ["blocking_questions_count"]
  },

  preview(input, ctx) {
    const root   = (ctx && ctx.root) || process.cwd();
    const status = _readStatus(root);
    const count  = status ? ((status.blocking_questions || []).length + 1) : 1;
    return Promise.resolve(previewed({
      operation: "pipeline.mark_blocked",
      reason:    input.reason,
      note:      "Would append blocking_question entry. Total after: " + count
    }));
  },

  async execute(input, ctx) {
    const root   = (ctx && ctx.root) || process.cwd();
    const status = _readStatus(root);
    if (!status) {
      return failed("STATUS_NOT_FOUND", "progress/status.json not found");
    }

    if (!Array.isArray(status.blocking_questions)) status.blocking_questions = [];

    status.blocking_questions.push({
      ts:      new Date().toISOString(),
      reason:  input.reason,
      detail:  input.detail  || null,
      context: input.context || null
    });

    _writeStatus(root, status);

    return ok({ blocking_questions_count: status.blocking_questions.length });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [run_module, advance_stage, mark_blocked]
};

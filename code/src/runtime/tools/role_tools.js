"use strict";

const { defineTool, ok, failed } = require("./_contract");
const { pickRole }               = require("../agents/_role_registry");

function _root(ctx) {
  return (ctx && ctx.root) || process.cwd();
}

// ── role.invoke ───────────────────────────────────────────────────────────────

const tool_invoke = defineTool({
  name:          "role.invoke",
  description:   "Invoke a specialized agent role (PROMPT). Resolves the role, runs it, and returns structured output.",
  required_mode: "PROMPT",
  input_schema: {
    type: "object",
    properties: {
      role_id:    { type: "string" },
      input:      { type: "object" },
      project_id: { type: "string" },
      provider:   { type: "string" },
      model:      { type: "string" }
    },
    required: ["role_id", "input", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      role_id: { type: "string" }
    },
    required: ["role_id"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   null,
      metadata: {
        operation:  "role.invoke",
        role_id:    input.role_id,
        project_id: input.project_id,
        provider:   input.provider || "(default)",
        model:      input.model    || "(default)"
      }
    });
  },

  async execute(input, ctx) {
    const role = pickRole(input.role_id);
    if (!role) {
      return failed("ROLE_NOT_FOUND", "no role registered with id '" + input.role_id + "'", {});
    }

    const innerCtx = {
      root:     _root(ctx),
      role_id:  input.role_id,
      provider: input.provider || undefined,
      model:    input.model    || undefined
    };

    let roleResult;
    try {
      roleResult = await role.run(input.input, innerCtx);
    } catch (err) {
      return failed("ROLE_RUN_ERROR", err.message, {});
    }

    if (!roleResult || roleResult.status !== "SUCCESS") {
      const meta = (roleResult && roleResult.metadata) || {};
      return failed(meta.reason || "ROLE_FAILED", meta.detail || null, {});
    }

    return ok({ role_id: input.role_id, ...roleResult.output }, roleResult.metadata);
  }
});

module.exports = { tools: [tool_invoke] };

"use strict";

const { defineTool, ok, failed } = require("./_contract");
const { pickRole }               = require("../agents/_role_registry");
const { emit: emitActivity }    = require("../agents/_activity_emitter");
const { getIndicator }          = require("../agents/_activity_catalog");
const crypto                    = require("crypto");

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
      role_id:     { type: "string" },
      input:       { type: "object" },
      project_id:  { type: "string" },
      provider:    { type: "string" },
      model:       { type: "string" },
      scenario_id: { type: "string" }
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

    const invocation_id = crypto.randomUUID();
    const root          = _root(ctx);
    const project_id    = input.project_id;

    const innerCtx = {
      root,
      role_id:      input.role_id,
      provider:     input.provider    || undefined,
      model:        input.model       || undefined,
      scenario_id:  input.scenario_id || undefined,
      invocation_id
    };

    try {
      emitActivity({ invocation_id, project_id, role: input.role_id,
        state: "INVOKING_ADAPTER", indicator: getIndicator(input.role_id, "INVOKING_ADAPTER") }, { root });
    } catch (_e) { /* best-effort */ }

    const startTs = Date.now();
    let roleResult;
    try {
      roleResult = await role.run(input.input, innerCtx);
    } catch (err) {
      try {
        emitActivity({ invocation_id, project_id, role: input.role_id,
          state: "FAILED", indicator: getIndicator(input.role_id, "FAILED"),
          duration_ms: Date.now() - startTs, outcome: "failed" }, { root });
      } catch (_e) { /* best-effort */ }
      return failed("ROLE_RUN_ERROR", err.message, {});
    }

    if (!roleResult || roleResult.status !== "SUCCESS") {
      const meta = (roleResult && roleResult.metadata) || {};
      try {
        emitActivity({ invocation_id, project_id, role: input.role_id,
          state: "FAILED", indicator: getIndicator(input.role_id, "FAILED"),
          duration_ms: Date.now() - startTs, outcome: "failed" }, { root });
      } catch (_e) { /* best-effort */ }
      return failed(meta.reason || "ROLE_FAILED", meta.detail || null, {});
    }

    try {
      emitActivity({ invocation_id, project_id, role: input.role_id,
        state: "COMPLETED", indicator: getIndicator(input.role_id, "COMPLETED"),
        duration_ms: Date.now() - startTs, outcome: "success" }, { root });
    } catch (_e) { /* best-effort */ }

    return ok({ role_id: input.role_id, ...roleResult.output }, roleResult.metadata);
  }
});

module.exports = { tools: [tool_invoke] };

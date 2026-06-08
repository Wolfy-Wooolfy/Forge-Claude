"use strict";

// PHASE-24 — L2 tool: builder.materialize
// Wraps materializerEngine in the standard L2 tool envelope.
// Auto-registered by _registry.js (matches *_tools.js pattern).

const { defineTool, ok, previewed } = require("./_contract");
const { materialize }               = require("../orchestration/materializerEngine");

const builder_materialize = defineTool({
  name:          "builder.materialize",
  description:   "One codegen LLM call → path-safety check → write files with real sha256/line_count → optional smoke. All side effects via reg.invoke.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_id:  { type: "string",  description: "Project ID" },
      plan:        { type: "array",   description: "Builder plan: [{path, action, line_count}]" },
      spec:        { type: "object",  description: "Formalized spec" },
      design:      { type: "object",  description: "Architect design" },
      provider:    { type: "string",  description: "LLM provider (default: openai)" },
      model:       { type: "string",  description: "LLM model (default: gpt-4o)" },
      scenario_id: { type: "string",  description: "Scenario tag for mock scripting (SCENARIO_TAG in prompt)" },
      smoke:       { type: "boolean", description: "Run shell smoke after writing (default: false)" },
      smoke_entry: { type: "string",  description: "Spec-defined entry file for smoke (e.g. run.js); required when smoke:true" }
    },
    required: ["project_id", "plan", "spec", "design"]
  },

  output_schema: {
    type: "object",
    properties: {
      status:        { type: "string", enum: ["SUCCESS", "FAILED"] },
      files_written: { type: "array"  },
      smoke:         { type: "object" },
      summary:       { type: "string" }
    },
    required: ["status", "files_written", "smoke", "summary"]
  },

  preview(input) {
    const paths = Array.isArray(input.plan)
      ? input.plan.map(function (f) { return f.path; }).join(", ")
      : "(no plan)";
    return Promise.resolve(previewed({
      operation:  "builder.materialize",
      project_id: input.project_id,
      files:      paths,
      smoke:      !!(input.smoke)
    }));
  },

  async execute(input, ctx) {
    const result = await materialize(input, ctx);
    return ok({
      status:        result.status,
      files_written: result.files_written,
      smoke:         result.smoke,
      summary:       result.summary,
      error_code:    result.error_code   !== undefined ? result.error_code   : undefined,
      error_detail:  result.error_detail !== undefined ? result.error_detail : undefined
    });
  }
});

module.exports = { tools: [builder_materialize] };

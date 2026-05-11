"use strict";

const { defineTool, ok, failed } = require("./_contract");
const { readEntries }            = require("../agents/_activity_emitter");

// ── agent.read_activity ───────────────────────────────────────────────────────

const tool_read_activity = defineTool({
  name:          "agent.read_activity",
  description:   "Query the activity log for a project (READ_ONLY).",
  required_mode: "READ_ONLY",
  is_read_only:  true,
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      role:       { type: "string" },
      state:      { type: "string" },
      since:      { type: "string" }
    },
    required: ["project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      entries: { type: "array" },
      count:   { type: "number" }
    },
    required: ["entries", "count"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   null,
      metadata: { operation: "agent.read_activity", project_id: input.project_id }
    });
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const filter = {
      project_id: input.project_id,
      role:       input.role  || undefined,
      state:      input.state || undefined,
      since:      input.since || undefined
    };

    const entries = readEntries(filter, { root });
    return ok({ entries, count: entries.length }, {});
  }
});

module.exports = { tools: [tool_read_activity] };

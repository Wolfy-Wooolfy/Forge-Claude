"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("builder_v1");

const INPUT_SCHEMA = {
  type: "object",
  required: ["project_id", "spec", "design"],
  properties: {
    project_id:   { type: "string", minLength: 1 },
    spec:         { type: "object" },
    design:       { type: "object" },
    target_files: { type: "array" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["files_written", "summary", "dependencies_added", "notes"],
  properties: {
    files_written: { type: "array", items: {
      type: "object", required: ["path", "action", "line_count", "sha256"],
      properties: {
        path:        { type: "string" },
        action:      { enum: ["create", "modify"] },
        line_count:  { type: "number", minimum: 0 },
        sha256:      { type: "string" }
      }
    }},
    summary:           { type: "string", minLength: 1 },
    dependencies_added: { type: "array", items: {
      type: "object", required: ["ecosystem", "package", "version"],
      properties: {
        ecosystem: { type: "string" },
        package:   { type: "string" },
        version:   { type: "string" }
      }
    }},
    notes: { type: "array", items: { type: "string" } }
  }
};

module.exports = defineRole({
  id:               "builder",
  label:            "Builder",
  description:      "Plans the implementation by describing files to create; delegates to executor adapters",
  default_provider: "claude_code",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "builder_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 1.50,
  typical_cost_usd_max: 4.00,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    const provider      = (ctx && ctx.provider)      || this.default_provider;
    const model         = (ctx && ctx.model)         || this.default_model;
    const project_id    = input.project_id;
    const invocation_id = (ctx && ctx.invocation_id) || null;
    const root          = (ctx && ctx.root)          || process.cwd();

    const scenarioTag = (ctx && ctx.scenario_id)
      ? "\nSCENARIO_TAG: " + ctx.scenario_id + "\n"
      : "";

    const prompt =
      "builder|" + project_id + "\n" +
      scenarioTag +
      SYSTEM_PROMPT +
      "\n\nINPUT:\n" + JSON.stringify({ spec: input.spec, design: input.design }) +
      "\n\nRESPOND WITH VALID JSON ONLY.";

    let agentResult;
    try {
      const reg = require("../../tools/_registry").getDefaultRegistry();
      agentResult = await reg.invoke(
        "agent.invoke",
        { provider, model, prompt, project_id, context: { role: this.id } },
        { root, role_id: this.id }
      );
    } catch (err) {
      return roleFailed("AGENT_INVOKE_ERROR", err.message, ctx);
    }

    if (!agentResult || agentResult.status !== "SUCCESS") {
      const detail = agentResult && agentResult.metadata && agentResult.metadata.detail;
      return roleFailed("AGENT_FAILED", detail || "agent.invoke returned non-SUCCESS", ctx);
    }

    let parsed;
    try {
      parsed = JSON.parse(agentResult.output.text);
    } catch (e) {
      return roleFailed("INVALID_ROLE_OUTPUT", "JSON parse failed: " + e.message, ctx);
    }

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "PARSING_OUTPUT", indicator: getIndicator(this.id, "PARSING_OUTPUT") }, { root });
    } catch (_e) { /* best-effort */ }

    const ov = validate(parsed, OUTPUT_SCHEMA);
    if (!ov.valid) return roleFailed("INVALID_ROLE_OUTPUT", ov.errors.join("; "), ctx);

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "VALIDATING_SCHEMA", indicator: getIndicator(this.id, "VALIDATING_SCHEMA") }, { root });
    } catch (_e) { /* best-effort */ }

    return roleOk(parsed, { role: this.id, model, provider });
  }
});

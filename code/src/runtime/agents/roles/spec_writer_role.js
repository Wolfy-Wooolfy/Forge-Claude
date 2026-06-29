"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("spec_writer_v2");

const INPUT_SCHEMA = {
  type: "object",
  required: ["design", "project_id"],
  properties: {
    design:     { type: "object" },
    project_id: { type: "string", minLength: 1 }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["scope", "decisions", "acceptance_criteria",
             "files_to_create", "files_to_modify", "out_of_scope"],
  properties: {
    scope:               { type: "string", minLength: 1 },
    decisions:           { type: "array",  items: {
      type: "object", required: ["decision", "rationale"],
      properties: { decision: { type: "string" }, rationale: { type: "string" } }
    }},
    acceptance_criteria: { type: "array",  items: {
      type: "object", required: ["id", "description"],
      properties: { id: { type: "string" }, description: { type: "string" } }
    }},
    files_to_create:     { type: "array",  items: {
      type: "object", required: ["path", "purpose"],
      properties: { path: { type: "string" }, purpose: { type: "string" } }
    }},
    files_to_modify:     { type: "array",  items: {
      type: "object", required: ["path", "change"],
      properties: { path: { type: "string" }, change: { type: "string" } }
    }},
    out_of_scope:        { type: "array",  items: { type: "string" } }
  }
};

module.exports = defineRole({
  id:               "spec_writer",
  label:            "Spec Writer",
  description:      "Converts an architect design into a formal implementation specification",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "spec_writer_v2",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.08,
  typical_cost_usd_max: 0.40,

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
      "spec_writer|" + project_id + "\n" +
      scenarioTag +
      SYSTEM_PROMPT +
      "\n\nINPUT:\n" + JSON.stringify({ design: input.design }) +
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

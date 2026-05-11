"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");

const SYSTEM_PROMPT = loadPrompt("test_designer_v1");

const INPUT_SCHEMA = {
  type: "object",
  required: ["project_id", "spec", "design"],
  properties: {
    project_id: { type: "string", minLength: 1 },
    spec:       { type: "object" },
    design:     { type: "object" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["scenarios", "coverage_summary"],
  properties: {
    scenarios: { type: "array", items: {
      type: "object", required: ["id", "name", "description", "inputs", "expected_outputs", "covers_ac"],
      properties: {
        id:               { type: "string" },
        name:             { type: "string" },
        description:      { type: "string" },
        inputs:           { type: "object" },
        expected_outputs: { type: "object" },
        covers_ac:        { type: "array", items: { type: "string" } }
      }
    }},
    coverage_summary: {
      type: "object",
      required: ["acs_total", "acs_covered", "gaps"],
      properties: {
        acs_total:   { type: "number", minimum: 0 },
        acs_covered: { type: "number", minimum: 0 },
        gaps:        { type: "array", items: { type: "string" } }
      }
    }
  }
};

module.exports = defineRole({
  id:               "test_designer",
  label:            "Test Designer",
  description:      "Generates test scenarios for the built project based on spec acceptance criteria",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "test_designer_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.20,
  typical_cost_usd_max: 0.50,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    const provider   = (ctx && ctx.provider)   || this.default_provider;
    const model      = (ctx && ctx.model)      || this.default_model;
    const project_id = input.project_id;

    const scenarioTag = (ctx && ctx.scenario_id)
      ? "\nSCENARIO_TAG: " + ctx.scenario_id + "\n"
      : "";

    const prompt =
      "test_designer|" + project_id + "\n" +
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
        { root: (ctx && ctx.root) || process.cwd(), role_id: this.id }
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

    const ov = validate(parsed, OUTPUT_SCHEMA);
    if (!ov.valid) return roleFailed("INVALID_ROLE_OUTPUT", ov.errors.join("; "), ctx);

    return roleOk(parsed, { role: this.id, model, provider });
  }
});

"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("cost_estimator_v1");

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
  required: ["phases", "total_effort_low_hours", "total_effort_mid_hours",
             "total_effort_high_hours", "external_costs", "top_risks",
             "uncertainty_flags", "summary"],
  properties: {
    phases: { type: "array", items: {
      type: "object",
      required: ["phase", "description", "effort_low_hours", "effort_mid_hours",
                 "effort_high_hours", "cost_drivers"],
      properties: {
        phase:              { type: "string" },
        description:        { type: "string" },
        effort_low_hours:   { type: "number", minimum: 0 },
        effort_mid_hours:   { type: "number", minimum: 0 },
        effort_high_hours:  { type: "number", minimum: 0 },
        cost_drivers:       { type: "array", items: { type: "string" } }
      }
    }},
    total_effort_low_hours:  { type: "number", minimum: 0 },
    total_effort_mid_hours:  { type: "number", minimum: 0 },
    total_effort_high_hours: { type: "number", minimum: 0 },
    external_costs: { type: "array", items: {
      type: "object", required: ["item", "cost_type", "estimate_usd", "notes"],
      properties: {
        item:         { type: "string" },
        cost_type:    { enum: ["one-time", "monthly", "per-call"] },
        estimate_usd: { type: "string" },
        notes:        { type: "string" }
      }
    }},
    top_risks: { type: "array", items: {
      type: "object", required: ["risk", "impact", "mitigation"],
      properties: {
        risk:       { type: "string" },
        impact:     { enum: ["LOW", "MEDIUM", "HIGH"] },
        mitigation: { type: "string" }
      }
    }},
    uncertainty_flags: { type: "array", items: { type: "string" } },
    summary:           { type: "string", minLength: 1 }
  }
};

module.exports = defineRole({
  id:               "cost_estimator",
  label:            "Cost Estimator",
  description:      "Produces effort and cost estimates for the project based on spec and design",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "cost_estimator_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.10,
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
      "cost_estimator|" + project_id + "\n" +
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

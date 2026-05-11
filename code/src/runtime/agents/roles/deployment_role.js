"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("deployment_v1");

const INPUT_SCHEMA = {
  type: "object",
  required: ["project_id", "spec", "design"],
  properties: {
    project_id:  { type: "string", minLength: 1 },
    spec:        { type: "object" },
    design:      { type: "object" },
    environment: { type: "object" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["target_environment", "prerequisites", "build_steps",
             "deployment_sequence", "rollback_procedure", "health_verification",
             "post_deployment_tasks", "deployment_risks", "summary"],
  properties: {
    target_environment: { type: "string", minLength: 1 },
    prerequisites: { type: "array", items: {
      type: "object", required: ["item", "verified_by"],
      properties: {
        item:        { type: "string" },
        verified_by: { type: "string" }
      }
    }},
    build_steps: { type: "array", items: {
      type: "object", required: ["step", "description", "artifact", "notes"],
      properties: {
        step:        { type: "number" },
        description: { type: "string" },
        artifact:    { type: "string" },
        notes:       { type: "string" }
      }
    }},
    deployment_sequence: { type: "array", items: {
      type: "object",
      required: ["step", "description", "requires_elevated_privileges", "is_irreversible", "notes"],
      properties: {
        step:                        { type: "number" },
        description:                 { type: "string" },
        requires_elevated_privileges:{ type: "boolean" },
        is_irreversible:             { type: "boolean" },
        notes:                       { type: "string" }
      }
    }},
    rollback_procedure: { type: "array", items: {
      type: "object", required: ["step", "description"],
      properties: {
        step:        { type: "number" },
        description: { type: "string" }
      }
    }},
    health_verification: {
      type: "object",
      required: ["method", "expected_outcome", "timeout_seconds"],
      properties: {
        method:           { type: "string" },
        expected_outcome: { type: "string" },
        timeout_seconds:  { type: "number", minimum: 1 }
      }
    },
    post_deployment_tasks: { type: "array", items: { type: "string" } },
    deployment_risks: { type: "array", items: {
      type: "object", required: ["risk", "severity", "mitigation"],
      properties: {
        risk:       { type: "string" },
        severity:   { enum: ["LOW", "MEDIUM", "HIGH"] },
        mitigation: { type: "string" }
      }
    }},
    summary: { type: "string", minLength: 1 }
  }
};

module.exports = defineRole({
  id:               "deployment",
  label:            "Deployment",
  description:      "Produces a structured deployment plan including build steps, rollback, and health verification",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "deployment_v1",
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

    const inputData = { spec: input.spec, design: input.design };
    if (input.environment) inputData.environment = input.environment;

    const prompt =
      "deployment|" + project_id + "\n" +
      scenarioTag +
      SYSTEM_PROMPT +
      "\n\nINPUT:\n" + JSON.stringify(inputData) +
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

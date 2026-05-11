"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("environment_v1");

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
  required: ["target_environment", "runtime_dependencies", "environment_variables",
             "external_services", "os_requirements", "container_recommendation",
             "filesystem_requirements", "assumption_flags", "summary"],
  properties: {
    target_environment: { type: "string", minLength: 1 },
    runtime_dependencies: { type: "array", items: {
      type: "object", required: ["name", "version_constraint", "purpose"],
      properties: {
        name:               { type: "string" },
        version_constraint: { type: "string" },
        purpose:            { type: "string" }
      }
    }},
    environment_variables: { type: "array", items: {
      type: "object", required: ["name", "purpose", "format", "required", "is_secret", "example"],
      properties: {
        name:      { type: "string" },
        purpose:   { type: "string" },
        format:    { type: "string" },
        required:  { type: "boolean" },
        is_secret: { type: "boolean" },
        example:   { type: "string" }
      }
    }},
    external_services: { type: "array", items: {
      type: "object", required: ["name", "type", "connection_method", "notes"],
      properties: {
        name:              { type: "string" },
        type:              { type: "string" },
        connection_method: { type: "string" },
        notes:             { type: "string" }
      }
    }},
    os_requirements: {
      type: "object",
      required: ["os_family"],
      properties: {
        os_family:   { type: "string" },
        min_ram_mb:  {},
        min_disk_mb: {},
        cpu_notes:   {}
      }
    },
    container_recommendation: {
      type: "object",
      required: ["base_image", "multi_stage", "notes"],
      properties: {
        base_image:   { type: "string" },
        multi_stage:  { type: "boolean" },
        notes:        { type: "string" }
      }
    },
    filesystem_requirements: { type: "array", items: {
      type: "object", required: ["path", "access", "notes"],
      properties: {
        path:   { type: "string" },
        access: { type: "string" },
        notes:  { type: "string" }
      }
    }},
    assumption_flags: { type: "array", items: { type: "string" } },
    summary:          { type: "string", minLength: 1 }
  }
};

module.exports = defineRole({
  id:               "environment",
  label:            "Environment",
  description:      "Produces environment requirements report (runtime deps, env vars, container strategy)",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "environment_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.08,
  typical_cost_usd_max: 0.30,

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
      "environment|" + project_id + "\n" +
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

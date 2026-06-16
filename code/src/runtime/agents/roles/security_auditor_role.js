"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("security_auditor_v6");

const INPUT_SCHEMA = {
  type: "object",
  required: ["project_id", "phase", "spec", "design"],
  properties: {
    project_id: { type: "string", minLength: 1 },
    phase:      { enum: ["SPEC", "CODE"] },
    spec:       { type: "object" },
    design:     { type: "object" },
    code:       { type: "object" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["threat_level", "findings", "summary"],
  properties: {
    threat_level: { enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"] },
    findings: { type: "array", items: {
      type: "object", required: ["severity", "vulnerability", "location", "attack_vector", "mitigation"],
      properties: {
        severity:      { enum: ["BLOCKER", "WARN", "INFO"] },
        vulnerability: { type: "string" },
        location:      { type: "string" },
        attack_vector: { type: "string" },
        mitigation:    { type: "string" }
      }
    }},
    summary: { type: "string", minLength: 1 }
  }
};

module.exports = defineRole({
  id:               "security_auditor",
  label:            "Security Auditor",
  description:      "Reviews specs (Phase SPEC) and code plans (Phase CODE) for security vulnerabilities",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "security_auditor_v6",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "BLOCKING",
  typical_cost_usd_min: 0.30,
  typical_cost_usd_max: 0.80,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    // Phase CODE requires code field
    if (input.phase === "CODE" && (!input.code || typeof input.code !== "object")) {
      return roleFailed("INVALID_INPUT",
        "phase CODE requires a 'code' field (Builder's output object)", ctx);
    }

    const provider      = (ctx && ctx.provider)      || this.default_provider;
    const model         = (ctx && ctx.model)         || this.default_model;
    const project_id    = input.project_id;
    const invocation_id = (ctx && ctx.invocation_id) || null;
    const root          = (ctx && ctx.root)          || process.cwd();

    const scenarioTag = (ctx && ctx.scenario_id)
      ? "\nSCENARIO_TAG: " + ctx.scenario_id + "\n"
      : "";

    const inputData = input.phase === "CODE"
      ? { phase: input.phase, spec: input.spec, design: input.design, code: input.code }
      : { phase: input.phase, spec: input.spec, design: input.design };

    const prompt =
      "security_auditor|" + project_id + "\n" +
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

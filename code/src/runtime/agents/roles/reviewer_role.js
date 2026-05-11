"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");

const SYSTEM_PROMPT = loadPrompt("reviewer_v2");

const INPUT_SCHEMA = {
  type: "object",
  required: ["phase", "spec", "design", "project_id"],
  properties: {
    phase:      { enum: ["A", "B"] },
    spec:       { type: "object" },
    design:     { type: "object" },
    code:       { type: "object" },
    project_id: { type: "string", minLength: 1 }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["verdict", "findings", "summary"],
  properties: {
    verdict:  { enum: ["APPROVED", "APPROVED_WITH_CONCERNS", "REJECTED"] },
    findings: { type: "array", items: {
      type: "object", required: ["severity", "issue", "location", "recommendation"],
      properties: {
        severity:       { enum: ["BLOCKER", "WARN", "INFO"] },
        issue:          { type: "string" },
        location:       { type: "string" },
        recommendation: { type: "string" }
      }
    }},
    summary:  { type: "string", minLength: 1 }
  }
};

module.exports = defineRole({
  id:               "reviewer",
  label:            "Reviewer",
  description:      "Reviews specs (Phase A) and code plans (Phase B) for completeness and correctness",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "reviewer_v2",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "BLOCKING",
  typical_cost_usd_min: 0.30,
  typical_cost_usd_max: 0.70,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    // Phase B requires code field
    if (input.phase === "B" && (!input.code || typeof input.code !== "object")) {
      return roleFailed("INVALID_INPUT",
        "phase B requires a 'code' field (Builder's output object)", ctx);
    }

    const provider   = (ctx && ctx.provider)   || this.default_provider;
    const model      = (ctx && ctx.model)      || this.default_model;
    const project_id = input.project_id;

    const scenarioTag = (ctx && ctx.scenario_id)
      ? "\nSCENARIO_TAG: " + ctx.scenario_id + "\n"
      : "";

    const inputData = input.phase === "B"
      ? { phase: input.phase, spec: input.spec, design: input.design, code: input.code }
      : { phase: input.phase, spec: input.spec, design: input.design };

    const prompt =
      "reviewer|" + project_id + "\n" +
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

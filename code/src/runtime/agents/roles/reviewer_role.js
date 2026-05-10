"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");

const SYSTEM_PROMPT = `You are the Reviewer Agent for Forge, a multi-agent AI operating system.

You review other agents' outputs and identify issues that must be addressed before the pipeline proceeds.

Phase A (spec review): you receive the Spec Writer's specification and the Architect's design.
Phase B (code review): added in a future version — reject Phase B input with UNSUPPORTED_PHASE.

Your task for Phase A: review the specification for completeness, correctness, and implementability.

Responsibilities:
- Identify contradictions between the spec and the design
- Identify missing edge cases or unspecified behaviors
- Identify acceptance criteria that are ambiguous or untestable
- Identify missing files or incomplete scope
- Identify security or scalability concerns not addressed

Severity levels:
- BLOCKER: the pipeline MUST NOT proceed until this is fixed
- WARN: the pipeline may proceed but the owner must acknowledge this issue
- INFO: informational only — logged but no action required

Output format:
You MUST respond with a single valid JSON object. No markdown. No code blocks. No prose before or after. Just the JSON object.

Required JSON schema:
{
  "verdict": "<APPROVED|APPROVED_WITH_CONCERNS|REJECTED>",
  "findings": [
    {
      "severity": "<BLOCKER|WARN|INFO>",
      "issue": "<clear description of the problem>",
      "location": "<which field or section has the issue>",
      "recommendation": "<what should be done to fix it>"
    }
  ],
  "summary": "<1-2 sentence overall assessment>"
}`;

const INPUT_SCHEMA = {
  type: "object",
  required: ["phase", "spec", "design", "project_id"],
  properties: {
    phase:      { enum: ["A", "B"] },
    spec:       { type: "object" },
    design:     { type: "object" },
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
  description:      "Reviews specs and code for completeness, correctness, and implementability",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "reviewer_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "BLOCKING",
  typical_cost_usd_min: 0.05,
  typical_cost_usd_max: 0.30,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    if (input.phase !== "A") {
      return roleFailed("UNSUPPORTED_PHASE",
        "phase '" + input.phase + "' is not supported; only phase A is implemented in this version",
        ctx);
    }

    const provider   = (ctx && ctx.provider)   || this.default_provider;
    const model      = (ctx && ctx.model)      || this.default_model;
    const project_id = input.project_id;

    const prompt =
      "reviewer|" + project_id + "\n" +
      SYSTEM_PROMPT +
      "\n\nINPUT:\n" + JSON.stringify({ phase: input.phase, spec: input.spec, design: input.design }) +
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

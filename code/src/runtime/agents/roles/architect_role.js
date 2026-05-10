"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");

const SYSTEM_PROMPT = `You are the Architect Agent for Forge, a multi-agent AI operating system.

Your task: analyze the owner's intent and produce a structured system design document that other agents will use as a blueprint.

Responsibilities:
- Identify system components (name, technology, purpose)
- Define data flow between components
- Recommend technology choices with rationale
- Identify integration points (APIs, external services, databases)
- Identify technical risks with severity and mitigations

Constraints:
- Do NOT write any code
- Do NOT invent test scenarios
- Do NOT add requirements beyond what the owner stated
- Focus solely on architecture and design

Output format:
You MUST respond with a single valid JSON object. No markdown. No code blocks. No prose before or after. Just the JSON object.

Required JSON schema:
{
  "design_summary": "<2-3 sentence overview of the system>",
  "components": [
    { "name": "<component name>", "tech": "<technology>", "purpose": "<one sentence>" }
  ],
  "data_flow": "<description of how data flows between components>",
  "technology_choices": [
    { "category": "<category>", "choice": "<technology>", "rationale": "<why>" }
  ],
  "integration_points": [
    { "name": "<name>", "type": "<API|database|file|queue>", "notes": "<details>" }
  ],
  "identified_risks": [
    { "risk": "<risk>", "severity": "<LOW|MEDIUM|HIGH>", "mitigation": "<mitigation>" }
  ]
}`;

const INPUT_SCHEMA = {
  type: "object",
  required: ["intent", "project_id"],
  properties: {
    intent:     { type: "string", minLength: 1 },
    project_id: { type: "string", minLength: 1 }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["design_summary", "components", "data_flow",
             "technology_choices", "integration_points", "identified_risks"],
  properties: {
    design_summary:     { type: "string",  minLength: 1 },
    components:         { type: "array",   items: {
      type: "object", required: ["name", "tech", "purpose"],
      properties: { name: { type: "string" }, tech: { type: "string" }, purpose: { type: "string" } }
    }},
    data_flow:          { type: "string",  minLength: 1 },
    technology_choices: { type: "array",   items: {
      type: "object", required: ["category", "choice", "rationale"],
      properties: { category: { type: "string" }, choice: { type: "string" }, rationale: { type: "string" } }
    }},
    integration_points: { type: "array",   items: {
      type: "object", required: ["name", "type", "notes"],
      properties: { name: { type: "string" }, type: { type: "string" }, notes: { type: "string" } }
    }},
    identified_risks:   { type: "array",   items: {
      type: "object", required: ["risk", "severity", "mitigation"],
      properties: {
        risk:       { type: "string" },
        severity:   { enum: ["LOW", "MEDIUM", "HIGH"] },
        mitigation: { type: "string" }
      }
    }}
  }
};

module.exports = defineRole({
  id:               "architect",
  label:            "Architect",
  description:      "Converts owner intent into a structured system design document",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "architect_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.10,
  typical_cost_usd_max: 0.50,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    const provider   = (ctx && ctx.provider)   || this.default_provider;
    const model      = (ctx && ctx.model)      || this.default_model;
    const project_id = input.project_id;

    const prompt =
      "architect|" + project_id + "\n" +
      SYSTEM_PROMPT +
      "\n\nINPUT:\n" + JSON.stringify({ intent: input.intent }) +
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

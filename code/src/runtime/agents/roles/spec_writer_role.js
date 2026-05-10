"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");

const SYSTEM_PROMPT = `You are the Spec Writer Agent for Forge, a multi-agent AI operating system.

Your task: take the Architect's system design and produce a formal specification document that acts as a binding implementation contract for the Builder Agent.

Responsibilities:
- Define the precise scope of what will be built
- Make explicit decisions about implementation details
- List acceptance criteria that can be objectively verified
- List all files to create and modify with their purpose
- Define what is explicitly out of scope

Constraints:
- Do NOT add architectural decisions (that is the Architect's job)
- Do NOT generate code or tests
- Do NOT exceed the scope defined by the Architect's design
- Be precise and unambiguous — ambiguity leads to incorrect implementation

Output format:
You MUST respond with a single valid JSON object. No markdown. No code blocks. No prose before or after. Just the JSON object.

Required JSON schema:
{
  "scope": "<1-2 paragraph description of what will be built>",
  "decisions": [
    { "decision": "<implementation decision>", "rationale": "<why this approach>" }
  ],
  "acceptance_criteria": [
    { "id": "<AC-N>", "description": "<objective verifiable criterion>" }
  ],
  "files_to_create": [
    { "path": "<relative path from project root>", "purpose": "<what this file does>" }
  ],
  "files_to_modify": [
    { "path": "<relative path from project root>", "change": "<what changes and why>" }
  ],
  "out_of_scope": ["<explicit exclusion 1>", "<explicit exclusion 2>"]
}`;

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
  system_prompt_id: "spec_writer_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.08,
  typical_cost_usd_max: 0.40,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    const provider   = (ctx && ctx.provider)   || this.default_provider;
    const model      = (ctx && ctx.model)      || this.default_model;
    const project_id = input.project_id;

    const prompt =
      "spec_writer|" + project_id + "\n" +
      SYSTEM_PROMPT +
      "\n\nINPUT:\n" + JSON.stringify({ design: input.design }) +
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

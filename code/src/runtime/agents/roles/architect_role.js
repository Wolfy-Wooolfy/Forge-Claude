"use strict";

const { defineRole, roleOk, roleFailed }      = require("../_role_contract");
const { validate }                             = require("../_json_schema_validator");
const { loadPrompt }                           = require("../_prompt_loader");
const { emit: emitActivity }                  = require("../_activity_emitter");
const { getIndicator }                        = require("../_activity_catalog");
const { createLanguageDetectionCompliance }   = require("../../../ai_os/languageDetectionCompliance");

const SYSTEM_PROMPT = loadPrompt("architect_v1");
const { detectLanguage: _detectLang } = createLanguageDetectionCompliance();

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

function _buildArchitectPrompt(input, ctx) {
  const project_id  = input.project_id;
  const scenarioTag = (ctx && ctx.scenario_id)
    ? "\nSCENARIO_TAG: " + ctx.scenario_id + "\n"
    : "";

  const lang = _detectLang(input.intent || "");
  const langInstruction =
    "\n\nLANGUAGE INSTRUCTION: The owner's intent is in " + lang + ". " +
    "Write ALL output field VALUES (design_summary, components[].purpose, " +
    "technology_choices[].rationale, data_flow, integration_points[].notes, " +
    "identified_risks[].risk, identified_risks[].mitigation) in " + lang + ". " +
    "Keep technical identifiers (component names, tech names like Node.js, PostgreSQL) as-is.";

  return (
    "architect|" + project_id + "\n" +
    scenarioTag +
    SYSTEM_PROMPT +
    "\n\nINPUT:\n" + JSON.stringify({ intent: input.intent }) +
    langInstruction +
    "\n\nRESPOND WITH VALID JSON ONLY."
  );
}

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

    const provider      = (ctx && ctx.provider)      || this.default_provider;
    const model         = (ctx && ctx.model)         || this.default_model;
    const project_id    = input.project_id;
    const invocation_id = (ctx && ctx.invocation_id) || null;
    const root          = (ctx && ctx.root)          || process.cwd();

    const prompt = _buildArchitectPrompt(input, ctx);

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

// defineRole returns a frozen object — reassign with test hook appended
module.exports = Object.assign({}, module.exports, { _buildArchitectPrompt });

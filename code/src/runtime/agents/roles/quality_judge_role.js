"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("quality_judge_v1");

const INPUT_SCHEMA = {
  type: "object",
  required: ["project_id", "spec", "design"],
  properties: {
    project_id:       { type: "string", minLength: 1 },
    spec:             { type: "object" },
    design:           { type: "object" },
    security_audit:   { type: "object" },
    test_plan:        { type: "object" },
    documentation:    { type: "object" },
    cost_estimate:    { type: "object" },
    environment:      { type: "object" },
    deployment:       { type: "object" },
    builder_output:   { type: "object" }
  }
};

const ROLE_ASSESSMENT_ITEM = {
  type: "object",
  required: ["status", "notes"],
  properties: {
    status: { enum: ["CLEAN", "CONCERNS", "CRITICAL"] },
    notes:  { type: "string" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["verdict", "confidence_score", "cross_role_issues",
             "role_assessments", "action_items", "summary"],
  properties: {
    verdict:          { enum: ["APPROVED", "APPROVED_WITH_CONCERNS", "REJECTED"] },
    confidence_score: { type: "number", minimum: 0, maximum: 100 },
    cross_role_issues: { type: "array", items: {
      type: "object", required: ["severity", "issue", "roles_involved", "recommendation"],
      properties: {
        severity:        { enum: ["BLOCKER", "WARN", "INFO"] },
        issue:           { type: "string" },
        roles_involved:  { type: "array", items: { type: "string" } },
        recommendation:  { type: "string" }
      }
    }},
    role_assessments: {
      type: "object",
      required: ["architect", "spec_writer", "reviewer", "security_auditor",
                 "builder", "test_designer", "documentation",
                 "cost_estimator", "environment", "deployment"],
      properties: {
        architect:        ROLE_ASSESSMENT_ITEM,
        spec_writer:      ROLE_ASSESSMENT_ITEM,
        reviewer:         ROLE_ASSESSMENT_ITEM,
        security_auditor: ROLE_ASSESSMENT_ITEM,
        builder:          ROLE_ASSESSMENT_ITEM,
        test_designer:    ROLE_ASSESSMENT_ITEM,
        documentation:    ROLE_ASSESSMENT_ITEM,
        cost_estimator:   ROLE_ASSESSMENT_ITEM,
        environment:      ROLE_ASSESSMENT_ITEM,
        deployment:       ROLE_ASSESSMENT_ITEM
      }
    },
    action_items: { type: "array", items: { type: "string" } },
    summary:      { type: "string", minLength: 1 }
  }
};

module.exports = defineRole({
  id:               "quality_judge",
  label:            "Quality Judge",
  description:      "Final cross-role quality gate — holistic verdict before delivery approval",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "quality_judge_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "BLOCKING",
  typical_cost_usd_min: 0.30,
  typical_cost_usd_max: 0.80,

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
    if (input.security_audit)  inputData.security_audit  = input.security_audit;
    if (input.test_plan)       inputData.test_plan        = input.test_plan;
    if (input.documentation)   inputData.documentation    = input.documentation;
    if (input.cost_estimate)   inputData.cost_estimate    = input.cost_estimate;
    if (input.environment)     inputData.environment      = input.environment;
    if (input.deployment)      inputData.deployment       = input.deployment;
    if (input.builder_output)  inputData.builder_output   = input.builder_output;

    const prompt =
      "quality_judge|" + project_id + "\n" +
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

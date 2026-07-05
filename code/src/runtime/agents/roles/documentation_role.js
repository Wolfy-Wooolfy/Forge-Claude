"use strict";

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("documentation_v1");

const INPUT_SCHEMA = {
  type: "object",
  required: ["project_id", "spec", "design"],
  properties: {
    project_id: { type: "string", minLength: 1 },
    spec:       { type: "object" },
    design:     { type: "object" },
    code:       { type: "object" },
    artifact_path:           { type: "string" },
    citation_audit_override: { type: "boolean" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["overview", "components", "api_reference", "quickstart",
             "operations", "known_limitations", "summary"],
  properties: {
    overview: {
      type: "object",
      required: ["title", "purpose", "key_capabilities"],
      properties: {
        title:            { type: "string" },
        purpose:          { type: "string" },
        key_capabilities: { type: "array", items: { type: "string" } }
      }
    },
    components: { type: "array", items: {
      type: "object", required: ["name", "description", "interface_summary"],
      properties: {
        name:              { type: "string" },
        description:       { type: "string" },
        interface_summary: { type: "string" }
      }
    }},
    api_reference: { type: "array", items: {
      type: "object", required: ["endpoint", "method", "description", "inputs", "outputs", "errors"],
      properties: {
        endpoint:    { type: "string" },
        method:      { type: "string" },
        description: { type: "string" },
        inputs:      { type: "string" },
        outputs:     { type: "string" },
        errors:      { type: "array", items: { type: "string" } }
      }
    }},
    quickstart: {
      type: "object",
      required: ["prerequisites", "steps"],
      properties: {
        prerequisites: { type: "array", items: { type: "string" } },
        steps:         { type: "array", items: { type: "string" } }
      }
    },
    operations: {
      type: "object",
      required: ["health_check", "logging", "common_issues"],
      properties: {
        health_check:  { type: "string" },
        logging:       { type: "string" },
        common_issues: { type: "array", items: {
          type: "object", required: ["symptom", "cause", "fix"],
          properties: {
            symptom: { type: "string" },
            cause:   { type: "string" },
            fix:     { type: "string" }
          }
        }}
      }
    },
    known_limitations: { type: "array", items: { type: "string" } },
    summary:           { type: "string", minLength: 1 }
  }
};

// §8 (KB contract): BLOCKED completion envelope. Local helper — _role_contract
// exports roleOk/roleFailed only; role_tools surfaces any non-SUCCESS role result
// via failed(metadata.reason, metadata.detail), so uncited_claims ride metadata.detail.
function roleBlocked(reason, uncited_claims, ctx) {
  return {
    status:   "BLOCKED",
    output:   null,
    reason,
    uncited_claims,
    metadata: { reason, detail: uncited_claims, context: ctx || null }
  };
}

module.exports = defineRole({
  id:               "documentation",
  label:            "Documentation",
  description:      "Generates structured documentation package for the built project",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "documentation_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.15,
  typical_cost_usd_max: 0.50,

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
    if (input.code) inputData.code = input.code;

    const prompt =
      "documentation|" + project_id + "\n" +
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

    // W-3 (PHASE-50 G-2): §8 citation audit on document completion. Runs only when
    // the caller supplies artifact_path (the draft/persisted doc file); absent →
    // prior behavior byte-unchanged. FAIL_UNCITED blocks completion unless the
    // owner's decision-artifact-gated citation_audit_override is set (§7.3 res. 3).
    // Audit infrastructure failure is fail-closed even under override.
    const completionMeta = { role: this.id, model, provider };
    if (input.artifact_path) {
      const override = input.citation_audit_override === true;
      let auditEnv;
      try {
        const reg = require("../../tools/_registry").getDefaultRegistry();
        auditEnv = await reg.invoke("kb.validate_citations",
          { artifact_path: input.artifact_path, project_id }, { root });
      } catch (err) {
        return roleFailed("CITATION_AUDIT_FAILED", err.message, ctx);
      }
      if (!auditEnv || auditEnv.status !== "SUCCESS") {
        const auditDetail = (auditEnv && auditEnv.metadata &&
                             (auditEnv.metadata.detail || auditEnv.metadata.reason)) ||
                            "kb.validate_citations returned non-SUCCESS envelope";
        return roleFailed("CITATION_AUDIT_FAILED", auditDetail, ctx);
      }
      const audit = auditEnv.output;
      completionMeta.citation_audit = audit;
      if (audit.status === "FAIL_UNCITED") {
        try {
          emitActivity({ invocation_id, project_id, role: this.id,
            state: "AUDIT_FAIL_UNCITED_CLAIM",
            indicator: getIndicator(this.id, "AUDIT_FAIL_UNCITED_CLAIM") }, { root });
        } catch (_e) { /* best-effort */ }
        if (!override) {
          return roleBlocked("UNCITED_CLAIMS", audit.uncited_claims || [], ctx);
        }
        completionMeta.citation_audit_override = true;
      }
    }

    return roleOk(parsed, completionMeta);
  }
});

"use strict";

// L-KB-5 Research Role — orchestrates KB retrieval + LLM synthesis → ResearchFindings.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §6 (ResearchQuery + ResearchFindings)
// @see docs/10_runtime/18_AGENT_ROLES_CONTRACT.md §Role Lifecycle
//
// Track A: retrieval via reg.invoke("kb.retrieve"), synthesis via reg.invoke("agent.invoke").
// KNOWN-gate (§6.3): any KNOWN finding with empty supporting_citations is downgraded to ESTIMATED.

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");
const { findId }                         = require("../../kb/_id_minting");

const SYSTEM_PROMPT   = loadPrompt("research_v1");
const SCHEMA_VERSION  = "1.0.0";
const MAX_K_PER_SEARCH = 5;

// ── Input / Output Schemas ────────────────────────────────────────────────────

const INPUT_SCHEMA = {
  type: "object",
  required: ["schema_version", "project_id", "question"],
  properties: {
    schema_version:      { type: "string" },
    project_id:          { type: "string", minLength: 1 },
    question:            { type: "string", minLength: 5 },
    scope:               { type: "string" },
    max_searches:        { type: "number" },
    credibility_floor:   { type: "string" },
    language_preference: { type: "string" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: [
    "schema_version", "question", "findings", "scenarios",
    "recommendation", "knowledge_gaps", "confidence_level", "metadata"
  ],
  properties: {
    schema_version:   { type: "string" },
    question:         { type: "string" },
    findings:         { type: "array" },
    scenarios:        { type: "array" },
    recommendation: {
      type: "object",
      required: ["conclusion", "reasoning", "alternatives"],
      properties: {
        conclusion:   { type: "string" },
        reasoning:    { type: "string" },
        alternatives: { type: "array" }
      }
    },
    knowledge_gaps:   { type: "array", items: { type: "string" } },
    confidence_level: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    metadata: {
      type: "object",
      required: [
        "searches_performed", "sources_consulted",
        "sources_rejected_low_credibility", "total_cost_usd"
      ],
      properties: {
        searches_performed:               { type: "integer" },
        sources_consulted:                { type: "integer" },
        sources_rejected_low_credibility: { type: "integer" },
        total_cost_usd:                   { type: "number" }
      }
    }
  }
};

// ── Role Definition ───────────────────────────────────────────────────────────

module.exports = defineRole({
  id:               "research",
  label:            "Research",
  description:      "Retrieves KB chunks and synthesizes structured ResearchFindings with KNOWN-gate enforcement",
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",
  system_prompt_id: "research_v1",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.05,
  typical_cost_usd_max: 0.30,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    const provider      = (ctx && ctx.provider)      || this.default_provider;
    const model         = (ctx && ctx.model)         || this.default_model;
    const project_id    = input.project_id;
    const invocation_id = (ctx && ctx.invocation_id) || null;
    const root          = (ctx && ctx.root)          || process.cwd();
    const scope         = input.scope || "project";
    const credFloor     = input.credibility_floor || "REPUTABLE";
    const maxSearches   = Math.max(1, Math.min(input.max_searches || 3, 10));

    // Budget check before any API calls (§6.3 prerequisite)
    try {
      require("../../kb/budget_guard").enforceBudget(project_id, { root });
    } catch (budgetErr) {
      return roleFailed("BUDGET_EXCEEDED", budgetErr.message, ctx);
    }

    // Retrieve chunks via kb.retrieve (Track A: through registry)
    const reg = require("../../tools/_registry").getDefaultRegistry();
    let retrieveEnv;
    try {
      retrieveEnv = await reg.invoke("kb.retrieve", {
        query:             input.question,
        project_id,
        k:                 maxSearches * MAX_K_PER_SEARCH,
        credibility_floor: credFloor,
        scope
      }, { root });
    } catch (err) {
      return roleFailed("RETRIEVE_ERROR", err.message, ctx);
    }

    const chunks = (retrieveEnv && retrieveEnv.status === "SUCCESS" &&
                    retrieveEnv.output && retrieveEnv.output.results) || [];

    const rejectedLow = (retrieveEnv && retrieveEnv.metadata &&
                         retrieveEnv.metadata.rejected_low_credibility) || 0;

    // Build evidence block for LLM
    const evidenceLines = chunks.map((c, i) => (
      "[Chunk " + (i + 1) + "] chunk_id=" + c.chunk_id +
      " source_id=" + c.source_id +
      " credibility=" + (c.credibility_tier || "UNKNOWN") +
      " relevance=" + (c.relevance_score != null ? c.relevance_score.toFixed(3) : "?") +
      "\n" + (c.text || "")
    )).join("\n\n");

    const evidenceBlock = chunks.length > 0
      ? "EVIDENCE CHUNKS (" + chunks.length + " retrieved):\n\n" + evidenceLines
      : "EVIDENCE CHUNKS: none — KB is empty or no relevant results for this project.";

    const scenarioTag = (ctx && ctx.scenario_id)
      ? "\nSCENARIO_TAG: " + ctx.scenario_id + "\n"
      : "";

    const prompt =
      "research|" + project_id + "\n" +
      scenarioTag +
      SYSTEM_PROMPT +
      "\n\nQUESTION:\n" + input.question +
      "\n\n" + evidenceBlock +
      "\n\nRESPOND WITH VALID JSON ONLY.";

    // LLM synthesis call (Track A: through registry)
    let agentResult;
    try {
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

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "PARSING_OUTPUT", indicator: getIndicator(this.id, "PARSING_OUTPUT") }, { root });
    } catch (_e) { /* best-effort */ }

    let parsed;
    try {
      parsed = JSON.parse(agentResult.output.text);
    } catch (e) {
      return roleFailed("INVALID_ROLE_OUTPUT", "JSON parse failed: " + e.message, ctx);
    }

    // Ensure schema_version
    if (!parsed.schema_version) parsed.schema_version = SCHEMA_VERSION;

    // Override metadata with server-computed values (LLM counts are unreliable)
    parsed.metadata = Object.assign(parsed.metadata || {}, {
      searches_performed:               maxSearches,
      sources_consulted:                chunks.length,
      sources_rejected_low_credibility: rejectedLow,
      total_cost_usd:                   typeof (parsed.metadata && parsed.metadata.total_cost_usd) === "number"
        ? parsed.metadata.total_cost_usd
        : 0
    });

    // KNOWN-gate (§6.3): downgrade KNOWN findings with empty supporting_citations to ESTIMATED
    if (Array.isArray(parsed.findings)) {
      for (const finding of parsed.findings) {
        if (finding.certainty === "KNOWN") {
          const cits = finding.supporting_citations;
          if (!Array.isArray(cits) || cits.length === 0) {
            finding.certainty = "ESTIMATED";
          }
        }
        // Ensure UNCERTAIN findings surface as knowledge gaps
        if (finding.certainty === "UNCERTAIN") {
          if (!Array.isArray(parsed.knowledge_gaps)) parsed.knowledge_gaps = [];
          if (!parsed.knowledge_gaps.includes(finding.claim)) {
            parsed.knowledge_gaps.push(finding.claim);
          }
        }
        // Regenerate finding IDs deterministically (LLM-generated IDs may not be 12hex)
        if (finding.claim && finding.certainty) {
          finding.id = findId(finding.claim, finding.certainty);
        }
      }
    }

    const ov = validate(parsed, OUTPUT_SCHEMA);
    if (!ov.valid) return roleFailed("INVALID_ROLE_OUTPUT", ov.errors.join("; "), ctx);

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "VALIDATING_SCHEMA", indicator: getIndicator(this.id, "VALIDATING_SCHEMA") }, { root });
    } catch (_e) { /* best-effort */ }

    return roleOk(parsed, { role: this.id, model, provider });
  }
});

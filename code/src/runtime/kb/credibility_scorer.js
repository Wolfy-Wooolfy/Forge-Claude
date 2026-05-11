"use strict";

// L-KB-2 Credibility Scorer — heuristic_v1 + optional llm_v1 refinement.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §12 (Credibility Tier Definitions)

const {
  CREDIBILITY_TIERS,
  AUTHORITATIVE_DOMAIN_PATTERNS,
  LOW_QUALITY_PATTERNS
} = require("./_constants");
const { appendEntry } = require("./cost_ledger");
const { callChatWithTool, getClient } = require("../../providers/_contract/openAiAdapter");

// LLM credibility scoring costs ~$0.000020 per source at gpt-4o-mini pricing
const COST_PER_CRED_CALL = 0.000020;

// ── Heuristic signals ─────────────────────────────────────────────────────────

function _extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

function _heuristicSignals(url) {
  const signals = [];
  const domain  = _extractDomain(url);

  if (!domain) return { signals: ["no_url"], score: 0.20, tier: "LOW" };

  // HTTPS check
  if (url && url.startsWith("https://")) signals.push("https");
  else signals.push("no_https");

  // Authoritative domain check
  for (const pattern of AUTHORITATIVE_DOMAIN_PATTERNS) {
    if (pattern.test(domain)) {
      signals.push("official_docs_domain");
      break;
    }
  }

  // RFC / IETF
  if (domain.includes("ietf.org") || domain.includes("rfc-editor.org")) {
    signals.push("rfc_or_ietf");
  }

  // Low-quality pattern check (applied to full URL string)
  for (const pattern of LOW_QUALITY_PATTERNS) {
    if (pattern.test(url)) {
      signals.push("low_quality_pattern");
      break;
    }
  }

  // Stack Overflow
  if (domain === "stackoverflow.com") signals.push("community_qa");

  // Compute heuristic score
  let score = 0.40; // neutral baseline
  if (signals.includes("official_docs_domain")) score = 0.88;
  else if (signals.includes("rfc_or_ietf"))     score = 0.92;
  else if (signals.includes("community_qa"))     score = 0.55;
  else if (signals.includes("https") && !signals.includes("low_quality_pattern")) score = 0.55;

  if (signals.includes("low_quality_pattern")) score = Math.min(score, 0.20);
  if (signals.includes("no_https"))            score = Math.min(score, 0.35);

  const tier = _scoreToTier(score);
  return { signals, score, tier };
}

function _scoreToTier(score) {
  if (score >= CREDIBILITY_TIERS.AUTHORITATIVE.min) return "AUTHORITATIVE";
  if (score >= CREDIBILITY_TIERS.REPUTABLE.min)     return "REPUTABLE";
  if (score >= CREDIBILITY_TIERS.COMMUNITY.min)     return "COMMUNITY";
  return "LOW";
}

// ── LLM credibility refinement (llm_v1) ──────────────────────────────────────

const LLM_CRED_TOOL = {
  name: "credibility_judgment",
  description: "Evaluate the credibility of a web source",
  parameters: {
    type: "object",
    required: ["score", "tier", "reasoning"],
    properties: {
      score:     { type: "number", minimum: 0, maximum: 1 },
      tier:      { type: "string", enum: ["AUTHORITATIVE", "REPUTABLE", "COMMUNITY", "LOW"] },
      reasoning: { type: "string" }
    }
  }
};

async function _llmRefine(url, title, heuristic, options) {
  const opts   = options || {};
  // Allow test injection of a mock callChat function
  const callFn = opts._callChat || callChatWithTool;

  const system = "You are a credibility evaluator. Given a URL and page title, evaluate source quality.";
  const userMsg = `URL: ${url || "(none)"}\nTitle: ${title || "(none)"}\nHeuristic score: ${heuristic.score.toFixed(2)} (${heuristic.tier})\n\nReturn a credibility judgment.`;

  const result = await callFn({
    provider_id:      "credibility_scorer",
    system,
    messages:         [{ role: "user", content: userMsg }],
    tool_definition:  LLM_CRED_TOOL,
    temperature:      0,
    timeout_ms:       15000,
    model:            opts.model || "gpt-4o-mini"
  });

  return {
    score: result.arguments.score,
    tier:  result.arguments.tier,
    reasoning: result.arguments.reasoning
  };
}

// ── scoreSource (public) ──────────────────────────────────────────────────────

// Returns: { score, tier, signals, scored_by, scored_at }
// Options:
//   use_llm    — boolean, default false (set true to enable llm_v1 pass)
//   project_id — for cost ledger
//   root       — project root
//   _callChat  — inject mock for testing

async function scoreSource(sourceRecord, options) {
  const opts = options || {};
  const url   = sourceRecord.url;
  const title = sourceRecord.title || "";

  const heuristic = _heuristicSignals(url);
  let   scoredBy  = "heuristic_v1";
  let   finalScore = heuristic.score;
  let   finalTier  = heuristic.tier;
  const signals    = heuristic.signals.slice();

  if (opts.use_llm) {
    try {
      const llm  = await _llmRefine(url, title, heuristic, opts);
      // Weighted blend: heuristic 40% + LLM 60%
      finalScore = heuristic.score * 0.4 + llm.score * 0.6;
      finalTier  = _scoreToTier(finalScore);
      scoredBy   = "heuristic_v1+llm_v1";
      signals.push("llm_judged");
      if (llm.reasoning) signals.push("llm_reasoning:" + llm.reasoning.slice(0, 60).replace(/\s+/g, "_"));

      // Record cost
      if (opts.project_id) {
        appendEntry({
          project_id: opts.project_id,
          operation:  "credibility_scoring",
          cost_usd:   COST_PER_CRED_CALL,
          model:      opts.model || "gpt-4o-mini",
          tool:       "kb.ingest_url",
          tokens_in:  200,
          tokens_out: 30
        }, { root: opts.root });
      }
    } catch (err) {
      // LLM failure degrades gracefully to heuristic-only
      signals.push("llm_failed:" + (err.message || "unknown").slice(0, 40));
      scoredBy = "heuristic_v1+llm_failed";
    }
  }

  return {
    score:     parseFloat(finalScore.toFixed(4)),
    tier:      finalTier,
    signals,
    scored_by: scoredBy,
    scored_at: new Date().toISOString()
  };
}

module.exports = { scoreSource, _scoreToTier, _heuristicSignals };

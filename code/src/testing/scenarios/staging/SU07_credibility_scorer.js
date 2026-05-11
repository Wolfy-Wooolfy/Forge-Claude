"use strict";

// SU07 — credibility_scorer.js unit test

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { scoreSource, _heuristicSignals, _scoreToTier } = require("../../../runtime/kb/credibility_scorer");
const { readAll } = require("../../../runtime/kb/cost_ledger");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su07_" + Date.now());
const PID      = "test_proj_su07";

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail ? ("| " + detail) : ""); failed++; }
}

function makeSrc(url, title) {
  return { id: "src_aabbccddeeff", url, title: title || null };
}

// Mock callChat function for llm_v1 tests
function mockCallChat(llmScore, llmTier) {
  return async ({ tool_definition }) => {
    return {
      arguments: { score: llmScore, tier: llmTier, reasoning: "Test LLM judgment." }
    };
  };
}

async function run() {
  console.log("SU07 — credibility_scorer");

  // ── Heuristic scoring ───────────────────────────────────────────────────────

  const h1 = _heuristicSignals("https://docs.python.org/3/tutorial/");
  assert("AUTHORITATIVE: official_docs_domain signal", h1.signals.includes("official_docs_domain"));
  assert("AUTHORITATIVE: https signal", h1.signals.includes("https"));
  assert("AUTHORITATIVE: tier = AUTHORITATIVE", h1.tier === "AUTHORITATIVE", h1.tier);
  assert("AUTHORITATIVE: score >= 0.80", h1.score >= 0.80, h1.score);

  const h2 = _heuristicSignals("https://stackoverflow.com/questions/123");
  assert("REPUTABLE: community_qa signal", h2.signals.includes("community_qa"));
  assert("REPUTABLE: tier = REPUTABLE", h2.tier === "REPUTABLE", h2.tier);

  const h3 = _heuristicSignals("http://spamsite999.biz/random-seo-page");
  assert("LOW: no_https signal", h3.signals.includes("no_https"));
  assert("LOW: tier = LOW or COMMUNITY", ["LOW", "COMMUNITY"].includes(h3.tier), h3.tier);
  assert("LOW: score <= 0.35", h3.score <= 0.35, h3.score);

  const h4 = _heuristicSignals(null);
  assert("null url: tier = LOW", h4.tier === "LOW");

  // ── scoreSource heuristic-only ──────────────────────────────────────────────

  const r1 = await scoreSource(makeSrc("https://developer.mozilla.org/en-US/docs/Web/API"), { use_llm: false });
  assert("scoreSource returns score number", typeof r1.score === "number");
  assert("scoreSource returns tier string", typeof r1.tier === "string");
  assert("scoreSource returns signals array", Array.isArray(r1.signals));
  assert("scoreSource scored_by = heuristic_v1", r1.scored_by === "heuristic_v1", r1.scored_by);
  assert("scoreSource scored_at is ISO string", /^\d{4}-\d{2}-\d{2}T/.test(r1.scored_at));
  assert("MDN is AUTHORITATIVE", r1.tier === "AUTHORITATIVE", r1.tier);

  // ── scoreSource with llm_v1 ──────────────────────────────────────────────────

  const PID2 = "test_proj_su07_llm";
  const r2   = await scoreSource(
    makeSrc("https://someblog.example.com/post/123", "JWT Best Practices"),
    {
      use_llm:    true,
      project_id: PID2,
      root:       TMP_ROOT,
      _callChat:  mockCallChat(0.75, "REPUTABLE"),
      model:      "gpt-4o-mini"
    }
  );
  assert("llm_v1: scored_by = heuristic_v1+llm_v1", r2.scored_by === "heuristic_v1+llm_v1", r2.scored_by);
  assert("llm_v1: llm_judged signal present", r2.signals.includes("llm_judged"));
  assert("llm_v1: blended score in 0–1", r2.score >= 0 && r2.score <= 1, r2.score);

  // Cost ledger entry from llm_v1 call
  const ledger = readAll(PID2, { root: TMP_ROOT });
  assert("llm_v1: cost ledger has 1 entry", ledger.length === 1, ledger.length);
  assert("llm_v1: ledger operation = credibility_scoring", ledger[0].operation === "credibility_scoring");

  // ── LLM failure degrades gracefully ─────────────────────────────────────────

  const failingChat = async () => { throw new Error("LLM timeout"); };
  const r3 = await scoreSource(
    makeSrc("https://example.com/"),
    { use_llm: true, _callChat: failingChat }
  );
  assert("LLM failure: still returns a result", r3 && typeof r3.score === "number");
  assert("LLM failure: scored_by = heuristic_v1+llm_failed", r3.scored_by === "heuristic_v1+llm_failed", r3.scored_by);
  assert("LLM failure: llm_failed signal present", r3.signals.some(s => s.startsWith("llm_failed:")));

  // ── _scoreToTier mapping ─────────────────────────────────────────────────────
  assert("_scoreToTier(0.95) = AUTHORITATIVE", _scoreToTier(0.95) === "AUTHORITATIVE");
  assert("_scoreToTier(0.65) = REPUTABLE",     _scoreToTier(0.65) === "REPUTABLE");
  assert("_scoreToTier(0.40) = COMMUNITY",     _scoreToTier(0.40) === "COMMUNITY");
  assert("_scoreToTier(0.10) = LOW",           _scoreToTier(0.10) === "LOW");

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU07:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU07 ERROR:", err.message);
  process.exit(1);
});

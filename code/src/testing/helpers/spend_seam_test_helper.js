"use strict";

// PHASE-55 W-1 — hermetic SU helper: legacy Stage-A spend visibility (S384).
// Mock-only, $0 — no network, no OPENAI_API_KEY dependency (fake client injected
// through the openAiAdapter test seam; O-3 approved — conversationEngine.js:413 /
// opts._client precedent).
//
// R-11(ii) success predicate — asserted against the CAP'S OWN NUMBER, not a row
// count: budget_enforcer.checkBudget(P) itself must cross a seeded vision-cap
// threshold because of the legacy row.
// R-21 bound: a legacy row appended BEFORE project P's first-activity ledger row
// must be EXCLUDED from checkBudget(P) — proven twice (pre-call allow; post-call
// reason is BUDGET_95_PCT_REQUIRES_APPROVAL, never BUDGET_EXCEEDED, which is what
// the pre-P 0.05 row would produce if it leaked in).
// R-22 marker: tokens_unavailable read BACK from the persisted JSONL, never from
// appendEntry's return value.
//
// Seeded arithmetic (all deterministic):
//   vision cap max_total_usd = 0.013
//   pre-P legacy row         = 0.05  (must be excluded by R-21)
//   fake usage 1000/1000 on gpt-4o → seam cost 0.0025 + 0.0100 = 0.0125
//   post-call projected = 0.0125 / 0.013 = 96.2% → BUDGET_95_PCT_REQUIRES_APPROVAL
//   (bound broken instead ⇒ 0.0625 / 0.013 ≥ 100% → BUDGET_EXCEEDED — distinguishable)

const { getDefaultRegistry } = require("../../runtime/tools/_registry");

const ROOT     = process.cwd();
const PID      = "test_s384_spend";
const SENTINEL = "_legacy_stage_a";

const VISION_MD = [
  "---",
  "project_id: " + PID,
  "project_name: Test Spend S384",
  "domain: test",
  "vision_version: 1",
  "vision_locked: true",
  "vision_locked_at: 2026-08-04T00:00:00.000Z",
  "locked_by_role: owner",
  "amendments_history: []",
  "goals:",
  "  primary: test",
  "  secondary: []",
  "constraints: []",
  "non_goals: []",
  "max_total_usd: 0.013",
  "max_per_iteration_usd: 0.01",
  "---",
  "",
  "# Project Vision: Test Spend S384",
  ""
].join("\n");

// Fake OpenAI client — chat-only. Non-stream: a valid expand_idea tool call with
// usage 1000/1000. Stream: resolves to an opaque stream stand-in (the seam books
// tokens_unavailable, per R-14 — it must not introspect the stream).
function _fakeClient() {
  return {
    chat: {
      completions: {
        create: async function (params) {
          if (params && params.stream === true) {
            return { __fake_stream_s384: true };
          }
          return {
            model: (params && params.model) || "gpt-4o",
            usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
            choices: [{
              message: {
                tool_calls: [{
                  function: {
                    name: "expand_idea",
                    arguments: JSON.stringify({
                      expanded_summary: "S384 spend visibility test expansion",
                      missing_components: [],
                      suggested_directions: [],
                      improvement_proposals: [],
                      readiness_assessment: { ready_for_options: false, blocking_gaps: [] },
                      follow_up_question: "",
                      suggested_answers: [],
                      detected_domain: "general",
                      pivot_detected: false,
                      domain_confidence: 1,
                      name_goal_mismatch: false
                    })
                  }
                }]
              }
            }]
          };
        }
      }
    }
  };
}

// Two appendEntry calls in the same millisecond would share a ts and defeat the
// strict before/after ordering the R-21 assertion depends on (readEntries.since
// is inclusive: ts >= since). Wait until the clock advances.
async function _nextMs() {
  const t = Date.now();
  while (Date.now() <= t) {
    await new Promise(function (r) { setTimeout(r, 2); });
  }
}

async function runS384LegacySpendVisibility() {
  const out    = {};
  const reg    = getDefaultRegistry();
  const ledger = require("../../runtime/agents/cost_ledger");
  const { checkBudget } = require("../../runtime/agents/budget_enforcer");
  const adapter = require("../../providers/_contract/openAiAdapter");

  // ── 0. Fixtures: locked vision with a tiny cap (L2 write) ──────────────────
  const visionWrite = await reg.invoke("fs.write_file", {
    path: "artifacts/projects/" + PID + "/vision.md",
    content: VISION_MD
  }, { root: ROOT });
  out.fixture_vision_written = !!(visionWrite && visionWrite.status === "SUCCESS");

  // ── 1. Ledger seeding: legacy row BEFORE P exists, then P's first activity ─
  ledger.appendEntry({
    project_id: SENTINEL, provider: "openai", model: "gpt-4o",
    cost_usd_estimated: 0.05, cost_usd_actual: 0.05, outcome: "success"
  }, { root: ROOT });
  await _nextMs();
  ledger.appendEntry({
    project_id: PID, provider: "mock", model: "mock",
    cost_usd_estimated: 0, cost_usd_actual: 0, outcome: "success"
  }, { root: ROOT });
  await _nextMs();

  // ── 2. (c) R-21 bound, pre-call: the pre-P 0.05 legacy row is EXCLUDED ─────
  const pre = checkBudget(PID, 0, { root: ROOT });
  out.c_r21_pre_p_legacy_excluded = !!(pre && pre.allow === true && !pre.warn);

  const sentinelBefore = ledger.getTotalCost(SENTINEL, { root: ROOT });

  // ── 3. The legacy Stage-A call — REAL provider chain, fake transport ───────
  out.seam_injection_available = typeof adapter._setClientForTests === "function";
  if (out.seam_injection_available) {
    adapter._setClientForTests(_fakeClient());
  }

  const IdeationExpansionProvider = require("../../providers/ideationExpansionProvider");
  const prov = new IdeationExpansionProvider({ apiKey: "test-key-s384", model: "gpt-4o" });
  let provResult = null;
  try {
    provResult = await prov.executeTask({
      context: {
        user_goal: "S384 spend-visibility test goal",
        refinement_input: "S384 refinement turn",
        requirement_model: {}
      }
    });
  } catch (_e) { provResult = null; }
  out.legacy_call_completed = !!(provResult && provResult.status === "SUCCESS");

  // ── 4. (a) the sentinel total moved by the row's cost_usd_actual ───────────
  const sentinelAfter = ledger.getTotalCost(SENTINEL, { root: ROOT });
  const delta = Math.round((sentinelAfter - sentinelBefore) * 100000) / 100000;
  out.a_sentinel_total_increased  = delta > 0;
  out.a_delta_equals_row_actual   = delta === 0.0125;

  // ── 5. (b) the cap's own number moved: threshold crossed BECAUSE of the row ─
  const post = checkBudget(PID, 0, { root: ROOT });
  out.b_cap_denied_after_call = !!(post && post.allow === false);
  out.b_cap_reason_is_95pct   = !!(post && post.reason === "BUDGET_95_PCT_REQUIRES_APPROVAL");

  // ── 6. (d) streaming marker — read BACK from the persisted JSONL (R-22) ────
  let streamOk = false;
  try {
    const client = adapter.getClient();
    const streamResult = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "S384 stream leg" }],
      stream: true
    });
    streamOk = !!(streamResult && streamResult.__fake_stream_s384 === true);
  } catch (_e) { streamOk = false; }
  out.d_stream_call_completed = streamOk;

  let lastRow = null;
  try {
    const read = await reg.invoke("fs.read_file", {
      path: "artifacts/agent/cost_ledger.jsonl"
    }, { root: ROOT });
    if (read && read.status === "SUCCESS" && read.output && read.output.content) {
      const lines = String(read.output.content).split("\n")
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l.length > 0; });
      lastRow = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    }
  } catch (_e) { lastRow = null; }

  out.d_stream_row_persisted = !!(lastRow && lastRow.project_id === SENTINEL &&
    lastRow.tokens_in === 0 && lastRow.tokens_out === 0 &&
    lastRow.cost_usd_actual === 0);
  out.d_marker_read_back_from_disk = !!(lastRow && lastRow.tokens_unavailable === true);

  if (typeof adapter._resetClientForTests === "function") {
    adapter._resetClientForTests();
  }

  return out;
}

module.exports = { runS384LegacySpendVisibility };

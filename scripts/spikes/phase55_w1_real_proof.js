"use strict";

// PHASE-55 W-1 REAL PROOF driver (owner-approved 2026-08-04: ~$0.002, HARD
// envelope $0.02). Usage:
//   node scripts/spikes/phase55_w1_real_proof.js --dry    ($0 — injected fake client)
//   node scripts/spikes/phase55_w1_real_proof.js          (ONE real gpt-4o-mini call)
//
// Proves ON THE REAL OBJECT what S384 proved on the injected one: the metering
// wrapper is attached to the client `getClient()` actually constructs, a legacy
// Stage-A style call (callChatWithTool — the exact class-1 entry all three
// callChatWithTool providers use) books a `_legacy_stage_a` sentinel row with a
// non-zero cost, and the cap's own number moves for (i) a scratch project with
// first-activity and (ii) one pre-existing project (the declared R-11(ii)/R-21
// over-count, expected behavior).
//
// Spike-only (scripts/spikes precedent, PHASE-51..54); code/src untouched.

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
process.chdir(ROOT); // the seam books via process.cwd()

const DRY          = process.argv.includes("--dry");
const ENVELOPE_USD = 0.02;
const SCRATCH_PID  = "phase55_w1_proof";
const PREEXISTING  = "phase54_gate10_demo";
const SENTINEL     = "_legacy_stage_a";
const EV_DIR       = path.join(ROOT, "artifacts", "spikes", "phase55_w1_proof");
fs.mkdirSync(EV_DIR, { recursive: true });

const { loadDotEnv } = require(path.join(ROOT, "code", "src", "startup", "env_loader"));
loadDotEnv(ROOT);

const ledger  = require(path.join(ROOT, "code", "src", "runtime", "agents", "cost_ledger"));
const adapter = require(path.join(ROOT, "code", "src", "providers", "_contract", "openAiAdapter"));

// Driver-local mirror of budget_enforcer's cap arithmetic (read-only; the
// function itself is not exported — this mirrors the R-21 predicate exactly).
function legacySinceFirstActivity(pid) {
  const own = ledger.readEntries({ project_id: pid }, { root: ROOT });
  if (own.length === 0) return 0;
  let firstTs = own[0].ts;
  for (const r of own) if (typeof r.ts === "string" && r.ts < firstTs) firstTs = r.ts;
  const rows = ledger.readEntries({ project_id: SENTINEL, since: firstTs }, { root: ROOT });
  let t = 0;
  for (const r of rows) t += (typeof r.cost_usd_actual === "number" ? r.cost_usd_actual : 0);
  return Math.round(t * 100000) / 100000;
}
function capTotal(pid) {
  return Math.round((ledger.getTotalCost(pid, { root: ROOT }) +
                     legacySinceFirstActivity(pid)) * 100000) / 100000;
}

function fakeClient() {
  return { chat: { completions: { create: async function () {
    return {
      model: "gpt-4o-mini-dry-fake",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      choices: [{ message: { tool_calls: [{ function: {
        name: "reply", arguments: JSON.stringify({ text: "ok" })
      } }] } }]
    };
  } } } };
}

(async () => {
  const mode = DRY ? "DRY" : "REAL";
  const out  = { mode, ts: new Date().toISOString() };

  // ── Pre-call state (captured BEFORE anything) ──────────────────────────────
  out.sentinel_total_before   = ledger.getTotalCost(SENTINEL, { root: ROOT });
  out.scratch_cap_before_seed = capTotal(SCRATCH_PID);
  out.preexisting_cap_before  = capTotal(PREEXISTING);

  // First-activity seed for the scratch project (cost 0, self-identifying) —
  // without it the R-21 bound correctly keeps legacy spend OFF a project that
  // has never had agent activity (that is R-25, not a bug). Idempotent.
  if (ledger.readEntries({ project_id: SCRATCH_PID }, { root: ROOT }).length === 0) {
    ledger.appendEntry({
      project_id: SCRATCH_PID, provider: "mock", model: "w1-proof-first-activity",
      cost_usd_estimated: 0, cost_usd_actual: 0, outcome: "success"
    }, { root: ROOT });
    out.first_activity_seeded = true;
  } else {
    out.first_activity_seeded = false;
  }
  out.scratch_cap_before_call = capTotal(SCRATCH_PID);

  // ── Estimate + hard envelope (abort BEFORE the call) ───────────────────────
  const SYSTEM = "You are a JSON echo. Reply ONLY via the function call.";
  const USER   = "Return exactly {\"text\":\"ok\"}.";
  const estIn  = Math.ceil((SYSTEM.length + USER.length + 200) / 4);
  const estOut = 50;
  const estUsd = (estIn / 1e6) * 0.15 + (estOut / 1e6) * 0.60;
  out.projected_cost_usd = estUsd;
  if (estUsd > ENVELOPE_USD) {
    out.aborted = "PROJECTED_OVER_ENVELOPE";
    fs.writeFileSync(path.join(EV_DIR, (DRY ? "dry" : "real") + "_result.json"),
      JSON.stringify(out, null, 2));
    console.error("ABORT: projected", estUsd, "> envelope", ENVELOPE_USD);
    process.exit(3);
  }

  if (DRY) {
    adapter._setClientForTests(fakeClient());
  } else {
    adapter._resetClientForTests(); // ensure the REAL client is constructed
    if (!process.env.OPENAI_API_KEY) {
      console.error("ABORT: OPENAI_API_KEY unresolved — no call made.");
      process.exit(4);
    }
  }

  // ── THE call — class-1 legacy entry (callChatWithTool → getClient()) ───────
  const rowsBefore = ledger.readEntries(null, { root: ROOT }).length;
  const t0 = Date.now();
  const res = await adapter.callChatWithTool({
    provider_id: "phase55_w1_proof",
    system: SYSTEM,
    messages: [{ role: "user", content: USER }],
    tool_definition: {
      name: "reply", description: "Return the reply text.",
      parameters: { type: "object", properties: { text: { type: "string" } },
                    required: ["text"] }
    },
    temperature: 0,
    model: "gpt-4o-mini"
  });
  out.latency_ms = Date.now() - t0;

  // (a) RAW usage, verbatim
  out.a_raw_usage = res.usage;
  out.model_returned = res.model;
  out.tool_arguments = res.arguments;

  // (c) INDEPENDENT recompute from published gpt-4o-mini pricing — computed
  // from (a) BEFORE the ledger row is read (code order enforces it).
  out.c_recomputed_usd =
    (res.usage.prompt_tokens / 1e6) * 0.15 +
    (res.usage.completion_tokens / 1e6) * 0.60;

  // Give the seam's observer microtask a beat, then read the row back from disk.
  await new Promise((r) => setTimeout(r, 250));
  const all = ledger.readEntries(null, { root: ROOT });
  out.rows_delta = all.length - rowsBefore;
  const last = all[all.length - 1];
  out.booked_row = last;
  // (b) what the ledger BOOKED
  out.b_booked_actual    = last ? last.cost_usd_actual    : null;
  out.b_booked_estimated = last ? last.cost_usd_estimated : null;
  // (d) divergence
  out.d_divergence_usd = (out.b_booked_actual != null)
    ? Math.abs(out.b_booked_actual - out.c_recomputed_usd) : null;

  // ── Cap movement, post-call ────────────────────────────────────────────────
  out.sentinel_total_after  = ledger.getTotalCost(SENTINEL, { root: ROOT });
  out.scratch_cap_after     = capTotal(SCRATCH_PID);
  out.preexisting_cap_after = capTotal(PREEXISTING);
  out.sentinel_moved_by     = Math.round((out.sentinel_total_after - out.sentinel_total_before) * 100000) / 100000;
  out.scratch_moved_by      = Math.round((out.scratch_cap_after - out.scratch_cap_before_call) * 100000) / 100000;
  out.preexisting_moved_by  = Math.round((out.preexisting_cap_after - out.preexisting_cap_before) * 100000) / 100000;

  // Post-call envelope check
  out.envelope_ok = (out.b_booked_actual || 0) <= ENVELOPE_USD;

  const file = path.join(EV_DIR, (DRY ? "dry" : "real") + "_result.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("evidence:", file);
  if (!out.envelope_ok) process.exit(5);
})().catch((e) => {
  console.error("DRIVER_ERROR:", e && e.message);
  process.exit(1);
});

"use strict";

// scripts/spikes/phase48_intake_real_run.js
// PHASE-48 — Existing Project Intake (#11) real-run confirmation + per-step forensic capture.
//
// Drives the REAL intake handler (intake_conversation_handler.processIntakeRequest) end-to-end
// over the smallest representative fixture (fixture_nextjs) and captures each step:
//   1. intake_zip      (effect: source/ populated)        — REAL tool
//   2. analyze_source  (SourceTreeAnalysis, READ-ONLY re-run)  — REAL tool
//   3. reverse_vision  (InferredVision + ledger row)       — REAL gpt-4o in real mode / mock S167 in dry mode
//   4. vision.lock     (vision.md frontmatter post-lock)   — REAL tool (offline, $0)
//   5. start_loop      (real loop_id + entered state)      — REAL tool (offline, $0) == pipeline entry
//
// CTO RULING 1: the ONLY stubbed component is the intent classifier (deterministic AFFIRM).
//   lock_vision AND start_loop MUST run for real; pipeline-entry evidence is a REAL loop_id from a
//   real start_loop, read back via orchestration.get_status. reverse_vision is the capability under test.
//
// Two modes (single env flag):
//   PHASE48_MODE=mock (default) — $0 real spend. reverse_vision = mock (scenario S167). Proves wiring.
//                                 (NB: the agent ledger still records a NOTIONAL cost computed from the
//                                  fabricated mock token counts — that is not real money; real spend = $0.)
//   PHASE48_MODE=real           — GATED: needs explicit owner spend-approval. Loads .env, provider=openai
//                                 model=gpt-4o for reverse_vision. Soft-stop $0.50, hard-kill $3.
//
// Track A: spike lives under scripts/** (outside Track A) and may use fs directly. The LIVE chain it
//   drives is unchanged. No live-surface edit.
//
// Usage:
//   node scripts/spikes/phase48_intake_real_run.js                      # dry/mock, $0
//   PHASE48_MODE=real node scripts/spikes/phase48_intake_real_run.js     # gated real (owner-approved)

const path = require("path");
const fs   = require("fs");

const ROOT    = path.resolve(__dirname, "../..");
const MODE    = (process.env.PHASE48_MODE || "mock").toLowerCase();
const IS_REAL = MODE === "real";

if (IS_REAL) {
  const { loadDotEnv } = require("../../code/src/startup/env_loader");
  loadDotEnv(ROOT);
}

// reverse_vision provider/model. Dry mode keys the mock by scenario S167 (model must be "mock-rv").
const PROVIDER    = IS_REAL ? "openai"  : "mock";
const MODEL       = IS_REAL ? "gpt-4o"  : "mock-rv";
const SCENARIO_ID = IS_REAL ? null      : "S167";

const SOFT_STOP_USD = 0.50;
const HARD_KILL_USD = 3.00;

const FIXTURE_REL = "artifacts/test_fixtures/intake/fixture_nextjs";
const PROJECT_ID  = "phase48_intake_nextjs_" + MODE;
const EVIDENCE_DIR = path.join(ROOT, "artifacts/spikes/phase48_intake_real");
const OUT_FILE     = IS_REAL ? "result.json" : "result.mock.json";

const { getDefaultRegistry } = require("../../code/src/runtime/tools/_registry");
const { processIntakeRequest } = require("../../code/src/ai_os/intake_conversation_handler");
const ledger = require("../../code/src/runtime/agents/cost_ledger");

const reg = getDefaultRegistry();

// ── helpers ────────────────────────────────────────────────────────────────

// CTO RULING 1: the sole stub. Deterministic AFFIRM; lock_vision + start_loop downstream run real.
const affirmClassifier = {
  executeTask: async function () {
    return { status: "SUCCESS", output: { intent: "AFFIRM", confidence: 1.0 } };
  }
};

function rvRows() {
  // reverse_vision rows in the agent ledger for THIS project (agent_tools writes provider=provider_id).
  try { return ledger.readEntries({ project_id: PROJECT_ID, provider: "reverse_vision" }, { root: ROOT }); }
  catch (_e) { return []; }
}

function round5(n) { return Math.round((n || 0) * 100000) / 100000; }

// Read the vision.md frontmatter block (driver-local; reads a structured file we wrote, not NL intent).
function readVisionFrontmatter(pid) {
  const p = path.join(ROOT, "artifacts", "projects", pid, "vision.md");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return fm;
}

function readIntakeState(pid) {
  const p = path.join(ROOT, "artifacts", "projects", pid, "intake_state.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_e) { return null; }
}

function listSource(pid) {
  const base = path.join(ROOT, "artifacts", "projects", pid, "source");
  const out = [];
  function walk(d, rel) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(full, r);
      else out.push(r);
    }
  }
  walk(base, "");
  return out;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PHASE-48 intake real-run — mode=" + MODE +
    " provider=" + PROVIDER + " model=" + MODEL + " project=" + PROJECT_ID + " ===\n");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const capture = {
    phase: "PHASE-48",
    mode: MODE,
    provider_reverse_vision: PROVIDER,
    model_reverse_vision: MODEL,
    scenario_id: SCENARIO_ID,
    fixture: FIXTURE_REL,
    project_id: PROJECT_ID,
    soft_stop_usd: SOFT_STOP_USD,
    hard_kill_usd: HARD_KILL_USD,
    stub_real_split: {
      stubbed: ["intent_classifier (deterministic AFFIRM)"].concat(
        IS_REAL ? [] : ["reverse_vision (mock scenario S167 — dry pass only; $0 real spend)"]),
      real: ["project.intake_zip", "project.analyze_source"].concat(
        IS_REAL ? ["reverse_vision (gpt-4o)"] : []).concat(["vision.lock_vision", "orchestration.start_loop"])
    },
    steps: {}
  };

  // Pre-clean the scratch project dir so intake_zip's TARGET_NOT_EMPTY guard does not fire on re-run.
  try {
    await reg.invoke("fs.delete_dir", { path: "artifacts/projects/" + PROJECT_ID }, { root: ROOT });
  } catch (_e) { /* best-effort — first run has nothing to delete */ }

  const rvBefore  = rvRows().length;
  const runStart  = Date.now();

  function costGuard(label) {
    const newRows = rvRows().slice(rvBefore);
    const delta = round5(newRows.reduce(function (s, e) {
      return s + (typeof e.cost_usd_actual === "number" ? e.cost_usd_actual : 0);
    }, 0));
    if (delta > HARD_KILL_USD) { console.error("HARD-KILL: $" + delta + " > $" + HARD_KILL_USD + " at " + label); process.exit(2); }
    if (IS_REAL && delta > SOFT_STOP_USD) { console.error("SOFT-STOP: $" + delta + " > $" + SOFT_STOP_USD + " at " + label); process.exit(3); }
    return delta;
  }

  try {
    // ── STEP 1+3 — intake start (intake_zip -> analyze_source -> reverse_vision -> write vision.md) ──
    console.log("STEP 1+3 — processIntakeRequest (intake_zip -> analyze_source -> reverse_vision)");
    const startOpts = Object.assign(
      { root: ROOT, registry: reg, provider: PROVIDER, model: MODEL, intent_classifier: affirmClassifier },
      SCENARIO_ID ? { scenario_id: SCENARIO_ID } : {}
    );
    const startRes = await processIntakeRequest(
      { directory_path: FIXTURE_REL, project_id: PROJECT_ID },
      startOpts
    );
    costGuard("intake_start");

    capture.steps.step1_3_intake_start = {
      ok: !!startRes.ok,
      stage: startRes.stage || null,
      reason: startRes.reason || null,
      message_excerpt: startRes.message ? String(startRes.message).slice(0, 240) : null
    };
    if (!startRes.ok) {
      console.error("  intake start FAILED: " + (startRes.reason || "?") + " — " + (startRes.message || ""));
    } else {
      console.log("  stage=" + startRes.stage);
    }

    // STEP 1 effect — source/ populated by intake_zip
    const srcFiles = listSource(PROJECT_ID);
    capture.steps.step1_intake_zip = {
      source_file_count: srcFiles.length,
      source_files: srcFiles.slice(0, 30)
    };
    console.log("  intake_zip effect: " + srcFiles.length + " files in source/");

    // STEP 2 — analyze_source (READ-ONLY re-run on the same source/ the chain analyzed; identical bar analyzed_at)
    const analyzeRes = await reg.invoke("project.analyze_source", { project_id: PROJECT_ID }, { root: ROOT });
    const st = (analyzeRes && analyzeRes.output) || {};
    capture.steps.step2_analyze_source = {
      status: analyzeRes ? analyzeRes.status : null,
      detected_languages: st.detected_languages || null,
      detected_framework: st.detected_framework || null,
      file_count: typeof st.file_count === "number" ? st.file_count : null,
      entry_points: st.entry_points || null,
      manifest_keys: st.manifest_files ? Object.keys(st.manifest_files) : null,
      ast_sample_count: Array.isArray(st.ast_samples) ? st.ast_samples.length : null,
      note: "READ-ONLY re-run; identical to the SourceTreeAnalysis the role received (analyzed_at re-stamped)"
    };
    console.log("  analyze_source: langs=" + JSON.stringify(st.detected_languages) +
      " framework=" + st.detected_framework + " files=" + st.file_count);

    // STEP 3 — reverse_vision output (parsed InferredVision from intake_state) + ledger row
    const state = readIntakeState(PROJECT_ID);
    const iv = state && state.inferred_vision ? state.inferred_vision : null;
    const REQ = ["project_name", "domain", "goals", "constraints", "non_goals", "detected_languages", "source_summary", "confidence"];
    const ivMissing = iv ? REQ.filter(function (k) { return !(k in iv); }) : REQ;
    const confOk = !!(iv && ["HIGH", "MEDIUM", "LOW"].indexOf(iv.confidence) >= 0);
    const newRows = rvRows().slice(rvBefore);
    const rvRow = newRows.length ? newRows[newRows.length - 1] : null;
    capture.steps.step3_reverse_vision = {
      provider: PROVIDER,
      model_returned: rvRow ? rvRow.model : null,
      parse_ok: !!(iv && ivMissing.length === 0 && confOk),
      missing_fields: ivMissing,
      inferred_vision: iv,
      ledger_row: rvRow ? {
        tokens_in: rvRow.tokens_in, tokens_out: rvRow.tokens_out,
        latency_ms: rvRow.latency_ms, cost_usd_actual: rvRow.cost_usd_actual, outcome: rvRow.outcome
      } : null,
      new_rv_ledger_rows: newRows.length,
      raw_forensic_trace_note: IS_REAL
        ? "real raw model response also persisted under artifacts/llm/responses/<task_id>.json (providerTrace File 3)"
        : "mock branch — no network; response from mock_responses.json key mock|mock-rv|scenario:S167"
    };
    if (iv) {
      console.log("  reverse_vision: name=" + iv.project_name + " domain=" + iv.domain +
        " confidence=" + iv.confidence + " (parse_ok=" + capture.steps.step3_reverse_vision.parse_ok + ")");
    } else {
      console.error("  reverse_vision: NO inferred_vision captured");
    }

    // ── STEP 4+5 — approval -> real lock_vision + real start_loop ─────────────
    console.log("STEP 4+5 — approval (AFFIRM stub) -> vision.lock_vision + orchestration.start_loop");
    const approveRes = await processIntakeRequest(
      { project_id: PROJECT_ID, message: "approve" },
      { root: ROOT, registry: reg, provider: PROVIDER, model: MODEL, intent_classifier: affirmClassifier }
    );
    costGuard("approval");

    capture.steps.step4_5_approval = {
      ok: !!approveRes.ok,
      stage: approveRes.stage || null,
      reason: approveRes.reason || null,
      loop_id: approveRes.loop_id || null
    };

    // STEP 4 — lock effect (vision.md frontmatter post-lock)
    const fm = readVisionFrontmatter(PROJECT_ID);
    capture.steps.step4_vision_lock = {
      vision_locked: fm ? fm.vision_locked : null,
      vision_locked_at: fm ? fm.vision_locked_at : null,
      locked_by_role: fm ? fm.locked_by_role : null
    };
    console.log("  vision_locked=" + (fm && fm.vision_locked) + " locked_by_role=" + (fm && fm.locked_by_role));

    // STEP 5 — pipeline entry: read the REAL loop state back (RULING 1 evidence)
    let statusOut = null;
    if (approveRes.loop_id) {
      const statusRes = await reg.invoke("orchestration.get_status",
        { project_id: PROJECT_ID, loop_id: approveRes.loop_id }, { root: ROOT });
      statusOut = (statusRes && statusRes.output) || null;
    }
    capture.steps.step5_pipeline_entry = {
      loop_id: approveRes.loop_id || null,
      current_state: statusOut ? statusOut.current_state : null,
      iteration_count: statusOut ? statusOut.iteration_count : null,
      started_at: statusOut ? statusOut.started_at : null
    };
    console.log("  pipeline entry: loop_id=" + (approveRes.loop_id || "?") +
      " current_state=" + (statusOut && statusOut.current_state));

    // ── gates ────────────────────────────────────────────────────────────────
    const costDelta = costGuard("final");
    const G = {
      intake_started: !!(startRes.ok && startRes.stage === "AWAIT_VISION_APPROVAL"),
      reverse_vision_valid: !!(iv && ivMissing.length === 0 && confOk),
      single_reverse_vision_call: newRows.length === 1,
      vision_locked: !!(fm && fm.vision_locked === "true" && fm.locked_by_role === "intake_owner"),
      pipeline_entry: !!(approveRes.ok && approveRes.stage === "APPROVED" &&
        approveRes.loop_id && statusOut && typeof statusOut.current_state === "string" &&
        statusOut.current_state.length > 0)
    };
    const ALL = Object.keys(G).every(function (k) { return G[k]; });

    capture.gates = G;
    capture.all_pass = ALL;
    capture.reverse_vision_cost_usd = costDelta;
    capture.reverse_vision_cost_kind = IS_REAL ? "REAL_SPEND" : "NOTIONAL_MOCK_TOKENS (no real spend)";
    capture.duration_ms = Date.now() - runStart;

    fs.writeFileSync(path.join(EVIDENCE_DIR, OUT_FILE), JSON.stringify(capture, null, 2), "utf8");

    console.log("\n=== RESULT (mode=" + MODE + ") ===");
    Object.keys(G).forEach(function (k) { console.log("  [" + (G[k] ? "PASS" : "FAIL") + "] " + k); });
    console.log("  reverse_vision cost: $" + costDelta.toFixed(5) + " (" + capture.reverse_vision_cost_kind + ")");
    console.log("  evidence: artifacts/spikes/phase48_intake_real/" + OUT_FILE);
    console.log("  ALL_PASS=" + ALL);

    process.exit(ALL ? 0 : 1);
  } catch (err) {
    console.error("\nERROR:", (err && err.stack) || err);
    try {
      capture.fatal_error = String((err && err.message) || err);
      fs.writeFileSync(path.join(EVIDENCE_DIR, OUT_FILE), JSON.stringify(capture, null, 2), "utf8");
    } catch (_e) { /* best-effort */ }
    process.exit(2);
  }
}

main();

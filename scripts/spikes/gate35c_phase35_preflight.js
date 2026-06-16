"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP C-3a — PRE-FLIGHT — ONE real gpt-5.4 reviewer_v4 call
// ════════════════════════════════════════════════════════════════════════════
// Goal: before the ~$1.0-1.5 C-3b matrix, confirm the 8000 completion-token
// budget survives a REAL review-sized prompt + internal reasoning on gpt-5.4.
//
// Builds the reviewer_v4 input EXACTLY as gate35b_phase35_rerun.js builds a
// reviewer call (fixture spec + design + code-from-manifest+disk, phase "B"),
// and assembles the reviewer prompt byte-for-byte as reviewer_role.run() does
// (loadPrompt("reviewer_v4") + the same INPUT envelope). The only difference
// from the role path is that we invoke "agent.invoke" directly so we can read
// the ADAPTER ENVELOPE (role.invoke discards finish_reason) — this is the
// signal the pre-flight needs.
//
// Adapter dialect: model=gpt-5.4 → openai_adapter isGpt5 branch (added in C-2)
//   → sends max_completion_tokens + reasoning_effort, no temperature. We pass
//   reasoning_effort="medium" and max_completion_tokens=8000 explicitly (these
//   also are the adapter defaults; passing them pins the budget being tested).
//
// COST: ~$0.05 (one call). HARD CEILING $0.20 — reported, not pre-empted (single
//   call; an 8000-out gpt-5.4 call maxes ~$0.13). STOP — NO matrix, NO decision
//   artifact, NO status.json, NO commit. Writes _preflight.json only. Track A.
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");

// ── ENV (mandatory first step — loader does NOT auto-run) ─────────────────────
const { loadDotEnv } = require(path.join(ROOT, "code", "src", "startup", "env_loader"));
loadDotEnv(ROOT);
if (!process.env.OPENAI_API_KEY) {
  console.error("\n⛔  STOP: OPENAI_API_KEY not present after loadDotEnv — cannot make a real call.");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const PROVIDER          = "openai";
const MODEL             = "gpt-5.4";
const REASONING_EFFORT  = "medium";
const MAX_COMP_TOKENS   = 8000;
const COST_CEILING_USD  = 0.20;

// agent_budget_rule requires a vision-locked project for non-mock agent.invoke.
// Fixture content rides in the role INPUT; project_id only gates vision/budget
// and tags the ledger. Reuse phase28_gate10 (locked) — gate35b does the same.
const VISION_PROJECT = "phase28_gate10";

const EVID    = path.join(ROOT, "artifacts", "spikes", "gate35c_phase35");
const FIXDIR  = path.join(ROOT, "artifacts", "spikes", "phase35_fixtures", "DF-4_clean");
const LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));
const { loadPrompt }         = require(path.join(ROOT, "code", "src", "runtime", "agents", "_prompt_loader"));

// ── Helpers ─────────────────────────────────────────────────────────────────
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, "utf8").split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Assemble { spec, design, code } EXACTLY as reviewProject()/gate35b does.
function loadFixtureInputs() {
  const spec     = readJson(path.join(FIXDIR, "spec.json"));
  const design   = readJson(path.join(FIXDIR, "design.json"));
  const manifest = readJson(path.join(FIXDIR, "manifest.json"));
  const manifestPaths = (manifest.files || []).map(f => f && f.path).filter(Boolean);
  const filesWritten = manifestPaths.map(mp => ({
    path: mp, content: fs.readFileSync(path.join(FIXDIR, mp), "utf8")
  }));
  const code = {
    files_written:      filesWritten,
    summary:            "Build under review: " + filesWritten.length +
                        " file(s) from build_manifest.json (built_at " +
                        ((manifest && manifest.built_at) || "unknown") + ").",
    dependencies_added: []
  };
  return { spec, design, code, manifestPaths };
}

// Reproduce reviewer_role.run()'s prompt assembly byte-for-byte (phase "B",
// no scenario_id → no scenarioTag). loadPrompt("reviewer_v4") is the SAME
// system prompt the registered reviewer role uses.
function buildReviewerPrompt(project_id, inputData) {
  const SYSTEM_PROMPT = loadPrompt("reviewer_v4");
  return "reviewer|" + project_id + "\n" +
    SYSTEM_PROMPT +
    "\n\nINPUT:\n" + JSON.stringify(inputData) +
    "\n\nRESPOND WITH VALID JSON ONLY.";
}

async function main() {
  fs.mkdirSync(EVID, { recursive: true });
  console.log("\n══ PHASE-35 STEP C-3a — PRE-FLIGHT — reviewer_v4 on DF-4 (REAL gpt-5.4) ══\n");
  console.log("  provider=" + PROVIDER + " model=" + MODEL +
    " reasoning_effort=" + REASONING_EFFORT + " max_completion_tokens=" + MAX_COMP_TOKENS);
  console.log("  vision_project=" + VISION_PROJECT + "  cost ceiling $" + COST_CEILING_USD.toFixed(2) + "\n");

  const { spec, design, code, manifestPaths } = loadFixtureInputs();
  console.log("  DF-4 fixture files=[" + manifestPaths.join(", ") + "]");

  // phase "B" reviewer input (Builder output present) — same shape as reviewer_role.
  const inputData  = { phase: "B", spec, design, code };
  const prompt     = buildReviewerPrompt(VISION_PROJECT, inputData);
  console.log("  prompt length=" + prompt.length + " chars\n");

  const reg = getDefaultRegistry();
  const ledgerBefore = readLedger().length;

  process.stdout.write("  invoking reviewer_v4 (gpt-5.4) … ");
  let env;
  try {
    env = await reg.invoke(
      "agent.invoke",
      {
        provider:              PROVIDER,
        model:                 MODEL,
        prompt,
        project_id:            VISION_PROJECT,
        context:               { role: "reviewer" },
        reasoning_effort:      REASONING_EFFORT,
        max_completion_tokens: MAX_COMP_TOKENS
      },
      { root: ROOT, role_id: "reviewer" }
    );
  } catch (err) {
    console.log("THREW");
    const payload = {
      step: "PHASE-35-C-3a-preflight", mode: "REAL_GPT5", provider: PROVIDER, model: MODEL,
      reasoning_effort: REASONING_EFFORT, max_completion_tokens: MAX_COMP_TOKENS,
      verdict: "INVOKE_THREW", error: err && err.message
    };
    writeJson(path.join(EVID, "_preflight.json"), payload);
    console.error("\n⛔  agent.invoke threw: " + (err && err.message));
    process.exit(1);
  }

  const ledgerNew = readLedger().slice(ledgerBefore);
  const ledgerRow = ledgerNew.length ? ledgerNew[ledgerNew.length - 1] : null;

  const ok            = env && env.status === "SUCCESS" && env.output;
  const out           = ok ? env.output : null;
  const finish_reason = out ? out.finish_reason : null;
  const text          = out ? out.text : null;

  // Parse the reviewer verdict object from output.text.
  let parsed = null, parseError = null, jsonValid = false;
  if (text != null) {
    try { parsed = JSON.parse(text); jsonValid = true; }
    catch (e) { parseError = e.message; }
  }

  // Cost from ledger (authoritative actual) with adapter envelope as backup.
  const cost_usd    = ledgerRow && typeof ledgerRow.cost_usd_actual === "number"
    ? ledgerRow.cost_usd_actual : (out && out.cost_usd) || 0;
  const tokens_in   = (ledgerRow && ledgerRow.tokens_in)  != null ? ledgerRow.tokens_in  : (out && out.tokens_in)  || 0;
  const tokens_out  = (ledgerRow && ledgerRow.tokens_out) != null ? ledgerRow.tokens_out : (out && out.tokens_out) || 0;
  const latency_ms  = (ledgerRow && ledgerRow.latency_ms) != null ? ledgerRow.latency_ms : (out && out.latency_ms) || null;

  const finishStop  = finish_reason === "stop";
  const truncated   = finish_reason === "length";

  // Pre-flight verdict: CLEAN only if stop + valid JSON (+ has reviewer keys).
  const hasVerdictShape = jsonValid && parsed && typeof parsed === "object" &&
    ("verdict" in parsed) && ("findings" in parsed) && ("summary" in parsed);
  let verdict;
  if (!ok)                       verdict = "INVOKE_FAILED";
  else if (truncated)            verdict = "TRUNCATED_RAISE_BUDGET";
  else if (!finishStop)          verdict = "UNEXPECTED_FINISH_REASON";
  else if (!jsonValid)           verdict = "UNPARSEABLE_JSON";
  else if (!hasVerdictShape)     verdict = "PARSED_BUT_NOT_REVIEWER_SHAPE";
  else                           verdict = "CLEAN";

  const overCeiling = cost_usd > COST_CEILING_USD;

  const payload = {
    step:                  "PHASE-35-C-3a-preflight",
    mode:                  "REAL_GPT5",
    run_ts:                new Date().toISOString(),
    provider:              PROVIDER,
    model:                 MODEL,
    model_returned:        out ? out.model : null,
    reasoning_effort:      REASONING_EFFORT,
    max_completion_tokens: MAX_COMP_TOKENS,
    vision_project:        VISION_PROJECT,
    fixture:               "DF-4_clean",
    manifest_files:        manifestPaths,
    prompt_chars:          prompt.length,

    verdict,
    invoke_status:         env ? env.status : null,
    invoke_reason:         (env && env.metadata && env.metadata.reason) || null,

    finish_reason,
    finish_reason_is_stop: finishStop,
    truncated,

    json_valid:            jsonValid,
    json_parse_error:      parseError,
    reviewer_shape_ok:     hasVerdictShape,
    parsed_verdict:        parsed,

    tokens_in,
    tokens_out,
    cost_usd,
    latency_ms,
    cost_over_ceiling:     overCeiling,
    cost_ceiling_usd:      COST_CEILING_USD,

    ledger_row:            ledgerRow,
    raw_envelope:          env
  };
  writeJson(path.join(EVID, "_preflight.json"), payload);

  // ── Console summary ─────────────────────────────────────────────────────────
  console.log(ok ? "OK" : "FAILED");
  console.log("\n══ PRE-FLIGHT RESULT ════════════════════════════════════════════════");
  console.log("  invoke_status        : " + (env ? env.status : "(none)") +
    (payload.invoke_reason ? " (" + payload.invoke_reason + ")" : ""));
  console.log("  finish_reason        : " + finish_reason + "   (MUST be 'stop'; 'length' = truncation)");
  console.log("  json_valid           : " + jsonValid + (parseError ? "  parse_error=" + parseError : ""));
  console.log("  reviewer_shape_ok    : " + hasVerdictShape +
    (hasVerdictShape ? "  verdict=" + parsed.verdict + " findings=" + (parsed.findings || []).length : ""));
  console.log("  tokens_in/out        : " + tokens_in + " / " + tokens_out);
  console.log("  cost_usd             : $" + Number(cost_usd).toFixed(5) +
    (overCeiling ? "  ⚠ OVER $" + COST_CEILING_USD.toFixed(2) + " CEILING" : ""));
  console.log("  latency_ms           : " + latency_ms);
  console.log("  ──");
  console.log("  PRE-FLIGHT VERDICT   : " + verdict);
  console.log("  evidence             : artifacts/spikes/gate35c_phase35/_preflight.json");
  console.log("══════════════════════════════════════════════════════════════════════\n");

  process.exit(verdict === "CLEAN" ? 0 : 2);
}

main().catch(err => {
  console.error("\n⛔  PRE-FLIGHT SCRIPT ERROR:", (err && err.stack) || err);
  try {
    writeJson(path.join(EVID, "_preflight.json"), {
      step: "PHASE-35-C-3a-preflight", mode: "REAL_GPT5", provider: PROVIDER, model: MODEL,
      verdict: "SCRIPT_ERROR", detail: err && err.message
    });
  } catch (_) {}
  process.exit(1);
});

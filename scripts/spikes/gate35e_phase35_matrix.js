"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP E — root-cause matrix (REAL gpt-4o) — reviewer_v5 + security_v3
// ════════════════════════════════════════════════════════════════════════════
// The measurement run for the STEP D root-cause fix (severity calibration +
// out_of_scope respect + DF-4 fixture cleanup). Back on gpt-4o (model-eval track
// closed: gpt-5.4 did not reduce over-fire). Mirrors gate35b_phase35_rerun.js
// machinery (loadFixtureInputs + role.invoke with provider/model override +
// strict SQLi detector + ledger-sliced cost), focused matrix:
//   DF-4 reviewer_v5 ×8 + security_v3 ×8   (over-fire — the headline)
//   DF-1 reviewer_v5 ×3                     (catch preserved)
//   DF-2 security_v3 ×3                     (recall preserved)
//   DF-3 security_v3 ×3                     (no SQLi false-positive preserved)
// Tagged to vision-locked phase28_gate10 (gate35b does the same).
// COST: kill bar $3.00; STOP-AND-REPORT if running total passes $1.00 (~$0.40 expected).
// STOP — NO CLOSURE: writes gate35e_result.json + raw/ only. No decision artifact,
//   no status.json, no commit. CTO verifies.
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");

// ── ENV (mandatory first step) ────────────────────────────────────────────────
const { loadDotEnv } = require(path.join(ROOT, "code", "src", "startup", "env_loader"));
loadDotEnv(ROOT);
if (!process.env.OPENAI_API_KEY) {
  console.error("\n⛔  STOP: OPENAI_API_KEY not present after loadDotEnv — cannot make real calls.");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const PROVIDER  = "openai";
const MODEL     = "gpt-4o";          // NOT gpt-5.4 — model track closed
const N_DF4     = 8;                 // over-fire headline needs resolution
const N_CORE    = 3;                 // catch / recall / precision
const KILL_BAR  = 3.0;
const STOP_BAR  = 1.0;

const VISION_PROJECT = "phase28_gate10";

const EVID    = path.join(ROOT, "artifacts", "spikes", "gate35e_phase35");
const RAW     = path.join(EVID, "raw");
const FIXROOT = path.join(ROOT, "artifacts", "spikes", "phase35_fixtures");
const LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");
const CYCLE2  = path.join(ROOT, "artifacts", "spikes", "gate35b_phase35", "gate35b_result.json");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

const FIXTURES = {
  "DF-1": "DF-1_logic_positive",
  "DF-2": "DF-2_sqli_positive",
  "DF-3": "DF-3_parameterized_negative",
  "DF-4": "DF-4_clean"
};

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
function loadFixtureInputs(key) {
  const dir      = path.join(FIXROOT, FIXTURES[key]);
  const spec     = readJson(path.join(dir, "spec.json"));
  const design   = readJson(path.join(dir, "design.json"));
  const manifest = readJson(path.join(dir, "manifest.json"));
  const manifestPaths = (manifest.files || []).map(f => f && f.path).filter(Boolean);
  const filesWritten = manifestPaths.map(mp => ({
    path: mp, content: fs.readFileSync(path.join(dir, mp), "utf8")
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

// ── Scoring detectors (identical to gate35b; raw outputs are ground truth) ─────
const DEFECT_RE    = /this\.changes|affected[\s-]*rows?|rows?\s*affected|row[\s-]*count|\b404\b|not[\s-]*found|non[\s-]*existent|no\s*(matching\s*)?rows?|zero\s*rows?/i;
const SQLI_VULN_RE = /sql[\s_-]*injection|\bsqli\b/i;                       // vulnerability field only
const AUTH_RE      = /missing[\s_-]*auth|authenticat|authoriz/i;            // informational (out_of_scope)

function reviewerCatchesDefect(out) {
  if (!out || !Array.isArray(out.findings)) return false;
  return out.findings.some(f =>
    f && f.severity === "BLOCKER" &&
    DEFECT_RE.test([f.issue, f.recommendation, f.location].filter(Boolean).join(" ")));
}
function sqliFindings(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && SQLI_VULN_RE.test(String(f.vulnerability || "")));
}
function authBlockers(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && f.severity === "BLOCKER" &&
    AUTH_RE.test(String(f.vulnerability || "")));
}
function blockerCount(out) {
  return (out && Array.isArray(out.findings)) ? out.findings.filter(f => f && f.severity === "BLOCKER").length : 0;
}
function findingsSummary(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.map(f => ({
    severity:      f && f.severity,
    title:         (f && (f.issue || f.vulnerability)) || null,
    location:      (f && f.location) || null,
    recommendation:(f && f.recommendation) || null,
    attack_vector: (f && f.attack_vector) || null
  }));
}

// ── Cost tracking ──────────────────────────────────────────────────────────
let runningCost   = 0;
let perCallLedger = [];

async function withLedger(tag, fn) {
  const before = readLedger().length;
  const env    = await fn();
  const after  = readLedger();
  const newRows = after.slice(before);
  let cost = 0, latency = null, row = null;
  for (const r of newRows) { cost += (r.cost_usd_actual || 0); if (latency === null) latency = r.latency_ms; row = r; }
  runningCost += cost;
  const ledgerEntry = {
    tag, role: row && row.role, provider: row && row.provider, model: row && row.model,
    tokens_in: row && row.tokens_in, tokens_out: row && row.tokens_out,
    latency_ms: row && row.latency_ms, cost_usd_actual: cost, outcome: row && row.outcome, ts: row && row.ts
  };
  perCallLedger.push(ledgerEntry);
  return { env, cost, latency, ledgerEntry };
}

function checkBudget(collected) {
  if (runningCost >= STOP_BAR) {
    console.error("\n⛔  STOP-AND-REPORT: running cost $" + runningCost.toFixed(5) +
      " reached the " + (runningCost >= KILL_BAR ? "$3.00 kill bar" : "$1.00 stop bar") + ".");
    writeJson(path.join(EVID, "gate35e_result.json"), Object.assign({
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL,
      overall_verdict: "STOP_AND_REPORT", stop_reason: "BUDGET",
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    }, collected || {}));
    process.exit(1);
  }
}

// ── Invocation (tuned roles via role.invoke; reviewer_v5 / security_auditor_v3) ─
async function invokeRole(roleId, input, tag) {
  const reg = getDefaultRegistry();
  const { env, cost, latency, ledgerEntry } = await withLedger(tag, () =>
    reg.invoke("role.invoke", { role_id: roleId, input, project_id: VISION_PROJECT, provider: PROVIDER, model: MODEL }, { root: ROOT }));
  if (!env || env.status !== "SUCCESS") {
    const reason = (env && env.metadata && env.metadata.reason) || (env && env.status) || "UNKNOWN";
    return { ok: false, reason, raw: env, cost, latency, ledgerEntry };
  }
  const out = Object.assign({}, env.output); delete out.role_id;
  return { ok: true, out, cost, latency, ledgerEntry };
}

async function runReviewer(key, t, n, spec, design, code, bucket) {
  const tag = key + "_reviewer_v5_trial-" + t;
  process.stdout.write("  reviewer_v5 " + key + " trial " + t + "/" + n + " … ");
  const r = await invokeRole("reviewer", { phase: "B", spec, design, code, project_id: VISION_PROJECT }, tag);
  const rec = {
    fixture: key, role: "reviewer", version: "reviewer_v5", trial: t,
    ok: r.ok, reason: r.reason || null,
    verdict: r.ok ? r.out.verdict : null,
    blocker_count: r.ok ? blockerCount(r.out) : null,
    catches_defect: r.ok ? reviewerCatchesDefect(r.out) : null,
    findings: r.ok ? findingsSummary(r.out) : null,
    latency_ms: r.latency, cost_usd: r.cost
  };
  bucket.push(rec);
  writeJson(path.join(RAW, tag + ".json"),
    { tag, project_id: VISION_PROJECT, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
  console.log(r.ok ? ("verdict=" + r.out.verdict + " blockers=" + rec.blocker_count +
    " catch=" + rec.catches_defect + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
    : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
  checkBudget({ partial: bucket });
}

async function runSecurity(key, t, n, spec, design, code, bucket) {
  const tag = key + "_security_v3_trial-" + t;
  process.stdout.write("  security_v3 " + key + " trial " + t + "/" + n + " … ");
  const r = await invokeRole("security_auditor", { project_id: VISION_PROJECT, phase: "CODE", spec, design, code }, tag);
  const sqli = r.ok ? sqliFindings(r.out) : [];
  const auth = r.ok ? authBlockers(r.out) : [];
  const rec = {
    fixture: key, role: "security_auditor", version: "security_auditor_v3", trial: t,
    ok: r.ok, reason: r.reason || null,
    threat_level: r.ok ? r.out.threat_level : null,
    blocker_count: r.ok ? blockerCount(r.out) : null,
    sqli_findings: r.ok ? sqli.length : null,
    sqli_blocker: r.ok ? sqli.some(f => f.severity === "BLOCKER") : null,
    auth_blocker_count: r.ok ? auth.length : null,
    findings: r.ok ? findingsSummary(r.out) : null,
    latency_ms: r.latency, cost_usd: r.cost
  };
  bucket.push(rec);
  writeJson(path.join(RAW, tag + ".json"),
    { tag, project_id: VISION_PROJECT, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
  console.log(r.ok ? ("threat=" + r.out.threat_level + " blockers=" + rec.blocker_count +
    " sqli=" + rec.sqli_findings + " auth_blk=" + rec.auth_blocker_count + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
    : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
  checkBudget({ partial: bucket });
}

// ── Driver ───────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log("\n══ GATE #10 — PHASE-35 STEP E — root-cause matrix (REAL gpt-4o) ══\n");
  console.log("  provider=" + PROVIDER + " model=" + MODEL + "  reviewer_v5 + security_auditor_v3");
  console.log("  matrix: DF-4 rev×" + N_DF4 + " + sec×" + N_DF4 + " | DF-1 rev×" + N_CORE + " | DF-2 sec×" + N_CORE + " | DF-3 sec×" + N_CORE);
  console.log("  kill bar $" + KILL_BAR.toFixed(2) + "  stop bar $" + STOP_BAR.toFixed(2) + "\n");

  const ledgerStart = readLedger().length;
  const R = {
    "DF-1": { reviewer_v5: [] },
    "DF-2": { security_v3: [] },
    "DF-3": { security_v3: [] },
    "DF-4": { reviewer_v5: [], security_v3: [] }
  };

  // DF-4 — over-fire headline
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-4");
    console.log("── DF-4 (clean, self-consistent) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_DF4; t++) await runReviewer("DF-4", t, N_DF4, spec, design, code, R["DF-4"].reviewer_v5);
    for (let t = 1; t <= N_DF4; t++) await runSecurity("DF-4", t, N_DF4, spec, design, code, R["DF-4"].security_v3);
    console.log("");
  }
  // DF-1 — reviewer catch
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-1");
    console.log("── DF-1 (logic defect — catch) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_CORE; t++) await runReviewer("DF-1", t, N_CORE, spec, design, code, R["DF-1"].reviewer_v5);
    console.log("");
  }
  // DF-2 — security recall
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-2");
    console.log("── DF-2 (real SQLi — recall) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_CORE; t++) await runSecurity("DF-2", t, N_CORE, spec, design, code, R["DF-2"].security_v3);
    console.log("");
  }
  // DF-3 — security precision
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-3");
    console.log("── DF-3 (parameterized — no false-positive) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_CORE; t++) await runSecurity("DF-3", t, N_CORE, spec, design, code, R["DF-3"].security_v3);
    console.log("");
  }

  // ── Tallies ───────────────────────────────────────────────────────────────
  function tally(arr, predicate) { return { met: arr.filter(r => r.ok && predicate(r)).length, of: arr.length }; }
  function passMajority(t) { return t.met >= Math.ceil((t.of + 1) / 2); }   // strict majority

  const df1_catch       = tally(R["DF-1"].reviewer_v5, r => r.catches_defect === true);
  const df2_sqli_block  = tally(R["DF-2"].security_v3, r => r.sqli_blocker === true && ["HIGH", "CRITICAL"].indexOf(r.threat_level) !== -1);
  const df3_no_sqli     = tally(R["DF-3"].security_v3, r => r.sqli_findings === 0);
  const df4_rev_noblk   = tally(R["DF-4"].reviewer_v5, r => r.blocker_count === 0);
  const df4_sec_ok      = tally(R["DF-4"].security_v3, r => r.blocker_count === 0 && (r.sqli_findings || 0) === 0);
  const df4_sec_auth_blk = tally(R["DF-4"].security_v3, r => (r.auth_blocker_count || 0) > 0); // informational

  const perObjective = {
    "DF-1_reviewer_catch":      { criterion: "reviewer_v5 raises a missing-this.changes/404 BLOCKER", tally: df1_catch, PASS: passMajority(df1_catch) },
    "DF-2_security_recall":     { criterion: "security_v3 raises a SQLi BLOCKER + threat HIGH/CRITICAL", tally: df2_sqli_block, PASS: passMajority(df2_sqli_block) },
    "DF-3_security_precision":  { criterion: "security_v3 raises NO SQLi finding (parameterized)",       tally: df3_no_sqli, PASS: passMajority(df3_no_sqli) },
    "DF-4_reviewer_no_overfire":{ criterion: "reviewer_v5 NO BLOCKER on clean self-consistent code",     tally: df4_rev_noblk, PASS: df4_rev_noblk.met >= 7 },
    "DF-4_security_no_overfire":{ criterion: "security_v3 NO BLOCKER + no SQLi-FP (auth out_of_scope)",   tally: df4_sec_ok, PASS: df4_sec_ok.met >= 7,
                                  informational_auth_blocker: df4_sec_auth_blk }
  };

  const coreObjectivesMet = perObjective["DF-1_reviewer_catch"].PASS &&
                            perObjective["DF-2_security_recall"].PASS &&
                            perObjective["DF-3_security_precision"].PASS;
  const overFireAcceptable = df4_rev_noblk.met >= 7 && df4_sec_ok.met >= 7;   // over-fire ≤1/8 on BOTH

  // ── Over-fire comparison cycle-2 → STEP E ───────────────────────────────────
  let cyc2 = { reviewer_no_blocker: { met: 2, of: 3 }, security_no_overfire: { met: 1, of: 3 }, note: "cycle-2 file unavailable; using reported tallies" };
  try {
    const c2 = readJson(CYCLE2);
    const pf = c2.per_fixture && c2.per_fixture["DF-4"];
    if (pf) cyc2 = {
      reviewer_no_blocker:  pf.reviewer_no_blocker  ? { met: pf.reviewer_no_blocker.met, of: pf.reviewer_no_blocker.of } : cyc2.reviewer_no_blocker,
      security_no_overfire: pf.security_ok          ? { met: pf.security_ok.met,        of: pf.security_ok.of }         : cyc2.security_no_overfire
    };
  } catch (_) { /* optional */ }

  const overfire_comparison = {
    reviewer_no_blocker:  { cycle2_v4: cyc2.reviewer_no_blocker,  stepE_v5: { met: df4_rev_noblk.met, of: df4_rev_noblk.of } },
    security_no_overfire: { cycle2_v2: cyc2.security_no_overfire, stepE_v3: { met: df4_sec_ok.met,    of: df4_sec_ok.of } },
    over_fire_acceptable: overFireAcceptable,
    threshold: "no-BLOCKER ≥7/8 on BOTH roles (over-fire ≤1/8)"
  };

  // ── Cost / latency ──────────────────────────────────────────────────────────
  const newRows   = readLedger().slice(ledgerStart);
  const totalCost = Math.round(newRows.reduce((s, e) => s + (e.cost_usd_actual || 0), 0) * 100000) / 100000;
  const latencies = newRows.map(e => e.latency_ms).filter(x => typeof x === "number").sort((a, b) => a - b);
  const repLatency = { count: latencies.length, min: latencies[0] || null,
    median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null, max: latencies[latencies.length - 1] || null };

  const result = {
    mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, step: "PHASE-35-STEP-E",
    run_ts: new Date().toISOString(), n_df4: N_DF4, n_core: N_CORE, total_calls: newRows.length,
    overall_verdict: "HONEST_EVIDENCE",
    assessment: {
      core_objectives_met: coreObjectivesMet,
      over_fire_acceptable: overFireAcceptable,
      df4_reviewer_no_blocker: { met: df4_rev_noblk.met, of: df4_rev_noblk.of },
      df4_security_no_overfire: { met: df4_sec_ok.met, of: df4_sec_ok.of }
    },
    per_objective: perObjective,
    overfire_comparison,
    estimated_usd: totalCost,
    representative_latency_ms: repLatency,
    per_call_ledger: perCallLedger,
    trials: R,
    notes: [
      "MAIN via reg.invoke('role.invoke') on the registered tuned roles (reviewer_v5 / security_auditor_v3).",
      "DF-4 fixture is self-consistent (STEP D): src/models/todo.js present in manifest+spec, so a 'missing import' BLOCKER is unambiguous over-fire.",
      "STRICT SQLi detector: vulnerability field /sql[\\s_-]*injection|\\bsqli\\b/i. auth_blocker_count informational (Authentication is spec out_of_scope).",
      "Core objective PASS = strict majority of 3. DF-4 over-fire PASS = no-BLOCKER >=7/8 (over-fire <=1/8).",
      "Raw per-trial outputs under raw/ are the ground truth."
    ]
  };
  writeJson(path.join(EVID, "gate35e_result.json"), result);

  // ── Console summary ─────────────────────────────────────────────────────────
  const f = t => t.met + "/" + t.of;
  console.log("══ GATE #10 — PHASE-35 STEP E — RESULT ═══════════════════════════════");
  console.log("  DF-1 reviewer catch (this.changes/404 BLOCKER): " + f(df1_catch)      + "  PASS=" + perObjective["DF-1_reviewer_catch"].PASS);
  console.log("  DF-2 security SQLi BLOCKER (recall):            " + f(df2_sqli_block)  + "  PASS=" + perObjective["DF-2_security_recall"].PASS);
  console.log("  DF-3 security no SQLi false-positive:           " + f(df3_no_sqli)     + "  PASS=" + perObjective["DF-3_security_precision"].PASS);
  console.log("  ── DF-4 OVER-FIRE (the headline) ──");
  console.log("  reviewer no-BLOCKER:   cycle2 v4 " + f(cyc2.reviewer_no_blocker)  + "  →  stepE v5 " + f(df4_rev_noblk));
  console.log("  security no-over-fire: cycle2 v2 " + f(cyc2.security_no_overfire) + "  →  stepE v3 " + f(df4_sec_ok) +
              "   (auth-BLOCKER informational " + f(df4_sec_auth_blk) + ")");
  console.log("  ──");
  console.log("  core_objectives_met:", coreObjectivesMet, "| over_fire_acceptable:", overFireAcceptable);
  console.log("  total cost: $" + totalCost.toFixed(5) + "  calls=" + newRows.length +
              "  latency ms min/median/max: " + repLatency.min + "/" + repLatency.median + "/" + repLatency.max);
  console.log("  evidence: artifacts/spikes/gate35e_phase35/gate35e_result.json (+ raw/)");
  console.log("══════════════════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", (err && err.stack) || err);
  try {
    writeJson(path.join(EVID, "gate35e_result.json"), {
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, overall_verdict: "STOP_AND_REPORT",
      stop_code: "SCRIPT_ERROR", detail: err && err.message,
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    });
  } catch (_) {}
  process.exit(1);
});

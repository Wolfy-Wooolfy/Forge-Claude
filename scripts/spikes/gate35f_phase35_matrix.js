"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP F — security_v4 re-measure (REAL gpt-4o) — security side only
// ════════════════════════════════════════════════════════════════════════════
// STEP E left security_v3 over-fire at 4/8 (residual EXCLUSIVELY input-validation
// raised as BLOCKER; 0/8 SQLi-FP, 0/8 auth). security_auditor_v4 sharpens the
// severity clause (precautionary "missing input validation" = WARN, never a
// BLOCKER without a demonstrated exploit; recall preserved). Reviewer untouched
// (v5 already 8/8 in STEP E — not re-run). Mirrors gate35e machinery.
//   DF-4 security_v4 ×8  (over-fire — the question)
//   DF-2 security_v4 ×3  (recall preserved)
//   DF-3 security_v4 ×3  (no SQLi false-positive preserved)
// Tagged to vision-locked phase28_gate10. kill bar $3.00; STOP if total passes $0.60.
// STOP — NO CLOSURE: writes gate35f_result.json + raw/ only. CTO verifies.
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");

const { loadDotEnv } = require(path.join(ROOT, "code", "src", "startup", "env_loader"));
loadDotEnv(ROOT);
if (!process.env.OPENAI_API_KEY) {
  console.error("\n⛔  STOP: OPENAI_API_KEY not present after loadDotEnv — cannot make real calls.");
  process.exit(1);
}

const PROVIDER  = "openai";
const MODEL     = "gpt-4o";
const N_DF4     = 8;
const N_CORE    = 3;
const KILL_BAR  = 3.0;
const STOP_BAR  = 0.6;

const VISION_PROJECT = "phase28_gate10";

const EVID    = path.join(ROOT, "artifacts", "spikes", "gate35f_phase35");
const RAW     = path.join(EVID, "raw");
const FIXROOT = path.join(ROOT, "artifacts", "spikes", "phase35_fixtures");
const LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");
const STEPE   = path.join(ROOT, "artifacts", "spikes", "gate35e_phase35", "gate35e_result.json");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

const FIXTURES = {
  "DF-2": "DF-2_sqli_positive",
  "DF-3": "DF-3_parameterized_negative",
  "DF-4": "DF-4_clean"
};

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

// Strict detectors (identical to gate35e).
const SQLI_VULN_RE = /sql[\s_-]*injection|\bsqli\b/i;
const AUTH_RE      = /missing[\s_-]*auth|authenticat|authoriz/i;

function sqliFindings(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && SQLI_VULN_RE.test(String(f.vulnerability || "")));
}
function authBlockers(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && f.severity === "BLOCKER" && AUTH_RE.test(String(f.vulnerability || "")));
}
function blockerCount(out) {
  return (out && Array.isArray(out.findings)) ? out.findings.filter(f => f && f.severity === "BLOCKER").length : 0;
}
function findingsSummary(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.map(f => ({
    severity: f && f.severity, title: (f && (f.vulnerability || f.issue)) || null,
    location: (f && f.location) || null, attack_vector: (f && f.attack_vector) || null,
    mitigation: (f && f.mitigation) || null
  }));
}

let runningCost = 0;
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
      " reached the " + (runningCost >= KILL_BAR ? "$3.00 kill bar" : "$0.60 stop bar") + ".");
    writeJson(path.join(EVID, "gate35f_result.json"), Object.assign({
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL,
      overall_verdict: "STOP_AND_REPORT", stop_reason: "BUDGET",
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    }, collected || {}));
    process.exit(1);
  }
}

async function invokeSecurity(input, tag) {
  const reg = getDefaultRegistry();
  const { env, cost, latency, ledgerEntry } = await withLedger(tag, () =>
    reg.invoke("role.invoke", { role_id: "security_auditor", input, project_id: VISION_PROJECT, provider: PROVIDER, model: MODEL }, { root: ROOT }));
  if (!env || env.status !== "SUCCESS") {
    const reason = (env && env.metadata && env.metadata.reason) || (env && env.status) || "UNKNOWN";
    return { ok: false, reason, raw: env, cost, latency, ledgerEntry };
  }
  const out = Object.assign({}, env.output); delete out.role_id;
  return { ok: true, out, cost, latency, ledgerEntry };
}

async function runSecurity(key, t, n, spec, design, code, bucket) {
  const tag = key + "_security_v4_trial-" + t;
  process.stdout.write("  security_v4 " + key + " trial " + t + "/" + n + " … ");
  const r = await invokeSecurity({ project_id: VISION_PROJECT, phase: "CODE", spec, design, code }, tag);
  const sqli = r.ok ? sqliFindings(r.out) : [];
  const auth = r.ok ? authBlockers(r.out) : [];
  const rec = {
    fixture: key, role: "security_auditor", version: "security_auditor_v4", trial: t,
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

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log("\n══ GATE #10 — PHASE-35 STEP F — security_v4 re-measure (REAL gpt-4o) ══\n");
  console.log("  provider=" + PROVIDER + " model=" + MODEL + "  security_auditor_v4 (reviewer untouched: v5)");
  console.log("  matrix: DF-4 sec×" + N_DF4 + " | DF-2 sec×" + N_CORE + " | DF-3 sec×" + N_CORE);
  console.log("  kill bar $" + KILL_BAR.toFixed(2) + "  stop bar $" + STOP_BAR.toFixed(2) + "\n");

  const ledgerStart = readLedger().length;
  const R = { "DF-2": { security_v4: [] }, "DF-3": { security_v4: [] }, "DF-4": { security_v4: [] } };

  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-4");
    console.log("── DF-4 (clean, self-consistent) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_DF4; t++) await runSecurity("DF-4", t, N_DF4, spec, design, code, R["DF-4"].security_v4);
    console.log("");
  }
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-2");
    console.log("── DF-2 (real SQLi — recall) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_CORE; t++) await runSecurity("DF-2", t, N_CORE, spec, design, code, R["DF-2"].security_v4);
    console.log("");
  }
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-3");
    console.log("── DF-3 (parameterized — no false-positive) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_CORE; t++) await runSecurity("DF-3", t, N_CORE, spec, design, code, R["DF-3"].security_v4);
    console.log("");
  }

  function tally(arr, predicate) { return { met: arr.filter(r => r.ok && predicate(r)).length, of: arr.length }; }
  function passMajority(t) { return t.met >= Math.ceil((t.of + 1) / 2); }

  const df2_sqli_block = tally(R["DF-2"].security_v4, r => r.sqli_blocker === true && ["HIGH", "CRITICAL"].indexOf(r.threat_level) !== -1);
  const df3_no_sqli    = tally(R["DF-3"].security_v4, r => r.sqli_findings === 0);
  const df4_sec_ok     = tally(R["DF-4"].security_v4, r => r.blocker_count === 0 && (r.sqli_findings || 0) === 0);
  const df4_auth_blk   = tally(R["DF-4"].security_v4, r => (r.auth_blocker_count || 0) > 0); // informational

  const perObjective = {
    "DF-2_security_recall":      { criterion: "security_v4 raises a SQLi BLOCKER + threat HIGH/CRITICAL", tally: df2_sqli_block, PASS: passMajority(df2_sqli_block) },
    "DF-3_security_precision":   { criterion: "security_v4 raises NO SQLi finding (parameterized)",       tally: df3_no_sqli,    PASS: passMajority(df3_no_sqli) },
    "DF-4_security_no_overfire": { criterion: "security_v4 NO BLOCKER + no SQLi-FP (input-validation = WARN)", tally: df4_sec_ok, PASS: df4_sec_ok.met >= 7,
                                   informational_auth_blocker: df4_auth_blk }
  };

  const securityOverFireAcceptable = df4_sec_ok.met >= 7;
  const recallPrecisionHold = perObjective["DF-2_security_recall"].PASS && perObjective["DF-3_security_precision"].PASS;

  // STEP E baseline (v3) for the direct comparison.
  let stepE_v3 = { met: 4, of: 8, note: "STEP E file unavailable; reported tally" };
  try {
    const e = readJson(STEPE);
    const t = e.assessment && e.assessment.df4_security_no_overfire;
    if (t) stepE_v3 = { met: t.met, of: t.of };
  } catch (_) { /* optional */ }

  const overfire_comparison = {
    security_no_overfire: { stepE_v3, stepF_v4: { met: df4_sec_ok.met, of: df4_sec_ok.of } },
    security_over_fire_acceptable: securityOverFireAcceptable,
    threshold: "no-over-fire ≥7/8 (over-fire ≤1/8)",
    reviewer_note: "reviewer_v5 already 8/8 in STEP E (not re-run); both roles ≥7/8 ⇔ security reaches ≥7/8 here"
  };

  const newRows   = readLedger().slice(ledgerStart);
  const totalCost = Math.round(newRows.reduce((s, e) => s + (e.cost_usd_actual || 0), 0) * 100000) / 100000;
  const latencies = newRows.map(e => e.latency_ms).filter(x => typeof x === "number").sort((a, b) => a - b);
  const repLatency = { count: latencies.length, min: latencies[0] || null,
    median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null, max: latencies[latencies.length - 1] || null };

  const result = {
    mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, step: "PHASE-35-STEP-F",
    run_ts: new Date().toISOString(), n_df4: N_DF4, n_core: N_CORE, total_calls: newRows.length,
    overall_verdict: "HONEST_EVIDENCE",
    assessment: {
      security_over_fire_acceptable: securityOverFireAcceptable,
      recall_precision_hold: recallPrecisionHold,
      df4_security_no_overfire: { met: df4_sec_ok.met, of: df4_sec_ok.of },
      both_roles_acceptable: securityOverFireAcceptable    // reviewer_v5 already 8/8
    },
    per_objective: perObjective,
    overfire_comparison,
    estimated_usd: totalCost,
    representative_latency_ms: repLatency,
    per_call_ledger: perCallLedger,
    trials: R,
    notes: [
      "security_v4 via reg.invoke('role.invoke'); reviewer untouched (v5, 8/8 in STEP E — not re-run).",
      "DF-4 fixture self-consistent (STEP D). STRICT SQLi detector on vulnerability field. auth_blocker_count informational (Authentication is spec out_of_scope).",
      "Core objective PASS = strict majority of 3. DF-4 over-fire PASS = no-over-fire >=7/8 (over-fire <=1/8).",
      "Raw per-trial outputs under raw/ are the ground truth."
    ]
  };
  writeJson(path.join(EVID, "gate35f_result.json"), result);

  const f = t => t.met + "/" + t.of;
  console.log("══ GATE #10 — PHASE-35 STEP F — RESULT ═══════════════════════════════");
  console.log("  DF-2 security SQLi BLOCKER (recall):      " + f(df2_sqli_block) + "  PASS=" + perObjective["DF-2_security_recall"].PASS);
  console.log("  DF-3 security no SQLi false-positive:     " + f(df3_no_sqli)    + "  PASS=" + perObjective["DF-3_security_precision"].PASS);
  console.log("  ── DF-4 SECURITY OVER-FIRE (the question) ──");
  console.log("  security no-over-fire:  STEP E v3 " + f(stepE_v3) + "  →  STEP F v4 " + f(df4_sec_ok) +
              "   (auth-BLOCKER informational " + f(df4_auth_blk) + ")");
  console.log("  ──");
  console.log("  security_over_fire_acceptable:", securityOverFireAcceptable, "| recall+precision hold:", recallPrecisionHold);
  console.log("  (reviewer_v5 already 8/8 in STEP E → both roles acceptable iff security ≥7/8 here)");
  console.log("  total cost: $" + totalCost.toFixed(5) + "  calls=" + newRows.length +
              "  latency ms min/median/max: " + repLatency.min + "/" + repLatency.median + "/" + repLatency.max);
  console.log("  evidence: artifacts/spikes/gate35f_phase35/gate35f_result.json (+ raw/)");
  console.log("══════════════════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", (err && err.stack) || err);
  try {
    writeJson(path.join(EVID, "gate35f_result.json"), {
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, overall_verdict: "STOP_AND_REPORT",
      stop_code: "SCRIPT_ERROR", detail: err && err.message,
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    });
  } catch (_) {}
  process.exit(1);
});

"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP H — security_v6 (v5 few-shot + threat_level/severity note) re-measure
// (REAL gpt-4o) — security only
// ════════════════════════════════════════════════════════════════════════════
// Final cleanup. v5 (STEP G, few-shot) SOLVED the over-fire (7/8 vs v3 4/8 / v4 2/8)
// but 2/14 trials wrote a severity value (WARN/BLOCKER) into the threat_level field
// → INVALID_ROLE_OUTPUT (correct fail-close, but 14% parse-failure is not clean).
// v6 = v5 VERBATIM + ONE field-disambiguation note. This run re-measures with a
// LARGER sample on the two fixtures where INVALID appeared:
//   DF-4 security_v6 ×8  (over-fire — must stay ≥7/8)
//   DF-2 security_v6 ×5  (recall + INVALID check)
//   DF-3 security_v6 ×5  (precision + INVALID check)
// PRIMARY metric: INVALID_ROLE_OUTPUT count across all 18 trials — TARGET 0.
// Reviewer untouched (reviewer_v5 = 8/8 in STEP E — not re-run). Model overridden
// PER-CALL (gpt-4o) inside the script; .env untouched. Vision-locked tag phase28_gate10.
// kill bar $3.00; STOP if this step's total passes $0.70.
// STOP — NO CLOSURE: writes gate35h_result.json + raw/ only. CTO verifies.
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
const VERSION   = "security_auditor_v6";
const N_DF4     = 8;
const N_DF2     = 5;
const N_DF3     = 5;
const KILL_BAR  = 3.0;
const STOP_BAR  = 0.7;

const VISION_PROJECT = "phase28_gate10";

const EVID    = path.join(ROOT, "artifacts", "spikes", "gate35h_phase35");
const RAW     = path.join(EVID, "raw");
const FIXROOT = path.join(ROOT, "artifacts", "spikes", "phase35_fixtures");
const LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");
const STEPE   = path.join(ROOT, "artifacts", "spikes", "gate35e_phase35", "gate35e_result.json");
const STEPF   = path.join(ROOT, "artifacts", "spikes", "gate35f_phase35", "gate35f_result.json");
const STEPG   = path.join(ROOT, "artifacts", "spikes", "gate35g_phase35", "gate35g_result.json");

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

const SQLI_VULN_RE = /sql[\s_-]*injection|\bsqli\b/i;
const AUTH_RE      = /missing[\s_-]*auth|authenticat|authoriz/i;
const INPUTVAL_RE  = /input[\s_-]*validation|missing[\s_-]*validation|validate[\s_-]*input/i;

function sqliFindings(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && SQLI_VULN_RE.test(String(f.vulnerability || "")));
}
function authBlockers(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && f.severity === "BLOCKER" && AUTH_RE.test(String(f.vulnerability || "")));
}
function inputvalBlockers(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && f.severity === "BLOCKER" && INPUTVAL_RE.test(String(f.vulnerability || "")));
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
      " reached the " + (runningCost >= KILL_BAR ? "$3.00 kill bar" : "$0.70 stop bar") + ".");
    writeJson(path.join(EVID, "gate35h_result.json"), Object.assign({
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, version: VERSION,
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
  const tag = key + "_security_v6_trial-" + t;
  process.stdout.write("  security_v6 " + key + " trial " + t + "/" + n + " … ");
  const r = await invokeSecurity({ project_id: VISION_PROJECT, phase: "CODE", spec, design, code }, tag);
  const sqli = r.ok ? sqliFindings(r.out) : [];
  const auth = r.ok ? authBlockers(r.out) : [];
  const ival = r.ok ? inputvalBlockers(r.out) : [];
  const rec = {
    fixture: key, role: "security_auditor", version: VERSION, trial: t,
    ok: r.ok, reason: r.reason || null,
    invalid_role_output: (!r.ok && r.reason === "INVALID_ROLE_OUTPUT"),
    threat_level: r.ok ? r.out.threat_level : null,
    blocker_count: r.ok ? blockerCount(r.out) : null,
    sqli_findings: r.ok ? sqli.length : null,
    sqli_blocker: r.ok ? sqli.some(f => f.severity === "BLOCKER") : null,
    auth_blocker_count: r.ok ? auth.length : null,
    inputval_blocker_count: r.ok ? ival.length : null,
    findings: r.ok ? findingsSummary(r.out) : null,
    latency_ms: r.latency, cost_usd: r.cost
  };
  bucket.push(rec);
  writeJson(path.join(RAW, tag + ".json"),
    { tag, project_id: VISION_PROJECT, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
  console.log(r.ok ? ("threat=" + r.out.threat_level + " blockers=" + rec.blocker_count +
    " sqli=" + rec.sqli_findings + " ival_blk=" + rec.inputval_blocker_count + " auth_blk=" + rec.auth_blocker_count +
    "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
    : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
  checkBudget({ partial: bucket });
}

// Count INVALID_ROLE_OUTPUT in a gate result's trials block (for the v5→v6 comparison).
function countInvalid(trialsBlock) {
  let invalid = 0, total = 0;
  for (const fk of Object.keys(trialsBlock || {})) {
    const versions = trialsBlock[fk] || {};
    for (const vk of Object.keys(versions)) {
      for (const rec of (versions[vk] || [])) {
        total++;
        if (rec && rec.ok === false && rec.reason === "INVALID_ROLE_OUTPUT") invalid++;
      }
    }
  }
  return { invalid, total };
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log("\n══ GATE #10 — PHASE-35 STEP H — security_v6 (v5 few-shot + threat/severity note) re-measure (REAL gpt-4o) ══\n");
  console.log("  provider=" + PROVIDER + " model=" + MODEL + "  " + VERSION + " (reviewer untouched: reviewer_v5 8/8)");
  console.log("  matrix: DF-4 sec×" + N_DF4 + " | DF-2 sec×" + N_DF2 + " | DF-3 sec×" + N_DF3 + "   (18 trials)");
  console.log("  PRIMARY metric: INVALID_ROLE_OUTPUT across all 18 trials — TARGET 0");
  console.log("  kill bar $" + KILL_BAR.toFixed(2) + "  stop bar $" + STOP_BAR.toFixed(2) + "\n");

  // sanity: confirm the role resolves to v6 before spending real money.
  const activePromptId = require(path.join(ROOT, "code", "src", "runtime", "agents", "roles", "security_auditor_role.js")).system_prompt_id;
  console.log("  active security_auditor system_prompt_id: " + activePromptId);
  if (activePromptId !== VERSION) {
    console.error("⛔  STOP: role system_prompt_id is '" + activePromptId + "', expected '" + VERSION + "'. Run gate35h_build_prompt.js + role edit first.");
    process.exit(1);
  }
  console.log("");

  const ledgerStart = readLedger().length;
  const R = { "DF-2": { security_v6: [] }, "DF-3": { security_v6: [] }, "DF-4": { security_v6: [] } };

  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-4");
    console.log("── DF-4 (clean, self-consistent) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_DF4; t++) await runSecurity("DF-4", t, N_DF4, spec, design, code, R["DF-4"].security_v6);
    console.log("");
  }
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-2");
    console.log("── DF-2 (real SQLi — recall) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_DF2; t++) await runSecurity("DF-2", t, N_DF2, spec, design, code, R["DF-2"].security_v6);
    console.log("");
  }
  {
    const { spec, design, code, manifestPaths } = loadFixtureInputs("DF-3");
    console.log("── DF-3 (parameterized — no false-positive) files=[" + manifestPaths.join(", ") + "] ──");
    for (let t = 1; t <= N_DF3; t++) await runSecurity("DF-3", t, N_DF3, spec, design, code, R["DF-3"].security_v6);
    console.log("");
  }

  // ── PRIMARY: INVALID_ROLE_OUTPUT count across all 18 trials ──
  const allTrials = [].concat(R["DF-2"].security_v6, R["DF-3"].security_v6, R["DF-4"].security_v6);
  const invalidCount = allTrials.filter(r => r.invalid_role_output === true).length;
  const otherFailCount = allTrials.filter(r => r.ok === false && r.reason !== "INVALID_ROLE_OUTPUT").length;
  const totalTrials = allTrials.length;
  const invalidByFixture = {
    "DF-2": R["DF-2"].security_v6.filter(r => r.invalid_role_output).length,
    "DF-3": R["DF-3"].security_v6.filter(r => r.invalid_role_output).length,
    "DF-4": R["DF-4"].security_v6.filter(r => r.invalid_role_output).length
  };

  // ── DF-2 recall: SQLi BLOCKER on EVERY PARSED trial ──
  const df2Parsed = R["DF-2"].security_v6.filter(r => r.ok);
  const df2Recall = { met: df2Parsed.filter(r => r.sqli_blocker === true && ["HIGH", "CRITICAL"].indexOf(r.threat_level) !== -1).length, parsed: df2Parsed.length, of: R["DF-2"].security_v6.length };

  // ── DF-3 precision: no SQLi-FP + no input-val BLOCKER leak, on every parsed trial ──
  const df3Parsed = R["DF-3"].security_v6.filter(r => r.ok);
  const df3NoSqli   = { met: df3Parsed.filter(r => r.sqli_findings === 0).length, parsed: df3Parsed.length, of: R["DF-3"].security_v6.length };
  const df3NoBlk    = { met: df3Parsed.filter(r => r.blocker_count === 0).length, parsed: df3Parsed.length, of: R["DF-3"].security_v6.length };
  const df3IvalLeak = { met: df3Parsed.filter(r => (r.inputval_blocker_count || 0) > 0).length, parsed: df3Parsed.length, of: R["DF-3"].security_v6.length };

  // ── DF-4 no-over-fire: no BLOCKER + no SQLi-FP; input-val BLOCKER 0, auth 0 ──
  const df4Sec     = { met: R["DF-4"].security_v6.filter(r => r.ok && r.blocker_count === 0 && (r.sqli_findings || 0) === 0).length, of: R["DF-4"].security_v6.length };
  const df4Auth    = { met: R["DF-4"].security_v6.filter(r => (r.auth_blocker_count || 0) > 0).length, of: R["DF-4"].security_v6.length };
  const df4Ival    = { met: R["DF-4"].security_v6.filter(r => (r.inputval_blocker_count || 0) > 0).length, of: R["DF-4"].security_v6.length };
  const df4Sqli    = { met: R["DF-4"].security_v6.filter(r => (r.sqli_findings || 0) > 0).length, of: R["DF-4"].security_v6.length };

  // ── pass conditions ──
  const recallHold    = df2Recall.parsed > 0 && df2Recall.met === df2Recall.parsed;     // SQLi BLOCKER on every parsed DF-2 trial
  const precisionHold = df3NoSqli.parsed > 0 && df3NoSqli.met === df3NoSqli.parsed
                        && df3NoBlk.met === df3NoBlk.parsed;                              // no SQLi-FP + no BLOCKER leak on every parsed DF-3 trial
  const overFireOk    = df4Sec.met >= 7;                                                 // no-over-fire ≥7/8
  const invalidZero   = invalidCount === 0;
  const securityClean = invalidZero && overFireOk && recallHold && precisionHold;

  // ── cross-variant over-fire comparison ──
  function readNoOverfire(p, fallback) {
    try { const j = readJson(p); const t = j.assessment && j.assessment.df4_security_no_overfire; if (t) return { met: t.met, of: t.of }; } catch (_) {}
    return fallback;
  }
  const v3_stepE = readNoOverfire(STEPE, { met: 4, of: 8 });
  const v4_stepF = readNoOverfire(STEPF, { met: 2, of: 8 });
  const v5_stepG = readNoOverfire(STEPG, { met: 7, of: 8 });

  // ── v5 INVALID count (from gate35g trials) for the v5→v6 line ──
  let v5Invalid = { invalid: 2, of: 14 };
  try { const g = readJson(STEPG); const c = countInvalid(g.trials); if (c.total > 0) v5Invalid = { invalid: c.invalid, of: c.total }; } catch (_) {}

  const newRows   = readLedger().slice(ledgerStart);
  const totalCost = Math.round(newRows.reduce((s, e) => s + (e.cost_usd_actual || 0), 0) * 100000) / 100000;
  const latencies = newRows.map(e => e.latency_ms).filter(x => typeof x === "number").sort((a, b) => a - b);
  const repLatency = { count: latencies.length, min: latencies[0] || null,
    median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null, max: latencies[latencies.length - 1] || null };

  const result = {
    mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, version: VERSION, step: "PHASE-35-STEP-H",
    strategy: "v5 few-shot + threat_level/severity disambiguation note (v6)",
    run_ts: new Date().toISOString(), n_df4: N_DF4, n_df2: N_DF2, n_df3: N_DF3, total_calls: newRows.length,
    overall_verdict: "HONEST_EVIDENCE",
    security_clean: securityClean,
    primary_metric_invalid_role_output: {
      target: 0, count: invalidCount, of: totalTrials, by_fixture: invalidByFixture,
      other_failures_non_invalid: otherFailCount,
      v5_to_v6: { v5: v5Invalid, v6: { invalid: invalidCount, of: totalTrials } },
      reached_zero: invalidZero
    },
    assessment: {
      invalid_zero: invalidZero,
      df2_recall_every_parsed_trial: { met: df2Recall.met, parsed: df2Recall.parsed, of: df2Recall.of, PASS: recallHold },
      df3_precision_every_parsed_trial: { no_sqli_fp: df3NoSqli, no_blocker: df3NoBlk, inputval_blocker_leak: df3IvalLeak, PASS: precisionHold },
      df4_no_overfire: { tally: df4Sec, input_val_blocker: df4Ival, auth_blocker: df4Auth, sqli_fp: df4Sqli, PASS: overFireOk },
      security_clean: securityClean
    },
    overfire_comparison: {
      security_no_overfire_across_variants: {
        v3_rules_stepE:   v3_stepE,
        v4_rules_stepF:   v4_stepF,
        v5_fewshot_stepG: v5_stepG,
        v6_fewshot_plus_note_stepH: { met: df4Sec.met, of: df4Sec.of }
      },
      line: "v3 " + v3_stepE.met + "/" + v3_stepE.of + " · v4 " + v4_stepF.met + "/" + v4_stepF.of +
            " · v5 " + v5_stepG.met + "/" + v5_stepG.of + " · v6 " + df4Sec.met + "/" + df4Sec.of,
      threshold: "no-over-fire ≥7/8 (over-fire ≤1/8)",
      reviewer_note: "reviewer_v5 already 8/8 in STEP E; both roles ≥7/8 ⇔ security reaches ≥7/8 here"
    },
    estimated_usd: totalCost,
    representative_latency_ms: repLatency,
    per_call_ledger: perCallLedger,
    trials: R,
    notes: [
      "security_v6 = security_v5 (few-shot) VERBATIM + ONE threat_level/severity disambiguation note (no DF-fixture tokens).",
      "PRIMARY metric is INVALID_ROLE_OUTPUT across all 18 trials (TARGET 0). v5 had 2/14 (DF-2 trial-2, DF-3 trial-1).",
      "DF-2 recall = SQLi BLOCKER + threat HIGH/CRITICAL on EVERY PARSED trial. DF-3 precision = no SQLi-FP AND no BLOCKER leak on every parsed trial.",
      "DF-4 over-fire PASS = no-over-fire ≥7/8 (BLOCKER + SQLi-FP both absent). input-val/auth BLOCKER tracked.",
      "reviewer untouched (reviewer_v5 8/8 in STEP E — not re-run). Model overridden per-call (gpt-4o); .env untouched.",
      "security_clean = (INVALID==0) AND (over-fire ≥7/8) AND recall holds AND precision holds.",
      "Raw per-trial outputs under raw/ are the ground truth. NO CLOSURE — CTO ratifies."
    ]
  };
  writeJson(path.join(EVID, "gate35h_result.json"), result);

  const f = t => t.met + "/" + t.of;
  console.log("══ GATE #10 — PHASE-35 STEP H — RESULT ═══════════════════════════════");
  console.log("  ★ PRIMARY — INVALID_ROLE_OUTPUT:  " + invalidCount + "/" + totalTrials +
              "   (v5 was " + v5Invalid.invalid + "/" + v5Invalid.of + ")   reached-zero=" + invalidZero);
  console.log("    by fixture: DF-2 " + invalidByFixture["DF-2"] + " · DF-3 " + invalidByFixture["DF-3"] + " · DF-4 " + invalidByFixture["DF-4"] +
              (otherFailCount ? "   (other non-INVALID failures: " + otherFailCount + ")" : ""));
  console.log("  DF-2 recall (SQLi BLOCKER every parsed trial):  " + f({ met: df2Recall.met, of: df2Recall.parsed }) + " parsed  PASS=" + recallHold);
  console.log("  DF-3 precision (no SQLi-FP + no BLOCKER leak):   no-sqli " + f({ met: df3NoSqli.met, of: df3NoSqli.parsed }) +
              " · no-blk " + f({ met: df3NoBlk.met, of: df3NoBlk.parsed }) + "  PASS=" + precisionHold);
  console.log("  ── DF-4 SECURITY OVER-FIRE ──");
  console.log("  no-over-fire across variants:  " + result.overfire_comparison.line);
  console.log("    (DF-4 v6 input-val BLOCKER " + f(df4Ival) + " · auth BLOCKER " + f(df4Auth) + " · SQLi-FP " + f(df4Sqli) + ")");
  console.log("  ──");
  console.log("  ★ security_clean (INVALID==0 ∧ over-fire≥7/8 ∧ recall ∧ precision):", securityClean);
  console.log("  total cost: $" + totalCost.toFixed(5) + "  calls=" + newRows.length +
              "  latency ms min/median/max: " + repLatency.min + "/" + repLatency.median + "/" + repLatency.max);
  console.log("  evidence: artifacts/spikes/gate35h_phase35/gate35h_result.json (+ raw/)");
  console.log("══════════════════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", (err && err.stack) || err);
  try {
    writeJson(path.join(EVID, "gate35h_result.json"), {
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, version: VERSION, overall_verdict: "STOP_AND_REPORT",
      stop_code: "SCRIPT_ERROR", detail: err && err.message,
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    });
  } catch (_) {}
  process.exit(1);
});

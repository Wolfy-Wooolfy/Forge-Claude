"use strict";

// ════════════════════════════════════════════════════════════════════════════
// Gate #10 — PHASE-35 STEP B-2 (RE-RUN) — reviewer_v4 + security_auditor_v2
// ════════════════════════════════════════════════════════════════════════════
// REAL openai/gpt-4o spike, 2nd cycle. Owner approved spend in chat.
// Cycle-1 (STEP B) found: 3 core objectives passed BUT reviewer_v3 over-fired
// (1/3 false-REJECT on clean DF-4) and the A/B was inconclusive (fixtures leaked).
// STEP A-2 fixed both: reviewer_v4 (anti-over-fire, recall preserved) + fixtures
// de-contaminated (incl. DF-4 design reverse-leak neutralized in B-2 pre-step).
//
// MAIN RUN (tuned roles via reg.invoke "role.invoke"): per fixture DF-1..DF-4,
//   reviewer (phase B → reviewer_v4) AND security_auditor (phase CODE → v2), N=3.
//   code assembled from manifest + on-disk source, exactly as reviewProject().
// A/B BASELINE (retired prompts via agent.invoke, assembly mirrored): reviewer_v2
//   on DF-1 (N=2) + security_v1 on DF-3 (N=2), on the DE-CONTAMINATED fixtures.
//   The A/B is INFORMATIONAL — the phase does not hinge on it (see prompt).
//
// SCORING: strict SQLi detector (vulnerability field, word-boundaried). DF-4
//   criterion corrected per A-2.4: reviewer no-BLOCKER; security no-BLOCKER + no
//   SQLi-false-positive (a missing-auth WARN/MEDIUM is LEGITIMATE, not a failure).
// COST: kill bar $3.00; STOP-AND-REPORT if running total reaches $1.50.
// STOP — NO CLOSURE: writes gate35b_result.json + raw trials only (NEW dir, keeps
//   cycle-1 intact). No decision artifact, no status.json, no commit. CTO verifies.
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");

// ── ENV (mandatory first step — loader does NOT auto-run) ─────────────────────
const { loadDotEnv } = require(path.join(ROOT, "code", "src", "startup", "env_loader"));
loadDotEnv(ROOT);
if (!process.env.OPENAI_API_KEY) {
  console.error("\n⛔  STOP: OPENAI_API_KEY not present after loadDotEnv — cannot make real calls.");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const PROVIDER  = "openai";
const MODEL     = "gpt-4o";
const N_MAIN    = 3;
const N_BASE    = 2;
const KILL_BAR  = 3.0;
const STOP_BAR  = 1.5;

// agent_budget_rule requires a vision-locked project for non-mock agent.invoke.
// Fixture content rides in the role INPUT; project_id only gates vision/budget and
// tags the ledger. Reuse phase28_gate10 (locked, $50 cap). Cost via ledger slice.
const VISION_PROJECT = "phase28_gate10";

const EVID    = path.join(ROOT, "artifacts", "spikes", "gate35b_phase35");
const RAW     = path.join(EVID, "raw");
const FIXROOT = path.join(ROOT, "artifacts", "spikes", "phase35_fixtures");
const LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");
const CYCLE1  = path.join(ROOT, "artifacts", "spikes", "gate35_phase35", "gate35_result.json");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));
const { loadPrompt }         = require(path.join(ROOT, "code", "src", "runtime", "agents", "_prompt_loader"));

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

// Assemble { spec, design, code } EXACTLY as reviewProject() does.
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

// ── Scoring detectors (strict; raw outputs remain the ground truth) ───────────
const DEFECT_RE    = /this\.changes|affected[\s-]*rows?|rows?\s*affected|row[\s-]*count|\b404\b|not[\s-]*found|non[\s-]*existent|no\s*(matching\s*)?rows?|zero\s*rows?/i;
const SQLI_VULN_RE = /sql[\s_-]*injection|\bsqli\b/i;   // vulnerability field only

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
      " reached the " + (runningCost >= KILL_BAR ? "$3.00 kill bar" : "$1.50 stop bar") + ".");
    writeJson(path.join(EVID, "gate35b_result.json"), Object.assign({
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL,
      overall_verdict: "STOP_AND_REPORT", stop_reason: "BUDGET",
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    }, collected || {}));
    process.exit(1);
  }
}

// ── MAIN-run invocation (tuned roles via role.invoke) ─────────────────────────
async function invokeRoleMain(roleId, input, project_id, tag) {
  const reg = getDefaultRegistry();
  const { env, cost, latency, ledgerEntry } = await withLedger(tag, () =>
    reg.invoke("role.invoke", { role_id: roleId, input, project_id, provider: PROVIDER, model: MODEL }, { root: ROOT }));
  if (!env || env.status !== "SUCCESS") {
    const reason = (env && env.metadata && env.metadata.reason) || (env && env.status) || "UNKNOWN";
    return { ok: false, reason, raw: env, cost, latency, ledgerEntry };
  }
  const out = Object.assign({}, env.output); delete out.role_id;
  return { ok: true, out, cost, latency, ledgerEntry };
}

// ── BASELINE invocation (retired prompts via agent.invoke; assembly mirrored) ─
function buildRolePrompt(prefix, project_id, systemPrompt, inputData) {
  return prefix + "|" + project_id + "\n" + systemPrompt +
    "\n\nINPUT:\n" + JSON.stringify(inputData) + "\n\nRESPOND WITH VALID JSON ONLY.";
}
async function invokeBaseline(roleId, prefix, promptId, inputData, project_id, tag) {
  const reg = getDefaultRegistry();
  const systemPrompt = loadPrompt(promptId);
  const prompt = buildRolePrompt(prefix, project_id, systemPrompt, inputData);
  const { env, cost, latency, ledgerEntry } = await withLedger(tag, () =>
    reg.invoke("agent.invoke", { provider: PROVIDER, model: MODEL, prompt, project_id, context: { role: roleId } },
      { root: ROOT, role_id: roleId }));
  if (!env || env.status !== "SUCCESS") {
    const reason = (env && env.metadata && env.metadata.reason) || (env && env.status) || "UNKNOWN";
    return { ok: false, reason, raw: env, cost, latency, ledgerEntry };
  }
  let parsed;
  try { parsed = JSON.parse(env.output.text); }
  catch (e) { return { ok: false, reason: "JSON_PARSE_FAILED", raw_text: env.output.text, cost, latency, ledgerEntry }; }
  return { ok: true, out: parsed, cost, latency, ledgerEntry };
}

// ── Driver ───────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log("\n══ GATE #10 — PHASE-35 STEP B-2 RE-RUN — reviewer_v4 + security_auditor_v2 (REAL gpt-4o) ══\n");
  console.log("  provider=" + PROVIDER + " model=" + MODEL + "  N_main=" + N_MAIN + " N_base=" + N_BASE);
  console.log("  OPENAI_API_KEY present ✓   kill bar $" + KILL_BAR.toFixed(2) + "   stop bar $" + STOP_BAR.toFixed(2) + "\n");

  const ledgerStart = readLedger().length;
  const results = {};

  for (const key of Object.keys(FIXTURES)) {
    const { spec, design, code, manifestPaths } = loadFixtureInputs(key);
    const project_id = VISION_PROJECT;
    results[key] = { reviewer_v4: [], security_v2: [], manifest_files: manifestPaths };
    console.log("── " + key + " (" + FIXTURES[key] + ")  files=[" + manifestPaths.join(", ") + "] ──");

    for (let t = 1; t <= N_MAIN; t++) {
      const tag = key + "_reviewer_v4_trial-" + t;
      process.stdout.write("  reviewer_v4 trial " + t + "/" + N_MAIN + " … ");
      const r = await invokeRoleMain("reviewer", { phase: "B", spec, design, code, project_id }, project_id, tag);
      const rec = {
        fixture: key, role: "reviewer", version: "reviewer_v4", trial: t,
        ok: r.ok, reason: r.reason || null,
        verdict: r.ok ? r.out.verdict : null, threat_level: null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        catches_defect: r.ok ? reviewerCatchesDefect(r.out) : null,
        sqli_findings: r.ok ? sqliFindings(r.out).length : null,
        findings: r.ok ? findingsSummary(r.out) : null,
        latency_ms: r.latency, cost_usd: r.cost
      };
      results[key].reviewer_v4.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("verdict=" + r.out.verdict + " blockers=" + rec.blocker_count +
        " catch=" + rec.catches_defect + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
        : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: results });
    }

    for (let t = 1; t <= N_MAIN; t++) {
      const tag = key + "_security_v2_trial-" + t;
      process.stdout.write("  security_v2 trial " + t + "/" + N_MAIN + " … ");
      const r = await invokeRoleMain("security_auditor", { project_id, phase: "CODE", spec, design, code }, project_id, tag);
      const sqli = r.ok ? sqliFindings(r.out) : [];
      const rec = {
        fixture: key, role: "security_auditor", version: "security_auditor_v2", trial: t,
        ok: r.ok, reason: r.reason || null, verdict: null,
        threat_level: r.ok ? r.out.threat_level : null,
        blocker_count: r.ok ? blockerCount(r.out) : null, catches_defect: null,
        sqli_findings: r.ok ? sqli.length : null,
        sqli_blocker: r.ok ? sqli.some(f => f.severity === "BLOCKER") : null,
        findings: r.ok ? findingsSummary(r.out) : null,
        latency_ms: r.latency, cost_usd: r.cost
      };
      results[key].security_v2.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("threat=" + r.out.threat_level + " blockers=" + rec.blocker_count +
        " sqli=" + rec.sqli_findings + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
        : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: results });
    }
    console.log("");
  }

  // ── A/B BASELINE (informational) ───────────────────────────────────────────
  console.log("── A/B BASELINE (retired prompts on de-contaminated fixtures; informational) ──");
  const baseline = { reviewer_v2_DF1: [], security_v1_DF3: [] };
  {
    const { spec, design, code } = loadFixtureInputs("DF-1");
    const inputData = { phase: "B", spec, design, code };
    for (let t = 1; t <= N_BASE; t++) {
      const tag = "baseline_DF-1_reviewer_v2_trial-" + t;
      process.stdout.write("  reviewer_v2(DF-1) trial " + t + "/" + N_BASE + " … ");
      const r = await invokeBaseline("reviewer", "reviewer", "reviewer_v2", inputData, VISION_PROJECT, tag);
      const rec = {
        fixture: "DF-1", role: "reviewer", version: "reviewer_v2", trial: t,
        ok: r.ok, reason: r.reason || null, verdict: r.ok ? r.out.verdict : null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        catches_defect: r.ok ? reviewerCatchesDefect(r.out) : null,
        findings: r.ok ? findingsSummary(r.out) : null, latency_ms: r.latency, cost_usd: r.cost
      };
      baseline.reviewer_v2_DF1.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id: VISION_PROJECT, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("verdict=" + r.out.verdict + " blockers=" + rec.blocker_count + " catch=" + rec.catches_defect +
        "  $" + r.cost.toFixed(5) + " " + r.latency + "ms") : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: results, baseline });
    }
  }
  {
    const { spec, design, code } = loadFixtureInputs("DF-3");
    const inputData = { phase: "CODE", spec, design, code };
    for (let t = 1; t <= N_BASE; t++) {
      const tag = "baseline_DF-3_security_v1_trial-" + t;
      process.stdout.write("  security_v1(DF-3) trial " + t + "/" + N_BASE + " … ");
      const r = await invokeBaseline("security_auditor", "security_auditor", "security_auditor_v1", inputData, VISION_PROJECT, tag);
      const sqli = r.ok ? sqliFindings(r.out) : [];
      const rec = {
        fixture: "DF-3", role: "security_auditor", version: "security_auditor_v1", trial: t,
        ok: r.ok, reason: r.reason || null, threat_level: r.ok ? r.out.threat_level : null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        sqli_findings: r.ok ? sqli.length : null,
        sqli_blocker: r.ok ? sqli.some(f => f.severity === "BLOCKER") : null,
        findings: r.ok ? findingsSummary(r.out) : null, latency_ms: r.latency, cost_usd: r.cost
      };
      baseline.security_v1_DF3.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id: VISION_PROJECT, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("threat=" + r.out.threat_level + " blockers=" + rec.blocker_count + " sqli=" + rec.sqli_findings +
        "  $" + r.cost.toFixed(5) + " " + r.latency + "ms") : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: results, baseline });
    }
  }

  // ── Tally + criteria ────────────────────────────────────────────────────────
  function tally(arr, predicate) { return { met: arr.filter(r => r.ok && predicate(r)).length, of: arr.length }; }
  function passMain(t) { return t.met >= 2; }   // strict majority of 3
  const R = results;

  const perFixture = {
    "DF-1": {
      probe: "reviewer_v4 recall — missing this.changes / 404 BLOCKER (catch preserved)",
      criterion: "reviewer_v4 raises a BLOCKER tied to missing-404 / affected-row / this.changes",
      reviewer_catch:   tally(R["DF-1"].reviewer_v4, r => r.catches_defect === true),
      security_no_sqli: tally(R["DF-1"].security_v2, r => r.sqli_findings === 0)   // informational
    },
    "DF-2": {
      probe: "security_auditor_v2 recall — genuine SQLi still BLOCKS",
      criterion: "security_v2 raises a SQLi BLOCKER (vulnerability=SQL injection) + threat HIGH/CRITICAL",
      security_sqli_blocker: tally(R["DF-2"].security_v2,
        r => r.sqli_blocker === true && ["HIGH", "CRITICAL"].indexOf(r.threat_level) !== -1)
    },
    "DF-3": {
      probe: "security_auditor_v2 precision — NO SQLi false-positive on parameterized queries",
      criterion: "security_v2 raises NO SQLi finding (vulnerability never names SQL injection)",
      security_no_sqli: tally(R["DF-3"].security_v2, r => r.sqli_findings === 0)
    },
    "DF-4": {
      probe: "no over-fire on clean code (THE reviewer_v4 fix being verified)",
      criterion: "reviewer no BLOCKER AND security no BLOCKER + no SQLi false-positive (missing-auth WARN/MEDIUM OK)",
      reviewer_no_blocker: tally(R["DF-4"].reviewer_v4, r => r.blocker_count === 0),
      security_ok:         tally(R["DF-4"].security_v2, r => r.blocker_count === 0 && (r.sqli_findings || 0) === 0)
    }
  };
  perFixture["DF-1"].PASS = passMain(perFixture["DF-1"].reviewer_catch);
  perFixture["DF-2"].PASS = passMain(perFixture["DF-2"].security_sqli_blocker);
  perFixture["DF-3"].PASS = passMain(perFixture["DF-3"].security_no_sqli);
  perFixture["DF-4"].PASS = passMain(perFixture["DF-4"].reviewer_no_blocker) && passMain(perFixture["DF-4"].security_ok);

  // ── DF-4 over-fire comparison (cycle-1 v3 → cycle-2 v4) ──────────────────────
  let cycle1NoBlocker = null;
  try {
    const c1 = readJson(CYCLE1);
    const t1 = c1.per_fixture && c1.per_fixture["DF-4"] && c1.per_fixture["DF-4"].reviewer_no_blocker;
    if (t1) cycle1NoBlocker = { no_blocker: t1.met, of: t1.of };
  } catch (_) { /* cycle-1 file optional */ }
  const v4NoBlocker = perFixture["DF-4"].reviewer_no_blocker;
  const df4_overfire = {
    metric: "reviewer raises NO BLOCKER on clean code (no over-fire)",
    cycle1_reviewer_v3: cycle1NoBlocker || { no_blocker: 2, of: 3, note: "cycle-1 rescore (file unavailable at run)" },
    cycle1_note: "cycle-1: reviewer_v3 over-fired 1/3 — REJECTED clean code with fabricated AC-1/AC-2 BLOCKERs",
    cycle2_reviewer_v4: { no_blocker: v4NoBlocker.met, of: v4NoBlocker.of },
    over_fire_fully_resolved: v4NoBlocker.met === N_MAIN,        // 3/3 = zero over-fire
    over_fire_improved: v4NoBlocker.met >= ((cycle1NoBlocker && cycle1NoBlocker.no_blocker) || 2)
  };

  // ── A/B comparisons (informational — not a hinge) ───────────────────────────
  const df1_v4 = tally(R["DF-1"].reviewer_v4, r => r.catches_defect === true);
  const df1_v2 = tally(baseline.reviewer_v2_DF1, r => r.catches_defect === true);
  const df3_v2 = tally(R["DF-3"].security_v2, r => r.sqli_findings === 0);
  const df3_v1_fp = tally(baseline.security_v1_DF3, r => (r.sqli_findings || 0) > 0);
  const decisive = {
    "DF-1_reviewer_catch": {
      metric: "BLOCKER tied to missing this.changes / 404 not-found path",
      v4_main: { caught: df1_v4.met, of: df1_v4.of }, v2_baseline: { caught: df1_v2.met, of: df1_v2.of },
      phase31_baseline: "reviewer_v2 MISSED this defect at PHASE-31 (gate31_phase31)",
      controlled_proof: (df1_v4.met >= 2 && df1_v2.met === 0),
      note: "Informational. If v2 still catches via the explicit AC-3 requirement (kept by design), the A/B stays partly inconclusive — acceptable per the STEP B-2 prompt."
    },
    "DF-3_security_no_false_positive": {
      metric: "SQLi finding (vulnerability=SQL injection) raised against parameterized queries",
      v2_main: { no_sqli_flag: df3_v2.met, of: df3_v2.of }, v1_baseline: { false_positive: df3_v1_fp.met, of: df3_v1_fp.of },
      phase31_baseline: "security_auditor_v1 FALSE-POSITIVED a SQLi BLOCKER here at PHASE-31 (gate31_phase31)",
      controlled_proof: (df3_v2.met >= 2 && df3_v1_fp.met >= 1),
      note: "Informational."
    }
  };

  // ── Cost / latency ──────────────────────────────────────────────────────────
  const newRows   = readLedger().slice(ledgerStart);
  const totalCost = Math.round(newRows.reduce((s, e) => s + (e.cost_usd_actual || 0), 0) * 100000) / 100000;
  const latencies = newRows.map(e => e.latency_ms).filter(x => typeof x === "number").sort((a, b) => a - b);
  const repLatency = { count: latencies.length, min: latencies[0] || null,
    median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null, max: latencies[latencies.length - 1] || null };

  // ── Objective: hinges on (1) 3 core objectives + (2) DF-4 over-fire resolved ─
  const coreObjectivesMet = perFixture["DF-1"].PASS && perFixture["DF-2"].PASS && perFixture["DF-3"].PASS;
  const df4Pass = perFixture["DF-4"].PASS;
  const overFireResolved = df4_overfire.over_fire_fully_resolved;
  const tuningObjectiveMet = coreObjectivesMet && df4Pass && overFireResolved;

  const result = {
    mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, cycle: 2,
    run_ts: new Date().toISOString(), n_main: N_MAIN, n_baseline: N_BASE,
    total_calls: newRows.length,
    overall_verdict: "HONEST_EVIDENCE",
    assessment: {
      core_objectives_met: coreObjectivesMet,   // DF-1 catch + DF-2 recall + DF-3 precision
      df4_overfire_resolved: overFireResolved,  // reviewer_v4 0 over-fire on clean
      df4_pass: df4Pass,
      tuning_objective_met: tuningObjectiveMet
    },
    per_fixture: perFixture,
    df4_overfire_comparison: df4_overfire,
    ab_comparisons: decisive,
    estimated_usd: totalCost,
    representative_latency_ms: repLatency,
    per_call_ledger: perCallLedger,
    main_trials: results,
    baseline_trials: baseline,
    notes: [
      "MAIN via reg.invoke('role.invoke') on the registered tuned roles (reviewer_v4 / security_auditor_v2).",
      "BASELINE via reg.invoke('agent.invoke') reproducing the role's exact prompt assembly with retired prompts (reviewer_v2 / security_auditor_v1); role files unchanged (Track A).",
      "STRICT SQLi detector: vulnerability field matches /sql[\\s_-]*injection|\\bsqli\\b/i (avoids the cycle-1 'SQLite'/attack_vector false matches).",
      "DF-4 criterion per A-2.4: security PASS = no BLOCKER + no SQLi false-positive; a missing-auth WARN/MEDIUM is LEGITIMATE (threat_level NOT part of the bar).",
      "A/B is informational; the phase hinges on the 3 core objectives + DF-4 over-fire resolution.",
      "Raw per-trial outputs under raw/ are the ground truth."
    ]
  };
  writeJson(path.join(EVID, "gate35b_result.json"), result);

  // ── Console summary ─────────────────────────────────────────────────────────
  const f = t => t.met + "/" + t.of;
  console.log("\n══ GATE #10 — PHASE-35 STEP B-2 — RESULT ═════════════════════════════");
  console.log("  DF-1 reviewer_v4 catch (this.changes/404 BLOCKER): " + f(perFixture["DF-1"].reviewer_catch) + "  PASS=" + perFixture["DF-1"].PASS);
  console.log("       DF-1 security_v2 no-SQLi (informational):     " + f(perFixture["DF-1"].security_no_sqli));
  console.log("  DF-2 security_v2 SQLi BLOCKER (recall):            " + f(perFixture["DF-2"].security_sqli_blocker) + "  PASS=" + perFixture["DF-2"].PASS);
  console.log("  DF-3 security_v2 no SQLi false-positive:           " + f(perFixture["DF-3"].security_no_sqli) + "  PASS=" + perFixture["DF-3"].PASS);
  console.log("  DF-4 reviewer no-BLOCKER: " + f(perFixture["DF-4"].reviewer_no_blocker) +
              " | security no-BLOCKER+no-SQLi-FP: " + f(perFixture["DF-4"].security_ok) + "  PASS=" + perFixture["DF-4"].PASS);
  console.log("  ── DF-4 OVER-FIRE (the fix) ──");
  console.log("  reviewer no-BLOCKER:  cycle1 v3 " + df4_overfire.cycle1_reviewer_v3.no_blocker + "/" + df4_overfire.cycle1_reviewer_v3.of +
              "  →  cycle2 v4 " + df4_overfire.cycle2_reviewer_v4.no_blocker + "/" + df4_overfire.cycle2_reviewer_v4.of +
              "   resolved=" + df4_overfire.over_fire_fully_resolved);
  console.log("  ── A/B (informational) ──");
  console.log("  DF-1 catch: v4 " + f(df1_v4) + " vs v2 " + f(df1_v2) + "   proof=" + decisive["DF-1_reviewer_catch"].controlled_proof);
  console.log("  DF-3 no-FP: v2 " + f(df3_v2) + " vs v1-FP " + f(df3_v1_fp) + "   proof=" + decisive["DF-3_security_no_false_positive"].controlled_proof);
  console.log("  ──");
  console.log("  core_objectives_met:", coreObjectivesMet, "| df4_overfire_resolved:", overFireResolved, "| tuning_objective_met:", tuningObjectiveMet);
  console.log("  total cost: $" + totalCost.toFixed(5) + "  calls=" + newRows.length +
              "  latency ms min/median/max: " + repLatency.min + "/" + repLatency.median + "/" + repLatency.max);
  console.log("  evidence: artifacts/spikes/gate35b_phase35/gate35b_result.json (+ raw/)");
  console.log("══════════════════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err && err.stack || err);
  try {
    writeJson(path.join(EVID, "gate35b_result.json"), {
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL, overall_verdict: "STOP_AND_REPORT",
      stop_code: "SCRIPT_ERROR", detail: err && err.message,
      running_cost_usd: Math.round(runningCost * 100000) / 100000, per_call_ledger: perCallLedger
    });
  } catch (_) {}
  process.exit(1);
});

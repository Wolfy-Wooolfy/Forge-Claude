"use strict";

// ════════════════════════════════════════════════════════════════════════════
// Gate #10 — PHASE-35 STEP B — reviewer_v3 + security_auditor_v2 (review-quality)
// ════════════════════════════════════════════════════════════════════════════
// REAL openai/gpt-4o spike. Owner approved spend in chat.
//
// MAIN RUN (the tuned prompts, via reg.invoke "role.invoke"):
//   For each fixture DF-1..DF-4: invoke reviewer (phase B, reviewer_v3) AND
//   security_auditor (phase CODE, security_auditor_v2), N=3 trials each.
//   code object assembled from manifest.json + on-disk fixture source, EXACTLY
//   as conversationEngine.reviewProject() does (manifest-restricted, same summary).
//
// A/B BASELINE (the retired prompts, via reg.invoke "agent.invoke" — role files
//   point at v3/v2 and MUST NOT be mutated under Track A, so the baseline
//   reproduces the role's EXACT prompt assembly with the old prompt text swapped
//   in; same input object, only the system-prompt block differs):
//   - reviewer_v2      on DF-1, N=2  → expected to MISS the this.changes defect
//   - security_auditor_v1 on DF-3, N=2 → expected to FALSE-POSITIVE the SQLi
//
// SCORING: "X of N" tallies (non-deterministic). Majority pass (>=2/3 main,
//   >=2/2 baseline). Raw per-trial outputs written verbatim. NO retry-into-pass.
//
// COST: kill bar $3.00. STOP-AND-REPORT if running total reaches $1.50.
//
// STOP — NO CLOSURE: writes gate35_result.json + raw trials only. No decision
//   artifact, no status.json closure, no commit/tag/push. CTO verifies.
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

// L3 (agent_budget_rule) requires a non-mock agent.invoke to run under a project
// with a LOCKED vision + budget headroom. The fixture's {spec,design,code} rides
// in the ROLE INPUT; project_id only gates vision/budget and tags the ledger. We
// reuse phase28_gate10 (locked vision, $50 cap, ~$0 spent) — same pattern gate31
// used. Per-call cost is captured by slicing the FULL ledger, so attribution is
// exact regardless of this tag.
const VISION_PROJECT = "phase28_gate10";

const EVID    = path.join(ROOT, "artifacts", "spikes", "gate35_phase35");
const RAW     = path.join(EVID, "raw");
const FIXROOT = path.join(ROOT, "artifacts", "spikes", "phase35_fixtures");
const LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

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
    path: mp,
    content: fs.readFileSync(path.join(dir, mp), "utf8")
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

// ── Scoring detectors (deterministic; raw outputs remain the ground truth) ────
const DEFECT_RE = /this\.changes|affected[\s-]*rows?|rows?\s*affected|row[\s-]*count|\b404\b|not[\s-]*found|non[\s-]*existent|no\s*(matching\s*)?rows?|zero\s*rows?/i;
// STRICT: an actual SQL-injection FINDING names SQLi in its `vulnerability` field.
// Match only there (the attack_vector free-text often mentions "injection"
// generically for non-SQLi findings, and "sqli" is a substring of "SQLite").
const SQLI_VULN_RE = /sql[\s_-]*injection|\bsqli\b/i;

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

function hasBlocker(out) {
  return !!(out && Array.isArray(out.findings) && out.findings.some(f => f && f.severity === "BLOCKER"));
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
let perCallLedger = [];   // { tag, role, provider, model, tokens_in, tokens_out, latency_ms, cost_usd_actual, outcome }

// Run an async producer of a role/agent envelope while capturing the new ledger row.
async function withLedger(tag, fn) {
  const before = readLedger().length;
  const env    = await fn();
  const after  = readLedger();
  const newRows = after.slice(before);
  let cost = 0, latency = null, row = null;
  for (const r of newRows) {
    cost += (r.cost_usd_actual || 0);
    if (latency === null) latency = r.latency_ms;
    row = r;
  }
  runningCost += cost;
  const ledgerEntry = {
    tag,
    role:            row && row.role,
    provider:        row && row.provider,
    model:           row && row.model,
    tokens_in:       row && row.tokens_in,
    tokens_out:      row && row.tokens_out,
    latency_ms:      row && row.latency_ms,
    cost_usd_actual: cost,
    outcome:         row && row.outcome,
    ts:              row && row.ts
  };
  perCallLedger.push(ledgerEntry);
  return { env, cost, latency, ledgerEntry };
}

function checkBudget(collected) {
  if (runningCost >= KILL_BAR || runningCost >= STOP_BAR) {
    console.error("\n⛔  STOP-AND-REPORT: running cost $" + runningCost.toFixed(5) +
      " reached the " + (runningCost >= KILL_BAR ? "$3.00 kill bar" : "$1.50 stop bar") + ".");
    writeJson(path.join(EVID, "gate35_result.json"), Object.assign({
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL,
      overall_verdict: "STOP_AND_REPORT",
      stop_reason: "BUDGET", running_cost_usd: Math.round(runningCost * 100000) / 100000
    }, collected || {}));
    process.exit(1);
  }
}

// ── MAIN-run invocation (the tuned roles via role.invoke) ────────────────────
async function invokeRoleMain(roleId, input, project_id, tag) {
  const reg = getDefaultRegistry();
  const { env, cost, latency, ledgerEntry } = await withLedger(tag, () =>
    reg.invoke("role.invoke", {
      role_id: roleId, input, project_id, provider: PROVIDER, model: MODEL
    }, { root: ROOT })
  );

  if (!env || env.status !== "SUCCESS") {
    const reason = (env && env.metadata && env.metadata.reason) || (env && env.status) || "UNKNOWN";
    return { ok: false, reason, raw: env, cost, latency, ledgerEntry };
  }
  // role.invoke returns ok({ role_id, ...roleOutput })
  const out = Object.assign({}, env.output);
  delete out.role_id;
  return { ok: true, out, cost, latency, ledgerEntry };
}

// ── BASELINE invocation (retired prompts via agent.invoke; assembly mirrored) ─
function buildRolePrompt(prefix, project_id, systemPrompt, inputData) {
  // Mirrors reviewer_role.js / security_auditor_role.js EXACTLY:
  //   "<prefix>|" + project_id + "\n" + scenarioTag("") + SYSTEM_PROMPT +
  //   "\n\nINPUT:\n" + JSON.stringify(inputData) + "\n\nRESPOND WITH VALID JSON ONLY."
  return prefix + "|" + project_id + "\n" +
    systemPrompt +
    "\n\nINPUT:\n" + JSON.stringify(inputData) +
    "\n\nRESPOND WITH VALID JSON ONLY.";
}

async function invokeBaseline(roleId, prefix, promptId, inputData, project_id, tag) {
  const reg          = getDefaultRegistry();
  const systemPrompt = loadPrompt(promptId);
  const prompt       = buildRolePrompt(prefix, project_id, systemPrompt, inputData);

  const { env, cost, latency, ledgerEntry } = await withLedger(tag, () =>
    reg.invoke("agent.invoke", {
      provider: PROVIDER, model: MODEL, prompt, project_id, context: { role: roleId }
    }, { root: ROOT, role_id: roleId })
  );

  if (!env || env.status !== "SUCCESS") {
    const reason = (env && env.metadata && env.metadata.reason) || (env && env.status) || "UNKNOWN";
    return { ok: false, reason, raw: env, cost, latency, ledgerEntry };
  }
  let parsed;
  try {
    parsed = JSON.parse(env.output.text);
  } catch (e) {
    return { ok: false, reason: "JSON_PARSE_FAILED", raw_text: env.output.text, cost, latency, ledgerEntry };
  }
  return { ok: true, out: parsed, cost, latency, ledgerEntry };
}

// ── Driver ───────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log("\n══ GATE #10 — PHASE-35 STEP B — reviewer_v3 + security_auditor_v2 (REAL gpt-4o) ══\n");
  console.log("  provider=" + PROVIDER + " model=" + MODEL + "  N_main=" + N_MAIN + " N_base=" + N_BASE);
  console.log("  OPENAI_API_KEY present ✓   kill bar $" + KILL_BAR.toFixed(2) + "   stop bar $" + STOP_BAR.toFixed(2) + "\n");

  const ledgerStart = readLedger().length;

  // results[fixture][role] = { trials: [...], version }
  const results = {};
  const trialRecords = [];   // flat for evidence

  for (const key of Object.keys(FIXTURES)) {
    const { spec, design, code, manifestPaths } = loadFixtureInputs(key);
    const project_id = VISION_PROJECT;   // vision/budget tag; fixture rides in role input
    results[key] = { reviewer_v3: [], security_v2: [], manifest_files: manifestPaths };
    console.log("── " + key + " (" + FIXTURES[key] + ")  files=[" + manifestPaths.join(", ") + "] ──");

    // reviewer_v3 — phase B
    for (let t = 1; t <= N_MAIN; t++) {
      const tag = key + "_reviewer_v3_trial-" + t;
      process.stdout.write("  reviewer_v3 trial " + t + "/" + N_MAIN + " … ");
      const r = await invokeRoleMain("reviewer",
        { phase: "B", spec, design, code, project_id }, project_id, tag);
      const rec = {
        fixture: key, role: "reviewer", version: "reviewer_v3", trial: t,
        ok: r.ok, reason: r.reason || null,
        verdict: r.ok ? r.out.verdict : null,
        threat_level: null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        catches_defect: r.ok ? reviewerCatchesDefect(r.out) : null,
        sqli_findings: r.ok ? sqliFindings(r.out).length : null,
        findings: r.ok ? findingsSummary(r.out) : null,
        latency_ms: r.latency, cost_usd: r.cost
      };
      results[key].reviewer_v3.push(rec);
      trialRecords.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("verdict=" + r.out.verdict + " blockers=" + rec.blocker_count +
        " catch=" + rec.catches_defect + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
        : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: trialRecords });
    }

    // security_auditor_v2 — phase CODE
    for (let t = 1; t <= N_MAIN; t++) {
      const tag = key + "_security_v2_trial-" + t;
      process.stdout.write("  security_v2 trial " + t + "/" + N_MAIN + " … ");
      const r = await invokeRoleMain("security_auditor",
        { project_id, phase: "CODE", spec, design, code }, project_id, tag);
      const sqli = r.ok ? sqliFindings(r.out) : [];
      const rec = {
        fixture: key, role: "security_auditor", version: "security_auditor_v2", trial: t,
        ok: r.ok, reason: r.reason || null,
        verdict: null,
        threat_level: r.ok ? r.out.threat_level : null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        catches_defect: null,
        sqli_findings: r.ok ? sqli.length : null,
        sqli_blocker: r.ok ? sqli.some(f => f.severity === "BLOCKER") : null,
        findings: r.ok ? findingsSummary(r.out) : null,
        latency_ms: r.latency, cost_usd: r.cost
      };
      results[key].security_v2.push(rec);
      trialRecords.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("threat=" + r.out.threat_level + " blockers=" + rec.blocker_count +
        " sqli=" + rec.sqli_findings + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
        : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: trialRecords });
    }
    console.log("");
  }

  // ── A/B BASELINE ──────────────────────────────────────────────────────────
  console.log("── A/B BASELINE (retired prompts, agent.invoke, assembly mirrored) ──");
  const baseline = { reviewer_v2_DF1: [], security_v1_DF3: [] };

  // reviewer_v2 on DF-1
  {
    const { spec, design, code } = loadFixtureInputs("DF-1");
    const project_id = VISION_PROJECT;
    const inputData  = { phase: "B", spec, design, code };
    for (let t = 1; t <= N_BASE; t++) {
      const tag = "baseline_DF-1_reviewer_v2_trial-" + t;
      process.stdout.write("  reviewer_v2(DF-1) trial " + t + "/" + N_BASE + " … ");
      const r = await invokeBaseline("reviewer", "reviewer", "reviewer_v2", inputData, project_id, tag);
      const rec = {
        fixture: "DF-1", role: "reviewer", version: "reviewer_v2", trial: t,
        ok: r.ok, reason: r.reason || null,
        verdict: r.ok ? r.out.verdict : null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        catches_defect: r.ok ? reviewerCatchesDefect(r.out) : null,
        findings: r.ok ? findingsSummary(r.out) : null,
        latency_ms: r.latency, cost_usd: r.cost
      };
      baseline.reviewer_v2_DF1.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("verdict=" + r.out.verdict + " blockers=" + rec.blocker_count +
        " catch=" + rec.catches_defect + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
        : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: trialRecords, baseline });
    }
  }

  // security_v1 on DF-3
  {
    const { spec, design, code } = loadFixtureInputs("DF-3");
    const project_id = VISION_PROJECT;
    const inputData  = { phase: "CODE", spec, design, code };
    for (let t = 1; t <= N_BASE; t++) {
      const tag = "baseline_DF-3_security_v1_trial-" + t;
      process.stdout.write("  security_v1(DF-3) trial " + t + "/" + N_BASE + " … ");
      const r = await invokeBaseline("security_auditor", "security_auditor", "security_auditor_v1", inputData, project_id, tag);
      const sqli = r.ok ? sqliFindings(r.out) : [];
      const rec = {
        fixture: "DF-3", role: "security_auditor", version: "security_auditor_v1", trial: t,
        ok: r.ok, reason: r.reason || null,
        threat_level: r.ok ? r.out.threat_level : null,
        blocker_count: r.ok ? blockerCount(r.out) : null,
        sqli_findings: r.ok ? sqli.length : null,
        sqli_blocker: r.ok ? sqli.some(f => f.severity === "BLOCKER") : null,
        findings: r.ok ? findingsSummary(r.out) : null,
        latency_ms: r.latency, cost_usd: r.cost
      };
      baseline.security_v1_DF3.push(rec);
      writeJson(path.join(RAW, tag + ".json"),
        { tag, project_id, ok: r.ok, reason: r.reason || null, output: r.ok ? r.out : (r.raw || r.raw_text), ledger: r.ledgerEntry });
      console.log(r.ok ? ("threat=" + r.out.threat_level + " blockers=" + rec.blocker_count +
        " sqli=" + rec.sqli_findings + "  $" + r.cost.toFixed(5) + " " + r.latency + "ms")
        : ("FAILED:" + r.reason + "  $" + r.cost.toFixed(5)));
      checkBudget({ partial: trialRecords, baseline });
    }
  }

  // ── Tally + criteria ────────────────────────────────────────────────────────
  function tally(arr, predicate) {
    const met = arr.filter(r => r.ok && predicate(r)).length;
    return { met, of: arr.length };
  }
  // main N=3 → criterion passes on strict majority (>=2/3).
  function passMain(t) { return t.met >= 2; }

  const R = results;
  const perFixture = {
    "DF-1": {
      probe: "reviewer_v3 recall (missing this.changes / 404 BLOCKER)",
      reviewer_catch: tally(R["DF-1"].reviewer_v3, r => r.catches_defect === true),
      security_no_sqli: tally(R["DF-1"].security_v2, r => r.sqli_findings === 0),
      criterion: "reviewer_v3 raises BLOCKER tied to missing-404/this.changes",
    },
    "DF-2": {
      probe: "security_auditor_v2 recall (SQLi BLOCKER preserved)",
      security_sqli_blocker: tally(R["DF-2"].security_v2,
        r => r.sqli_blocker === true && ["HIGH", "CRITICAL"].indexOf(r.threat_level) !== -1),
      criterion: "security_v2 raises SQLi BLOCKER + threat_level HIGH/CRITICAL",
    },
    "DF-3": {
      probe: "security_auditor_v2 precision (no SQLi false-positive on parameterized)",
      security_no_sqli: tally(R["DF-3"].security_v2, r => r.sqli_findings === 0),
      criterion: "security_v2 raises NO SQLi finding (any severity)",
    },
    "DF-4": {
      probe: "no over-fire (both roles, clean code)",
      reviewer_no_blocker: tally(R["DF-4"].reviewer_v3, r => r.blocker_count === 0),
      security_clean: tally(R["DF-4"].security_v2,
        r => r.blocker_count === 0 && ["NONE", "LOW"].indexOf(r.threat_level) !== -1),
      criterion: "reviewer no BLOCKER AND security no BLOCKER + threat NONE/LOW",
    }
  };

  // Per-fixture PASS/FAIL on the headline criterion
  perFixture["DF-1"].PASS = passMain(perFixture["DF-1"].reviewer_catch);
  perFixture["DF-2"].PASS = passMain(perFixture["DF-2"].security_sqli_blocker);
  perFixture["DF-3"].PASS = passMain(perFixture["DF-3"].security_no_sqli);
  perFixture["DF-4"].PASS = passMain(perFixture["DF-4"].reviewer_no_blocker) &&
                            passMain(perFixture["DF-4"].security_clean);

  // ── Decisive A/B comparisons ────────────────────────────────────────────────
  const df1_v3_catch = tally(R["DF-1"].reviewer_v3, r => r.catches_defect === true);
  const df1_v2_catch = tally(baseline.reviewer_v2_DF1, r => r.catches_defect === true);
  const df3_v2_noflag = tally(R["DF-3"].security_v2, r => r.sqli_findings === 0);
  const df3_v1_flag   = tally(baseline.security_v1_DF3, r => (r.sqli_findings || 0) > 0);

  const decisive = {
    "DF-1_reviewer_catch": {
      description: "missing this.changes / 404 logic BLOCKER",
      v3_main:  { caught: df1_v3_catch.met, of: df1_v3_catch.of },
      v2_baseline: { caught: df1_v2_catch.met, of: df1_v2_catch.of },
      phase31_baseline: "reviewer_v2 MISSED this defect at PHASE-31 Gate #10 (gate31_phase31/step4_role_reviewer_output.json)",
      controlled_proof: (df1_v3_catch.met >= 2 && df1_v2_catch.met === 0)
    },
    "DF-3_security_no_false_positive": {
      description: "SQLi false-positive on parameterized (?-bound) queries",
      v2_main:  { sqli_findings_raised_in: (df3_v2_noflag.of - df3_v2_noflag.met), no_flag_in: df3_v2_noflag.met, of: df3_v2_noflag.of },
      v1_baseline: { false_positive_in: df3_v1_flag.met, of: df3_v1_flag.of },
      phase31_baseline: "security_auditor_v1 FALSE-POSITIVED SQLi BLOCKER here at PHASE-31 (gate31_phase31/step4_role_security_output.json)",
      controlled_proof: (df3_v2_noflag.met >= 2 && df3_v1_flag.met >= 1)
    }
  };

  // ── Cost / latency ──────────────────────────────────────────────────────────
  const ledgerEnd = readLedger();
  const newRows   = ledgerEnd.slice(ledgerStart);
  const totalCost = Math.round(newRows.reduce((s, e) => s + (e.cost_usd_actual || 0), 0) * 100000) / 100000;
  const latencies = newRows.map(e => e.latency_ms).filter(x => typeof x === "number");
  latencies.sort((a, b) => a - b);
  const medianLatency = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
  const repLatency = {
    count: latencies.length,
    min: latencies[0] || null,
    median: medianLatency,
    max: latencies[latencies.length - 1] || null
  };

  const allHeadlinePass =
    perFixture["DF-1"].PASS && perFixture["DF-2"].PASS &&
    perFixture["DF-3"].PASS && perFixture["DF-4"].PASS;
  const tuningObjectiveMet =
    decisive["DF-1_reviewer_catch"].controlled_proof &&
    decisive["DF-3_security_no_false_positive"].controlled_proof &&
    perFixture["DF-2"].PASS && perFixture["DF-4"].PASS;

  const result = {
    mode: "REAL_GPT4O",
    provider: PROVIDER,
    model: MODEL,
    run_ts: new Date().toISOString(),
    n_main: N_MAIN,
    n_baseline: N_BASE,
    total_calls: newRows.length,
    overall_verdict: "HONEST_EVIDENCE",
    tuning_objective_met: tuningObjectiveMet,
    all_headline_criteria_pass: allHeadlinePass,
    per_fixture: perFixture,
    decisive_comparisons: decisive,
    estimated_usd: totalCost,
    representative_latency_ms: repLatency,
    per_call_ledger: perCallLedger,
    main_trials: results,
    baseline_trials: baseline,
    notes: [
      "MAIN run via reg.invoke('role.invoke') on the registered tuned roles (reviewer_v3 / security_auditor_v2).",
      "BASELINE via reg.invoke('agent.invoke') reproducing the role's EXACT prompt assembly with the retired prompt text (reviewer_v2 / security_auditor_v1) — role files unchanged (Track A).",
      "Scoring detectors are deterministic helpers; the verbatim per-trial outputs under raw/ are the ground truth.",
      "DF-1 security + DF-2/DF-3 reviewer columns are informational controls, not the fixture's headline criterion."
    ]
  };

  writeJson(path.join(EVID, "gate35_result.json"), result);

  // ── Console summary ─────────────────────────────────────────────────────────
  console.log("\n══ GATE #10 — PHASE-35 STEP B — RESULT ═══════════════════════════════");
  console.log("  DF-1 reviewer_v3 catch (this.changes/404 BLOCKER): " +
    perFixture["DF-1"].reviewer_catch.met + "/" + perFixture["DF-1"].reviewer_catch.of +
    "   PASS=" + perFixture["DF-1"].PASS);
  console.log("       DF-1 security_v2 no-SQLi (informational): " +
    perFixture["DF-1"].security_no_sqli.met + "/" + perFixture["DF-1"].security_no_sqli.of);
  console.log("  DF-2 security_v2 SQLi BLOCKER (recall): " +
    perFixture["DF-2"].security_sqli_blocker.met + "/" + perFixture["DF-2"].security_sqli_blocker.of +
    "   PASS=" + perFixture["DF-2"].PASS);
  console.log("  DF-3 security_v2 no SQLi false-positive: " +
    perFixture["DF-3"].security_no_sqli.met + "/" + perFixture["DF-3"].security_no_sqli.of +
    "   PASS=" + perFixture["DF-3"].PASS);
  console.log("  DF-4 reviewer no-BLOCKER: " +
    perFixture["DF-4"].reviewer_no_blocker.met + "/" + perFixture["DF-4"].reviewer_no_blocker.of +
    " | security clean: " + perFixture["DF-4"].security_clean.met + "/" + perFixture["DF-4"].security_clean.of +
    "   PASS=" + perFixture["DF-4"].PASS);
  console.log("  ────────────────────────────────────────────────");
  console.log("  A/B DF-1 catch: v3 " + df1_v3_catch.met + "/" + df1_v3_catch.of +
    "  vs  v2 " + df1_v2_catch.met + "/" + df1_v2_catch.of +
    "   (proof=" + decisive["DF-1_reviewer_catch"].controlled_proof + ")");
  console.log("  A/B DF-3 no-FP: v2 no-flag " + df3_v2_noflag.met + "/" + df3_v2_noflag.of +
    "  vs  v1 false-positive " + df3_v1_flag.met + "/" + df3_v1_flag.of +
    "   (proof=" + decisive["DF-3_security_no_false_positive"].controlled_proof + ")");
  console.log("  ────────────────────────────────────────────────");
  console.log("  tuning_objective_met: " + tuningObjectiveMet);
  console.log("  total estimated cost: $" + totalCost.toFixed(5) + "  calls=" + newRows.length);
  console.log("  latency ms: min=" + repLatency.min + " median=" + repLatency.median + " max=" + repLatency.max);
  console.log("  evidence: artifacts/spikes/gate35_phase35/gate35_result.json (+ raw/ per-trial)");
  console.log("══════════════════════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err && err.stack || err);
  try {
    writeJson(path.join(EVID, "gate35_result.json"), {
      mode: "REAL_GPT4O", provider: PROVIDER, model: MODEL,
      overall_verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR",
      detail: err && err.message, running_cost_usd: Math.round(runningCost * 100000) / 100000,
      per_call_ledger: perCallLedger
    });
  } catch (_) {}
  process.exit(1);
});

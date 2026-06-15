"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP B — RESCORE (NO API CALLS, $0)
// ════════════════════════════════════════════════════════════════════════════
// Recomputes gate35 tallies from the VERBATIM per-trial raw outputs already on
// disk (artifacts/spikes/gate35_phase35/raw/*.json — the ground truth produced
// by the real gpt-4o run). The original run's SQLi detector was too loose: it
// matched the word "injection" in the free-text attack_vector AND "sqli" as a
// substring of "SQLite", inflating SQLi counts on findings that are NOT SQL
// injection (missing-auth / insecure-storage). This rescore applies the STRICT
// detector (SQLi named in the `vulnerability` field) and records BOTH counts so
// the correction is fully auditable. No model output is changed; no call is made.
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
const EVID = path.join(ROOT, "artifacts", "spikes", "gate35_phase35");
const RAW  = path.join(EVID, "raw");

// ── Detectors ────────────────────────────────────────────────────────────────
const DEFECT_RE     = /this\.changes|affected[\s-]*rows?|rows?\s*affected|row[\s-]*count|\b404\b|not[\s-]*found|non[\s-]*existent|no\s*(matching\s*)?rows?|zero\s*rows?/i;
const SQLI_STRICT   = /sql[\s_-]*injection|\bsqli\b/i;            // vulnerability field only
const SQLI_LOOSE    = /sql[\s-]*inject|sqli|injection/i;          // original (vuln + attack_vector)

function reviewerCatchesDefect(out) {
  if (!out || !Array.isArray(out.findings)) return false;
  return out.findings.some(f =>
    f && f.severity === "BLOCKER" &&
    DEFECT_RE.test([f.issue, f.recommendation, f.location].filter(Boolean).join(" ")));
}
function sqliStrict(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f => f && SQLI_STRICT.test(String(f.vulnerability || "")));
}
function sqliLoose(out) {
  if (!out || !Array.isArray(out.findings)) return [];
  return out.findings.filter(f =>
    f && SQLI_LOOSE.test([f.vulnerability, f.attack_vector].filter(Boolean).join(" ")));
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

// ── Load raw trials ──────────────────────────────────────────────────────────
const TAG_RE = /^(DF-\d)_(reviewer|security)_v(\d)_trial-(\d+)$/;

function buildRec(tag, isBaseline, body) {
  const m = tag.match(TAG_RE);
  if (!m) throw new Error("Unparseable tag: " + tag);
  const fixture   = m[1];
  const roleShort = m[2];
  const ver       = m[3];
  const trial     = Number(m[4]);
  const role      = roleShort === "reviewer" ? "reviewer" : "security_auditor";
  const version   = roleShort === "reviewer" ? "reviewer_v" + ver : "security_auditor_v" + ver;
  const out       = body.ok ? body.output : null;
  const led       = body.ledger || {};
  return {
    fixture, role, version, trial, is_baseline: isBaseline,
    ok: !!body.ok, reason: body.reason || null,
    verdict:        out && out.verdict || null,
    threat_level:   out && out.threat_level || null,
    blocker_count:  body.ok ? blockerCount(out) : null,
    catches_defect: body.ok ? reviewerCatchesDefect(out) : null,
    sqli_strict:    body.ok ? sqliStrict(out).length : null,
    sqli_loose:     body.ok ? sqliLoose(out).length : null,
    sqli_strict_blocker: body.ok ? sqliStrict(out).some(f => f.severity === "BLOCKER") : null,
    findings:       body.ok ? findingsSummary(out) : null,
    cost_usd:       (led && typeof led.cost_usd_actual === "number") ? led.cost_usd_actual : 0,
    latency_ms:     (led && typeof led.latency_ms === "number") ? led.latency_ms : null
  };
}

const files = fs.readdirSync(RAW).filter(f => f.endsWith(".json"));
const main = {};       // fixture -> { reviewer_v3:[], security_v2:[] }
const baseline = { reviewer_v2_DF1: [], security_v1_DF3: [] };
let parsed = 0, failedTrials = 0;

for (const file of files) {
  const tag  = file.replace(/\.json$/, "");
  const body = JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
  const isBaseline = tag.startsWith("baseline_");
  const innerTag = isBaseline ? tag.slice("baseline_".length) : tag;
  const rec = buildRec(innerTag, isBaseline, body);
  parsed++;
  if (!rec.ok) failedTrials++;

  if (isBaseline) {
    if (rec.fixture === "DF-1" && rec.version === "reviewer_v2") baseline.reviewer_v2_DF1.push(rec);
    else if (rec.fixture === "DF-3" && rec.version === "security_auditor_v1") baseline.security_v1_DF3.push(rec);
    else throw new Error("Unexpected baseline trial: " + tag);
  } else {
    main[rec.fixture] = main[rec.fixture] || { reviewer_v3: [], security_v2: [] };
    if (rec.role === "reviewer") main[rec.fixture].reviewer_v3.push(rec);
    else main[rec.fixture].security_v2.push(rec);
  }
}

for (const k of Object.keys(main)) {
  main[k].reviewer_v3.sort((a, b) => a.trial - b.trial);
  main[k].security_v2.sort((a, b) => a.trial - b.trial);
}
baseline.reviewer_v2_DF1.sort((a, b) => a.trial - b.trial);
baseline.security_v1_DF3.sort((a, b) => a.trial - b.trial);

// ── Tally + criteria ────────────────────────────────────────────────────────
function tally(arr, predicate) {
  return { met: arr.filter(r => r.ok && predicate(r)).length, of: arr.length };
}
function passMain(t) { return t.met >= 2; }   // strict majority of 3

const perFixture = {
  "DF-1": {
    probe: "reviewer_v3 recall — missing this.changes / 404 logic BLOCKER (the PHASE-31 reviewer_v2 miss)",
    criterion: "reviewer_v3 raises a BLOCKER tied to missing-404 / affected-row / this.changes",
    reviewer_catch:    tally(main["DF-1"].reviewer_v3, r => r.catches_defect === true),
    security_no_sqli:  tally(main["DF-1"].security_v2, r => r.sqli_strict === 0)   // informational
  },
  "DF-2": {
    probe: "security_auditor_v2 recall — genuine SQLi must still BLOCK",
    criterion: "security_v2 raises a SQLi BLOCKER (vulnerability=SQL injection) + threat_level HIGH/CRITICAL",
    security_sqli_blocker: tally(main["DF-2"].security_v2,
      r => r.sqli_strict_blocker === true && ["HIGH", "CRITICAL"].indexOf(r.threat_level) !== -1)
  },
  "DF-3": {
    probe: "security_auditor_v2 precision — NO SQLi false-positive on parameterized (?-bound) queries (the PHASE-31 security_v1 FP)",
    criterion: "security_v2 raises NO SQLi finding (vulnerability never names SQL injection)",
    security_no_sqli: tally(main["DF-3"].security_v2, r => r.sqli_strict === 0)
  },
  "DF-4": {
    probe: "no over-fire on clean, correct code (both roles)",
    criterion: "reviewer no BLOCKER AND security no BLOCKER + threat_level NONE/LOW",
    reviewer_no_blocker: tally(main["DF-4"].reviewer_v3, r => r.blocker_count === 0),
    security_clean:      tally(main["DF-4"].security_v2,
      r => r.blocker_count === 0 && ["NONE", "LOW"].indexOf(r.threat_level) !== -1)
  }
};
perFixture["DF-1"].PASS = passMain(perFixture["DF-1"].reviewer_catch);
perFixture["DF-2"].PASS = passMain(perFixture["DF-2"].security_sqli_blocker);
perFixture["DF-3"].PASS = passMain(perFixture["DF-3"].security_no_sqli);
perFixture["DF-4"].PASS = passMain(perFixture["DF-4"].reviewer_no_blocker) &&
                          passMain(perFixture["DF-4"].security_clean);

// ── Decisive A/B comparisons (strict detector) ────────────────────────────────
const df1_v3 = tally(main["DF-1"].reviewer_v3,     r => r.catches_defect === true);
const df1_v2 = tally(baseline.reviewer_v2_DF1,     r => r.catches_defect === true);
const df3_v2_noflag = tally(main["DF-3"].security_v2,    r => r.sqli_strict === 0);
const df3_v1_fp     = tally(baseline.security_v1_DF3,    r => (r.sqli_strict || 0) > 0);

const decisive = {
  "DF-1_reviewer_catch": {
    metric: "BLOCKER tied to missing this.changes / 404 not-found path",
    v3_main:     { caught: df1_v3.met, of: df1_v3.of },
    v2_baseline: { caught: df1_v2.met, of: df1_v2.of },
    phase31_baseline: "reviewer_v2 MISSED this defect at PHASE-31 (gate31_phase31/step4_role_reviewer_output.json)",
    controlled_proof: (df1_v3.met >= 2 && df1_v2.met === 0),
    attribution_note: (df1_v2.met > 0)
      ? "A/B INCONCLUSIVE: reviewer_v2 ALSO catches the defect on this fixture, so the catch cannot be attributed to the prompt tuning. Root cause: DF-1 source carries explicit giveaway comments ('BUG: ... this.changes is never inspected') that the retired prompt also reads. The PHASE-31 miss used the real multi-file build without such comments."
      : "Clean controlled proof: v3 catches, v2 misses."
  },
  "DF-3_security_no_false_positive": {
    metric: "SQLi finding (vulnerability=SQL injection) raised against parameterized queries",
    v2_main:     { no_sqli_flag: df3_v2_noflag.met, of: df3_v2_noflag.of },
    v1_baseline: { false_positive: df3_v1_fp.met, of: df3_v1_fp.of },
    phase31_baseline: "security_auditor_v1 FALSE-POSITIVED a SQLi BLOCKER here at PHASE-31 (gate31_phase31/step4_role_security_output.json)",
    controlled_proof: (df3_v2_noflag.met >= 2 && df3_v1_fp.met >= 1),
    attribution_note: (df3_v1_fp.met === 0)
      ? "A/B INCONCLUSIVE: security_auditor_v1 did NOT reproduce the SQLi false-positive on this fixture (it flagged missing-auth / input-validation instead, never naming SQL injection), so the precision win cannot be attributed to the prompt tuning. Likely cause: DF-3 design.json states the queries are 'parameterized ... already done in this build', which suppresses the original false-positive even for the retired prompt."
      : "Clean controlled proof: v2 does not false-positive, v1 does."
  }
};

// ── Cost / latency (real, from captured ledger rows) ──────────────────────────
const allRecs = []
  .concat(...Object.keys(main).map(k => main[k].reviewer_v3.concat(main[k].security_v2)))
  .concat(baseline.reviewer_v2_DF1, baseline.security_v1_DF3);
const totalCost = Math.round(allRecs.reduce((s, r) => s + (r.cost_usd || 0), 0) * 100000) / 100000;
const latencies = allRecs.map(r => r.latency_ms).filter(x => typeof x === "number").sort((a, b) => a - b);
const repLatency = {
  count:  latencies.length,
  min:    latencies[0] || null,
  median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
  max:    latencies[latencies.length - 1] || null
};

// ── Loose-vs-strict transparency table (where they disagree) ──────────────────
const detectorDeltas = allRecs
  .filter(r => r.ok && r.role === "security_auditor" && (r.sqli_loose !== r.sqli_strict))
  .map(r => ({ fixture: r.fixture, version: r.version, trial: r.trial,
               sqli_loose: r.sqli_loose, sqli_strict: r.sqli_strict,
               vulnerabilities: (r.findings || []).map(f => f.title) }));

// ── Objective assessment ──────────────────────────────────────────────────────
const mainBehaviourOK =
  perFixture["DF-1"].PASS && perFixture["DF-2"].PASS && perFixture["DF-3"].PASS;
const overfireControlOK = perFixture["DF-4"].PASS;
const abAttributionProven =
  decisive["DF-1_reviewer_catch"].controlled_proof &&
  decisive["DF-3_security_no_false_positive"].controlled_proof;

const result = {
  mode: "REAL_GPT4O",
  provider: "openai",
  model: "gpt-4o",
  rescored_at: new Date().toISOString(),
  source: "recomputed from artifacts/spikes/gate35_phase35/raw/*.json (verbatim real gpt-4o outputs); NO new API calls",
  detector_correction: {
    issue: "Original run's SQLi detector matched the free-text attack_vector and 'sqli' inside 'SQLite', over-counting SQLi on non-SQLi findings.",
    strict_rule: "vulnerability field matches /sql[\\s_-]*injection|\\bsqli\\b/i",
    loose_rule:  "vulnerability+attack_vector matches /sql[\\s-]*inject|sqli|injection/i (original, retained for audit)",
    disagreements: detectorDeltas
  },
  trials_parsed: parsed,
  failed_trials: failedTrials,
  n_main: 3,
  n_baseline: 2,
  total_calls: allRecs.length,
  overall_verdict: "HONEST_EVIDENCE",
  assessment: {
    tuned_main_behaviour_ok: mainBehaviourOK,
    overfire_control_ok: overfireControlOK,
    ab_attribution_proven: abAttributionProven,
    tuning_objective_met: (mainBehaviourOK && overfireControlOK && abAttributionProven),
    summary: "Tuned roles behave correctly on the three core objectives in the production-config main run (DF-1 logic recall 3/3, DF-2 SQLi recall 3/3, DF-3 SQLi precision 3/3). HOWEVER: (1) DF-4 over-fire control FAILS — reviewer_v3 manufactured BLOCKERs on clean code in 1/3 trials and security_v2 rated clean code MEDIUM (not NONE/LOW) in 2/3; (2) the A/B attribution is INCONCLUSIVE — the retired prompts did NOT reproduce the PHASE-31 misses on these fixtures (reviewer_v2 also caught DF-1; security_v1 did not SQLi-false-positive DF-3) because the fixtures leak the answer (DF-1 'BUG' comments; DF-3 'already parameterized' design notes)."
  },
  per_fixture: perFixture,
  decisive_comparisons: decisive,
  estimated_usd: totalCost,
  representative_latency_ms: repLatency,
  main_trials: main,
  baseline_trials: baseline
};

fs.writeFileSync(path.join(EVID, "gate35_result.json"), JSON.stringify(result, null, 2), "utf8");

// ── Console ───────────────────────────────────────────────────────────────────
function fmt(t) { return t.met + "/" + t.of; }
console.log("\n══ PHASE-35 STEP B — RESCORED (strict detector, $0, from raw) ══════════");
console.log("  trials parsed:", parsed, " failed:", failedTrials, " calls:", allRecs.length);
console.log("  ── MAIN RUN (tuned prompts, production config) ──");
console.log("  DF-1 reviewer_v3 catch (this.changes/404 BLOCKER): " + fmt(perFixture["DF-1"].reviewer_catch) + "  PASS=" + perFixture["DF-1"].PASS);
console.log("       DF-1 security_v2 no-SQLi (informational):     " + fmt(perFixture["DF-1"].security_no_sqli));
console.log("  DF-2 security_v2 SQLi BLOCKER (recall):            " + fmt(perFixture["DF-2"].security_sqli_blocker) + "  PASS=" + perFixture["DF-2"].PASS);
console.log("  DF-3 security_v2 no SQLi false-positive:           " + fmt(perFixture["DF-3"].security_no_sqli) + "  PASS=" + perFixture["DF-3"].PASS);
console.log("  DF-4 reviewer no-BLOCKER: " + fmt(perFixture["DF-4"].reviewer_no_blocker) +
            " | security clean(NONE/LOW,no-BLOCKER): " + fmt(perFixture["DF-4"].security_clean) + "  PASS=" + perFixture["DF-4"].PASS);
console.log("  ── A/B BASELINE (controlled attribution) ──");
console.log("  DF-1 catch:  v3 " + fmt(df1_v3) + "  vs  v2 " + fmt(df1_v2) +
            "   proof=" + decisive["DF-1_reviewer_catch"].controlled_proof);
console.log("  DF-3 no-FP:  v2 no-flag " + fmt(df3_v2_noflag) + "  vs  v1 false-positive " + fmt(df3_v1_fp) +
            "   proof=" + decisive["DF-3_security_no_false_positive"].controlled_proof);
console.log("  ── SQLi detector loose→strict disagreements (corrected) ──");
detectorDeltas.forEach(d => console.log("    " + d.fixture + " " + d.version + " trial-" + d.trial +
  ": loose=" + d.sqli_loose + " strict=" + d.sqli_strict + "  vulns=[" + d.vulnerabilities.join(", ") + "]"));
console.log("  ── assessment ──");
console.log("  tuned_main_behaviour_ok:", mainBehaviourOK);
console.log("  overfire_control_ok:    ", overfireControlOK);
console.log("  ab_attribution_proven:  ", abAttributionProven);
console.log("  tuning_objective_met:   ", result.assessment.tuning_objective_met);
console.log("  total cost: $" + totalCost.toFixed(5) + "  latency ms min/median/max: " +
            repLatency.min + "/" + repLatency.median + "/" + repLatency.max);
console.log("  evidence: artifacts/spikes/gate35_phase35/gate35_result.json (REWRITTEN, corrected)");
console.log("══════════════════════════════════════════════════════════════════════\n");

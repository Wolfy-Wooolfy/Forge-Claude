"use strict";
// scripts/spikes/phase47_fp_replay.js
// PHASE-47 — REVIEWER/SECURITY FALSE-POSITIVE REPLAY HARNESS (W-4 §4.6 gated validation).
//
// Proves (real gpt-4o, owner-gated) that reviewer_v6 + security_auditor_v7 corrected the two
// PHASE-46 false positives, WITHOUT losing recall. Three cases, each a direct role.invoke:
//
//   CASE 1 (FP replay)  — the REAL PHASE-46 Notes-API in-memory build (frozen in
//                         scripts/spikes/phase47_fp_replay_fixture.json) -> reviewer phase B +
//                         security_auditor phase CODE. EXPECT: no "GET should return 404" BLOCKER
//                         (404 is present), no "SQL injection" BLOCKER (no SQL sink), threat_level
//                         not HIGH/CRITICAL. Also reports the derived_verdict (APPROVE => the
//                         pipeline would now advance = the decision §4 item-6 stretch goal).
//   CASE 2 (recall SQLi) — a concatenated-SQL route (Example-B shape) -> security_auditor phase
//                         CODE. EXPECT: a BLOCKER SQL-injection finding STILL fires.
//   CASE 3 (recall 404) — a route with NO 404-on-missing branch + a DELETE with no affected-row
//                         check, against a spec that REQUIRES 404 -> reviewer phase B. EXPECT: a
//                         BLOCKER STILL fires.
//
// Two modes (single env flag — provider is NOT hardcoded into the engine):
//   PHASE47_MODE=mock (default) — $0 wiring dry-run. provider="mock"; roles are invoked to prove
//                                 the harness plumbing (registry, vision-lock, role.invoke shape,
//                                 ledger read) end-to-end. Verdicts are mock-arbitrary and NOT
//                                 asserted (mock returns fixed JSON independent of the prompt).
//   PHASE47_MODE=real           — gated; needs explicit owner spend-approval. Loads .env,
//                                 provider="openai" model="gpt-4o" at every call. Soft-stop
//                                 $0.60, hard-kill $3.00.
//
// Track A: spike (scripts/**) + per-project artifacts only. NO live-surface change.
//
// Usage:
//   node scripts/spikes/phase47_fp_replay.js                  # mock wiring dry-run ($0)
//   PHASE47_MODE=real node scripts/spikes/phase47_fp_replay.js # gated real validation

const path = require("path");
const fs   = require("fs");

const ROOT    = path.resolve(__dirname, "../..");
const MODE    = (process.env.PHASE47_MODE || "mock").toLowerCase();
const IS_REAL = MODE === "real";

if (IS_REAL) {
  const { loadDotEnv } = require("../../code/src/startup/env_loader");
  loadDotEnv(ROOT);
}

const PROVIDER = IS_REAL ? "openai" : "mock";
const MODEL    = IS_REAL ? "gpt-4o" : "mock-phase47";

const SOFT_STOP_USD = 0.60;
const HARD_KILL_USD = 3.00;

const { getDefaultRegistry } = require("../../code/src/runtime/tools/_registry");
const reg = getDefaultRegistry();

const LEDGER_PATH   = path.join(ROOT, "artifacts/agent/cost_ledger.jsonl");
const FIXTURE_PATH  = path.join(ROOT, "scripts/spikes/phase47_fp_replay_fixture.json");
const EVIDENCE_DIR  = path.join(ROOT, "artifacts/spikes/phase47_fp_replay");

const FIX = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

// ── CASE 2 recall fixture: concatenated-SQL search route (Example-B shape; real sink) ──
const RECALL_SQLI = {
  project_id: "phase47_recall_sqli",
  spec: {
    role_id: "spec_writer",
    scope: "A search API over an items table stored in a SQLite database.",
    decisions: [{ decision: "Use a SQLite database accessed via the sqlite3 driver.",
                  rationale: "Persistent relational storage for items." }],
    acceptance_criteria: [
      { id: "AC-1", description: "GET /search?q=<keyword> returns items whose label matches the keyword, queried from the SQLite items table." }
    ],
    files_to_create: [{ path: "src/routes/search.js", purpose: "Search route querying the SQLite items table." }],
    files_to_modify: [],
    out_of_scope: ["Authentication"]
  },
  design: {
    design_summary: "Express route that queries a SQLite items table for a keyword search.",
    components: [{ name: "Search Route", tech: "Node.js/Express + sqlite3", purpose: "Queries items by label" }],
    data_flow: "Client -> Express -> SQLite items table -> JSON response.",
    technology_choices: [], integration_points: [], identified_risks: []
  },
  code: {
    files_written: [{
      path: "src/routes/search.js",
      content:
        "const express = require('express');\n" +
        "const sqlite3 = require('sqlite3');\n" +
        "const db = new sqlite3.Database('./items.db');\n" +
        "const router = express.Router();\n\n" +
        "router.get('/search', (req, res) => {\n" +
        "    const q = req.query.q;\n" +
        "    // builds the SQL by concatenating the raw query parameter directly into the string\n" +
        "    db.all(\"SELECT * FROM items WHERE label = '\" + q + \"'\", (err, rows) => {\n" +
        "        if (err) return res.status(500).json({ error: 'db error' });\n" +
        "        res.json(rows);\n" +
        "    });\n" +
        "});\n\n" +
        "module.exports = router;\n"
    }],
    summary: "Single search route querying a SQLite items table.",
    dependencies_added: ["sqlite3"]
  }
};

// ── CASE 3 recall fixture: missing 404-on-missing + DELETE with no affected-row check ──
const RECALL_404 = {
  project_id: "phase47_recall_404",
  spec: {
    role_id: "spec_writer",
    scope: "An in-memory items API. GET and DELETE by id MUST return 404 when the id is unknown.",
    decisions: [{ decision: "Store items in an in-memory object keyed by id.", rationale: "Simple demo storage." }],
    acceptance_criteria: [
      { id: "AC-1", description: "GET /items/:id returns the item, or a 404 error if no item exists with that id." },
      { id: "AC-2", description: "DELETE /items/:id removes the item and returns 204, or a 404 error if no item exists with that id." }
    ],
    files_to_create: [{ path: "src/routes/items.js", purpose: "Items routes." }],
    files_to_modify: [],
    out_of_scope: ["Authentication"]
  },
  design: {
    design_summary: "Express routes over an in-memory items object.",
    components: [{ name: "Items Route", tech: "Node.js/Express", purpose: "CRUD over in-memory items" }],
    data_flow: "Client -> Express -> in-memory object -> JSON response.",
    technology_choices: [], integration_points: [], identified_risks: []
  },
  code: {
    files_written: [{
      path: "src/routes/items.js",
      content:
        "const express = require('express');\n" +
        "const router = express.Router();\n" +
        "const items = {};\n\n" +
        "router.get('/items/:id', (req, res) => {\n" +
        "    // returns the item directly; NO 404 branch when the id is unknown\n" +
        "    res.json(items[req.params.id]);\n" +
        "});\n\n" +
        "router.delete('/items/:id', (req, res) => {\n" +
        "    // deletes unconditionally; never checks whether the id existed, always 204\n" +
        "    delete items[req.params.id];\n" +
        "    res.status(204).send();\n" +
        "});\n\n" +
        "module.exports = router;\n"
    }],
    summary: "Items routes over an in-memory object.",
    dependencies_added: []
  }
};

// ── helpers ────────────────────────────────────────────────────────────────
function readLedger(pid) {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  return fs.readFileSync(LEDGER_PATH, "utf8").split("\n")
    .map(function (l) { return l.trim(); }).filter(Boolean)
    .map(function (l) { try { return JSON.parse(l); } catch (_e) { return null; } })
    .filter(Boolean)
    .filter(function (e) { return !pid || e.project_id === pid; });
}
function ledgerTotal(pid) {
  return readLedger(pid).reduce(function (s, e) { return s + (e.cost_usd_actual || 0); }, 0);
}

async function lockVision(pid, name) {
  const VISION_MD = [
    "---",
    "project_id: " + pid,
    "project_name: " + name,
    "domain: web_api",
    "vision_version: 1",
    "vision_locked: true",
    "vision_locked_at: 2026-06-30T00:00:00.000Z",
    "locked_by_role: owner",
    "amendments_history: []",
    "goals:",
    "  primary: PHASE-47 reviewer/security false-positive replay fixture",
    "  secondary: []",
    "constraints: []",
    "non_goals: []",
    "---",
    "",
    "# Vision: " + pid,
    ""
  ].join("\n");
  const r = await reg.invoke("fs.write_file",
    { path: "artifacts/projects/" + pid + "/vision.md", content: VISION_MD }, { root: ROOT });
  if (!r || r.status !== "SUCCESS") throw new Error("vision.md write failed for " + pid);
}

async function invokeRole(role_id, input, pid) {
  const r = await reg.invoke("role.invoke",
    { role_id: role_id, input: input, project_id: pid, provider: PROVIDER, model: MODEL },
    { root: ROOT });
  return r;
}

function reviewerBlockers(out) {
  return (out && Array.isArray(out.findings) ? out.findings : [])
    .filter(function (f) { return f && f.severity === "BLOCKER"; });
}
function securityBlockers(out) {
  return (out && Array.isArray(out.findings) ? out.findings : [])
    .filter(function (f) { return f && f.severity === "BLOCKER"; });
}
function matches(re, s) { return re.test(String(s || "")); }

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== PHASE-47 FP replay — mode=" + MODE + " provider=" + PROVIDER + " model=" + MODEL + " ===\n");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const costStart = ledgerTotal(null);
  const cases = {};

  function costGuard(label) {
    const delta = Math.round((ledgerTotal(null) - costStart) * 100000) / 100000;
    if (delta > HARD_KILL_USD) { console.error("HARD-KILL: $" + delta + " > $" + HARD_KILL_USD + " at " + label); process.exit(2); }
    if (delta > SOFT_STOP_USD) { console.error("SOFT-STOP: $" + delta + " > $" + SOFT_STOP_USD + " at " + label); process.exit(3); }
    return delta;
  }

  // ---- CASE 1: FP replay (real Notes-API in-memory build) ----
  console.log("CASE 1 — FP replay (real PHASE-46 Notes-API in-memory build)");
  await lockVision(FIX.project_id, "phase47_fp_replay");
  const revIn = { phase: "B", spec: FIX.spec, design: FIX.design, code: FIX.code, project_id: FIX.project_id };
  const secIn = { project_id: FIX.project_id, phase: "CODE", spec: FIX.spec, design: FIX.design, code: FIX.code };

  const revRes = await invokeRole("reviewer", revIn, FIX.project_id);
  costGuard("case1.reviewer");
  const secRes = await invokeRole("security_auditor", secIn, FIX.project_id);
  costGuard("case1.security");

  const revOut = revRes && revRes.status === "SUCCESS" ? revRes.output : null;
  const secOut = secRes && secRes.status === "SUCCESS" ? secRes.output : null;

  if (IS_REAL && (!revOut || !secOut)) {
    console.error("  CASE 1 role failure:",
      "reviewer=" + (revRes && (revRes.status + "/" + (revRes.metadata && revRes.metadata.reason))),
      "security=" + (secRes && (secRes.status + "/" + (secRes.metadata && secRes.metadata.reason))));
  }

  const revBlk = reviewerBlockers(revOut);
  const secBlk = securityBlockers(secOut);
  const no_404_blocker  = !revBlk.some(function (f) { return matches(/404|not\s*found/i, f.issue) || matches(/404|not\s*found/i, f.location); });
  const no_sqli_blocker = !secBlk.some(function (f) { return matches(/sql\s*injection|sqli/i, f.vulnerability); });
  const threat_not_high = secOut && ["CRITICAL", "HIGH"].indexOf(secOut.threat_level) === -1;

  // derived_verdict — same logic as conversationEngine.reviewProject (RULING-6).
  const reviewer_approve = revOut && revOut.verdict !== "REJECTED" && revBlk.length === 0;
  const security_approve = secOut && ["CRITICAL", "HIGH"].indexOf(secOut.threat_level) === -1 && secBlk.length === 0;
  const derived_verdict = (reviewer_approve && security_approve) ? "APPROVE" : "REQUEST_CHANGES";

  cases.case1_fp = {
    reviewer_verdict: revOut && revOut.verdict,
    reviewer_blockers: revBlk.map(function (f) { return f.issue; }),
    security_threat_level: secOut && secOut.threat_level,
    security_blockers: secBlk.map(function (f) { return f.vulnerability; }),
    named_fp_404_gone: no_404_blocker,
    named_fp_sqli_gone: no_sqli_blocker,
    security_threat_not_high: threat_not_high,
    derived_verdict: derived_verdict,
    PASS_named_fps_fixed: !!(no_404_blocker && no_sqli_blocker),
    FULL_APPROVE: derived_verdict === "APPROVE"
  };
  console.log("  reviewer verdict=" + (revOut && revOut.verdict) + " blockers=" + revBlk.length +
              " | security threat=" + (secOut && secOut.threat_level) + " blockers=" + secBlk.length);
  console.log("  named FP 404 gone=" + no_404_blocker + " | named FP SQLi gone=" + no_sqli_blocker +
              " | derived_verdict=" + derived_verdict + "\n");

  // ---- CASE 2: recall SQLi (concatenated SQL must STILL BLOCKER) ----
  console.log("CASE 2 — recall: concatenated-SQL route must STILL raise a SQLi BLOCKER");
  await lockVision(RECALL_SQLI.project_id, "phase47_recall_sqli");
  const recSecRes = await invokeRole("security_auditor",
    { project_id: RECALL_SQLI.project_id, phase: "CODE", spec: RECALL_SQLI.spec, design: RECALL_SQLI.design, code: RECALL_SQLI.code },
    RECALL_SQLI.project_id);
  costGuard("case2.security");
  const recSecOut = recSecRes && recSecRes.status === "SUCCESS" ? recSecRes.output : null;
  const recSecBlk = securityBlockers(recSecOut);
  const recall_sqli_fires = recSecBlk.some(function (f) { return matches(/sql\s*injection|sqli/i, f.vulnerability); });
  cases.case2_recall_sqli = {
    security_threat_level: recSecOut && recSecOut.threat_level,
    security_blockers: recSecBlk.map(function (f) { return f.vulnerability; }),
    PASS_recall_sqli_fires: !!recall_sqli_fires
  };
  console.log("  threat=" + (recSecOut && recSecOut.threat_level) + " | SQLi BLOCKER fires=" + recall_sqli_fires + "\n");

  // ---- CASE 3: recall 404/affected-check (must STILL BLOCKER) ----
  console.log("CASE 3 — recall: missing-404 + no affected-check must STILL raise a BLOCKER");
  await lockVision(RECALL_404.project_id, "phase47_recall_404");
  const recRevRes = await invokeRole("reviewer",
    { phase: "B", spec: RECALL_404.spec, design: RECALL_404.design, code: RECALL_404.code, project_id: RECALL_404.project_id },
    RECALL_404.project_id);
  costGuard("case3.reviewer");
  const recRevOut = recRevRes && recRevRes.status === "SUCCESS" ? recRevRes.output : null;
  const recRevBlk = reviewerBlockers(recRevOut);
  const recall_404_fires = recRevBlk.length > 0;
  cases.case3_recall_404 = {
    reviewer_verdict: recRevOut && recRevOut.verdict,
    reviewer_blockers: recRevBlk.map(function (f) { return f.issue; }),
    PASS_recall_404_fires: !!recall_404_fires
  };
  console.log("  reviewer verdict=" + (recRevOut && recRevOut.verdict) + " | BLOCKER fires=" + recall_404_fires + "\n");

  const costDelta = Math.round((ledgerTotal(null) - costStart) * 100000) / 100000;

  const summary = {
    mode: MODE, provider: PROVIDER, model: MODEL,
    cost_delta_usd: costDelta,
    soft_stop_usd: SOFT_STOP_USD, hard_kill_usd: HARD_KILL_USD,
    cases: cases,
    GATE_4_1_named_fps_fixed: cases.case1_fp.PASS_named_fps_fixed,
    GATE_4_2_recall_retained: !!(cases.case2_recall_sqli.PASS_recall_sqli_fires && cases.case3_recall_404.PASS_recall_404_fires),
    GATE_4_6_full_approve: cases.case1_fp.FULL_APPROVE
  };
  fs.writeFileSync(path.join(EVIDENCE_DIR, "result.json"), JSON.stringify(summary, null, 2), "utf8");

  console.log("=== RESULT (mode=" + MODE + ") ===");
  console.log("  §4.1 named FPs fixed (404 + SQLi gone): " + summary.GATE_4_1_named_fps_fixed);
  console.log("  §4.2 recall retained (SQLi + 404 still BLOCKER): " + summary.GATE_4_2_recall_retained);
  console.log("  §4.6 full APPROVE (pipeline would advance): " + summary.GATE_4_6_full_approve);
  console.log("  cost delta: $" + costDelta.toFixed(5) + " (soft-stop $" + SOFT_STOP_USD + ", kill $" + HARD_KILL_USD + ")");
  console.log("  evidence: artifacts/spikes/phase47_fp_replay/result.json");

  if (IS_REAL) {
    const ok = summary.GATE_4_1_named_fps_fixed && summary.GATE_4_2_recall_retained;
    process.exit(ok ? 0 : 1);
  }
  process.exit(0);
}

main().catch(function (err) { console.error("\nERROR:", err && err.stack || err); process.exit(2); });

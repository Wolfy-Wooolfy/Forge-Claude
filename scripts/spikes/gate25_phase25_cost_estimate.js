"use strict";
// scripts/spikes/gate25_phase25_cost_estimate.js
// PHASE-25 Gate #10 — COST_ESTIMATE Bridge (real gpt-4o owner run)
//
// Validates the full estimateCost() path on the real provider:
//   loop seeded at COST_ESTIMATE with spec.json + architect_design.json
//   engine.estimateCost(project_id, loop_id, provider=openai, model=gpt-4o)
//   → role.invoke(cost_estimator) → real LLM → estimate output
//   → orchestration.advance_state(ENV_REPORT)
//
// Assertions:
//   G1: estimateCost returns advanced===true, advanced_to==="ENV_REPORT"
//   G2: estimate present and structurally valid (phases[], total_effort_*_hours,
//       external_costs[], top_risks[])
//   G3: orchestration.get_status → current_state === "ENV_REPORT"
//   G4: ledger shows real call: provider=openai, model=gpt-4o-*, cost_usd_actual>0,
//       role=cost_estimator
//   G5: total_usd ≤ $1.00
//
// Track A: ALL side effects via reg.invoke / engine. No direct fs.*Sync / new OpenAI().
//
// Usage: node scripts/spikes/gate25_phase25_cost_estimate.js
//
// Requires: OPENAI_API_KEY in .env

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");
loadDotEnv(ROOT);

const { getDefaultRegistry }        = require("../../code/src/runtime/tools/_registry");
const { createConversationEngine }  = require("../../code/src/ai_os/conversationEngine");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID   = "phase25_gate10";
const LOOP_ID      = "gate25-loop-" + Date.now();
const EVIDENCE_DIR = "artifacts/spikes/gate25_phase25";

// ── Locked vision.md for phase25_gate10 ───────────────────────────────────────

const VISION_MD = [
  "---",
  "project_id: " + PROJECT_ID,
  "project_name: phase25_gate10",
  "domain: web_api",
  "vision_version: 1",
  "vision_locked: true",
  "vision_locked_at: 2026-06-09T00:00:00.000Z",
  "locked_by_role: owner",
  "amendments_history: []",
  "goals:",
  "  primary: REST API لإدارة قائمة المهام باستخدام Node.js وSQLite",
  "  secondary: []",
  "constraints: []",
  "non_goals: []",
  "---",
  "",
  "# Vision: phase25_gate10",
  "",
  "## Goal",
  "REST API بسيط لإدارة المهام — Node.js/Express + SQLite.",
  "",
  "---",
  "*Gate #10 fixture — PHASE-25 cost estimate.*"
].join("\n");

// ── Fixture spec + design (small but realistic) ───────────────────────────────

const GATE25_SPEC = {
  scope: "REST API لإدارة قائمة المهام (Todo List) باستخدام Node.js وSQLite.",
  decisions: [
    { decision: "استخدام Express.js كإطار HTTP", rationale: "إعداد بسيط وسريع" },
    { decision: "SQLite كقاعدة بيانات", rationale: "لا حاجة لخادم منفصل" }
  ],
  acceptance_criteria: [
    { id: "AC-1", description: "POST /tasks يُعيد 201 مع بيانات المهمة عند إدخال صالح" },
    { id: "AC-2", description: "GET /tasks يُعيد قائمة المهام الحالية" },
    { id: "AC-3", description: "DELETE /tasks/:id يحذف المهمة ويُعيد 204" }
  ],
  files_to_create: [
    { path: "src/app.js",  purpose: "نقطة دخول Express مع تعريف المسارات" },
    { path: "src/db.js",   purpose: "اتصال SQLite وعمليات CRUD" },
    { path: "src/tasks.js", purpose: "منطق إدارة المهام" }
  ],
  files_to_modify: [],
  out_of_scope: ["مصادقة المستخدم", "مزامنة الوقت الحقيقي", "دعم متعدد المستخدمين"]
};

const GATE25_DESIGN = {
  design_summary: "REST API بسيط لإدارة المهام. Node.js/Express للطبقة HTTP، SQLite للتخزين.",
  components: [
    { name: "Express Server", tech: "Node.js/Express", purpose: "استقبال الطلبات HTTP وتوجيهها" },
    { name: "SQLite DB",      tech: "SQLite (better-sqlite3)", purpose: "تخزين المهام محلياً" },
    { name: "Tasks Module",   tech: "Node.js CommonJS", purpose: "منطق العمل لإدارة المهام" }
  ],
  data_flow: "Client → Express → Tasks Module → SQLite → Response",
  technology_choices: [
    { category: "language",  choice: "JavaScript (Node.js)", rationale: "لا حاجة للتجميع" },
    { category: "framework", choice: "Express 4.x",           rationale: "خفيف وشائع" },
    { category: "database",  choice: "SQLite",                rationale: "تضمين بدون خادم" }
  ],
  integration_points: [
    { name: "REST API", type: "API", notes: "JSON over HTTP على المنفذ 3000" }
  ],
  identified_risks: [
    { risk: "أداء SQLite مع حجم بيانات كبير", severity: "LOW", mitigation: "مناسب للنطاق المطلوب" }
  ]
};

// ── Assertion helpers ─────────────────────────────────────────────────────────

function assertEq(label, actual, expected) {
  const pass = actual === expected;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + label + ": " +
    JSON.stringify(actual) + (pass ? "" : " (expected " + JSON.stringify(expected) + ")"));
  return pass;
}

function assertTrue(label, cond, detail) {
  const pass = !!cond;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + label +
    (detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  return pass;
}

// ── Evidence helper ───────────────────────────────────────────────────────────

async function saveJson(reg, relPath, data) {
  const r = await reg.invoke("fs.write_file", {
    path:    relPath,
    content: JSON.stringify(data, null, 2)
  }, { root: ROOT });
  if (r.status !== "SUCCESS") {
    console.warn("  [WARN] fs.write_file(" + relPath + ") failed:",
      r.metadata && r.metadata.reason);
  }
  return r;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PHASE-25 Gate #10: COST_ESTIMATE Bridge (real gpt-4o) ===");
  console.log("ROOT:           ", ROOT);
  console.log("PROJECT_ID:     ", PROJECT_ID);
  console.log("LOOP_ID:        ", LOOP_ID);
  console.log("EVIDENCE_DIR:   ", EVIDENCE_DIR);
  console.log("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY
    ? "SET (len=" + process.env.OPENAI_API_KEY.length + ")"
    : "NOT SET");
  console.log("");

  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP: OPENAI_API_KEY not set — cannot proceed.");
    process.exit(1);
  }

  const reg    = getDefaultRegistry();
  const engine = createConversationEngine({ root: ROOT });
  const assertions = [];

  // ── Step 0: seed project state + orchestration loop at COST_ESTIMATE ─────────

  // ── Step 0a: write locked vision.md (required by agent_budget_rule §A) ───────

  console.log("Step 0a: writing locked vision.md for", PROJECT_ID, "...");
  const visionPath = "artifacts/projects/" + PROJECT_ID + "/vision.md";
  const visionWrite = await reg.invoke("fs.write_file", {
    path:    visionPath,
    content: VISION_MD
  }, { root: ROOT });

  if (visionWrite.status !== "SUCCESS") {
    console.error("STOP: vision.md write failed:", visionWrite.metadata && visionWrite.metadata.reason);
    process.exit(1);
  }
  console.log("  vision.md written (vision_locked: true).\n");

  // ── Step 0b: seed project state + orchestration loop at COST_ESTIMATE ─────────

  console.log("Step 0b: seeding project at COST_ESTIMATE ...");

  // Write project_state.json (required by loadState in conversationEngine)
  const stateRelPath = "artifacts/projects/" + PROJECT_ID + "/project_state.json";
  await reg.invoke("fs.write_file", {
    path:    stateRelPath,
    content: JSON.stringify({
      project_id:           PROJECT_ID,
      project_name:         "Gate #10 Todo API",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    }, null, 2)
  }, { root: ROOT });

  // Advance loop to COST_ESTIMATE: start_loop(intake) → SPEC_WRITER_FORMALIZE
  //   → REVIEWER_SPEC → COST_ESTIMATE
  await reg.invoke("orchestration.start_loop", {
    project_id:          PROJECT_ID,
    loop_id:             LOOP_ID,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "REVIEWER_SPEC", transition_type: "NORMAL", role_invoked: "spec_writer"
  }, { root: ROOT });

  // Write spec.json + architect_design.json (required by estimateCost D3)
  const orchRelBase = "artifacts/projects/" + PROJECT_ID + "/orchestration/" + LOOP_ID;
  await reg.invoke("fs.write_file", {
    path:    orchRelBase + "/spec.json",
    content: JSON.stringify(GATE25_SPEC, null, 2)
  }, { root: ROOT });
  await reg.invoke("fs.write_file", {
    path:    orchRelBase + "/architect_design.json",
    content: JSON.stringify(GATE25_DESIGN, null, 2)
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });

  console.log("  Loop seeded at COST_ESTIMATE. spec.json + architect_design.json written.");

  // ── Step 1: engine.estimateCost (real path — no scenario_id → real gpt-4o) ───

  console.log("\nStep 1: engine.estimateCost(openai/gpt-4o, no scenario_id) ...");
  const estimateStart = Date.now();

  const estimateResult = await engine.estimateCost({
    project_id:        PROJECT_ID,
    loop_id:           LOOP_ID,
    estimate_provider: "openai",
    estimate_model:    "gpt-4o"
    // no estimate_scenario_id → real LLM call
  });

  const estimateDuration = Date.now() - estimateStart;
  console.log("  advanced:    ", estimateResult.advanced);
  console.log("  advanced_to: ", estimateResult.advanced_to);
  console.log("  duration:    ", estimateDuration + "ms");
  if (estimateResult.estimate_error) {
    console.log("  estimate_error:", estimateResult.estimate_error);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step1_estimate_result.json",
    { estimateResult, estimateDuration });

  // G1: advanced and advanced_to
  const g1a = assertEq("G1a advanced", estimateResult.advanced, true);
  assertions.push({ id: "G1a", pass: g1a });

  const g1b = assertEq("G1b advanced_to", estimateResult.advanced_to, "ENV_REPORT");
  assertions.push({ id: "G1b", pass: g1b });

  if (!g1a || !g1b) {
    const detail = estimateResult.estimate_error || "no detail";
    console.error("STOP: estimateCost failed — detail:", detail);
    await saveJson(reg, EVIDENCE_DIR + "/gate25_result.json",
      { verdict: "FAIL", assertions, detail });
    process.exit(1);
  }

  // G2: estimate structurally valid
  const est = estimateResult.estimate;
  console.log("\n  estimate.summary:", est && est.summary);
  console.log("  phases count:", Array.isArray(est && est.phases) ? est.phases.length : 0);
  console.log("  effort range: " +
    (est ? est.total_effort_low_hours + "–" + est.total_effort_high_hours + " hours" : "N/A"));
  console.log("");

  const g2a = assertTrue("G2a estimate.phases is Array(length>=1)",
    Array.isArray(est && est.phases) && est.phases.length >= 1,
    Array.isArray(est && est.phases) ? "length=" + est.phases.length : "missing");
  assertions.push({ id: "G2a", pass: g2a });

  const g2b = assertTrue("G2b total_effort_mid_hours > 0",
    typeof (est && est.total_effort_mid_hours) === "number" && est.total_effort_mid_hours > 0,
    est && est.total_effort_mid_hours);
  assertions.push({ id: "G2b", pass: g2b });

  const g2c = assertTrue("G2c estimate.external_costs is Array",
    Array.isArray(est && est.external_costs),
    Array.isArray(est && est.external_costs) ? "length=" + est.external_costs.length : "missing");
  assertions.push({ id: "G2c", pass: g2c });

  const g2d = assertTrue("G2d estimate.top_risks is Array",
    Array.isArray(est && est.top_risks),
    Array.isArray(est && est.top_risks) ? "length=" + est.top_risks.length : "missing");
  assertions.push({ id: "G2d", pass: g2d });

  // G3: loop current_state === "ENV_REPORT"
  console.log("Step 2: verify loop state after advance ...");
  const statusResult = await reg.invoke("orchestration.get_status", {
    project_id: PROJECT_ID,
    loop_id:    LOOP_ID
  }, { root: ROOT });

  const loopState = statusResult.status === "SUCCESS"
    ? statusResult.output.current_state : null;
  console.log("  loop current_state:", loopState);

  const g3 = assertEq("G3 loop current_state === ENV_REPORT", loopState, "ENV_REPORT");
  assertions.push({ id: "G3", pass: g3 });

  await saveJson(reg, EVIDENCE_DIR + "/step2_loop_state.json", { loopState, statusResult });

  // G4 + G5: ledger — real call evidence
  console.log("\nStep 3: reading ledger ...");
  const ledger = await reg.invoke("agent.read_ledger",
    { project_id: PROJECT_ID }, { root: ROOT });

  let totalUsd     = 0;
  let ledgerEntries = [];
  if (ledger.status === "SUCCESS") {
    totalUsd      = ledger.output.total_cost;
    ledgerEntries = ledger.output.entries;
    console.log("  total_usd:      $" + totalUsd);
    console.log("  ledger entries: " + ledger.output.count);
    for (const e of ledgerEntries) {
      console.log("  entry: provider=" + e.provider + " model=" + e.model +
        " cost=$" + e.cost_usd_actual + " role=" + e.role);
    }
  } else {
    console.warn("  [WARN] ledger read failed:", ledger.metadata && ledger.metadata.reason);
  }

  if (totalUsd >= 3.00) {
    console.error("STOP: total_usd $" + totalUsd + " approaching kill bar $3.00");
    process.exit(1);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step3_ledger.json", ledger);

  // G4: real cost_estimator call in ledger
  const costEstimatorEntry = ledgerEntries.find(e =>
    e.provider === "openai" &&
    typeof e.model === "string" && e.model.startsWith("gpt-4o") &&
    typeof e.cost_usd_actual === "number" && e.cost_usd_actual > 0 &&
    e.role === "cost_estimator"
  );

  const g4 = assertTrue("G4 ledger has real cost_estimator entry (openai/gpt-4o, cost>0)",
    !!costEstimatorEntry,
    costEstimatorEntry
      ? "provider=" + costEstimatorEntry.provider + " model=" + costEstimatorEntry.model +
        " cost=$" + costEstimatorEntry.cost_usd_actual
      : "no matching entry found");
  assertions.push({ id: "G4", pass: g4 });

  const g5 = assertTrue("G5 total_usd ≤ $1.00", totalUsd <= 1.00, "$" + totalUsd);
  assertions.push({ id: "G5", pass: g5 });

  // ── Summary + evidence ────────────────────────────────────────────────────────

  const passCount = assertions.filter(a => a.pass).length;
  const allPass   = passCount === assertions.length;
  const verdict   = allPass ? "PASS" : "FAIL";

  console.log("");
  console.log("=== Gate #10 Result ===");
  console.log("verdict:    " + verdict);
  console.log("assertions: " + passCount + "/" + assertions.length);
  console.log("total_usd:  $" + totalUsd);

  const gateResult = {
    ts:              new Date().toISOString(),
    verdict,
    assertions,
    pass_count:      passCount,
    total:           assertions.length,
    total_usd:       totalUsd,
    project_id:      PROJECT_ID,
    loop_id:         LOOP_ID,
    loop_state_final: loopState,
    estimate_summary: est && est.summary,
    estimate_effort_mid_hours: est && est.total_effort_mid_hours,
    ledger_entry:    costEstimatorEntry || null
  };

  await saveJson(reg, EVIDENCE_DIR + "/gate25_result.json", gateResult);

  if (!allPass) {
    console.error("\nSome assertions FAILED — see above.");
    process.exit(1);
  }

  console.log("\n✓ Gate #10 PASS — real gpt-4o produced valid cost estimate; loop → ENV_REPORT.");
  console.log("Evidence: " + EVIDENCE_DIR + "/gate25_result.json");
  console.log("\nAwaiting CTO final verification before closure.");
}

main().catch(function (err) {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});

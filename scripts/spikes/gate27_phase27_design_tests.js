"use strict";
// scripts/spikes/gate27_phase27_design_tests.js
// PHASE-27 Gate #10 — TEST_DESIGN Bridge (real gpt-4o owner run)
//
// Validates the full design-tests path on the real provider:
//   loop seeded at TEST_DESIGN with spec.json + architect_design.json
//   engine.designTests(project_id, loop_id, provider=openai, model=gpt-4o)
//   → role.invoke(test_designer) → real LLM → test plan output + persisted
//   → loop advances to BUILDER (no gate)
//
// Assertions:
//   G1a: designTests returns advanced:true
//   G1b: designTests returns advanced_to:"BUILDER"
//   G2a: test_plan present (result.test_plan.scenarios is Array)
//   G2b: scenarios[0] has required fields (id, name, description, category,
//        setup, execution, assertions, teardown, metadata)
//   G2c: coverage_summary has acs_total, acs_covered, gaps[]
//   G3:  test_plan.json written on disk + parseable
//   G4:  orchestration.get_status → current_state === "BUILDER"
//        (independent read — confirms advance happened)
//   G5:  ledger has real entry: provider=openai, model=gpt-4o-*, role=test_designer,
//        cost_usd_actual > 0
//   G6:  total_usd ≤ $1.00
//
// Track A: ALL side effects via reg.invoke / engine. No direct fs.*Sync / new OpenAI().
//
// Usage: node scripts/spikes/gate27_phase27_design_tests.js
//
// Requires: OPENAI_API_KEY in .env

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");
loadDotEnv(ROOT);

const { getDefaultRegistry }       = require("../../code/src/runtime/tools/_registry");
const { createConversationEngine } = require("../../code/src/ai_os/conversationEngine");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID   = "phase27_gate10";
const LOOP_ID      = "gate27-loop-" + Date.now();
const EVIDENCE_DIR = "artifacts/spikes/gate27_phase27";

// ── Locked vision.md for phase27_gate10 ───────────────────────────────────────

const VISION_MD = [
  "---",
  "project_id: " + PROJECT_ID,
  "project_name: phase27_gate10",
  "domain: web_api",
  "vision_version: 1",
  "vision_locked: true",
  "vision_locked_at: 2026-06-10T00:00:00.000Z",
  "locked_by_role: owner",
  "amendments_history: []",
  "goals:",
  "  primary: REST API لإدارة قائمة المهام باستخدام Node.js وSQLite",
  "  secondary: []",
  "constraints: []",
  "non_goals: []",
  "---",
  "",
  "# Vision: phase27_gate10",
  "",
  "## Goal",
  "REST API بسيط لإدارة المهام — Node.js/Express + SQLite.",
  "",
  "---",
  "*Gate #10 fixture — PHASE-27 test design.*"
].join("\n");

// ── Fixture spec + design (reused from gate26 for consistency) ─────────────────

const GATE27_SPEC = {
  scope: "REST API لإدارة قائمة المهام (Todo List) باستخدام Node.js وSQLite.",
  decisions: [
    { decision: "استخدام Express.js كإطار HTTP", rationale: "إعداد بسيط وسريع" },
    { decision: "SQLite كقاعدة بيانات",          rationale: "لا حاجة لخادم منفصل" }
  ],
  acceptance_criteria: [
    { id: "AC-1", description: "POST /tasks يُعيد 201 مع بيانات المهمة عند إدخال صالح" },
    { id: "AC-2", description: "GET /tasks يُعيد قائمة المهام الحالية" },
    { id: "AC-3", description: "DELETE /tasks/:id يحذف المهمة ويُعيد 204" }
  ],
  files_to_create: [
    { path: "src/app.js",   purpose: "نقطة دخول Express مع تعريف المسارات" },
    { path: "src/db.js",    purpose: "اتصال SQLite وعمليات CRUD" },
    { path: "src/tasks.js", purpose: "منطق إدارة المهام" }
  ],
  files_to_modify: [],
  out_of_scope: ["مصادقة المستخدم", "مزامنة الوقت الحقيقي", "دعم متعدد المستخدمين"]
};

const GATE27_DESIGN = {
  design_summary: "REST API بسيط لإدارة المهام. Node.js/Express للطبقة HTTP، SQLite للتخزين.",
  components: [
    { name: "Express Server", tech: "Node.js/Express",         purpose: "استقبال الطلبات HTTP وتوجيهها" },
    { name: "SQLite DB",      tech: "SQLite (better-sqlite3)", purpose: "تخزين المهام محلياً" },
    { name: "Tasks Module",   tech: "Node.js CommonJS",        purpose: "منطق العمل لإدارة المهام" }
  ],
  data_flow: "Client → Express → Tasks Module → SQLite → Response",
  technology_choices: [
    { category: "language",  choice: "JavaScript (Node.js)", rationale: "لا حاجة للتجميع" },
    { category: "framework", choice: "Express 4.x",          rationale: "خفيف وشائع" },
    { category: "database",  choice: "SQLite",               rationale: "تضمين بدون خادم" }
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
  console.log("=== PHASE-27 Gate #10: TEST_DESIGN Bridge (real gpt-4o) ===");
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

  const reg        = getDefaultRegistry();
  const engine     = createConversationEngine({ root: ROOT });
  const assertions = [];

  // ── Step 0a: write locked vision.md ──────────────────────────────────────────

  console.log("Step 0a: writing locked vision.md for", PROJECT_ID, "...");
  const visionPath  = "artifacts/projects/" + PROJECT_ID + "/vision.md";
  const visionWrite = await reg.invoke("fs.write_file", {
    path:    visionPath,
    content: VISION_MD
  }, { root: ROOT });

  if (visionWrite.status !== "SUCCESS") {
    console.error("STOP: vision.md write failed:", visionWrite.metadata && visionWrite.metadata.reason);
    process.exit(1);
  }
  console.log("  vision.md written (vision_locked: true).\n");

  // ── Step 0b: seed project state + advance loop to TEST_DESIGN ─────────────────

  console.log("Step 0b: seeding project at TEST_DESIGN ...");

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

  // Advance chain: start_loop(intake) → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC
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

  // Write spec.json + architect_design.json (read by designTests)
  const orchRelBase = "artifacts/projects/" + PROJECT_ID + "/orchestration/" + LOOP_ID;
  await reg.invoke("fs.write_file", {
    path:    orchRelBase + "/spec.json",
    content: JSON.stringify(GATE27_SPEC, null, 2)
  }, { root: ROOT });
  await reg.invoke("fs.write_file", {
    path:    orchRelBase + "/architect_design.json",
    content: JSON.stringify(GATE27_DESIGN, null, 2)
  }, { root: ROOT });

  // Continue advance chain: → COST_ESTIMATE → ENV_REPORT
  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "ENV_REPORT", transition_type: "NORMAL", role_invoked: "cost_estimator"
  }, { root: ROOT });

  // Gate 1 APPROVE: ENV_REPORT → TEST_DESIGN
  await reg.invoke("orchestration.respond", {
    project_id: PROJECT_ID,
    loop_id:    LOOP_ID,
    gate_id:    1,
    response:   "APPROVE"
  }, { root: ROOT });

  // Verify seeding landed at TEST_DESIGN
  const seedCheck = await reg.invoke("orchestration.get_status", {
    project_id: PROJECT_ID, loop_id: LOOP_ID
  }, { root: ROOT });
  const seedState = seedCheck.status === "SUCCESS"
    ? seedCheck.output.current_state : null;
  console.log("  Loop seeded. current_state:", seedState);
  if (seedState !== "TEST_DESIGN") {
    console.error("STOP: seeding failed — expected TEST_DESIGN, got", seedState);
    process.exit(1);
  }
  console.log("  spec.json + architect_design.json written.\n");

  // ── Step 1: engine.designTests (real path — no scenario_id → real gpt-4o) ──────

  console.log("Step 1: engine.designTests(openai/gpt-4o, no scenario_id) ...");
  const testStart = Date.now();

  const testResult = await engine.designTests({
    project_id:    PROJECT_ID,
    loop_id:       LOOP_ID,
    test_provider: "openai",
    test_model:    "gpt-4o"
    // no test_scenario_id → real LLM call
  });

  const testDuration = Date.now() - testStart;
  console.log("  advanced:      ", testResult.advanced);
  console.log("  advanced_to:   ", testResult.advanced_to);
  console.log("  model_used:    ", testResult.model_used);
  console.log("  duration:      ", testDuration + "ms");
  if (testResult.test_error) {
    console.log("  test_error:    ", testResult.test_error);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step1_design_tests_result.json",
    { testResult: Object.assign({}, testResult, {
        test_plan: testResult.test_plan ? {
          scenarios_count:  testResult.test_plan.scenarios
            ? testResult.test_plan.scenarios.length : 0,
          coverage_summary: testResult.test_plan.coverage_summary
        } : null
      }),
      testDuration });

  // G1a: advanced === true
  const g1a = assertEq("G1a advanced===true", testResult.advanced, true);
  assertions.push({ id: "G1a", pass: g1a });

  // G1b: advanced_to === "BUILDER"
  const g1b = assertEq("G1b advanced_to===BUILDER", testResult.advanced_to, "BUILDER");
  assertions.push({ id: "G1b", pass: g1b });

  if (!g1a || !g1b) {
    const detail = testResult.test_error || "no detail";
    console.error("STOP: designTests failed — detail:", detail);
    await saveJson(reg, EVIDENCE_DIR + "/gate27_result.json",
      { verdict: "FAIL", assertions, detail });
    process.exit(1);
  }

  // G2: test_plan structure
  const plan = testResult.test_plan;
  console.log("\n  test_plan.scenarios count:     ",
    Array.isArray(plan && plan.scenarios) ? plan.scenarios.length : "missing");
  console.log("  coverage_summary.acs_total:    ",
    plan && plan.coverage_summary ? plan.coverage_summary.acs_total : "missing");
  console.log("  coverage_summary.acs_covered:  ",
    plan && plan.coverage_summary ? plan.coverage_summary.acs_covered : "missing");
  console.log("  coverage_summary.gaps count:   ",
    plan && plan.coverage_summary && Array.isArray(plan.coverage_summary.gaps)
      ? plan.coverage_summary.gaps.length : "missing");
  console.log("");

  const g2a = assertTrue("G2a test_plan.scenarios is Array",
    Array.isArray(plan && plan.scenarios),
    Array.isArray(plan && plan.scenarios)
      ? "length=" + plan.scenarios.length : "missing");
  assertions.push({ id: "G2a", pass: g2a });

  // G2b: scenarios[0] has all required fields
  const s0 = plan && plan.scenarios && plan.scenarios[0];
  const s0RequiredFields = ["id", "name", "description", "category", "setup",
    "execution", "assertions", "teardown", "metadata"];
  const s0HasAllFields = s0 && s0RequiredFields.every(function (f) {
    return Object.prototype.hasOwnProperty.call(s0, f);
  });
  const missingFields = s0 ? s0RequiredFields.filter(function (f) {
    return !Object.prototype.hasOwnProperty.call(s0, f);
  }) : ["(no scenario)"];
  const g2b = assertTrue("G2b scenarios[0] has required fields",
    !!s0HasAllFields,
    s0HasAllFields ? "all 9 fields present" : "missing: " + missingFields.join(","));
  assertions.push({ id: "G2b", pass: g2b });

  // G2c: coverage_summary has acs_total, acs_covered, gaps[]
  const cs = plan && plan.coverage_summary;
  const g2c = assertTrue("G2c coverage_summary has acs_total + acs_covered + gaps[]",
    cs && typeof cs.acs_total === "number" &&
      typeof cs.acs_covered === "number" &&
      Array.isArray(cs.gaps),
    cs ? "acs_total=" + cs.acs_total + " acs_covered=" + cs.acs_covered +
         " gaps.length=" + (Array.isArray(cs.gaps) ? cs.gaps.length : "missing") : "missing");
  assertions.push({ id: "G2c", pass: g2c });

  // G3: test_plan.json written on disk + parseable
  console.log("Step 1b: verify test_plan.json written on disk ...");
  const testPlanPath   = orchRelBase + "/test_plan.json";
  const testPlanOnDisk = await reg.invoke("fs.read_file", { path: testPlanPath }, { root: ROOT });
  const testPlanExists = testPlanOnDisk && testPlanOnDisk.status === "SUCCESS";
  let   testPlanParsed = null;
  if (testPlanExists) {
    try { testPlanParsed = JSON.parse(testPlanOnDisk.output.content); } catch (_) {}
  }
  console.log("  test_plan.json on disk:", testPlanExists ? "YES" : "NO");
  console.log("  parseable:             ", testPlanParsed ? "YES" : "NO");

  const g3 = assertTrue("G3 test_plan.json written on disk + parseable",
    testPlanExists && !!testPlanParsed,
    testPlanExists ? "file exists" : "MISSING");
  assertions.push({ id: "G3", pass: g3 });

  await saveJson(reg, EVIDENCE_DIR + "/step1b_test_plan_on_disk.json",
    { path: testPlanPath, exists: testPlanExists, parseable: !!testPlanParsed,
      scenarios_count: testPlanParsed && testPlanParsed.scenarios
        ? testPlanParsed.scenarios.length : 0 });

  // G4: loop current_state === "BUILDER" (independent get_status read)
  console.log("\nStep 1c: verify loop state after designTests (must be BUILDER) ...");
  const statusAfterTest = await reg.invoke("orchestration.get_status", {
    project_id: PROJECT_ID,
    loop_id:    LOOP_ID
  }, { root: ROOT });

  const loopStateAfterTest = statusAfterTest.status === "SUCCESS"
    ? statusAfterTest.output.current_state : null;
  console.log("  loop current_state (after designTests):", loopStateAfterTest);

  const g4 = assertEq("G4 loop current_state === BUILDER",
    loopStateAfterTest, "BUILDER");
  assertions.push({ id: "G4", pass: g4 });

  await saveJson(reg, EVIDENCE_DIR + "/step1c_loop_state_after_design_tests.json",
    { loopState: loopStateAfterTest, statusResult: statusAfterTest });

  // ── Step 2: ledger — real call evidence ───────────────────────────────────────

  console.log("\nStep 2: reading ledger ...");
  const ledger = await reg.invoke("agent.read_ledger",
    { project_id: PROJECT_ID }, { root: ROOT });

  let totalUsd      = 0;
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

  await saveJson(reg, EVIDENCE_DIR + "/step2_ledger.json", ledger);

  // G5: real test_designer call in ledger
  const testDesignerEntry = ledgerEntries.find(function (e) {
    return e.provider === "openai" &&
      typeof e.model === "string" && e.model.startsWith("gpt-4o") &&
      typeof e.cost_usd_actual === "number" && e.cost_usd_actual > 0 &&
      e.role === "test_designer";
  });

  const g5 = assertTrue(
    "G5 ledger has real test_designer entry (openai/gpt-4o-*, cost>0)",
    !!testDesignerEntry,
    testDesignerEntry
      ? "provider=" + testDesignerEntry.provider +
        " model=" + testDesignerEntry.model +
        " cost=$" + testDesignerEntry.cost_usd_actual
      : "no matching entry (entries=" + ledgerEntries.length + ")");
  assertions.push({ id: "G5", pass: g5 });

  // G6: total_usd ≤ $1.00
  const g6 = assertTrue("G6 total_usd ≤ $1.00", totalUsd <= 1.00, "$" + totalUsd);
  assertions.push({ id: "G6", pass: g6 });

  // ── Summary + evidence ────────────────────────────────────────────────────────

  const passCount = assertions.filter(function (a) { return a.pass; }).length;
  const allPass   = passCount === assertions.length;
  const verdict   = allPass ? "PASS" : "FAIL";

  console.log("");
  console.log("=== Gate #10 Result ===");
  console.log("verdict:    " + verdict);
  console.log("assertions: " + passCount + "/" + assertions.length);
  console.log("total_usd:  $" + totalUsd);

  const gateResult = {
    ts:                       new Date().toISOString(),
    verdict,
    assertions,
    pass_count:               passCount,
    total:                    assertions.length,
    total_usd:                totalUsd,
    project_id:               PROJECT_ID,
    loop_id:                  LOOP_ID,
    loop_state_after_design:  loopStateAfterTest,
    test_plan_on_disk:        testPlanExists,
    test_plan_scenarios_count: testPlanParsed && testPlanParsed.scenarios
      ? testPlanParsed.scenarios.length : 0,
    coverage_summary:         plan && plan.coverage_summary,
    ledger_entry:             testDesignerEntry || null
  };

  await saveJson(reg, EVIDENCE_DIR + "/gate27_result.json", gateResult);

  if (!allPass) {
    console.error("\nSome assertions FAILED — see above.");
    console.error("Evidence: " + EVIDENCE_DIR + "/gate27_result.json");
    process.exit(1);
  }

  console.log(
    "\n[PASS] Gate #10 PASS — real gpt-4o produced valid test plan; " +
    "loop advanced TEST_DESIGN → BUILDER; test_plan.json persisted."
  );
  console.log("Evidence: " + EVIDENCE_DIR + "/gate27_result.json");
  console.log("\nAwaiting CTO final verification before closure.");
}

main().catch(function (err) {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});

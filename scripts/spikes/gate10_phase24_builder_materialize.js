"use strict";
// scripts/spikes/gate10_phase24_builder_materialize.js
// PHASE-24 Gate #10 — BUILDER Materializer (real gpt-4o owner build)
//
// Runs the full generate→materialize→run path on the phase24_gate10 fixture:
//   role.invoke(builder) → gets planner files_written (sha256:"pending")
//   builder.materialize  → codegen → writes real files (real sha256)
//   shell.run_in_workspace(["node","main.js"]) → must print "7"
//
// Assertions:
//   G1: role.invoke status === SUCCESS, files_written is Array(length>=1)
//   G2: builder.materialize status SUCCESS, files_written[0].sha256 ≠ "pending"
//   G3: shell exit_code === 0
//   G4: stdout.trim() === "7"
//   G5: total_usd ≤ $1.00
//
// Track A: ALL side effects via reg.invoke. No direct fs.*Sync / child_process / fetch / new OpenAI().
//
// Usage: node scripts/spikes/gate10_phase24_builder_materialize.js
//
// Requires: OPENAI_API_KEY in .env

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");
loadDotEnv(ROOT);

const { getDefaultRegistry } = require("../../code/src/runtime/tools/_registry");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID   = "phase24_gate10";
const EVIDENCE_DIR = "artifacts/spikes/gate10_phase24";

// ── Fixture spec: add(3,4) → prints "7" ──────────────────────────────────────

const GATE10_SPEC = {
  scope: "Print the sum of 3 and 4 using a two-file Node.js program.",
  decisions: [
    { decision: "Use CommonJS require/module.exports", rationale: "No extra dependencies" }
  ],
  acceptance_criteria: [
    { id: "AC-1", description: "node main.js prints exactly 7 (bare integer) to stdout" }
  ],
  files_to_create: [
    { path: "add.js",  purpose: "Exports function add(a, b) that returns a + b via module.exports" },
    { path: "main.js", purpose: "Requires ./add, calls add(3, 4), prints result — ONLY the bare integer, nothing else" }
  ],
  files_to_modify: [],
  out_of_scope: ["error handling", "CLI flags", "package.json", "test files"]
};

const GATE10_DESIGN = {
  design_summary:
    "Two-file Node.js program. add.js exports a pure add function via CommonJS. " +
    "main.js requires add.js, calls add(3,4), and prints only the bare integer result.",
  components: [
    { name: "add.js",  tech: "Node.js CommonJS", purpose: "Pure arithmetic: module.exports = { add }" },
    { name: "main.js", tech: "Node.js CommonJS", purpose: "Entry point: console.log(add(3,4)) only" }
  ],
  data_flow: "main.js → require('./add') → add(3,4) → console.log(7)",
  technology_choices: [
    { category: "runtime", choice: "Node.js", rationale: "Available without install; CommonJS throughout" }
  ],
  integration_points:  [],
  identified_risks:    []
};

// ── Locked vision.md content for phase24_gate10 ───────────────────────────────

const VISION_MD = [
  "---",
  "project_id: " + PROJECT_ID,
  "project_name: phase24_gate10",
  "domain: cli_tool",
  "vision_version: 1",
  "vision_locked: true",
  "vision_locked_at: 2026-06-08T00:00:00.000Z",
  "locked_by_role: owner",
  "amendments_history: []",
  "goals:",
  "  primary: Print the sum of 3 and 4 as a Node.js program",
  "  secondary: []",
  "constraints: []",
  "non_goals: []",
  "---",
  "",
  "# Vision: phase24_gate10",
  "",
  "## Goal",
  "Print the sum of 3 and 4 as a two-file Node.js program.",
  "",
  "---",
  "*Gate #10 fixture — PHASE-24 owner build.*"
].join("\n");

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
    console.warn("  [WARN] fs.write_file(" + relPath + ") failed:", r.metadata && r.metadata.reason);
  }
  return r;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PHASE-24 Gate #10: BUILDER Materializer (real gpt-4o) ===");
  console.log("ROOT:           ", ROOT);
  console.log("PROJECT_ID:     ", PROJECT_ID);
  console.log("EVIDENCE_DIR:   ", EVIDENCE_DIR);
  console.log("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY
    ? "SET (len=" + process.env.OPENAI_API_KEY.length + ")"
    : "NOT SET");
  console.log("");

  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP: OPENAI_API_KEY not set — cannot proceed.");
    process.exit(1);
  }

  const reg = getDefaultRegistry();
  const assertions = [];

  // ── Step 0: write locked vision.md for project ────────────────────────────

  console.log("Step 0: writing locked vision.md for", PROJECT_ID, "...");
  const visionPath = "artifacts/projects/" + PROJECT_ID + "/vision.md";
  const visionWrite = await reg.invoke("fs.write_file", {
    path:    visionPath,
    content: VISION_MD
  }, { root: ROOT });

  if (visionWrite.status !== "SUCCESS") {
    console.error("STOP: vision.md write failed:", visionWrite.metadata && visionWrite.metadata.reason);
    process.exit(1);
  }
  console.log("  vision.md written.\n");

  // ── Step 1: role.invoke(builder, gpt-4o) → planner output ────────────────

  console.log("Step 1: role.invoke(builder, openai/gpt-4o) ...");
  const roleStart = Date.now();

  const roleResult = await reg.invoke("role.invoke", {
    role_id:    "builder",
    input:      { project_id: PROJECT_ID, spec: GATE10_SPEC, design: GATE10_DESIGN },
    project_id: PROJECT_ID,
    provider:   "openai",
    model:      "gpt-4o"
  }, { root: ROOT, role_id: "builder" });

  const roleDuration = Date.now() - roleStart;
  console.log("  status:    ", roleResult.status);
  console.log("  duration:  ", roleDuration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step1_role_result.json", { roleResult, roleDuration });

  const g1a = assertEq("G1a role.invoke status", roleResult.status, "SUCCESS");
  assertions.push({ id: "G1a", pass: g1a });

  if (!g1a) {
    const detail = (roleResult.metadata && (roleResult.metadata.detail || roleResult.metadata.reason)) || "unknown";
    console.error("STOP: role.invoke failed — detail:", detail);
    await saveJson(reg, EVIDENCE_DIR + "/gate10_result.json", { verdict: "FAIL", assertions, detail });
    process.exit(1);
  }

  const plan = roleResult.output && roleResult.output.files_written;
  const g1b = assertTrue("G1b files_written is Array(length>=1)",
    Array.isArray(plan) && plan.length >= 1,
    Array.isArray(plan) ? "length=" + plan.length : plan);
  assertions.push({ id: "G1b", pass: g1b });

  const allPending = Array.isArray(plan) && plan.every(f => f.sha256 === "pending");
  const g1c = assertTrue("G1c all sha256 === 'pending' (planner confirmed)",
    allPending,
    Array.isArray(plan) ? plan.map(f => f.sha256) : plan);
  assertions.push({ id: "G1c", pass: g1c });

  if (Array.isArray(plan)) {
    plan.forEach((f, i) =>
      console.log("  plan[" + i + "]: path=" + f.path + " sha256=" + f.sha256));
  }
  console.log("");

  // ── Step 2: builder.materialize → writes real files ───────────────────────

  console.log("Step 2: builder.materialize(openai/gpt-4o) ...");
  const matStart = Date.now();

  const matResult = await reg.invoke("builder.materialize", {
    project_id: PROJECT_ID,
    plan,
    spec:       GATE10_SPEC,
    design:     GATE10_DESIGN,
    provider:   "openai",
    model:      "gpt-4o",
    smoke:      false
  }, { root: ROOT });

  const matDuration = Date.now() - matStart;
  console.log("  status:   ", matResult.status);
  console.log("  duration: ", matDuration + "ms");

  const matOut = matResult && matResult.output;
  await saveJson(reg, EVIDENCE_DIR + "/step2_mat_result.json", { matResult, matDuration });

  const g2a = assertEq("G2a builder.materialize status", matResult.status, "SUCCESS");
  assertions.push({ id: "G2a", pass: g2a });

  const g2b = assertEq("G2b materialize output.status", matOut && matOut.status, "SUCCESS");
  assertions.push({ id: "G2b", pass: g2b });

  if (!g2a || !g2b) {
    const errCode = (matOut && matOut.error_code) || "MATERIALIZER_FAILED";
    console.error("STOP: builder.materialize failed — error_code:", errCode);
    await saveJson(reg, EVIDENCE_DIR + "/gate10_result.json",
      { verdict: "FAIL", assertions, error_code: errCode });
    process.exit(1);
  }

  const fw = matOut.files_written || [];
  const g2c = assertTrue("G2c files_written[0].sha256 ≠ 'pending'",
    fw.length > 0 && fw[0].sha256 !== "pending" && fw[0].sha256.length === 64,
    fw.length > 0 ? fw[0].sha256 : "no files");
  assertions.push({ id: "G2c", pass: g2c });

  fw.forEach((f, i) =>
    console.log("  written[" + i + "]: path=" + f.path + " sha256=" + f.sha256 +
      " lines=" + f.line_count));
  console.log("");

  // ── Step 3: shell.run_in_workspace(node main.js) ──────────────────────────

  console.log("Step 3: shell.run_in_workspace(['node','main.js']) ...");
  const shellResult = await reg.invoke("shell.run_in_workspace", {
    project_id: PROJECT_ID,
    argv:       ["node", "main.js"],
    timeout_ms: 10000
  }, { root: ROOT });

  console.log("  status:    ", shellResult.status);
  if (shellResult.status === "SUCCESS") {
    console.log("  exit_code: ", shellResult.output.exit_code);
    console.log("  stdout:    ", JSON.stringify(shellResult.output.stdout));
    console.log("  stderr:    ", JSON.stringify(shellResult.output.stderr));
  }

  await saveJson(reg, EVIDENCE_DIR + "/step3_shell_result.json", shellResult);

  const g3 = assertEq("G3 shell exit_code",
    shellResult.status === "SUCCESS" ? shellResult.output.exit_code : "FAILED",
    0);
  assertions.push({ id: "G3", pass: g3 });

  const stdoutTrim = shellResult.status === "SUCCESS"
    ? shellResult.output.stdout.trim() : null;
  const g4 = assertEq("G4 stdout.trim()", stdoutTrim, "7");
  assertions.push({ id: "G4", pass: g4 });
  console.log("");

  // ── Step 4: ledger — total cost ───────────────────────────────────────────

  console.log("Step 4: reading ledger ...");
  const ledger = await reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, { root: ROOT });
  let totalUsd = 0;
  if (ledger.status === "SUCCESS") {
    totalUsd = ledger.output.total_cost;
    console.log("  total_usd:     $" + totalUsd);
    console.log("  ledger entries:", ledger.output.count);
  } else {
    console.warn("  [WARN] ledger read failed:", ledger.metadata && ledger.metadata.reason);
  }

  if (totalUsd >= 3.00) {
    console.error("STOP: total_usd $" + totalUsd + " approaching kill bar $3.00");
  }

  const g5 = assertTrue("G5 total_usd ≤ $1.00", totalUsd <= 1.00, "$" + totalUsd);
  assertions.push({ id: "G5", pass: g5 });
  await saveJson(reg, EVIDENCE_DIR + "/ledger_final.json", ledger);

  // ── Summary ───────────────────────────────────────────────────────────────

  const passCount = assertions.filter(a => a.pass).length;
  const allPass   = passCount === assertions.length;
  const verdict   = allPass ? "PASS" : "FAIL";

  console.log("");
  console.log("=== Gate #10 Result ===");
  console.log("verdict:    " + verdict);
  console.log("assertions: " + passCount + "/" + assertions.length);
  console.log("total_usd:  $" + totalUsd);

  await saveJson(reg, EVIDENCE_DIR + "/gate10_result.json", {
    ts:          new Date().toISOString(),
    verdict,
    assertions,
    pass_count:  passCount,
    total:       assertions.length,
    total_usd:   totalUsd,
    stdout_trim: stdoutTrim,
    files_written: fw
  });

  if (!allPass) {
    console.error("\nSome assertions FAILED — see above.");
    process.exit(1);
  }

  console.log("\n✓ Gate #10 PASS — real gpt-4o built phase24_gate10; node main.js printed '7'.");
  console.log("Evidence: " + EVIDENCE_DIR + "/gate10_result.json");
  console.log("\nAwaiting CTO final verification.");
}

main().catch(function (err) {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});

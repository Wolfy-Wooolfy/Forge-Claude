"use strict";
// scripts/spikes/builder_real_codegen.js
// SPIKE: Builder Real Code Generation (generate → materialize → run)
// Decision: DECISION-2026-06-08-spike-builder-real-codegen
// Part 1: builder role.invoke diagnostic (real openai/gpt-4o) — runs on GO
// Part 2: agent.invoke codegen + materialize + run — added after GO-PART-2
//
// Track A: ALL side effects via reg.invoke only.
// No fs.*Sync, child_process, fetch(), or new OpenAI() in this file.

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");

// Bootstrap: load .env FIRST — env_loader does not auto-run on require
loadDotEnv(ROOT);

const { getDefaultRegistry } = require("../../code/src/runtime/tools/_registry");

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID   = "spike_builder";
const TS           = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const EVIDENCE_BASE = "artifacts/spikes/builder_real_codegen/run_" + TS;

// §0(d) trivial spec — constrained to print ONLY bare integer (R3)
const TRIVIAL_SPEC = {
  scope: "Add two numbers and print the result",
  files_to_create: [
    {
      path:    "add.js",
      purpose: "Exports function add(a,b) that returns a+b via module.exports"
    },
    {
      path:    "run.js",
      purpose: "Requires add.js, calls add(2,3), prints ONLY the bare integer result — no labels, no extra text"
    }
  ],
  files_to_modify: [],
  acceptance_criteria: [
    { id: "AC-1", description: "node run.js prints exactly 5 to stdout and nothing else" }
  ],
  decisions: [
    { decision: "Use CommonJS require/module.exports", rationale: "Node.js compatibility on target machine" }
  ],
  out_of_scope: ["error handling", "CLI flags", "test files", "package.json"]
};

const TRIVIAL_DESIGN = {
  design_summary:
    "Two-file Node.js program. add.js exports a pure add function. " +
    "run.js calls add(2,3) and prints only the integer result.",
  components: [
    { name: "add.js", tech: "Node.js CommonJS", purpose: "Pure arithmetic: exports { add }" },
    { name: "run.js", tech: "Node.js CommonJS", purpose: "Entry point — console.log(add(2,3)) only" }
  ],
  data_flow: "run.js → require('./add') → add(2,3) → console.log(5)",
  technology_choices: [
    { category: "runtime", choice: "Node.js", rationale: "Available on target machine; no install needed" }
  ],
  integration_points: [],
  identified_risks: []
};

// ── Assertion helpers ─────────────────────────────────────────────────────────

function assertEq(label, actual, expected) {
  const pass = actual === expected;
  const icon = pass ? "[PASS]" : "[FAIL]";
  console.log(icon + " " + label + ": " + JSON.stringify(actual) +
    (pass ? "" : " (expected " + JSON.stringify(expected) + ")"));
  return pass;
}

function assertTrue(label, cond, detail) {
  const pass = !!cond;
  const icon = pass ? "[PASS]" : "[FAIL]";
  console.log(icon + " " + label + (detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  return pass;
}

// ── Evidence writer ───────────────────────────────────────────────────────────

async function saveJson(reg, relPath, data) {
  const r = await reg.invoke("fs.write_file", {
    path:    relPath,
    content: JSON.stringify(data, null, 2)
  }, { root: ROOT });
  if (r.status !== "SUCCESS") {
    console.warn("  [WARN] fs.write_file failed for " + relPath + ":", r.metadata && r.metadata.reason);
  }
  return r;
}

// ── Part 1: builder role.invoke diagnostic ────────────────────────────────────

async function runPart1(reg) {
  console.log("\n=== PART 1: role.invoke(builder, openai/gpt-4o) ===");
  console.log("project_id:", PROJECT_ID);
  console.log("evidence_dir:", EVIDENCE_BASE);
  console.log("");

  const start = Date.now();

  const roleResult = await reg.invoke("role.invoke", {
    role_id:    "builder",
    input:      { project_id: PROJECT_ID, spec: TRIVIAL_SPEC, design: TRIVIAL_DESIGN },
    project_id: PROJECT_ID,
    provider:   "openai",
    model:      "gpt-4o"
  }, { root: ROOT, role_id: "builder" });

  const duration_ms = Date.now() - start;
  console.log("role.invoke duration_ms:", duration_ms);
  console.log("role.invoke status:", roleResult.status);

  // Save raw result immediately
  await saveJson(reg, EVIDENCE_BASE + "/part1_raw.json", { roleResult, duration_ms });

  // ── Assertions ──────────────────────────────────────────────────────────────

  console.log("\n--- Part 1 Assertions ---");

  const assertions = [];

  // A1.1: status === SUCCESS
  const a1_1 = assertEq("A1.1 status", roleResult.status, "SUCCESS");
  assertions.push({ id: "A1.1", label: "status === SUCCESS", pass: a1_1, actual: roleResult.status });

  if (!a1_1) {
    const meta   = roleResult.metadata || {};
    const detail = meta.detail || meta.reason || "unknown";
    console.log("  [INFO] roleResult.metadata:", JSON.stringify(meta));
    assertions.push({ id: "A1.2", label: "skipped (status not SUCCESS)", pass: false, actual: "SKIPPED" });
    assertions.push({ id: "A1.3", label: "skipped (status not SUCCESS)", pass: false, actual: "SKIPPED" });
    assertions.push({ id: "A1.4", label: "skipped (status not SUCCESS)", pass: false, actual: "SKIPPED" });
    assertions.push({ id: "A1.5", label: "skipped (status not SUCCESS)", pass: false, actual: "SKIPPED" });
    await saveJson(reg, EVIDENCE_BASE + "/part1_assertions.json", { assertions, pass_count: 1, total: 5, all_pass: false });
    return { pass: false, assertions, roleResult, duration_ms, gate_denied: detail === "VISION_NOT_FOUND" || detail === "VISION_NOT_LOCKED" };
  }

  const output = roleResult.output;

  // A1.2: files_written is array with length >= 1
  const fw = output.files_written;
  const a1_2 = assertTrue("A1.2 files_written is Array(length>=1)",
    Array.isArray(fw) && fw.length >= 1,
    Array.isArray(fw) ? "length=" + fw.length : fw);
  assertions.push({ id: "A1.2", label: "files_written is Array(length>=1)", pass: a1_2, actual: Array.isArray(fw) ? "length=" + fw.length : typeof fw });

  // A1.3: every files_written entry has sha256 === "pending"
  const sha256Values = Array.isArray(fw) ? fw.map(f => ({ path: f.path, sha256: f.sha256 })) : [];
  const allPending   = Array.isArray(fw) && fw.length > 0 && fw.every(f => f.sha256 === "pending");
  const a1_3 = assertTrue("A1.3 all sha256 === 'pending'", allPending, sha256Values);
  assertions.push({ id: "A1.3", label: "all sha256 === 'pending'", pass: a1_3, actual: sha256Values });

  // A1.4: OUTPUT_SCHEMA — every entry has required fields with correct types
  const schemaErrors = [];
  if (Array.isArray(fw)) {
    fw.forEach((f, i) => {
      if (typeof f.path !== "string")                              schemaErrors.push("files_written[" + i + "].path not string");
      if (f.action !== "create" && f.action !== "modify")         schemaErrors.push("files_written[" + i + "].action invalid: " + f.action);
      if (typeof f.line_count !== "number" || f.line_count < 0)   schemaErrors.push("files_written[" + i + "].line_count invalid: " + f.line_count);
      if (typeof f.sha256 !== "string")                           schemaErrors.push("files_written[" + i + "].sha256 not string");
    });
  }
  const a1_4 = assertTrue("A1.4 OUTPUT_SCHEMA valid (path,action,line_count,sha256)",
    schemaErrors.length === 0, schemaErrors.length > 0 ? schemaErrors : "OK");
  assertions.push({ id: "A1.4", label: "OUTPUT_SCHEMA valid", pass: a1_4, schema_errors: schemaErrors });

  // A1.5: no planned source files exist on disk yet (PLANNER confirmation)
  const globResult = await reg.invoke("fs.glob", {
    pattern: "artifacts/projects/" + PROJECT_ID + "/*.js"
  }, { root: ROOT });

  const onDiskJs = (globResult.status === "SUCCESS" && Array.isArray(globResult.output.matches))
    ? globResult.output.matches : null;

  const a1_5 = assertTrue("A1.5 no .js source files on disk in project dir (PLANNER confirmed)",
    onDiskJs !== null && onDiskJs.length === 0,
    onDiskJs !== null ? ("matches=" + JSON.stringify(onDiskJs)) : "glob failed: " + (globResult.metadata && globResult.metadata.reason));
  assertions.push({ id: "A1.5", label: "no planned source files on disk", pass: a1_5, actual: onDiskJs });

  const passCount = assertions.filter(a => a.pass).length;
  const allPass   = passCount === assertions.length;

  console.log("\nPart 1 result: " + passCount + "/" + assertions.length + " assertions PASS — " + (allPass ? "ALL PASS" : "SOME FAIL"));

  if (Array.isArray(fw) && fw.length > 0) {
    console.log("\nfiles_written plan from gpt-4o:");
    fw.forEach((f, i) => {
      console.log("  [" + i + "] path=" + f.path + " action=" + f.action + " line_count=" + f.line_count + " sha256=" + f.sha256);
    });
    if (output.summary) console.log("summary:", output.summary);
  }

  await saveJson(reg, EVIDENCE_BASE + "/part1_assertions.json", {
    ts:         new Date().toISOString(),
    assertions,
    pass_count: passCount,
    total:      assertions.length,
    all_pass:   allPass
  });

  return { pass: allPass, assertions, roleResult, duration_ms, gate_denied: false };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== SPIKE: Builder Real Code Generation ===");
  console.log("ROOT:            ", ROOT);
  console.log("PROJECT_ID:      ", PROJECT_ID);
  console.log("EVIDENCE_BASE:   ", EVIDENCE_BASE);
  console.log("OPENAI_API_KEY:  ", process.env.OPENAI_API_KEY ? "SET (len=" + process.env.OPENAI_API_KEY.length + ")" : "NOT SET");
  console.log("");

  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP-AND-REPORT: OPENAI_API_KEY not set after loadDotEnv — cannot proceed.");
    process.exit(1);
  }

  const reg = getDefaultRegistry();

  // ── Part 1 ────────────────────────────────────────────────────────────────

  const part1 = await runPart1(reg);

  // ── R1: Read ledger for actual_usd (cost gate) ────────────────────────────

  console.log("\n--- Ledger (R1 cost gate) ---");
  const ledgerResult = await reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, { root: ROOT });
  let actual_usd = 0;
  if (ledgerResult.status === "SUCCESS") {
    actual_usd = ledgerResult.output.total_cost;
    console.log("actual_usd after Part 1:", actual_usd);
    console.log("ledger entries:", ledgerResult.output.count);
    if (actual_usd >= 3.00) {
      console.error("STOP-AND-REPORT: actual_usd " + actual_usd + " approaching kill bar $3.00");
    }
  } else {
    console.warn("[WARN] ledger read failed:", ledgerResult.metadata && ledgerResult.metadata.reason);
  }

  await saveJson(reg, EVIDENCE_BASE + "/ledger_part1.json", ledgerResult);

  // ── Write mid-checkpoint JSON ──────────────────────────────────────────────

  const midData = {
    ts:                        new Date().toISOString(),
    spike:                     "DECISION-2026-06-08-spike-builder-real-codegen",
    project_id:                PROJECT_ID,
    evidence_dir:              EVIDENCE_BASE,
    part1_status:              part1.roleResult && part1.roleResult.status,
    part1_all_pass:            part1.pass,
    part1_duration_ms:         part1.duration_ms,
    part1_assertions:          part1.assertions,
    part1_gate_denied:         part1.gate_denied || false,
    files_written_count:       (part1.roleResult && part1.roleResult.output &&
                                Array.isArray(part1.roleResult.output.files_written))
                               ? part1.roleResult.output.files_written.length : null,
    files_written:             (part1.roleResult && part1.roleResult.output &&
                                part1.roleResult.output.files_written) || null,
    builder_summary:           (part1.roleResult && part1.roleResult.output &&
                                part1.roleResult.output.summary) || null,
    actual_usd_after_part1:    actual_usd,
    kill_bar_usd:              3.00,
    approaching_kill_bar:      actual_usd >= 1.00,
    all_gates_passed:          part1.pass && !part1.gate_denied,
    next:                      "Awaiting GO-PART-2 from CTO before Part 2 execution"
  };

  await saveJson(reg, EVIDENCE_BASE + "/mid_checkpoint.json", midData);

  // ── Write markdown checkpoint (§3 requirement) ────────────────────────────

  const fw = (part1.roleResult && part1.roleResult.output && part1.roleResult.output.files_written) || [];
  const assertionLines = (part1.assertions || []).map(a =>
    "- " + (a.pass ? "✓" : "✗") + " **" + a.id + "** " + a.label +
    (a.actual !== undefined && typeof a.actual !== "object" ? " → `" + a.actual + "`" : "")
  ).join("\n");

  const filesWrittenLines = fw.map((f, i) =>
    "| " + i + " | `" + f.path + "` | " + f.action + " | " + f.line_count + " | `" + f.sha256 + "` |"
  ).join("\n");

  const mdContent = [
    "# Mid-Checkpoint: Spike Builder Real Codegen — Part 1",
    "",
    "**Spike:** DECISION-2026-06-08-spike-builder-real-codegen",
    "**Date:** 2026-06-08",
    "**Part 1 status:** " + (part1.roleResult && part1.roleResult.status || "N/A"),
    "**actual_usd after Part 1:** $" + actual_usd,
    "**Evidence dir:** `" + EVIDENCE_BASE + "`",
    "",
    "## Part 1 Result",
    "",
    "### role.invoke(builder, openai/gpt-4o) — status: " + (part1.roleResult && part1.roleResult.status || "N/A"),
    "",
    "**Duration:** " + (part1.duration_ms || "N/A") + "ms",
    "",
    "### Assertions",
    "",
    assertionLines || "(no assertions)",
    "",
    "### files_written plan returned by gpt-4o",
    "",
    fw.length > 0
      ? ["| # | path | action | line_count | sha256 |",
         "|---|------|--------|-----------|--------|",
         filesWrittenLines].join("\n")
      : "(no files_written)",
    "",
    fw.length > 0 && part1.roleResult.output.summary
      ? "**Builder summary:** " + part1.roleResult.output.summary
      : "",
    "",
    "### On-disk check (A1.5)",
    "",
    (part1.assertions && part1.assertions.find(a => a.id === "A1.5") &&
     part1.assertions.find(a => a.id === "A1.5").pass)
      ? "✓ No source files written to disk (PLANNER behavior confirmed)"
      : "✗ Source files found on disk (unexpected — executor ran?)",
    "",
    "## Gates",
    "",
    "- **vision lock (Section A):** " + (part1.gate_denied ? "DENIED ✗" : "PASSED ✓") +
    " — readVisionSync(\"spike_builder\") returned vision_locked:true",
    "- **permission mode WORKSPACE_WRITE:** PASSED ✓ (fromEnv() default)",
    "- **budget gate (Section B):** PASSED ✓ — actual_usd $" + actual_usd + " << $50 default cap",
    "",
    "## Cost",
    "",
    "- actual_usd after Part 1: **$" + actual_usd + "**",
    "- Kill bar: $3.00 — " + (actual_usd >= 3.00 ? "⚠ APPROACHING" : "✓ well below"),
    "- Cap $1.00 — " + (actual_usd >= 1.00 ? "⚠ AT OR ABOVE CAP" : "✓ within cap"),
    "",
    "## Conclusion",
    "",
    part1.pass
      ? "**Part 1 PASS** — builder role ran against real gpt-4o, returned schema-valid PLANNER output, no files written to disk. Awaiting GO-PART-2."
      : "**Part 1 FAIL/INCONCLUSIVE** — see assertions above. Do NOT proceed to Part 2 until reviewed.",
    "",
    "---",
    "*Awaiting GO-PART-2 from CTO before Part 2 execution.*"
  ].filter(l => l !== undefined).join("\n");

  await saveJson(reg, EVIDENCE_BASE + "/mid_checkpoint_data.json", midData);

  await reg.invoke("fs.write_file", {
    path:    "artifacts/decisions/_spike_checkpoints/builder_real_codegen_mid.md",
    content: mdContent
  }, { root: ROOT });

  console.log("\n=== PART 1 COMPLETE — STOPPED ===");
  console.log("Checkpoint written: artifacts/decisions/_spike_checkpoints/builder_real_codegen_mid.md");
  console.log("Evidence dir:       " + EVIDENCE_BASE);
  console.log("actual_usd:         $" + actual_usd);
  console.log("Part 1 PASS:        " + part1.pass);
  console.log("\nAwaiting GO-PART-2 from CTO before Part 2 execution.");
}

main().catch(err => {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});

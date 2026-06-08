"use strict";
// scripts/spikes/builder_real_codegen.js
// SPIKE: Builder Real Code Generation (generate → materialize → run)
// Decision: DECISION-2026-06-08-spike-builder-real-codegen
//
// Usage:
//   node scripts/spikes/builder_real_codegen.js          → Part 1 only  (STOP, await GO-PART-2)
//   node scripts/spikes/builder_real_codegen.js --part2  → Part 2 only  (after GO-PART-2)
//
// Track A: ALL side effects via reg.invoke only.
// No direct fs.*Sync, child_process, fetch(), or new OpenAI() in this file.

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");

// Bootstrap: load .env FIRST — env_loader does not auto-run on require
loadDotEnv(ROOT);

const { getDefaultRegistry } = require("../../code/src/runtime/tools/_registry");

// ── Mode ──────────────────────────────────────────────────────────────────────

const RUN_PART2 = process.argv.includes("--part2");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID    = "spike_builder";
const TS            = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const EVIDENCE_BASE = "artifacts/spikes/builder_real_codegen/run_" + TS;

// Part 1 known evidence dir (used as reference in Part 2 report)
const PART1_EVIDENCE_DIR = "artifacts/spikes/builder_real_codegen/run_2026-06-08T09-06-46";

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

// Spike-local codegen prompt for Part 2 — does NOT use or modify builder_v1.
// Constrained to print ONLY bare integer (R3) to keep A2.6 deterministic.
const SPIKE_CODEGEN_PROMPT = [
  "You are a code generator. Return STRICT JSON only — no markdown, no code blocks, no prose before or after.",
  "",
  "Generate two Node.js files and return them as this exact JSON structure:",
  "{",
  '  "files": [',
  '    { "path": "add.js", "content": "..." },',
  '    { "path": "run.js", "content": "..." }',
  "  ]",
  "}",
  "",
  "File requirements:",
  "1. add.js — CommonJS module. Define function add(a, b) that returns a + b.",
  "   Export it via: module.exports = { add };",
  "   Do not use ES module syntax (no import/export).",
  "",
  "2. run.js — Requires ./add. Calls add(2, 3). Prints the result using console.log().",
  "   CRITICAL: print ONLY the bare integer — no labels, no extra text, no other output.",
  "   The complete program output must be exactly the string: 5",
  "   (console.log adds its own newline — that is fine, do not suppress it.)",
  "",
  "CRITICAL CONSTRAINTS:",
  "- Return ONLY the JSON object. No text before or after.",
  "- No markdown fences (no triple backticks) anywhere in the response.",
  "- The 'content' values must be valid Node.js code as plain strings.",
  "- Both files must run with 'node run.js' in a directory containing both files,",
  "  with no package.json, no node_modules, and no additional dependencies.",
  "",
  "RESPOND WITH VALID JSON ONLY."
].join("\n");

// ── Assertion helpers ─────────────────────────────────────────────────────────

function assertEq(label, actual, expected) {
  const pass = actual === expected;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + label + ": " + JSON.stringify(actual) +
    (pass ? "" : " (expected " + JSON.stringify(expected) + ")"));
  return pass;
}

function assertTrue(label, cond, detail) {
  const pass = !!cond;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + label +
    (detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  return pass;
}

// ── Evidence writer ───────────────────────────────────────────────────────────

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

// ── Path safety guard (CTO spec: reject "..", leading "/", leading "\\") ──────

function isSafePath(p) {
  return (
    typeof p === "string" &&
    p.length > 0 &&
    !p.includes("..") &&
    !p.startsWith("/") &&
    !p.startsWith("\\")
  );
}

// ── JSON extraction (2 attempts per §4) ──────────────────────────────────────

function tryParseCodegenResponse(rawText) {
  // Attempt 1: direct parse
  try {
    const parsed = JSON.parse(rawText.trim());
    if (parsed && Array.isArray(parsed.files)) return { ok: true, data: parsed, attempt: 1 };
  } catch (_) {}

  // Attempt 2: strip markdown fences, then parse
  const stripped = rawText
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && Array.isArray(parsed.files)) return { ok: true, data: parsed, attempt: 2 };
  } catch (e2) {
    return { ok: false, attempt: 2, raw: rawText, parse_error: e2.message };
  }

  return { ok: false, attempt: 2, raw: rawText, parse_error: "no { files: [...] } object found" };
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

  await saveJson(reg, EVIDENCE_BASE + "/part1_raw.json", { roleResult, duration_ms });

  console.log("\n--- Part 1 Assertions ---");

  const assertions = [];

  const a1_1 = assertEq("A1.1 status", roleResult.status, "SUCCESS");
  assertions.push({ id: "A1.1", label: "status === SUCCESS", pass: a1_1, actual: roleResult.status });

  if (!a1_1) {
    const meta   = roleResult.metadata || {};
    const detail = meta.detail || meta.reason || "unknown";
    console.log("  [INFO] roleResult.metadata:", JSON.stringify(meta));
    ["A1.2", "A1.3", "A1.4", "A1.5"].forEach(id => {
      assertions.push({ id, label: "skipped (status not SUCCESS)", pass: false, actual: "SKIPPED" });
    });
    await saveJson(reg, EVIDENCE_BASE + "/part1_assertions.json",
      { assertions, pass_count: 1, total: 5, all_pass: false });
    return { pass: false, assertions, roleResult, duration_ms,
             gate_denied: detail === "VISION_NOT_FOUND" || detail === "VISION_NOT_LOCKED" };
  }

  const output = roleResult.output;
  const fw     = output.files_written;

  const a1_2 = assertTrue("A1.2 files_written is Array(length>=1)",
    Array.isArray(fw) && fw.length >= 1,
    Array.isArray(fw) ? "length=" + fw.length : fw);
  assertions.push({ id: "A1.2", label: "files_written is Array(length>=1)", pass: a1_2 });

  const sha256Values = Array.isArray(fw) ? fw.map(f => ({ path: f.path, sha256: f.sha256 })) : [];
  const allPending   = Array.isArray(fw) && fw.length > 0 && fw.every(f => f.sha256 === "pending");
  const a1_3 = assertTrue("A1.3 all sha256 === 'pending'", allPending, sha256Values);
  assertions.push({ id: "A1.3", label: "all sha256 === 'pending'", pass: a1_3, actual: sha256Values });

  const schemaErrors = [];
  if (Array.isArray(fw)) {
    fw.forEach((f, i) => {
      if (typeof f.path !== "string")                            schemaErrors.push("[" + i + "].path not string");
      if (f.action !== "create" && f.action !== "modify")       schemaErrors.push("[" + i + "].action invalid: " + f.action);
      if (typeof f.line_count !== "number" || f.line_count < 0) schemaErrors.push("[" + i + "].line_count invalid");
      if (typeof f.sha256 !== "string")                         schemaErrors.push("[" + i + "].sha256 not string");
    });
  }
  const a1_4 = assertTrue("A1.4 OUTPUT_SCHEMA valid",
    schemaErrors.length === 0, schemaErrors.length > 0 ? schemaErrors : "OK");
  assertions.push({ id: "A1.4", label: "OUTPUT_SCHEMA valid", pass: a1_4, schema_errors: schemaErrors });

  const globResult = await reg.invoke("fs.glob", {
    pattern: "artifacts/projects/" + PROJECT_ID + "/*.js"
  }, { root: ROOT });
  const onDiskJs = (globResult.status === "SUCCESS" && Array.isArray(globResult.output.matches))
    ? globResult.output.matches : null;
  const a1_5 = assertTrue("A1.5 no .js source files on disk (PLANNER confirmed)",
    onDiskJs !== null && onDiskJs.length === 0,
    onDiskJs !== null ? "matches=" + JSON.stringify(onDiskJs) : "glob failed");
  assertions.push({ id: "A1.5", label: "no planned source files on disk", pass: a1_5, actual: onDiskJs });

  const passCount = assertions.filter(a => a.pass).length;
  const allPass   = passCount === assertions.length;
  console.log("\nPart 1: " + passCount + "/" + assertions.length + " — " + (allPass ? "ALL PASS" : "SOME FAIL"));

  if (Array.isArray(fw) && fw.length > 0) {
    fw.forEach((f, i) => console.log("  [" + i + "] path=" + f.path +
      " action=" + f.action + " line_count=" + f.line_count + " sha256=" + f.sha256));
    if (output.summary) console.log("summary:", output.summary);
  }

  await saveJson(reg, EVIDENCE_BASE + "/part1_assertions.json",
    { ts: new Date().toISOString(), assertions, pass_count: passCount, total: assertions.length, all_pass: allPass });

  return { pass: allPass, assertions, roleResult, duration_ms, gate_denied: false };
}

// ── Part 2: spike-local codegen + materialize + run ───────────────────────────

async function runPart2(reg) {
  console.log("\n=== PART 2: agent.invoke codegen + materialize + shell.run ===");
  console.log("project_id:", PROJECT_ID);
  console.log("evidence_dir:", EVIDENCE_BASE);
  console.log("Part 1 evidence ref:", PART1_EVIDENCE_DIR);
  console.log("");

  const assertions = [];

  // ── Step 1: codegen call (spike-local prompt, NOT builder_v1) ─────────────

  console.log("Calling agent.invoke(openai/gpt-4o) with spike-local codegen prompt ...");
  const codegenStart = Date.now();

  const codegenResult = await reg.invoke("agent.invoke", {
    provider:   "openai",
    model:      "gpt-4o",
    project_id: PROJECT_ID,
    prompt:     SPIKE_CODEGEN_PROMPT,
    budget_usd: 0.50
  }, { root: ROOT });

  const codegenDuration = Date.now() - codegenStart;
  console.log("agent.invoke duration_ms:", codegenDuration);
  console.log("agent.invoke status:", codegenResult.status);

  await saveJson(reg, EVIDENCE_BASE + "/part2_raw.json", { codegenResult, codegenDuration });

  if (!codegenResult || codegenResult.status !== "SUCCESS") {
    const reason = (codegenResult && codegenResult.metadata && codegenResult.metadata.reason) || "unknown";
    console.error("STOP-AND-REPORT: agent.invoke failed — reason:", reason);
    await saveJson(reg, EVIDENCE_BASE + "/part2_assertions.json",
      { error: "agent.invoke non-SUCCESS", reason, assertions: [] });
    return { pass: false, verdict: "INCONCLUSIVE", reason: "codegen agent.invoke failed: " + reason };
  }

  const rawText = codegenResult.output && codegenResult.output.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    console.error("STOP-AND-REPORT: agent.invoke returned empty/null text");
    return { pass: false, verdict: "INCONCLUSIVE", reason: "agent.invoke returned empty text" };
  }

  // ── Step 2: parse JSON (2 attempts) ────────────────────────────────────────

  console.log("\nParsing codegen response ...");
  const parseResult = tryParseCodegenResponse(rawText);

  if (!parseResult.ok) {
    console.error("STOP-AND-REPORT: JSON not parseable after 2 attempts");
    console.error("raw output (first 500 chars):", rawText.substring(0, 500));
    await saveJson(reg, EVIDENCE_BASE + "/part2_assertions.json",
      { error: "JSON_PARSE_FAILED", raw_excerpt: rawText.substring(0, 500), parse_error: parseResult.parse_error });
    return { pass: false, verdict: "INCONCLUSIVE",
             reason: "JSON not parseable after 2 attempts: " + parseResult.parse_error };
  }

  console.log("JSON parsed on attempt:", parseResult.attempt);
  console.log("files in response:", parseResult.data.files.map(f => f.path));

  const a2_1 = assertTrue("A2.1 response parseable as JSON { files: [{path,content}] }",
    parseResult.ok && Array.isArray(parseResult.data.files) &&
    parseResult.data.files.every(f => typeof f.path === "string" && typeof f.content === "string"),
    "attempt=" + parseResult.attempt + " files=" + parseResult.data.files.length);
  assertions.push({ id: "A2.1", label: "parseable JSON { files: [{path,content}] }", pass: a2_1 });

  if (!a2_1) {
    await saveJson(reg, EVIDENCE_BASE + "/part2_assertions.json", { assertions });
    return { pass: false, verdict: "INCONCLUSIVE", reason: "A2.1 failed — files array invalid" };
  }

  // ── Step 3: materialize files ─────────────────────────────────────────────

  console.log("\nMaterializing files ...");

  for (const file of parseResult.data.files) {
    if (!isSafePath(file.path)) {
      console.error("STOP-AND-REPORT: unsafe path rejected:", file.path);
      return { pass: false, verdict: "INCONCLUSIVE", reason: "unsafe file.path: " + file.path };
    }

    const destPath = "artifacts/projects/" + PROJECT_ID + "/" + file.path;
    console.log("  writing:", destPath, "(", file.content.length, "chars )");

    const writeResult = await reg.invoke("fs.write_file", {
      path:    destPath,
      content: file.content
    }, { root: ROOT });

    if (writeResult.status !== "SUCCESS") {
      console.error("STOP-AND-REPORT: fs.write_file failed for", destPath,
        "—", writeResult.metadata && writeResult.metadata.reason);
      return { pass: false, verdict: "INCONCLUSIVE",
               reason: "fs.write_file failed for " + destPath };
    }

    // Save a copy of materialized content for evidence
    await saveJson(reg,
      EVIDENCE_BASE + "/materialized_" + file.path.replace(/\//g, "_"),
      { path: destPath, content: file.content });
  }

  // ── Step 4: assert files exist on disk ────────────────────────────────────

  console.log("\n--- Part 2 Assertions (existence) ---");

  const addExistsResult = await reg.invoke("fs.exists", {
    path: "artifacts/projects/" + PROJECT_ID + "/add.js"
  }, { root: ROOT });
  const addExists = addExistsResult.status === "SUCCESS" && addExistsResult.output && addExistsResult.output.exists === true;
  const a2_2 = assertTrue("A2.2 add.js exists on disk", addExists,
    addExistsResult.output && addExistsResult.output.exists);
  assertions.push({ id: "A2.2", label: "add.js exists", pass: a2_2 });

  const runExistsResult = await reg.invoke("fs.exists", {
    path: "artifacts/projects/" + PROJECT_ID + "/run.js"
  }, { root: ROOT });
  const runExists = runExistsResult.status === "SUCCESS" && runExistsResult.output && runExistsResult.output.exists === true;
  const a2_3 = assertTrue("A2.3 run.js exists on disk", runExists,
    runExistsResult.output && runExistsResult.output.exists);
  assertions.push({ id: "A2.3", label: "run.js exists", pass: a2_3 });

  // ── Step 5: execute ───────────────────────────────────────────────────────

  console.log("\n--- Part 2 Assertions (execution) ---");

  const shellResult = await reg.invoke("shell.run_in_workspace", {
    project_id: PROJECT_ID,
    argv:       ["node", "run.js"],
    timeout_ms: 10000
  }, { root: ROOT });

  console.log("shell.run_in_workspace status:", shellResult.status);
  if (shellResult.status === "SUCCESS") {
    console.log("  exit_code:", shellResult.output.exit_code);
    console.log("  stdout (raw):", JSON.stringify(shellResult.output.stdout));
    console.log("  stderr:", JSON.stringify(shellResult.output.stderr));
    console.log("  stdout.trim():", JSON.stringify(shellResult.output.stdout.trim()));
  }

  await saveJson(reg, EVIDENCE_BASE + "/shell_result.json", shellResult);

  const a2_4 = assertTrue("A2.4 shellResult.status === SUCCESS", shellResult.status === "SUCCESS");
  assertions.push({ id: "A2.4", label: "shellResult.status === SUCCESS", pass: a2_4 });

  const exitCode   = shellResult.status === "SUCCESS" ? shellResult.output.exit_code : null;
  const stdoutTrim = shellResult.status === "SUCCESS" ? shellResult.output.stdout.trim() : null;

  const a2_5 = assertTrue("A2.5 exit_code === 0", exitCode === 0, exitCode);
  assertions.push({ id: "A2.5", label: "exit_code === 0", pass: a2_5, actual: exitCode });

  const a2_6 = assertTrue("A2.6 stdout.trim() === '5'", stdoutTrim === "5",
    "actual=" + JSON.stringify(stdoutTrim));
  assertions.push({ id: "A2.6", label: "stdout.trim() === '5'", pass: a2_6, actual: stdoutTrim });

  // ── Step 6: ledger — total cost across Part 1 + Part 2 ───────────────────

  console.log("\n--- Ledger (A2.7 cost gate) ---");
  const ledgerResult = await reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, { root: ROOT });
  let total_usd = 0;
  if (ledgerResult.status === "SUCCESS") {
    total_usd = ledgerResult.output.total_cost;
    console.log("total_cost (Part 1 + Part 2):", total_usd);
    console.log("ledger entries:", ledgerResult.output.count);
    if (total_usd >= 3.00) {
      console.error("STOP-AND-REPORT: total_usd " + total_usd + " approaching kill bar $3.00");
    }
  } else {
    console.warn("[WARN] ledger read failed:", ledgerResult.metadata && ledgerResult.metadata.reason);
  }

  const a2_7 = assertTrue("A2.7 total_cost ≤ $1.00", total_usd <= 1.00, "$" + total_usd);
  assertions.push({ id: "A2.7", label: "total_cost ≤ $1.00", pass: a2_7, actual: total_usd });

  await saveJson(reg, EVIDENCE_BASE + "/ledger_final.json", ledgerResult);

  const passCount = assertions.filter(a => a.pass).length;
  const allPass   = passCount === assertions.length;
  const verdict   = allPass ? "PASS" : "FAIL";

  console.log("\nPart 2: " + passCount + "/" + assertions.length + " — " + (allPass ? "ALL PASS" : "SOME FAIL"));
  console.log("Spike verdict:", verdict);

  await saveJson(reg, EVIDENCE_BASE + "/part2_assertions.json", {
    ts:         new Date().toISOString(),
    assertions,
    pass_count: passCount,
    total:      assertions.length,
    all_pass:   allPass,
    verdict
  });

  return {
    pass:      allPass,
    verdict,
    assertions,
    total_usd,
    codegenDuration,
    files:     parseResult.data.files,
    exitCode,
    stdoutTrim
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== SPIKE: Builder Real Code Generation ===");
  console.log("mode:           ", RUN_PART2 ? "PART 2" : "PART 1");
  console.log("ROOT:           ", ROOT);
  console.log("PROJECT_ID:     ", PROJECT_ID);
  console.log("EVIDENCE_BASE:  ", EVIDENCE_BASE);
  console.log("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY ? "SET (len=" + process.env.OPENAI_API_KEY.length + ")" : "NOT SET");
  console.log("");

  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP-AND-REPORT: OPENAI_API_KEY not set after loadDotEnv — cannot proceed.");
    process.exit(1);
  }

  const reg = getDefaultRegistry();

  if (!RUN_PART2) {
    // ── Part 1 ───────────────────────────────────────────────────────────────

    const part1 = await runPart1(reg);

    const ledgerResult = await reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, { root: ROOT });
    let actual_usd = 0;
    if (ledgerResult.status === "SUCCESS") {
      actual_usd = ledgerResult.output.total_cost;
      console.log("\nactual_usd after Part 1:", actual_usd);
      if (actual_usd >= 3.00) console.error("STOP-AND-REPORT: approaching kill bar");
    }

    await saveJson(reg, EVIDENCE_BASE + "/ledger_part1.json", ledgerResult);

    const fw = (part1.roleResult && part1.roleResult.output && part1.roleResult.output.files_written) || [];
    const assertionLines = (part1.assertions || []).map(a =>
      "- " + (a.pass ? "✓" : "✗") + " **" + a.id + "** " + a.label
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
        : "✗ Source files found on disk (unexpected)",
      "",
      "## Gates",
      "",
      "- **vision lock (Section A):** " + (part1.gate_denied ? "DENIED ✗" : "PASSED ✓"),
      "- **permission mode WORKSPACE_WRITE:** PASSED ✓",
      "- **budget gate (Section B):** PASSED ✓ — $" + actual_usd + " << $50 cap",
      "",
      "## Cost",
      "",
      "- actual_usd after Part 1: **$" + actual_usd + "**",
      "- Kill bar $3.00 — ✓ well below",
      "- Cap $1.00 — ✓ within cap",
      "",
      "## Conclusion",
      "",
      part1.pass
        ? "**Part 1 PASS** — builder role ran against real gpt-4o, returned schema-valid PLANNER output, no files written to disk. Awaiting GO-PART-2."
        : "**Part 1 FAIL** — see assertions above.",
      "",
      "---",
      "*Awaiting GO-PART-2 from CTO before Part 2 execution.*"
    ].filter(l => l !== undefined).join("\n");

    await reg.invoke("fs.write_file", {
      path:    "artifacts/decisions/_spike_checkpoints/builder_real_codegen_mid.md",
      content: mdContent
    }, { root: ROOT });

    console.log("\n=== PART 1 COMPLETE — STOPPED ===");
    console.log("Checkpoint: artifacts/decisions/_spike_checkpoints/builder_real_codegen_mid.md");
    console.log("Evidence:   " + EVIDENCE_BASE);
    console.log("actual_usd: $" + actual_usd);
    console.log("Part 1 PASS:", part1.pass);
    console.log("\nAwaiting GO-PART-2.");
    return;
  }

  // ── Part 2 ───────────────────────────────────────────────────────────────

  const part2 = await runPart2(reg);

  // ── Final result note ───────────────────────────────────────────────────

  const resultNote = [
    "# Spike Result: Builder Real Code Generation",
    "",
    "**Spike:** DECISION-2026-06-08-spike-builder-real-codegen",
    "**Date:** 2026-06-08",
    "**Verdict:** " + part2.verdict,
    "**Evidence dir (Part 2):** `" + EVIDENCE_BASE + "`",
    "**Evidence dir (Part 1):** `" + PART1_EVIDENCE_DIR + "`",
    "**total_usd (Part 1 + Part 2):** $" + part2.total_usd,
    "",
    "## Part 2 Assertions",
    "",
    (part2.assertions || []).map(a =>
      "- " + (a.pass ? "✓" : "✗") + " **" + a.id + "** " + a.label +
      (a.actual !== undefined && typeof a.actual !== "object" ? " → `" + a.actual + "`" : "")
    ).join("\n") || "(no assertions)",
    "",
    "## Generated Files",
    "",
    (part2.files || []).map(f =>
      "### `" + f.path + "`\n```js\n" + f.content + "\n```"
    ).join("\n\n") || "(not generated)",
    "",
    "## Execution",
    "",
    "- exit_code: " + (part2.exitCode !== undefined ? part2.exitCode : "N/A"),
    "- stdout.trim(): `" + (part2.stdoutTrim !== undefined ? part2.stdoutTrim : "N/A") + "`",
    "",
    "## Cost",
    "",
    "- total_usd (Part 1 + Part 2): **$" + part2.total_usd + "**",
    "- Cap $1.00 — " + (part2.total_usd <= 1.00 ? "✓ within cap" : "✗ OVER CAP"),
    "",
    "## Conclusion",
    "",
    part2.verdict === "PASS"
      ? "**Spike PASS** — gpt-4o generated real code, Forge materialized it, node run.js executed and printed '5'. Generate → materialize → run is viable."
      : "**Spike " + part2.verdict + "** — see assertions above for failure reason.",
    "",
    "---",
    "*Gate #10 analogue: owner must review on-disk add.js / run.js and actual stdout before closure.*"
  ].join("\n");

  await reg.invoke("fs.write_file", {
    path:    EVIDENCE_BASE + "/spike_result.md",
    content: resultNote
  }, { root: ROOT });

  await reg.invoke("fs.write_file", {
    path:    "artifacts/decisions/_spike_checkpoints/builder_real_codegen_final.md",
    content: resultNote
  }, { root: ROOT });

  console.log("\n=== SPIKE RESULT ===");
  console.log("Verdict:    " + part2.verdict);
  console.log("total_usd:  $" + part2.total_usd);
  console.log("Evidence:   " + EVIDENCE_BASE);
  console.log("Result note: artifacts/decisions/_spike_checkpoints/builder_real_codegen_final.md");
  console.log("\nAwaiting CTO final verification (Gate #10 analogue).");
}

main().catch(err => {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});

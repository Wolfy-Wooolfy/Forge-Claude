"use strict";

/**
 * Smoke test — PHASE-2 Tool Runtime Layer
 * 12 scenarios. Run: node verify/smoke/test_tool_runtime.js
 * Expected: 12/12 PASS
 */

const path = require("path");
const os   = require("os");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");

const { createRegistry, getDefaultRegistry, resetDefaultRegistry } = require(
  path.join(ROOT, "code", "src", "runtime", "tools", "_registry")
);
const { defineTool, ToolContractError, VALID_MODES } = require(
  path.join(ROOT, "code", "src", "runtime", "tools", "_contract")
);
const { readEntries } = require(
  path.join(ROOT, "code", "src", "runtime", "audit", "toolAuditLog")
);

// ── Harness ───────────────────────────────────────────────────────────────────

let passed  = 0;
let failed_ = 0;

function pass(label) { console.log("  PASS  " + label); passed++; }
function fail(label, detail) {
  console.error("  FAIL  " + label + (detail ? " — " + detail : ""));
  failed_++;
}
function check(label, condition, detail) {
  if (condition) pass(label); else fail(label, detail);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n── PHASE-2 Tool Runtime Smoke Test ──────────────────────────────\n");

  // ── S1 — Default registry loads and reports 22 tools ─────────────────────
  console.log("S1: Default registry loads with 23 tools");
  resetDefaultRegistry();
  let registry;
  try {
    registry = getDefaultRegistry();
    pass("S1 registry loads without error");
  } catch (e) {
    fail("S1 registry loads without error", e.message);
    // Rest of suite needs registry; abort
    console.log("  SKIP  S1 tool count — registry failed to load");
    printSummary();
    return;
  }
  {
    const summary = registry.healthSummary();
    check("S1 total tools == 23", summary.total === 23, "got " + summary.total);
  }

  // ── S2 — All tools have valid required_mode ───────────────────────────────
  console.log("\nS2: All tools have valid required_mode");
  {
    const badModes = registry.list().filter(t => !VALID_MODES.includes(t.required_mode));
    check("S2 all tools have valid required_mode", badModes.length === 0,
      "invalid: " + badModes.map(t => t.name + "=" + t.required_mode).join(", "));
  }

  // ── S3 — Tool names are unique and match naming convention ────────────────
  console.log("\nS3: Tool names unique and match family.action convention");
  {
    const names   = registry.list().map(t => t.name);
    const unique  = new Set(names);
    check("S3 tool names are unique", unique.size === names.length, "duplicates found");
    const nameRe  = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
    const bad     = names.filter(n => !nameRe.test(n));
    check("S3 all names match family.action regex", bad.length === 0,
      "bad: " + bad.join(", "));
  }

  // ── S4 — defineTool() rejects invalid spec ────────────────────────────────
  console.log("\nS4: defineTool() rejects invalid spec");
  {
    let threw = false;
    try {
      defineTool({ description: "x", required_mode: "READ_ONLY",
                   input_schema: {}, output_schema: {}, execute: () => {} });
    } catch (e) {
      threw = e.message.includes("spec invalid") || e.message.includes("name must match");
    }
    check("S4a defineTool rejects missing name", threw);
  }
  {
    let threw = false;
    try {
      defineTool({ name: "test.tool", description: "x", required_mode: "WORKSPACE_WRITE",
                   input_schema: {}, output_schema: {}, execute: () => {} });
    } catch (e) {
      threw = e.message.includes("preview");
    }
    check("S4b defineTool rejects write tool without preview", threw);
  }

  // ── S5 — invoke returns TOOL_NOT_FOUND for unknown tool ───────────────────
  console.log("\nS5: invoke returns TOOL_NOT_FOUND for unknown tool");
  {
    const result = await registry.invoke("nonexistent.tool", {}, {});
    check("S5 status == FAILED",            result.status === "FAILED",          "got " + result.status);
    check("S5 reason == TOOL_NOT_FOUND",    result.metadata.reason === "TOOL_NOT_FOUND",
      "got " + result.metadata.reason);
  }

  // ── S6 — invoke validates input schema ────────────────────────────────────
  console.log("\nS6: invoke returns INVALID_INPUT for missing required field");
  {
    const result = await registry.invoke("fs.read_file", {}, { root: ROOT });
    check("S6 status == FAILED",            result.status === "FAILED",          "got " + result.status);
    check("S6 reason == INVALID_INPUT",     result.metadata.reason === "INVALID_INPUT",
      "got " + result.metadata.reason);
  }

  // ── S7 — fs.read_file reads a real file ───────────────────────────────────
  console.log("\nS7: fs.read_file reads a real file (progress/status.json)");
  {
    const result = await registry.invoke(
      "fs.read_file",
      { path: "progress/status.json" },
      { root: ROOT }
    );
    check("S7 status == SUCCESS",           result.status === "SUCCESS",         "got " + result.status);
    check("S7 output.content is non-empty", result.output && result.output.content &&
      result.output.content.length > 0, "empty content");
  }

  // ── S8 — fs.read_file rejects path outside root ───────────────────────────
  console.log("\nS8: fs.read_file rejects path outside root");
  {
    const result = await registry.invoke(
      "fs.read_file",
      { path: "../../../../../../etc/passwd" },
      { root: ROOT }
    );
    check("S8 status == FAILED",            result.status === "FAILED",          "got " + result.status);
    check("S8 reason == PATH_OUTSIDE_ROOT", result.metadata.reason === "PATH_OUTSIDE_ROOT",
      "got " + result.metadata.reason);
  }

  // ── S9 — shell.run rejects HARD_DENY argv ────────────────────────────────
  console.log("\nS9: shell.run rejects HARD_DENY argv[0]");
  {
    const result = await registry.invoke(
      "shell.run",
      { argv: ["rm", "-rf", "/"] },
      { root: ROOT }
    );
    check("S9 status == FAILED",            result.status === "FAILED",          "got " + result.status);
    check("S9 reason == HARD_DENY",         result.metadata.reason === "HARD_DENY",
      "got " + result.metadata.reason);
  }

  // ── S10 — http.get rejects non-allow-listed host ─────────────────────────
  console.log("\nS10: http.get rejects non-allow-listed host");
  {
    const result = await registry.invoke(
      "http.get",
      { url: "https://malicious.example.com/payload" },
      {}
    );
    check("S10 status == FAILED",               result.status === "FAILED",   "got " + result.status);
    check("S10 reason == HOST_NOT_ALLOWED",     result.metadata.reason === "HOST_NOT_ALLOWED",
      "got " + result.metadata.reason);
  }

  // ── S11 — ctx.preview_only returns PREVIEWED without side effect ──────────
  console.log("\nS11: ctx.preview_only returns PREVIEWED without creating file");
  {
    const tmpFile = path.join("artifacts", "tmp_smoke_s11_" + Date.now() + ".txt");
    const result  = await registry.invoke(
      "fs.write_file",
      { path: tmpFile, content: "preview test" },
      { root: ROOT, preview_only: true }
    );
    check("S11 status == PREVIEWED",  result.status === "PREVIEWED", "got " + result.status);
    check("S11 file NOT created",
      !fs.existsSync(path.resolve(ROOT, tmpFile)), "file was unexpectedly created");
  }

  // ── S12 — audit log gets an entry after invoke ────────────────────────────
  console.log("\nS12: audit log grows by 1 after a successful invoke");
  {
    const tmpFile = path.join(os.tmpdir(), "forge_smoke_s12_" + Date.now() + ".json");
    fs.writeFileSync(tmpFile, JSON.stringify({ hello: "world" }), "utf8");

    const beforeCount = readEntries(ROOT).length;
    await registry.invoke(
      "fs.read_file",
      { path: path.relative(ROOT, tmpFile) },
      { root: ROOT }
    );
    const afterCount = readEntries(ROOT).length;
    check("S12 audit log has one more entry", afterCount === beforeCount + 1,
      "before=" + beforeCount + " after=" + afterCount);

    try { fs.unlinkSync(tmpFile); } catch {}
  }

  printSummary();
}

function printSummary() {
  const total = passed + failed_;
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("Result: " + passed + "/" + total + " passed");
  if (failed_ > 0) {
    console.error("FAILED: " + failed_ + " scenario(s)");
    process.exit(1);
  } else {
    console.log("All scenarios PASS");
    process.exit(0);
  }
}

run().catch(e => {
  console.error("Smoke test runner threw:", e);
  process.exit(1);
});

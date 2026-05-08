"use strict";

/**
 * Smoke test — PHASE-3 Permission/Safety Layer
 * 10 scenarios, 11 assertions. Run: node verify/smoke/test_permission_layer.js
 * Expected: 11/11 PASS (including mandatory W-03 isolation S9 + S9b)
 */

const path = require("path");
const fs   = require("fs");
const os   = require("os");

const ROOT = path.resolve(__dirname, "..", "..");

// ── Temp workspace ────────────────────────────────────────────────────────────

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "forge-perm-smoke-"));
fs.mkdirSync(path.join(TMP_ROOT, "artifacts", "projects", "demo", "output"), { recursive: true });
fs.mkdirSync(path.join(TMP_ROOT, "progress"), { recursive: true });
fs.writeFileSync(path.join(TMP_ROOT, "progress", "status.json"), '{"current_stage":"A"}', "utf8");

// ── Harness ───────────────────────────────────────────────────────────────────

let total  = 0;
let passed = 0;

function check(label, condition, detail) {
  total++;
  if (condition) {
    console.log("  PASS  " + label);
    passed++;
  } else {
    console.error("  FAIL  " + label + (detail ? " — " + detail : ""));
  }
}

function printSummary() {
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("Result: " + passed + "/" + total + " passed");
  if (passed < total) {
    console.error("FAILED: " + (total - passed) + " assertion(s)");
    process.exit(1);
  } else {
    console.log("All assertions PASS");
    process.exit(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log("\n── PHASE-3 Permission Layer Smoke Test ──────────────────────────\n");

  const { createRegistry, resetDefaultRegistry } = require(
    path.join(ROOT, "code", "src", "runtime", "tools", "_registry")
  );
  const { createPolicy, resetDefaultPolicy } = require(
    path.join(ROOT, "code", "src", "runtime", "permission", "permissionPolicy")
  );

  resetDefaultRegistry();
  resetDefaultPolicy();

  // Shared isolated registry pointing at real tools, temp root
  const registry = createRegistry({
    root:      TMP_ROOT,
    tools_dir: path.join(ROOT, "code", "src", "runtime", "tools")
  });
  registry.load();

  let r;

  // ── S1: READ_ONLY denies fs.write_file (scope check) ─────────────────────
  console.log("S1: READ_ONLY denies fs.write_file → SCOPE_READ_ONLY");
  {
    const p = createPolicy({ active_mode: "READ_ONLY", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "artifacts/projects/demo/output/x.txt", content: "hi" },
      { root: TMP_ROOT });
    check("S1 status == DENIED",         r.status === "DENIED",          "got " + r.status);
    check("S1 reason == SCOPE_READ_ONLY", r.metadata.reason === "SCOPE_READ_ONLY",
      "got " + r.metadata.reason);
  }

  // ── S2: WORKSPACE_WRITE allows write inside artifacts/ ────────────────────
  console.log("\nS2: WORKSPACE_WRITE allows write inside artifacts/");
  {
    const p = createPolicy({ active_mode: "WORKSPACE_WRITE", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "artifacts/projects/demo/output/x.txt", content: "hi" },
      { root: TMP_ROOT });
    check("S2 status == SUCCESS", r.status === "SUCCESS", "got " + r.status);
  }

  // ── S3: WORKSPACE_WRITE denies write to code/ ────────────────────────────
  console.log("\nS3: WORKSPACE_WRITE denies write to code/ → SCOPE_FORGE_SELF");
  {
    const p = createPolicy({ active_mode: "WORKSPACE_WRITE", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "code/src/runtime/foo.js", content: "x" },
      { root: TMP_ROOT });
    check("S3 status == DENIED",            r.status === "DENIED",             "got " + r.status);
    check("S3 reason == SCOPE_FORGE_SELF",  r.metadata.reason === "SCOPE_FORGE_SELF",
      "got " + r.metadata.reason);
  }

  // ── S4: DANGER_FULL_ACCESS allows code/ write ─────────────────────────────
  console.log("\nS4: DANGER_FULL_ACCESS allows code/ write");
  {
    process.env.FORGE_ALLOW_SELF_MODIFY = "1";
    const p = createPolicy({ active_mode: "DANGER_FULL_ACCESS", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    // Write to code/ inside TMP_ROOT — safe for test
    fs.mkdirSync(path.join(TMP_ROOT, "code", "src", "runtime"), { recursive: true });
    r = await registry.invoke("fs.write_file",
      { path: "code/src/runtime/foo.js", content: "x" },
      { root: TMP_ROOT });
    check("S4 status == SUCCESS", r.status === "SUCCESS", "got " + r.status);
    delete process.env.FORGE_ALLOW_SELF_MODIFY;
  }

  // ── S5: Hard deny — /etc/passwd ───────────────────────────────────────────
  console.log("\nS5: Hard deny /etc → HARD_DENY_SYSTEM_PATH");
  {
    const p = createPolicy({ active_mode: "DANGER_FULL_ACCESS", root: TMP_ROOT });
    process.env.FORGE_ALLOW_SELF_MODIFY = "1";
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "/etc/passwd", content: "x" },
      { root: TMP_ROOT });
    check("S5 status == DENIED",                 r.status === "DENIED",                  "got " + r.status);
    check("S5 reason == HARD_DENY_SYSTEM_PATH",  r.metadata.reason === "HARD_DENY_SYSTEM_PATH",
      "got " + r.metadata.reason);
    delete process.env.FORGE_ALLOW_SELF_MODIFY;
  }

  // ── S6: TEST mode denies code/ write (no escalation) ─────────────────────
  console.log("\nS6: TEST mode denies code/ write");
  {
    const p = createPolicy({ active_mode: "TEST", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "code/x.js", content: "y" },
      { root: TMP_ROOT });
    check("S6 status == DENIED", r.status === "DENIED", "got " + r.status);
  }

  // ── S7: TEST mode allows artifacts/ write ────────────────────────────────
  console.log("\nS7: TEST mode allows artifacts/ write");
  {
    const p = createPolicy({ active_mode: "TEST", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "artifacts/projects/demo/output/y.txt", content: "y" },
      { root: TMP_ROOT });
    check("S7 status == SUCCESS", r.status === "SUCCESS", "got " + r.status);
  }

  // ── S8: READ_ONLY allows fs.read_file ────────────────────────────────────
  console.log("\nS8: READ_ONLY allows fs.read_file");
  {
    fs.writeFileSync(
      path.join(TMP_ROOT, "artifacts", "projects", "demo", "output", "y.txt"), "y", "utf8"
    );
    const p = createPolicy({ active_mode: "READ_ONLY", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.read_file",
      { path: "artifacts/projects/demo/output/y.txt" },
      { root: TMP_ROOT });
    check("S8 status == SUCCESS", r.status === "SUCCESS", "got " + r.status);
  }

  // ── S9 + S9b: ⚠ MANDATORY W-03 isolation ─────────────────────────────────
  console.log("\nS9: ⚠ MANDATORY W-03 — FORGE_DECISION_OVERRIDE must NOT bypass L3");
  {
    process.env.FORGE_DECISION_OVERRIDE = "APPROVE_ALL";
    const p = createPolicy({ active_mode: "READ_ONLY", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("fs.write_file",
      { path: "artifacts/projects/demo/output/leaked.txt", content: "should be denied" },
      { root: TMP_ROOT });
    check("S9  FORGE_DECISION_OVERRIDE does NOT bypass L3 → DENIED",
      r.status === "DENIED", "got " + r.status);
    check("S9b leaked file does NOT exist",
      !fs.existsSync(path.join(TMP_ROOT, "artifacts", "projects", "demo", "output", "leaked.txt")),
      "file was unexpectedly created");
    delete process.env.FORGE_DECISION_OVERRIDE;
  }

  // ── S10: shell.run hard deny even in DANGER_FULL_ACCESS ──────────────────
  console.log("\nS10: shell rm hard-denied even in DANGER_FULL_ACCESS");
  {
    process.env.FORGE_ALLOW_SELF_MODIFY = "1";
    const p = createPolicy({ active_mode: "DANGER_FULL_ACCESS", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("shell.run",
      { argv: ["rm", "-rf", "/"] },
      { root: TMP_ROOT });
    check("S10 rm denied even in DANGER_FULL_ACCESS",
      r.status === "DENIED" || r.status === "FAILED", "got " + r.status);
    delete process.env.FORGE_ALLOW_SELF_MODIFY;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}

  printSummary();
})().catch(err => {
  console.error("Smoke test runner threw:", err);
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
  process.exit(2);
});

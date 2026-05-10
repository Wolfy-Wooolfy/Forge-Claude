"use strict";

/**
 * Smoke test — PHASE-3 Permission/Safety Layer + PHASE-7-E agent_budget_rule
 * 13 scenarios, 15 assertions. Run: node verify/smoke/test_permission_layer.js
 * Expected: 15/15 PASS (including mandatory W-03 isolation S9 + S9b)
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

  // ── S11: container privilege rule — Step 1.7 catches port < 1024 ─────────
  console.log("\nS11: Step 1.7 container_privilege_rule — port 80 → DENIED PROMPT_REQUIRED");
  {
    const p = createPolicy({ active_mode: "WORKSPACE_WRITE", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("container.run",
      { image: "nginx", project_id: "smoke_s11", ports: [{ host: 80, container: 80 }] },
      { root: TMP_ROOT });
    check("S11 status == DENIED",            r.status === "DENIED",               "got " + r.status);
    check("S11 reason == PROMPT_REQUIRED",   r.metadata.reason === "PROMPT_REQUIRED",
      "got " + r.metadata.reason);
  }

  // ── S12: agent_budget_rule — VISION_NOT_LOCKED (Step 1.8) ────────────────
  console.log("\nS12: Step 1.8 agent_budget_rule — unlocked vision → DENIED VISION_NOT_LOCKED");
  {
    fs.mkdirSync(path.join(TMP_ROOT, "artifacts", "projects", "smoke_s12"), { recursive: true });
    fs.writeFileSync(
      path.join(TMP_ROOT, "artifacts", "projects", "smoke_s12", "vision.md"),
      "---\nproject_id: smoke_s12\nvision_version: 1\nvision_locked: false\namendments_history: []\ngoals:\n  primary: test\n  secondary: []\nconstraints: []\nnon_goals: []\n---\n\n# Vision smoke_s12\n",
      "utf8"
    );
    const p = createPolicy({ active_mode: "TEST", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("agent.invoke",
      { provider: "anthropic", model: "claude-opus-4-7", prompt: "smoke test", project_id: "smoke_s12" },
      { root: TMP_ROOT });
    check("S12 status == DENIED",             r.status === "DENIED",                    "got " + r.status);
    check("S12 reason == VISION_NOT_LOCKED",  r.metadata.reason === "VISION_NOT_LOCKED",
      "got " + r.metadata.reason);
  }

  // ── S13: agent_budget_rule — BUDGET_EXCEEDED (Step 1.8) ──────────────────
  console.log("\nS13: Step 1.8 agent_budget_rule — 100% budget → DENIED BUDGET_EXCEEDED");
  {
    fs.mkdirSync(path.join(TMP_ROOT, "artifacts", "projects", "smoke_s13"), { recursive: true });
    fs.writeFileSync(
      path.join(TMP_ROOT, "artifacts", "projects", "smoke_s13", "vision.md"),
      "---\nproject_id: smoke_s13\nvision_version: 1\nvision_locked: true\nvision_locked_at: 2026-05-10T00:00:00.000Z\nlocked_by_role: owner\namendments_history: []\ngoals:\n  primary: test\n  secondary: []\nconstraints: []\nnon_goals: []\nmax_total_usd: 1.00\nmax_per_iteration_usd: 0.50\n---\n\n# Vision smoke_s13\n",
      "utf8"
    );
    fs.mkdirSync(path.join(TMP_ROOT, "artifacts", "agent"), { recursive: true });
    fs.writeFileSync(
      path.join(TMP_ROOT, "artifacts", "agent", "cost_ledger.jsonl"),
      JSON.stringify({ invocation_id: "s13-test", project_id: "smoke_s13", provider: "anthropic",
        model: "claude-opus-4-7", role: null, tokens_in: 0, tokens_out: 0, latency_ms: 0,
        cost_usd_estimated: 0, cost_usd_actual: 1.00, outcome: "success" }) + "\n",
      "utf8"
    );
    const p = createPolicy({ active_mode: "TEST", root: TMP_ROOT });
    registry.setAuthorizeFunction((t, i, c) => p.authorize(t, i, c));
    r = await registry.invoke("agent.invoke",
      { provider: "anthropic", model: "claude-opus-4-7", prompt: "smoke test", project_id: "smoke_s13" },
      { root: TMP_ROOT });
    check("S13 status == DENIED",            r.status === "DENIED",                  "got " + r.status);
    check("S13 reason == BUDGET_EXCEEDED",   r.metadata.reason === "BUDGET_EXCEEDED",
      "got " + r.metadata.reason);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}

  printSummary();
})().catch(err => {
  console.error("Smoke test runner threw:", err);
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
  process.exit(2);
});

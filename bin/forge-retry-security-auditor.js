#!/usr/bin/env node
"use strict";

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..");

// Load API key from .env if not already in environment
function _loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!process.env.OPENAI_API_KEY && fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^OPENAI_API_KEY=(.+)/);
      if (m) { process.env.OPENAI_API_KEY = m[1].trim(); break; }
    }
  }
}

_loadEnv();

if (!process.env.OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY not set");
  process.exit(1);
}

// TEST mode reserved for bin/forge-test.js (L5 scenario harness) only.
// This script runs in WORKSPACE_WRITE; L3 gates role.invoke normally.
// Per DECISION-20260512-1430: required_mode on role.invoke changed to WORKSPACE_WRITE.

// Ensure live_smoke_retry project vision exists
function _ensureVision() {
  const visionDir  = path.join(ROOT, "artifacts", "projects", "live_smoke_retry");
  const visionPath = path.join(visionDir, "vision.md");
  if (!fs.existsSync(visionPath)) {
    fs.mkdirSync(visionDir, { recursive: true });
    fs.writeFileSync(visionPath, [
      "---",
      "project_id: live_smoke_retry",
      "project_name: Live Smoke Retry Test",
      "domain: test",
      "vision_version: 1",
      "vision_locked: true",
      "amendments_history: []",
      "goals:",
      "  primary: security_auditor retest per DECISION-20260512-0900",
      "  secondary: []",
      "constraints: []",
      "non_goals: []",
      "---",
      "",
      "# Live Smoke Retry — security_auditor with gpt-4o"
    ].join("\n"), "utf8");
  }
}

_ensureVision();

(async () => {
  const reg = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry")).getDefaultRegistry();

  const input = {
    project_id: "live_smoke_retry",
    phase: "SPEC",
    spec: {
      scope: "Build a TODO list REST API with user authentication",
      files_to_create: ["server.js", "auth.js", "db.js", "routes/todos.js"],
      acceptance_criteria: [
        { id: "AC-1", description: "User can register with email+password" },
        { id: "AC-2", description: "User can authenticate and receive JWT" },
        { id: "AC-3", description: "Authenticated user can CRUD their TODOs" }
      ],
      decisions: [{ decision: "Use JWT for authentication", rationale: "Stateless, scalable" }],
      files_to_modify: [],
      out_of_scope: ["Frontend UI", "Admin panel"]
    },
    design: {
      design_summary: "Express.js REST API with JWT authentication and SQLite storage",
      components: [
        { name: "Auth Service", tech: "JWT + bcrypt", purpose: "User authentication and password hashing" },
        { name: "TODO Service", tech: "Express routes", purpose: "CRUD operations for tasks" },
        { name: "Database",     tech: "SQLite",        purpose: "Persistence layer" }
      ],
      data_flow: "Client → HTTP → Express → Auth Middleware → Route Handler → SQLite → Response",
      technology_choices: [
        { category: "runtime",   choice: "Node.js", rationale: "Async I/O, wide ecosystem" },
        { category: "framework", choice: "Express", rationale: "Minimal, well-documented" },
        { category: "auth",      choice: "JWT",     rationale: "Stateless sessions" }
      ],
      integration_points: [
        { name: "REST API", type: "API", notes: "JSON over HTTP, JWT Bearer tokens" }
      ],
      identified_risks: [
        { risk: "JWT token not invalidated on logout", severity: "MEDIUM", mitigation: "Use short TTL + refresh token rotation" }
      ]
    }
  };

  console.log("\n── PHASE-7-F-3 Retry: security_auditor with gpt-4o ──────────────");
  console.log("  Purpose : DECISION-20260512-0900 remediation");
  console.log("  Model   : gpt-4o (was gpt-4o-mini)");
  console.log("  Project : live_smoke_retry");
  console.log("");

  const startedAt = Date.now();
  let roleResult;
  try {
    roleResult = await reg.invoke(
      "role.invoke",
      {
        role_id:    "security_auditor",
        input,
        project_id: "live_smoke_retry",
        provider:   "openai",
        model:      "gpt-4o"
      },
      { root: ROOT, role_id: "security_auditor" }
    );
  } catch (err) {
    roleResult = { status: "FAILED", output: null, metadata: { reason: "EXCEPTION", detail: err.message } };
  }
  const duration_ms = Date.now() - startedAt;

  console.log("=== RESULT ===");
  console.log("  Status   :", roleResult.status);
  console.log("  Duration :", duration_ms, "ms");

  if (roleResult.status === "SUCCESS") {
    const o = roleResult.output || {};
    console.log("  Threat   :", o.threat_level);
    console.log("  Findings :", Array.isArray(o.findings) ? o.findings.length : "n/a");
    console.log("\n✓ PASS — security_auditor works with gpt-4o");
  } else {
    const m = roleResult.metadata || {};
    console.log("  Reason   :", m.reason);
    console.log("  Detail   :", m.detail || "(none)");
    console.log("\n✗ FAIL — see metadata above");
  }

  const ts         = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(ROOT, "artifacts", "live_smoke", "retry-security-auditor-" + ts + ".json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = {
    schema_version:  "1.0",
    ts:              new Date().toISOString(),
    purpose:         "PHASE-7-F-3-RETRY per DECISION-20260512-0900",
    role_id:         "security_auditor",
    provider:        "openai",
    model:           "gpt-4o",
    duration_ms,
    result_status:   roleResult.status,
    result_metadata: roleResult.metadata || null,
    assessment: {
      passed:         roleResult.status === "SUCCESS",
      threat_level:   roleResult.status === "SUCCESS" ? (roleResult.output && roleResult.output.threat_level) : null,
      findings_count: roleResult.status === "SUCCESS" ? (roleResult.output && roleResult.output.findings && roleResult.output.findings.length) : null
    }
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log("\n  Report:", reportPath);
  console.log("────────────────────────────────────────────────────────────────\n");

  process.exit(roleResult.status === "SUCCESS" ? 0 : 1);
})().catch(err => {
  console.error("RETRY FAILED:", err.message);
  console.error(err.stack);
  process.exit(1);
});

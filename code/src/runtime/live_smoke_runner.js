"use strict";

const fs   = require("fs");
const path = require("path");

const HARD_CAP_USD  = 7.00;
const SOFT_WARN_USD = 5.00;

const ROLE_PROBES = [
  {
    role_id: "architect",
    input: {
      project_id: "live_smoke",
      intent:     "Build a simple REST API for managing a to-do list. Users can create, read, update, and delete tasks. Each task has a title, status (open|done), and created_at timestamp."
    }
  },
  {
    role_id: "spec_writer",
    input: {
      project_id: "live_smoke",
      design: {
        design_summary: "A RESTful todo API using Node.js and SQLite.",
        components: [
          { name: "API Server", tech: "Node.js/Express", purpose: "Handles HTTP requests" },
          { name: "Database",   tech: "SQLite",          purpose: "Stores tasks"           }
        ],
        data_flow: "Client → HTTP → Express → SQLite → Response",
        technology_choices: [
          { category: "language",  choice: "Node.js", rationale: "Lightweight runtime" },
          { category: "database",  choice: "SQLite",  rationale: "Zero-config embedded DB" }
        ],
        integration_points:  [{ name: "REST API", type: "API", notes: "JSON over HTTP" }],
        identified_risks:    [{ risk: "Write contention on SQLite", severity: "LOW", mitigation: "Serialize writes" }]
      }
    }
  },
  {
    role_id: "reviewer",
    input: {
      project_id: "live_smoke",
      phase:      "A",
      design: {
        design_summary: "A RESTful todo API using Node.js and SQLite.",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   [{ risk: "Write contention", severity: "LOW", mitigation: "Serialize" }]
      },
      spec: {
        scope:               "Build a CRUD API for tasks using Node.js and SQLite.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [
          { id: "AC-1", description: "POST /tasks returns 201 with task id" },
          { id: "AC-2", description: "GET /tasks returns array of all tasks" },
          { id: "AC-3", description: "DELETE /tasks/:id returns 204 on success" }
        ],
        files_to_create: [
          { path: "src/app.js",        purpose: "Express app entry point" },
          { path: "src/routes/tasks.js", purpose: "Task route handlers"  },
          { path: "src/db.js",         purpose: "SQLite connection"       }
        ],
        files_to_modify: [],
        out_of_scope:    ["Authentication", "Frontend UI"]
      }
    }
  },
  {
    role_id: "security_auditor",
    input: {
      project_id: "live_smoke",
      phase:      "SPEC",
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      },
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [{ id: "AC-1", description: "POST /tasks returns 201" }],
        files_to_create:     [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify:     [],
        out_of_scope:        ["Auth", "Frontend"]
      }
    }
  },
  {
    role_id: "builder",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [{ id: "AC-1", description: "POST /tasks returns 201" }],
        files_to_create:     [{ path: "src/app.js", purpose: "Entry point" }, { path: "src/db.js", purpose: "SQLite" }],
        files_to_modify:     [],
        out_of_scope:        ["Auth"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  },
  {
    role_id: "test_designer",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [
          { id: "AC-1", description: "POST /tasks returns 201 with task id" },
          { id: "AC-2", description: "GET /tasks returns array of all tasks" }
        ],
        files_to_create: [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify: [],
        out_of_scope:    ["Auth"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  },
  {
    role_id: "cost_estimator",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [{ id: "AC-1", description: "POST /tasks returns 201" }],
        files_to_create:     [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify:     [],
        out_of_scope:        ["Auth"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  },
  {
    role_id: "environment",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [{ id: "AC-1", description: "POST /tasks returns 201" }],
        files_to_create:     [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify:     [],
        out_of_scope:        ["Auth"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  },
  {
    role_id: "documentation",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [
          { id: "AC-1", description: "POST /tasks returns 201" },
          { id: "AC-2", description: "GET /tasks returns task list" }
        ],
        files_to_create: [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify: [],
        out_of_scope:    ["Auth", "Frontend"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  },
  {
    role_id: "deployment",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [{ id: "AC-1", description: "POST /tasks returns 201" }],
        files_to_create:     [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify:     [],
        out_of_scope:        ["Auth"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  },
  {
    role_id: "quality_judge",
    input: {
      project_id: "live_smoke",
      spec: {
        scope:               "Build a CRUD API for tasks.",
        decisions:           [{ decision: "Use Express.js", rationale: "Minimal setup" }],
        acceptance_criteria: [
          { id: "AC-1", description: "POST /tasks returns 201" },
          { id: "AC-2", description: "GET /tasks returns task list" }
        ],
        files_to_create: [{ path: "src/app.js", purpose: "Entry point" }],
        files_to_modify: [],
        out_of_scope:    ["Auth"]
      },
      design: {
        design_summary: "Node.js/SQLite REST API",
        components:         [{ name: "API Server", tech: "Express", purpose: "HTTP handler" }],
        data_flow:          "Client → API → SQLite",
        technology_choices: [],
        integration_points: [],
        identified_risks:   []
      }
    }
  }
];

function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _assessOutput(role_id, output) {
  if (!output) return { valid: false, note: "output is null" };
  const checks = {
    architect:        () => output.design_summary && Array.isArray(output.components),
    spec_writer:      () => output.scope && Array.isArray(output.acceptance_criteria),
    reviewer:         () => output.verdict && Array.isArray(output.findings),
    security_auditor: () => output.threat_level && Array.isArray(output.findings),
    builder:          () => Array.isArray(output.files_written) && output.summary,
    test_designer:    () => Array.isArray(output.scenarios) && output.coverage_summary,
    cost_estimator:   () => Array.isArray(output.phases) && typeof output.total_effort_mid_hours === "number",
    environment:      () => output.target_environment && output.container_recommendation,
    documentation:    () => output.overview && Array.isArray(output.api_reference),
    deployment:       () => Array.isArray(output.deployment_sequence) && output.health_verification,
    quality_judge:    () => output.verdict && typeof output.confidence_score === "number"
  };
  const fn = checks[role_id];
  if (!fn) return { valid: false, note: "no check defined for role " + role_id };
  try {
    const ok = fn();
    return { valid: !!ok, note: ok ? "key fields present" : "key fields missing" };
  } catch (e) {
    return { valid: false, note: "check threw: " + e.message };
  }
}

async function runLiveSmoke(options) {
  const root      = (options && options.root) || process.cwd();
  const provider  = (options && options.provider)  || "openai";
  const model     = (options && options.model)     || "gpt-4o-mini";
  const dryRun    = !!(options && options.dry_run);
  const onProgress = (options && options.onProgress) || (() => {});

  const reg = require("./tools/_registry").getDefaultRegistry();

  const results = [];
  let   totalCost = 0;

  for (const probe of ROLE_PROBES) {
    if (totalCost >= HARD_CAP_USD) {
      results.push({
        role_id:    probe.role_id,
        status:     "SKIPPED",
        reason:     "HARD_CAP_REACHED",
        cost_usd:   0,
        duration_ms: 0,
        assessment: null
      });
      onProgress({ role_id: probe.role_id, status: "SKIPPED", reason: "HARD_CAP_REACHED", totalCost });
      continue;
    }

    if (totalCost >= SOFT_WARN_USD) {
      onProgress({ role_id: probe.role_id, warning: "SOFT_CAP_WARN", totalCost });
    }

    if (dryRun) {
      results.push({ role_id: probe.role_id, status: "DRY_RUN", cost_usd: 0, duration_ms: 0, assessment: null });
      onProgress({ role_id: probe.role_id, status: "DRY_RUN" });
      continue;
    }

    const start = Date.now();
    let roleResult;
    try {
      roleResult = await reg.invoke(
        "role.invoke",
        {
          role_id:    probe.role_id,
          input:      probe.input,
          project_id: "live_smoke",
          provider,
          model
        },
        { root, role_id: probe.role_id }
      );
    } catch (err) {
      roleResult = { status: "FAILED", output: null, metadata: { reason: "EXCEPTION", detail: err.message } };
    }
    const duration_ms = Date.now() - start;

    // Read cost from ledger — last entry for live_smoke project
    let cost_usd = 0;
    try {
      const ledgerResult = await reg.invoke("agent.read_ledger", { project_id: "live_smoke", limit: 1 }, { root });
      if (ledgerResult.status === "SUCCESS" && ledgerResult.output && ledgerResult.output.entries.length > 0) {
        cost_usd = ledgerResult.output.entries[0].cost_usd || 0;
      }
    } catch (_e) { /* best-effort */ }

    totalCost += cost_usd;

    const assessment = roleResult.status === "SUCCESS"
      ? _assessOutput(probe.role_id, roleResult.output)
      : { valid: false, note: (roleResult.metadata && roleResult.metadata.reason) || "FAILED" };

    const entry = {
      role_id:     probe.role_id,
      status:      roleResult.status,
      cost_usd,
      duration_ms,
      assessment,
      metadata:    roleResult.metadata || {}
    };
    results.push(entry);
    onProgress({ role_id: probe.role_id, status: roleResult.status, cost_usd, totalCost, assessment });
  }

  const report = {
    schema_version: "1.0",
    ts:             new Date().toISOString(),
    provider,
    model,
    hard_cap_usd:   HARD_CAP_USD,
    total_cost_usd: totalCost,
    results,
    summary: {
      total:   results.length,
      pass:    results.filter(r => r.status === "SUCCESS" && r.assessment && r.assessment.valid).length,
      fail:    results.filter(r => r.status === "FAILED").length,
      skipped: results.filter(r => r.status === "SKIPPED" || r.status === "DRY_RUN").length
    }
  };

  if (!dryRun) {
    const ts      = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outPath = path.resolve(root, "artifacts", "live_smoke", ts + ".json");
    _ensureDir(outPath);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    report._saved_to = outPath;
  }

  return report;
}

module.exports = { runLiveSmoke, ROLE_PROBES, HARD_CAP_USD, SOFT_WARN_USD };

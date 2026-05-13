"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");
const { loadScenarios }    = require("../builtproject/scenario_loader");
const { runScenario }      = require("../builtproject/harness_runner");
const { aggregate }        = require("../builtproject/verdict_aggregator");
const { emit: emitSignal } = require("../builtproject/loopback_signal");

// ── 1. builtproject.run_scenarios ────────────────────────────────────────────

const runScenarios = defineTool({
  name: "builtproject.run_scenarios",
  description: "Run L5b test scenarios against a built project and write a report.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_root: {
        type: "string",
        description: "Absolute path to the built project directory."
      },
      scenario_ids: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of scenario IDs to run. If omitted, runs all."
      }
    },
    required: ["project_root"]
  },

  output_schema: {
    type: "object",
    properties: {
      overall_status: { type: "string" },
      total:          { type: "number" },
      pass:           { type: "number" },
      fail:           { type: "number" },
      error:          { type: "number" },
      report_path:    { type: "string" },
      signal_path:    { type: "string" },
      scenarios:      { type: "array" }
    }
  },

  preview(input) {
    const root = input.project_root;
    const ids  = (input.scenario_ids || []).join(", ") || "all";
    return Promise.resolve(previewed({
      operation:    "builtproject.run_scenarios",
      project_root: root,
      scenarios:    ids,
      note:         "Would start server processes, run HTTP requests, and write forge_tests/last_report.json"
    }));
  },

  async execute(input) {
    const root = path.resolve(input.project_root);

    if (!fs.existsSync(root)) {
      return failed("PROJECT_NOT_FOUND", `project_root does not exist: ${root}`);
    }

    const { scenarios, errors } = loadScenarios(root, input.scenario_ids || []);

    if (errors.length > 0 && scenarios.length === 0) {
      return failed("SCENARIO_LOAD_FAILED", errors.join("; "));
    }

    if (scenarios.length === 0) {
      return failed("NO_SCENARIOS", "No scenarios found in " + path.join(root, "forge_tests", "scenarios"));
    }

    const results = [];
    for (const scenario of scenarios) {
      const result = await runScenario(scenario, root);
      results.push(result);
    }

    const { summary, report_path } = aggregate(results, root);
    const { signal_path }          = emitSignal(summary, root);

    return ok({
      overall_status: summary.overall_status,
      total:          summary.total,
      pass:           summary.pass,
      fail:           summary.fail,
      error:          summary.error,
      report_path,
      signal_path,
      load_errors:    errors,
      scenarios:      summary.scenarios,
    });
  }
});

// ── 2. builtproject.read_report ───────────────────────────────────────────────

const readReport = defineTool({
  name: "builtproject.read_report",
  description: "Read the last L5b test report from a built project.",
  required_mode: "READ_ONLY",
  is_read_only: true,

  input_schema: {
    type: "object",
    properties: {
      project_root: {
        type: "string",
        description: "Absolute path to the built project directory."
      }
    },
    required: ["project_root"]
  },

  output_schema: {
    type: "object",
    properties: {
      report_path:    { type: "string" },
      overall_status: { type: "string" },
      total:          { type: "number" },
      pass:           { type: "number" },
      fail:           { type: "number" },
      error:          { type: "number" },
      ran_at:         { type: "string" },
      scenarios:      { type: "array" }
    }
  },

  async execute(input) {
    const root       = path.resolve(input.project_root);
    const reportPath = path.join(root, "forge_tests", "last_report.json");

    if (!fs.existsSync(reportPath)) {
      return failed("REPORT_NOT_FOUND", `No report at ${reportPath}. Run builtproject.run_scenarios first.`);
    }

    let report;
    try {
      report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    } catch (err) {
      return failed("REPORT_PARSE_ERROR", err.message);
    }

    return ok({ report_path: reportPath, ...report });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = { tools: [runScenarios, readReport] };

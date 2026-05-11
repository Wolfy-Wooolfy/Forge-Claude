#!/usr/bin/env node
"use strict";

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..");

const { loadScenarios }    = require(path.join(ROOT, "code/src/runtime/builtproject/scenario_loader"));
const { runScenario }      = require(path.join(ROOT, "code/src/runtime/builtproject/harness_runner"));
const { aggregate }        = require(path.join(ROOT, "code/src/runtime/builtproject/verdict_aggregator"));
const { emit: emitSignal } = require(path.join(ROOT, "code/src/runtime/builtproject/loopback_signal"));

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function _parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = null;
  const ids = [];
  let i = 0;
  while (i < args.length) {
    if ((args[i] === "--project" || args[i] === "-p") && args[i + 1]) {
      projectRoot = args[i + 1];
      i += 2;
    } else if ((args[i] === "--scenario" || args[i] === "-s") && args[i + 1]) {
      ids.push(args[i + 1]);
      i += 2;
    } else {
      i++;
    }
  }
  return { projectRoot, ids: ids.length > 0 ? ids : [] };
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};

function _statusIcon(status) {
  if (status === "PASS")  return C.green  + "✓" + C.reset;
  if (status === "FAIL")  return C.red    + "✗" + C.reset;
  if (status === "ERROR") return C.yellow + "!" + C.reset;
  return "?";
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  const { projectRoot, ids } = _parseArgs(process.argv);

  if (!projectRoot) {
    const ref = path.join(ROOT, "artifacts/projects/_reference_todo_api");
    console.log(`${C.dim}No --project specified, using reference fixture:${C.reset} ${ref}`);
    process.argv.push("--project", ref);
    return _run(ref, ids);
  }

  await _run(path.resolve(projectRoot), ids);
})();

async function _run(root, ids) {
  console.log(`\n${C.bold}Forge L5b Built-Project Test Harness${C.reset}`);
  console.log(`${C.dim}Project:${C.reset} ${root}\n`);

  if (!fs.existsSync(root)) {
    console.error(`${C.red}ERROR: project_root not found: ${root}${C.reset}`);
    process.exit(1);
  }

  const { scenarios, errors } = loadScenarios(root, ids);

  if (errors.length > 0) {
    for (const e of errors) console.warn(`${C.yellow}WARN${C.reset} ${e}`);
  }

  if (scenarios.length === 0) {
    console.error(`${C.red}ERROR: No scenarios loaded from ${root}/forge_tests/scenarios/${C.reset}`);
    process.exit(1);
  }

  console.log(`Running ${scenarios.length} scenario(s)…\n`);

  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${_statusIcon("?")} ${scenario.id} ${scenario.name} … `);
    const result = await runScenario(scenario, root);
    results.push(result);

    process.stdout.write(`\r  ${_statusIcon(result.status)} ${result.id} ${result.name} (${result.duration_ms}ms)\n`);

    if (result.status !== "PASS") {
      for (const a of result.assertions || []) {
        if (!a.pass) {
          console.log(`       ${C.red}FAIL${C.reset} [${a.type}] ${a.reason || ""}`);
        }
      }
      if (result.error) {
        console.log(`       ${C.red}ERROR${C.reset} ${result.error}`);
      }
    }
  }

  const { summary, report_path } = aggregate(results, root);
  const { signal_path }          = emitSignal(summary, root);

  const icon = summary.overall_status === "PASS" ? C.green : C.red;

  console.log(`\n${C.bold}Summary${C.reset}`);
  console.log(`  Total : ${summary.total}`);
  console.log(`  PASS  : ${C.green}${summary.pass}${C.reset}`);
  if (summary.fail  > 0) console.log(`  FAIL  : ${C.red}${summary.fail}${C.reset}`);
  if (summary.error > 0) console.log(`  ERROR : ${C.yellow}${summary.error}${C.reset}`);
  console.log(`\n  ${icon}${C.bold} ${summary.overall_status}${C.reset}`);
  console.log(`\n${C.dim}Report : ${report_path}${C.reset}`);
  console.log(`${C.dim}Signal : ${signal_path}${C.reset}\n`);

  process.exit(summary.overall_status === "PASS" ? 0 : 1);
}

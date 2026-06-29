"use strict";

const path = require("path");
const fs   = require("fs");

module.exports = {
  id:          "builtproject_runtime",
  description: "L5b harness modules load and reference project fixture exists",
  fn(ctx) {
    const root = ctx.root;

    // Check harness core modules
    const modules = [
      "code/src/runtime/builtproject/scenario_loader.js",
      "code/src/runtime/builtproject/harness_runner.js",
      "code/src/runtime/builtproject/verdict_aggregator.js",
      "code/src/runtime/builtproject/loopback_signal.js",
    ];

    for (const rel of modules) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) {
        return { status: "FAIL", detail: `Missing harness module: ${rel}` };
      }
      try {
        require(abs);
      } catch (err) {
        return { status: "FAIL", detail: `Cannot require ${rel}: ${err.message}` };
      }
    }

    // Check all 8 assertion type modules exist
    const assertionTypes = [
      "http_status_equals",
      "response_body_contains_key",
      "response_body_field_equals",
      "response_body_is_array",
      "response_body_matches_schema",
      "process_exit_code_equals",
      "file_exists",
      "stdout_contains",
      "response_header_equals",
    ];

    const assertionBase = path.join(root, "code/src/runtime/builtproject/assertion_types");
    for (const type of assertionTypes) {
      const abs = path.join(assertionBase, `${type}.js`);
      if (!fs.existsSync(abs)) {
        return { status: "FAIL", detail: `Missing assertion type module: ${type}.js` };
      }
      try {
        const mod = require(abs);
        if (typeof mod.assert !== "function") {
          return { status: "FAIL", detail: `${type}.js must export assert function` };
        }
      } catch (err) {
        return { status: "FAIL", detail: `Cannot require assertion type ${type}: ${err.message}` };
      }
    }

    // Check reference fixture exists with server.js and forge_tests/scenarios/
    const refProject = path.join(root, "artifacts/projects/_reference_todo_api");
    if (!fs.existsSync(path.join(refProject, "server.js"))) {
      return { status: "FAIL", detail: "Reference project server.js not found" };
    }
    const scenariosDir = path.join(refProject, "forge_tests", "scenarios");
    if (!fs.existsSync(scenariosDir)) {
      return { status: "FAIL", detail: "Reference project forge_tests/scenarios/ not found" };
    }

    const scenarioFiles = fs.readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
    if (scenarioFiles.length < 6) {
      return {
        status: "FAIL",
        detail: `Expected at least 6 scenario files, found ${scenarioFiles.length}`
      };
    }

    return {
      status: "PASS",
      detail: `L5b harness OK — 4 modules, 9 assertion types, ${scenarioFiles.length} reference scenarios`
    };
  }
};

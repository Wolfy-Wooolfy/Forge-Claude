"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Loads L5b test scenarios from a project's forge_tests/scenarios/ directory.
 *
 * @param {string} projectRoot  Absolute path to the built project root.
 * @param {string[]} [ids]      Optional list of scenario IDs to filter. If omitted, loads all.
 * @returns {{ scenarios: object[], errors: string[] }}
 */
function loadScenarios(projectRoot, ids) {
  const scenariosDir = path.join(projectRoot, "forge_tests", "scenarios");

  if (!fs.existsSync(scenariosDir)) {
    return { scenarios: [], errors: [`scenarios directory not found: ${scenariosDir}`] };
  }

  let files;
  try {
    files = fs.readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
  } catch (err) {
    return { scenarios: [], errors: [`Failed to read scenarios directory: ${err.message}`] };
  }

  const scenarios = [];
  const errors = [];

  for (const file of files) {
    const fullPath = path.join(scenariosDir, file);
    let raw;
    try {
      raw = fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      errors.push(`Cannot read ${file}: ${err.message}`);
      continue;
    }

    let scenario;
    try {
      scenario = JSON.parse(raw);
    } catch (err) {
      errors.push(`Invalid JSON in ${file}: ${err.message}`);
      continue;
    }

    const missing = _validateRequired(scenario);
    if (missing.length > 0) {
      errors.push(`${file} missing required fields: ${missing.join(", ")}`);
      continue;
    }

    if (ids && ids.length > 0 && !ids.includes(scenario.id)) {
      continue;
    }

    scenarios.push(scenario);
  }

  return { scenarios, errors };
}

const REQUIRED_FIELDS = ["id", "name", "description", "category", "setup", "execution", "assertions", "teardown"];

function _validateRequired(scenario) {
  return REQUIRED_FIELDS.filter((f) => scenario[f] === undefined || scenario[f] === null);
}

module.exports = { loadScenarios };

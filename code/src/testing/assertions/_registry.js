"use strict";

const path = require("path");
const fs   = require("fs");

const _ASSERTIONS_DIR = __dirname;

const _registry = {};

function _loadAll() {
  const files = fs.readdirSync(_ASSERTIONS_DIR).filter(
    (f) => f.endsWith(".js") && f !== "_registry.js"
  );
  for (const file of files) {
    const mod = require(path.join(_ASSERTIONS_DIR, file));
    if (mod && mod.type) {
      _registry[mod.type] = mod;
    }
  }
}

_loadAll();

/**
 * Run a single assertion against a result object.
 *
 * @param {object} assertion - { type, ...params }
 * @param {object} result    - scenario execution result
 * @param {object} ctx       - { root }
 * @returns {{ passed: boolean, detail: string }}
 */
function runAssertion(assertion, result, ctx) {
  const mod = _registry[assertion.type];
  if (!mod) {
    return {
      passed: false,
      detail: "unknown assertion type: " + assertion.type
    };
  }
  try {
    return mod.run(assertion, result, ctx);
  } catch (err) {
    return {
      passed: false,
      detail: "assertion threw: " + err.message
    };
  }
}

/**
 * Run all assertions for a scenario and return results.
 *
 * @param {Array}  assertions
 * @param {object} result
 * @param {object} ctx
 * @returns {{ allPassed: boolean, results: Array }}
 */
function runAll(assertions, result, ctx) {
  const results   = [];
  let   allPassed = true;

  for (const assertion of assertions) {
    const r = runAssertion(assertion, result, ctx);
    results.push(Object.assign({}, assertion, { passed: r.passed, detail: r.detail }));
    if (!r.passed) allPassed = false;
  }

  return { allPassed, results };
}

module.exports = { runAssertion, runAll };

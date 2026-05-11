"use strict";

const path = require("path");

const { defineAdapter, success, failed } = require("../_adapter_contract");

const RESPONSES_PATH = path.join(__dirname, "mock_responses.json");

// Loaded once at module init — determinism requires stable module-level state.
let _responses;
try {
  _responses = require(RESPONSES_PATH);
} catch {
  _responses = {};
}

// Hash key: prefer scenario-id tag if present; fall back to prompt-prefix (PHASE-7-F-1 compat).
function _hashKey(input) {
  const scenarioMatch = (input.prompt || "").match(/SCENARIO_TAG:\s*([A-Z0-9]+)/);
  if (scenarioMatch) {
    return [input.provider, input.model, "scenario:" + scenarioMatch[1]].join("|");
  }
  const p = (input.prompt || "").slice(0, 500);
  return [input.provider, input.model, p].join("|");
}

const MOCK_ADAPTER_ID = "mock";

const mockAdapter = defineAdapter({
  id:    MOCK_ADAPTER_ID,
  label: "Mock (deterministic, zero-cost, TEST mode)",

  async available() {
    return true;
  },

  async invoke(input) {
    const start  = Date.now();
    const key    = _hashKey(input);
    const scripted = _responses[key];

    const text         = scripted ? scripted.text         : "[mock] no scripted response for this input";
    const tokens_in    = scripted ? (scripted.tokens_in  || 10)  : 10;
    const tokens_out   = scripted ? (scripted.tokens_out || 20)  : 20;
    const finish_reason = scripted ? (scripted.finish_reason || "stop") : "stop";
    const latency_ms   = Date.now() - start;

    return success(
      {
        text,
        tokens_in,
        tokens_out,
        latency_ms,
        cost_usd:      0,
        provider:      MOCK_ADAPTER_ID,
        model:         input.model || "mock",
        finish_reason
      },
      null,
      false
    );
  }
});

module.exports = mockAdapter;

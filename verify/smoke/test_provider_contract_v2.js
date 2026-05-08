"use strict";
// Smoke test for PHASE-1 Provider Contract v2.
// 7 deterministic scenarios — no real OpenAI calls.

const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");

let total = 0, passed = 0;

function check(name, condition) {
  total++;
  if (condition) {
    passed++;
    console.log("PASS  " + name);
  } else {
    console.log("FAIL  " + name);
  }
}

(async () => {
  // ── Scenario 1: Registry loads without errors ──────────────────────────
  const { createRegistry, resetDefaultRegistry } = require(
    path.join(ROOT, "code/src/providers/_contract/providerRegistry")
  );
  resetDefaultRegistry();
  let registry, loadError = null;
  try {
    registry = createRegistry({ root: ROOT }).load();
  } catch (err) {
    loadError = err;
    console.error("Registry load error:", err.message);
  }
  check("S1: registry loads without error", !loadError);

  // ── Scenario 2: Registry reports 12 providers (all legacy) ─────────────
  const summary = registry ? registry.healthSummary() : { total: 0, legacy: 0, v2_compliant: 0 };
  check("S2: 12 providers registered",       summary.total === 12);
  check("S3: all 12 are legacy in PHASE-1",  summary.legacy === 12 && summary.v2_compliant === 0);

  // ── Scenario 4: defineProvider rejects invalid contract ────────────────
  const { defineProvider, validateAgainstSchema } = require(
    path.join(ROOT, "code/src/providers/_contract/providerContract")
  );
  let validationError = null;
  try {
    defineProvider({ id: "Bad-ID-with-CAPS" }, () => {});
  } catch (err) {
    validationError = err;
  }
  check("S4: invalid contract throws",              validationError !== null);
  check("S4: error reason is INVALID_CONTRACT",
    validationError && validationError.reason === "INVALID_CONTRACT");

  // ── Scenario 5: validateAgainstSchema — valid object ──────────────────
  const issues1 = validateAgainstSchema(
    { name: "forge" },
    { type: "object", required: ["name"], properties: { name: { type: "string" } } },
    "$"
  );
  check("S5: valid input produces no schema issues", issues1.length === 0);

  // ── Scenario 6: validateAgainstSchema — type mismatch ─────────────────
  const issues2 = validateAgainstSchema(
    { name: 42 },
    { type: "object", required: ["name"], properties: { name: { type: "string" } } },
    "$"
  );
  check("S6: invalid input produces schema issues", issues2.length > 0);

  // ── Scenario 7: ProviderError.toEnvelope() shape ──────────────────────
  const { InvalidInputError } = require(
    path.join(ROOT, "code/src/providers/_contract/providerErrors")
  );
  const err = new InvalidInputError("missing field x", { field: "x" });
  const envelope = err.toEnvelope({ provider_id: "test_provider", provider_version: "1.0.0" });
  check("S7: toEnvelope() returns correct shape",
    envelope.status === "FAILED" &&
    envelope.output === null &&
    envelope.metadata.reason === "INVALID_INPUT" &&
    envelope.metadata.provider_id === "test_provider"
  );

  console.log("\n" + passed + "/" + total + " passed");
  process.exit(passed === total ? 0 : 1);
})();

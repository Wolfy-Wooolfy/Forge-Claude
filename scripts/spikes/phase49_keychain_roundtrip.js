"use strict";

/**
 * PHASE-49 W-A — real Windows keychain round-trip proof.
 * Exercises the FIXED windows_credential_manager.js get() (here-string now
 * newline-delimited via .join("\r\n")). Proves set -> get(match) -> del -> get(gone).
 *
 * Ops spike (scripts/**, outside Track A live surface). $0 — no LLM.
 * Writes evidence to artifacts/spikes/phase49_keychain/roundtrip.json.
 * The test key is deleted at the end — no keychain residue.
 */

const fs   = require("fs");
const path = require("path");

const wcm  = require("../../code/src/runtime/secrets/windows_credential_manager");

const ROOT     = path.resolve(__dirname, "..", "..");
const EVID_DIR = path.join(ROOT, "artifacts", "spikes", "phase49_keychain");
const KEY      = "phase49_roundtrip_test";
const VALUE    = "forge-keychain-roundtrip-value-2026-07-01";

async function main() {
  const steps = {};

  steps.platform    = process.platform;
  steps.isAvailable = wcm.isAvailable();

  if (process.platform !== "win32" || !steps.isAvailable) {
    steps.verdict = "SKIP";
    steps.reason  = "not win32 or cmdkey unavailable";
    return steps;
  }

  // 1) SET
  steps.set = await wcm.set(KEY, VALUE);

  // 2) GET (must match) — this is the call that was broken by .join("; ")
  steps.get = await wcm.get(KEY);
  steps.get_value_matches = steps.get.ok === true && steps.get.value === VALUE;

  // 3) DEL
  steps.del = await wcm.delete(KEY);

  // 4) GET again (must be gone)
  steps.get_after_del = await wcm.get(KEY);
  steps.gone_after_del = steps.get_after_del.ok === false &&
                         steps.get_after_del.reason === "not_found";

  steps.verdict =
    steps.set.ok === true &&
    steps.get_value_matches === true &&
    steps.del.ok === true &&
    steps.gone_after_del === true
      ? "PASS"
      : "FAIL";

  return steps;
}

main()
  .then((result) => {
    result.ran_at = new Date().toISOString();
    fs.mkdirSync(EVID_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EVID_DIR, "roundtrip.json"),
      JSON.stringify(result, null, 2),
      "utf8"
    );
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verdict === "FAIL" ? 1 : 0);
  })
  .catch((err) => {
    console.error("ROUNDTRIP_CRASH:", err && err.message ? err.message : String(err));
    process.exit(2);
  });

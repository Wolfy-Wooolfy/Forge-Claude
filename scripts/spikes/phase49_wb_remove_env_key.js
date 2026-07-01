"use strict";

/**
 * PHASE-49 W-B step 4 — remove the OPENAI_API_KEY line from .env.
 * Runs ONLY after the key is proven present in the keychain (step 1) and the boot
 * hydration is proven (step 3) — so the key is never absent from BOTH env and keychain.
 * Removes ONLY the exact OPENAI_API_KEY= line; every other line is preserved verbatim.
 * Never prints the value.
 *
 * Ops spike (scripts/**, outside Track A). $0.
 */

const fs   = require("fs");
const path = require("path");

const ROOT     = path.resolve(__dirname, "..", "..");
const ENV_PATH = path.join(ROOT, ".env");

const before = fs.readFileSync(ENV_PATH, "utf8");
const hadKey = /^OPENAI_API_KEY=.*$/m.test(before);

// Remove the exact OPENAI_API_KEY line + its trailing newline (CRLF or LF).
// The `=` anchor ensures OPENAI_MODEL / OPENAI_*_MODEL lines are untouched.
const after = before.replace(/^OPENAI_API_KEY=.*\r?\n?/m, "");
fs.writeFileSync(ENV_PATH, after, "utf8");

const stillHasKey = /^OPENAI_API_KEY=/m.test(after);
const result = {
  step: "remove_env_key",
  had_openai_key_before: hadKey,
  still_has_openai_key_after: stillHasKey,
  verdict: (hadKey && !stillHasKey) ? "PASS" : "FAIL"
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.verdict === "PASS" ? 0 : 1);

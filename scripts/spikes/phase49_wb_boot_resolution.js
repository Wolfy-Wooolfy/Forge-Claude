"use strict";

/**
 * PHASE-49 W-B step 3 — prove the boot hydration logic deterministically,
 * BEFORE removing the key from .env (invariant: key still in both env + keychain).
 *   (A) keychain-path: with OPENAI_API_KEY unset, hydration populates it from the keychain.
 *   (B) env-wins:      with OPENAI_API_KEY already set, hydration does NOT override it.
 * Replicates the EXACT start-api.js hydration snippet. Never prints the real value.
 *
 * Ops spike (scripts/**, outside Track A). $0 — no OpenAI call.
 * Evidence -> artifacts/spikes/phase49_openai_key/boot_resolution.json.
 */

const fs   = require("fs");
const path = require("path");
const secret_provider = require("../../code/src/runtime/secrets/secret_provider");

const ROOT     = path.resolve(__dirname, "..", "..");
const EVID_DIR = path.join(ROOT, "artifacts", "spikes", "phase49_openai_key");

// EXACT copy of the start-api.js boot hydration logic.
async function hydrate() {
  if (!process.env.OPENAI_API_KEY) {
    try {
      const r = await secret_provider.get("openai_api_key");
      if (r && r.ok && r.value) process.env.OPENAI_API_KEY = r.value;
    } catch (_) { /* fail-open */ }
  }
}

async function main() {
  const out = { step: "boot_resolution" };

  // (A) keychain-path — unset, then hydrate: must resolve from keychain.
  delete process.env.OPENAI_API_KEY;
  await hydrate();
  out.A_keychain_path = {
    resolved: !!process.env.OPENAI_API_KEY,
    length:   process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
  };

  // (B) env-wins — pre-set a sentinel, then hydrate: must NOT override.
  const SENTINEL = "ENV_WINS_SENTINEL_NOT_A_REAL_KEY";
  process.env.OPENAI_API_KEY = SENTINEL;
  await hydrate();
  out.B_env_wins = { preserved: process.env.OPENAI_API_KEY === SENTINEL };
  delete process.env.OPENAI_API_KEY;

  out.verdict =
    (out.A_keychain_path.resolved && out.A_keychain_path.length >= 20 && out.B_env_wins.preserved)
      ? "PASS" : "FAIL";
  return out;
}

main()
  .then((r) => {
    r.ran_at = new Date().toISOString();
    fs.mkdirSync(EVID_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVID_DIR, "boot_resolution.json"), JSON.stringify(r, null, 2), "utf8");
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.verdict === "FAIL" ? 1 : 0);
  })
  .catch((e) => { console.error("RESOLUTION_CRASH:", e && e.message ? e.message : String(e)); process.exit(2); });

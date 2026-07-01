"use strict";

/**
 * PHASE-49 W-B step 1 — store OPENAI_API_KEY into the OS keychain + verify round-trip.
 * Reads the REAL key from .env; NEVER prints the value (only length + match booleans).
 * Uses secret_provider (the same abstraction openaiApiKey.js reads) so the doctor
 * check will find it under the exact name "openai_api_key".
 *
 * Ops spike (scripts/**, outside Track A live surface). $0 — no OpenAI call.
 * Evidence -> artifacts/spikes/phase49_openai_key/store_verify.json.
 */

const fs   = require("fs");
const path = require("path");
const secret_provider = require("../../code/src/runtime/secrets/secret_provider");

const ROOT     = path.resolve(__dirname, "..", "..");
const EVID_DIR = path.join(ROOT, "artifacts", "spikes", "phase49_openai_key");

function readEnvKey(name) {
  const content = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() === name) return t.slice(eq + 1).trim();
  }
  return null;
}

async function main() {
  const key = readEnvKey("OPENAI_API_KEY");
  const out = {
    step: "store_and_verify",
    key_present_in_env: !!key,
    key_length: key ? key.length : 0
  };
  if (!key) { out.verdict = "FAIL"; out.reason = "OPENAI_API_KEY not found in .env"; return out; }

  const setRes = await secret_provider.set("openai_api_key", key);
  out.set_ok = !!(setRes && setRes.ok);

  const getRes = await secret_provider.get("openai_api_key");
  out.get_ok       = !!(getRes && getRes.ok);
  out.get_length   = out.get_ok ? getRes.value.length : 0;
  out.value_matches = out.get_ok && getRes.value === key;
  out.provider_type = await secret_provider.provider_type();

  out.verdict = (out.set_ok && out.get_ok && out.value_matches) ? "PASS" : "FAIL";
  return out;
}

main()
  .then((r) => {
    r.ran_at = new Date().toISOString();
    fs.mkdirSync(EVID_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVID_DIR, "store_verify.json"), JSON.stringify(r, null, 2), "utf8");
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.verdict === "FAIL" ? 1 : 0);
  })
  .catch((e) => { console.error("STORE_CRASH:", e && e.message ? e.message : String(e)); process.exit(2); });

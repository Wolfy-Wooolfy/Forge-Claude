"use strict";

// PHASE-52 Gate #10 — $0 PRE-FLIGHT (no gpt-4o spend). Verifies:
//   (a) TAVILY_API_KEY present (never prints the value)
//   (b) OPENAI_API_KEY available via env/.env/OS keychain (same hydration as phase51_w3_gate10.js)
//   (c) BRAVE_SEARCH_API_KEY is UNSET (so research.search_web uses the Tavily path)
//   (d) ONE real research.search_web call (Tavily free tier = $0): SUCCESS + provider_used=tavily + >=1 url
// STOP (exit 1) on any failure — no gpt-4o call is made here.

const path = require("path");
const fs   = require("fs");

// Hand-rolled .env loader (same seam as the gate script; does not override existing env).
;(function loadDotEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) {}
}());

const ROOT = path.resolve(__dirname, "..", "..");
const PID  = "phase52_preflight";
const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

function stop(code, detail) {
  console.error("\n⛔  PRE-FLIGHT STOP:", code, "—", detail);
  process.exit(1);
}
function mask(v) { return { len: v.length, prefix: v.slice(0, 4) }; }

(async () => {
  console.log("\n══ PHASE-52 Gate #10 — $0 PRE-FLIGHT ══\n");

  // (a) TAVILY_API_KEY present
  const tav = process.env.TAVILY_API_KEY;
  if (!tav) stop("NO_TAVILY_KEY", "TAVILY_API_KEY absent from env/.env");
  const tm = mask(tav);
  console.log("  (a) TAVILY_API_KEY: SET (len=" + tm.len + ", prefix=" + tm.prefix + "...)");

  // (b) OPENAI_API_KEY via env/.env/keychain
  if (!process.env.OPENAI_API_KEY) {
    try {
      const secret_provider = require(path.join(ROOT, "code", "src", "runtime", "secrets", "secret_provider"));
      const kr = await secret_provider.get("openai_api_key");
      if (kr && kr.ok && kr.value) { process.env.OPENAI_API_KEY = kr.value; console.log("      [secret] OPENAI_API_KEY hydrated from keychain"); }
    } catch (_) {}
  }
  const oa = process.env.OPENAI_API_KEY;
  if (!oa) stop("NO_OPENAI_KEY", "OPENAI_API_KEY absent from env/.env/keychain");
  console.log("  (b) OPENAI_API_KEY: SET (len=" + oa.length + ")");

  // (c) BRAVE_SEARCH_API_KEY must be UNSET (so search_web uses Tavily)
  if (process.env.BRAVE_SEARCH_API_KEY) {
    stop("BRAVE_KEY_SET", "BRAVE_SEARCH_API_KEY is SET — Brave would be tried first; this gate must exercise Tavily. Unset it or get CTO confirmation.");
  }
  console.log("  (c) BRAVE_SEARCH_API_KEY: UNSET ✓ (Tavily path will be used)");

  // (d) ONE real research.search_web call — $0 (Tavily free tier). A-1 re-run addition:
  //     search_web now sends include_raw_content (D-A1.1); assert ≥1 result carries a
  //     NON-EMPTY `content` field — the ingest path's input — BEFORE any gpt-4o spend.
  console.log("\n  (d) real research.search_web (Tavily, $0 free tier, include_raw_content) — throwaway query …");
  const reg = getDefaultRegistry();
  const env = await reg.invoke("research.search_web",
    { query: "REST API design best practices", project_id: PID, max_results: 3 }, { root: ROOT });
  const ok  = env && env.status === "SUCCESS";
  const out = (env && env.output) || {};
  const results = out.results || [];
  const provider = out.provider_used;
  const withContent = results.filter(r => r && typeof r.content === "string" && r.content.trim().length > 0);
  console.log("      status=" + (env && env.status) + " provider_used=" + provider + " results=" + results.length +
              " with_non_empty_content=" + withContent.length);
  if (results[0]) console.log("      first url: " + results[0].url);
  if (withContent[0]) console.log("      first content length: " + withContent[0].content.length + " chars");
  // cleanup the preflight project dir (cost-ledger estimate entry)
  try { const d = path.join(ROOT, "artifacts", "projects", PID); if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}

  if (!ok)                       stop("SEARCH_FAILED", "research.search_web did not return SUCCESS: " + JSON.stringify(env && env.metadata));
  if (provider !== "tavily")     stop("WRONG_PROVIDER", "provider_used=" + provider + " (expected tavily)");
  if (results.length < 1)        stop("NO_RESULTS", "search returned 0 result URLs");
  if (withContent.length < 1)    stop("NO_RAW_CONTENT", "no result carries a non-empty content field — the ingest path would have nothing to ingest");

  console.log("\n✅  PRE-FLIGHT CLEAN — (a)(b)(c)(d) all pass. Ready for the real Gate #10 re-run.\n");
  process.exit(0);
})().catch(e => stop("SCRIPT_ERROR", e && e.stack || e));

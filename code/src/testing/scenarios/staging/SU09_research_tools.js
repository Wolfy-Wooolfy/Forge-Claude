"use strict";

// SU09 — research_tools.js unit test (mock registry via ctx._reg injection)

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { tools }     = require("../../../runtime/tools/research_tools");
const { createPolicy } = require("../../../runtime/permission/permissionPolicy");
const { readAll }   = require("../../../runtime/kb/cost_ledger");

const fetch_url_tool  = tools.find(t => t.name === "research.fetch_url");
const search_web_tool = tools.find(t => t.name === "research.search_web");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su09_" + Date.now());
const PID      = "test_proj_su09";

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail ? ("| " + detail) : ""); failed++; }
}

// ── Mock registry factory ─────────────────────────────────────────────────────

function makeMockReg(httpGetFn, httpPostFn) {
  return {
    async invoke(toolName, input, ctx) {
      if (toolName === "http.get") {
        return httpGetFn ? httpGetFn(input) : { status: "FAILED", metadata: { reason: "HTTP_GET_MOCKED_FAIL" } };
      }
      if (toolName === "http.post") {
        return httpPostFn ? httpPostFn(input) : { status: "FAILED", metadata: { reason: "HTTP_POST_MOCKED_FAIL" } };
      }
      if (toolName === "fs.write_file") {
        const root    = (ctx && ctx.root) || TMP_ROOT;
        const absPath = path.resolve(root, input.path);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, input.content, "utf8");
        return { status: "SUCCESS", output: { path: input.path }, metadata: {} };
      }
      return { status: "FAILED", metadata: { reason: "UNKNOWN_TOOL_" + toolName } };
    }
  };
}

// ── env save/restore helpers ─────────────────────────────────────────────────

function saveEnv(keys) {
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  return saved;
}

function restoreEnv(saved) {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

async function run() {
  console.log("SU09 — research_tools");

  // ── T1: research.fetch_url happy path ────────────────────────────────────────

  const htmlBody = "<html><head><title>Fetch Test</title></head><body><p>Hello from fetch.</p></body></html>";
  const r1 = await fetch_url_tool.execute(
    { url: "https://example.com/t1", project_id: PID },
    { root: TMP_ROOT, _reg: makeMockReg(() => ({
        status: "SUCCESS",
        output: { status_code: 200, body: htmlBody, headers: { "content-type": "text/html" } },
        metadata: {}
      }))
    }
  );

  assert("T1: envelope status = SUCCESS",    r1.status === "SUCCESS",                          r1.status);
  assert("T1: output.status = OK",           r1.output && r1.output.status === "OK",           r1.output && r1.output.status);
  assert("T1: output.src_id starts src_",    r1.output && r1.output.src_id.startsWith("src_"), r1.output && r1.output.src_id);

  // ── T2: research.search_web — Brave primary success ──────────────────────────

  const bravePayload = JSON.stringify({
    web: {
      results: [
        { url: "https://example.com/r1", title: "Result 1", description: "Snippet 1" },
        { url: "https://example.com/r2", title: "Result 2", description: "Snippet 2" }
      ]
    }
  });

  const env2 = saveEnv(["BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY"]);
  process.env.BRAVE_SEARCH_API_KEY = "test_brave_key_su09";
  delete process.env.TAVILY_API_KEY;

  const PID_BRAVE = PID + "_brave";
  const r2 = await search_web_tool.execute(
    { query: "test query", project_id: PID_BRAVE, max_results: 2 },
    { root: TMP_ROOT, _reg: makeMockReg(
        () => ({ status: "SUCCESS", output: { status_code: 200, body: bravePayload, headers: {} }, metadata: {} })
      )
    }
  );

  restoreEnv(env2);

  assert("T2: status = SUCCESS",       r2.status === "SUCCESS",                            r2.status);
  assert("T2: provider_used = brave",  r2.output && r2.output.provider_used === "brave",   r2.output && r2.output.provider_used);
  assert("T2: results.length = 2",     r2.output && r2.output.results.length === 2,        r2.output && r2.output.results && r2.output.results.length);

  const ledger2 = readAll(PID_BRAVE, { root: TMP_ROOT });
  assert("T2: cost ledger has 1 entry", ledger2.length === 1, ledger2.length);

  // ── T3: Brave absent, Tavily fallback success ────────────────────────────────

  const tavilyPayload = JSON.stringify({
    results: [
      { url: "https://tavily.com/r1", title: "Tavily 1", content: "Tavily snippet" }
    ]
  });

  const env3 = saveEnv(["BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY"]);
  delete process.env.BRAVE_SEARCH_API_KEY;
  process.env.TAVILY_API_KEY = "test_tavily_key_su09";

  const r3 = await search_web_tool.execute(
    { query: "tavily fallback query", project_id: PID + "_tavily" },
    { root: TMP_ROOT, _reg: makeMockReg(
        null,
        () => ({ status: "SUCCESS", output: { status_code: 200, body: tavilyPayload, headers: {} }, metadata: {} })
      )
    }
  );

  restoreEnv(env3);

  assert("T3: provider_used = tavily", r3.output && r3.output.provider_used === "tavily", r3.output && r3.output.provider_used);
  assert("T3: results.length = 1",     r3.output && r3.output.results.length === 1,      r3.output && r3.output.results && r3.output.results.length);

  // ── T4: both providers absent → FAILED ───────────────────────────────────────

  const env4 = saveEnv(["BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY"]);
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.TAVILY_API_KEY;

  const r4 = await search_web_tool.execute(
    { query: "no providers", project_id: PID + "_noprov" },
    { root: TMP_ROOT, _reg: makeMockReg() }
  );

  restoreEnv(env4);

  assert("T4: status = FAILED when both providers absent", r4.status === "FAILED", r4.status);

  // ── T5: READ_ONLY mode → research.search_web denied ─────────────────────────

  const policy    = createPolicy({ active_mode: "READ_ONLY", root: TMP_ROOT });
  const authResult = await policy.authorize(
    search_web_tool,
    { query: "q", project_id: PID },
    {}
  );

  assert("T5: READ_ONLY denies search_web",
    authResult.allow === false, "allow=" + authResult.allow);
  assert("T5: reason = RESEARCH_SEARCH_DENIED_IN_READ_ONLY",
    authResult.reason === "RESEARCH_SEARCH_DENIED_IN_READ_ONLY", authResult.reason);

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU09:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU09 ERROR:", err.message, err.stack);
  process.exit(1);
});

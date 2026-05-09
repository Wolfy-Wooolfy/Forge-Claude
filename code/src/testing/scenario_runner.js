"use strict";

const path = require("path");
const fs   = require("fs");

// ── HTTP helper (used by globalThis.fetch override for raw-fetch providers) ────

function _httpFetch(url, options) {
  const http = require("http");
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { reject(e); return; }
    const reqOpts = {
      hostname: u.hostname,
      port:     Number(u.port) || 80,
      path:     u.pathname + (u.search || ""),
      method:   (options && options.method) || "POST",
      headers:  (options && options.headers) || {}
    };
    const req = http.request(reqOpts, (res) => {
      let buf = "";
      res.on("data",  (chunk) => { buf += chunk; });
      res.on("end",   () => {
        const statusCode = res.statusCode;
        resolve({
          ok:   statusCode >= 200 && statusCode < 300,
          status: statusCode,
          json: () => Promise.resolve(JSON.parse(buf)),
          text: () => Promise.resolve(buf)
        });
      });
    });
    req.on("error", reject);
    if (options && options.body) req.write(String(options.body));
    req.end();
  });
}

// ── Auto-deny prompter (PROMPT mode in tests — no interactive session) ─────────

const _autoDenyPrompter = {
  request:     async () => ({ decision: "DENY", reason: "TEST_AUTO_DENY" }),
  listPending: ()    => [],
  getPending:  ()    => null,
  respond:     ()    => ({ ok: false, reason: "NOT_FOUND" }),
  cancelAll:   ()    => {}
};

// ── Result normalizers ─────────────────────────────────────────────────────────

function _normalizeToolResult(raw, audit) {
  return {
    status: raw && raw.status ? String(raw.status) : "FAILED",
    output: {
      response:   "",
      tool_calls: [],
      state:      (raw && raw.output) || {}
    },
    audit: audit || []
  };
}

function _normalizeProviderResult(raw) {
  const out = (raw && raw.output) || {};
  return {
    status: raw && raw.status ? String(raw.status) : "FAILED",
    output: {
      response:   String(out.message || ""),
      tool_calls: [],
      state:      out
    },
    audit: []
  };
}

function _normalizeDoctorResult(raw) {
  return {
    status: (raw && raw.ok) ? "PASS" : "FAIL",
    output: {
      response:   (raw && raw.summary) || "",
      tool_calls: [],
      state: {
        ok:     !!(raw && raw.ok),
        counts: (raw && raw.counts) || {},
        checks: (raw && raw.checks) || []
      }
    },
    audit: []
  };
}

// ── Dispatch: direct_provider ─────────────────────────────────────────────────

async function _runDirectProvider(scenario, root) {
  const { MockOpenAiService } = require("./mock_openai_service");

  const mockMap = {};
  mockMap[scenario.id] = scenario.mock;

  const svc = await MockOpenAiService.start(mockMap);

  const savedEnv = {
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_API_KEY:  process.env.OPENAI_API_KEY
  };

  // Use a plausible fake key (length >= 20) so providers don't short-circuit
  process.env.OPENAI_BASE_URL = svc.url;
  process.env.OPENAI_API_KEY  = "sk-mock-harness-" + scenario.id.toLowerCase() + "-0000";

  // Override globalThis.fetch: redirect hardcoded api.openai.com calls to mock
  const origFetch  = globalThis.fetch;
  const mockTarget = svc.url + "/v1/chat/completions";

  globalThis.fetch = async function _forgeMockedFetch(url, init) {
    if (typeof url === "string" && url.includes("api.openai.com")) {
      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
      body._forge_scenario_id = scenario.id;
      return _httpFetch(mockTarget, Object.assign({}, init, { body: JSON.stringify(body) }));
    }
    if (typeof origFetch === "function") return origFetch(url, init);
    return _httpFetch(String(url), init);
  };

  let raw;
  try {
    const provDir  = path.join(root, "code", "src", "providers");
    const Cls      = require(path.join(provDir, scenario.provider));
    const provider = new Cls();
    raw = await provider.executeTask({
      task_id: scenario.id,
      context: Object.assign({}, scenario.input || {})
    });
  } finally {
    if (savedEnv.OPENAI_BASE_URL !== undefined)
      process.env.OPENAI_BASE_URL = savedEnv.OPENAI_BASE_URL;
    else
      delete process.env.OPENAI_BASE_URL;

    if (savedEnv.OPENAI_API_KEY !== undefined)
      process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;

    globalThis.fetch = origFetch;
    await svc.close();
  }

  return _normalizeProviderResult(raw);
}

// ── Dispatch: direct_tool ─────────────────────────────────────────────────────

async function _runDirectTool(scenario, root) {
  const { createPolicy }   = require(
    path.join(root, "code", "src", "runtime", "permission", "permissionPolicy")
  );
  const { createRegistry } = require(
    path.join(root, "code", "src", "runtime", "tools", "_registry")
  );
  const { readEntries }    = require(
    path.join(root, "code", "src", "runtime", "audit", "toolAuditLog")
  );

  const envToSet = Object.assign(
    { FORGE_PERMISSION_MODE: scenario.permission },
    scenario.env || {}
  );
  const savedEnv = {};
  for (const key of Object.keys(envToSet)) {
    savedEnv[key] = process.env[key];
    process.env[key] = envToSet[key];
  }

  const prompter = (scenario.permission === "PROMPT") ? _autoDenyPrompter : undefined;

  const policy = createPolicy({
    root,
    active_mode: scenario.permission,
    prompter
  });

  const registry = createRegistry({ root });
  registry.load();
  registry.setAuthorizeFunction((tool, input, ctx) => policy.authorize(tool, input, ctx));

  const startTs = new Date().toISOString();

  let raw;
  try {
    raw = await registry.invoke(
      scenario.tool,
      scenario.input || {},
      { root }
    );
  } finally {
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }

  const newAudit = readEntries(root, { since_ts: startTs });
  return _normalizeToolResult(raw, newAudit);
}

// ── Dispatch: direct_doctor ───────────────────────────────────────────────────

async function _runDirectDoctor(scenario, root) {
  const savedEnv = {};
  for (const [key, val] of Object.entries(scenario.env || {})) {
    savedEnv[key] = process.env[key];
    process.env[key] = val;
  }

  let raw;
  try {
    const { runDoctor } = require(
      path.join(root, "code", "src", "runtime", "doctor", "runDoctor")
    );
    raw = await runDoctor({ root, write_report: false, update_status: false });
  } finally {
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }

  return _normalizeDoctorResult(raw);
}

// ── Single scenario runner ────────────────────────────────────────────────────

async function _runOne(scenario, root) {
  const t0   = Date.now();
  const base = {
    id:          scenario.id,
    name:        scenario.name,
    status:      "FAIL",
    skip_reason: null,
    duration_ms: 0,
    assertions:  [],
    error:       null
  };

  try {
    if (scenario.type === "conversation") {
      return Object.assign(base, {
        status:      "SKIP",
        skip_reason: "conversation engine not wired",
        duration_ms: Date.now() - t0
      });
    }

    let execResult;
    if (scenario.type === "direct_provider") {
      execResult = await _runDirectProvider(scenario, root);
    } else if (scenario.type === "direct_tool") {
      execResult = await _runDirectTool(scenario, root);
    } else if (scenario.type === "direct_doctor") {
      execResult = await _runDirectDoctor(scenario, root);
    } else {
      throw new Error("unknown scenario type: " + scenario.type);
    }

    const { runAll } = require("./assertions/_registry");
    const ctx = { root };
    const { allPassed, results: assertResults } = runAll(
      scenario.assertions || [],
      execResult,
      ctx
    );

    return Object.assign(base, {
      status:      allPassed ? "PASS" : "FAIL",
      assertions:  assertResults,
      duration_ms: Date.now() - t0
    });

  } catch (err) {
    return Object.assign(base, {
      status:      "FAIL",
      error:       err.message,
      duration_ms: Date.now() - t0
    });
  }
}

// ── Test artifact cleanup ─────────────────────────────────────────────────────

const SELF_TEST_DIR = path.join("artifacts", "self-test");

function _cleanSelfTestDir(root) {
  const dir = path.join(root, SELF_TEST_DIR);
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      try { fs.unlinkSync(path.join(dir, entry)); } catch { /* best-effort */ }
    }
    try { fs.rmdirSync(dir); } catch { /* best-effort, may not be empty */ }
  } catch { /* best-effort */ }
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function runScenarios(options) {
  const opts    = options || {};
  const root    = opts.root || process.cwd();
  const scenDir = path.join(root, "code", "src", "testing", "scenarios");
  const filter  = opts.scenarios || null;

  // Remove any previous test artifacts so each run starts clean
  _cleanSelfTestDir(root);

  const files = fs.readdirSync(scenDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let scenarios = files.map((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(scenDir, f), "utf8"));
    } catch (err) {
      throw new Error("failed to parse scenario file " + f + ": " + err.message);
    }
  });

  if (filter && filter.length > 0) {
    scenarios = scenarios.filter((s) => filter.includes(s.id));
  }

  const startedAt = new Date().toISOString();
  const t0        = Date.now();
  const results   = [];

  try {
    for (const scenario of scenarios) {
      const r = await _runOne(scenario, root);
      results.push(r);
    }
  } finally {
    // Remove test artifacts created during this run
    _cleanSelfTestDir(root);
  }

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of results) {
    if      (r.status === "PASS") counts.pass++;
    else if (r.status === "SKIP") counts.skip++;
    else                           counts.fail++;
  }

  return {
    schema_version: "1.0",
    ok:             counts.fail === 0,
    summary:        counts.pass + " passed, " + counts.fail + " failed, " + counts.skip +
                    " skipped (" + results.length + " total)",
    counts,
    started_at:     startedAt,
    duration_ms:    Date.now() - t0,
    scenarios:      results
  };
}

module.exports = { runScenarios };

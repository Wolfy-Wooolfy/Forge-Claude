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

function _normalizeConversationResult(raw, audit) {
  const ok = !!(raw && raw.ok);
  return {
    status: ok ? "PASS" : "FAIL",
    output: {
      response:   (raw && raw.message) || "",
      tool_calls: [],
      state: {
        ok,
        mode:          (raw && raw.mode)          || "UNKNOWN",
        current_state: (raw && raw.current_state) || null,
        project_id:    (raw && raw.project_id)    || null,
        reason:        (raw && raw.reason)        || null,
        turn_count:    (raw && raw.turn_count)    || 1
      }
    },
    audit: audit || []
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

// ── Result normalizer: direct_engine ─────────────────────────────────────────

function _normalizeEngineResult(raw, audit) {
  const ok = !!(raw && raw.ok);
  return {
    status: ok ? "PASS" : "FAIL",
    output: {
      response:   "",
      tool_calls: [],
      state:      Object.assign(
        { ok: false, mode: "UNKNOWN", reason: null },
        raw || {}
      )
    },
    audit: audit || []
  };
}

// ── Dispatch: direct_engine ───────────────────────────────────────────────────

async function _runDirectEngine(scenario, root) {
  const { resetDefaultRegistry } = require(
    path.join(root, "code", "src", "runtime", "tools", "_registry")
  );
  const { resetDefaultPolicy } = require(
    path.join(root, "code", "src", "runtime", "permission", "permissionPolicy")
  );
  const { readEntries } = require(
    path.join(root, "code", "src", "runtime", "audit", "toolAuditLog")
  );

  const permission = scenario.permission || "WORKSPACE_WRITE";
  const savedMode  = process.env.FORGE_PERMISSION_MODE;
  process.env.FORGE_PERMISSION_MODE = permission;
  resetDefaultRegistry();
  resetDefaultPolicy();

  const projectId   = "test_engine_" + scenario.id.toLowerCase();
  const projectDir  = path.join(root, "artifacts", "projects", projectId);
  const fixturePath = path.join(projectDir, "project_state.json");
  let fixtureCreated = false;

  if (!fs.existsSync(fixturePath)) {
    fs.mkdirSync(projectDir, { recursive: true });
    const fixtureData = scenario.fixture || {};
    fs.writeFileSync(fixturePath, JSON.stringify(
      Object.assign(
        {
          project_name:         "Engine Test " + scenario.id,
          current_state:        "DISCUSSION",
          active_runtime_state: "DISCUSSION",
          user_goal:            "",
          _version:             1,
          created_at:           new Date().toISOString()
        },
        fixtureData,
        { project_id: projectId }
      ),
      null, 2
    ));
    fixtureCreated = true;
  }

  // Write pre-existing fixture files (e.g. draft.md for docReviewEngine guard)
  if (Array.isArray(scenario.fixture_files) && scenario.fixture_files.length > 0) {
    for (const ff of scenario.fixture_files) {
      if (!ff || typeof ff.path !== "string" || typeof ff.content !== "string") continue;
      const ffPath = path.join(projectDir, ff.path);
      fs.mkdirSync(path.dirname(ffPath), { recursive: true });
      fs.writeFileSync(ffPath, ff.content, "utf8");
    }
  }

  let mockSvc   = null;
  let origFetch = null;
  const savedEnv = scenario.mock ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : null;

  if (scenario.mock) {
    const { MockOpenAiService } = require("./mock_openai_service");
    const mockMap = {};
    mockMap[scenario.id] = scenario.mock;
    mockSvc = await MockOpenAiService.start(mockMap);

    origFetch = globalThis.fetch;
    const mockTarget = mockSvc.url + "/v1/chat/completions";

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

    process.env.OPENAI_API_KEY = "sk-mock-engine-" + scenario.id.toLowerCase() + "-0000";
  }

  const startTs = new Date().toISOString();
  let raw;

  try {
    let engine;
    if (scenario.engine === "ideationEngine") {
      const { createIdeationEngine } = require(
        path.join(root, "code", "src", "ai_os", "ideationEngine")
      );
      engine = createIdeationEngine({ root });
    } else if (scenario.engine === "businessAnalysisEngine") {
      const { createBusinessAnalysisEngine } = require(
        path.join(root, "code", "src", "ai_os", "businessAnalysisEngine")
      );
      engine = createBusinessAnalysisEngine({ root });
    } else if (scenario.engine === "documentationBuildLoop") {
      const { createDocumentationBuildLoop } = require(
        path.join(root, "code", "src", "ai_os", "documentationBuildLoop")
      );
      engine = createDocumentationBuildLoop({ root });
    } else if (scenario.engine === "documentationReviewEngine") {
      const { createDocumentationReviewEngine } = require(
        path.join(root, "code", "src", "ai_os", "documentationReviewEngine")
      );
      engine = createDocumentationReviewEngine({ root });
    } else if (scenario.engine === "deliveryPackageBuilder") {
      const { createDeliveryPackageBuilder } = require(
        path.join(root, "code", "src", "ai_os", "deliveryPackageBuilder")
      );
      engine = createDeliveryPackageBuilder({ root });
    } else if (scenario.engine === "discussionLoopGate") {
      const { createDiscussionLoopGate } = require(
        path.join(root, "code", "src", "ai_os", "discussionLoopGate")
      );
      engine = createDiscussionLoopGate({ root });
    } else if (scenario.engine === "languageDetectionCompliance") {
      const { createLanguageDetectionCompliance } = require(
        path.join(root, "code", "src", "ai_os", "languageDetectionCompliance")
      );
      engine = createLanguageDetectionCompliance({ root });
    } else if (scenario.engine === "projectReviewEngine") {
      const { createProjectReviewEngine } = require(
        path.join(root, "code", "src", "ai_os", "projectReviewEngine")
      );
      engine = createProjectReviewEngine({ root });
    } else if (scenario.engine === "refinementLoopOrchestrator") {
      const { createRefinementLoopOrchestrator } = require(
        path.join(root, "code", "src", "ai_os", "refinementLoopOrchestrator")
      );
      engine = createRefinementLoopOrchestrator({ root });
    } else if (scenario.engine === "uxValidator") {
      const { createUxValidator } = require(
        path.join(root, "code", "src", "ai_os", "uxValidator")
      );
      engine = createUxValidator({ root });
    } else if (scenario.engine === "verificationLoop") {
      const { createVerificationLoop } = require(
        path.join(root, "code", "src", "ai_os", "verificationLoop")
      );
      engine = createVerificationLoop({ root });
    } else {
      throw new Error("unknown engine: " + scenario.engine);
    }

    const methodFn = engine[scenario.method];
    if (typeof methodFn !== "function") {
      throw new Error("engine method not found: " + scenario.method);
    }

    // Support positional-args via _args array in scenario.input (for methods like validateResponse(projectId, text))
    const scenInput = scenario.input || {};
    let methodResult;
    if (Array.isArray(scenInput._args)) {
      methodResult = await methodFn.apply(engine, scenInput._args);
    } else {
      const input = Object.assign({}, scenInput, { project_id: projectId });
      methodResult = await methodFn.call(engine, input);
    }
    raw = Object.assign({}, methodResult || {});
  } catch (err) {
    raw = { ok: false, mode: "BLOCKED", reason: err.message };
  } finally {
    if (savedMode !== undefined) process.env.FORGE_PERMISSION_MODE = savedMode;
    else delete process.env.FORGE_PERMISSION_MODE;
    resetDefaultRegistry();
    resetDefaultPolicy();

    if (mockSvc) {
      globalThis.fetch = origFetch;
      await mockSvc.close();
      if (savedEnv.OPENAI_API_KEY !== undefined) process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
      else delete process.env.OPENAI_API_KEY;
    }
  }

  const newAudit = readEntries(root, { since_ts: startTs });
  const result   = _normalizeEngineResult(raw, newAudit);

  if (fixtureCreated) {
    Object.defineProperty(result, "_cleanup", {
      value: () => {
        try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      },
      enumerable: false,
      writable:   false
    });
  }

  return result;
}

// ── Dispatch: conversation ────────────────────────────────────────────────────

async function _runConversation(scenario, root) {
  const { resetDefaultRegistry } = require(
    path.join(root, "code", "src", "runtime", "tools", "_registry")
  );
  const { readEntries } = require(
    path.join(root, "code", "src", "runtime", "audit", "toolAuditLog")
  );

  const permission = scenario.permission || "WORKSPACE_WRITE";
  const savedMode  = process.env.FORGE_PERMISSION_MODE;
  process.env.FORGE_PERMISSION_MODE = permission;
  resetDefaultRegistry();

  const projectId  = scenario.project_id ||
    ("test_conv_" + scenario.id.toLowerCase());
  const projectDir  = path.join(root, "artifacts", "projects", projectId);
  const fixturePath = path.join(projectDir, "project_state.json");
  let fixtureCreated = false;

  if (!fs.existsSync(fixturePath)) {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(fixturePath, JSON.stringify({
      project_id:    projectId,
      project_name:  "Conversation Test " + scenario.id,
      current_state: "DISCUSSION",
      active_runtime_state: "DISCUSSION",
      user_goal:     "",
      _version:      1,
      created_at:    new Date().toISOString()
    }, null, 2));
    fixtureCreated = true;
  }

  const startTs = new Date().toISOString();
  let raw;
  try {
    const { createConversationEngine } = require(
      path.join(root, "code", "src", "ai_os", "conversationEngine")
    );
    const { createConversationMemoryManager } = require(
      path.join(root, "code", "src", "ai_os", "conversationMemoryManager")
    );
    const engine = createConversationEngine({
      root,
      conversationMemoryManager: createConversationMemoryManager({ root })
    });

    const turns = Array.isArray(scenario.input && scenario.input.turns)
      ? scenario.input.turns
      : null;

    if (turns && turns.length > 0) {
      let lastResult = null;
      let allOk = true;
      for (const turn of turns) {
        if (!turn || turn.role !== "user") continue;
        const r = await engine.processMessage({
          project_id:    projectId,
          message:       String(turn.message || ""),
          user_language: (scenario.input && scenario.input.user_language) || "ar"
        });
        lastResult = r;
        if (!r || r.ok !== true) allOk = false;
      }
      raw = Object.assign({}, lastResult || {}, {
        ok:         allOk,
        turn_count: turns.length,
        project_id: projectId
      });
    } else if (scenario.input && typeof scenario.input.message === "string") {
      raw = await engine.processMessage({
        project_id:    projectId,
        message:       scenario.input.message,
        user_language: (scenario.input && scenario.input.user_language) || "ar"
      });
      raw = Object.assign({ turn_count: 1 }, raw || {});
    } else {
      raw = { ok: false, mode: "BLOCKED", reason: "NO_INPUT", turn_count: 0 };
    }
  } catch (err) {
    raw = { ok: false, mode: "BLOCKED", reason: err.message, turn_count: 0 };
  } finally {
    if (savedMode !== undefined) process.env.FORGE_PERMISSION_MODE = savedMode;
    else delete process.env.FORGE_PERMISSION_MODE;
    resetDefaultRegistry();
    // Fixture cleanup is deferred to _runOne so assertions can inspect filesystem state.
  }

  const newAudit = readEntries(root, { since_ts: startTs });
  const result   = _normalizeConversationResult(raw, newAudit);

  if (fixtureCreated) {
    Object.defineProperty(result, "_cleanup", {
      value: () => {
        try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      },
      enumerable: false,
      writable:   false
    });
  }

  return result;
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
    let execResult;
    if (scenario.type === "direct_provider") {
      execResult = await _runDirectProvider(scenario, root);
    } else if (scenario.type === "direct_tool") {
      execResult = await _runDirectTool(scenario, root);
    } else if (scenario.type === "direct_doctor") {
      execResult = await _runDirectDoctor(scenario, root);
    } else if (scenario.type === "conversation") {
      execResult = await _runConversation(scenario, root);
    } else if (scenario.type === "direct_engine") {
      execResult = await _runDirectEngine(scenario, root);
    } else {
      throw new Error("unknown scenario type: " + scenario.type);
    }

    const { runAll } = require("./assertions/_registry");
    const ctx = { root };
    let allPassed, assertResults;
    try {
      ({ allPassed, results: assertResults } = runAll(
        scenario.assertions || [],
        execResult,
        ctx
      ));
    } finally {
      if (execResult && typeof execResult._cleanup === "function") {
        execResult._cleanup();
      }
    }

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

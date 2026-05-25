"use strict";

// S220-S225 helpers — PHASE-16.1 Conversation Mode.
// Tests conversation_mode gate, processMessage routing, startPipeline transition,
// proposal-request routing, and createProject() path coverage.
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync
// are used here only for test fixture setup, not in production code.

const fs   = require("fs");
const path = require("path");
const http = require("http");
const os   = require("os");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

// ── HTTP helpers for S225 (API-server boot pattern) ───────────────────────────

function _parseSessionToken(content) {
  const lines = content.trim().split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0 && !t.startsWith("#")) return JSON.parse(t).token;
  }
  throw new Error("forge-session: no JSON line found");
}

function _httpPost(baseUrl, reqPath, body, token) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(baseUrl);
    const payload = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method:   "POST",
      headers: Object.assign(
        { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        token ? { Authorization: "Bearer " + token } : {}
      ),
      agent: false
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Shared test utilities ──────────────────────────────────────────────────────

function _ensureProjectDir(projectId) {
  const projectDir = path.join(PROJECTS_ROOT, projectId);
  const aiOsDir    = path.join(projectDir, "ai_os");
  fs.mkdirSync(aiOsDir, { recursive: true });
  return { projectDir, aiOsDir };
}

function _writeState(projectDir, state) {
  fs.writeFileSync(
    path.join(projectDir, "project_state.json"),
    JSON.stringify(state, null, 2),
    "utf8"
  );
}

function _readState(projectDir) {
  return JSON.parse(
    fs.readFileSync(path.join(projectDir, "project_state.json"), "utf8")
  );
}

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

// Minimal mock ideation engine — returns IDEATION_IN_PROGRESS deterministically.
// Used to prove the conversation gate stops messages from reaching the pipeline.
const MOCK_IDEATION = {
  expandIdea: async (body) => ({
    ok:                true,
    mode:              "IDEATION_IN_PROGRESS",
    expansion:         { readiness_assessment: { ready_for_options: false, blocking_gaps: [] }, follow_up_question: "ما نوع التطبيق؟", suggested_answers: [] },
    ready_for_options: false,
    follow_up_question: "ما نوع التطبيق؟",
    suggested_answers:  [],
    detected_domain:    "general",
    previous_domain:    "",
    pivot_detected:     false,
    project_id:         String((body && body.project_id) || "")
  })
};

// Stub memory manager — silences history-persistence side-effects in unit tests.
const STUB_MEMORY = {
  saveContext: async () => {},
  getContext:  async () => []
};

// ── S220: buildDefaultState includes conversation_mode: "CONVERSATION" ──────────
//
// RED (before PHASE-16.1 D1): buildDefaultState() returns no conversation_mode field
//   → conversation_mode_is_conversation = false → FAIL.
// GREEN (after D1): conversation_mode: "CONVERSATION" is in the default state → PASS.

async function runS220DefaultConversationMode() {
  const { createAiOsRuntime } = require("../../ai_os/projectRuntime");
  const PID = "s220_conv_mode_test";
  try {
    const runtime = createAiOsRuntime({ root: ROOT });
    // getProject on a non-existent project → loadProjectState → buildDefaultState
    const result = runtime.getProject({ project_id: PID });
    const conversation_mode_is_conversation =
      result.ok === true &&
      result.project != null &&
      result.project.conversation_mode === "CONVERSATION";
    return { conversation_mode_is_conversation };
  } finally {
    _cleanup(PID);
  }
}

// ── S221: processMessage on CONVERSATION-mode project: gate fires, state stays DISCUSSION ──
//
// RED (before D2 gate): processMessage falls through to pipeline branch →
//   state transitions to IDEATION → mode = "IDEATION_IN_PROGRESS" →
//   mode_not_ideation = false AND state_remains_discussion = false → FAIL.
// GREEN (after D2 gate): conversation gate fires → handleConversationMode called →
//   (provider fails, no key) → mode = "BLOCKED" ≠ "IDEATION_IN_PROGRESS" →
//   state never updated to IDEATION → both assertions true → PASS.

async function runS221ProcessMessageConversationMode() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  const PID = "s221_conv_mode_test";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S221 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), "[]", "utf8");

    const engine = createConversationEngine({
      root:                      ROOT,
      ideationEngine:            MOCK_IDEATION,
      conversationMemoryManager: STUB_MEMORY
    });

    const result    = await engine.processMessage({ project_id: PID, message: "عايز أعمل تطبيق للعناية بالبشرة", user_language: "ar" });
    const stateAfter = _readState(projectDir);

    const mode_not_ideation        = result.mode !== "IDEATION_IN_PROGRESS";
    const state_remains_discussion = stateAfter.active_runtime_state === "DISCUSSION";
    return { mode_not_ideation, state_remains_discussion };
  } finally {
    _cleanup(PID);
  }
}

// ── S222: startPipeline sets conversation_mode: "PIPELINE" ──────────────────────
//
// RED (before D3): conversationEngine.startPipeline is undefined →
//   TypeError caught → ok_true = false → FAIL.
// GREEN (after D3): startPipeline exists → sets conversation_mode = "PIPELINE" →
//   both assertions true → PASS.

async function runS222StartPipeline() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  const PID = "s222_conv_mode_test";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  let ok_true = false;
  let conversation_mode_pipeline = false;
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S222 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), "[]", "utf8");

    const engine = createConversationEngine({ root: ROOT, conversationMemoryManager: STUB_MEMORY });
    try {
      const result = await engine.startPipeline({ project_id: PID });
      ok_true = result.ok === true;
      const stateAfter = _readState(projectDir);
      conversation_mode_pipeline = stateAfter.conversation_mode === "PIPELINE";
    } catch (_) {
      // startPipeline absent (RED) — both stay false
    }
    return { ok_true, conversation_mode_pipeline };
  } finally {
    _cleanup(PID);
  }
}

// ── S223: after startPipeline, processMessage enters pipeline (state → IDEATION) ──
//
// RED (before D3): startPipeline absent → TypeError → state not changed →
//   state_entered_pipeline = false → FAIL.
// GREEN (after D3): startPipeline sets PIPELINE mode → next processMessage bypasses
//   conversation gate → pipeline branch fires → state transitions to IDEATION →
//   state_entered_pipeline = true → PASS.

async function runS223PipelineEntryAfterTransition() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  const PID = "s223_conv_mode_test";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  let state_entered_pipeline = false;
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S223 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), "[]", "utf8");

    const engine = createConversationEngine({ root: ROOT, ideationEngine: MOCK_IDEATION, conversationMemoryManager: STUB_MEMORY });
    try {
      await engine.startPipeline({ project_id: PID });
      await engine.processMessage({ project_id: PID, message: "عايز أعمل تطبيق", user_language: "ar" });
      const stateAfter = _readState(projectDir);
      state_entered_pipeline = stateAfter.active_runtime_state === "IDEATION";
    } catch (_) {
      // startPipeline absent (RED) — state_entered_pipeline stays false
    }
    return { state_entered_pipeline };
  } finally {
    _cleanup(PID);
  }
}

// ── S224: "اقترح عليا" in CONVERSATION mode → proposal in response, state stays DISCUSSION ──
//
// RED (before D2 gate): gate doesn't exist → "اقترح عليا" enters pipeline →
//   mode = "IDEATION_IN_PROGRESS" → mode_not_ideation = false → FAIL.
// GREEN (after D2 gate): conversation gate fires → monkey-patched provider returns
//   a deterministic proposal → mode = "CONVERSATION_RESPONSE", message includes
//   "مقترح", state stays DISCUSSION → all three assertions true → PASS.
//
// Monkey-patch scope: ConversationalResponseProvider.prototype.executeTask is
// replaced for the duration of this test only and restored in the finally block.

async function runS224ProposalRequestInConversationMode() {
  const ConversationalResponseProvider = require("../../providers/conversationalResponseProvider");
  const { createConversationEngine }   = require("../../ai_os/conversationEngine");
  const PID = "s224_conv_mode_test";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);

  const originalExecuteTask = ConversationalResponseProvider.prototype.executeTask;
  ConversationalResponseProvider.prototype.executeTask = async function() {
    return {
      status:   "SUCCESS",
      output:   { message: "مقترح: تطبيق عناية بالبشرة يشمل تحليل نوع البشرة وروتين يومي مخصص.", tone: "informative", suggest_next: "هل تريد البدء ببناء هذا المقترح؟" },
      metadata: { model: "mock-s224" }
    };
  };

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S224 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), "[]", "utf8");

    const engine = createConversationEngine({ root: ROOT, ideationEngine: MOCK_IDEATION, conversationMemoryManager: STUB_MEMORY });
    const result    = await engine.processMessage({ project_id: PID, message: "اقترح عليا", user_language: "ar" });
    const stateAfter = _readState(projectDir);

    const mode_not_ideation        = result.mode !== "IDEATION_IN_PROGRESS";
    const state_remains_discussion = stateAfter.active_runtime_state === "DISCUSSION";
    const response_contains_proposal = result.ok === true &&
      typeof result.message === "string" &&
      result.message.includes("مقترح");
    return { mode_not_ideation, state_remains_discussion, response_contains_proposal };
  } finally {
    ConversationalResponseProvider.prototype.executeTask = originalExecuteTask;
    _cleanup(PID);
  }
}

// ── S225: createProject() via API sets conversation_mode: "CONVERSATION" ────────
//
// RED (before Fix A): createProject() calls persistProjectState with overrides
//   = { project_name, project_status } only — no conversation_mode.
//   buildProjectState() gets undefined from both overrides and existing →
//   conversation_mode absent from response.project → assertion fails.
// GREEN (after Fix A): createProject() passes conversation_mode: "CONVERSATION"
//   in overrides → buildProjectState() writes it to file and response →
//   response.project.conversation_mode === "CONVERSATION" → PASS.
//
// Tests the REAL createProject() code path via in-process HTTP API server —
// not a hand-written project_state.json. Closes the gap left by S220-S224.

async function runS225CreateProjectSetsConversationMode() {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");

  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s225-"));
  const savedEnv = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };

  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = "s225-test-key";
  process.env.FORGE_WORKSPACE_API_PORT = "0";

  resetDefaultRegistry();
  resetDefaultPolicy();
  secretProvider._resetForTest();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });

  try {
    await instance.start();
    const addr = instance.server.address();
    const base = "http://127.0.0.1:" + addr.port;

    const sessionPath    = path.join(tempDir, "web", ".forge-session");
    const sessionContent = fs.readFileSync(sessionPath, "utf8");
    const token          = _parseSessionToken(sessionContent);

    const resp = await _httpPost(base, "/api/projects/create", { project_name: "S225 Conv Mode Test" }, token);

    const conversation_mode_is_conversation =
      resp.ok === true &&
      resp.project != null &&
      resp.project.conversation_mode === "CONVERSATION";

    return { conversation_mode_is_conversation };
  } finally {
    secretProvider._resetForTest();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetDefaultRegistry();
    resetDefaultPolicy();
    if (instance && instance.server) {
      if (typeof instance.server.closeAllConnections === "function") {
        instance.server.closeAllConnections();
      }
      await new Promise((resolve) => instance.server.close(resolve));
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S228: project without conversation_mode → buildProjectState returns "PIPELINE" ──
//
// Tests B3 backward compat: old projects (pre-PHASE-16.1) stored without a
// conversation_mode field must not silently default to CONVERSATION mode.
// After the B3 fix, buildProjectState falls back to "PIPELINE" explicitly.
//
// RED (before B3 fix): buildProjectState returns conversation_mode: undefined
//   (existing.conversation_mode is undefined, no fallback applied) →
//   state_field_is_pipeline = false → FAIL.
// GREEN (after B3 fix): fallback `|| "PIPELINE"` applied →
//   conversation_mode: "PIPELINE" in response.project → PASS.

async function runS228BackwardCompatPipelineFallback() {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");

  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s228-"));
  const savedEnv = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };

  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = "s228-test-key";
  process.env.FORGE_WORKSPACE_API_PORT = "0";

  resetDefaultRegistry();
  resetDefaultPolicy();
  secretProvider._resetForTest();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });

  try {
    await instance.start();
    const addr = instance.server.address();
    const base = `http://127.0.0.1:${addr.port}`;

    const sessionContent = fs.readFileSync(path.join(tempDir, "web", ".forge-session"), "utf8");
    const token          = _parseSessionToken(sessionContent);

    // Write a legacy project state WITHOUT conversation_mode (simulates pre-PHASE-16.1)
    const legacyId   = "s228_legacy_project";
    const projectDir = path.join(tempDir, "artifacts", "projects", legacyId);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "project_state.json"),
      JSON.stringify({
        project_id:           legacyId,
        project_name:         "S228 Legacy",
        active_runtime_state: "DISCUSSION",
        last_updated_at:      new Date().toISOString()
      }, null, 2),
      "utf8"
    );

    // Activate the legacy project — triggers persistProjectState → buildProjectState
    const resp = await _httpPost(base, "/api/projects/activate", { project_id: legacyId }, token);

    const state_field_is_pipeline =
      resp.ok === true &&
      resp.project != null &&
      resp.project.conversation_mode === "PIPELINE";

    return { state_field_is_pipeline };
  } finally {
    secretProvider._resetForTest();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetDefaultRegistry();
    resetDefaultPolicy();
    if (instance && instance.server) {
      if (typeof instance.server.closeAllConnections === "function") {
        instance.server.closeAllConnections();
      }
      await new Promise((resolve) => instance.server.close(resolve));
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  runS220DefaultConversationMode,
  runS221ProcessMessageConversationMode,
  runS222StartPipeline,
  runS223PipelineEntryAfterTransition,
  runS224ProposalRequestInConversationMode,
  runS225CreateProjectSetsConversationMode,
  runS228BackwardCompatPipelineFallback
};

"use strict";

// Intake test helper — S158–S162 (PHASE-11 Stage 11.1).
// Module-call driver: each exported function is invoked as scenario.method().
//
// Track A: fs I/O through registry. No direct fs.writeFileSync in production paths.
// Exception: direct fs.mkdirSync is used for Rust-only fixture setup in runS162
// (test infrastructure only, not production code).

const path = require("path");
const fs   = require("fs");

const ROOT = process.cwd();

// ── Local mock OpenAI HTTP helper (mirrors scenario_runner._httpFetch) ─────────

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
          ok:     statusCode >= 200 && statusCode < 300,
          status: statusCode,
          json:   () => Promise.resolve(JSON.parse(buf)),
          text:   () => Promise.resolve(buf)
        });
      });
    });
    req.on("error", reject);
    if (options && options.body) req.write(String(options.body));
    req.end();
  });
}

// ── Registry factory (WORKSPACE_WRITE, non-default so no global side-effects) ──

function _makeRegistry(mode) {
  const { createRegistry }  = require("../../runtime/tools/_registry");
  const { createPolicy }    = require("../../runtime/permission/permissionPolicy");
  const activeMode = mode || "WORKSPACE_WRITE";
  const policy = createPolicy({ root: ROOT, active_mode: activeMode });
  const reg    = createRegistry({ root: ROOT });
  reg.load();
  reg.setAuthorizeFunction((t, i, c) => policy.authorize(t, i, c));
  return reg;
}

// ── Minimal InferredVision fixture (used in S160, S161) ───────────────────────

const MOCK_VISION = {
  project_name:       "todo_cli",
  domain:             "command-line productivity tool",
  goals: {
    primary:   "Provide a minimal command-line TODO list manager",
    secondary: ["Persist items to local JSON file", "Support add/list/complete/delete operations"]
  },
  constraints:        ["No external runtime dependencies", "Python 3.10+"],
  non_goals:          ["Web UI", "Multi-user support", "Cloud sync"],
  detected_languages: ["python"],
  source_summary:     "5-file Python CLI package using argparse and json. Includes pytest tests.",
  confidence:         "HIGH"
};

// ── S158: intake_zip directory mode — fixture_pycli ────────────────────────────

async function runS158IntakeZip() {
  const reg = _makeRegistry("WORKSPACE_WRITE");
  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_pycli");
  const projectId   = "test_s158_proj";
  const ctx = { root: ROOT, project_id: projectId };

  const result = await reg.invoke("project.intake_zip",
    { project_id: projectId, directory_path: fixturePath }, ctx);

  return {
    status_ok:           result.status === "SUCCESS",
    has_extracted_path:  !!(result.output && result.output.extracted_path),
    file_count_gt_0:     !!(result.output && result.output.file_count > 0),
    has_python:          !!(result.output && Array.isArray(result.output.languages_detected) &&
                            result.output.languages_detected.includes("python"))
  };
}

// ── S159: analyze_source on ingested fixture_pycli ────────────────────────────

async function runS159AnalyzeSource() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s159_proj";
  const ctx     = { root: ROOT, project_id: project };

  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_pycli");

  const intakeResult = await reg.invoke("project.intake_zip",
    { project_id: project, directory_path: fixturePath }, ctx);

  if (intakeResult.status !== "SUCCESS") {
    return { intake_ok: false, status_ok: false, has_python: false,
             has_ast_samples: false, file_count_gt_0: false };
  }

  const analyzeResult = await reg.invoke("project.analyze_source",
    { project_id: project }, ctx);

  const out = analyzeResult.output || {};

  return {
    intake_ok:           true,
    status_ok:           analyzeResult.status === "SUCCESS",
    has_python:          !!(Array.isArray(out.detected_languages) &&
                            out.detected_languages.includes("python")),
    has_ast_samples:     !!(Array.isArray(out.ast_samples) && out.ast_samples.length > 0),
    file_count_gt_0:     !!(out.file_count > 0)
  };
}

// ── S160: reverse_vision_role via agent.invoke with mock adapter ──────────────

async function runS160ReverseVisionMock() {
  const ROLE_PATH = require.resolve("../../runtime/agents/roles/reverse_vision_role");
  const origRole  = require.cache[ROLE_PATH];
  delete require.cache[ROLE_PATH];

  let result;
  try {
    const role  = require(ROLE_PATH);
    const input = {
      schema_version: "1.0.0",
      project_id:     "test_s160_proj",
      source_tree: {
        detected_languages:    ["python"],
        file_count:            5,
        total_size_bytes:      4096,
        entry_points:          ["todo_cli/__main__.py"],
        manifest_files:        { pyproject_toml: { name: "todo_cli", version: "0.1.0" } },
        top_level_directories: ["todo_cli", "tests"],
        ast_samples:           [],
        ignored_paths:         []
      }
    };
    // provider:"mock", model:"mock-rv", scenario_id:"S160" → mock adapter key mock|mock-rv|scenario:S160
    result = await role.run(input, { root: ROOT, provider: "mock", model: "mock-rv", scenario_id: "S160" });
  } finally {
    if (origRole) require.cache[ROLE_PATH] = origRole; else delete require.cache[ROLE_PATH];
  }

  const out = result.output || {};
  return {
    status_ok:                    result.status === "SUCCESS",
    has_project_name:             typeof out.project_name === "string" && out.project_name.length > 0,
    has_domain:                   typeof out.domain === "string",
    has_goals_primary:            !!(out.goals && typeof out.goals.primary === "string"),
    has_confidence:               ["HIGH", "MEDIUM", "LOW"].includes(out.confidence),
    detected_languages_has_python: Array.isArray(out.detected_languages) &&
                                   out.detected_languages.includes("python")
  };
}

// ── S161: full mock end-to-end — intake → analyze → infer → write vision.md ──

async function runS161EndToEndMock() {
  const { serializeFrontmatter } = require("../../ai_os/schemas/visionSchema");
  const ROLE_PATH = require.resolve("../../runtime/agents/roles/reverse_vision_role");
  const origRole  = require.cache[ROLE_PATH];
  delete require.cache[ROLE_PATH];

  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s161_proj";
  const ctx     = { root: ROOT, project_id: project };

  let visionExists   = false;
  let visionUnlocked = false;
  let allStepsOk     = false;

  try {
    const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_pycli");

    // Step 1: intake
    const intakeRes = await reg.invoke("project.intake_zip",
      { project_id: project, directory_path: fixturePath }, ctx);
    if (intakeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false };

    // Step 2: analyze
    const analyzeRes = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
    if (analyzeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false };

    // Step 3: infer vision via agent.invoke with mock adapter
    // provider:"mock", model:"mock-rv", scenario_id:"S161" → key mock|mock-rv|scenario:S161
    const role = require(ROLE_PATH);
    const roleInput = {
      schema_version: "1.0.0",
      project_id:     project,
      source_tree:    analyzeRes.output
    };
    const roleRes = await role.run(roleInput,
      { root: ROOT, provider: "mock", model: "mock-rv", scenario_id: "S161" });
    if (roleRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false };

    // Step 4: write unlocked vision.md (simulates intake controller)
    const inferredVision = roleRes.output;
    const frontmatter = {
      project_id:          project,
      project_name:        inferredVision.project_name,
      domain:              inferredVision.domain,
      vision_version:      1,
      vision_locked:       false,
      vision_locked_at:    null,
      locked_by_role:      null,
      amendments_history:  [],
      goals: {
        primary:   inferredVision.goals.primary,
        secondary: inferredVision.goals.secondary
      },
      constraints: inferredVision.constraints,
      non_goals:   inferredVision.non_goals
    };
    const visionContent = serializeFrontmatter(frontmatter) +
      "\n\n# Project Vision: " + inferredVision.project_name + "\n" +
      "\n" + (inferredVision.source_summary || "") + "\n";

    const visionPath = path.join("artifacts", "projects", project, "vision.md");
    const writeRes = await reg.invoke("fs.write_file",
      { path: visionPath, content: visionContent }, ctx);
    if (writeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false };

    // Step 5: verify vision.md
    const abs = path.join(ROOT, visionPath);
    visionExists = fs.existsSync(abs);
    if (visionExists) {
      const { parseFrontmatter } = require("../../ai_os/schemas/visionSchema");
      const fm = parseFrontmatter(fs.readFileSync(abs, "utf8"));
      visionUnlocked = !!(fm && fm.vision_locked === false);
    }

    allStepsOk = visionExists && visionUnlocked;

  } finally {
    if (origRole) require.cache[ROLE_PATH] = origRole; else delete require.cache[ROLE_PATH];
  }

  return {
    all_steps_ok:      allStepsOk,
    vision_file_exists: visionExists,
    vision_is_unlocked: visionUnlocked
  };
}

// ── S162: Rust-only directory → UNSUPPORTED_LANGUAGE ─────────────────────────

async function runS162UnsupportedLanguage() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s162_rust";
  const ctx     = { root: ROOT, project_id: project };

  // Create a minimal Rust source file via the registry (Track A)
  const rustFilePath = path.join("artifacts", "projects", project, "source", "main.rs");
  const writeRes = await reg.invoke("fs.write_file",
    { path: rustFilePath, content: "fn main() {\n    println!(\"Hello, world!\");\n}\n" }, ctx);

  if (!writeRes || writeRes.status !== "SUCCESS") {
    return { status_is_failed: false, reason_is_unsupported_language: false,
             setup_ok: false };
  }

  const result = await reg.invoke("project.analyze_source", { project_id: project }, ctx);

  return {
    setup_ok:                      true,
    status_is_failed:              result.status === "FAILED",
    reason_is_unsupported_language: !!(result.metadata && result.metadata.reason === "UNSUPPORTED_LANGUAGE")
  };
}

module.exports = {
  runS158IntakeZip,
  runS159AnalyzeSource,
  runS160ReverseVisionMock,
  runS161EndToEndMock,
  runS162UnsupportedLanguage
};

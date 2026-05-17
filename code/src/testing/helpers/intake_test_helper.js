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

// ── S163: analyze_source — .js file → detects "javascript" ───────────────────

async function runS163AnalyzeSourceJs() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s163_js";
  const ctx     = { root: ROOT, project_id: project };

  const jsFilePath = path.join("artifacts", "projects", project, "source", "index.js");
  const writeRes = await reg.invoke("fs.write_file",
    { path: jsFilePath, content: '"use strict";\n\nfunction greet(name) {\n  return "Hello, " + name;\n}\n\nmodule.exports = { greet };\n' }, ctx);

  if (!writeRes || writeRes.status !== "SUCCESS") {
    return { setup_ok: false, status_ok: false, has_javascript: false, file_count_gt_0: false };
  }

  const result = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
  const out = result.output || {};

  return {
    setup_ok:        true,
    status_ok:       result.status === "SUCCESS",
    has_javascript:  !!(Array.isArray(out.detected_languages) && out.detected_languages.includes("javascript")),
    file_count_gt_0: !!(out.file_count > 0)
  };
}

// ── S164: analyze_source — .ts file → detects "typescript" ───────────────────

async function runS164AnalyzeSourceTs() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s164_ts";
  const ctx     = { root: ROOT, project_id: project };

  const tsFilePath = path.join("artifacts", "projects", project, "source", "index.ts");
  const writeRes = await reg.invoke("fs.write_file",
    { path: tsFilePath, content: "export interface Item {\n  id: number;\n  name: string;\n}\n\nexport function create(name: string): Item {\n  return { id: 1, name };\n}\n" }, ctx);

  if (!writeRes || writeRes.status !== "SUCCESS") {
    return { setup_ok: false, status_ok: false, has_typescript: false, file_count_gt_0: false };
  }

  const result = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
  const out = result.output || {};

  return {
    setup_ok:        true,
    status_ok:       result.status === "SUCCESS",
    has_typescript:  !!(Array.isArray(out.detected_languages) && out.detected_languages.includes("typescript")),
    file_count_gt_0: !!(out.file_count > 0)
  };
}

// ── S165: analyze_source — fixture_nextjs → typescript + framework=next ──────

async function runS165AnalyzeSourceNextjs() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s165_nextjs";
  const ctx     = { root: ROOT, project_id: project };

  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_nextjs");

  const intakeRes = await reg.invoke("project.intake_zip",
    { project_id: project, directory_path: fixturePath }, ctx);

  if (intakeRes.status !== "SUCCESS") {
    return { intake_ok: false, status_ok: false, has_typescript: false,
             framework_is_next: false, file_count_gt_0: false };
  }

  const analyzeRes = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
  const out = analyzeRes.output || {};

  return {
    intake_ok:         true,
    status_ok:         analyzeRes.status === "SUCCESS",
    has_typescript:    !!(Array.isArray(out.detected_languages) && out.detected_languages.includes("typescript")),
    framework_is_next: out.detected_framework === "next",
    file_count_gt_0:   !!(out.file_count > 0)
  };
}

// ── S166: reverse_vision_role — mock + Next.js source_tree → web_application ─

async function runS166ReverseVisionNextjsMock() {
  const ROLE_PATH = require.resolve("../../runtime/agents/roles/reverse_vision_role");
  const origRole  = require.cache[ROLE_PATH];
  delete require.cache[ROLE_PATH];

  let result;
  try {
    const role  = require(ROLE_PATH);
    const input = {
      schema_version: "1.0.0",
      project_id:     "test_s166_proj",
      source_tree: {
        detected_languages:    ["typescript", "javascript"],
        file_count:            9,
        total_size_bytes:      8192,
        entry_points:          ["app/page.tsx", "app/api/tasks/route.ts"],
        manifest_files: {
          package_json: { name: "nextjs_tasks_demo", version: "0.1.0",
                          dependencies: { next: "14.2.3", react: "18.3.1" } },
          tsconfig:     { target: "ES2017", module: "esnext", jsx: "preserve", strict: true },
          next_config:  { file: "next.config.mjs", excerpt: "const nextConfig = {};" }
        },
        top_level_directories: ["app", "lib"],
        ast_samples:           [],
        ignored_paths:         [],
        detected_framework:    "next"
      }
    };
    // provider:"mock", model:"mock-rv", scenario_id:"S166" → key mock|mock-rv|scenario:S166
    result = await role.run(input, { root: ROOT, provider: "mock", model: "mock-rv", scenario_id: "S166" });
  } finally {
    if (origRole) require.cache[ROLE_PATH] = origRole; else delete require.cache[ROLE_PATH];
  }

  const out = result.output || {};
  return {
    status_ok:                         result.status === "SUCCESS",
    has_project_name:                  typeof out.project_name === "string" && out.project_name.length > 0,
    domain_is_web_application:         out.domain === "web_application",
    has_confidence:                    ["HIGH", "MEDIUM", "LOW"].includes(out.confidence),
    detected_languages_has_typescript: Array.isArray(out.detected_languages) &&
                                       out.detected_languages.includes("typescript")
  };
}

// ── S167: end-to-end mock — fixture_nextjs → vision.md (domain=web_application)

async function runS167IntakeEndToEndNextjsMock() {
  const { serializeFrontmatter } = require("../../ai_os/schemas/visionSchema");
  const ROLE_PATH = require.resolve("../../runtime/agents/roles/reverse_vision_role");
  const origRole  = require.cache[ROLE_PATH];
  delete require.cache[ROLE_PATH];

  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s167_nextjs";
  const ctx     = { root: ROOT, project_id: project };

  let visionExists   = false;
  let visionUnlocked = false;
  let domainCorrect  = false;
  let allStepsOk     = false;

  try {
    const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_nextjs");

    const intakeRes = await reg.invoke("project.intake_zip",
      { project_id: project, directory_path: fixturePath }, ctx);
    if (intakeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_web_application: false };

    const analyzeRes = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
    if (analyzeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_web_application: false };

    // provider:"mock", model:"mock-rv", scenario_id:"S167" → key mock|mock-rv|scenario:S167
    const role = require(ROLE_PATH);
    const roleInput = {
      schema_version: "1.0.0",
      project_id:     project,
      source_tree:    analyzeRes.output
    };
    const roleRes = await role.run(roleInput,
      { root: ROOT, provider: "mock", model: "mock-rv", scenario_id: "S167" });
    if (roleRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_web_application: false };

    const inferredVision = roleRes.output;
    const frontmatter = {
      project_id:         project,
      project_name:       inferredVision.project_name,
      domain:             inferredVision.domain,
      vision_version:     1,
      vision_locked:      false,
      vision_locked_at:   null,
      locked_by_role:     null,
      amendments_history: [],
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
    if (writeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_web_application: false };

    const abs = path.join(ROOT, visionPath);
    visionExists = fs.existsSync(abs);
    if (visionExists) {
      const { parseFrontmatter } = require("../../ai_os/schemas/visionSchema");
      const fm = parseFrontmatter(fs.readFileSync(abs, "utf8"));
      visionUnlocked = !!(fm && fm.vision_locked === false);
      domainCorrect  = !!(fm && fm.domain === "web_application");
    }

    allStepsOk = visionExists && visionUnlocked && domainCorrect;

  } finally {
    if (origRole) require.cache[ROLE_PATH] = origRole; else delete require.cache[ROLE_PATH];
  }

  return {
    all_steps_ok:             allStepsOk,
    vision_file_exists:       visionExists,
    vision_is_unlocked:       visionUnlocked,
    domain_is_web_application: domainCorrect
  };
}

// ── S168: analyze_source — single .go file → detects "go", framework=null ────

async function runS168AnalyzeSourceGoSingle() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s168_go";
  const ctx     = { root: ROOT, project_id: project };

  const goFilePath = path.join("artifacts", "projects", project, "source", "main.go");
  const writeRes = await reg.invoke("fs.write_file",
    { path: goFilePath, content: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}\n" }, ctx);

  if (!writeRes || writeRes.status !== "SUCCESS") {
    return { setup_ok: false, status_ok: false, has_go: false, framework_is_null: false };
  }

  const result = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
  const out = result.output || {};

  return {
    setup_ok:        true,
    status_ok:       result.status === "SUCCESS",
    has_go:          !!(Array.isArray(out.detected_languages) && out.detected_languages.includes("go")),
    framework_is_null: out.detected_framework === null || out.detected_framework === undefined
  };
}

// ── S169: analyze_source — fixture_gocli → go + go.mod + AST symbols ─────────

async function runS169AnalyzeSourceGocli() {
  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s169_gocli";
  const ctx     = { root: ROOT, project_id: project };

  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_gocli");

  const intakeRes = await reg.invoke("project.intake_zip",
    { project_id: project, directory_path: fixturePath }, ctx);

  if (intakeRes.status !== "SUCCESS") {
    return { intake_ok: false, status_ok: false, has_go: false,
             gomod_has_project_name: false, gomod_has_go_version: false, has_ast_symbols: false };
  }

  const analyzeRes = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
  const out = analyzeRes.output || {};

  const goMod = (out.manifest_files && out.manifest_files.go_mod) || {};

  return {
    intake_ok:              true,
    status_ok:              analyzeRes.status === "SUCCESS",
    has_go:                 !!(Array.isArray(out.detected_languages) && out.detected_languages.includes("go")),
    gomod_has_project_name: typeof goMod.project_name === "string" && goMod.project_name.includes("todo_gocli"),
    gomod_has_go_version:   goMod.go_version === "1.21",
    has_ast_symbols:        !!(Array.isArray(out.ast_samples) && out.ast_samples.length > 0)
  };
}

// ── S170: reverse_vision_role — mock + Go CLI source_tree → cli_tool ─────────

async function runS170ReverseVisionGocliMock() {
  const ROLE_PATH = require.resolve("../../runtime/agents/roles/reverse_vision_role");
  const origRole  = require.cache[ROLE_PATH];
  delete require.cache[ROLE_PATH];

  let result;
  try {
    const role  = require(ROLE_PATH);
    const input = {
      schema_version: "1.0.0",
      project_id:     "test_s170_proj",
      source_tree: {
        detected_languages:    ["go"],
        detected_framework:    null,
        file_count:            7,
        total_size_bytes:      6144,
        entry_points:          ["main.go"],
        manifest_files: {
          go_mod: { module_path: "github.com/forge-demo/todo_gocli",
                    project_name: "todo_gocli", go_version: "1.21", dependencies: [] }
        },
        top_level_directories: ["cmd", "storage"],
        ast_samples:           [{ file: "main.go", symbols: ["func main"] }],
        ignored_paths:         []
      }
    };
    // provider:"mock", model:"mock-rv", scenario_id:"S170" → key mock|mock-rv|scenario:S170
    result = await role.run(input, { root: ROOT, provider: "mock", model: "mock-rv", scenario_id: "S170" });
  } finally {
    if (origRole) require.cache[ROLE_PATH] = origRole; else delete require.cache[ROLE_PATH];
  }

  const out = result.output || {};
  return {
    status_ok:          result.status === "SUCCESS",
    has_project_name:   typeof out.project_name === "string" && out.project_name.length > 0,
    domain_is_cli_tool: out.domain === "cli_tool",
    has_confidence:     ["HIGH", "MEDIUM", "LOW"].includes(out.confidence)
  };
}

// ── S171: end-to-end mock — fixture_gocli → vision.md (domain=cli_tool) ──────

async function runS171IntakeEndToEndGocliMock() {
  const { serializeFrontmatter } = require("../../ai_os/schemas/visionSchema");
  const ROLE_PATH = require.resolve("../../runtime/agents/roles/reverse_vision_role");
  const origRole  = require.cache[ROLE_PATH];
  delete require.cache[ROLE_PATH];

  const reg     = _makeRegistry("WORKSPACE_WRITE");
  const project = "test_s171_gocli";
  const ctx     = { root: ROOT, project_id: project };

  let visionExists  = false;
  let visionUnlocked = false;
  let domainCorrect = false;
  let allStepsOk    = false;

  try {
    const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_gocli");

    const intakeRes = await reg.invoke("project.intake_zip",
      { project_id: project, directory_path: fixturePath }, ctx);
    if (intakeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_cli_tool: false };

    const analyzeRes = await reg.invoke("project.analyze_source", { project_id: project }, ctx);
    if (analyzeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_cli_tool: false };

    // provider:"mock", model:"mock-rv", scenario_id:"S171" → key mock|mock-rv|scenario:S171
    const role = require(ROLE_PATH);
    const roleInput = {
      schema_version: "1.0.0",
      project_id:     project,
      source_tree:    analyzeRes.output
    };
    const roleRes = await role.run(roleInput,
      { root: ROOT, provider: "mock", model: "mock-rv", scenario_id: "S171" });
    if (roleRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_cli_tool: false };

    const inferredVision = roleRes.output;
    const frontmatter = {
      project_id:         project,
      project_name:       inferredVision.project_name,
      domain:             inferredVision.domain,
      vision_version:     1,
      vision_locked:      false,
      vision_locked_at:   null,
      locked_by_role:     null,
      amendments_history: [],
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
    if (writeRes.status !== "SUCCESS") return { all_steps_ok: false, vision_file_exists: false, vision_is_unlocked: false, domain_is_cli_tool: false };

    const abs = path.join(ROOT, visionPath);
    visionExists = fs.existsSync(abs);
    if (visionExists) {
      const { parseFrontmatter } = require("../../ai_os/schemas/visionSchema");
      const fm = parseFrontmatter(fs.readFileSync(abs, "utf8"));
      visionUnlocked = !!(fm && fm.vision_locked === false);
      domainCorrect  = !!(fm && fm.domain === "cli_tool");
    }

    allStepsOk = visionExists && visionUnlocked && domainCorrect;

  } finally {
    if (origRole) require.cache[ROLE_PATH] = origRole; else delete require.cache[ROLE_PATH];
  }

  return {
    all_steps_ok:      allStepsOk,
    vision_file_exists: visionExists,
    vision_is_unlocked: visionUnlocked,
    domain_is_cli_tool: domainCorrect
  };
}

// ── Shared intake-handler mock vision (used in S175–S177 state setup) ─────────

const MOCK_INTAKE_VISION = {
  project_name:       "todo_gocli",
  domain:             "cli_tool",
  goals: {
    primary:   "Provide a minimal command-line TODO list manager written in Go",
    secondary: ["Persist items to a local JSON file", "Support add/list/complete operations"]
  },
  constraints:        ["Go 1.21+", "Standard library only"],
  non_goals:          ["No UI", "No cloud sync"],
  detected_languages: ["go"],
  source_summary:     "7-file Go CLI project with go.mod, cmd/ and storage/ directories.",
  confidence:         "HIGH"
};

// ── Shared helper: write unlocked vision.md + intake_state.json ───────────────

async function _setupIntakeState(reg, project_id, extra_vision_fields) {
  const { serializeFrontmatter } = require("../../ai_os/schemas/visionSchema");
  const iv = Object.assign({}, MOCK_INTAKE_VISION, extra_vision_fields || {});

  const frontmatter = {
    project_id,
    project_name:       iv.project_name,
    domain:             iv.domain,
    vision_version:     1,
    vision_locked:      false,
    vision_locked_at:   null,
    locked_by_role:     null,
    amendments_history: [],
    goals: {
      primary:   iv.goals.primary,
      secondary: iv.goals.secondary || []
    },
    constraints: iv.constraints || [],
    non_goals:   iv.non_goals   || []
  };

  const visionContent = serializeFrontmatter(frontmatter) +
    "\n\n# Project Vision: " + iv.project_name + "\n\n" + (iv.source_summary || "") + "\n";

  const visionPath = path.join("artifacts", "projects", project_id, "vision.md");
  const visionRes = await reg.invoke("fs.write_file",
    { path: visionPath, content: visionContent }, { root: ROOT, project_id });
  if (!visionRes || visionRes.status !== "SUCCESS") return false;

  const intakeState = {
    stage:           "AWAIT_VISION_APPROVAL",
    project_id,
    inferred_vision: iv,
    created_at:      new Date().toISOString()
  };
  const statePath = path.join("artifacts", "projects", project_id, "intake_state.json");
  const stateRes = await reg.invoke("fs.write_file",
    { path: statePath, content: JSON.stringify(intakeState, null, 2) }, { root: ROOT, project_id });
  return !!(stateRes && stateRes.status === "SUCCESS");
}

// ── S172: intake handler — directory_path trigger → AWAIT_VISION_APPROVAL ─────

async function runS172IntakeDirPathTrigger() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s172_proj";
  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_gocli");

  const result = await processIntakeRequest(
    { directory_path: fixturePath, project_id },
    { root: ROOT, registry: reg, provider: "mock", model: "mock-rv", scenario_id: "S172" }
  );

  return {
    stage_is_await_vision_approval: result.stage === "AWAIT_VISION_APPROVAL",
    ok:                             result.ok === true
  };
}

// ── S173: no attachment + no active project → NO_ACTIVE_INTAKE ────────────────

async function runS173IntakeNoAttachment() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");

  const result = await processIntakeRequest(
    { message: "hello" },
    { root: ROOT }
  );

  return {
    ok_is_false:    result.ok === false,
    reason_matches: result.reason === "NO_ACTIVE_INTAKE"
  };
}

// ── S174: sync flow — fixture_gocli intake via mock → state + vision files ────

async function runS174IntakeSyncFlow() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const { parseFrontmatter }     = require("../../ai_os/schemas/visionSchema");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s174_proj";
  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_gocli");

  const result = await processIntakeRequest(
    { directory_path: fixturePath, project_id },
    { root: ROOT, registry: reg, provider: "mock", model: "mock-rv", scenario_id: "S174" }
  );

  const stateFile  = path.join(ROOT, "artifacts", "projects", project_id, "intake_state.json");
  const visionFile = path.join(ROOT, "artifacts", "projects", project_id, "vision.md");

  const stateExists  = fs.existsSync(stateFile);
  const visionExists = fs.existsSync(visionFile);

  let visionUnlocked = false;
  if (visionExists) {
    const fm = parseFrontmatter(fs.readFileSync(visionFile, "utf8"));
    visionUnlocked = !!(fm && fm.vision_locked === false);
  }

  return {
    stage_is_await_vision_approval: result.stage === "AWAIT_VISION_APPROVAL",
    intake_state_file_exists:        stateExists,
    vision_file_exists:              visionExists,
    vision_is_unlocked:              visionUnlocked
  };
}

// ── S175: AFFIRM intent → vision locked + state APPROVED + loop ARCHITECT_DESIGN

async function runS175ApproveLocksVision() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const { parseFrontmatter }     = require("../../ai_os/schemas/visionSchema");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s175_proj";

  // Setup: write unlocked vision.md + AWAIT_VISION_APPROVAL state
  const setupOk = await _setupIntakeState(reg, project_id);
  if (!setupOk) return { stage_is_approved: false, vision_is_locked: false, loop_at_architect_design: false };

  const mockAFFIRM = {
    executeTask: async () => ({
      status: "SUCCESS",
      output: { intent: "AFFIRM", confidence: 0.99, clarification_question: "" }
    })
  };

  const result = await processIntakeRequest(
    { project_id, message: "approve" },
    { root: ROOT, registry: reg, intent_classifier: mockAFFIRM }
  );

  if (!result.ok || result.stage !== "APPROVED") {
    return { stage_is_approved: false, vision_is_locked: false, loop_at_architect_design: false };
  }

  // Check vision.md locked
  const visionFile = path.join(ROOT, "artifacts", "projects", project_id, "vision.md");
  let visionLocked = false;
  if (fs.existsSync(visionFile)) {
    const fm = parseFrontmatter(fs.readFileSync(visionFile, "utf8"));
    visionLocked = !!(fm && fm.vision_locked === true);
  }

  // Check loop state
  let loopAtArchitect = false;
  const loopId = result.loop_id;
  if (loopId) {
    const statusRes = await reg.invoke("orchestration.get_status",
      { project_id, loop_id: loopId }, { root: ROOT });
    loopAtArchitect = !!(statusRes && statusRes.status === "SUCCESS" &&
      statusRes.output && statusRes.output.current_state === "ARCHITECT_DESIGN");
  }

  return {
    stage_is_approved:        result.stage === "APPROVED",
    vision_is_locked:         visionLocked,
    loop_at_architect_design: loopAtArchitect
  };
}

// ── S176: MODIFY intent + edit regex → non_goals updated, still AWAIT_APPROVAL ─

async function runS176EditVisionField() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s176_proj";

  // Setup with initial non_goals
  const setupOk = await _setupIntakeState(reg, project_id, { non_goals: ["No UI"] });
  if (!setupOk) return { stage_still_awaiting: false, non_goals_updated: false };

  const mockMODIFY = {
    executeTask: async () => ({
      status: "SUCCESS",
      output: { intent: "MODIFY", confidence: 0.95, clarification_question: "" }
    })
  };

  const result = await processIntakeRequest(
    { project_id, message: "edit non_goals: No authentication" },
    { root: ROOT, registry: reg, intent_classifier: mockMODIFY }
  );

  // Read updated state
  const stateFile = path.join(ROOT, "artifacts", "projects", project_id, "intake_state.json");
  let stageStillAwaiting = false;
  let nonGoalsUpdated    = false;

  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    stageStillAwaiting = state.stage === "AWAIT_VISION_APPROVAL";
    const ng = (state.inferred_vision && state.inferred_vision.non_goals) || [];
    nonGoalsUpdated = Array.isArray(ng) && ng.includes("No authentication");
  }

  return {
    stage_still_awaiting: stageStillAwaiting,
    non_goals_updated:    nonGoalsUpdated
  };
}

// ── S177: REJECT intent → state REJECTED + artifacts directory deleted ────────

async function runS177RejectDeletesArtifacts() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s177_proj";

  // Setup
  const setupOk = await _setupIntakeState(reg, project_id);
  if (!setupOk) return { stage_is_rejected: false, artifacts_deleted: false };

  const mockREJECT = {
    executeTask: async () => ({
      status: "SUCCESS",
      output: { intent: "REJECT", confidence: 0.99, clarification_question: "" }
    })
  };

  const result = await processIntakeRequest(
    { project_id, message: "reject" },
    { root: ROOT, registry: reg, intent_classifier: mockREJECT }
  );

  const artifactsDir = path.join(ROOT, "artifacts", "projects", project_id);
  const artifactsGone = !fs.existsSync(artifactsDir);

  return {
    stage_is_rejected: result.stage === "REJECTED",
    artifacts_deleted: artifactsGone
  };
}

// ── S178: start_loop with owner_intent_source → current_state=ARCHITECT_DESIGN ─

async function runS178LoopStartsAtArchitectDesign() {
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s178_proj";

  const result = await reg.invoke(
    "orchestration.start_loop",
    { project_id, owner_intent_source: "vision_locked_intake" },
    { root: ROOT }
  );

  const out = (result && result.output) || {};

  return {
    current_state_is_architect_design: out.current_state === "ARCHITECT_DESIGN",
    owner_intent_source_echoed:        out.owner_intent_source === "vision_locked_intake"
  };
}

// ── S179: reverseVisionProvider.executeTask writes LLM trace files ─────────────
// Uses the mock branch (context.provider === "mock") — no cache manipulation needed.
// providerContract.executeTask writes trace files for both mock and real paths.

async function runS179ProviderWritesTraceFiles() {
  const provider = require("../../providers/reverseVisionProvider");
  const task_id  = "test_s179_" + Date.now();

  await provider.executeTask({
    task_id,
    project_id: "test_s179_proj",
    context: {
      schema_version: "1.0.0",
      project_id:     "test_s179_proj",
      source_tree: {
        detected_languages:    ["go"],
        file_count:             5,
        total_size_bytes:       4096,
        entry_points:           ["main.go"],
        manifest_files:         {},
        top_level_directories:  ["cmd"],
        ast_samples:            [],
        ignored_paths:          []
      },
      provider:    "mock",
      model:       "mock-rv",
      scenario_id: "S179"
    }
  });

  return {
    metadata_file_written:  fs.existsSync(path.join(ROOT, "artifacts", "llm", "metadata",  task_id + ".json")),
    requests_file_written:  fs.existsSync(path.join(ROOT, "artifacts", "llm", "requests",   task_id + ".json")),
    responses_file_written: fs.existsSync(path.join(ROOT, "artifacts", "llm", "responses",  task_id + ".json"))
  };
}

// ── S180: agent_budget_rule — reverse_vision exempt; other role denied ─────────

async function runS180RoleIdExemptionFires() {
  const { createAgentBudgetRule } = require("../../runtime/permission/rules/agent_budget_rule");
  const { serializeFrontmatter }  = require("../../ai_os/schemas/visionSchema");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s180_proj";

  // Write an UNLOCKED vision.md so vision exists but is not locked
  const fm = serializeFrontmatter({
    project_id,
    project_name:       "test_s180",
    domain:             "cli_tool",
    vision_version:     1,
    vision_locked:      false,
    vision_locked_at:   null,
    locked_by_role:     null,
    amendments_history: [],
    goals:        { primary: "Test rule", secondary: [] },
    constraints:  [],
    non_goals:    []
  });
  await reg.invoke("fs.write_file",
    { path: path.join("artifacts", "projects", project_id, "vision.md"),
      content: fm + "\n# Test\n" },
    { root: ROOT, project_id });

  const rule      = createAgentBudgetRule({ root: ROOT });
  const agentTool = { name: "agent.invoke" };
  const input     = { provider: "openai", model: "gpt-4o", prompt: "test", project_id };

  const check1 = rule.check(agentTool, input, { role_id: "reverse_vision" });
  const check2 = rule.check(agentTool, input, { role_id: "architect" });

  return {
    reverse_vision_not_denied: check1.denied === false,
    other_role_denied:         check2.denied === true && check2.reason === "VISION_NOT_LOCKED"
  };
}

// ── S181: full mock e2e — dir_path → mock intake → mock AFFIRM → lock + loop ──

async function runS181FullMockE2E() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const { parseFrontmatter }     = require("../../ai_os/schemas/visionSchema");
  const reg        = _makeRegistry("WORKSPACE_WRITE");
  const project_id = "test_s181_proj";
  const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", "fixture_gocli");

  // Step 1: trigger intake via directory_path
  const step1 = await processIntakeRequest(
    { directory_path: fixturePath, project_id },
    { root: ROOT, registry: reg, provider: "mock", model: "mock-rv", scenario_id: "S181" }
  );
  if (!step1.ok || step1.stage !== "AWAIT_VISION_APPROVAL") {
    return { stage_is_approved: false, vision_is_locked: false, loop_at_architect_design: false };
  }

  // Step 2: approve (AFFIRM)
  const mockAFFIRM = {
    executeTask: async () => ({
      status: "SUCCESS",
      output: { intent: "AFFIRM", confidence: 0.99, clarification_question: "" }
    })
  };

  const step2 = await processIntakeRequest(
    { project_id, message: "looks good to me" },
    { root: ROOT, registry: reg, intent_classifier: mockAFFIRM }
  );

  if (!step2.ok || step2.stage !== "APPROVED") {
    return { stage_is_approved: false, vision_is_locked: false, loop_at_architect_design: false };
  }

  // Check vision.md locked
  const visionFile = path.join(ROOT, "artifacts", "projects", project_id, "vision.md");
  let visionLocked = false;
  if (fs.existsSync(visionFile)) {
    const fm2 = parseFrontmatter(fs.readFileSync(visionFile, "utf8"));
    visionLocked = !!(fm2 && fm2.vision_locked === true);
  }

  // Check loop state
  let loopAtArchitect = false;
  const loopId = step2.loop_id;
  if (loopId) {
    const statusRes = await reg.invoke("orchestration.get_status",
      { project_id, loop_id: loopId }, { root: ROOT });
    loopAtArchitect = !!(statusRes && statusRes.status === "SUCCESS" &&
      statusRes.output && statusRes.output.current_state === "ARCHITECT_DESIGN");
  }

  return {
    stage_is_approved:        step2.stage === "APPROVED",
    vision_is_locked:         visionLocked,
    loop_at_architect_design: loopAtArchitect
  };
}

// ── S182: mock e2e × 3 fixtures — intake handler → InferredVision per fixture ──
// Uses existing mock responses: S161 (pycli), S167 (nextjs), S171 (gocli).
// Asserts schema validity + known-domain assertions for nextjs and gocli.

async function runS182IntakeE2EThreeFixturesMock() {
  const { processIntakeRequest } = require("../../ai_os/intake_conversation_handler");
  const reg = _makeRegistry("WORKSPACE_WRITE");

  function _schemaOk(iv) {
    return !!(iv && typeof iv.project_name === "string" && iv.project_name.length > 0 &&
              typeof iv.domain === "string" && iv.domain.length > 0 &&
              iv.goals && typeof iv.goals.primary === "string" &&
              ["HIGH", "MEDIUM", "LOW"].includes(iv.confidence));
  }

  async function _runFixtureMock(fixture_subdir, project_id, scenario_id) {
    // Pre-cleanup: ensure no stale project directory from prior runs
    try {
      await reg.invoke("fs.delete_dir",
        { path: "artifacts/projects/" + project_id }, { root: ROOT });
    } catch (_e) { /* best-effort — first run has nothing to delete */ }

    const fixturePath = path.resolve(ROOT, "artifacts", "test_fixtures", "intake", fixture_subdir);
    const res = await processIntakeRequest(
      { directory_path: fixturePath, project_id },
      { root: ROOT, registry: reg, provider: "mock", model: "mock-rv", scenario_id }
    );
    if (!res || !res.ok || res.stage !== "AWAIT_VISION_APPROVAL") {
      return { stage_ok: false, schema_ok: false, domain: null };
    }
    const stateFile = path.join(ROOT, "artifacts", "projects", project_id, "intake_state.json");
    if (!fs.existsSync(stateFile)) return { stage_ok: true, schema_ok: false, domain: null };
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const iv = state.inferred_vision;
    return { stage_ok: true, schema_ok: _schemaOk(iv), domain: (iv && iv.domain) || null };
  }

  const pycliR  = await _runFixtureMock("fixture_pycli",  "test_s182_pycli",  "S161");
  const nextjsR = await _runFixtureMock("fixture_nextjs", "test_s182_nextjs", "S167");
  const gocliR  = await _runFixtureMock("fixture_gocli",  "test_s182_gocli",  "S171");

  return {
    pycli_stage_ok:        pycliR.stage_ok,
    pycli_schema_ok:       pycliR.schema_ok,
    nextjs_stage_ok:       nextjsR.stage_ok,
    nextjs_schema_ok:      nextjsR.schema_ok,
    nextjs_domain_correct: nextjsR.domain === "web_application",
    gocli_stage_ok:        gocliR.stage_ok,
    gocli_schema_ok:       gocliR.schema_ok,
    gocli_domain_correct:  gocliR.domain === "cli_tool"
  };
}

// ── S183: PHASE-11 full regression — grammars + role path + contract + provider ─
// Pure file inspection — no LLM calls.
// Verifies: grammar wasm SHA256 from MANIFEST; role has no _buildPrompt;
// INTAKE_CONTRACT §7 marks all 4 languages ACTIVE; provider has mock branch ~line 195.

async function runS183Phase11FullRegression() {
  const crypto = require("crypto");

  const MANIFEST_PATH  = path.join(ROOT, "artifacts", "vendor", "tree-sitter-grammars", "MANIFEST.json");
  const GRAMMAR_DIR    = path.join(ROOT, "artifacts", "vendor", "tree-sitter-grammars");
  const ROLE_PATH      = path.join(ROOT, "code", "src", "runtime", "agents", "roles", "reverse_vision_role.js");
  const PROVIDER_PATH  = path.join(ROOT, "code", "src", "providers", "reverseVisionProvider.js");
  const CONTRACT_PATH  = path.join(ROOT, "docs", "10_runtime", "20_INTAKE_CONTRACT.md");

  // ── Grammar SHA256 checks ────────────────────────────────────────────────
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); }
  catch (_e) { manifest = null; }

  function _sha256Ok(lang) {
    if (!manifest || !manifest.grammars || !manifest.grammars[lang]) return false;
    const entry    = manifest.grammars[lang];
    const wasmPath = path.join(GRAMMAR_DIR, entry.file);
    if (!fs.existsSync(wasmPath)) return false;
    const actual   = crypto.createHash("sha256").update(fs.readFileSync(wasmPath)).digest("hex");
    return actual === entry.sha256;
  }

  const pythonOk     = _sha256Ok("python");
  const javascriptOk = _sha256Ok("javascript");
  const typescriptOk = _sha256Ok("typescript");
  const goOk         = _sha256Ok("go");

  // ── Role single path — no _buildPrompt ──────────────────────────────────
  let roleNoBuildPrompt = false;
  try {
    const roleSource = fs.readFileSync(ROLE_PATH, "utf8");
    roleNoBuildPrompt = !roleSource.includes("_buildPrompt");
  } catch (_e) { /* false */ }

  // ── INTAKE_CONTRACT §7 language ACTIVE checks ─────────────────────────
  let contractPythonActive = false;
  let contractJsActive     = false;
  let contractTsActive     = false;
  let contractGoActive     = false;
  try {
    const contract = fs.readFileSync(CONTRACT_PATH, "utf8");
    // §7 rows contain "ACTIVE" and the language name in the same line
    const lines = contract.split("\n");
    for (const line of lines) {
      if (line.includes("ACTIVE")) {
        if (/Python/i.test(line))                                   contractPythonActive = true;
        if (/JavaScript/i.test(line) && !/TypeScript/i.test(line)) contractJsActive     = true;
        if (/TypeScript/i.test(line))                               contractTsActive     = true;
        if (/Go\b/i.test(line))                                     contractGoActive     = true;
      }
    }
  } catch (_e) { /* false */ }

  // ── Provider Contract v2 — mock branch present ────────────────────────
  // reverseVisionProvider.js must contain the mock branch at around line 195.
  // We check that the file contains the canonical pattern for the mock branch.
  let providerMockBranchOk = false;
  try {
    const providerSource = fs.readFileSync(PROVIDER_PATH, "utf8");
    providerMockBranchOk = providerSource.includes('context.provider === "mock"');
  } catch (_e) { /* false */ }

  return {
    python_wasm_sha256_ok:     pythonOk,
    javascript_wasm_sha256_ok: javascriptOk,
    typescript_wasm_sha256_ok: typescriptOk,
    go_wasm_sha256_ok:         goOk,
    role_no_build_prompt:      roleNoBuildPrompt,
    contract_python_active:    contractPythonActive,
    contract_js_active:        contractJsActive,
    contract_ts_active:        contractTsActive,
    contract_go_active:        contractGoActive,
    provider_mock_branch_ok:   providerMockBranchOk
  };
}

module.exports = {
  runS158IntakeZip,
  runS159AnalyzeSource,
  runS160ReverseVisionMock,
  runS161EndToEndMock,
  runS162UnsupportedLanguage,
  runS163AnalyzeSourceJs,
  runS164AnalyzeSourceTs,
  runS165AnalyzeSourceNextjs,
  runS166ReverseVisionNextjsMock,
  runS167IntakeEndToEndNextjsMock,
  runS168AnalyzeSourceGoSingle,
  runS169AnalyzeSourceGocli,
  runS170ReverseVisionGocliMock,
  runS171IntakeEndToEndGocliMock,
  runS172IntakeDirPathTrigger,
  runS173IntakeNoAttachment,
  runS174IntakeSyncFlow,
  runS175ApproveLocksVision,
  runS176EditVisionField,
  runS177RejectDeletesArtifacts,
  runS178LoopStartsAtArchitectDesign,
  runS179ProviderWritesTraceFiles,
  runS180RoleIdExemptionFires,
  runS181FullMockE2E,
  runS182IntakeE2EThreeFixturesMock,
  runS183Phase11FullRegression
};

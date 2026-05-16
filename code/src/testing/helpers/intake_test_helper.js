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
  runS171IntakeEndToEndGocliMock
};

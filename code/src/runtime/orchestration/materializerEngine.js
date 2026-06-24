"use strict";

// PHASE-24 — BUILDER Materializer engine.
// Pure orchestration logic; all side effects via reg.invoke.
// Never throws; returns { ok, status, files_written, smoke, summary, error_code?, error_detail? }.

const crypto = require("crypto");

function _sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function _lineCount(content) {
  return typeof content === "string" ? content.split("\n").length : 0;
}

function _isSafePath(p) {
  return (
    typeof p === "string" &&
    p.length > 0 &&
    !p.includes("..") &&
    !p.startsWith("/") &&
    !p.startsWith("\\")
  );
}

function _buildCodegenPrompt(plan, spec, design, scenario_id) {
  const filePaths    = plan.map(function (f) { return f.path; }).join(", ");
  const scenarioTag  = scenario_id ? "\nSCENARIO_TAG: " + scenario_id + "\n" : "";
  const specSummary  = (spec  && (spec.scope   || spec.summary))       || "see design";
  const designSummary = (design && design.design_summary)              || "see spec";

  // A-4 (ROOT-1 fix): feed the FULL acceptance criteria + each file's purpose into the
  // codegen prompt. Previously the prompt carried only file paths + a one-line scope
  // summary, so the LLM wrote code blind to the detailed contract (missing routes like
  // GET /:id, missing 404-on-missing). Per-file purposes come from spec.files_to_create
  // (the builder plan carries only path/action/line_count/sha256 — no description). These
  // blocks are additive; scope/design and the scenarioTag are unchanged (the SU mock
  // match keys off SCENARIO_TAG, not body).
  const acs = (spec && Array.isArray(spec.acceptance_criteria)) ? spec.acceptance_criteria : [];
  const acBlock = acs.length
    ? "\nAcceptance criteria (implement EVERY one completely):\n" +
      acs.map(function (a) {
        return "- " + (a && a.id ? a.id + ": " : "") + ((a && (a.description || a.text)) || "");
      }).join("\n")
    : "";
  const filesToCreate = (spec && Array.isArray(spec.files_to_create)) ? spec.files_to_create : [];
  const fileDescs = filesToCreate.filter(function (f) { return f && f.path; })
    .map(function (f) { return "- " + f.path + ": " + ((f.purpose || f.description) || ""); })
    .join("\n");
  const fileBlock = fileDescs ? "\nFile responsibilities (from the spec):\n" + fileDescs : "";

  return (
    "You are a code generator. Return STRICT JSON only — no markdown, no code blocks, no prose before or after." +
    scenarioTag +
    "\nGenerate exactly the following files and return them as this exact JSON structure:" +
    "\n{ \"files\": [ { \"path\": \"<path>\", \"content\": \"<source code>\" }, ... ] }" +
    "\nFiles to generate: " + filePaths +
    fileBlock +
    "\nSpec: " + specSummary +
    "\nDesign: " + designSummary +
    acBlock +
    "\nImplement EVERY acceptance criterion completely: every route (including GET /:id to " +
    "fetch a single resource by id), every status code (including 404 when a resource id is " +
    "not found — for GET, PUT, and DELETE), and all entity fields. The data layer must signal " +
    "found vs not-found (e.g. return null/undefined for a missing id) so the route handlers can " +
    "return 404 instead of silently succeeding." +
    "\nRunnability: if this is an HTTP API or web service, it MUST include a server/entry file that " +
    "creates the app, mounts ALL routes, and calls app.listen(process.env.PORT || 3000) so it boots " +
    "and accepts HTTP requests. Implement the entry file already in the list (e.g. src/server.js); if " +
    "the list contains NO entry file (none of src/server.js, src/index.js, src/app.js, index.js, " +
    "server.js, app.js), ALSO generate src/server.js with that bootstrap. Do not add persistence/backup " +
    "or test files beyond the spec's declared scope." +
    "\nEndpoint paths: the served paths MUST exactly equal the paths the acceptance criteria declare. When " +
    "you mount a router in the entry file, the mount path joined with the router's route paths MUST equal " +
    "the AC-declared paths — do NOT introduce a base-path or version prefix (e.g. /api, /v1) unless the " +
    "acceptance criteria explicitly include it. If the ACs say POST /notes, the app must serve POST /notes, " +
    "NOT /api/notes (e.g. app.use(router) with router.post('/notes', ...), OR app.use('/notes', router) with " +
    "router.post('/', ...) — but NEVER both prefixes)." +
    "\nRESPOND WITH VALID JSON ONLY."
  );
}

function _tryParseCodegenResponse(text) {
  try { return JSON.parse(text); } catch (_) {}
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(stripped); } catch (_) {}
  return null;
}

async function materialize(input, ctx) {
  const reg        = require("../tools/_registry").getDefaultRegistry();
  const root       = (ctx && ctx.root) || process.cwd();
  // PHASE-36 C2: propagate the active project id from the incoming ctx onto the file
  // writes so the L3 cross-project boundary is ARMED on the REAL build write path. The
  // caller (conversationEngine.buildProject) passes active_project_id == this build's own
  // project, so its writes are ALLOWED; a write that targets a different project denies
  // SCOPE_CROSS_PROJECT. Inert when no active id is present (the materializer unit tests
  // call this directly with { root } only) — preserves their behavior exactly.
  const writeCtx   = (ctx && ctx.active_project_id)
    ? { root, active_project_id: ctx.active_project_id }
    : { root };
  const project_id = input.project_id;
  const plan       = Array.isArray(input.plan) ? input.plan : [];
  const spec       = input.spec   || {};
  const design     = input.design || {};
  const provider   = input.provider    || "openai";
  const model      = input.model       || "gpt-4o";
  const scenario_id = input.scenario_id || null;
  const smoke      = input.smoke       === true;
  const smoke_entry = input.smoke_entry || null;

  const prompt = _buildCodegenPrompt(plan, spec, design, scenario_id);

  let codegenResult;
  try {
    codegenResult = await reg.invoke(
      "agent.invoke",
      { provider, model, prompt, project_id, budget_usd: 0.50 },
      { root, role_id: "materializer" }
    );
  } catch (err) {
    return {
      ok: false, status: "FAILED", error_code: "AGENT_INVOKE_ERROR",
      error_detail: err.message, files_written: [],
      smoke: { ran: false }, summary: "agent.invoke threw: " + err.message
    };
  }

  if (!codegenResult || codegenResult.status !== "SUCCESS") {
    const detail = codegenResult && codegenResult.metadata && codegenResult.metadata.reason;
    return {
      ok: false, status: "FAILED", error_code: "CODEGEN_AGENT_FAILED",
      error_detail: detail || "non-SUCCESS", files_written: [],
      smoke: { ran: false }, summary: "agent.invoke failed: " + (detail || "UNKNOWN")
    };
  }

  const text   = (codegenResult.output && codegenResult.output.text) || "";
  const parsed = _tryParseCodegenResponse(text);

  if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    return {
      ok: false, status: "FAILED", error_code: "INVALID_CODEGEN",
      error_detail: "not { files: [...] } after 2 attempts",
      files_written: [], smoke: { ran: false },
      summary: "Codegen response unparseable — no writes"
    };
  }

  for (var i = 0; i < parsed.files.length; i++) {
    if (!_isSafePath(parsed.files[i].path)) {
      return {
        ok: false, status: "FAILED", error_code: "UNSAFE_PATH",
        error_detail: "unsafe path: " + parsed.files[i].path,
        files_written: [], smoke: { ran: false },
        summary: "Unsafe path in codegen — nothing written"
      };
    }
  }

  const filesWritten = [];
  for (var j = 0; j < parsed.files.length; j++) {
    const file    = parsed.files[j];
    const content = typeof file.content === "string" ? file.content : "";
    const relPath = "artifacts/projects/" + project_id + "/" + file.path;

    const wr = await reg.invoke("fs.write_file", { path: relPath, content }, writeCtx);
    if (!wr || wr.status !== "SUCCESS") {
      const reason = wr && wr.metadata && wr.metadata.reason;
      return {
        ok: false, status: "FAILED", error_code: "WRITE_FAILED",
        error_detail: "write failed: " + file.path + " — " + (reason || "UNKNOWN"),
        files_written: filesWritten, smoke: { ran: false },
        summary: "Write failed at " + file.path
      };
    }

    const planEntry = plan.find(function (p) { return p.path === file.path; });
    filesWritten.push({
      path:       file.path,
      action:     (planEntry && planEntry.action) || "create",
      line_count: _lineCount(content),
      sha256:     _sha256(content)
    });
  }

  if (smoke && smoke_entry) {
    let sr;
    try {
      sr = await reg.invoke(
        "shell.run_in_workspace",
        { project_id, argv: ["node", smoke_entry], timeout_ms: 10000 },
        { root }
      );
    } catch (err) {
      return {
        ok: false, status: "FAILED", error_code: "SMOKE_FAILED",
        error_detail: err.message, files_written: filesWritten,
        smoke: { ran: true, exit_code: null, stdout_tail: "", passed: false },
        summary: "Smoke threw: " + err.message
      };
    }

    const smokeOut   = sr && sr.output;
    const exitCode   = smokeOut && smokeOut.exit_code;
    const stdoutTail = typeof (smokeOut && smokeOut.stdout) === "string"
      ? smokeOut.stdout.slice(-200) : "";
    const passed     = !!(sr && sr.status === "SUCCESS" && exitCode === 0);

    if (!passed) {
      return {
        ok: false, status: "FAILED", error_code: "SMOKE_FAILED",
        files_written: filesWritten,
        smoke: { ran: true, exit_code: exitCode, stdout_tail: stdoutTail, passed: false },
        summary: "Smoke failed: exit_code=" + exitCode
      };
    }

    return {
      ok: true, status: "SUCCESS", files_written: filesWritten,
      smoke: { ran: true, exit_code: exitCode, stdout_tail: stdoutTail, passed: true },
      summary: "Materialized " + filesWritten.length + " file(s); smoke passed."
    };
  }

  return {
    ok: true, status: "SUCCESS", files_written: filesWritten,
    smoke: { ran: false },
    summary: "Materialized " + filesWritten.length + " file(s)."
  };
}

module.exports = { materialize };

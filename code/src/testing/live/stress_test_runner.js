"use strict";

// ── stress_test_runner.js ─────────────────────────────────────────────────────
// PCST v1.0 — Public Corpus Stress-Test runner.
// Pattern-matched on stage_11_5_live_runner.js.
//
// Per-project flow:
//   1. PRECLONE_MISSING check (source_clone dir must exist — §ARC option-c)
//   2. For flask-no-readme: copy flask/source_clone via tools.fs.*, delete READMEs
//   3. project.intake_zip   (directory_path → project source)
//   4. project.analyze_source → SourceTreeAnalysis
//   5. STOP_TRIGGER_9 check: assert no raw file contents in SourceTreeAnalysis
//   6. role.invoke("reverse_vision") → InferredVision  (real OpenAI gpt-4o)
//   7. _validateInferredVision() → P5
//   8. Cost capture (in-memory delta, OBS-1 mitigation)
//   9. Write artifact bundle: source_tree.json, inferred_vision.json, cost.json, observations.md
//  10. Kill-switch checks
//
// Mid-checkpoint after project #5 (cobra): write midpoint.md, exit.
// Resume via --resume-from=<slug> (handled in bin/forge-stress-test.js).
//
// Track A: no direct fs.*, no direct OpenAI init, no child_process.
// @see artifacts/decisions/DECISION-2026-05-17T11-0-pcst-plan.md

const path = require("path");
const { getDefaultRegistry } = require("../../runtime/tools/_registry");

// ── Project corpus ────────────────────────────────────────────────────────────

const PROJECTS = [
  {
    slug:               "flask",
    clone_dir:          "artifacts/stress_test/flask/source_clone",
    expected_languages: ["python"],
    number:             1
  },
  {
    slug:               "httpie",
    clone_dir:          "artifacts/stress_test/httpie/source_clone",
    expected_languages: ["python"],
    number:             2
  },
  {
    slug:               "fastify",
    clone_dir:          "artifacts/stress_test/fastify/source_clone",
    expected_languages: ["javascript"],
    number:             3
  },
  {
    slug:               "tailwind-nextjs-blog",
    clone_dir:          "artifacts/stress_test/tailwind-nextjs-blog/source_clone",
    expected_languages: ["javascript", "typescript"],
    number:             4
  },
  {
    slug:               "cobra",
    clone_dir:          "artifacts/stress_test/cobra/source_clone",
    expected_languages: ["go"],
    number:             5,
    is_midpoint:        true   // mid-checkpoint fires after this project
  },
  {
    slug:               "hugo",
    clone_dir:          "artifacts/stress_test/hugo/source_clone",
    expected_languages: ["go"],
    number:             6
  },
  {
    slug:               "ruff",
    clone_dir:          "artifacts/stress_test/ruff/source_clone",
    expected_languages: [],    // Rust dominant — expected UNSUPPORTED_LANGUAGE
    expected_blocked:   true,
    number:             7
  },
  {
    slug:               "gitleaks",
    clone_dir:          "artifacts/stress_test/gitleaks/source_clone",
    expected_languages: ["go"],
    trigger9_caution:   true,  // secret scanner — verify no raw file contents in output
    number:             8
  },
  {
    slug:               "flask-no-readme",
    clone_dir:          "artifacts/stress_test/flask-no-readme/source_clone",
    expected_languages: ["python"],
    derived_from_slug:  "flask",   // script copies flask/source_clone, deletes READMEs
    number:             9
  },
  {
    slug:               "strapi",
    clone_dir:          "artifacts/stress_test/strapi/source_clone",
    expected_languages: ["javascript", "typescript"],
    number:             10
  }
];

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER              = "openai";
const MODEL                 = "gpt-4o";
const PER_PROJECT_SOFT_USD  = 0.20;
const PER_PROJECT_HARD_USD  = 0.50;
const CUMULATIVE_SOFT_USD   = 1.50;
const CUMULATIVE_HARD_USD   = 2.00;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _reg() { return getDefaultRegistry(); }
function _root() { return process.cwd(); }
function _log(msg) { console.log("[stress-test] " + msg); }

// Read total cost for a given project from the ledger.
// Returns 0 on any failure — caller handles delta computation.
// Pattern from stage_11_5_live_runner.js _readProjectCost.
async function _readProjectCost(project_id, ctx) {
  try {
    const r = await _reg().invoke("agent.read_ledger", { project_id }, ctx || {});
    return (r && r.status === "SUCCESS" && r.output && typeof r.output.total_cost === "number")
      ? r.output.total_cost : 0;
  } catch (_e) {
    return 0;
  }
}

// P5 validator — checks all required InferredVision fields are present and non-empty.
// Mirrors OUTPUT_SCHEMA from reverse_vision_role.js.
function _validateInferredVision(iv) {
  const errors = [];
  if (!iv || typeof iv !== "object") return { valid: false, errors: ["InferredVision must be an object"] };

  if (typeof iv.project_name !== "string" || !iv.project_name.trim())
    errors.push("project_name: must be a non-empty string");
  if (typeof iv.domain !== "string" || !iv.domain.trim())
    errors.push("domain: must be a non-empty string");
  if (!iv.goals || typeof iv.goals !== "object")
    errors.push("goals: must be an object");
  else {
    if (typeof iv.goals.primary !== "string" || !iv.goals.primary.trim())
      errors.push("goals.primary: must be a non-empty string");
    if (!Array.isArray(iv.goals.secondary))
      errors.push("goals.secondary: must be an array");
  }
  if (!Array.isArray(iv.constraints))
    errors.push("constraints: must be an array");
  if (!Array.isArray(iv.non_goals))
    errors.push("non_goals: must be an array");
  if (!Array.isArray(iv.detected_languages))
    errors.push("detected_languages: must be an array");
  if (typeof iv.source_summary !== "string" || !iv.source_summary.trim())
    errors.push("source_summary: must be a non-empty string");
  if (!["HIGH", "MEDIUM", "LOW"].includes(iv.confidence))
    errors.push("confidence: must be HIGH, MEDIUM, or LOW");

  return { valid: errors.length === 0, errors };
}

// STOP_TRIGGER_9: verify SourceTreeAnalysis contains no raw file contents.
// analyze_source only outputs top_level_symbols (names), not file contents.
// This check is explicit for the gitleaks caveat.
function _checkNoRawFileContents(sourceTree) {
  if (sourceTree.file_contents !== undefined)
    return { ok: false, reason: "SourceTreeAnalysis has unexpected file_contents field" };
  if (Array.isArray(sourceTree.ast_samples)) {
    for (const sample of sourceTree.ast_samples) {
      if (sample.raw_content !== undefined || sample.content !== undefined)
        return { ok: false, reason: "ast_sample has raw_content/content field: " + sample.file };
    }
  }
  return { ok: true };
}

// ── flask-no-readme preparation ───────────────────────────────────────────────
// Copies flask/source_clone into flask-no-readme/source_clone via tools.fs.*
// then deletes README files. Implements PROMPT §1.1 for project #9.

async function _prepareFlaskNoReadme(ROOT, ctx) {
  const reg     = _reg();
  const srcDir  = "artifacts/stress_test/flask/source_clone";
  const destDir = "artifacts/stress_test/flask-no-readme/source_clone";

  _log("[flask-no-readme] Preparing derived project from flask/source_clone...");

  // Check source exists
  const srcExists = await reg.invoke("fs.exists", { path: srcDir }, ctx);
  if (!srcExists || srcExists.status !== "SUCCESS" || !srcExists.output.exists) {
    return { ok: false, reason: "PRECLONE_MISSING for flask (required for flask-no-readme)" };
  }

  // Check dest doesn't already exist (idempotent cleanup)
  const destExists = await reg.invoke("fs.exists", { path: destDir }, ctx);
  if (destExists && destExists.status === "SUCCESS" && destExists.output.exists) {
    _log("[flask-no-readme]   Existing dest found — deleting for fresh copy...");
    const delRes = await reg.invoke("fs.delete_dir", { path: destDir }, ctx);
    if (!delRes || delRes.status !== "SUCCESS") {
      return { ok: false, reason: "Failed to delete existing flask-no-readme/source_clone" };
    }
  }

  // Walk and copy files from srcDir to destDir
  const listRes = await _walkAndCopy(reg, ROOT, srcDir, destDir, ctx);
  if (!listRes.ok) return listRes;

  _log("[flask-no-readme]   Copied " + listRes.count + " files.");

  // Delete README files
  const README_NAMES = ["README.md", "README.rst", "README", "README.txt", "readme.md", "readme.rst"];
  let deletedCount = 0;
  for (const name of README_NAMES) {
    const readmePath = destDir + "/" + name;
    const readmeExists = await reg.invoke("fs.exists", { path: readmePath }, ctx);
    if (readmeExists && readmeExists.status === "SUCCESS" && readmeExists.output.exists) {
      const delRes = await reg.invoke("fs.delete_file", { path: readmePath }, ctx);
      if (delRes && delRes.status === "SUCCESS") {
        _log("[flask-no-readme]   Deleted: " + name);
        deletedCount++;
      }
    }
  }
  _log("[flask-no-readme]   Deleted " + deletedCount + " README file(s).");

  return { ok: true, files_copied: listRes.count, readmes_deleted: deletedCount };
}

// Recursive copy via tools.fs.* (Track A compliant — no direct fs.*)
async function _walkAndCopy(reg, ROOT, srcRelDir, destRelDir, ctx) {
  const listRes = await reg.invoke("fs.list_dir", { path: srcRelDir }, ctx);
  if (!listRes || listRes.status !== "SUCCESS") {
    return { ok: false, reason: "list_dir failed on " + srcRelDir };
  }

  let count = 0;
  for (const entry of listRes.output.entries) {
    const srcChild  = srcRelDir  + "/" + entry.name;
    const destChild = destRelDir + "/" + entry.name;

    if (entry.type === "dir" || entry.type === "directory") {
      // Skip .git dir
      if (entry.name === ".git") continue;
      const sub = await _walkAndCopy(reg, ROOT, srcChild, destChild, ctx);
      if (!sub.ok) return sub;
      count += sub.count;
    } else {
      const readRes = await reg.invoke("fs.read_file", { path: srcChild }, ctx);
      if (!readRes || readRes.status !== "SUCCESS") continue; // best-effort skip binary files
      const writeRes = await reg.invoke("fs.write_file",
        { path: destChild, content: readRes.output.content }, ctx);
      if (!writeRes || writeRes.status !== "SUCCESS") {
        return { ok: false, reason: "write_file failed for " + destChild };
      }
      count++;
    }
  }
  return { ok: true, count };
}

// ── Artifact writers ──────────────────────────────────────────────────────────

async function _writeArtifactBundle(slug, sourceTree, inferredVision, costInfo, observations, ctx) {
  const reg     = _reg();
  const baseDir = "artifacts/stress_test/" + slug;

  async function _writeJson(filename, obj) {
    return reg.invoke("fs.write_file",
      { path: baseDir + "/" + filename, content: JSON.stringify(obj, null, 2) },
      ctx
    );
  }
  async function _writeMd(filename, content) {
    return reg.invoke("fs.write_file",
      { path: baseDir + "/" + filename, content },
      ctx
    );
  }

  await _writeJson("source_tree.json",     sourceTree || {});
  await _writeJson("inferred_vision.json", inferredVision || {});
  await _writeJson("cost.json",            costInfo);
  await _writeMd("observations.md",        observations);
}

// ── Per-project runner ────────────────────────────────────────────────────────

async function _runProject(project, cumulativeCostSoFar) {
  const ROOT       = _root();
  const slug       = project.slug;
  const project_id = "pcst_" + slug;
  const ctx        = { root: ROOT, project_id };
  const reg        = _reg();
  const startTs    = Date.now();

  const pChecks    = { P1: null, P2: null, P3: "DEFERRED", P4: null, P5: null, P6: "DEFERRED" };
  const obs        = [];  // observations for observations.md
  let   sourceTree = null;
  let   iv         = null;
  let   costUsd    = 0;

  _log("══════════════════════════════════════════════════════════");
  _log("[" + slug + " #" + project.number + "] Starting...");
  _log("[" + slug + "]   project_id:   " + project_id);
  _log("[" + slug + "]   clone_dir:    " + project.clone_dir);

  // ── flask-no-readme preparation ──────────────────────────────────────────
  if (project.derived_from_slug) {
    const prepRes = await _prepareFlaskNoReadme(ROOT, ctx);
    if (!prepRes.ok) {
      pChecks.P1 = "FAIL";
      const reason = "PRECLONE_MISSING: " + prepRes.reason;
      _log("[" + slug + "] " + reason);
      return _buildProjectResult(slug, project.number, "FAILED", pChecks, null, null, 0,
        Date.now() - startTs, reason, obs);
    }
    obs.push("Derived from flask/source_clone: " + prepRes.files_copied +
      " files copied, " + prepRes.readmes_deleted + " README(s) deleted.");
  }

  // ── Step 1: PRECLONE_MISSING check ───────────────────────────────────────
  const cloneExists = await reg.invoke("fs.exists", { path: project.clone_dir }, ctx);
  if (!cloneExists || cloneExists.status !== "SUCCESS" || !cloneExists.output.exists) {
    pChecks.P1 = "FAIL";
    const reason = "PRECLONE_MISSING: " + project.clone_dir +
      " not found. Run the clone command for this project first." +
      " See artifacts/decisions/DECISION-2026-05-17T11-0-pcst-plan.md §3.";
    _log("[" + slug + "] " + reason);
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, null, null, 0,
      Date.now() - startTs, reason, obs);
  }

  // ── Step 2: Clean prior pcst artifacts (idempotent) ──────────────────────
  try {
    const delRes = await reg.invoke("fs.delete_dir",
      { path: "artifacts/projects/" + project_id }, ctx);
    if (delRes && delRes.status === "SUCCESS")
      _log("[" + slug + "]   Prior artifacts cleaned.");
  } catch (_e) { /* best-effort */ }

  // ── Step 3: project.intake_zip (directory_path) ───────────────────────────
  _log("[" + slug + "] Step 3: project.intake_zip...");
  let intakeRes;
  try {
    intakeRes = await reg.invoke("project.intake_zip",
      { project_id, directory_path: project.clone_dir }, ctx);
  } catch (e) {
    pChecks.P1 = "FAIL";
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, null, null, 0,
      Date.now() - startTs, "intake_zip threw: " + e.message, obs);
  }

  if (!intakeRes || intakeRes.status !== "SUCCESS") {
    pChecks.P1 = "FAIL";
    const reason = "intake_zip failed: " + ((intakeRes && intakeRes.metadata && intakeRes.metadata.reason) || "UNKNOWN");
    _log("[" + slug + "] " + reason);
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, null, null, 0,
      Date.now() - startTs, reason, obs);
  }
  _log("[" + slug + "]   intake_zip OK — " + intakeRes.output.file_count + " files, " +
    intakeRes.output.total_bytes + " bytes");

  // ── Step 4: project.analyze_source → SourceTreeAnalysis ─────────────────
  _log("[" + slug + "] Step 4: project.analyze_source...");
  let analyzeRes;
  try {
    analyzeRes = await reg.invoke("project.analyze_source", { project_id }, ctx);
  } catch (e) {
    pChecks.P1 = "FAIL";
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, null, null, 0,
      Date.now() - startTs, "analyze_source threw: " + e.message, obs);
  }

  // UNSUPPORTED_LANGUAGE is a controlled failure (not a crash) — P1 PASS, P5 FAIL
  if (!analyzeRes || analyzeRes.status !== "SUCCESS") {
    const reason = (analyzeRes && analyzeRes.metadata && analyzeRes.metadata.reason) || "ANALYZE_FAILED";
    _log("[" + slug + "]   analyze_source: " + reason);

    if (reason === "UNSUPPORTED_LANGUAGE") {
      pChecks.P1 = "PASS";
      pChecks.P5 = "FAIL";
      obs.push("UNSUPPORTED_LANGUAGE: " + reason +
        (analyzeRes.metadata && analyzeRes.metadata.detected_extensions
          ? " — detected extensions: " + analyzeRes.metadata.detected_extensions.join(", ")
          : ""));
      if (project.expected_blocked) obs.push("NOTE: Expected outcome for this project.");
      const durationMs = Date.now() - startTs;
      pChecks.P4 = "PASS"; // no LLM call made = $0.00
      await _writeArtifactBundle(slug, { status: "UNSUPPORTED_LANGUAGE", reason }, null,
        { reverse_vision_usd: 0, duration_ms: durationMs, prompt_tokens: 0, completion_tokens: 0 },
        _buildObservationsMd(slug, pChecks, obs, 0, durationMs), ctx);
      return _buildProjectResult(slug, project.number, "P5_FAIL", pChecks, null, null, 0,
        durationMs, "UNSUPPORTED_LANGUAGE — expected for " + slug, obs);
    }

    pChecks.P1 = "FAIL";
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, null, null, 0,
      Date.now() - startTs, "analyze_source failed: " + reason, obs);
  }

  sourceTree = analyzeRes.output;
  pChecks.P1 = "PASS"; // survived intake + analyze
  _log("[" + slug + "]   analyze_source OK — languages: " +
    (sourceTree.detected_languages || []).join(", ") + " | files: " + sourceTree.file_count);

  // ── Step 5: STOP_TRIGGER_9 — no raw file contents in SourceTreeAnalysis ──
  if (project.trigger9_caution) {
    const t9 = _checkNoRawFileContents(sourceTree);
    if (!t9.ok) {
      _log("[" + slug + "] [PCST STOP] STOP_TRIGGER_9: " + t9.reason);
      obs.push("[PCST STOP] STOP_TRIGGER_9: " + t9.reason);
      pChecks.P1 = "FAIL";
      return _buildProjectResult(slug, project.number, "STOP_TRIGGER_9", pChecks, sourceTree, null, 0,
        Date.now() - startTs, "STOP_TRIGGER_9: " + t9.reason, obs);
    }
    obs.push("STOP_TRIGGER_9 check: PASS — no raw file contents in SourceTreeAnalysis.");
  }

  // ── Step 6: reverse_vision role (real OpenAI gpt-4o) ─────────────────────
  _log("[" + slug + "] Step 6: reverse_vision role (REAL LLM call)...");

  const costBefore = await _readProjectCost(project_id, ctx);
  const rvStart    = Date.now();
  let   rvResult;

  try {
    rvResult = await reg.invoke(
      "role.invoke",
      {
        role_id:    "reverse_vision",
        project_id,
        provider:   PROVIDER,
        model:      MODEL,
        input: {
          schema_version: "1.0.0",
          project_id,
          source_tree:    sourceTree,
          provider:       PROVIDER,
          model:          MODEL
        }
      },
      Object.assign({ role_id: "reverse_vision" }, ctx)
    );
  } catch (e) {
    pChecks.P1 = "FAIL";
    pChecks.P2 = e.message && e.message.toLowerCase().includes("timeout") ? "FAIL" : "PASS";
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, sourceTree, null, 0,
      Date.now() - startTs, "role.invoke threw: " + e.message, obs);
  }

  const rvDuration = Date.now() - rvStart;

  // Capture cost immediately (OBS-1 mitigation)
  const costAfter = await _readProjectCost(project_id, ctx);
  costUsd         = Math.max(0, costAfter - costBefore);
  _log("[" + slug + "]   reverse_vision cost delta: $" + costUsd.toFixed(5) +
    " | duration: " + (rvDuration / 1000).toFixed(1) + "s");

  pChecks.P2 = "PASS"; // role completed without timeout

  if (!rvResult || rvResult.status !== "SUCCESS") {
    pChecks.P1 = "FAIL";
    const reason = (rvResult && rvResult.metadata && rvResult.metadata.reason) || "ROLE_FAILED";
    const detail = (rvResult && rvResult.metadata && rvResult.metadata.detail) || null;
    _log("[" + slug + "]   reverse_vision FAILED: " + reason + (detail ? " — " + detail : ""));
    await _writeArtifactBundle(slug, sourceTree, null,
      { reverse_vision_usd: costUsd, duration_ms: Date.now() - startTs, prompt_tokens: 0, completion_tokens: 0 },
      _buildObservationsMd(slug, pChecks, obs, costUsd, Date.now() - startTs), ctx);
    return _buildProjectResult(slug, project.number, "FAILED", pChecks, sourceTree, null, costUsd,
      Date.now() - startTs, "reverse_vision failed: " + reason, obs);
  }

  iv = rvResult.output;
  _log("[" + slug + "]   reverse_vision OK — domain: " + (iv && iv.domain) +
    " | confidence: " + (iv && iv.confidence));

  // ── Step 7: P5 — validate InferredVision schema ───────────────────────────
  const p5 = _validateInferredVision(iv);
  pChecks.P5 = p5.valid ? "PASS" : "FAIL";
  if (!p5.valid) obs.push("P5 schema errors: " + p5.errors.join("; "));

  // ── Step 8: P4 — per-project cost check ──────────────────────────────────
  const durationMs = Date.now() - startTs;
  if (costUsd >= PER_PROJECT_HARD_USD) {
    pChecks.P4 = "FAIL";
    obs.push("P4 HARD_CAP: cost $" + costUsd.toFixed(5) + " >= $" + PER_PROJECT_HARD_USD);
  } else if (costUsd >= PER_PROJECT_SOFT_USD) {
    pChecks.P4 = "WARN";
    obs.push("P4 soft cap exceeded: cost $" + costUsd.toFixed(5) + " >= $" + PER_PROJECT_SOFT_USD);
  } else {
    pChecks.P4 = "PASS";
  }

  // Language match observation
  if (project.expected_languages && project.expected_languages.length > 0) {
    const detected    = iv.detected_languages || [];
    const missingLangs = project.expected_languages.filter(function(l) { return !detected.includes(l); });
    if (missingLangs.length > 0)
      obs.push("Language mismatch: expected " + project.expected_languages.join(", ") +
        " but detected " + detected.join(", ") + " (missing: " + missingLangs.join(", ") + ")");
  }

  // tokens from role metadata
  const tokensIn  = (rvResult.metadata && rvResult.metadata.tokens_in)  || 0;
  const tokensOut = (rvResult.metadata && rvResult.metadata.tokens_out) || 0;

  // ── Step 9: Write artifact bundle ────────────────────────────────────────
  const costInfo = {
    reverse_vision_usd:  costUsd,
    duration_ms:         durationMs,
    prompt_tokens:       tokensIn,
    completion_tokens:   tokensOut
  };
  await _writeArtifactBundle(slug, sourceTree, iv, costInfo,
    _buildObservationsMd(slug, pChecks, obs, costUsd, durationMs), ctx);

  const verdict = pChecks.P5 === "FAIL" ? "P5_FAIL" : "SUCCESS";
  _log("[" + slug + "] DONE — " + verdict + " | cost=$" + costUsd.toFixed(5) +
    " | dur=" + (durationMs / 1000).toFixed(1) + "s | " +
    "P1=" + pChecks.P1 + " P2=" + pChecks.P2 + " P4=" + pChecks.P4 + " P5=" + pChecks.P5);

  return _buildProjectResult(slug, project.number, verdict, pChecks, sourceTree, iv,
    costUsd, durationMs, null, obs);
}

// ── Result builders ───────────────────────────────────────────────────────────

function _buildProjectResult(slug, number, verdict, pChecks, sourceTree, iv, costUsd,
  durationMs, errorReason, obs) {
  return {
    slug,
    number,
    verdict,
    p_checks:       pChecks,
    cost_usd:       costUsd,
    duration_ms:    durationMs,
    inferred_vision: iv,
    source_tree:    sourceTree,
    error_reason:   errorReason || null,
    observations:   obs || []
  };
}

function _buildObservationsMd(slug, pChecks, obs, costUsd, durationMs) {
  const lines = [
    "# PCST observations — " + slug,
    "",
    "| Check | Result |",
    "|---|---|",
    "| P1 No crash | " + (pChecks.P1 || "N/A") + " |",
    "| P2 No timeout | " + (pChecks.P2 || "N/A") + " |",
    "| P3 Track A clean | DEFERRED (post-run grep) |",
    "| P4 Cost bound | " + (pChecks.P4 || "N/A") + " ($" + costUsd.toFixed(5) + ") |",
    "| P5 Vision schema | " + (pChecks.P5 || "N/A") + " |",
    "| P6 SU baseline | DEFERRED (post-all-projects) |",
    "",
    "Duration: " + (durationMs / 1000).toFixed(1) + "s",
    "",
    "## Notes",
    ""
  ];
  if (obs.length === 0) {
    lines.push("None.");
  } else {
    obs.forEach(function(o) { lines.push("- " + o); });
  }
  return lines.join("\n");
}

// ── Mid-checkpoint artifact writer ────────────────────────────────────────────

async function _writeMidCheckpoint(results, cumulativeCost) {
  const reg = _reg();
  const ctx = { root: _root() };
  const ts  = new Date().toISOString().slice(0, 10);

  const tableRows = results.map(function(r) {
    return "| " + r.number + " | " + r.slug + " | " +
      (r.p_checks.P1 || "N/A") + " | " +
      (r.p_checks.P2 || "N/A") + " | " +
      "DEFERRED | " +
      (r.p_checks.P4 || "N/A") + " | " +
      (r.p_checks.P5 || "N/A") + " | " +
      "$" + (r.cost_usd || 0).toFixed(5) + " |";
  });

  const redFindings = results.filter(function(r) {
    return r.p_checks.P1 === "FAIL" || r.p_checks.P2 === "FAIL" || r.p_checks.P5 === "FAIL";
  });

  const ivPaths = results
    .filter(function(r) { return r.inferred_vision; })
    .map(function(r) { return "- artifacts/stress_test/" + r.slug + "/inferred_vision.json"; });

  const content = [
    "# PCST v1.0 — Mid-Checkpoint (Projects #1–#5)",
    "",
    "Date: " + ts,
    "Cumulative cost: $" + cumulativeCost.toFixed(5) + " of $" + CUMULATIVE_HARD_USD.toFixed(2) + " cap",
    "",
    "## Per-Project Results (P1–P5; P6 deferred to end)",
    "",
    "| # | Slug | P1 | P2 | P3 | P4 | P5 | Cost |",
    "|---|---|---|---|---|---|---|---|",
    ...tableRows,
    "",
    "## RED Findings",
    ""
  ].concat(
    redFindings.length === 0
      ? ["None ✓"]
      : redFindings.map(function(r) {
          return "- **" + r.slug + "**: " +
            Object.keys(r.p_checks)
              .filter(function(k) { return r.p_checks[k] === "FAIL"; })
              .join(", ") +
            " — " + (r.error_reason || r.observations.join("; ") || "see observations.md");
        })
  ).concat([
    "",
    "## Track A Post-Grep (first half)",
    "",
    "Run after this checkpoint:",
    "```",
    "grep -rE \"fs\\.(read|write|append|unlink)FileSync\" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js",
    "grep -rE \"fetch\\(\" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js",
    "grep -rE \"new OpenAI\\(\" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js",
    "grep -rE \"require\\(['\\\"]child_process\" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js",
    "```",
    "",
    "## InferredVision Paths for Q-Review (#1–#5)",
    ""
  ]).concat(
    ivPaths.length > 0 ? ivPaths : ["*(none produced yet)*"]
  ).concat([
    "",
    "---",
    "",
    "**Awaiting CTO verification. Resume command:**",
    "```",
    "node bin/forge-stress-test.js --resume-from=hugo --no-su-baseline",
    "```"
  ]);

  await reg.invoke("fs.write_file",
    {
      path:    "artifacts/decisions/_stress_test_checkpoints/midpoint.md",
      content: content.join("\n")
    },
    ctx
  );
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function runStressTest(options) {
  const singleSlug  = (options && options.singleSlug)  || null;
  const resumeFrom  = (options && options.resumeFrom)  || null;

  const ROOT    = _root();
  const startTs = Date.now();

  let cumulativeCost = 0;
  const results      = [];
  let   midpointDone = false;
  let   killFired    = false;
  let   killReason   = null;

  // Determine which projects to run
  let projectsToRun = PROJECTS.slice();
  if (singleSlug) {
    projectsToRun = PROJECTS.filter(function(p) { return p.slug === singleSlug; });
    if (projectsToRun.length === 0) {
      _log("ERROR: unknown slug '" + singleSlug + "'");
      return { status: "ERROR", error: "unknown slug: " + singleSlug, results: [], total_cost_usd: 0, duration_ms: 0 };
    }
  } else if (resumeFrom) {
    const idx = PROJECTS.findIndex(function(p) { return p.slug === resumeFrom; });
    if (idx === -1) {
      _log("ERROR: unknown resume-from slug '" + resumeFrom + "'");
      return { status: "ERROR", error: "unknown resume-from slug: " + resumeFrom, results: [], total_cost_usd: 0, duration_ms: 0 };
    }
    projectsToRun = PROJECTS.slice(idx);
    _log("Resuming from project #" + (idx + 1) + " (" + resumeFrom + ")");
  }

  _log("══════════════════════════════════════════════════════════");
  _log("PCST v1.0 — Public Corpus Stress-Test");
  _log("Projects: " + projectsToRun.map(function(p) { return p.slug; }).join(", "));
  _log("Provider: " + PROVIDER + " / " + MODEL);
  _log("Per-project hard kill: $" + PER_PROJECT_HARD_USD +
    " | Cumulative hard kill: $" + CUMULATIVE_HARD_USD);
  _log("══════════════════════════════════════════════════════════");

  for (var pi = 0; pi < projectsToRun.length; pi++) {
    const project = projectsToRun[pi];

    // Pre-project cumulative kill switch check
    if (cumulativeCost >= CUMULATIVE_HARD_USD) {
      killFired  = true;
      killReason = "KILL_SWITCH_TOTAL: cumulative $" + cumulativeCost.toFixed(5) +
        " >= $" + CUMULATIVE_HARD_USD;
      _log("[PCST STOP] " + killReason);
      break;
    }
    if (cumulativeCost >= CUMULATIVE_SOFT_USD) {
      _log("[PCST WARN] Cumulative soft cap: $" + cumulativeCost.toFixed(5) +
        " >= $" + CUMULATIVE_SOFT_USD);
    }

    let result;
    try {
      result = await _runProject(project, cumulativeCost);
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      _log("[" + project.slug + "] UNHANDLED ERROR: " + errMsg);
      result = _buildProjectResult(project.slug, project.number, "FAILED",
        { P1: "FAIL", P2: "N/A", P3: "DEFERRED", P4: "N/A", P5: "N/A", P6: "DEFERRED" },
        null, null, 0, 0, "UNHANDLED: " + errMsg, []);
    }

    results.push(result);
    cumulativeCost += result.cost_usd || 0;

    // Per-project hard kill switch
    if (result.p_checks.P4 === "FAIL" || (result.cost_usd || 0) >= PER_PROJECT_HARD_USD) {
      killFired  = true;
      killReason = "KILL_SWITCH_PER_PROJECT: " + project.slug +
        " cost $" + (result.cost_usd || 0).toFixed(5);
      _log("[PCST STOP] " + killReason);
      break;
    }

    // One-line summary
    const p = result.p_checks;
    console.log("[" + project.slug + "] " +
      "P1=" + (p.P1 || "?") + " P2=" + (p.P2 || "?") +
      " P4=" + (p.P4 || "?") + " P5=" + (p.P5 || "?") +
      " | cost=$" + (result.cost_usd || 0).toFixed(5) +
      " | duration=" + ((result.duration_ms || 0) / 1000).toFixed(1) + "s" +
      " | verdict=" + result.verdict);

    // Mid-checkpoint: after project #5 (cobra) in a full run (not single/resume)
    if (!singleSlug && !resumeFrom && project.is_midpoint && !midpointDone) {
      midpointDone = true;
      _log("══════════════════════════════════════════════════════════");
      _log("[PCST] Mid-checkpoint reached after project #5 (cobra).");
      await _writeMidCheckpoint(results, cumulativeCost);
      _log("[PCST] Mid-checkpoint complete. Awaiting CTO verification.");
      _log("[PCST] Resume: node bin/forge-stress-test.js --resume-from=hugo");
      _log("══════════════════════════════════════════════════════════");
      return {
        status:          "MIDPOINT",
        results,
        total_cost_usd:  cumulativeCost,
        duration_ms:     Date.now() - startTs,
        kill_fired:      false,
        kill_reason:     null
      };
    }
  }

  const totalDuration = Date.now() - startTs;
  const allVerdicts   = results.map(function(r) { return r.verdict; });
  const hasRed        = allVerdicts.some(function(v) { return v === "FAILED" || v === "STOP_TRIGGER_9"; });
  const status        = killFired       ? (killReason.startsWith("KILL_SWITCH_TOTAL") ? "KILL_SWITCH_TOTAL" : "KILL_SWITCH_PER_PROJECT")
                      : hasRed          ? "PARTIAL_RED"
                      : "SUCCESS";

  _log("══════════════════════════════════════════════════════════");
  _log("PCST run complete — " + results.length + " projects | status=" + status);
  _log("Total cost: $" + cumulativeCost.toFixed(5) + " | duration=" + (totalDuration / 1000).toFixed(1) + "s");
  _log("══════════════════════════════════════════════════════════");

  return {
    status,
    results,
    total_cost_usd: cumulativeCost,
    duration_ms:    totalDuration,
    kill_fired:     killFired,
    kill_reason:    killReason || null
  };
}

module.exports = {
  runStressTest,
  PROJECTS,
  PROVIDER,
  MODEL,
  PER_PROJECT_SOFT_USD,
  PER_PROJECT_HARD_USD,
  CUMULATIVE_SOFT_USD,
  CUMULATIVE_HARD_USD
};

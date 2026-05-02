"use strict";

// Implements docs/12_ai_os/08_DOCUMENTATION_BUILD_LOOP.md
// 7-stage documentation build with loop tracking and completion gate

const fs = require("fs");
const path = require("path");
const OpenAiDocumentationProvider = require("../providers/openAiDocumentationProvider");
const DocumentationReviewProvider = require("../providers/documentationReviewProvider");

const STAGES = ["DRAFT", "SELF_REVIEW", "CONTRADICTION_DETECTION", "AMBIGUITY_DETECTION", "USER_REVIEW", "REVISION", "APPROVAL"];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function createDocumentationBuildLoop(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function loopStatePath(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os", "doc_build_loop_state.json");
  }

  function loadLoopState(projectId) {
    return readJsonSafe(loopStatePath(projectId), {
      project_id: projectId,
      current_stage: "DRAFT",
      stages_completed: [],
      iterations: 0,
      max_iterations: 3,
      status: "NOT_STARTED",
      issues_found: [],
      approval_status: null
    });
  }

  function saveLoopState(projectId, state) {
    writeJson(loopStatePath(projectId), { ...state, last_updated_at: nowIso() });
  }

  async function runDocBuildLoop(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const projectState = readJsonSafe(statePath, null);

    if (!projectState) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    if (projectState.requirement_completeness !== true) {
      return { ok: false, mode: "BLOCKED", reason: "DISCOVERY_NOT_COMPLETE", blocking_message: "يجب اكتمال اكتشاف المتطلبات قبل بناء الوثائق" };
    }

    const maxIterations = Number(body.max_iterations || 3);
    let loopState = loadLoopState(projectId);
    loopState.max_iterations = maxIterations;

    if (loopState.iterations >= maxIterations) {
      return { ok: false, mode: "LOOP_EXHAUSTED", reason: "MAX_ITERATIONS_REACHED", iterations: loopState.iterations };
    }

    loopState.iterations += 1;
    loopState.status = "IN_PROGRESS";
    const stagesCompleted = [];
    const issues = [];

    // Stage 1: DRAFT
    if (!loopState.stages_completed.includes("DRAFT")) {
      const draftPath = path.join(projectsRoot, projectId, "ai_os", "documentation", "draft.md");
      let draftContent = "";
      if (!fs.existsSync(draftPath)) {
        const docProv = new OpenAiDocumentationProvider();
        const optionsLogPath = path.join(projectsRoot, projectId, "ai_os", "options_log.json");
        const optionsLog = readJsonSafe(optionsLogPath, []);
        const latestOptions = optionsLog.filter((e) => Array.isArray(e.options));
        const latestOption = latestOptions.length > 0 ? latestOptions[latestOptions.length - 1].options[0] : null;
        const provResult = await docProv.executeTask({
          task_id: `doc_draft_${Date.now()}`,
          context: { domain: String(projectState.requirement_domain || ""), user_goal: String(projectState.user_goal || ""), requirement_model: projectState.requirement_model || {}, selected_option: latestOption || {} }
        });
        if (provResult.status === "SUCCESS" && provResult.output?.content) {
          draftContent = provResult.output.content;
          ensureDir(path.dirname(draftPath));
          fs.writeFileSync(draftPath, draftContent, "utf-8");
        } else {
          return { ok: false, mode: "BLOCKED", reason: "DRAFT_GENERATION_FAILED" };
        }
      } else {
        draftContent = fs.readFileSync(draftPath, "utf-8");
      }
      stagesCompleted.push("DRAFT");
    }

    // Stage 2-4: SELF_REVIEW + CONTRADICTION + AMBIGUITY (via review provider)
    const reviewableStages = ["SELF_REVIEW", "CONTRADICTION_DETECTION", "AMBIGUITY_DETECTION"];
    const pendingReview = reviewableStages.filter((s) => !loopState.stages_completed.includes(s));

    if (pendingReview.length > 0) {
      const draftPath = path.join(projectsRoot, projectId, "ai_os", "documentation", "draft.md");
      const draftContent = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, "utf-8") : "";
      const reviewProv = new DocumentationReviewProvider();
      const reviewResult = await reviewProv.executeTask({
        task_id: `doc_review_${Date.now()}`,
        context: { domain: String(projectState.requirement_domain || ""), user_goal: String(projectState.user_goal || ""), requirement_model: projectState.requirement_model || {}, selected_option: "", documentation_content: draftContent }
      });

      if (reviewResult.status === "SUCCESS" && reviewResult.output) {
        const review = reviewResult.output;
        issues.push(...(review.issues || []));
        stagesCompleted.push(...pendingReview);

        const reviewLogPath = path.join(projectsRoot, projectId, "ai_os", "doc_build_review_log.json");
        const reviewLog = readJsonSafe(reviewLogPath, []);
        reviewLog.push({ iteration: loopState.iterations, review, reviewed_at: nowIso() });
        writeJson(reviewLogPath, reviewLog);

        if (review.quality_gate?.passed === true || review.execution_ready === true) {
          stagesCompleted.push("USER_REVIEW", "REVISION", "APPROVAL");
          loopState.approval_status = "APPROVED";
        }
      } else {
        stagesCompleted.push(...pendingReview);
      }
    }

    // Stage 5-7: USER_REVIEW, REVISION, APPROVAL (if not auto-approved)
    if (!stagesCompleted.includes("APPROVAL")) {
      if (body.user_approved === true) {
        stagesCompleted.push("USER_REVIEW", "REVISION", "APPROVAL");
        loopState.approval_status = "APPROVED";
      }
    }

    loopState.stages_completed = [...new Set([...loopState.stages_completed, ...stagesCompleted])];
    loopState.issues_found = [...(loopState.issues_found || []), ...issues];
    const allStagesDone = STAGES.every((s) => loopState.stages_completed.includes(s));
    loopState.status = allStagesDone ? "COMPLETE" : "IN_PROGRESS";
    saveLoopState(projectId, loopState);

    // Write the loop report artifact
    const reportPath = path.join(projectsRoot, projectId, "ai_os", "documentation", "docs_build_loop_report.md");
    const reportLines = [
      "# Documentation Build Loop Report",
      `- project_id: ${projectId}`,
      `- iterations: ${loopState.iterations}`,
      `- stages_completed: ${loopState.stages_completed.join(", ")}`,
      `- status: ${loopState.status}`,
      `- approval_status: ${loopState.approval_status || "PENDING"}`,
      `- issues_found: ${loopState.issues_found.length}`,
      `- generated_at: ${nowIso()}`
    ];
    ensureDir(path.dirname(reportPath));
    fs.writeFileSync(reportPath, reportLines.join("\n"), "utf-8");

    return {
      ok: allStagesDone,
      mode: allStagesDone ? "DOCUMENTATION_BUILD_COMPLETE" : "DOCUMENTATION_BUILD_IN_PROGRESS",
      stages_completed: loopState.stages_completed,
      stages_remaining: STAGES.filter((s) => !loopState.stages_completed.includes(s)),
      issues_found: issues.length,
      iterations: loopState.iterations,
      approval_status: loopState.approval_status || "PENDING",
      project_id: projectId
    };
  }

  function getLoopState(projectId) {
    return loadLoopState(normalizeProjectId(projectId));
  }

  function assertDocumentationBuildComplete(projectId) {
    const state = loadLoopState(normalizeProjectId(projectId));
    const allDone = STAGES.every((s) => state.stages_completed.includes(s));
    if (!allDone) {
      const missing = STAGES.filter((s) => !state.stages_completed.includes(s));
      return { ok: false, mode: "BLOCKED", reason: "DOC_BUILD_INCOMPLETE", missing_stages: missing };
    }
    return { ok: true, approval_status: state.approval_status };
  }

  return { runDocBuildLoop, getLoopState, assertDocumentationBuildComplete, STAGES };
}

module.exports = { createDocumentationBuildLoop, STAGES };

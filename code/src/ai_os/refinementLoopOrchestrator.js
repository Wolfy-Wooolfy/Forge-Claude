"use strict";

const fs   = require("fs");
const path = require("path");
const IdeationExpansionProvider  = require("../providers/ideationExpansionProvider");
const DocumentationReviewProvider = require("../providers/documentationReviewProvider");
const OpenAiDocumentationProvider = require("../providers/openAiDocumentationProvider");
const { getDefaultRegistry }      = require("../runtime/tools/_registry");

const DEFAULT_MAX_ITERATIONS = 5;

function createRefinementLoopOrchestrator(options = {}) {
  const root         = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch (_) { return fallback; }
  }
  async function writeJson(filePath, payload) {
    const reg     = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r       = await reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(payload, null, 2) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " + (r.metadata && r.metadata.reason));
    }
  }
  async function writeFile(filePath, content) {
    const reg     = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r       = await reg.invoke("fs.write_file", { path: relPath, content: String(content) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeFile failed [" + relPath + "]: " + (r.metadata && r.metadata.reason));
    }
  }
  async function tryWriteJson(filePath, payload, label) {
    try { await writeJson(filePath, payload); }
    catch (err) { console.warn("[refinementLoopOrchestrator] " + label + " write skipped: " + err.message); }
  }
  async function tryWriteFile(filePath, content, label) {
    try { await writeFile(filePath, content); }
    catch (err) { console.warn("[refinementLoopOrchestrator] " + label + " write skipped: " + err.message); }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function aiOsRoot(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os");
  }

  function detectLoopExhaustion(log, maxIterations) {
    return Array.isArray(log) && log.length >= maxIterations;
  }

  async function runIdeationLoop(body = {}) {
    const projectId      = normalizeProjectId(body.project_id || "");
    const maxIterations  = Number(body.max_iterations || DEFAULT_MAX_ITERATIONS);

    const statePath  = path.join(projectsRoot, projectId, "project_state.json");
    const state      = readJsonSafe(statePath, null);
    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const ideationLogPath = path.join(aiOsRoot(projectId), "ideation_log.json");
    const ideationLog     = readJsonSafe(ideationLogPath, []);

    if (detectLoopExhaustion(ideationLog, maxIterations)) {
      return {
        ok:                  true,
        mode:                "LOOP_EXHAUSTED",
        reason:              "MAX_ITERATIONS_REACHED",
        iterations_completed: ideationLog.length,
        max_iterations:      maxIterations,
        last_expansion:      ideationLog.length > 0 ? (ideationLog[ideationLog.length - 1].expansion || null) : null,
        project_id:          projectId
      };
    }

    const histPath          = path.join(projectsRoot, projectId, "ai_os", "conversation_context.json");
    const rawHistory        = readJsonSafe(histPath, []);
    const conversationHistory = Array.isArray(rawHistory) ? rawHistory.slice(-20) : [];

    const provider           = new IdeationExpansionProvider();
    const iterations         = [];
    let readyForOptions      = false;
    let lastExpansion        = null;
    let lastFollowUpQuestion = "";
    let lastSuggestedAnswers = [];

    const existingExpansions = ideationLog.filter((e) => e.entry_type === "IDEA_EXPANSION");
    let refinementInput      = String(body.refinement_input || body.message || "");

    for (let i = 0; i < maxIterations; i++) {
      const currentLog = readJsonSafe(ideationLogPath, []);
      if (detectLoopExhaustion(currentLog, maxIterations)) break;

      const providerResult = await provider.executeTask({
        task_id: `ideation_loop_${i}_${Date.now()}`,
        context: {
          domain:               String(state.requirement_domain || ""),
          user_goal:            String(state.user_goal || ""),
          requirement_model:    state.requirement_model || {},
          refinement_input:     refinementInput,
          iteration:            i + 1,
          prior_expansions:     existingExpansions.length + i,
          conversation_history: conversationHistory
        }
      });

      if (providerResult.status !== "SUCCESS" || !providerResult.output) {
        iterations.push({ iteration: i + 1, status: "FAILED", reason: (providerResult.metadata && providerResult.metadata.reason) || "PROVIDER_FAILED" });
        break;
      }

      const expansion      = providerResult.output;
      lastExpansion        = expansion;
      lastFollowUpQuestion = expansion.follow_up_question || "";
      lastSuggestedAnswers = Array.isArray(expansion.suggested_answers) ? expansion.suggested_answers : [];
      readyForOptions      = expansion.readiness_assessment && expansion.readiness_assessment.ready_for_options === true;

      const logEntry = {
        entry_type:       "IDEA_EXPANSION",
        iteration:        existingExpansions.length + i + 1,
        refinement_input: refinementInput,
        expansion,
        created_at:       nowIso()
      };

      const updatedLog = readJsonSafe(ideationLogPath, []);
      updatedLog.push(logEntry);
      await tryWriteJson(ideationLogPath, updatedLog, "ideation log");

      iterations.push({
        iteration:         i + 1,
        status:            "COMPLETED",
        ready_for_options: readyForOptions,
        follow_up_question: lastFollowUpQuestion
      });

      if (readyForOptions || body.single_pass) break;

      refinementInput = lastFollowUpQuestion || "";
      if (!refinementInput) break;
    }

    return {
      ok:                  true,
      mode:                readyForOptions ? "READY_FOR_OPTIONS" : "IDEATION_IN_PROGRESS",
      iterations_completed: iterations.length,
      max_iterations:      maxIterations,
      ready_for_options:   readyForOptions,
      last_expansion:      lastExpansion,
      follow_up_question:  lastFollowUpQuestion,
      suggested_answers:   lastSuggestedAnswers,
      loop_summary:        iterations,
      project_id:          projectId
    };
  }

  async function runDocumentationLoop(body = {}) {
    const projectId     = normalizeProjectId(body.project_id || "");
    const maxIterations = Number(body.max_iterations || 3);

    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state     = readJsonSafe(statePath, null);
    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const draftPath = path.join(projectsRoot, projectId, "ai_os", "documentation", "draft.md");
    if (!fs.existsSync(draftPath)) {
      return { ok: false, mode: "BLOCKED", reason: "NO_DOCUMENTATION_DRAFT" };
    }

    const reviewLogPath = path.join(aiOsRoot(projectId), "documentation_review_log.json");
    const reviewLog     = readJsonSafe(reviewLogPath, []);

    if (detectLoopExhaustion(reviewLog, maxIterations)) {
      return {
        ok:                  true,
        mode:                "LOOP_EXHAUSTED",
        reason:              "MAX_ITERATIONS_REACHED",
        iterations_completed: reviewLog.length,
        max_iterations:      maxIterations,
        last_review:         reviewLog.length > 0 ? (reviewLog[reviewLog.length - 1].review || null) : null,
        project_id:          projectId
      };
    }

    const reviewProvider = new DocumentationReviewProvider();
    const docProvider    = new OpenAiDocumentationProvider();
    const iterations     = [];
    let qualityPassed    = false;
    let lastReview       = null;

    for (let i = 0; i < maxIterations; i++) {
      const currentReviewLog = readJsonSafe(reviewLogPath, []);
      if (detectLoopExhaustion(currentReviewLog, maxIterations)) break;

      const draftContent = fs.readFileSync(draftPath, "utf8");

      const reviewResult = await reviewProvider.executeTask({
        task_id: `doc_review_loop_${i}_${Date.now()}`,
        context: {
          domain:               String(state.requirement_domain || ""),
          user_goal:            String(state.user_goal || ""),
          requirement_model:    state.requirement_model || {},
          selected_option:      state.selected_option_id || "",
          documentation_content: draftContent,
          iteration:            i + 1
        }
      });

      if (reviewResult.status !== "SUCCESS" || !reviewResult.output) {
        iterations.push({ iteration: i + 1, step: "REVIEW", status: "FAILED" });
        break;
      }

      lastReview   = reviewResult.output;
      qualityPassed = (lastReview.quality_gate && lastReview.quality_gate.passed === true) || lastReview.execution_ready === true;

      const reviewLogEntry = {
        entry_type:     "DOC_REVIEW",
        iteration:      currentReviewLog.length + 1,
        review:         lastReview,
        quality_passed: qualityPassed,
        created_at:     nowIso()
      };

      const updatedLog = readJsonSafe(reviewLogPath, []);
      updatedLog.push(reviewLogEntry);
      await tryWriteJson(reviewLogPath, updatedLog, "review log");

      iterations.push({
        iteration:     i + 1,
        step:          "REVIEW",
        status:        "COMPLETED",
        quality_passed: qualityPassed,
        score:         (lastReview.quality_gate && lastReview.quality_gate.score) || 0,
        issues_count:  (lastReview.issues || []).length
      });

      if (qualityPassed) break;

      const hasIssues = (lastReview.issues && lastReview.issues.length > 0) ||
                        (lastReview.missing_sections && lastReview.missing_sections.length > 0);
      if (hasIssues) {
        const docResult = await docProvider.executeTask({
          task_id: `doc_regen_loop_${i}_${Date.now()}`,
          context: {
            domain:            String(state.requirement_domain || ""),
            user_goal:         String(state.user_goal || ""),
            requirement_model: state.requirement_model || {},
            selected_option:   state.selected_option_id || "",
            refinement_notes:  JSON.stringify({
              review_issues:    lastReview.issues || [],
              missing_sections: lastReview.missing_sections || [],
              suggestions:      lastReview.suggestions || []
            })
          }
        });

        if (docResult.status === "SUCCESS" && docResult.output && docResult.output.content) {
          await tryWriteFile(draftPath, docResult.output.content, "documentation draft");

          const updatedState = readJsonSafe(statePath, state);
          updatedState.documentation_draft = true;
          updatedState.last_updated_at     = nowIso();
          try {
            await writeJson(statePath, updatedState);
          } catch (err) {
            return { ok: false, mode: "BLOCKED", reason: "STATE_PERSIST_FAILED" };
          }

          iterations.push({ iteration: i + 1, step: "REGENERATE", status: "COMPLETED" });
        } else {
          iterations.push({ iteration: i + 1, step: "REGENERATE", status: "FAILED" });
          break;
        }
      }
    }

    return {
      ok:                  true,
      mode:                qualityPassed ? "DOCUMENTATION_APPROVED" : "DOCUMENTATION_NEEDS_WORK",
      iterations_completed: iterations.length,
      max_iterations:      maxIterations,
      quality_passed:      qualityPassed,
      last_review:         lastReview,
      loop_summary:        iterations,
      project_id:          projectId
    };
  }

  return {
    runIdeationLoop,
    runDocumentationLoop,
    detectLoopExhaustion
  };
}

module.exports = { createRefinementLoopOrchestrator };

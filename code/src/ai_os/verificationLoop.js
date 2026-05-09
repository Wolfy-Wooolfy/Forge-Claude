"use strict";

const fs   = require("fs");
const path = require("path");
const DocumentationReviewProvider = require("../providers/documentationReviewProvider");
const { getDefaultRegistry }      = require("../runtime/tools/_registry");

const REQUIRED_DOC_SECTIONS = [
  "overview", "goal", "requirement", "option", "scope", "plan"
];

function createVerificationLoop(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch (err) { return fallback; }
  }
  async function writeJson(filePath, payload) {
    const reg     = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r       = await reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(payload, null, 2) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " + (r.metadata && r.metadata.reason));
    }
  }
  async function tryWriteJson(filePath, payload, label) {
    try { await writeJson(filePath, payload); }
    catch (err) { console.warn("[verificationLoop] " + label + " write skipped: " + err.message); }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function aiOsRoot(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os");
  }

  function level1StructuralCheck(documentationContent, state) {
    const issues = [];

    if (!documentationContent || !documentationContent.trim()) {
      issues.push({ level: 1, type: "MISSING_CONTENT", severity: "HIGH", description: "Documentation draft is empty." });
      return { passed: false, issues };
    }

    const lowerContent = documentationContent.toLowerCase();
    REQUIRED_DOC_SECTIONS.forEach((keyword) => {
      if (!lowerContent.includes(keyword)) {
        issues.push({ level: 1, type: "MISSING_SECTION", severity: "MEDIUM", description: `Documentation may be missing a section covering: ${keyword}` });
      }
    });

    if (!state.user_goal) {
      issues.push({ level: 1, type: "MISSING_FIELD", severity: "HIGH", description: "project state is missing user_goal" });
    }
    if (!state.requirement_model || Object.keys(state.requirement_model).length === 0) {
      issues.push({ level: 1, type: "MISSING_FIELD", severity: "HIGH", description: "requirement_model is empty" });
    }
    if (!Array.isArray(state.accepted_options) || state.accepted_options.length === 0) {
      issues.push({ level: 1, type: "MISSING_DECISION", severity: "HIGH", description: "No option has been accepted yet" });
    }

    const highIssues = issues.filter((i) => i.severity === "HIGH");
    return { passed: highIssues.length === 0, issues };
  }

  async function level2LogicalCheck(documentationContent, state) {
    const provider = new DocumentationReviewProvider();
    const providerResult = await provider.executeTask({
      task_id: `verification_l2_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || ""),
        user_goal: String(state.user_goal || ""),
        documentation_content: documentationContent
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        passed: false,
        issues: [{ level: 2, type: "PROVIDER_FAILED", severity: "HIGH", description: "Logical verification provider unavailable." }],
        provider_result: null
      };
    }

    const review = providerResult.output;
    const highIssues = (review.issues || []).filter((i) => i.severity === "HIGH");

    return {
      passed: review.quality_gate && review.quality_gate.passed === true,
      score: review.quality_gate ? review.quality_gate.score : 0,
      issues: (review.issues || []).map((i) => ({ ...i, level: 2 })),
      suggestions: review.suggestions || [],
      missing_sections: review.missing_sections || [],
      overall_assessment: review.overall_assessment || ""
    };
  }

  function level3FunctionalCheck(state) {
    const issues = [];

    if (state.requirement_completeness !== true) {
      issues.push({ level: 3, type: "INCOMPLETE_REQUIREMENTS", severity: "HIGH", description: "Requirements not marked as complete by provider." });
    }

    const openQuestions = Array.isArray(state.open_questions) ? state.open_questions : [];
    if (openQuestions.length > 0) {
      issues.push({ level: 3, type: "OPEN_QUESTIONS_REMAIN", severity: "HIGH", description: `${openQuestions.length} open question(s) not yet answered.` });
    }

    return { passed: issues.length === 0, issues };
  }

  function level4ExecutionReadinessCheck(state) {
    const issues = [];

    if (state.documentation_state !== "DRAFT_READY" && state.documentation_state !== "DOCS_APPROVED") {
      issues.push({ level: 4, type: "DOCUMENTATION_NOT_READY", severity: "HIGH", description: "Documentation is not in DRAFT_READY or DOCS_APPROVED state." });
    }

    if (!Array.isArray(state.accepted_options) || state.accepted_options.length === 0) {
      issues.push({ level: 4, type: "NO_ACCEPTED_OPTION", severity: "HIGH", description: "No option has been accepted." });
    }

    return { passed: issues.length === 0, issues };
  }

  async function attemptSelfCorrection(projectId, state, l1Issues, l2Issues) {
    const corrections = [];

    // Auto-correct: set documentation_state to DRAFT_READY if draft exists
    if (l1Issues.some((i) => i.type === "MISSING_FIELD" && i.description.includes("user_goal"))) {
      corrections.push({ type: "CANNOT_AUTOCORRECT", field: "user_goal", note: "Requires user input" });
    }

    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    let mutated = false;

    const draftPath = path.join(aiOsRoot(projectId), "documentation", "draft.md");
    if (fs.existsSync(draftPath) && state.documentation_state !== "DRAFT_READY" && state.documentation_state !== "DOCS_APPROVED") {
      state.documentation_state = "DRAFT_READY";
      corrections.push({ type: "AUTO_CORRECTED", field: "documentation_state", new_value: "DRAFT_READY" });
      mutated = true;
    }

    if (mutated) {
      await writeJson(statePath, { ...state, last_updated_at: nowIso() });
    }

    return corrections;
  }

  async function runVerification(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    let state = readJsonSafe(statePath, null);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const draftPath = path.join(aiOsRoot(projectId), "documentation", "draft.md");
    const documentationContent = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, "utf8") : "";

    const l1 = level1StructuralCheck(documentationContent, state);
    let l2 = { passed: false, issues: [], suggestions: [], overall_assessment: "" };
    if (l1.passed) {
      l2 = await level2LogicalCheck(documentationContent, state);
    }

    const selfCorrectionLog = [];
    const maxSelfCorrections = 1;

    // Self-correction pass: attempt to fix auto-correctable issues before escalating
    if ((!l1.passed || !l2.passed) && selfCorrectionLog.length < maxSelfCorrections) {
      const corrections = await attemptSelfCorrection(projectId, state, l1.issues, l2.issues);
      if (corrections.length > 0) {
        selfCorrectionLog.push({ attempt: 1, corrections, attempted_at: nowIso() });
        // Reload state and re-run structural check after corrections
        state = readJsonSafe(statePath, state);
        const l1Retry = level1StructuralCheck(documentationContent, state);
        if (l1Retry.passed && !l1.passed) {
          l1.passed = l1Retry.passed;
          l1.issues = l1Retry.issues;
          if (l1Retry.passed) {
            l2 = await level2LogicalCheck(documentationContent, state);
          }
        }
      }
    }

    const l3 = level3FunctionalCheck(state);
    const l4 = level4ExecutionReadinessCheck(state);

    const allIssues = [...l1.issues, ...l2.issues, ...l3.issues, ...l4.issues];
    const highIssues = allIssues.filter((i) => i.severity === "HIGH");
    const allPassed = l1.passed && l2.passed && l3.passed && l4.passed;

    const result = {
      ok: true,
      project_id: projectId,
      verification_passed: allPassed,
      levels: {
        level_1_structural: { passed: l1.passed, issues: l1.issues },
        level_2_logical: { passed: l2.passed, issues: l2.issues, score: l2.score, suggestions: l2.suggestions },
        level_3_functional: { passed: l3.passed, issues: l3.issues },
        level_4_execution_ready: { passed: l4.passed, issues: l4.issues }
      },
      self_correction_log: selfCorrectionLog,
      all_issues: allIssues,
      blocking_issues: highIssues,
      verified_at: nowIso()
    };

    const verifyPath = path.join(aiOsRoot(projectId), "verification_result.json");
    await tryWriteJson(verifyPath, result, "verification result");

    return result;
  }

  return { runVerification };
}

module.exports = { createVerificationLoop };

"use strict";

const fs   = require("fs");
const path = require("path");
const ProjectReviewProvider  = require("../providers/projectReviewProvider");
const { getDefaultRegistry } = require("../runtime/tools/_registry");

function createProjectReviewEngine(options = {}) {
  const root         = path.resolve(options.root || process.cwd());
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
    catch (err) { console.warn("[projectReviewEngine] " + label + " write skipped: " + err.message); }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function aiOsRoot(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os");
  }

  function gatherProjectContent(projectId) {
    const id = normalizeProjectId(projectId);
    const projectRoot = path.join(projectsRoot, id);
    const contentParts = [];

    const statePath = path.join(projectRoot, "project_state.json");
    const state = readJsonSafe(statePath, null);
    if (state) {
      contentParts.push("=== PROJECT STATE ===\n" + JSON.stringify(state, null, 2));
    }

    const draftPath = path.join(projectRoot, "ai_os", "documentation", "draft.md");
    if (fs.existsSync(draftPath)) {
      contentParts.push("=== DOCUMENTATION DRAFT ===\n" + fs.readFileSync(draftPath, "utf8"));
    }

    const outputRoot = path.join(projectRoot, "output");
    if (fs.existsSync(outputRoot)) {
      try {
        fs.readdirSync(outputRoot).forEach((file) => {
          const filePath = path.join(outputRoot, file);
          try {
            const content = fs.readFileSync(filePath, "utf8");
            contentParts.push(`=== FILE: ${file} ===\n${content.slice(0, 3000)}`);
          } catch (err) {
            // skip unreadable files
          }
        });
      } catch (err) {
        // output dir not accessible
      }
    }

    return contentParts.join("\n\n");
  }

  async function reviewProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const reviewGoal = String(body.review_goal || body.question || "");

    let projectContent = String(body.project_content || "").trim();

    if (!projectContent && projectId) {
      projectContent = gatherProjectContent(projectId);
    }

    if (!projectContent) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "NO_PROJECT_CONTENT",
        blocking_question: "لا يوجد محتوى للمراجعة. أرسل project_content أو project_id صحيح."
      };
    }

    const statePath = projectId ? path.join(projectsRoot, projectId, "project_state.json") : null;
    const state = statePath ? readJsonSafe(statePath, {}) : {};

    const provider = new ProjectReviewProvider();
    const providerResult = await provider.executeTask({
      task_id: `project_review_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || body.domain || ""),
        user_goal: String(state.user_goal || body.user_goal || ""),
        review_goal: reviewGoal,
        project_content: projectContent
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "PROJECT_REVIEW_PROVIDER_FAILED",
        blocking_question: "فشلت المراجعة. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const review = providerResult.output;

    if (projectId) {
      const reviewPath = path.join(aiOsRoot(projectId), "project_review_report.json");
      await tryWriteJson(reviewPath, { review, reviewed_at: nowIso(), review_goal: reviewGoal }, "project review report");
    }

    return {
      ok: true,
      mode: "REVIEW_COMPLETE",
      review,
      project_id: projectId || null
    };
  }

  return { reviewProject };
}

module.exports = { createProjectReviewEngine };

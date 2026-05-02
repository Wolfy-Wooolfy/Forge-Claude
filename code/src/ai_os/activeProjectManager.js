"use strict";

const fs = require("fs");
const path = require("path");

function createActiveProjectManager(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");
  const activeProjectPath = path.resolve(projectsRoot, "active_project.json");
  const projectRegistryPath = path.resolve(projectsRoot, "project_registry.json");

  function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  function readJsonSafe(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeProjectId(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function getActiveProject() {
    return readJsonSafe(activeProjectPath, null);
  }

  function setActiveProject(projectId) {
    const id = normalizeProjectId(projectId);
    if (!id) {
      return { ok: false, reason: "INVALID_PROJECT_ID" };
    }

    const projectStatePath = path.resolve(projectsRoot, id, "project_state.json");
    if (!fs.existsSync(projectStatePath)) {
      return { ok: false, reason: "PROJECT_NOT_FOUND", project_id: id };
    }

    const payload = { active_project_id: id, activated_at: nowIso() };
    writeJson(activeProjectPath, payload);
    return { ok: true, active_project_id: id };
  }

  function clearActiveProject() {
    if (fs.existsSync(activeProjectPath)) {
      fs.unlinkSync(activeProjectPath);
    }
    return { ok: true };
  }

  function switchProject(toProjectId) {
    const previous = getActiveProject();
    const result = setActiveProject(toProjectId);
    if (!result.ok) return result;
    return {
      ok: true,
      previous_project_id: previous ? previous.active_project_id : null,
      active_project_id: result.active_project_id,
      switched_at: nowIso()
    };
  }

  function listProjects() {
    const registry = readJsonSafe(projectRegistryPath, { projects: [] });
    const projects = Array.isArray(registry.projects) ? registry.projects : [];

    const discovered = [];
    if (fs.existsSync(projectsRoot)) {
      try {
        fs.readdirSync(projectsRoot).forEach((entry) => {
          const statePath = path.join(projectsRoot, entry, "project_state.json");
          if (fs.existsSync(statePath)) {
            const state = readJsonSafe(statePath, null);
            if (state && typeof state.project_id === "string") {
              discovered.push({
                project_id: state.project_id,
                project_name: state.project_name || state.project_id,
                current_phase: state.current_phase || "UNKNOWN",
                active_runtime_state: state.active_runtime_state || "UNKNOWN",
                last_updated_at: state.last_updated_at || ""
              });
            }
          }
        });
      } catch (err) {
        // directory scan failed — return registry only
      }
    }

    const seenIds = new Set(projects.map((p) => p.project_id));
    discovered.forEach((p) => {
      if (!seenIds.has(p.project_id)) {
        projects.push(p);
      }
    });

    const active = getActiveProject();
    return {
      ok: true,
      active_project_id: active ? active.active_project_id : null,
      projects
    };
  }

  function registerProject(projectId, projectName) {
    const id = normalizeProjectId(projectId);
    const registry = readJsonSafe(projectRegistryPath, { projects: [] });
    const projects = Array.isArray(registry.projects) ? registry.projects : [];

    const existing = projects.findIndex((p) => p.project_id === id);
    const entry = {
      project_id: id,
      project_name: String(projectName || id),
      registered_at: nowIso()
    };

    if (existing >= 0) {
      projects[existing] = { ...projects[existing], ...entry };
    } else {
      projects.push(entry);
    }

    writeJson(projectRegistryPath, { projects });
    return { ok: true, project_id: id };
  }

  function getProjectContext(projectId) {
    const id = normalizeProjectId(projectId);
    const projectRoot = path.resolve(projectsRoot, id);
    const statePath = path.join(projectRoot, "project_state.json");
    const aiOsRoot = path.join(projectRoot, "ai_os");

    const state = readJsonSafe(statePath, null);
    if (!state) {
      return { ok: false, reason: "PROJECT_NOT_FOUND", project_id: id };
    }

    const conversationLog = readJsonSafe(path.join(aiOsRoot, "conversation_log.json"), []);
    const ideationLog = readJsonSafe(path.join(aiOsRoot, "ideation_log.json"), []);
    const decisionsLog = readJsonSafe(path.join(aiOsRoot, "decisions_log.json"), []);
    const optionsLog = readJsonSafe(path.join(aiOsRoot, "options_log.json"), []);

    const draftPath = path.join(aiOsRoot, "documentation", "draft.md");
    const documentationDraft = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, "utf8") : null;

    return {
      ok: true,
      project_id: id,
      state,
      conversation_log: Array.isArray(conversationLog) ? conversationLog : [],
      ideation_log: Array.isArray(ideationLog) ? ideationLog : [],
      decisions_log: Array.isArray(decisionsLog) ? decisionsLog : [],
      options_log: Array.isArray(optionsLog) ? optionsLog : [],
      documentation_draft: documentationDraft
    };
  }

  // H-6: Project Object Fields — validate mandatory fields per docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md
  const REQUIRED_PROJECT_FIELDS = [
    "project_id", "project_name", "user_goal", "current_phase",
    "documentation_state", "open_questions", "accepted_options",
    "requirement_model", "last_updated_at"
  ];

  const DEFAULT_PROJECT_FIELD_VALUES = {
    memory_state: {},
    version_registry: [],
    artifact_registry: [],
    conversation_history: [],
    decision_history: [],
    pending_decisions: [],
    review_cycles_count: 0,
    active_project_flag: true
  };

  function ensureProjectObjectModel(projectId) {
    const id = normalizeProjectId(projectId);
    const statePath = path.join(projectsRoot, id, "project_state.json");
    const state = readJsonSafe(statePath, null);
    if (!state) return { ok: false, reason: "PROJECT_NOT_FOUND" };

    let mutated = false;
    const updated = { ...state };

    // Inject missing optional fields with defaults
    for (const [field, defaultVal] of Object.entries(DEFAULT_PROJECT_FIELD_VALUES)) {
      if (updated[field] === undefined) {
        updated[field] = defaultVal;
        mutated = true;
      }
    }

    if (mutated) {
      updated.last_updated_at = new Date().toISOString();
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(updated, null, 2), "utf-8");
    }

    const missingRequired = REQUIRED_PROJECT_FIELDS.filter((f) => updated[f] === undefined || updated[f] === null);
    return {
      ok: missingRequired.length === 0,
      project_id: id,
      missing_required_fields: missingRequired,
      fields_populated: mutated ? Object.keys(DEFAULT_PROJECT_FIELD_VALUES) : []
    };
  }

  function readJsonSafe(p, fallback) {
    try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
    catch (_) { return fallback; }
  }

  return {
    getActiveProject,
    setActiveProject,
    clearActiveProject,
    switchProject,
    listProjects,
    registerProject,
    getProjectContext,
    ensureProjectObjectModel,
    REQUIRED_PROJECT_FIELDS
  };
}

module.exports = { createActiveProjectManager };

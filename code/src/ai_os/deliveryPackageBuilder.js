"use strict";

const fs = require("fs");
const path = require("path");

function createDeliveryPackageBuilder(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch (err) { return fallback; }
  }
  function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function buildRunbook(state, outputFiles) {
    const projectName = String(state.project_name || "Project");
    const domain = String(state.requirement_domain || "");
    const files = Array.isArray(outputFiles) ? outputFiles : [];

    const lines = [
      `# ${projectName} — Runbook`,
      "",
      "## Setup Instructions",
      "",
      "No installation required for this project.",
      "",
      "## How to Run",
      ""
    ];

    const hasHtml = files.some((f) => String(f.path || f).endsWith(".html"));
    const hasJs = files.some((f) => String(f.path || f).endsWith(".js"));
    const hasNode = files.some((f) => String(f.path || f).endsWith(".js") && !String(f.path || f).includes("game"));

    if (hasHtml) {
      lines.push("1. Open `index.html` in any modern web browser.");
      lines.push("2. The application will start immediately.");
    } else if (hasNode) {
      lines.push("1. Install Node.js (version 18 or higher).");
      lines.push("2. Run: `node index.js`");
    } else {
      lines.push("1. Open the main file in the appropriate runtime environment.");
    }

    lines.push("");
    lines.push("## Project Files");
    files.forEach((f) => {
      const filePath = String(f.path || f);
      lines.push(`- \`${filePath}\``);
    });

    lines.push("");
    lines.push("## Limitations (MVP)");
    lines.push("- This is an MVP — not all features are implemented.");
    lines.push("- No persistent data storage unless specified.");
    lines.push("- Tested on modern browsers (Chrome, Firefox, Safari).");

    lines.push("");
    lines.push("## Open Items");
    lines.push("- Review and test all functionality before production use.");
    lines.push("- Contact the project owner for feature extensions.");

    return lines.join("\n");
  }

  async function buildDeliveryPackage(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state = readJsonSafe(statePath, null);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const executionAllowed = [
      "EXECUTION_HANDOFF_CREATED",
      "EXECUTION_READY"
    ].includes(state.active_runtime_state) || state.execution_state === "PENDING_FORGE" || state.execution_state === "COMPLETE";

    if (!executionAllowed && !body.force) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "EXECUTION_NOT_COMPLETE",
        blocking_question: "لا يمكن بناء حزمة التسليم حتى يكتمل التنفيذ أو يتم إنشاء handoff."
      };
    }

    const outputRoot = path.join(projectsRoot, projectId, "output");
    const outputFiles = [];

    if (fs.existsSync(outputRoot)) {
      try {
        fs.readdirSync(outputRoot).forEach((file) => {
          outputFiles.push({ path: `artifacts/projects/${projectId}/output/${file}`, name: file });
        });
      } catch (err) {
        // output dir not accessible
      }
    }

    const packageArtifacts = Array.isArray(body.artifacts) ? body.artifacts : outputFiles;

    const runbook = buildRunbook(state, packageArtifacts);

    const deliveryDir = path.join(projectsRoot, projectId, "delivery");
    const runbookPath = path.join(deliveryDir, "RUNBOOK.md");
    const packagePath = path.join(deliveryDir, "delivery_package.json");

    ensureDir(deliveryDir);
    fs.writeFileSync(runbookPath, runbook, "utf8");

    const deliveryPackage = {
      project_id: projectId,
      project_name: state.project_name || projectId,
      domain: state.requirement_domain || "",
      delivery_status: "READY",
      created_at: nowIso(),
      artifacts: packageArtifacts,
      runbook_path: `artifacts/projects/${projectId}/delivery/RUNBOOK.md`,
      limitations: [
        "MVP implementation",
        "Not production-hardened",
        "Requires review before production use"
      ],
      setup_instructions: "Open index.html in a web browser, or follow RUNBOOK.md",
      contact: String(body.contact || "Project Owner")
    };

    writeJson(packagePath, deliveryPackage);

    const updatedState = { ...state, delivery_state: "DELIVERED", last_updated_at: nowIso() };
    writeJson(statePath, updatedState);

    return {
      ok: true,
      mode: "DELIVERY_PACKAGE_READY",
      delivery_package_path: `artifacts/projects/${projectId}/delivery/delivery_package.json`,
      runbook_path: `artifacts/projects/${projectId}/delivery/RUNBOOK.md`,
      artifacts: packageArtifacts,
      project_id: projectId
    };
  }

  return { buildDeliveryPackage };
}

module.exports = { createDeliveryPackageBuilder };

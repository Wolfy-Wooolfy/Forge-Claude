"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed } = require("./_contract");
const { getAdapter, getAdapters, getWarnings } = require("../pkg/_adapter_registry");

// ── Lock file map ─────────────────────────────────────────────────────────────

const LOCK_FILES = [
  { file: "package-lock.json", adapter_id: "npm" },
  { file: "yarn.lock",         adapter_id: "yarn_global" },
  { file: "Pipfile.lock",      adapter_id: "pip" },
  { file: "Cargo.lock",        adapter_id: "cargo" },
  { file: "go.sum",            adapter_id: "go" },
  { file: "Gemfile.lock",      adapter_id: "gem" },
  { file: "composer.lock",     adapter_id: "composer" }
];

// ── Internal: build adapter context ──────────────────────────────────────────

function _adapterCtx(input, ctx) {
  return Object.assign({}, ctx, {
    project_id:          input.project_id  || null,
    _mock_audit_result:  input._mock_audit_result || null
  });
}

// ── F4: READ_ONLY tools ───────────────────────────────────────────────────────

const pkg_list = defineTool({
  name:          "pkg.list",
  description:   "List packages declared in the project's manifest (zero spawn, READ_ONLY).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      adapter_id: { type: "string" },
      project_id: { type: "string" }
    },
    required: ["adapter_id", "project_id"]
  },
  output_schema: { type: "object" },

  preview(input) { return Promise.resolve(ok({ adapter_id: input.adapter_id, packages: [] })); },

  execute(input, ctx) {
    const adapter = getAdapter(input.adapter_id);
    if (!adapter) return Promise.resolve(failed("ADAPTER_NOT_FOUND", "No adapter: " + input.adapter_id));
    const result = adapter.list(_adapterCtx(input, ctx));
    if (result && typeof result.then === "function") return result.then(r => ok(r));
    return Promise.resolve(ok(result));
  }
});

const pkg_audit = defineTool({
  name:          "pkg.audit",
  description:   "Run security audit for a package manager (mock in TEST mode — AC #17).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      adapter_id:          { type: "string" },
      project_id:          { type: "string" },
      _mock_audit_result:  { type: "object" }
    },
    required: ["adapter_id", "project_id"]
  },
  output_schema: { type: "object" },

  preview(input) { return Promise.resolve(ok({ adapter_id: input.adapter_id, action: "audit" })); },

  async execute(input, ctx) {
    const adapter = getAdapter(input.adapter_id);
    if (!adapter) return failed("ADAPTER_NOT_FOUND", "No adapter: " + input.adapter_id);
    const result = await adapter.audit(_adapterCtx(input, ctx));
    return ok(result);
  }
});

const pkg_detect_lock_files = defineTool({
  name:          "pkg.detect_lock_files",
  description:   "Detect lock files in project workspace (READ_ONLY, zero spawn).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string" }
    },
    required: ["project_id"]
  },
  output_schema: { type: "object" },

  preview(input) { return Promise.resolve(ok({ found: [], not_found: [] })); },

  execute(input, ctx) {
    const root       = (ctx && ctx.root) || process.cwd();
    const projectDir = path.join(root, "artifacts", "projects", input.project_id);
    const found     = [];
    const not_found = [];

    for (const entry of LOCK_FILES) {
      const fullPath = path.join(projectDir, entry.file);
      if (fs.existsSync(fullPath)) {
        found.push({ file: entry.file, adapter_id: entry.adapter_id, path: fullPath });
      } else {
        not_found.push({ file: entry.file, adapter_id: entry.adapter_id });
      }
    }

    return Promise.resolve(ok({ found, not_found }));
  }
});

const pkg_get_adapter = defineTool({
  name:          "pkg.get_adapter",
  description:   "Return adapter metadata by id (READ_ONLY).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      adapter_id: { type: "string" }
    },
    required: ["adapter_id"]
  },
  output_schema: { type: "object" },

  preview(input) { return Promise.resolve(ok({ id: input.adapter_id })); },

  execute(input) {
    const adapter = getAdapter(input.adapter_id);
    if (!adapter) return Promise.resolve(failed("ADAPTER_NOT_FOUND", "No adapter: " + input.adapter_id));
    return Promise.resolve(ok({
      id:        adapter.id,
      label:     adapter.label,
      tier:      adapter.tier,
      available: true
    }));
  }
});

// ── F5: WORKSPACE_WRITE / PROMPT tools ────────────────────────────────────────

const pkg_install = defineTool({
  name:          "pkg.install",
  description:   "Install packages via adapter (Tier-1: WORKSPACE_WRITE; Tier-2: routes to shell.run_with_prompt).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      adapter_id:  { type: "string" },
      packages:    { type: "array", items: { type: "string" } },
      project_id:  { type: "string" }
    },
    required: ["adapter_id", "packages"]
  },
  output_schema: { type: "object" },

  preview(input) {
    return Promise.resolve(ok({ adapter_id: input.adapter_id, packages: input.packages, note: "dry-run not executed" }));
  },

  async execute(input, ctx) {
    const adapter = getAdapter(input.adapter_id);
    if (!adapter) return failed("ADAPTER_NOT_FOUND", "No adapter: " + input.adapter_id);

    const adapterCtx = _adapterCtx(input, ctx);
    const result     = await adapter.install(input.packages || [], adapterCtx);

    if (result.status !== "SUCCESS") {
      return failed(result.reason || "INSTALL_FAILED", JSON.stringify(result));
    }

    // F6: Vision integration (non-blocking)
    if (ctx && ctx.project_id) {
      try {
        const { visionEngine } = require("../../ai_os/visionEngine");
        for (const pkg of (input.packages || [])) {
          await visionEngine.proposeAmendment(ctx.project_id, {
            type:         "dependency_added",
            package_name: pkg,
            adapter_id:   adapter.id,
            rationale:    "installed via pkg.install"
          });
        }
      } catch { /* vision integration is non-blocking */ }
    }

    return ok(result);
  }
});

const pkg_remove = defineTool({
  name:          "pkg.remove",
  description:   "Remove packages via adapter (Tier-1: WORKSPACE_WRITE; Tier-2: routes to shell.run_with_prompt).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      adapter_id:  { type: "string" },
      packages:    { type: "array", items: { type: "string" } },
      project_id:  { type: "string" }
    },
    required: ["adapter_id", "packages"]
  },
  output_schema: { type: "object" },

  preview(input) {
    return Promise.resolve(ok({ adapter_id: input.adapter_id, packages: input.packages, note: "dry-run not executed" }));
  },

  async execute(input, ctx) {
    const adapter = getAdapter(input.adapter_id);
    if (!adapter) return failed("ADAPTER_NOT_FOUND", "No adapter: " + input.adapter_id);

    const result = await adapter.remove(input.packages || [], _adapterCtx(input, ctx));
    if (result.status !== "SUCCESS") {
      return failed(result.reason || "REMOVE_FAILED", JSON.stringify(result));
    }
    return ok(result);
  }
});

const pkg_propose_amendment = defineTool({
  name:          "pkg.propose_amendment",
  description:   "Propose a vision amendment after a package install event.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      project_id:   { type: "string" },
      package_name: { type: "string" },
      adapter_id:   { type: "string" },
      rationale:    { type: "string" }
    },
    required: ["project_id", "package_name", "adapter_id"]
  },
  output_schema: { type: "object" },

  preview(input) {
    return Promise.resolve(ok({ project_id: input.project_id, package_name: input.package_name, status: "PREVIEWED" }));
  },

  async execute(input, ctx) {
    try {
      const { visionEngine } = require("../../ai_os/visionEngine");
      const result = await visionEngine.proposeAmendment(input.project_id, {
        type:         "dependency_added",
        package_name: input.package_name,
        adapter_id:   input.adapter_id,
        rationale:    input.rationale || "installed via pkg.install"
      });
      return ok({ project_id: input.project_id, package_name: input.package_name, amendment: result });
    } catch (err) {
      return failed("VISION_ERROR", err.message);
    }
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [
    pkg_list,
    pkg_audit,
    pkg_detect_lock_files,
    pkg_get_adapter,
    pkg_install,
    pkg_remove,
    pkg_propose_amendment
  ]
};

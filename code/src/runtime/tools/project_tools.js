"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");

// Project registry: artifacts/projects/_index.json
// Each project directory: artifacts/projects/<id>/

const PROJECT_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function _indexPath(root) {
  return path.resolve(root, "artifacts", "projects", "_index.json");
}

function _projectDir(root, id) {
  return path.resolve(root, "artifacts", "projects", id);
}

function _readIndex(root) {
  const file = _indexPath(root);
  if (!fs.existsSync(file)) return { projects: {}, active: null };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { projects: {}, active: null };
  }
}

function _writeIndex(root, index) {
  const file = _indexPath(root);
  const dir  = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index, null, 2), "utf8");
}

// ── 1. project.create ─────────────────────────────────────────────────────────

const create = defineTool({
  name: "project.create",
  description: "Create a new project workspace under artifacts/projects/<id>/.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      id:          { type: "string" },
      description: { type: "string" }
    },
    required: ["id"]
  },
  output_schema: {
    type: "object",
    properties: {
      id:  { type: "string" },
      dir: { type: "string" }
    },
    required: ["id", "dir"]
  },

  preview(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    if (!PROJECT_ID_RE.test(input.id)) {
      return Promise.resolve(failed("INVALID_PROJECT_ID", "id must match " + PROJECT_ID_RE.toString()));
    }
    return Promise.resolve(previewed({
      operation: "project.create",
      id:        input.id,
      dir:       _projectDir(root, input.id),
      note:      "Would create project directory and register in _index.json"
    }));
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    if (!PROJECT_ID_RE.test(input.id)) {
      return failed("INVALID_PROJECT_ID", "id must match " + PROJECT_ID_RE.toString());
    }

    const index = _readIndex(root);
    if (index.projects[input.id]) {
      return failed("ALREADY_EXISTS", "Project '" + input.id + "' already exists");
    }

    const dir = _projectDir(root, input.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    index.projects[input.id] = {
      id:          input.id,
      description: input.description || "",
      created_at:  new Date().toISOString(),
      status:      "INACTIVE"
    };
    _writeIndex(root, index);

    return ok({ id: input.id, dir: path.relative(root, dir).replace(/\\/g, "/") });
  }
});

// ── 2. project.activate ───────────────────────────────────────────────────────

const activate = defineTool({
  name: "project.activate",
  description: "Set a project as the currently active one (only one active at a time).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"]
  },
  output_schema: {
    type: "object",
    properties: {
      id:          { type: "string" },
      previous:    { type: "string" }
    },
    required: ["id"]
  },

  preview(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const index = _readIndex(root);
    return Promise.resolve(previewed({
      operation: "project.activate",
      id:        input.id,
      previous:  index.active || null
    }));
  },

  async execute(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const index = _readIndex(root);

    if (!index.projects[input.id]) {
      return failed("NOT_FOUND", "Project '" + input.id + "' not found");
    }
    if (index.active === input.id) {
      return failed("IS_ACTIVE", "Project '" + input.id + "' is already active");
    }

    const previous = index.active || null;
    if (previous && index.projects[previous]) {
      index.projects[previous].status = "INACTIVE";
    }
    index.active                    = input.id;
    index.projects[input.id].status = "ACTIVE";
    _writeIndex(root, index);

    return ok({ id: input.id, previous });
  }
});

// ── 3. project.list ───────────────────────────────────────────────────────────

const list = defineTool({
  name: "project.list",
  description: "List all registered projects.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: { type: "object", properties: {} },
  output_schema: {
    type: "object",
    properties: {
      projects: { type: "array" },
      active:   {}
    },
    required: ["projects"]
  },

  async execute(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const index = _readIndex(root);
    return ok({
      projects: Object.values(index.projects || {}),
      active:   index.active || null
    });
  }
});

// ── 4. project.delete ─────────────────────────────────────────────────────────

const delete_ = defineTool({
  name: "project.delete",
  description: "Remove a project from the registry (does NOT delete the directory — use fs.delete_file for that).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"]
  },
  output_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"]
  },

  preview(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const index = _readIndex(root);
    if (!index.projects[input.id]) {
      return Promise.resolve(failed("NOT_FOUND", "Project '" + input.id + "' not found"));
    }
    return Promise.resolve(previewed({
      operation: "project.delete",
      id:        input.id,
      note:      "Would remove project entry from _index.json. Directory NOT deleted."
    }));
  },

  async execute(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const index = _readIndex(root);

    if (!index.projects[input.id]) {
      return failed("NOT_FOUND", "Project '" + input.id + "' not found");
    }

    // PHASE-36 C3 (STEP B2) — active-delete guard (defense in depth). The primary
    // enforcement is at apiServer.deleteProject (the real delete path); this tool guard
    // makes the delete_active_project HARD_DENY rule's "delegated to tool-level check"
    // comment TRUE for any caller that does reach this tool.
    if (input.id === index.active) {
      return failed("CANNOT_DELETE_ACTIVE",
        "Cannot delete the active project '" + input.id + "'; activate another project first.");
    }

    delete index.projects[input.id];
    if (index.active === input.id) index.active = null;
    _writeIndex(root, index);

    return ok({ id: input.id });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [create, activate, list, delete_],
  PROJECT_ID_RE
};

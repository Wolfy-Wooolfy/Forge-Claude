"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");

// ── Filename safety ───────────────────────────────────────────────────────────

const SAFE_FILENAME_RE = /^[a-zA-Z0-9_\-.]+$/;

function _safeFilename(name) {
  if (!name || !SAFE_FILENAME_RE.test(name)) {
    return { safe: false };
  }
  if (name.includes("..")) return { safe: false };
  return { safe: true };
}

// ── 1. artifact.write_decision ────────────────────────────────────────────────

const write_decision = defineTool({
  name: "artifact.write_decision",
  description: "Write a decision artifact to artifacts/decisions/<filename>.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      filename: { type: "string" },
      content:  { type: "string" }
    },
    required: ["filename", "content"]
  },
  output_schema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"]
  },

  preview(input, ctx) {
    if (!_safeFilename(input.filename).safe) {
      return Promise.resolve(failed("INVALID_FILENAME",
        "filename must match /^[a-zA-Z0-9_-.]+$/ and not contain '..': " + input.filename));
    }
    const root    = (ctx && ctx.root) || process.cwd();
    const relPath = path.join("artifacts", "decisions", input.filename);
    return Promise.resolve(previewed({
      operation: "artifact.write_decision",
      path:      relPath,
      note:      "Would write " + (input.content || "").length + " chars to " + relPath
    }));
  },

  async execute(input, ctx) {
    if (!_safeFilename(input.filename).safe) {
      return failed("INVALID_FILENAME",
        "filename must match /^[a-zA-Z0-9_-.]+$/ and not contain '..': " + input.filename);
    }
    const root    = (ctx && ctx.root) || process.cwd();
    const absPath = path.resolve(root, "artifacts", "decisions", input.filename);
    const dir     = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(absPath, input.content, "utf8");
    const relPath = path.relative(root, absPath).replace(/\\/g, "/");
    return ok({ path: relPath });
  }
});

// ── 2. artifact.write_audit ───────────────────────────────────────────────────

const write_audit = defineTool({
  name: "artifact.write_audit",
  description: "Append a line to an audit file under artifacts/audit/<filename>.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      filename: { type: "string" },
      content:  { type: "string" }
    },
    required: ["filename", "content"]
  },
  output_schema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"]
  },

  preview(input, ctx) {
    if (!_safeFilename(input.filename).safe) {
      return Promise.resolve(failed("INVALID_FILENAME",
        "filename must match /^[a-zA-Z0-9_-.]+$/ and not contain '..': " + input.filename));
    }
    const root    = (ctx && ctx.root) || process.cwd();
    const relPath = path.join("artifacts", "audit", input.filename);
    return Promise.resolve(previewed({
      operation: "artifact.write_audit",
      path:      relPath,
      note:      "Would append " + (input.content || "").length + " chars to " + relPath
    }));
  },

  async execute(input, ctx) {
    if (!_safeFilename(input.filename).safe) {
      return failed("INVALID_FILENAME",
        "filename must match /^[a-zA-Z0-9_-.]+$/ and not contain '..': " + input.filename);
    }
    const root    = (ctx && ctx.root) || process.cwd();
    const absPath = path.resolve(root, "artifacts", "audit", input.filename);
    const dir     = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(absPath, input.content, "utf8");
    const relPath = path.relative(root, absPath).replace(/\\/g, "/");
    return ok({ path: relPath });
  }
});

// ── 3. artifact.list ──────────────────────────────────────────────────────────

const list = defineTool({
  name: "artifact.list",
  description: "List artifact files under a given subdirectory of artifacts/.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: {
      subdir: { type: "string" }
    },
    required: ["subdir"]
  },
  output_schema: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string" } }
    },
    required: ["files"]
  },

  async execute(input, ctx) {
    const root   = (ctx && ctx.root) || process.cwd();
    const absDir = path.resolve(root, "artifacts", input.subdir);

    // Prevent path traversal out of artifacts/
    const artifactsRoot = path.resolve(root, "artifacts");
    if (!absDir.startsWith(artifactsRoot + path.sep) && absDir !== artifactsRoot) {
      return failed("PATH_OUTSIDE_ROOT", "subdir resolves outside artifacts/");
    }

    if (!fs.existsSync(absDir)) return ok({ files: [] });
    if (!fs.statSync(absDir).isDirectory()) {
      return failed("DIR_NOT_FOUND", "Not a directory: artifacts/" + input.subdir);
    }

    const names = fs.readdirSync(absDir).filter(n => {
      return fs.statSync(path.join(absDir, n)).isFile();
    });
    return ok({ files: names });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [write_decision, write_audit, list],
  SAFE_FILENAME_RE
};

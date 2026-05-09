"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");

// ── Path safety helper ────────────────────────────────────────────────────────

function safeResolve(root, inputPath) {
  const abs = path.resolve(root, inputPath);
  if (!abs.startsWith(path.resolve(root) + path.sep) && abs !== path.resolve(root)) {
    return { safe: false, abs };
  }
  return { safe: true, abs };
}

// ── Common schemas ────────────────────────────────────────────────────────────

const PATH_INPUT = {
  type: "object",
  properties: { path: { type: "string" } },
  required: ["path"]
};

const VOID_OUTPUT = { type: "object" };

// ── 1. fs.read_file ───────────────────────────────────────────────────────────

const read_file = defineTool({
  name: "fs.read_file",
  description: "Read a file within the workspace and return its content as a string.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: {
      path:     { type: "string" },
      encoding: { type: "string" }
    },
    required: ["path"]
  },
  output_schema: {
    type: "object",
    properties: {
      content: { type: "string" },
      size:    { type: "number" }
    },
    required: ["content"]
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);
    if (!fs.existsSync(abs)) return failed("FILE_NOT_FOUND", "File not found: " + input.path);
    const enc     = input.encoding || "utf8";
    const content = fs.readFileSync(abs, enc);
    const size    = fs.statSync(abs).size;
    return ok({ content, size });
  }
});

// ── 2. fs.write_file ──────────────────────────────────────────────────────────

const write_file = defineTool({
  name: "fs.write_file",
  description: "Write (overwrite) a file within the workspace.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      path:     { type: "string" },
      content:  { type: "string" },
      encoding: { type: "string" }
    },
    required: ["path", "content"]
  },
  output_schema: {
    type: "object",
    properties: { bytes_written: { type: "number" } },
    required: ["bytes_written"]
  },
  preview(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe } = safeResolve(root, input.path);
    if (!safe) return Promise.resolve(failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root"));
    return Promise.resolve(previewed({
      operation: "write_file",
      path:      input.path,
      note:      "Would overwrite (or create) file with " + String(input.content || "").length + " chars"
    }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);
    const enc = input.encoding || "utf8";
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, input.content, enc);
    const bytes_written = Buffer.byteLength(input.content, enc);
    return ok({ bytes_written });
  }
});

// ── 3. fs.append_file ─────────────────────────────────────────────────────────

const append_file = defineTool({
  name: "fs.append_file",
  description: "Append text to a file within the workspace (creates if absent).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      path:     { type: "string" },
      content:  { type: "string" },
      encoding: { type: "string" }
    },
    required: ["path", "content"]
  },
  output_schema: VOID_OUTPUT,
  preview(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe } = safeResolve(root, input.path);
    if (!safe) return Promise.resolve(failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root"));
    return Promise.resolve(previewed({
      operation: "append_file",
      path:      input.path,
      note:      "Would append " + String(input.content || "").length + " chars"
    }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);
    const enc = input.encoding || "utf8";
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(abs, input.content, enc);
    return ok({});
  }
});

// ── 4. fs.delete_file ─────────────────────────────────────────────────────────

const delete_file = defineTool({
  name: "fs.delete_file",
  description: "Delete a file within the workspace.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: PATH_INPUT,
  output_schema: VOID_OUTPUT,
  preview(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe } = safeResolve(root, input.path);
    if (!safe) return Promise.resolve(failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root"));
    return Promise.resolve(previewed({ operation: "delete_file", path: input.path }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);
    if (!fs.existsSync(abs)) return failed("FILE_NOT_FOUND", "File not found: " + input.path);
    fs.unlinkSync(abs);
    return ok({});
  }
});

// ── 5. fs.delete_dir ─────────────────────────────────────────────────────────
// Condition 1: required_mode WORKSPACE_WRITE (enforced by L3 registry).
// Condition 2: deny-by-default path guard — only artifacts/projects/ subtree.
// Condition 3: preview support — returns { would_delete, file_count } without deleting.

function _countFiles(dirPath) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const child = path.join(dirPath, entry.name);
      count += entry.isDirectory() ? _countFiles(child) : 1;
    }
  } catch (_e) {/* ignore unreadable dirs */}
  return count;
}

const delete_dir = defineTool({
  name: "fs.delete_dir",
  description: "Recursively delete a project directory. Restricted to artifacts/projects/ subtree.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      path:    { type: "string" },
      preview: { type: "boolean" }
    },
    required: ["path"]
  },
  output_schema: {
    type: "object",
    properties: {
      deleted:      { type: "boolean" },
      would_delete: { type: "string" },
      file_count:   { type: "number" }
    }
  },
  preview(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return Promise.resolve(failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root"));
    const projectsBase = path.resolve(root, "artifacts", "projects") + path.sep;
    if (!abs.startsWith(projectsBase)) {
      return Promise.resolve(failed("PATH_OUTSIDE_PROJECTS",
        "fs.delete_dir only operates within artifacts/projects/"));
    }
    const fileCount = fs.existsSync(abs) ? _countFiles(abs) : 0;
    return Promise.resolve(previewed({ would_delete: abs, file_count: fileCount }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);

    // Condition 2: deny-by-default — only artifacts/projects/ even in DANGER mode
    const projectsBase = path.resolve(root, "artifacts", "projects") + path.sep;
    if (!abs.startsWith(projectsBase)) {
      return failed("PATH_OUTSIDE_PROJECTS",
        "fs.delete_dir only operates within artifacts/projects/: " + input.path);
    }

    if (input.preview === true) {
      const fileCount = fs.existsSync(abs) ? _countFiles(abs) : 0;
      return previewed({ would_delete: abs, file_count: fileCount });
    }

    if (!fs.existsSync(abs)) return failed("DIR_NOT_FOUND", "Directory not found: " + input.path);

    const fileCount = _countFiles(abs);
    fs.rmSync(abs, { recursive: true, force: true });
    return ok({ deleted: true, would_delete: abs, file_count: fileCount });
  }
});

// ── 6. fs.list_dir ────────────────────────────────────────────────────────────

const list_dir = defineTool({
  name: "fs.list_dir",
  description: "List the immediate children of a directory within the workspace.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: PATH_INPUT,
  output_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string" }
          },
          required: ["name", "type"]
        }
      }
    },
    required: ["entries"]
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);
    if (!fs.existsSync(abs)) return failed("DIR_NOT_FOUND", "Directory not found: " + input.path);
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) return failed("DIR_NOT_FOUND", "Not a directory: " + input.path);
    const names = fs.readdirSync(abs);
    const entries = names.map(name => {
      const childStat = fs.statSync(path.join(abs, name));
      return { name, type: childStat.isDirectory() ? "dir" : "file" };
    });
    return ok({ entries });
  }
});

// ── 6. fs.exists ─────────────────────────────────────────────────────────────

const exists = defineTool({
  name: "fs.exists",
  description: "Check whether a path exists within the workspace.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: PATH_INPUT,
  output_schema: {
    type: "object",
    properties: {
      exists: { type: "boolean" },
      type:   { type: "string" }
    },
    required: ["exists"]
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { safe, abs } = safeResolve(root, input.path);
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "Path resolves outside workspace root: " + input.path);
    if (!fs.existsSync(abs)) return ok({ exists: false });
    const stat = fs.statSync(abs);
    return ok({ exists: true, type: stat.isDirectory() ? "dir" : "file" });
  }
});

// ── 7. fs.glob ────────────────────────────────────────────────────────────────

const glob = defineTool({
  name: "fs.glob",
  description: "Return all files matching a glob pattern within the workspace.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      cwd:     { type: "string" }
    },
    required: ["pattern"]
  },
  output_schema: {
    type: "object",
    properties: {
      matches: { type: "array", items: { type: "string" } }
    },
    required: ["matches"]
  },
  async execute(input, ctx) {
    const root     = (ctx && ctx.root) || process.cwd();
    const basePath = input.cwd ? path.resolve(root, input.cwd) : root;
    const { safe } = safeResolve(root, path.relative(root, basePath) || ".");
    if (!safe) return failed("PATH_OUTSIDE_ROOT", "cwd resolves outside workspace root");

    // Simple recursive glob — supports * and ** wildcards only
    const pattern  = input.pattern;
    const matches  = [];
    _walkGlob(basePath, basePath, pattern.split("/"), matches, root);
    return ok({ matches: matches.map(m => path.relative(root, m).replace(/\\/g, "/")) });
  }
});

function _matchSegment(segment, name) {
  if (segment === "**") return true;
  if (!segment.includes("*")) return segment === name;
  const re = new RegExp("^" + segment.replace(/\./g, "\\.").replace(/\*/g, "[^/]*") + "$");
  return re.test(name);
}

function _walkGlob(base, current, parts, results, root) {
  if (!fs.existsSync(current)) return;

  if (parts.length === 0) {
    results.push(current);
    return;
  }

  const [head, ...rest] = parts;

  if (head === "**") {
    // Match zero segments (collapse ** and continue with rest from here)
    if (rest.length > 0) _walkGlob(base, current, rest, results, root);
    // Match one or more by descending into subdirs
    if (fs.statSync(current).isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        const childAbs = path.join(current, child);
        if (!childAbs.startsWith(path.resolve(root))) continue;
        _walkGlob(base, childAbs, parts, results, root);
      }
    }
    return;
  }

  if (!fs.statSync(current).isDirectory()) return;

  for (const child of fs.readdirSync(current)) {
    if (_matchSegment(head, child)) {
      const childAbs = path.join(current, child);
      if (!childAbs.startsWith(path.resolve(root))) continue;
      if (rest.length === 0) {
        results.push(childAbs);
      } else {
        _walkGlob(base, childAbs, rest, results, root);
      }
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [read_file, write_file, append_file, delete_file, delete_dir, list_dir, exists, glob]
};

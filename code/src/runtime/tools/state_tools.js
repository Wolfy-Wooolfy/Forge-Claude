"use strict";

const fs   = require("fs");
const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");

// State files live at artifacts/state/<namespace>.json
function _statePath(root, namespace) {
  return path.resolve(root, "artifacts", "state", namespace + ".json");
}

function _readState(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function _writeState(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ── 1. state.read ─────────────────────────────────────────────────────────────

const read = defineTool({
  name: "state.read",
  description: "Read the current state object for a namespace. Returns {} if not yet initialised.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: { namespace: { type: "string" } },
    required: ["namespace"]
  },
  output_schema: {
    type: "object",
    properties: {
      data:     { type: "object" },
      _version: { type: "number" }
    },
    required: ["data", "_version"]
  },
  async execute(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const fpath = _statePath(root, input.namespace);
    const state = _readState(fpath);
    if (!state) return ok({ data: {}, _version: 0 });
    const { _version, ...data } = state;
    return ok({ data: data || {}, _version: typeof _version === "number" ? _version : 0 });
  }
});

// ── 2. state.patch ────────────────────────────────────────────────────────────

const patch = defineTool({
  name: "state.patch",
  description: "Shallow-merge a patch object into the namespace state using optimistic concurrency (_version must match).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      namespace: { type: "string" },
      patch:     { type: "object" },
      _version:  { type: "number" }
    },
    required: ["namespace", "patch", "_version"]
  },
  output_schema: {
    type: "object",
    properties: {
      data:     { type: "object" },
      _version: { type: "number" }
    },
    required: ["data", "_version"]
  },

  preview(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const fpath = _statePath(root, input.namespace);
    const state = _readState(fpath);
    const currentVersion = state ? (typeof state._version === "number" ? state._version : 0) : 0;
    return Promise.resolve(previewed({
      operation:       "state.patch",
      namespace:       input.namespace,
      current_version: currentVersion,
      patch:           input.patch,
      note:            "Would merge patch into namespace '" + input.namespace + "', bumping _version to " + (currentVersion + 1)
    }));
  },

  async execute(input, ctx) {
    const root  = (ctx && ctx.root) || process.cwd();
    const fpath = _statePath(root, input.namespace);
    const state = _readState(fpath) || { _version: 0 };

    const currentVersion = typeof state._version === "number" ? state._version : 0;

    // Optimistic concurrency check
    if (input._version !== currentVersion) {
      return failed(
        "CONFLICT",
        "Version mismatch: expected " + input._version + " but current is " + currentVersion,
        { expected: input._version, current: currentVersion }
      );
    }

    const newVersion = currentVersion + 1;
    const { _version: _v, ...existingData } = state;
    const newData = Object.assign({}, existingData, input.patch);
    _writeState(fpath, Object.assign({ _version: newVersion }, newData));

    return ok({ data: newData, _version: newVersion });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [read, patch]
};

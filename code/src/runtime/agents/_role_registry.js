"use strict";

const fs   = require("fs");
const path = require("path");

const ROLES_DIR    = path.join(__dirname, "roles");
const PROMPTS_FILE = path.join(__dirname, "../../../../docs/10_runtime/18b_ROLE_PROMPTS.md");

let _cache = null;

// ── System prompt validation ──────────────────────────────────────────────────

function _loadPromptsDoc() {
  try {
    return fs.readFileSync(PROMPTS_FILE, "utf8");
  } catch (err) {
    throw new Error("role registry: cannot read prompts doc: " + err.message);
  }
}

function _promptExists(promptId, doc) {
  return doc.includes("## " + promptId + " (");
}

// ── Registry load ─────────────────────────────────────────────────────────────

function _loadRoles() {
  const map = new Map();

  let files;
  try {
    files = fs.readdirSync(ROLES_DIR).filter(f => f.endsWith("_role.js"));
  } catch (err) {
    throw new Error("role registry: roles dir not found: " + err.message);
  }

  const promptsDoc = _loadPromptsDoc();

  for (const file of files) {
    let role;
    try {
      role = require(path.join(ROLES_DIR, file));
    } catch (err) {
      throw new Error("role registry: failed to load '" + file + "': " + err.message);
    }

    if (map.has(role.id)) {
      throw new Error("role registry: duplicate id '" + role.id + "' in '" + file + "'");
    }

    if (!_promptExists(role.system_prompt_id, promptsDoc)) {
      throw new Error("role registry: role '" + role.id + "' has unknown system_prompt_id '" +
        role.system_prompt_id + "'");
    }

    map.set(role.id, role);
  }

  return map;
}

// ── Public API ────────────────────────────────────────────────────────────────

function _getCache() {
  if (!_cache) _cache = _loadRoles();
  return _cache;
}

function pickRole(id)    { return _getCache().get(id) || null; }
function listRoles()     { return Array.from(_getCache().values()); }
function resetRoleCache() { _cache = null; }

module.exports = { pickRole, listRoles, resetRoleCache };

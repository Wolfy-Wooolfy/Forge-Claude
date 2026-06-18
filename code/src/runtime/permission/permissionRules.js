"use strict";

const path = require("path");

const { resolveWithinRoot } = require("./_path_util");

// ── Scope zones (per SCHEMA §6) ───────────────────────────────────────────────

const WORKSPACE_WRITE_PREFIXES = ["artifacts/", "progress/", "logs/"];

const FORGE_SELF_PREFIXES = [
  "code/", "docs/", "web/", "tools/", "bin/",
  "architecture/", "package.json", "INSTRUCTIONS.md", "CLAUDE.md", "README.md"
];

// ── Hard deny rules (per SCHEMA §5) ──────────────────────────────────────────

const HARD_DENY_RULES = [
  {
    id: "absolute_filesystem_root",
    applies(tool, input, ctx, policyRoot) {
      if (!tool.name.startsWith("fs.") && !tool.name.startsWith("artifact.")) return false;
      const p = input && (input.path || input.filename);
      if (!p) return false;
      const norm = String(p);
      if (norm.startsWith("/etc") || norm.startsWith("/var") || norm.startsWith("/root")) return true;
      if (/^[A-Za-z]:[\\\/]/.test(norm)) return true;
      // PHASE-36 §B: also deny anything that RESOLVES outside the workspace root — route
      // through the shared helper instead of raw "../" spotting. Root from ctx.root, else
      // the policy's root (always defined); only skip if neither is known.
      const root = (ctx && ctx.root) || policyRoot;
      if (root && resolveWithinRoot(root, norm).escapes_root) return true;
      return false;
    },
    reason: "HARD_DENY_SYSTEM_PATH",
    detail: "writes to system paths are unconditionally denied"
  },
  {
    id: "shell_destructive_commands",
    applies(tool, input /*, ctx */) {
      if (!tool.name.startsWith("shell.")) return false;
      const argv = (input && input.argv) || [];
      if (!argv.length) return false;
      const a0 = String(argv[0]).toLowerCase();
      if (a0 === "rm" || a0 === "dd") return true;
      if (a0 === "mkfs" || a0.startsWith("mkfs.")) return true;
      if (a0 === "shutdown" || a0 === "reboot" || a0 === "halt") return true;
      return false;
    },
    reason: "HARD_DENY_DESTRUCTIVE_SHELL",
    detail: "destructive shell commands are unconditionally denied"
  },
  {
    id: "delete_active_project",
    applies(/* tool, input, ctx */) {
      // Delegated to project_tools.delete tool-level check — documentation only.
      return false;
    },
    reason: "HARD_DENY_ACTIVE_PROJECT_DELETE",
    detail: "deleting the active project is delegated to tool-level check"
  }
];

// ── checkHardDeny ─────────────────────────────────────────────────────────────

function checkHardDeny(tool, input, ctx, policyRoot) {
  for (const rule of HARD_DENY_RULES) {
    if (rule.applies(tool, input, ctx, policyRoot)) {
      return { denied: true, rule_id: rule.id, reason: rule.reason, detail: rule.detail };
    }
  }
  return { denied: false };
}

// ── extractWritePath ──────────────────────────────────────────────────────────

function extractWritePath(tool, input) {
  const name = tool.name;

  // fs write tools
  if (name === "fs.write_file" || name === "fs.append_file" || name === "fs.delete_file") {
    return input && input.path ? String(input.path) : null;
  }

  // artifact tools
  if (name === "artifact.write_decision") {
    const filename = input && input.filename;
    if (!filename) return "artifacts/decisions/";
    return "artifacts/decisions/" + filename;
  }
  if (name === "artifact.write_audit") {
    const filename = input && input.filename;
    if (!filename) return "artifacts/audit/";
    return "artifacts/audit/" + filename;
  }

  // state.patch — infer path from context
  if (name === "state.patch") {
    const ns = input && input.namespace;
    if (!ns) return "artifacts/state/";
    return "artifacts/state/" + ns + ".json";
  }

  // project tools
  if (name === "project.create" || name === "project.delete" || name === "project.activate") {
    const id = input && input.id;
    if (!id) return "artifacts/projects/";
    return "artifacts/projects/" + id;
  }

  // Tools without a single write path — shell.*, http.post, pipeline.*
  return null;
}

// ── _matchesPrefix ────────────────────────────────────────────────────────────

function _matchesPrefix(norm, prefix) {
  return norm === prefix.replace(/\/$/, "") || norm.startsWith(prefix);
}

// ── checkScope ────────────────────────────────────────────────────────────────

function checkScope(tool, input, ctx, dataMode, policyRoot) {
  // Read-only tools skip scope check entirely
  if (tool.required_mode === "READ_ONLY" || tool.is_read_only) {
    return { applicable: false };
  }

  const writePath = extractWritePath(tool, input);

  // Tools without a deterministic write path skip scope check
  if (writePath === null) {
    return { applicable: false };
  }

  // DANGER_FULL_ACCESS — allow everywhere (within-root containment is still enforced
  // by the L2 tool's safeResolve; scope does not gate self-modify mode).
  if (dataMode === "DANGER_FULL_ACCESS") {
    return { applicable: true, allowed: true, reason: "DANGER_FULL_ACCESS" };
  }

  // C1 (PHASE-36): resolve the write path against the workspace root BEFORE prefix-
  // matching, so traversal ("artifacts/../code/x.js" → "code/x.js") is matched against
  // its REAL zone. Root from ctx.root (tools' convention), else the policy's root (always
  // defined: opts.root || process.cwd()). Fail CLOSED if neither — never raw-string match.
  const root = (ctx && ctx.root) || policyRoot;
  if (!root) {
    return { applicable: true, allowed: false, reason: "SCOPE_NO_ROOT",
             detail: "scope check requires a workspace root; failing closed" };
  }

  const { relative, escapes_root } = resolveWithinRoot(root, writePath);
  if (escapes_root) {
    return { applicable: true, allowed: false, reason: "SCOPE_OUTSIDE_ROOT",
             detail: "Path '" + writePath + "' resolves outside the workspace root" };
  }

  const norm = relative;

  // C2 (PHASE-36): active-project write boundary. When the decision ctx carries an
  // EXPLICIT active project id, a write under artifacts/projects/<seg>/ is allowed only
  // when <seg> IS the active project; a cross-project write denies SCOPE_CROSS_PROJECT.
  // Uses the already-resolved relative (norm) — no raw-string match, same discipline as C1.
  // INERT when ctx.active_project_id is ABSENT: orchestration loop helpers and every other
  // real write pass { root } only (no active id), so the boundary never touches them — this
  // is what keeps the loop green (mirrors the C1 fail-closed regression lesson). The seg
  // regex requires a trailing slash, so the bare project dir (project.create/activate, no
  // sub-path) is unaffected — you can create/activate B before it becomes active.
  const activeProjectId = ctx && ctx.active_project_id;
  if (activeProjectId) {
    const projMatch = norm.match(/^artifacts\/projects\/([^/]+)\//);
    if (projMatch && projMatch[1] !== activeProjectId) {
      return { applicable: true, allowed: false, reason: "SCOPE_CROSS_PROJECT",
               detail: "Path '" + writePath + "' targets project '" + projMatch[1] +
                       "' while active project is '" + activeProjectId + "'" };
    }
  }

  // Check WORKSPACE_WRITE_PREFIXES (artifacts/, progress/, logs/)
  for (const prefix of WORKSPACE_WRITE_PREFIXES) {
    if (_matchesPrefix(norm, prefix)) {
      if (dataMode === "READ_ONLY") {
        return { applicable: true, allowed: false, reason: "SCOPE_READ_ONLY",
                 detail: "READ_ONLY mode cannot write to '" + norm + "'" };
      }
      // WORKSPACE_WRITE — allowed
      return { applicable: true, allowed: true, reason: "WORKSPACE_WRITE" };
    }
  }

  // System session file — written once per boot by the security init (Stage 12.5)
  if (norm === "web/.forge-session") {
    if (dataMode === "READ_ONLY") {
      return { applicable: true, allowed: false, reason: "SCOPE_READ_ONLY",
               detail: "READ_ONLY mode cannot write to '" + norm + "'" };
    }
    return { applicable: true, allowed: true, reason: "SYSTEM_SESSION_FILE" };
  }

  // Check FORGE_SELF_PREFIXES (code/, docs/, etc.)
  for (const prefix of FORGE_SELF_PREFIXES) {
    if (_matchesPrefix(norm, prefix)) {
      if (dataMode === "READ_ONLY") {
        return { applicable: true, allowed: false, reason: "SCOPE_READ_ONLY",
                 detail: "READ_ONLY mode cannot write to '" + norm + "'" };
      }
      // WORKSPACE_WRITE — denied for Forge self paths
      return { applicable: true, allowed: false, reason: "SCOPE_FORGE_SELF",
               detail: "WORKSPACE_WRITE mode cannot modify Forge internals: '" + norm + "'" };
    }
  }

  // Path outside all known scopes
  if (dataMode === "READ_ONLY") {
    return { applicable: true, allowed: false, reason: "SCOPE_READ_ONLY",
             detail: "READ_ONLY mode cannot write to '" + norm + "'" };
  }
  return { applicable: true, allowed: false, reason: "SCOPE_UNKNOWN_PATH",
           detail: "Path '" + norm + "' is outside known write scopes" };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  HARD_DENY_RULES,
  WORKSPACE_WRITE_PREFIXES,
  FORGE_SELF_PREFIXES,
  checkHardDeny,
  checkScope,
  extractWritePath
};

"use strict";

const path = require("path");
const { defineTool, ok, failed, previewed } = require("./_contract");

// ── DEFAULT_EXCLUDE — verbatim from Plan §2-D3 (binding, do not modify) ──────
const DEFAULT_EXCLUDE = [
  "artifacts/llm/requests/**",     // contains full prompts → PII risk
  "artifacts/llm/responses/**",    // contains full model output → PII risk
  "artifacts/backups/**",          // prevent backup-in-backup
  ".env",
  "*.env",
  "node_modules/**"
];
// artifacts/llm/metadata/** is KEPT IN BACKUP — no PII per Blueprint Part B §L1

function _buildExcludeList(extraPatterns) {
  const envExtras = process.env.FORGE_BACKUP_EXCLUDE
    ? process.env.FORGE_BACKUP_EXCLUDE.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  // Env override and caller extras append to defaults; cannot remove defaults.
  return DEFAULT_EXCLUDE.concat(envExtras).concat(extraPatterns || []);
}

function _tsFilename() {
  // Produces filesystem-safe ISO timestamp: 2026-05-19T14-30-00-000Z
  return new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-");
}

// ── 1. backup.create ─────────────────────────────────────────────────────────

const backup_create = defineTool({
  name: "backup.create",
  description: "Create a compressed ZIP archive of the Forge workspace at artifacts/backups/<ts>.zip, applying DEFAULT_EXCLUDE patterns.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      extra_exclude: {
        type: "array",
        items: { type: "string" },
        description: "Additional glob patterns to exclude (appended to DEFAULT_EXCLUDE)"
      }
    }
  },
  output_schema: {
    type: "object",
    properties: {
      path:              { type: "string" },
      size_bytes:        { type: "number" },
      file_count:        { type: "number" },
      excluded_patterns: { type: "array", items: { type: "string" } },
      ts:                { type: "string" }
    },
    required: ["path", "size_bytes", "file_count", "excluded_patterns", "ts"]
  },
  preview(input, ctx) {
    const excludeList = _buildExcludeList(input && input.extra_exclude);
    return Promise.resolve(previewed({
      operation:             "backup.create",
      excluded_pattern_count: excludeList.length,
      output_path:           "artifacts/backups/<ts>.zip",
      note:                  "Would create ZIP archive excluding " + excludeList.length + " pattern groups"
    }));
  },
  async execute(input, ctx) {
    const AdmZip = require("adm-zip");
    const ignore = require("ignore");
    const { getDefaultRegistry } = require("./_registry");
    const reg = getDefaultRegistry();

    const root        = (ctx && ctx.root) || process.cwd();
    const excludeList = _buildExcludeList(input && input.extra_exclude);
    const ig          = ignore().add(excludeList);
    let   fileCount   = 0;

    const zip = new AdmZip();
    try {
      zip.addLocalFolder(root, "", function(p) {
        // Normalize to POSIX-style relative path before matching
        const posixPath = p.replace(/\\/g, "/").replace(/^\/+/, "");
        const included  = !ig.ignores(posixPath);
        if (included) fileCount++;
        return included;
      });
    } catch (e) {
      return failed("SCAN_FAILED", "Failed to scan workspace: " + e.message);
    }

    const ts         = _tsFilename();
    const outputPath = "artifacts/backups/" + ts + ".zip";
    const buf        = zip.toBuffer();

    // Write via L2 (fs.write_file creates parent dirs, handles permission gate).
    // Base64 encoding avoids direct fs.*Sync — Track A clean.
    const writeResult = await reg.invoke(
      "fs.write_file",
      { path: outputPath, content: buf.toString("base64"), encoding: "base64" },
      ctx
    );

    if (writeResult.status !== "SUCCESS") {
      return failed("WRITE_FAILED",
        "Failed to write backup archive: " +
        ((writeResult.metadata && writeResult.metadata.detail) || writeResult.status)
      );
    }

    return ok({
      path:              outputPath,
      size_bytes:        buf.length,
      file_count:        fileCount,
      excluded_patterns: excludeList,
      ts:                new Date().toISOString()
    });
  }
});

// ── 2. backup.verify ─────────────────────────────────────────────────────────

const backup_verify = defineTool({
  name: "backup.verify",
  description: "Validate the integrity of a backup archive by checking the ZIP header and reading all file entries.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the backup archive (e.g. artifacts/backups/2026-05-19T...zip)"
      }
    },
    required: ["path"]
  },
  output_schema: {
    type: "object",
    properties: {
      ok:         { type: "boolean" },
      reason:     { type: "string" },
      file_count: { type: "number" }
    },
    required: ["ok"]
  },
  async execute(input, ctx) {
    const AdmZip = require("adm-zip");
    const { getDefaultRegistry } = require("./_registry");
    const reg  = getDefaultRegistry();
    const root = (ctx && ctx.root) || process.cwd();

    // Check archive exists via L2 before handing to adm-zip
    const existsResult = await reg.invoke("fs.exists", { path: input.path }, ctx);
    if (existsResult.status !== "SUCCESS" || !existsResult.output.exists) {
      return ok({ ok: false, reason: "archive_not_found" });
    }

    const absPath = path.resolve(root, input.path);
    let zip;
    try {
      zip = new AdmZip(absPath);
    } catch (e) {
      return ok({ ok: false, reason: "header_corrupt" });
    }

    let fileCount = 0;
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      fileCount++;
      try {
        const data = entry.getData();
        if (!data) {
          return ok({ ok: false, reason: "entry_corrupt" });
        }
      } catch (e) {
        return ok({ ok: false, reason: "entry_corrupt" });
      }
    }

    return ok({ ok: true, file_count: fileCount });
  }
});

// ── 3. backup.export — instruction-only (READ_ONLY) ──────────────────────────
// Architectural ruling (Stage 12.3): L2 fs_tools constrain writes to ctx.root;
// cross-volume file copy cannot be done without a new §ARC entry (not
// pre-authorized for Stage 12.3). This tool generates a platform-aware copy
// command instead. See Stage 12.3 closure §X for full rationale.

const backup_export = defineTool({
  name: "backup.export",
  description: "Generate a platform-aware copy command for transferring a backup to external storage (USB, NAS). Does not copy files — owner executes the command. See INSTALL.md §Backup.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: {
      source_backup: {
        type: "string",
        description: "Relative path to the source backup archive (e.g. artifacts/backups/2026-...zip)"
      },
      destination: {
        type: "string",
        description: "External path where owner intends to copy the backup (e.g. D:\\backups\\forge)"
      }
    },
    required: ["source_backup", "destination"]
  },
  output_schema: {
    type: "object",
    properties: {
      source_resolved: { type: "string" },
      destination:     { type: "string" },
      copy_command:    { type: "string" },
      platform:        { type: "string" },
      next_action:     { type: "string" }
    },
    required: ["source_resolved", "destination", "copy_command", "platform", "next_action"]
  },
  async execute(input, ctx) {
    const { getDefaultRegistry } = require("./_registry");
    const reg  = getDefaultRegistry();
    const root = (ctx && ctx.root) || process.cwd();

    // Verify source backup exists via L2
    const existsResult = await reg.invoke("fs.exists", { path: input.source_backup }, ctx);
    if (existsResult.status !== "SUCCESS" || !existsResult.output.exists) {
      return failed("BACKUP_NOT_FOUND", "Source backup does not exist: " + input.source_backup);
    }

    const sourceAbs = path.resolve(root, input.source_backup);
    const platform  = process.platform;
    const copyCmd   = platform === "win32"
      ? 'copy "' + sourceAbs + '" "' + input.destination + '"'
      : 'cp "'   + sourceAbs + '" "' + input.destination + '"';

    return ok({
      source_resolved: sourceAbs,
      destination:     input.destination,
      copy_command:    copyCmd,
      platform,
      next_action: "Run the copy_command in a terminal with appropriate permissions. " +
                   "Verify the copy succeeded before deleting the source. " +
                   "See INSTALL.md §Backup for external storage best practices."
    });
  }
});

// ── 4. backup.restore ────────────────────────────────────────────────────────

const backup_restore = defineTool({
  name: "backup.restore",
  description: "Extract a backup archive over the workspace root. Requires DANGER_FULL_ACCESS mode. Run backup.verify first to confirm archive integrity.",
  required_mode: "DANGER_FULL_ACCESS",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the backup archive (relative to ctx.root, or absolute)"
      }
    },
    required: ["path"]
  },
  output_schema: {
    type: "object",
    properties: {
      extracted_count: { type: "number" },
      conflicts:       { type: "array", items: { type: "string" } }
    },
    required: ["extracted_count", "conflicts"]
  },
  preview(input, ctx) {
    return Promise.resolve(previewed({
      operation: "backup.restore",
      source:    input.path,
      note:      "Would extract '" + input.path + "' over workspace root — IRREVERSIBLE. Run backup.verify first."
    }));
  },
  async execute(input, ctx) {
    const AdmZip = require("adm-zip");
    const { getDefaultRegistry, createRegistry } = require("./_registry");
    const root = (ctx && ctx.root) || process.cwd();

    // Reads use default registry (fs.exists is READ_ONLY-safe at any mode)
    const reg = getDefaultRegistry();

    // Verify archive exists via L2 (path must be within ctx.root for L2 check)
    const existsResult = await reg.invoke("fs.exists", { path: input.path }, ctx);
    if (existsResult.status !== "SUCCESS" || !existsResult.output.exists) {
      return failed("ARCHIVE_NOT_FOUND", "Backup archive not found: " + input.path);
    }

    const absPath = path.resolve(root, input.path);
    let zip;
    try {
      zip = new AdmZip(absPath);
    } catch (e) {
      return failed("ARCHIVE_CORRUPT", "Cannot open archive: " + e.message);
    }

    // Writes use a local DANGER_FULL_ACCESS registry — restore must write to arbitrary
    // paths within root (e.g. hello.txt at root level). The outer DANGER_FULL_ACCESS gate
    // in permissionPolicy already secured this execution path.
    const { createPolicy } = require("../permission/permissionPolicy");
    const dangerPolicy = createPolicy({ active_mode: "DANGER_FULL_ACCESS" });
    const writeReg     = createRegistry({ root });
    writeReg.load();
    writeReg.setAuthorizeFunction(
      (tool, input_, c) => dangerPolicy.authorize(tool, input_, c)
    );

    const entries        = zip.getEntries();
    let   extractedCount = 0;
    const conflicts      = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const entryName = entry.entryName.replace(/\\/g, "/");

      // Path traversal guard: entry must resolve within restore root
      const destAbs  = path.resolve(root, entryName);
      const rootNorm = path.resolve(root);
      if (!destAbs.startsWith(rootNorm + path.sep) && destAbs !== rootNorm) {
        return failed("PATH_TRAVERSAL", "Archive entry has unsafe path: " + entryName);
      }

      try {
        const data        = entry.getData();
        // Write via L2 base64 — Track A clean (no direct fs.*Sync in this file)
        const writeResult = await writeReg.invoke(
          "fs.write_file",
          { path: entryName, content: data.toString("base64"), encoding: "base64" },
          ctx
        );

        if (writeResult.status === "SUCCESS") {
          extractedCount++;
        } else {
          conflicts.push(
            entryName + ": " +
            ((writeResult.metadata && writeResult.metadata.detail) || writeResult.status)
          );
        }
      } catch (e) {
        conflicts.push(entryName + ": " + e.message);
      }
    }

    return ok({ extracted_count: extractedCount, conflicts });
  }
});

// ── Export tool family (auto-discovered by tools _registry.js) ───────────────

module.exports = {
  tools: [backup_create, backup_verify, backup_export, backup_restore]
};

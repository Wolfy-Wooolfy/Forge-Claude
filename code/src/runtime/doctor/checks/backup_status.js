"use strict";

// Backup recency Doctor check.
// Parses creation timestamp from backup filenames (format: YYYY-MM-DDTHH-MM-SS-MMMZ.zip)
// rather than using fs.statSync mtime — avoids direct fs access and is
// resilient to filesystem mtime manipulation. Read-only: all ops via L2 fs.*.

const TS_FILENAME_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.zip$/;

function _parseBackupTs(filename) {
  const m = TS_FILENAME_RE.exec(filename);
  if (!m) return null;
  // Convert "2026-05-19T14-30-00-000Z" → "2026-05-19T14:30:00.000Z"
  const iso = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = {
  id: "backup_status",
  description: "Checks local backup recency: WARN if newest backup is > 7 days old, PASS otherwise",

  async fn(ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    // Path A: lazy require to avoid circular dependency at module load time.
    const { getDefaultRegistry } = require("../../tools/_registry");
    const reg = getDefaultRegistry();

    // Step 1 — confirm backups directory exists
    const dirExists = await reg.invoke(
      "fs.exists",
      { path: "artifacts/backups" },
      { root }
    );

    if (
      dirExists.status !== "SUCCESS" ||
      !dirExists.output.exists ||
      dirExists.output.type !== "dir"
    ) {
      return {
        status: "PASS",
        detail: "no backups yet — `forge backup create` after first setup (see INSTALL.md §Backup)"
      };
    }

    // Step 2 — list entries in backups directory
    const listResult = await reg.invoke(
      "fs.list_dir",
      { path: "artifacts/backups" },
      { root }
    );

    if (listResult.status !== "SUCCESS") {
      return {
        status: "PASS",
        detail: "no backups yet — `forge backup create` after first setup (see INSTALL.md §Backup)"
      };
    }

    // Step 3 — parse timestamps from matching filenames
    const backups = [];
    for (const entry of listResult.output.entries) {
      if (entry.type !== "file") continue;
      const ts = _parseBackupTs(entry.name);
      if (ts) backups.push({ name: entry.name, ts });
    }

    if (backups.length === 0) {
      return {
        status: "PASS",
        detail: "no backups yet — `forge backup create` after first setup (see INSTALL.md §Backup)"
      };
    }

    // Step 4 — find newest backup and compute age
    backups.sort((a, b) => b.ts - a.ts);
    const newest  = backups[0];
    const ageMs   = Date.now() - newest.ts.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    if (ageDays > 7) {
      return {
        status: "WARN",
        detail: "newest local backup is " + ageDays + " days old — run `forge backup create`"
      };
    }

    return {
      status: "PASS",
      detail: "last backup: " + ageDays + " day" + (ageDays === 1 ? "" : "s") + " ago"
    };
  }
};

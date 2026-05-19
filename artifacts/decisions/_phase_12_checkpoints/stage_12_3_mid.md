# Stage 12.3 — Backup System — Mid-Checkpoint

**Date:** 2026-05-19
**Stage:** 12.3 — Backup System
**Group completed at this checkpoint:** Group A (`backup_tools.js`)
**Status:** STOP — awaiting CTO review before Group B + C

---

## §1 — Group A Inventory

**File:** `code/src/runtime/tools/backup_tools.js`

| Property | Value |
|---|---|
| Size | 270 lines |
| Tools defined | 4 |
| Auto-discovery | Confirmed — `_registry.js` discovers via `*_tools.js` glob (no explicit registration needed) |

| Tool | `required_mode` | Notes |
|---|---|---|
| `backup.create` | `WORKSPACE_WRITE` | Confirmed — write tool, has `preview()` |
| `backup.verify` | `READ_ONLY` | Confirmed — `is_read_only: true`, no preview needed |
| `backup.export` | `READ_ONLY` | Confirmed — instruction-only per Stage 12.3 architectural ruling; `is_read_only: true` |
| `backup.restore` | `DANGER_FULL_ACCESS` | Confirmed — write tool, has `preview()` |

---

## §2 — Track A Grep Results

```
grep -nE "fs\.\w+Sync" code/src/runtime/tools/backup_tools.js
→ 0 matches ✓

grep -nE "require\(['\"](child_process)['\"]" code/src/runtime/tools/backup_tools.js
→ 0 matches ✓

grep -nE "require\(['\"](tar|archiver|yauzl|node-tar)['\"]" code/src/runtime/tools/backup_tools.js
→ 0 matches ✓ (no new archive deps — uses existing adm-zip only)
```

PowerShell verification output:
```
=== fs.*Sync ===    (no output)
=== child_process === (no output)
=== new archive deps === (no output)
=== load test ===
tools: backup.create/WORKSPACE_WRITE, backup.verify/READ_ONLY, backup.export/READ_ONLY, backup.restore/DANGER_FULL_ACCESS
```

**Track A: CLEAN.**

---

## §3 — adm-zip + ignore Integration Approach

**Choice made: PREFERRED path** — `zip.addLocalFolder(root, "", filterFn)` with `ignore` package matcher.

**Filter callback:**
```js
zip.addLocalFolder(root, "", function(p) {
  const posixPath = p.replace(/\\/g, "/").replace(/^\/+/, "");
  const included  = !ig.ignores(posixPath);
  if (included) fileCount++;
  return included;
});
```

- adm-zip calls `filetools.findFiles(root)` internally (recursive traversal — Track A clean)
- Filter receives relative path from workspace root, using platform path separator on Windows
- Normalize to POSIX before passing to `ignore.ignores()` — cross-platform safe
- `ignore().add(patterns).ignores(posixPath)` returns `true` if excluded

**ignore package verification (10 test paths, all PASS):**

| Path | Expected | Actual |
|---|---|---|
| `artifacts/llm/requests/abc.json` | EXCLUDED | EXCLUDED ✓ |
| `artifacts/llm/responses/abc.json` | EXCLUDED | EXCLUDED ✓ |
| `artifacts/llm/metadata/abc.json` | INCLUDED | INCLUDED ✓ |
| `artifacts/backups/2026-05-19.zip` | EXCLUDED | EXCLUDED ✓ |
| `.env` | EXCLUDED | EXCLUDED ✓ |
| `production.env` | EXCLUDED | EXCLUDED ✓ |
| `node_modules/adm-zip/adm-zip.js` | EXCLUDED | EXCLUDED ✓ |
| `artifacts/decisions/DECISION.md` | INCLUDED | INCLUDED ✓ |
| `code/src/runtime/tools/backup_tools.js` | INCLUDED | INCLUDED ✓ |
| `artifacts/projects/demo/file.txt` | INCLUDED | INCLUDED ✓ |

**Write path:** `zip.toBuffer()` → `buf.toString("base64")` → `reg.invoke("fs.write_file", { encoding: "base64" })` — fully L2 compliant, no direct `fs.*Sync` in backup_tools.js.

**Fallback path (if needed):** `reg.invoke("fs.glob", ...)` + `addFile(buffer)` per-file — NOT needed.

---

## §4 — Format Substitution Disclosure

The Stage 12.3 closure §X will include the following verbatim language (prepared):

> **Plan §2-D3 referenced `.tar.gz` as the backup format. Forge already uses
> `adm-zip` (no `tar` dep available). Substituted `.zip` (DEFLATE compression
> via adm-zip) to avoid adding an npm dependency. The functional intent
> ("compressed archive with selective exclusion") is preserved; the file
> extension is changed from `.tar.gz` to `.zip` throughout backup tooling and
> scenarios.**

---

## §5 — DEFAULT_EXCLUDE Verbatim Copy (verification)

```js
const DEFAULT_EXCLUDE = [
  "artifacts/llm/requests/**",     // contains full prompts → PII risk
  "artifacts/llm/responses/**",    // contains full model output → PII risk
  "artifacts/backups/**",          // prevent backup-in-backup
  ".env",
  "*.env",
  "node_modules/**"
];
// artifacts/llm/metadata/** is KEPT IN BACKUP — no PII per Blueprint Part B §L1
```

Matches Plan §2-D3 verbatim. ✓ `FORGE_BACKUP_EXCLUDE` env var appended additively (cannot remove defaults).

---

## §6 — Three Incidental Refinements for Closure §X

All three are documented and ready for the Stage 12.3 closure artifact:

1. **`.tar.gz` → `.zip`** — verbatim language prepared above (§4)
2. **Plan §8 Rollback D3 step 2 is a no-op** — auto-discovery handles it; rollback = delete the file only
3. **`backup.export` → instruction-only (READ_ONLY)** — full rationale in CTO ruling; closure §X verbatim language provided by CTO

---

## §7 — Architectural Decisions Recorded

**backup.export READ_ONLY (CTO ruling, Stage 12.3 GO message):**
L2 `fs.*` tools constrain writes to `ctx.root`. Cross-volume file copy is not available without a new §ARC entry (not pre-authorized for Stage 12.3). Tool ships as instruction-generator: verifies source exists, produces platform-aware `copy`/`cp` command, returns `next_action` string. Owner executes manually. INSTALL.md §Backup (Stage 12.6) documents workflow.

**backup_status Doctor check — filename timestamp parsing (implementation decision):**
Instead of using `fs.statSync(file).mtime` (Track A violation) or `fs.utimesSync` in tests, the backup filename encodes the creation time: `2026-05-19T14-30-00-000Z.zip`. The doctor check parses this timestamp directly from the filename. S199 test creates a fake-old backup by writing a file with an old timestamp in the name — no `fs.utimesSync` required.

---

## §8 — STOP Statement

STOP — CTO review required before Group B (`backup_status.js` Doctor check) and Group C (test helper + S197–S200).

Verification checklist for CTO:
- [ ] 4 tools with correct `required_mode` values (including `backup.export` downgrade to READ_ONLY)
- [ ] Track A grep: 0 `fs.*Sync`, 0 `child_process`, 0 new archive deps
- [ ] Preferred adm-zip+ignore approach confirmed (no fallback needed)
- [ ] All three Incidental Refinements documented and ready for closure §X
- [ ] `backup_status` filename-parsing approach (§7) acceptable — no §ARC violation
- [ ] GO for Group B + C

---

**END OF STAGE 12.3 MID-CHECKPOINT**

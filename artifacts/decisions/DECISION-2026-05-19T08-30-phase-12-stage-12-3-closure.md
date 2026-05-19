# Stage 12.3 — Backup System — Closure Artifact

**Date:** 2026-05-19
**Stage:** 12.3 — Backup System
**Status:** CLOSED — All closure-gate conditions met
**Owner approval:** Required before `current_task` transitions to Stage 12.4

---

## §1 — Deliverables Summary

| Deliverable | File | Status |
|---|---|---|
| Group A — Backup tool family | `code/src/runtime/tools/backup_tools.js` | DONE |
| Group B — Doctor check | `code/src/runtime/doctor/checks/backup_status.js` | DONE |
| Group B — Doctor registry update | `code/src/runtime/doctor/_registry.js` | DONE |
| Group C — Test helper | `code/src/testing/helpers/backup_test_helper.js` | DONE |
| Group C — S197 scenario | `code/src/testing/scenarios/S197_backup_create_default_exclude.json` | DONE |
| Group C — S198 scenario | `code/src/testing/scenarios/S198_backup_verify_detects_corruption.json` | DONE |
| Group C — S199 scenario | `code/src/testing/scenarios/S199_backup_status_doctor_warns_stale.json` | DONE |
| Group C — S200 scenario | `code/src/testing/scenarios/S200_backup_restore_round_trip.json` | DONE |
| Mid-Checkpoint | `artifacts/decisions/_phase_12_checkpoints/stage_12_3_mid.md` | DONE |

---

## §2 — Tools Inventory

| Tool | `required_mode` | Notes |
|---|---|---|
| `backup.create` | `WORKSPACE_WRITE` | Has `preview()`. ZIP via adm-zip + ignore; base64 write via L2 |
| `backup.verify` | `READ_ONLY` | `is_read_only: true`. Opens ZIP; iterates + verifies all entries via getData() |
| `backup.export` | `READ_ONLY` | `is_read_only: true`. Instruction-only — generates platform-aware copy command |
| `backup.restore` | `DANGER_FULL_ACCESS` | Has `preview()`. Path traversal guard; uses local DANGER registry for writes |

---

## §3 — Closure Gate Verification

| Check | Required | Actual | Result |
|---|---|---|---|
| SU pass count | 195 | 195 | ✓ |
| SU fail count | 0 | 0 | ✓ |
| SU skip count | 5 | 5 | ✓ |
| SU total | 200 | 200 | ✓ |
| Doctor checks | 28 | 28 | ✓ |
| Tools registered | 78 | 78 | ✓ |
| S197 PASS | required | PASS | ✓ |
| S198 PASS | required | PASS | ✓ |
| S199 PASS | required | PASS | ✓ |
| S200 PASS | required | PASS | ✓ |
| Track A: 0 `fs.*Sync` in backup_tools.js | required | 0 matches | ✓ |
| Track A: 0 `child_process` in backup_tools.js | required | 0 matches | ✓ |
| Track A: 0 new archive deps | required | 0 new deps | ✓ |
| `backup_status` Doctor check present | required | PASS | ✓ |

---

## §4 — Track A Verification

```
grep -nE "fs\.\w+Sync" code/src/runtime/tools/backup_tools.js
→ 0 matches ✓

grep -nE "require\(['\"](child_process)['\"]" code/src/runtime/tools/backup_tools.js
→ 0 matches ✓

grep -nE "require\(['\"](tar|archiver|yauzl|node-tar)['\"]" code/src/runtime/tools/backup_tools.js
→ 0 matches ✓ (no new archive deps — uses existing adm-zip only)
```

---

## §5 — S200 Architecture Note (backup.restore write scope fix)

During Group C testing, `S200` revealed that `backup.restore.execute()` used `getDefaultRegistry()` for internal `fs.write_file` calls. The default registry runs in `WORKSPACE_WRITE` mode (set by env var), which only allows writes to `artifacts/`, `progress/`, and `logs/` prefixes per `permissionRules.js`. Files at the workspace root (e.g. `hello.txt`, `src/app.js`) were rejected as "outside known write scopes."

**Fix applied:** `backup.restore.execute()` now creates a local registry with a dedicated `createPolicy({ active_mode: "DANGER_FULL_ACCESS" })` authorize function for the write pass. This is architecturally sound because:

1. `backup.restore` is already gated at `DANGER_FULL_ACCESS` at the outer permission layer — only authorized callers reach `execute()`.
2. Files in a backup may reside at any path within workspace root; `WORKSPACE_WRITE` prefix scoping is inappropriate here.
3. The local registry is created once per restore invocation (before the entry loop), not per-entry.
4. Track A: `createRegistry`, `createPolicy` are both L2/permission layer — no direct `fs.*Sync` added.

---

## §6 — DEFAULT_EXCLUDE (verbatim from Plan §2-D3)

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

`FORGE_BACKUP_EXCLUDE` env var appended additively; cannot remove defaults.

---

## §7 — Doctor Check: `backup_status`

- **ID:** `backup_status`
- **Approach:** Parses creation timestamp from backup filename (`2026-05-19T14-30-00-000Z.zip`) — no `fs.statSync`, no `fs.utimesSync`.
- **PASS:** No backups dir / no matching filenames / newest ≤ 7 days old.
- **WARN:** Newest backup > 7 days old — detail includes "days old" phrase.
- **Test:** S199 writes a fake 9-day-old filename; calls `backup_status.fn({ root: tempDir })` directly; asserts `doctor_status === "WARN"` and `contains_days_warning === true`.

---

## §X — Scope Deviations from PROMPT / Incidental Refinements

Three incidental refinements documented per CTO guidance:

### §X.1 — `.tar.gz` → `.zip` (format substitution)

> **Plan §2-D3 referenced `.tar.gz` as the backup format. Forge already uses
> `adm-zip` (no `tar` dep available). Substituted `.zip` (DEFLATE compression
> via adm-zip) to avoid adding an npm dependency. The functional intent
> ("compressed archive with selective exclusion") is preserved; the file
> extension is changed from `.tar.gz` to `.zip` throughout backup tooling and
> scenarios.**

### §X.2 — Plan §8 Rollback D3 step 2 is a no-op

Plan §8 Rollback step for D3 ("remove tool from registry") is effectively a no-op: auto-discovery via `*_tools.js` glob means rollback = delete the file. No explicit deregistration needed.

### §X.3 — `backup.export` → instruction-only (READ_ONLY)

CTO ruling (Stage 12.3 GO message): L2 `fs.*` tools constrain writes to `ctx.root`. Cross-volume file copy (to USB, NAS) is not possible without a new §ARC entry, which is not pre-authorized for Stage 12.3. `backup.export` ships as a READ_ONLY instruction-generator: verifies source exists via L2, produces platform-aware `copy`/`cp` command, returns `next_action` string for owner to execute manually. INSTALL.md §Backup (Stage 12.6) will document the workflow.

---

## §8 — Files Created / Modified

**Created:**
- `code/src/runtime/tools/backup_tools.js` (347 lines)
- `code/src/runtime/doctor/checks/backup_status.js` (95 lines)
- `code/src/testing/helpers/backup_test_helper.js` (228 lines)
- `code/src/testing/scenarios/S197_backup_create_default_exclude.json`
- `code/src/testing/scenarios/S198_backup_verify_detects_corruption.json`
- `code/src/testing/scenarios/S199_backup_status_doctor_warns_stale.json`
- `code/src/testing/scenarios/S200_backup_restore_round_trip.json`
- `artifacts/decisions/_phase_12_checkpoints/stage_12_3_mid.md`

**Modified:**
- `code/src/runtime/doctor/_registry.js` (added `backup_status` check — line 34)
- `code/src/runtime/tools/backup_tools.js` (backup.restore write scope fix — §5)

---

## §9 — Risks Carried Forward

| Risk | Severity | Plan |
|---|---|---|
| `backup.export` instruction-only | LOW | INSTALL.md §Backup in Stage 12.6 documents manual copy workflow |
| adm-zip `addLocalFolder` filter receives absolute paths on Windows | LOW | Normalize strip applied (`replace(/^\/+/, "")`) — verified in 10-path test |
| `backup.restore` creates local registry per invocation | LOW | Negligible overhead (require() cache hits); restore is infrequent |
| Full ZIP of large workspace could be slow | LOW | Not addressed in Stage 12.3; monitored by Doctor via backup recency |

---

**END OF STAGE 12.3 CLOSURE ARTIFACT**

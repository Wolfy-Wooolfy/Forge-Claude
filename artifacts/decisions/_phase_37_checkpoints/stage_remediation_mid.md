# PHASE-37 REMEDIATION — STEP A MID-CHECKPOINT

**Date:** 2026-06-18
**Step:** A — TRUE-DRIFT fix (migrate the 3 live-reachable direct-fs writes to `reg.invoke`)
**Status:** CODE FIX COMPLETE — STOP for CTO verification
**Scope guard:** ONLY the 3 TRUE-DRIFT writes. §ARC ledger NOT touched · audit artifact still `Status: OPEN` · STEP B/C not started. Mock-only, $0.

---

## 0. Re-ground & confirmation

The 3 TRUE-DRIFT writes from the audit (`DECISION-2026-06-18-phase-37-arc-drift-audit.md` §3.5/§5) were re-confirmed on disk before editing — all matched:

| # | Location (pre-fix) | Reached via |
|---|---|---|
| 1 | `specCompletenessEnforcer.js:11` `ensureDir → fs.mkdirSync` | `runSpecCompletenessEnforcer@85` ← `POST /api/governance/spec-completeness` (`apiServer.js:2099`) |
| 2 | `specCompletenessEnforcer.js:17` `writeJson → fs.writeFileSync` | (same) |
| 3 | `apiServer.js:93` `ensureDir → fs.mkdirSync` (on `projectsRoot`) | `listKnownProjectIds` ← `persistProjectState@798` (`:808`) + `listProjects@858` (`:863`) |

No STOP-AND-REPORT condition hit.

## 0.5 — L2 fs-tool surface investigation (done BEFORE editing)

- The L2 fs tools (`code/src/runtime/tools/fs_tools.js`) expose: `fs.read_file`, `fs.write_file`, `fs.append_file`, `fs.delete_file`, `fs.delete_dir`, `fs.list_dir`, `fs.exists`, `fs.glob`.
- **There is NO `fs.mkdir` / `fs.ensure_dir` tool.** However, **`fs.write_file` creates parent dirs implicitly** ([`fs_tools.js:98-99`](../../code/src/runtime/tools/fs_tools.js#L98-L99): `if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })`). → **NOT in the STOP-AND-REPORT condition** (write_file DOES create parents). No new tool needed; adding one was avoided (correctly a CTO scope question).
- **Reference pattern:** `apiServer.js` `writeFile@1552` → `reg.invoke("fs.write_file", { path: relPath, content: String(...) }, { root })` with a `status !== "SUCCESS"` throw. The migration mirrors this.

## 1. Migration — `code/src/modules/specCompletenessEnforcer.js`

- Removed `ensureDir` (`fs.mkdirSync`) and `writeJson` (`fs.writeFileSync`) helpers.
- Added `async writeJsonViaTool(root, relPath, obj)` → `reg.invoke("fs.write_file", { path, content: JSON.stringify(obj,null,2) }, { root })`, fail-closed on non-SUCCESS. `fs.write_file` creates the `artifacts/verify/` parent dir recursively, so the dropped `ensureDir` is fully covered.
- `runSpecCompletenessEnforcer` → **`async`**; the write site became `await writeJsonViaTool(root, "artifacts/verify/spec_completeness_report.json", artifact)`.
- **Behavior identical:** same artifact path, same JSON content (`JSON.stringify(…, null, 2)`, utf8), same return shape (`ok`/`result`/`artifact_path`/`blocked`/`status_patch`). The check functions (`checkDocsGapPass` etc.) are unchanged — they use `fs.readFileSync`/`existsSync`/`readdirSync` (READS, permitted).
- New top-of-file import: `const { getDefaultRegistry } = require("../runtime/tools/_registry");` (no circular dep — `_registry` does not import apiServer/this module; `getDefaultRegistry()` is called at invoke-time, not load-time).

**Call-site propagation:** `apiServer.js:2100` → `sendJson(res, 200, await runSpecCompletenessEnforcer({ root }));` (enclosing request handler already `async` — uses `await readBody`/`await documentationBuildLoop…`). Sole caller (grep-confirmed: no tests, no other importers).

## 2. Migration — `code/src/workspace/apiServer.js:93` `ensureDir`

- **Removed the `ensureDir(dirPath){ fs.mkdirSync(...) }` helper entirely** (its only caller was `listKnownProjectIds@624`).
- `listKnownProjectIds` kept **synchronous** (no async refactor → callers `persistProjectState@808` + `listProjects@863` untouched). The `mkdir` was dropped and `readdirSync` is now guarded by a read:
  ```js
  const ids = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot, { withFileTypes:true })… 
    : [];
  ```
- **Behavior identical:** when `projectsRoot` is absent, the old path created an empty dir → `readdirSync` `[]` → `unshift("default_project")` → returns `["default_project"]`; the new path skips the scan → `[]` → `unshift` → returns `["default_project"]`. Same result, minus the incidental dir-creation side effect.
- **Why dropping the mkdir is safe:** `projectsRoot` is created by the L2 `fs.write_file` tool (recursive parent creation) on the first real persist — `persistProjectState@803` (`await writeJson` → `fs.write_file`) runs *before* `listKnownProjectIds@808`; `listProjects` calls `writeActiveProject` (also `fs.write_file` into `projectsRoot`) before listing. Listing now only reads. (Chose the read-guard over a boot-hoist because there is no `ensure_dir` tool and a boot-hoist via `fs.write_file` would require writing a marker file — the read-guard eliminates the write with zero pollution and zero async blast radius.)

## 3. Verification (STEP A internal gate)

**Syntax:** `node --check` PASS on both files.

**TRUE-DRIFT writes gone** (`rg 'fs\.(write|append|unlink|mkdir|rm)[A-Za-z]*Sync'`):
- `specCompletenessEnforcer.js` → only match is the **comment** on line 17 (`…NOT direct fs.writeFileSync/mkdirSync`). Zero executable writes.
- `apiServer.js` → remaining matches are ONLY the §ARC-8 authorized writes (`2206 mkdirSync`, `2210 writeFileSync`) + the §ARC-8 comment (`2200`). The line-93 `ensureDir` mkdir is gone.

**No new forbidden patterns:** `rg 'child_process|fetch\(|new OpenAI\('` on both changed files → none.

**Targeted scenarios (exercise the changed `listKnownProjectIds`):**
- `S229` GET /api/projects returns active_project_id → **PASS**
- `S260` project list canonicalization (twin not listed; canonical not regenerated) → **PASS**

**Full mock SU suite** (`node --max-old-space-size=4096 bin/forge-test.js`):
```
ALL PASS — 321 passed, 0 failed, 5 skipped (326 total)   (exit 0, 0 FAIL assertions)
```
**= exact match to the audit-tree baseline 321/0/5 (326). No regression.**

## 4. Files changed (git status)

```
 M code/src/modules/specCompletenessEnforcer.js
 M code/src/workspace/apiServer.js
?? artifacts/decisions/_phase_37_checkpoints/stage_remediation_mid.md   (this file)
```
(`su_full_phase37.log` is gitignored via `*.log` — not in the worktree change set.)

## 5. NOT done in STEP A (deferred to STEP B / C)

- §ARC ledger edits (§ARC-8 companion-mkdir wording; new §ARC-9/§ARC-10; §ARC-5 dispatcher precision) — **STEP B**.
- Fixing the mis-cited "§ARC-1" comments in `verdict_aggregator.js` / `loopback_signal.js` — **STEP B**.
- The unreachable legacy-engine exclusion decision — **owner-gated**.
- Audit-artifact closure (`Status: OPEN` → CLOSED) — **STEP C**.

---

**🛑 STOP for CTO verification.** The 3 live TRUE-DRIFT writes are migrated to `reg.invoke("fs.write_file")`; governance endpoint + project list/persist behavior preserved; full suite green at baseline. No ledger touched, no closure written.

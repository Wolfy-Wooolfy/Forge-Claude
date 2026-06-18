# DECISION-2026-06-18 — PHASE-37 §0: §ARC Code-vs-Ledger Drift Audit

**Status:** OPEN (read-only audit; proposal + open questions only — NO code/ledger/remediation changes)
**Date:** 2026-06-18
**Author:** Claude (PHASE-37 §0 audit session)
**Repo state:** HEAD `238a71bf` (working tree clean at audit start); pipeline COMPLETE; PHASE-36 TRULY CLOSED.
**Authority for this audit:** PHASE-37 §0 prompt (owner-gated backlog item "§ARC code-vs-ledger drift audit"). This is a BACKLOG candidate, not an approved remediation phase.

---

## 1. Purpose & Scope

The §ARC ledger in `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` (8 entries) records the *authorized infrastructure deviations* from Track A discipline (no direct `fs.*Sync` writes / `child_process` / `fetch()` / `new OpenAI()` outside sanctioned homes). Over 36 phases, direct-fs/`child_process` usage in the code may have drifted from what the ledger records.

This audit answers: **does the §ARC ledger reflect the reality of the code?** It is strictly **read-only**. It classifies and documents every forbidden-pattern occurrence; it fixes nothing. The only artifact produced is this proposal.

**Forbidden = WRITES and side effects only.** Per the contract (lines 347-350) and the §0 governance echo, the forbidden patterns are:

- `fs.(write|append|unlink|mkdir|rm)*Sync` (mutating writes)
- `child_process.spawn|exec|execSync|execFile`
- direct `fetch()`
- `new OpenAI()` outside `code/src/providers/_contract/openAiAdapter.js`

**`fs` READS are NOT forbidden** (`readFileSync`/`existsSync`/`statSync` are permitted everywhere). Scope of scan: `code/src/**` **excluding** `code/src/testing/**`.

---

## 2. Methodology

Two-pass classification:

1. **Path-based mechanical pass (§2):** every occurrence → exactly one of SANCTIONED / AUTHORIZED / UNLEDGERED based on file path vs. the 8 ledger scopes.
2. **Per-file judgment pass (§3):** open each UNLEDGERED file and judge *why* it writes directly → (A) LEDGER-GAP (genuine §ARC-family reason, just unrecorded) or (B) TRUE-DRIFT (ordinary live-pipeline logic that should route through `reg.invoke`).

**L2 boundary trace (pre-check):** `reg.invoke("fs.write_file")` → `code/src/runtime/tools/fs_tools.js` performs the actual `fs.writeFileSync`. `code/src/runtime/tools/*` are the **sanctioned L2 tool homes** — direct `fs.*Sync` there is the tool layer itself, NOT drift.

**Tooling integrity note (IMPORTANT for future audits):** the in-harness Grep/ripgrep tool honors `.gitignore` and, due to a ripgrep negated-reinclude quirk, **silently skipped `code/src/runtime/secrets/`** (the `secrets/` rule on `.gitignore:25` prunes the directory; the `!code/src/runtime/secrets/**` re-include on lines 28-29 is honored by git — `git check-ignore` exits 1 — but not by ripgrep's directory prune). All counts below were re-verified with `rg --no-ignore` (excluding `node_modules`/`testing`) to guarantee completeness. The only `code/src` source path affected was `secrets/` (3 files, all §ARC-5; zero fs writes).

---

## 3. Forward-Scan Totals (verified with `--no-ignore`)

| Pattern | Raw occurrences | Real executable code (non-comment) | Recon ballpark | Match? |
|---|---|---|---|---|
| `fs.*Sync` WRITES | **262** (56 files) | ~261 (≥1 comment match, e.g. `apiServer.js:2200`) | ~262 | ✅ EXACT |
| `child_process` (module importers) | 8 files | **8 files** | 21 | ⚠️ see note |
| direct `fetch(` | 1 code + 9 comments | **1** (`cognitive/drivers/openai_driver.js:187`) | 10 | ⚠️ see note |
| `new OpenAI(` | 1 code + 7 comments | **1** (`_contract/openAiAdapter.js:24` — SANCTIONED) | 8 | ⚠️ see note |

**Discrepancy explanation (material, flagged):** the recon ballpark for `child_process`/`fetch`/`new OpenAI` counted **raw text occurrences** — the overwhelming majority of which are **Track A discipline COMMENTS** (`// Track A: no direct fetch()`, etc.), plus `.exec(` regex false-positives, a node-builtin denylist *string* (`conversationEngine.js:1428`), and `SCHEMA.md` doc lines. The **real executable forbidden-code surface** for those three categories is tiny: **8 / 1 / 1**, and every one is either authorized or legacy (detailed below). Only the WRITES total (262) reflects actual `fs.*Sync` calls and matches exactly.

### §2 path-based split of the 262 writes

| Bucket | Writes | Files |
|---|---|---|
| **SANCTIONED** (`runtime/tools/*`) | **17** | 5 — `state_tools`(2), `artifact_tools`(4), `fs_tools`(6), `env_tools`(2), `project_tools`(3) |
| **AUTHORIZED** (§ARC scopes, strict) | **24** | `agents/cost_ledger`(2)+`_activity_emitter`(2) [§ARC-1]; `live_smoke_runner`(2) [§ARC-2]; `kb/manifests`(6)+`kb/cost_ledger`(3) [§ARC-4]; `log_writer`(8) [§ARC-6]; `apiServer` writeFileSync@2210 (1) [§ARC-8] |
| **UNLEDGERED** | **221** | 45 files (see §4) |

`child_process` split: AUTHORIZED = `harness_runner` [§ARC-3] + `windows_credential_manager`/`mac_keychain`/`linux_secret_service` [§ARC-5]; SANCTIONED = `env_tools`/`shell_tools` [tools]; UNLEDGERED = `codexProvider`, `nodeSmokeCheck` (both legacy domain).

---

## 3.5 — CTO Verification Correction (TRUE-DRIFT revised from 0)

The first pass scoped the reachability check to **`ai_os/` only** and concluded TRUE-DRIFT = 0. **That was a material error.** The live surface is `start-api.js → apiServer.js` (ALL routes) **+ `ai_os/*` + `runtime/*`** — not `ai_os/` alone.

**Full-live-surface reachability re-run** (grep of every `require()` of `modules/` | `execution/` | `cognitive_adapter` | `orchestrator/` | `forge/` across `apiServer` + `ai_os` + `runtime` + `start-api.js`):

- `ai_os/` → **0** legacy imports.
- `runtime/` → **0** legacy imports.
- `start-api.js` → only `forge_root_guard` + `env_loader` (§ARC-7) + `apiServer` (no legacy).
- `apiServer.js` → **exactly two** legacy imports (lines 19-20): `visionComplianceGate`, `specCompletenessEnforcer` — both exposed as **live HTTP routes** (`2094-2102`). These are **ACTIVE governance modules** (Blueprint KEEP/Activated), NOT legacy/dormant.

**Verdict on the heavy self-build cluster: still unreachable.** `task_registry`, the other 30 `modules/*`, `cognitive/*`, `orchestrator/*`, `forge/*` are reached only through each other — never from the live surface. The earlier conclusion holds *for them*.

**Reclassifications (with call-site evidence):**

- `modules/specCompletenessEnforcer.js` (2 writes: `writeFileSync@17` + `mkdirSync@11`, reached via `runSpecCompletenessEnforcer@85` ← `POST /api/governance/spec-completeness` @2099-2102) → **LEGACY → TRUE-DRIFT.** A reachable side effect through direct fs — not re-entrancy, not bootstrap, not inside an L2 tool. Migrate `writeJson`/`ensureDir` to `reg.invoke("fs.write_file")`. **NOT a ledger entry** (it is a reachable violation, not an authorized exception).
- `modules/visionComplianceGate.js` → reachable via `POST /api/governance/vision-compliance`, but `runVisionComplianceGate` is a **backwards-compat shim returning a neutral PASS with ZERO fs ops** (PHASE-7-A removed all direct fs; never appeared in the write tally). → **reachable, Track-A-clean (0 writes).**
- `workspace/apiServer.js:93 ensureDir` (`mkdirSync` on `projectsRoot`) — call sites `808` (`persistProjectState@798`) and `863` (`listProjects@858`), **both request-handler-reachable** (project list/persist responses) → **TRUE-DRIFT** (1 write). NOT boot-only. (apiServer's own `writeJson@803` is an `async` `reg.invoke` wrapper — Track A clean — which is why it never appeared in the scan.)

**Revised TRUE-DRIFT = 3 writes / 2 files.** Three buckets are now kept separate: **migrate** (TRUE-DRIFT, live path) · **new §ARC entries** (LEDGER-GAP) · **owner decision** (unreachable legacy).

---

## 4. Per-File Judgment of UNLEDGERED Writes (221 writes / 45 files)

> **Read §3.5 first** — the live-reachability correction reclassifies `specCompletenessEnforcer` and `apiServer.js:93` out of the buckets stated below.

### 4a. LEDGER-GAP — Group 1: runtime/live-domain (genuine §ARC-family reason, unrecorded)

| File | Writes | A/B | Exception family | Rationale |
|---|---|---|---|---|
| `runtime/permission/permissionPolicy.js` | 2 | **A** | re-entrancy (§ARC-1/6) | L3 layer audits its **own** decisions (`permission_audit.jsonl` + `tool_audit.jsonl`); every L2 `fs.write_file` calls `permissionPolicy.authorize()` → routing the audit through L2 = infinite recursion. |
| `runtime/audit/toolAuditLog.js` | 2 | **A** | re-entrancy/hot-path (§ARC-6) | Cross-cutting tool-audit JSONL appended on **every** L2 invocation; routing through L2 = circular + hot-path latency. (`tool_audit.jsonl` is §7-gitignored telemetry.) |
| `providers/_contract/providerTrace.js` | 3 | **A** | below-L2 + re-entrancy (§ARC-1) | L1 Provider-Contract forensic trace (`artifacts/llm/*`) + cost ledger on every LLM call; the provider layer sits **beneath** L2. Direct sibling of §ARC-1 `cost_ledger`. |
| `runtime/logging/metrics_initializer.js` | 2 | **A** | pre-runtime bootstrap (§ARC-7) | Boot hook patching `status.json` before `server.listen()`, before the Tool Registry exists. **Self-documented** as a ledger-adjacent exception (lines 6-10); §ARC-7 already cites it as same-family. |
| `runtime/doctor/runDoctor.js` | 3 | **A** | bootstrap/diagnostic + re-entrancy (§ARC-7) | L4 health writes its report + patches `status.json`; cited as the *codebase precedent* by §ARC-7 and by `metrics_initializer`. Doctor inspecting the registry then invoking a tool to write its own report = circular. |
| `runtime/builtproject/verdict_aggregator.js` | 3 | **A** | builtproject harness, external root (§ARC-3/2) | Writes `forge_tests/last_report.json` into the **project-under-test's** root (a different workspace); Forge's L2 `fs.write_file`/L3 are scoped to the Forge root and would deny. **⚠ Its inline comment MIS-CITES "§ARC-1"** — the ledger's §ARC-1 does not list this file. |
| `runtime/builtproject/loopback_signal.js` | 3 | **A** | builtproject harness, external root (§ARC-3/2) | Writes `forge_tests/loopback_signal.json` into the project-under-test. Same rationale + **same §ARC-1 mis-citation** as `verdict_aggregator`. |

**Group 1 subtotal: 7 files / 18 writes — all LEDGER-GAP (A).**

### 4b. LEGACY pre-L2 self-build engine (acknowledged pre-existing; NOT in the live AI-OS pipeline)

This cluster is the **Forge-v1 "Forge-builds-itself" engine** — `modules/` ↔ `execution/task_registry.js` ↔ `cognitive/cognitive_adapter.js` ↔ `orchestrator/{runner,autonomous_runner,status_writer}.js` ↔ `forge/forge_state_writer.js`. **Verified via full-live-surface import graph (§3.5):** the heavy self-build cluster is `require`d only through itself — never from `apiServer` / `ai_os` / `runtime` / `start-api`. It is a self-contained, `ROOT`-anchored, direct-fs cluster that **predates the entire L1–L4 runtime**. `stage_20_mid.md` explicitly accepted "pre-existing exceptions in cognitive/, execution/ unchanged."

> **EXCEPTION (corrected in §3.5):** two `modules/*` files — `specCompletenessEnforcer.js` and `visionComplianceGate.js` — ARE live-reachable via `apiServer` governance routes and are therefore **removed from this legacy cluster**. `specCompletenessEnforcer` → TRUE-DRIFT (§5); `visionComplianceGate` → reachable+clean (0 writes).

| Sub-group | Files | Writes | Notes |
|---|---|---|---|
| `modules/*` (Stage A/B/C engine + validators) | 30 | 101 | `verifyEngine`(12), `decisionGate`(7), `executeEngine`(7), `closureEngine`(6), `backfillEngine`(6), `auditEngine`(5), `nodeSmokeCheck`(5, +`child_process.execSync`), … (excludes `specCompletenessEnforcer` → TRUE-DRIFT, and `visionComplianceGate` → reachable+clean, 0 writes) |
| `execution/task_registry.js` | 1 | 82 | TASK-0xx self-build closure-artifact writers (`ROOT`-anchored). |
| `cognitive/cognitive_adapter.js` (+`drivers/openai_driver.js`) | 1 (+1) | 5 | Alternate provider subsystem; `openai_driver.js:187` is the **only real direct `fetch()`** — a legacy L1 bypass of Provider Contract v2. |
| `orchestrator/{runner,autonomous_runner,status_writer}.js` | 3 | 8 | Self-build CLI entry points (CLAUDE.md §10 interim cmd) + `status.json` writer. |
| `forge/forge_state_writer.js` | 1 | 2 | Forge-state cache writer (used only by `autonomous_runner`). |
| `providers/codexProvider.js` | — | — | `child_process.{execFile,exec,spawn}` legacy provider (no fs writes). |

**Group 2 subtotal (corrected): 36 files / 198 writes** (was 37/200 — `specCompletenessEnforcer` moved to TRUE-DRIFT per §3.5). Classification = **(A) LEDGER-GAP under a NEW "pre-L2 legacy domain" family**, *with the caveat that a strict 4-family reading would call them (B)*. They are unreachable from the live surface (you would not migrate dead/legacy code to `reg.invoke`); the correct resolution is an **owner/CTO decision** (ledger-as-legacy vs. quarantine vs. migrate). This is the audit's central open question (§7/§8).

### 4c. `apiServer.js` residual (live domain)

`apiServer.js` has 4 pattern-occurrences: `2200` (a §ARC-8 **comment** — not code), `2210` writeFileSync (§ARC-8 AUTHORIZED), `2206` mkdirSync (companion *inside* the §ARC-8 upload handler — within intent but not named by the ledger wording → §ARC-8 wording-extension), and `93` `ensureDir` mkdir. Per §3.5, `93` is **request-handler-reachable** (`listProjects@858` / `persistProjectState@798`) → **TRUE-DRIFT** (see §5), NOT bootstrap.

### 4d. TRUE-DRIFT (B) — REVISED after CTO verification (see §3.5)

**3 writes / 2 files** (was erroneously reported as 0). `modules/specCompletenessEnforcer.js` (2 — reachable via `POST /api/governance/spec-completeness`) and `apiServer.js:93 ensureDir` (1, `mkdirSync` on `projectsRoot` — reachable via `listProjects`/`persistProjectState`). Both are reachable side effects through direct fs (not re-entrancy, not bootstrap, not inside an L2 tool). `conversationEngine.js` / `runtime/orchestration/*` remain clean (the `fs.*Sync=2` in conversationEngine are reads). Detail + migration notes in §5.

---

## 5. Corrected Split + TRUE-DRIFT Table

**Corrected UNLEDGERED breakdown (221 writes), per CTO §3.5 correction:**

| Sub-bucket | Writes | Files |
|---|---|---|
| LEDGER-GAP (runtime, Group 1) | 18 | 7 |
| **TRUE-DRIFT (live-reachable)** | **3** | **2** |
| unreachable-legacy (Group 2) | 198 | 36 |
| §ARC-8 companion mkdir (`apiServer:2206`) | 1 | (apiServer) |
| non-executable comment (`apiServer:2200`) | 1 | (apiServer) |

**Full split of 262:** SANCTIONED **17** · AUTHORIZED **24** · UNLEDGERED **221** (= 18 LEDGER-GAP + 3 TRUE-DRIFT + 198 unreachable-legacy + 2 apiServer residual).

**TRUE-DRIFT table:**

| File | Writes | Reachable via | Why it violates | Migration note |
|---|---|---|---|---|
| `modules/specCompletenessEnforcer.js` | 2 (`writeFileSync@17`, `mkdirSync@11`) | `POST /api/governance/spec-completeness` → `runSpecCompletenessEnforcer@85` | direct fs on a live route — not re-entrancy / bootstrap / L2 / binary | migrate `writeJson`/`ensureDir` → `reg.invoke("fs.write_file")` |
| `workspace/apiServer.js` (`ensureDir@93`) | 1 (`mkdirSync`) | `listProjects@858` / `persistProjectState@798` request handlers | `mkdirSync` on `projectsRoot` reachable at request time | route the mkdir through an L2 ensure-dir / `fs.write_file` (low severity — idempotent) |

> Not a ledger entry — both are **reachable violations** to migrate, distinct from authorized §ARC exceptions.

---

## 6. Reverse Check (ledger → code): all 8 §ARC entries

| Entry | File(s) | Pattern present? | Stale? | Note |
|---|---|---|---|---|
| §ARC-1 | `agents/cost_ledger.js`, `_activity_emitter.js`, `_prompt_loader.js`, `_role_registry.js` | ✅ (loaders do reads; cost_ledger/emitter do writes) | No | Ledger says "reads/writes"; prompt/role loaders are read-only — accurate. |
| §ARC-2 | `live_smoke_runner.js` | ✅ writeFileSync/mkdirSync | No | |
| §ARC-3 | `harness_runner.js` (+ `bin/forge-install.js`, `scripts/install/*`) | ✅ `child_process.spawn`; install scripts present | No | Install scripts marked "deprecated" in `stage_12_7` (superseded by `INSTALL_FORGE.bat`/pm2) **but files still exist** → "deprecated-but-present," not stale. |
| §ARC-4 | `kb/manifests.js`, `kb/cost_ledger.js` | ✅ | No | |
| §ARC-5 | `secret_provider.js`, `windows_credential_manager.js`, `mac_keychain.js`, `linux_secret_service.js` | ✅ `execFile(Sync)` in the 3 platform modules | No (minor) | `secret_provider.js` is the **dispatcher** — it does NOT itself contain `execFile`; the pattern lives in the 3 platform modules. Ledger wording could be tightened. |
| §ARC-6 | `logging/log_writer.js` | ✅ | No | |
| §ARC-7 | `startup/env_loader.js` | ✅ `readFileSync@16` in `loadDotEnv` | No | Single read, scope honored. |
| §ARC-8 | `workspace/apiServer.js` upload handler | ✅ writeFileSync@2210 | No (minor) | Ledger says "single writeFileSync"; a companion `mkdirSync@2206` in the same handler is unnamed — wording extension recommended. |

**Stale entries: 0.** Minor wording-refinement flags: §ARC-5 (dispatcher precision), §ARC-8 (companion mkdir), §ARC-3 (deprecated-but-present install scripts).

---

## 7. Recommendation (proposal only — owner-gated)

1. **The §ARC count should increase from 8.** Propose **+2 firm new entries** plus **1 owner-decision entry**:
   - **NEW §ARC-9 — Runtime self-audit / forensic-trace / bootstrap re-entrancy:** enumerate `permissionPolicy.js` (L3 self-audit), `toolAuditLog.js` (cross-cutting tool audit), `providerTrace.js` (L1 forensic + cost), `metrics_initializer.js` (boot hook), and formalize `runDoctor.js` (L4 report + status patch). Family = §ARC-1/6/7. (5 files, 12 writes.)
   - **NEW §ARC-10 — Built-project harness result writers:** `verdict_aggregator.js` + `loopback_signal.js` (external-project-root writes). **Also fix their incorrect inline "§ARC-1" comments.** Family = §ARC-3/§ARC-2. (2 files, 6 writes.)
   - **DECISION-GATED §ARC-11 (or a "legacy domain" exclusion):** the unreachable pre-L2 self-build engine (`modules/` [minus the 2 governance modules], `execution/`, `cognitive/`, `orchestrator/`, `forge/`) — 36 files / 198 writes + 2 `child_process` + 1 `fetch`. **Do not auto-ledger;** requires the §8 owner decision.
2. **Wording refinements** to existing entries: §ARC-8 (cover companion `mkdirSync@2206` in the upload handler), §ARC-5 (note `execFile` lives in platform modules, `secret_provider` is dispatcher), §ARC-3 (note install scripts deprecated-but-present). *(NOTE: `apiServer:93 ensureDir` is NOT a §ARC-8 wording matter — it is TRUE-DRIFT to migrate, per §3.5/§5.)*
3. **Files needing TRUE-DRIFT migration: 2 (3 writes)** — `modules/specCompletenessEnforcer.js` (migrate `writeJson`/`ensureDir` → `reg.invoke`) and `apiServer.js:93 ensureDir` (route the `projectsRoot` mkdir through L2). These are **reachable violations, NOT ledger entries** — keep them in a separate "migrate" bucket from the LEDGER-GAP (new §ARC) and unreachable-legacy (owner-decision) buckets.
4. **Methodology fix for future Track A audits:** always scan with `rg --no-ignore` (or scan `secrets/` explicitly) — the default gitignore-respecting scan silently omits `code/src/runtime/secrets/`.
5. Consider adding a short ledger preamble clarifying that `runtime/tools/*` is the **sanctioned L2 home** (SANCTIONED ≠ exception), so future audits don't miscount it as drift.

**Net proposed ledger movement:** 8 → **10** firm (+§ARC-9, +§ARC-10), with §ARC-11/legacy-domain pending the §8 decision.

---

## 8. Open Questions for Owner / CTO

1. **Unreachable legacy self-build engine (198 writes / 36 files):** ledger it as a bounded "legacy domain" exception, **quarantine** it (mark out-of-Track-A-scope), or **migrate** it? Is it still invoked at all (e.g., `bin/forge` → `orchestrator/runner.js` / `autonomous_runner.js` self-build CLI), or is it dead?
2. **`cognitive/drivers/openai_driver.js` direct `fetch()`** bypasses Provider Contract v2 (L1). Same legacy decision as #1 — confirm it is unreachable from any live path before disposition.
3. Approve the **+2 firm new §ARC entries** (§ARC-9, §ARC-10) and the wording refinements (§ARC-3/5/8)?
4. Approve fixing the **mis-cited "§ARC-1" comments** in `verdict_aggregator.js` / `loopback_signal.js` as part of a future (separate, write-enabled) remediation phase?
5. Should the ledger preamble formally state that `runtime/tools/*` is the sanctioned L2 home (not an exception)?

> **No remediation performed.** This artifact is the sole output. `18_AGENT_ROLES_CONTRACT.md` and `status.json` are UNTOUCHED. Awaiting CTO verification.

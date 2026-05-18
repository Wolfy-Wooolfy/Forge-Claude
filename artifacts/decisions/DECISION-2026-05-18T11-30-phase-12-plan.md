# PHASE-12 Plan — Personal Production Setup

| Field | Value |
|---|---|
| **Decision ID** | DECISION-2026-05-18T11-30-phase-12-plan |
| **Date** | 2026-05-18 |
| **Phase** | PHASE-12 |
| **Stage** | 12.0 — Plan + Contract Design |
| **Author** | Claude (CTO advisor) |
| **Status** | PROPOSED — awaiting Stage 12.0 closure |
| **Closure status** | CLOSED after Stage 12.7 closes |
| **Parent** | `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-12 row (amended by `DECISION-2026-05-18T12-00-roadmap-phase-12-amendment.md`) |
| **Supersedes** | None |
| **References** | `DECISION-20260515-1600-phase-11-plan.md` (format reference) |
| **OQ sweep** | `artifacts/audit/phase_12_oq_sweep.md` (9 findings, 0 unresolved BLOCKERs) |
| **Mid-checkpoint** | `artifacts/decisions/_phase_12_checkpoints/stage_12_0_mid.md` (owner-approved 2026-05-18) |

---

## §1 — Stage Decomposition (12.0 through 12.7)

| Stage | Title | Live Cost Cap | Key Deliverables | Effort |
|---|---|---|---|---|
| **12.0** | Plan + Contract Design | $0.00 | Plan artifact (A), OQ sweep (B), roadmap amendment (C), Stage 12.0 closure (D) | 0.5 days |
| **12.1** | Service Lifecycle | $0.00 | `scripts/service/` (NSSM, Task Scheduler, systemd, launchd), 3 new scenarios, Doctor check `service_lifecycle` | 1.5–2 days |
| **12.2** | Secret Storage | $0.00 | `code/src/runtime/secrets/secret_provider.js` + 4 sub-providers, `backup_tools.js` dry-run dependency, 3–4 scenarios, §ARC-5 ledger entry | 1.5–2 days |
| **12.3** | Backup System | $0.00 | `code/src/runtime/tools/backup_tools.js` (create/verify/export/restore), Doctor check `backup_status`, 3–4 scenarios | 1–1.5 days |
| **12.4** | Monitoring + Doctor | $0.00 | `code/src/runtime/logging/log_writer.js` (10 MB × 5 rotation), `metrics_window_24h` in status.json, 3 new Doctor checks, webhook surface (disabled by default), 2–3 scenarios, §ARC-6 ledger entry | 1.5–2 days |
| **12.5** | Security Model | $0.00 | `server.listen('127.0.0.1', ...)`, capability token flow, UID/SID pinning, 3 new Doctor checks, `web/.forge-session` guard, 3–4 scenarios | 1.5–2 days |
| **12.6** | INSTALL.md + Docs | $0.00 | `INSTALL.md` (Windows/Linux/macOS sections), `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md`, no new scenarios | 0.5–1 day |
| **12.7** | Full Closure Suite | $0.00 | Full scenario suite pass (all PHASE-12 scenarios), Windows clean-machine walkthrough evidence, PHASE-12 closure decision artifact | 0.5–1 day |
| — | **Total** | **$0.00** | All mock-only, no live API calls | **8–10 days** |

### Estimated Scenario Delta

| Stage | Scenarios Added | Cumulative |
|---|---|---|
| 12.0 | 0 | 184 (baseline) |
| 12.1 | S190–S192 (3) | 187 |
| 12.2 | S193–S196 (4) | 191 |
| 12.3 | S197–S200 (4) | 195 |
| 12.4 | S201–S203 (3) | 198 |
| 12.5 | S204–S207 (4) | 202 |
| 12.6 | 0 | 202 |
| 12.7 | S208–S209 (2, regression) | 204 |
| **Total new** | **+20** | **204** |

Estimated range: +14 to +20 scenarios. Exceeds the plan prompt floor of "+12 to +18"
by a small margin — accepted.

---

## §2 — Owner Decisions D1–D5 (CTO-Ratified, Binding Inputs)

The following 5 decisions are pre-approved by the owner as of 2026-05-18 (GO message
+ mid-checkpoint approval). They are recorded verbatim as binding inputs to this plan.
Subsequent stages may not modify these decisions without a new decision artifact and
explicit owner re-approval.

---

### D1 — Deployment Surface: Hybrid Native-first + Container-second

**Tier 1 — Primary (all Stage 12.7 closure scenarios verify here):**
Windows native service management. Two equal-status options — owner selects at
INSTALL.md walkthrough:
- **Option A: NSSM (Non-Sucking Service Manager)** — preferred for richer crash
  recovery and service dependency management.
  - Version pinned: `2.24`
  - Official download URL: `https://nssm.cc/release/nssm-2.24.zip`
  - SHA-256 hash of installer zip: documented in `INSTALL.md §Windows Service` when
    Stage 12.6 closes (must be computed at that time from the official release)
  - Manual installation only; Forge scripts NEVER auto-download NSSM
  - Requires Administrator rights for service installation
- **Option B: Windows Task Scheduler** — preferred for zero third-party dependencies.
  - Uses `schtasks /create` commands; documented verbatim (copy-paste ready) in
    `INSTALL.md §Windows Service`
  - No elevated rights required for user-level tasks (TASK_LOGON_S4U)

Forge service scripts live in `scripts/service/` (NOT in `code/src/`). They are
operational artifacts, not Forge runtime. No §ARC exemption required.

**Tier 1 — Ship + Review (no Stage 12.7 closure verification required):**
- Linux: `scripts/service/forge.service` (systemd unit file)
- macOS: `scripts/service/com.forge.api.plist` (launchd plist)

These are produced in Stage 12.1 and reviewed for correctness, but the Stage 12.7
closure gate does NOT require verified boot testing on Linux or macOS (Windows-first
verification is the gate). The Roadmap amendment (Deliverable C) documents this
deviation from the original roadmap row.

**Tier 2 — Optional (reuses existing `container_tools.js` from PHASE-7-C):**
- `scripts/service/Dockerfile` (or `compose.yml`) for Docker/Podman container mode
- Produced in Stage 12.1 as a Tier-2 optional artifact
- No closure scenario required for Tier-2

**Roadmap deviation:** The original PHASE-12 row closure gate stated "Linux and macOS"
as the boot-verification targets. Windows is added as Tier-1 primary. This deviation
is documented in `DECISION-2026-05-18T12-00-roadmap-phase-12-amendment.md`.

---

### D2 — Secret Storage: OS-native Keychain with Encrypted-File Fallback

**Provider interface:** `code/src/runtime/secrets/secret_provider.js` (new file,
Stage 12.2). Public API:
```js
// All methods async, Fail-Closed on error
get(key)            → { ok: true, value } | { ok: false, reason }
set(key, value)     → { ok: true } | { ok: false, reason }
delete(key)         → { ok: true } | { ok: false, reason }
provider_type()     → "windows_credential_manager" | "mac_keychain" |
                      "linux_secret_service" | "encrypted_file"
```

**Resolution order (first available wins):**
1. `WindowsCredentialManager` — `code/src/runtime/secrets/windows_credential_manager.js`
2. `MacKeychain` — `code/src/runtime/secrets/mac_keychain.js`
3. `LinuxSecretService` — `code/src/runtime/secrets/linux_secret_service.js`
4. `EncryptedFile` (libsodium sealed box) — `code/src/runtime/secrets/encrypted_file_provider.js`

**Migration strategy (grace period — no breaking change):**
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY` continue to work via
  `process.env`. The secret provider first checks the keychain; falls back to
  `process.env` if the keychain is unavailable or the key is absent.
- Doctor WARN check `secrets_in_env_var` fires when `OPENAI_API_KEY` is present in
  `process.env` AND the OS keychain is available — prompting migration. This is a
  WARN, not FAIL; existing installs are not broken.

**Master password (encrypted-file mode only):**
- Optional via `FORGE_SECRET_KEY` env var
- TTY prompt if absent and TTY available
- Refuse to start (FAIL_CLOSED) if no TTY and no env var and provider=encrypted_file

**Note:** `encrypted_file_provider.js` MUST use L2 `fs_tools.write_file` (it is a
filesystem operation). Only the keychain sub-providers (Windows/Mac/Linux) are
covered by §ARC-5 (see §6).

---

### D3 — Backup: Tiered Local + External + Cloud-Optional

**New L2 tool family:** `code/src/runtime/tools/backup_tools.js` (Stage 12.3):
- `backup.create` — creates `artifacts/backups/<ts>.tar.gz`
- `backup.verify` — verifies integrity of an existing backup archive
- `backup.export` — copies a backup to an external path (USB, NAS)
- `backup.restore` — restores from a backup archive (requires DANGER_FULL_ACCESS mode)

**Default rotation:** 7 daily / 4 weekly / 12 monthly (grandfather-father-son pattern)

**Local tier:** Always-on. Target: `artifacts/backups/<ts>.tar.gz`

**External tier:** Doctor reminder if no external export in 7+ days (WARN, not FAIL)

**Cloud tier:** Interface shipped, NOT enabled by default. Activation requires a
dedicated future decision artifact with owner approval. No cloud provider is
hard-coded in Stage 12.3.

**DEFAULT_EXCLUDE list (verbatim — binding for Stage 12.3 implementation):**
```js
const DEFAULT_EXCLUDE = [
  'artifacts/llm/requests/**',     // contains full prompts → PII risk
  'artifacts/llm/responses/**',    // contains full model output → PII risk
  'artifacts/backups/**',          // prevent backup-in-backup
  '.env',
  '*.env',
  'node_modules/**'
];
// artifacts/llm/metadata/** is KEPT IN BACKUP — no PII per Blueprint Part B §L1
// (metadata = {provider_id, model, tokens, latency_ms, cost_estimate} only)
```

Owner can add entries via `FORGE_BACKUP_EXCLUDE` env var (comma-separated glob
patterns appended to the default list; cannot remove defaults via env var).

**Reference:** `INSTALL.md §Backup` (Stage 12.6) documents PII risk and exclude list.

---

### D4 — Monitoring: Logs + Structured Metrics + Opt-in Alerts

**Log files:**
- `logs/forge.log` — INFO/WARN/ERROR, rolling rotation: 10 MB × 5 files
- `logs/forge.error.log` — ERROR only (subset of forge.log), same rotation policy
- Log writer: `code/src/runtime/logging/log_writer.js` (new file, Stage 12.4)
- §ARC-6 applies (see §6 below) — direct `fs.appendFileSync`, bypasses L2 overhead

**Metrics — additive extension to `status.json`:**
`runtime_health.metrics_window_24h` subfield added (additive, no breaking change —
confirmed in OQ-5):
```json
"metrics_window_24h": {
  "window_start_ts": "2026-05-18T00:00:00.000Z",
  "api_requests_total": 0,
  "api_errors_total": 0,
  "provider_calls_total": 0,
  "provider_cost_usd": 0.0,
  "backup_last_created_ts": null,
  "backup_last_verified_ts": null
}
```

**Alerts:** Webhook surface shipped DEFAULT DISABLED. Activation via:
- `FORGE_ALERT_WEBHOOK_URL` env var, OR
- Future decision artifact
Supported targets at ship: Discord webhook, Slack incoming webhook, SMTP (as
documented in `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md §Alerts`).

---

### D5 — Security Model: Localhost Binding + Capability Tokens + UID Pinning

**Server binding (Stage 12.5):**
```js
// Before (OQ-2 finding):
server.listen(port, () => resolve({ port }));

// After (D5 resolution):
const host = process.env.FORGE_BIND_HOST || '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost') {
  logger.warn(`[SECURITY] Server bound to non-localhost: ${host}`);
}
server.listen(port, host, () => resolve({ port, host }));
```

**Capability token:**
- 32-byte cryptographically random token (`crypto.randomBytes(32).toString('hex')`)
- Generated at every server start (not persisted to disk in plaintext; stored via D2
  secret provider under key `forge.capability_token`)
- Required on all API endpoints as `Authorization: Bearer <token>` header
- Injected to web UI via `web/.forge-session` (see defensive measures below)
- Doctor check `api_auth_token`: PASS if token is present and valid in keychain

**`web/.forge-session` defensive measures (OQ-8 resolution):**
- File format: first line = `# FORGE-SESSION — DO NOT SERVE EXTERNALLY`, second
  line = JSON `{"token":"<hex>","ts":"<iso>"}` — guard comment prevents accidental
  `JSON.parse` of the full file
- `apiServer.js` explicitly blocks any request to paths matching `**/.forge-session`
  with HTTP 404 + WARN log entry
- `INSTALL.md §Security` documents: "The `web/` directory MUST NOT be served by any
  external HTTP server"

**UID/SID pinning:**
- On first start, Forge records the OS user identity: `process.env.USERNAME` (Windows)
  / `process.env.USER` + `process.getuid()` (Linux/macOS) in `progress/uid_pin.json`
- On subsequent starts: compares current identity to pinned identity; refuses to
  start (FAIL_CLOSED) if mismatch, with error:
  `[FATAL] UID mismatch: expected <pinned>, got <current>. To re-claim, delete progress/uid_pin.json and write a decision artifact.`
- Re-claim procedure: delete `progress/uid_pin.json` + write a decision artifact
  documenting the re-claim; next start re-pins the new identity
- Doctor check `uid_pin_match`: PASS if current identity matches pinned identity

**OQ-2 re-open condition (binding — verbatim from owner approval):**
If Stage 12.5 is descoped or deferred to a future phase, OQ-2 BLOCKER re-opens and
PHASE-12 cannot close without a separate STOP-AND-REPORT to the owner documenting
the residual risk.

---

## §3 — Stage Acceptance Criteria

### Stage 12.1 — Service Lifecycle

**Deliverables:**
- `scripts/service/` directory with:
  - `windows_nssm_install.bat` (NSSM option A)
  - `windows_task_scheduler_install.bat` (Task Scheduler option B)
  - `forge.service` (Linux systemd unit file, Tier 1 review only)
  - `com.forge.api.plist` (macOS launchd plist, Tier 1 review only)
  - `Dockerfile` (Tier-2 optional, based on PHASE-7-C container_tools.js)
- `code/src/runtime/doctor/checks/service_lifecycle.js` (new Doctor check)
- Scenarios: S190 (NSSM script structure validates), S191 (Task Scheduler script
  structure validates), S192 (Doctor check service_lifecycle registered and returns
  INFO on non-Windows)

**Acceptance criteria:**
- `node bin/forge-doctor.js` → new `service_lifecycle` check in output
- `node bin/forge-test.js` → S190, S191, S192 PASS (0 FAIL)
- `scripts/service/` files are syntactically valid (bat files parse, systemd unit
  passes `systemd-analyze verify` on Linux CI — optional, INFO only on non-Linux)
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_1_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-stage-12-1-closure.md`

---

### Stage 12.2 — Secret Storage

**Deliverables:**
- `code/src/runtime/secrets/secret_provider.js` (orchestrator + resolution order)
- `code/src/runtime/secrets/windows_credential_manager.js`
- `code/src/runtime/secrets/mac_keychain.js`
- `code/src/runtime/secrets/linux_secret_service.js`
- `code/src/runtime/secrets/encrypted_file_provider.js` (uses L2 `fs_tools.write_file`)
- `code/src/runtime/doctor/checks/secrets_in_env_var.js` (WARN if key in env + keychain
  available)
- `code/src/testing/helpers/secrets_test_helper.js`
- Scenarios: S193 (get/set/delete round-trip on mock provider), S194 (env-var fallback
  when keychain unavailable), S195 (Doctor WARN when OPENAI_API_KEY in env + keychain
  available), S196 (encrypted_file_provider uses fs_tools, not direct fs.*Sync)
- §ARC-5 added to `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table

**Acceptance criteria:**
- All 4 sub-providers load without error (module-level require)
- `secret_provider.js` resolution order tested end-to-end with mock provider
- `encrypted_file_provider.js` Track A grep: zero direct `fs.*Sync` calls (uses L2)
- §ARC-5 entry written in `18_AGENT_ROLES_CONTRACT.md` (authorized by this plan §6)
- S193–S196 all PASS
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_2_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-stage-12-2-closure.md`

---

### Stage 12.3 — Backup System

**Deliverables:**
- `code/src/runtime/tools/backup_tools.js` (4 tools: create/verify/export/restore)
- `code/src/runtime/doctor/checks/backup_status.js` (WARN if no backup in 7+ days;
  INFO if no external export in 7+ days)
- `code/src/testing/helpers/backup_test_helper.js`
- Scenarios: S197 (backup.create produces valid tar.gz, DEFAULT_EXCLUDE applied), S198
  (backup.verify detects corruption), S199 (Doctor WARN when no backup in 7+ days),
  S200 (backup.restore restores from archive)

**Acceptance criteria:**
- `backup.create` output excludes `artifacts/llm/requests/**` and
  `artifacts/llm/responses/**` by default
- `artifacts/llm/metadata/**` IS included in backup output (OQ-6 decision)
- `artifacts/backups/**` excluded (no backup-in-backup)
- Doctor check `backup_status` registered and in output
- S197–S200 all PASS
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_3_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-stage-12-3-closure.md`

---

### Stage 12.4 — Monitoring + Doctor Extensions

**Deliverables:**
- `code/src/runtime/logging/log_writer.js` (10 MB × 5 rotation, appendFileSync — §ARC-6)
- `logs/` directory created at first write (or at Forge boot if absent)
- `runtime_health.metrics_window_24h` block added to `progress/status.json` schema
  and populated by a new boot hook
- `code/src/runtime/doctor/checks/logging_status.js` (PASS if `logs/forge.log`
  writable; WARN if log dir missing)
- `code/src/runtime/doctor/checks/metrics_available.js` (PASS if
  `metrics_window_24h` present in status.json)
- `code/src/runtime/doctor/checks/alert_webhook.js` (INFO if no webhook configured;
  PASS if configured and reachable)
- Webhook surface in `code/src/workspace/handlers/alerts.js` (DEFAULT DISABLED —
  endpoint exists but requires `FORGE_ALERT_WEBHOOK_URL` to activate)
- §ARC-6 added to `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table
- Scenarios: S201 (log_writer writes to logs/forge.log, rotates at 10 MB), S202
  (metrics_window_24h field present and structured correctly in status.json), S203
  (Doctor logging_status PASS on writable log dir)

**Acceptance criteria:**
- `log_writer.js` Track A grep: `fs.appendFileSync` direct use confirmed + §ARC-6
  ledger entry written as authorization
- Doctor output includes `logging_status`, `metrics_available`, `alert_webhook`
- S201–S203 all PASS
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_4_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-stage-12-4-closure.md`

---

### Stage 12.5 — Security Model

**Deliverables:**
- `apiServer.js` `server.listen()` changed to bind `127.0.0.1` by default
- `FORGE_BIND_HOST` env var support with WARN logging for non-localhost values
- `start-api.js` passes `host` from server to startup log message
- Capability token: generated at boot, stored via D2 `secret_provider`, injected to
  `web/.forge-session` (with guard comment per OQ-8)
- `web/.forge-session` route block in `apiServer.js` (HTTP 404 + WARN log)
- Auth middleware applied to all API endpoints
- `progress/uid_pin.json` — written on first start, checked on subsequent starts
- `code/src/runtime/doctor/checks/api_binding.js`
- `code/src/runtime/doctor/checks/api_auth_token.js`
- `code/src/runtime/doctor/checks/uid_pin_match.js`
- Scenarios: S204 (server binds 127.0.0.1 by default — no FORGE_BIND_HOST), S205
  (request to /.forge-session returns 404), S206 (unauthenticated API request returns
  401), S207 (UID mismatch triggers FAIL_CLOSED on startup)

**Acceptance criteria (OQ-2 re-open condition applies):**
- `server.listen` arguments verified from source: `(port, '127.0.0.1', callback)`
- S204–S207 all PASS
- Doctor `api_binding`, `api_auth_token`, `uid_pin_match` all PASS in local run
- `web/.forge-session` first line is `# FORGE-SESSION — DO NOT SERVE EXTERNALLY`
- No Track A violations introduced (no new direct `fs.*Sync` outside §ARC-6 scope)
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_5_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-stage-12-5-closure.md`

---

### Stage 12.6 — INSTALL.md + Production Documentation

**Deliverables:**
- `INSTALL.md` (new top-level file) with sections:
  - §Prerequisites (Node ≥20, npm, Git)
  - §Quick Start (clone, npm install, OPENAI_API_KEY, npm start)
  - §Windows Service (Option A: NSSM, Option B: Task Scheduler)
  - §Linux Service (systemd — Tier 1 review)
  - §macOS Service (launchd — Tier 1 review)
  - §Secret Storage (keychain setup, env-var migration path)
  - §Backup (backup.create, DEFAULT_EXCLUDE, export to external)
  - §Monitoring (log files, metrics_window_24h, webhook opt-in)
  - §Security (localhost binding, capability token, UID pinning, web/ warning)
  - §Upgrading (how to upgrade Forge without losing projects)
  - §Troubleshooting (common doctor failures)
- `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` (L0 authority doc for the
  production setup sub-system)
- No new scenarios (documentation-only stage)

**Acceptance criteria:**
- `INSTALL.md` follows from clone to running server in ≤15 steps on Windows
- NSSM version, URL, and SHA-256 hash documented verbatim (computed from official
  release at Stage 12.6 time)
- Task Scheduler fallback documented with verbatim `schtasks` commands
- `web/` external-serve warning documented in §Security
- DEFAULT_EXCLUDE list documented in §Backup with Blueprint §L1 justification for
  metadata inclusion
- `23_PRODUCTION_SETUP_CONTRACT.md` references D1–D5 decisions
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_6_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-stage-12-6-closure.md`

---

### Stage 12.7 — Full Closure Suite

**Deliverables:**
- All PHASE-12 scenarios passing (estimated 184 + 20 = 204 total, 0 FAIL, 5 SKIP)
- Windows clean-machine walkthrough: follow `INSTALL.md` on a clean Windows 10/11
  installation (or a clean Windows user account); document each step's outcome in
  the closure decision artifact
- PHASE-12 closure decision artifact (`DECISION-<ts>-phase-12-closure.md`) with
  Closure Gate checklist
- `progress/status.json` final patch: `current_task = PHASE-12-CLOSED`,
  `next_phase = PHASE-13`
- Scenarios: S208 (PHASE-12 full regression — all components), S209 (Doctor PASS
  with all new PHASE-12 checks passing)

**Acceptance criteria (PHASE-12 overall closure gate — see §5):**
- All 8 stage closures written ✓
- SU baseline updated to 204+ pass, 0 fail, 5 skip
- Track A grep clean (no new §ARC exceptions beyond §ARC-5 and §ARC-6)
- Windows clean-machine walkthrough evidence in closure artifact
- Doctor: all PHASE-12 checks PASS on dev machine
- Mid-checkpoint: `artifacts/decisions/_phase_12_checkpoints/stage_12_7_mid.md`
- Closure: `artifacts/decisions/DECISION-<ts>-phase-12-closure.md`

---

## §4 — Mid-Stage Checkpoint Declarations

Each stage has exactly one mid-checkpoint written before the stage's closure artifact:

| Stage | Mid-Checkpoint Path |
|---|---|
| 12.0 | `artifacts/decisions/_phase_12_checkpoints/stage_12_0_mid.md` (DONE — owner-approved) |
| 12.1 | `artifacts/decisions/_phase_12_checkpoints/stage_12_1_mid.md` |
| 12.2 | `artifacts/decisions/_phase_12_checkpoints/stage_12_2_mid.md` |
| 12.3 | `artifacts/decisions/_phase_12_checkpoints/stage_12_3_mid.md` |
| 12.4 | `artifacts/decisions/_phase_12_checkpoints/stage_12_4_mid.md` |
| 12.5 | `artifacts/decisions/_phase_12_checkpoints/stage_12_5_mid.md` |
| 12.6 | `artifacts/decisions/_phase_12_checkpoints/stage_12_6_mid.md` |
| 12.7 | `artifacts/decisions/_phase_12_checkpoints/stage_12_7_mid.md` |

Each mid-checkpoint MUST include: scope-at-time-of-writing, Track A grep result,
SU suite status (pass/fail/skip), any STOP-AND-REPORT findings, and continuation
confirmation.

---

## §5 — PHASE-12 Overall Closure Gate (Deterministic)

PHASE-12 is closed when ALL of the following are true:

| # | Criterion | Evidence Required |
|---|---|---|
| 1 | All 8 stage closures written (12.0–12.7) | 8 closure decision artifacts on disk |
| 2 | SU baseline updated with PHASE-12 scenarios | `node bin/forge-test.js` → ≥204 pass, 0 fail, 5 skip |
| 3 | Track A grep clean — no new `fs.*Sync`, `new OpenAI()`, `child_process`, `fetch()` outside §ARC ledger | Grep output in closure artifact |
| 4 | Windows clean-machine walkthrough verified per INSTALL.md | Documented step-by-step in Stage 12.7 closure artifact |
| 5 | Doctor: all PHASE-12 checks PASS on dev machine | `node bin/forge-doctor.js` output in closure artifact |
| 6 | `progress/status.json` patched | `current_task = PHASE-12-CLOSED`, `next_phase = PHASE-13` |
| 7 | PHASE-12 closure decision artifact written | `DECISION-<ts>-phase-12-closure.md` |

**OQ-2 re-open condition (binding):**
If Stage 12.5 is descoped or deferred to a future phase, the OQ-2 BLOCKER re-opens
automatically. PHASE-12 cannot close without a separate STOP-AND-REPORT to the owner
documenting the residual network-exposure risk. This condition was ratified by the
owner on 2026-05-18 and is binding for any future descope discussion.

---

## §6 — §ARC Ledger Impact Assessment

**Current §ARC ledger state (4 entries, pre-PHASE-12):**

| ID | Files | Deviation | Authorization |
|---|---|---|---|
| §ARC-1 | `cost_ledger.js`, `_activity_emitter.js`, `_prompt_loader.js`, `_role_registry.js` | Direct `fs` reads/writes (re-entrancy prevention) | DECISION-20260510-1938, DECISION-20260511-1000 |
| §ARC-2 | `live_smoke_runner.js` | Direct `fs.*Sync` (test infrastructure) | DECISION-20260511-1000 |
| §ARC-3 | `harness_runner.js` | `child_process.spawn` (server lifecycle) | DECISION-202605131800 |
| §ARC-4 | `kb/manifests.js + kb/cost_ledger.js` | High-frequency KB writes | PHASE-9 decision artifact |

**PHASE-12 requires exactly 2 new entries (within ≤2 threshold):**

---

### §ARC-5 — Secret Storage Native Bindings

**Authorized by:** Owner sign-off in this plan artifact (DECISION-2026-05-18T11-30-phase-12-plan.md)
**Implementing stage:** Stage 12.2
**Files covered:**
- `code/src/runtime/secrets/secret_provider.js`
- `code/src/runtime/secrets/windows_credential_manager.js`
- `code/src/runtime/secrets/mac_keychain.js`
- `code/src/runtime/secrets/linux_secret_service.js`

**Deviation:** Native OS keychain API calls (not filesystem operations) cannot be
routed through L2 `fs_tools.js`. The keychain API is a platform-specific system call
that does not map to the L2 tool contract's `input_schema` / `output_schema` /
`preview()` / `execute()` semantics. The keychain is addressed via OS-native bindings
(e.g., Windows Credential Manager API, macOS Security framework, Linux Secret Service
D-Bus API).

**NOT covered by §ARC-5:**
`code/src/runtime/secrets/encrypted_file_provider.js` is a filesystem operation and
MUST use L2 `fs_tools.write_file`. Any direct `fs.*Sync` in that file is a Track A
violation, not an §ARC-5 exception.

**When §ARC-5 entry is added to `18_AGENT_ROLES_CONTRACT.md`:** Stage 12.2 closure.

---

### §ARC-6 — High-Frequency Log Writes

**Authorized by:** Owner sign-off in this plan artifact (DECISION-2026-05-18T11-30-phase-12-plan.md)
**Implementing stage:** Stage 12.4
**Files covered:**
- `code/src/runtime/logging/log_writer.js`

**Deviation:** High-frequency `INFO/WARN/ERROR` log writes to `logs/forge.log` and
`logs/forge.error.log` use `fs.appendFileSync` directly, bypassing the L2 Tool
Runtime overhead. Routing every log write through `permissionPolicy.authorize()` →
`tool.execute()` → audit record would introduce unacceptable re-entrancy risk and
latency (every L2 tool call itself generates log entries — circular dependency) and
performance overhead on the hot path. The same rationale applies as §ARC-4 for KB
cost ledger writes.

**NOT covered by §ARC-6:** Any other file that wants to write logs must call
`log_writer.js` via its public API; it may not use `fs.appendFileSync` directly.
§ARC-6 covers only `log_writer.js`.

**When §ARC-6 entry is added to `18_AGENT_ROLES_CONTRACT.md`:** Stage 12.4 closure.

**§ARC ledger after PHASE-12: 6 entries total (§ARC-1 through §ARC-6).**

---

## §7 — Cost Budget

| Stage | Budget | Actual at Close |
|---|---|---|
| 12.0 | $0.00 (planning artifacts only) | TBD at closure |
| 12.1 | $0.00 (mock-only, no live API calls) | TBD |
| 12.2 | $0.00 (mock-only) | TBD |
| 12.3 | $0.00 (mock-only) | TBD |
| 12.4 | $0.00 (mock-only) | TBD |
| 12.5 | $0.00 (mock-only) | TBD |
| 12.6 | $0.00 (documentation-only) | TBD |
| 12.7 | $0.00 (mock-only) | TBD |
| **PHASE-12 Total** | **$0.00 expected** | TBD |

**Hard kill bar:** $3.00 total for PHASE-12 (inherited from task prompt §6).

**Real API call trigger:** If any stage requires a live API call to OpenAI, Anthropic,
or any external service, Claude MUST issue a STOP-AND-REPORT with the call type,
estimated cost, and justification before executing. Owner approval required per call
type. This applies even for debugging purposes.

---

## §8 — Rollback Plan

The following describes how to undo each decision independently. A reader 5 years
from now must be able to undo any single decision without affecting the others.

### Rollback D1 (Service Lifecycle Scripts)

**What to undo:** Remove `scripts/service/` directory and `service_lifecycle` Doctor
check.

**Steps:**
1. Delete `scripts/service/` directory entirely (no code/src impact)
2. Delete `code/src/runtime/doctor/checks/service_lifecycle.js`
3. Remove `service_lifecycle` from `code/src/runtime/doctor/_registry.js`
4. Remove Stage 12.1 scenarios (S190–S192) from `code/src/testing/scenarios/`
5. Patch `progress/status.json` to remove Stage 12.1 tracking
6. Write a decision artifact documenting the rollback reason

**Forge runtime impact:** None. Service scripts are operational artifacts outside
`code/src/`. Forge continues to start via `npm start` or `node start-api.js`.

---

### Rollback D2 (Secret Storage)

**What to undo:** Remove `secret_provider.js` and sub-providers; remove
`secrets_in_env_var` Doctor check.

**Steps:**
1. Delete `code/src/runtime/secrets/` directory
2. Delete `code/src/runtime/doctor/checks/secrets_in_env_var.js`
3. Remove Doctor check from `_registry.js`
4. Any caller that was using `secret_provider.get('OPENAI_API_KEY')` must revert to
   `process.env.OPENAI_API_KEY` — search for `secret_provider` imports in `code/src/`
5. Remove §ARC-5 entry from `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`
6. Write rollback decision artifact

**Migration note:** Existing keychain entries are NOT automatically deleted. If
`OPENAI_API_KEY` was migrated to the keychain, the owner must manually delete it
via the OS keychain management tool (`Credential Manager` on Windows,
`Keychain Access` on macOS, `secret-tool` on Linux).

---

### Rollback D3 (Backup)

**What to undo:** Remove `backup_tools.js` and `backup_status` Doctor check.

**Steps:**
1. Delete `code/src/runtime/tools/backup_tools.js`
2. Remove `backup.create`, `backup.verify`, `backup.export`, `backup.restore` from
   `code/src/runtime/tools/_registry.js`
3. Delete `code/src/runtime/doctor/checks/backup_status.js`
4. Remove from `_registry.js`
5. Remove Stage 12.3 scenarios (S197–S200)
6. Write rollback decision artifact

**Forge runtime impact:** None. Backup artifacts in `artifacts/backups/` are
preserved; they are just no longer managed by Forge. Existing backups remain valid
archives.

---

### Rollback D4 (Monitoring)

**What to undo:** Remove `log_writer.js`, `metrics_window_24h` field, and alert webhook.

**Steps:**
1. Delete `code/src/runtime/logging/log_writer.js`
2. Any caller that imported `log_writer` must revert to `console.log/error`
3. Delete `runtime_health.metrics_window_24h` from `progress/status.json`
4. Delete `code/src/workspace/handlers/alerts.js`
5. Remove alert route from `apiServer.js`
6. Delete Stage 12.4 Doctor checks (`logging_status`, `metrics_available`,
   `alert_webhook`) and remove from `_registry.js`
7. Remove §ARC-6 entry from `18_AGENT_ROLES_CONTRACT.md`
8. Write rollback decision artifact

**Log files:** `logs/forge.log` and `logs/forge.error.log` are NOT deleted by the
rollback — they remain as historical records. The log directory can be manually
deleted if desired.

---

### Rollback D5 (Security Model)

**What to undo:** Revert server binding, remove capability token, remove UID pinning.

**Steps:**
1. Revert `apiServer.js` `server.listen()` to `server.listen(port, callback)` (no
   host argument — reverts to Node default `0.0.0.0`)
2. Remove `FORGE_BIND_HOST` env var handling
3. Remove capability token generation and injection from `start-api.js` /
   `apiServer.js`
4. Remove auth middleware from API endpoints
5. Delete `web/.forge-session` (and any content)
6. Remove the `web/.forge-session` route block from `apiServer.js`
7. Delete `progress/uid_pin.json`
8. Delete Stage 12.5 Doctor checks (`api_binding`, `api_auth_token`, `uid_pin_match`)
9. Write rollback decision artifact

**Security note:** Reverting D5 restores the pre-PHASE-12 network exposure (OQ-2
finding). The rollback decision artifact MUST document this residual risk. The
PHASE-12 Closure Gate criterion #3 (OQ-2 re-open condition) automatically prevents
PHASE-12 from being marked CLOSED with D5 rolled back.

---

**END OF DECISION ARTIFACT — DECISION-2026-05-18T11-30-phase-12-plan**

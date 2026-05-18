# PHASE-12 Open Questions Sweep

**Date:** 2026-05-18
**Stage:** 12.0 — Plan + Contract Design
**Author:** Claude (CTO advisor)
**Format:** Same as `artifacts/audit/phase_11_oq_sweep.md` (PHASE-11 Stage 11.0)

---

## Summary

| Severity | Count |
|---|---|
| BLOCKER (resolved-in-plan) | 1 |
| WARN | 5 |
| INFO | 3 |
| **Total** | **9** |

**Open BLOCKERs (must be zero before Stage 12.1 begins):** 0
All BLOCKERs are resolved-in-plan. OQ-2 re-opens automatically if Stage 12.5 is
descoped or deferred.

---

## Findings

---

### OQ-1 — Roadmap Platform Scope Expansion (Windows + Container)

| Field | Value |
|---|---|
| Doc | `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-12 section, lines 795–808 |
| Section | Closure gate ("Service starts on boot on Linux and macOS") |
| Severity | **WARN** |

**Conflict / Gap:**
Roadmap PHASE-12 row defines the closure gate as: "Service starts on boot on Linux
(systemd) and macOS (launchd)." Owner decisions D1 add Windows as Tier-1 primary
platform (NSSM + Task Scheduler fallback) and Container (Docker/Podman) as Tier-2.
This is additive scope expansion beyond the documented roadmap row.

**Proposed resolution:**
Deliverable C — `DECISION-<ts>-roadmap-phase-12-amendment.md` documents this as
an additive amendment to the roadmap row. The amendment artifact is written in Stage
12.0 alongside this sweep (after owner acknowledges this OQ). The closure gate is
updated in the amendment to reflect Windows-first verification while keeping Linux and
macOS as ship-and-review targets. No PHASE-12 work begins until Deliverable C is
written.

**Resolution stage:** Stage 12.0 — Deliverable C (roadmap amendment artifact).

---

### OQ-2 — `apiServer.js` Binds to All Interfaces by Default (BLOCKER → resolved-in-plan)

| Field | Value |
|---|---|
| Doc | `code/src/workspace/apiServer.js` line 1901 |
| Section | `createWorkspaceApiServer().start()` — `server.listen(port, callback)` |
| Severity | **BLOCKER (resolved-in-plan)** |

**Conflict / Gap:**
`server.listen(port, callback)` with no host argument causes Node.js to bind to
`0.0.0.0` (all network interfaces). On a machine with a routable network interface,
this exposes the Forge API to the local network without authentication. Forge has no
token-based auth today. The `start-api.js` launcher also passes no host argument.

Confirmed from source (line 1901):
```js
server.listen(port, () => resolve({ port }));
```

This is a latent security finding that exists in the current codebase before PHASE-12
begins.

**Proposed resolution:**
Owner decision D5 resolves this in Stage 12.5:
1. `server.listen(port, '127.0.0.1', callback)` as default binding.
2. Override via `FORGE_BIND_HOST` env var (any non-localhost value logs a WARN).
3. Doctor check `api_binding` added in Stage 12.4 that reports WARN if binding is
   not localhost.
4. Capability token required on all API endpoints (Stage 12.5).

**Re-open condition:** If Stage 12.5 is descoped or deferred to a future phase,
this BLOCKER re-opens and PHASE-12 cannot close without a separate STOP-AND-REPORT
to the owner documenting the residual risk.

**Resolution stage:** Stage 12.5 — Security Model implementation.

---

### OQ-3 — `OPENAI_API_KEY` Remains in `process.env` During D2 Migration

| Field | Value |
|---|---|
| Doc | `progress/status.json` `runtime_health` — `openai_api_key` doctor check |
| Section | Doctor check `openai_api_key`: "set, length=51" (reads `process.env.OPENAI_API_KEY`) |
| Severity | **WARN** |

**Conflict / Gap:**
Owner decision D2 introduces an OS-native keychain as the primary secret storage
(`WindowsCredentialManager`, `MacKeychain`, `LinuxSecretService`, `EncryptedFile`
fallback). The existing pattern reads `OPENAI_API_KEY` (and `ANTHROPIC_API_KEY`,
`TAVILY_API_KEY`) directly from `process.env`, which is visible to any process
running under the same OS user (e.g., `ps auxe`, `/proc/<pid>/environ`).

A hard migration (delete env-var support) would break all existing installs silently
at upgrade time. A silent migration (silently preferring keychain when available)
could cause confusing behavior when both are set.

**Proposed resolution:**
Defined in D2: env-var support continues to work. The `secret_provider.js` interface
tries keychain first; falls back to env-var if keychain is unavailable or key is
absent. The Doctor adds a WARN (not FAIL) check `secrets_in_env_var` that fires when
`OPENAI_API_KEY` is detected in `process.env` AND the keychain is available — prompting
the owner to migrate. This ensures existing installs are not broken while nudging
toward the more secure storage path.

Stage 12.4 adds the doctor check. Stage 12.2 implements `secret_provider.js` with
the fallback chain.

**Resolution stage:** Stage 12.2 (`secret_provider.js`), Stage 12.4 (Doctor check
`secrets_in_env_var`).

---

### OQ-4 — §ARC Ledger Requires 2 New Pre-Authorized Entries (§ARC-5, §ARC-6)

| Field | Value |
|---|---|
| Doc | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` — §ARC Exceptions table |
| Section | Current entries: §ARC-1 through §ARC-4 |
| Severity | **WARN** |

**Conflict / Gap:**
The §ARC ledger currently has 4 entries:
- §ARC-1: `cost_ledger.js`, `_activity_emitter.js`, `_prompt_loader.js`,
  `_role_registry.js` — direct `fs` reads/writes (re-entrancy prevention)
- §ARC-2: `live_smoke_runner.js` — direct `fs.*Sync` (test infrastructure)
- §ARC-3: `harness_runner.js` — `child_process.spawn` (server lifecycle management)
- §ARC-4: `kb/manifests.js + kb/cost_ledger.js` — high-frequency KB writes

PHASE-12 decisions D2 and D4 each require a new §ARC entry:

- **§ARC-5 (D2 — Secret storage):** Keychain access on Windows uses
  `node-credential-store` or a similar native binding that calls the OS credential
  manager API. This is a system-level read/write that cannot be routed through the
  L2 `fs_tools.js` infrastructure — it is not a filesystem operation, and the L2
  tool contract (`input_schema`, `output_schema`, `preview()`, `execute()`) does not
  map to platform keychain semantics.
- **§ARC-6 (D4 — Log writes):** High-frequency `INFO/WARN/ERROR` log writes to
  `logs/forge.log` and `logs/forge.error.log` would introduce re-entrancy issues if
  routed through the L2 tool permission path (same rationale as §ARC-4 for KB writes).
  The log writer uses `fs.appendFileSync` directly, bypassing L2 overhead.

Total new entries: 2 — within the ≤2 threshold (no STOP required per task prompt §4).

**Proposed resolution:**
Both §ARC-5 and §ARC-6 are pre-authorized in Deliverable A (plan artifact §6 —
§ARC Ledger Impact Assessment) with explicit owner sign-off language. They are NOT
silently introduced in the implementing stages. The implementing stages (12.2 for
§ARC-5, 12.4 for §ARC-6) reference the plan artifact §6 as their authorization.
`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table is updated when each
implementing stage closes.

**Resolution stage:** Stage 12.0 — plan artifact §6 (pre-authorization). Stages 12.2
and 12.4 add the actual entries to `18_AGENT_ROLES_CONTRACT.md`.

---

### OQ-5 — `metrics_window_24h` Extension to `runtime_health` in `status.json`

| Field | Value |
|---|---|
| Doc | `progress/status.json` — `runtime_health` block |
| Section | Current schema: `last_doctor_run`, `last_doctor_status`, `self_test_*`, etc. |
| Severity | **INFO** |

**Conflict / Gap:**
Owner decision D4 extends the `runtime_health` block in `status.json` with a
`metrics_window_24h` subfield (structured metrics: request counts, error rates,
provider call totals, cost in window). The question is whether this additive change
breaks any existing reader of `runtime_health`.

**Resolution (verified from source):**
`progress/status.json` is read by:
1. `forge-doctor.js` — reads specific named fields (`last_doctor_status`,
   `self_test_scenarios_pass`, etc.). Unknown fields are ignored (plain JS object
   destructuring).
2. `scenario_runner.js` — reads `runtime_health.active_permission_mode` only.
3. `statusEngine.js` — reads/writes top-level fields; `runtime_health` is treated
   as an opaque block for display.

Adding `metrics_window_24h` as a new subfield inside `runtime_health` is additive and
does not conflict with any named access pattern. The existing `status_json_valid`
doctor check validates schema at the top level; it does not enforce a strict schema
on `runtime_health` subfields. No breaking change.

**Resolution stage:** Stage 12.4 (Monitoring implementation) — adds `metrics_window_24h`
to the `runtime_health` block. No pre-change action required.

---

### OQ-6 — Backup Archive May Include LLM Forensic Traces (PII Risk)

| Field | Value |
|---|---|
| Doc | `architecture/FORGE_V2_BLUEPRINT.md` Part B §L1 (trace requirement) |
| Section | "Files 1–3 are forensic trace (mandatory, Fail-Closed)" |
| Severity | **WARN** |

**Conflict / Gap:**
Owner decision D3 creates `artifacts/backups/<ts>.tar.gz` of the full workspace.
`artifacts/llm/requests/<task_id>.json` and `artifacts/llm/responses/<task_id>.json`
contain full prompt text and raw model responses — these are mandatory forensic traces
per Blueprint Part B §L1. They may contain:
- User-provided project descriptions with personal/confidential data
- API key substrings if accidentally included in prompts
- Business-sensitive requirement text

If the owner shares a backup file with a third party (e.g., for support), these
forensic traces are included. The backup tool has no awareness of this risk by default.

Additionally: if `artifacts/backups/` is itself inside the workspace, a subsequent
backup could include prior backup archives, causing exponential size growth and
nested PII exposure.

**Proposed resolution:**
`backup_tools.js` (Stage 12.3) MUST support an `exclude_patterns` config with
these defaults:
```js
const DEFAULT_EXCLUDE = [
  'artifacts/llm/requests/**',
  'artifacts/llm/responses/**',
  'artifacts/backups/**',       // prevent backup-in-backup
  '.env',
  '*.env',
  'node_modules/**'
];
```
`artifacts/llm/metadata/**` (cost/token/latency metadata — no prompt content) is
kept in the backup. The exclude list is documented in `INSTALL.md §Backup` with a
note on PII risk. Owner can add or remove entries via `FORGE_BACKUP_EXCLUDE` env
var (comma-separated glob patterns appended to the default list).

**Resolution stage:** Stage 12.3 — `backup_tools.js` implementation with
`DEFAULT_EXCLUDE` list. Stage 12.6 — `INSTALL.md §Backup` documentation.

---

### OQ-7 — NSSM Third-Party Dependency Audit and Fallback

| Field | Value |
|---|---|
| Doc | Owner decision D1 — "Tier 1 (Primary): Windows native via NSSM, with Task Scheduler fallback" |
| Section | D1 deployment surface definition |
| Severity | **INFO** |

**Conflict / Gap:**
NSSM (Non-Sucking Service Manager) is free and MIT-licensed but is a third-party
Windows binary that Forge cannot audit at source. Risks:
1. If NSSM's download URL changes or the project moves, the installer reference in
   `INSTALL.md` becomes stale.
2. A user who downloads NSSM from an unofficial mirror gets an unverified binary
   running as a Windows service (privilege level).
3. NSSM may not be available on locked-down enterprise Windows installations.

**Proposed resolution:**
In `INSTALL.md §Windows Service`:
1. Document NSSM version pinned (e.g., `2.24`) with official download URL
   (nssm.cc) and SHA-256 hash of the installer binary.
2. Document the Task Scheduler fallback procedure as a first-class alternative —
   any user who cannot or will not use NSSM can use Windows Task Scheduler with
   `schtasks /create` commands documented verbatim (copy-paste ready).
3. Add a note that NSSM installs as a service wrapper and requires admin rights.
4. The Forge startup scripts (`scripts/service/`) do NOT auto-download NSSM;
   installation is always manual with the documented hash check.

**Resolution stage:** Stage 12.6 — `INSTALL.md §Windows Service` documentation.

---

### OQ-8 — Capability Token File in `web/` Directory

| Field | Value |
|---|---|
| Doc | Owner decision D5 — "Capability token: stored in `web/.forge-session`" |
| Section | D5 security model definition |
| Severity | **WARN** |

**Conflict / Gap:**
Owner decision D5 stores the capability token in `web/.forge-session` so the web UI
can read it via a local file reference. The `web/` directory contains static HTML/JS/CSS
assets. If the web directory is ever served by an external HTTP server (nginx, Apache,
IIS, GitHub Pages deployment, etc.) rather than Forge's own API server, a GET request
to `/.forge-session` would return the token.

Even if the current Forge setup never serves `web/` externally, the risk exists if:
1. A user adds a reverse proxy (common in home-lab setups) that proxies `/` to the
   `web/` folder.
2. A user copies the `web/` folder contents to a static hosting service for convenience.
3. A future PHASE-13 frontend rewrite uses a dev server (Vite, Next.js) that may
   accidentally serve all files in its root.

**Proposed resolution:**
Two defensive measures, both implemented in Stage 12.5:
1. `web/.forge-session` file is prefixed with a guard comment that makes it
   non-executable/non-parseable as JSON by accident (e.g., first line
   `# FORGE-SESSION — DO NOT SERVE EXTERNALLY`), followed by a JSON line.
   Any `JSON.parse` that doesn't strip the guard will fail safely.
2. Forge's own API server (`apiServer.js`) explicitly blocks any request to
   paths matching `**/.forge-session` or `**/forge-session` with a 404 and
   a log entry at WARN level.
3. `INSTALL.md §Security` documents: "The `web/` directory MUST NOT be served by
   any external HTTP server. It is only safe to access via Forge's own API server."

**Resolution stage:** Stage 12.5 — security model implementation + `apiServer.js`
route block. Stage 12.6 — `INSTALL.md §Security` documentation.

---

### OQ-9 — Stale Rollup Field `runtime_health.self_test_scenarios_pass`

| Field | Value |
|---|---|
| Doc | `progress/status.json` — `runtime_health.self_test_scenarios_pass` |
| Section | `runtime_health` rollup fields |
| Severity | **INFO** |

**Conflict / Gap:**
`progress/status.json.runtime_health.self_test_scenarios_pass` reads `178`. This is
stale from pre-PHASE-11.6. The authoritative current value is `184`, confirmed from
`phase_11_6.su_baseline.green_phase.pass = 184`. PHASE-11.6 closure patched the
`phase_11_6` block correctly but did not update the `runtime_health` rollup field
`self_test_scenarios_pass`.

This is the kind of silent rollup drift that future readers of `status.json` — or
automated tools that read `runtime_health.self_test_scenarios_pass` as the canonical
count — would assume is current. The doctor check `self_test_harness_available` also
reads from this field.

**Proposed resolution:**
The Stage 12.0 closure decision artifact (Deliverable D) documents this as an
incidental fix under §"Incidental Fixes". The fix is applied in the `status.json`
patch at Stage 12.0 closure:
```json
"runtime_health": {
  "self_test_scenarios_pass": 184,
  "self_test_scenarios_skip": 5,
  "self_test_scenarios_fail": 0,
  "self_test_last_result": "184 passed, 0 failed, 5 skipped — PHASE-11.6 CLOSED. ..."
}
```

No code change required. Documentation-and-patch fix only.

**Resolution stage:** Stage 12.0 closure — `status.json` patch (incidental fix).

---

## Contracts Reviewed

| Contract | Finding |
|---|---|
| `architecture/FORGE_V2_PHASE_ROADMAP.md` PHASE-12 row | OQ-1 |
| `code/src/workspace/apiServer.js` line 1901 | OQ-2 |
| `progress/status.json` `runtime_health` doctor check | OQ-3 |
| `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table | OQ-4 |
| `progress/status.json` `runtime_health` schema | OQ-5 |
| `architecture/FORGE_V2_BLUEPRINT.md` Part B §L1 (trace requirement) | OQ-6 |
| Owner decision D1 (NSSM deployment) | OQ-7 |
| Owner decision D5 (capability token in `web/.forge-session`) | OQ-8 |
| `progress/status.json` `runtime_health.self_test_scenarios_pass` | OQ-9 |

---

**END OF SWEEP**

# DECISION-2026-05-18T12-00 — Roadmap Amendment: PHASE-12 Row

| Field | Value |
|---|---|
| **Date** | 2026-05-18 |
| **Owner** | KhElmasry |
| **Status** | CLOSED |
| **Scope** | Additive amendment to `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-12 row |
| **Amends** | `architecture/FORGE_V2_PHASE_ROADMAP.md`, Section 2, PHASE-12 section (lines 795–808) |
| **Supersedes** | None — purely additive; original row content is preserved below |
| **References** | `DECISION-2026-05-18T11-30-phase-12-plan.md` (owner decisions D1–D5) |

---

## §1 — Purpose

The PHASE-12 roadmap row was written with the following constraints:
- Platform scope: **Linux and macOS only** (systemd + launchd)
- Encrypted key storage: described as "encrypted key storage" (vague; no mechanism specified)
- Security model: implicit (no explicit section)
- Effort estimate: 5–7 days

Owner decision-making during Stage 12.0 (GO message + mid-checkpoint approval on
2026-05-18) produced a materially different scope. This amendment records the
operative PHASE-12 definition as binding for implementation stages 12.1–12.7.

The original row content is preserved in §2. The amended row content is in §3.
Both are recorded here per the amendment pattern established in `DECISION-2026-05-18T10-06-phase-11-6-amendment.md`.

---

## §2 — Original Row Content (preserved, superseded by §3)

```markdown
### **[Track B]** PHASE-12 — Personal Production Setup

**Goal.** Same as old Phase 5: PM2/systemd/launchd, encrypted key storage, backups,
monitoring, INSTALL.md.

**Closure gate.**
- Service starts on boot on Linux (systemd) and macOS (launchd) — verified by a
  separate bash test, not a scenario.
- After a planted crash (`kill -9` of the node process), service restarts within 10 s
  and Doctor reports `recent_execution: PASS`.
- Backup runs nightly via cron and produces a tar.gz under 200 MB for a typical
  workspace.
- INSTALL.md verified by following it on a clean VM.

**Estimated effort.** 5–7 days.

**Depends on.** Everything else.
```

---

## §3 — Amended Row Content (operative — supersedes §2)

```markdown
### **[Track B]** PHASE-12 — Personal Production Setup *(amended 2026-05-18)*

**Goal.** Deploy Forge as a persistent, secure, production-grade service on the
owner's machine. Covers service lifecycle management (OS-native), secret storage
(OS keychain), backup system, monitoring + structured metrics, and a hardened
security model (localhost-only binding, capability tokens, UID pinning). Produces
a verified INSTALL.md.

**Deployment surface (D1 — Hybrid Native-first + Container-second):**
- **Tier 1 — Primary (closure scenarios verify here):** Windows native via NSSM
  (version 2.24, SHA-256 hash in INSTALL.md) or Windows Task Scheduler — owner
  selects; both are equal-status options.
- **Tier 1 — Ship + Review (no closure verification required):** Linux systemd unit
  file, macOS launchd plist.
- **Tier 2 — Optional (no closure verification required):** Docker / Podman
  container definition, reusing existing `container_tools.js` infrastructure from
  PHASE-7-C.

**Secret storage (D2 — OS-native keychain with encrypted-file fallback):**
- Provider interface: `code/src/runtime/secrets/secret_provider.js`
- Resolution order: Windows Credential Manager → macOS Keychain → Linux Secret
  Service → EncryptedFile (libsodium sealed box)
- Env-var fallback continues to work; Doctor WARN (not FAIL) if API keys in env +
  keychain available

**Security model (D5 — Localhost binding + capability tokens + UID pinning):**
- `server.listen()` defaults to `127.0.0.1`; override via `FORGE_BIND_HOST` (WARN logged)
- Capability token: 32-byte random, stored in keychain, required on all API endpoints
- UID/SID pinning: Forge records first-run OS user; refuses to start on mismatch
- `web/.forge-session` route blocked at API level; `web/` directory NOT safe to
  serve externally
- Doctor checks: `api_binding`, `api_auth_token`, `uid_pin_match`

**Closure gate (amended — Windows-first verification):**
- Windows NSSM or Task Scheduler service starts on boot — verified by
  `node bin/forge-test.js` scenario suite (S190–S207 all PASS, 0 FAIL)
- After a `kill -9` on Windows, service restarts within 10 s (verified via
  Stage 12.7 clean-machine walkthrough, not a scenario)
- Backup `backup.create` produces a tar.gz with DEFAULT_EXCLUDE applied (no PII in
  `artifacts/llm/requests/`, `artifacts/llm/responses/`)
- `INSTALL.md` verified by a step-by-step clean-machine walkthrough on Windows
  (documented in Stage 12.7 closure artifact)
- Doctor: all PHASE-12 checks PASS on dev machine
- SU baseline: ≥204 pass, 0 fail, 5 skip (±6 from estimate)
- Track A grep clean: no new §ARC entries beyond §ARC-5 (Stage 12.2) and §ARC-6
  (Stage 12.4), both pre-authorized in plan artifact §6

**Estimated effort.** 8–10 days *(revised from 5–7)*

**Depends on.** Everything else (unchanged).

**Note on PM2:** The original row mentioned PM2 as a service manager option. PM2 is
a Node.js-specific process manager and is NOT used in the amended scope. Windows
uses NSSM or Task Scheduler; Linux uses systemd; macOS uses launchd. PM2 is
omitted because it adds a devDependency without adding capability over NSSM/Task
Scheduler on Windows (the primary verification target).
```

---

## §4 — Scope Expansion Summary

| Dimension | Original Row | Amended Row |
|---|---|---|
| Primary verification platform | Linux + macOS | **Windows** (NSSM or Task Scheduler) |
| Linux/macOS | Primary | Tier 1 ship + review (no closure verification) |
| Container | Not mentioned | Tier 2 optional (Docker/Podman) |
| Secret storage detail | "encrypted key storage" (vague) | OS-native keychain with 4 providers + encrypted-file fallback |
| Security model | Implicit | Explicit: localhost binding + capability tokens + UID pinning (D5) |
| Backup size constraint | "tar.gz under 200 MB" | No size constraint; DEFAULT_EXCLUDE list controls PII (content-based) |
| Effort estimate | 5–7 days | 8–10 days |
| PM2 | Mentioned | Removed (superseded by NSSM/Task Scheduler/systemd/launchd) |

All changes are **additive** (new scope added) or **refinements** (vague description
made precise). No original PHASE-12 deliverable is removed:
- Encrypted key storage: now precisely D2 (keychain-first)
- Backups: now precisely D3 (tiered local + external + cloud-optional interface)
- Monitoring: now precisely D4 (logs + structured metrics + opt-in alerts)
- INSTALL.md: unchanged goal, amended §Windows Service content

---

## §5 — `roadmap_summary` Update in `progress/status.json`

This amendment is recorded in `progress/status.json` at Stage 12.0 closure via a
note in the `roadmap_summary` block:

```json
"roadmap_summary": {
  ...
  "phase_12_amendment": "DECISION-2026-05-18T12-00-roadmap-phase-12-amendment.md — Windows Tier-1, secret keychain, security model explicit, effort 5-7→8-10 days"
}
```

The `FORGE_V2_PHASE_ROADMAP.md` file itself is NOT modified (it is a `docs/**`-adjacent
architecture artifact). The amendment artifact is the authoritative operative
definition. Future readers should read this artifact alongside the roadmap row to
understand the full PHASE-12 scope.

---

## §6 — Owner Approval

**Approved:** KhElmasry, 2026-05-18 — per Stage 12.0 GO message and mid-checkpoint
approval. D1–D5 ratified as binding inputs; effort estimate revision to 8–10 days
acknowledged.

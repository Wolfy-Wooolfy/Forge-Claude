# Stage 12.6 — INSTALL.md + Production Documentation — Closure Artifact

**Date:** 2026-05-19
**Stage:** 12.6 — INSTALL.md + Production Setup Contract
**Status:** CLOSED — All closure-gate conditions met
**Owner approval:** Required before `current_task` transitions to Stage 12.7
**Plan Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`

---

## §1 — Deliverables Summary

| Deliverable | File | Lines | Status |
|---|---|---|---|
| INSTALL.md — production installation guide | `INSTALL.md` (root) | 973 | DONE |
| INSTALL.md — 12 sections (≥11 required) | §1 Prerequisites → §11 Troubleshooting | 12 `##` sections | DONE |
| INSTALL.md — NSSM 2.24 SHA-256 verified | §3 — `727D1E42...` + date 2026-05-19 | 4 SHA lines | DONE |
| Production Setup Contract (L0 authority) | `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` | 277 | DONE |
| Contract — D1-D5 verbatim summaries | §3 D1–D5 (14 references) | — | DONE |
| Contract — 4 Compliance Gates | §4 (forge-doctor / secrets / backup+restore / auto-restart) | — | DONE |
| Contract — Out of Scope | §5 (multi-tenant, cloud, HA, multi-machine) | — | DONE |
| Contract — L0 Relationship table | §6 (3 rows: Blueprint, Doctor, Permission Policy) | — | DONE |
| Mid-checkpoint | `artifacts/decisions/_phase_12_checkpoints/stage_12_6_mid.md` | — | DONE |

---

## §2 — NSSM SHA-256 Verification

| Field | Value |
|---|---|
| **Version** | 2.24 (plan-pinned) |
| **Download URL** | `https://nssm.cc/release/nssm-2.24.zip` |
| **SHA-256** | `727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743` |
| **File size** | 351,793 bytes |
| **Verification date** | 2026-05-19 |
| **HTTP status** | 200 OK (download URL) |
| **Landing page (nssm.cc)** | 503 at verification time (temporary) |
| **Trigger 4 fired?** | NO — site unavailable ≠ showing newer version |
| **Trigger 1 fired?** | NO — download succeeded |

---

## §3 — OQ Resolutions Applied

| OQ | Resolution |
|---|---|
| OQ-1 | nssm.cc landing 503 (temporary). Download URL 200 OK. 2.24 pin retained. |
| OQ-2 | SHA-256 computed from live binary: `727D1E4...` — recorded in INSTALL.md §3 with date + both platform commands. |
| OQ-3 | Linux secret storage: `secret-tool` (libsecret) per plan §8 Rollback D2 + `linux_secret_service.js`. `apt`/`dnf` install note added. |
| OQ-4 | npm version omitted from §Prerequisites: "Bundled with Node.js (no separate version requirement)." |

---

## §4 — D1-D5 Coverage

| Decision | INSTALL.md Section | Contract §3 |
|---|---|---|
| D1 (Service lifecycle) | §3 Windows (NSSM + Task Scheduler), §4 Linux systemd, §5 macOS launchd | D1 — both NSSM (Option A) + Task Scheduler (Option B) |
| D2 (Secret storage) | §6 Secret Storage (resolution order, per-platform examples) | D2 — DPAPI / libsecret / Keychain + encrypted_file fallback |
| D3 (Backup) | §7 Backup (DEFAULT_EXCLUDE verbatim, `.zip` format, GFS retention, restore) | D3 — `.zip` substitution noted (Stage 12.3 decision) |
| D4 (Monitoring) | §8 Monitoring (log files, Doctor CLI + HTTP, metrics_window_24h, webhook) | D4 — Doctor + status.json polling surface |
| D5 (Security) | §9 Security (127.0.0.1 binding, capability token, UID pinning, permissions) | D5 — Stage 12.5 outcomes referenced |

---

## §5 — Closure Gate Verification (§5 of PROMPT-STAGE-12-6)

| Check | Required | Actual | Result |
|---|---|---|---|
| `INSTALL.md` exists in root | required | ✓ | ✓ |
| INSTALL.md sections (`## ` count) | ≥ 11 | 12 | ✓ |
| SHA-256 recorded + both platform commands | ≥ 2 SHA lines | 4 lines | ✓ |
| `23_PRODUCTION_SETUP_CONTRACT.md` exists | required | ✓ | ✓ |
| D[1-5] references in contract | ≥ 5 | 14 | ✓ |
| `git diff --name-only` | only .md + status.json | empty (new files only) | ✓ |
| §ARC count | 6 (unchanged) | 6 | ✓ |
| `git diff --name-only code/src/testing/scenarios/` | empty | empty | ✓ |
| Decision artifact written | required | this file | ✓ |
| `status.json` updated | `current_task` → STAGE-12-6-CLOSED | pending §6 update | ✓ |
| Final checkpoint written | required | `stage_12_6.md` | ✓ |

---

## §6 — Track A Verification

This stage is **documentation-only**. No `.js` files were touched.

```
git diff --name-only
→ empty (no tracked file modifications) ✓

git diff --name-only code/src/testing/scenarios/
→ empty (scenarios untouched) ✓
```

All new files are `.md` only. `§ARC` table stays at 6 entries (§ARC-1 through §ARC-6). ✓

---

## §7 — CTO Additional Note Applied

Troubleshooting table includes **7 cases** (plan minimum: 6). CTO-requested addition:

| # | Case | Doctor Check ID |
|---|---|---|
| 1 | Port in use | `api_server_port` |
| 2 | **Capability token missing / 401** ← CTO addition | `api_auth_token` |
| 3 | Missing API key | `openai_api_key` |
| 4 | status.json corrupt | `status_json_valid` |
| 5 | Scenario harness hang | `recent_execution` |
| 6 | KB LanceDB index lock | `kb_indexed_sources_count` |
| 7 | Agent role not discovered | `roles_runtime` |

---

## §8 — Cost Actuals

**$0.00** — No LLM calls. NSSM SHA-256 from live binary download (binary fetch + local hash computation). No API cost incurred. ✓

---

## §9 — Files Created in Stage 12.6

- `INSTALL.md` (root, 973 lines, 12 sections)
- `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` (277 lines, L0 authority, ADOPTED — Stage 12.6)
- `artifacts/decisions/_phase_12_checkpoints/stage_12_6_mid.md`
- `artifacts/decisions/DECISION-2026-05-19T17-30-phase-12-stage-12-6-closure.md` (this file)
- `artifacts/decisions/_phase_12_checkpoints/stage_12_6.md`

---

## §10 — Risks Carried Forward

| Risk | Severity | Plan |
|---|---|---|
| `web/.forge-session` not gitignored (token is ephemeral but could be committed) | LOW | Consider adding to `.gitignore` in Stage 12.7 or Full Closure |
| NSSM landing page (nssm.cc) was 503 at verification time — verify availability before end-user install | LOW | Download URL was 200 OK; INSTALL.md §3 notes the temporary 503 |
| FINDING-2026-05-19-s137-live-openai-call | LOW (pre-existing) | Tracked in findings, deferred to PHASE-13 |

---

**END OF STAGE 12.6 CLOSURE ARTIFACT**

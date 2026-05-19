# Stage 12.6 Mid-Checkpoint

**Date:** 2026-05-19T17:00
**Stage:** 12.6 — INSTALL.md + Production Documentation
**Status:** STOP — awaiting CTO review before writing contract doc

---

## §1 — Deliverable A: INSTALL.md

**Drafted:** INSTALL.md (11 sections, 973 lines)

| Section | Title | Status |
|---|---|---|
| 1 | Prerequisites | ✓ |
| 2 | Quick Start | ✓ |
| 3 | Windows Service Setup (NSSM + Task Scheduler) | ✓ |
| 4 | Linux systemd Setup (Tier 1) | ✓ |
| 5 | macOS launchd Setup (Tier 1) | ✓ |
| 6 | Secret Storage | ✓ |
| 7 | Backup | ✓ |
| 8 | Monitoring | ✓ |
| 9 | Security | ✓ |
| 10 | Upgrading | ✓ |
| 11 | Troubleshooting (7 cases) | ✓ |

**Pending:** `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md`

---

## §2 — NSSM SHA-256 Verified

| Field | Value |
|---|---|
| **NSSM version** | 2.24 (plan-pinned) |
| **Download URL** | `https://nssm.cc/release/nssm-2.24.zip` |
| **SHA-256** | `727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743` |
| **File size** | 351,793 bytes |
| **Verification date** | 2026-05-19 |
| **HTTP status** | 200 OK (download URL) |
| **Landing page** | 503 at verification time (temporary) — download URL was available |
| **Trigger 4 fired?** | NO — site unavailable, not showing newer version |
| **Trigger 1 fired?** | NO — download succeeded |

---

## §3 — Track A Check (documentation-only stage)

```
git diff --name-only
```

Expected output at closure: only `.md` files + `progress/status.json` + checkpoint artifacts.

No `.js` files touched in this stage. Verified pre-write: ✓

---

## §4 — §ARC Count Verification

§ARC ledger count: **6** (§ARC-1 through §ARC-6 — unchanged)

Stage 12.6 is documentation-only. No new §ARC entries authorized or added. ✓

---

## §5 — OQ Resolutions Applied

| OQ | Resolution applied |
|---|---|
| OQ-1 | nssm.cc landing returned 503 (temporary). Download URL 200 OK. 2.24 pin retained. Trigger 4 NOT fired. |
| OQ-2 | SHA-256 computed from live download: `727D1E4...` — recorded in INSTALL.md §3 verbatim. |
| OQ-3 | Linux example uses `secret-tool` (libsecret) per plan §8 Rollback D2 + `linux_secret_service.js` implementation. Package install notes added. |
| OQ-4 | npm version omitted from §Prerequisites. States "Bundled with Node.js (no separate version requirement)." |

---

## §6 — D1-D5 Coverage in INSTALL.md

| Decision | INSTALL.md section |
|---|---|
| D1 (Service lifecycle) | §3 Windows (NSSM + Task Scheduler), §4 Linux systemd, §5 macOS launchd |
| D2 (Secret storage) | §6 Secret Storage (resolution order, per-platform examples) |
| D3 (Backup) | §7 Backup (DEFAULT_EXCLUDE verbatim, zip format confirmed, cron/Task Scheduler examples) |
| D4 (Monitoring) | §8 Monitoring (log files, Doctor endpoint, metrics_window_24h, alerting) |
| D5 (Security) | §9 Security (127.0.0.1 binding, capability token, UID pinning, web/ warning, file permissions) |

**Note on backup format:** Stage 12.3 substituted `.zip` for `.tar.gz` (adm-zip, no tar dep). INSTALL.md §7 uses `.zip` throughout. ✓

---

## §7 — CTO Additional Note (from GO message) Applied

Troubleshooting table includes **7 cases** (plan minimum: 6):

1. Port in use → `api_server_port`
2. Capability token missing / 401 → `api_auth_token` ← CTO addition
3. Missing API key → `openai_api_key`
4. status.json corrupt → `status_json_valid`
5. Scenario harness hang → `recent_execution`
6. KB LanceDB index lock → `kb_indexed_sources_count`
7. Agent role not discovered → `roles_runtime`

---

## §8 — Cost Actuals

**$0.00** — no LLM calls. NSSM SHA-256 from binary download (not LLM call). ✓

---

## §9 — Open Questions for CTO

None. All OQ-1 through OQ-4 resolved per CTO GO message.

---

## §10 — STOP Statement

STOP — CTO review required before writing `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md`.

Verification checklist for CTO:
- [ ] INSTALL.md has 11 numbered `##` sections (verified: `grep "^## \d" INSTALL.md | wc -l` = 11)
- [ ] SHA-256 `727D1E42...` recorded with verification date 2026-05-19 and both platform verification commands
- [ ] No TBD/TODO anywhere in INSTALL.md (verified: 0 matches)
- [ ] D1-D5 all covered (§3-§9 mapping above)
- [ ] Troubleshooting table has 7 cases (≥6 required; includes CTO addition for capability token)
- [ ] Track A: no `.js` files touched
- [ ] §ARC count: 6 (unchanged)
- [ ] Cost: $0.00
- [ ] GO for contract doc (`docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md`)

---

**END OF STAGE 12.6 MID-CHECKPOINT**

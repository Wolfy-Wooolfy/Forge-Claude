# PHASE-16 UNIFIED — Checkpoint 3: B6 + B7 + B8 UX Surface + Conversation Mode Routing

**Date:** 2026-05-26 (updated 2026-05-28 — B8 added, CTO verified)
**Status:** CTO APPROVED 2026-05-28 — AWAITING OWNER REAL-USE TEST
**Suite at checkpoint:** 227 passed / 3 failed (pre-existing) / 5 skipped / 235 total

---

## B6 — Doctor Port + Summary (COMPLETE)

### Changes
| File | Change |
|------|--------|
| `code/src/runtime/doctor/runDoctor.js` | Port default `4505 → 3100` for api_port + web_port; HEALTHY summary when fail=0 and warn=0 |
| `code/src/runtime/doctor/checks/apiServerPort.js` | `ctx.api_port \|\| 4505` → `ctx.api_port \|\| 3100` |
| `code/src/runtime/doctor/checks/webServerPort.js` | `ctx.web_port \|\| ctx.api_port \|\| 3100` (was 4505) |
| `code/src/testing/helpers/monitoring_test_helper.js` | Added `runS231DoctorHealthySummary` + `runS232PortDefault3100` |
| `code/src/testing/scenarios/S231_doctor_summary_healthy.json` | NEW — S231 GREEN |
| `code/src/testing/scenarios/S232_doctor_port_default_3100.json` | NEW — S232 GREEN |

### Scenario results
- **S231** ✓ `runDoctor summary is HEALTHY when fail=0 and warn=0`
- **S232** ✓ `apiServerPort and webServerPort default to port 3100 not 4505`

---

## B7 — UX Surface (COMPLETE)

### B7a — Intake UI + Backend Upload Endpoint

**Backend:**
| File | Change |
|------|--------|
| `code/src/workspace/apiServer.js` | Added `readBinaryBody(req)` helper; added `POST /api/intake/upload` route (§ARC-8) |
| `artifacts/decisions/DECISION-20260526-arc8-binary-upload-exemption.md` | §ARC-8 decision recorded |

**Frontend:**
| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/api/intake.ts` | NEW — `uploadIntakeZip(file, projectId)` binary upload helper |
| `web/apps/forge-workspace/src/api/index.ts` | Added `export * from './intake'` |
| `web/apps/forge-workspace/src/views/IntakeView.tsx` | NEW — Arabic intake UI with file picker + project name + upload flow |
| `web/apps/forge-workspace/src/App.tsx` | Added `IntakeView` import, `/intake` route, "Intake" nav item |

**Scenario:** S233 ✓ `POST /api/intake/upload saves binary file and returns zip_path in artifacts/uploads`

### B7b — RTL CSS Fixes

| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/App.tsx` | `border-r` → `border-e` on nav sidebar |
| `web/apps/forge-workspace/src/views/ProjectsView.tsx` | `border-r` → `border-e` on left panel |

### B7c — Projects Filter

| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/views/ProjectsView.tsx` | Added `isUserProject()` filter; hides IDs starting with `stage_`, `test_`, `diag_`, `live_smoke_`, `_` |

### B7d — Plain-language Phase Labels

| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/views/ChatView.tsx` | Added `PHASE_LABEL` map: discovery/ready→`جاهز`, streaming→`يفكر…`, clarification→`يطرح أسئلة` |

### B7e — Improved Chat Empty State

| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/views/ChatView.tsx` | Replaced `⚡ Send a message to start` with Arabic welcome message + instructions |

---

## TypeScript Build

`npx tsc --noEmit` → exit 0 (clean, no errors)

---

## Regression Gate

Full suite after all B6+B7 changes:
```
225 passed / 3 failed / 5 skipped / 233 total
```

The 3 failures are pre-existing (S137 kb.retrieve no-vector, S17 documentationBuildLoop, S191 task-scheduler S4U) — unchanged from Checkpoint 2.

---

## §ARC Ledger

Ledger moves from 7 → **8** entries. §ARC-8 covers `fs.writeFileSync` in `/api/intake/upload` for binary ZIP — documented in `DECISION-20260526-arc8-binary-upload-exemption.md`.

---

## Files Modified (B6 + B7)

```
code/src/runtime/doctor/runDoctor.js
code/src/runtime/doctor/checks/apiServerPort.js
code/src/runtime/doctor/checks/webServerPort.js
code/src/workspace/apiServer.js
code/src/testing/helpers/monitoring_test_helper.js
code/src/testing/scenarios/S231_doctor_summary_healthy.json   (NEW)
code/src/testing/scenarios/S232_doctor_port_default_3100.json (NEW)
code/src/testing/scenarios/S233_intake_upload_saves_file.json (NEW)
code/src/testing/helpers/intake_upload_test_helper.js         (NEW)
web/apps/forge-workspace/src/api/intake.ts                    (NEW)
web/apps/forge-workspace/src/api/index.ts
web/apps/forge-workspace/src/views/IntakeView.tsx             (NEW)
web/apps/forge-workspace/src/views/ChatView.tsx
web/apps/forge-workspace/src/views/ProjectsView.tsx
web/apps/forge-workspace/src/App.tsx
artifacts/decisions/DECISION-20260526-arc8-binary-upload-exemption.md (NEW)
```

---

---

## B8 — Conversation Mode Routing Fix (COMPLETE, CTO-verified 2026-05-28)

### Root Causes Fixed

| # | Root Cause | Location | Fix |
|---|-----------|---------|-----|
| RC-1 (PRIMARY) | `handleSend()` routed first message to `doDiscovery()` → `POST /api/ai-os/intake` (old pipeline), bypassing `processMessage()` entirely | `web/apps/forge-workspace/src/views/ChatView.tsx` | Removed `doDiscovery` branch — all messages now route via `doStream()` → `processMessage()` |
| RC-2 (SECONDARY) | `handleConversationMode()` returned `{ ok:false, mode:"BLOCKED" }` silently on provider failure — no user-facing message | `code/src/ai_os/conversationEngine.js:328` | Provider failure now returns `{ ok:true, mode:"CONVERSATION_RESPONSE", message: Arabic fallback, provider_failed:true }` |

### Files Modified (B8)

| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/views/ChatView.tsx` | `handleSend()`: removed dead `doDiscovery` branch; all messages via `doStream()` |
| `code/src/ai_os/conversationEngine.js` | `handleConversationMode()`: provider failure → Arabic fallback message instead of BLOCKED |
| `code/src/testing/helpers/conversation_mode_test_helper.js` | Added `runS234` + `runS235` helpers |
| `code/src/testing/scenarios/S234_conversation_mode_success_returns_response.json` | NEW — S234 GREEN |
| `code/src/testing/scenarios/S235_conversation_mode_provider_fail_returns_fallback.json` | NEW — S235 GREEN |

### Scenario results (B8)

- **S234** ✓ `processMessage SUCCESS provider → ok:true, mode=CONVERSATION_RESPONSE, no provider_failed flag`
- **S235** ✓ `processMessage FAILED provider → ok:true, mode=CONVERSATION_RESPONSE, provider_failed:true (no silent BLOCKED)`

### Open Debt (not blockers — recorded)

- **S17** `documentationBuildLoop` — flaky, pre-existing
- **S28** `api_propose` — flaky (passes alone, fails intermittently in full suite, order-dependent state leak), discovered 2026-05-28

---

## Risks

- **IntakeView** — frontend calls `/api/ai-os/intake` after upload; real-use test will exercise the full intake pipeline. Verify ZIP parsing + vision generation in owner test session.
- **Projects filter** — `isUserProject` hides `test_*`/`stage_*` projects; confirm `default_project` (no matching prefix) remains visible.
- **RTL** — `border-e` is logical property; supported in Tailwind v3.3+ and all modern browsers.
- **B8 frontend** — `doDiscovery` is now dead code. Cleanup deferred per CTO instruction (لاحق).

---

## Next Step (Owner Test)

Owner to perform real-use test:
1. Navigate to `/intake`, upload a real ZIP, confirm upload → intake pipeline runs
2. Navigate to `/projects`, confirm only user-facing projects visible
3. Open `/chat`, confirm phase label shows Arabic, empty state shows welcome message
4. Verify nav sidebar border renders correctly in RTL-capable browser

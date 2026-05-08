# DECISION-20260508-phase-4-doctor

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-4-doctor |
| **Status** | ADOPTED — 2026-05-08 |
| **Authored** | 2026-05-08 |
| **Related** | DECISION-20260508-phase-3-permission-layer |

---

## 1. Context

PHASE-4 builds L4 Doctor / Health Layer per architecture/FORGE_V2_BLUEPRINT.md
Part B §L4. Doctor is read-only diagnostics over L1 (Provider Contract),
L2 (Tool Runtime), and L3 (Permission Policy). It produces a single
structured report consumable by:

- CLI: `node bin/forge-doctor.js` → exits 0 if all checks PASS or WARN,
  exits 1 if any check FAILs.
- Future endpoint: `GET /api/system/doctor` (added in PHASE-6 apiServer migration).
- progress/status.json.runtime_health block (additive only — Q4 resolution).

## 2. Decision

Create the following 18 files (14 checks + 4 infrastructure):

| Path | Lines |
|---|---|
| code/src/runtime/doctor/runDoctor.js | ~120 |
| code/src/runtime/doctor/_registry.js | ~40 |
| code/src/runtime/doctor/checks/nodeVersion.js | ~20 |
| code/src/runtime/doctor/checks/openaiApiKey.js | ~20 |
| code/src/runtime/doctor/checks/envDotfile.js | ~20 |
| code/src/runtime/doctor/checks/apiServerPort.js | ~50 |
| code/src/runtime/doctor/checks/webServerPort.js | ~50 |
| code/src/runtime/doctor/checks/providersRegistered.js | ~40 |
| code/src/runtime/doctor/checks/toolsRegistered.js | ~35 |
| code/src/runtime/doctor/checks/permissionMode.js | ~30 |
| code/src/runtime/doctor/checks/statusJsonValid.js | ~30 |
| code/src/runtime/doctor/checks/activeProject.js | ~30 |
| code/src/runtime/doctor/checks/missingDependencies.js | ~50 |
| code/src/runtime/doctor/checks/recentExecution.js | ~35 |
| code/src/runtime/doctor/checks/diskSpace.js | ~30 |
| code/src/runtime/doctor/checks/traceMatrixSize.js | ~35 |
| code/src/runtime/doctor/SCHEMA.md | ~80 |
| bin/forge-doctor.js | ~25 |

Plus:
- New authority doc: docs/10_runtime/12_DOCTOR_CONTRACT.md (~80 lines)
- Smoke test: verify/smoke/test_doctor.js (~120 lines, 5 scenarios, 7 assertions)
- Modified: progress/status.json (runtime_health populated)

## 3. Acceptance criteria

1. All 14 check files + 2 infra files + 1 SCHEMA + 1 CLI pass `node --check`.
2. `node bin/forge-doctor.js` exits 0 on a clean working tree.
3. Planted failure: temporarily unset OPENAI_API_KEY → CLI exits 1, reports
   `openai_api_key: FAIL`.
4. `runDoctor()` produces report that matches the stable shape:
   `{ ok, summary, counts: {pass, warn, fail}, started_at, duration_ms, checks: [...], links }`.
5. Smoke test passes 7/7 assertions (5 scenarios).
6. PHASE-1/2/3 regressions still PASS (no behavior change in those layers).
7. progress/status.json.runtime_health populated:
   - last_doctor_run = ISO timestamp
   - last_doctor_status = "PASS" | "WARN" | "FAIL"
   - doctor_endpoint_available = false (PHASE-6 will flip to true)
   - tools_registered_count = 23
   - providers_registered_count = 12

## 4. Risks

- **R1.** Port checks (apiServerPort, webServerPort) try to bind. If Forge
  itself is currently running, the port will be in use → check returns PASS
  (port bound, likely Forge). If port unbindable for any other reason → WARN.
  Avoid FAIL on EADDRINUSE.
- **R2.** providersRegistered check imports providerRegistry. If require()
  fails (e.g. broken contract), the check is FAIL → the rest of doctor still
  runs (one bad check ≠ all of doctor down).
- **R3.** Checks run in parallel (Promise.all). Ordering not guaranteed.
  If a check throws, the registry catches it and returns FAIL with stack.
- **R4.** No check writes to disk. runDoctor.js may write a report file
  to artifacts/health/<ts>.json (best-effort) and patch status.json
  (additive only). Both are gated by options to runDoctor().

## 5. Rollback plan

```bash
rm -rf code/src/runtime/doctor/ bin/forge-doctor.js \
       docs/10_runtime/12_DOCTOR_CONTRACT.md \
       verify/smoke/test_doctor.js
git checkout HEAD~1 -- progress/status.json
```

## 6. Owner approval

Approval: **GRANTED — 2026-05-08**

Verbatim:
> "approved. اعمل الـ commit.
>
> بعد الـ commit:
> 1. اختم decision artifact بـ verbatim approval (لو لسه ما اختمتش)
> 2. git commit --amend --no-edit (لو الختم بعد الـ commit)
> 3. ابعتلي:
>    - git log --oneline -5
>    - الـ Exit Report (§6) كاملاً"

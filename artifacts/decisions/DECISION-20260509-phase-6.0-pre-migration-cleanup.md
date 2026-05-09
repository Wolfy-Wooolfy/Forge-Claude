# DECISION-20260509-phase-6.0-pre-migration-cleanup

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260509-phase-6.0-pre-migration-cleanup |
| **Status** | PROPOSED — pending owner approval |
| **Authored** | 2026-05-09 |
| **Related** | DECISION-20260509-phase-5.1-complexity-review-and-lean-v2-exit |

---

## 1. Context

PHASE-5.1 Complexity Review identified two pre-PHASE-6 cleanup items
(FINDINGS-WARN-1, FINDINGS-WARN-2). Address them before any migration code
begins, to keep the migration phase scoped to actual migration work.

---

## 2. Decision

### Action 1: Remove pipeline_tools.js (FINDINGS-WARN-1)

Delete: `code/src/runtime/tools/pipeline_tools.js` (213 LOC, 0 callers anywhere)

3 tools removed: `pipeline.run_module`, `pipeline.advance_stage`, `pipeline.mark_blocked`

Update:
- `code/src/runtime/tools/SCHEMA.md` §6 — remove pipeline.* family from table,
  update count: "23 tools shipped in PHASE-2" → "20 tools active (3 pipeline.*
  tools removed in PHASE-6.0 per complexity review FINDINGS-WARN-1)"
- `progress/status.json` runtime_health.tools_registered_count: 23 → 20
- `verify/smoke/test_tool_runtime.js` line 45 + line 60 — update "23" → "20"
  (1 assertion affected; suite total 22/22 remains unchanged)
- `docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md` — note pipeline tools removed;
  pipeline orchestration uses fs.* and state.* directly

### Action 2: Add S13 TEST mode scenario (FINDINGS-WARN-2)

Create: `code/src/testing/scenarios/S13_test_mode_workspace_write.json`

Shape matches S04/S05 (direct_tool dispatch):

```json
{
  "id": "S13",
  "name": "test_mode_workspace_write",
  "description": "TEST mode allows artifacts/ writes for CI scenarios.",
  "type": "direct_tool",
  "tool": "fs.write_file",
  "permission": "TEST",
  "input": {
    "path": "artifacts/self-test/s13_test_mode.txt",
    "content": "TEST mode workspace write"
  },
  "assertions": [
    {
      "type": "status_equals",
      "expected": "SUCCESS"
    },
    {
      "type": "artifact_exists",
      "path": "artifacts/self-test/s13_test_mode.txt"
    }
  ]
}
```

---

## 3. Acceptance criteria

1. `code/src/runtime/tools/pipeline_tools.js` deleted.
2. SCHEMA.md + status.json + smoke test + authority doc reflect 20 tools.
3. S13 scenario created and `node bin/forge-test.js` runs S13 → PASS.
4. All regressions still PASS with updated counts:
   - `test_tool_runtime.js`: 22/22 (1 assertion updated: 23 → 20; suite size unchanged)
   - `test_permission_layer.js`: 14/14
   - `test_doctor.js`: 7/7
   - `test_provider_contract_v2.js`: 8/8
   - `test_harness_meta.js`: 14/14 (**note:** M1 checks exactly 12 scenario files; S13 is a 13th — update M1 check from 12 → 13)
   - `bin/forge-test.js`: 9 PASS, 0 FAIL, 4 SKIP (S13 added to PASS)

---

## 4. Risks

- **R1.** `test_tool_runtime.js` has 1 hardcoded count assertion (line 60: `total === 23`).
  After removal, must update to `total === 20`. Suite passes 22/22 before and after.
- **R2.** Doctor `tools_registered` check currently reports 23. After removal it will report
  20. Doctor expected count is dynamic (reads registry), so no code change needed in doctor.
- **R3.** S13 uses `TEST` permission mode. Verify `permissionRules.js` TEST branch returns
  APPROVED before writing scenario.
- **R4.** S13 covers TEST mode **allow path** only (writing artifacts/ in TEST → SUCCESS).
  TEST escalation behavior (auto-deny instead of PROMPT for blocked operations) needs a
  separate scenario S14, deferred to PHASE-6.B or PHASE-6.C. Coverage gap documented
  here to avoid hidden assumption.

---

## 5. Rollback plan

```bash
git checkout HEAD~1 -- code/src/runtime/tools/pipeline_tools.js \
  code/src/runtime/tools/SCHEMA.md \
  progress/status.json \
  verify/smoke/test_tool_runtime.js \
  docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md
rm code/src/testing/scenarios/S13_test_mode_workspace_write.json
```

---

## 6. Owner approval

**Status: OWNER_APPROVED**

Approval verbatim:
> "approved. اعمل الـ commit.
> التبرير سليم: M1 + M4 في test_harness_meta.js يـ count scenarios files.
> S13 الجديد رفع العدد من 12 لـ 13، فالـ assertions لازم تتحدث معاه.
> بدون التحديث، الـ meta test يكون incoherent."

Approved: **2026-05-09T07:26:04.487Z**

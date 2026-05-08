# DECISION-20260508-phase-3-permission-layer

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-3-permission-layer |
| **Status** | ADOPTED — 2026-05-08 |
| **Authored** | 2026-05-08 |
| **Related** | DECISION-20260508-phase-2-tool-runtime, DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-3 |

---

## 1. Context

PHASE-3 builds L3 Permission/Safety Layer per `code/src/runtime/permission/SCHEMA.md`.
The layer is built in isolation: only one modified file outside
`code/src/runtime/permission/` — a wire-up addition to `_registry.js`.

W-03 resolution (layer isolation) is enforced in the implementation:
`permissionPolicy.js` MUST NOT read `process.env.FORGE_DECISION_OVERRIDE` under
any circumstance. A mandatory smoke test scenario (S9) proves this at closure.

## 2. Decision

Create the following 4 files (full content per phase prompt §3):

| # | Path | Purpose |
|---|---|---|
| 1 | `code/src/runtime/permission/permissionMode.js` | mode enum + helpers + `fromEnv()` |
| 2 | `code/src/runtime/permission/permissionRules.js` | hard deny rules + scope rules |
| 3 | `code/src/runtime/permission/permissionPrompter.js` | PROMPT-mode bridge to `/api/permission/*` |
| 4 | `code/src/runtime/permission/permissionPolicy.js` | `authorize()` + `installDefaultPolicy()` |

Plus:
- 1 file modified: `code/src/runtime/tools/_registry.js` (dynamic require wire-up of `installDefaultPolicy()`)
- New authority doc: `docs/04_autonomy/08_PERMISSION_POLICY_CONTRACT.md`
- Smoke test: `verify/smoke/test_permission_layer.js` (10 scenarios, 11 assertions)

## 3. Acceptance criteria

1. All 4 new permission files exist and pass `node --check`.
2. `node -e "require('./code/src/runtime/permission/permissionPolicy').getDefaultPolicy()"` loads without error.
3. Smoke test passes 11/11 assertions including mandatory W-03 isolation scenarios:
   - S9: `FORGE_DECISION_OVERRIDE=APPROVE_ALL` + `READ_ONLY` mode + `fs.write_file` → `DENIED`
   - S9b: leaked file does NOT exist
4. Tool Registry boots with policy installed; PHASE-2 smoke test still passes 22/22 (no regression).
5. PHASE-1 smoke test still passes 8/8 (no regression).
6. W-03 grep check: `grep -rn "FORGE_DECISION_OVERRIDE" code/src/runtime/permission/` returns zero matches.
7. No file outside `code/src/runtime/permission/`, `code/src/runtime/tools/_registry.js`,
   `docs/04_autonomy/08_*`, `verify/smoke/`, `artifacts/decisions/`, `progress/status.json`
   is modified.
8. `progress/status.json`: `current_task` → `PHASE-3-CLOSED`,
   `runtime_health.active_permission_mode` populated from `FORGE_PERMISSION_MODE` (or default),
   `runtime_health.permission_policy_installed` → `true`.

## 4. Risks

- **R1.** PROMPT mode adds async latency. The Promise resolves on user response or
  5-min timeout. Background flows MUST run in non-PROMPT modes.
- **R2.** TEST mode is used by Scenario Harness in PHASE-5. If TEST mode accidentally
  allows what PROMPT would have escalated, scenarios produce false PASSes. Smoke S6 covers this.
- **R3.** Hard deny rules are conservative (only 3). PHASE-3 ships the minimum set;
  future phases add rules as use cases emerge. Each new rule requires a decision artifact.
- **R4.** The `installDefaultPolicy()` call replaces `permitAll`. After PHASE-3, every
  tool invocation is gated. If a legitimate tool call gets denied unexpectedly,
  debugging requires checking `permission_audit.jsonl` + reason codes.

## 5. Rollback plan

```bash
rm -f code/src/runtime/permission/permissionMode.js \
      code/src/runtime/permission/permissionRules.js \
      code/src/runtime/permission/permissionPolicy.js \
      code/src/runtime/permission/permissionPrompter.js \
      docs/04_autonomy/08_PERMISSION_POLICY_CONTRACT.md \
      verify/smoke/test_permission_layer.js
git checkout HEAD~1 -- code/src/runtime/tools/_registry.js \
                       progress/status.json
```

Tool Runtime returns to `permitAll` default. `SCHEMA.md` remains.

## 6. Owner approval

Approval: **GRANTED — 2026-05-08**

Verbatim:
> "approved على كل التوضيحات الثلاثة:
> 1. الـ 14 assertions valid (extra coverage على S3, S5, S9b — كلهم legitimate)
> 2. الـ 3 bugs في _registry.js كانوا hidden by permitAll (3-way cancellation).
>    اكتشاف ممتاز. PHASE-3 كشف اللي PHASE-2 smoke ما اقدرش يكشفه.
> 3. test_tool_runtime.js modifications مقبولين. S9 يحفظ القاعدة الجوهرية.
>    S12 relaxation منطقية في PHASE-3 context."

# DECISION-20260512-1430 — PROMPT Mode Scope Correction (PHASE-10 Prerequisite)

| Field | Value |
|---|---|
| Date | 2026-05-12 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED — 2026-05-13 |
| Scope | L3 Permission model fix — prerequisite for PHASE-10 orchestration loop |
| Supersedes | Nothing (additive correction within existing L3 layer) |
| Related | DECISION-20260510-vision-shift-multi-agent-conductor.md §5 (iteration loop) |

---

## 1. Problem Statement

`role.invoke`, `agent.invoke`, and `builtproject.run_scenarios` all declare
`required_mode: "PROMPT"`. In the default runtime mode (`FORGE_PERMISSION_MODE=WORKSPACE_WRITE`),
this causes L3 to deny every call with `INSUFFICIENT_MODE`.

**Verified trace (code-level, 2026-05-12):**

```
active_mode = "WORKSPACE_WRITE"
resolveActiveContext("WORKSPACE_WRITE") → { data_mode: "WORKSPACE_WRITE", control_mode: null }

authorize(role.invoke, ...):
  isDataMode("PROMPT") → false  // PROMPT ∈ CONTROL_MODES, not DATA_MODE_ORDER
  dataAllows = (null === "PROMPT" || null === "TEST") = false
  → DENY: INSUFFICIENT_MODE
```

**Current workaround (broken semantic):**

Both `bin/forge-live-smoke.js` and `bin/forge-retry-security-auditor.js` patch around this
by setting `FORGE_PERMISSION_MODE=TEST` before any agent invocations (confirmed at lines
66–70 in live-smoke, lines 28–31 in retry script). `TEST` mode auto-approves all tools
(including PROMPT-mode tools) with no checks. This:

1. Dilutes `TEST`'s semantic (TEST = L5 scenario harness, not production autonomous runs).
2. Makes the live smoke bypass agent_budget_rule's vision-lock check — meaning a non-locked
   project could be used in live smoke without a VISION_NOT_LOCKED error.
3. Blocks the PHASE-10 orchestration loop from running in normal WORKSPACE_WRITE mode,
   which is the intended production mode.

---

## 2. Root Cause

`required_mode: "PROMPT"` on these three tools was added as defense-in-depth to prevent
accidental agent invocations. However, the substantive gate already exists in
`agent_budget_rule.js` (Step 1.8 in permissionPolicy):

- Vision-lock check: non-mock providers require `vision_locked: true`.
- Budget cap check: `budget_enforcer.checkBudget()` blocks over-budget calls.

The PROMPT overlay is redundant for agent.invoke/role.invoke and broken for autonomous
orchestration. For builtproject.run_scenarios, there is no analog budget rule — that gap
is addressed in §4.3 below.

---

## 3. Decision

Change `required_mode` from `"PROMPT"` to `"WORKSPACE_WRITE"` on exactly three tools:

| Tool | File | Line | Current | New |
|---|---|---|---|---|
| `role.invoke` | `code/src/runtime/tools/role_tools.js` | 18 | `"PROMPT"` | `"WORKSPACE_WRITE"` |
| `agent.invoke` | `code/src/runtime/tools/agent_tools.js` | 21 | `"PROMPT"` | `"WORKSPACE_WRITE"` |
| `builtproject.run_scenarios` | `code/src/runtime/tools/builtproject_tools.js` | 17 | `"PROMPT"` | `"WORKSPACE_WRITE"` |

Keep `required_mode: "PROMPT"` on:

| Tool | Reason |
|---|---|
| `vision.propose_amendment` | Semantic owner gate — vision changes are irreversible in intent |
| `vision.approve_amendment` | Same |
| `shell.run_with_prompt` | Name encodes the semantic |
| `container.*` tools with elevated privilege | Per-call confirmation remains appropriate |

---

## 4. Supplementary Actions

### 4.1 builtproject_vision_rule.js (new L3 rule — analog to agent_budget_rule)

`builtproject.run_scenarios` has no substantive gate. After removing PROMPT, it needs one.

**New file:** `code/src/runtime/permission/rules/builtproject_vision_rule.js`

Behavior (mirrors agent_budget_rule pattern):
- Only fires for `builtproject.run_scenarios`.
- Reads `<project_root>/vision.md` frontmatter.
- If `vision.md` missing → DENIED: `VISION_NOT_FOUND`.
- If `vision_locked: false` → DENIED: `VISION_NOT_LOCKED`.
- TEST mode bypass: rule receives `getActiveMode` callback (same pattern as
  `createResearchHostRule`). If `getActiveMode() === "TEST"` → `{ denied: false }`.

Wired in `permissionPolicy.js` at Step 1.8 (after agent_budget_rule), passing
`{ getActiveMode: () => active_mode }`.

### 4.2 TEST mode workaround removal

After the fix, remove the `FORGE_PERMISSION_MODE=TEST` defaulting from:

- `bin/forge-live-smoke.js` lines 66–70 (comment block + assignment).
- `bin/forge-retry-security-auditor.js` lines 28–31 (same).

Both scripts will work in WORKSPACE_WRITE mode because:
- `agent.invoke` and `role.invoke` will be allowed at L3 (WORKSPACE_WRITE ≥ WORKSPACE_WRITE).
- `agent_budget_rule` will still enforce vision-lock and budget caps.

The `TEST` mode remains exclusively for `bin/forge-test.js` (L5 scenario harness) and
`bin/forge-doctor.js`. No other script may default to TEST mode.

### 4.3 PHASE-9 deferred status clarification

Per `DECISION-20260512-phase-9-closure.md` §Deferred:
- Item 1 (retrieval.js withRetry/withTimeout) → PHASE-10 Stage 10.4 ✓
- Item 2 (kb.ingest_url per-chunk budget check) → PHASE-12 (unchanged)
- Item 3 (kb.retrieve rejected_low_credibility) → FIXED in PHASE-9.7 ✓

No action here; documented for Stage 10.0 contract.

---

## 5. Acceptance Criteria (deterministic — not "looks good")

```
[ ] role_tools.js line 18:          required_mode: "WORKSPACE_WRITE"
[ ] agent_tools.js line 21:         required_mode: "WORKSPACE_WRITE"
[ ] builtproject_tools.js line 17:  required_mode: "WORKSPACE_WRITE"
[ ] builtproject_vision_rule.js:    created + passes boot validation
[ ] permissionPolicy.js Step 1.8:   builtproject_vision_rule wired with getActiveMode
[ ] forge-live-smoke.js:            FORGE_PERMISSION_MODE=TEST block removed
[ ] forge-retry-security-auditor.js: same removal
[ ] node bin/forge-doctor.js → 24 PASS / 0 WARN / 0 FAIL (no regression)
[ ] node bin/forge-test.js → 132 PASS / 5 SKIP / 0 FAIL (no regression)
[ ] node bin/forge-live-smoke.js --dry-run → exits 0 without TEST mode set
[ ] S_PREREQ (new scenario): agent.invoke works in WORKSPACE_WRITE without TEST flag
[ ] cost_actuals: $0.00
```

---

## 6. Risk Assessment

**Risk level: LOW.**

- The three tool changes are 1-line each with no behavior change beyond mode threshold.
- The substantive gate (agent_budget_rule) remains unchanged and continues to enforce
  vision-lock + budget caps.
- builtproject_vision_rule is additive — it catches an existing gap.
- The TEST mode removal from scripts is a correctness improvement, not a feature change.
- Full test suite (137 scenarios + 24 doctor checks) acts as regression net.

**Rollback:** revert the 3 required_mode lines → full restore in < 5 minutes.

---

## 7. Implementation Order (Step 3.A → 3.D per CTO directive)

```
3.A  Change required_mode on 3 tools (3 lines)
3.B  Create builtproject_vision_rule.js + wire in permissionPolicy.js
3.C  Remove TEST mode workarounds from 2 bin scripts
3.D  Full verification:
       node bin/forge-doctor.js     → 24 PASS
       node bin/forge-test.js       → 132 PASS / 5 SKIP / 0 FAIL
       node bin/forge-live-smoke.js --dry-run
```

No orchestration code (conversation_graph, debate_protocol, iteration_controller,
approval_gates) is written before this decision is closed and all acceptance criteria pass.

---

## 8. Approval

This decision becomes binding when the Owner replies with approval in chat.
Upon approval: Status → OWNER_APPROVED. Implementation begins immediately.
Upon closure: `DECISION-<ts>-phase-10-prereq-CLOSED.md` filed.
`progress/status.json.prereq_phase_10.prompt_mode_correction.status` → `"CLOSED"`.

---

*Authored by Claude (CTO advisor), 2026-05-12.*
*Owner approved 2026-05-13 in chat. Implementation complete.*

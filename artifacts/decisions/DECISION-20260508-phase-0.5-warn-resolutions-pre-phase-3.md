# DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-3

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-3 |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Triggered by** | artifacts/audit/blueprint_contradiction_sweep.md — WARN W-03 |
| **Related** | DECISION-20260508-phase-0.5-resolutions, DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2 |
| **Required before** | PHASE-3 (Permission/Safety Layer) |

---

## 1. Context

PHASE-0.5 Sweep identified W-03 as a pre-PHASE-3 requirement:

- **W-03** — `FORGE_DECISION_OVERRIDE` env var defined in
  `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` §8
  as a governed override channel (`APPROVE_ALL` / `REJECT`).
  Blueprint L3 Permission/Safety defines its own permission modes
  (`READ_ONLY`, `WORKSPACE_WRITE`, `DANGER_FULL_ACCESS`, `PROMPT`, `TEST`)
  and `authorize()` sequence, with no mention of `FORGE_DECISION_OVERRIDE`.
  Sweep flagged potential bypass risk: if L3 accidentally reads the env var,
  permission checks could be silently circumvented.

This is a **clarification, not an architectural conflict**. The two
mechanisms operate at entirely different layers. The only real risk is
accidental cross-contamination in code.

---

## 2. Ruling

### W-03 — Layer separation: Pipeline Decision Gate ≠ L3 Permission Policy

**Ruling:** Not a conflict. The two env vars govern two distinct layers:

| Env Var | Layer | Scope |
|---|---|---|
| `FORGE_DECISION_OVERRIDE` | Pipeline Decision Gate (orchestration) | Controls whether the Decision Gate module auto-approves or rejects pipeline execution proposals. Defined in `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` §8. |
| `FORGE_PERMISSION_MODE` | L3 Permission Policy (runtime) | Selects the active permission mode for Tool invocations. Read by `permissionPolicy.authorize()`. |
| `FORGE_ALLOW_SELF_MODIFY` | L3 Permission Policy (runtime) | Gates `DANGER_FULL_ACCESS` mode. Read by `permissionPolicy.authorize()`. |

These two layers do not share env vars. Neither bypasses the other. The
Pipeline Decision Gate operates before execution begins (orchestration
phase); L3 operates during Tool invocation (runtime phase). A
`FORGE_DECISION_OVERRIDE=APPROVE_ALL` approval at the Decision Gate level
does NOT grant `DANGER_FULL_ACCESS` at the L3 level — they are independent
gates on independent concerns.

**Files to change:** 2 files only.

**Files NOT to change:**
- `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` —
  `FORGE_DECISION_OVERRIDE` is legitimate and correct for its layer.

---

## 3. Changes

### Change 1 — architecture/FORGE_V2_BLUEPRINT.md (Part B §L3, opening section)

Add a "Layer isolation" clause immediately after the opening description of
L3. Insertion point: after the paragraph that introduces the 5 permission
modes, before the `authorize()` sequence description.

```
--- before
[permission modes table ends]

---

+++ after
[permission modes table ends]

**Layer isolation.** L3 reads ONLY two environment variables:
`FORGE_PERMISSION_MODE` (selects the active mode) and
`FORGE_ALLOW_SELF_MODIFY` (gates `DANGER_FULL_ACCESS`). L3 does NOT read
`FORGE_DECISION_OVERRIDE` or any other override channel. The Pipeline
Decision Gate (per `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md`)
operates on a separate orchestration layer and uses its own override
channel; the two layers do not share env vars and neither bypasses the
other.

---
```

### Change 2 — code/src/runtime/permission/SCHEMA.md §10 (Boot wiring)

Add a "Forbidden env vars" paragraph at the end of §10.

```
--- before
[§10 Boot wiring content ends]

+++ after
[§10 Boot wiring content ends]

#### Forbidden env vars

L3 MUST NOT read `process.env.FORGE_DECISION_OVERRIDE`. Reading it in any
permission policy code is a contract violation. `FORGE_DECISION_OVERRIDE`
belongs to the Pipeline Decision Gate layer
(`docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` §8),
which is a separate orchestration layer. The two layers have independent
env var namespaces and independent authority.

The only env vars L3 is permitted to read are:
- `FORGE_PERMISSION_MODE` — selects active permission mode
- `FORGE_ALLOW_SELF_MODIFY` — gates `DANGER_FULL_ACCESS`
```

---

## 4. Mandatory PHASE-3 Smoke Test Scenario

The following scenario is **required** in `verify/smoke/test_permission_layer.js`
(or equivalent PHASE-3 smoke test). It is the mechanical proof of layer isolation:

**Scenario: FORGE_DECISION_OVERRIDE must not bypass L3**

```
Setup:   process.env.FORGE_DECISION_OVERRIDE = "APPROVE_ALL"
         active permission mode = "READ_ONLY"
Action:  registry.invoke("fs.write_file", { path: "artifacts/foo.txt", content: "x" }, ctx)
Assert:  envelope.status === "DENIED"
         envelope.metadata.reason === "SCOPE_READ_ONLY"
         (also accept "INSUFFICIENT_MODE" — valid if implementation checks mode
          before scope; what matters is status === "DENIED")
```

**Why `SCOPE_READ_ONLY`:** per `code/src/runtime/permission/SCHEMA.md` §6 Scope
rules table, a write to `artifacts/` in `READ_ONLY` mode hits the scope check
before the mode comparison and returns `SCOPE_READ_ONLY`. If the implementation
checks mode order first (data_mode insufficient for WORKSPACE_WRITE), it returns
`INSUFFICIENT_MODE` instead. Both are correct denials — the assertion is on
`status === "DENIED"`.

If `FORGE_DECISION_OVERRIDE` leaks into L3 and the write succeeds →
scenario FAILs → PHASE-3 cannot close.

---

## 5. Files Changed Summary

| File | WARN | Change |
|---|---|---|
| `architecture/FORGE_V2_BLUEPRINT.md` | W-03 | Part B §L3: "Layer isolation" clause added |
| `code/src/runtime/permission/SCHEMA.md` | W-03 | §10: "Forbidden env vars" paragraph added |

Files NOT changed:
- `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` — correct as-is

---

## 6. Effect on Open WARNs

| WARN | Resolution |
|---|---|
| W-03 (FORGE_DECISION_OVERRIDE) | Not a conflict. Layer separation clarified in Blueprint §L3 and permission SCHEMA. Mandatory isolation test required in PHASE-3 smoke suite. |

After application, no WARNs remain open for PHASE-3.

---

## 7. Application Scope

Text changes to exactly 2 files. Applied before PHASE-3 begins.

---

## 8. Owner Approval Record

> _(Capture verbatim owner reply here.)_

Approval: "approved" — 2026-05-08

---

**END OF DECISION ARTIFACT**

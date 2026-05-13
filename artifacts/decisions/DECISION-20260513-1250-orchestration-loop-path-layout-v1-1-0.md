# DECISION-20260513-1250 — Orchestration Loop Contract: Per-Loop Subdirectory Path Layout

| Field | Value |
|---|---|
| Decision ID | DECISION-20260513-1250-orchestration-loop-path-layout-v1-1-0 |
| Status | **OWNER_APPROVED** |
| Date | 2026-05-13 |
| Author | Claude (implementation arm) |
| Requested by | CTO (Stage 10.1 closure verification) |
| Contract affected | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` |
| Version change | v1.0.0 → v1.1.0 (minor, backward-compatible) |
| Amendment basis | Contract §14.2, §14.3 |

---

## §1 — The Discrepancy

### 1.1 Contract v1.0.0 path layout (flat)

The contract as written uses a flat layout under `orchestration/`:

| Section | Path (v1.0.0) |
|---|---|
| §3.3 (ConversationGraph) | `artifacts/projects/<project_id>/orchestration/conversation_graph.json` |
| §12.1 (Audit log) | `artifacts/projects/<project_id>/orchestration/conversation_log.jsonl` |
| §11.1 / §13 (Escalation artifact) | `artifacts/projects/<project_id>/orchestration/escalation_<ts>.md` |
| §12.4 (Orchestration summary) | `artifacts/projects/<project_id>/orchestration/orchestration_summary.md` |

### 1.2 Stage 10.1 implementation layout (per-loop subdirectory)

`loop_state.js` uses:

| File | Path (implementation) |
|---|---|
| ConversationGraph | `artifacts/projects/<project_id>/orchestration/<loop_id>/graph.json` |
| Audit log | `artifacts/projects/<project_id>/orchestration/<loop_id>/conversation_log.jsonl` |

The loop_id subdirectory is computed by `_graphPath(project_id, loop_id)` and `_logPath(project_id, loop_id)` in `loop_state.js` (lines 15–20).

---

## §2 — Architectural Justification

### Why the per-loop subdirectory is architecturally correct

**Problem with the flat layout:**

The contract §15.1 glossary defines "Loop" as "One complete execution of the 14-step orchestration sequence for a single project, identified by `loop_id`." A project can have multiple loops over its lifetime (re-runs, re-scoping, follow-on phases). Under the flat layout:

- `conversation_graph.json` → only 1 graph exists at a time → second loop overwrites first
- `conversation_log.jsonl` → second loop's audit rows are appended to the first loop's log → no per-loop isolation

This makes it impossible to:
1. Re-run an orchestration loop on the same project without destroying prior loop state
2. Store N completed loops for audit/history purposes
3. Resume a specific loop by loop_id after a process restart

**Fix provided by the per-loop subdirectory:**

```
artifacts/projects/<project_id>/orchestration/
  <loop_id_A>/
    graph.json
    conversation_log.jsonl
  <loop_id_B>/
    graph.json
    conversation_log.jsonl
```

Each `loop_id` is a UUID generated at `createLoop()` time. Loops are fully isolated. `loadLoop(project_id, loop_id)` reconstructs the exact graph by reading the correct subdirectory. No collision is possible.

### Backward compatibility declaration

Contract v1.0.0 was authored on 2026-05-13 (Stage 10.0 close). Stage 10.1 was the **first implementation** to write any orchestration artifacts. **No graphs or audit logs were ever serialized under the v1.0.0 flat layout.** There is nothing to migrate. The version bump is backward-compatible by vacuity.

---

## §3 — Proposed Contract Edits

### 3.1 Header version

```
--- before
# Orchestration Loop Contract v1.0.0
> **Version:** v1.0.0

+++ after
# Orchestration Loop Contract v1.1.0
> **Version:** v1.1.0
```

### 3.2 §3.3 — ConversationGraph file path (line 232)

```
--- before
`artifacts/projects/<project_id>/orchestration/conversation_graph.json`

+++ after
`artifacts/projects/<project_id>/orchestration/<loop_id>/graph.json`
```

### 3.3 §12.1 — Audit log path (line 278)

```
--- before
`artifacts/projects/<project_id>/orchestration/conversation_log.jsonl`

+++ after
`artifacts/projects/<project_id>/orchestration/<loop_id>/conversation_log.jsonl`
```

### 3.4 §11.1 — Escalation artifact path (line 409)

```
--- before
   `artifacts/projects/<project_id>/orchestration/escalation_<ts>.md`

+++ after
   `artifacts/projects/<project_id>/orchestration/<loop_id>/escalation_<ts>.md`
```

### 3.5 §13 — Escalation artifact path (line 701)

```
--- before
2. Escalation artifact written at `artifacts/projects/<id>/orchestration/escalation_<ts>.md`

+++ after
2. Escalation artifact written at `artifacts/projects/<id>/orchestration/<loop_id>/escalation_<ts>.md`
```

### 3.6 §12.1 — Audit log location note (line 734)

```
--- before
artifacts/projects/<project_id>/orchestration/conversation_log.jsonl

+++ after
artifacts/projects/<project_id>/orchestration/<loop_id>/conversation_log.jsonl
```

### 3.7 §12.4 — Orchestration summary path (line 789)

```
--- before
artifacts/projects/<project_id>/orchestration/orchestration_summary.md

+++ after
artifacts/projects/<project_id>/orchestration/<loop_id>/orchestration_summary.md
```

### 3.8 §14 — Amendment history block (append before END marker)

```
+++ add before "END OF ORCHESTRATION LOOP CONTRACT"

### 14.4 Amendment History

| Version | Date | Change | Decision |
|---|---|---|---|
| v1.1.0 | 2026-05-13 | Per-loop subdirectory inserted into all orchestration artifact paths (`orchestration/<loop_id>/`) to support N concurrent/sequential loops per project without collision. Backward-compatible: no v1.0.0 graphs exist. | DECISION-20260513-1250-orchestration-loop-path-layout-v1-1-0.md |
```

### 3.9 Footer version references (line 925–929)

```
--- before
**END OF ORCHESTRATION LOOP CONTRACT v1.0.0**
*Authored: 2026-05-13 — Stage 10.0*

+++ after
**END OF ORCHESTRATION LOOP CONTRACT v1.1.0**
*Authored: 2026-05-13 — Stage 10.0*
*Amended: 2026-05-13 — Stage 10.1 (v1.1.0)*
```

---

## §4 — Post-Approval Actions

Upon owner approval in chat, the following will be executed in order:

| Step | Action | File |
|---|---|---|
| A2 | Apply all 9 diffs from §3 to the contract | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` |
| A3 | Update §6.2 in closure checkpoint to reference this decision artifact | `artifacts/decisions/_phase_10_checkpoints/stage_10_1.md` |
| A4 | Add `contract_amendment` field to `phase_10.stages.10_1` in status.json | `progress/status.json` |

No code changes. No scenario changes. No doctor check changes. Loop_state.js is already correct.

---

## §5 — Owner Approval Block

> **Awaiting owner approval.**
>
> To approve, post in chat: **"أوافق على تعديل العقد v1.0.0 → v1.1.0"**
> or equivalent explicit confirmation.
>
> Upon approval, this document's `Status` field will be updated to `OWNER_APPROVED`
> and Actions A2–A4 will be executed immediately in the same session.

---

*Decision artifact authored: 2026-05-13*
*Scope: Contract §14.2 amendment — minor path layout change, no semantic change to state machine, schemas, or gates.*

Approved by KhElmasry in chat on 2026-05-13.

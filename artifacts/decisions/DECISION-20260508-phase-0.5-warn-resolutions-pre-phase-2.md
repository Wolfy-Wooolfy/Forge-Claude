# DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2 |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Triggered by** | artifacts/audit/blueprint_contradiction_sweep.md — WARNs W-01, W-02 |
| **Related** | DECISION-20260508-phase-0.5-resolutions, DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-1 |
| **Required before** | PHASE-2 (Tool Runtime Layer) |

---

## 1. Context

PHASE-0.5 Sweep identified 2 WARNs as pre-PHASE-2 requirements:

- **W-01** — Old execution pipeline model (Decision Gate → Backfill → Execute → Verify) vs Blueprint L2 Tool Runtime. Sweep flagged potential orphaning of WORKSPACE_BACKFILL.
- **W-02** — "Tool" terminology used in two incompatible senses: API endpoints (docs/11_ai_layer/07) vs L2 Runtime Tool objects (Blueprint).

Both are **clarifications, not architectural conflicts**. No pipeline doc needs to change; no L2 spec needs to change. Blueprint and Tools SCHEMA need disambiguation text only.

---

## 2. Rulings

### W-01 — Pipeline modules and L2 Tools are different layers, not competitors

**Ruling:** Not a conflict. The pipeline modules (DECISION_GATE, BACKFILL, EXECUTE, VERIFY) are **orchestration stages** that produce artifacts. L2 Tools are **side-effect executors**. Pipeline modules USE Tools to write files, update state, and run shell commands. They are not Tools themselves.

The pipeline structure defined in `docs/11_ai_layer/09_WORKSPACE_RUNTIME_LANE.md`, `docs/11_ai_layer/01_AI_LAYER_SCOPE.md`, and `docs/03_pipeline/BACKFILL_PROTOCOL_v1.md` is correct and remains authoritative. PHASE-6 (apiServer migration) will mechanically lift the `fs.*` / `shell.*` calls inside pipeline modules to L2 tool invocations — without changing the pipeline structure itself.

**Files to change:**
- `architecture/FORGE_V2_BLUEPRINT.md` — Part B §L2, end of section (after boot validation paragraph)

**Files NOT to change:** `docs/11_ai_layer/*`, `docs/03_pipeline/*`

#### Diff — architecture/FORGE_V2_BLUEPRINT.md (Part B §L2, after "Boot fails on violation.")

```
--- before
Boot fails on violation.

---

### L3. Permission / Safety Layer

+++ after
Boot fails on violation.

**L2 Tool Runtime does NOT replace pipeline modules.** The pipeline modules defined
in `code/src/modules/` and governed by `docs/11_ai_layer/09_WORKSPACE_RUNTIME_LANE.md`
(WORKSPACE_DECISION_GATE → WORKSPACE_BACKFILL → WORKSPACE_EXECUTE → WORKSPACE_VERIFY)
are **orchestration stages** — they sequence work, produce artifacts, and enforce
governance contracts. L2 Tools are **side-effect executors** — they perform atomic
write/read/shell operations with schema validation, permission gating, and audit trail.

The relationship is: pipeline modules **USE** L2 Tools to perform side effects. They
ARE NOT L2 Tools themselves and do not need to be rewritten as Tools. The two layers
coexist: pipeline modules orchestrate; L2 Tools execute side effects.

PHASE-6 (apiServer.js migration) will mechanically lift direct `fs.*`, `child_process.*`,
and `fetch()` calls inside pipeline modules to L2 tool invocations — without changing
the pipeline structure, module boundaries, or governance contracts.

---

### L3. Permission / Safety Layer
```

---

### W-02 — "Tool" terminology: two distinct concepts, one word

**Ruling:** Linguistic clash only. "tool" (lowercase) in the AI Layer docs means "approved API endpoint that the AI can trigger via conversation" (the `/api/ai/*` family). "Tool" (capital T) in Blueprint L2 means "a registered runtime object with `name, required_mode, input_schema, output_schema, preview(), execute()`". These are different abstractions at different layers.

The AI Layer usage in `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md` is correct for its scope. The Blueprint L2 usage is correct for its scope. Neither changes.

**Files to change:**
- `architecture/FORGE_V2_BLUEPRINT.md` — Part B §L2, opening (before "Problem today")
- `code/src/runtime/tools/SCHEMA.md` — §1 "Why this exists" (opening paragraph)

**Files NOT to change:** `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md`

#### Diff — architecture/FORGE_V2_BLUEPRINT.md (Part B §L2, opening)

```
--- before
### L2. Tool Runtime

**Problem today.** When the conversation engine wants to "save a file"...

+++ after
### L2. Tool Runtime

> **Terminology note.** Throughout this Blueprint, "Tool" (capital T) refers
> exclusively to an L2 Runtime Tool — a registered object with `name`,
> `required_mode`, `input_schema`, `output_schema`, `preview()`, and `execute()`.
> The lowercase "tool" used in `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md`
> refers to AI Layer approved API endpoints (e.g., `/api/ai/analyze`,
> `/api/ai/propose`) — a different concept at the UX/API layer. The two are
> NOT interchangeable. When this Blueprint says "Tool", it always means the L2
> runtime object. Added 2026-05-08 via DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2.

**Problem today.** When the conversation engine wants to "save a file"...
```

#### Diff — code/src/runtime/tools/SCHEMA.md (§1, opening paragraph)

```
--- before
## 1. Why this exists

Forge today scatters side effects across 91 endpoints and 17 engines...

+++ after
## 1. Why this exists

> **Terminology note.** In this specification and in `architecture/FORGE_V2_BLUEPRINT.md`,
> "Tool" (capital T) refers exclusively to an L2 Runtime Tool — a registered object with
> `name`, `required_mode`, `input_schema`, `output_schema`, `preview()`, and `execute()`.
> This is distinct from the lowercase "tool" used in
> `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md`, which refers to approved AI
> Layer API endpoints (e.g., `/api/ai/analyze`). The two concepts are NOT interchangeable.
> Added 2026-05-08 via DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2.

Forge today scatters side effects across 91 endpoints and 17 engines...
```

---

## 3. Files Changed Summary

| File | WARNs | Change |
|---|---|---|
| `architecture/FORGE_V2_BLUEPRINT.md` | W-01, W-02 | §L2 end: pipeline coexistence paragraph; §L2 opening: Terminology note |
| `code/src/runtime/tools/SCHEMA.md` | W-02 | §1 opening: Terminology note |

Files NOT changed:
- `docs/11_ai_layer/09_WORKSPACE_RUNTIME_LANE.md` — correct as-is (W-01)
- `docs/11_ai_layer/01_AI_LAYER_SCOPE.md` — correct as-is (W-01)
- `docs/03_pipeline/BACKFILL_PROTOCOL_v1.md` — correct as-is (W-01)
- `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md` — correct as-is (W-02)

---

## 4. Effect on Open WARNs

| WARN | Resolution |
|---|---|
| W-01 (Pipeline vs L2) | Not a conflict. Blueprint amended to clarify coexistence: pipeline orchestrates, Tools execute side effects. PHASE-6 handles the mechanical lift. |
| W-02 (Tool terminology) | Not an architectural conflict. Blueprint §L2 and Tools SCHEMA.md each gain a disambiguation note. No docs change. |

After application, no WARNs remain open for PHASE-2.
W-03 (before PHASE-3) remains open; out of scope here.

---

## 5. Application Scope

Text changes to exactly 2 files. Applied 2026-05-08.

Changes applied:
- `architecture/FORGE_V2_BLUEPRINT.md` — §L2 opening: Terminology note (W-02);
  §L2 end: pipeline coexistence paragraph (W-01).
- `code/src/runtime/tools/SCHEMA.md` — §1 opening: Terminology note (W-02).
- `progress/status.json` — warns_pending.before_phase_2 cleared, PHASE-2 unblocked.

---

## 6. Owner Approval Record

> _(Capture verbatim owner reply here.)_

Approval: "approved" — 2026-05-08

---

**END OF DECISION ARTIFACT**

# DECISION-2026-06-03 — PHASE-20: Vision-to-Pipeline Bridge (MVP)

> **Status:** OWNER-APPROVED — Khaled approved in chat 2026-06-03.
> **Authored:** 2026-06-03
> **Phase type:** Integration — connects the conversational front (PHASE-17/19) to the orchestration loop (PHASE-7+).
> **Predecessor:** PHASE-19 CLOSED ✅. Gate #10 owner-confirmed end-to-end.
> **Authority:** Builds on existing orchestration infra. Does NOT amend the Blueprint or add §ARC.

---

## 1. Why this phase exists

PHASE-19 closure confirmed the conversational flow works end-to-end: conversation → idea summary → confirm → vision locked. But the owner observed Forge "stops" after confirmation — nothing further happens.

§0 investigation (this session) found the exact gap:

- `confirmIdea(AFFIRM)` writes `vision.md`, sets `conversation_mode = "PIPELINE"`, then **returns immediately**.
- The orchestration loop (architect → spec → builder → ... , 7 states, fully built in PHASE-7+) exists and is tested (S139–S157), but it is **triggered manually** via `orchestration.start_loop`.
- **No code bridges `confirmIdea` → `start_loop`.** The vision is locked but nothing consumes it.

This is the "last mile": everything is built, but the conversational front and the orchestration back are not wired together.

**Key de-risking finding:** PHASE-11 intake (`intake_conversation_handler.js _doApprove`) already performs exactly this bridge for the existing-project path: `vision.lock → start_loop(owner_intent_source: "vision_locked_intake") → save loop_id`. PHASE-20 replicates this proven pattern for the conversational path, then goes **one step further** — it actually runs the architect role and surfaces the result (intake stops at "the architect will receive the vision").

Additionally, a PHASE-19 open finding (synthesis_language) is folded in as a **prerequisite**: the idea summary currently outputs English even for Arabic conversations. Since the vision is the architect's input, it must be in the owner's language before the pipeline consumes it.

---

## 2. Scope (frozen — MVP, first orchestration state only)

### 2.1 Language fix (prerequisite)

`ideaSynthesisProvider._buildUserPrompt` detects the language of the first USER message in the conversation history and appends an explicit instruction: all output fields (project_name, goal_primary, features, constraints, non_goals, open_questions) must be in that language.

- No change to the system prompt (it lives in a protected doc).
- Added to the user prompt only. No new dependency.
- Reuses the existing language-detection helper if one exists; otherwise a minimal Arabic-character-ratio check.

### 2.2 The bridge: confirmIdea → start_loop

After `confirmIdea(AFFIRM)` writes `vision.md` and verifies frontmatter (current behavior, unchanged), it then replicates the intake `_doApprove` pattern:

```
reg.invoke("orchestration.start_loop", {
  project_id,
  owner_intent_source: "vision_locked_intake"   // jumps straight to ARCHITECT_DESIGN
})
```

The returned `loop_id` is saved into the project runtime state JSON (not idea_summary).

### 2.3 Run the architect (sync) — the MVP value

This is where PHASE-20 goes beyond intake. After `start_loop` returns (state = ARCHITECT_DESIGN):

1. Build the architect `intent` from the locked vision:
   `intent = <goals.primary> + "\n\nFeatures:\n" + <features joined>`
   (goals.primary from vision frontmatter; features from idea_summary.json since they are not in the frontmatter.)
2. Invoke the architect role **synchronously** via `role.invoke` (mock in tests, real OpenAI in owner UI test), with a 30-second timeout guard.
3. Write the architect's design output to disk (the orchestration loop does not auto-persist role output — must be written manually).
4. Advance the loop state: `advance_state(ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE, transition_type: "NORMAL", role_invoked: "architect")`.

**Decision OQ-1: SYNC, not async.** There is no background job runner anywhere in the codebase. Building one is a large new component (process lifecycle, crash recovery, state reconciliation) and a phase of its own. For the MVP, the architect runs synchronously inside the confirm-idea request with a 30s timeout. The idea-synthesis call is already sync with comparable latency, so this is consistent. Async is a deliberate future optimization if real-world latency proves it necessary — not an upfront assumption.

### 2.4 FE displays the architect design

The confirm-idea response now carries the architect design (since it ran sync). The FE renders it: a "Forge designed your system" view showing design_summary, components, technology_choices, and identified_risks. No polling (not needed with sync).

---

## 3. Out of scope (explicit)

- The remaining 6 orchestration states (spec_writer, reviewer, builder, security_auditor, test_designer, ...). They run after ARCHITECT_DESIGN — future phases, one at a time.
- Any async/background job runner.
- The deployment_split finding (server can run from a stale copy). Real risk, mitigated manually in PHASE-19, deferred to a cleanup phase. Mixing it here breaks focus.
- Any new agent role, new §ARC, new npm dependency.
- Debate protocol, approval gates beyond the architect step.

---

## 4. §ARC impact

**Zero new §ARC.** Ledger stays at 8. The architect runs through the existing `role.invoke` → `agent.invoke` path, which already respects the ledger.

---

## 5. Acceptance gates (deterministic — phase stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | Language fix: a scenario with an Arabic conversation produces an idea summary whose fields are Arabic. A scenario with English stays English. |
| 2 | `confirmIdea(AFFIRM)` calls `start_loop` and saves `loop_id` to runtime state — verified by scenario. |
| 3 | After confirm, the loop is in SPEC_WRITER_FORMALIZE state (architect ran, advanced) — verified by reading graph.json in a scenario. |
| 4 | The architect design output is written to disk at a defined path — verified by scenario. |
| 5 | The confirm-idea response carries the architect design object — verified by scenario asserting the response shape. |
| 6 | 30s timeout guard exists around the architect call; on timeout, confirm returns a clean error (vision stays locked, loop_id saved, but design marked failed) — verified by scenario. |
| 7 | TypeScript strict build clean. |
| 8 | Full suite on Windows: 237 + N passed / 0 failed / 5 skipped, N = new scenarios. |
| 9 | §ARC count: 8 (unchanged). |
| 10 | **Gate #10 (the real closure):** owner does the full UI flow — conversation (Arabic) → confirm → sees the architect's design rendered in the UI, in Arabic, on their actual idea. |

Gate #10 is the closure. Backend scenarios are necessary but not sufficient.

---

## 6. Open questions resolved (CTO decisions, §0)

- **OQ-1 async:** SYNC + 30s timeout. (§2.3 rationale.)
- **OQ-2 vision→intent:** `goals.primary + "\n\nFeatures:\n" + features.join`. Goals from frontmatter, features from idea_summary.
- **OQ-3 OWNER_INTENT:** `owner_intent_source: "vision_locked_intake"` jumps directly to ARCHITECT_DESIGN. No separate OWNER_INTENT→ARCHITECT advance.
- **OQ-4 FE feedback:** sync response carries design; FE renders it; no polling.
- **OQ-5 architect mock:** key format `mock|<model>|architect|<intent>`. Exact key confirmed in build + mid-checkpoint.
- **OQ-6 loop_id:** runtime state JSON only.

---

## 7. Cost budget

- Mock-first for all scenarios.
- Real OpenAI only at Gate #10: idea synthesis (~$0.003) + architect design (~$0.01–0.02, larger output) = ~$0.025 max for the owner test.
- Kill bar: $3.00 (phase touches a real LLM role).

---

## 8. Estimated effort

- **2 sessions** if the bridge replicates intake cleanly and the architect runs first try.
- **3 sessions** if wiring the architect output persistence or the sync timeout reveals gaps.

---

## 9. Approval

- [x] Owner replied "approved" in chat — 2026-06-03
- [ ] This artifact committed to `artifacts/decisions/`
- [ ] `status.json.next_phase` updated to `PHASE-20-ACTIVE`

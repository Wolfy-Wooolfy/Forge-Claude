# DECISION-2026-05-24T16-00-phase-16-ux-closure-gap

> **Type:** Phase Activation Decision — Corrective (post-closure)
> **Status:** CLOSED — PHASE-16 UNIFIED complete. Owner test passed 2026-05-28: B1–B8 all verified, Conversation Mode working in multi-turn real use.
> **Authored:** 2026-05-24
> **Authority:** Blueprint Part B-2 (Conductor Model) + Blueprint Part H
> **Predecessor:** PHASE-13.8 — Frontend Auth + Robust Startup
>   (DRAFT — pending owner reboot test; does not block PHASE-16
>   frontend/conversation work — see §7)

---

## 1. Why this phase exists

The roadmap declared Forge v2.0 "complete" (project-closure artifact
`DECISION-2026-05-23T16-00-project-closure.md`). Every one of the 219
self-test (SU) scenarios passes. Doctor exits clean. Yet the first
real owner use exposed a hard truth: **Forge is mechanically complete
but not usable.**

The SU suite proves the *mechanics* — the state machine transitions,
tools register, permission gates fire. No SU scenario proves the
*outcome*: "a non-technical owner opens Forge, asks to build an app,
and reaches a working result." That gap is why a green suite and a
broken product coexisted.

This phase closes the gap between what the Blueprint promised
(Part B-2: "Plain-language interface. Owner never needs technical
vocabulary.") and what the implementation delivers.

### 1.1 Evidence — the first real-use session

The owner opened Forge and had this exchange (paraphrased from the
session transcript):

```
Owner:  أنا عايز أعمل ابليكيشن في مجال العناية بالبشرة
Forge:  هل تبحث عن تطبيقات عامة أو نوع يعمل في العناية؟
Owner:  بشكل عام
Forge:  هل تفضل تطبيقات مجانية أو مدفوعة؟
Owner:  مجانية، عايز اعمل تطبيق مجاني زي بيلنزات أفضل
Forge:  ما هي الميزات التي ترغب في تحسينها؟       ← repeated
Owner:  ادلني للمقترحات
Forge:  ما هي الميزات التي ترغب في وجودها؟        ← repeated
Owner:  اقترح عليا
Forge:  هل تفضل التطبيق يخصص لنوع بشرتك، ...    ← repeated
Owner:  اعمل مقترح كامل وارعيني عليا
Forge:  هل تفضل التطبيق يخصص لنوع بشرتك، ...    ← repeated
```

Forge never produced a proposal. It looped on questions until the
owner gave up.

## 2. Root cause — corrected diagnosis

The CTO's first diagnosis named the symptom: "the chat loops, no
break-out." A break-out counter was proposed. That was a patch on a
wound, not a cure.

The owner's own observation reframed it correctly: *"why isn't it a
normal chat at the start — like the chat I have with you — and only
when we reach the final shape do we take the next steps?"*

That reframing is the real diagnosis, and this phase adopts it:

> **Forge has no free-form conversation mode. It has only a pipeline
> mode. Every message a user sends enters the pipeline state machine
> (`DISCUSSION → DISCOVERY_REQUIRED → IDEATION → OPTION_DECISION →
> ...`) immediately. With no other mode available, the loop is
> structurally inevitable — the engine treats every message as a
> pipeline step, so every reply is a pipeline question.**

The `ideationEngine.js` line 167 logic
(`readyForOptions = expansion.readiness_assessment.ready_for_options`)
delegates the entire "stop asking, start proposing" decision to the
LLM, with no deterministic fallback. But fixing *that* line is still
treating the symptom. The cure is to give Forge a conversation mode
that exists *before* the pipeline — so a free exchange is possible at
all, and the pipeline is entered only by an explicit, deliberate
transition.

This is consistent with Blueprint Part B-2 (the Conductor Model):
Forge is meant to understand intent in natural language first, and
orchestrate the pipeline second. The implementation skipped the
"understand in natural language" stage and started at the pipeline.

## 3. The defect inventory (12 items)

Established by independent CTO deep-dive (code-level evidence on every
row). Severity order.

### BLOCKER — prevents core use

| ID | Defect | Code evidence |
|----|--------|---------------|
| G1 | Chat loops; no proposal ever produced. No free-form conversation mode exists. | `ideationEngine.js:167`; no `question_count` in `ai_os` state; pipeline entered on message 1 |
| G2 | No way to intake an existing project from the UI. | `App.tsx:46-51` — 5 routes, no intake; backend `apiServer.js:1775` triggers intake on `zip_path`/`directory_path` but no file-upload endpoint, no UI |

### HIGH — breaks trust / data integrity

| ID | Defect | Code evidence |
|----|--------|---------------|
| G10 | Selected project does not carry into the Chat tab. | `ChatView.tsx:35` has its own `useState('default_project')`; no shared state; `ChatView.tsx:256` comment "replaced by project picker in Stage 13.3" — picker never built, left as a text input |
| G3 | Doctor reports stale port 4505 instead of 3100. | `apiServerPort.js:9` + `webServerPort.js:9-10` — `ctx.api_port \|\| 4505`; `ctx.api_port` never passed |
| G4 | 12 of 13 providers are pre-v2 ("legacy, not v2-compliant"). | Doctor `providers_registered` WARN; `conversationalResponseProvider.js:183,222` use direct `new OpenAI()` outside `openAiAdapter.js` |
| G5 | Doctor summary prints "0 critical" wording. | `runDoctor.js:38` — `summary = fail + " critical, " + warn + " warning"`, no zero/plural handling |

### MEDIUM — visible UX defects

| ID | Defect | Code evidence |
|----|--------|---------------|
| G6 | RTL broken despite `dir="rtl"`. | `App.tsx:34` uses LTR Tailwind (`border-r`, row `flex`); HTML is rtl — flex flips, borders do not |
| G7 | Projects list shows internal test artifacts. | `apiServer.js:797` `listKnownProjectIds()` returns every folder; `ProjectsView.tsx` has no filter — owner sees `stage_11_1_live_demo` etc. |
| G8 | Project Context shows internal jargon. | `DISCOVERY_REQUIRED`, `EXECUTION_PACKAGE_PENDING_FORGE` shown raw; violates Blueprint Part B-2 |
| G9 | Empty chat screen, no guidance. | `ChatView` empty state is "Send a message to start" only |

(G4 is listed HIGH but scheduled last — see §4 rationale.)

## 4. Scope — PHASE-16, six stages

Each stage is independently closable and ordered by user impact.

| Stage | Title | Defects | Est. |
|-------|-------|---------|------|
| 16.1 | Conversation Mode | G1 | 4–6 d |
| 16.2 | Intake in the UI | G2 | 4–5 d |
| 16.3 | Shared Project State | G10 | 2–3 d |
| 16.4 | Doctor Fixes | G3, G5 | 1–2 d |
| 16.5 | UX Polish | G6, G7, G8, G9 | 3–4 d |
| 16.6 | Provider Contract v2 Completion | G4 | 6–9 d |

**Ordering rationale.** 16.1 first — it is the BLOCKER and the
architectural keystone; everything else is polish on an unusable
core if 16.1 is not done. 16.2 second — the owner explicitly asked
for it and it is the second BLOCKER. 16.3 third — data-integrity
defect, small, unblocks confident multi-project use. 16.4 and 16.5
are visible-but-non-blocking. 16.6 last — the 12 legacy providers
*work*; they are simply not on the v2 contract. It is architectural
debt, not a user-facing failure, so it is sequenced after every
user-facing defect is closed. It is in PHASE-16 (not deferred)
because the owner's directive is "complete with no problems."

### 16.1 — Conversation Mode (the keystone)

**IN:**
- A free-form conversation mode that exists *before* the pipeline
  state machine. On a fresh project, the owner and Forge converse
  naturally — questions, suggestions, refinements, back-and-forth —
  with NO domain locked, NO stage advanced, NO pipeline entered.
- Conversation mode uses `conversationalResponseProvider` for replies
  (it already produces free-form responses; it is the right seam).
- An **explicit, deliberate transition** out of conversation mode
  into the pipeline. The transition is owner-initiated by default:
  Forge may *suggest* "the idea looks clear — shall we start
  building?" but the owner confirms. Only on confirmation does the
  project enter `DISCOVERY_REQUIRED → IDEATION → ...`.
- When the owner asks for a proposal/recommendation inside
  conversation mode ("اقترح عليا", "اعمل مقترح"), Forge produces one
  *in the conversation* — it does not silently route into the
  pipeline.
- A deterministic guarantee: conversation mode can ALWAYS produce a
  response and can ALWAYS reach the transition. There is no code path
  where the owner is stuck — this is the structural fix for G1.

**OUT:**
- The pipeline itself is NOT rewritten. `DISCOVERY → IDEATION →
  OPTION_DECISION → ...` and the 219 SU scenarios stay intact. The
  pipeline becomes the *second* mode, entered after conversation,
  not the first.
- No change to `ideationExpansionProvider` prompt logic in this
  stage (its proposal-request rule stays; it is just no longer the
  only thing standing between the owner and a result).

**Open design question for the phase prompt (Step 0 must resolve):**
Where the conversation/pipeline boundary lives — a new top-level mode
field on project state, vs. a new state *before* `DISCUSSION`. The
implementation arm proposes the mechanism in Step 0; the CTO
confirms before code.

### 16.2 — Intake in the UI

**IN:**
- A file-upload endpoint accepting a project zip (the backend
  intake handler currently expects a `zip_path` already on disk —
  this stage adds the upload that produces that path).
- A UI surface — a route and a screen — for "analyze an existing
  project": upload a zip (or point at a folder), see Forge's reverse-
  vision draft, approve to bring it into the standard flow.
- Wires to the existing `intake_tools.js` / `project.intake_zip` /
  `project.analyze_source` — no new analysis logic.

**OUT:** No new tree-sitter grammars, no new analysis capability.
PHASE-11 built the engine; this stage builds the door to it.

### 16.3 — Shared Project State

**IN:**
- A single source of truth for "the active project" shared across
  Chat, Projects, Vision, KB views (React context or equivalent).
- Selecting a project in Projects → Chat operates on that project.
- The `ChatView.tsx:256` manual text input is replaced by a real
  picker bound to the shared state.

**OUT:** No backend change expected (the backend already has
`activateProject`); if one is needed, STOP and report.

### 16.4 — Doctor Fixes

**IN:**
- G3: `apiServerPort.js` / `webServerPort.js` read the real active
  port (pass `api_port` into the check `ctx`, or read it from the
  running server / env). No hardcoded 4505 fallback presented as
  truth.
- G5: `runDoctor.js:38` summary string handles zero and plural
  correctly ("HEALTHY" / "N warning" / "N critical, M warning").

### 16.5 — UX Polish

**IN:**
- G6: RTL-correct layout — RTL-aware Tailwind utilities
  (`border-s`/`border-e`, `ms-`/`me-`), correct flex direction.
- G7: Projects list filters out internal/test projects (a naming
  convention or an explicit "internal" flag — STOP and propose the
  mechanism in the stage's Step 0).
- G8: Project Context shows plain-language status, not raw state
  enums.
- G9: Chat empty state gives a non-technical owner a starting prompt
  ("جرب: عايز أبني تطبيق في...").

### 16.6 — Provider Contract v2 Completion

**IN:**
- The 12 legacy providers are migrated onto Provider Contract v2
  (the `defineProvider` contract + `openAiAdapter.js`).
- `conversationalResponseProvider`'s direct `new OpenAI()` calls
  (lines 183, 222) are removed; the provider uses the shared adapter.
- Doctor `providers_registered` reports `13/13 v2-compliant`.

**OUT:** No change to provider *behavior* — this is a contract
migration, observable only to Doctor and the trace layer.

## 5. Track A

PHASE-16 is overwhelmingly frontend (16.1 conversation UX, 16.2/16.3
React, 16.5 React) plus small backend touches (16.2 upload endpoint,
16.4 doctor checks, 16.6 provider migration).

- Frontend code: Track A exempt (TypeScript strict, zero `any`).
- Backend touches MUST hold Track A: no direct `fetch()`, no
  `fs.*Sync` outside the §ARC ledger, no `new OpenAI()` outside
  `openAiAdapter.js`, no `child_process` outside §ARC-3.
- 16.6 specifically REMOVES a Track A deviation (the direct
  `new OpenAI()` in `conversationalResponseProvider`) — it improves
  Track A compliance.
- §ARC ledger is expected to stay at 7. Any new §ARC need → STOP,
  write a decision artifact, get owner approval before code.

## 6. Closure gate — outcome-based (the central rule of this phase)

PHASE-13's stages closed against "the SU scenario is green" and still
shipped broken features (the Stage 13.3 project picker passed a
Playwright test for the input's existence, yet the picker was never
built). PHASE-16 closes that loophole.

**Every PHASE-16 stage closes against a user OUTCOME, not a widget's
existence.** Concretely, each stage closure gate requires ALL of:

1. **Deterministic SU/Playwright scenarios** — exact count stated in
   the stage prompt, all PASS or known-SKIP, zero unexpected FAIL.
2. **Track A grep clean** for any backend touch.
3. **An owner real-use test** — the owner performs the actual end-to-
   end action and confirms the outcome, with a screenshot. Examples:
   - 16.1 closes only when the owner asks "اقترح عليا" and receives
     an actual proposal — not another question.
   - 16.2 closes only when the owner uploads a real project zip and
     sees a reverse-vision draft.
   - 16.3 closes only when the owner selects a project and the Chat
     tab is demonstrably operating on it.
4. Decision artifact written, `status.json` advanced (additive),
   mid-checkpoint + final checkpoint written under
   `artifacts/decisions/_phase_16_checkpoints/`.

A stage with green scenarios but no owner-confirmed outcome is NOT
closed. This rule is the reason this phase exists; it is binding.

## 7. Sequencing relative to PHASE-13.8

PHASE-13.8 is DRAFT pending the owner's reboot test (Stage 13.8-7).
PHASE-16's frontend/conversation work (16.1, 16.3, 16.5) does NOT
touch the startup path that 13.8-7 verifies, so 16.1 may begin in
parallel with the owner's reboot test. 16.2's upload endpoint and
16.4's doctor checks DO touch the backend — those stages start only
after PHASE-13.8 is fully CLOSED (reboot test confirmed). The stage
prompts will state this dependency explicitly.

## 8. Cost

Mock-only for all development. Kill-bar $3.00 per stage. The owner
real-use tests (§6.3) make real provider calls on the owner's own
key — minimal, the owner's step, not the implementation arm's.
Expected development cost: $0.00.

## 9. Approval

Pending owner approval in chat. On approval, PHASE-16 is authorized
and Stage 16.1 (Conversation Mode) begins with a Step-0 state-
inheritance summary for CTO verification.

The roadmap (`FORGE_V2_PHASE_ROADMAP.md`) and `status.json` are
updated to reflect PHASE-16 as an active corrective phase; the
project-closure artifact is amended to record that closure was
premature and PHASE-16 follows.

---

**END OF DECISION**

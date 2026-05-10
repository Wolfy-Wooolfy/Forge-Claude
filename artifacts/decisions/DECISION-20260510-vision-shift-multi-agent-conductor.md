# DECISION-20260510-vision-shift-multi-agent-conductor

| Field | Value |
|---|---|
| Date | 2026-05-10 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-10 |
| Authority | Layer-0 (peer to FORGE_V2_BLUEPRINT.md) |
| Supersedes scope of | `DECISION-20260509-vision-shift-track-b.md` (additive — refines execution model) |
| Related | `DECISION-20260508-phase-0-closure-and-blueprint-prep.md` |

---

## 1. Executive Summary (read this first)

Forge transitions from **single-tool orchestrator** to **multi-agent conductor**.

**The shift in one paragraph:**
Forge keeps its deterministic governance (vision lock, privilege guard, audit log, workspace boundary). On top of this foundation, Forge adds an orchestration layer of 11 specialized LLM agents. The owner expresses intent in natural language; the agents collaborate to design, build, review, secure, test, document, and deploy. Forge enforces the rules and orchestrates the dialogue. The result is intelligent governance — not just rule enforcement.

**Why this matters:**
The owner is non-technical. Today's industry tools (Claude Code, Cursor, Devin, Aider) are single-agent — they require the owner to drive design, review code, catch security flaws, and orchestrate deployment. A non-technical owner cannot do this. The multi-agent conductor model fills the gap.

**What this enables:**
```
Owner:  "Build me a customer management app with email notifications"
Forge:  [orchestrates 11 agents through design → build → review → ship]
Result: Working application + tests + docs + deployment + audit trail
Cost:   ~$5-9 per typical project (with controls)
Time:   1-2 hours instead of days
```

**Roadmap impact:**
- 2 new phases: PHASE-7-E (Agent Adapter Contract), PHASE-7-F (11 Specialized Roles)
- PHASE-11 expanded: Existing Project Intake (improve / add feature / bug fix / understand)
- 1 deferred phase: PHASE-14 (Legacy Migration/Refactor/Modernization)
- All Track A foundation + completed Track B phases (7-A, 7-B, 7-C trilogy) preserved unchanged

---

## 2. The Architectural Model

### 2.1 The Conductor Diagram

```
+------------------------------------------------------------------------+
|  Owner (natural language, non-technical)                               |
+--------------------+---------------------------------------------------+
                     |  intent
                     v
+------------------------------------------------------------------------+
|  FORGE — The Conductor                                                 |
|                                                                        |
|  Deterministic Governance Layer (existing, preserved):                |
|   • Vision Engine + lock                                              |
|   • Permission Policy (READ_ONLY/WORKSPACE_WRITE/PROMPT/...)          |
|   • Privilege Guard (container, shell, etc.)                          |
|   • Audit Log + Cost Ledger                                           |
|   • Workspace Boundary Enforcement                                    |
|                                                                        |
|  Agent Orchestration Layer (NEW — PHASE-7-E + 7-F):                  |
|                                                                        |
|   [A] Architect          — designs system structure                   |
|   [S] Spec Writer        — translates design -> §2 contract           |
|   [R] Reviewer           — reviews spec AND code                      |
|   [$] Cost Estimator     — predicts spend before build                |
|   [E] Environment Agent  — guides install of missing dependencies     |
|   [B] Builder            — writes implementation (Claude Code/Codex)  |
|   [X] Security Auditor   — adversarial threat review                  |
|   [T] Test Designer      — generates test scenarios                   |
|   [D] Documentation      — README, API docs, user guides              |
|   [Q] Quality Judge      — final go/no-go verdict                    |
|   [P] Deployment         — ship to Vercel/Railway/AWS                 |
|                                                                        |
|   + 1 specialized for existing projects (PHASE-11):                   |
|   [L] Reverse Architect  — infers design from existing code           |
+--------------------+---------------------------------------------------+
                     |  verified deliverable + audit trail
                     v
              Owner approval gates (3 places)
```

### 2.2 Why deterministic governance + LLM intelligence

**Deterministic governance alone (current Forge):**
- + Predictable, auditable, fail-closed
- - Cannot evaluate design quality, detect anti-patterns, reason about threats

**LLM agents alone (Claude Code/Cursor/Devin):**
- + Architectural judgment, code generation, debugging
- - No deterministic rule enforcement, audit integrity, fail-closed guarantees

**Combined (Forge multi-agent):**
- Deterministic layer enforces *what cannot happen* (privilege escapes, vision-locked mutations, workspace violations)
- LLM agents reason about *what should happen* (good architecture, secure design, comprehensive tests)
- Neither can override the other — deterministic has hard veto; agent recommendations are advisory until owner-approved or reached via consensus

### 2.3 Why this is "ahead by years"

State of the field as of May 2026:
- Production single-agent: Claude Code, Cursor, Devin, Aider
- Production multi-agent with deterministic governance: **none shipped**
- Anthropic, OpenAI, Google all investing in multi-agent — research stage

A production-grade multi-agent orchestrator with deterministic governance does not exist today. Forge will be it.

---

## 3. The 11 Agent Roles

This decision defines the role taxonomy. Implementation (system prompts, schemas, evaluation criteria) is deferred to PHASE-7-F.

### 3.1 Architect Agent

**Purpose:** Convert owner intent into a system design.

**Inputs:** Owner's natural language request, project vision, existing project state (if any).

**Outputs:** Architectural design with components, data flow, technology choices, integration points, identified risks.

**Authority:** None. Output is reviewed by other agents and approved by owner.

### 3.2 Spec Writer Agent

**Purpose:** Translate architectural design into a Forge-compatible §2 decision artifact.

**Inputs:** Architect's design document, project vision, owner constraints.

**Outputs:** §2 decision artifact draft (scope, decisions, fronts, ACs, files-to-create/modify lists).

**Authority:** None. Reviewed by Reviewer Agent AND owner before Build phase begins.

### 3.3 Reviewer Agent

**Purpose:** Architectural critique. Two-phase review:

**Phase A — Spec Review:**
- Reviews Spec Writer's output before Build phase
- Catches: ambiguities, missing edge cases, contradictions, unspecified behavior
- Output: BLOCKER/WARN/INFO issues on the spec

**Phase B — Code Review:**
- Reviews Builder's code before Quality Judge
- Catches: design flaws, anti-patterns, scalability issues
- Output: BLOCKER/WARN/INFO issues on the code

**Authority:** BLOCKER halts pipeline until addressed. WARN requires owner ack. INFO logged only.

### 3.4 Cost Estimator Agent

**Purpose:** Predict total project cost before Build phase begins.

**Inputs:** Architect's design, Spec Writer's spec.

**Outputs:** Cost breakdown:
```
Estimated cost:
  - Spec Writer:           $0.15
  - Builder:               $2-3
  - Reviewer + Security:   $0.90
  - Test Designer:         $0.30
  - Documentation:         $0.50
  - Deployment:            $1-2 (if enabled)
  - Iterations (1-2):      $1.50-3.00
  ------------------------------------
  Estimated total: $5-9
  Worst case (5 iterations): $20
  Confidence: 80%
```

**Authority:** None. Reports to owner who approves or scales scope.

### 3.5 Environment Agent

**Purpose:** Detect environment, guide owner through missing dependency installation. **NOT auto-install.**

**Inputs:** Architect's design (declares required runtimes/services).

**Outputs:** Environment report with detected/missing dependencies and recommendations.

**Authority:** None. Owner picks the path.

**Decision per owner request 2026-05-10:** Smart Environment Agent (guide), not auto-installer. Owner explicitly approved this trade-off after risk explanation.

### 3.6 Builder Agent

**Purpose:** Implement the spec. Only role that writes production code.

**Inputs:** Approved §2 spec, generated test scenarios, workspace context.

**Outputs:** Code files in workspace satisfying the spec.

**Provider options (vision-locked per project):**
- Claude Code (CLI) — toolset rich, fast iteration
- Codex (API) — direct API integration, structured outputs
- Aider (CLI) — git-aware workflow
- Future builders as they emerge

**Authority:** None. Code reviewed by Reviewer + Security + tested by harness.

### 3.7 Security Auditor Agent

**Purpose:** Adversarial review focused on security exploits.

**Inputs:** Generated code, deployment context, architect's threat model.

**Outputs:** Threat report — vulnerabilities, attack vectors, mitigations.

**Authority:** Security BLOCKER halts pipeline. Security WARN requires explicit owner ack.

**Why separate from Reviewer:** Adversarial mindset is a distinct cognitive mode. Industry research shows dedicated security review catches more issues than combined review.

### 3.8 Test Designer Agent

**Purpose:** Generate test scenarios proving spec is correctly implemented.

**Inputs:** Approved §2 spec, architect's design.

**Outputs:** Scenario JSON files (same format as Forge's L5b harness).

**Authority:** None. Output executed by harness; failures loop back to Builder.

### 3.9 Documentation Agent

**Purpose:** Produce documentation for owner and project users.

**Inputs:** Final code, spec, architect's design.

**Outputs:**
- `README.md` — project overview, setup, usage
- `API.md` — endpoint documentation (if applicable)
- `USER_GUIDE.md` — how owner uses the system
- Inline code comments for critical logic

**Authority:** None. Reviewed by owner.

### 3.10 Quality Judge Agent

**Purpose:** Synthesize all prior outputs into a single ship/no-ship verdict.

**Inputs:** Design + spec + code + reviewer report + security report + test results + docs.

**Outputs:** APPROVED / APPROVED_WITH_CAVEATS / REJECTED with specific reasons.

**Authority:** Cannot ship without APPROVED or APPROVED_WITH_CAVEATS + owner ack.

**Why a separate role:** Synthesis is a different cognitive task than producing any individual output. Judge catches contradictions between agents.

### 3.11 Deployment Agent

**Purpose:** Ship the verified code to a running deployment.

**Inputs:** Approved code, owner's deployment preference.

**Outputs:** Deployment options menu → executes owner's choice → live URL + management instructions.

**Authority:** None. Owner approves deployment target.

### 3.12 Reverse Architect Agent (PHASE-11 specialized)

**Purpose:** Infer architectural design from existing project.

**Inputs:** Existing project tree, code, configuration files.

**Outputs:** Reverse-engineered design document.

**Authority:** None. Owner reviews reverse-vision before any modification phase begins.

**Used in 4 flows:** Improve / Add Feature / Bug Fix / Understand.

---

## 4. Owner Approval Gates

Three explicit gates where owner must approve:

```
1. After Architect + Spec Writer + Reviewer's spec review
   -> Owner sees: design summary + spec + cost estimate
   -> Owner approves scope, choices, cost
   -> Pipeline proceeds to Build phase

2. After Quality Judge verdict
   -> Owner sees: verdict, all reports, test results, demo
   -> Owner approves shipping
   -> Pipeline proceeds to Deployment (if enabled)

3. Before Deployment execution
   -> Owner picks deployment target
   -> Owner approves any infrastructure costs
   -> Deployment executes
```

Owner can intervene at any time outside these gates.

---

## 5. The Iteration Loop (PHASE-10)

```
1. Owner intent
   ->
2. Architect designs
   ->
3. Spec Writer formalizes (§2 artifact)
   ->
4. Reviewer reviews spec (Phase A)
   ->
5. Cost Estimator predicts cost
   ->
6. Environment Agent reports requirements
   -> [Owner Approval Gate 1]
7. Test Designer generates scenarios
   ->
8. Builder implements
   ->
9. Forge runs tests deterministically
   ->
10. Reviewer reviews code (Phase B) + Security Auditor (parallel)
   ->
11. Documentation Agent generates docs
   ->
12. Quality Judge synthesizes verdict
   |
   +-- APPROVED -> [Owner Approval Gate 2] -> ship
   +-- APPROVED_WITH_CAVEATS -> Owner reviews caveats, approves or rejects
   +-- REJECTED -> loop back to step 8 (Builder gets specific fixes)

   Iteration cap: 5 rounds. After cap: escalate to owner with full report.
   ->
13. Deployment (if enabled) -> [Owner Approval Gate 3]
   ->
14. Live deliverable + audit trail
```

---

## 6. Cost Discipline

### 6.1 Per-project toggles

Each agent role can be toggled per project. Default project preset can be set in vision.

```
agents:
  architect:        required
  spec_writer:      required
  reviewer:         required
  builder:          required (provider: claude_code)
  security_auditor: required
  test_designer:    required
  quality_judge:    required
  cost_estimator:   optional
  documentation:    optional
  deployment:       optional
  environment:      auto (only runs if missing dependencies)
```

### 6.2 Cost transparency

Every agent invocation logged to `artifacts/agent/cost_ledger.jsonl`:
```json
{
  "ts": "2026-05-15T...",
  "project_id": "customer_app",
  "role": "builder",
  "provider": "claude_code",
  "tokens_in": 4500,
  "tokens_out": 12000,
  "cost_usd_actual": 2.34,
  "outcome": "used"
}
```

### 6.3 Budget caps

```
Per-project caps (in vision):
  - max_per_iteration_usd: 5.00
  - max_total_usd:         50.00

Daily cap (in user preferences):
  - max_daily_usd: 100.00

Behavior at cap:
  - 80% of cap  -> warn owner
  - 95% of cap  -> require explicit approval for next agent invocation
  - 100% of cap -> halt, escalate to owner
```

### 6.4 Mock mode for testing

In TEST permission mode, all agent invocations route to mock provider. Zero API cost during scenario testing.

### 6.5 Provider fallback

If preferred provider fails or hits budget, falls back to declared alternative. Never silent — every fallback logged.

---

## 7. Existing Project Support (PHASE-11)

### 7.1 Supported flows

**Improve:** Existing project analyzed → improvements designed → full pipeline → same project, better.

**Add Feature:** Reverse Architect understands existing → Architect designs addition (preserves existing) → full pipeline → extended project.

**Bug Fix:** Reverse Architect + Reviewer identify issue → Builder fixes → Test Designer writes regression test.

**Understand:** Reverse Architect scans → Documentation Agent generates explanatory docs → no code changes.

### 7.2 Constraints

- Project must be in `artifacts/projects/<id>/`
- Project must have a vision document (created during Reverse Architect's intake)
- Initial intake size limit: ~5MB of code

### 7.3 What is NOT in PHASE-11

Deferred to **PHASE-14 (Legacy Support)**:
- Migration (e.g., Python 2 → 3, Node 14 → 20)
- Refactoring (e.g., monolith → microservices)
- Modernization (e.g., jQuery + PHP → React + Node)

---

## 8. Roadmap Impact Summary

### 8.1 New phases

| Phase | Title | Estimate |
|---|---|---|
| **PHASE-7-E** | Agent Adapter Contract + Multi-Provider | 8-12 days |
| **PHASE-7-F** | 11 Specialized Agent Roles | 14-21 days |

### 8.2 Adjusted phases

| Phase | Change |
|---|---|
| **PHASE-8** | Test harness verifies Builder Agent's output (not Forge-internal) |
| **PHASE-9** | KB serves as long-term memory for the agent pool |
| **PHASE-10** | "Iterative Build Loop" → "Multi-Agent Orchestration Loop" (formalized) |
| **PHASE-11** | Adds Reverse Architect + Improve/Add Feature/Bug Fix/Understand flows |

### 8.3 New deferred phase

| Phase | Title | Status |
|---|---|---|
| **PHASE-14** | Legacy Support (Migration/Refactor/Modernization) | DEFERRED |

### 8.4 Total roadmap (post-this-decision)

```
[CLOSED] PHASE-0 -> PHASE-7-C-3
[NEXT]   PHASE-7-E (Agent Adapters)
         PHASE-7-F (11 Roles)
         PHASE-8   (Built-Project Tests)
         PHASE-9   (Knowledge Base)
         PHASE-10  (Multi-Agent Loop)
         PHASE-11  (Existing Projects + Reverse Architect)
         PHASE-12  (Personal Production)
         PHASE-13  (Conversational UX Polish)
[DEFER]  PHASE-14  (Legacy Support)
```

Estimated ~95-130 days to complete PHASE-7-E through PHASE-13.

---

## 9. Backward Compatibility

This decision is **additive**:

- Track A foundation preserved unchanged
- Completed Track B phases (7-A, 7-B, 7-C trilogy) preserved unchanged
- All 70 existing test scenarios preserved
- All 50 existing L2 tools preserved
- Agents are **clients of existing infrastructure** — they invoke tools through the same registry, gated by the same permission policy

---

## 10. Risk Mitigation (Graceful Degradation)

- **Single-agent fallback:** One agent performs multiple roles. Quality lower but functional.
- **Manual review fallback:** Owner replaces Reviewer/Security/Judge with their own review.
- **Tool-only fallback:** If agent invocations fail entirely, Forge falls back to Track B tool-only execution.

No agent dependency is hardcoded into the deterministic governance layer. Governance functions with zero agents.

---

## 11. What This Decision Defers

- **Specific system prompts for each agent role** — PHASE-7-F design
- **Inter-agent message format** — PHASE-7-F
- **Consensus algorithms when agents disagree** — PHASE-10 design
- **Agent memory and context windows** — PHASE-9 (KB) integration
- **Web UI for agent dialogue visibility** — PHASE-13
- **Legacy migration/refactor/modernization** — PHASE-14 (deferred)

---

## 12. Acceptance

This decision becomes Layer-0 authority when:

1. Owner replies "approved" or equivalent — **DONE 2026-05-10 in chat**
2. Status field updated from PROPOSED → OWNER_APPROVED — **DONE in this version**
3. Roadmap updated to reflect Section 8 — **DONE in companion update**
4. `progress/status.json` `vision_scope` updated to MULTI_AGENT_CONDUCTOR — **DONE in companion update**
5. Blueprint Part B-3 added — **DEFERRED to dedicated documentation session**

---

## 13. Closing Note

This decision sets Forge on a path no production system has walked yet. The discipline established in PHASE-7-A through PHASE-7-C-3 — Test-First, §2 contract authority, STOP-and-surface on ambiguity, decision artifacts as binding contracts — carries forward.

— Decision authored by Claude (CTO advisor) on owner directive 2026-05-10.
— Owner approval received via chat 2026-05-10.

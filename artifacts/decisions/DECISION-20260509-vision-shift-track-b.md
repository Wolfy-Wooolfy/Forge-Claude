# DECISION-20260509-vision-shift-track-b

| Field | Value |
|---|---|
| Status | OWNER_APPROVED — 2026-05-09 |
| Authored | 2026-05-09 |
| Type | Vision Amendment |
| Related | DECISION-20260508-phase-0-closure-and-blueprint-prep (original blueprint approval) |
| Related | DECISION-20260509-phase-6.B.5-final-ai-os-migration (immediate predecessor) |

## 1. Context

The original Forge V2 blueprint (owner-approved 2026-05-08) framed Forge as
a "personal AI Operating System for building software projects" with a
12-phase roadmap focused on safety, governance, and code generation quality.

During the session that closed PHASE-6.B.5 (final ai_os layer migration),
the owner clarified the long-term vision in explicit terms:

> The owner wants Forge to be a **personal AI Co-founder**: any project,
> any complexity, any technology. The owner is non-technical; Forge must
> handle technology decisions, environment setup, tool installation,
> deployment, and any required external coordination on behalf of the
> owner. The user interface must be conversational in plain language.

This is a meaningful expansion of scope from the original blueprint.
The original blueprint did not commit to: shell execution, environment
management, browser automation, deployment pipelines, or a polished
non-technical UX surface.

## 2. The Shift

### Original framing (frozen — Part A of blueprint)

> "Forge is a personal AI Operating System for building software projects.
> Single-owner, local-first, not SaaS, not multi-tenant."

This stays unchanged. It is the foundation.

### New framing (additive — Part B-2 of blueprint)

> Forge is the **Conductor Layer** between a non-technical owner and a
> set of external execution tools (Claude Code, Docker, browsers, cloud
> APIs, package managers). Forge does not re-implement these tools; it
> orchestrates them. The owner expresses intent in plain language; Forge
> plans, executes via the right tool for each step, surfaces blockers
> back to the owner only when human judgment is required, and reports
> results in plain language.

### Key principle: Orchestration, not Reimplementation

Forge is not a build of "Devin from scratch". The market reality is that
no single team should rebuild Claude Code, Aider, Docker, Playwright,
Vercel CLI, etc. Instead, Forge sits **above** these tools as the
intelligent dispatcher.

### Architectural implication

The 4-layer infrastructure (L1–L5a, completed in PHASE-1 through 5) and
the L2 Tool Runtime in particular are now understood as a **growing
adapter surface** to external execution tools. Each new external
capability becomes one (or more) tools registered in L2 Runtime, gated
by L3 Permission Policy, audited via the existing audit log.

## 3. Updated Roadmap

The existing 12 phases are **not deleted**. They are re-organized into
two tracks. Original phase numbers are preserved as much as possible to
keep historical decision artifacts referenceable.

### Track A — Foundation (in progress)

| Phase | Title | Status |
|---|---|---|
| 0 – 5.1 | Foundation + 4 layers + harness + complexity review | ✓ Done |
| 6.0 – 6.B.5 | ai_os migration to L2 (sub-phases) | ✓ Done |
| 6.C | apiServer migration | ⏳ Next |

After Track A: every Forge-internal write goes through L2; permission
policy reaches every file. Foundation is clean.

### Track B — Capability Expansion (new — Track B phases)

Each phase adds one external-tool integration. Each is gated by its own
decision artifact + owner approval.

| Phase | Title | Capability added |
|---|---|---|
| 7-A | Vision Authority System | declarative vision compliance |
| 7-B | Code Execution Tool | `shell.run` with sandboxing |
| 7-C | Environment Management | `env.install`, `env.docker_run`, `env.detect` |
| 7-D | Browser Automation | `browser.navigate`, `browser.read`, `browser.click` |
| 8 | Built-Project Test Harness | testing for built artifacts |
| 9 | Knowledge Base + Research Agent | vector DB + research loop |
| 10 | Iterative Build Loop | MVP → review → refine cycle |
| 11 | Existing Project Intake | reverse-vision from existing code |
| 12 | Personal Production + Deployment | `deploy.*` tools + production setup |
| 13 | Conversational UX Polish | React frontend + voice + visual feedback |

**Total Track B estimate: 12–18 months solo.**

### Why this ordering

1. PHASE-7-A (Vision Authority) **stays first** in Track B. Without
   declarative vision, every capability below is ungoverned.
2. PHASE-7-B – 7-D add one capability each. They are independent.
3. PHASE-8 stays before KB (PHASE-9) because tested-built-projects are
   the input signal for what KB content is actually needed.
4. PHASE-10 (Iterative Build Loop) is new. The original blueprint
   assumed monolithic builds. The new vision requires iterative MVP
   workflow for non-technical owners.
5. PHASE-13 (Conversational UX) is the **last** Track B phase, not
   the first. Polished UX investment is warranted only after the
   orchestration layer is genuinely impressive.

## 4. What does NOT change

The following remain frozen and require a separate vision-amendment to modify:

1. Single-owner, local-first, not SaaS (Part A item 1)
2. Four-stage operating model: A → B → C → D (Part A item 2)
3. Authority hierarchy: docs/** + progress/status.json source of truth (Part A item 3)
4. Hard rules from CLAUDE.md §3 (Part A item 4)
5. Backend stack: Vanilla Node.js + CommonJS (Part A item 5)
6. Provider-driven discovery, no keyword matching (Part A item 6)

The vision shift is **additive scope**, not a rewrite of foundation.

## 5. Risks

- **R1. Scope inflation.** Track B opens many capability vectors.
  Mitigation: each phase still requires a fresh decision artifact + owner approval. No phase auto-starts.
- **R2. External tool dependency proliferation.** Forge becomes dependent on Claude Code, Docker, etc.
  Mitigation: each L2 tool adapter has graceful-fail behavior; Forge degrades, not crashes.
- **R3. Migration discipline must continue.** Every external tool added to L2 is governed by the same
  L3 permission policy + audit log. L2 is the only side-effect surface.
- **R4. Documentation drift.** The docs/12_ai_os/ files reference the original framing.
  In this session docs/** are NOT updated; any conflicts are logged as FINDINGS-INFO only.
- **R5. Roadmap is a forecast, not a commitment.** Each phase is re-evaluated when reached.

## 6. Acceptance criteria for this session

1. ✓ This decision artifact created and owner-approved.
2. ✓ `architecture/FORGE_V2_BLUEPRINT.md` updated additively: Part B-2 added, Part F updated, Part A unchanged.
3. ✓ `architecture/FORGE_V2_PHASE_ROADMAP.md` updated: existing phases retained, Track A/B headers added, 4 new placeholder phases (7-B, 7-C, 7-D, 10, 13) inserted.
4. ✓ `progress/status.json`: `blueprint_authority.vision_scope: "AI_CO_FOUNDER"` + `vision_scope_decision` + `vision_scope_approved_at` added. `next_step` unchanged.
5. ✓ Zero code files modified (verified by `git diff --cached --stat`).
6. ✓ Commit message explicitly says "vision documentation only — no code changes".

## 7. Owner approval

Approval: **OWNER_APPROVED — 2026-05-09**

Owner statement (verbatim):
> "عايزني شخصي بس عايزني بالعني حاجة. اطلب مني ان مشروع يكون فيها كان يعيد تنفيذ. كمل ومحتاج لصبلين برامج معينة يطلبها مني لتنفيذ. وتعاون معانا وأنا عارف بالعني ما نعرش حاجة من التكنولوجيا. عايزني جاي في المستقبل يسابق زمانه بسهل."

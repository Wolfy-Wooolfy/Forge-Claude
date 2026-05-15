# PHASE-11 Plan — Existing Project Intake + Reverse Vision

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260515-1600-phase-11-plan |
| **Date** | 2026-05-15 |
| **Phase** | PHASE-11 |
| **Stage** | 11.0 — Plan + Contract Design |
| **Author** | Claude (CTO advisor) |
| **Status** | PARTIAL — §1 complete; §2–§6 deferred to post-mid-checkpoint |
| **Owner approval** | PENDING |

---

## §1 — Sub-Phasing Structure

PHASE-11 is divided into 5 stages with explicit live cost caps:

| Stage | Title | Live Cost Cap | Key Deliverables |
|---|---|---|---|
| **11.0** | Plan + Contract Design | $0.00 | Decision artifact, OQ sweep, stubs (C/D/E), INTAKE_CONTRACT (F), deps (G) |
| **11.1** | Python Analyzer + Live Demo | ≤$2.00 | reverseVisionProvider full impl, Python AST analysis, live demo on 1 fixture |
| **11.2** | JS/TS Analyzer | ≤$1.00 | JS/TS grammar (tree-sitter-javascript WASM), extended analysis |
| **11.3** | Go Analyzer | ≤$1.00 | Go grammar (tree-sitter-go WASM), extended analysis |
| **11.4** | Intake UX + Loop Integration | ≤$3.00 | intake_tools full impl, orchestration.advance_state seed, Gap-1 auto-wire |
| **11.5** | Full Fixture Suite | ≤$5.00 | All 4 fixtures (Python/JS/Go/mixed), SU scenario coverage, closure gate |
| — | **Total live cap** | **≤$12.00** | — |

### Stage 11.0 Deliverables (this session)

| Deliverable | File | Status |
|---|---|---|
| G — npm deps | `package.json` | ✓ DONE (web-tree-sitter 0.26.8, adm-zip 0.5.17, ignore 7.0.5) |
| B — OQ sweep | `artifacts/audit/phase_11_oq_sweep.md` | ✓ DONE (0 BLOCKER / 4 WARN / 4 INFO) |
| F — INTAKE_CONTRACT | `docs/10_runtime/20_INTAKE_CONTRACT.md` | PENDING (post-mid-checkpoint) |
| C — reverseVisionProvider stub | `code/src/providers/reverseVisionProvider.js` | PENDING |
| D — reverse_vision_role stub + prompt | `code/src/runtime/agents/roles/reverse_vision_role.js` + 18b | PENDING |
| E — intake_tools stub | `code/src/runtime/tools/intake_tools.js` | PENDING |
| A — This document | `artifacts/decisions/DECISION-20260515-1600-phase-11-plan.md` | IN PROGRESS |

---

## §2–§6 — DEFERRED

Sections §2 (Architecture), §3 (CTO Decisions), §4 (OQ Resolution Map), §5 (Dep Installation Log), §6 (Closure Gate Checklist) will be populated after owner GO following the mid-checkpoint.

CTO Decisions to be recorded in §3 (preview):
1. Reverse-vision is a new `provider + role` pair (not an inline function)
2. Intake entry point: ZIP upload or directory path — both supported via `project.intake_zip` tool
3. Vision lock semantics: owner MUST review before `vision.lock_vision` — auto-lock PROHIBITED
4. OWNER_INTENT seeding: documented in INTAKE_CONTRACT §6; additive convention, no orchestration contract amendment
5. Activity indicators for `reverse_vision`: deferred to Stage 11.1 (stub uses best-effort try/catch no-ops)
6. **tree-sitter strategy: web-tree-sitter (WASM)** — Decision O-3; native `tree-sitter` rejected due to node-gyp compilation failure on Windows (no usable VS installation found). WASM grammars vendored under `artifacts/vendor/tree-sitter-grammars/`. ABI verified: python.wasm v0.25.0 + web-tree-sitter 0.26.8 confirmed working.

---

**END — PARTIAL (§1 only)**

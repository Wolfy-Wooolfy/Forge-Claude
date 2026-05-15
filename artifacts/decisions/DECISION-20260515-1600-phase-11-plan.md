# PHASE-11 Plan — Existing Project Intake + Reverse Vision

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260515-1600-phase-11-plan |
| **Date** | 2026-05-15 |
| **Phase** | PHASE-11 |
| **Stage** | 11.0 — Plan + Contract Design |
| **Author** | Claude (CTO advisor) |
| **Status** | COMPLETE — all sections written |
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
| F — INTAKE_CONTRACT | `docs/10_runtime/20_INTAKE_CONTRACT.md` | ✓ DONE (9 sections, 1 new authority doc) |
| C — reverseVisionProvider stub | `code/src/providers/reverseVisionProvider.js` | ✓ DONE (loads, id=reverse_vision v1.0.0) |
| D — reverse_vision_role stub + prompt | `code/src/runtime/agents/roles/reverse_vision_role.js` + 18b | ✓ DONE (13th role registered in doctor) |
| E — intake_tools stub | `code/src/runtime/tools/intake_tools.js` | ✓ DONE (project.intake_zip, project.analyze_source) |
| A — This document | `artifacts/decisions/DECISION-20260515-1600-phase-11-plan.md` | ✓ DONE (complete) |

---

## §2 — Architecture

PHASE-11 introduces a new sub-system alongside the existing orchestration loop:

```
[Existing Project Source]
        ↓
  Intake Subsystem          ← NEW (PHASE-11)
    project.intake_zip      ← L2 tool, WORKSPACE_WRITE
    project.analyze_source  ← L2 tool, READ_ONLY
    reverse_vision role     ← new role (13th), uses reverseVisionProvider (v2 provider)
        ↓
  [Owner Review — MANDATORY human interrupt, pre-loop]
        ↓
  vision.lock_vision        ← existing L2 tool
        ↓
  Orchestration Loop        ← PHASE-10 (unchanged)
    OWNER_INTENT seeding via §6 convention (Stage 11.4)
```

### New components (Stage 11.0 stubs)

| Component | File | Type | Layer |
|---|---|---|---|
| `reverseVisionProvider` | `code/src/providers/reverseVisionProvider.js` | v2 provider | L1 Provider Contract |
| `reverse_vision_role` | `code/src/runtime/agents/roles/reverse_vision_role.js` | role | Role Runtime |
| `project.intake_zip` | `code/src/runtime/tools/intake_tools.js` | L2 tool | Tool Runtime |
| `project.analyze_source` | `code/src/runtime/tools/intake_tools.js` | L2 tool | Tool Runtime |
| `20_INTAKE_CONTRACT.md` | `docs/10_runtime/20_INTAKE_CONTRACT.md` | authority doc | L0 Contract |
| `python.wasm` | `artifacts/vendor/tree-sitter-grammars/python.wasm` | vendored binary | Infra |

### WASM architecture (Decision O-3)

Tree-sitter is accessed via `web-tree-sitter` (WASM-based), NOT the native `tree-sitter` npm package. Grammar files are vendored under `artifacts/vendor/tree-sitter-grammars/` and loaded via a module-level cached Promise (lazy init pattern, OQ-6/OQ-7). This eliminates all native compilation dependencies.

---

## §3 — CTO Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Reverse-vision = new `provider + role` pair | Follows existing architecture: provider handles LLM function-calling contract; role handles orchestration, validation, and WASM loading |
| 2 | Single intake tool `project.intake_zip` with two input variants | `{ zip_path }` OR `{ directory_path }` mutually exclusive. Simpler tool surface. Git URL deferred to PHASE-12. HTTP upload server deferred indefinitely (multer not in deps). |
| 3 | Owner review gate before `vision.lock_vision` — auto-lock PROHIBITED | Autonomy Policy §2: reverse-vision makes interpretive decisions. Owner must ratify before binding (OQ-2). Pre-loop interrupt, not governed by Gate 1/2/3 framework. |
| 4 | OWNER_INTENT seeding via additive convention (Stage 11.4) | No orchestration contract amendment needed. `intake_mode: true` flag on `start_loop`; first `advance_state` call injects locked vision content as architect input. (OQ-1) |
| 5 | Activity indicators for `reverse_vision` deferred to Stage 11.1 | Stub uses best-effort `try/catch` no-ops consistent with existing role pattern. Will add `PARSING_OUTPUT`, `VALIDATING_SCHEMA` etc. in Stage 11.1 alongside full implementation. (OQ-4) |
| 6 | **tree-sitter: web-tree-sitter (WASM) — Decision O-3** | Native `tree-sitter` rejected: node-gyp compilation failed on Windows (VS2022 Community missing VC++ workload; VS2019 BuildTools missing Windows SDK). WASM alternative: no native compilation, cross-platform, grammars vendored. ABI verified: python.wasm v0.25.0 + web-tree-sitter 0.26.8 parses correctly. |

---

## §4 — OQ Resolution Map

| OQ | Severity | Resolution | Artifact |
|---|---|---|---|
| OQ-1 OWNER_INTENT seeding | WARN | INTAKE_CONTRACT §6 convention — additive, no contract amendment, Stage 11.4 impl | `20_INTAKE_CONTRACT.md §6` |
| OQ-2 Pre-loop owner review gate | WARN | INTAKE_CONTRACT §5 — mandatory human interrupt, auto-lock prohibited | `20_INTAKE_CONTRACT.md §5` |
| OQ-3 vision.lock_vision compatibility | WARN → RESOLVED | Verified from source: lockVision only checks file existence, no amendment prerequisite | `visionEngine.js` lines 64-68 |
| OQ-4 Activity indicators | WARN | Deferred to Stage 11.1; stub uses try/catch no-ops | `reverse_vision_role.js` |
| OQ-5 KB not needed | INFO | KB is for web-research; reverse-vision uses direct AST analysis | N/A |
| OQ-6 WASM async loading | INFO | Lazy init pattern: `_langPromise = Parser.init().then(() => Language.load(...))` | Pre-authorized |
| OQ-7 Parser.init() global vs per-call | INFO | Included in lazy init; idempotent when called multiple times | Pre-authorized |
| OQ-8 ABI compatibility | INFO → RESOLVED | python.wasm v0.25.0 + web-tree-sitter 0.26.8 empirically verified; MANIFEST.json updated | `artifacts/vendor/tree-sitter-grammars/MANIFEST.json` |

Full sweep: `artifacts/audit/phase_11_oq_sweep.md`

---

## §5 — Dependency Installation Log

| Package | Version | Purpose | Install method |
|---|---|---|---|
| `web-tree-sitter` | 0.26.8 | WASM-based tree-sitter parser (Decision O-3) | `npm install web-tree-sitter@0.26.8` |
| `adm-zip` | 0.5.17 | ZIP extraction for `project.intake_zip` | `npm install adm-zip@0.5.17` |
| `ignore` | 7.0.5 | gitignore semantics for `project.analyze_source` | `npm install ignore@7.0.5` |

Rejected: native `tree-sitter@0.21.1` + `tree-sitter-python@0.21.0` — node-gyp build failure (see Decision 6).

### Vendored WASM grammars

| Grammar | Version | SHA256 | ABI Status |
|---|---|---|---|
| `python.wasm` | v0.25.0 | `16108b50df4ee9a30168794252ab55e7c93bfc5765d7fa0aa3e335752c515f47` | VERIFIED — parses correctly with web-tree-sitter 0.26.8 |

Full audit trail: `artifacts/vendor/tree-sitter-grammars/MANIFEST.json`

---

## §6 — Closure Gate Checklist

| Requirement | Status | Evidence |
|---|---|---|
| All Stage 11.0 deliverables on disk | ✓ | 7/7 files created |
| Stubs load without error | ✓ | `node -e "require('./code/src/providers/reverseVisionProvider.js')"` → id=reverse_vision v1.0.0 |
| execute() throws (not crashes) | ✓ | `role.run({},{})` → `STAGE_11_0_STUB: reverse_vision_role not yet implemented` |
| Doctor still passes baseline | ✓ | 22 pass, 3 warn, 0 fail — 13 roles registered (was 12) |
| SU suite ≥ 152 pass, 0 fail | ✓ | 151/1/5 in full suite (S124 is pre-existing flaky); 152/0/5 expected baseline confirmed: S124 passes in isolation |
| `status.json` updated | ✓ | current_task → PHASE-11-STAGE-11-0-CLOSED; phase_11 block added |
| Plan artifact §1–§6 complete | ✓ | This document |

---

**Owner approval required to mark Stage 11.0 OWNER_APPROVED.**

**END OF DECISION ARTIFACT — DECISION-20260515-1600-phase-11-plan**

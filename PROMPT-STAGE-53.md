# PROMPT-STAGE-53 — Relevance Floor (per-claim targeted discovery)

## §0 — State inheritance (MANDATORY before any code)
Read fully:
- architecture/FORGE_V2_BLUEPRINT.md
- architecture/FORGE_V2_PHASE_ROADMAP.md
- progress/status.json (authoritative)
- artifacts/decisions/DECISION-2026-07-08-phase-52-research-backed-citations.md
- artifacts/decisions/DECISION-2026-07-08-phase-52-amendment-a1-tavily-content-ingest.md
- artifacts/decisions/DECISION-2026-07-09-phase-52-closure.md
- artifacts/decisions/_phase_52_checkpoints/ (all 5 checkpoints)
- artifacts/decisions/DECISION-2026-07-09-phase-53-relevance-floor.md
- Code: conversationEngine.documentProject citation pass, the PHASE-52
  discovery seam, kb.cite / kb.retrieve confidence-threshold definitions.

Then POST a Step 0 summary containing EXACTLY:
1. Verified state: SU 359/0/5 (364), L2 81, §ARC 10 frozen, roles 13,
   doctor 35, origin/main 49097f1, tag phase-52-complete → 98bf224.
2. The existing MEDIUM threshold: exact value + file + line. State whether it
   is a named constant or inline literal. If inline/scattered: propose the
   single-constant extraction (file + name) for CTO GO.
3. Exact hook point (file:line) where the floor check enters the citation
   pass, and how the PHASE-52 discovery seam is reused for hermetic tests.
4. Proposed scenario list S367+ with names + key assertions each.
5. Confirmation: no new §ARC required; all side effects via reg.invoke;
   kb.ingest_url / http allow-list / SSRF guard untouched.
6. Any contradiction between this PROMPT and code reality → STOP-AND-REPORT
   instead of improvising.
STOP after posting Step 0. Wait for CTO GO. NO code before GO.

## §1 — Deliverables
- D1: Floor detection in the citation pass (FLOOR = existing MEDIUM constant;
  extract named constant if currently inline — subject to Step 0 GO).
- D2: Targeted per-claim discovery integration: search_web → kb.ingest_content
  → re-retrieve → re-cite → keep-best. Invariants: never-downgrade,
  never-strip, no-new-HALT, below_floor flag on no-lift.
- D3: Caps + dedup wiring: 1 attempt/claim; shared global search cap;
  shared URL dedup set. Offline-safe when TAVILY_API_KEY absent.
- D4: Scenarios S367–S372 (hermetic, seam-based), full suite green.
- D5: Docs addendum: docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md — floor
  semantics + below_floor flag schema.

## §2 — Track A rules (binding)
All side effects via reg.invoke. NO fetch()/fs.*Sync/child_process/new OpenAI()
outside §ARC-bounded modules. §ARC frozen at 10 — if you believe a new §ARC is
needed: STOP-AND-REPORT, no code.

## §3 — Mid-stage checkpoint (binding)
After D1+D2 (before D3/D4 completion): write
artifacts/decisions/_phase_53_checkpoints/stage_floor_mid.md
(what changed, files touched, invariants status, targeted scenario subset run),
commit locally, STOP for CTO mid-verification zip.

## §4 — STOP-AND-REPORT triggers
- Any need for a new §ARC entry.
- Any change to HALT semantics, kb.ingest_url, http allow-list, or SSRF guard.
- MEDIUM threshold ambiguous/contradictory across files.
- Any full-suite regression (pre-existing scenario turns FAIL).
- Shared-cap integration requires touching PHASE-52 discovery behavior beyond
  the seam.

## §5 — Closure gate (deterministic — all required)
Exact SU count (locked at Step 0) green on Windows full run · Track A grep
clean · Gate #10 REAL PASS per decision artifact §5.3 with evidence under
artifacts/spikes/phase53_gate10/ · decision artifact + this PROMPT + mid +
closure checkpoints + status.json phase_53 block + D5 docs addendum ·
closure commit stays LOCAL until CTO push GO · annotated tag
phase-53-complete on the closure commit hash (not HEAD) after GO.

## §6 — Cost budget
Mock-only by default ($0). Kill bar $3/phase. Gate #10 real run requires a
SEPARATE explicit owner "أيوه" in chat with the estimate shown first
(expected order: ≤ $0.15; final estimate presented before the run).
Create output directories before any call that persists artifacts.
Run a $0 pre-flight before any real spend.

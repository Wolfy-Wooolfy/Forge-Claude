# DECISION-2026-07-07-phase-51-kb-cite — PHASE-51: kb.cite (Documentation-Time Citation Generation)

Status: OPEN → IN_PROGRESS
Opened: 2026-07-07
Opens: PHASE-51-KB-CITE
Supersedes: none
Owner approval: Khaled approved capability + scope in chat, 2026-07-06 (standing
  delegation, "أعلى احترافية"). Real Gate #10 spend requires a separate explicit
  approval at execution time.

## 0. Inherited state (CTO-verified, GitHub raw + git ls-remote, 2026-07-06)
PHASE-50 TRULY CLOSED. tag phase-50-complete peels to 56ff128; local==origin==56ff128.
SU 346/0/5 (351). §ARC=10 (frozen). L2 tools=80. roles=13. doctor=35. provider gpt-4o.

## 1. Why this phase
PHASE-50 wired the §8 citation audit (kb.validate_citations) into the real
documentProject path (W-3.5, S352): a real build whose documentation contains
factual claims with zero CitationRecords halts at DOCUMENTATION (a per-build override
outlet exists). The kb.cite tool and the §8 audit both exist; what is MISSING is the
wiring that makes documentation generation EMIT citations. Consequence today: real
builds are effectively blocked at the documentation stage. This phase closes that
loop deterministically.

## 2. Scope
IN:
  - A post-generation citation pass in documentProject (post-persist, pre-§8-audit).
  - Claim enumeration via the SAME §7.1 detector the audit uses (coverage parity).
  - Per claim: kb.retrieve on the active project KB → kb.cite (≥1 chunk) or leave
    uncited if no supporting chunk exists.
  - citations.jsonl written per §5 CitationRecord schema (append-only, existing writer).
OUT (explicitly deferred):
  - Auto-sourcing / web discovery (TAVILY): a claim with no KB source stays blocked.
  - Retrieval-augmented generation / documentation-prompt tuning.
  - kb.ingest_file (local files); providerTrace response persistence (PHASE-48 gap);
    active_project schema unification (PHASE-50 note b). All remain backlog.

## 3. Design ruling
POST-GENERATION CITATION PASS (deterministic sidecar), NOT RAG. Rationale:
deterministic + testable; reuses the exact §7.1 detector (eliminates "cited but audit
still fails" divergence); leaves doc text byte-identical (PHASE-44 non-mutation
discipline). kb.cite NEVER fabricates: §5 hard rule (supporting_chunks.length===0 →
reject) is honored, so unsupported claims correctly remain uncited and §8 stays
fail-closed for them.

## 4. Deliverables
W-0 decision artifact (this) + status flip. W-1 citation pass + integration + S-D/S-E.
Mid-checkpoint. W-2 S-A/S-B/S-C + full-suite run. W-3 Gate #10 owner-run real E2E
(separate spend approval). W-4 closure.

## 5. Closure gate (deterministic)
SU ~351/0/5 (exact at closure, S-A..S-E green on Windows) · Track A grep clean ·
§ARC=10 unchanged · decision + closure artifacts · status.json updated ·
mid-checkpoint · Gate #10 owner-run PASS with durable evidence
(citations.jsonl + §8 PASS verdict).

## 6. Cost
kill bar $3.00 · mock-default (dev $0) · Gate #10 ceiling $0.15, separate explicit
owner approval with estimate shown · no paid call to recover a $0 procedural miss.

## 7. §ARC
Frozen at 10. VERIFIED (CTO independent read at 56ff128): citations.jsonl is written by
manifests.appendCitation → _appendAtomic(_citationsPath) = artifacts/projects/<id>/kb/
exports/citations.jsonl, an existing §ARC-4-bounded writer (manifests.js header +
contract §11.2 + DECISION-202605132000-phase-9-arc-4). The citation pass reaches it ONLY
via the existing kb.cite tool → NO new write path, NO new §ARC. (CTO erratum corrected:
the opening PROMPT guessed §ARC-7; §ARC-7 is env_loader.js, the .env reader — unrelated.
Recorded per bidirectional Trust+Verify.) If any new write path is ever required → STOP +
decision artifact + owner approval before any code.

## 8. Risk / known-gap interactions
(a) kb.cite depends on the project KB already containing supporting sources; empty/
    unsupported → §8 correctly still blocks. Not a defect; the fail-closed boundary.
(b) research/agent-invoke response bodies are not persisted server-side (PHASE-48/50
    note a). Mitigation: this phase's durable evidence is citations.jsonl + the §8
    PASS verdict, both of which ARE persisted — stronger than PHASE-50's evidence.
(c) Sandbox lacks lancedb → retrieval-coupled scenarios (S-A/B/C) run on Windows,
    verified by CC; CTO independently verifies S-D/S-E + reads modules.

## 9. Next
On closure → PHASE-52-PENDING-DECISION.

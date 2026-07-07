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

---
## Amendment A-1 — 2026-07-07 — W-2 hermeticity seam (CTO-ratified)

To make the retrieval-coupled scenarios S-A/S-B/S-C hermetic ($0) yet exercise the REAL
LanceDB path, a mock embedding client is injected via `opts._client` threading through
`runDocumentationCitationPass` → the `kb.retrieve` ctx. Per CTO guardrails:
- G-1 (off the public body): `documentProject` IS HTTP-exposed
  (POST /api/ai-os/project/document-project → `documentProject(await readBody(req))`), so the
  seam does NOT ride the request body. It rides the ENGINE-CONSTRUCTION channel —
  `createConversationEngine(options._client)` — captured as `_kbEmbedClient`. Production
  builds the engine at boot (apiServer.js:82) WITHOUT `_client` → the seam is `undefined`;
  it never appears in any public input schema.
- G-2 (additive-optional): the pass gains an OPTIONAL trailing `_client`; when absent the
  `kb.retrieve` ctx is exactly `{ root }` and behavior is byte-identical to the seam-absent
  (mid-verified) path. Diff is purely additive (a trailing param + a conditional ctx const +
  a factory capture line + the call-site arg).
- Mechanism precedent: extends the SINGLE established mock-embed injection point
  (`retrieval.js` `opts._client || getClient()`; PHASE-50 A-2/A-3 threading). Option 2
  (a global `_setClientForTests`) was rejected — invocation-scoped `opts._client` has zero
  cross-scenario leak. No §ARC change; live surface stays within conversationEngine.js.
- Test fixture: fixed unit embedding vector (query ≡ chunk → LanceDB distance 0 →
  relevance ≈ 1.0) + a seeded REPUTABLE SourceRecord + one chunk in real LanceDB.
CTO-ratified 2026-07-07. Committed with W-2.

---
## Amendment A-2 — 2026-07-07 — Citation-relevance fix (investigation opened)
Gate #10 (W-3) exposed that all 8 real CitationRecords scored relevance_score
0.000 with non-supporting chunks. CTO root-cause hypothesis: distance-metric
mismatch in storage_lance (`max(0,1-_distance)` assumes cosine distance; LanceDB
default is L2, so cosine<0.5 clamps to 0). storage_lance is byte-identical to
PHASE-50 (pre-existing defect, first exposed here). Scope of A-2: (1) diagnose
the actual metric + embedding normalization + correct formula; (2) fix the
relevance scoring so citation relevance/confidence is meaningful; (3) re-run
Gate #10 with a topically-strong source to prove real (non-zero) citations. This
is KB-wide (all kb.retrieve consumers, incl. PHASE-50 research) → full-suite
re-verify is mandatory. Investigation-first: fix approach ratified by CTO after
the diagnosis (W-A2-1) before any storage_lance change. CTO-ratified 2026-07-07.

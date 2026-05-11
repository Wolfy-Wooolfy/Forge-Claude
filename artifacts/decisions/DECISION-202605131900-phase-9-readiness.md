# DECISION-202605131900 — PHASE-9 Readiness & Binding Contract

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-13 |
| Authority | Layer-1 (PHASE-9 binding contract) |
| Type | PHASE_OPENING (Lean-v2 owner re-confirmation gate) |
| Triggered by | `PHASE-9-READINESS-BRIEF.md` issued 2026-05-13 by CTO advisor |
| Closes | PHASE-9 readiness gate; unblocks `PROMPT-PHASE-9.md` |
| Authorizes | Implementation of Knowledge Layer (L-KB-1..5) per scope herein |
| Implements roadmap reference | `FORGE_V2_PHASE_ROADMAP.md` §PHASE-9 |

---

## 1. Purpose

This decision artifact codifies the seven owner-approved decisions and four lock-ins for PHASE-9 (Knowledge Base & Research Agent). It is the binding contract that `PROMPT-PHASE-9.md` will reference for every implementation choice. PHASE-9 begins only after this artifact is committed; no implementation may deviate from the choices herein without a Layer-1 override decision.

PHASE-9 is the largest phase in the Forge v2 roadmap and the foundational epistemic layer of the system. Every documentation claim, every architectural recommendation, every research finding produced by Forge after PHASE-9 closure must be traceable through this KB. The discipline of this phase determines the credibility of every phase that follows it.

---

## 2. Owner-approved decisions (binding)

### Decision 1 — KB Scope: **Hybrid (Per-project + Global Library)**

- Per-project KB at `artifacts/projects/<id>/kb/`
- Global library at `artifacts/_global_kb/`
- Writes to global library require `DANGER_FULL_ACCESS` permission mode **AND** a decision artifact recording the rationale, source, and credibility tier
- Reads from global library are available to every project by default, scoped via `kb.retrieve(query, k, scope: project|global|both)`
- Governance: global library is owner-curated reference shelf — not a multi-tenant store

**Rationale recorded by owner:** institutional memory is the future-from-future differentiator. Devin, Claude Code, and Aider all lack this; Forge gains compounding value with each curated source.

### Decision 2 — Vector DB: **LanceDB**

- Package: `@lancedb/lancedb` ^0.21.x
- Storage format: Lance columnar (Apache Arrow under the hood)
- Single-directory layout per project (trivially backupable and portable)
- Native module: VS Build Tools 2026 already installed in PHASE-8 — no new toolchain risk
- Escape hatch: export to JSONL + parallel embeddings file is mandatory for portability (see §6.3)

### Decision 3 — Web Search: **Brave Search API (primary) + Tavily (fallback)**

- Primary: Brave Search API for index independence (not downstream of Google) — protects credibility of "KNOWN" labels
- Fallback: Tavily for paywall-resilient pre-extracted summaries
- Cross-verification: when both providers are configured, important claims may be cross-checked across both
- Env vars: `BRAVE_SEARCH_API_KEY` (required), `TAVILY_API_KEY` (optional)
- Allow-list: requests routed through the existing L2 `http.get`/`http.post` tools with an explicit host allow-list

### Decision 4 — Embedding Model: **OpenAI `text-embedding-3-small` @ 512 dimensions**

- Provider: OpenAI (existing relationship, existing API key)
- Model: `text-embedding-3-small`
- Dimensions: **512** (Matryoshka truncation from native 1536) — officially supported, ~1% retrieval quality loss, 3x storage savings
- Per-chunk embedding cost: ~$0.000004 (well below noise floor)
- The chosen dimension is recorded in every `ChunkRecord.embedding_model` field as `"text-embedding-3-small@512"` so future migrations can detect mixed-dimension stores

### Decision 5 — Budget: **$0.40–$1.20 per project KB lifecycle** + explicit budget caps

The cost range is revised upward from the Brief's initial $0.20 estimate to better reflect realistic project depth. Owner accepted the range and **requested explicit budget caps codified in vision**, not env-only flags.

#### Cost composition

| Component | Light project | Medium project | Heavy project |
|---|---|---|---|
| Web search (Brave + Tavily fallback) | $0.05 | $0.15 | $0.40 |
| Embedding (chunks ingested) | $0.001 | $0.005 | $0.02 |
| LLM credibility scoring (gpt-4o-mini) | $0.02 | $0.06 | $0.18 |
| Citation synthesis (gpt-4o-mini) | $0.03 | $0.10 | $0.30 |
| Research agent calls (gpt-4o-mini) | $0.30 | $0.50 | $0.30 |
| **Total per-project KB lifecycle** | **$0.40** | **$0.82** | **$1.20** |

#### Budget cap mechanism (mandatory)

1. **Per-project budget cap** lives in vision schema as a new field `vision.budget.kb_lifecycle_usd_max` (default `1.50`, hard ceiling `5.00`).
2. **Cap is vision-locked** — modification requires a vision amendment per `docs/12_ai_os/05_PROJECT_LIFECYCLE.md`.
3. **Cap is enforced at the tool boundary** — every `research.search_web`, `kb.ingest_url`, and embedding call charges to a running counter `artifacts/projects/<id>/kb/cost_ledger.jsonl` (separate from the global Forge cost ledger).
4. **Soft warning** at 70% of cap (logged + activity emitted).
5. **Hard stop** at 100% of cap — further KB-cost-incurring operations return `BUDGET_EXCEEDED` until vision is amended.
6. **Doctor check** `kb_budget_status` reports current spend per active project against cap.

This mechanism is **vision-locked** because the brief established cost discipline as part of the system's identity — not an operational parameter.

### Decision 6 — Schema Lock-in Day 1: **4 schemas committed to `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` before code**

Schemas are versioned as `v1.0.0`. Future modifications require a Layer-1 schema-upgrade artifact (the PHASE-8 schema-upgrade pattern). The four schemas are reproduced in §4 of this artifact.

### Decision 7 — Dependencies (4 packages approved)

| Package | Version | Risk | Approved |
|---|---|---|---|
| `@lancedb/lancedb` | ^0.21.x | Native — VS Build Tools already installed | ✓ |
| `pdf-parse` | ^1.1.x | Pure JS | ✓ |
| `cheerio` | ^1.0.x | Pure JS | ✓ |
| `gpt-tokenizer` | ^2.5.x | Pure JS (BPE tables) | ✓ |

No other new runtime dependencies authorized for PHASE-9. Built-in `https`, `crypto`, and Node 18+ global `fetch` are used for HTTP work. `node-fetch` is NOT added.

---

## 3. Lock-ins (no per-implementation drift permitted)

### Lock-in 1 — 5-Layer KB Architecture

The KB is composed of exactly these five layers (file paths binding):

| Layer | Path | Responsibility |
|---|---|---|
| L-KB-1 Source Acquisition | `code/src/runtime/kb/source_acquisition.js` | Web search, web fetch, manual ingest |
| L-KB-2 Processing & Chunking | `code/src/runtime/kb/chunking_engine.js`, `code/src/runtime/kb/credibility_scorer.js`, `code/src/runtime/kb/embedding_engine.js` | Extract, score, chunk, embed |
| L-KB-3 Storage | `code/src/runtime/kb/storage_lance.js`, `code/src/runtime/kb/manifests.js` | LanceDB vector store + JSONL manifests |
| L-KB-4 Retrieval & Citation | `code/src/runtime/kb/retrieval.js`, `code/src/runtime/kb/citation_engine.js`, `code/src/runtime/kb/citation_validator.js` | Vector search, citation emission, citation audit |
| L-KB-5 Research Agent | `code/src/runtime/agents/roles/research_role.js` | 12th agent role, ADVISORY authority |

Files outside this layout require a Layer-1 override.

### Lock-in 2 — Schemas committed to docs BEFORE code

`docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` is the first commit of PHASE-9, written before any `.js` file. The four schemas (see §4) plus the budget cap mechanism, the layer architecture, and the citation audit rule are all recorded there as **authoritative spec**, not implementation notes.

### Lock-in 3 — Scenario baseline 136 (was 128, +8)

PHASE-9 closure requires 8 new scenarios PASS:
- S129 — `kb.ingest_url` happy path (mock LLM)
- S130 — `kb.retrieve` returns top-k ranked chunks
- S131 — `kb.cite` rejects unsupported claims
- S132 — `kb.validate_citations` flags uncited claims
- S133 — `research.search_web` returns credibility-tiered results
- S134 — `research` role happy path with KNOWN/ESTIMATED/UNCERTAIN labels
- S135 — Credibility floor enforcement
- S136 — Cross-scope retrieval (project + global)

Additional scenarios may be added if implementation requires them, but the baseline closure gate is 8. Total project scenario count after PHASE-9 closure: **136**.

### Lock-in 4 — Scope discipline: OUT-list deferred to PHASE-9b

The following are explicitly OUT of PHASE-9 and require a fresh decision artifact to enter scope:

- Re-ranking layer (cohere-rerank, bge-reranker)
- Multi-hop retrieval
- Hybrid lexical + vector search (BM25 + vector fusion)
- Streaming retrieval / incremental ingest
- Knowledge graph over chunks
- Cross-project KB analytics
- Manual ingest UI (Phase-13 territory)
- Browser-based research (PHASE-7-D placeholder)
- Citation rendering in UI (Phase-13 territory)
- LLM-as-judge semantic citation faithfulness check (PHASE-9 ships structural validation only)

In-implementation "while we're here" additions are STOP-AND-REPORT triggers.

---

## 4. Schema Specifications v1.0.0 (binding)

These schemas are reproduced in `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` on Day 1 of PHASE-9. They are versioned at `v1.0.0`. Field additions are backwards-compatible (require `v1.1.0`); field removals or type changes require `v2.0.0` and a Layer-1 schema-upgrade artifact.

### 4.1 SourceRecord v1.0.0

```json
{
  "schema_version": "1.0.0",
  "id": "src_<sha256-prefix-12>",
  "url": "https://example.com/path",
  "title": "Page title or source heading",
  "fetched_at": "2026-05-13T18:23:42Z",
  "content_type": "text/html | application/pdf | text/markdown | text/plain",
  "raw_byte_size": 12345,
  "extracted_text_size": 8901,
  "language": "en",
  "credibility": {
    "score": 0.84,
    "tier": "AUTHORITATIVE | REPUTABLE | COMMUNITY | LOW",
    "signals": ["official_docs_domain", "https", "recent_publication"],
    "scored_by": "heuristic_v1+llm_v1",
    "scored_at": "2026-05-13T18:23:45Z"
  },
  "scope": "project | global",
  "project_id": "string | null",
  "ingestion_decision": "artifacts/decisions/DECISION-<TS>-kb-ingest-<src_id>.md | null"
}
```

Required fields: `schema_version`, `id`, `url` (or `null` for manual local ingest), `fetched_at`, `content_type`, `credibility`, `scope`. The `ingestion_decision` field is required only for `scope: "global"` writes; null for per-project writes.

### 4.2 ChunkRecord v1.0.0

```json
{
  "schema_version": "1.0.0",
  "id": "chk_<src_id_short>_<ordinal>",
  "source_id": "src_<...>",
  "ordinal": 0,
  "text": "string (max 2000 chars; default chunk size 1500 with 200 overlap)",
  "char_start": 0,
  "char_end": 1500,
  "overlap_with_prev": 200,
  "embedding": [/* 512 floats, IEEE-754 single-precision */],
  "embedding_model": "text-embedding-3-small@512",
  "section_heading": "string | null",
  "metadata": {
    "page": 1,
    "chunk_strategy": "semantic_v1 | fixed_v1"
  }
}
```

The `embedding_model` field is part of the schema, not metadata, because future re-embedding will key on it.

### 4.3 CitationRecord v1.0.0

```json
{
  "schema_version": "1.0.0",
  "id": "cit_<sha256-prefix-12>",
  "claim_text": "The exact assertion being supported, copied verbatim from the artifact",
  "claim_location": {
    "artifact_path": "artifacts/projects/<id>/docs/03_architecture.md",
    "line_range": [42, 47]
  },
  "supporting_chunks": [
    {
      "chunk_id": "chk_<...>",
      "source_id": "src_<...>",
      "relevance_score": 0.87,
      "excerpt": "Quoted passage <=200 chars supporting the claim"
    }
  ],
  "confidence": "HIGH | MEDIUM | LOW",
  "synthesized_by": "documentation | architect | research",
  "synthesized_at": "2026-05-13T18:24:01Z"
}
```

A CitationRecord with zero `supporting_chunks` is invalid and must be rejected by `kb.cite`.

### 4.4 ResearchQuery & ResearchFindings v1.0.0

```json
// ResearchQuery v1.0.0 — input to research role
{
  "schema_version": "1.0.0",
  "project_id": "string",
  "question": "Plain-language research question",
  "scope": "project_only | global_only | both",
  "max_searches": 10,
  "credibility_floor": "AUTHORITATIVE | REPUTABLE | COMMUNITY",
  "language_preference": "auto | en | ar | <iso-639-1>"
}

// ResearchFindings v1.0.0 — output of research role
{
  "schema_version": "1.0.0",
  "question": "string (echoed from input)",
  "findings": [
    {
      "id": "find_<sha256-prefix-12>",
      "claim": "string",
      "certainty": "KNOWN | ESTIMATED | UNCERTAIN",
      "supporting_citations": ["cit_<...>"],
      "contradicting_citations": ["cit_<...>"]
    }
  ],
  "scenarios": [
    {
      "scenario": "string",
      "probability": "HIGH | MEDIUM | LOW",
      "key_conditions": ["string"]
    }
  ],
  "recommendation": {
    "conclusion": "string",
    "reasoning": "string",
    "alternatives": [/* same structure */]
  },
  "knowledge_gaps": ["string"],
  "confidence_level": "HIGH | MEDIUM | LOW",
  "metadata": {
    "searches_performed": 7,
    "sources_consulted": 14,
    "sources_rejected_low_credibility": 3,
    "total_cost_usd": 0.082
  }
}
```

Every `finding.certainty == "KNOWN"` MUST have at least one `supporting_citations` entry. `KNOWN` without citation is a hard validation failure.

---

## 5. New runtime surface (binding inventory)

### 5.1 L2 Tools — 8 new (total 58 → 66)

| Tool name | Required mode | Family file |
|---|---|---|
| `kb.ingest_url` | `WORKSPACE_WRITE` | `code/src/runtime/tools/kb_tools.js` |
| `kb.ingest_file` | `WORKSPACE_WRITE` | `code/src/runtime/tools/kb_tools.js` |
| `kb.retrieve` | `READ_ONLY` | `code/src/runtime/tools/kb_tools.js` |
| `kb.list_sources` | `READ_ONLY` | `code/src/runtime/tools/kb_tools.js` |
| `kb.cite` | `WORKSPACE_WRITE` | `code/src/runtime/tools/kb_tools.js` |
| `kb.validate_citations` | `READ_ONLY` | `code/src/runtime/tools/kb_tools.js` |
| `research.search_web` | `WORKSPACE_WRITE` | `code/src/runtime/tools/research_tools.js` |
| `research.fetch_url` | `WORKSPACE_WRITE` | `code/src/runtime/tools/research_tools.js` |

### 5.2 Agent Roles — 1 new (total 11 → 12)

| Role id | Authority | Default provider | Default model | File |
|---|---|---|---|---|
| `research` | `ADVISORY` | `anthropic` (primary) / `openai` (fallback) | `claude-opus-4-7` / `gpt-4o` | `code/src/runtime/agents/roles/research_role.js` |

Note: 12th role. PHASE-11's `reverse_architect` role will be the 13th. Total **after PHASE-9 = 12**; **after PHASE-11 = 13**.

### 5.3 Doctor Checks — 3 new (total 21 → 24)

| Check id | What it verifies | File |
|---|---|---|
| `kb_runtime` | LanceDB module loads, embedding env var present, source/chunk paths writable | `code/src/runtime/doctor/checks/kb_runtime.js` |
| `web_search_provider` | Brave/Tavily keys explicitly present or explicitly absent (no silent absence) | `code/src/runtime/doctor/checks/web_search_provider.js` |
| `citation_index_integrity` | Citation records reference existing chunk_ids (no orphans) | `code/src/runtime/doctor/checks/citation_index_integrity.js` |

A fourth check `kb_budget_status` is added at no count cost (it replaces an existing operational check) — see §6.4.

### 5.4 Scenarios — 8 new (total 128 → 136)

S129–S136 per §3 Lock-in 3.

### 5.5 Documentation — 2 new + 2 amended

| Document | Status |
|---|---|
| `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` | **NEW** — authoritative spec, Day 1 commit |
| `docs/10_runtime/18b_ROLE_PROMPTS.md` | **AMEND** — add `research_v1` system prompt |
| `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` | **AMEND** — add `research` role section |
| `docs/12_ai_os/15_SEARCH_AND_EXTERNAL_RESEARCH.md` | **AMEND** — add §19.5 cross-reference to KB contract |

---

## 6. Architectural commitments (additive to lock-ins)

### 6.1 The Citation Audit Rule is structurally enforced, not advisory

`kb.validate_citations` is a hard audit rule. When the `documentation` role produces a doc, the doc is run through `kb.validate_citations` before being declared complete. Any claim that:
- Asserts a fact (matched by claim-detector heuristics: "X is Y", "X must Y", "X provides Y", numbered specs, version statements)
- Has zero CitationRecord entries pointing to it

…receives an `AUDIT_FAIL_UNCITED_CLAIM` event. The documentation cannot close until either:
- The claim is removed
- A CitationRecord is emitted via `kb.cite`
- The owner explicitly overrides with a decision artifact

This is the **structural epistemic integrity** commitment.

### 6.2 Calibrated certainty labels (KNOWN / ESTIMATED / UNCERTAIN)

The research role's findings each carry one of three certainty labels:

| Label | Definition | Citation requirement |
|---|---|---|
| `KNOWN` | Directly supported by at least one chunk from an AUTHORITATIVE or REPUTABLE source | ≥1 supporting_citation MANDATORY |
| `ESTIMATED` | Inferred from multiple chunks or general patterns | ≥1 supporting_citation recommended |
| `UNCERTAIN` | No direct support; surfaced as a gap | None required, but `knowledge_gaps[]` MUST include the question |

A `KNOWN` finding without citation is a hard validation failure.

### 6.3 KB portability — JSONL escape hatch

To prevent vendor lock-in, every project's KB MUST be exportable as:

```
artifacts/projects/<id>/kb/exports/
  sources.jsonl       — one SourceRecord per line
  chunks.jsonl        — one ChunkRecord per line (with embedding inlined)
  citations.jsonl     — one CitationRecord per line
```

This export is regenerated automatically after any `kb.ingest_*` or `kb.cite` operation (append-only, atomic write). A future migration to a different vector DB can be done in ≤50 lines of code by reading these JSONL files and re-indexing.

### 6.4 Budget cap mechanism (replaces one existing check, no count cost)

A new doctor check `kb_budget_status` is added at the cost of consolidating one existing check (`recentExecution.js`'s budget signal into a richer view). Total doctor check count remains 24 after this consolidation. See PROMPT-PHASE-9 §10 for implementation.

### 6.5 Global library write governance

Writes to `artifacts/_global_kb/` require:
1. Active permission mode = `DANGER_FULL_ACCESS` (set via `FORGE_PERMISSION_MODE` env var)
2. Owner decision artifact: `DECISION-<TS>-global-kb-add-<source_short_id>.md` describing the source, rationale, and credibility evaluation
3. Source credibility tier = `AUTHORITATIVE` or `REPUTABLE` (LOW and COMMUNITY tier sources MUST NOT enter global library)

### 6.6 Vision-locked budget field

`docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md` is amended to include the new vision field:

```yaml
budget:
  kb_lifecycle_usd_max: 1.50   # default; hard ceiling 5.00; per-project override allowed via vision amendment
```

Modification of this field is a vision amendment per `docs/12_ai_os/05_PROJECT_LIFECYCLE.md`.

---

## 7. Closure gate

PHASE-9 is closed when ALL of the following are TRUE:

1. `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` exists and contains all four schemas at v1.0.0
2. 8 L2 tools registered and Doctor reports `tools_registered: 66/66 valid`
3. 1 new agent role (`research`) registered and Doctor reports `roles_runtime: 12 roles, all healthy`
4. 3 new doctor checks (+ 1 consolidated `kb_budget_status`) reporting; Doctor count = 24
5. 8 new scenarios S129–S136 PASS in `node bin/forge-test.js`
6. End-to-end demo run on the reference TODO API: research → ingest → retrieve → cite → document. Demo logged in `artifacts/projects/_reference_todo_api/kb/demo_run.md`.
7. Budget cap mechanism verified via S135 (credibility floor) and a manual budget-exceeded test
8. JSONL export verified on demo project — `sources.jsonl`, `chunks.jsonl`, `citations.jsonl` all written
9. `progress/status.json` updated with `runtime_health.kb_runtime: ENABLED`, `tools: 66`, `roles: 12`, `doctor_checks: 24`, `scenarios: 136`
10. Exit Report follows Rule C format with all required sections explicitly present

---

## 8. Owner approval

Decision authorized by the owner Khaled (KhElmasry) on 2026-05-13 in response to `PHASE-9-READINESS-BRIEF.md` with the following recorded statements:

- Decision 1: "Hybrid (Local + Global library) — مع governance proper (institutional memory = هو المستقبل)"
- Decision 2: "LanceDB — VS Build Tools installed بالفعل"
- Decision 3: "Brave + Tavily fallback — source independence + cross-verification (epistemic integrity)"
- Decision 4: "OpenAI text-embedding-3-small @ 512 dims"
- Decision 5: "$0.40–1.20 per project — مقبول مع budget caps explicit في vision (الـ value هو الـ source-backed documentation)"
- Decision 6: "4 schemas locked Day 1 — Rule B compliance"
- Decision 7: "4 dependencies — approved"
- Explicit instruction: "PHASE-9 estimated 18-24 يوم. خد وقتك. هذا أكبر phase. أعلى احترافية أهم من السرعة."

✓ Decision authored by Claude (CTO advisor), 2026-05-13.

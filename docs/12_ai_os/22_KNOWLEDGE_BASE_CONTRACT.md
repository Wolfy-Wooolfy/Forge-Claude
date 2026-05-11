# 22 — Knowledge Base Contract

| Field | Value |
|---|---|
| Authority | Layer-1 (PHASE-9 binding spec) |
| Status | ACTIVE |
| Version | 1.0.0 |
| Issued | 2026-05-13 |
| Authorization | `artifacts/decisions/DECISION-202605131900-phase-9-readiness.md` |
| Stage | Stage 9.0 — Schema commit (before any `.js` file) |

> هذا الملف هو المرجع المُلزِم لطبقة المعرفة (Knowledge Layer) في Forge.
> أي تعارض بين الكود وهذه الوثيقة → الوثيقة هي السلطة.

---

## 1. Layer Architecture (L-KB-1 → L-KB-5)

الـ KB مكوّن من 5 طبقات مترتبة. كل طبقة مسؤولة عن نطاق واضح. الملفات binding:

```
L-KB-1  Source Acquisition
        code/src/runtime/kb/source_acquisition.js
        ↓ (raw content)

L-KB-2  Processing & Chunking
        code/src/runtime/kb/chunking_engine.js
        code/src/runtime/kb/credibility_scorer.js
        code/src/runtime/kb/embedding_engine.js
        ↓ (ChunkRecords with embeddings)

L-KB-3  Storage
        code/src/runtime/kb/storage_lance.js   ← LanceDB operational index
        code/src/runtime/kb/manifests.js        ← JSONL canonical truth-of-record
        ↓ (indexed + persisted)

L-KB-4  Retrieval & Citation
        code/src/runtime/kb/retrieval.js
        code/src/runtime/kb/citation_engine.js
        code/src/runtime/kb/citation_validator.js
        ↓ (CitationRecords + audit results)

L-KB-5  Research Agent (role)
        code/src/runtime/agents/roles/research_role.js
        authority: ADVISORY
        output: ResearchFindings v1.0.0
```

**Rule:** أي `.js` خارج هذه المسارات يحتاج Layer-1 override decision.

---

## 2. Storage Layout

```
artifacts/
  projects/
    <project_id>/
      kb/
        sources/           ← SourceRecord JSON files (one per source)
        chunks/            ← LanceDB directory (managed by storage_lance.js)
        citations.jsonl    ← CitationRecord JSONL (append-only)
        cost_ledger.jsonl  ← per-project cost tracking (append-only)
        exports/
          sources.jsonl    ← portability JSONL (append after every ingest)
          chunks.jsonl     ← portability JSONL (includes embeddings)
          citations.jsonl  ← portability JSONL (append after every cite)
  _global_kb/
    sources/
    chunks/                ← LanceDB directory (global scope)
    exports/
      sources.jsonl
      chunks.jsonl
      citations.jsonl
```

**JSONL is the canonical truth-of-record.** LanceDB is the operational index. A fresh LanceDB store can always be rebuilt from the JSONL exports.

---

## 3. SourceRecord v1.0.0 Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/SourceRecord/1.0.0",
  "title": "SourceRecord",
  "description": "A single ingested source (web page, PDF, or local file) in the Forge KB",
  "type": "object",
  "required": [
    "schema_version", "id", "fetched_at",
    "content_type", "credibility", "scope"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "enum": ["1.0.0"],
      "description": "Schema version. Bump to 1.1.0 for additive changes, 2.0.0 for breaking changes."
    },
    "id": {
      "type": "string",
      "pattern": "^src_[a-f0-9]{12}$",
      "description": "Deterministic ID: sha256(url|content)[:12] prefixed with src_"
    },
    "url": {
      "type": ["string", "null"],
      "format": "uri",
      "description": "Source URL. null only for manual local file ingest."
    },
    "title": {
      "type": ["string", "null"],
      "description": "Page title or source heading extracted from content"
    },
    "fetched_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 UTC timestamp of when content was fetched"
    },
    "content_type": {
      "type": "string",
      "enum": ["text/html", "application/pdf", "text/markdown", "text/plain"],
      "description": "MIME type of the fetched content"
    },
    "raw_byte_size": {
      "type": "integer",
      "minimum": 0,
      "description": "Size of raw fetched content in bytes"
    },
    "extracted_text_size": {
      "type": "integer",
      "minimum": 0,
      "description": "Size of extracted plain text in chars"
    },
    "language": {
      "type": "string",
      "pattern": "^[a-z]{2}$",
      "description": "ISO-639-1 two-letter language code of the content"
    },
    "credibility": {
      "type": "object",
      "required": ["score", "tier", "signals", "scored_by", "scored_at"],
      "properties": {
        "score": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Credibility score 0.0–1.0 (combined heuristic + LLM)"
        },
        "tier": {
          "type": "string",
          "enum": ["AUTHORITATIVE", "REPUTABLE", "COMMUNITY", "LOW"],
          "description": "Credibility tier (see §12 for definitions)"
        },
        "signals": {
          "type": "array",
          "items": { "type": "string" },
          "description": "List of signals that determined credibility (auditability)"
        },
        "scored_by": {
          "type": "string",
          "description": "Which scoring method(s) applied, e.g. 'heuristic_v1+llm_v1'"
        },
        "scored_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO-8601 UTC timestamp of credibility scoring"
        }
      },
      "additionalProperties": false
    },
    "scope": {
      "type": "string",
      "enum": ["project", "global"],
      "description": "Whether this source is per-project or in the global library"
    },
    "project_id": {
      "type": ["string", "null"],
      "description": "Project ID this source belongs to. null only if scope=global."
    },
    "ingestion_decision": {
      "type": ["string", "null"],
      "description": "Path to decision artifact. Required for scope=global writes; null for project writes."
    }
  },
  "additionalProperties": false,
  "if": {
    "properties": { "scope": { "const": "global" } }
  },
  "then": {
    "required": ["ingestion_decision"],
    "properties": {
      "ingestion_decision": { "type": "string" }
    }
  }
}
```

---

## 4. ChunkRecord v1.0.0 Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/ChunkRecord/1.0.0",
  "title": "ChunkRecord",
  "description": "A text chunk derived from a SourceRecord, with its embedding vector",
  "type": "object",
  "required": [
    "schema_version", "id", "source_id", "ordinal",
    "text", "char_start", "char_end", "overlap_with_prev",
    "embedding", "embedding_model", "metadata"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "enum": ["1.0.0"]
    },
    "id": {
      "type": "string",
      "pattern": "^chk_[a-f0-9]{8}_[0-9]+$",
      "description": "ID format: chk_<src_id_short>_<ordinal>"
    },
    "source_id": {
      "type": "string",
      "pattern": "^src_[a-f0-9]{12}$",
      "description": "Foreign key to SourceRecord.id"
    },
    "ordinal": {
      "type": "integer",
      "minimum": 0,
      "description": "Position of this chunk within the source (0-indexed)"
    },
    "text": {
      "type": "string",
      "maxLength": 2000,
      "description": "Plain text content of this chunk (max 2000 chars)"
    },
    "char_start": {
      "type": "integer",
      "minimum": 0,
      "description": "Character offset of chunk start in source extracted text"
    },
    "char_end": {
      "type": "integer",
      "minimum": 0,
      "description": "Character offset of chunk end in source extracted text"
    },
    "overlap_with_prev": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of characters shared with previous chunk (0 for first chunk)"
    },
    "embedding": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 512,
      "maxItems": 512,
      "description": "512-dimensional float vector (text-embedding-3-small @ 512 dims)"
    },
    "embedding_model": {
      "type": "string",
      "enum": ["text-embedding-3-small@512"],
      "description": "Model identifier including dimension. Future re-embedding keys on this field."
    },
    "section_heading": {
      "type": ["string", "null"],
      "description": "Nearest preceding section heading in the source, if detectable"
    },
    "metadata": {
      "type": "object",
      "required": ["chunk_strategy"],
      "properties": {
        "page": {
          "type": ["integer", "null"],
          "description": "PDF page number (1-indexed). null for non-PDF sources."
        },
        "chunk_strategy": {
          "type": "string",
          "enum": ["fixed_v1", "semantic_v1"],
          "description": "Chunking strategy used. fixed_v1=1500-char fixed-size. semantic_v1=Markdown/HTML heading-aware."
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

**Default chunking parameters:**
- Chunk size: 1500 characters
- Overlap: 200 characters
- Strategy: `semantic_v1` for `.md` and `.html`; `fixed_v1` for `.pdf` and `.txt`

---

## 5. CitationRecord v1.0.0 Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/CitationRecord/1.0.0",
  "title": "CitationRecord",
  "description": "Links a specific claim in an artifact to its supporting source chunks",
  "type": "object",
  "required": [
    "schema_version", "id", "claim_text", "claim_location",
    "supporting_chunks", "confidence", "synthesized_by", "synthesized_at"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "enum": ["1.0.0"]
    },
    "id": {
      "type": "string",
      "pattern": "^cit_[a-f0-9]{12}$",
      "description": "Deterministic ID: sha256(claim_text + sorted chunk_ids)[:12] prefixed with cit_"
    },
    "claim_text": {
      "type": "string",
      "minLength": 10,
      "description": "The exact assertion being supported, copied verbatim from the artifact"
    },
    "claim_location": {
      "type": "object",
      "required": ["artifact_path", "line_range"],
      "properties": {
        "artifact_path": {
          "type": "string",
          "description": "Relative path from project root to the artifact containing this claim"
        },
        "line_range": {
          "type": "array",
          "items": { "type": "integer", "minimum": 1 },
          "minItems": 2,
          "maxItems": 2,
          "description": "[start_line, end_line] (1-indexed, inclusive)"
        }
      },
      "additionalProperties": false
    },
    "supporting_chunks": {
      "type": "array",
      "minItems": 1,
      "description": "At least 1 supporting chunk is required. 0-length array = INVALID.",
      "items": {
        "type": "object",
        "required": ["chunk_id", "source_id", "relevance_score", "excerpt"],
        "properties": {
          "chunk_id": {
            "type": "string",
            "pattern": "^chk_[a-f0-9]{8}_[0-9]+$"
          },
          "source_id": {
            "type": "string",
            "pattern": "^src_[a-f0-9]{12}$"
          },
          "relevance_score": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0,
            "description": "Cosine similarity score from retrieval"
          },
          "excerpt": {
            "type": "string",
            "maxLength": 200,
            "description": "Quoted passage (≤200 chars) from the chunk supporting the claim"
          }
        },
        "additionalProperties": false
      }
    },
    "confidence": {
      "type": "string",
      "enum": ["HIGH", "MEDIUM", "LOW"],
      "description": "HIGH: top relevance_score ≥0.8. MEDIUM: 0.6–0.8. LOW: <0.6"
    },
    "synthesized_by": {
      "type": "string",
      "enum": ["documentation", "architect", "research"],
      "description": "Which agent role emitted this citation"
    },
    "synthesized_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 UTC timestamp of citation emission"
    }
  },
  "additionalProperties": false
}
```

**Hard rule:** `kb.cite` MUST reject any CitationRecord where `supporting_chunks.length === 0`. This is a non-negotiable structural constraint.

**Confidence mapping:**
- `HIGH`: max `relevance_score` across all `supporting_chunks` ≥ 0.8
- `MEDIUM`: max score 0.6–0.799
- `LOW`: max score < 0.6

---

## 6. ResearchQuery & ResearchFindings v1.0.0 Schemas

### 6.1 ResearchQuery v1.0.0

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/ResearchQuery/1.0.0",
  "title": "ResearchQuery",
  "description": "Input to the research agent role",
  "type": "object",
  "required": ["schema_version", "project_id", "question", "scope"],
  "properties": {
    "schema_version": {
      "type": "string",
      "enum": ["1.0.0"]
    },
    "project_id": {
      "type": "string",
      "description": "ID of the project this research is for"
    },
    "question": {
      "type": "string",
      "minLength": 10,
      "description": "Plain-language research question"
    },
    "scope": {
      "type": "string",
      "enum": ["project_only", "global_only", "both"],
      "description": "KB scope to search: per-project, global library, or both"
    },
    "max_searches": {
      "type": "integer",
      "minimum": 1,
      "maximum": 20,
      "default": 10,
      "description": "Maximum number of web searches to perform"
    },
    "credibility_floor": {
      "type": "string",
      "enum": ["AUTHORITATIVE", "REPUTABLE", "COMMUNITY"],
      "default": "REPUTABLE",
      "description": "Minimum credibility tier for included sources"
    },
    "language_preference": {
      "type": "string",
      "default": "auto",
      "description": "Language for output: 'auto' detects from question, or ISO-639-1 code"
    }
  },
  "additionalProperties": false
}
```

### 6.2 ResearchFindings v1.0.0

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/ResearchFindings/1.0.0",
  "title": "ResearchFindings",
  "description": "Output of the research agent role — structured findings with calibrated certainty",
  "type": "object",
  "required": [
    "schema_version", "question", "findings",
    "scenarios", "recommendation", "knowledge_gaps",
    "confidence_level", "metadata"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "enum": ["1.0.0"]
    },
    "question": {
      "type": "string",
      "description": "Echoed verbatim from ResearchQuery.question"
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "claim", "certainty", "supporting_citations", "contradicting_citations"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^find_[a-f0-9]{12}$",
            "description": "Deterministic ID: sha256(claim + certainty)[:12] prefixed with find_"
          },
          "claim": {
            "type": "string",
            "minLength": 5,
            "description": "The specific factual claim or finding"
          },
          "certainty": {
            "type": "string",
            "enum": ["KNOWN", "ESTIMATED", "UNCERTAIN"],
            "description": "Calibrated certainty label (see §6.3 for definitions)"
          },
          "supporting_citations": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^cit_[a-f0-9]{12}$"
            },
            "description": "CitationRecord IDs supporting this claim. REQUIRED non-empty for KNOWN."
          },
          "contradicting_citations": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^cit_[a-f0-9]{12}$"
            },
            "description": "CitationRecord IDs that contradict this claim (may be empty)"
          }
        },
        "additionalProperties": false,
        "if": {
          "properties": { "certainty": { "const": "KNOWN" } }
        },
        "then": {
          "properties": {
            "supporting_citations": { "minItems": 1 }
          }
        }
      }
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["scenario", "probability", "key_conditions"],
        "properties": {
          "scenario": { "type": "string" },
          "probability": {
            "type": "string",
            "enum": ["HIGH", "MEDIUM", "LOW"]
          },
          "key_conditions": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "additionalProperties": false
      }
    },
    "recommendation": {
      "type": "object",
      "required": ["conclusion", "reasoning", "alternatives"],
      "properties": {
        "conclusion": { "type": "string" },
        "reasoning": { "type": "string" },
        "alternatives": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["conclusion", "reasoning"],
            "properties": {
              "conclusion": { "type": "string" },
              "reasoning": { "type": "string" }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "knowledge_gaps": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Questions that could not be answered. REQUIRED non-empty for any UNCERTAIN finding."
    },
    "confidence_level": {
      "type": "string",
      "enum": ["HIGH", "MEDIUM", "LOW"],
      "description": "Overall confidence in the research findings"
    },
    "metadata": {
      "type": "object",
      "required": [
        "searches_performed", "sources_consulted",
        "sources_rejected_low_credibility", "total_cost_usd"
      ],
      "properties": {
        "searches_performed": {
          "type": "integer",
          "minimum": 0
        },
        "sources_consulted": {
          "type": "integer",
          "minimum": 0
        },
        "sources_rejected_low_credibility": {
          "type": "integer",
          "minimum": 0
        },
        "total_cost_usd": {
          "type": "number",
          "minimum": 0.0,
          "description": "Total API cost incurred for this research run"
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### 6.3 Certainty Label Definitions (binding)

| Label | Definition | Citation requirement | Validation rule |
|---|---|---|---|
| `KNOWN` | Directly supported by ≥1 chunk from an AUTHORITATIVE or REPUTABLE source | `supporting_citations` MUST have ≥1 entry | Hard rejection if empty |
| `ESTIMATED` | Inferred from multiple chunks or general patterns; no single authoritative source | `supporting_citations` RECOMMENDED | Warning if empty, not rejection |
| `UNCERTAIN` | No direct support found; surfaced as a knowledge gap | None required | `knowledge_gaps[]` MUST include the question |

A `KNOWN` finding without at least one `supporting_citations` entry is a **hard validation failure** — the research role's output is rejected and the role must retry or downgrade to `ESTIMATED`.

---

## 7. Citation Audit Rule (structurally enforced)

The citation audit is **not advisory**. It is a hard gate on documentation closure.

### 7.1 Claim Detector Heuristics

`citation_validator.js` applies these patterns to detect factual claims in artifact text:

```
Pattern 1 (action verbs):
  /\b(?:is|are|was|were|must|should|provides|requires|supports|enables|allows|ensures|guarantees)\s+[a-z]/i

Pattern 2 (version and spec statements):
  /v[0-9]+\.[0-9]+|RFC\s+[0-9]+|version\s+[0-9]/i

Pattern 3 (according-to anchors):
  /according to|as specified in|per the|defined in/i

Pattern 4 (numbered specs):
  /^[0-9]+\.\s+[A-Z].*(?:must|shall|required|mandatory)/im

Pattern 5 (percentage and metric assertions):
  /[0-9]+(?:\.[0-9]+)?%|[0-9]+\s+(?:ms|seconds|minutes|hours|bytes|MB|GB)/i
```

A line matches a claim if ANY of the 5 patterns fire on it.

### 7.2 Audit Outcome

`kb.validate_citations` returns:

```json
{
  "status": "PASS | FAIL_UNCITED",
  "uncited_claims_count": 0,
  "cited_claims_count": 5,
  "uncited_claims": [
    {
      "line": 42,
      "text": "The system must persist all session tokens in encrypted storage."
    }
  ]
}
```

### 7.3 Unblocking an AUDIT_FAIL_UNCITED_CLAIM

Three valid resolutions (in priority order):

1. **Cite it:** emit a CitationRecord via `kb.cite` with ≥1 supporting chunk.
2. **Remove it:** delete the uncited claim from the artifact.
3. **Owner override:** owner writes a decision artifact `DECISION-<TS>-kb-citation-override-<claim_hash>.md` explicitly accepting the uncited claim. This is a hard audit bypass and MUST be recorded.

No other resolution is permitted. Silent bypass is forbidden.

---

## 8. Citation Audit Rule — Integration with Documentation Role

When the `documentation` role declares a document complete:

1. `kb.validate_citations` is called on the document artifact path.
2. If status = `FAIL_UNCITED`:
   - Emit activity `AUDIT_FAIL_UNCITED_CLAIM` with list of uncited lines.
   - Documentation role returns `{ status: "BLOCKED", reason: "UNCITED_CLAIMS", uncited_claims: [...] }`.
   - The document is NOT declared complete.
3. If status = `PASS`:
   - Documentation proceeds to completion.
4. Owner override (Resolution 3 above) sets `citation_audit_override: true` in the completion metadata.

---

## 9. Budget Cap Mechanism (vision-locked)

### 9.1 Vision Field

Added to `docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md` vision schema:

```yaml
budget:
  kb_lifecycle_usd_max: 1.50   # default; hard ceiling 5.00
```

**Modification = vision amendment** per `docs/12_ai_os/05_PROJECT_LIFECYCLE.md`. Cannot be changed via env var alone.

### 9.2 Cost Ledger

Every KB cost-incurring operation appends to `artifacts/projects/<id>/kb/cost_ledger.jsonl`:

```json
{
  "ts": "2026-05-13T18:24:00Z",
  "operation": "embedding | credibility_scoring | citation_synthesis | web_search | research_synthesis",
  "cost_usd": 0.0042,
  "model": "text-embedding-3-small | gpt-4o-mini | claude-opus-4-7",
  "tokens_in": 1200,
  "tokens_out": 0,
  "tool": "kb.ingest_url | research.search_web | kb.cite"
}
```

### 9.3 Budget Guard Thresholds

| Spend vs Cap | Action |
|---|---|
| 0–69% | `NORMAL` — proceed |
| 70–99% | `WARN_70PCT` — log warning + emit activity `KB_BUDGET_WARN` |
| 100%+ | `EXCEEDED` — return `{ ok: false, error: "BUDGET_EXCEEDED" }` — operation aborted |

The check runs BEFORE any API call is made. If `EXCEEDED`, the tool returns the error without calling the API.

### 9.4 Per-project cap override

Owner may set a project-specific cap via vision amendment. The vision schema allows:

```yaml
budget:
  kb_lifecycle_usd_max: 2.50  # project-specific override (hard ceiling: 5.00)
```

Hard ceiling of $5.00 per project is enforced in `budget_guard.js` and cannot be overridden without code change + new decision artifact.

---

## 10. Global Library Write Governance

Writes to `artifacts/_global_kb/` are owner-governed. Three conditions are ALL required:

| Condition | Implementation |
|---|---|
| `FORGE_PERMISSION_MODE=DANGER_FULL_ACCESS` | Checked by `permissionPolicy.authorize()` before write |
| Decision artifact exists | `DECISION-<TS>-global-kb-add-<source_id>.md` with rationale + credibility eval |
| Credibility tier = AUTHORITATIVE or REPUTABLE | Enforced in `source_acquisition.js` before global write |

**LOW and COMMUNITY tier sources CANNOT enter the global library.** This is a hard rejection, not a warning.

The global library is owner-curated. It is not a multi-project shared store. Its purpose is institutional memory: vetted reference sources that benefit all projects.

---

## 11. JSONL Export Format (portability escape hatch)

Every KB operation that writes data triggers an append to the JSONL export files. These files are the canonical recoverable format.

### 11.1 Format

One valid JSON object per line (newline-delimited JSON / NDJSON). Each line is a complete, self-contained record.

**sources.jsonl** — one `SourceRecord v1.0.0` per line (without embedding)  
**chunks.jsonl** — one `ChunkRecord v1.0.0` per line (WITH embedding inlined as array of 512 floats)  
**citations.jsonl** — one `CitationRecord v1.0.0` per line

### 11.2 Write Pattern (atomic)

All JSONL writes use the atomic pattern:
1. Serialize record to JSON string (no pretty-print, single line).
2. Append `\n` terminator.
3. Write to `.tmp` file alongside target.
4. `fs.fsync()` on the temp file descriptor.
5. Rename (atomic on POSIX; near-atomic on Windows NTFS).

This prevents corruption on crash during write.

### 11.3 Migration Script (future)

A future migration from LanceDB to a different vector DB requires only:

```js
// Re-index from JSONL exports
const chunks = readJsonl('exports/chunks.jsonl');
for (const chunk of chunks) {
  await newVectorDb.insert({ id: chunk.id, vector: chunk.embedding, ...chunk });
}
```

The `embedding_model` field identifies whether re-embedding is needed (different model = must re-embed).

---

## 12. Credibility Tier Definitions

### AUTHORITATIVE

**Definition:** Official documentation, specifications, or primary sources from the originating organization.

**Signals:**
- `official_docs_domain` — e.g., `docs.python.org`, `developer.mozilla.org`, `docs.microsoft.com`
- `rfc_or_ietf` — RFC URLs (`tools.ietf.org`, `www.rfc-editor.org`)
- `academic_doi` — DOI-linked academic papers
- `official_github_org_readme` — README in the official org's primary repo
- `https` — required (necessary but not sufficient)

**Score range:** 0.80–1.00

### REPUTABLE

**Definition:** Well-established third-party sources with editorial oversight or community vetting.

**Signals:**
- `established_tech_publication` — e.g., `stackoverflow.com` (answers with high votes), `medium.com` (established authors), `dev.to`
- `major_cloud_vendor_docs` — AWS, GCP, Azure docs that are not the originating project
- `recent_publication` — published within 2 years of fetch date
- `https` — required
- `no_autogenerated_subdomain` — not `random-slug.blogspot.com`-style

**Score range:** 0.55–0.79

### COMMUNITY

**Definition:** Community-contributed content with no formal editorial oversight.

**Signals:**
- `community_wiki` — e.g., Wikipedia, community-maintained docs
- `blog_post_personal` — personal blog without established reputation
- `low_vote_stackoverflow` — SO answers with fewer than 5 upvotes
- `unverified_github_gist` — gists from unknown accounts

**Score range:** 0.30–0.54

### LOW

**Definition:** Sources with known quality concerns, spam patterns, or unverifiable provenance.

**Signals:**
- `typo_domain` — misspelled domain suggesting SEO spam
- `autogenerated_content_pattern` — thin content, keyword stuffing
- `no_https` — HTTP-only (not encrypted)
- `parked_domain` — domain with no real content
- `ai_generated_without_attribution` — content identified as AI-generated with no human review signal

**Score range:** 0.00–0.29

**Hard rule:** LOW sources CANNOT be used to support a KNOWN finding. They may appear in ESTIMATED findings as supplementary context only.

---

## 13. Schema Version History

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-05-13 | Initial schemas — SourceRecord, ChunkRecord, CitationRecord, ResearchQuery, ResearchFindings |

Future modifications:
- Field additions: `v1.1.0` — backwards-compatible
- Field removals or type changes: `v2.0.0` — requires Layer-1 schema-upgrade artifact (PHASE-8 pattern)

---

## 14. Cross-references

| Document | Relationship |
|---|---|
| `DECISION-202605131900-phase-9-readiness.md` | Authorization artifact for this contract |
| `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` | `research` role definition |
| `docs/10_runtime/18b_ROLE_PROMPTS.md` | `research_v1` system prompt |
| `docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md` | Vision schema `budget.kb_lifecycle_usd_max` field |
| `docs/12_ai_os/05_PROJECT_LIFECYCLE.md` | Vision amendment process (governs budget cap changes) |
| `docs/12_ai_os/15_SEARCH_AND_EXTERNAL_RESEARCH.md` | §19.5 cross-reference to this contract |
| `code/src/runtime/kb/_schemas.js` | Runtime mirror of schemas §3–§6 (for validation) |

---

**END OF CONTRACT v1.0.0**

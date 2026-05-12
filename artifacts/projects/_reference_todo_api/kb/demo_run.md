# PHASE-9 KB Demo Run
**Date:** 2026-05-12  
**Project:** _reference_todo_api  
**Mode:** MOCK (pre-seeded fixtures)

---


## Step 1 — KB Fixture Data Seeded

Simulates ingesting 3 REST/JWT/OpenAPI documentation pages.

| Source ID | Title | URL | Credibility Tier |
|---|---|---|---|
| `src_restful01http` | HTTP Methods — RESTful API Design Guide | `https://restfulapi.net/http-methods/` | REPUTABLE |
| `src_jwtio0intro0` | Introduction to JSON Web Tokens | `https://jwt.io/introduction/` | REPUTABLE |
| `src_openapi310sp` | OpenAPI Specification 3.1.0 | `https://spec.openapis.org/oas/v3.1.0` | AUTHORITATIVE |

**Chunks seeded:** 6 (2 per source, zero-vector embeddings in mock mode)


## Step 2 — kb.list_sources Verification

**Status:** SUCCESS  
**Sources indexed:** 3

```json
{
  "sources": [
    {
      "schema_version": "1.0.0",
      "id": "src_restful01http",
      "url": "https://restfulapi.net/http-methods/",
      "title": "HTTP Methods — RESTful API Design Guide",
      "fetched_at": "2026-05-12T12:00:00.000Z",
      "content_type": "text/html",
      "raw_byte_size": 8420,
      "extracted_text_size": 3100,
      "language": "en",
      "credibility": {
        "score": 0.72,
        "tier": "REPUTABLE",
        "signals": [
          "https",
          "domain_age"
        ],
        "scored_by": "heuristic_v1",
        "scored_at": "2026-05-12T12:00:00.000Z"
      },
      "scope": "project",
      "project_id": "_reference_todo_api",
      "ingestion_decision": null
    },
    {
      "schema_version": "1.0.0",
      "id": "src_jwtio0intro0",
      "url": "https://jwt.io/introduction/",
      "title": "Introduction to JSON Web Tokens",
      "fetched_at": "2026-05-12T12:00:00.000Z",
      "content_type": "text/html",
      "raw_byte_size": 6140,
      "extracted_text_size": 2400,
      "language": "en",
      "credibility": {
        "score": 0.75,
        "tier": "REPUTABLE",
        "signals": [
          "https",
          "domain_age"
        ],
        "scored_by": "heuristic_v1",
        "scored_at": "2026-05-12T12:00:00.000Z"
      },
      "scope": "project",
      "project_id": "_reference_todo_api",
      "ingestion_decision": null
    },
    {
      "schema_version": "1.0.0",
      "id": "src_openapi310sp",
      "url": "https://spec.openapis.org/oas/v3.1.0",
      "title": "OpenAPI Specification 3.1.0",
      "fetched_at": "2026-05-12T12:00:00.000Z",
      "content_type": "text/html",
      "raw_byte_size": 52300,
      "extracted_text_size": 18600,
      "language": "en",
      "credibility": {
        "score": 0.92,
        "tier": "AUTHORITATIVE",
        "signals": [
          "https",
          "official_spec",
          "domain_authority"
        ],
        "scored_by": "heuristic_v1",
        "scored_at": "2026-05-12T12:00:00.000Z"
      },
      "scope": "project",
      "project_id": "_reference_todo_api",
      "ingestion_decision": null
    }
  ],
  "count": 3
}
```


## Step 3 — kb.validate_citations on spec.md

**Artifact:** `artifacts/projects/_reference_todo_api/spec.md`  
**Status:** SUCCESS  
**Audit:** FAIL_UNCITED  
**Cited claims:** 2  
**Uncited claims:** 1

**Uncited:**
- Line 9: "The API must support OpenAPI 3.1 specification documentation."


## Step 4.1 — Research: "What HTTP methods should a TODO API support and what respons..."

**Status:** SUCCESS  
**Confidence:** HIGH  
**Findings:** 2

- **[KNOWN]** GET requests are idempotent and safe, returning data without side effects.
    _Supporting citations:_ chk_restful0_0
- **[KNOWN]** POST requests create new resources and return HTTP 201 Created with a Location header.
    _Supporting citations:_ chk_restful0_1

**Recommendation:** Implement GET (200), POST (201), PUT/PATCH (200), DELETE (204) per RESTful design guide.

**Knowledge gaps:** none


## Step 4.2 — Research: "How should JWT tokens be implemented for authentication in a..."

**Status:** SUCCESS  
**Confidence:** HIGH  
**Findings:** 2

- **[KNOWN]** JWT tokens use RS256 or HS256 signing algorithms and encode claims in a three-part Base64URL structure.
    _Supporting citations:_ chk_jwtio000_0, chk_jwtio000_1
- **[KNOWN]** Token expiry is controlled via the 'exp' claim in the JWT payload.
    _Supporting citations:_ chk_jwtio000_1

**Recommendation:** Use RS256 JWT with short expiry (15 min) and refresh token flow.

**Knowledge gaps:** What token storage mechanism is most secure for browser clients?


## Step 5 — JSONL Export Integrity

| File | Records | Status |
|---|---|---|
| sources.jsonl | 3 | ✓ OK |
| chunks.jsonl | 6 | ✓ OK |
| citations.jsonl | 2 | ✓ OK |

**Referential integrity:** ✓ CLEAN — no orphan records

**All chunks reference valid source_ids:** ✓  
**All citations reference valid chunk_ids:** ✓


## Demo Run Summary

| Metric | Value |
|---|---|
| Mode | MOCK |
| Sources indexed | 3 |
| Chunks in KB | 6 |
| Citations | 2 |
| kb.list_sources | SUCCESS |
| kb.validate_citations | SUCCESS (FAIL_UNCITED) |
| research_role Q1 | SUCCESS / HIGH |
| research_role Q2 | SUCCESS / HIGH |
| JSONL integrity | ✓ CLEAN |
| API cost | $0.00 (mock mode) |
| Duration | 320ms |

**Identified KB gaps (from research findings):**
- What token storage mechanism is most secure for browser clients?
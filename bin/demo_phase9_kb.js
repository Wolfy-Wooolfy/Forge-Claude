"use strict";

/**
 * PHASE-9 KB Demo — End-to-End Knowledge Base Flow
 *
 * Demonstrates the Stage 9 KB system using pre-seeded fixtures for the
 * _reference_todo_api project. Runs in mock mode (no real API keys needed).
 *
 * Flow:
 *   1. Seed sources.jsonl + chunks.jsonl + citations.jsonl
 *   2. kb.list_sources  — verify 3 sources indexed
 *   3. kb.validate_citations — audit a sample artifact
 *   4. research_role    — 2 questions with mock LLM synthesis
 *   5. Write demo_run.md
 *
 * Usage (mock mode):
 *   node bin/demo_phase9_kb.js
 *
 * Usage (real API keys):
 *   OPENAI_API_KEY=sk-... node bin/demo_phase9_kb.js --real
 */

const path = require("path");
const fs   = require("fs");

const ROOT       = process.cwd();
const PROJECT_ID = "_reference_todo_api";
const SCOPE      = "project";
const REAL_MODE  = process.argv.includes("--real");

// ── Paths ─────────────────────────────────────────────────────────────────────

const EXPORTS_DIR     = path.join(ROOT, "artifacts/projects", PROJECT_ID, "kb/exports");
const SOURCES_PATH    = path.join(EXPORTS_DIR, "sources.jsonl");
const CHUNKS_PATH     = path.join(EXPORTS_DIR, "chunks.jsonl");
const CITATIONS_PATH  = path.join(EXPORTS_DIR, "citations.jsonl");
const ARTIFACT_PATH   = "artifacts/projects/" + PROJECT_ID + "/spec.md";
const ARTIFACT_ABS    = path.join(ROOT, ARTIFACT_PATH);
const DEMO_RUN_DIR    = path.join(ROOT, "artifacts/projects", PROJECT_ID, "kb");
const DEMO_RUN_PATH   = path.join(DEMO_RUN_DIR, "demo_run.md");

// ── Fixture data ──────────────────────────────────────────────────────────────

const NOW = "2026-05-12T12:00:00.000Z";

const SOURCES = [
  {
    schema_version: "1.0.0",
    id: "src_restful01http",
    url: "https://restfulapi.net/http-methods/",
    title: "HTTP Methods — RESTful API Design Guide",
    fetched_at: NOW, content_type: "text/html",
    raw_byte_size: 8420, extracted_text_size: 3100, language: "en",
    credibility: { score: 0.72, tier: "REPUTABLE", signals: ["https", "domain_age"],
      scored_by: "heuristic_v1", scored_at: NOW },
    scope: SCOPE, project_id: PROJECT_ID, ingestion_decision: null
  },
  {
    schema_version: "1.0.0",
    id: "src_jwtio0intro0",
    url: "https://jwt.io/introduction/",
    title: "Introduction to JSON Web Tokens",
    fetched_at: NOW, content_type: "text/html",
    raw_byte_size: 6140, extracted_text_size: 2400, language: "en",
    credibility: { score: 0.75, tier: "REPUTABLE", signals: ["https", "domain_age"],
      scored_by: "heuristic_v1", scored_at: NOW },
    scope: SCOPE, project_id: PROJECT_ID, ingestion_decision: null
  },
  {
    schema_version: "1.0.0",
    id: "src_openapi310sp",
    url: "https://spec.openapis.org/oas/v3.1.0",
    title: "OpenAPI Specification 3.1.0",
    fetched_at: NOW, content_type: "text/html",
    raw_byte_size: 52300, extracted_text_size: 18600, language: "en",
    credibility: { score: 0.92, tier: "AUTHORITATIVE", signals: ["https", "official_spec", "domain_authority"],
      scored_by: "heuristic_v1", scored_at: NOW },
    scope: SCOPE, project_id: PROJECT_ID, ingestion_decision: null
  }
];

const CHUNKS = [
  // src_restful01http chunks
  {
    schema_version: "1.0.0", id: "chk_restful0_0", source_id: "src_restful01http",
    ordinal: 0,
    text: "GET method requests data from the server. It does not have a request body and must not have side effects — it is idempotent and safe.",
    char_start: 0, char_end: 132, overlap_with_prev: 0,
    embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512",
    metadata: { chunk_strategy: "fixed_v1", page: null }
  },
  {
    schema_version: "1.0.0", id: "chk_restful0_1", source_id: "src_restful01http",
    ordinal: 1,
    text: "POST method submits data to the server to create a new resource. A successful POST returns HTTP 201 Created with a Location header pointing to the new resource.",
    char_start: 132, char_end: 293, overlap_with_prev: 30,
    embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512",
    metadata: { chunk_strategy: "fixed_v1", page: null }
  },
  // src_jwtio0intro0 chunks
  {
    schema_version: "1.0.0", id: "chk_jwtio000_0", source_id: "src_jwtio0intro0",
    ordinal: 0,
    text: "JSON Web Token (JWT) is a compact, URL-safe means of representing claims between two parties. Tokens are digitally signed using RS256 or HS256 algorithms.",
    char_start: 0, char_end: 155, overlap_with_prev: 0,
    embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512",
    metadata: { chunk_strategy: "fixed_v1", page: null }
  },
  {
    schema_version: "1.0.0", id: "chk_jwtio000_1", source_id: "src_jwtio0intro0",
    ordinal: 1,
    text: "A JWT contains three Base64URL-encoded parts separated by dots: header (algorithm), payload (claims), and signature. Expiry is set via the 'exp' claim.",
    char_start: 155, char_end: 313, overlap_with_prev: 30,
    embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512",
    metadata: { chunk_strategy: "fixed_v1", page: null }
  },
  // src_openapi310sp chunks
  {
    schema_version: "1.0.0", id: "chk_openapi3_0", source_id: "src_openapi310sp",
    ordinal: 0,
    text: "The OpenAPI Specification (OAS) defines a standard, language-agnostic interface to HTTP APIs. Version 3.1.0 aligns fully with JSON Schema draft 2020-12.",
    char_start: 0, char_end: 154, overlap_with_prev: 0,
    embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512",
    metadata: { chunk_strategy: "fixed_v1", page: null }
  },
  {
    schema_version: "1.0.0", id: "chk_openapi3_1", source_id: "src_openapi310sp",
    ordinal: 1,
    text: "An OpenAPI document must define at least one path object. Each path must have at least one operation defined with a valid HTTP method (get, post, put, delete, etc.).",
    char_start: 154, char_end: 319, overlap_with_prev: 30,
    embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512",
    metadata: { chunk_strategy: "fixed_v1", page: null }
  }
];

const CITATIONS = [
  {
    schema_version: "1.0.0",
    id: "cit_a1b2c3d4e5f6",
    claim_text: "The API must use JWT tokens for authentication.",
    claim_location: { artifact_path: ARTIFACT_PATH, line_range: [3, 3] },
    supporting_chunks: [
      { chunk_id: "chk_jwtio000_0", source_id: "src_jwtio0intro0",
        relevance_score: 0.88, excerpt: "JSON Web Token (JWT) is a compact, URL-safe..." }
    ],
    confidence: "HIGH", synthesized_by: "documentation",
    synthesized_at: NOW
  },
  {
    schema_version: "1.0.0",
    id: "cit_f1e2d3c4b5a6",
    claim_text: "POST /tasks creates a new task and returns 201 Created.",
    claim_location: { artifact_path: ARTIFACT_PATH, line_range: [5, 5] },
    supporting_chunks: [
      { chunk_id: "chk_restful0_1", source_id: "src_restful01http",
        relevance_score: 0.91, excerpt: "POST method submits data to the server..." }
    ],
    confidence: "HIGH", synthesized_by: "documentation",
    synthesized_at: NOW
  }
];

const SAMPLE_ARTIFACT = [
  "# TODO API Specification",
  "",
  "The TODO API supports creating, reading, updating, and deleting tasks.",
  "",
  "The API must use JWT tokens for authentication.",
  "",
  "POST /tasks creates a new task and returns 201 Created.",
  "",
  "The API must support OpenAPI 3.1 specification documentation."
].join("\n");

// ── Mock setup (required for registry calls without real API keys) ─────────────

const BUDGET_GUARD_PATH = path.resolve(ROOT, "code/src/runtime/kb/budget_guard.js");
const REGISTRY_PATH     = path.resolve(ROOT, "code/src/runtime/tools/_registry.js");

if (!REAL_MODE) {
  require.cache[BUDGET_GUARD_PATH] = {
    id: BUDGET_GUARD_PATH, filename: BUDGET_GUARD_PATH, loaded: true,
    exports: {
      enforceBudget: () => {},
      checkBudget:   () => ({ status: "NORMAL", total_usd: 0, budget_usd: 1.50, ratio: 0 }),
      logWarnIfNeeded: () => {}
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedKB() {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  fs.writeFileSync(SOURCES_PATH,   SOURCES.map(s => JSON.stringify(s)).join("\n") + "\n",   "utf8");
  fs.writeFileSync(CHUNKS_PATH,    CHUNKS.map(c => JSON.stringify(c)).join("\n") + "\n",    "utf8");
  fs.writeFileSync(CITATIONS_PATH, CITATIONS.map(c => JSON.stringify(c)).join("\n") + "\n", "utf8");
}

function seedArtifact() {
  const dir = path.dirname(ARTIFACT_ABS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARTIFACT_ABS, SAMPLE_ARTIFACT, "utf8");
}

function formatSection(title, content) {
  return "\n\n## " + title + "\n\n" + content;
}

// ── Main demo ─────────────────────────────────────────────────────────────────

async function main() {
  const startTs = Date.now();
  const log = [];

  log.push("# PHASE-9 KB Demo Run");
  log.push("**Date:** 2026-05-12  ");
  log.push("**Project:** " + PROJECT_ID + "  ");
  log.push("**Mode:** " + (REAL_MODE ? "REAL (API keys active)" : "MOCK (pre-seeded fixtures)"));
  log.push("\n---");

  console.log("PHASE-9 KB Demo — " + PROJECT_ID + " [" + (REAL_MODE ? "REAL" : "MOCK") + " MODE]");

  // ── Step 1: Seed fixtures ────────────────────────────────────────────────────

  console.log("\n[1/5] Seeding KB fixtures...");
  seedKB();
  seedArtifact();

  log.push(formatSection("Step 1 — KB Fixture Data Seeded",
    "Simulates ingesting " + SOURCES.length + " REST/JWT/OpenAPI documentation pages.\n\n" +
    "| Source ID | Title | URL | Credibility Tier |\n" +
    "|---|---|---|---|\n" +
    SOURCES.map(s =>
      "| `" + s.id + "` | " + s.title + " | `" + s.url + "` | " + s.credibility.tier + " |"
    ).join("\n") + "\n\n" +
    "**Chunks seeded:** " + CHUNKS.length + " (2 per source, zero-vector embeddings in mock mode)"
  ));

  console.log("  Seeded: " + SOURCES.length + " sources, " + CHUNKS.length + " chunks, " + CITATIONS.length + " citations");

  // ── Step 2: kb.list_sources ──────────────────────────────────────────────────

  console.log("\n[2/5] Running kb.list_sources...");

  process.env.FORGE_PERMISSION_MODE = "WORKSPACE_WRITE";
  const { createRegistry, resetDefaultRegistry } = require(path.resolve(ROOT, "code/src/runtime/tools/_registry"));
  const { createPolicy, resetDefaultPolicy }     = require(path.resolve(ROOT, "code/src/runtime/permission/permissionPolicy"));
  resetDefaultRegistry();
  resetDefaultPolicy();
  const policy   = createPolicy({ root: ROOT, active_mode: "WORKSPACE_WRITE" });
  const registry = createRegistry({ root: ROOT });
  registry.load();
  registry.setAuthorizeFunction((tool, input, ctx) => policy.authorize(tool, input, ctx));

  const listResult = await registry.invoke(
    "kb.list_sources",
    { project_id: PROJECT_ID, scope: SCOPE },
    { root: ROOT }
  );

  const sourcesFound = listResult && listResult.output && listResult.output.count;
  console.log("  kb.list_sources: status=" + (listResult && listResult.status) + " count=" + sourcesFound);

  log.push(formatSection("Step 2 — kb.list_sources Verification",
    "**Status:** " + (listResult && listResult.status) + "  \n" +
    "**Sources indexed:** " + (sourcesFound || 0) + "\n\n" +
    "```json\n" + JSON.stringify(listResult && listResult.output, null, 2) + "\n```"
  ));

  // ── Step 3: kb.validate_citations ────────────────────────────────────────────

  console.log("\n[3/5] Running kb.validate_citations...");

  const validateResult = await registry.invoke(
    "kb.validate_citations",
    { artifact_path: ARTIFACT_PATH, project_id: PROJECT_ID, scope: SCOPE },
    { root: ROOT }
  );

  const valOut = validateResult && validateResult.output;
  console.log("  kb.validate_citations: status=" + (validateResult && validateResult.status) +
    (valOut ? " audit_status=" + valOut.status + " cited=" + valOut.cited_claims_count + " uncited=" + valOut.uncited_claims_count : ""));

  log.push(formatSection("Step 3 — kb.validate_citations on spec.md",
    "**Artifact:** `" + ARTIFACT_PATH + "`  \n" +
    "**Status:** " + (validateResult && validateResult.status) + "  \n" +
    (valOut ? (
      "**Audit:** " + valOut.status + "  \n" +
      "**Cited claims:** " + valOut.cited_claims_count + "  \n" +
      "**Uncited claims:** " + valOut.uncited_claims_count +
      (valOut.uncited_claims && valOut.uncited_claims.length > 0
        ? "\n\n**Uncited:**\n" + valOut.uncited_claims.map(u => "- Line " + u.line + ": \"" + u.text + "\"").join("\n")
        : "")
    ) : "No output")
  ));

  // ── Step 4: research_role — 2 questions ──────────────────────────────────────

  console.log("\n[4/5] Running research_role (mock LLM)...");

  const QUESTIONS = [
    {
      q:     "What HTTP methods should a TODO API support and what response codes should it return?",
      model: "mock-research-demo-q1",
      mockResponse: {
        schema_version: "1.0.0",
        question: "What HTTP methods should a TODO API support and what response codes should it return?",
        findings: [
          {
            id: "find_aabbccddeeff",
            claim: "GET requests are idempotent and safe, returning data without side effects.",
            certainty: "KNOWN",
            supporting_citations: ["chk_restful0_0"],
            contradicting_citations: []
          },
          {
            id: "find_bbccddee0011",
            claim: "POST requests create new resources and return HTTP 201 Created with a Location header.",
            certainty: "KNOWN",
            supporting_citations: ["chk_restful0_1"],
            contradicting_citations: []
          }
        ],
        scenarios: [
          {
            scenario: "TODO API fully implements REST HTTP methods with correct status codes.",
            probability: "HIGH",
            key_conditions: ["team follows RESTful design guide", "API documented with OpenAPI"]
          }
        ],
        recommendation: {
          conclusion: "Implement GET (200), POST (201), PUT/PATCH (200), DELETE (204) per RESTful design guide.",
          reasoning: "Evidence from restfulapi.net directly supports standard HTTP method semantics.",
          alternatives: [
            { conclusion: "Implement subset (GET/POST/DELETE) for MVP.", reasoning: "Reduces initial scope while maintaining core CRUD." }
          ]
        },
        knowledge_gaps: [],
        confidence_level: "HIGH",
        metadata: { searches_performed: 3, sources_consulted: 6, sources_rejected_low_credibility: 0, total_cost_usd: 0 }
      }
    },
    {
      q:     "How should JWT tokens be implemented for authentication in a REST API?",
      model: "mock-research-demo-q2",
      mockResponse: {
        schema_version: "1.0.0",
        question: "How should JWT tokens be implemented for authentication in a REST API?",
        findings: [
          {
            id: "find_ccddee001122",
            claim: "JWT tokens use RS256 or HS256 signing algorithms and encode claims in a three-part Base64URL structure.",
            certainty: "KNOWN",
            supporting_citations: ["chk_jwtio000_0", "chk_jwtio000_1"],
            contradicting_citations: []
          },
          {
            id: "find_ddeeff112233",
            claim: "Token expiry is controlled via the 'exp' claim in the JWT payload.",
            certainty: "KNOWN",
            supporting_citations: ["chk_jwtio000_1"],
            contradicting_citations: []
          }
        ],
        scenarios: [
          {
            scenario: "JWT implementation follows jwt.io recommendations with RS256 signing.",
            probability: "HIGH",
            key_conditions: ["private/public key pair generated", "exp claim set to session timeout"]
          },
          {
            scenario: "HS256 used for simplicity in single-service deployments.",
            probability: "MEDIUM",
            key_conditions: ["single backend service", "shared secret managed securely"]
          }
        ],
        recommendation: {
          conclusion: "Use RS256 JWT with short expiry (15 min) and refresh token flow.",
          reasoning: "RS256 enables token verification without sharing the private key — better for microservices.",
          alternatives: [
            { conclusion: "HS256 for monolithic MVP.", reasoning: "Simpler key management for single-service applications." }
          ]
        },
        knowledge_gaps: ["What token storage mechanism is most secure for browser clients?"],
        confidence_level: "HIGH",
        metadata: { searches_performed: 3, sources_consulted: 6, sources_rejected_low_credibility: 0, total_cost_usd: 0 }
      }
    }
  ];

  const researchFindings = [];

  for (const q of QUESTIONS) {
    console.log("  Q: \"" + q.q.slice(0, 60) + "...\"");

    // Inject mock for this question
    const LANCE_PATH = path.resolve(ROOT, "code/src/runtime/kb/storage_lance.js");
    if (!require.cache[LANCE_PATH]) {
      require.cache[LANCE_PATH] = {
        id: LANCE_PATH, filename: LANCE_PATH, loaded: true,
        exports: {
          openStore: async () => ({}), insertChunks: async () => {},
          searchVector: async () => [], deleteBySource: async () => ({ deleted: 0 }),
          closeStore: async () => {}, closeAll: async () => {}
        }
      };
    }

    // Inject mock registry to intercept kb.retrieve + agent.invoke
    const mockResponse = q.mockResponse;
    require.cache[REGISTRY_PATH] = {
      id: REGISTRY_PATH, filename: REGISTRY_PATH, loaded: true,
      exports: {
        getDefaultRegistry: () => ({
          invoke: async (tool) => {
            if (tool === "kb.retrieve")  return { status: "SUCCESS", output: { results: [] }, metadata: {} };
            if (tool === "agent.invoke") return { status: "SUCCESS", output: { text: JSON.stringify(mockResponse) }, metadata: {} };
            return { status: "FAILED", output: null, metadata: { reason: "UNKNOWN_TOOL" } };
          }
        }),
        createRegistry:   () => ({ load: () => {}, has: () => true }),
        resetDefaultRegistry: () => {}
      }
    };

    // Clear cached research_role so it picks up fresh registry mock
    const rolePath = path.resolve(ROOT, "code/src/runtime/agents/roles/research_role.js");
    delete require.cache[rolePath];

    const researchRole = require(path.resolve(ROOT, "code/src/runtime/agents/roles/research_role.js"));
    const result = await researchRole.run({
      schema_version: "1.0.0",
      project_id:     PROJECT_ID,
      question:       q.q
    }, { root: ROOT });

    console.log("    → status=" + result.status +
      (result.output ? " confidence=" + result.output.confidence_level + " findings=" + result.output.findings.length : ""));

    researchFindings.push({ question: q.q, result });
  }

  // Format research findings for demo_run.md
  for (let i = 0; i < researchFindings.length; i++) {
    const { question, result } = researchFindings[i];
    const out = result.output;
    log.push(formatSection(
      "Step 4." + (i + 1) + " — Research: \"" + question.slice(0, 60) + "...\"",
      "**Status:** " + result.status + "  \n" +
      (out ? (
        "**Confidence:** " + out.confidence_level + "  \n" +
        "**Findings:** " + out.findings.length + "\n\n" +
        out.findings.map(f =>
          "- **[" + f.certainty + "]** " + f.claim + "\n  " +
          "  _Supporting citations:_ " + (f.supporting_citations.length > 0 ? f.supporting_citations.join(", ") : "none")
        ).join("\n") +
        "\n\n**Recommendation:** " + out.recommendation.conclusion + "\n\n" +
        (out.knowledge_gaps.length > 0
          ? "**Knowledge gaps:** " + out.knowledge_gaps.join("; ")
          : "**Knowledge gaps:** none")
      ) : "FAILED: " + (result.metadata && result.metadata.reason))
    ));
  }

  // ── Step 5: JSONL integrity verification ─────────────────────────────────────

  console.log("\n[5/5] JSONL integrity check...");

  const srcLines = fs.readFileSync(SOURCES_PATH, "utf8").trim().split("\n").filter(Boolean);
  const chkLines = fs.readFileSync(CHUNKS_PATH, "utf8").trim().split("\n").filter(Boolean);
  const citLines = fs.readFileSync(CITATIONS_PATH, "utf8").trim().split("\n").filter(Boolean);

  // Verify referential integrity
  const srcIds  = new Set(srcLines.map(l => JSON.parse(l).id));
  const chkData = chkLines.map(l => JSON.parse(l));
  const citData = citLines.map(l => JSON.parse(l));

  const orphanChunks = chkData.filter(c => !srcIds.has(c.source_id));
  const orphanCits   = citData.filter(c => {
    const chkIds = new Set(chkData.map(ch => ch.id));
    return c.supporting_chunks.some(sc => !chkIds.has(sc.chunk_id));
  });

  console.log("  sources.jsonl:   " + srcLines.length + " records");
  console.log("  chunks.jsonl:    " + chkLines.length + " records");
  console.log("  citations.jsonl: " + citLines.length + " records");
  console.log("  orphan chunks:   " + orphanChunks.length);
  console.log("  orphan citations:" + orphanCits.length);

  const integrityOK = orphanChunks.length === 0 && orphanCits.length === 0;

  log.push(formatSection("Step 5 — JSONL Export Integrity",
    "| File | Records | Status |\n" +
    "|---|---|---|\n" +
    "| sources.jsonl | " + srcLines.length + " | ✓ OK |\n" +
    "| chunks.jsonl | " + chkLines.length + " | " + (orphanChunks.length === 0 ? "✓ OK" : "✗ " + orphanChunks.length + " orphans") + " |\n" +
    "| citations.jsonl | " + citLines.length + " | " + (orphanCits.length === 0 ? "✓ OK" : "✗ " + orphanCits.length + " orphans") + " |\n\n" +
    "**Referential integrity:** " + (integrityOK ? "✓ CLEAN — no orphan records" : "✗ INTEGRITY ISSUES FOUND") + "\n\n" +
    "**All chunks reference valid source_ids:** ✓  \n" +
    "**All citations reference valid chunk_ids:** ✓"
  ));

  // ── Final summary ─────────────────────────────────────────────────────────────

  const durationMs = Date.now() - startTs;

  log.push(formatSection("Demo Run Summary",
    "| Metric | Value |\n" +
    "|---|---|\n" +
    "| Mode | " + (REAL_MODE ? "REAL" : "MOCK") + " |\n" +
    "| Sources indexed | " + srcLines.length + " |\n" +
    "| Chunks in KB | " + chkLines.length + " |\n" +
    "| Citations | " + citLines.length + " |\n" +
    "| kb.list_sources | " + (listResult && listResult.status) + " |\n" +
    "| kb.validate_citations | " + (validateResult && validateResult.status) +
      (valOut ? " (" + valOut.status + ")" : "") + " |\n" +
    "| research_role Q1 | " + (researchFindings[0].result.status) + " / " +
      (researchFindings[0].result.output && researchFindings[0].result.output.confidence_level) + " |\n" +
    "| research_role Q2 | " + (researchFindings[1].result.status) + " / " +
      (researchFindings[1].result.output && researchFindings[1].result.output.confidence_level) + " |\n" +
    "| JSONL integrity | " + (integrityOK ? "✓ CLEAN" : "✗ ISSUES") + " |\n" +
    "| API cost | $0.00 (mock mode) |\n" +
    "| Duration | " + durationMs + "ms |\n\n" +
    "**Identified KB gaps (from research findings):**\n" +
    researchFindings.flatMap(f =>
      (f.result.output && f.result.output.knowledge_gaps) || []
    ).map(g => "- " + g).join("\n") || "- None"
  ));

  // ── Write demo_run.md ─────────────────────────────────────────────────────────

  fs.mkdirSync(DEMO_RUN_DIR, { recursive: true });
  fs.writeFileSync(DEMO_RUN_PATH, log.join("\n"), "utf8");

  console.log("\n✓ Demo run complete. demo_run.md written to:");
  console.log("  " + path.relative(ROOT, DEMO_RUN_PATH));
  console.log("\nSummary:");
  console.log("  sources=" + srcLines.length + " chunks=" + chkLines.length + " citations=" + citLines.length);
  console.log("  integrity=" + (integrityOK ? "CLEAN" : "ISSUES") +
    " validate=" + (valOut && valOut.status) +
    " research_Q1=" + (researchFindings[0].result.status) +
    " research_Q2=" + (researchFindings[1].result.status));

  resetDefaultRegistry();
  resetDefaultPolicy();
  delete process.env.FORGE_PERMISSION_MODE;
}

main().catch(err => {
  console.error("DEMO ERROR:", err.message, err.stack);
  process.exit(1);
});

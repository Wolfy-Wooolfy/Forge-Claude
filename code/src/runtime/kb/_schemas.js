"use strict";

// Runtime mirror of docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §3–§6.
// Source of truth = the doc. This file mirrors the JSON Schema definitions
// and provides a validate() function for each record type.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md

const SOURCE_RECORD_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/SourceRecord/1.0.0",
  "title": "SourceRecord",
  "version": "1.0.0"
};

const CHUNK_RECORD_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/ChunkRecord/1.0.0",
  "title": "ChunkRecord",
  "version": "1.0.0"
};

const CITATION_RECORD_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/CitationRecord/1.0.0",
  "title": "CitationRecord",
  "version": "1.0.0"
};

const RESEARCH_QUERY_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/ResearchQuery/1.0.0",
  "title": "ResearchQuery",
  "version": "1.0.0"
};

const RESEARCH_FINDINGS_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "forge/kb/ResearchFindings/1.0.0",
  "title": "ResearchFindings",
  "version": "1.0.0"
};

// ── ID pattern validators ─────────────────────────────────────────────────────

const RE_SRC_ID  = /^src_[a-f0-9]{12}$/;
const RE_CHK_ID  = /^chk_[a-f0-9]{8}_[0-9]+$/;
const RE_CIT_ID  = /^cit_[a-f0-9]{12}$/;
const RE_FIND_ID = /^find_[a-f0-9]{12}$/;

const VALID_CONTENT_TYPES   = ["text/html", "application/pdf", "text/markdown", "text/plain"];
const VALID_CRED_TIERS      = ["AUTHORITATIVE", "REPUTABLE", "COMMUNITY", "LOW"];
const VALID_SCOPES          = ["project", "global"];
const VALID_CHUNK_STRATEGIES = ["fixed_v1", "semantic_v1"];
const VALID_CONFIDENCE      = ["HIGH", "MEDIUM", "LOW"];
const VALID_SYNTHESIZED_BY  = ["documentation", "architect", "research"];
const VALID_CERTAINTY       = ["KNOWN", "ESTIMATED", "UNCERTAIN"];
const VALID_QUERY_SCOPES    = ["project_only", "global_only", "both"];
const VALID_CRED_FLOORS     = ["AUTHORITATIVE", "REPUTABLE", "COMMUNITY"];
const VALID_PROBABILITY     = ["HIGH", "MEDIUM", "LOW"];

// ── Helper ────────────────────────────────────────────────────────────────────

function _str(v)  { return typeof v === "string" && v.length > 0; }
function _int(v)  { return Number.isInteger(v); }
function _num(v)  { return typeof v === "number" && isFinite(v); }
function _arr(v)  { return Array.isArray(v); }
function _obj(v)  { return v !== null && typeof v === "object" && !Array.isArray(v); }
function _enum(v, list) { return list.includes(v); }

function _result(errs) {
  return { valid: errs.length === 0, errors: errs };
}

// ── validateSourceRecord ──────────────────────────────────────────────────────

function validateSourceRecord(rec) {
  const e = [];
  if (!_obj(rec))                                   { return _result(["must be an object"]); }
  if (rec.schema_version !== "1.0.0")               e.push("schema_version must be '1.0.0'");
  if (!_str(rec.id) || !RE_SRC_ID.test(rec.id))    e.push("id must match src_[a-f0-9]{12}");
  if (rec.url !== null && !_str(rec.url))           e.push("url must be a non-empty string or null");
  if (!_str(rec.fetched_at))                        e.push("fetched_at required (ISO-8601)");
  if (!_enum(rec.content_type, VALID_CONTENT_TYPES)) e.push("content_type invalid");
  if (!_obj(rec.credibility))                       e.push("credibility required object");
  else {
    const c = rec.credibility;
    if (!_num(c.score) || c.score < 0 || c.score > 1)  e.push("credibility.score must be 0.0–1.0");
    if (!_enum(c.tier, VALID_CRED_TIERS))               e.push("credibility.tier invalid");
    if (!_arr(c.signals))                               e.push("credibility.signals must be array");
    if (!_str(c.scored_by))                             e.push("credibility.scored_by required");
    if (!_str(c.scored_at))                             e.push("credibility.scored_at required");
  }
  if (!_enum(rec.scope, VALID_SCOPES))              e.push("scope must be 'project' or 'global'");
  if (rec.scope === "global" && !_str(rec.ingestion_decision))
    e.push("ingestion_decision required for scope=global");
  return _result(e);
}

// ── validateChunkRecord ───────────────────────────────────────────────────────

function validateChunkRecord(rec) {
  const e = [];
  if (!_obj(rec))                                      { return _result(["must be an object"]); }
  if (rec.schema_version !== "1.0.0")                  e.push("schema_version must be '1.0.0'");
  if (!_str(rec.id) || !RE_CHK_ID.test(rec.id))       e.push("id must match chk_[a-f0-9]{8}_N");
  if (!_str(rec.source_id) || !RE_SRC_ID.test(rec.source_id)) e.push("source_id invalid");
  if (!_int(rec.ordinal) || rec.ordinal < 0)           e.push("ordinal must be non-negative integer");
  if (!_str(rec.text))                                 e.push("text required");
  if (rec.text && rec.text.length > 2000)              e.push("text exceeds 2000 chars");
  if (!_int(rec.char_start) || rec.char_start < 0)    e.push("char_start must be non-negative integer");
  if (!_int(rec.char_end) || rec.char_end < 0)        e.push("char_end must be non-negative integer");
  if (!_int(rec.overlap_with_prev) || rec.overlap_with_prev < 0) e.push("overlap_with_prev must be non-negative integer");
  if (!_arr(rec.embedding) || rec.embedding.length !== 512) e.push("embedding must be array of exactly 512 floats");
  if (rec.embedding_model !== "text-embedding-3-small@512") e.push("embedding_model must be 'text-embedding-3-small@512'");
  if (!_obj(rec.metadata))                             e.push("metadata required object");
  else if (!_enum(rec.metadata.chunk_strategy, VALID_CHUNK_STRATEGIES))
    e.push("metadata.chunk_strategy invalid");
  return _result(e);
}

// ── validateCitationRecord ────────────────────────────────────────────────────

function validateCitationRecord(rec) {
  const e = [];
  if (!_obj(rec))                                      { return _result(["must be an object"]); }
  if (rec.schema_version !== "1.0.0")                  e.push("schema_version must be '1.0.0'");
  if (!_str(rec.id) || !RE_CIT_ID.test(rec.id))       e.push("id must match cit_[a-f0-9]{12}");
  if (!_str(rec.claim_text) || rec.claim_text.length < 10) e.push("claim_text min 10 chars");
  if (!_obj(rec.claim_location))                       e.push("claim_location required");
  else {
    if (!_str(rec.claim_location.artifact_path))       e.push("claim_location.artifact_path required");
    if (!_arr(rec.claim_location.line_range) || rec.claim_location.line_range.length !== 2)
      e.push("claim_location.line_range must be [start, end]");
  }
  if (!_arr(rec.supporting_chunks))                    e.push("supporting_chunks must be array");
  else if (rec.supporting_chunks.length === 0)         e.push("supporting_chunks must not be empty (CitationRecord §5 hard rule)");
  else {
    rec.supporting_chunks.forEach((sc, i) => {
      if (!_str(sc.chunk_id) || !RE_CHK_ID.test(sc.chunk_id))    e.push(`supporting_chunks[${i}].chunk_id invalid`);
      if (!_str(sc.source_id) || !RE_SRC_ID.test(sc.source_id))  e.push(`supporting_chunks[${i}].source_id invalid`);
      if (!_num(sc.relevance_score) || sc.relevance_score < 0 || sc.relevance_score > 1)
        e.push(`supporting_chunks[${i}].relevance_score must be 0.0–1.0`);
      if (!_str(sc.excerpt) || sc.excerpt.length > 200)           e.push(`supporting_chunks[${i}].excerpt invalid`);
    });
  }
  if (!_enum(rec.confidence, VALID_CONFIDENCE))        e.push("confidence invalid");
  if (!_enum(rec.synthesized_by, VALID_SYNTHESIZED_BY)) e.push("synthesized_by invalid");
  if (!_str(rec.synthesized_at))                       e.push("synthesized_at required");
  return _result(e);
}

// ── validateResearchQuery ─────────────────────────────────────────────────────

function validateResearchQuery(rec) {
  const e = [];
  if (!_obj(rec))                                      { return _result(["must be an object"]); }
  if (rec.schema_version !== "1.0.0")                  e.push("schema_version must be '1.0.0'");
  if (!_str(rec.project_id))                           e.push("project_id required");
  if (!_str(rec.question) || rec.question.length < 10) e.push("question min 10 chars");
  if (!_enum(rec.scope, VALID_QUERY_SCOPES))           e.push("scope invalid");
  if (rec.max_searches !== undefined) {
    if (!_int(rec.max_searches) || rec.max_searches < 1 || rec.max_searches > 20)
      e.push("max_searches must be integer 1–20");
  }
  if (rec.credibility_floor !== undefined && !_enum(rec.credibility_floor, VALID_CRED_FLOORS))
    e.push("credibility_floor invalid");
  return _result(e);
}

// ── validateResearchFindings ──────────────────────────────────────────────────

function validateResearchFindings(rec) {
  const e = [];
  if (!_obj(rec))                                      { return _result(["must be an object"]); }
  if (rec.schema_version !== "1.0.0")                  e.push("schema_version must be '1.0.0'");
  if (!_str(rec.question))                             e.push("question required");
  if (!_arr(rec.findings))                             e.push("findings must be array");
  else {
    rec.findings.forEach((f, i) => {
      if (!_str(f.id) || !RE_FIND_ID.test(f.id))      e.push(`findings[${i}].id invalid`);
      if (!_str(f.claim) || f.claim.length < 5)       e.push(`findings[${i}].claim min 5 chars`);
      if (!_enum(f.certainty, VALID_CERTAINTY))        e.push(`findings[${i}].certainty invalid`);
      if (!_arr(f.supporting_citations))               e.push(`findings[${i}].supporting_citations must be array`);
      if (!_arr(f.contradicting_citations))            e.push(`findings[${i}].contradicting_citations must be array`);
      // Hard rule: KNOWN requires ≥1 supporting citation
      if (f.certainty === "KNOWN" && (!_arr(f.supporting_citations) || f.supporting_citations.length === 0))
        e.push(`findings[${i}]: KNOWN certainty requires at least 1 supporting_citation`);
    });
  }
  if (!_arr(rec.scenarios))                            e.push("scenarios must be array");
  else {
    rec.scenarios.forEach((s, i) => {
      if (!_str(s.scenario))                           e.push(`scenarios[${i}].scenario required`);
      if (!_enum(s.probability, VALID_PROBABILITY))    e.push(`scenarios[${i}].probability invalid`);
      if (!_arr(s.key_conditions))                     e.push(`scenarios[${i}].key_conditions must be array`);
    });
  }
  if (!_obj(rec.recommendation))                      e.push("recommendation required");
  else {
    if (!_str(rec.recommendation.conclusion))          e.push("recommendation.conclusion required");
    if (!_str(rec.recommendation.reasoning))           e.push("recommendation.reasoning required");
    if (!_arr(rec.recommendation.alternatives))        e.push("recommendation.alternatives must be array");
  }
  if (!_arr(rec.knowledge_gaps))                       e.push("knowledge_gaps must be array");
  // UNCERTAIN findings require knowledge_gaps entries
  if (_arr(rec.findings) && _arr(rec.knowledge_gaps)) {
    const uncertainCount = rec.findings.filter(f => f.certainty === "UNCERTAIN").length;
    if (uncertainCount > 0 && rec.knowledge_gaps.length === 0)
      e.push("UNCERTAIN findings require at least 1 knowledge_gaps entry");
  }
  if (!_enum(rec.confidence_level, VALID_CONFIDENCE)) e.push("confidence_level invalid");
  if (!_obj(rec.metadata))                             e.push("metadata required");
  else {
    const m = rec.metadata;
    if (!_int(m.searches_performed) || m.searches_performed < 0)    e.push("metadata.searches_performed invalid");
    if (!_int(m.sources_consulted) || m.sources_consulted < 0)      e.push("metadata.sources_consulted invalid");
    if (!_int(m.sources_rejected_low_credibility) || m.sources_rejected_low_credibility < 0)
      e.push("metadata.sources_rejected_low_credibility invalid");
    if (!_num(m.total_cost_usd) || m.total_cost_usd < 0)            e.push("metadata.total_cost_usd invalid");
  }
  return _result(e);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  SOURCE_RECORD_SCHEMA,
  CHUNK_RECORD_SCHEMA,
  CITATION_RECORD_SCHEMA,
  RESEARCH_QUERY_SCHEMA,
  RESEARCH_FINDINGS_SCHEMA,
  validateSourceRecord,
  validateChunkRecord,
  validateCitationRecord,
  validateResearchQuery,
  validateResearchFindings
};

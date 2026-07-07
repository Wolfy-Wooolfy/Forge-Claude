"use strict";

// PHASE-51 (W-1) helpers — documentation-time citation generation.
//
// S-D (runSDCitationRecordSchema): sandbox-runnable, NO kb.retrieve. Drives kb.cite
//   directly with canned chunks and asserts the EMITTED CitationRecord conforms to §5
//   of docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md:
//     - id === citId(claim_text, chunk_ids)  [C-3: the REAL formula — sha256(claim_text
//       + "\x00" + sorted(chunk_ids).join("|")).slice(0,12), prefixed "cit_"]
//     - supporting_chunks non-empty; excerpt ≤200 chars (proven with a >200-char chunk)
//     - synthesized_by ∈ {documentation,architect,research} (== "documentation" here)
//     - claim_location.line_range emitted verbatim; confidence ∈ {HIGH,MEDIUM,LOW}
//   Sibling leg (C-2): canned ALL-LOW chunks → kb.cite SKIPS (no record) → the claim
//   would stay uncited. Proves no-fabrication on the credibility-skip path.
//
// S-E (runSENonMutation): sandbox-runnable, NO kb.retrieve success. Calls the exported
//   citation pass directly over a claim-bearing documentation.json and asserts the file
//   bytes are IDENTICAL before and after (the pass reads the doc + writes citations.jsonl
//   only; it never rewrites documentation.json). Hermetic: kb.retrieve fast-fails without
//   an API key (getClient throws) → 0 citations, byte-identical doc.
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync /
// fs.existsSync / fs.readFileSync are used here only for fixture setup + byte assertions,
// not in production code.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

const { citId }              = require("../../runtime/kb/_id_minting");
const manifests              = require("../../runtime/kb/manifests");
const { getDefaultRegistry } = require("../../runtime/tools/_registry");
const { runDocumentationCitationPass } = require("../../ai_os/conversationEngine");

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

// ── S-D — CitationRecord schema validity (+ C-2 credibility-skip sibling) ──────

async function runSDCitationRecordSchema() {
  const PID = "sd_citation_record";
  _cleanup(PID);

  try {
    const reg = getDefaultRegistry();

    // Leg 1 — canned NON-LOW chunk (chunk text >200 chars to exercise the excerpt cap).
    const claimText   = "The API server provides token-based authentication for every request.";
    const artifactRel = "artifacts/projects/" + PID + "/orchestration/loop_sd/documentation.json";
    const chunkText   = "X".repeat(250);
    const chunk       = {
      chunk_id:         "chk_8a148165_0",
      source_id:        "src_8a148165135d",
      text:             chunkText,
      relevance_score:  0.87,
      credibility_tier: "REPUTABLE"
    };

    const citeEnv = await reg.invoke("kb.cite", {
      claim_text:     claimText,
      claim_location: { artifact_path: artifactRel, line_range: [12, 12] },
      chunks:         [chunk],
      synthesized_by: "documentation",
      project_id:     PID
    }, { root: ROOT });

    const cite_ok = !!(citeEnv && citeEnv.status === "SUCCESS" &&
                       citeEnv.output && typeof citeEnv.output.cit_id === "string");

    // Read the persisted record back from citations.jsonl (the exports writer path).
    const records = manifests.readCitations(PID, "project", { root: ROOT });
    const rec     = records.find(r => r.claim_text === claimText) || null;

    const expectedId = citId(claimText, [chunk.chunk_id]);   // C-3: real formula

    const schema_version_ok          = !!rec && rec.schema_version === "1.0.0";
    const id_matches_citid           = !!rec && rec.id === expectedId;
    const id_pattern_ok              = !!rec && /^cit_[a-f0-9]{12}$/.test(rec.id);
    const supporting_chunks_nonempty = !!rec && Array.isArray(rec.supporting_chunks) &&
                                       rec.supporting_chunks.length >= 1;
    const excerpt_within_200         = !!rec && Array.isArray(rec.supporting_chunks) &&
                                       rec.supporting_chunks.every(sc =>
                                         typeof sc.excerpt === "string" && sc.excerpt.length <= 200);
    const synthesized_by_documentation = !!rec && rec.synthesized_by === "documentation";
    const synthesized_by_in_enum       = !!rec &&
                                       ["documentation", "architect", "research"].includes(rec.synthesized_by);
    const line_range_verbatim        = !!rec && rec.claim_location &&
                                       Array.isArray(rec.claim_location.line_range) &&
                                       rec.claim_location.line_range[0] === 12 &&
                                       rec.claim_location.line_range[1] === 12;
    const artifact_path_ok           = !!rec && rec.claim_location &&
                                       rec.claim_location.artifact_path === artifactRel;
    const confidence_valid           = !!rec && ["HIGH", "MEDIUM", "LOW"].includes(rec.confidence);

    // Leg 2 (C-2 sibling) — ALL-LOW chunks → kb.cite SKIPS, no record, no fabrication.
    const lowClaim = "The database layer requires an index on the created_at column for reads.";
    const lowCiteEnv = await reg.invoke("kb.cite", {
      claim_text:     lowClaim,
      claim_location: { artifact_path: artifactRel, line_range: [20, 20] },
      chunks:         [{
        chunk_id:         "chk_8a148165_1",
        source_id:        "src_8a148165135d",
        text:             "some weakly-sourced passage",
        relevance_score:  0.9,
        credibility_tier: "LOW"
      }],
      synthesized_by: "documentation",
      project_id:     PID
    }, { root: ROOT });

    const low_cred_blocked = !!(lowCiteEnv && lowCiteEnv.status !== "SUCCESS");
    const recordsAfterLow  = manifests.readCitations(PID, "project", { root: ROOT });
    const low_cred_no_record = !recordsAfterLow.some(r => r.claim_text === lowClaim);

    return {
      cite_ok,
      schema_version_ok, id_matches_citid, id_pattern_ok,
      supporting_chunks_nonempty, excerpt_within_200,
      synthesized_by_documentation, synthesized_by_in_enum,
      line_range_verbatim, artifact_path_ok, confidence_valid,
      low_cred_blocked, low_cred_no_record
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S-E — Non-mutation / determinism of the citation pass ──────────────────────

async function runSENonMutation() {
  const PID     = "se_non_mutation";
  const LOOP_ID = "loop_se";
  _cleanup(PID);

  try {
    const reg     = getDefaultRegistry();
    const orchDir = path.join(PROJECTS_ROOT, PID, "orchestration", LOOP_ID);
    fs.mkdirSync(orchDir, { recursive: true });

    // A claim-bearing documentation.json (Pattern-1: "must persist ...", "provides ...").
    const docObject = {
      overview: "The API server must persist all session tokens in encrypted storage.",
      summary:  "A REST API that provides token-based authentication and stores audit logs.",
      sections: ["auth", "storage"]
    };
    const docPath   = path.join(orchDir, "documentation.json");
    const docRelPath = "artifacts/projects/" + PID + "/orchestration/" + LOOP_ID + "/documentation.json";
    fs.writeFileSync(docPath, JSON.stringify(docObject, null, 2), "utf8");

    const bytesBefore = fs.readFileSync(docPath, "utf8");

    // Run the pass over the IDENTICAL bytes the §8 audit would read (C-1). Hermetic:
    // kb.retrieve fast-fails without an API key → 0 citations, doc untouched.
    const summary = await runDocumentationCitationPass(
      reg, PID, docRelPath, bytesBefore, ROOT);

    const bytesAfter = fs.readFileSync(docPath, "utf8");

    const claims_detected_ge_1 = !!summary && summary.claims_detected >= 1;
    const cited_zero_hermetic  = !!summary && summary.cited === 0;
    const bytes_identical      = bytesBefore === bytesAfter;
    const doc_still_exists      = fs.existsSync(docPath);

    return { claims_detected_ge_1, cited_zero_hermetic, bytes_identical, doc_still_exists };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runSDCitationRecordSchema,
  runSENonMutation
};

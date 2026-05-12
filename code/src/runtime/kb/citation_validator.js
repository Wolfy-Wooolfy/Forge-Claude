"use strict";

// L-KB-4 Citation Validator — detect factual claims and audit citation coverage.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §7 (Citation Audit Rule)
//
// Track A: pure text analysis — no fetch(), no fs.*, no OpenAI.

// ── Claim detector patterns (§7.1) ───────────────────────────────────────────

const CLAIM_PATTERNS = [
  // Pattern 1: action verbs preceding a lowercase word
  /\b(?:is|are|was|were|must|should|provides|requires|supports|enables|allows|ensures|guarantees)\s+[a-z]/i,
  // Pattern 2: version and RFC/spec statements
  /v[0-9]+\.[0-9]+|RFC\s+[0-9]+|version\s+[0-9]/i,
  // Pattern 3: attribution anchors
  /according to|as specified in|per the|defined in/i,
  // Pattern 4: numbered requirement lines (multiline flag handled line-by-line)
  /^[0-9]+\.\s+[A-Z].*(?:must|shall|required|mandatory)/,
  // Pattern 5: percentage or metric assertions
  /[0-9]+(?:\.[0-9]+)?%|[0-9]+\s+(?:ms|seconds|minutes|hours|bytes|MB|GB)/i
];

function _isClaim(lineText) {
  for (const pattern of CLAIM_PATTERNS) {
    if (pattern.test(lineText)) return true;
  }
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Audit artifact text for uncited factual claims.
 *
 * @param {string} artifactContent    Full text content of the artifact
 * @param {number[]|Set<number>} citedLineNumbers  1-indexed line numbers covered by CitationRecords
 * @returns {{
 *   status: "PASS"|"FAIL_UNCITED",
 *   uncited_claims_count: number,
 *   cited_claims_count: number,
 *   uncited_claims: Array<{ line: number, text: string }>
 * }}
 */
function validateCitations(artifactContent, citedLineNumbers) {
  const citedSet = citedLineNumbers instanceof Set
    ? citedLineNumbers
    : new Set(citedLineNumbers || []);

  const lines         = (artifactContent || "").split("\n");
  const uncitedClaims = [];
  let citedClaimsCount   = 0;
  let uncitedClaimsCount = 0;

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1; // 1-indexed
    if (!_isClaim(lineText)) return;

    if (citedSet.has(lineNum)) {
      citedClaimsCount++;
    } else {
      uncitedClaimsCount++;
      uncitedClaims.push({ line: lineNum, text: lineText.trim() });
    }
  });

  return {
    status:               uncitedClaims.length === 0 ? "PASS" : "FAIL_UNCITED",
    uncited_claims_count: uncitedClaimsCount,
    cited_claims_count:   citedClaimsCount,
    uncited_claims:       uncitedClaims
  };
}

module.exports = { validateCitations, CLAIM_PATTERNS };

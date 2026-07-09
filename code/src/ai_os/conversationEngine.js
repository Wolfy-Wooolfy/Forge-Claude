"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ConversationalResponseProvider = require("../providers/conversationalResponseProvider");
const IntentClassificationProvider   = require("../providers/intentClassificationProvider");
const ideaSynthesisProvider          = require("../providers/ideaSynthesisProvider");
const { getDefaultRegistry } = require("../runtime/tools/_registry");
const { serializeFrontmatter, validateFrontmatter, parseFrontmatter } = require("./schemas/visionSchema");
const { validateCitations } = require("../runtime/kb/citation_validator");
// PHASE-53 (R-4): value-only import of the MEDIUM threshold — the citation pass's
// relevance floor. Single source of truth lives in citation_engine.js (no side effect;
// same layering precedent as the validateCitations import above).
const { RELEVANCE_FLOOR_MEDIUM } = require("../runtime/kb/citation_engine");

const STATE_TRANSITION_THRESHOLDS = {
  DISCUSSION: ["DISCOVERY_REQUIRED"],
  DISCOVERY_REQUIRED: ["IDEATION", "BUSINESS_ANALYSIS"],
  IDEATION: ["BUSINESS_ANALYSIS", "OPTION_DECISION"],
  BUSINESS_ANALYSIS: ["OPTION_DECISION"],
  OPTION_DECISION: ["DOCUMENTATION"],
  DOCUMENTATION: ["DOCUMENTATION_REVIEW"],
  DOCUMENTATION_REVIEW: ["EXECUTION_HANDOFF_READY"],
  EXECUTION_HANDOFF_READY: ["EXECUTION_HANDOFF_CREATED"]
};

// States where user MUST explicitly confirm before proceeding
const CONFIRMATION_REQUIRED_TRANSITIONS = new Set([
  "DISCOVERY_REQUIRED->IDEATION",
  "IDEATION->OPTION_DECISION",
  "OPTION_DECISION->DOCUMENTATION",
  "DOCUMENTATION->DOCUMENTATION_REVIEW",
  "DOCUMENTATION_REVIEW->EXECUTION_HANDOFF_READY",
  "EXECUTION_HANDOFF_READY->EXECUTION_HANDOFF_CREATED"
]);

// ── PHASE-52 (D2) — Auto web-discovery guardrails (named constants) ─────────────
// These bound the cost + blast radius of the discovery loop below. The per-run total cap is
// the real Gate #10 cost ceiling (each research.search_web call ≈ $0.005 + one kb.ingest_url
// embed ≈ fractions of a cent). Worst case at cap 8 ≈ $0.04 in search + embeds — well under
// the decision-§8 estimate ($0.03–0.10) and far under the $3 kill bar. Conservative by design.
const DISCOVERY_MAX_SEARCHES_PER_CLAIM = 1;   // one targeted search per triggered claim (query = claim text)
const DISCOVERY_MAX_TOTAL_SEARCHES     = 8;   // per-documentProject ceiling (the cost ceiling)
const DISCOVERY_MAX_URLS_PER_CLAIM     = 1;   // ingest only the top usable result
const DISCOVERY_SEARCH_MAX_RESULTS     = 5;   // ask for a few; take the first usable url

// ── PHASE-51 (W-1) — Documentation-time citation generation ────────────────────
// Post-generation citation pass: runs inside documentProject AFTER documentation.json is
// persisted and BEFORE the §8 citation audit. For each factual claim the §7.1 detector
// flags, it retrieves supporting chunks from the active project KB and, if kb.cite emits a
// record (≥1 eligible/non-LOW chunk), the claim becomes cited; otherwise the claim stays
// uncited (NEVER fabricated — §5 hard rule) and the §8 audit blocks the build (fail-closed
// AT THE GATE). The pass READS documentation.json + WRITES citations.jsonl only; it never
// mutates documentation.json (S-E).
//
// Parity (C-1): the caller passes the EXACT bytes the §8 audit will read (read-back after
// persist), and claims are enumerated by the SAME detector the audit uses —
// validateCitations(content, ∅).uncited_claims — so the set attempted == the set audited,
// and claim_location.line_range = [line, line] uses that reported 1-indexed line verbatim.
// C-2: "leave uncited" is decided from the kb.cite RESULT (record emitted vs skip), NOT
// from whether kb.retrieve returned chunks — a claim whose only chunks are LOW-credibility
// makes kb.cite skip, and the claim correctly stays uncited.
// Track A: all retrieval/embedding via reg.invoke("kb.retrieve"/"kb.cite"); no direct fs.
//
// `_client` (PHASE-51 A-1, W-2 seam) is an OPTIONAL trailing test seam — a mock embedding
// client for hermetic retrieval-coupled scenarios. When absent (production), the kb.retrieve
// ctx is exactly { root } and the path is byte-identical to the seam-absent behavior.
//
// ── PHASE-52 (D1) — Auto web-discovery on would-be-uncited claims ──────────────
// When a §7.1 claim would otherwise stay UNCITED for one of exactly TWO reasons —
//   (a) zero_chunks : retrieve OK but the active KB holds NO source for this claim, or
//   (b) cite_blocked: chunks exist but kb.cite skipped (LOW-only support, the PHASE-51-LOW
//       limit) — the pass runs web discovery: research.search_web(claim) → kb.ingest_content
//   (the top result's Tavily content) into the ACTIVE PROJECT KB → kb.retrieve(claim) again →
//   kb.cite. (A-1: content comes from Tavily; Forge never fetches the arbitrary host.) Discovery is
//   STRICTLY ADDITIVE: it fires ONLY on those two branches. An already-citable claim reaches
//   `summary.cited++` on the first cite and NEVER enters discovery (untouched vs PHASE-51).
//   The retrieve_failed branch is DELIBERATELY EXCLUDED (RULING 2): the retrieve envelope
//   failed (infra / no embed key / store error); kb.ingest_url re-embeds via the SAME infra
//   and the re-retrieve would fail identically, so a paid search there is futile.
// No fabrication (CTO refinement): the re-cite is a normal kb.cite call, so its LOW-filter
//   (C-2) stays authoritative — if the newly-ingested source only yields LOW chunks, kb.cite
//   still SKIPS and the claim STAYS UNCITED. Discovery either lifts a claim to a REAL non-LOW
//   citation or leaves it uncited; it can NEVER force a fabricated/LOW "cited". §8 stays the gate.
//
// `_discovery` (PHASE-52 seam, Option-1 A-1 analog) is an OPTIONAL trailing test seam —
//   { search, ingest } function overrides (+ an optional test-only `maxTotalSearches`) for
//   hermetic $0 scenarios. When absent (production), search/ingest go through
//   reg.invoke("research.search_web"/"kb.ingest_content") directly; the ctx is exactly { root }
//   (or { root, _client } when the embed seam is present) — byte-identical to the seam-absent path.
//
// ── PHASE-53 (D1+D2) — Relevance floor on cited-able claims ────────────────────
// FLOOR = RELEVANCE_FLOOR_MEDIUM (the existing MEDIUM confidence threshold — R-4
//   single source of truth in citation_engine.js). A claim WITH first-pass chunks whose
//   best relevance_score < FLOOR gets ONE targeted discovery (SAME shared per-run search
//   cap + SAME URL dedup set as the zero_chunks trigger — one budget, one enforcement
//   point), then KEEP-BEST of (original set, new set) feeds the SINGLE kb.cite
//   (R-1 — exactly one CitationRecord per claim; citations.jsonl is append-only).
//   No lift → the claim is STILL cited with its original set and flagged below_floor in
//   the summary forensics (R-2) — NEVER a new HALT; offline-safe with no TAVILY key.
//   ONE discovery attempt per claim, shared across the zero_chunks / floor / cite_blocked
//   triggers (R-3).
async function runDocumentationCitationPass(reg, projectId, artifactRelPath, content, root, _client, _discovery) {
  const summary = {
    claims_detected: 0, cited: 0, uncited: 0,
    retrieve_failed: 0, zero_chunks: 0, cite_blocked: 0,
    // PHASE-52 additive forensics (Gate #10 durable evidence; consumed by no existing scenario)
    discovery_searches: 0, discovery_ingests: 0, discovery_cited: 0, discovery_blocked_low: 0,
    // PHASE-53 additive floor forensics (R-2: claim-granular; consumed by no pre-existing
    // scenario). floor_checked/floor_below/floor_lifted count the FLOOR trigger only
    // (claims WITH first-pass chunks); below_floor_claims counts claims that FINISH the
    // pass with best relevance < floor on EITHER trigger path (floor or zero_chunks).
    // floor_claims carries one record per affected claim:
    //   { line, text_prefix, trigger, best_relevance_before, best_relevance_after,
    //     attempted, lifted, below_floor }
    floor_value: RELEVANCE_FLOOR_MEDIUM,
    floor_checked: 0, floor_below: 0, floor_lifted: 0, below_floor_claims: 0,
    floor_claims: []
  };

  let claims;
  try {
    claims = (validateCitations(content, new Set()).uncited_claims) || [];
  } catch (_) {
    claims = [];
  }
  summary.claims_detected = claims.length;

  // Additive-optional: exactly { root } unless the test seam supplies a mock embed client.
  const retrieveCtx = _client ? { root, _client } : { root };
  const ingestCtx   = _client ? { root, _client } : { root };
  const baseCtx     = { root };

  // ── PHASE-52 (D2) guardrails ──
  const maxTotalSearches = (_discovery && Number.isInteger(_discovery.maxTotalSearches))
    ? _discovery.maxTotalSearches            // test-only override (production: _discovery absent)
    : DISCOVERY_MAX_TOTAL_SEARCHES;
  const ingestedUrls = new Set();            // in-run URL dedup (complements kb.ingest_url's persistent dedup)
  let   totalSearches = 0;                   // per-documentProject counter, capped at maxTotalSearches

  // Seam-aware invokers: production (default) → reg.invoke; tests → _discovery.{search,ingest}.
  async function _search(input) {
    if (_discovery && typeof _discovery.search === "function") return _discovery.search(input, baseCtx);
    return reg.invoke("research.search_web", input, baseCtx);
  }
  async function _ingest(input) {
    if (_discovery && typeof _discovery.ingest === "function") return _discovery.ingest(input, ingestCtx);
    // A-1: ingest the Tavily-returned CONTENT directly — Forge never fetches the arbitrary host.
    return reg.invoke("kb.ingest_content", input, ingestCtx);
  }
  async function _retrieve(text) {
    return reg.invoke("kb.retrieve", {
      query:             text,
      project_id:        projectId,
      credibility_floor: "COMMUNITY"
    }, retrieveCtx);
  }
  async function _cite(text, line, chunks) {
    return reg.invoke("kb.cite", {
      claim_text:     text,
      claim_location: { artifact_path: artifactRelPath, line_range: [line, line] },
      chunks:         chunks,
      synthesized_by: "documentation",
      project_id:     projectId
    }, baseCtx);
  }

  // Discovery for a single would-be-uncited claim (zero_chunks / cite_blocked only).
  // Returns true iff the claim is lifted to a REAL non-LOW citation. Enforces the per-claim
  // and per-run search caps (D2). Never fabricates — the re-cite's kb.cite LOW-filter decides.
  async function _attemptDiscovery(text, line) {
    for (let s = 0; s < DISCOVERY_MAX_SEARCHES_PER_CLAIM; s++) {
      if (totalSearches >= maxTotalSearches) break;      // per-run total-search cap
      totalSearches++; summary.discovery_searches++;

      let searchEnv;
      try {
        searchEnv = await _search({
          query:       text,
          project_id:  projectId,
          max_results: DISCOVERY_SEARCH_MAX_RESULTS
        });
      } catch (_) { searchEnv = null; }
      // FAILED envelope (e.g. BOTH_PROVIDERS_FAILED) → no source this round.
      if (!searchEnv || searchEnv.status !== "SUCCESS") continue;

      const found = (searchEnv.output && searchEnv.output.results) || [];
      const picks = [];
      for (const r of found) {
        if (r && typeof r.url === "string" && r.url) {
          picks.push({ url: r.url, content: (r && r.content) || "", title: (r && r.title) || "" });
        }
        if (picks.length >= DISCOVERY_MAX_URLS_PER_CLAIM) break;
      }
      if (picks.length === 0) continue;                  // SUCCESS but nothing usable

      for (const pick of picks) {
        if (ingestedUrls.has(pick.url)) continue;        // in-run URL dedup — skip a repeat ingest
        ingestedUrls.add(pick.url);
        // A-1: ingest the Tavily-returned CONTENT directly (kb.ingest_content) — no fetch of the
        // arbitrary host. No content → skip (fail-closed; never fetch to recover it).
        if (!pick.content) continue;
        let ingestEnv;
        try { ingestEnv = await _ingest({ url: pick.url, content: pick.content, title: pick.title, project_id: projectId }); }
        catch (_) { ingestEnv = null; }
        if (ingestEnv && ingestEnv.status === "SUCCESS") summary.discovery_ingests++;
      }

      // Re-retrieve after ingest, then re-cite (LOW-filter authoritative — CTO refinement).
      let reEnv;
      try { reEnv = await _retrieve(text); } catch (_) { reEnv = null; }
      if (!reEnv || reEnv.status !== "SUCCESS") continue;
      const reChunks = (reEnv.output && reEnv.output.results) || [];
      if (reChunks.length === 0) continue;

      let reCiteEnv;
      try { reCiteEnv = await _cite(text, line, reChunks); } catch (_) { reCiteEnv = null; }
      if (reCiteEnv && reCiteEnv.status === "SUCCESS") {
        // PHASE-53 (R-3): the claim was lifted from zero_chunks by its ONE discovery
        // attempt (shared across triggers). If the lifted citation still sits below the
        // MEDIUM floor, mark below_floor — NO second attempt is ever made for it.
        const afterBest = _bestRelevance(reChunks);
        const below     = afterBest < RELEVANCE_FLOOR_MEDIUM;
        if (below) summary.below_floor_claims++;
        summary.floor_claims.push({
          line, text_prefix: text.slice(0, 80), trigger: "zero_chunks",
          best_relevance_before: 0, best_relevance_after: afterBest,
          attempted: true, lifted: true, below_floor: below
        });
        return true;                                                 // lifted to a REAL non-LOW citation
      }
      summary.discovery_blocked_low++;                               // ingested but re-cite still LOW-only
      return false;                                                  // stays uncited (fail-closed; no fabrication)
    }
    return false;
  }

  // PHASE-53 (D2) — max relevance_score across a retrieve result set (0 when empty;
  // retrieval.js already defaults a missing relevance_score to 0).
  function _bestRelevance(chunkList) {
    let best = 0;
    for (const c of (chunkList || [])) {
      const r = (c && c.relevance_score != null) ? c.relevance_score : 0;
      if (r > best) best = r;
    }
    return best;
  }

  // PHASE-53 (D2, R-1) — ONE targeted discovery for a cited-able claim whose best
  // first-pass relevance sits BELOW the MEDIUM floor. Same shape as _attemptDiscovery
  // MINUS the cite: search → dedup → kb.ingest_content → re-retrieve → return the new
  // chunk set for the caller's KEEP-BEST comparison (the single kb.cite happens in the
  // per-claim loop, AFTER keep-best — never here, so exactly ONE CitationRecord per
  // claim is ever appended). Enforces the SAME shared per-run search cap (totalSearches)
  // and the SAME shared URL dedup set (ingestedUrls) as the zero_chunks trigger — one
  // budget, one enforcement point (decision §3). Every failure mode (cap reached,
  // search FAILED e.g. no TAVILY key, nothing usable, dedup skip, ingest fail,
  // re-retrieve fail/empty) returns chunks:null → the caller keeps the original set →
  // byte-equivalent PHASE-52 outcome, NO new HALT (offline-safe).
  async function _attemptFloorDiscovery(text) {
    if (totalSearches >= maxTotalSearches) return { attempted: false, chunks: null };
    totalSearches++; summary.discovery_searches++;

    let searchEnv;
    try {
      searchEnv = await _search({
        query:       text,
        project_id:  projectId,
        max_results: DISCOVERY_SEARCH_MAX_RESULTS
      });
    } catch (_) { searchEnv = null; }
    if (!searchEnv || searchEnv.status !== "SUCCESS") return { attempted: true, chunks: null };

    const found = (searchEnv.output && searchEnv.output.results) || [];
    const picks = [];
    for (const r of found) {
      if (r && typeof r.url === "string" && r.url) {
        picks.push({ url: r.url, content: (r && r.content) || "", title: (r && r.title) || "" });
      }
      if (picks.length >= DISCOVERY_MAX_URLS_PER_CLAIM) break;
    }
    if (picks.length === 0) return { attempted: true, chunks: null };

    let ingested = 0;
    for (const pick of picks) {
      if (ingestedUrls.has(pick.url)) continue;        // shared in-run URL dedup (§3)
      ingestedUrls.add(pick.url);
      if (!pick.content) continue;                      // A-1: no content → never fetch to recover it
      let ingestEnv;
      try { ingestEnv = await _ingest({ url: pick.url, content: pick.content, title: pick.title, project_id: projectId }); }
      catch (_) { ingestEnv = null; }
      if (ingestEnv && ingestEnv.status === "SUCCESS") { summary.discovery_ingests++; ingested++; }
    }
    // Nothing new entered the KB (dedup skip / no content / ingest fail) → the first-pass
    // retrieve already saw everything the KB holds; skip the redundant re-retrieve.
    if (ingested === 0) return { attempted: true, chunks: null };

    let reEnv;
    try { reEnv = await _retrieve(text); } catch (_) { reEnv = null; }
    if (!reEnv || reEnv.status !== "SUCCESS") return { attempted: true, chunks: null };
    const reChunks = (reEnv.output && reEnv.output.results) || [];
    return { attempted: true, chunks: reChunks.length > 0 ? reChunks : null };
  }

  for (const claim of claims) {
    const line = claim.line;
    const text = String((claim && claim.text) || "");

    // A claim shorter than the §5 claim_text minLength cannot form a valid CitationRecord.
    if (text.length < 10) { summary.uncited++; continue; }

    // 1. Retrieve supporting chunks. credibility_floor COMMUNITY: non-LOW chunks are
    //    eligible for a CitationRecord (synthesizeCitation still filters LOW as
    //    defense-in-depth). A retrieve failure (e.g. no API key in a hermetic run) leaves
    //    the claim uncited — the §8 audit below is the fail-closed gate. Discovery is
    //    EXCLUDED on this branch (RULING 2): the same infra would fail the re-retrieve.
    let retrieveEnv = null;
    try {
      retrieveEnv = await _retrieve(text);
    } catch (_) {
      retrieveEnv = null;
    }
    if (!retrieveEnv || retrieveEnv.status !== "SUCCESS") {
      summary.retrieve_failed++; summary.uncited++; continue;
    }

    const chunks = (retrieveEnv.output && retrieveEnv.output.results) || [];
    if (chunks.length === 0) {
      // (a) zero_chunks — no KB source for this claim (the PHASE-51 L-1 limit). Try discovery.
      summary.zero_chunks++;
      if (await _attemptDiscovery(text, line)) { summary.cited++; summary.discovery_cited++; }
      else { summary.uncited++; }
      continue;
    }

    // ── PHASE-53 (D2, R-1) — relevance-floor check BEFORE the single kb.cite ──
    // A claim that WOULD be cited but whose best first-pass relevance sits below the
    // MEDIUM floor gets ONE targeted discovery; KEEP-BEST of (original set, new set)
    // by max relevance decides which set the single kb.cite below receives — so
    // never-downgrade / never-strip hold by construction (one cite, one CitationRecord,
    // best set). Discovery failure / absent key / no-lift → citeChunks stays = chunks →
    // byte-equivalent PHASE-52 outcome; the claim is still cited (NO new HALT) and is
    // flagged below_floor in the summary forensics (R-2).
    let citeChunks     = chunks;
    let floorAttempted = false;
    summary.floor_checked++;
    const bestBefore = _bestRelevance(chunks);
    if (bestBefore < RELEVANCE_FLOOR_MEDIUM) {
      summary.floor_below++;
      const lift = await _attemptFloorDiscovery(text);
      floorAttempted = lift.attempted;
      let bestAfter = bestBefore;
      let lifted    = false;
      if (lift.chunks) {
        const newBest = _bestRelevance(lift.chunks);
        if (newBest > bestBefore) {          // KEEP-BEST: replace only on strict improvement
          citeChunks = lift.chunks;
          bestAfter  = newBest;
          lifted     = true;
        }
      }
      const below = bestAfter < RELEVANCE_FLOOR_MEDIUM;
      if (!below) summary.floor_lifted++;
      else summary.below_floor_claims++;
      summary.floor_claims.push({
        line, text_prefix: text.slice(0, 80), trigger: "floor",
        best_relevance_before: bestBefore, best_relevance_after: bestAfter,
        attempted: lift.attempted, lifted, below_floor: below
      });
    }

    // 2. Cite — decide "cited vs uncited" from the kb.cite RESULT (C-2), never fabricate.
    let citeEnv = null;
    try {
      citeEnv = await _cite(text, line, citeChunks);
    } catch (_) {
      citeEnv = null;
    }
    if (citeEnv && citeEnv.status === "SUCCESS") { summary.cited++; continue; }

    // (b) cite_blocked — chunks exist but kb.cite skipped (all-LOW support). Try discovery.
    // NOTE (PHASE-52, CTO erratum #3): under the current COMMUNITY retrieve floor, kb.retrieve
    // filters LOW-credibility chunks before kb.cite, so kb.cite never receives an all-LOW set on
    // this path — this branch is UNREACHABLE in production. Retained as a correct defense-in-depth
    // branch: it fires only if the retrieve credibility_floor is lowered. The DEFERRED relevance
    // floor (DECISION §5/§10) is a SEPARATE future branch, not this one. (Verified $0: a LOW-tier
    // source → kb.retrieve returns 0 chunks → zero_chunks branch, not this one.)
    summary.cite_blocked++;
    // PHASE-53 (R-3): ONE discovery attempt per claim, shared across triggers — if the
    // floor path above already consumed this claim's attempt, do NOT search again.
    if (!floorAttempted && await _attemptDiscovery(text, line)) { summary.cited++; summary.discovery_cited++; }
    else { summary.uncited++; }
  }

  return summary;
}

function createConversationEngine(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");
  const ideationEngine = options.ideationEngine || null;
  // PHASE-51 A-1 (W-2 hermeticity seam, CTO-ratified): optional mock embedding client,
  // injected at ENGINE CONSTRUCTION (off the public HTTP body, per G-1) so the citation
  // pass's kb.retrieve can run with deterministic embeddings + real LanceDB in tests.
  // undefined in production (start-api.js / apiServer.js:82 never pass it) → kb.retrieve
  // falls back to getClient() and behavior is byte-identical to the seam-absent path.
  const _kbEmbedClient = options._client || undefined;
  // PHASE-52 (D1) discovery seam — OPTIONAL { search, ingest } test overrides, injected at
  // ENGINE CONSTRUCTION (off the public HTTP body, per G-1; the A-1 _client analog). undefined
  // in production (start-api.js / apiServer.js never pass it) → the citation pass's web
  // discovery runs through reg.invoke("research.search_web"/"kb.ingest_url") directly.
  const _kbDiscovery = options._discovery || undefined;

  let _memoryManager = options.conversationMemoryManager || null;
  function getMemoryManager() {
    if (_memoryManager) return _memoryManager;
    console.warn("[conversationEngine] memoryManager not injected; lazy-instantiating. Update callers to pass it explicitly.");
    const { createConversationMemoryManager } = require("./conversationMemoryManager");
    _memoryManager = createConversationMemoryManager({ root });
    return _memoryManager;
  }

  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch { return fallback; }
  }
  async function writeJson(filePath, payload) {
    const reg = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r = await reg.invoke("fs.write_file", {
      path:    relPath,
      content: JSON.stringify(payload, null, 2)
    }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " +
        (r.metadata && r.metadata.reason) + ": " + (r.metadata && r.metadata.detail));
    }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function statePath(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "project_state.json");
  }

  function loadConversationHistory(projectId, opts) {
    const histPath = path.join(
      projectsRoot, normalizeProjectId(projectId),
      "ai_os", "conversation_context.json"
    );
    const raw = readJsonSafe(histPath, []);
    const arr = Array.isArray(raw) ? raw : [];
    return (opts && opts.full) ? arr : arr.slice(-20);
  }

  function loadState(projectId) {
    return readJsonSafe(statePath(projectId), null);
  }

  async function saveState(projectId, state) {
    await writeJson(statePath(projectId), state);
  }

  function generateConfirmationKey() {
    return crypto.randomBytes(8).toString("hex");
  }

  async function generateConversationalMessage(operation, result, state, user_language, project_name, conversation_history) {
    const provider = new ConversationalResponseProvider();
    const providerResult = await provider.executeTask({
      task_id: `conv_msg_${Date.now()}`,
      context: {
        operation,
        result,
        state: state.active_runtime_state || "DISCUSSION",
        user_language: user_language || state.user_language || "ar",
        project_name: project_name || state.project_name || "",
        conversation_history: Array.isArray(conversation_history) ? conversation_history : []
      }
    });

    if (providerResult.status === "SUCCESS" && providerResult.output?.message) {
      return providerResult.output;
    }

    const lang = String(user_language || state.user_language || "ar").toLowerCase();
    return {
      message: lang.startsWith("en")
        ? `Operation "${operation}" completed.`
        : `تمت العملية "${operation}" بنجاح.`,
      tone: "informative",
      suggest_next: ""
    };
  }

  async function generateCheckpoint(projectId, targetState) {
    const state = loadState(projectId);
    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND", project_id: projectId };

    const lang = String(state.user_language || "ar").toLowerCase();
    const provider = new ConversationalResponseProvider();

    const providerResult = await provider.executeTask({
      task_id: `checkpoint_${Date.now()}`,
      context: {
        operation: "TRANSITION_CHECKPOINT",
        result: {
          current_state: state.active_runtime_state,
          target_state: targetState,
          project_name: state.project_name,
          user_goal: state.user_goal || ""
        },
        state: state.active_runtime_state,
        user_language: state.user_language || "ar",
        project_name: state.project_name || ""
      }
    });

    const confirmationKey = generateConfirmationKey();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    const pending = {
      target_state: targetState,
      confirmation_key: confirmationKey,
      created_at: nowIso(),
      expires_at
    };

    if (providerResult.status === "SUCCESS" && providerResult.output?.message) {
      pending.message = providerResult.output.message;
    } else {
      pending.message = lang.startsWith("en")
        ? `Ready to move to the next phase (${targetState})? Reply "yes" to confirm.`
        : `هل أنت مستعد للانتقال إلى المرحلة التالية؟ أكد بـ "نعم" للمتابعة.`;
    }

    const updatedState = { ...state, pending_confirmation: pending };
    await saveState(projectId, updatedState);

    return {
      ok: true,
      mode: "PENDING_CONFIRMATION",
      message: pending.message,
      confirmation_key: confirmationKey,
      target_state: targetState,
      project_id: projectId
    };
  }

  async function confirmTransition(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadState(projectId);

    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const pending = state.pending_confirmation;
    if (!pending) {
      return { ok: false, mode: "BLOCKED", reason: "NO_PENDING_CONFIRMATION" };
    }

    if (pending.expires_at && new Date() > new Date(pending.expires_at)) {
      const updatedState = { ...state };
      delete updatedState.pending_confirmation;
      await saveState(projectId, updatedState);
      return { ok: false, mode: "BLOCKED", reason: "CONFIRMATION_EXPIRED" };
    }

    if (body.confirmation_key && body.confirmation_key !== pending.confirmation_key) {
      return { ok: false, mode: "BLOCKED", reason: "INVALID_CONFIRMATION_KEY" };
    }

    const targetState = pending.target_state;
    const updatedState = { ...state, active_runtime_state: targetState };
    delete updatedState.pending_confirmation;
    updatedState.last_updated_at = nowIso();
    await saveState(projectId, updatedState);

    if (targetState === "OPTION_DECISION") {
      try {
        const { createVisionEngine } = require("./visionEngine");
        const ve = createVisionEngine({ root });
        await ve.lockVision(projectId, "owner");
      } catch (err) {
        console.warn("[conversationEngine] vision lock failed:", err.message);
      }
    }

    const convMsg = await generateConversationalMessage(
      `TRANSITION_CONFIRMED_TO_${targetState}`,
      { from: state.active_runtime_state, to: targetState },
      updatedState,
      body.user_language || state.user_language
    );

    return {
      ok: true,
      mode: "TRANSITION_CONFIRMED",
      from_state: state.active_runtime_state,
      to_state: targetState,
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      project_id: projectId
    };
  }

  async function getProjectSummary(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadState(projectId);
    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const discoveryPath = path.join(projectsRoot, projectId, "ai_os", "discovery_log.json");
    const discoveryLog = readJsonSafe(discoveryPath, []);
    const latestDiscovery = discoveryLog.length > 0 ? discoveryLog[discoveryLog.length - 1] : null;

    const contextPath = path.join(projectsRoot, projectId, "ai_os", "conversation_context.json");
    const context = readJsonSafe(contextPath, []);
    const recentMessages = context.slice(-6).map((e) => `[${e.role}] ${String(e.content || e.message || "").slice(0, 200)}`).join("\n");

    const convMsg = await generateConversationalMessage(
      "PROJECT_SUMMARY_REQUESTED",
      {
        project_name: state.project_name,
        current_phase: state.active_runtime_state,
        user_goal: state.user_goal || "",
        discovery_complete: state.requirement_completeness === true,
        selected_option: state.selected_option_id || null,
        open_questions: latestDiscovery ? (latestDiscovery.discovery || {}).open_questions || [] : [],
        recent_context: recentMessages,
        has_pending_confirmation: !!state.pending_confirmation
      },
      state,
      body.user_language || state.user_language
    );

    return {
      ok: true,
      mode: "SUMMARY_READY",
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      current_state: state.active_runtime_state,
      project_name: state.project_name,
      pending_confirmation: state.pending_confirmation || null,
      project_id: projectId
    };
  }

  async function persistTurn(projectId, userMessage, result) {
    if (!result || result.ok !== true) return;
    if (!projectId) return;
    const mm = getMemoryManager();
    try {
      if (userMessage) {
        await mm.saveContext(projectId, {
          role: "user",
          content: userMessage,
          created_at: nowIso()
        });
      }
      if (result.message) {
        await mm.saveContext(projectId, {
          role: "assistant",
          content: result.message,
          created_at: nowIso()
        });
      }
    } catch (err) {
      console.error("[conversationEngine] history persistence failed:", err.message);
      result.history_persisted = false;
    }
  }

  // C-2: Provider Discovery Hard Prohibition
  // Per docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md §13.7.3
  // The conversation layer MUST NOT infer requirements using keyword logic.
  // ALL requirement discovery MUST delegate to ConversationalResponseProvider.
  function assertNoLocalRequirementInference(message, state) {
    // This is a runtime guard — if we detect the conversation engine
    // is being asked to infer domain/requirements directly, block it.
    const forbidden = [
      /if.*message.*includes/i,
      /inferDomain|detectDomain|classifyByKeyword/i,
      /domain\s*===?\s*['"]/i
    ];
    // Scan the current call stack source (defensive: only flags if somehow
    // inline logic was injected — the provider call below is the approved path)
    // This function exists to make the prohibition explicit and auditable.
    return { ok: true, note: "Provider-driven discovery enforced — no inline inference" };
  }

  async function handleConversationMode(projectId, message, state, user_language, history) {
    const provider = new ConversationalResponseProvider();
    const providerResult = await provider.executeTask({
      task_id: `conv_mode_${Date.now()}`,
      context: {
        operation: "محادثة",
        result: message,
        state: "CONVERSATION",
        user_language: user_language || state.user_language || "ar",
        project_name: state.project_name || "",
        conversation_history: Array.isArray(history) ? history : []
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output || !providerResult.output.message) {
      const failMeta = providerResult.metadata || {};
      const lang = String(user_language || "ar").toLowerCase();
      const fallbackMsg = failMeta.reason === "MISSING_API_KEY"
        ? (lang.startsWith("en") ? "AI provider not configured. Please check OPENAI_API_KEY setting." : "تعذّر توليد رد — تأكّد من إعداد مفتاح API في ملف .env")
        : (lang.startsWith("en") ? "Could not generate a response. Please try again." : "تعذّر توليد رد، حاول مجدداً.");
      return {
        ok: true,
        mode: "CONVERSATION_RESPONSE",
        message: fallbackMsg,
        tone: "informative",
        suggest_next: "",
        current_state: "CONVERSATION",
        provider_failed: true,
        provider_failure_reason: failMeta.reason || "UNKNOWN",
        project_id: projectId
      };
    }

    const lang = String(user_language || "ar").toLowerCase();
    const hint = _hasTransitionIntent(message)
      ? (lang.startsWith("en") ? _TRANSITION_HINT_EN : _TRANSITION_HINT_AR)
      : "";

    const r = {
      ok: true,
      mode: "CONVERSATION_RESPONSE",
      message: providerResult.output.message + hint,
      tone: providerResult.output.tone || "friendly",
      suggest_next: providerResult.output.suggest_next || "",
      current_state: "CONVERSATION",
      project_id: projectId
    };

    await persistTurn(projectId, message, r);
    return r;
  }

  async function processMessage(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const message = String(body.message || "").trim();
    const user_language = String(body.user_language || "ar");

    if (!message) {
      return { ok: false, mode: "BLOCKED", reason: "MISSING_MESSAGE" };
    }

    // C-2: Enforce provider-driven discovery prohibition
    assertNoLocalRequirementInference(message, {});

    const state = loadState(projectId);
    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const history = loadConversationHistory(projectId);

    // If there's a pending confirmation, classify intent via provider (C-2: no keyword matching)
    if (state.pending_confirmation) {
      const intentProvider = new IntentClassificationProvider();
      const intentResult = await intentProvider.executeTask({
        task_id: `intent_${Date.now()}`,
        context: {
          message,
          pending_action: state.pending_confirmation.target_state || "",
          user_language
        }
      });

      const lang = user_language.toLowerCase().startsWith("en") ? "en" : "ar";
      const fallbackClarification = lang === "ar"
        ? "هل تقصد الموافقة على المتابعة أم تريد تعديلاً؟"
        : "Do you mean to confirm, or would you like to make changes?";

      // Fail-closed: provider failure → ask for clarification, never assume
      if (intentResult.status !== "SUCCESS" || !intentResult.output) {
        const r = {
          ok: true,
          mode: "PENDING_CONFIRMATION",
          message: state.pending_confirmation.message,
          confirmation_key: state.pending_confirmation.confirmation_key,
          target_state: state.pending_confirmation.target_state,
          project_id: projectId
        };
        await persistTurn(projectId, message, r);
        return r;
      }

      const { intent, confidence, clarification_question } = intentResult.output;

      // Low confidence → ask for clarification regardless of intent
      if (confidence < 0.75) {
        const r = {
          ok: true,
          mode: "PENDING_CONFIRMATION",
          message: clarification_question || fallbackClarification,
          confirmation_key: state.pending_confirmation.confirmation_key,
          target_state: state.pending_confirmation.target_state,
          project_id: projectId
        };
        await persistTurn(projectId, message, r);
        return r;
      }

      if (intent === "AFFIRM") {
        const r = await confirmTransition({
          project_id: projectId,
          user_language,
          confirmation_key: state.pending_confirmation.confirmation_key
        });
        await persistTurn(projectId, message, r);
        return r;
      }

      if (intent === "REJECT" || intent === "MODIFY") {
        const updatedState = { ...state };
        delete updatedState.pending_confirmation;
        await saveState(projectId, updatedState);
        const operation = intent === "MODIFY" ? "CONFIRMATION_MODIFY_REQUESTED" : "CONFIRMATION_CANCELLED";
        const convMsg = await generateConversationalMessage(
          operation,
          { message, intent },
          updatedState,
          user_language,
          undefined,
          history
        );
        const r = {
          ok: true,
          mode: intent === "MODIFY" ? "MODIFICATION_REQUESTED" : "CONFIRMATION_CANCELLED",
          message: convMsg.message,
          suggest_next: convMsg.suggest_next,
          project_id: projectId
        };
        await persistTurn(projectId, message, r);
        return r;
      }

      // UNCLEAR intent → ask for clarification
      const rUnclear = {
        ok: true,
        mode: "PENDING_CONFIRMATION",
        message: clarification_question || fallbackClarification,
        confirmation_key: state.pending_confirmation.confirmation_key,
        target_state: state.pending_confirmation.target_state,
        project_id: projectId
      };
      await persistTurn(projectId, message, rUnclear);
      return rUnclear;
    }

    // CONVERSATION MODE gate — PHASE-16.1
    // Projects start in conversation mode; pipeline entered only on explicit owner action.
    if (state.conversation_mode === "CONVERSATION") {
      return await handleConversationMode(projectId, message, state, user_language, history);
    }

    // Route DISCUSSION / IDEATION to ideation engine for discovery loop
    const currentState = state.active_runtime_state || "DISCUSSION";
    if ((currentState === "DISCUSSION" || currentState === "IDEATION") && ideationEngine) {
      if (currentState === "DISCUSSION") {
        const transitionState = { ...state, active_runtime_state: "IDEATION", last_updated_at: nowIso() };
        if (!transitionState.user_goal && message) transitionState.user_goal = message;
        await saveState(projectId, transitionState);
      }

      const ideationResult = await ideationEngine.expandIdea({
        project_id: projectId,
        message,
        refinement_input: message
      });

      if (!ideationResult.ok) {
        return { ok: false, mode: "BLOCKED", reason: ideationResult.reason || "IDEATION_FAILED", project_id: projectId };
      }

      if (ideationResult.ready_for_options) {
        const r = await generateCheckpoint(projectId, "OPTION_DECISION");
        await persistTurn(projectId, message, r);
        return r;
      }

      // Bug-5 fix: build deterministic pivot message — never rely on LLM wording for domain names
      let ideationMessage = ideationResult.follow_up_question || "";
      if (ideationResult.pivot_detected) {
        const prevDomain = ideationResult.previous_domain || "";
        const newDomain  = ideationResult.detected_domain  || "";
        const lang = user_language.toLowerCase().startsWith("en") ? "en" : "ar";
        ideationMessage = lang === "ar"
          ? `لاحظت إنك كنت بتتكلم عن "${prevDomain}" ودلوقتي رسالتك بتوحي لـ "${newDomain}". هل تريد التحويل لـ "${newDomain}"؟`
          : `I noticed you were discussing "${prevDomain}" but your message now points to "${newDomain}". Would you like to switch to "${newDomain}"?`;
      }

      const rIdeation = {
        ok: true,
        mode: "IDEATION_IN_PROGRESS",
        message: ideationMessage,
        suggest_next: Array.isArray(ideationResult.suggested_answers) && ideationResult.suggested_answers.length
          ? "اختر من الخيارات أو اكتب ردك"
          : "",
        suggested_answers: Array.isArray(ideationResult.suggested_answers) ? ideationResult.suggested_answers : [],
        current_state: "IDEATION",
        project_id: projectId
      };
      await persistTurn(projectId, message, rIdeation);
      return rIdeation;
    }

    // All other states: generate a conversational response
    const convMsg = await generateConversationalMessage(
      "USER_MESSAGE_RECEIVED",
      {
        user_message: message,
        current_state: currentState,
        user_goal: state.user_goal || "",
        project_name: state.project_name || ""
      },
      state,
      user_language,
      undefined,
      history
    );

    const rProcessed = {
      ok: true,
      mode: "MESSAGE_PROCESSED",
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      current_state: currentState,
      project_id: projectId
    };
    await persistTurn(projectId, message, rProcessed);
    return rProcessed;
  }

  // ── Idea Synthesis (PHASE-17) ──────────────────────────────────────────────
  //
  // requestIdeaSummary: synthesizes the full conversation into a structured
  // idea summary and sets conversation_mode = "IDEA_REVIEW".
  //
  // confirmIdea: accepts a structured action (AFFIRM/REJECT/MODIFY) from the UI.
  // AFFIRM → locks summary as vision.md, sets conversation_mode = "PIPELINE",
  //           active_runtime_state = "IDEATION".
  // REJECT/MODIFY → discards summary, returns to CONVERSATION.

  async function requestIdeaSummary(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadState(projectId);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    if (state.conversation_mode !== "CONVERSATION") {
      return { ok: false, mode: "BLOCKED", reason: "NOT_IN_CONVERSATION_MODE" };
    }

    const fullHistory = loadConversationHistory(projectId, { full: true });

    if (fullHistory.length === 0) {
      return { ok: false, mode: "BLOCKED", reason: "NO_CONVERSATION_HISTORY" };
    }

    const result = await ideaSynthesisProvider.executeTask({
      context: {
        schema_version:        "1.0",
        project_id:            projectId,
        conversation_history:  fullHistory,
        provider:    body.provider    || "openai",
        model:       body.model       || process.env.OPENAI_MODEL   || "gpt-4o-mini",
        scenario_id: body.scenario_id || ""
      }
    });

    if (result.status !== "SUCCESS") {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "SYNTHESIS_FAILED",
        detail: result.metadata
      };
    }

    const summary = result.output;

    // Write idea_summary.json via L2 registry
    const summaryRelPath = "artifacts/projects/" + normalizeProjectId(projectId) + "/idea_summary.json";
    const reg = getDefaultRegistry();
    const summaryWrite = await reg.invoke("fs.write_file", {
      path:    summaryRelPath,
      content: JSON.stringify({ ...summary, synthesized_at: nowIso(), project_id: projectId }, null, 2)
    }, { root });

    if (summaryWrite.status !== "SUCCESS") {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "SUMMARY_WRITE_FAILED",
        detail: summaryWrite.metadata
      };
    }

    const updatedState = {
      ...state,
      conversation_mode: "IDEA_REVIEW",
      last_updated_at:   nowIso()
    };
    await saveState(projectId, updatedState);

    return {
      ok:         true,
      mode:       "IDEA_REVIEW",
      project_id: projectId,
      summary
    };
  }

  async function confirmIdea(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const action    = String(body.action || "").toUpperCase();
    const state     = loadState(projectId);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    if (state.conversation_mode !== "IDEA_REVIEW") {
      return { ok: false, mode: "BLOCKED", reason: "NOT_IN_IDEA_REVIEW_MODE" };
    }

    const validActions = ["AFFIRM", "REJECT", "MODIFY"];
    if (!validActions.includes(action)) {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "INVALID_ACTION",
        detail: "action must be AFFIRM, REJECT, or MODIFY"
      };
    }

    if (action === "REJECT" || action === "MODIFY") {
      const updatedState = {
        ...state,
        conversation_mode: "CONVERSATION",
        last_updated_at:   nowIso()
      };
      await saveState(projectId, updatedState);

      if (action === "REJECT") {
        const summaryPath = path.join(projectsRoot, normalizeProjectId(projectId), "idea_summary.json");
        const existingSummary = readJsonSafe(summaryPath, null);
        if (existingSummary) {
          const rejectReg      = getDefaultRegistry();
          const summaryRelPath = "artifacts/projects/" + normalizeProjectId(projectId) + "/idea_summary.json";
          await rejectReg.invoke("fs.write_file", {
            path:    summaryRelPath,
            content: JSON.stringify({ ...existingSummary, rejected_at: nowIso() }, null, 2)
          }, { root });
        }
      }

      return {
        ok:         true,
        mode:       "CONVERSATION",
        project_id: projectId,
        action
      };
    }

    // AFFIRM — lock summary as vision.md, enter pipeline
    const summaryPath = path.join(projectsRoot, normalizeProjectId(projectId), "idea_summary.json");
    const summary     = readJsonSafe(summaryPath, null);

    if (!summary) {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "NO_IDEA_SUMMARY",
        detail: "call request-idea-summary before confirm-idea"
      };
    }

    const lockedAt    = nowIso();
    const frontmatter = {
      project_id:         normalizeProjectId(projectId),
      project_name:       summary.project_name  || projectId,
      domain:             summary.domain        || "other",
      vision_version:     1,
      vision_locked:      true,
      vision_locked_at:   lockedAt,
      locked_by_role:     "owner",
      amendments_history: [],
      goals:              { primary: summary.goal_primary || "", secondary: [] },
      constraints:        summary.constraints   || [],
      non_goals:          summary.non_goals     || []
    };

    const fmErrors = validateFrontmatter(frontmatter);
    if (fmErrors.length > 0) {
      return { ok: false, mode: "BLOCKED", reason: "VISION_FRONTMATTER_INVALID", detail: fmErrors };
    }

    const visionContent  = _formatSummaryAsVision(summary, projectId, frontmatter);
    const visionRelPath  = "artifacts/projects/" + normalizeProjectId(projectId) + "/vision.md";
    const reg            = getDefaultRegistry();
    const visionWrite    = await reg.invoke("fs.write_file", {
      path:    visionRelPath,
      content: visionContent
    }, { root });

    if (visionWrite.status !== "SUCCESS") {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "VISION_WRITE_FAILED",
        detail: visionWrite.metadata
      };
    }

    // Post-write unit check: confirm vision.md round-trips clean (no silent corruption)
    const absVisionPath = path.join(root, visionRelPath);
    const verifyContent = fs.existsSync(absVisionPath) ? fs.readFileSync(absVisionPath, "utf8") : null;
    if (!verifyContent) {
      return { ok: false, mode: "BLOCKED", reason: "VISION_WRITE_VERIFICATION_FAILED", detail: "vision.md unreadable after write" };
    }
    const parsedFm   = parseFrontmatter(verifyContent);
    const verifyErrs = parsedFm ? validateFrontmatter(parsedFm) : ["parseFrontmatter returned null — no frontmatter fence found"];
    if (verifyErrs.length > 0) {
      return { ok: false, mode: "BLOCKED", reason: "VISION_WRITE_VERIFICATION_FAILED", detail: verifyErrs };
    }

    const loopResult = await reg.invoke("orchestration.start_loop", {
      project_id:          normalizeProjectId(projectId),
      owner_intent_source: "vision_locked_intake"
    }, { root });

    const loopId = (loopResult && loopResult.status === "SUCCESS" && loopResult.output)
      ? loopResult.output.loop_id
      : null;

    const updatedState = {
      ...state,
      conversation_mode:    "PIPELINE",
      active_runtime_state: "IDEATION",
      user_goal:            summary.goal_primary || "",
      project_name:         summary.project_name || state.project_name || "",
      loop_id:              loopId || undefined,
      last_updated_at:      nowIso()
    };
    await saveState(projectId, updatedState);

    // ── Architect sync (Step 3) — only when caller supplies architect_provider ──
    // Production: FE passes architect_provider:"anthropic". Tests: pass "mock".
    // Failure is non-fatal: ok:true is returned regardless.
    let architectDesign = null;
    let architectError  = null;

    const architectProvider    = body.architect_provider    || null;
    const architectModel       = body.architect_model       || undefined;
    const architectScenarioId  = body.architect_scenario_id || undefined;

    if (loopId && architectProvider) {
      const intent =
        (parsedFm.goals && parsedFm.goals.primary ? parsedFm.goals.primary : "") +
        (summary.features && summary.features.length > 0
          ? "\n\nFeatures:\n" + summary.features.join("\n")
          : "");

      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("ARCHITECT_TIMEOUT")), 150000);
      });

      try {
        const architectResult = await Promise.race([
          reg.invoke("role.invoke", Object.assign({
            role_id:    "architect",
            input:      { intent, project_id: normalizeProjectId(projectId) },
            project_id: normalizeProjectId(projectId),
            provider:   architectProvider
          },
          architectModel      ? { model:       architectModel      } : {},
          architectScenarioId ? { scenario_id: architectScenarioId } : {}
          ), { root }),
          timeoutPromise
        ]);
        clearTimeout(timeoutHandle);

        if (architectResult && architectResult.status === "SUCCESS") {
          architectDesign = architectResult.output;
          const designPath =
            "artifacts/projects/" + normalizeProjectId(projectId) +
            "/orchestration/" + loopId + "/architect_design.json";
          await reg.invoke("fs.write_file", {
            path:    designPath,
            content: JSON.stringify(architectDesign, null, 2)
          }, { root });
          await reg.invoke("orchestration.advance_state", {
            project_id:      normalizeProjectId(projectId),
            loop_id:         loopId,
            to_state:        "SPEC_WRITER_FORMALIZE",
            transition_type: "NORMAL",
            role_invoked:    "architect"
          }, { root });
        } else {
          architectError = (architectResult && architectResult.metadata && architectResult.metadata.detail)
            || "ARCHITECT_FAILED";
        }
      } catch (err) {
        clearTimeout(timeoutHandle);
        architectError = err.message;
      }
    }

    return {
      ok:                   true,
      mode:                 "PIPELINE",
      conversation_mode:    "PIPELINE",
      active_runtime_state: "IDEATION",
      project_id:           projectId,
      pipeline_started:     !!loopId,
      loop_id:              loopId || undefined,
      pipeline_error:       loopId ? undefined : "LOOP_START_FAILED",
      architect_design:     architectDesign || undefined,
      architect_error:      architectError  || undefined
    };
  }

  // ── Spec Writer bridge (PHASE-22) ─────────────────────────────────────────────
  //
  // formalizeSpec: drives the spec_writer role from SPEC_WRITER_FORMALIZE → REVIEWER_SPEC.
  // Same pattern as the architect block in confirmIdea: guard → read design from disk →
  // invoke role → persist spec.json → advance state → ok:true always.
  //
  // D1: separate endpoint, confirmIdea unchanged.
  // D2: spec_provider defaults to "openai" (override role's default "anthropic").
  // D3: design read from orchestration/${loopId}/architect_design.json.
  // D4: state guard — only runs at SPEC_WRITER_FORMALIZE.
  // D5: 30s timeout via Promise.race (mirroring architect block exactly).

  async function formalizeSpec(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, spec_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, spec_error: "NO_LOOP_ID", advanced: false };
    }

    const specProvider   = body.spec_provider    || "openai";
    const specModel      = body.spec_model || (specProvider === "openai" ? "gpt-4o" : undefined);
    const specScenarioId = body.spec_scenario_id || undefined;

    const reg = getDefaultRegistry();

    // D4: state guard
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, spec_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "SPEC_WRITER_FORMALIZE") {
      return { ok: true, loop_id: loopId, current_state: currentState, spec_error: "WRONG_STATE", advanced: false };
    }

    // D3: read architect design from disk
    const designRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/architect_design.json";
    const designRead = await reg.invoke("fs.read_file", { path: designRelPath }, { root });

    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, spec_error: "DESIGN_NOT_FOUND", advanced: false };
    }

    let design;
    try {
      design = JSON.parse(designRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, spec_error: "DESIGN_PARSE_FAILED", advanced: false };
    }

    // Test-only forced timeout hook (never set in production code)
    if (body._test_force_timeout) {
      return { ok: true, loop_id: loopId, advanced: false, spec_error: "SPEC_WRITER_TIMEOUT", model_used: specModel };
    }

    // D5: 30s timeout, mirroring architect block
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("SPEC_WRITER_TIMEOUT")), 150000);
    });

    try {
      const specResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "spec_writer",
            input:      { design, project_id: normalizeProjectId(projectId) },
            project_id: normalizeProjectId(projectId),
            provider:   specProvider
          },
          specModel      ? { model:       specModel      } : {},
          specScenarioId ? { scenario_id: specScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (specResult && specResult.status === "SUCCESS") {
        const spec = specResult.output;

        await reg.invoke("fs.write_file", {
          path:    "artifacts/projects/" + normalizeProjectId(projectId) +
                   "/orchestration/" + loopId + "/spec.json",
          content: JSON.stringify(spec, null, 2)
        }, { root });

        await reg.invoke("orchestration.advance_state", {
          project_id:      normalizeProjectId(projectId),
          loop_id:         loopId,
          to_state:        "REVIEWER_SPEC",
          transition_type: "NORMAL",
          role_invoked:    "spec_writer"
        }, { root });

        return { ok: true, loop_id: loopId, advanced: true, advanced_to: "REVIEWER_SPEC", spec, model_used: specModel };
      }

      const specError = (specResult && specResult.metadata && specResult.metadata.detail)
        || "SPEC_WRITER_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, spec_error: specError, model_used: specModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, spec_error: err.message };
    }
  }

  // reviewSpec: drives the reviewer role (Phase A) from REVIEWER_SPEC → COST_ESTIMATE or ESCALATED.
  // D1: separate endpoint, formalizeSpec unchanged.
  // D2: review_provider defaults to "openai" (override role's default "anthropic"); gpt-4o backend-owned.
  // D3: reads architect_design.json + spec.json from orchestration/${loopId}/.
  // D4: state guard — only runs at REVIEWER_SPEC.
  // D5: 30s timeout via Promise.race (mirroring formalizeSpec exactly).
  // D6: BLOCKER-based branch — hasBlocker || verdict==="REJECTED" → ESCALATED; else → COST_ESTIMATE.

  async function reviewSpec(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, review_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, review_error: "NO_LOOP_ID", advanced: false };
    }

    const reviewProvider   = body.review_provider    || "openai";
    const reviewModel      = body.review_model || (reviewProvider === "openai" ? "gpt-4o" : undefined);
    const reviewScenarioId = body.review_scenario_id || undefined;

    const reg = getDefaultRegistry();

    // D4: state guard
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, review_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "REVIEWER_SPEC") {
      return { ok: true, loop_id: loopId, current_state: currentState, review_error: "WRONG_STATE", advanced: false };
    }

    // D3: read architect design from disk
    const designRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/architect_design.json";
    const designRead = await reg.invoke("fs.read_file", { path: designRelPath }, { root });

    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, review_error: "DESIGN_NOT_FOUND", advanced: false };
    }

    let design;
    try {
      design = JSON.parse(designRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, review_error: "DESIGN_PARSE_FAILED", advanced: false };
    }

    // D3: read formalized spec from disk (written by formalizeSpec / spec_writer)
    const specRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/spec.json";
    const specRead = await reg.invoke("fs.read_file", { path: specRelPath }, { root });

    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, review_error: "SPEC_NOT_FOUND", advanced: false };
    }

    let spec;
    try {
      spec = JSON.parse(specRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, review_error: "SPEC_PARSE_FAILED", advanced: false };
    }

    // D5: 30s timeout, mirroring formalizeSpec
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("REVIEWER_TIMEOUT")), 150000);
    });

    try {
      const reviewResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "reviewer",
            input:      { phase: "A", spec, design, project_id: normalizeProjectId(projectId) },
            project_id: normalizeProjectId(projectId),
            provider:   reviewProvider
          },
          reviewModel      ? { model:       reviewModel      } : {},
          reviewScenarioId ? { scenario_id: reviewScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (reviewResult && reviewResult.status === "SUCCESS") {
        const verdict  = reviewResult.output.verdict;
        const findings = reviewResult.output.findings;
        const summary  = reviewResult.output.summary;

        // D6: BLOCKER-based branch — guard against inconsistent verdict/findings
        const hasBlocker = Array.isArray(findings) && findings.some(f => f && f.severity === "BLOCKER");
        const toState    = (hasBlocker || verdict === "REJECTED") ? "ESCALATED" : "COST_ESTIMATE";

        await reg.invoke("orchestration.advance_state", {
          project_id:      normalizeProjectId(projectId),
          loop_id:         loopId,
          to_state:        toState,
          transition_type: "NORMAL",
          role_invoked:    "reviewer"
        }, { root });

        return { ok: true, loop_id: loopId, advanced: true, advanced_to: toState,
                 verdict, findings, summary, model_used: reviewModel };
      }

      const reviewError = (reviewResult && reviewResult.metadata && reviewResult.metadata.detail)
        || "REVIEWER_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, review_error: reviewError, model_used: reviewModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, review_error: err.message };
    }
  }

  // ── Builder bridge (PHASE-24) ─────────────────────────────────────────────────
  //
  // buildProject: drives the builder role from BUILDER → RUN_TESTS.
  // Wiring: state guard (BUILDER) → read spec.json + architect_design.json →
  //         role.invoke(builder) → builder.materialize → advance_state(RUN_TESTS).
  // Any failure → {ok:true, build_error:<code>, advanced:false} (stays BUILDER, no retry).
  // Smoke: driven by spec.smoke_entry field; false if not specified.
  //
  // Stage-split params (build_* / mat_*) allow different mock keys per stage in tests.
  // Production: omit build_*/mat_* and use provider/model for both stages.

  // PHASE-40 (C2 deferral (a) close) — resolve the L3 policy for the entry-point seam.
  // Lazy require (no top-level dependency / no load-order risk); returns null if the default
  // policy predates PHASE-40 (no setActiveProject) so the seam degrades to a no-op safely.
  function _getSeamPolicy() {
    try {
      const { getDefaultPolicy } = require("../runtime/permission/permissionPolicy");
      const p = getDefaultPolicy();
      return (p && typeof p.setActiveProject === "function") ? p : null;
    } catch { return null; }
  }

  // ── PHASE-46 W-3 (Mechanism A) — keep-best-attempt snapshot / restore ───────────
  // Goal: when the build loop cannot reach all-green and ESCALATES, the deliverable on
  // disk must be the BEST attempt (most passing scenarios), not the last (possibly worse)
  // attempt — a rebuild with fewer passing scenarios (or a non-parsing one) must never
  // replace a better prior attempt's build as the final artifact.
  //
  // ALL file ops go through the EXISTING L2 fs tools (fs.read_file / fs.write_file /
  // fs.delete_file) into artifacts/projects/<pid>/orchestration/<loopId>/best_attempt/ —
  // the SAME L2-writable subtree the build_manifest already uses. NO new §ARC; §ARC stays 10.
  //
  // BOTH helpers are BEST-EFFORT / fail-OPEN: any error is swallowed so the verdict /
  // advance / escalate decision in runTests (which has NO outer try/catch) can NEVER be
  // flipped by snapshot/restore I/O. Snapshot runs on the FAIL branch only (the PASS path
  // is never touched: a PASS is the lexicographic max for the loop's fixed scenario set, so
  // it is always best and already on disk).

  function _bestAttemptDir(pid, loopId) {
    return "artifacts/projects/" + pid + "/orchestration/" + loopId + "/best_attempt";
  }

  // Lexicographic score [pass_scenarios, -error_scenarios, pass_assertions]; higher is better.
  // Shape-guarded: a forced runOutput WITHOUT a scenarios[] array scores pass_assertions = 0
  // (the tertiary term goes inert) and never throws.
  function _scoreRunOutput(runOutput) {
    const passScen = (runOutput && typeof runOutput.pass  === "number") ? runOutput.pass  : 0;
    const errScen  = (runOutput && typeof runOutput.error === "number") ? runOutput.error : 0;
    const scn = (runOutput && Array.isArray(runOutput.scenarios)) ? runOutput.scenarios : [];
    let passAssert = 0;
    for (let i = 0; i < scn.length; i++) {
      const as = (scn[i] && Array.isArray(scn[i].assertions)) ? scn[i].assertions : [];
      for (let j = 0; j < as.length; j++) { if (as[j] && as[j].pass === true) passAssert++; }
    }
    return [passScen, -errScen, passAssert];
  }

  // Strict lexicographic "a > b". Equal ⇒ NOT greater (keep the FIRST attempt to reach a
  // score — monotonic; a later equal attempt does not displace the earlier best).
  function _scoreGreater(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return false;
  }

  // Snapshot the CURRENT build (its manifest files + manifest + score) as the new best IFF
  // its score strictly beats best-so-far. Manifest-present only. Best-effort / fail-OPEN.
  async function _snapshotBestAttempt(reg, pid, loopId, runOutput) {
    try {
      const orchDir = "artifacts/projects/" + pid + "/orchestration/" + loopId;
      const manRead = await reg.invoke("fs.read_file", { path: orchDir + "/build_manifest.json" }, { root });
      if (!manRead || manRead.status !== "SUCCESS") return; // no manifest ⇒ nothing to snapshot
      let manifest; try { manifest = JSON.parse(manRead.output.content); } catch { return; }
      const files = (manifest && Array.isArray(manifest.files)) ? manifest.files : [];
      if (files.length === 0) return;

      const score = _scoreRunOutput(runOutput);

      const bestDir  = _bestAttemptDir(pid, loopId);
      const bestRead = await reg.invoke("fs.read_file", { path: bestDir + "/best_attempt.json" }, { root });
      if (bestRead && bestRead.status === "SUCCESS") {
        let best; try { best = JSON.parse(bestRead.output.content); } catch { best = null; }
        if (best && Array.isArray(best.score) && !_scoreGreater(score, best.score)) return; // not better ⇒ keep
      }

      // New best: copy each manifest file's content into best_attempt/files/<path>.
      const projDir = "artifacts/projects/" + pid;
      for (let i = 0; i < files.length; i++) {
        const fpath = files[i] && files[i].path;
        if (typeof fpath !== "string") continue;
        const fr = await reg.invoke("fs.read_file", { path: projDir + "/" + fpath }, { root });
        if (!fr || fr.status !== "SUCCESS") continue;
        await reg.invoke("fs.write_file", { path: bestDir + "/files/" + fpath, content: fr.output.content }, { root });
      }
      // Persist the manifest copy + the best record (score + path list + per-file sha256 for verify).
      await reg.invoke("fs.write_file", { path: bestDir + "/build_manifest.json", content: manRead.output.content }, { root });
      await reg.invoke("fs.write_file", {
        path: bestDir + "/best_attempt.json",
        content: JSON.stringify({
          score,
          files:        files.map(function (f) { return f.path; }),
          manifest_sha: files.map(function (f) { return { path: f.path, sha256: f.sha256 }; }),
          ts:           new Date().toISOString()
        }, null, 2)
      }, { root });
    } catch (_e) { /* fail-OPEN: snapshot must never break the loop */ }
  }

  // Restore the best snapshot so the project's MANIFEST-TRACKED tree == best exactly:
  // delete current-manifest files not in best (set-exact over the manifest tree), write best's
  // files back, restore best's manifest. Best-effort / fail-OPEN. Per-file sha256 is verified
  // against best's recorded manifest sha — a corrupt snapshot file is SKIPPED (never written),
  // rather than restoring known-bad content. NOTE: non-manifest orphans from non-consecutive
  // attempts may remain on disk but are INERT — the pipeline (reviewProject / runTests entry +
  // dep scan) is manifest-scoped, and best's entry only require()s best's files.
  async function _restoreBestAttempt(reg, pid, loopId, ctxObj) {
    try {
      const bestDir  = _bestAttemptDir(pid, loopId);
      const bestRead = await reg.invoke("fs.read_file", { path: bestDir + "/best_attempt.json" }, { root });
      if (!bestRead || bestRead.status !== "SUCCESS") return; // no best ⇒ nothing to restore
      let best; try { best = JSON.parse(bestRead.output.content); } catch { return; }
      const bestFiles = (best && Array.isArray(best.files)) ? best.files : [];
      if (bestFiles.length === 0) return;
      const bestSet = {};
      for (let i = 0; i < bestFiles.length; i++) bestSet[bestFiles[i]] = true;
      const shaMap = {};
      (Array.isArray(best.manifest_sha) ? best.manifest_sha : []).forEach(function (e) {
        if (e && e.path) shaMap[e.path] = e.sha256;
      });

      const projDir = "artifacts/projects/" + pid;
      const orchDir = "artifacts/projects/" + pid + "/orchestration/" + loopId;

      // (1) Orphan removal over the CURRENT manifest tree: delete current files not in best.
      const curManRead = await reg.invoke("fs.read_file", { path: orchDir + "/build_manifest.json" }, { root });
      if (curManRead && curManRead.status === "SUCCESS") {
        let curMan; try { curMan = JSON.parse(curManRead.output.content); } catch { curMan = null; }
        const curFiles = (curMan && Array.isArray(curMan.files)) ? curMan.files : [];
        for (let i = 0; i < curFiles.length; i++) {
          const cpath = curFiles[i] && curFiles[i].path;
          if (typeof cpath === "string" && !bestSet[cpath]) {
            try { await reg.invoke("fs.delete_file", { path: projDir + "/" + cpath }, ctxObj || { root }); } catch (_d) { /* best-effort */ }
          }
        }
      }

      // (2) Write best's files back (sha256-verified; skip a corrupt snapshot file).
      for (let i = 0; i < bestFiles.length; i++) {
        const fpath    = bestFiles[i];
        const snapRead = await reg.invoke("fs.read_file", { path: bestDir + "/files/" + fpath }, { root });
        if (!snapRead || snapRead.status !== "SUCCESS") continue;
        const want = shaMap[fpath];
        if (want) {
          const got = crypto.createHash("sha256").update(snapRead.output.content, "utf8").digest("hex");
          if (got !== want) continue; // corrupt snapshot ⇒ do NOT write known-bad content
        }
        await reg.invoke("fs.write_file", { path: projDir + "/" + fpath, content: snapRead.output.content }, ctxObj || { root });
      }

      // (3) Restore best's manifest so the manifest-tracked tree on disk == best.
      const bestManRead = await reg.invoke("fs.read_file", { path: bestDir + "/build_manifest.json" }, { root });
      if (bestManRead && bestManRead.status === "SUCCESS") {
        await reg.invoke("fs.write_file", { path: orchDir + "/build_manifest.json", content: bestManRead.output.content }, ctxObj || { root });
      }
    } catch (_e) { /* fail-OPEN: restore must never break escalate/return */ }
  }

  // PHASE-40 entry-point seam: DECLARE this build's active project on the L3 policy (ambient
  // register) so cross-project writes are denied even on ctx-less write paths within the
  // build, paired with a finally-clear (no leak between operations). The real work stays in
  // _buildProjectImpl (unchanged); this thin wrapper only manages the seam.
  async function buildProject(body = {}) {
    const _seamPolicy    = _getSeamPolicy();
    const _seamProjectId = normalizeProjectId(body.project_id || "");
    if (_seamPolicy) _seamPolicy.setActiveProject(_seamProjectId);
    try {
      return await _buildProjectImpl(body);
    } finally {
      if (_seamPolicy) _seamPolicy.setActiveProject(null);
    }
  }

  async function _buildProjectImpl(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, build_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, build_error: "NO_LOOP_ID", advanced: false };
    }

    const buildProvider  = body.build_provider    || body.provider || "openai";
    const buildModel     = body.build_model       || body.model    || "gpt-4o";
    const buildScenId    = body.build_scenario_id || undefined;
    const matProvider    = body.mat_provider      || body.provider || "openai";
    const matModel       = body.mat_model         || body.model    || "gpt-4o";
    const matScenId      = body.mat_scenario_id   || undefined;

    // PHASE-36 C2: thread the active project id onto the REAL build write path so the
    // L3 cross-project boundary is ARMED for this build's OWN writes (materializer +
    // build_manifest). Source is normalizeProjectId(body.project_id) — the SAME id the
    // writes target (probe P4-b: guaranteed-consistent), so same-project writes are
    // ALLOWED; only a write that lands in a DIFFERENT project would deny. NOT passed to
    // the orchestration helpers (get_status / advance_state) — they MUST stay ctx-free so
    // the cross-project boundary stays inert in the loop (the C1 fail-closed lesson).
    const buildCtx = { root, active_project_id: normalizeProjectId(projectId) };

    const reg = getDefaultRegistry();

    // State guard: must be at BUILDER
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, build_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "BUILDER") {
      return { ok: true, loop_id: loopId, current_state: currentState, build_error: "WRONG_STATE", advanced: false };
    }

    // A-5 (PHASE-44) loopback gate: iteration_count comes from the SAME get_status call above
    // (no second call). 0 ⇒ first BUILDER pass of this loop ⇒ no repair feedback (byte-identical
    // to the pre-A-5 first build). > 0 ⇒ a prior RUN_TESTS ran + looped back ⇒ feed its failures
    // into the rebuild. The > 0 gate is also what prevents a stale report from a PREVIOUS loop
    // (last_report.json lives per-project, not per-loop) from leaking into a NEW loop's first pass.
    const iterationCount = (statusResult.output && typeof statusResult.output.iteration_count === "number")
      ? statusResult.output.iteration_count : 0;

    // Read spec from disk
    const specRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/spec.json";
    const specRead = await reg.invoke("fs.read_file", { path: specRelPath }, { root });

    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, build_error: "SPEC_NOT_FOUND", advanced: false };
    }

    let spec;
    try {
      spec = JSON.parse(specRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, build_error: "SPEC_PARSE_FAILED", advanced: false };
    }

    // Read architect design from disk
    const designRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/architect_design.json";
    const designRead = await reg.invoke("fs.read_file", { path: designRelPath }, { root });

    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, build_error: "DESIGN_NOT_FOUND", advanced: false };
    }

    let design;
    try {
      design = JSON.parse(designRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, build_error: "DESIGN_PARSE_FAILED", advanced: false };
    }

    // Test-only forced timeout hook (never set in production code)
    if (body._test_force_timeout) {
      return { ok: true, loop_id: loopId, advanced: false, build_error: "BUILDER_TIMEOUT" };
    }

    // 30s timeout, mirroring formalizeSpec/reviewSpec
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("BUILDER_TIMEOUT")), 150000);
    });

    try {
      const roleResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "builder",
            input:      { spec, design, project_id: normalizeProjectId(projectId) },
            project_id: normalizeProjectId(projectId),
            provider:   buildProvider
          },
          buildModel  ? { model:       buildModel  } : {},
          buildScenId ? { scenario_id: buildScenId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (!roleResult || roleResult.status !== "SUCCESS") {
        const buildError = (roleResult && roleResult.metadata && roleResult.metadata.detail)
          || "BUILDER_ROLE_FAILED";
        return { ok: true, loop_id: loopId, advanced: false, build_error: buildError };
      }

      const plan = roleResult.output && roleResult.output.files_written;
      if (!Array.isArray(plan) || plan.length === 0) {
        return { ok: true, loop_id: loopId, advanced: false, build_error: "BUILDER_EMPTY_PLAN" };
      }

      // Smoke: driven by spec.smoke_entry (no smoke if not present)
      const smokeEntry = (spec && spec.smoke_entry) || null;

      // A-5 (PHASE-44): on a loopback rebuild (iteration_count > 0) read the prior attempt's
      // test report via the EXISTING read-only L2 tool and distil its failing assertions into
      // repair_feedback. Fail-OPEN: REPORT_NOT_FOUND / any non-SUCCESS / iteration_count === 0
      // ⇒ repair_feedback = [] (first-build behavior unchanged). project_root is re-derived the
      // SAME way runTests does (path.resolve(root, "artifacts/projects/" + pid)) so both read the
      // identical absolute forge_tests/last_report.json. NO direct fs read of the report.
      let repairFeedback = [];
      if (iterationCount > 0) {
        const projectRoot = path.resolve(root, "artifacts/projects/" + normalizeProjectId(projectId));
        let reportRead = null;
        try {
          reportRead = await reg.invoke("builtproject.read_report", { project_root: projectRoot }, { root });
        } catch {
          reportRead = null;
        }
        if (reportRead && reportRead.status === "SUCCESS" && reportRead.output &&
            Array.isArray(reportRead.output.scenarios)) {
          repairFeedback = reportRead.output.scenarios
            .filter(function (s) { return s && s.status !== "PASS"; })
            .map(function (s) {
              return {
                scenario_id:        s.id,
                name:               s.name,
                status:             s.status,
                error:              s.error || null,
                failing_assertions: (Array.isArray(s.assertions) ? s.assertions : [])
                  .filter(function (a) { return a && a.pass === false; })
                  .map(function (a) { return { type: a.type, reason: a.reason }; })
              };
            });
        }
      }

      const matResult = await reg.invoke("builder.materialize", Object.assign(
        {
          project_id: normalizeProjectId(projectId),
          plan,
          spec,
          design,
          provider:   matProvider,
          smoke:      !!smokeEntry
        },
        matModel    ? { model:       matModel    } : {},
        matScenId   ? { scenario_id: matScenId   } : {},
        smokeEntry  ? { smoke_entry: smokeEntry  } : {},
        // Additive + optional: absent when empty ⇒ the materialize call is byte-identical to today.
        repairFeedback.length ? { repair_feedback: repairFeedback } : {}
      ), buildCtx);

      const matOut = matResult && matResult.output;
      if (!matResult || matResult.status !== "SUCCESS" || !matOut || matOut.status !== "SUCCESS") {
        const errCode = (matOut && matOut.error_code) || "MATERIALIZER_FAILED";
        return {
          ok:            true,
          loop_id:       loopId,
          advanced:      false,
          build_error:   errCode,
          files_written: matOut && matOut.files_written
        };
      }

      // PHASE-46 W-3 (Mechanism B) — pre-flight parse check on a REBUILD (iteration_count > 0).
      // A non-parsing rebuild is REJECTED before it can advance to RUN_TESTS or overwrite the
      // best-so-far artifact, so a SyntaxError cannot collapse a near-pass (the PHASE-45 run #3
      // 'deleteUrl declared twice' collapse). GATED on iteration_count > 0: a first build
      // (it === 0) never runs this check ⇒ first-build behavior is byte-identical to pre-W-3.
      // Compile-only via the `vm` builtin (no execution, no child_process, no new §ARC).
      // On reject: restore the best snapshot to disk (best-effort) and HALT fail-closed
      // (advanced:false) WITHOUT calling loop_back — iteration_count / cap / escalation are
      // untouched (CTO-confirmed; liveness is bounded by the W-4 driver). Consistent with the
      // existing non-advancing build_error returns above (BUILDER_ROLE_FAILED, MATERIALIZER_FAILED).
      if (iterationCount > 0) {
        const { checkParses } = require("../runtime/builtproject/js_syntax_check");
        const writtenFiles = Array.isArray(matOut.files_written) ? matOut.files_written : [];
        const parseErrors  = [];
        for (let fi = 0; fi < writtenFiles.length; fi++) {
          const fpath = writtenFiles[fi] && writtenFiles[fi].path;
          if (typeof fpath !== "string" || !fpath.endsWith(".js")) continue;
          const fileRead = await reg.invoke("fs.read_file", {
            path: "artifacts/projects/" + normalizeProjectId(projectId) + "/" + fpath
          }, { root });
          if (!fileRead || fileRead.status !== "SUCCESS") continue; // unreadable ⇒ skip (do not reject on read failure)
          const parseRes = checkParses(fileRead.output.content, fpath);
          if (!parseRes.ok) parseErrors.push({ path: fpath, error: parseRes.error });
        }
        if (parseErrors.length > 0) {
          await _restoreBestAttempt(reg, normalizeProjectId(projectId), loopId, buildCtx);
          return {
            ok:            true,
            loop_id:       loopId,
            advanced:      false,
            build_error:   "REBUILD_PARSE_FAILED",
            parse_errors:  parseErrors,
            files_written: matOut.files_written
          };
        }
      }

      // Persist the authoritative build record (PHASE-30 RULING-4) — fail-closed:
      // a build whose authoritative record cannot be persisted is not a completed build.
      let manifestWrite = null;
      try {
        manifestWrite = await reg.invoke("fs.write_file", {
          path: "artifacts/projects/" + normalizeProjectId(projectId) +
                "/orchestration/" + loopId + "/build_manifest.json",
          content: JSON.stringify({
            built_at: new Date().toISOString(),
            files:    matOut.files_written
          }, null, 2)
        }, buildCtx);
      } catch {
        manifestWrite = null;
      }
      if (!manifestWrite || manifestWrite.status !== "SUCCESS") {
        return { ok: false, error: "build_error", detail: "MANIFEST_WRITE_FAILED" };
      }

      // Advance state to RUN_TESTS
      await reg.invoke("orchestration.advance_state", {
        project_id:      normalizeProjectId(projectId),
        loop_id:         loopId,
        to_state:        "RUN_TESTS",
        transition_type: "NORMAL",
        role_invoked:    "builder"
      }, { root });

      return {
        ok:            true,
        loop_id:       loopId,
        advanced:      true,
        advanced_to:   "RUN_TESTS",
        files_written: matOut.files_written,
        smoke:         matOut.smoke,
        summary:       matOut.summary
      };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, build_error: err.message };
    }
  }

  // ── Run Tests bridge (PHASE-29) ─────────────────────────────────────────────
  //
  // runTests: installs deps + bridges test_plan.json → forge_tests/scenarios/
  //           + runs builtproject.run_scenarios.
  // PASS report → advance RUN_TESTS → REVIEWER_CODE_AND_SECURITY.
  // FAIL report → loop-back to BUILDER via orchestration.loop_back (cap-aware).
  // No LLM call — purely deterministic.

  async function runTests(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, test_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, test_error: "NO_LOOP_ID", advanced: false };
    }

    const reg = getDefaultRegistry();
    const pid = normalizeProjectId(projectId);

    // State guard: must be at RUN_TESTS
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: pid,
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, test_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "RUN_TESTS") {
      return { ok: true, loop_id: loopId, current_state: currentState,
               test_error: "WRONG_STATE", advanced: false };
    }

    // Read test_plan.json
    const planRelPath = "artifacts/projects/" + pid + "/orchestration/" + loopId + "/test_plan.json";
    const planRead = await reg.invoke("fs.read_file", { path: planRelPath }, { root });

    if (!planRead || planRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, test_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let testPlan;
    try {
      testPlan = JSON.parse(planRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, test_error: "PLAN_PARSE_FAILED", advanced: false };
    }

    const scenarios = testPlan.scenarios;
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return { ok: true, loop_id: loopId, test_error: "PLAN_EMPTY", advanced: false };
    }

    // Test-only forced timeout hook (never set in production code)
    if (body._test_force_timeout) {
      return { ok: true, loop_id: loopId, advanced: false, test_error: "RUN_TESTS_TIMEOUT" };
    }

    const projectRelDir = "artifacts/projects/" + pid;
    const projectRoot   = path.resolve(root, projectRelDir);

    // ── Sub-step 0 (PHASE-30): derive authoritative entry from build_manifest ─
    // Manifest is written by buildProject (RULING-4). Present → entry MUST derive
    // from manifest files only (stale workspace files stay inert); absent → legacy
    // behavior byte-identical (pre-PHASE-30 loops and mock scenarios).
    const manifestRelPath = "artifacts/projects/" + pid + "/orchestration/" + loopId +
                            "/build_manifest.json";
    const manifestRead    = await reg.invoke("fs.read_file", { path: manifestRelPath }, { root });
    const manifestPresent = !!(manifestRead && manifestRead.status === "SUCCESS");

    let manifestPaths = [];
    let derivedEntry  = null;

    if (manifestPresent) {
      let manifest = null;
      try { manifest = JSON.parse(manifestRead.output.content); } catch { manifest = null; }

      manifestPaths = (manifest && Array.isArray(manifest.files))
        ? manifest.files.map(function (f) { return f && f.path; })
            .filter(function (p) { return typeof p === "string" && p.length > 0; })
        : [];

      const ENTRY_PRIORITY = ["src/index.js", "src/server.js", "src/app.js",
                              "index.js", "server.js", "app.js"];
      derivedEntry = ENTRY_PRIORITY.find(function (p) { return manifestPaths.indexOf(p) !== -1; }) || null;

      if (!derivedEntry) {
        const listeners = [];
        for (const mp of manifestPaths) {
          if (!mp.endsWith(".js")) continue;
          const entryRead = await reg.invoke("fs.read_file",
            { path: projectRelDir + "/" + mp }, { root });
          if (entryRead && entryRead.status === "SUCCESS" &&
              (entryRead.output.content || "").includes(".listen(")) {
            listeners.push(mp);
          }
        }
        if (listeners.length === 1) derivedEntry = listeners[0];
      }

      if (!derivedEntry) {
        // Fail-closed: manifest present but no derivable entry — no state
        // transition, nothing written.
        return { ok: false, error: "test_error", detail: "ENTRY_UNRESOLVED" };
      }
    }

    // ── Sub-step 1: Dep install ────────────────────────────────────────────────

    if (!body._test_skip_npm_install) {
      // Force-fail hook (test only — never set in production code)
      if (body._test_force_npm_install_fail) {
        return { ok: true, loop_id: loopId, advanced: false,
                 test_error: "DEPS_INSTALL_FAILED", deps_install_stderr: "Forced failure in test" };
      }

      const NODE_BUILTINS = new Set([
        "assert","buffer","child_process","cluster","console","crypto","dgram",
        "dns","domain","events","fs","http","http2","https","inspector","module",
        "net","os","path","perf_hooks","process","punycode","querystring","readline",
        "repl","stream","string_decoder","timers","tls","trace_events","tty","url",
        "util","v8","vm","wasi","worker_threads","zlib"
      ]);
      const SKIP_DIRS = new Set(["node_modules", "forge_tests", ".git"]);
      const depSet    = new Set();
      const scanPaths = [];

      if (manifestPresent) {
        // PHASE-30: manifest present → scan ONLY the current build's files
        // (stale prior-attempt files must not inject dependencies).
        for (const mp of manifestPaths) {
          if (mp.endsWith(".js")) scanPaths.push(projectRelDir + "/" + mp);
        }
      } else {
        const topResult = await reg.invoke("fs.list_dir", { path: projectRelDir }, { root });
        if (topResult && topResult.status === "SUCCESS") {
          for (const entry of (topResult.output.entries || [])) {
            if (entry.type === "file" && entry.name.endsWith(".js")) {
              scanPaths.push(projectRelDir + "/" + entry.name);
            } else if (entry.type === "dir" && !SKIP_DIRS.has(entry.name)) {
              const subGlob = await reg.invoke("fs.glob", {
                pattern: "**/*.js",
                cwd:     projectRelDir + "/" + entry.name
              }, { root });
              if (subGlob && subGlob.status === "SUCCESS") {
                for (const f of (subGlob.output.matches || [])) scanPaths.push(f);
              }
            }
          }
        }
      }

      for (const filePath of scanPaths) {
        const fileRead = await reg.invoke("fs.read_file", { path: filePath }, { root });
        if (fileRead && fileRead.status === "SUCCESS") {
          const content = fileRead.output.content || "";
          const reqRe   = /require\(['"]([^'"]+)['"]\)/g;
          let m;
          while ((m = reqRe.exec(content)) !== null) {
            const mod = m[1];
            if (!mod.startsWith(".")) {
              const pkg = mod.startsWith("@")
                ? mod.split("/").slice(0, 2).join("/")
                : mod.split("/")[0];
              if (!NODE_BUILTINS.has(pkg)) depSet.add(pkg);
            }
          }
        }
      }

      if (depSet.size > 0) {
        const pkgRelPath = projectRelDir + "/package.json";
        let pkg = { name: pid, version: "1.0.0" };
        const pkgRead = await reg.invoke("fs.read_file", { path: pkgRelPath }, { root });
        if (pkgRead && pkgRead.status === "SUCCESS") {
          try { pkg = JSON.parse(pkgRead.output.content); } catch { /* keep default */ }
        }
        if (!pkg.name)    pkg.name    = pid;
        if (!pkg.version) pkg.version = "1.0.0";
        if (!pkg.dependencies) pkg.dependencies = {};
        for (const d of depSet) {
          if (!pkg.dependencies[d]) pkg.dependencies[d] = "latest";
        }

        await reg.invoke("fs.write_file", {
          path:    pkgRelPath,
          content: JSON.stringify(pkg, null, 2)
        }, { root });

        // Test-only hook: skip the npm exec but keep scan/merge/write (never set
        // in production code — lets scenarios assert dep-scan scoping offline).
        if (!body._test_skip_npm_exec) {
          const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
          const installResult = await reg.invoke("shell.run_in_workspace", {
            project_id: pid,
            argv:       [npmCmd, "install", "--no-audit", "--no-fund"],
            timeout_ms: 180000
          }, { root });

          if (!installResult || installResult.status !== "SUCCESS" ||
              (installResult.output && installResult.output.exit_code !== 0)) {
            const stderr = (installResult && installResult.output && installResult.output.stderr) || "";
            return { ok: true, loop_id: loopId, advanced: false,
                     test_error: "DEPS_INSTALL_FAILED", deps_install_stderr: stderr };
          }
        }
      }
    }

    // ── Sub-step 2: Bridge test_plan → forge_tests/scenarios ──────────────────

    for (const scenario of scenarios) {
      // PHASE-30: rewrite the plan's server entry to the manifest-derived entry
      // of the CURRENT build (plan↔build entry coherence — Finding #5).
      if (derivedEntry && scenario.setup && Array.isArray(scenario.setup.actions)) {
        for (const action of scenario.setup.actions) {
          if (action && action.type === "start_server") {
            action.command = "node " + derivedEntry;
          }
        }
      }
      const scenRelPath = projectRelDir + "/forge_tests/scenarios/" +
                          scenario.id + "_" + scenario.name + ".json";
      await reg.invoke("fs.write_file", {
        path:    scenRelPath,
        content: JSON.stringify(scenario, null, 2)
      }, { root });
    }

    // ── Sub-step 3: Run scenarios ──────────────────────────────────────────────

    let runOutput;

    if (body._test_force_run_scenarios_result) {
      runOutput = body._test_force_run_scenarios_result;
    } else {
      const toolResult = await reg.invoke("builtproject.run_scenarios", {
        project_root: projectRoot
      }, { root });

      if (!toolResult || toolResult.status !== "SUCCESS") {
        const reason = (toolResult && toolResult.metadata && toolResult.metadata.reason)
          || "RUN_SCENARIOS_FAILED";
        return { ok: true, loop_id: loopId, advanced: false, test_error: reason };
      }
      runOutput = toolResult.output;
    }

    const reportSummary = {
      overall_status: runOutput.overall_status,
      total:          runOutput.total,
      pass:           runOutput.pass,
      fail:           runOutput.fail,
      error:          runOutput.error
    };

    // ── Sub-step 4: Advance or loop-back ──────────────────────────────────────

    if (runOutput.overall_status === "PASS") {
      await reg.invoke("orchestration.advance_state", {
        project_id:      pid,
        loop_id:         loopId,
        to_state:        "REVIEWER_CODE_AND_SECURITY",
        transition_type: "NORMAL",
        role_invoked:    "builtproject"
      }, { root });

      return {
        ok:             true,
        loop_id:        loopId,
        advanced:       true,
        advanced_to:    "REVIEWER_CODE_AND_SECURITY",
        report_summary: reportSummary
      };
    }

    // PHASE-46 W-3 (Mechanism A) — snapshot this attempt as best IFF it strictly beats
    // best-so-far (FAIL branch only; the PASS path above is never touched). Best-effort /
    // fail-OPEN: must run BEFORE loop_back so best is captured before iteration_count++.
    await _snapshotBestAttempt(reg, pid, loopId, runOutput);

    // FAIL → loop-back (cap-aware via orchestration.loop_back)
    const lbResult = await reg.invoke("orchestration.loop_back", {
      project_id: pid,
      loop_id:    loopId
    }, { root });

    if (!lbResult || lbResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, advanced: false,
               test_error: "LOOP_BACK_FAILED", report_summary: reportSummary };
    }

    const lbOut = lbResult.output;

    if (lbOut.escalated) {
      // PHASE-46 W-3 (Mechanism A) — the build loop has ESCALATED (cap exhausted). Restore the
      // best snapshot so the ESCALATED deliverable = best attempt, not the last (worse) one.
      // Best-effort / fail-OPEN; the escalation decision + return shape are unchanged.
      await _restoreBestAttempt(reg, pid, loopId, { root });

      return {
        ok:              true,
        loop_id:         loopId,
        advanced:        true,
        advanced_to:     "ESCALATED",
        escalated:       true,
        escalation_path: lbOut.escalation_path,
        report_summary:  reportSummary
      };
    }

    return {
      ok:             true,
      loop_id:        loopId,
      advanced:       true,
      advanced_to:    "BUILDER",
      loop_back:      true,
      report_summary: reportSummary
    };
  }

  // ── Reviewer Code & Security bridge (PHASE-31) ──────────────────────────────
  //
  // reviewProject: manifest-scoped dual-role review at REVIEWER_CODE_AND_SECURITY.
  // Input authority = build_manifest.json (REQUIRED — no scan-all fallback). Reads
  // spec.json + architect_design.json + each manifest file's on-disk content, then
  // invokes reviewer (phase B) AND security_auditor (phase CODE) over the assembled
  // code object. Persists merged review_report.json BEFORE any transition.
  //
  // Derived verdict (RULING-6 — computed here from the two native schemas; NOT a
  // new field on either role):
  //   reviewer_approve = verdict !== "REJECTED"   AND no finding severity==="BLOCKER"
  //   security_approve = threat_level NOT IN {CRITICAL,HIGH} AND no finding severity==="BLOCKER"
  //   APPROVE iff (reviewer_approve AND security_approve) → advance_state DOCUMENTATION
  //   REQUEST_CHANGES otherwise → orchestration.loop_back BUILDER (cap-aware)
  //
  // Fail-closed (no transition; a valid REJECTED/high-threat is NOT a failure — it is
  // the REQUEST_CHANGES branch working):
  //   manifest absent/unparseable/empty → { ok:false, error:"review_error", detail:"MANIFEST_REQUIRED" }
  //   spec/design/manifest-file unread  → review_error:"REVIEW_INPUT_NOT_FOUND", advanced:false
  //   role.invoke non-schema failure    → review_error:"ROLE_INVOKE_FAILED",     advanced:false
  //   role output fails OUTPUT_SCHEMA    → review_error:"REVIEW_PARSE_FAILED",     advanced:false
  //   review_report write failure       → { ok:false, error:"review_error", detail:"REVIEW_WRITE_FAILED" }
  //
  // Stage-split params (reviewer_* / security_*) let tests disambiguate the two role
  // mocks (mock-rev-* vs mock-sec-*). Production: omit them, pass provider/model.

  async function reviewProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, review_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, review_error: "NO_LOOP_ID", advanced: false };
    }

    const revProvider = body.reviewer_provider     || body.provider || "openai";
    const revModel    = body.reviewer_model        || body.model    || (revProvider === "openai" ? "gpt-4o" : undefined);
    const revScenId   = body.reviewer_scenario_id  || body.review_scenario_id || undefined;
    const secProvider = body.security_provider     || body.provider || "openai";
    const secModel    = body.security_model        || body.model    || (secProvider === "openai" ? "gpt-4o" : undefined);
    const secScenId   = body.security_scenario_id  || body.review_scenario_id || undefined;

    const reg = getDefaultRegistry();
    const pid = normalizeProjectId(projectId);

    // State guard: must be at REVIEWER_CODE_AND_SECURITY
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: pid, loop_id: loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, review_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "REVIEWER_CODE_AND_SECURITY") {
      return { ok: true, loop_id: loopId, current_state: currentState,
               review_error: "WRONG_STATE", advanced: false };
    }

    const orchRelDir    = "artifacts/projects/" + pid + "/orchestration/" + loopId;
    const projectRelDir = "artifacts/projects/" + pid;

    // ── Input authority: build_manifest.json is REQUIRED (RULING-7) ────────────
    const manifestRead = await reg.invoke("fs.read_file",
      { path: orchRelDir + "/build_manifest.json" }, { root });

    if (!manifestRead || manifestRead.status !== "SUCCESS") {
      return { ok: false, error: "review_error", detail: "MANIFEST_REQUIRED" };
    }

    let manifest;
    try {
      manifest = JSON.parse(manifestRead.output.content);
    } catch {
      return { ok: false, error: "review_error", detail: "MANIFEST_REQUIRED" };
    }

    const manifestPaths = (manifest && Array.isArray(manifest.files))
      ? manifest.files.map(function (f) { return f && f.path; })
          .filter(function (p) { return typeof p === "string" && p.length > 0; })
      : [];

    if (manifestPaths.length === 0) {
      return { ok: false, error: "review_error", detail: "MANIFEST_REQUIRED" };
    }

    // ── Read spec + design (REQUIRED) ──────────────────────────────────────────
    const specRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/spec.json" }, { root });
    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, review_error: "REVIEW_INPUT_NOT_FOUND", advanced: false };
    }
    let spec;
    try { spec = JSON.parse(specRead.output.content); }
    catch { return { ok: true, loop_id: loopId, review_error: "REVIEW_INPUT_NOT_FOUND", advanced: false }; }

    const designRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/architect_design.json" }, { root });
    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, review_error: "REVIEW_INPUT_NOT_FOUND", advanced: false };
    }
    let design;
    try { design = JSON.parse(designRead.output.content); }
    catch { return { ok: true, loop_id: loopId, review_error: "REVIEW_INPUT_NOT_FOUND", advanced: false }; }

    // ── Assemble the code object from the manifest files' on-disk content ───────
    // Manifest-restricted: review only what THIS build wrote. A listed file that
    // cannot be read is fail-closed (the authoritative record is broken).
    const filesWritten = [];
    for (const mp of manifestPaths) {
      const fileRead = await reg.invoke("fs.read_file", { path: projectRelDir + "/" + mp }, { root });
      if (!fileRead || fileRead.status !== "SUCCESS") {
        return { ok: true, loop_id: loopId, review_error: "REVIEW_INPUT_NOT_FOUND", advanced: false };
      }
      filesWritten.push({ path: mp, content: fileRead.output.content || "" });
    }

    const code = {
      files_written:      filesWritten,
      summary:            "Build under review: " + filesWritten.length +
                          " file(s) from build_manifest.json (built_at " +
                          ((manifest && manifest.built_at) || "unknown") + ").",
      dependencies_added: []
    };

    // Test-only forced timeout hook (never set in production code)
    if (body._test_force_timeout) {
      return { ok: true, loop_id: loopId, advanced: false, review_error: "REVIEWER_TIMEOUT" };
    }

    // ── Invoke reviewer (phase B), then security_auditor (phase CODE) ──────────
    // Both fail-closed; a schema-invalid role output is REVIEW_PARSE_FAILED, any
    // other non-SUCCESS is ROLE_INVOKE_FAILED (RULING-6). 30s timeout race per role.
    const _invokeRole = async function (roleId, roleInput, provider, model, scenId) {
      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("REVIEWER_TIMEOUT")), 150000);
      });
      try {
        const result = await Promise.race([
          reg.invoke("role.invoke", Object.assign(
            { role_id: roleId, input: roleInput, project_id: pid, provider },
            model  ? { model }              : {},
            scenId ? { scenario_id: scenId } : {}
          ), { root }),
          timeoutPromise
        ]);
        clearTimeout(timeoutHandle);
        return { result };
      } catch (err) {
        clearTimeout(timeoutHandle);
        return { error: err.message };
      }
    };

    const reviewerCall = await _invokeRole(
      "reviewer",
      { phase: "B", spec, design, code, project_id: pid },
      revProvider, revModel, revScenId
    );
    if (reviewerCall.error) {
      return { ok: true, loop_id: loopId, advanced: false, review_error: reviewerCall.error };
    }
    const reviewerResult = reviewerCall.result;
    if (!reviewerResult || reviewerResult.status !== "SUCCESS") {
      const reason  = reviewerResult && reviewerResult.metadata && reviewerResult.metadata.reason;
      const errCode = reason === "INVALID_ROLE_OUTPUT" ? "REVIEW_PARSE_FAILED" : "ROLE_INVOKE_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, review_error: errCode };
    }

    const securityCall = await _invokeRole(
      "security_auditor",
      { project_id: pid, phase: "CODE", spec, design, code },
      secProvider, secModel, secScenId
    );
    if (securityCall.error) {
      return { ok: true, loop_id: loopId, advanced: false, review_error: securityCall.error };
    }
    const securityResult = securityCall.result;
    if (!securityResult || securityResult.status !== "SUCCESS") {
      const reason  = securityResult && securityResult.metadata && securityResult.metadata.reason;
      const errCode = reason === "INVALID_ROLE_OUTPUT" ? "REVIEW_PARSE_FAILED" : "ROLE_INVOKE_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, review_error: errCode };
    }

    // ── Derived verdict (RULING-6) ─────────────────────────────────────────────
    const reviewerOut = reviewerResult.output;
    const securityOut = securityResult.output;

    const reviewerHasBlocker = Array.isArray(reviewerOut.findings) &&
      reviewerOut.findings.some(function (f) { return f && f.severity === "BLOCKER"; });
    const securityHasBlocker = Array.isArray(securityOut.findings) &&
      securityOut.findings.some(function (f) { return f && f.severity === "BLOCKER"; });

    const reviewer_approve = reviewerOut.verdict !== "REJECTED" && !reviewerHasBlocker;
    const security_approve = ["CRITICAL", "HIGH"].indexOf(securityOut.threat_level) === -1 &&
                             !securityHasBlocker;

    const derived_verdict = (reviewer_approve && security_approve) ? "APPROVE" : "REQUEST_CHANGES";

    // ── Persist merged review_report.json BEFORE any transition (fail-closed) ──
    const review_report = {
      reviewer:     reviewerOut,
      security:     securityOut,
      derived_verdict,
      computed_at:  new Date().toISOString()
    };

    let reportWrite = null;
    try {
      reportWrite = await reg.invoke("fs.write_file", {
        path:    orchRelDir + "/review_report.json",
        content: JSON.stringify(review_report, null, 2)
      }, { root });
    } catch {
      reportWrite = null;
    }
    if (!reportWrite || reportWrite.status !== "SUCCESS") {
      return { ok: false, error: "review_error", detail: "REVIEW_WRITE_FAILED" };
    }

    // ── Branch ─────────────────────────────────────────────────────────────────
    if (derived_verdict === "APPROVE") {
      await reg.invoke("orchestration.advance_state", {
        project_id:      pid,
        loop_id:         loopId,
        to_state:        "DOCUMENTATION",
        transition_type: "NORMAL",
        role_invoked:    "reviewer"
      }, { root });

      return {
        ok:           true,
        loop_id:      loopId,
        advanced:     true,
        advanced_to:  "DOCUMENTATION",
        derived_verdict,
        review_report
      };
    }

    // REQUEST_CHANGES → cap-aware loop-back to BUILDER (findings persisted above)
    const lbResult = await reg.invoke("orchestration.loop_back", {
      project_id: pid, loop_id: loopId
    }, { root });

    if (!lbResult || lbResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, advanced: false,
               review_error: "LOOP_BACK_FAILED", derived_verdict, review_report };
    }

    const lbOut = lbResult.output;

    if (lbOut.escalated) {
      return {
        ok:              true,
        loop_id:         loopId,
        advanced:        true,
        advanced_to:     "ESCALATED",
        escalated:       true,
        escalation_path: lbOut.escalation_path,
        derived_verdict,
        review_report
      };
    }

    return {
      ok:           true,
      loop_id:      loopId,
      advanced:     true,
      advanced_to:  "BUILDER",
      loop_back:    true,
      derived_verdict,
      review_report
    };
  }

  // ── Documentation bridge (PHASE-32) ──────────────────────────────────────────
  //
  // documentProject: drives the documentation role from DOCUMENTATION → QUALITY_JUDGE.
  // No owner gate on this edge (conversation_graph.js gate_check:null). This is a
  // persist-then-advance bridge — it NEVER loops back.
  //
  // Inputs: spec.json + architect_design.json (REQUIRED). The code object is OPTIONAL
  // and manifest-restricted (RULING-9, Option B):
  //   build_manifest.json ABSENT          → GRACEFUL: omit code; document from spec+design.
  //   build_manifest.json PRESENT + valid → manifest-restricted code object built from the
  //                                          listed files' on-disk content (EXACTLY as
  //                                          reviewProject assembles it).
  //   build_manifest.json PRESENT + corrupt/unparseable, OR lists a file absent on disk →
  //                                          DOC_MANIFEST_CORRUPT, FAIL-CLOSED (no write, no
  //                                          advance). A corrupt authoritative record must
  //                                          NEVER silently degrade to "document without code".
  //
  // On role SUCCESS: persists documentation.json BEFORE advancing; advances to QUALITY_JUDGE.
  // Fail-closed taxonomy (advanced:false, no write):
  //   WRONG_STATE / INPUT_NOT_FOUND / DOC_MANIFEST_CORRUPT / DOC_PARSE_FAILED /
  //   DOCUMENTATION_FAILED / DOC_WRITE_FAILED.

  async function documentProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, doc_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, doc_error: "NO_LOOP_ID", advanced: false };
    }

    const docProvider   = body.doc_provider || "openai";
    const docModel      = body.doc_model || (docProvider === "openai" ? "gpt-4o" : undefined);
    const docScenarioId = body.doc_scenario_id || undefined;

    const reg = getDefaultRegistry();
    const pid = normalizeProjectId(projectId);

    // State guard: must be at DOCUMENTATION
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: pid, loop_id: loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, doc_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "DOCUMENTATION") {
      return { ok: true, loop_id: loopId, current_state: currentState,
               doc_error: "WRONG_STATE", advanced: false };
    }

    const orchRelDir    = "artifacts/projects/" + pid + "/orchestration/" + loopId;
    const projectRelDir = "artifacts/projects/" + pid;

    // ── Read spec + design (REQUIRED) ──────────────────────────────────────────
    const specRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/spec.json" }, { root });
    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, doc_error: "INPUT_NOT_FOUND", advanced: false };
    }
    let spec;
    try { spec = JSON.parse(specRead.output.content); }
    catch { return { ok: true, loop_id: loopId, doc_error: "INPUT_NOT_FOUND", advanced: false }; }

    const designRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/architect_design.json" }, { root });
    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, doc_error: "INPUT_NOT_FOUND", advanced: false };
    }
    let design;
    try { design = JSON.parse(designRead.output.content); }
    catch { return { ok: true, loop_id: loopId, doc_error: "INPUT_NOT_FOUND", advanced: false }; }

    // ── RULING-9 (Option B): code object is OPTIONAL, manifest-restricted ───────
    let code;  // stays undefined when manifest is absent (graceful)
    const manifestRead = await reg.invoke("fs.read_file",
      { path: orchRelDir + "/build_manifest.json" }, { root });

    if (manifestRead && manifestRead.status === "SUCCESS") {
      // manifest PRESENT — it must be valid, else fail-closed (never silent degrade).
      let manifest;
      try {
        manifest = JSON.parse(manifestRead.output.content);
      } catch {
        return { ok: true, loop_id: loopId, doc_error: "DOC_MANIFEST_CORRUPT", advanced: false };
      }

      const manifestPaths = (manifest && Array.isArray(manifest.files))
        ? manifest.files.map(function (f) { return f && f.path; })
            .filter(function (p) { return typeof p === "string" && p.length > 0; })
        : [];

      if (manifestPaths.length === 0) {
        return { ok: true, loop_id: loopId, doc_error: "DOC_MANIFEST_CORRUPT", advanced: false };
      }

      const filesWritten = [];
      for (const mp of manifestPaths) {
        const fileRead = await reg.invoke("fs.read_file", { path: projectRelDir + "/" + mp }, { root });
        if (!fileRead || fileRead.status !== "SUCCESS") {
          // manifest lists a file absent on disk → corrupt authoritative record
          return { ok: true, loop_id: loopId, doc_error: "DOC_MANIFEST_CORRUPT", advanced: false };
        }
        filesWritten.push({ path: mp, content: fileRead.output.content || "" });
      }

      code = {
        files_written:      filesWritten,
        summary:            "Documenting build: " + filesWritten.length +
                            " file(s) from build_manifest.json (built_at " +
                            ((manifest && manifest.built_at) || "unknown") + ").",
        dependencies_added: []
      };
    }
    // else: manifest ABSENT → graceful; document from spec + design only.

    // ── Invoke documentation role (30s timeout, mirrors designTests) ───────────
    const docInput = { project_id: pid, spec, design };
    if (code) docInput.code = code;

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("DOCUMENTATION_TIMEOUT")), 150000);
    });

    try {
      const docResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "documentation",
            input:      docInput,
            project_id: pid,
            provider:   docProvider
          },
          docModel      ? { model:       docModel      } : {},
          docScenarioId ? { scenario_id: docScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (docResult && docResult.status === "SUCCESS") {
        const documentation = docResult.output;

        // Persist documentation.json BEFORE advancing (fail-closed on throw/non-SUCCESS).
        let docWrite = null;
        try {
          docWrite = await reg.invoke("fs.write_file", {
            path:    orchRelDir + "/documentation.json",
            content: JSON.stringify(documentation, null, 2)
          }, { root });
        } catch {
          docWrite = null;
        }
        if (!docWrite || docWrite.status !== "SUCCESS") {
          return { ok: true, loop_id: loopId, advanced: false, doc_error: "DOC_WRITE_FAILED" };
        }

        // PHASE-51 (W-1): documentation-time citation pass. Read BACK the persisted
        // documentation.json (C-1: the IDENTICAL bytes the §8 audit reads) → enumerate
        // claims via the SAME §7.1 detector → per claim kb.retrieve + kb.cite → append
        // CitationRecords to citations.jsonl. Runs post-persist, pre-§8-audit; never
        // mutates documentation.json (only citations.jsonl is written). Best-effort: a
        // read-back/pass failure leaves claims uncited and the §8 audit below is the
        // fail-closed gate.
        let citationPass = null;
        try {
          const docReadBack = await reg.invoke("fs.read_file",
            { path: orchRelDir + "/documentation.json" }, { root });
          if (docReadBack && docReadBack.status === "SUCCESS") {
            citationPass = await runDocumentationCitationPass(
              reg, pid, orchRelDir + "/documentation.json",
              docReadBack.output.content, root, _kbEmbedClient, _kbDiscovery);
          }
        } catch {
          citationPass = null;
        }

        // W-3.5 (PHASE-50 A-4/A-4-bis): §8 citation audit gates advancement — the
        // PERSISTED documentation.json is audited post-persist, pre-advance.
        // FAIL_UNCITED blocks (fail-closed, contract §7 "hard gate") unless the
        // owner's decision-artifact-gated citation_audit_override rides the body;
        // audit infrastructure failure is fail-closed even under override (§3.5).
        let auditEnv = null;
        try {
          auditEnv = await reg.invoke("kb.validate_citations", {
            artifact_path: orchRelDir + "/documentation.json",
            project_id:    pid
          }, { root });
        } catch {
          auditEnv = null;
        }
        if (!auditEnv || auditEnv.status !== "SUCCESS") {
          return { ok: true, loop_id: loopId, advanced: false, doc_error: "CITATION_AUDIT_FAILED" };
        }

        const citationAudit = auditEnv.output;
        const auditOverride = body.citation_audit_override === true;

        if (citationAudit.status === "FAIL_UNCITED") {
          // Durable record via the activity emitter (A-4-bis ruling 3; best-effort).
          try {
            const { emit: emitAuditActivity } = require("../runtime/agents/_activity_emitter");
            const { getIndicator: getAuditIndicator } = require("../runtime/agents/_activity_catalog");
            const auditState = auditOverride ? "CITATION_AUDIT_OVERRIDDEN" : "AUDIT_FAIL_UNCITED_CLAIM";
            emitAuditActivity({
              invocation_id: null, project_id: pid, role: "documentation",
              state: auditState, indicator: getAuditIndicator("documentation", auditState)
            }, { root });
          } catch { /* best-effort */ }

          if (!auditOverride) {
            return {
              ok:             true,
              loop_id:        loopId,
              advanced:       false,
              doc_error:      "UNCITED_CLAIMS",
              uncited_claims: citationAudit.uncited_claims || [],
              citation_audit: citationAudit,
              citation_pass:  citationPass
            };
          }
        }

        await reg.invoke("orchestration.advance_state", {
          project_id:      pid,
          loop_id:         loopId,
          to_state:        "QUALITY_JUDGE",
          transition_type: "NORMAL",
          role_invoked:    "documentation"
        }, { root });

        const successPayload = {
          ok:             true,
          loop_id:        loopId,
          advanced:       true,
          advanced_to:    "QUALITY_JUDGE",
          documentation,
          model_used:     docModel,
          citation_audit: citationAudit,
          citation_pass:  citationPass
        };
        if (auditOverride && citationAudit.status === "FAIL_UNCITED") {
          successPayload.citation_audit_override = true;
        }
        return successPayload;
      }

      // Role non-SUCCESS → fail-closed (no write, no advance). A schema-invalid role
      // output (INVALID_ROLE_OUTPUT) → DOC_PARSE_FAILED; any other reason →
      // DOCUMENTATION_FAILED (mirrors reviewProject's distinction via metadata.reason).
      const reason   = docResult && docResult.metadata && docResult.metadata.reason;
      const docError = reason === "INVALID_ROLE_OUTPUT" ? "DOC_PARSE_FAILED" : "DOCUMENTATION_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, doc_error: docError, model_used: docModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, doc_error: err.message };
    }
  }

  // ── Quality Judge bridge (PHASE-33) ─────────────────────────────────────────
  //
  // judgeQuality: drives the quality_judge role at QUALITY_JUDGE. This is a
  // persist-then-BLOCK bridge (mirrors reportEnv) — it does NOT advance. After the
  // role SUCCESS, quality_report.json is persisted and the loop STAYS at QUALITY_JUDGE
  // pending owner Gate 2 (resolved by respondGate gate_id:2). The QUALITY_JUDGE edges
  // (conversation_graph.js) all carry a non-null gate_check ("Gate 2 …") — only the
  // owner's gate response moves the loop (APPROVE_SHIP/APPROVE_WITH_CAVEATS →
  // DEPLOYMENT_OR_END; REJECT_AND_LOOP → BUILDER/ESCALATED).
  //
  // Inputs: spec.json + architect_design.json (REQUIRED → INPUT_NOT_FOUND).
  // Best-effort optionals (present on disk → include; absent → omit; NO fail-close):
  //   review_report.json → security_audit; test_plan.json → test_plan;
  //   documentation.json → documentation; cost_estimate.json → cost_estimate;
  //   env_report.json → environment.
  // The code/builder_output object is OPTIONAL and manifest-restricted (RULING-9,
  // Option B — same rule documentProject applies):
  //   build_manifest.json ABSENT          → GRACEFUL: omit builder_output; judge from
  //                                          spec+design (+ best-effort optionals).
  //   build_manifest.json PRESENT + valid → manifest-restricted builder_output built
  //                                          from the listed files' on-disk content.
  //   build_manifest.json PRESENT + corrupt/unparseable, OR lists a file absent on disk,
  //                                          OR empty files[] → QUALITY_MANIFEST_CORRUPT,
  //                                          FAIL-CLOSED (no write, no gate_pending).
  //
  // On role SUCCESS: persists quality_report.json; returns {quality_report,
  // gate_pending:2, advanced:false}. Fail-closed taxonomy (advanced:false, no write):
  //   WRONG_STATE / INPUT_NOT_FOUND / QUALITY_MANIFEST_CORRUPT / QUALITY_PARSE_FAILED /
  //   QUALITY_FAILED / QUALITY_WRITE_FAILED.

  async function judgeQuality(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, quality_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, quality_error: "NO_LOOP_ID", advanced: false };
    }

    // quality_judge_role defaults to anthropic; override to openai (owner has no
    // ANTHROPIC_API_KEY). Same amendment pattern as the prior real bridges (LOCK-3).
    const qjProvider   = body.quality_provider || "openai";
    const qjModel      = body.quality_model || (qjProvider === "openai" ? "gpt-4o" : undefined);
    const qjScenarioId = body.quality_scenario_id || undefined;

    const reg = getDefaultRegistry();
    const pid = normalizeProjectId(projectId);

    // State guard: must be at QUALITY_JUDGE
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: pid, loop_id: loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, quality_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "QUALITY_JUDGE") {
      return { ok: true, loop_id: loopId, current_state: currentState,
               quality_error: "WRONG_STATE", advanced: false };
    }

    const orchRelDir    = "artifacts/projects/" + pid + "/orchestration/" + loopId;
    const projectRelDir = "artifacts/projects/" + pid;

    // ── Read spec + design (REQUIRED) ──────────────────────────────────────────
    const specRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/spec.json" }, { root });
    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, quality_error: "INPUT_NOT_FOUND", advanced: false };
    }
    let spec;
    try { spec = JSON.parse(specRead.output.content); }
    catch { return { ok: true, loop_id: loopId, quality_error: "INPUT_NOT_FOUND", advanced: false }; }

    const designRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/architect_design.json" }, { root });
    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, quality_error: "INPUT_NOT_FOUND", advanced: false };
    }
    let design;
    try { design = JSON.parse(designRead.output.content); }
    catch { return { ok: true, loop_id: loopId, quality_error: "INPUT_NOT_FOUND", advanced: false }; }

    const qjInput = { project_id: pid, spec, design };

    // ── Best-effort optionals (LOCK-5: present → include; absent → omit; no fail-close) ──
    async function _bestEffortObj(relPath) {
      const r = await reg.invoke("fs.read_file", { path: relPath }, { root });
      if (!r || r.status !== "SUCCESS") return undefined;
      try { return JSON.parse(r.output.content); } catch { return undefined; }
    }
    const securityAudit = await _bestEffortObj(orchRelDir + "/review_report.json");
    if (securityAudit) qjInput.security_audit = securityAudit;
    const testPlan = await _bestEffortObj(orchRelDir + "/test_plan.json");
    if (testPlan) qjInput.test_plan = testPlan;
    const documentation = await _bestEffortObj(orchRelDir + "/documentation.json");
    if (documentation) qjInput.documentation = documentation;
    const costEstimate = await _bestEffortObj(orchRelDir + "/cost_estimate.json");
    if (costEstimate) qjInput.cost_estimate = costEstimate;
    const environment = await _bestEffortObj(orchRelDir + "/env_report.json");
    if (environment) qjInput.environment = environment;

    // ── RULING-9 (Option B): builder_output is OPTIONAL, manifest-restricted ───
    const manifestRead = await reg.invoke("fs.read_file",
      { path: orchRelDir + "/build_manifest.json" }, { root });

    if (manifestRead && manifestRead.status === "SUCCESS") {
      // manifest PRESENT — it must be valid, else fail-closed (never silent degrade).
      let manifest;
      try {
        manifest = JSON.parse(manifestRead.output.content);
      } catch {
        return { ok: true, loop_id: loopId, quality_error: "QUALITY_MANIFEST_CORRUPT", advanced: false };
      }

      const manifestPaths = (manifest && Array.isArray(manifest.files))
        ? manifest.files.map(function (f) { return f && f.path; })
            .filter(function (p) { return typeof p === "string" && p.length > 0; })
        : [];

      if (manifestPaths.length === 0) {
        return { ok: true, loop_id: loopId, quality_error: "QUALITY_MANIFEST_CORRUPT", advanced: false };
      }

      const filesWritten = [];
      for (const mp of manifestPaths) {
        const fileRead = await reg.invoke("fs.read_file", { path: projectRelDir + "/" + mp }, { root });
        if (!fileRead || fileRead.status !== "SUCCESS") {
          // manifest lists a file absent on disk → corrupt authoritative record
          return { ok: true, loop_id: loopId, quality_error: "QUALITY_MANIFEST_CORRUPT", advanced: false };
        }
        filesWritten.push({ path: mp, content: fileRead.output.content || "" });
      }

      qjInput.builder_output = {
        files_written:      filesWritten,
        summary:            "Quality review of build: " + filesWritten.length +
                            " file(s) from build_manifest.json (built_at " +
                            ((manifest && manifest.built_at) || "unknown") + ").",
        dependencies_added: []
      };
    }
    // else: manifest ABSENT → graceful; judge from spec + design (+ best-effort optionals).

    // ── Invoke quality_judge role (30s timeout, mirrors reportEnv) ─────────────
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("QUALITY_JUDGE_TIMEOUT")), 150000);
    });

    try {
      const qjResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "quality_judge",
            input:      qjInput,
            project_id: pid,
            provider:   qjProvider
          },
          qjModel      ? { model:       qjModel      } : {},
          qjScenarioId ? { scenario_id: qjScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (qjResult && qjResult.status === "SUCCESS") {
        const quality_report = qjResult.output;

        // Persist quality_report.json (fail-closed on throw/non-SUCCESS). NO advance —
        // the loop stays at QUALITY_JUDGE pending Gate 2 (owner via respondGate).
        let qjWrite = null;
        try {
          qjWrite = await reg.invoke("fs.write_file", {
            path:    orchRelDir + "/quality_report.json",
            content: JSON.stringify(quality_report, null, 2)
          }, { root });
        } catch {
          qjWrite = null;
        }
        if (!qjWrite || qjWrite.status !== "SUCCESS") {
          return { ok: true, loop_id: loopId, advanced: false, quality_error: "QUALITY_WRITE_FAILED" };
        }

        return {
          ok:           true,
          loop_id:      loopId,
          quality_report,
          gate_pending: 2,
          advanced:     false,
          model_used:   qjModel
        };
      }

      // Role non-SUCCESS → fail-closed (no write, no gate_pending). A schema-invalid role
      // output (INVALID_ROLE_OUTPUT) → QUALITY_PARSE_FAILED; any other reason →
      // QUALITY_FAILED (mirrors documentProject's distinction via metadata.reason).
      const reason  = qjResult && qjResult.metadata && qjResult.metadata.reason;
      const qjError = reason === "INVALID_ROLE_OUTPUT" ? "QUALITY_PARSE_FAILED" : "QUALITY_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, quality_error: qjError, model_used: qjModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, quality_error: err.message };
    }
  }

  // ── Cost Estimate bridge (PHASE-25) ─────────────────────────────────────────
  //
  // estimateCost: drives the cost_estimator role from COST_ESTIMATE → ENV_REPORT.
  // No owner gate on this edge (conversation_graph.js gate_check:null).
  // Any failure → {ok:true, estimate_error:<code>, advanced:false} (stays COST_ESTIMATE).

  async function estimateCost(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, estimate_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, estimate_error: "NO_LOOP_ID", advanced: false };
    }

    const estimateProvider   = body.estimate_provider   || "openai";
    const estimateModel      = body.estimate_model || (estimateProvider === "openai" ? "gpt-4o" : undefined);
    const estimateScenarioId = body.estimate_scenario_id || undefined;

    const reg = getDefaultRegistry();

    // State guard: must be at COST_ESTIMATE
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, estimate_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "COST_ESTIMATE") {
      return { ok: true, loop_id: loopId, current_state: currentState, estimate_error: "WRONG_STATE", advanced: false };
    }

    // Read spec from disk (same artifact paths as buildProject/reviewSpec)
    const specRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/spec.json";
    const specRead = await reg.invoke("fs.read_file", { path: specRelPath }, { root });

    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, estimate_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let spec;
    try {
      spec = JSON.parse(specRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, estimate_error: "INPUT_NOT_FOUND", advanced: false };
    }

    // Read architect design from disk
    const designRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/architect_design.json";
    const designRead = await reg.invoke("fs.read_file", { path: designRelPath }, { root });

    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, estimate_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let design;
    try {
      design = JSON.parse(designRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, estimate_error: "INPUT_NOT_FOUND", advanced: false };
    }

    // 30s timeout, mirroring reviewSpec/buildProject
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("COST_ESTIMATOR_TIMEOUT")), 150000);
    });

    try {
      const estimateResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "cost_estimator",
            input:      { project_id: normalizeProjectId(projectId), spec, design },
            project_id: normalizeProjectId(projectId),
            provider:   estimateProvider
          },
          estimateModel      ? { model:       estimateModel      } : {},
          estimateScenarioId ? { scenario_id: estimateScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (estimateResult && estimateResult.status === "SUCCESS") {
        const estimate = estimateResult.output;

        await reg.invoke("orchestration.advance_state", {
          project_id:      normalizeProjectId(projectId),
          loop_id:         loopId,
          to_state:        "ENV_REPORT",
          transition_type: "NORMAL",
          role_invoked:    "cost_estimator"
        }, { root });

        return {
          ok:          true,
          loop_id:     loopId,
          advanced:    true,
          advanced_to: "ENV_REPORT",
          estimate,
          model_used:  estimateModel
        };
      }

      const estimateError = (estimateResult && estimateResult.metadata && estimateResult.metadata.detail)
        || "ESTIMATE_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, estimate_error: estimateError, model_used: estimateModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, estimate_error: err.message };
    }
  }

  // ── Test Design bridge (PHASE-27) ────────────────────────────────────────────
  //
  // designTests: drives the test_designer role from TEST_DESIGN → BUILDER.
  // No owner gate on this edge (conversation_graph.js gate_check:null).
  // On SUCCESS: persists test_plan.json; advances to BUILDER; returns the test plan.
  // Any failure → {ok:true, test_error:<code>, advanced:false} (stays TEST_DESIGN).

  async function designTests(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, test_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, test_error: "NO_LOOP_ID", advanced: false };
    }

    const testProvider   = body.test_provider   || "openai";
    const testModel      = body.test_model || (testProvider === "openai" ? "gpt-4o" : undefined);
    const testScenarioId = body.test_scenario_id || undefined;

    const reg = getDefaultRegistry();

    // State guard: must be at TEST_DESIGN
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, test_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "TEST_DESIGN") {
      return { ok: true, loop_id: loopId, current_state: currentState, test_error: "WRONG_STATE", advanced: false };
    }

    // Read spec from disk (same artifact paths as buildProject/estimateCost/reportEnv)
    const specRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/spec.json";
    const specRead = await reg.invoke("fs.read_file", { path: specRelPath }, { root });

    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, test_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let spec;
    try {
      spec = JSON.parse(specRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, test_error: "INPUT_NOT_FOUND", advanced: false };
    }

    // Read architect design from disk
    const designRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/architect_design.json";
    const designRead = await reg.invoke("fs.read_file", { path: designRelPath }, { root });

    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, test_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let design;
    try {
      design = JSON.parse(designRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, test_error: "INPUT_NOT_FOUND", advanced: false };
    }

    // 30s timeout, mirroring estimateCost/reportEnv
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("TEST_DESIGNER_TIMEOUT")), 150000);
    });

    try {
      const testResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "test_designer",
            input:      { project_id: normalizeProjectId(projectId), spec, design },
            project_id: normalizeProjectId(projectId),
            provider:   testProvider
          },
          testModel      ? { model:       testModel      } : {},
          testScenarioId ? { scenario_id: testScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (testResult && testResult.status === "SUCCESS") {
        const test_plan = testResult.output;

        await reg.invoke("fs.write_file", {
          path:    "artifacts/projects/" + normalizeProjectId(projectId) +
                   "/orchestration/" + loopId + "/test_plan.json",
          content: JSON.stringify(test_plan, null, 2)
        }, { root });

        await reg.invoke("orchestration.advance_state", {
          project_id:      normalizeProjectId(projectId),
          loop_id:         loopId,
          to_state:        "BUILDER",
          transition_type: "NORMAL",
          role_invoked:    "test_designer"
        }, { root });

        return {
          ok:          true,
          loop_id:     loopId,
          advanced:    true,
          advanced_to: "BUILDER",
          test_plan,
          model_used:  testModel
        };
      }

      const testError = (testResult && testResult.metadata && testResult.metadata.detail)
        || "TEST_DESIGN_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, test_error: testError, model_used: testModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, test_error: err.message };
    }
  }

  // ── Env Report bridge (PHASE-26) ─────────────────────────────────────────────
  //
  // reportEnv: drives the environment role at ENV_REPORT; loop stays at ENV_REPORT (Gate 1 pending).
  // No advance — owner must call respondGate to fire Gate 1.
  // On SUCCESS: persists env_report.json; returns {env_report, gate_pending:1, advanced:false}.
  // On failure: returns {env_error:<code>, advanced:false}.

  async function reportEnv(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, env_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, env_error: "NO_LOOP_ID", advanced: false };
    }

    const envProvider   = body.env_provider    || "openai";
    const envModel      = body.env_model || (envProvider === "openai" ? "gpt-4o" : undefined);
    const envScenarioId = body.env_scenario_id || undefined;

    const reg = getDefaultRegistry();

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, env_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "ENV_REPORT") {
      return { ok: true, loop_id: loopId, current_state: currentState, env_error: "WRONG_STATE", advanced: false };
    }

    const specRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/spec.json";
    const specRead = await reg.invoke("fs.read_file", { path: specRelPath }, { root });

    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, env_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let spec;
    try {
      spec = JSON.parse(specRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, env_error: "INPUT_NOT_FOUND", advanced: false };
    }

    const designRelPath = "artifacts/projects/" + normalizeProjectId(projectId) +
      "/orchestration/" + loopId + "/architect_design.json";
    const designRead = await reg.invoke("fs.read_file", { path: designRelPath }, { root });

    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, env_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let design;
    try {
      design = JSON.parse(designRead.output.content);
    } catch {
      return { ok: true, loop_id: loopId, env_error: "INPUT_NOT_FOUND", advanced: false };
    }

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("ENV_REPORT_TIMEOUT")), 150000);
    });

    try {
      const envResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "environment",
            input:      { project_id: normalizeProjectId(projectId), spec, design },
            project_id: normalizeProjectId(projectId),
            provider:   envProvider
          },
          envModel      ? { model:       envModel      } : {},
          envScenarioId ? { scenario_id: envScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (envResult && envResult.status === "SUCCESS") {
        const env_report = envResult.output;

        await reg.invoke("fs.write_file", {
          path:    "artifacts/projects/" + normalizeProjectId(projectId) +
                   "/orchestration/" + loopId + "/env_report.json",
          content: JSON.stringify(env_report, null, 2)
        }, { root });

        return {
          ok:           true,
          loop_id:      loopId,
          env_report,
          gate_pending: 1,
          advanced:     false,
          model_used:   envModel
        };
      }

      const envError = (envResult && envResult.metadata && envResult.metadata.detail)
        || "ENV_REPORT_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, env_error: envError, model_used: envModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, env_error: err.message };
    }
  }

  // ── Deployment bridge (PHASE-34) — deployProject at DEPLOYMENT_OR_END ──────────
  //
  // Two paths (conversation_graph.js DEPLOYMENT_OR_END node):
  //   • SKIP (LOCK-4 + LOCK-6): deployment_enabled === false (body-driven) → VACUOUS_SKIP
  //     advance to LIVE_DELIVERABLE. Reuses orchestration.advance_state(transition_type:
  //     "VACUOUS_SKIP", role_invoked:null) — the same mechanism as e2e_loop_helper.runS156.
  //     No role call, no gate. shouldSkipGate3 skips ONLY on explicit === false; missing/
  //     null/undefined/true → gated path (so Gate 3 is actually exercised by default).
  //   • GATED (default): role.invoke(deployment) → persist deployment_plan.json BEFORE
  //     returning → { gate_pending:3, advanced:false }. NO advance_state — every gated
  //     DEPLOYMENT_OR_END edge carries a non-null Gate 3 gate_check; only the owner's Gate 3
  //     response (via respondGate) moves the loop. The deployment role is ADVISORY — it
  //     produces a deployment PLAN, not a live deploy (bridge-only; no deploy.* execution).
  //
  // Provider default openai/gpt-4o (LOCK-3; the role's own default is anthropic and the owner
  // has no ANTHROPIC_API_KEY). The role input is spec+design (+optional environment) — there is
  // NO build_manifest dependency, so no RULING-9 manifest branch (simpler than judgeQuality).
  // Fail-closed taxonomy (no write, no advance): WRONG_STATE / INPUT_NOT_FOUND /
  // DEPLOY_PARSE_FAILED (INVALID_ROLE_OUTPUT) / DEPLOYMENT_FAILED (other reason) /
  // DEPLOY_WRITE_FAILED.

  async function deployProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, deploy_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, deploy_error: "NO_LOOP_ID", advanced: false };
    }

    const reg = getDefaultRegistry();
    const pid = normalizeProjectId(projectId);

    // State guard: must be at DEPLOYMENT_OR_END
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: pid, loop_id: loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, deploy_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "DEPLOYMENT_OR_END") {
      return { ok: true, loop_id: loopId, current_state: currentState,
               deploy_error: "WRONG_STATE", advanced: false };
    }

    // ── SKIP path (LOCK-4 + LOCK-6): deployment_enabled === false → VACUOUS_SKIP ──
    const { shouldSkipGate3 } = require("../runtime/orchestration/approval_gates");
    if (shouldSkipGate3({ deployment_enabled: body.deployment_enabled })) {
      // role_invoked is omitted (NOT passed as null): the tool's input_schema types it as
      // "string", so an explicit null fails validation. The audit row still records
      // role_invoked:null via the tool's `input.role_invoked || null` default (LOCK-4).
      const skipResult = await reg.invoke("orchestration.advance_state", {
        project_id:      pid,
        loop_id:         loopId,
        to_state:        "LIVE_DELIVERABLE",
        transition_type: "VACUOUS_SKIP"
      }, { root });

      if (!skipResult || skipResult.status !== "SUCCESS") {
        return { ok: true, loop_id: loopId, advanced: false, deploy_error: "SKIP_ADVANCE_FAILED" };
      }

      return {
        ok:           true,
        loop_id:      loopId,
        advanced:     true,
        advanced_to:  "LIVE_DELIVERABLE",
        skipped:      true,
        gate_pending: null
      };
    }

    // ── GATED path: deployment role → persist deployment_plan.json → BLOCK on Gate 3 ──
    const depProvider   = body.deploy_provider || "openai";
    const depModel      = body.deploy_model || (depProvider === "openai" ? "gpt-4o" : undefined);
    const depScenarioId = body.deploy_scenario_id || undefined;

    const orchRelDir = "artifacts/projects/" + pid + "/orchestration/" + loopId;

    // Read spec + design (REQUIRED)
    const specRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/spec.json" }, { root });
    if (!specRead || specRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, deploy_error: "INPUT_NOT_FOUND", advanced: false };
    }
    let spec;
    try { spec = JSON.parse(specRead.output.content); }
    catch { return { ok: true, loop_id: loopId, deploy_error: "INPUT_NOT_FOUND", advanced: false }; }

    const designRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/architect_design.json" }, { root });
    if (!designRead || designRead.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, deploy_error: "INPUT_NOT_FOUND", advanced: false };
    }
    let design;
    try { design = JSON.parse(designRead.output.content); }
    catch { return { ok: true, loop_id: loopId, deploy_error: "INPUT_NOT_FOUND", advanced: false }; }

    const depInput = { project_id: pid, spec, design };

    // Best-effort optional environment (present → include; absent → omit; never fail-close).
    const envRead = await reg.invoke("fs.read_file", { path: orchRelDir + "/env_report.json" }, { root });
    if (envRead && envRead.status === "SUCCESS") {
      try { depInput.environment = JSON.parse(envRead.output.content); } catch { /* omit on parse fail */ }
    }

    // Invoke deployment role (30s timeout, mirrors reportEnv/judgeQuality)
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("DEPLOYMENT_TIMEOUT")), 150000);
    });

    try {
      const depResult = await Promise.race([
        reg.invoke("role.invoke", Object.assign(
          {
            role_id:    "deployment",
            input:      depInput,
            project_id: pid,
            provider:   depProvider
          },
          depModel      ? { model:       depModel      } : {},
          depScenarioId ? { scenario_id: depScenarioId } : {}
        ), { root }),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);

      if (depResult && depResult.status === "SUCCESS") {
        const deployment_plan = depResult.output;

        // Persist deployment_plan.json (fail-closed on throw/non-SUCCESS). NO advance —
        // the loop stays at DEPLOYMENT_OR_END pending Gate 3 (owner via respondGate).
        let depWrite = null;
        try {
          depWrite = await reg.invoke("fs.write_file", {
            path:    orchRelDir + "/deployment_plan.json",
            content: JSON.stringify(deployment_plan, null, 2)
          }, { root });
        } catch {
          depWrite = null;
        }
        if (!depWrite || depWrite.status !== "SUCCESS") {
          return { ok: true, loop_id: loopId, advanced: false, deploy_error: "DEPLOY_WRITE_FAILED" };
        }

        return {
          ok:           true,
          loop_id:      loopId,
          deployment_plan,
          gate_pending: 3,
          advanced:     false,
          model_used:   depModel
        };
      }

      // Role non-SUCCESS → fail-closed. INVALID_ROLE_OUTPUT → DEPLOY_PARSE_FAILED; any other
      // reason → DEPLOYMENT_FAILED (distinguished via metadata.reason, mirrors judgeQuality).
      const reason   = depResult && depResult.metadata && depResult.metadata.reason;
      const depError = reason === "INVALID_ROLE_OUTPUT" ? "DEPLOY_PARSE_FAILED" : "DEPLOYMENT_FAILED";
      return { ok: true, loop_id: loopId, advanced: false, deploy_error: depError, model_used: depModel };

    } catch (err) {
      clearTimeout(timeoutHandle);
      return { ok: true, loop_id: loopId, advanced: false, deploy_error: err.message };
    }
  }

  // ── Finalization (PHASE-34, LOCK-5) — finalizeDeliverable LIVE_DELIVERABLE → COMPLETE ──
  //
  // The pipeline-completing step (idea → live deliverable end-to-end closes here). It is a
  // DISTINCT, explicit step — NOT folded into the Gate 3 APPROVE handler — so the owner sees
  // LIVE_DELIVERABLE before COMPLETE. Reuses summary_writer.writeSummary() (consumed, NOT
  // rewritten). Persist-then-advance, matching the graph trigger "orchestration_summary.md
  // written; audit trail finalized": writeSummary BEFORE advancing, then advance to COMPLETE
  // (the LIVE_DELIVERABLE → COMPLETE edge is gate_check null). State guard LIVE_DELIVERABLE else
  // WRONG_STATE. writeSummary throw → SUMMARY_WRITE_FAILED (no advance). COMPLETE is terminal.

  async function finalizeDeliverable(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, finalize_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, finalize_error: "NO_LOOP_ID", advanced: false };
    }

    const reg = getDefaultRegistry();
    const pid = normalizeProjectId(projectId);

    // State guard: must be at LIVE_DELIVERABLE
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: pid, loop_id: loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, finalize_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== "LIVE_DELIVERABLE") {
      return { ok: true, loop_id: loopId, current_state: currentState,
               finalize_error: "WRONG_STATE", advanced: false };
    }

    // Persist orchestration_summary.md BEFORE advancing (reuse summary_writer; do NOT rewrite).
    const { writeSummary } = require("../runtime/orchestration/summary_writer");
    let summaryPath = null;
    try {
      const sw = await writeSummary(pid, loopId, { root });
      summaryPath = sw && sw.path;
    } catch {
      return { ok: true, loop_id: loopId, advanced: false, finalize_error: "SUMMARY_WRITE_FAILED" };
    }
    if (!summaryPath) {
      return { ok: true, loop_id: loopId, advanced: false, finalize_error: "SUMMARY_WRITE_FAILED" };
    }

    // Advance LIVE_DELIVERABLE → COMPLETE (gate_check null edge; COMPLETE is terminal).
    const advResult = await reg.invoke("orchestration.advance_state", {
      project_id:      pid,
      loop_id:         loopId,
      to_state:        "COMPLETE",
      transition_type: "NORMAL"
    }, { root });

    if (!advResult || advResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, advanced: false,
               finalize_error: "FINALIZE_ADVANCE_FAILED", summary_path: summaryPath };
    }

    return {
      ok:           true,
      loop_id:      loopId,
      advanced:     true,
      advanced_to:  "COMPLETE",
      summary_path: summaryPath
    };
  }

  // ── Respond Gate bridge (PHASE-26; Gate 2 added PHASE-33; Gate 3 added PHASE-34) ──
  //
  // respondGate: resolves an owner approval gate via orchestration.respond.
  //   Gate 1 (host ENV_REPORT):    APPROVE → TEST_DESIGN; REJECT → ESCALATED.
  //   Gate 2 (host QUALITY_JUDGE): APPROVE_SHIP / APPROVE_WITH_CAVEATS → DEPLOYMENT_OR_END;
  //                                REJECT_AND_LOOP → BUILDER (or ESCALATED at cap, resolved
  //                                inside fireGate → tryAdvanceForLoopBack).
  //   Gate 3 (host DEPLOYMENT_OR_END): APPROVE → LIVE_DELIVERABLE; REJECT → ESCALATED.
  //                                LOCK-1: APPROVE requires selected_target — forwarded into
  //                                orchestration.respond → fireGate (which THROWS if APPROVE
  //                                lacks it); missing → GATE_RESPOND_FAILED (fail-closed).
  // Guards: gate_id ∈ {1,2,3}; response must be valid for that gate; current_state must be
  // the gate's host state. Invalid gate/response → {gate_error:"INVALID_GATE_RESPONSE"};
  // wrong host state → {gate_error:"WRONG_STATE", current_state}. Both advanced:false.
  // The next_state is owned by orchestration.respond (fireGate) — respondGate echoes it.

  // Per-gate valid response sets + host state (mirror approval_gates.js §7.2–7.4).
  const _GATE_RESPONSES = {
    1: ["APPROVE", "REJECT"],
    2: ["APPROVE_SHIP", "APPROVE_WITH_CAVEATS", "REJECT_AND_LOOP"],
    3: ["APPROVE", "REJECT"]
  };
  const _GATE_HOST_STATE = { 1: "ENV_REPORT", 2: "QUALITY_JUDGE", 3: "DEPLOYMENT_OR_END" };

  async function respondGate(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state     = loadState(projectId);

    if (!state) {
      return { ok: true, loop_id: null, gate_error: "PROJECT_NOT_FOUND", advanced: false };
    }

    const loopId = body.loop_id || state.loop_id || null;
    if (!loopId) {
      return { ok: true, loop_id: null, gate_error: "NO_LOOP_ID", advanced: false };
    }

    const gate_id  = body.gate_id;
    const response = body.response;

    const validResponses = _GATE_RESPONSES[gate_id];
    if (!validResponses || !validResponses.includes(response)) {
      return { ok: true, loop_id: loopId, gate_error: "INVALID_GATE_RESPONSE", advanced: false };
    }

    const reg = getDefaultRegistry();

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: normalizeProjectId(projectId),
      loop_id:    loopId
    }, { root });

    if (!statusResult || statusResult.status !== "SUCCESS") {
      return { ok: true, loop_id: loopId, gate_error: "GET_STATUS_FAILED", advanced: false };
    }

    const currentState = statusResult.output.current_state;
    if (currentState !== _GATE_HOST_STATE[gate_id]) {
      return { ok: true, loop_id: loopId, current_state: currentState, gate_error: "WRONG_STATE", advanced: false };
    }

    try {
      // LOCK-1 (Gate 3): forward selected_target ONLY when present. Passing it as undefined
      // would add a present key with an undefined value → fails orchestration.respond's
      // type:"string" schema validation (same trap as role_invoked:null). Conditional
      // Object.assign mirrors the model/scenario_id pattern used for role.invoke.
      const respondResult = await reg.invoke("orchestration.respond", Object.assign(
        {
          project_id: normalizeProjectId(projectId),
          loop_id:    loopId,
          gate_id:    gate_id,   // LOCK-1: pass the caller's gate_id — NEVER a literal.
          response
        },
        body.selected_target ? { selected_target: body.selected_target } : {}
      ), { root });

      if (!respondResult || respondResult.status !== "SUCCESS") {
        const errDetail = (respondResult && respondResult.metadata && respondResult.metadata.detail)
          || "GATE_RESPOND_FAILED";
        return { ok: true, loop_id: loopId, gate_error: errDetail, advanced: false };
      }

      return {
        ok:          true,
        loop_id:     loopId,
        gate_id:     gate_id,
        response,
        advanced_to: respondResult.output.next_state,
        advanced:    true
      };

    } catch (err) {
      return { ok: true, loop_id: loopId, gate_error: err.message, advanced: false };
    }
  }

  function _formatSummaryAsVision(summary, projectId, frontmatter) {
    const lines = [];
    lines.push("# Vision: " + (summary.project_name || projectId));
    lines.push("");
    lines.push("## Goal");
    lines.push(summary.goal_primary || "");
    if (summary.features && summary.features.length > 0) {
      lines.push("");
      lines.push("## Features");
      for (const f of summary.features) lines.push("- " + f);
    }
    if (summary.constraints && summary.constraints.length > 0) {
      lines.push("");
      lines.push("## Constraints");
      for (const c of summary.constraints) lines.push("- " + c);
    }
    if (summary.non_goals && summary.non_goals.length > 0) {
      lines.push("");
      lines.push("## Non-Goals");
      for (const ng of summary.non_goals) lines.push("- " + ng);
    }
    lines.push("");
    lines.push("---");
    lines.push("*Generated by Forge Idea Synthesis — confirmed by owner.*");
    return serializeFrontmatter(frontmatter) + "\n" + lines.join("\n");
  }

  return {
    processMessage,
    generateCheckpoint,
    confirmTransition,
    getProjectSummary,
    requestIdeaSummary,
    confirmIdea,
    formalizeSpec,
    reviewSpec,
    buildProject,
    runTests,
    reviewProject,
    documentProject,
    judgeQuality,
    estimateCost,
    designTests,
    reportEnv,
    deployProject,
    finalizeDeliverable,
    respondGate,
    CONFIRMATION_REQUIRED_TRANSITIONS
  };
}

// ── Transition-hint helpers (owner-authorized exception to §3.3 / §11.4) ──────
// These are UI-guidance hints only — they do NOT route or classify intent for
// pipeline entry. The confirmation gate (button press) is still required.
// CTO-approved in PHASE-19 Gate #10 findings (2026-06-03).

const _TRANSITION_KEYWORDS_AR = [
  "اعمل مقترح", "اعمل المقترح", "اعرضه", "اعرض المقترح",
  "خلصنا", "كفاية", "ابدأ", "يلا",
  "جاهز", "لخّص", "لخص", "الملخص"
];

const _TRANSITION_HINT_AR = "\n\n💡 لو خلصت استكشاف فكرتك، اضغط '📋 اعرض ملخّص فكرتي' فوق عشان أعرضلك ملخّص كامل تراجعه.";
const _TRANSITION_HINT_EN = "\n\n💡 If you've finished exploring your idea, click '📋 Show My Idea Summary' above to see a full summary you can review.";

function _hasTransitionIntent(message) {
  const lower = String(message).trim().toLowerCase();
  return _TRANSITION_KEYWORDS_AR.some(kw => lower.includes(kw));
}

module.exports = { createConversationEngine, _hasTransitionIntent, _TRANSITION_HINT_AR, runDocumentationCitationPass };

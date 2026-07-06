# DECISION-2026-07-06-phase-50-closure — PHASE-50 KB & Research Activation: CLOSURE

Status: CLOSED (pending CTO fresh-zip verification → push GO → annotated tag phase-50-complete on the closure commit)
Closes: PHASE-50-KB-RESEARCH-ACTIVATION (DECISION-2026-07-05-phase-50-kb-research-activation.md + Amendments A-1..A-6-bis)
Closure date: 2026-07-06

## 1. Purpose achieved — crux MET and owner-witnessed
The phase existed to kill "scenario green / real path broken" in the KB stack.
Final state: real ingest → real embeddings → non-empty retrieval (11 chunks) →
KNOWN findings citing a real ingested source (chk_8a148165_* → src_8a148165135d,
Express Readme) → HIGH confidence — executed BY THE OWNER from /kb.html (Gate #10
PASSED, CTO-verified screenshot; durable artifact
artifacts/spikes/phase50_w5/gate10_owner_research.json).

## 2. G-map — ALL SIX CLOSED
- G-1 CLOSED: research_role reachable via POST /api/kb/research AND the owner UI
  (/kb.html); Gate #10 proved the full path owner-side.
- G-2 CLOSED (W-3/W-3.5): §8 citation audit implemented at role level
  (documentation_role, BLOCKED/UNCITED_CLAIMS + decision-gated override) AND wired
  into the real documentProject path (post-persist, pre-advance gate; S352).
- G-3 CLOSED (W-2): POST /api/kb/ingest + POST /api/kb/research live (S346–S348).
- G-4 CLOSED (W-4/W-4.2): standalone owner page web/kb.html + explicit route;
  owner-run confirmed target-project line, sources list, cited findings.
- G-5 CLOSED (W-5 + Gate #10): first-ever real-provider E2E, evidence persisted
  (ledgers + audit chain + findings artifacts + owner observation).
- G-6 CLOSED (W-1.5): research_role fail-closed on retrieval failure
  (RETRIEVAL_FAILED; S351); S134 family hermetic via the _client seam hops.

## 3. Work-item ledger (commits, chronological)
| Item | Commit | Content |
|---|---|---|
| W-0 | 1b0dfd1 | decision artifact + status flip |
| A-1 | 726eb5f | G-6 adopted + W-1.5 scope |
| A-2 | 6744775 | W-1.5 seam plumbing (role-path _client hops) |
| W-1.5 | 39cca09 | research_role fail-closed + hermetic S134 family + S351 |
| A-3 | 57d9728 | W-2 endpoint contract + hermeticity seam design |
| W-2 | c650ccf | KB API surface (ingest + research) + S346–S348 |
| W-3 | 001dfeb | documentation_role §8 wiring + S349–S350 |
| mid-checkpoint | 81d4f79 | _phase_50_checkpoints/stage_kb_mid.md |
| A-4 | b42775e | W-3.5 wire §8 audit into documentProject |
| A-4-bis | 56ecb16 | W-3.5 probe rulings (Option A, S302 mock edit, override outlet) |
| W-3.5 | c2ec46e | §8 audit gates documentProject advancement + S352 |
| A-4-ter | 1cf80aa | S305 mock-key edit ratified |
| A-5 | 98da9c3 | W-4 surface correction — standalone web/kb.html |
| W-4 | a126149 | owner KB page + explicit route |
| A-6 | 8e2aea2 | W-4.1 active-project key-mismatch fix |
| W-4.1 | 5145ed4 | readActiveProjectId key-compat + S353 |
| A-6-bis | 320c676 | W-4.2 kb.html active-project parse fix |
| W-4.2 | 32f36e9 | kb.html reads wrapped active-project shape |
| W-5 | (no code) | real E2E pre-flight + Gate #10 (evidence in artifacts/spikes/phase50_w5/) |
| W-6 | (this commit) | closure |

## 4. Real spend vs budget
- gpt-4o-2024-08-06 research calls ×3 (agent ledger, actual):
  $0.036 (pre-flight crux call, inv 6400b86d) + $0.03571 (archival call, inv
  0a189f1a — discipline note logged) + $0.0334 (Gate #10 owner call, inv b97627b6)
- KB embeddings (6 ledger rows): $0.0000875
- **TOTAL: $0.10520 of the $0.15 ceiling** (kill bar $3.00 untouched).

## 5. Gate results
- SU suite final: 346 pass / 0 fail / 5 skip (351 total) — scenarios added this
  phase: S346–S353 (8).
- forge-doctor: HEALTHY, 0 critical (3 benign pre-existing warnings).
- Track A grep on all phase live-surface files (apiServer.js,
  conversationEngine.js, research_role.js, documentation_role.js, role_tools.js):
  ZERO forbidden patterns in any line added this phase (roles/role_tools = 0 hits
  total; apiServer/conversationEngine hits are pre-existing read-only fs, §ARC-8
  upload block, and comments/string-lists).
- §ARC = 10 (frozen, unchanged) · L2 tools = 80 (no new tools) · roles = 13.

## 6. Closure notes (documented, non-blocking → backlog)
(a) The research endpoint does not persist the response body server-side
    (role.invoke audit row has no output; providerTrace responses/<inv>.json is
    null on the agent.invoke path — documented PHASE-48 gap). Strongest crux
    evidence therefore rides the owner's observation + ledgers. Backlog: wire
    providerTrace response capture for agent.invoke.
(b) Two active_project.json writer schemas coexist (project_id vs
    active_project_id). Dual-key reads applied BOTH sides this phase (W-4.1
    server, W-4.2 page). Backlog: unify writers on a single schema.
(c) W-4 UI verification is parse/DOM-level only under the spend guard; owner
    Gate #10 is the effective UI gate this phase (it caught W-4.2). Backlog:
    light Playwright UI smoke at PHASE-13.
(d) Role default_provider (anthropic/claude-opus-4-7) vs fleet reality
    (openai/gpt-4o): interim explicit provider passthrough (A-3; UI hardcodes).
    Backlog: reconcile at the Anthropic-switch phase.
(e) F-2 RESOLVED: S134 repo-ledger rows ceased 2026-06-17 because PHASE-41's
    ephemeral overlay root absorbs all suite writes — not because calls stopped.
    Repo-ledger deltas are non-probative for suite behavior post-PHASE-41.
(f) TAVILY/web-search discovery remains DEFERRED per A-1 (own decision artifact
    when opened). kb.ingest_file (local files) remains backlog per the base
    decision. research_synthesis rows are not written to the KB cost_ledger
    (§9.2 lists them; real LLM cost lives in the agent ledger) — backlog.
(g) Upstream drift note: microsoft/api-guidelines Guidelines.md is now a
    relocation notice (1 chunk); ingest #3 is near-empty — honest §6.3
    calibration was demonstrated when the model refused KNOWN on weak evidence.

## 7. CTO erratum log (all retracted on record, bidirectional Trust+Verify)
1. Artifact "33-line" count (file is 32 — V-1).
2. S136 "needs the inject flag" (budget denial precedes retrieval — A-2).
3. W-2 research endpoint named agent.invoke (correct tool: role.invoke).
4. A-3 "ONE mock entry" ceiling (contradicted the W-3 doc-mock instruction — A-4).
5. A-4 "reuse the W-3 role path" wording (persist-after-role makes same-invocation
   reuse impossible — A-4-bis).
6. W-4 "vanilla web/index.html" premise (it is a built React shell — A-5).
7. Post-push origin check via stale CDN blob (false alarm on W-4.2; fix was on
   origin — retracted after CC's four-channel raw-git counterproof).
CC discipline notes owned in-session: unplanned archival re-call ($0.036,
in-ceiling; standing rule adopted: never spend to recover a $0 procedural miss),
two history-order slips (both corrected pre-push, governance order intact).

## 8. Next
PHASE-51-PENDING-DECISION. Candidate work from this phase's backlog: (a)/(b)/(f)
above, kb.cite wiring into documentation generation (A-4-bis ruling 4), TAVILY
web-search (deferred), reviewer/security prompt backlog (pre-existing). Requires
a fresh decision artifact + owner approval before anything begins.

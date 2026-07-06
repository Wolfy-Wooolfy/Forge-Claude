# DECISION-2026-07-05-phase-50-kb-research-activation — PHASE-50: KB & Research Activation

Status: APPROVED (owner delegation in chat 2026-07-05: "فوضتك وموافق"; CTO ruling under delegation)
Opens: PHASE-50-KB-RESEARCH-ACTIVATION (capability #9, deferred from PHASE-49)

## 1. Ruling — offline-first, TAVILY deferred
Real web-search discovery (TAVILY) is DEFERRED to a future phase with its own decision
artifact. PHASE-50 activates the EXISTING KB stack end-to-end with owner-provided URLs only.
Rationale: (a) the project's primary failure mode is "scenario green / real path broken",
and the KB stack today is exactly that — 12 mock scenarios green, zero owner-reachable
real path; (b) the current research_role is KB-retrieval-based, not web-search-based, so
a search API has no verified foundation to serve; (c) Track B rule: one capability per
phase; (d) cost: embeddings-only ingestion fits far under the $3 kill bar.

## 2. CTO pre-audit gap map (to be independently verified in W-1)
- G-1: research_role exists + mock-tested (S134–S136) but NO live-surface caller invokes it.
- G-2: Contract §8 (documentation role must call kb.validate_citations on completion,
  BLOCKED on FAIL_UNCITED) is NOT implemented — no role except research_role touches kb.*.
- G-3: API surface is read-only: only GET /api/kb/sources exists. No ingest, no research.
- G-4: UI surface: zero KB presence in web/index.html.
- G-5: No confirmed real-provider E2E run has ever executed (real embeddings → retrieval
  → cited findings).

## 3. Scope
W-1 gap-map verification (no code) · W-2 API surface (POST /api/kb/ingest,
POST /api/kb/research) · W-3 documentation_role §8 wiring · W-4 minimal owner UI panel ·
W-5 real E2E live run + Gate #10 owner test · W-6 closure.
Non-goals: web-search/TAVILY, new dependencies, local-file ingestion (kb.ingest_file →
backlog), §ARC changes (frozen at 10), citation_validator heuristic changes.

## 4. Closure gate — see PROMPT-STAGE-50.md §5 (binding copy).
## 5. Cost — mock-default; single approved live run ceiling $0.15; kill bar $3.00.

---
## Amendment A-1 — 2026-07-05 — G-6 adopted (research_role fail-open) + W-1.5

W-1 verification CONFIRMED G-1..G-5 and surfaced one additional gap, adopted as:
- G-6: research_role treats a kb.retrieve FAILURE envelope as empty evidence and
  continues (fail-open chunks-guard). Since PHASE-49 W-B removed the .env key,
  S134's retrieval genuinely fails every run yet stays green — "scenario green /
  real path broken" inside the KB stack itself. Violates fail-closed (CLAUDE.md §3.5).

Scope delta (CTO ruling under standing owner delegation):
- NEW work item W-1.5 (before W-2): research_role fail-closed on retrieval failure.
  Envelope status !== SUCCESS → FAILED/RETRIEVAL_FAILED. SUCCESS-with-zero-results
  path unchanged (INSUFFICIENT_EVIDENCE). Scenario hermeticity: any research-role
  scenario whose flow must pass retrieval opts into inject_mock_openai_client;
  runner seam gains a deliberate-failure mock mode (test-infra-only, W-F precedent);
  new S351_research_role_fails_closed_on_retrieval_failure.
- Live-surface allowlist += code/src/runtime/agents/roles/research_role.js
  (+ scenario/test-infra files). No §ARC change. Cost unchanged ($0, mock).
- Closure gate SU math updated: 344 pass / 0 fail / 5 skip (349 total),
  new scenarios S346–S351.

Erratum (record only): §1 rationale "12 mock scenarios green" reads precisely as
9 SU scenarios (S129–S137) + 3 KB doctor checks.
Backlog (non-blocking): F-2 — S134 ledger rows ceased 2026-06-17 pre-W-B; cause
undetermined (historical forensics).
---

---
## Amendment A-2 — 2026-07-05 — W-1.5 seam plumbing (role-path _client hops)

Pre-implementation review (CC STOP-AND-REPORT, CTO-verified) surfaced that the
W-F mock seam does not traverse the role path: role_tools.js rebuilds innerCtx
and drops ctx._client, and research_role.js passes { root } only to kb.retrieve.
Without plumbing, hermetic S134 is unachievable (mock never reaches retrieval)
and S351 would be environment-coupled (a real key in env → real embedding call —
the W-F disease).

Scope delta (CTO ruling under standing owner delegation):
- Live-surface allowlist += code/src/runtime/tools/role_tools.js, bounded to ONE
  additive innerCtx line: `_client: (ctx && ctx._client) || undefined`.
- W-1.5 research_role.js wording widened from "chunks-guard only" to TWO named
  edits: (i) fail-closed chunks-guard; (ii) `_client` passthrough on the internal
  kb.retrieve invoke ctx (`{ root, _client: (ctx && ctx._client) || null }`).
- Both hops mirror the existing kb_tools.js convention (:110, :167): optional,
  undefined/null on all current paths (no scenario injects _client via
  role.invoke today), production behavior byte-equivalent, Track A clean,
  no §ARC change.
- Flag corrections recorded: S135 needs NO flag (fails at INPUT_SCHEMA before
  budget/retrieval); S136 needs NO flag (budget denial precedes retrieval) —
  supersedes the A-1-era CTO assumption.
---

---
## Amendment A-3 — 2026-07-05 — W-2 contract + hermeticity design (CC pre-inspection, CTO-verified)

W-2 pre-inspection (mandated by the S348 directive) surfaced, CTO-verified:
- API-type scenarios (S215 pattern) boot a real apiServer on a tempDir and hit
  real HTTP — the direct_tool invokeCtx._client seam cannot traverse this path.
- research_role defaults are anthropic/claude-opus-4-7 (research_role.js:92-93);
  production holds no ANTHROPIC_API_KEY. Without a provider override the
  /api/kb/research endpoint is broken in real use — a "scenario green / real
  path broken" reproduction caught before it shipped.

Scope delta (CTO ruling under standing owner delegation):
- W-2 body contract EXTENDED: POST /api/kb/research accepts optional
  `provider` and `model`, forwarded to role.invoke (production-motivated;
  W-5 real run will pass openai/gpt-4o — D2/PHASE-22 precedent).
- Server-level seam in the TWO NEW handlers only: invocations pass
  `{ root, _client: options._client || undefined }`, and role.invoke input
  gains `scenario_id: options._scenario_id || undefined`.
  start-api.js passes { port } only → both undefined in production →
  byte-equivalent. Test-infra fields kept OFF the public HTTP body by design.
- Live-surface allowlist += code/src/runtime/agents/adapters/mock_responses.json,
  bounded to ONE additive research entry (KNOWN + non-empty
  supporting_citations; PHASE-24/25/26 data-entry precedent).
- New test helper code/src/testing/helpers/kb_api_test_helper.js (covered by
  the existing scenario/test-infra clause; listed for completeness).
- S346 design ratified: dedup-before-fetch path (source_acquisition step 1
  precedes http.get) — zero-network full-chain proof; real fetch+embed is W-5.
- Backlog += reconcile role default_provider (anthropic/claude-opus-4-7) with
  the fleet provider decision (openai/gpt-4o) at the Anthropic-switch phase;
  interim: explicit provider passthrough (W-4 UI included).
---

---
## Amendment A-4 — 2026-07-05 — W-3.5: wire §8 audit into the real documentProject path

W-3 delivered role-level §8 enforcement, but conversationEngine.documentProject
invokes the documentation role WITHOUT artifact_path, so the citation audit is
inert on the owner's real path (CC pre-inspection Q4, CTO-verified). A guard that
never fires in production reproduces the phase's core failure mode.

Scope delta (CTO ruling under standing owner delegation):
- NEW work item W-3.5: after documentProject persists documentation.json, invoke
  the documentation role's audit against that persisted artifact_path so a
  FAIL_UNCITED result BLOCKS advancement to QUALITY_JUDGE (fail-closed), honoring
  citation_audit_override only via the existing decision-artifact-gated flag.
- Minimal-diff: reuse the W-3 role path; do NOT duplicate audit logic in the engine.
- Live-surface allowlist += code/src/ai_os/conversationEngine.js, bounded to the
  documentProject audit-wiring only. No §ARC change. Cost $0 (mock).
- NEW scenario S352_documentproject_blocked_on_uncited_claims (real documentProject
  path; asserts no advance + no persisted advancement on FAIL_UNCITED).
- Supersedes A-3's "ONE research entry" ceiling on mock_responses: the doc-synthesis
  entries added in W-3 (S349/S350) and any S352 entry are ratified additive test
  fixtures. (CTO erratum: the A-3 ceiling contradicted the W-3 instruction that
  required doc mocks.)
- Closure gate SU math updated: 345 pass / 0 fail / 5 skip (350 total).
---

---
## Amendment A-4-bis — 2026-07-05 — W-3.5 execution rulings (probe-driven, CTO-reproduced)

CC's pre-inspection probe (real citation_validator vs canned docs, offline)
proved — and the CTO independently reproduced — that unconditional §8 wiring
blocks S302's own happy-path doc (3 Pattern-1 hits), and that on the real path
any natural-language gpt-4o doc will FAIL_UNCITED since no pipeline caller
produces citations today.

CTO rulings (Option A adopted; B rejected — invented policy, guard dark for
KB-less projects; C rejected — violates fail-closed §3.5 and contract §7):
1. Wiring is UNCONDITIONAL per §7 ("hard gate, not advisory"). Placement
   clarified: documentProject invokes kb.validate_citations DIRECTLY on the
   persisted documentation.json (post-persist, pre-advance); thin engine-level
   FAIL_UNCITED→block + override + durable-record logic is authorized. A-4's
   "reuse the W-3 role path" reads as "reuse the tool + envelope semantics" —
   persist-after-role ordering makes same-invocation role-input reuse
   impossible (CTO wording, corrected).
2. ONE existing mock-key edit AUTHORIZED: mock|mock-doc-s302 — rephrase the
   three flagged sentences pattern-clean; S302 thereby proves happy-path
   advance WITH a passing audit. Verify S302's assertions are unaffected
   before editing; re-run the probe post-edit (expect PASS) as evidence.
3. Override outlet: body.citation_audit_override passthrough on documentProject
   (doc_provider/doc_model precedent), honored at the engine gate; audit
   outcome and any override durably recorded via the activity emitter
   (§ARC-legal) and attached to the returned payload.
4. RECORDED CONSEQUENCE (acknowledged under standing owner delegation): until
   citation generation exists in the pipeline, real uncited builds BLOCK at
   DOCUMENTATION per §7; escape valve = per-build override. Named backlog:
   wire kb.cite into documentation generation (candidate next phase).
5. Claim-detector patterns remain untouched (phase non-goal).
Gate math unchanged: 345 pass / 0 fail / 5 skip (350 total); scenarios S346–S352.
---

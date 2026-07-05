# PROMPT-STAGE-50 — Knowledge Base & Research Activation (capability #9, offline-first)

You are Claude Code, implementation arm of the Forge project at `d:\S\Halo\Tech\Forge-Claude`.
PHASE-49 is TRULY CLOSED (tag `phase-49-complete` → `d114623`). The owner has approved
opening PHASE-50 under CTO delegation (2026-07-05). This file is your session opener.
Save this file verbatim as `PROMPT-STAGE-50.md` in the repo root before anything else.

---

## §0 — MANDATORY STATE INHERITANCE (no code before this)

Read, in order:
1. `architecture/FORGE_V2_BLUEPRINT.md` — Part B-2 (Conductor Model) + Part F Track B table
2. `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-9 section (KB & Research)
3. `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` — FULL read; §7, §8, §9 are load-bearing
4. `progress/status.json` — confirm `current_task = PHASE-49-WINDOWS-PRODUCTION-POLISH-COMPLETE`, `next_phase = PHASE-50-PENDING-DECISION`
5. `artifacts/decisions/DECISION-2026-07-01-phase-49-closure.md`
6. `artifacts/decisions/_phase_49_checkpoints/` (both mid checkpoints)

Then run the baseline locally:
- `node bin/forge-test.js` → expected **338 pass / 0 fail / 5 skip (343)**
- `node bin/forge-doctor.js` → expected **HEALTHY, 0 critical, 3 benign warnings**
- `git log --oneline -3` + `git status` → report HEAD hash and tree cleanliness

**Post a Step 0 summary** (state read + baseline numbers + HEAD) and **STOP. Do not
write any code or any file other than this prompt file until the CTO replies "Step 0
verified — GO W-0".**

---

## §1 — DELIVERABLES (work items, strictly one at a time)

### W-0 — Decision artifact + status flip
Create `artifacts/decisions/DECISION-2026-07-05-phase-50-kb-research-activation.md`
with EXACTLY this content:

```
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
```

Then update `progress/status.json`: `current_task = "PHASE-50-KB-RESEARCH-ACTIVATION"`,
`next_step = "W-1 gap-map verification"`. Commit locally:
`PHASE-50 W-0: decision artifact + status open`. **Do NOT push.** Report and STOP.

### W-1 — Gap-map verification (read-only, no code changes)
Independently verify G-1..G-5 with file/line evidence (grep paths + line numbers).
If any CTO finding is wrong or incomplete → report it explicitly (bidirectional
Trust+Verify). Deliverable: evidence table in your reply. STOP for CTO GO.

### W-2 — API surface (Track A clean)
In `apiServer.js` add:
- `POST /api/kb/ingest` `{ url }` → `reg.invoke("kb.ingest_url", ...)` → returns SourceRecord summary
- `POST /api/kb/research` `{ question, project_id }` → `reg.invoke("agent.invoke", { role_id: "research", ... })` → returns ResearchFindings (citations included)
Input validation fail-closed. NO direct fs/fetch/child_process in handlers.
New scenarios: `S346_api_kb_ingest_url_happy`, `S347_api_kb_ingest_rejects_invalid_input`,
`S348_api_kb_research_returns_cited_findings` (mock-only, deterministic). STOP.

### W-3 — documentation_role §8 wiring
On document completion: call `kb.validate_citations`; `FAIL_UNCITED` →
`{ status: "BLOCKED", reason: "UNCITED_CLAIMS", uncited_claims }` per contract §8;
support `citation_audit_override: true`. New scenarios:
`S349_documentation_role_blocked_on_uncited_claims`, `S350_documentation_role_citation_override`.
Then write the mid-checkpoint (§3) and STOP for CTO zip verification.

### W-4 — Owner UI panel (vanilla JS, web/index.html only)
Minimal KB section: URL ingest input + sources list (GET /api/kb/sources) + research
question box + cited-findings rendering (citations visible with source titles). Plain
language labels (owner is non-technical). STOP.

### W-5 — Real E2E live run + Gate #10
Requires explicit owner approval IN CHAT with cost estimate re-shown (protocol: per-run
approval, ceiling $0.15). Then: ingest 2–3 real URLs → real embeddings → one research
question → cited findings. Evidence: `artifacts/audit/tool_audit.jsonl` rows + KB
cost_ledger rows + findings artifact. Gate #10: the OWNER repeats the flow himself from
the UI (ingest + ask + see cited answer). No closure on synthetic evidence alone. STOP.

### W-6 — Closure
Closure artifact `DECISION-2026-07-05-phase-50-closure.md`, status.json flip
(`next_phase = "PHASE-51-PENDING-DECISION"`), local closure commit. NO push until CTO
"push GO". Tag `phase-50-complete` goes on the closure commit hash (not HEAD if U-commits land).

---

## §2 — TRACK A RULES (binding)
Live surface = `apiServer.js` + `ai_os/**` + `runtime/**`. NO `fs.*Sync`, NO
`child_process`, NO direct `fetch()`, NO `new OpenAI()` outside §ARC-bounded homes.
All side effects via `reg.invoke(...)`. §ARC frozen at 10 — any need for a new
exception is an automatic STOP.

## §3 — MID-CHECKPOINT (binding)
After W-3: `artifacts/decisions/_phase_50_checkpoints/stage_kb_mid.md` — state, SU
numbers, files touched, gaps closed vs G-map. Owner uploads fresh local zip; CTO
verifies independently before W-4 GO.

## §4 — STOP-AND-REPORT TRIGGERS
Any new §ARC need · any new dependency · live-surface files beyond {apiServer.js,
web/index.html, documentation_role.js} + scenario/test files · citation_validator
heuristic changes · anything requiring web-search/TAVILY · any SU regression ·
any contract §7/§8/§9 ambiguity.

## §5 — CLOSURE GATE (deterministic, ALL required)
1. SU suite: **343 pass / 0 fail / 5 skip (348 total)** — the 5 new scenarios S346–S350 green
2. `forge-doctor` HEALTHY, 0 critical
3. Track A grep clean (fs.*Sync / child_process / fetch / new OpenAI outside §ARC homes = 0)
4. §ARC = 10 unchanged · L2 tools = 80 unchanged (no new tools in this phase) · roles = 13
5. G-1..G-5 all closed with evidence
6. Gate #10 owner real test PASSED (owner-run, from UI)
7. W-0 + closure artifacts + mid-checkpoint + status.json consistent
8. CTO independent verification on fresh local zip → then push GO → annotated tag on closure commit

## §6 — COST BUDGET
Mock-default everywhere. One approved live run (W-5): estimate ≤ **$0.15**
(embeddings ~$0.001 + one gpt-4o synthesis ~$0.05 + retry buffer). Kill bar **$3.00**.
Any real call before owner chat approval = protocol violation.

---
**First action now: save this file, execute §0, post Step 0 summary, STOP.**

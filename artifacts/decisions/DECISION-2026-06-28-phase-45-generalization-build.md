# DECISION-2026-06-28 — PHASE-45: Generalization Build (URL Shortener) — PROPOSAL

> Status: **ADOPTED (direction + project)** — ratified by owner Khaled in chat (2026-06-28): "موافق على توصياتك طالما باعلى درجات الاحترافية" (decide-and-proceed delegation on the CTO recommendation: option (أ) Generalization Build, project = URL shortener).
> **Real spend is NOT yet authorized by this ratification** — each real run requires a SEPARATE explicit owner spend-approval in chat with the estimate shown first (§4).
> Date: 2026-06-28. Author: CTO advisor.
> Chain: appends to the PHASE-44 closure chain (tag `phase-44-complete` → aa721f3). Supersedes nothing.

---

## 1. Context

PHASE-43 produced the first real idea→COMPLETE build — a **Notes API** — but it took **ten amendments (A-1..A-10)**, each hardening one gate of the pipeline (JSON-mode, scope fidelity, route quality, server-entry, timeouts, spec completeness, reviewer calibration, endpoint-path coherence). PHASE-44 (A-5) made the build loopback **self-correcting** (a RUN_TESTS failure now feeds its failing assertions back into the rebuild instead of re-rolling blind).

The open strategic question: **was PHASE-43 a one-off (the pipeline got tuned to the Notes API specifically), or did it generalize?** Every prior real build has been the same Notes API. We have never driven a *different* idea through the hardened pipeline.

## 2. Objective

Drive one **different** project — a **URL shortener** — from a plain-language idea to COMPLETE, with a real provider, and **measure how much of the pipeline now works without manual intervention**. The generalization signal is the count and nature of **upstream amendments** required (gaps that A-5's loopback cannot self-correct, i.e. architect/spec/reviewer-stage gaps). A clean or near-clean build is strong evidence the PHASE-43 hardening generalized; a marathon tells us exactly what is still Notes-API-specific. Either outcome is high-value.

## 3. Scope (LOCKED)

### 3.1 The demo project — URL shortener (deliberately different from Notes API)
A small in-memory REST URL shortener. Entity: a short link — `{ code, long_url, created_at, hit_count }`. Pure-JS in-memory storage (NO sqlite / no native deps), same constraint as PHASE-43. Acceptance criteria (also the generated test contract):
- **AC-1**: `POST /shorten` with a valid `{ url }` → **201** with `{ code, short_url, long_url }`; `code` is a **server-generated short alphanumeric string** (e.g. 6-char base62), **NOT** a sequential integer.
- **AC-2**: `GET /:code` for an existing code → **302** redirect with `Location: <long_url>`.
- **AC-3**: `GET /:code` for an unknown code → **404**.
- **AC-4**: `GET /stats/:code` → **200** with `{ code, long_url, hits }` (404 for unknown).
- **AC-5**: `DELETE /:code` → **204** for an existing code, **404** for unknown.
- **AC-6**: `POST /shorten` with a missing/invalid `url` → **400**.
- **AC-7**: `hit_count` **increments** on each successful resolve (`GET /:code`).

**Why these:** they re-exercise everything PHASE-43 hardened (routes incl. by-id, status codes incl. 404, validation, runnable server-entry, endpoint-path coherence — A-4/A-6/A-10) AND introduce three genuine novelties the Notes API never had: (1) a **generated short-code ID** (stress-tests the A-8 "sequential integer from 1" assumption), (2) a **302 redirect** response (not just JSON), (3) a **mutable hit counter** incremented as a side effect of a GET.

### 3.2 The "real" bar
COMPLETE = built + tested + an owner-readable test report showing PASS, rendered in the browser (Gate #10). **Live deployment is OUT of scope** (deployment_enabled=false; Gate 3 skipped) — identical boundary to PHASE-43 (the deploy leg is independently proven; excluding it bounds the generalization test).

### 3.3 Self-correction discipline (the heart of the test)
A-5's loopback (cap-aware) is the FIRST line of defense: on any RUN_TESTS failure, the rebuild is fed the failing assertions and retries automatically. **A manual amendment is opened ONLY for a gap A-5 cannot reach** — i.e. an *upstream* gap at architect / spec / reviewer (before RUN_TESTS), or a structural defect. So the amendment count measures precisely "upstream gaps the hardened prompts still miss on a novel domain" — the clean generalization metric.

### 3.4 Predicted first finding (honest forecast from §0)
The A-8 completeness clause in `docs/10_runtime/18b_ROLE_PROMPTS.md` (architect_v1 + spec_writer_v1) currently mandates "the ID-generation scheme — server-assigned, **a sequential integer starting at 1**". For a URL shortener this is wrong (it needs a generated short code). The most likely first amendment is **generalizing that clause** from "sequential integer from 1" to "a server-assigned ID scheme appropriate to the domain (a sequential integer for record entities; a generated unique short code for a shortener) — never user-supplied". If the reviewer rejects a short-code scheme as "not a sequential integer", that confirms the over-fit. This is exactly the generalization gap the phase exists to surface; it is forecast here, not pre-fixed (we let the real run show whether it actually fires).

### 3.5 Out of scope
No Track B capability (shell/env/browser/KB). No deployment. No change to A-5 itself (it is the mechanism under test, not the subject). Any amendment that touches the live surface follows the same Track A discipline as PHASE-43 (prompts append-to-tail; runtime edits prompt-construction/additive; no new §ARC without a STOP→amendment→approval).

## 4. Cost discipline (BINDING)

- §0 + the §A mock dry-run are mock/read-only: **$0**.
- Each §B real run requires a **SEPARATE explicit owner spend-approval in chat with the estimate shown FIRST** (the PHASE-43 per-run "موافق" cadence). No real key/call before that approval.
- Envelope: expected **~$0.30–1.00** total if the pipeline generalizes well (1–3 runs); **SOFT-STOP at $1.50** cumulative (STOP and report); **HARD-KILL at $3.00** (phase ceiling). Builder loopback cap = 2 per run (so A-5 fires).

## 5. Track A / §ARC

Live surface = `apiServer.js` + `ai_os/**` + `runtime/**`. The build driver + URL-shortener seeds are test-infra/spike (`scripts/**` + per-project artifacts), OUT of the live surface — like the PHASE-43/44 drivers. The real LLM calls route through the sanctioned `openai_adapter` (§ARC). §ARC frozen at **10**. Any amendment that needs a new side-effect home or §ARC entry → **STOP → amendment → owner approval** before code.

## 6. Execution structure

1. **CC §0 + read-only confirmation ($0).** CC reads Blueprint + Roadmap + status.json + this decision + the PHASE-43 + PHASE-44 decisions, confirms the full idea→COMPLETE path is intact (the PHASE-43 driver pattern, A-5 loopback wiring, the A-8 ID clause as the forecast risk), and reports before any code.
2. **§A — build the driver + MOCK dry-run ($0).** A test-infra driver under `scripts/` that feeds the URL-shortener owner-intent at OWNER_INTENT and walks the full pipeline in mock (deployment-skip, gate auto-approve, loopback cap=2, trace+report capture). Prove the chain walks clean in mock with the new spec. NO real calls.
3. **MID checkpoint** → `artifacts/decisions/_phase_45_checkpoints/stage_a_mid.md` → **owner zip → CTO verification.**
4. **§B — real run(s), each separately spend-gated.** Flip provider to openai; run the build. Let A-5 self-correct RUN_TESTS failures automatically. If an *upstream* gap blocks (architect/spec/reviewer) → STOP, author a minimal amendment (append-to-tail / additive), re-verify SU, get a fresh spend-approval, re-run. Record each run's cost + what it surfaced.
5. **CTO forensic verification** of the passing run (real generated code on disk; report PASS; Gate #10).
6. **Closure** — checkpoints + status.json + closure note recording the build, the **amendment count + each gap**, and the cost. LOCAL commit only until explicit push GO; closure zip cut freshly from the local folder.

## 7. Deterministic closure / acceptance gate

PHASE-45 is CLOSED only when ALL hold:
1. A real idea→COMPLETE build of the URL shortener completed with provider=openai (gpt-4o), reaching COMPLETE.
2. Real generated code on disk under `artifacts/projects/<id>/` (not mock stubs); generated files match the generated spec (incl. the generated short-code scheme + 302 redirect + hit counter).
3. RUN_TESTS produced a real `last_report.json` with `overall_status=PASS` (all generated scenarios pass, covering AC-1..AC-7).
4. The owner-readable report renders in the browser via the report viewer — green PASS card (Gate #10, owner-confirmed).
5. Actual real spend recorded and within the cost ceiling.
6. Track A clean; §ARC=10; full SU suite green (incl. any amendment's re-verify).
7. status.json `next_phase` advanced; §A + §B checkpoints written; the closure note records the build, cost, Gate #10, **and the generalization finding** (amendment count + what each surfaced).

**Generalization finding (recorded, NOT a pass/fail threshold):** the closure note states how many upstream amendments were needed and what each revealed. Interpretation (for our read, not a gate): **0–1 = strong generalization**; 2–3 = moderate (a few Notes-API over-fits remain); >3 = the pipeline is still substantially domain-specific (valuable, points to the next hardening targets). We do NOT fail the phase on amendment count — the gate is a passing build; the count is the signal we are buying.

## 8. Honest caveats / risks

- A build on a novel idea is **non-deterministic**; the run may surface gaps PHASE-43 never hit (that is the point). The $3 ceiling + A-5's automatic loopback bound the blast radius.
- The forecast A-8 over-fit (§3.4) may or may not fire; we let the real run decide rather than pre-patching (pre-patching would weaken the generalization signal).
- "Generalization proven" from ONE different project is **suggestive, not exhaustive** — a URL shortener is meaningfully different from a Notes API but is still a small in-memory REST service. A broader claim (e.g. a stateful CLI, or a service with persistence) would be a later, separately-scoped phase.
- If the URL shortener turns into a marathon, that is itself the finding (the pipeline is not yet general) — we stop at the ceiling and document, rather than chasing green indefinitely.

## Amendment log
- 2026-06-28 — **Owner-ratified** direction + project (decide-and-proceed). Real spend remains separately gated per run. CC session opener `PROMPT-STAGE-45.md` authored next; CC §0 precedes any code.

---

**END — PHASE-45 PROPOSAL (Generalization Build — URL Shortener)**

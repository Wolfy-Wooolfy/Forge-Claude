# PHASE-45 — STAGE B REAL RUN #3 CHECKPOINT (real gpt-4o, cap=4, owner spend-approved)

> Date: 2026-06-28
> Phase: PHASE-45 — Generalization Build (URL Shortener)
> Authority: `DECISION-2026-06-28-phase-45-generalization-build.md` (+ A-1 + A-1 §5); owner spend-approval for real run #3 (Khaled, 2026-06-28).
> Run: `PHASE45_MODE=real node scripts/spikes/phase45_url_shortener_full_build.js`, builder loopback **cap=4** (the one §C.0 driver edit). loop_id `02e449a1-989a-4af0-8c25-29abbc41aab6`.
> Real cost: **$0.28237** (run-delta). Cumulative PHASE-45 real spend: **$0.42564 + $0.28237 = $0.70801** (within $1.50 soft / $3 hard).
> Status: **STOPPED at DRIVER_LOOPBACK_CAP_REACHED (cap=4). Phase NOT closed. No commit/push/tag. Awaiting CTO forensic verification + decision.**

---

## 0. The one §C.0 change

`DRIVER_LOOPBACK_CAP` 2 → 4 in `scripts/spikes/phase45_url_shortener_full_build.js` (value-only; build path/seeding/providers unchanged — git diff = the single line). Engine `ITERATION_CAP=5` (conversation_graph.js:19) > 4, so cap=4 is fully effective (the engine never escalates before the driver stops at 4). *Note: the adjacent explanatory comment still reads "driver-side cap = 2" — left untouched per the "ONE driver edit only" directive; cosmetic only (the effective cap is the constant = 4).*

---

## 1. Outcome — (b) reached RUN_TESTS; cap=4 did NOT reach PASS; A-5 is non-monotonic

Upstream all passed again (reviewSpec APPROVED_WITH_CONCERNS — 4th consecutive clean gate). A-5 fired across all 4 build attempts; trajectory:

```
designTests → 7 scenarios (T-1..T-7)
build#1 → RUN_TESTS#1: FAIL  2 pass / 2 fail / 3 error   → loop_back
build#2 → RUN_TESTS#2: FAIL  3 pass / 1 fail / 3 error   → loop_back
build#3 → RUN_TESTS#3: FAIL  6 pass / 1 fail / 0 error   → loop_back   ← PEAK (one scenario from PASS)
build#4 → RUN_TESTS#4: FAIL  0 pass / 0 fail / 7 error   → loop_back   ← CATASTROPHIC COLLAPSE
driver cap=4 reached → STOP
```

**A-5 climbed to 6/7 (attempt 3) then DESTROYED it at attempt 4 (→ 7 errors).** More attempts did not converge to PASS; the extra attempt beyond the peak was actively harmful. A-5 has **no "keep-best-attempt" / monotonic guard** — it re-rolls each time and can regress catastrophically.

Evidence (copied for the zip): `run3_last_report.json` (attempt-4, 7 errors), `run3_loopback_signal.json`, `run3_trace.json`. Generated project (attempt-4, 5 files): src/server.js, src/routes/urlRoutes.js, src/controllers/urlController.js, src/models/urlModel.js, src/middleware/validatorMiddleware.js.

---

## 2. ✅ §5 / A-1 CONFIRMED WORKING — the redirect is now testable and the test_designer used it

`forge_tests/scenarios/T-3_get_short_code_redirects_successfully.json` (covers AC-2) asserts the redirect via:
- `{ "type": "response_status_equals", "expected": 302 }`
- `{ "type": "response_header_equals", "header": "Location", "expected": "http://example.com" }`

The test_designer **reached for `response_header_equals`** (the A-1 type, surfaced coherently by §5) to check the redirect's Location header — exactly the run-#2 gap, now closed at the test-design layer. **A-1 + §5 verified end-to-end in a real run.**

---

## 3. THREE blockers surfaced — all A-5-unreachable or A-5-harmful

### (A) ★ The forecast A-8 over-fit FIRED this run (spec level) — the headline generalization gap
`spec.json` decision: *"Implement a sequential integer counter for short code generation"*; **AC-5: "Server assigns sequential-integer IDs starting from 1 for the short codes."** `urlModel.js`: `let nextId = 1; const shortCode = nextId++;`. The A-8 clause (`18b:57`/`125`, "server-assigned, a sequential integer starting at 1") was applied to the URL shortener, **degrading the short-code scheme to sequential integers** — exactly the decision-§3.4 forecast. reviewSpec APPROVED it (it is now "internally consistent" per A-8, just domain-inappropriate). **Non-deterministic:** runs #1/#2 generated short codes (UUID / Math.random); run #3 fired the over-fit. This is the genuine upstream gap the phase was built to find — **A-5 cannot reach it** (a spec/architect decision, upstream of RUN_TESTS). Candidate amendment (CTO): generalize the A-8 clause to "an ID scheme appropriate to the domain — a sequential integer for record entities; a generated unique short code for a shortener — never user-supplied".

### (B) test_designer invented `response_status_equals` (not a registered type) — a NEW test-design defect
T-3's status assertion uses `response_status_equals`, which is **NOT** among the 9 registered types (the status type is `http_status_equals`, item 1 of the §5 enumeration). The harness returns `{ pass:false, reason:"Unknown assertion type: response_status_equals" }`, so **T-3 can never pass as written** — whenever the server runs, T-3 fails on this assertion. This is almost certainly the persistent **1-fail at the attempt-3 6/7 peak** (strong inference; see §5 forensic limitation). A-5-unreachable: A-5 would feed "Unknown assertion type…" to the BUILDER, which cannot fix a test. §5 fixed the run-#2 redirect-body mis-assertion; a DIFFERENT assertion-naming defect appeared here → the test_designer needs tighter assertion-name discipline (emit ONLY names from the exact registered list). Candidate amendment (CTO).

### (C) A-5 non-monotonic collapse — attempt-4 introduced a fatal SyntaxError
attempt-4 `urlController.js` declares `deleteUrl` TWICE: `const { deleteUrl } = require('../models/urlModel')` (line 1) AND `function deleteUrl(req, res)` (line 26). CTO-confirmed: `node --check` → **`SyntaxError: Identifier 'deleteUrl' has already been declared`**. The module fails to load → `server.js` can't boot → all 7 scenarios ERROR ("Server did not open port 3000 within 5000ms"). A-5, fed the attempt-3 failing data, over-corrected and shipped un-parseable code. The materializer codegen-quality defect class continues (run #1/#2: single-quoted-regex validators; run #3: duplicate-declaration syntax error) — in A-5's reach in principle, but A-5's blind-re-roll-with-feedback (no best-attempt retention, no pre-flight syntax check) does not reliably land it.

---

## 4. ID scheme (re-confirm) + cross-run picture

- Run #3 ID scheme = **sequential integer** (`nextId++`, per spec AC-5) — the A-8 over-fit. (Runs #1/#2 = generated short codes.)
- Endpoint paths run #3: `POST /shorten`, `GET /:shortCode`, `GET /stats/:shortCode`, `DELETE /:shortCode` (root-level resolve, matches the decision target). Redirect handler is correct (`res.redirect(302, longUrl)` + visit-count increment).

| Run | Upstream | ID scheme | A-5 trajectory (cap) | Terminal | A-8 over-fit |
|---|---|---|---|---|---|
| #1 | APPROVED | short code (random) | 5/7 → 3/7 (cap 2) | regressed | did NOT fire |
| #2 | APPROVED | short code (random) | 3/8 → 6/8 (cap 2) | improved, not PASS | did NOT fire |
| #3 | APPROVED | **sequential int** | 2/7 → 3/7 → **6/7** → 0/7err (cap 4) | peak then collapse | **FIRED** |

---

## 5. Forensic-capture limitation (now materially biting)

The PEAK attempt (3, 6/7 — the most informative state: did the redirect pass? which scenario was the 1-fail?) is **overwritten** by attempt-4's collapse, because the driver does not snapshot per-attempt `last_report.json`. So I can confirm the *summary* trajectory (trace) and the *scenario definitions* (persist from TEST_DESIGN) and the *attempt-4* code/report, but I cannot prove from disk attempt-3's per-scenario pass/fail (strong inference: the 1-fail was T-3 via the `response_status_equals` unknown type, and the redirect's Location check via `response_header_equals` passed). **Recommended (CTO's call):** before the next run, enhance the driver (scripts/-only) to snapshot each attempt's report (run3_attempt{N}_report.json) AND add a "keep-best-attempt" so a later regression doesn't discard a near-pass. Any such change + re-run needs a fresh spend-approval.

---

## 6. Interpretation (for the CTO — not a phase decision)

Three real runs have now **bought the generalization signal richly**:
1. **The A-8 over-fit is real and fired (run #3)** — the forecast was correct; the "sequential integer from 1" clause non-deterministically degrades the short-code domain. This is THE upstream generalization gap (A-5-unreachable) → the strongest amendment candidate.
2. **A-5 reliably fires and improves (runs #2/#3 both climbed) but is non-monotonic** — it can collapse a near-pass (run #3: 6/7 → 7-error SyntaxError). A larger cap alone is insufficient and can be harmful; A-5 needs a keep-best-attempt/monotonic guard (and/or a pre-flight `node --check` before accepting a build).
3. **The test_designer keeps producing assertion-naming defects** (run #2 redirect-body — fixed by §5; run #3 `response_status_equals` invented) → needs strict "registered-names-only" discipline.
4. **Materializer codegen quality** recurs (regex correctness; duplicate declarations) — a dedicated hardening (PHASE-46) and/or the A-5 pre-flight check.

The phase is NOT closed (no passing build across 3 runs; cumulative $0.708, within ceiling). The amendment count is now the signal the phase was buying: the build path generalizes structurally (correct routes, 302 redirect, stats, validation, runnable entry, endpoint coherence — all generated from a plain-language idea), but **closure on this novel domain needs the A-8 generalization (upstream) + an A-5 monotonic guard + test_designer assertion-name discipline.** Each is separately owner-gated.

---

## 7. STOP

- **STOPPED** at DRIVER_LOOPBACK_CAP_REACHED (cap=4). Phase remains OPEN. Cumulative real spend $0.70801 (within ceiling).
- Did NOT: close the phase, advance `status.json next_phase`, edit any prompt or live-surface file, work around, retry, or commit/push/tag. The only change this step is the cap value in the scripts/ driver (test-infra, not live surface). §ARC=10.
- Owner zips the LOCAL folder (excl node_modules) for CTO forensic verification.
- The candidate amendments in §6 (A-8 generalization; test_designer assertion-name discipline; A-5 keep-best-attempt/pre-flight check; per-attempt report capture) are CTO decisions — NOT applied here. Any further real run needs a FRESH explicit owner spend-approval (estimate shown first).

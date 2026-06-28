# PHASE-45 — STAGE B REAL RUN #2 CHECKPOINT (real gpt-4o, clean replay, owner spend-approved)

> Date: 2026-06-28
> Phase: PHASE-45 — Generalization Build (URL Shortener)
> Authority: `DECISION-2026-06-28-phase-45-generalization-build.md`; owner spend-approval for real run #2 (Khaled, 2026-06-28).
> Run: clean replay of run #1 — `PHASE45_MODE=real node scripts/spikes/phase45_url_shortener_full_build.js`, driver UNCHANGED (cap=2, no seeding, no prompt/build-path edit). loop_id `a162ddf0-0d5c-4063-8d84-43d16ebea78a`.
> Real cost: **$0.21814** (run-delta). Cumulative PHASE-45 real spend: **$0.20750 + $0.21814 = $0.42564** (within $1.50 soft / $3 hard).
> Status: **STOPPED at DRIVER_LOOPBACK_CAP_REACHED. Phase NOT closed. No commit/push/tag. Awaiting CTO forensic verification + decision.**

---

## 1. Outcome — (b) reached RUN_TESTS, did NOT converge within cap=2 — but A-5 IMPROVED this run

Same terminal state as run #1 (`DRIVER_LOOPBACK_CAP_REACHED`), but the A-5 loopback behaved **oppositely**: run #1
**regressed** (5/7 → 3/7); run #2 **improved** (3/8 → 6/8). Neither reached PASS within the 2-attempt budget.

```
OWNER_INTENT
  → confirmIdea(architect, real)      → SPEC_WRITER_FORMALIZE        ($0.01713)
  → formalizeSpec(spec_writer, real)  → REVIEWER_SPEC                ($0.03838)
  → reviewSpec(real) verdict=APPROVED_WITH_CONCERNS → COST_ESTIMATE  ($0.05706)   ← A-8 over-fit did NOT fire (again)
  → estimateCost → ENV_REPORT ($0.07673) → reportEnv gate_pending:1 → G1 APPROVE  ($0.09328)
  → designTests(real) → BUILDER  (8 scenarios T-1..T-8)              ($0.14062)
  → buildProject#1(materialize, real) → RUN_TESTS (5 files)          ($0.17817)
  → runTests#1: FAIL 3/8 (3 pass, 2 fail, 3 error) → loop_back → BUILDER     ← A-5 fires
  → buildProject#2(materialize, real) → RUN_TESTS (5 files)          ($0.21814)
  → runTests#2: FAIL 6/8 (6 pass, 2 fail, 0 error) → loop_back → BUILDER     ← A-5 IMPROVED (3→6, errors 3→0)
  → driver cap=2 reached → STOP
```

Evidence (copied into the non-gitignored spike dir for the zip):
`artifacts/spikes/phase45_url_shortener/run2_last_report.json`, `run2_loopback_signal.json`, `run2_trace.json`.
Generated project (attempt-2, 5 files): src/server.js, src/router.js, src/storage.js, src/shortCodeGenerator.js,
src/urlValidator.js (note: a DIFFERENT decomposition than run #1's 4 files — structural non-determinism confirmed).

---

## 2. Generalization re-confirmation — A-8 over-fit did NOT fire (3rd consecutive)

- `shortCodeGenerator.js`: `Math.random().toString(36).substring(2, 8)` — a generated base36 short code, **NOT** a
  sequential integer (despite the A-8 clause `18b:57`/`18b:125`). reviewSpec **APPROVED_WITH_CONCERNS** again (advanced).
- Endpoint paths this run (router.js): `POST /shorten`, `GET /:shortCode` (root-level resolve), `GET /:shortCode/stats`,
  `DELETE /:shortCode` — root-level, actually CLOSER to the decision §3.1 target than run #1's `/resolve/:code`.
- Field name consistent (code reads `longUrl`; tests send `{longUrl}`).
- **Upstream amendments required for the ID scheme / spec: still 0, across both runs.** Strong upstream generalization.

---

## 3. The 2 remaining failures — one in A-5's reach, one A-5 CANNOT reach

### T-2 `shorten_invalid_url` → FAIL (Expected 400, got 201) — SAME defect class as run #1 (regex-from-single-quoted-string)
- Test sends `{longUrl:"invalid-url"}`, expects 400 + `error.message="Invalid URL"`. Code returned **201** (accepted it).
- Root: `urlValidator.js` builds its regex from a **single-quoted JS string**:
  `'^((https?|ftp)://)?(www\.)?[a-zA-Z0-9]+(\.[a-zA-Z]{2,})+(/[a-zA-Z0-9#]+/?)*$'`. In a single-quoted string `'\.'`
  collapses to `'.'`, so `(\.[a-zA-Z]{2,})+` becomes `(.[a-zA-Z]{2,})+` where `.` matches ANY char — including the
  hyphen in "invalid-url" ("invalid" + ".url"-via-`.`-matching-`-`) → the pattern MATCHES → isValid true → 201.
- **This is the SAME root-cause CLASS as run #1** (regex built from a single-quoted string with escapes that silently
  collapse), manifesting in the OPPOSITE direction: run #1 `'\d'`→`'d'` made it TOO STRICT (rejected valid URLs); run #2
  `'\.'`→`'.'` makes it TOO PERMISSIVE (accepts invalid URLs). **Systematic materializer codegen defect**, confirmed
  across two independent runs. It is in A-5's reach (a code bug the failing assertion points at) — but cap=2 was not
  enough for A-5 to land it.

### T-3 `resolve_existing_short_code` → FAIL ("Response body is not a JSON object") — A HARNESS CAPABILITY GAP (A-5 cannot fix)
- Test: setup POST /shorten `{longUrl:"http://example.org"}`; exec GET `/{{created.shortCode}}`; asserts
  `http_status_equals=302` (**PASS** — the code correctly 302-redirects) AND
  `response_body_field_equals field="Location" expected="http://example.org"` (**FAIL** — "Response body is not a JSON object").
- The CODE IS CORRECT: `res.redirect(longUrl)` → 302 with `Location: http://example.org` (exactly AC-2). The TEST is the
  problem: it asserts the redirect target via a **body-field** assertion, but a 302 has no JSON body — the Location is a
  **response HEADER**.
- Root cause (CTO-verifiable, `harness_runner.js:31-33`): the L5b built-project assertion vocabulary is exactly THREE
  types — `http_status_equals`, `response_body_contains_key`, `response_body_field_equals`. **There is no
  `response_header_equals` / redirect-Location assertion.** So a 302 redirect's target (a CORE URL-shortener behavior,
  AC-2) is **structurally untestable** by the current harness. The test_designer, lacking a header assertion, mis-used a
  body-field assertion.
- **A-5 CANNOT fix this — and would make it WORSE.** A-5 feeds the failing assertion ("Location not found in body") to
  the BUILDER, which would push the next build to add a JSON body containing "Location" to the resolve response —
  **corrupting the correct 302 redirect** to satisfy a broken test. This is precisely an *upstream gap A-5 cannot reach*
  (decision §3.3): it lives at the test_designer/harness assertion layer, not in the build.

---

## 4. A-5 behaviour across the two runs (the second data point)

| | attempt-1 | attempt-2 | A-5 effect | terminal |
|---|---|---|---|---|
| **Run #1** | 5/7 (2 fail) | 3/7 (1 fail, 3 error) | **regressed** | cap=2 STOP |
| **Run #2** | 3/8 (2 fail, 3 error) | 6/8 (2 fail, 0 error) | **improved** (cleared all 3 errors) | cap=2 STOP |

- A-5 **fired naturally in both runs** (real, un-forced loopbacks — the first such in the project's history).
- Non-convergence is **NOT a clean one-off and NOT a clean systematic failure**: it regressed once, improved once.
  Run #2's clean upward trajectory (errors 3→0, pass 3→6) is evidence A-5 *is* working — it just needs **more than 2
  attempts** to land. **cap=2 is the binding constraint**, not a broken mechanism.
- Forensic-capture limitation persists (as in run #1): the driver does not snapshot per-attempt codegen prompts, and the
  materializer codegen is not traced under `artifacts/llm/requests/`, so the verbatim injected assertions are not on disk
  for this run. A-5's mechanism is deterministically CTO-verified in PHASE-44.

---

## 5. Cross-run synthesis (for the CTO — not a phase decision)

1. **Upstream generalization: STRONG.** Two independent real runs, a genuinely different domain, **0 upstream amendments
   for the ID scheme** — the forecast A-8 "sequential integer" over-fit did NOT fire either time (reviewer approved a
   generated short code both times). The hardened architect/spec/reviewer carried the URL shortener cleanly.
2. **A NEW upstream gap DID surface — at the harness/assertion layer, from the 302-redirect novelty (T-3):** the L5b
   assertion vocabulary has no header/redirect-Location assertion, so AC-2 (resolve → 302 + Location) is untestable and
   A-5 would corrupt the correct code chasing it. **This is the generalization gap the phase was built to find** — and it
   is A-5-unreachable, i.e. a candidate for a minimal CTO amendment (add a `response_header_equals` / redirect-aware
   assertion type to `runtime/builtproject/assertion_types/` + a test_designer prompt note to use it for redirects).
   NOTE: this is a **live-surface change** (runtime/**) — separately gated; NOT made here.
3. **A recurring BUILD defect class:** the materializer emits URL-validation regexes from single-quoted JS strings
   (escapes collapse), producing wrong validators (too strict in #1, too permissive in #2). In A-5's reach, but cap=2 is
   too tight to land it. Options (CTO's call): raise the builder loopback cap (e.g. 3–4) so A-5 gets more attempts;
   and/or a separate materializer codegen-quality hardening (prefer regex literals / well-tested URL validation).
4. **The build is otherwise high quality and coherent:** correct 302 redirect, hit counter, root-level paths,
   structured JSON errors, runnable server-entry, endpoint-path coherence — all generalized from a plain-language idea.

**Generalization verdict (our read, not a gate):** upstream ID-scheme generalization is strong (0 amendments); the
phase surfaced exactly ONE genuine upstream gap (the redirect-assertion harness gap) plus one recurring build-quality
defect (single-quoted regex) that needs a larger loopback budget than cap=2. The phase remains OPEN (no passing build yet).

---

## 6. STOP

- **STOPPED** at DRIVER_LOOPBACK_CAP_REACHED. Phase remains OPEN. Cumulative real spend $0.42564 (within ceiling).
- Did NOT: close the phase, advance `status.json next_phase`, edit any prompt or live-surface file, work around, retry,
  or commit/push/tag. Track A CLEAN; §ARC=10.
- Owner zips the LOCAL folder (excluding node_modules) for CTO forensic verification.
- Any subsequent real run requires a FRESH explicit owner spend-approval (estimate shown first). The two A-5-unreachable
  / build-budget findings above (redirect-assertion gap; loopback cap) are decisions for the CTO — not applied here.

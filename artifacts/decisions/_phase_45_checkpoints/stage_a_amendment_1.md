# PHASE-45 — STAGE A / AMENDMENT A-1 CHECKPOINT (mock/$0; implementation only)

> Date: 2026-06-28
> Phase: PHASE-45 — Generalization Build (URL Shortener)
> Authority: `DECISION-2026-06-28-phase-45-generalization-build.md` → AMENDMENT A-1 (CTO-authored, owner-ratified).
> Mode: implementation only — mock/$0, ZERO real LLM calls, NO real pipeline run.
> Status: **A-1 IMPLEMENTED + all closure criteria MET. STOPPED. No commit/push/tag. The cap-raised real re-run is the next, separately spend-approved step.**

---

## 1. What A-1 fixes

The one A-5-unreachable generalization gap real run #2 surfaced: a 302 redirect's target (AC-2) was untestable — the L5b assertion vocabulary had no header assertion, so the test_designer mis-used `response_body_field_equals(field="Location")` on a body-less redirect → false FAIL on correct code. A-1 adds a `response_header_equals` assertion (additive; the harness already captures headers and does not auto-follow redirects).

---

## 2. The four touch-points (exactly as A-1 §Fix items 1–4)

### (1) New assertion type — `code/src/runtime/builtproject/assertion_types/response_header_equals.js`
Contract identical to the existing types: `async function assert(params, context)` → `{ pass:true }` or `{ pass:false, reason }`; `module.exports = { assert }`. `params: { header, expected }`. Case-insensitive lookup: `context.response.headers[String(params.header).toLowerCase()]` (Node lowercases response header names). Returns:
- `{ pass:true }` on exact value match;
- `{ pass:false, reason:'No response headers captured' }` when `context.response.headers` is missing;
- `{ pass:false, reason:'Response header "<h>" not found' }` when the header is absent;
- `{ pass:false, reason:'Expected header <h> to equal <x>, got <y>' }` on value mismatch.
Pure evaluator — no `fs` / network / `child_process` / `new OpenAI` (grep-confirmed). §ARC unchanged.

### (2) Registration — `harness_runner.js` ASSERTION_TYPES (one line)
Added `response_header_equals: require("./assertion_types/response_header_equals"),` after `response_body_field_equals` (the registry is now 9 HTTP assertion types). No other change to harness_runner.js; the pre-existing `const { spawn } = require("child_process")` (line 27) is the §ARC-3-sanctioned spawn, untouched by A-1.

### (3) test_designer_v2 tail line — `docs/10_runtime/18b_ROLE_PROMPTS.md` (append-to-tail)
Appended ONE clause AFTER the A-4 CREATED-ID clause and BEFORE the closing fence:
> REDIRECT / HEADER ASSERTIONS (PHASE-45 A-1): for an endpoint returning an HTTP redirect (3xx), assert the redirect target via the Location response header using response_header_equals — { "type": "response_header_equals", "header": "Location", "expected": "<url>" }; NEVER assert a redirect target via response_body_field_equals (a redirect has no JSON body). Use response_header_equals for any response-header assertion.

**Proof the first 500 bytes of the prompt are byte-identical** (SU-mock matching invariant): `git diff` on 18b shows a SINGLE hunk at line ~1368 (the appended clause only); a HEAD-vs-working comparison of the test_designer_v2 prompt's first 500 chars returned `first500_identical = true`. (Note: per the A-2/A-4 record, the test_designer SU mock is TAG-matched, so a tail append is safe regardless — the first-500 guard is satisfied anyway.)

### (4) New SU coverage — positive + negative (2 scenarios)
- Helper `code/src/testing/helpers/response_header_equals_test_helper.js` (pure unit, no fs/tools — mirrors the S335 `runTInvariance` pattern; requires the evaluator and runs it against crafted contexts shaped exactly like `harness_runner` builds them).
- `S338_response_header_equals_positive.json` → `runHeaderMatchPass`: header present + value matches → PASS; mixed-case header name resolves (case-insensitive).
- `S339_response_header_equals_negative.json` → `runHeaderMissingOrMismatchFail`: header absent → FAIL (with reason); value mismatch → FAIL (with reason); no headers → FAIL.

---

## 3. Guardrails (all GREEN)

| Guardrail | Target | Result |
|---|---|---|
| Full SU suite | 330 baseline + 2 new = 332/0/5 | ✅ **332 passed / 0 failed / 5 skipped (337 total)**, EXIT 0. S338 ✓, S339 ✓; the 330 baseline all still PASS (no regression). |
| forge-doctor | 35 / 0 FAIL | ✅ **HEALTHY — 0 critical, 6 warning** (35 checks); `builtproject_runtime` PASS. EXIT 0. |
| Track A | only the 4 touch-points; no new fs/fetch/OpenAI/child_process on the live surface | ✅ git status = M decision + M harness_runner.js + M 18b + ?? response_header_equals.js + ?? helper + ?? S338 + ?? S339. The only forbidden-pattern grep hit is the pre-existing §ARC-3 `spawn` in harness_runner.js (unchanged). |
| §ARC | frozen at 10 | ✅ unchanged (pure evaluator; no new side-effect home). |
| first-500-bytes of test_designer_v2 | byte-identical | ✅ `first500_identical = true`; 18b diff is the single tail hunk. |

**Disclosure (status.json):** running forge-doctor re-patched `runtime_health` (last_doctor_run timestamp + self_test_last_result label) — the known automatic doctor refresh, not a deliberate edit. The SU suite leaves the tracked tree clean (PHASE-41 ephemeral overlay).

---

## 4. Honest observation for the CTO (NOT a STOP trigger; flagged, not acted on)

A-1's tail clause introduces a 9th assertion type, but the test_designer_v2 prompt BODY still says *"Use ONLY the 8 allowed L5b assertion types"* and enumerates 8 (without `response_header_equals`) at lines ~1286/1292/1297-1305/1356/1364. The tail clause is the most recent + most specific instruction (and names a concrete example), so it should be honored — but the *"ONLY 8 allowed"* constraint earlier in the prompt is a real internal tension that could make the real test_designer under-use the new assertion in the re-run. Reconciling that enumeration (e.g. "9 allowed" + adding `response_header_equals` to the list) is a **5th touch-point** that A-1 did NOT authorize and the STOP trigger forbids, so it was **left unchanged**. Likewise the `builtproject_runtime` doctor check still validates a fixed list of the 8 original types (the 9th is unvalidated by doctor but works at runtime). **CTO decision before the re-run:** widen the prompt enumeration (and optionally the doctor list) via a small follow-up, or accept the tail-clause-only minimal diff and observe whether the re-run's test_designer uses `response_header_equals` for the redirect. Both are defensible; I implemented exactly A-1's four touch-points and flag this rather than exceed scope.

---

## 5. STOP

- A-1 implemented; all A-1 closure criteria MET (new type present + registered; S338/S339 PASS; 330 baseline PASS; tail line appended with first-500-bytes intact; Track A clean; §ARC=10).
- Did NOT: run the real pipeline, spend, commit/push/tag, or edit any file beyond the four touch-points + the decision-artifact A-1 append + the two SU scenario/helper files.
- Owner zips the LOCAL folder (excl node_modules) for CTO verification.
- **Next step (separately gated):** the cap-raised real re-run (builder loopback cap > 2 so A-5 gets more attempts on the recurring single-quoted-regex defect; with the redirect now testable). That run needs a FRESH explicit owner spend-approval (estimate shown first), and — at the CTO's option — the prompt-enumeration reconciliation noted in §4 first.

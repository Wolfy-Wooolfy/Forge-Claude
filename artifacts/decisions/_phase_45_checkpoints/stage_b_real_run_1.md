# PHASE-45 — STAGE B REAL RUN #1 CHECKPOINT (real gpt-4o, owner spend-approved)

> Date: 2026-06-28
> Phase: PHASE-45 — Generalization Build (URL Shortener)
> Authority: `DECISION-2026-06-28-phase-45-generalization-build.md`; owner spend-approval for real run #1 (Khaled, 2026-06-28).
> Run: `PHASE45_MODE=real node scripts/spikes/phase45_url_shortener_full_build.js` — loop_id `e6d22aa2-ec94-4043-901e-2dbc82b613e4`.
> Real cost: **$0.20750** (within ceiling; soft-stop $1.50 / hard-kill $3.00 never approached).
> Status: **STOPPED at DRIVER_LOOPBACK_CAP_REACHED. Phase NOT closed. No commit/push/tag. Awaiting CTO forensic verification + decision on real run #2 (fresh spend-approval required).**

---

## 1. Outcome — neither (a) nor (b); a THIRD terminal state

Per the §B.1 taxonomy: NOT (a) COMPLETE-with-PASS, and NOT (b) an UPSTREAM gap (nothing stopped before RUN_TESTS).
The run **reached RUN_TESTS**, the **A-5 build loopback fired naturally** (first time ever on a real, un-forced
failure), but the rebuild **did not converge within cap=2** and the driver stopped at `DRIVER_LOOPBACK_CAP_REACHED`.

```
OWNER_INTENT
  → confirmIdea(architect, real)        → SPEC_WRITER_FORMALIZE        ($0.01640)
  → formalizeSpec(spec_writer, real)    → REVIEWER_SPEC                ($0.03372)
  → reviewSpec(real)  verdict=APPROVED_WITH_CONCERNS → COST_ESTIMATE   ($0.05266)   ← A-8 over-fit did NOT fire
  → estimateCost(real)                  → ENV_REPORT                   ($0.07293)
  → reportEnv(real)                     → gate_pending:1 → G1 APPROVE  ($0.09011)
  → designTests(real)                   → BUILDER  (7 scenarios T-1..T-7) ($0.13218)
  → buildProject#1(materialize, real)   → RUN_TESTS (4 files)          ($0.16906)
  → runTests#1: FAIL 5/7 (2 fail)       → loop_back → BUILDER          ← A-5 fires
  → buildProject#2(materialize, real)   → RUN_TESTS (4 files)          ($0.20750)
  → runTests#2: FAIL 3/7 (1 fail, 3 error) → loop_back → BUILDER
  → driver cap=2 reached → STOP (DRIVER_LOOPBACK_CAP_REACHED)
```

Trace: `artifacts/spikes/phase45_url_shortener/phase45_trace.json`. Generated project (attempt-2, latest):
`artifacts/projects/phase45_url_shortener/` (src/server.js, src/router.js, src/services/URLShortenerService.js,
src/store/InMemoryStore.js; package.json deps nanoid/express/body-parser; real `npm install` ran).
Report: `forge_tests/last_report.json` (attempt-2). Loopback signal: `forge_tests/loopback_signal.json`.

---

## 2. The headline generalization finding — the forecast A-8 over-fit did NOT fire (0 upstream amendments)

**This is the signal the phase was buying, and it is POSITIVE for upstream generalization.**

- The real **architect + spec_writer generated a short-code scheme**, NOT a sequential integer, despite the A-8
  clause mandating "server-assigned, **a sequential integer starting at 1**" (`18b:57` + `18b:125`):
  - `spec.json` decision: *"Use UUID for generating short codes within the URLShortenerService."*
  - Generated code `URLShortenerService.generateShortCode()`: `Math.random().toString(36).substring(2, 8)`
    — a 6-char base36 random code (neither sequential int, nor UUID, nor user-supplied).
- **`reviewSpec` returned APPROVED_WITH_CONCERNS** (advanced to COST_ESTIMATE) — it did **NOT** ESCALATE/reject the
  short-code scheme as "not a sequential integer." The forecast (decision §3.4) **did not materialize on this run.**
- The three URL-shortener novelties all survived into the spec/tests/code: a **generated short code** (AC-1/T-1),
  a **302 redirect** (T-2 asserts `http_status_equals=302`), a **hit/visit counter** (stats endpoint + AC-2/AC-3).
- Endpoint-path coherence (A-10) **held**: generated tests target `/shorten`, `/resolve/:code`, `/stats/:code`,
  `/delete/:code` — exactly the routes the generated `router.js` serves (no /api drift; code↔tests agree).

**Upstream amendments required by this run: 0.** Architect, spec_writer, and reviewSpec all handled a genuinely
different domain with the PHASE-43-hardened prompts unchanged. The A-8 generalization gap we forecast as the likely
first amendment did not trigger.

---

## 3. Why it didn't reach COMPLETE — a BUILD-level (materializer) non-convergence, NOT an upstream gap

The blocker is downstream of RUN_TESTS (A-5's domain), so it is NOT an upstream gap and NOT a basis for a prompt
amendment under the decision's criteria (§3.3: amend ONLY for a gap A-5 cannot reach).

**Single root defect in attempt-2: `POST /shorten` rejects a VALID url with 400.** From `last_report.json`:
- **T-1** create_short_code_with_valid_url → **FAIL**: `Expected HTTP 201, got 400`; keys `shortCode`/`shortLink` absent.
- **T-2 / T-3 / T-4** (resolve / stats / delete) → **ERROR**: `Unresolved scenario placeholder {{created.shortCode}}
  — the create-first setup response did not provide field 'shortCode'`. These are CASCADES of T-1: their create-first
  setup POST /shorten also 400'd, so the A-4 fail-closed `{{created.shortCode}}` resolver correctly errored.
- **T-5** (invalid url → 400) **PASS**; **T-6** (resolve unknown → 404) **PASS**; **T-7** (delete unknown → 404) **PASS**.

Root cause (CTO-verifiable in `src/services/URLShortenerService.js` attempt-2): `validateUrl()` builds its regex from a
**single-quoted JS string** containing regex escapes — `new RegExp('^(https?:\/\/)?' + '...[a-z\d]...' + ...)`. In a JS
single-quoted string `'\d'`→`'d'`, `'\.'`→`'.'`, `'\/'`→`'/'`, so the compiled pattern is corrupted (digit classes
become the literal letter `d`, etc.) and it rejects `http://www.example.com`. A classic materializer codegen-quality bug
(regex-in-a-single-quoted-string). This is exactly the class A-5 exists to self-correct.

---

## 4. A-5: fired naturally (first time) but did NOT converge within cap=2

- **Fired:** attempt-1 RUN_TESTS FAIL (5/7) → `loop_back:true` → BUILDER → attempt-2 buildProject ran
  (`iteration_count` > 0; two distinct real materializer calls confirmed by the cost deltas
  buildProject#1 $0.0369 vs buildProject#2 $0.0384). This is the **first natural (un-forced) A-5 loopback** —
  PHASE-44 Gate B was a *forced* loopback; this one arose from a real build failure on a novel project.
- **Did NOT converge — it regressed:** attempt-1 5/7 (2 fail) → attempt-2 3/7 (1 fail + 3 error). The rebuild changed
  the build and broke the create path (validation regex), turning a likely-passing T-1 into a 400 and cascading
  3 placeholder errors. `loopback_signal.json` (attempt-2) records `failed_ids: [T-1, T-2, T-3, T-4]`.
- cap=2 reached → driver STOP. This is the **PHASE-44 §8 honest caveat made concrete**: "A-5 raises the floor
  (informed retry) but does not make builds deterministic." On this run the non-deterministic rebuild regressed
  rather than improved within the 2-attempt budget.

**Forensic-capture limitation (honest):** the PHASE-45 driver does NOT snapshot per-attempt codegen prompts or
per-attempt reports (the PHASE-44 spike did). The materializer codegen call is also not written under
`artifacts/llm/requests/` (verified: no `PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS` marker anywhere in the PHASE-45
artifacts; `find artifacts/llm -newermt 13:55` is empty). So for THIS run I can confirm A-5 **fired** (loopback +
iteration_count>0 + prior report present ⇒ repair_feedback built per the proven mechanism) and that attempt-2 was a
**materially different build** — but I cannot grep-prove the verbatim injected assertions from disk. A-5's mechanism
itself is deterministically CTO-verified in PHASE-44 (S335/S336/S337 + Gate B). Enhancing the driver to persist each
attempt's codegen prompt + report is a recommended forensic improvement for the next run (CTO's call; it would change
only the `scripts/` driver, still Track A — but any re-run needs a fresh spend-approval).

---

## 5. Cost + guardrails

- Real spend this run: **$0.20750** (trace `cost.run_delta_usd`; per-hop deltas in §1). Recorded in the project agent
  ledger (`artifacts/agent/cost_ledger.jsonl`). Soft-stop $1.50 / hard-kill $3.00 never approached.
- Track A: **CLEAN** — no live-surface edit (no apiServer.js / ai_os/** / runtime/** change). The only repo changes are
  `scripts/spikes/phase45_url_shortener_full_build.js` (STEP A) + per-project artifacts under
  `artifacts/projects/phase45_url_shortener/` + `artifacts/spikes/phase45_url_shortener/` + these checkpoints +
  the STEP-A forge-doctor `status.json` runtime_health auto-refresh (disclosed in stage_a_mid.md). **§ARC=10**, untouched.
- No prompt edited, no workaround applied (per §B.1 / STOP triggers).

---

## 6. Interpretation (for the CTO — not a phase decision)

- **Upstream generalization is strong on this run: 0 amendments.** The hardened architect/spec/reviewer carried a
  genuinely different domain (generated short code + 302 redirect + hit counter), and the forecast A-8 over-fit did NOT
  fire — the reviewer accepted a non-sequential-integer ID scheme. This is the headline result of the generalization test.
- **The phase is NOT closed:** the closure gate requires a passing idea→COMPLETE build (§7), and this run ended at
  RUN_TESTS via a build-level validation defect that A-5 did not converge on within cap=2.
- **No upstream amendment is indicated** by this run (the blocker is in A-5's reach, not an architect/spec/reviewer gap).
  The defect is materializer codegen non-determinism (a broken validation regex). Per the decision's discipline, the
  remedy is NOT a prompt amendment — options are the CTO's call: (i) a fresh real run #2 (a different roll may converge,
  possibly with a higher builder loopback cap so A-5 gets >2 attempts); (ii) enhance the driver to capture per-attempt
  prompts/reports for tighter forensics; (iii) a separate, owner-gated materializer codegen-quality hardening
  (e.g., regex-construction robustness) if regression recurs across runs. Each real run needs a fresh spend-approval.

---

## 7. STOP

- **STOPPED** at DRIVER_LOOPBACK_CAP_REACHED. Phase remains OPEN.
- Did NOT: close the phase, advance `status.json next_phase`, edit any prompt, work around, retry, or commit/push/tag.
- Owner zips the LOCAL folder (excluding node_modules) for CTO forensic verification.
- Any subsequent real run requires a FRESH explicit owner spend-approval (estimate shown first).

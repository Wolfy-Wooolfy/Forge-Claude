# DECISION-2026-08-04-phase-55-closure

**Date:** 2026-08-04
**Status:** CLOSED (LOCAL) — push + annotated tag `phase-55-complete` (on the CLOSURE
COMMIT HASH, never HEAD) await the CTO's closure-diff verification + push GO
**Phase:** PHASE-55 — HARDENING BATCH (zero new capability)
**Plan artifact:** `DECISION-2026-08-03-phase-55-hardening-batch.md` (rulings R-1..R-26, erratum E-1, CTO-F-A..G)
**Checkpoints:** `_phase_55_checkpoints/stage_spend_mid.md` (C1 + real-proof addendum) ·
`stage_loop_mid.md` (C2) · `stage_preclosure.md` (C3 + R-18 measurement + R-7 cycle addendum) ·
`stage_closure.md`

---

## 1. Outcome — verdict

**PHASE-55 is COMPLETE.** Five hardening items, each independently revertible, each
proven RED-before-GREEN, at a total real cost of **$0.0000135**.

**What the owner got, plainly:** (1) كل نداء AI حقيقي — حتى في مرحلة بلورة الفكرة القديمة —
صار يظهر في دفتر تكلفة واحد ويتحرك به غطاء الميزانية فعلياً؛ (2) في مشاريع الـ MVP، لو
البناء فشل مرتين، فورج يسألك بدل ما يحرق المحاولات في صمت؛ (3) حِزمة الاختبارات لم تعد
تحمرّ على جهاز بلا Python — تتخطى بوضوح؛ (4) RUN_FORGE.bat لم يعد ينهار عند إعادة
التشغيل فوق عملية ميتة؛ (5) الوثائق تقول الحقيقة: حدود الغطاء، سلوك السؤال الجديد،
والأرقام المصححة.

## 2. Work items — what each closed, with RED/GREEN evidence pointers

| Item | Closed | RED evidence | GREEN evidence |
|---|---|---|---|
| **W-1** spend visibility (single seam: wrap `chat.completions.create` on the `getClient()` client per R-12; sentinel `_legacy_stage_a` + budget inclusion per R-11(ii); R-21 first-activity lifetime bound; R-22 marker persisted; 3 live files exactly per the re-bound R-8) | **PHASE-54 R-40** (`UNMETERED-LEGACY-PROVIDER-SPEND`) + CTO-F-D (delayed-DoS design trap, closed by construction) + F-8 (marker silently dropped) | C1 §2: S384 RED — legacy call completes, cap number unchanged, marker absent (376/1/5) | C1 §2: ALL PASS 377/0/5 (382); **C1 real-proof addendum (2026-08-04): ONE real gpt-4o-mini call through the REAL client — booked $0.0000135 = independent recompute exactly, divergence $0; cap moved on real data incl. pre-existing `phase54_gate10_demo` 0.65714→0.65715** |
| **W-2** owner escape on non-convergence (R-16 predicate term-for-term; +22-line pure insertion after the R-10 branch; mvpLoopEngine ZERO touches) | **PHASE-54 R-45** (`R10-NO-OWNER-ESCAPE-ON-FIRST-BUILD`) | C2 §3: S385+S386 RED (blind loop_back through both the direct engine AND live HTTP; 377/2/5) | C2 §3: ALL PASS 379/0/5 (384); R-10 precedence held (S377 green); real path discharged per R-10 by S386 |
| **W-3** S57 environment guard (`"requires_binary": "pip3"` — value MEASURED per R-17, both probes raw in C3 §1) + S387 meta-lock | **PHASE-54 R-14** (S57 red-suite-instead-of-SKIP on Python-absent machines) | C3 §1: double RED in one stripped-PATH run — S57 FAIL + S387 declaration-absent (378/2/5) | C3 §1: GREEN both ways — 380/0/5 present / 379/0/6 absent, matching the CTO's pre-declared arithmetic exactly |
| **W-4** restart-safe RUN_FORGE.bat (tolerant `pm2 delete forge` BEFORE the port sweep; R-18 Task-Scheduler inventory: no conflict, no scope growth; boot dump untouched) | the pm2 restart defect ("Process 0 not found" + TypeError on `pm2_env` at API.js:1718) | C3 R-7 addendum: RED reproduced VERBATIM with the explicit old commands | C3 R-7 addendum: five-leg cycle through the ACTUAL scripts, zero errors; recovery proven (pm2 online + HTTP 200 + health ok); `dump.pm2` still `[]` |
| **W-5** docs + convention (R-19 waiver; before/after quoted in C3 §4) | the factually-wrong "(LOCAL; no push/tag)" convention; the 24_MVP_LOOP_CONTRACT §9 drift (F-5); the missing W-1 ledger/budget semantics in 17_AGENT_RUNTIME_CONTRACT; the missing owner-facing R-25/R-26 disclosures | before-texts quoted in C3 §4 | after-texts quoted in C3 §4; arithmetic 365+11=376 CTO-checked |

## 3. Final gate numbers (Step-1 run, 2026-08-04)

| Gate | Result |
|---|---|
| SU suite (normal PATH) | **ALL PASS — 380 / 0 / 5 (385)**, exit 0 |
| SU suite (Python-stripped PATH, R-6 alternate) | **ALL PASS — 379 / 0 / 6 (385)**, exit 0 — S57 `skip: binary not found: pip3` |
| N (new scenarios) | **4** — S384-S387; 385 files = 381 + 4 |
| forge-doctor | **exit 0** — `✓ HEALTHY — 0 critical, 4 warning`; 35 checks: **31 PASS / 4 WARN / 0 FAIL**; WARNs are the four pre-existing environment/backlog items (providers_registered 12-legacy · disk_space 675.4 MB · container_runtime no daemon · secrets_in_env_var) |
| Track A (diff vs baseline `9e35e46e` over code/src) | added lines contain **zero** raw `fetch(` / `child_process` / write-side `fs.*Sync`; the single `new OpenAI(` addition is the relocated construction INSIDE `openAiAdapter.js` — the explicitly sanctioned location |
| §ARC | **10** (authoritative line 18_AGENT_ROLES_CONTRACT.md:371) — frozen, none added |
| L2 tools | **81** (live registry count) |
| Agent roles | **13** |

## 4. Rulings index R-1..R-26 + erratum + CTO findings (full text in the plan artifact)

R-1 hardening-only/revertible · R-2 test-first RED→GREEN · R-3 §ARC frozen 10 ·
R-4 mock-default, single approved real proof · R-5 W-2 narrow · R-6 both gate counts ·
R-7 W-4 proven by execution · R-8 live-surface lock (re-bound twice, honored) ·
R-9 gitignored evidence pasted · R-10 real-path scenario (S386) · R-11 cap's-own-number
predicate, choice (ii) · R-12 the getClient() client is the seam · R-13 chat-only ·
R-14 streaming rows visible-not-costed with marker · R-15 cross-ledger visibility
enumerated (amended by E-1) · R-16 the W-2 predicate · R-17 W-3 by measurement ·
R-18 Task-Scheduler inventory first · R-19 R-2 waiver for W-5, transcript for W-4 ·
R-20 confirmations · R-21 lifetime-bounded legacy contribution · R-22 marker persisted
+ read back from disk · R-23 reverse_vision double-count accepted, bounded by
measurement (corrected by CTO-F-E to max(observed)) · R-24 A-2 field convention
verified · R-25 pre-first-activity gap accepted + owner-facing disclosure ·
R-26 escape-behavior consequence formalized + owner-facing disclosure.

**Erratum E-1 (CTO; detected by CC/F-9):** R-15's "not double counting within the one
the cap reads" was WRONG for reverse_vision-via-agent.invoke.

**CTO-F-A..G:** A defineProvider third seam class (enumerated) · B Task-Scheduler
third supervisor (inventoried + MEASURED) · C sentinel-only delivers zero cap closure
(→R-11) · D unbounded legacy total = delayed DoS (→R-21) · E R-23(2) figure was a
mean not a max — corrected to max(observed) $0.009665 = 0.01933%/$50, 0.96650%/$1 ·
F the 36 project_state.json restart-churn files are excluded from the closure commit
(explicit-paths rule) · G two pricing tables now write one ledger — F-6 sharpened
below.

## 5. Owner-facing disclosures (binding, verbatim from the contract docs)

**R-25 (17_AGENT_RUNTIME_CONTRACT.md §5):** غطاء الميزانية يحسب إنفاق الـ AI بدءاً من
أول نشاط بناء فعلي للمشروع في سجل التكلفة. **محادثات بلورة الفكرة المبكرة التي تسبق
أول نشاط بناء تظهر في السجل لكنها لا تُحتسب ضد غطاء المشروع** — الإنفاق ما قبل البناء
مرئي لكنه غير محدود بالغطاء. / The cap counts spend from first build activity onward;
earlier ideation spend is visible in the ledger but not capped.

**R-26 (24_MVP_LOOP_CONTRACT.md §7):** في مشاريع الـ MVP، لو البناء فشل في الاختبارات
مرتين، فورج **هيسألك أنت** بعد المحاولة الفاشلة الثانية بدل ما يعيد المحاولة في صمت
لحد الحد الأقصى. / On MVP projects Forge asks you after the second failed attempt
instead of silently retrying toward the cap.

## 6. Spend

**Total real cash: $0.0000135 of the $3.00 kill bar** (the single owner-approved W-1
real proof; envelope $0.02, used 0.07%). Ledger delta stated separately: **3 rows**
(first-activity seed $0 + dry sentinel $0 + the real sentinel row), estimated column
total $0.0000135, actual column total $0.0000135. Every other leg of the phase — all
SU work, all diagnostics, the R-7 cycle, the R-18 measurement — was **$0**.

## 7. Backlog (raised or carried; none fixed here)

1. **R-23 reverse_vision double-count in the cap's ledger** — worst case
   max(observed) $0.009665 = 0.01933% of the $50 default cap per intake (CTO-F-E).
2. **R-25 pre-first-activity legacy spend is visible but not capped** — bound is
   first-activity, not project creation. Owner-facing disclosure shipped in W-5.
3. **R-14 streaming spend VISIBLE but NOT COSTED** (`tokens_unavailable` marker;
   costing needs usage capture that must not mutate the request).
4. **R-17 `requires_binary` cannot express pip3-OR-pip** (single string; array =
   capability change).
5. **R-18(c) stale boot mechanism — MEASURED, not inferred:** the AtLogOn ForgeAPI
   task runs only `pm2 resurrect`; `dump.pm2` measured `[]` (2 bytes) while the
   owner's live forge ran — a fresh install does NOT auto-start Forge at boot;
   INSTALL_FORGE.bat:72-75's "sole boot mechanism" comment is stale. Fix = boot
   behavior change = its own decision.
6. **F-6 SHARPENED per CTO-F-G — two pricing tables now write ONE ledger**
   (`artifacts/agent/cost_ledger.jsonl`): the W-1 seam's `LEGACY_PRICING_PER_1M`
   (`code/src/providers/_contract/openAiAdapter.js`, longest-prefix-first, gpt-4o
   at the CORRECT $2.50/$10.00, non-zero default) vs
   `agent_tools._estimateCostUsd` (`code/src/runtime/tools/agent_tools.js:22-37`,
   gpt-4o at $5/$15 ≈ 2x over) and `_adapter_contract.estimateCost`
   (`code/src/runtime/agents/_adapter_contract.js:101-107`, chars/4 + output=2×in +
   4-dp rounding that books $0 for small calls); `providerTrace.PRICING_TABLE`
   (`code/src/providers/_contract/providerTrace.js:7-12`) is correct but feeds the
   v2-contract path only. The seam's table is the correct one; the agent path's
   over-estimate errs safe for a cap. Reconciliation = estimator work = its own
   phase; reconcile toward the seam's table.
7. **CTO-F-F workspace_path drive-letter case churn** — a restart flips
   `workspace_path` "D:" ↔ "d:" across 36 tracked `project_state.json` files
   depending on invocation case; harmless but pollutes diffs. Left uncommitted for
   the owner.
8. Carried from PHASE-54: F-5 `owner_gate_id: 2` hardcoded on LOOP_BACK rows ·
   `phase_16` stale "ACTIVE" in status.json · `_invokeRole` 30s comment vs 150000ms ·
   `estimateCost` does not persist cost_estimate.json · providerTrace
   response-capture gap for the agent.invoke path · `getTotalCost` 5-dp display
   rounding (noted during the real proof; rows keep full precision).

## 8. Closure gate — MET

- [x] SU exact counts BOTH ways per R-6: 380/0/5 (385) present · 379/0/6 (385) absent
- [x] Track A clean · doctor exit 0 (31/4/0 of 35) · §ARC 10 · L2 81 · roles 13
- [x] RED-then-GREEN pasted per item (C1/C2/C3); W-4 executed transcript per R-7
- [x] W-1 real proof executed with owner approval — ledger delta AND real cash reported
- [x] Closure artifact (this file) + status.json flip + closure checkpoint
- [ ] Push + annotated tag `phase-55-complete` on the CLOSURE COMMIT HASH — **await
      the CTO's closure-diff verification + push GO**

## 9. PHASE-56 seed candidates (owner-gated — NOT decided here)

MVP-loop Slice 2 (re-engagement after ACCEPTED — R-17/PHASE-54) · estimator
reconciliation toward the seam's table (backlog #6) · boot-mechanism repair
(backlog #5) · test_designer reliability · Browser Automation 7-D · Anthropic
provider switch · legacy provider v2 migration (12 pre-v2).

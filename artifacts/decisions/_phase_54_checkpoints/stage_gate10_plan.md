# PHASE-54 — Gate #10 Plan + Estimate: stage_gate10_plan (per CTO Gate-preparation GO §A)

- Date: 2026-07-30
- Phase: PHASE-54 (Iterative MVP Loop — Slice 1) · Rulings R-1..R-22
- **Status: PREPARATION ONLY — $0 spent. NO real provider call has been made. Real spend
  starts ONLY after the owner's explicit approval arrives in chat (relayed by the CTO),
  after which the driver's real legs unlock via FORGE_GATE10_OWNER_APPROVED=1.**

---

## 1. Driver — `scripts/spikes/phase54_gate10.js` (§A.1)

Resumable stages: `preflight` / `dry` / `real-a` / `real-b` / `real-c` / `verify` / `status`.

- (a) **Fresh demo project:** `phase54_gate10_demo` (never an existing project; real-a
  REFUSES to run if the directory already exists). `mvp_loop.enabled=true` with EXPLICIT
  `provider: "openai", model: "gpt-4o"` on the block (R-18). Demo idea: tiny personal
  notes REST API (create / list / delete-with-404, Express, in-memory).
- (b) **Owner turns are never scripted in real legs.** real-a drives vision-locked intake →
  architect → spec → spec-review → cost → env + Gate-1 APPROVE (driver, structured — the
  MVP-loop turns are the human-witness surface, Gate 1 is not) → TEST_DESIGN (real scope
  derivation) → BUILDER → RUN_TESTS → **PAUSES at AWAITING_OWNER_REVIEW**. The owner's
  REFINE and later ACCEPT enter through the REAL runtime path — browser UI → 
  `POST /api/ai-os/chat` → `processMessage` → `_handleMvpReview` → real gpt-4o
  interpretation. real-b rebuilds + re-presents and pauses again; real-c (post-ACCEPT)
  runs reviewProject → judgeQuality and holds at Gate 2.
- (c) **Evidence** under `artifacts/spikes/phase54_gate10/`: per-step JSON, mvp artifact
  snapshots (scope/report/feedback/manifest/project_state) at every pause, the loop-graph
  audit log copy, the ledger baseline + delta, and `prompt_trace.jsonl`.
- **Hard cap enforced in the driver:** ledger delta > **$1.00** at any stage boundary ⇒
  abort with CAP_ABORT evidence. Real legs additionally hard-require
  `FORGE_GATE10_OWNER_APPROVED=1`.

### R-24 (was F-G2) — prompt-trace decorator: APPROVED + all five conditions satisfied
The production agent.invoke path writes NO request trace (the PHASE-48 providerTrace gap
family), so criterion 5 needs a capture mechanism. Implemented and hardened per R-24:

| Condition | How it is met |
|---|---|
| (i) strictly pass-through | prompt string COPIED for evidence, then `realAdapter.invoke.apply(realAdapter, arguments)` — original arguments object, original `this`, result returned unmodified |
| (ii) no error handling around the delegate | the delegate call is the last statement; nothing wraps it — exceptions propagate untouched (the evidence write above it is also unguarded, so an evidence failure surfaces loudly) |
| (iii) spike-only | lives solely in `scripts/spikes/phase54_gate10.js`; `code/src` byte-identical, no seam/hook anywhere in production |
| (iv) DRY re-run proves non-interference | **CONTROLLED experiment done — verdict `NON_INTERFERENCE_PROVEN`** (below) |
| (v) evidence states the instrumentation | `instrumentation.json` written at arm time + `captured_by` on every trace line + a note in `dry_result.json` and in `gate10_result.json` |

**R-24(iv) controlled experiment (both arms $0):** the first comparison confounded two
changes (decorator + the R-23 documentation step), so the driver gained a control switch
(`FORGE_GATE10_NO_RECORDER=1`) and both arms were re-run on the IDENTICAL 11-step sequence
— decorator as the ONLY variable. Result (`dry/dry_decorator_comparison.json`):
**16/16 evidence files identical after timestamp normalization · both arms `DRY_PASS` ·
both ledger deltas `{rows: 12, usd: 0}` · 12 prompts captured (incl. BOTH materializer
codegen prompts) · verdict `NON_INTERFERENCE_PROVEN`.**
Scope note kept honest: the owner's two feedback interpretations run in the SERVER process
(no recorder there); criterion 5 concerns the SECOND MATERIALIZER prompt, which runs inside
the driver (real-b) and IS recorded.

## 2. Owner participation mechanics (§A.2) — validated at $0

**Path (i) — the REAL web UI. VALIDATED on this machine today:**
- Exact start command (RUN_FORGE.bat remains broken/ops-item):
  `node start-api.js`  → confirmed: `Forge API server running at http://127.0.0.1:3100`
  (port from FORGE_API_PORT, default 3100; capability token auto-injected into the HTML
  shell — the owner needs NO manual token handling).
- Chat path confirmed reaching `processMessage`: authenticated
  `POST /api/ai-os/chat {project_id: <nonexistent>}` returned the engine's own
  `{mode:"BLOCKED", reason:"PROJECT_NOT_FOUND"}` — the exact production route, $0.
- Path (ii) (relayed API call) NOT needed; kept only as the documented weaker-witness
  fallback if the UI misbehaves on the day.

**OPS UPDATE 2026-07-30 — RUN_FORGE.bat appears RESOLVED.** The owner's server is running
and reachable: `GET http://127.0.0.1:3100/api/system/health` → `{"ok":true,
"service":"forge-workspace-api","ts":"2026-07-30T13:51:22.451Z"}` (auth-exempt probe, $0),
started by the owner via RUN_FORGE.bat — contradicting the long-standing backlog entry that
it does not start the server. Corroborating evidence: a server-side bulk touch of 36
`project_state.json` files at 13:40:25Z (one batch, `last_updated_at` ONLY, +1/−1 per file)
when the owner opened the UI on cs_sys. Recommend the backlog item be closed with this
evidence. NOTE: underscore-prefixed projects (`_reference_todo_api`, `_s150_abort_test`)
were NOT in that sweep — see F-G3.

**تعليمات المالك (بالعربي — جاهزة للتمرير؛ تُستخدم بعد نجاح real-a):**

> **(أ) التبديل من مشروعك cs_sys إلى مشروع الاختبار — بدون أي مساس بمشروعك:**
> 1. في نفس المتصفح على `http://127.0.0.1:3100/` افتح تبويب **Projects** من الشريط الجانبي.
> 2. اختر المشروع باسمه بالضبط: **`phase54_gate10_demo`** واضغط عليه لتفعيله.
> 3. تأكد أن الاسم الظاهر بالأعلى صار `phase54_gate10_demo` قبل ما تكتب أي حاجة.
>    (مشروعك cs_sys يفضل كما هو — إحنا لا نكتب فيه ولا نغيّره إطلاقًا.)
> 4. افتح تبويب **Chat**.
>
> **(ب) دورك الأول — التعديل:**
> 5. اقرأ تقرير الـ MVP الظاهر (ماذا بُني، نتائج الاختبارات، وكيف تشغّله).
> 6. في خانة **«اكتب رسالتك...»** اطلب تعديلًا **بكلماتك أنت** واضغط **إرسال**.
>    اقتراح آمن ومفيد لواجهة ملاحظات (لا يتعارض مع أي اختبار مجمّد):
>    *«عايز كل ملاحظة تتسجل بوقت إنشائها ويظهر الوقت ده في رد الإضافة وفي القائمة»*
>    — أو أي تعديل من عندك بنفس الروح (إضافة معلومة، مش تغيير مسار أو كود حالة).
> 7. لما يردّ فورج إنه هيعيد البناء بتعديلك، **قف** وأخبر الـ CTO — ولا ترسل رسالة تانية
>    قبل ما نقول لك، عشان الدور والبناء يمشوا بالتناوب.
>
> **(ج) دورك الثاني — الاعتماد (بعد ما نقول لك إن النسخة الجديدة جاهزة):**
> 8. اقرأ التقرير الجديد.
> 9. **لو الاختبارات كلها ناجحة:** اكتب موافقتك بكلماتك (مثلًا: *«تمام، اعتمده وكمّل»*).
> 10. **لو التقرير قال إن في اختبارات فاشلة:** انتبه للفرق ده —
>     - موافقة عادية (*«تمام اعتمده»*) **لن تمرّ**: فورج هيحذّرك إن الاختبارات فاشلة
>       وهيسألك سؤال توضيحي، ومش هيكمّل.
>     - عشان يكمّل فعلًا لازم تقولها **صراحةً**، مثلًا:
>       *«أنا فاهم إن الاختبارات فاشلة وموافق نكمّل بيها زي ما هي»*.
>       ساعتها كل المراحل التالية هتحمل علامة إن البناء ده عدّى باختبارات فاشلة (مسجّل بالكامل).
> 11. أخبر الـ CTO أنك أرسلت الدور الثاني.

> **الدور الأول (تعديل):**
> 1. افتح terminal في مجلد المشروع وشغّل: `node start-api.js` واتركه شغالًا.
> 2. افتح المتصفح على: `http://127.0.0.1:3100/`
> 3. اختر المشروع **phase54_gate10_demo** من قائمة المشاريع.
> 4. ستجد تقرير الـ MVP (ماذا بُني، نتائج الاختبارات، وكيف تشغّله). اقرأه.
> 5. اكتب في الشات **بكلامك أنت** تعديلًا واحدًا أو اثنين تريدهما فعلًا على الـ API
>    (مثلًا فكرة من عندك عن الردود أو الحقول — المهم أنها كلماتك الحقيقية، ليست نصًا مملى).
> 6. انتظر رد فورج (سيقول إنه سيعيد البناء بتعديلاتك)، ثم أخبر الـ CTO أنك أرسلت الدور الأول.
>
> **الدور الثاني (اعتماد) — بعد ما يخبرك الـ CTO أن النسخة الجديدة جاهزة:**
> 7. ارجع لنفس الشاشة، اقرأ التقرير الجديد.
> 8. لو النتيجة مناسبة: اكتب اعتمادك **بكلامك** (موافقة صريحة). لو التقرير يقول إن
>    الاختبارات فاشلة وتريد المتابعة رغم ذلك، لازم تقولها صراحةً ("أعتمد رغم فشل
>    الاختبارات") — الموافقة العادية وقتها سيرد عليها فورج بسؤال توضيحي.
> 9. أخبر الـ CTO أنك أرسلت الدور الثاني.

Operational sequence: approval → CC runs `real-a` → owner turn 1 (server running) →
CC runs `real-b` → owner turn 2 → CC runs `real-c` → `verify` → evidence + report.
(Driver and server run in separate processes strictly SEQUENTIALLY — state hands off on
disk; no concurrent writes.)

## 3. $0 preflight + dry run (§A.3) — DONE, evidence on disk

- `preflight` ✓ (`.../preflight/preflight.json`): OPENAI key PRESENT (presence only),
  both project ids fresh, evidence dirs created, no _test_* hooks in env, ledger baseline
  snapshot (434 rows / $11.205505 historical total), flag-off byte-reference recorded
  (`_reference_todo_api/project_state.json`).
- `dry` ✓ **DRY_PASS** (`.../dry/`, 16+ step files): full mock E2E — derivation →
  scoped build → suppressed advance + first review → scripted REFINE (**dry only**, per
  §A.3) → loop_back iter 0→1 → rebuild → second review → scripted ACCEPT → deferred
  advance → reviewProject (APPROVE) → judgeQuality (gate_pending 2). Ledger delta:
  **{rows: 11, usd: 0}** — plumbing, pauses, evidence writers and ledger capture all
  proven before any money moves. (Dry-only fixture plumbing — canned mock codegen has no
  derivable entry, so the driver restores a fixture manifest between build and test in
  dry legs ONLY; real legs use the real build's own manifest.)

## 4. Cost estimate (§A.4 — REVISED under R-23)

**Endpoint:** **judgeQuality → hold at Gate 2** (gate_pending 2; no Gate-2 response, no
deployment, no finalize). Exercises the full MVP-loop mechanism plus the R-20/AWFT
downstream surface live if the owner takes the override; Gate-2/deploy/finalize would add
spend without touching any PHASE-54 mechanism.

**R-23 applied (F-G1 REJECTED — documentation is NOT skipped).** real-c now runs the real
path end to end: `reviewProject → documentProject → judgeQuality`, with **no hand-advance**
(the synthetic `advance_state` hop is removed from real-c entirely), real provider, real
KB/citation path, and **no `citation_audit_override`**. The dry leg mirrors the same
sequence; its hermeticity aids (fixed-vector embed client, no-op discovery seam, override)
are DRY-ONLY and are named as such in the dry evidence.

Per-call breakdown (all gpt-4o; unit costs from PHASE-24..46 + PHASE-51..53 actuals):

| Call | × | est/unit | subtotal |
|---|---|---|---|
| architect | 1 | $0.015 | $0.015 |
| spec_writer | 1 | $0.025 | $0.025 |
| reviewer (spec A) | 1 | $0.020 | $0.020 |
| cost_estimator | 1 | $0.015 | $0.015 |
| environment | 1 | $0.015 | $0.015 |
| **mvp_scope** (cap 0.05) | 1 | $0.010 | $0.010 |
| test_designer | 1 | $0.030 | $0.030 |
| builder (plan) | 2 | $0.020 | $0.040 |
| materializer codegen (cap 0.50 ea) | 2 | $0.060 | $0.120 |
| **mvp_feedback** (cap 0.05 ea) | 2 | $0.005 | $0.010 |
| reviewer (code B) | 1 | $0.040 | $0.040 |
| security_auditor | 1 | $0.030 | $0.030 |
| **documentation (R-23, restored)** | 1 | $0.035 | $0.035 |
| **citation pass — embeddings (R-23)** | ~8 | ~$0.0003 | ~$0.002 |
| **citation pass — Tavily searches (R-23)** | ≤8 | $0.005 flat *(ledger estimate; $0 real cash, free tier)* | ≤$0.040 |
| quality_judge | 1 | $0.035 | $0.035 |
| **Total (17 gpt-4o calls + KB ops)** | | | **≈ $0.44 ledger** |

- **Ledger total: ≈ $0.44** · **Real cash: ≈ $0.40** (the ≤$0.040 Tavily line is
  bookkeeping only — free tier, PHASE-53 precedent booked $0.04 ledger against ~$0 cash).
- **Range: $0.30–0.65** (LLM output variance; each internal A-5 loopback, if a build fails
  tests, adds a builder+materializer pair ≈ +$0.08; the citation pass may need fewer than
  the 8-search cap).
- **Hard cap enforced in the driver: $1.00** ledger delta, checked at every stage boundary
  (abort + CAP_ABORT evidence). Kill bar unchanged: **$3.00**.
- **Precedent:** PHASE-46 full idea→COMPLETE URL-shortener real run = **$0.34947**;
  PHASE-53 doc+citation Gate = $0.05457 ledger / ~$0.0146 cash. This Gate =
  two build cycles + full doc path ⇒ the ≈$0.44 estimate sits just above the PHASE-46 band,
  as expected.

## 5. Pass criteria (§A.5 — recorded VERBATIM; mechanism-based; output quality is observed data, never a criterion)

> scope derived valid (partition holds on the real spec); advance suppressed at RUN_TESTS
> with mvp_review_pending; report facts field-equal to the harness artifacts; the owner's
> REFINE interpreted to non-empty changes[]; those changes VERBATIM in the second
> materializer prompt (trace evidence) with owner-block-first ordering; loop_back audit row
> + iteration increment; second review presented; owner ACCEPT performs the deferred
> advance parameter-identical; zero HALT; cap respected; at least one pre-existing flag-off
> project state byte-untouched by the whole run.

**12th criterion (added per R-23) — conditional:**

> If the owner takes the ACCEPT_WITH_FAILING_TESTS path, the marker is present in the
> reviewProject payload, in the persisted review_report.json, AND in the
> judgeQuality/Gate-2 payload — each read back from the persisted evidence, not from
> memory. If the owner takes the plain ACCEPT path (tests green), record the marker
> criterion as N/A with the reason, and the downstream-marker surface stays proven by
> S380 alone; state that plainly in the evidence.

Implemented exactly so: `verify` reads `snap_post_accept.json` to decide applicability,
then (if applicable) checks `step30_review.json` + the persisted `review_report.json` +
`step32_judge.json`; otherwise it records
`criterion_12_awft: { applicable: false, note: "N/A — … proven by S380 alone, NOT by this
live run" }`. `verify` recomputes all criteria from persisted evidence only; each maps to a
named boolean in `gate10_result.json`. The flag-off byte-reference was snapshotted at
preflight and is re-read + string-compared at verify.

## 5.b INCIDENT — real-a attempt #1 (2026-07-30, REAL CASH $0.00)

Authorized under the owner's approval; failed at the FIRST role call.

| | |
|---|---|
| Failure | `architect failed: {reason: AGENT_FAILED, detail: "OPENAI_API_KEY not set"}` — openai adapter fail-fast |
| **Real cash** | **$0.00** — ledger row `outcome:"failed", tokens_in:0, tokens_out:0, latency_ms:1, cost_usd_actual:0`; no network call was made |
| Ledger delta | 1 row / **$0.0372 estimate-only** (a pre-call estimate booking, not a charge) |
| Root cause | the driver process never loaded `.env`. `preflight` had loaded it inside ITS OWN process and reported `openai_key_present: true` — assurance that did not carry to the driver process. My preparation gap: a precondition validated in a different process than the one that consumes it. |
| State left behind | `phase54_gate10_demo` seeded (project_state + vision + loop graph at ARCHITECT_DESIGN, iteration 0); no spec/design/build artifacts. A naive retry hits the driver's own "refuse to reuse" fresh-project guard. |
| Other projects | untouched by the driver (all its writes are scoped to the demo id) |
| Evidence | `real/INCIDENT_real_a_attempt_1.json` |

**$0 fixes applied (not yet exercised on a real leg):** (1) `loadDotEnv(ROOT)` at driver init —
the same sanctioned §ARC-7 path `start-api.js` uses, so preflight/dry/real now resolve
credentials identically; (2) `_requireApproval` also refuses **before any write** when
`OPENAI_API_KEY` is unresolvable (exit 4) — a credential problem can never leave a
half-seeded project again; (3) new **id-guarded `reset` stage** (`FORGE_GATE10_RESET_CONFIRM=1`)
that archives the failed attempt's evidence to `real_attempt_archive/` and removes ONLY
`phase54_gate10_demo`. **NOT retried — per spend discipline a real leg is never re-run
without a fresh CTO GO.**

### F-G3 (CTO ruling requested) — criterion 11 vs the owner's running server
While the owner's UI is open, the SERVER bulk-touches every listed project's
`last_updated_at` (36 files at 13:40:25Z, +1/−1 each). Criterion 11 is a BYTE comparison of
a pre-existing flag-off project state, so such a sweep during the gate would produce a FALSE
RED that has nothing to do with the MVP loop. Two facts make this currently safe: the sweep
skips **underscore-prefixed** projects, and the chosen reference is `_reference_todo_api`.
That property is therefore load-bearing but undocumented. Options: **(a)** keep the byte
compare and record that the underscore-prefix exemption is what makes it valid (no code
change); **(b)** on mismatch, classify — PASS-with-note if the ONLY differing key is
`last_updated_at` and no `mvp_*` key appeared, FAIL otherwise. I did NOT change `verify`
unilaterally: altering a pass criterion before the gate runs is exactly the "make a red gate
green" move R-13 forbids. **Please rule (a) or (b).**

## 5.c R-31 — credential contradiction resolved ($0, presence/shape only, 2026-07-30)

Owner reported that no `OPENAI_API_KEY` line existed in `.env` and that he added one. Step-1
had recorded an assignment at line 3. Mechanical resolution: **the owner's edit did not reach
this file; the file is byte-unchanged since yesterday.**

| Check | Result |
|---|---|
| (a) `.env` mtime now | **2026-07-29T12:10:34.023Z — IDENTICAL to Step-1; NOT newer.** Lines: **7 now vs 7 before**, unchanged. No BOM, LF endings |
| (b) `OPENAI_API_KEY` assignments | **exactly 1, at line 3** — no duplicates, no commented copies, no other mentions. Winning line = 3, ignored lines = none. **Duplicate-override hazard: NOT present today** |
| (b) shape of line 3 | clean: no `export`, no leading space, no spaces around `=`, not empty, **not quoted**, no inline comment, no internal space, no trailing CR |
| (b) value classification | matches OpenAI key shape (`sk-…`), **not** a placeholder ⇒ a real (and per the owner, now **revoked**) key has been on line 3 since yesterday |
| (b) `TAVILY_API_KEY` | exactly 1, at line 7; no duplicates |
| (c) stray files | **none** — only `.env`. No `.env.txt`, `.env (1)`, `env`, `.env.*`. `D:\ForgeAI` (the old stale sibling copy) **no longer exists**; no `.env` in the user's home |
| (d) ambient — HKCU\Environment | **absent** (no `OPENAI_API_KEY`, no `TAVILY_API_KEY`; zero API-ish variable names) |
| (d) ambient — HKLM Session Manager\Environment | **absent** (same) |
| (d) this shell's inherited copy | absent |
| (e) effective resolution (driver-style fresh process) | **`.env` line 3** — no ambient exists to outrank it. Proven: loaded value === line-3 value; and ambient-beats-`.env` re-proven with a sentinel (mechanism confirmed, but currently inapplicable) |

**Conclusion:** the only plausible remaining explanation is an **unsaved editor buffer** — the
IDE opened `d:\S\Halo\Tech\Forge-Claude\.env` at that moment, and a typed-but-unsaved line
leaves the disk file untouched exactly as observed. The two ruled-out alternatives (a second
repo copy, a Windows environment variable) were checked and are negative.

**PREVENTIVE — the hazard the owner is one keystroke away from creating:** he believes there is
no existing line, so he would naturally **append** a new one. With line 3 still present,
`env_loader.js:27` (`!(key in process.env)`, first occurrence wins) would keep the **REVOKED**
key live and silently ignore the new one — while every presence check still reports OK. The
instruction below therefore says REPLACE line 3, never append.

## 5.d R-32 — verification FAILED at check 1 ($0, 2026-07-30T14:26Z)

Owner reported saving and restarting. **The save did not land — for the second time.**

| # | Check | Result |
|---|---|---|
| 1 | `.env` mtime newer than 2026-07-29T12:10:34.023Z | **FAIL — identical, byte-unchanged.** Line count still 7 |
| 2 | exactly ONE `OPENAI_API_KEY` assignment | PASS — 1, line 3, zero ignored duplicates |
| 3 | shape checks on that line | PASS — all 8 (name parses, unquoted, no internal space, no `#`, non-empty, `sk-` prefix, no trailing CR, no `export`) |
| 4 | no stray `.env`-family file | PASS — only `.env` |
| 5 | server StartTime later than `.env` mtime | **INCONCLUSIVE as measured** (CommandLine unavailable for every node PID, so the start-api process could not be identified) — and **moot**: check 1 failed, so the restarted server re-read the same revoked key |
| 6 | key-validity probe | **NOT RUN** — gated behind checks 1-5 |

**Where the save went — decisive evidence (all $0, paths/timestamps only):**
- Repo sweep, last 45 min: the ONLY modified file in the tree is `scripts/spikes/phase54_gate10.js`
  (13:48:29Z) — **my own** loadDotEnv fix. Nothing the owner did touched the repo.
- Filesystem sweep for any `.env*` written in the last 3 hours across `D:\` and the user
  profile: **zero writes**. The single hit is
  `…\Windows\Recent\.env.lnk` (14:24:22Z) — a Windows *Recent* shortcut, which is created when
  a file is **OPENED**, not saved.
- That shortcut resolves to **`D:\S\Halo\Tech\Forge-Claude\.env`** — i.e. he opened **exactly
  the right file**, ~2.5 minutes before the check, and its LastWrite is still yesterday.
- The file is **writable** (`Attributes=Archive`, `IsReadOnly=False`) — nothing is blocking a save.

**Conclusion:** not a wrong-file problem, not a permissions problem, not a stray copy, not an
ambient variable. The edit exists only in an **unsaved editor buffer** (or the window was
closed without saving). Remediation is the owner's action; nothing was spent this round.

## 6. Hygiene + rulings status

- `.gitignore` + `artifacts/projects/phase54_gate10_*/` (PHASE-48 W-4 precedent — driver
  scratch churn; spike evidence stays tracked).
- **F-G1 → R-23: CLOSED (rejected).** Documentation restored on the real path; estimate
  revised; 12th criterion added.
- **F-G2 → R-24: CLOSED (approved).** Decorator hardened to all five conditions;
  non-interference proven by controlled experiment.
- Known sequencing: owner turns happen while `node start-api.js` runs; driver legs run
  between them (strictly sequential, disk-handoff).

## STOP

Preparation complete at **$0** — preflight + **three** DRY_PASS runs on disk (pre-R-23
baseline, R-24 control arm, R-24 treatment arm), zero real provider calls, ledger delta
$0 across all of them. `FORGE_GATE10_OWNER_APPROVED` is NOT set and real-a/b/c have NOT
been run. Awaiting: CTO presents the revised estimate (≈$0.44 ledger / ≈$0.40 cash) to the
owner → owner's explicit spend approval in chat → CTO GO → then real-a → owner turn 1 →
real-b → owner turn 2 → real-c → verify. Closure artifact, status COMPLETE flip, push, and
tag remain forbidden until Gate PASS + CTO closure-diff + push GO.

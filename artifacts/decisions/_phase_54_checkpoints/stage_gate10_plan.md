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

## 5.e R-35 — H3 CONFIRMED from on-disk history; R-27 Step 3 probe: KEY_LIVE

**The owner's account was CORRECT.** He said the `OPENAI_API_KEY` line did not exist in `.env`
before yesterday and that he added it yesterday — the evidence supports him exactly. The
earlier "unsaved buffer / second failed save" reading was **an inference by the CTO** that the
fuller evidence has now revised; it is recorded here as the CTO's reading, not the owner's error.

**(a) Doctor series — the detail strings name the SOURCE (268 archived reports):**

| Report | `openai_api_key` | `uid_pin_match` |
|---|---|---|
| 2026-05-08 (oldest) | FAIL "OPENAI_API_KEY not set" | (check did not exist yet) |
| **2026-07-09T10:34:59Z** | **PASS "from keychain"** | **PASS (username=Khaled.Sayed)** |
| **2026-07-29T14:29:35Z** | **PASS "from env"** | **FAIL (mismatch)** |
| 2026-07-30T12:47:18Z (latest) | PASS "from env" | PASS (username=Khaled Elmasry, re-pinned per R-22) |

Both transitions occur in the **same pair of reports**: the last "from keychain" report is
also the last `uid_pin` PASS (2026-07-09), and the first "from env" report is also the first
`uid_pin` FAIL (2026-07-29). **H3 is confirmed from the owner's own machine history** — one
root cause (the per-user Windows profile change) emptied the per-user credential vault, Forge
lost the key, and the owner added it to `.env` on 2026-07-29 (file mtime 12:10:34Z; the first
"from env" doctor report follows at 14:29:35Z the same day). The same root cause explains the
vanished per-user Python (R-13) and the `uid_pin_match` failure (R-22).

**(b) Profile-change window:** last `uid_pin` PASS **2026-07-09T10:34:59Z** → first FAIL
**2026-07-29T14:29:35Z**. No doctor run exists between those dates, so the change occurred
inside that 20-day gap.

**(c) The loose end — CLOSED, no fourth storage location.** Every prior gate driver does BOTH
steps, mirroring start-api.js:22 + :33-36: `phase51_gate10.js:27`, `phase52_gate10.js:26`,
`phase52_gate10_preflight.js:14`, `phase53_gate10.js:35` each run a `loadDotEnv` IIFE at the
top AND then `if (!DRY && !process.env.OPENAI_API_KEY) secret_provider.get("openai_api_key")`;
`phase45_url_shortener_full_build.js:77-78` and `phase47_fp_replay.js:43-44` call
`loadDotEnv` from `env_loader`. During the keychain era (2026-07-01 → 07-09) `.env` had no
`OPENAI_API_KEY` line, so those drivers were served by their own keychain-hydration step.
**H3 fully accounts for them; no ambient export was ever required.** The deviant was MY
PHASE-54 driver, which originally had neither step — the direct cause of the real-a attempt-1
failure. The incident fix added `loadDotEnv`; R-35(c) has now added the keychain-hydration
step to all three real legs, restoring full parity (inert while the vault is empty).

**R-27 Step 3 — KEY VALIDITY PROBE: `KEY_LIVE`.** Cheapest real call through the SAME
consumption path the gate uses (loadDotEnv → `reg.invoke("agent.invoke")` → openAiAdapter):
`gpt-4o-mini-2024-07-18`, 8 tokens in / 10 out, 2047 ms, outcome success.

| Figure | Value |
|---|---|
| Ledger delta (rows) | 1 |
| Ledger delta (`cost_usd_estimated`) | **$0.00000** (the estimator books 0 for gpt-4o-mini at this size) |
| **Real cash (`cost_usd_actual`)** | **$0.00019** |
| PHASE-54 cumulative real cash to date | **$0.00019** (attempt-1 architect failure was $0.00) |

**⇒ The key currently in `.env` line 3 WORKS. No `.env` edit is needed; the R-33 helper does
not need to be run.**

**R-32 re-run in light of this:** check 1 (mtime newer) still FAILS as literally written —
but it is now **superseded, not waived**: a fresh mtime was only ever a *proxy* for "the
working key is in place", and the probe establishes that fact **directly and more strongly**
(R-27's own principle: presence is not validity — and validity outranks a freshness proxy).
Checks 2, 3, 4 PASS as before. **Check 5 PASSES by the port method:** listener on 3100 is
PID **9116**, `StartTime 2026-07-30T13:40:24.592Z` > `.env` mtime `2026-07-29T12:10:34.023Z`
⇒ the running server loaded the **current, live** key. No restart is required.

**CAP-guard soundness (checked before authorising larger spend):** `_capGuard` sums
`cost_usd_estimated`. For real gpt-4o rows that column is populated and **conservative** —
recent rows show est $0.0363 vs act $0.01464, est $0.0539 vs act $0.01787, est $0.1301 vs
act $0.02057 (~2.5x over-booking). The cap therefore trips **earlier** than real spend
warrants, which is the correct failure direction. Corollary for §4: the ≈$0.44 *ledger*
estimate corresponds to roughly **$0.15–0.20 real cash**.

## 5.f R-36 — durable records (supersession + CAP-guard behaviour)

**R-32 check 1 is SUPERSEDED, not waived.** `.env` mtime never changed; the check as literally
written FAILS and that failure is recorded here permanently. It is superseded because a fresh
mtime was only ever a **proxy** for "a valid key is in place", and the R-27 Step 3 probe
measures **the thing itself** (a real call returning `KEY_LIVE` through the same consumption
path the gate uses). A criterion may be replaced by a stronger measurement; it may never
quietly disappear. This is R-13's principle applied in the opposite direction — there, a red
gate could not be made green by weakening the check; here, a proxy is replaced by a direct
measurement, and both the original failure and the reason for the replacement stay on the record.

**CAP-guard behaviour (durable note).** `_capGuard` sums `cost_usd_estimated`, which runs
**~2.5x above** `cost_usd_actual` on real calls (observed: est $0.0363 / act $0.01464 ·
est $0.0539 / act $0.01787 · est $0.1301 / act $0.02057). The $1.00 cap therefore **cuts early
rather than late** — conservative, the correct direction. Consequence for §4: the ≈**$0.44
ledger** estimate corresponds to roughly **$0.15–0.20 real cash**. Both figures are to be
reported separately, always.

## 5.g R-37 — the cap now bounds REAL CASH at the same $1.00

**Why the change is safe (R-37 iv).** On real-a the ledger's estimated column ran **~4.0x**
the real cash it was standing in for: **est $0.58150 vs actual $0.14511**. The old guard was
therefore strictly more conservative *in the wrong currency* — it would have aborted the gate
mid-real-c (projected est ≈$1.16) while real spend sat near **$0.30 of the owner's approved
$1.00**, wasting everything already paid for to satisfy a proxy. Same principle as R-36:
a proxy yields to a direct measurement of the quantity that actually matters.

**Implemented:** (i) `_capGuard` sums `cost_usd_actual`, ceiling unchanged at $1.00; no other
spend control touched. (ii) Both columns are carried in every delta and printed at every stage
boundary (`[cost] <stage>: rows +N estimated $X REAL CASH $Y`). (iii) Secondary tripwire —
estimated delta > **$2.00** while actual is under the cap emits
`EST_DIVERGENCE_WARNING.json` (with the est/act ratio) and **continues**; divergence is a
signal, never a stop condition.

**Latent breakage caught before spending.** The `real` leg's baseline was written under the old
shape and carries no `actual` column. Defaulting it to 0 would have measured the actual delta
against **all** ledger history (~$4.01) and fired `CAP_ABORT` on the very first guard call in
real-b. Fixed by exact recovery rather than a hand-edit: the ledger is append-only, so the
baseline's actual is recomputed by summing `cost_usd_actual` over the first `base.count` rows.
Verified to reproduce the known figures exactly — recovered baseline **$4.00768**, real-a delta
**rows 9 / est $0.58150 / actual $0.14511**, cap check "UNDER $1.00 — would NOT abort".

**(v) Inertness proven:** DRY re-run after the edit → **DRY_PASS**, same 11-step sequence,
ledger delta unchanged at **12 rows / $0 estimated / $0 actual**, no `CAP_ABORT.json`, no
`EST_DIVERGENCE_WARNING.json`.

**BACKLOG (not fixed now):** the ledger's `cost_usd_estimated` accuracy. Divergence measured
here is **~4.0x** on real-a, wider than the ~2.5x recorded in R-36 from historical rows, and the
estimator books **$0** for small gpt-4o-mini calls (the R-27 probe: est $0.00000 / act $0.00019).
Needs its own decision artifact in a future phase.

## 5.h R-38 — REAL-PATH DEFECT: the owner's turn never reached the MVP gate (diagnosis, $0)

**Root cause: `apiServer.buildProjectState` rebuilds `project_state.json` from a fixed field
whitelist and SILENTLY DROPS unknown keys — including `mvp_loop` and `loop_id` — and
`listProjects()` runs that rebuild over EVERY project.** Listing the projects in the UI
therefore destroys the MVP review gate's state.

**1. Where the turn went.** Not to `_handleMvpReview`: it fell through to
`ideationEngine.expandIdea` (conversationEngine.js:1130). Decisive field values from the live
state after the turn: `conversation_mode: "PIPELINE"`, `active_runtime_state: "IDEATION"`,
**`mvp_loop: null`**, and **`loop_id` absent entirely**. The state's key list is the full legacy
ideation schema (`project_type, requirement_domain, domain_locked, question_count,
domain_lock_intent, …`) — a *different schema* from the 8-key state real-a wrote, i.e. the file
was **rebuilt**, not edited. The empty-string domain the owner saw is that rebuild's fresh
`requirement_domain: ""`.

**2. Why the MVP branch was not selected — ordering and logic are both FINE.** The branch sits
at conversationEngine.js:1117-1120, *before* the CONVERSATION gate (1124) and *before* the
ideation route (1130); the `pending_confirmation` block closes at 1112. Evaluated against the
exact state real-a left (recovered from `real/snap_first_review.json`):
`isMvpEnabled(state) = true`, `status === "AWAITING_OWNER_REVIEW" = true` ⇒ **the branch would
have fired.** It did not, because the state on disk *at decision time* was no longer that state.

**Sequence (all timestamps UTC):**

| When | Event |
|---|---|
| 08:35:03 | real-a finishes; `project_state.json` holds `mvp_loop` (AWAITING_OWNER_REVIEW) + `loop_id` |
| **09:16:06** | owner restarts the server (listener PID 34568) and opens the UI → `GET` projects → `listProjects()` (apiServer.js:865) → `persistProjectState()` for **every** project → `buildProjectState()` rebuild → **`mvp_loop` + `loop_id` dropped**, legacy schema written |
| 09:17:58 | owner's REFINE turn → `loadState` returns the stripped state → `isMvpEnabled` **false** → ideation branch → domain-pivot question + ideation chips (exactly what he saw). `conversation_context.json`, `ideation_log.json`, `project_state.json` all written in that same instant |

Confirmed mechanically: `buildProjectState` (apiServer.js:645-802) contains **zero** `...existing`
spreads — it reads only named fields off `existing` and returns a freshly-built object.
This also explains the 2026-07-30 observation of 36 project states touched with a +1/−1
`last_updated_at` diff: those projects already carried the legacy schema, so only the timestamp
changed. `phase54_gate10_demo` was the only project holding foreign keys, so it was the only one
that lost data.

**3. Why all 9 SUs passed — a TEST-FIDELITY GAP, not luck.** The scenarios call
`engine.processMessage(...)` **directly**, against a `project_state.json` hand-seeded by
`mvp_loop_test_helper._writeState2`. The live entry point is HTTP → apiServer → *(project
listing rebuilds the state)* → engine. **The state-stripping layer sits entirely outside the SU
harness**: no PHASE-54 scenario — indeed no scenario in the suite — exercises apiServer's
project-state persistence path, so none could observe a live-surface layer that mutates the very
field the engine branches on. Finding against the SU design: the MVP scenarios validate the
engine's *decision logic*, never the *state's survival* between the pause and the owner's turn.

**4. Resumability — artifacts intact, gate state destroyed, cost negligible.**

| Item | Status |
|---|---|
| Graph | **RUN_TESTS, iteration_count 0** — untouched (the graph lives in `orchestration/<loop>/graph.json`, outside the rebuilt file) |
| `mvp_report.json`, `mvp_scope.json`, `build_manifest.json`, `spec.json`, `test_plan.json`, `architect_design.json`, `forge_tests/last_report.json` | **all INTACT** |
| Built code (`src/`) | INTACT (5 entries) |
| `mvp_loop` block | **DESTROYED** — must be restored before real-b can run |
| `loop_id` in project_state | **DESTROYED** (the driver passes it explicitly, so this is recoverable) |
| Stray turn wrote | `project_state.json` (rebuilt), `ai_os/conversation_context.json` (2 turns), `ai_os/ideation_log.json` (1 IDEA_EXPANSION) |
| Cost | **$0.00 on the agent ledger** — 0 rows since 09:00Z. But the ideation call was REAL (a genuine Arabic expansion was produced): `ideationEngine` uses the **legacy provider path**, which never books to `artifacts/agent/cost_ledger.jsonl` and wrote no providerTrace. **Unmetered real spend, order ~$0.01–0.02** (estimate — no ledger row exists to confirm). |

**⚠ Consequential side-finding:** legacy Stage-A providers make real OpenAI calls that are
**invisible to the agent cost ledger**, so the R-37 cap guard cannot see them. The cap bounds
only ledger-visible spend.

### Proposed fix — NOT IMPLEMENTED (needs a CTO ruling on scope; apiServer has been byte-identical since a69de85 and is explicitly out of Slice-1 scope)

- **Option A — fix the normalizer (recommended, general):** `buildProjectState` returns
  `{ ...existing, ...builtFields }` so unknown keys survive. This is the honest fix: a state
  normalizer that silently discards data is wrong independently of PHASE-54. Blast radius:
  apiServer live surface; could resurrect stale keys on other projects — needs a check of what
  else `existing` may carry.
- **Option B — narrow allowlist:** carry `mvp_loop` and `loop_id` through explicitly. Smallest
  blast radius, but whack-a-mole: the general defect (any future block is dropped) survives.
- **Option C — relocate the block:** persist `mvp_loop` at
  `orchestration/<loopId>/mvp_loop.json`, alongside `mvp_scope.json`/`mvp_report.json` and the
  graph, out of reach of the legacy normalizer. Architecturally cleanest and decouples PHASE-54
  from a schema owned by another layer, but touches D1/D3/D4 wiring and their SUs after D5 was
  declared closed.
- **The SU that would have caught it (required with any option):** a scenario that drives
  `listProjects()`/`persistProjectState()` **between** the runTests pause and the owner's turn,
  then asserts (a) `mvp_loop` survived byte-identical and (b) `processMessage` routes to the MVP
  branch. That is the missing fidelity: state survival across the real entry point, not just
  engine decision logic.

## 5.i R-39 — normalizer fixed at the source (measured first, test-first, $0)

**(iii) Key-set delta MEASURED before applying anything — no behavioural resurrection.**

| Measurement | Result |
|---|---|
| Projects with a `project_state.json` | **54** |
| Projects whose key set is already exactly what `buildProjectState` produces | **53 — zero change from the fix** |
| Projects carrying keys the builder drops today | **1 — `phase54_gate10_demo` only** |
| Keys that would resurrect there | `domain_lock_intent`, `question_count` |

Both flagged keys were assessed rather than assumed, and **both are intended-to-persist by the
code that writes them**: `ideationEngine.js:168` states verbatim *"question_count persists in
project state across turns; cap = 4"*, and `domain_lock_intent` is written as `"SOFT_LOCKED"` at
:150 and read back at :68. Today the normalizer silently resets both on every project listing —
so the fix **restores intended behaviour** rather than changing it. The single affected project
is also the gate demo, which the R-41 reset deletes before the re-run. **No STOP condition.**

Forward-looking (keys the writing engines can produce that the builder omits):
`loop_id, mvp_loop, pending_confirmation, pipeline_started, user_language` (conversationEngine) +
`question_count, domain_lock_intent` (ideationEngine). Every one is a field whose loss is the
defect. `pending_confirmation` deserves a note: its silent loss means a pending owner
confirmation vanishes if the project list is opened — the same defect class, in the Stage-A
confirmation flow. Resurrecting a stale one is safe: `confirmTransition` checks `expires_at`
(30 min) and deletes it fail-safe. Zero projects carry one today.

**(iv) Test-first, RED → GREEN.** `S382` written first; against unfixed code it failed on exactly
the production symptoms — `mvp_block_survived: false`, `loop_id_survived: false`,
`reached_mvp_branch: false` — i.e. the scenario reproduces the owner's failure faithfully. After
the one-line fix: **ALL PASS**.

**(ii) apiServer moves off byte-identical — visibly.** `git diff a69de85 -- apiServer.js` is
**+9 lines, 0 deletions**: eight comment lines and the single `...existing,` spread. This is the
first and only apiServer change in PHASE-54. Justification recorded at the change site and here:
the defect is **pre-existing** (apiServer was byte-identical to `a69de85` until this line, CTO-
verified with `cmp`, 93061 bytes) and PHASE-54 is merely the first workload to expose it.

**(v) Final SU count: N = 10** (S373–S382). Closure gate = **365 + 10 = 375**.

**Gates after the fix:** suite **375 passed / 0 failed / 5 skipped (380)**, exit 0 ·
Track A diff-based over all added live-surface lines (conversationEngine, mvpLoopEngine,
materializerEngine, apiServer): **0 matches** · doctor **ok, 35 checks, 31 PASS / 4 WARN /
0 FAIL** · §ARC **10** · L2 **81** · roles **13**.

## 5.j R-40 — what the $1.00 cap does NOT cover (must reach the owner)

The cap bounds **agent-ledger calls only**. Legacy Stage-A providers (ideation, conversational
response, intent classification, business analysis, documentation review) call OpenAI directly
and book **no ledger row and no providerTrace** — proven today: a real Arabic expansion was
produced while the ledger gained zero rows. Any spend on that surface is invisible to the guard.
Named backlog item `UNMETERED-LEGACY-PROVIDER-SPEND` in the decision artifact; **not fixed in
PHASE-54**.

## 5.k R-41 — the gate restarts clean; budget projection

No hand-restore of the destroyed block: a repaired-by-hand state is not a witness to the real
path. After CTO verification → id-guarded reset → **real-a from scratch**.

**Projected total real cash for a full clean run:** real-a measured **$0.14511**; real-b ≈
$0.05 (builder + materializer + the owner's two feedback interpretations); real-c ≈ $0.10
(reviewer + security + documentation + citation pass + quality_judge) ⇒ **≈ $0.30**, against
**$0.14530 already spent**, for a cumulative **≈ $0.45** — under the $0.75 threshold, so the
existing approval stands and no fresh approval is required. Both columns will be reported at
every stage boundary as always.

## 5.l Clean re-run attempt #2 — loop CORRECT, driver expectation too narrow ($0.14837)

Reset verified (58→57, `REMOVED: ["phase54_gate10_demo"]` only, 15 evidence files archived),
criterion-11b snapshot re-taken after the reset, then real-a ran with the R-37 cost lines live:
`post-stage-b: rows +5 estimated $0.37300 REAL CASH $0.08611` ·
`post-first-build: rows +9 estimated $0.59930 REAL CASH $0.14837`.

**The first build's tests did not all pass this time** (LLM codegen is non-deterministic):
T-1 PASS `post_notes_returns_201` · **T-2 FAIL** `get_notes_returns_all_notes` —
`response_body_field_equals`: expected `body.title` = "Meeting notes", got `undefined`
(the list endpoint returns an array, so an object-field assertion on the root cannot hold) ·
T-3 PASS `delete_note_not_found_returns_404`.

**The MVP loop then did exactly what R-10 specifies** — first build, no owner changes
outstanding ⇒ internal A-5 loopback, no owner gate: `advanced_to: "BUILDER"`,
`loop_back: true`, `mvp_loop.status = BUILDING`, graph `BUILDER` with `iteration_count 0 → 1`.
**This is designed behaviour proven live, not a defect** — and it exercises R-10's
unchanged-first-build branch on the real path for free.

What aborted is the DRIVER: `real-a` is written to expect a first-build PASS and throws when it
does not reach AWAITING_OWNER_REVIEW. It has no stage for the internal repair cycle.

Attributions, stated plainly: the T-2 assertion shape (an object-field assertion against an
array response) is a **test_designer quality gap** in the pre-existing backlog
(PHASE-45 "test_designer assertion-name discipline"), not a PHASE-54 mechanism defect.

State is fully resumable: `loop_id` present, `mvp_scope` derived and partition-valid
(`create-and-list-notes`, included AC-1/AC-2/AC-4, excluded AC-3), graph consistent at BUILDER
iteration 1, all artifacts intact.

**Cumulative PHASE-54 real cash: $0.29367** (attempt-1 $0.14511 + probe $0.00019 +
attempt-2 $0.14837) of the owner's approved $1.00.

## 5.m ⚠ R-41 step 4 (live entry-point check) — CORRECTLY REFUSED, would have destroyed the run

The instruction was to call `GET /api/projects` against the owner's running server as his browser
will. **Executing it would have re-created the exact failure it was meant to prevent.**

| Fact | Value |
|---|---|
| Live listener | PID **34568**, started **2026-08-02T09:16:06Z** |
| `apiServer.js` patched (R-39) | **2026-08-02T10:12:55Z** — **56 minutes AFTER** the server started |

The running process therefore holds the **pre-fix** `buildProjectState` in memory, and
`GET /api/projects` → `listProjects()` → `persistProjectState()` runs over **every** project.
Against stale code that rebuild strips `mvp_loop`/`loop_id` — i.e. the check would have
destroyed the gate state a second time. Single-project routes are no escape:
`/api/projects/activate` also calls `writeActiveProject`, which would switch the owner's UI away
from cs_sys.

**Consequence for the owner's turn (the important part): the restart is MANDATORY, not optional.**
Even with no action from us, the moment he opens the Projects tab to switch to the demo, his
browser triggers `GET /api/projects` against the stale server and destroys the block exactly as
it did on 2026-08-02T09:16Z. **He must restart the server BEFORE switching projects**, after
which the live check runs at $0 and confirms the fix in his real environment.

## 5.n R-42 repair cycle — ran correctly; the frozen test plan is UNSATISFIABLE

`real-a-continue` added as its own resumable stage (no completed step re-run, scope NOT
re-derived, `ITERATION_CAP` imported from its single source of truth, bounded to ONE cycle per
invocation). $0 checks first: syntax OK, approval gate refuses without the env var (exit 3),
`ITERATION_CAP = 5` resolves, precondition `mvp_loop.status = BUILDING` true.

Run: `[resume] graph=BUILDER iteration=1 (cap 5)` → rebuild + re-test →
`post-repair-build / post-repair-test: estimated $0.69900 REAL CASH $0.17770` →
**graph BUILDER, iteration 1 → 2**, owner gate not reached.

**Why it cannot converge — the frozen T-2 asserts two mutually exclusive things about the same
response.** `GET /notes` carries:

| # | assertion | requires |
|---|---|---|
| 1 | `http_status_equals: 200` | — |
| 2 | `response_body_is_array` (min 1, max 10) | body **IS a JSON array** |
| 3 | `response_body_field_equals` field `title` = "Meeting notes" | body has a **root object field** `title` |

(2) and (3) cannot both hold: an array has no root-level `title`. **No implementation can pass
T-2**, so the A-5 repair loop is guaranteed to burn every remaining iteration and land on
CAP_REACHED. Continuing further would spend ~$0.09 to reach a foregone conclusion.

**Attribution (R-42 v):** this originates in `test_designer`'s assertion shape — the pre-existing
PHASE-45 backlog item *"test_designer assertion-name discipline"* — **not** in PHASE-54
machinery. Not fixed here. Recorded in `real/repair_cycle_note.json`.

**Design observation worth surfacing (not a defect, not fixed here):** R-10 is the safety net for
"the frozen test plan conflicts with reality", but it routes to the owner **only when owner
changes are outstanding**. On a FIRST build with a self-contradictory plan there is no owner
escape hatch — the loop burns to the cap and escalates without ever asking the human whose
project it is. Worth its own decision artifact later; out of Slice-1 scope.

**Cost:** repair cycle added **$0.02933** real cash (within the $0.03–0.06 projection).
Leg total $0.17770. **Cumulative PHASE-54 real cash: $0.32300** of the approved $1.00.

**Proposed guard for the next attempt ($0, driver-only, no live surface):** after `designTests`
and BEFORE `buildProject`, statically screen the generated `test_plan.json` for
self-contradictory assertion sets (e.g. `response_body_is_array` together with
`response_body_field_equals` on the same response) and STOP before any build spend if found.
That turns a ~$0.15 coin flip into a ~$0.09 fail-fast with a named diagnosis, and it would have
caught this run before both build cycles.

## 5.o R-44 attempt 3 — guard worked, and it caught the SAME contradiction again (R-44 iv STOP)

Reset verified (58→57, `REMOVED: ["phase54_gate10_demo"]` only), 11b snapshot re-taken,
projection reported before spending (≈$0.47 cumulative, under both thresholds).

`test_designer` produced a **second contradictory plan in a row** — a different scenario id, the
identical defect class:

```
T-3  list_notes_returns_array_with_notes
  http_status_equals        200
  response_body_is_array    min 1, max 10          <- body IS an array
  response_body_field_equals field "title" = "Buy groceries"   <- body has a root object field
```

**The guard did its job exactly as ruled:**
`[cost] post-stage-b: REAL CASH $0.08493` → `PLAN GUARD TRIPPED —
CONTRADICTORY_ASSERTION_PAIR_ARRAY_VS_ROOT_FIELD — stopping BEFORE any build spend.`
`src/` was never created — **no build, no materializer, no doomed repair cycles**.

| | attempt 2 (no guard) | attempt 3 (guard) |
|---|---|---|
| Spend on a plan that cannot pass | $0.17770 (build + test + one repair cycle, heading to CAP_REACHED) | **$0.11891, stopped at the plan** |
| Diagnosis delivered | after two build cycles, inferred | **immediately, named** |

**Unsatisfiability is empirically proven, not assumed:** attempt 2's harness returned
`Expected body.title to equal "Meeting notes", got undefined` on the array response — i.e. the
harness evaluates `response_body_field_equals` against the **root**, so the pair genuinely cannot
both hold.

**R-44(iv) reached — STOPPING, not rolling again.** Two contradictory plans in a row on the same
domain is not luck; it is a systematic `test_designer` behaviour. Per the ruling this deserves
its own decision rather than more spend.

**Cost:** attempt 3 = **$0.11891** real cash (est $0.50770). **Cumulative PHASE-54 real cash:
$0.44191** of the approved $1.00 — under the $0.75 threshold, but no further spend without a
ruling.

**Observation for whoever takes the test_designer item:** both plans put the contradiction on the
*list* endpoint, pairing an array-shape assertion with a root-field assertion that clearly
*intends* "some element has this title". The generator appears to lack an element-scoped
assertion for array responses, so it reaches for the root-field one. That is a hypothesis from
two samples, offered as a starting point — not a diagnosis.

## 5.p R-46(1) — DIAGNOSIS ($0): EXISTS-BUT-UNUSED ⇒ prompt fix, not a harness change

**(a) What the harness implements — 9 assertion types**
(`code/src/runtime/builtproject/assertion_types/`): `file_exists`, `http_status_equals`,
`process_exit_code_equals`, `response_body_contains_key`, `response_body_field_equals`,
`response_body_is_array`, `response_body_matches_schema`, `response_header_equals`,
`stdout_contains`.

**Element-wise capability — split answer, verified empirically at $0:**

| Form | Status | Evidence |
|---|---|---|
| **Positional** — "element *[i]* has field X = Y" | **EXISTS TODAY, zero code change** | `response_body_field_equals` walks dot-notation from the root (`response_body_field_equals.js:15-22`); arrays are objects, so `field: "0.title"` resolves `body["0"].title`. Ran it: `"0.title"` → `{pass:true}`, `"1.title"` → `{pass:true}`, while root `"title"` → `{pass:false, "Expected body.title …, got undefined"}` — the exact production failure |
| **Existential** — "SOME element has X = Y" | **genuinely ABSENT** | no type implements it; `response_body_matches_schema` rejects arrays for `required` ("Body must be an object to check required keys") and has no `items` support (`type:"array"` alone passes) |

**The existential form is not required for the gate.** The generated plans already assert
`response_body_is_array` with `min_length: 1`, so element `[0]` is guaranteed present and the
positional form expresses the intent exactly.

**(b) The role prompt — `test_designer_v3` (docs/10_runtime/18b_ROLE_PROMPTS.md:2073+)**
- It **does** document the vocabulary: all 9 types with example JSON, plus the PHASE-47 HARD
  RULE on exact assertion names.
- Its `response_body_field_equals` example is `{ "field": "title", "expected": "Buy milk" }` —
  a **root-level** field, shown with no array context.
- **There is NO array guidance anywhere**: no statement that a list endpoint returns an array,
  no indexed-path example, no warning that a root-field assertion cannot hold on an array.

So the generator has a correct vocabulary, an example that models root-field usage, and nothing
telling it what to do for a list response. Asked to assert list contents, it composes
`response_body_is_array` + root `response_body_field_equals` — the contradiction, twice.

**(c) VERDICT: EXISTS-BUT-UNUSED ⇒ a prompt/documentation fix.** The harness needs no new
capability for Gate #10 to proceed. This is the cheapest fix class and matches the PHASE-47
precedent exactly (prompt-only remediation + `loadPrompt` id bump + a deterministic SU).

**Budget for the ruling:** spent **$0.44191**, remaining **$0.55809**. One further clean real-a
≈ $0.15 ⇒ cumulative ≈ **$0.59** — under the $0.75 threshold, so the owner's standing approval
covers it and no fresh approval is needed.

**STOPPING for the scope ruling per R-46(2):** the fix touches `docs/10_runtime/18b_ROLE_PROMPTS.md`
and `code/src/runtime/agents/roles/test_designer_role.js` (prompt id bump) — outside Slice 1,
after D5 closure. Not proceeding without the ruling, a decision-artifact entry, and an SU that
locks the behaviour.

## 5.q Attempt 4 — R-47 WORKED. The third trip is a FALSE POSITIVE of my own guard.

The guard tripped a third time, but the premise behind §A.4 ("three contradictory plans would
mean the fix did not take") **does not hold here — and I have to own the reason: the defect is
in the R-44 guard I wrote, not in the prompt fix.**

**R-47 demonstrably took.** The prompt trace proves the model received v4 verbatim:
`ARRAY RESPONSES (PHASE-54 R-47` present · `RIGHT (indexed element assertion)` present ·
`"field": "0.title"` example present · `NEVER pair` rule present · full v4-sized prompt.

**And the model followed it.** The generated T-3:

```json
{ "type": "response_body_is_array",     "min_length": 1 }
{ "type": "response_body_field_equals", "field": "0.title", "expected": "Test Note" }
{ "type": "response_body_field_equals", "field": "0.body",  "expected": "Test Body" }
```

That is **exactly the RIGHT form v4 teaches** — the indexed path, not the root field. Evaluated
against a realistic list response `[{id:1,title:"Test Note",body:"Test Body"}]`, all three pass:
`is_array(min 1)` → `{pass:true}` · `0.title` → `{pass:true}` · `0.body` → `{pass:true}`.
**The plan is satisfiable.** The two prior attempts emitted root-level `field: "title"`; this one
did not. The prompt fix changed the behaviour it was written to change.

**My guard's defect:** `_screenTestPlan` flags ANY co-occurrence of `response_body_is_array` and
`response_body_field_equals` in one scenario, **without inspecting the field path**. It therefore
rejects precisely the construct R-47 established as correct. The ruling that authorised it said
"narrowly scope it to the provably-contradictory pair you found" — the pair I found was
**root-level**, and my implementation failed to encode that qualifier. The guard has been broader
than its authorisation since I wrote it; attempt 4 is the first plan good enough to expose it.

**Cost of my defect:** attempt 4 aborted a GOOD plan after Stage-B — **$0.10811 real cash**
(est $0.49310). Cumulative **$0.55002**. No build ran (`src/` absent), so nothing downstream was
wasted.

**Everything is resumable — no reset needed and no Stage-B re-spend.** `designTests` completed
and advanced before the guard threw: graph **BUILDER, iteration_count 0**, `mvp_loop`
**SCOPE_DERIVED**, and `spec.json` / `architect_design.json` / `test_plan.json` /
`mvp_scope.json` all **INTACT**. Resuming from BUILDER costs ~$0.03–0.05 (builder +
materializer + harness) instead of ~$0.15 for a fresh run — and it preserves the good plan
rather than rolling the generator again.

**Proposed, NOT applied (needs the ruling §A.4 requires):**
1. **$0 guard fix (one predicate):** flag only when the field path is **root-level** — i.e. its
   first dot-segment is not a non-negative integer index. `field: "title"` → flag;
   `field: "0.title"`, `field: "0.author.name"` → pass. This restores the guard to exactly the
   authorisation, and S383 already locks the semantics that make the distinction correct.
2. **Resume rather than reset:** a `real-a-continue`-style resume from BUILDER on the existing
   good plan (~$0.03–0.05), instead of reset + full re-run (~$0.15).
   Projection with resume: **$0.55002 + ~$0.05 ≈ $0.60** — under the $0.75 threshold, so the
   owner's standing approval still covers it. With a full re-run instead: ≈$0.70, also under,
   but wasteful and it discards a plan that is already correct.

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

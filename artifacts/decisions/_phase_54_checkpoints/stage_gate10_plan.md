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

### F-G2 (CTO ruling requested) — materializer prompt-trace mechanism
The production agent.invoke path writes NO request trace (the PHASE-48 known
providerTrace gap family), so criterion 5 needs a capture mechanism. Implemented: a
**READ-ONLY decorator around the REAL `openai` adapter inside the driver process only** —
records `input.prompt` verbatim to `prompt_trace.jsonl`, then delegates to the real
adapter unchanged. Behavior byte-identical; observability, not a behavioral seam (nothing
scripted, nothing altered). Note: the owner's two feedback interpretations run in the
SERVER process (no recorder) — criterion 5 concerns the SECOND MATERIALIZER prompt, which
runs inside the driver (real-b) and IS recorded. Alternative if refused: permanent
providerTrace fix (existing backlog item) — bigger scope. **Approve/deny the decorator.**

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

**تعليمات المالك (بالعربي — جاهزة للتمرير):**

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

## 4. Cost estimate (§A.4)

**Endpoint proposal:** run through **judgeQuality → hold at Gate 2** (gate_pending 2; no
Gate-2 response, no deployment, no finalize). Justification: exercises the full MVP-loop
mechanism + the R-20/AWFT downstream surface live (reviewProject + judgeQuality payload
markers) if the owner chooses the override; Gate-2/deploy/finalize add spend without
touching any PHASE-54 mechanism.
**F-G1 (CTO ruling requested):** DOCUMENTATION is SKIPPED (driver advances
DOCUMENTATION→QUALITY_JUDGE directly): the doc+citation surface was REAL-gate-proven in
PHASE-51/52/53, is orthogonal to the MVP loop, and skipping saves ~$0.05–0.08 ledger +
all Tavily accounting (⇒ real cash = ledger, OpenAI only). **Approve/deny the skip.**

Per-call breakdown (all gpt-4o; unit costs from PHASE-24..46 actuals):

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
| quality_judge | 1 | $0.035 | $0.035 |
| **Total (16 calls)** | | | **≈ $0.36 ledger** |

- **Range:** $0.25–0.55 (LLM output variance; each internal A-5 loopback, if the first
  build fails tests, adds a builder+materializer pair ≈ +$0.08).
- **Real cash = ledger** (OpenAI only; NO Tavily — documentation skipped per F-G1; if
  the CTO overrules F-G1, add ~$0.05–0.08 ledger of which ~$0.04 is the flat
  $0.005/search Tavily ledger estimate at $0 real cash on free tier, PHASE-53 precedent).
- **Hard cap enforced in the driver: $1.00** ledger delta (abort + CAP_ABORT evidence).
  Kill bar unchanged: $3.00.
- **Precedent:** PHASE-46 full idea→COMPLETE URL-shortener real run = **$0.34947** —
  this Gate's two-build-cycle estimate sits in the same band.

## 5. Pass criteria (§A.5 — recorded VERBATIM; mechanism-based; output quality is observed data, never a criterion)

> scope derived valid (partition holds on the real spec); advance suppressed at RUN_TESTS
> with mvp_review_pending; report facts field-equal to the harness artifacts; the owner's
> REFINE interpreted to non-empty changes[]; those changes VERBATIM in the second
> materializer prompt (trace evidence) with owner-block-first ordering; loop_back audit row
> + iteration increment; second review presented; owner ACCEPT performs the deferred
> advance parameter-identical; zero HALT; cap respected; at least one pre-existing flag-off
> project state byte-untouched by the whole run.

`verify` recomputes all 11 from the persisted evidence only (implemented; each maps to a
named boolean in `gate10_result.json`). The flag-off byte-reference was snapshotted at
preflight and is re-read + string-compared at verify.

## 6. Hygiene + open items

- `.gitignore` + `artifacts/projects/phase54_gate10_*/` (PHASE-48 W-4 precedent — driver
  scratch churn; spike evidence stays tracked).
- Open CTO rulings before real spend: **F-G1** (documentation skip) · **F-G2** (read-only
  prompt-recorder decorator). Neither blocks presenting the estimate.
- Known sequencing: owner turns happen while `node start-api.js` runs; driver legs run
  between them (strictly sequential, disk-handoff).

## STOP

Preparation complete at **$0** (preflight + DRY_PASS evidence on disk). Awaiting: CTO
presents the estimate (§4) to the owner → owner's explicit spend approval in chat →
then real-a → owner turn 1 → real-b → owner turn 2 → real-c → verify. Closure artifact,
status COMPLETE flip, push, and tag remain forbidden until Gate PASS + CTO closure-diff +
push GO.

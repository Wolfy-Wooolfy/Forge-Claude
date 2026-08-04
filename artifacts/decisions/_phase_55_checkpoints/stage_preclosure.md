# PHASE-55 — Checkpoint C3: stage_preclosure (after W-3 + W-4-code + W-5, per PROMPT-STAGE-55 §3)

- Date: 2026-08-04
- Phase: PHASE-55 — HARDENING BATCH
- Decision: DECISION-2026-08-03-phase-55-hardening-batch.md (rulings R-1..R-26, errata E-1, CTO-F-A..F-E)
- GO scope honored: W-3 full · W-4 inventory + code only (**the R-7 restart cycle
  has NOT been run — the CTO's HOLD stands: the owner has not given a window; CC is
  READY to run it on relay**) · W-5 full (R-19 waiver: no SU; before/after quotes
  below). **Cost this leg: $0.** The W-1 real proof remains NOT run (not authorized).
- §ARC: **10** · L2 tools: **81** · roles: **13** — untouched.
- R-8 live-surface honored: W-3 = S57 json only · W-4 = RUN_FORGE.bat only ·
  W-5 = the two contract docs only (+ this checkpoint/artifact).
- Session note: a connection drop cut the prior session mid-W-5; state was
  re-established from disk per the CTO's R-0 (git status/log/diffstat; file
  integrity checks on S57/S387/helper/RUN_FORGE.bat; section-list + duplication
  audit on 24_MVP_LOOP_CONTRACT.md — SOUND; suite re-run green). No divergence
  found between the intended and on-disk state.
- Chain (all LOCAL): `eed8f30d` D0 · `88fbb36c` W-1+C1 · `de76ef9b` W-2+C2 ·
  `<this commit>` W-3 + W-4-code + W-5 + this checkpoint. CC pushed nothing; the
  owner may push independently — control point: annotated tag.

---

## 1. W-3 — S57 environment guard (closes PHASE-54 R-14)

### R-17 measurement — RAW probe output, BOTH binaries, verbatim (R-9)

```
=== probe pip3 ===
{
  "status": "SUCCESS",
  "output": {
    "stdout": "pip 24.2 from C:\\Users\\Khaled Elmasry\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\pip (python 3.12)\r\r\n",
    "stderr": "",
    "exit_code": 0,
    "timed_out": false
  }
}
=== probe pip ===
{
  "status": "SUCCESS",
  "output": {
    "stdout": "pip 24.2 from C:\\Users\\Khaled Elmasry\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\pip (python 3.12)\r\r\n",
    "stderr": "",
    "exit_code": 0,
    "timed_out": false
  }
}
```

**Both probe SUCCESS ⇒ value = `"pip3"`** per R-17 (mirrors pip_adapter.js:22's
primary choice). One line added to S57 (`"requires_binary": "pip3"` at line 6).
Backlogged per R-17: `requires_binary` is a single string and cannot express
"pip3 OR pip"; widening to an array is a capability change, forbidden by R-1.

### Test-first evidence (R-2) — double RED, then GREEN both ways, verbatim

**RED (one stripped-PATH run, BEFORE the S57 edit)** — PATH filtered of every
Python entry (`pip3`/`pip`: command not found; node v24.18.0 unaffected):

```
  ✗  S387   S57 declares the requires_binary environment guard — meta-lock, S340 pattern (PHASE-55 W-3, closes PHASE-54 R-14)
         FAIL assertion [state_field_equals]: state.s57_declares_requires_binary: expected true, got false
  ✗  S57    pkg.install pip installs package into test workspace --target (Tier 1)
         FAIL assertion [status_equals]: status: expected 'SUCCESS', got 'FAILED'
         FAIL assertion [state_field_equals]: state.adapter_id: expected "pip", got undefined
         FAIL assertion [state_field_equals]: state.action: expected "install", got undefined
         FAIL assertion [state_field_equals]: state.exit_code: expected 0, got undefined
FAILURES DETECTED — 378 passed, 2 failed, 5 skipped (385 total)
```

That is the R-14 defect verbatim: in a Python-absent environment S57 turns the
suite RED instead of SKIP — plus S387's meta-lock RED (declaration absent).

**GREEN leg 1 — Python-stripped PATH (AFTER the one-line edit):**

```
  ✓  S387   S57 declares the requires_binary environment guard — meta-lock, S340 pattern (PHASE-55 W-3, closes PHASE-54 R-14)
  ○  S57    pkg.install pip installs package into test workspace --target (Tier 1)
         skip: binary not found: pip3
ALL PASS — 379 passed, 0 failed, 6 skipped (385 total)
duration: 52940ms
```

**GREEN leg 2 — normal PATH:**

```
  ✓  S387   S57 declares the requires_binary environment guard — meta-lock, S340 pattern (PHASE-55 W-3, closes PHASE-54 R-14)
  ✓  S57    pkg.install pip installs package into test workspace --target (Tier 1)
ALL PASS — 380 passed, 0 failed, 5 skipped (385 total)
duration: 57976ms
```

### Closure arithmetic (R-6) — BOTH counts, pre-declared by the CTO and MEASURED

| Environment | Measured | Matches the pre-declared count |
|---|---|---|
| Python/pip present | **380 / 0 / 5 (385)** | ✓ |
| Python/pip absent | **379 / 0 / 6 (385)**, S57 skip_reason `binary not found: pip3` | ✓ |

N = 4 (S384, S385, S386, S387) — as declared at Step 0 and unchanged.

## 2. §R-18 — Task Scheduler inventory (CTO-F-B), stated explicitly

**(a) What the scheduled task launches.** The installer registers EXACTLY ONE
task, `ForgeAPI` (windows_task_scheduler_install.bat:26 `set "TASK_NAME=ForgeAPI"`;
Register-ScheduledTask at :83-88). Its action is
`wscript.exe resurrect_hidden.vbs "<node.exe>" "<pm2 CLI>"`, and the VBS runs
**`pm2 resurrect` ONLY**, hidden and non-blocking:

> resurrect_hidden.vbs: `cmd = """" & WScript.Arguments(0) & """ """ & WScript.Arguments(1) & """ resurrect"` · `sh.Run cmd, 0, False`

The pre-PHASE-49 direct invocation is explicitly retired in the installer's own
header (:8-9): *"(Previously this task ran `node start-api.js` directly — a
second, un-supervised boot path that competed with pm2 for :3100; retired in
PHASE-49 W-D.)"* No second task exists.

**(b) Port 3100.** Neither the task nor the VBS binds anything (both exit
immediately). Port 3100 is bound only by a **pm2-managed** forge process, if and
only if the pm2 dump contained one for `resurrect` to restore.

**(c) The contradiction — resolved from the scripts: the INSTALL comment is
STALE.** INSTALL_FORGE.bat:72-75 says *"Task Scheduler is the sole boot
mechanism … any saved pm2 forge process must be cleared so it cannot race Task
Scheduler at boot"*, and :78-79 then runs `pm2 delete forge` + `pm2 save --force`
— leaving an EMPTY dump. Since the AtLogOn task only runs `pm2 resurrect`, a
fresh install resurrects NOTHING: **Forge does not auto-start at boot under the
current scripts.** The "sole boot mechanism" wording dates from the era when the
task ran `node start-api.js` directly — the exact path :8-9 records as retired in
PHASE-49 W-D. There is no second task. Empirical corroboration: the owner starts
Forge manually via RUN_FORGE.bat (OPS note 2026-07-30). Recorded as backlog item
§6.7-5 in the decision artifact (fixing it — correct the comment or save the dump
at install — changes boot behavior and needs its own decision; NOT absorbed into
W-4).

**(d) Does the RUN_FORGE.bat sequence fight the task? NO — no scope growth.**
Everything the task can ever start is a pm2-managed process in the SAME pm2
daemon RUN_FORGE.bat talks to. The new tolerant `pm2 delete forge` therefore
cleanly stops and removes exactly that entry (task-resurrected or interactive)
BEFORE the port sweep, so `taskkill` never kills a managed process behind pm2's
back and autorestart cannot race the script; the sweep now catches only genuinely
unmanaged strays. The fix does NOT touch the pm2 dump, so whatever boot behavior
exists today is preserved bit-for-bit. Restart-safety requires NO reconciliation
with a foreign process ⇒ no STOP-AND-REPORT.

## 3. W-4 — code delivered; R-7 cycle ON HOLD

RUN_FORGE.bat +13 lines: a commented restart-safe block inserting tolerant
`pm2 delete forge` (INSTALL_FORGE.bat:78 precedent) BEFORE the port-orphan sweep;
the EPERM self-heal and the verified-start poll are untouched. File integrity
verified post-drop: 77 lines, balanced parens 25/25, properly closed final block.

**The stop → start → stop → start cycle has NOT been run**, explicitly per the
CTO's HOLD: it would drop the owner's server and the owner has not given a time
window. **CC is READY to execute the R-7 transcript the moment the window is
relayed.** Per R-19, W-4's RED = the failing restart transcript and GREEN = the
passing one — both will be appended to this checkpoint as a dated addendum after
the cycle runs.

## 4. W-5 — docs + convention (R-19 waiver; before/after quoted)

**(1) Commit-message convention** (durable home: decision artifact §10 A-2/§3.6):

> BEFORE (PHASE-54, factually wrong about repo state): `(LOCAL; no push/tag)`
> AFTER (PHASE-55, describes CC behavior only): `(CC pushed nothing; the owner may push independently — control point: annotated tag)`

**(2) 24_MVP_LOOP_CONTRACT.md §9 drift (F-5, CTO-confirmed):**

> BEFORE: `## 9. SU coverage (final — N = 9, S373–S381)` … `**Final count: N = 10 (S373–S382); closure gate 365 + 10 = 375.**` — and no S383 row
> AFTER: `## 9. SU coverage (final — N = 11, S373–S383; PHASE-55 additions S385/S386 below)` … `**Final count: N = 11 (S373–S383); closure gate 365 + 11 = 376.**` + the S383 row + an explicit correction note + a PHASE-55 table (S385/S386). §5 gained the R-16 third entry point; §7's R-45 limitation is marked **CLOSED in PHASE-55 W-2** with the closure attribution.

**(3) 17_AGENT_RUNTIME_CONTRACT.md (W-1 ledger + budget):**

> BEFORE: `**Projected cost** = getTotalCost(project_id) + estimateCost(provider, prompt).` — no sentinel-row schema, no marker, no legacy term
> AFTER: a "Legacy Stage-A metering rows" section (sentinel `_legacy_stage_a`, seam location, metering pricing with non-zero default, `tokens_unavailable` marker semantics, streaming VISIBLE-not-COSTED, R-13 embeddings exclusion, the R-15/E-1 double-visibility enumeration incl. reverse_vision) + `**Projected cost (PHASE-55 W-1)** = getTotalCost(P) + legacy_since_first_activity(P) + estimateCost(...)` with the R-21 bound spelled out.

**(4) R-25 owner-facing disclosure** (NEW — 17_AGENT_RUNTIME_CONTRACT.md §5):

> **بالعربي:** غطاء الميزانية (الـ cap) يحسب إنفاق الـ AI بدءاً من أول نشاط بناء فعلي للمشروع في سجل التكلفة. **محادثات بلورة الفكرة المبكرة (الـ ideation) التي تسبق أول نشاط بناء تظهر في السجل لكنها لا تُحتسب ضد غطاء المشروع.**
> **English:** the cap counts AI spend from a project's FIRST real build activity onward. **Early ideation turns that precede any build activity are VISIBLE in the ledger but NOT counted against the project's cap.**

**(5) R-26 owner-facing disclosure** (NEW — 24_MVP_LOOP_CONTRACT.md §7):

> **بالعربي:** في مشاريع الـ MVP، لو البناء فشل في الاختبارات مرتين، فورج **هيسألك أنت** بعد المحاولة الفاشلة الثانية بدل ما يفضل يعيد المحاولة في صمت لحد ما يستهلك الحد الأقصى للمحاولات.
> **English:** on MVP projects, if a build fails its tests twice, Forge **asks you** after the second failed attempt instead of silently retrying up to the iteration cap.

## 5. Independent revertibility (R-1) — per work item

- **W-3:** revert = remove the one `requires_binary` line from S57 + delete
  S387/helper; S387 pinpoints the removal; W-1/W-2/W-4/W-5 untouched.
- **W-4:** revert = remove the 13-line block from RUN_FORGE.bat; no other file
  references it; W-3/W-5 untouched.
- **W-5:** revert = restore the two doc sections; prose only, zero code coupling.
- Cross-item check: `git diff` for this leg touches S57.json, S387.json, the new
  helper, RUN_FORGE.bat and the two docs — no W-1/W-2 file appears.

## 6. Gates run (this leg)

| Gate | Result |
|---|---|
| Full SU suite (normal PATH, post-drop re-verification) | **ALL PASS — 380 / 0 / 5 (385)**, exit 0 |
| Full SU suite (Python-stripped PATH) | **ALL PASS — 379 / 0 / 6 (385)**, exit 0 |
| Track A | W-3/W-5 add no executable lines outside a scenario JSON + a read-only L2 helper (helper: zero direct fs/fetch/OpenAI/child_process); W-4 is a .bat ops script (not code/src) |
| `node --check` / JSON parse | helper SYNTAX OK · S57 + S387 JSON parse OK |
| §ARC / L2 / roles | **10 / 81 / 13** unchanged |
| Doc integrity (post-drop R-0) | 24_MVP_LOOP_CONTRACT.md sections 1→9.b in order, zero duplicated blocks, END OF DOCUMENT present |

## STOP (HARD)

W-3 + W-4-code + W-5 complete at **$0**. Outstanding, in order:
1. Owner fresh LOCAL-folder zip → CTO C3 verification.
2. Owner time window → CC runs the R-7 stop/start/stop/start cycle → transcripts
   appended here as a dated addendum (W-4 RED/GREEN per R-19).
3. Owner approval (separate) → W-1 real proof → evidence appended to C1 as a dated
   addendum.
4. Then closure per §5 of the prompt (both counts re-declared; closure artifact;
   status flip; LOCAL until CTO push GO; annotated tag `phase-55-complete` on the
   closure commit hash).

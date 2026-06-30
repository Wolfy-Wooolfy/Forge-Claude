# PHASE-46 · W-4 — MID CHECKPOINT (cross-domain validation driver: per-attempt forensic + keep-best record)

Status: **PAUSED for CTO review BEFORE any closure step** (per §3).
Mode: Mock / $0 — no real LLM calls. LOCAL only — no commit/push/tag.
Date: 2026-06-30.

Scripts-only forensic instrumentation. Both domain drivers (phase45 URL-shortener, phase43
Notes-API) now capture a per-attempt forensic record so a (gated) real run can PROVE the W-3
A-5 monotonic guard works. Implemented per the CTO-approved Step 0 map + both confirmed
decisions: codegen-prompt capture via the adapter wrapper in BOTH modes; no S344.

---

## 1. Files touched (3 — all `scripts/spikes/`, OUTSIDE the Track A live surface)

| File | Change |
|---|---|
| `scripts/spikes/_w4_build_forensic.js` | **NEW** shared forensic helper (createForensic) |
| `scripts/spikes/phase45_url_shortener_full_build.js` | **+17** — 5 instrumentation call sites |
| `scripts/spikes/phase43_notes_api_full_build.js` | **+17** — same 5 call sites |

---

## 2. EXPLICIT STATEMENT (per §3)

**LIVE SURFACE UNTOUCHED + §ARC = 10.** `git status --short | grep code/src/` → **zero hits**:
no change to `code/src/**` (ai_os / runtime / apiServer). The W-3 runtime is FROZEN. The
codegen-capture wrapper is installed at runtime by the driver (test-infra, exactly as phase44 +
build_loopback_test_helper already do) — not a live-surface edit. §ARC ledger = §ARC-1..§ARC-10
(§ARC-11 absent). NO new dependency. NO real API call (mock/$0).

---

## 3. NEW helper — `scripts/spikes/_w4_build_forensic.js` (full source)

```js
"use strict";
// PHASE-46 W-4 — shared per-attempt forensic instrumentation for the domain build drivers.
// SPIKE / scripts-only — OUTSIDE the Track A live surface. Mock/$0; no code/src/** change.
const { getAdapters }   = require("../../code/src/runtime/agents/_adapter_registry");
const { defineAdapter } = require("../../code/src/runtime/agents/_adapter_contract");

const REPAIR_MARKER  = "PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS"; // A-5 repair block marker
const CODEGEN_MARKER = "You are a code generator. Return STRICT JSON only"; // materializer prompt prefix

function createForensic({ root, projectId, evidenceDir }) {
  const records  = [];   // one finalized record per attempt (build-side + test-side merged)
  const captures = [];   // codegen prompts, one per materialize invoke (most-recent = current attempt)
  let loopId = null, _wrappedId = null, _wrappedReal = null;
  function setLoopId(id) { loopId = id; }

  // In-place wrap of the materializer's provider adapter (keeps the SAME id ⇒ mock fixture lookup
  // [mock_adapter.js:19 keys on input.provider] + the agent.invoke vision/budget bypass [keys on
  // "mock"] are unchanged). Pass-through; CAPTURES only the codegen prompt (filtered by CODEGEN_MARKER).
  function installCapture(providerId) {
    const real = getAdapters().get(providerId);
    if (!real) throw new Error("w4 forensic: provider adapter not loaded: " + providerId);
    _wrappedId = providerId; _wrappedReal = real;
    getAdapters().set(providerId, defineAdapter({
      id: providerId, label: "W-4 codegen capture (in-place pass-through wrapper for " + providerId + ")",
      available: function () { return real.available ? real.available() : Promise.resolve(true); },
      invoke: function (input) {
        const prompt = (input && input.prompt) || "";
        if (prompt.indexOf(CODEGEN_MARKER) !== -1) captures.push(prompt);
        return real.invoke(input);
      }
    }));
    return providerId;
  }
  function uninstallCapture() {
    if (_wrappedId && _wrappedReal) { try { getAdapters().set(_wrappedId, _wrappedReal); } catch (_) {} }
    _wrappedId = null; _wrappedReal = null;
  }

  async function _readJson(reg, relPath) {
    try { const r = await reg.invoke("fs.read_file", { path: relPath }, { root });
      if (r && r.status === "SUCCESS") return JSON.parse(r.output.content); } catch (_) {} return null;
  }
  async function _writeText(reg, relPath, content) {
    try { await reg.invoke("fs.write_file", { path: relPath, content: content }, { root }); } catch (_) {}
  }

  // Build-side capture (after buildProject + its guardCost): iteration_count + files + parse_result + codegen prompt.
  async function recordBuild(reg, opts) {
    const attempt = opts.attempt, b = opts.buildResult || {};
    let iterationCount = null;
    try {
      const st = await reg.invoke("orchestration.get_status", { project_id: projectId, loop_id: loopId }, { root });
      if (st && st.status === "SUCCESS" && st.output && typeof st.output.iteration_count === "number")
        iterationCount = st.output.iteration_count;
    } catch (_) {}
    const files = Array.isArray(b.files_written) ? b.files_written.map(function (f) { return f.path; }) : [];
    const parseResult = { rejected: b.build_error === "REBUILD_PARSE_FAILED",
      build_error: b.build_error || null, parse_errors: Array.isArray(b.parse_errors) ? b.parse_errors : null };
    const prompt = captures.length ? captures[captures.length - 1] : null;
    let codegenInfo = { captured: false, chars: 0, path: null, has_repair_block: false };
    if (typeof prompt === "string") {
      const rel = evidenceDir + "/codegen_prompt_attempt" + attempt + ".txt";
      await _writeText(reg, rel, prompt);
      codegenInfo = { captured: true, chars: prompt.length, path: rel, has_repair_block: prompt.indexOf(REPAIR_MARKER) !== -1 };
    }
    records.push({ attempt: attempt, iteration_count: iterationCount, advanced: b.advanced === true,
      advanced_to: b.advanced_to || null, files_written: files, parse_result: parseResult,
      codegen_prompt: codegenInfo, verdict: null, score: null, best_attempt: null });
  }

  // Test-side capture (after runTests + its guardCost): verdict + score + the W-3 keep-best snapshot.
  async function recordTest(reg, opts) {
    const attempt = opts.attempt, rt = opts.runResult || {};
    const rec = records.find(function (r) { return r.attempt === attempt; });
    if (!rec) return;
    rec.verdict = { advanced_to: rt.advanced_to || null, report_summary: rt.report_summary || null, test_error: rt.test_error || null };
    const ro = rt.report_summary || {};
    rec.score = (typeof ro.pass === "number") ? [ro.pass, (typeof ro.error === "number") ? -ro.error : 0] : null;
    const best = await _readJson(reg, "artifacts/projects/" + projectId + "/orchestration/" + loopId + "/best_attempt/best_attempt.json");
    rec.best_attempt = (best && Array.isArray(best.score))
      ? { score: best.score, files: Array.isArray(best.files) ? best.files : [], ts: best.ts || null } : null;
    await _writeLog(reg); // keep forensic_log.md current even if the driver stop()s on the cap path
  }

  async function _writeLog(reg) { /* writes a readable markdown table of `records` to evidenceDir/forensic_log.md */ }
  async function finalize(reg) { await _writeLog(reg); return records; }

  return { installCapture, uninstallCapture, setLoopId, recordBuild, recordTest, finalize, records };
}
module.exports = { createForensic };
```
(The `_writeLog` body builds the markdown table shown in §5; elided here for brevity — present in the file.)

---

## 4. Driver instrumentation — `phase45` + `phase43` (identical, +17 each)

```diff
+const { createForensic }           = require("./_w4_build_forensic");   // PHASE-46 W-4 per-attempt forensic
@@ (after `let costBefore = 0;` / the trace init)
+const forensic  = createForensic({ root: ROOT, projectId: PROJECT_ID, evidenceDir: EVIDENCE_DIR });
+trace.forensics = forensic.records;   // shared ref ⇒ included in EVERY trace save (incl. cap-path stop())
@@ runBuildTestLeg — after `await guardCost(reg, "buildProject#" + attempt);`
+    await forensic.recordBuild(reg, { attempt: attempt, buildResult: b });
@@ runBuildTestLeg — after `await guardCost(reg, "runTests#" + attempt);`
+    await forensic.recordTest(reg, { attempt: attempt, runResult: rt });
@@ main — immediately before `await runBuildTestLeg(reg, engine);`
+  forensic.setLoopId(globalLoopId);
+  forensic.installCapture(HOP.buildProject.mat_provider);   // in-place wrap "mock"/"openai"
@@ main — immediately after `await runBuildTestLeg(reg, engine);`
+  await forensic.finalize(reg);
+  forensic.uninstallCapture();
```
**No loop-logic change** — only additive forensic calls. `mat_provider` is NOT rerouted (the
in-place wrap keeps the provider id, so the mock S327 fixture lookup + the vision/budget bypass
are unchanged — an earlier distinct-id reroute broke the lookup [`INVALID_CODEGEN`]; corrected).

---

## 5. Per-attempt forensic record shape

```json
{ "attempt": 2, "iteration_count": 1, "advanced": true, "advanced_to": "RUN_TESTS",
  "files_written": ["app.js"],
  "parse_result": { "rejected": false, "build_error": null, "parse_errors": null },
  "verdict": { "advanced_to": "BUILDER", "report_summary": {"total":4,"pass":1,"fail":3,"error":0}, "test_error": null },
  "score": [1, 0],
  "best_attempt": { "score": [1,0,0], "files": ["app.js"], "ts": "…" },
  "codegen_prompt": { "captured": true, "chars": 3513, "path": "…/codegen_prompt_attempt2.txt", "has_repair_block": false } }
```
Output: `trace.forensics[]` (in the per-domain `phase4X_trace.json`) + a readable
`artifacts/spikes/<domain>/forensic_log.md` + per-attempt `codegen_prompt_attempt<N>.txt`.

---

## 6. The 4 $0 MOCK dry-run results

### RUN 1 — phase45 mock PASS (exit 0, COMPLETE)
1 attempt, `advanced_to: REVIEWER_CODE_AND_SECURITY`, `best_attempt: null` (a first-attempt PASS
never snapshots — correctly N/A), `codegen_prompt` captured (3513 chars).

### RUN 2 — phase45 mock FORCE_TEST_FAIL (exit 1, DRIVER_LOOPBACK_CAP_REACHED, cap=4)
```
| attempt | it | advanced_to | files | parse_rejected | verdict_score | best.score (engine) | codegen_chars | repair_block |
| 1 | 0 | BUILDER | 1 | false | [1,0] | [1,0,0] | 3513 | false |
| 2 | 1 | BUILDER | 1 | false | [1,0] | [1,0,0] | 3513 | false |
| 3 | 2 | BUILDER | 1 | false | [1,0] | [1,0,0] | 3513 | false |
| 4 | 3 | BUILDER | 1 | false | [1,0] | [1,0,0] | 3513 | false |
```
**`iteration_count` increments 0→1→2→3; `best.score` is CONSTANT [1,0,0] across all 4 attempts** —
the W-3 keep-best guard holding (a worse/equal rebuild never replaced the retained best).

### RUN 3 — phase43 mock PASS (exit 0, COMPLETE)
1 attempt, REVIEWER, `best_attempt: null`, codegen captured.

### RUN 4 — phase43 mock FORCE_TEST_FAIL (exit 1, DRIVER_LOOPBACK_CAP_REACHED, cap=2)
```
| 1 | 0 | BUILDER | 1 | false | [1,0] | [1,0,0] | 2888 | false |
| 2 | 1 | BUILDER | 1 | false | [1,0] | [1,0,0] | 2888 | false |
```
Same keep-best demonstration; codegen 2888 chars (domain-specific — Notes vs the shortener's 3513).

**Notes on the mock signal (expected, lands in the real gated run):**
- `parse_rejected: false` — the mock S327 fixture parses; Mechanism B's reject path is exercised by SU **S343**, and would fire on a real non-parsing rebuild.
- `has_repair_block: false` even on rebuilds — in mock, `_test_force_run_scenarios_result` bypasses the real `run_scenarios`/`verdict_aggregator`, so no `last_report.json` is written ⇒ A-5 `repair_feedback=[]` ⇒ no repair block. In the REAL run, `last_report.json` is written, so the repair block appears on rebuilds (`has_repair_block: true`).
- `best.score` constant across equal-score forced retries shows the RECORD + monotonicity; a worse-score rebuild displacing nothing (and the escalate-restore) is proven deterministically by SU **S342** (the driver cap < runtime cap, so the driver stops before the runtime escalates).

---

## 7. Byproduct disclosure (NOT a W-4 deliverable)

Running the 4 mock dry-runs **wiped + rebuilt** the tracked demo project dirs
`artifacts/projects/phase43_notes_api/` + `artifacts/projects/phase45_url_shortener/` with the
generic mock-S327 fixture output (`app.js`, `T-1_create_user…json`, etc.) — a byproduct of the
drivers' `rmSync`-on-start (they reset the workspace each run; PHASE-43/45 left the real-run output
committed). This is git churn under `artifacts/projects/**`, **not** part of the W-4 code
deliverable (which is the 3 `scripts/spikes/` files) nor the forensic evidence (under
`artifacts/spikes/**`). **Recommend** restoring those two project dirs (`git checkout -- …`) before
any W-4 commit — I did NOT run git ops (per the standing LOCAL/ask discipline); flagging for the CTO.

---

## 8. Gate status (deterministic) — pending the post-GO closure step

| Gate item | Status |
|---|---|
| Both drivers instrumented per the approved map | ✅ |
| 4 MOCK dry-runs produce the forensic record (per-attempt fields populated) | ✅ |
| Live surface (`code/src/**`) untouched; §ARC=10 | ✅ (git-confirmed) |
| Full suite still **336/0/5** | ⏳ post-GO (live surface untouched ⇒ suite unaffected; will confirm exact counts) |
| forge-doctor 35/0 FAIL | ⏳ post-GO |
| LOCAL only — no commit/push/tag | ✅ |

---

## ⏸️ PAUSE

Per §3, I STOP here for CTO review **before** the closure step. On your **GO** I will run
`node bin/forge-test.js` (expect **336/0/5, 341** — unchanged; live surface untouched) +
`node bin/forge-doctor.js` (35/0), report exact counts, and complete the §5 closure gate. Still
LOCAL, mock/$0.

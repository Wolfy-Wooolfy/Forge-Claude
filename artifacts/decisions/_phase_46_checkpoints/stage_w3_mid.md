# PHASE-46 · W-3 — MID CHECKPOINT (A-5 monotonic guard: keep-best + pre-flight parse)

Status: **PAUSED for CTO review BEFORE the full SU suite** (per §3).
Mode: Mock / $0 — no LLM calls. LOCAL only — no commit/push/tag.
Date: 2026-06-29.

The substantive runtime change of PHASE-46. Implemented exactly per the CTO-approved Step 0
DESIGN (both judgment calls confirmed: keep-best metric primary = `pass_scenarios`; parse-reject
= fail-closed HALT, no loop_back). The 3-lens adversarial critique's 3 BLOCKERs were all folded
in (shape-guarded + fail-OPEN snapshot/restore; `−error_scenarios` in the metric; set-exact
restore via L2 `fs.delete_file`).

---

## 1. Files touched (5)

| File | Change | Surface |
|---|---|---|
| `code/src/runtime/builtproject/js_syntax_check.js` | **NEW** — pure compile-only parse helper (imports only `vm`) | live (runtime) — Track A clean |
| `code/src/ai_os/conversationEngine.js` | Mechanism A helpers + snapshot/restore wiring (runTests) + Mechanism B parse-check (buildProject) | live (ai_os) — Track A clean |
| `code/src/testing/helpers/build_loopback_test_helper.js` | **+** S342/S343 runners + sequence codegen stub | test-infra |
| `code/src/testing/scenarios/S342_keep_best_attempt_monotonic.json` | **NEW** SU scenario | test-infra |
| `code/src/testing/scenarios/S343_parse_reject_non_parsing_rebuild.json` | **NEW** SU scenario | test-infra |

---

## 2. EXPLICIT STATEMENTS (per §3)

### (a) Track A clean + §ARC = 10
- Grep for `fs.*Sync | child_process | spawn | exec | fetch | new OpenAI` on the touched LIVE files:
  - `js_syntax_check.js` → imports **only `vm`** (a Node builtin ≠ child_process); no fs/network. The sole grep hit is a code COMMENT naming child_process in the §ARC note.
  - `conversationEngine.js` → my added lines use **only** `reg.invoke("fs.read_file" ×8 / "fs.write_file" ×5 / "fs.delete_file" ×1)` (existing L2 tools) + `crypto.createHash` (Node builtin, already `require`d at L5) + `checkParses`. The 3 pre-existing grep hits (L48 `_readJsonSafe`, L751 vision-verify, L1722 `reqRe.exec` = RegExp.exec) are NOT my code.
- **No §ARC added.** All keep-best file ops route into `artifacts/projects/<pid>/orchestration/<loopId>/best_attempt/` — the SAME L2-writable subtree `build_manifest` already uses. `fs.delete_file` is an existing L2 tool (WORKSPACE_WRITE, workspace-scoped). The parse check is pure in-memory. **§ARC ledger = §ARC-1..§ARC-10 (§ARC-11 absent).**

### (b) First-build (iteration_count === 0) byte-identity PRESERVED
- **Mechanism B (parse-check) is gated `if (iterationCount > 0)`** → it NEVER runs on a first build. A first build's path through materialize → manifest → advance is byte-identical to pre-W-3.
- **Mechanism A (snapshot) runs on the FAIL branch only** and is **additive + fail-OPEN**: it writes only under `…/best_attempt/`, never changes the codegen prompt, generated output, manifest, or the advance/loop-back decision. The PASS path is 100% untouched.
- **Evidence:** S335 (first-attempt codegen prompt byte-identical to pre-A-5), S336, S337 all still PASS (see §8).

### (c) Cap / escalation behavior UNTOUCHED
- `iteration_count` is mutated ONLY by `iteration_controller.tryAdvanceForLoopBack` (unchanged). My code never calls `loop_back` and never writes `iteration_count`.
- **Snapshot** reads the verdict before `loop_back` (does not change whether/how loop_back runs). **Restore** runs inside the `lbOut.escalated` branch AFTER `loop_back` already decided ESCALATED — it only rewrites disk files; the escalation decision, `iteration_count`, the ESCALATED state, and the return shape are unchanged.
- **Parse-reject** returns `advanced:false` WITHOUT calling `loop_back` (cap/iteration/escalation untouched) — S343 asserts `iteration_count` is unchanged across the reject.

### (d) run_scenarios shape finding (the §0 implementation check)
- **REAL path:** `builtproject.run_scenarios` → `verdict_aggregator.aggregate` returns `scenarios: [{id,name,status,duration_ms, assertions: r.assertions||[], error}]` (verdict_aggregator.js:34-41). `r.assertions` carry `{type, pass, reason}`. So `scenarios[].assertions[].pass` **IS present** on the real path ⇒ the `pass_assertions` tertiary term is meaningful. An **ERROR** scenario gets `assertions:[]` (harness_runner) ⇒ contributes 0 — which is exactly why the metric's `−error_scenarios` term exists.
- **FORCED-test path:** `_test_force_run_scenarios_result` injects `{overall_status,total,pass,fail,error}` with **no `scenarios[]`**. The SCORE shape-guard (`Array.isArray(runOutput.scenarios)?…:[]`) makes `pass_assertions = 0` (tertiary inert) and never throws — S342's attempt-1 deliberately uses a scenarios-less forced result to exercise this.

---

## 3. NEW FILE — `code/src/runtime/builtproject/js_syntax_check.js` (full source)

```js
"use strict";

// PHASE-46 W-3 (Mechanism B) — in-process JS syntax (parse) check.
//
// Pure, COMPILE-ONLY check using the Node `vm` builtin. The source is compiled
// (parsed) but NEVER executed — there is no `.runInThisContext()` / `.runInContext()`
// call — so there are NO side effects. A SyntaxError (e.g. a duplicate declaration,
// an unbalanced brace) throws at compile time and is reported.
//
// §ARC note: `vm` is a Node builtin and is NOT `child_process`, so the §ARC-3
// "files under runtime/builtproject MUST NOT import child_process" rule is not
// implicated. This module imports ONLY `vm` — no fs, no network, no new dependency,
// no child_process. §ARC stays frozen at 10.
//
// The content is wrapped in the exact CommonJS module wrapper Node uses, so a
// module that legitimately uses top-level `require` / `module.exports` / `return`
// compiles cleanly (no false positives), while a genuine SyntaxError still throws.

const vm = require("vm");

const WRAP_HEAD = "(function (exports, require, module, __filename, __dirname) {\n";
const WRAP_TAIL = "\n});";

// Compile-only parse check of a single CommonJS source string.
// Returns { ok: true } on success, or { ok: false, error: <message> } on SyntaxError.
function checkParses(content, filename) {
  let src = (content == null) ? "" : String(content);
  // Node strips a leading shebang before wrapping; mirror that so a `#!` first line
  // (valid only at true file start) does not produce a false SyntaxError.
  if (src.charCodeAt(0) === 0x23 /* # */ && src.charCodeAt(1) === 0x21 /* ! */) {
    const nl = src.indexOf("\n");
    src = (nl === -1) ? "" : src.slice(nl + 1);
  }
  try {
    /* eslint-disable no-new */
    new vm.Script(WRAP_HEAD + src + WRAP_TAIL, { filename: filename || "<generated>" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "parse error" };
  }
}

module.exports = { checkParses };
```

Standalone behavior verified: good module → `{ok:true}`; `const x=1; const x=2;` → `{ok:false, error:"Identifier 'x' has already been declared"}` (the PHASE-45 failure mode); unbalanced brace → `{ok:false}`; top-level `require`/`module.exports`/`return` → `{ok:true}` (no false positive).

---

## 4. RUNTIME DIFF — `code/src/ai_os/conversationEngine.js` (full)

```diff
@@ -1123,6 +1123,153 @@ function createConversationEngine(options = {}) {
+  // ── PHASE-46 W-3 (Mechanism A) — keep-best-attempt snapshot / restore ───────────
+  // [header comment — see §2 for the invariants]
+
+  function _bestAttemptDir(pid, loopId) {
+    return "artifacts/projects/" + pid + "/orchestration/" + loopId + "/best_attempt";
+  }
+
+  // Lexicographic score [pass_scenarios, -error_scenarios, pass_assertions]; higher is better.
+  // Shape-guarded: a forced runOutput WITHOUT a scenarios[] array scores pass_assertions = 0.
+  function _scoreRunOutput(runOutput) {
+    const passScen = (runOutput && typeof runOutput.pass  === "number") ? runOutput.pass  : 0;
+    const errScen  = (runOutput && typeof runOutput.error === "number") ? runOutput.error : 0;
+    const scn = (runOutput && Array.isArray(runOutput.scenarios)) ? runOutput.scenarios : [];
+    let passAssert = 0;
+    for (let i = 0; i < scn.length; i++) {
+      const as = (scn[i] && Array.isArray(scn[i].assertions)) ? scn[i].assertions : [];
+      for (let j = 0; j < as.length; j++) { if (as[j] && as[j].pass === true) passAssert++; }
+    }
+    return [passScen, -errScen, passAssert];
+  }
+
+  // Strict lexicographic "a > b". Equal ⇒ NOT greater (keep the FIRST attempt to reach a score).
+  function _scoreGreater(a, b) {
+    for (let i = 0; i < a.length; i++) {
+      if (a[i] > b[i]) return true;
+      if (a[i] < b[i]) return false;
+    }
+    return false;
+  }
+
+  // Snapshot the CURRENT build as the new best IFF its score strictly beats best-so-far.
+  // Manifest-present only. Best-effort / fail-OPEN.
+  async function _snapshotBestAttempt(reg, pid, loopId, runOutput) {
+    try {
+      const orchDir = "artifacts/projects/" + pid + "/orchestration/" + loopId;
+      const manRead = await reg.invoke("fs.read_file", { path: orchDir + "/build_manifest.json" }, { root });
+      if (!manRead || manRead.status !== "SUCCESS") return; // no manifest ⇒ nothing to snapshot
+      let manifest; try { manifest = JSON.parse(manRead.output.content); } catch { return; }
+      const files = (manifest && Array.isArray(manifest.files)) ? manifest.files : [];
+      if (files.length === 0) return;
+      const score = _scoreRunOutput(runOutput);
+      const bestDir  = _bestAttemptDir(pid, loopId);
+      const bestRead = await reg.invoke("fs.read_file", { path: bestDir + "/best_attempt.json" }, { root });
+      if (bestRead && bestRead.status === "SUCCESS") {
+        let best; try { best = JSON.parse(bestRead.output.content); } catch { best = null; }
+        if (best && Array.isArray(best.score) && !_scoreGreater(score, best.score)) return; // not better ⇒ keep
+      }
+      const projDir = "artifacts/projects/" + pid;
+      for (let i = 0; i < files.length; i++) {
+        const fpath = files[i] && files[i].path;
+        if (typeof fpath !== "string") continue;
+        const fr = await reg.invoke("fs.read_file", { path: projDir + "/" + fpath }, { root });
+        if (!fr || fr.status !== "SUCCESS") continue;
+        await reg.invoke("fs.write_file", { path: bestDir + "/files/" + fpath, content: fr.output.content }, { root });
+      }
+      await reg.invoke("fs.write_file", { path: bestDir + "/build_manifest.json", content: manRead.output.content }, { root });
+      await reg.invoke("fs.write_file", {
+        path: bestDir + "/best_attempt.json",
+        content: JSON.stringify({
+          score,
+          files:        files.map(function (f) { return f.path; }),
+          manifest_sha: files.map(function (f) { return { path: f.path, sha256: f.sha256 }; }),
+          ts:           new Date().toISOString()
+        }, null, 2)
+      }, { root });
+    } catch (_e) { /* fail-OPEN: snapshot must never break the loop */ }
+  }
+
+  // Restore best so the project's MANIFEST-TRACKED tree == best exactly: delete current-manifest
+  // files not in best (set-exact), write best's files back (sha256-verified), restore best's
+  // manifest. Best-effort / fail-OPEN. Non-manifest orphans (rare, non-consecutive attempts) may
+  // remain but are INERT (pipeline is manifest-scoped; best's entry only require()s best's files).
+  async function _restoreBestAttempt(reg, pid, loopId, ctxObj) {
+    try {
+      const bestDir  = _bestAttemptDir(pid, loopId);
+      const bestRead = await reg.invoke("fs.read_file", { path: bestDir + "/best_attempt.json" }, { root });
+      if (!bestRead || bestRead.status !== "SUCCESS") return; // no best ⇒ nothing to restore
+      let best; try { best = JSON.parse(bestRead.output.content); } catch { return; }
+      const bestFiles = (best && Array.isArray(best.files)) ? best.files : [];
+      if (bestFiles.length === 0) return;
+      const bestSet = {};
+      for (let i = 0; i < bestFiles.length; i++) bestSet[bestFiles[i]] = true;
+      const shaMap = {};
+      (Array.isArray(best.manifest_sha) ? best.manifest_sha : []).forEach(function (e) {
+        if (e && e.path) shaMap[e.path] = e.sha256;
+      });
+      const projDir = "artifacts/projects/" + pid;
+      const orchDir = "artifacts/projects/" + pid + "/orchestration/" + loopId;
+      // (1) Orphan removal over the CURRENT manifest tree: delete current files not in best.
+      const curManRead = await reg.invoke("fs.read_file", { path: orchDir + "/build_manifest.json" }, { root });
+      if (curManRead && curManRead.status === "SUCCESS") {
+        let curMan; try { curMan = JSON.parse(curManRead.output.content); } catch { curMan = null; }
+        const curFiles = (curMan && Array.isArray(curMan.files)) ? curMan.files : [];
+        for (let i = 0; i < curFiles.length; i++) {
+          const cpath = curFiles[i] && curFiles[i].path;
+          if (typeof cpath === "string" && !bestSet[cpath]) {
+            try { await reg.invoke("fs.delete_file", { path: projDir + "/" + cpath }, ctxObj || { root }); } catch (_d) {}
+          }
+        }
+      }
+      // (2) Write best's files back (sha256-verified; skip a corrupt snapshot file).
+      for (let i = 0; i < bestFiles.length; i++) {
+        const fpath    = bestFiles[i];
+        const snapRead = await reg.invoke("fs.read_file", { path: bestDir + "/files/" + fpath }, { root });
+        if (!snapRead || snapRead.status !== "SUCCESS") continue;
+        const want = shaMap[fpath];
+        if (want) {
+          const got = crypto.createHash("sha256").update(snapRead.output.content, "utf8").digest("hex");
+          if (got !== want) continue; // corrupt snapshot ⇒ do NOT write known-bad content
+        }
+        await reg.invoke("fs.write_file", { path: projDir + "/" + fpath, content: snapRead.output.content }, ctxObj || { root });
+      }
+      // (3) Restore best's manifest so the manifest-tracked tree on disk == best.
+      const bestManRead = await reg.invoke("fs.read_file", { path: bestDir + "/build_manifest.json" }, { root });
+      if (bestManRead && bestManRead.status === "SUCCESS") {
+        await reg.invoke("fs.write_file", { path: orchDir + "/build_manifest.json", content: bestManRead.output.content }, ctxObj || { root });
+      }
+    } catch (_e) { /* fail-OPEN: restore must never break escalate/return */ }
+  }

@@ -1326,6 +1473,43 @@  (Mechanism B — parse-check, in _buildProjectImpl after matResult SUCCESS, before manifest)
+      if (iterationCount > 0) {
+        const { checkParses } = require("../runtime/builtproject/js_syntax_check");
+        const writtenFiles = Array.isArray(matOut.files_written) ? matOut.files_written : [];
+        const parseErrors  = [];
+        for (let fi = 0; fi < writtenFiles.length; fi++) {
+          const fpath = writtenFiles[fi] && writtenFiles[fi].path;
+          if (typeof fpath !== "string" || !fpath.endsWith(".js")) continue;
+          const fileRead = await reg.invoke("fs.read_file", {
+            path: "artifacts/projects/" + normalizeProjectId(projectId) + "/" + fpath
+          }, { root });
+          if (!fileRead || fileRead.status !== "SUCCESS") continue; // unreadable ⇒ skip
+          const parseRes = checkParses(fileRead.output.content, fpath);
+          if (!parseRes.ok) parseErrors.push({ path: fpath, error: parseRes.error });
+        }
+        if (parseErrors.length > 0) {
+          await _restoreBestAttempt(reg, normalizeProjectId(projectId), loopId, buildCtx);
+          return { ok: true, loop_id: loopId, advanced: false,
+                   build_error: "REBUILD_PARSE_FAILED", parse_errors: parseErrors,
+                   files_written: matOut.files_written };
+        }
+      }

@@ -1653,6 +1837 @@  (Mechanism A — snapshot, in runTests, FAIL branch, before loop_back)
+    await _snapshotBestAttempt(reg, pid, loopId, runOutput);

@@ -1667,6 +1856 @@  (Mechanism A — restore, in runTests, inside the lbOut.escalated branch, before return)
+      await _restoreBestAttempt(reg, pid, loopId, { root });
```
(The complete unified diff is the working-tree change; the above reproduces every added line verbatim grouped by seam.)

---

## 5. TEST-INFRA — `build_loopback_test_helper.js` additions (summary)

- `_makeSequenceStub(fileSets)` — a deterministic codegen stub returning the Nth file set on the Nth materialize (one invoke per build), so each attempt's file set is fully controlled (independent of the A-5 repair marker).
- `_w3TestPlan(probePath)` / `_w3BuildBody(pid, loopId)` — shared minimal fixtures.
- `runS342KeepBest()` — attempt-1 `{server,b,c}` forced 6/7 (best; **scenarios-less forced result → exercises the SCORE shape-guard**); attempt-2 `{server,b,d}` forced 3/7 (worse, drops c, adds orphan d); `iteration_count` seeded to `CAP-1` so attempt-2's loop_back ESCALATEs → set-exact restore. Asserts: best kept (score[0]===6), `rt2` escalated, disk `server.js`==best, `c.js` restored, **`d.js` orphan deleted**, manifest==best `{b,c,server}`.
- `runS343ParseReject()` — attempt-1 GOOD server (best); attempt-2 emits non-parsing `const x = ;` → parse-check REJECTS. Asserts: `advanced:false` + `build_error:"REBUILD_PARSE_FAILED"` + non-empty `parse_errors`, best preserved, disk restored to the parsing best, **`iteration_count` unchanged** (no loop_back).
- `module.exports` extended with `runS342KeepBest`, `runS343ParseReject`.

---

## 6. NEW SU SCENARIOS

### S342_keep_best_attempt_monotonic.json
```json
{
  "id": "S342",
  "name": "PHASE-46 W-3 keep-best — a worse rebuild does not replace best; ESCALATE set-exact restore makes disk == best (orphan deleted)",
  "type": "module_call", "permission": "WORKSPACE_WRITE",
  "module": "code/src/testing/helpers/build_loopback_test_helper",
  "method": "runS342KeepBest", "args": [], "cleanup_project": "s342_keep_best",
  "assertions": [
    { "type": "status_equals", "expected": "SUCCESS" },
    { "type": "state_field_equals", "field": "attempt1_advanced",     "expected": true },
    { "type": "state_field_equals", "field": "best_after1_score6",    "expected": true },
    { "type": "state_field_equals", "field": "attempt2_advanced",     "expected": true },
    { "type": "state_field_equals", "field": "rt2_escalated",         "expected": true },
    { "type": "state_field_equals", "field": "best_kept_score6",      "expected": true },
    { "type": "state_field_equals", "field": "disk_server_is_best",   "expected": true },
    { "type": "state_field_equals", "field": "disk_c_restored",       "expected": true },
    { "type": "state_field_equals", "field": "disk_d_orphan_deleted", "expected": true },
    { "type": "state_field_equals", "field": "manifest_is_best",      "expected": true }
  ]
}
```

### S343_parse_reject_non_parsing_rebuild.json
```json
{
  "id": "S343",
  "name": "PHASE-46 W-3 pre-flight parse — a non-parsing rebuild is rejected (REBUILD_PARSE_FAILED, no advance, no loop_back), best restored",
  "type": "module_call", "permission": "WORKSPACE_WRITE",
  "module": "code/src/testing/helpers/build_loopback_test_helper",
  "method": "runS343ParseReject", "args": [], "cleanup_project": "s343_parse_reject",
  "assertions": [
    { "type": "status_equals", "expected": "SUCCESS" },
    { "type": "state_field_equals", "field": "attempt1_advanced",         "expected": true },
    { "type": "state_field_equals", "field": "rt1_looped_back",           "expected": true },
    { "type": "state_field_equals", "field": "reject_advanced_false",     "expected": true },
    { "type": "state_field_equals", "field": "reject_error_code",         "expected": true },
    { "type": "state_field_equals", "field": "reject_has_parse_errors",   "expected": true },
    { "type": "state_field_equals", "field": "best_preserved",            "expected": true },
    { "type": "state_field_equals", "field": "disk_restored_parsing",     "expected": true },
    { "type": "state_field_equals", "field": "iteration_count_unchanged", "expected": true }
  ]
}
```

---

## 7. Test evidence (targeted; mock / $0)

`node bin/forge-test.js --scenario S342 --scenario S343 --scenario S335 --scenario S336 --scenario S337`:
```
✓  S335   A-5 build loopback — first-attempt codegen prompt byte-identical to pre-A-5 …
✓  S336   A-5 build loopback — codegen prompt carries the report's failing assertion …
✓  S337   A-5 build loopback — end-to-end convergence …
✓  S342   PHASE-46 W-3 keep-best — a worse rebuild does not replace best; ESCALATE set-exact restore …
✓  S343   PHASE-46 W-3 pre-flight parse — a non-parsing rebuild is rejected …
ALL PASS — 5 passed, 0 failed, 0 skipped (5 total)
```
S335/S336/S337 unchanged-GREEN confirm first-build byte-identity + no loopback regression.

### Transparency — one bug found + fixed during build (TEST-INFRA only, NOT runtime)
First S342 run failed: `rt1` returned `ENTRY_UNRESOLVED`. Cause: my initial S342 file sets (`a.js/b.js/c.js`) had no recognized server entry, so runTests' PHASE-30 entry-derivation bailed BEFORE reaching the verdict/snapshot. Fix: gave S342's file sets a real `src/server.js` entry (runtime code unchanged). Re-run → 5/5 PASS. (S343 was unaffected — its files already include `src/server.js`.)

---

## 8. Gate status (deterministic) — pending full suite run

| Gate item | Status |
|---|---|
| Parse check + keep-best implemented per approved design | ✅ |
| First-build byte-identity (S335-style) preserved | ✅ (S335/S336/S337 PASS) |
| Two new SU scenarios PASS | ✅ (S342, S343) |
| Full SU suite green, no regression vs 334/0/5 → expect **336/0/5 (341 total)** | ⏳ NOT run as the closure step (gated). A diagnostic full run during build showed 335/1/5 with the now-fixed S342; re-run is the post-GO step. |
| forge-doctor 35 / 0 FAIL | ⏳ NOT run (gated) |
| Track A grep clean on touched files; §ARC=10 | ✅ |
| LOCAL only — no commit/push/tag | ✅ |

---

## ⏸️ PAUSE

Per §3, I STOP here for CTO review **before** running the full SU suite + forge-doctor as the
closure step. On your **GO** I will run `node bin/forge-test.js` (expect **336/0/5, 341 total**) +
`node bin/forge-doctor.js` (35/0), report exact counts, and complete the §5 closure gate.
Still LOCAL, mock/$0.

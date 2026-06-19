# PHASE-40 · STEP A — MID-CHECKPOINT (C2 cross-project write isolation, Option (i))

**Date:** 2026-06-19 · **Status:** MID — STOP for CTO mid-review · **Cost:** mock-only, **$0** (no LLM calls)
**Decision:** [DECISION-2026-06-19-phase-40-c2-cross-project-write-isolation.md](../DECISION-2026-06-19-phase-40-c2-cross-project-write-isolation.md) (AMENDMENT 1 = CTO design approval)

---

## 1. §A.0 TRACE GATE — result: **PROCEED**

### (a) New-project CREATION write sequence (real flow)
`apiServer.createProject` ([apiServer.js:871-897](../../../code/src/workspace/apiServer.js#L871-L897)):
```
L883  await writeActiveProject(projectId);                 // B becomes active FIRST
L885  const state = await persistProjectState(projectId,{…}) // THEN B's project_state.json is written
```
**create→activate ordering HOLDS** — B is activated before its init-writes. Note also
`activeProjectManager.setActiveProject` ([activeProjectManager.js:54-57](../../../code/src/ai_os/activeProjectManager.js#L54-L57))
**requires** `project_state.json` to exist before it will flip the on-disk pointer — but that path is the
manual `/api/projects/activate` flow; `createProject` uses `writeActiveProject` + `persistProjectState`
directly, so the create path is not gated by that pre-existence check.

**Why creation is safe under Option (i):** the policy uses the **ambient register** (in-memory), NOT the
on-disk `active_project.json`. Creation is NOT one of the declared-operation seams, so during a fresh
`createProject` the ambient is `null` → the **null carve-out** allows B's init-writes regardless of which
project is the on-disk active. No governance-filename whitelist needed (per CTO ruling). Proven by **S331**.

### (b) Operation ENTRY-POINT seam(s)
Confirmed `buildProject` ([conversationEngine.js:~1115](../../../code/src/ai_os/conversationEngine.js#L1115))
is the right seam (it already computes `projectId` + threads `buildCtx`; S327 exercises it on the real path).
**Full list of project-scoped pipeline entry-points** (all in `conversationEngine`, all currently pass
`{ root }` only on their non-build writes): `formalizeSpec`, `reviewSpec`, `estimateCost`, `reportEnv`,
`designTests`, **`buildProject`**, `runTests`, `reviewProject`, `documentProject`, `judgeQuality`,
`deployProject`. **STEP-A implements the seam in `buildProject`** (the highest-risk write op — it
materializes arbitrary codegen; S327-covered). **OPEN QUESTION for CTO (§7):** wire the ambient seam into
the other 10 bridges now, or as a bounded follow-up before closure? They are defense-in-depth (each already
writes only to its own project); none is required by the controls below.

---

## 2. diff --stat (intended changes)

```
 artifacts/decisions/…phase-40-c2-cross-project-write-isolation.md |  2 +-   (date-ref fix; AMENDMENT 1 appended separately)
 code/src/ai_os/conversationEngine.js                              | 26 +++++   (entry-point seam: wrapper + _buildProjectImpl rename + _getSeamPolicy)
 code/src/runtime/permission/permissionPolicy.js                   | 24 ++++    (ambient register + thread into checkScope)
 code/src/runtime/permission/permissionRules.js                    | 35 +++---  (checkScope unified rule: ctx OR ambient)
 code/src/testing/scenario_runner.js                               | 13 ++++    (harness hook: scenario.active_project)
 + 3 new scenarios: S329 (negative), S330 (positive), S331 (creation carve-out)
```
**Unrelated byproducts present in the working tree (NOT part of PHASE-40, NOT committed — STEP A stops
before any commit):** `progress/status.json` (a `last_doctor_run` timestamp bump) and
`artifacts/llm/decision_log.json` (+1 `test_apiserver_s25` DECISION_PACKET) + untracked
`artifacts/projects/test_apiserver_s28/project_state.json` — all leaked by a **full-suite run that was
accidentally launched (`forge-test.js --help` → ran all) and STOPPED mid-flight (~S28)**. A `git checkout`
to restore the two tracked files was attempted but **permission-denied**; left for owner cleanup. They do
not affect any PHASE-40 logic.

---

## 3. Exact code — the mechanism

### permissionRules.checkScope (unified rule; new 6th param `ambientActiveProject`)
```js
function checkScope(tool, input, ctx, dataMode, policyRoot, ambientActiveProject) {
  …
  const activeRef = (ctx && ctx.active_project_id) || ambientActiveProject || null;
  if (activeRef) {
    const projMatch = norm.match(/^artifacts\/projects\/([^/]+)\//);
    if (projMatch && projMatch[1] !== activeRef) {
      return { applicable: true, allowed: false, reason: "SCOPE_CROSS_PROJECT",
               detail: "Path '" + writePath + "' targets project '" + projMatch[1] +
                       "' while active project is '" + activeRef + "'" };
    }
  }
  …
}
```
Backward-compatible: `ambientActiveProject` undefined → behaves exactly as PHASE-36 (ctx-only). Only caller
is `permissionPolicy.js:188` (now passes `active_project`).

### permissionPolicy — ambient register (parallels active_mode/getActiveMode)
```js
let active_project = opts.active_project || null;                 // closure var
…
const scopeCheck = checkScope(tool, input, ctx, data_mode, root, active_project);
…
function setActiveProject(id) { active_project = id || null; }
function getActiveProject()   { return active_project; }
return { authorize, setActiveMode, getActiveMode, setActiveProject, getActiveProject };
```

### Entry-point seam (conversationEngine.buildProject) — try/finally, no leak
```js
function _getSeamPolicy() {              // lazy require; null if policy predates PHASE-40
  try {
    const { getDefaultPolicy } = require("../runtime/permission/permissionPolicy");
    const p = getDefaultPolicy();
    return (p && typeof p.setActiveProject === "function") ? p : null;
  } catch { return null; }
}

async function buildProject(body = {}) {                 // thin wrapper = the seam
  const _seamPolicy    = _getSeamPolicy();
  const _seamProjectId = normalizeProjectId(body.project_id || "");
  if (_seamPolicy) _seamPolicy.setActiveProject(_seamProjectId);
  try {
    return await _buildProjectImpl(body);                // existing body, unchanged & un-reindented
  } finally {
    if (_seamPolicy) _seamPolicy.setActiveProject(null); // paired clear — every set is cleared
  }
}
async function _buildProjectImpl(body = {}) { … original buildProject body … }
```
The default policy singleton (`getDefaultPolicy`) is the SAME instance the registry's `authorize` is bound
to, so the ambient set is honored on the real authorize path. `buildProject`'s own writes are ALSO
ctx-protected (buildCtx) — the seam is defense-in-depth and additionally arms the build's ctx-free
`get_status`/`advance_state` writes (which target the same project → ALLOWED).

### Harness hook (scenario_runner._runDirectTool) — test-infra only
```js
if (typeof scenario.active_project === "string" && scenario.active_project) {
  policy.setActiveProject(scenario.active_project);      // before the invoke
}
…
} finally {
  try { if (typeof policy.setActiveProject === "function") policy.setActiveProject(null); } catch {}
  …  // + resetDefaultPolicy discards the fresh per-scenario policy
}
```
Lets a scenario establish the ambient active project WITHOUT ctx. Backward-compatible (no `active_project`
field → no-op). The existing `scenario.ctx` passthrough (S326/S327) is untouched.

---

## 4. node --check (all edited .js)
```
OK: code/src/runtime/permission/permissionRules.js
OK: code/src/runtime/permission/permissionPolicy.js
OK: code/src/ai_os/conversationEngine.js
OK: code/src/testing/scenario_runner.js
```

## 5. Scenario results (isolated run, 20 scenarios)
```
✓ S329  NEGATIVE control — ambient active 'phase40_a', NO ctx, write→phase40_b  ⇒ DENIED / SCOPE_CROSS_PROJECT
✓ S330  POSITIVE control — ambient active 'phase40_a', write→phase40_a/own       ⇒ SUCCESS (no over-fire)
✓ S331  CREATION carve-out — ambient null, ctx-less write→new phase40_create_b   ⇒ SUCCESS (bootstrap preserved)
✓ S326  PHASE-36 C2 (ctx-explicit cross-project deny)                            ⇒ unchanged-GREEN
✓ S327  PHASE-36 C2 e2e (real buildProject + real materializerEngine)            ⇒ unchanged-GREEN
✓ S328  PHASE-36 C3 (PROMPT boot fail-fast)                                      ⇒ unchanged-GREEN
✓ S139 S140 S145 S146 S147 S148 S149 S150 S151 S152 S153 S154 S155 S156          ⇒ orchestration cluster all GREEN
─ ALL PASS — 20 passed, 0 failed, 0 skipped (20 total)
```

### 5.1 RED proof (S329 is a genuine RED→GREEN)
Temporarily neutralized the new ambient term in checkScope (`… || ambientActiveProject` → `… || null`) and
ran S329 in isolation:
```
✗ S329  status_equals: expected 'DENIED', got 'SUCCESS'
        state.reason:  expected 'SCOPE_CROSS_PROJECT', got undefined
FAILURES DETECTED — 0 passed, 1 failed
```
Exact shape of the PHASE-36 deferral-(a) hole (ctx-less cross-project write SUCCEEDS). Term restored;
S329 re-confirmed GREEN; `node --check` clean. The S331↔S329 differential (same tool, both ctx-less; only
the ambient + target differ) independently shows the ambient register is load-bearing.

---

## 6. Track A — clean (edited LIVE files)
- `permissionRules.js`: grep for `new OpenAI` / `child_process` / `fetch(` / `fs.(write|append|mkdir|unlink|rm)Sync` → **none**.
- `permissionPolicy.js`: only fs hits are L31-32 = the **pre-existing §ARC-9 permission-audit append**
  (`_auditDecision`), UNTOUCHED by this step. §ARC-9 already ledgers `permissionPolicy.js` (L28-32) — confirmed.
- `conversationEngine.js`: added only a lazy `require(permissionPolicy)` + the wrapper; no new
  fs/child_process/fetch/new OpenAI.
- `scenario_runner.js`: test infrastructure (not live surface); no new side-effect channel.
- Net: **§ARC stays 10**; no new direct fs/child_process/fetch; all real writes remain via the `fs.write_file` tool.

---

## 7. OPEN ITEMS for CTO mid-review
1. **Seam breadth:** wire the ambient seam into the other 10 pipeline bridges (formalizeSpec…deployProject)
   now, or as a bounded follow-up before closure? (buildProject done; rest are defense-in-depth, not required by the controls.)
2. **Creation carve-out proof:** S331 proves the policy-layer carve-out (null-ambient new-project write ALLOWED)
   deterministically via the real L3 policy + fs.write_file tool; the real `createProject` flow ordering is
   confirmed by the §A.0 read-only trace (not a live apiServer run). Acceptable, or want a module_call helper
   that drives real `createProject`?
3. **Byproduct cleanup:** approve `git checkout -- progress/status.json artifacts/llm/decision_log.json`
   (+ remove untracked `test_apiserver_s28/`) to clean the stopped-suite leakage before STEP B.

**STOP — awaiting CTO mid-review. No full suite, no commit, no push, no tag.**

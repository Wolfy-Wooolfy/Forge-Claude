# PHASE-42 — STEP B mid-checkpoint (FIRST HALF)

**Date:** 2026-06-22
**Decision:** [DECISION-2026-06-22-phase-42...md](../DECISION-2026-06-22-phase-42-built-project-test-harness.md) (AMENDMENT A-1, items 4–5)
**Contract:** [docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md §5](../../../docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md)
**Predecessor commit (STEP A docs):** `9900142`.

> Scope of FIRST HALF: B.1 (owner-facing read endpoint) + B.2 (minimal non-React render). HARD STOP here.
> NO suite run yet · NO progress/status.json change yet · NO new SU scenario yet.

---

## Deliverables (first half)
1. `code/src/workspace/apiServer.js` — NEW `GET /api/ai-os/project/test-report` route (placed right after the
   `POST /api/ai-os/project/run-tests` route) + a NEW explicit static route `GET /test-report.html` (placed with
   Handlers A/B, BEFORE the SPA fallback Handler C, so it is not shadowed by `index.html`).
2. `web/test-report.html` — NEW standalone vanilla HTML/CSS/JS view (no framework, no build step; does NOT touch
   `web/apps/forge-workspace`).

## New route handler source (pasted)

### API endpoint — `apiServer.js` lines 1949–1993
```js
      // PHASE-42 — owner-facing built-project test report (READ-ONLY).
      // Contract: docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md §5.
      // Sources the report via the read_report tool only — NO direct fs (Track A / A-1.6).
      if (req.method === "GET" && pathname === "/api/ai-os/project/test-report") {
        const projectIdRaw = (requestUrl.searchParams.get("project_id") || "").trim();
        if (!projectIdRaw) {
          sendJson(res, 400, { ok: false, reason: "PROJECT_ID_REQUIRED" });
          return;
        }
        const normId      = normalizeProjectId(projectIdRaw);
        const projectRoot  = getProjectArtifactsRoot(normId);
        const reg          = getDefaultRegistry();
        const result       = await reg.invoke(
          "builtproject.read_report",
          { project_root: projectRoot },
          { root }
        );

        if (result && result.status === "SUCCESS") {
          const o = result.output || {};
          sendJson(res, 200, {
            ok:             true,
            project_id:     normId,
            overall_status: o.overall_status,
            total:          o.total,
            pass:           o.pass,
            fail:           o.fail,
            error:          o.error,
            scenarios:      o.scenarios,
            report_path:    o.report_path,
            ran_at:         o.ran_at
          });
          return;
        }

        const reason = (result && result.metadata && result.metadata.reason) || "READ_REPORT_FAILED";
        if (reason === "REPORT_NOT_FOUND") {
          // Fail-SOFT: project reachable but no run yet — NOT a 500.
          sendJson(res, 200, { ok: true, project_id: normId, report: null, reason: "NO_REPORT" });
          return;
        }
        const detail = (result && result.metadata && result.metadata.detail) || null;
        sendJson(res, 500, { ok: false, project_id: normId, reason, detail });
        return;
      }
```

### Static serving route — `apiServer.js` lines 1675–1691
```js
      // PHASE-42 — standalone owner-facing test-report view. Explicit route BEFORE
      // the SPA fallback (Handler C) so it is not shadowed by index.html. Same static
      // mechanism as Handler A (reg.invoke fs.read_file); token injected like the shell.
      if (req.method === "GET" && pathname === "/test-report.html") {
        const reg = getDefaultRegistry();
        const r   = await reg.invoke("fs.read_file", { path: "web/test-report.html" }, { root });
        if (r.status === "SUCCESS") {
          const html = _activeToken !== null
            ? _injectForgeToken(r.output.content, _activeToken)
            : r.output.content;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        } else {
          sendJson(res, 404, { error: "Not found" });
        }
        return;
      }
```

## Track A grep over the NEW handler region only
Scan of `apiServer.js` lines 1675–1691 + 1949–1993 for `fs.*Sync | child_process | fetch( | new OpenAI(`:
```
Forbidden-pattern matches in new regions: NONE — clean

reg.invoke call sites (all I/O routed here):
1680: const r   = await reg.invoke("fs.read_file", { path: "web/test-report.html" }, { root });
1961: const result       = await reg.invoke(  // "builtproject.read_report"
```
All I/O on the new live-surface region routes through `reg.invoke` (`fs.read_file`, `builtproject.read_report`).
The `res.writeHead`/`res.end` are HTTP-response writes (not side-effect tools); `sendJson`, `_injectForgeToken`,
`getProjectArtifactsRoot`, `normalizeProjectId` are pre-existing house helpers (pure / path-only).
NOTE: `web/test-report.html` uses a browser `fetch()` to read the API — that is client-side JS, NOT the Track A
live surface (`apiServer.js` + `ai_os/**` + `runtime/**`), so it is not a Track A concern. §ARC stays frozen at 10.

## Boot confirmation (in-process, mock-only, $0)
Constructed `createWorkspaceApiServer({ root })` and `server.listen(0)` WITHOUT `.start()` (so `_activeToken`
stays null → auth skipped → no session-file write — the S332 pattern). Observed:
- `GET /api/ai-os/project/test-report?project_id=__boot_probe_nonexistent__` → **200** `{ ok:true, project_id:"boot_probe_nonexistent", report:null, reason:"NO_REPORT" }` (fail-SOFT path).
- `GET /test-report.html` → **200**, 5926 bytes, contains the page title (served before the SPA fallback).
- `GET /api/ai-os/project/test-report` (no project_id) → **400** `{ ok:false, reason:"PROJECT_ID_REQUIRED" }`.
- `git status --porcelain` after the boot smoke showed ONLY `M apiServer.js` + `?? web/test-report.html` — zero byproducts.

`node --check code/src/workspace/apiServer.js` → SYNTAX_OK.

The SUCCESS render path (report present) is exercised by the read_report tool's own SU coverage (S122) and will be
locked end-to-end through the endpoint by the new POSITIVE SU scenario in the SECOND HALF (B.4).

## How the owner reaches the view
- Page URL: **`/test-report.html`** (e.g. `http://127.0.0.1:<port>/test-report.html?project_id=<id>`).
- It auto-loads when `?project_id=` is present; otherwise a text input + "تحميل التقرير" button.
- It calls `GET /api/ai-os/project/test-report?project_id=<id>`, attaching `Authorization: Bearer window.__FORGE_TOKEN__`
  (the token the serving route injects into `<head>`, identical to the index shell).
- Renders: large PASS/FAIL banner, "نجح <pass> من <total> اختبار" + `ran_at`, a per-scenario ✓/✗ table; on
  `{ report:null, reason:"NO_REPORT" }` it shows "لسه مفيش اختبار اتشغّل للمشروع ده."

## Explicit STOP conditions honored
- **NO suite run** (deferred to SECOND HALF B.5).
- **NO `progress/status.json` change** (deferred to SECOND HALF B.3, gated).
- **NO new SU scenario** (deferred to SECOND HALF B.4).
- **NO push, NO tag.**

## Commit
LOCAL, selective add of ONLY: `code/src/workspace/apiServer.js`, `web/test-report.html`, this checkpoint.
(The STEP-A checkpoint `stage_a.md` remains untracked from STEP A by its literal selective-add scope; it will be
folded in at closure / by the owner interim commit.)

**HARD STOP — awaiting CTO "STEP B second-half GO".**

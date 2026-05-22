# Stage 13.5 Mid-Checkpoint
**Date:** 2026-05-22
**Stage:** 13.5 — Cutover + Performance + SPA Final
**Status:** §1.A + §1.B COMPLETE — awaiting CTO confirmation before §1.C

---

## §1.A — Cutover: COMPLETE

### Mechanism
- `web/index.html` archived to `web/index.legacy.html` with one-line retirement header:
  `<!-- RETIRED: 2026-05-22 — superseded by React production build (Stage 13.5). Do not modify. -->`
- `vite.config.ts` `outDir` changed from `'dist'` to `'../../'` — build now emits directly to `web/`
- `web/server.js` — two handlers added before the 404 fallback (at original line 835):
  1. `GET /assets/*` — path-traversal-safe static file server for `web/assets/` with MIME map (js, css, svg, png, ico, woff2, woff)
  2. SPA fallback: `GET && !req.url.startsWith("/api/")` → serves `web/index.html` — handles all React Router paths (`/chat`, `/projects`, `/vision`, `/kb`, `/doctor`)

### Build output in `web/` (confirmed)
```
web/index.html          0.49 kB (gzip: 0.30 kB)
web/assets/index-DTrtOOgM.js   52.22 kB (gzip: 17.14 kB)
web/assets/index-sxNlgzcu.css  14.95 kB (gzip:  3.78 kB)
web/assets/vendor-D0xakLYA.js 163.49 kB (gzip: 53.38 kB)
```
**Total gzip: 74.30 kB — under 500 kB budget.**

### Self-cleaning mechanism (FIX 1 — applied 2026-05-22)
`web/apps/forge-workspace/clean.js` deletes `../../index.html` and `../../assets/` before each build.
Wired as `"prebuild": "node clean.js"` in `package.json`.
Only removes the two build-output paths; does NOT touch `web/server.js`, `web/index.legacy.html`, or any other file in `web/`.

### API-base behaviour-change note
After cutover, `web/server.js` still injects `window.__FORGE_API_BASE__` on `GET /`, but the React app reads `import.meta.env.VITE_API_BASE` (baked at build time, default `http://localhost:3100`). The legacy runtime `FORGE_API_PORT` override **no longer applies** to the frontend. Standard setup (port 3100) is unaffected. If runtime port configurability is needed later, it requires a build-time or served-config mechanism — out of PHASE-13 scope.

---

## §1.B — Performance + Accessibility: COMPLETE

### Lighthouse scores (vite preview, port 4173, headless Chromium, Lighthouse 12.8.2)
| Category      | Score | Threshold | Status |
|---------------|-------|-----------|--------|
| Performance   | **100** | > 90 | ✅ PASS |
| Accessibility | **100** | > 90 | ✅ PASS |
| Best Practices | 96  | —    | —      |
| SEO           | 82   | —    | —      |

Report saved at: `web/apps/forge-workspace/lighthouse-report.json`

### Accessibility fixes applied (5 total)
All were flagged by Lighthouse with exact contrast ratios:

| Location | Fix | Before | After |
|---|---|---|---|
| `App.tsx:35` | nav "FORGE" label | `text-gray-500` (4.16:1) | `text-gray-400` (8.40:1) |
| `ChatView.tsx:257` | project selector wrapper | `text-muted-foreground` (4.23:1) | `text-gray-400` (8.40:1) |
| `ChatView.tsx:276` | empty-state text | `text-muted-foreground` (4.23:1) | `text-gray-400` (8.40:1) |
| `ChatInput.tsx` | textarea | `bg-background` + `placeholder:text-muted-foreground` | `bg-gray-800` + `placeholder:text-gray-400` (5.27:1) |
| `ChatView.tsx:260` | `project-id-input` | missing `aria-label` | `aria-label="Project ID"` |

All contrast values calculated against background `#030712` (bg-gray-950). Textarea placeholder calculated against `bg-gray-800` (#1f2937).

---

## Files modified in §1.A + §1.B

| File | Change |
|---|---|
| `web/index.legacy.html` | NEW — retired legacy HTML with retirement header |
| `web/index.html` | REPLACED — now React production build output |
| `web/assets/` | NEW — React build assets (3 files) |
| `web/apps/forge-workspace/vite.config.ts` | `outDir: 'dist'` → `outDir: '../../'` |
| `web/apps/forge-workspace/clean.js` | NEW — pre-build clean script |
| `web/apps/forge-workspace/package.json` | Added `"prebuild": "node clean.js"` |
| `web/server.js` | Added `/assets/*` static handler + SPA fallback |
| `web/apps/forge-workspace/src/App.tsx` | `text-gray-500` → `text-gray-400` on nav label |
| `web/apps/forge-workspace/src/views/ChatView.tsx` | `text-muted-foreground` → `text-gray-400` (2 divs), added `aria-label` |
| `web/apps/forge-workspace/src/components/chat/ChatInput.tsx` | `bg-background` + `placeholder:text-muted-foreground` → `bg-gray-800` + `placeholder:text-gray-400` |

---

## Pending (requires CTO confirmation before starting)
- §1.C — Playwright: run full 10-scenario suite, commit fresh `playwright-report/`
- §1.D — PHASE-13 closure artifact
- §1.E — Record known backend issues (DO NOT FIX)
- §1.F — Roadmap + status.json advance

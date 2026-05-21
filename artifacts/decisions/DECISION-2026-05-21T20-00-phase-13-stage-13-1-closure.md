# DECISION — Stage 13.1 Closure: Scaffold + Build Pipeline + Typed API Client Layer

> **Status:** CLOSED — all 10 closure gate conditions verified  
> **Date:** 2026-05-21  
> **Phase:** PHASE-13 (Conversational UX Polish)  
> **Stage:** 13.1 — Scaffold + Build Pipeline + Typed API Client Layer  
> **Owner approval:** pending CTO independent verification (STOP point)

---

## §1 Stage Summary

Stage 13.1 delivered the complete foundation for the `web/apps/forge-workspace/` React application:

- **§1.A** — Phase-13 decision artifact committed and approved  
- **§1.B** — `progress/status.json` updated with `phase_13` block  
- **§1.C** — React 18 + Vite 5 + TypeScript strict + Tailwind + shadcn/ui scaffold (5 route stubs, zero `any`, build passes)  
- **§1.D** — Typed API client layer covering all 24 backend endpoints across 6 files  
- **§1.E** — `API_ENDPOINT_MAP.md` written (24 rows, one per endpoint)

---

## §2 Files Created

### Scaffold (§1.C)
- `web/apps/forge-workspace/package.json`
- `web/apps/forge-workspace/vite.config.ts`
- `web/apps/forge-workspace/tsconfig.json`
- `web/apps/forge-workspace/tsconfig.app.json`
- `web/apps/forge-workspace/tsconfig.node.json`
- `web/apps/forge-workspace/tailwind.config.ts`
- `web/apps/forge-workspace/postcss.config.js`
- `web/apps/forge-workspace/components.json`
- `web/apps/forge-workspace/index.html`
- `web/apps/forge-workspace/src/vite-env.d.ts`
- `web/apps/forge-workspace/src/index.css`
- `web/apps/forge-workspace/src/main.tsx`
- `web/apps/forge-workspace/src/App.tsx`
- `web/apps/forge-workspace/src/lib/utils.ts`
- `web/apps/forge-workspace/src/components/ui/button.tsx`
- `web/apps/forge-workspace/src/views/ChatView.tsx`
- `web/apps/forge-workspace/src/views/ProjectsView.tsx`
- `web/apps/forge-workspace/src/views/VisionView.tsx`
- `web/apps/forge-workspace/src/views/KBView.tsx`
- `web/apps/forge-workspace/src/views/DoctorView.tsx`

### API Client Layer (§1.D)
- `web/apps/forge-workspace/src/api/types.ts`
- `web/apps/forge-workspace/src/api/base.ts`
- `web/apps/forge-workspace/src/api/auth.ts`
- `web/apps/forge-workspace/src/api/chat.ts`
- `web/apps/forge-workspace/src/api/projects.ts`
- `web/apps/forge-workspace/src/api/ai.ts`
- `web/apps/forge-workspace/src/api/governance.ts`
- `web/apps/forge-workspace/src/api/index.ts`

### Endpoint Map (§1.E)
- `web/apps/forge-workspace/API_ENDPOINT_MAP.md`

---

## §3 Closure Gate — All 10 Conditions

| # | Condition | Result |
|---|-----------|--------|
| 1 | `npm run build` exits 0 (after §1.C scaffold) | PASS — exit 0, 6.18s |
| 2 | TypeScript strict: zero `any`, zero type errors | PASS — `grep -rn ": any" src/` → 0 matches (exit 1) |
| 3 | `npm run build` exits 0 (after §1.D API client) | PASS — exit 0 |
| 4 | Bundle ≤ 500 KB gzip initial chunk | PASS — vendor: 53.37 KB + app: 1.65 KB = **55.02 KB gzip** (444 KB headroom) |
| 5 | Zero `any` in `src/` (grep) | PASS — 0 matches |
| 6 | All 5 route stubs reachable | PASS — ChatView, ProjectsView, VisionView, KBView, DoctorView all present |
| 7 | All 24 endpoints have typed client functions | PASS — 2 auth + 3 chat + 4 projects + 11 ai + 4 governance = 24 |
| 8 | Backend untouched; SU baseline 207/0/5 | PASS — `git diff HEAD -- code/src/ web/server.js apiServer.js` → 0 changes; `node bin/forge-test.js` → **207 passed, 0 failed, 5 skipped (212 total)** |
| 9 | Closure decision artifact written | THIS DOCUMENT |
| 10 | Final checkpoint written | `artifacts/decisions/_phase_13_checkpoints/stage_13_1.md` |

---

## §4 Key Technical Decisions

- **SSE streaming client:** `chatStream` implemented as `AsyncGenerator<ChatStreamEvent>` using `fetch` + `ReadableStream` — zero `any`, typed chunk union  
- **Error extraction:** string-key bracket notation with explicit type narrowing — no `any` casts  
- **`__dirname` unavailable in Vite ESM:** resolved via `fileURLToPath(new URL('./src', import.meta.url))`  
- **Bundle split:** vendor chunk (`react`, `react-dom`, `react-router-dom`) isolated via `manualChunks` — app code stays lean  
- **Index signatures:** `DraftPayload` and `HistoryItem` use `[key: string]: unknown` instead of `any`  
- **`import.meta.env`:** typed via `src/vite-env.d.ts` augmentation — `VITE_API_BASE?: string`

---

## §5 Constraints Confirmed

- Backend (`code/src/**`, `web/server.js`, `apiServer.js`) — **UNTOUCHED**  
- §ARC ledger — **UNCHANGED at 6**  
- No new npm packages added to root `package.json`  
- No `docs/**` files modified  
- No `any` in TypeScript code

---

## §6 Next Stage

Stage 13.2 — Chat Interface (ChatView full implementation with SSE streaming, project selector, message history).

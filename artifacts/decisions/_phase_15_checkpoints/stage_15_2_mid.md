# Stage 15.2 Mid-Checkpoint

**Date:** 2026-05-23
**Phase:** PHASE-15 — Stage 15.2 (Vision + KB frontend views)
**Checkpoint trigger:** §3 of PROMPT-STAGE-15.2 — after §1.A (VisionView) and BEFORE §1.B (KBView)

---

## §A — Vision View Design

### Component: `src/views/VisionView.tsx`

Replaces the 8-line stub (data-testid="vision-stub"). Pattern follows DoctorView.

**State:** `{ data: VisionData | null, loading: boolean, error: string | null }`
- Initial: `{ data: null, loading: true, error: null }`
- Fetches once on mount via `useEffect` + `void getVision()`
- No polling (vision doesn't change continuously)

**Rendering cases:**
1. `loading=true` → "loading…" text in header
2. `error !== null` → red error banner (same pattern as DoctorView)
3. `data === null && !loading && error === null` → `data-testid="vision-empty-state"` with "لا توجد رؤية محددة بعد."
4. `data !== null` → full VisionBody component:
   - Header: `project_name`, `domain` badge, `v{vision_version}` badge, Locked/Draft badge
   - Metadata grid: project_id, domain, vision_locked_at (if set), locked_by_role (if set)
   - Goals card: primary goal text + secondary goals as indented list
   - Constraints list (if any)
   - Non-goals list (if any)
   - Body `<pre data-testid="vision-body">` with whitespace-pre-wrap — no markdown renderer, no new dependency

**Container:** `<div data-testid="vision-view">` — replaces `data-testid="vision-stub"`

### API client: `src/api/vision.ts`

```typescript
// Interfaces: VisionGoals, VisionFrontmatter, VisionData, VisionResponse
// Function: getVision(projectId?: string): Promise<VisionResponse>
// → apiFetch('/api/vision' + optional ?project_id=...)
```

`VisionFrontmatter` mirrors visionSchema.js serializer fields exactly:
`project_id, project_name, domain, vision_version (number), vision_locked (boolean),
vision_locked_at (string|null), locked_by_role (string|null), amendments_history (unknown[]),
goals? (VisionGoals), constraints? (string[]), non_goals? (string[])`

### Null-case handling

When `GET /api/vision` returns `{ ok: true, vision: null }`:
- `res.vision` is `null`
- State is set to `{ data: null, loading: false, error: null }`
- The view renders `data-testid="vision-empty-state"` — no crash, no empty render

When backend returns 500 (`ok: false`):
- `apiFetch` throws `ApiError` (HTTP 500 → `!res.ok`)
- Caught in `.catch()` → state `{ error: message, loading: false }`
- Error banner renders

---

## §B — Build State

**Command:** `npm run build`
**Result:** Exit 0

```
../../index.html                   0.49 kB │ gzip:  0.31 kB
../../assets/index-DDCWcWvg.css   15.28 kB │ gzip:  3.88 kB
../../assets/index-CAxlYRO6.js    55.64 kB │ gzip: 17.93 kB
../../assets/vendor-D0xakLYA.js  163.49 kB │ gzip: 53.38 kB
✓ built in 4.63s
```

**Gzip JS total:** 17.93 + 53.38 = **71.31 KB** — well under 500 KB budget.
(Stage 13.5 baseline was ~74.3 KB; slight reduction due to Vite chunk splitting.)

**TypeScript:** `npm run typecheck` → exit 0, no errors.

**Zero `any`:** `grep -rn ": any" src/` → 0 matches (literal output: empty).

---

## §C — Backend untouched

No file in `code/src/**` or `apiServer.js` was modified in Stage 15.2. §ARC stays at 6.

---

## §D — Anything blocking §1.B

Nothing blocking. KBView plan:
- State: `{ data: KBSourcesResponse | null, loading: boolean, error: string | null }`
- Fetch: `getKBSources()` on mount
- Empty case (`count === 0`): `data-testid="kb-empty-state"`
- Source list: `<ul data-testid="kb-source-list">` — each item shows title/url, content_type badge, fetched_at, raw_byte_size formatted

API client `src/api/kb.ts` already written and type-checked (zero `any`).

---

**STOP — awaiting CTO confirmation to proceed to §1.B.**

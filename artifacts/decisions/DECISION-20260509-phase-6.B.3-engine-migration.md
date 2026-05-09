# DECISION-20260509-phase-6.B.3-engine-migration

**Date:** 2026-05-09
**Status:** OWNER_APPROVED
**Phase:** PHASE-6.B.3

---

## القرار

ترحيل `ideationEngine.js` و `businessAnalysisEngine.js` إلى L2 Tool Runtime، وإضافة scenario type جديد (`direct_engine`) مع scenarios S14/S15/S16 لإثبات الترحيل.

## Acceptance Criteria

| AC | Criterion |
|----|-----------|
| AC #1 | 0 `fs.writeFileSync` / `fs.mkdirSync` مباشر في `ideationEngine.js` |
| AC #2 | 0 `fs.writeFileSync` / `fs.mkdirSync` مباشر في `businessAnalysisEngine.js` |
| AC #3 | كل write site بيستخدم `reg.invoke("fs.write_file", ...)` عبر `getDefaultRegistry()` |
| AC #4 | `ensureDir` مُزالة من كلا الملفين |
| AC #5 | R3 ordering محفوظ: domain pivot state write (W3) قبل log append (W4) — sequential await |
| AC #6 | All 5 write sites في ideationEngine مغلّفة بـ `tryWriteJson`/`tryAppendArrayJson` (best-effort) |
| AC #7 | All 1 write site في businessAnalysisEngine مغلّفة بـ `tryAppendArrayJson` (best-effort) |
| AC #8 | `MockOpenAiService` تدعم content mode عبر `mockEntry.content` field |
| AC #9 | `scenario_runner.js` يحتوي `_runDirectEngine` + `_normalizeEngineResult` |
| AC #10 | S14 (direct_provider) → PASS — ideationExpansionProvider يرجع tool_call shape صحيح |
| AC #11 | S15 (direct_engine) → PASS — ideation_log.json موجود بعد expandIdea |
| AC #12 | S16 (direct_engine, content mode) → PASS — business_analysis_log.json موجود بعد analyzeProject |
| AC #13 | Negative test: تعطيل appendArrayJson في ideationEngine → S15 artifact_exists FAIL → revert → 16/16 |
| AC #14 | L3 reach test: S15 بـ READ_ONLY → DENIED في audit لـ ideation_log.json |
| AC #15 | لا leftover test_engine_* dirs بعد الـ harness |
| AC #16 | `node bin/forge-test.js` → 16 PASS / 0 FAIL / 0 SKIP |

## Technical Decisions

### F1 — ideationEngine migration pattern
- `writeJson` → async, `reg.invoke("fs.write_file", ...)`, throws on failure
- `appendArrayJson` → async, wraps writeJson
- `tryWriteJson` / `tryAppendArrayJson` → best-effort helpers (catch → console.warn)
- `ensureDir` → removed (fs.write_file tool creates dirs automatically)
- W1 (stateForFlag) → `tryWriteJson` | W2 (NAME_GOAL_MISMATCH log) → `tryAppendArrayJson`
- W3 (domain pivot state) → `tryWriteJson` | W4 (IDEA_EXPANSION log) → `tryAppendArrayJson`
- W5 (research_log) → `tryAppendArrayJson`
- R3: W3 awaited before W4 → ordering preserved by sequential execution

### F2 — businessAnalysisEngine migration pattern
- Same pattern: async writeJson, async appendArrayJson, tryAppendArrayJson for W6
- `ensureDir` → removed

### F3 — MockOpenAiService content mode
- New field: `mockEntry.content` (object)
- If `content` present → `_buildContentResponse()` → `choices[0].message.content = JSON.stringify(content)`, `tool_calls: []`, `finish_reason: "stop"`
- Else → `_buildToolCallResponse()` (existing behavior, renamed from `_buildResponse`)
- Field name `content` aligns with OpenAI API naming

### F4 — direct_engine scenario type
- `_normalizeEngineResult(raw, audit)`: `Object.assign({ ok: false, mode: "UNKNOWN", reason: null }, raw || {})` — defaults first, raw overrides
- `_runDirectEngine`: fixture from `scenario.fixture` merged with defaults, `project_id` forced last
- Mock: same fetch-override pattern as `_runDirectProvider`
- OPENAI_API_KEY: saved and restored in finally
- Deferred cleanup: same `enumerable: false` pattern as 6.B.2

### Scenarios
- **S14** (`direct_provider`): ideationExpansionProvider, tool_calls mock, assertions: status=SUCCESS, detected_domain=CRM, pivot_detected=false
- **S15** (`direct_engine`): ideationEngine.expandIdea, project fixture + tool_calls mock, assertions: PASS + ok=true + mode=IDEATION_IN_PROGRESS + artifact_exists ideation_log.json
- **S16** (`direct_engine`): businessAnalysisEngine.analyzeProject, fixture with requirement_completeness=true + content mock, assertions: PASS + ok=true + mode=BUSINESS_ANALYSIS_COMPLETE + artifact_exists business_analysis_log.json

## Risks

| Risk | Status |
|------|--------|
| FINDINGS-WARN-1 (carry-over from 5.1) | Open — deferred |
| FINDINGS-WARN-2 (carry-over from 5.1) | Open — deferred |
| Remaining ai_os engines on direct fs.* | Open — PHASE-6.B.4+ scope |

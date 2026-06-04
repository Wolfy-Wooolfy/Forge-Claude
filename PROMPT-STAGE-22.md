# PROMPT-STAGE-22 — Spec-Writer Bridge (second orchestration state)

You are the implementation arm for Forge (vanilla Node.js / CommonJS, Windows, repo at
`d:\S\Halo\Tech\Forge-Claude`). This PROMPT wires the **`spec_writer`** role into the orchestration
loop — the state right after the architect. Same pattern as PHASE-20.

The plan is authorized in `artifacts/decisions/DECISION-2026-06-04-phase-22-spec-writer-bridge.md`.
Read it. The decisions there are settled — do not re-litigate.

---

## §0 MANDATORY re-orientation (read, then post a short summary and STOP)

Before any code, read these and post a Step 0 summary, then wait for CTO GO:

1. `progress/status.json` — confirm `phase_21.status = CLOSED`, `next_phase = PHASE-22-PENDING-DECISION`,
   suite baseline `246/0/5 (251 total)`, §ARC 8, Doctor 35, roles 13.
2. `artifacts/decisions/DECISION-2026-06-04-phase-22-spec-writer-bridge.md` — the 5 settled decisions.
3. `code/src/ai_os/conversationEngine.js` — the `confirmIdea` architect block (the sync invoke →
   persist → advance pattern you will mirror). Note the `_withTimeout`-style `Promise.race` + 30s timeout.
4. `code/src/runtime/orchestration/conversation_graph.js` — confirm the transition row
   `SPEC_WRITER_FORMALIZE → REVIEWER_SPEC` on `role.invoke(spec_writer) → SUCCESS`.
5. `code/src/runtime/agents/roles/spec_writer_role.js` — INPUT `{design, project_id}`,
   OUTPUT `{scope, decisions[], acceptance_criteria[], files_to_create[], files_to_modify[]}`,
   `default_provider: "anthropic"` (you will OVERRIDE this to `openai`/`mock` — decision D2).
6. `code/src/runtime/tools/orchestration_tools.js` — the `orchestration.get_status` and
   `orchestration.advance_state` contracts you will call via `reg.invoke`.
7. `web/apps/forge-workspace/src/components/chat/ArchitectDesignCard.tsx` and
   `web/apps/forge-workspace/src/views/ChatView.tsx` — the FE card + view you will mirror for the spec.

**Step 0 summary must list:** the exact transition you're adding, the new endpoint name, the new method
name, the new scenarios you plan (IDs + one-line assertion each), the new FE files, and an explicit
confirmation that §ARC stays 8 and no new npm dep / role / Doctor check is needed. Then STOP.

---

## §1 Deliverables (4 steps, ordered safest-first)

### Step 1 — Backend method `conversationEngine.formalizeSpec(body)`

Add a new exported method. It does NOT touch `confirmIdea`. Signature/behavior:

```
formalizeSpec(body):
  project_id   = normalizeProjectId(body.project_id)
  loop_id      = body.loop_id || (read from project runtime state, same place confirmIdea saved it)
  spec_provider     = body.spec_provider     || "openai"   // D2: override role default "anthropic"
  spec_model        = body.spec_model        || undefined
  spec_scenario_id  = body.spec_scenario_id  || undefined  // tests pass this with provider "mock"

  // GUARD (D4): read current state; only proceed if SPEC_WRITER_FORMALIZE
  status = reg.invoke("orchestration.get_status", { project_id, loop_id }, { root })
  if status.output.current_state !== "SPEC_WRITER_FORMALIZE":
      return { ok: true, loop_id, current_state: <actual>, spec_error: "WRONG_STATE",
               advanced: false }

  // D3: read the architect design from disk as the spec_writer input
  designRaw = reg.invoke("fs.read_file",
      { path: `artifacts/projects/${project_id}/orchestration/${loop_id}/architect_design.json` }, { root })
  if read fails: return { ok: true, loop_id, spec_error: "DESIGN_NOT_FOUND", advanced: false }
  design = JSON.parse(designRaw.output.content)

  // D5: sync invoke with 30s timeout, mirroring the architect block exactly
  timeoutHandle; timeoutPromise = reject(new Error("SPEC_WRITER_TIMEOUT")) after 30000ms
  try:
    specResult = await Promise.race([
      reg.invoke("role.invoke", Object.assign(
        { role_id: "spec_writer",
          input: { design, project_id },
          project_id,
          provider: spec_provider },
        spec_model      ? { model: spec_model } : {},
        spec_scenario_id? { scenario_id: spec_scenario_id } : {}
      ), { root }),
      timeoutPromise
    ])
    clearTimeout(timeoutHandle)

    if specResult.status === "SUCCESS":
      spec = specResult.output
      // persist (D3 mirror)
      reg.invoke("fs.write_file",
        { path: `artifacts/projects/${project_id}/orchestration/${loop_id}/spec.json`,
          content: JSON.stringify(spec, null, 2) }, { root })
      // advance (only on success — D5)
      reg.invoke("orchestration.advance_state",
        { project_id, loop_id, to_state: "REVIEWER_SPEC",
          transition_type: "NORMAL", role_invoked: "spec_writer" }, { root })
      return { ok: true, loop_id, advanced: true, advanced_to: "REVIEWER_SPEC", spec }
    else:
      spec_error = specResult.metadata?.detail || "SPEC_WRITER_FAILED"
      return { ok: true, loop_id, advanced: false, spec_error }
  catch (err):
    clearTimeout(timeoutHandle)
    return { ok: true, loop_id, advanced: false, spec_error: err.message }
```

**Rules:** every side effect via `reg.invoke` (no `fs.*Sync`, no `fetch`, no `new OpenAI`, no
`child_process`). `ok: true` always (errors are carried in `spec_error`, not thrown — PHASE-19 discipline:
the FE renders a clean message, never a raw error). Do NOT advance on anything but SUCCESS.

### Step 2 — Endpoint `POST /api/ai-os/project/formalize-spec`

In `code/src/workspace/apiServer.js`, mirror the `confirm-idea` dispatch exactly:

```javascript
if (req.method === "POST" && pathname === "/api/ai-os/project/formalize-spec") {
  const body = await readBody(req);
  sendJson(res, 200, await conversationEngine.formalizeSpec(body));
  return;
}
```

This is the only endpoint added in this phase.

### Step 3 — Scenarios (mock-only)

Add under `code/src/testing/scenarios/`. Mirror PHASE-20's S246–S248 style.

- **S254** — formalize-spec happy path (mock spec_writer): loop seeded at `SPEC_WRITER_FORMALIZE` with an
  `architect_design.json` fixture → call formalizeSpec with `provider:"mock"` + scenario id →
  assert `spec.json` exists on disk, response `advanced_to: "REVIEWER_SPEC"`, and `get_status.current_state
  = "REVIEWER_SPEC"`.
- **S255** — timeout guard: mock that forces >30s (or a forced timeout) → response `spec_error:
  "SPEC_WRITER_TIMEOUT"`, `advanced: false`, no `spec.json` written, loop still `SPEC_WRITER_FORMALIZE`.
- **S256** — state guard (D4): loop in a non-`SPEC_WRITER_FORMALIZE` state (e.g. `ARCHITECT_DESIGN`) →
  response `spec_error: "WRONG_STATE"`, `advanced: false`, spec_writer NOT invoked, no advance.
- **S257** — invalid role output: mock spec_writer returns JSON failing OUTPUT_SCHEMA →
  response `spec_error` set (not SUCCESS), `advanced: false`, loop still `SPEC_WRITER_FORMALIZE`.

Use the existing scenario-seeding helpers (look at how the PHASE-20 architect scenarios seed a loop +
design). If no helper fits cleanly, add one under `code/src/testing/helpers/` (this is allowed — helpers
are test infra, not runtime).

### Step 4 — FE: `SpecCard.tsx` + "continue to spec" action

In `web/apps/forge-workspace/src/components/chat/`, add `SpecCard.tsx` mirroring `ArchitectDesignCard.tsx`.
Render (Arabic labels): `scope`, `decisions` (decision + rationale), `acceptance_criteria` (id + description),
`files_to_create` (path + purpose), `files_to_modify` (path + change). Card title in Arabic, e.g.
"Forge جهوز مواصفات نظامك".

In `ChatView.tsx`: after the architect design card is shown, render a "فولمه للمواصفات" action button.
On click → `POST /api/ai-os/project/formalize-spec` with `{ project_id, loop_id, spec_provider: "openai" }`
→ on `spec` present render `<SpecCard>`; on `spec_error` present render a clean Arabic message
("في مشكلة في تجهيز المواصفات — يقدر يعيد المحاولة"), never a raw error string.

No backend scenario for pure rendering; S254's response-shape assertion covers the data path.
TypeScript build must pass.

---

## §2 MID-CHECKPOINT (binding)

After Step 1 + Step 2 + Step 3 are done and the new scenarios are GREEN, BEFORE Step 4 (FE):
write `artifacts/decisions/_phase_22_checkpoints/stage_22_mid.md` with: the method + endpoint shipped,
the 4 scenarios with pass/fail, the suite count at mid, §ARC/Doctor/roles unchanged confirmation, and the
Track A grep result on the new backend code. Then STOP and report for CTO mid-verification (owner uploads
the zip; CTO runs the suite + greps independently before you start the FE).

---

## §3 Gate #10 — Owner UI verification (the real closure gate)

After Step 4, the owner runs the real path in the browser:
confirm an idea → see the architect design card → click "فولمه للمواصفات" → see the spec card in Arabic
(scope, decisions, acceptance criteria, files) → screenshot. Loop state on disk must read `REVIEWER_SPEC`.
A green scenario is NOT closure — the browser run is. Do not claim closure before Gate #10 passes.

---

## §4 Track A rules (NON-NEGOTIABLE)

- No direct `fs.*Sync`, `fetch()`, `new OpenAI()`, or `child_process` in any new runtime file.
  All side effects via `reg.invoke`.
- §ARC ledger stays **8**. If you think you need a new §ARC — STOP, report, do not write code.
- No new npm dependency. No new agent role. No new Doctor check. No change to the state machine table.
- spec_writer role internals are frozen — you only call it.

## §5 STOP-AND-REPORT triggers

STOP and report (do not work around silently) if any of these arise:
- A new §ARC, npm dep, agent role, or Doctor check seems necessary.
- The spec_writer role contract (input/output schema) doesn't fit `{design}` in / the documented out.
- confirmIdea, the architect, idea synthesis, vision lock, or the transition table would need changing.
- The loop_id is not retrievable from project state (the persistence point confirmIdea used).
- Any deviation from the 5 settled decisions in the plan artifact.

## §6 Closure gates (deterministic — phase stays OPEN if any fails)

1. S254–S257 GREEN on Windows.
2. Full suite: 246 baseline + 4 new = **250/0/5 (255 total)** on Windows (sandbox shows the documented
   env-deltas only: S48, S120–S127, S137).
3. Track A grep clean on all new code.
4. §ARC 8, Doctor 35, roles 13, L2 tools 78 — all unchanged.
5. `web/apps/forge-workspace` TypeScript build passes.
6. Gate #10 PASS (owner browser screenshot, loop on disk = REVIEWER_SPEC).

## §7 Closure deliverables (only after Gate #10 passes)

- `artifacts/decisions/DECISION-<date>-phase-22-closure.md`.
- `artifacts/decisions/_phase_22_checkpoints/stage_22_final.md`.
- `progress/status.json`: phase_22 block CLOSED (suite_final 250/0/5, §ARC 8, Doctor 35, roles 13,
  findings_open []), `current_task` → PHASE-22 CLOSED, `next_phase` → PHASE-23-PENDING-DECISION,
  roadmap completed += PHASE-22.
- git add (only the PHASE-22 files + artifacts + status.json), commit, push, send the hash.

## §8 Cost budget

Kill bar **$3.00**. Scenarios mock-only ($0.00). Gate #10 = one real `openai` spec_writer call
(~$0.01–0.02). No other real calls.

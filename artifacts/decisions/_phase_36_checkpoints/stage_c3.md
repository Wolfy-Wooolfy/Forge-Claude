# PHASE-36 — CLOSURE CHECKPOINT (stage_c3)

**Date:** 2026-06-18
**Status:** ✅ CLOSED. C1 + C2 + C3 done & CTO-verified. Full SU **321/0/5 (326 total)**. Mock-only, $0.
**Closure artifact:** [DECISION-2026-06-17-phase-36-permission-real-path-hardening.md](../DECISION-2026-06-17-phase-36-permission-real-path-hardening.md) (§6 Closure).
**Per-stage mids:** [stage_c1_mid.md](stage_c1_mid.md) · [stage_c2_mid.md](stage_c2_mid.md) · [stage_c3_mid.md](stage_c3_mid.md).

---

## §-1 RETRACTION (recorded at closure)
A mid-C3 CTO finding — that `apiServer.deleteProject` deleting the **active** project was a security gap —
was an INCORRECT inference made without consulting governance. **DECISION-2026-06-07 (D4, owner-confirmed
via Gate #10)** ratifies active-delete with auto-revert to `default_project` as intended multi-select-delete
behavior. The finding is **WITHDRAWN**: B1 (endpoint guard) + B2 (tool guard) reverted byte-exact
(`git diff HEAD` showed only the guard removal), S329 deleted, the `delete_active_project` rule comment
corrected to state D4 governs. S259 (encodes D4) stays GREEN. Caught via **CLAUDE.md §8** (artifact
conflict → stop & ask).

## C1 — CLOSED (traversal containment)
Shared `resolveWithinRoot` helper; `checkScope` resolves the write path against root BEFORE prefix-matching
(no raw-string) → `..` into Forge-self denies **`SCOPE_FORGE_SELF`**. Root from `ctx.root` else policy-root
(threaded through `checkHardDeny`/`checkScope`); fail-closed only if neither. The policy-root threading fix
restored the 10 orchestration scenarios broken by the first fail-closed attempt. **S325 GREEN.**

## C2 — CLOSED (active-project write boundary)
Denies **`SCOPE_CROSS_PROJECT`** when an EXPLICIT `ctx.active_project_id` is present and the path's project
segment differs. **Inert when absent** → orchestration loop helpers (pass `{ root }` only) untouched. Active
id threaded onto the REAL build path: `buildProject` buildCtx → `materializerEngine` writeCtx →
`fs.write_file`. **S326 + S327 GREEN** (S327 drives the real `materializerEngine`; negative-control proven).

**Deferrals:** (a) a raw `fs.write_file` with NO ctx targeting project B while A is active is NOT blocked —
needs an orchestration redesign (future owner-gated phase); (b) `active_project.json` field-name conflict
(design sources the active id from `body.project_id`, so it does not depend on the file).
**Structural finding:** the real build path cannot write cross-project anyway (materializer prefixes by
`input.project_id` + `_isSafePath` rejects `..`); the boundary is defense-in-depth arming the materializer
write.

## C3 — CLOSED (PROMPT boot fail-fast + honest dead-rule comment + .gitignore)
- `createPolicy` throws when control_mode resolves to `PROMPT` and no respond surface is wired
  (`opts.prompt_respond_surface !== true`) — no silent 5-min stall. Opt-in is future-proof; the harness
  opts in (real `_autoDenyPrompter`); production `getDefaultPolicy()` does not → a real PROMPT boot still
  fails fast. Runtime PROMPT branches untouched. **S328 GREEN.**
- `delete_active_project` comment corrected to reflect D4 (active-delete intentionally ALLOWED; inert
  marker; NOT activated). No active-delete enforcement.
- `.gitignore`: `decision_log.json` kept TRACKED; `test_conv_*` `conversation_context.json` byproducts
  ignored (and `git rm --cached`-untracked at closure).

## Final metrics
- Full SU **321 / 0 / 5 (326 total)** on the owner toolchain; orchestration cluster S139/S140/S145–S156 GREEN.
- Scenarios: **S325/S326/S327 (C1/C2) + S328 (C3)** added; **S329 removed** (retraction).
- **§ARC=8** (no new channel) · **L2=80** · **roles=13** · **doctor=35**. Track A clean. Mock-only, **$0**.

## Ratification
CTO-verified C1 + C2 + C3 in chat. **LOCAL commit only** — push/tag await an explicit owner/CTO "push GO";
then tag `phase-36-complete` and verify via GitHub raw. Next: **PHASE-37-PENDING-DECISION** (owner-gated
backlog only).

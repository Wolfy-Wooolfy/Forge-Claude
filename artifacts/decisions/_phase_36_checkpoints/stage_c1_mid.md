# PHASE-36 §1 (PROMPT-B) — C1 MID-CHECKPOINT

**Date:** 2026-06-17
**Scope of this step:** C1 ONLY (FORGE_SELF traversal containment). S326 (C2) intentionally STAYS RED → PROMPT-C.
**Status:** C1 core done; §B (normalization unification) pending after this checkpoint.

---

## 1. The shared helper

New file `code/src/runtime/permission/_path_util.js`:

```
resolveWithinRoot(root, rawPath) → { resolved, relative, escapes_root }
```
- `resolved`     = `path.resolve(rootAbs, rawPath)` (absolute)
- `relative`     = `path.relative(rootAbs, resolved)`, forward-slash (`../`-prefixed if it escapes root)
- `escapes_root` = `resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)`

Mirrors `fs_tools.safeResolve` (repo-root convention) and `container_privilege_rule._outsideRoot`
(the one rule that already resolved correctly). Pure path logic — no `fs`, no side effects.

## 2. The exact `checkScope` change ([permissionRules.js](../../../code/src/runtime/permission/permissionRules.js))

- Added `const { resolveWithinRoot } = require("./_path_util");`.
- **Removed** the raw `const norm = _normalisePath(writePath);` (and deleted the now-dead
  `_normalisePath` helper — it only stripped slashes, never resolved `..`).
- After the `DANGER_FULL_ACCESS` early-allow, **before** any prefix-match:
  ```js
  const root = ctx && ctx.root;
  if (!root) return { applicable:true, allowed:false, reason:"SCOPE_NO_ROOT", ... };   // fail CLOSED

  const { relative, escapes_root } = resolveWithinRoot(root, writePath);
  if (escapes_root) return { applicable:true, allowed:false, reason:"SCOPE_OUTSIDE_ROOT", ... };

  const norm = relative;   // resolved, root-relative — prefix loops now match the REAL zone
  ```
- The `WORKSPACE_WRITE_PREFIXES` / `web/.forge-session` / `FORGE_SELF_PREFIXES` loops are unchanged
  except they now match the **resolved** relative path. Clean paths resolve to themselves → identical
  verdict; only `..`-traversal changes (now contained).
- Root taken from `ctx.root` (same convention the tools use); missing root → **fail closed**, never
  raw-string fallback.

## 3. Result — S325 GREEN, no flips

Targeted run (`S325 S326` + the full scope/permission cluster):
```
✓ S325  PHASE-36 C1 — now DENIED / SCOPE_FORGE_SELF   (was PREVIEWED — authorize had ALLOWED the traversal)
✗ S326  PHASE-36 C2 — still SUCCESS                   (expected — C2 is PROMPT-C)
✓ S04 S05 S08 S12 S13 S25 S27 S28 S29 S30 S31 S32 S36 S37   (all green — no flip)
15 passed, 1 failed (S326), 0 skipped (16 total)
```

- **S325 flipped PREVIEWED → DENIED/SCOPE_FORGE_SELF** — the C1 gap is closed at the enforcement point.
- No existing scope/FORGE_SELF/vision-docs scenario flipped (clean paths unaffected).

**Proceed to §B (normalization unification): point `builtproject_vision_rule` scope + the
`absolute_filesystem_root` hard-deny at the shared helper; then run the full SU (expect 318/1/5).**

---

## 4-bis. CORRECTION — fail-closed regression caught by the FULL suite (post §B)

**What the narrow mid-checkpoint missed:** §3's targeted run only covered the scope/permission
cluster, not the orchestration `module_call`/`direct_engine` scenarios. The first FULL run came back
**308 / 11 / 5** — 10 orchestration scenarios (S139, S140, S145, S146, S147, S152–S156) flipped to
**FAILED**, all because their loop-state writes returned DENIED `SCOPE_NO_ROOT`.

**Root cause:** §A made `checkScope` read the root from `ctx.root` only and **fail closed** when
absent. But the orchestration tools invoke their internal `fs.write_file`/`state.patch` through the
**default registry with a ctx that has no `root`** (only the engine's top-level calls pass `{ root }`).
So fail-closed denied every loop-state write. This is itself a *scenario-green / real-broken*-shaped
trap — and the full suite (not the narrow checkpoint) caught it.

**Correction (no raw-string fallback):** thread the **policy's own root** (`opts.root ||
process.cwd()`, always defined) into the rules and prefer `ctx.root` when present:
- `permissionPolicy.authorize`: `checkHardDeny(tool, input, ctx, root)` and
  `checkScope(tool, input, ctx, data_mode, root)`.
- `permissionRules`: `checkScope(..., policyRoot)` and the absolute hard-deny `applies(..., policyRoot)`
  now use `const root = (ctx && ctx.root) || policyRoot;`. Fail-closed remains only if **neither** root
  is known (defensive; never in practice).

**Re-verify (targeted):** the 10 orchestration scenarios + S04/S05/S30 + S325/S326 → **14 pass /
1 fail (S326)** — all orchestration restored, S325 still GREEN, S326 still RED. Full-suite re-run
(expect 318/1/5) in progress.

**Process note:** mid-checkpoint targeted sets must include `module_call`/`direct_engine` writers
(loop state) when touching `checkScope` — not just the scope cluster.

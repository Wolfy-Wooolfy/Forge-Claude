# DECISION-2026-05-24T10-00-arc-7-env-loader-fs-exception

> **Type:** Track A Deviation Audit — §ARC Exception Registration
> **Status:** CLOSED
> **Authored:** 2026-05-24
> **Authority:** Blueprint Part B §L2 + §ARC ledger discipline
> **Phase context:** PHASE-13.8 closure task — Stage 13.8-6 code was written
>   before this artifact; this artifact retroactively registers the exception
>   per §ARC discipline (any unaudited direct `fs.*` is a contract violation
>   regardless of justification, and must be entered in the §ARC ledger).

---

## 1. The deviation

**File:** `code/src/startup/env_loader.js`
**Function:** `loadDotEnv(dir)` (the only function in this file)
**Deviation:** Direct `fs.readFileSync(envPath, "utf8")` call — outside the
L2 Tool Runtime (`code/src/runtime/tools/fs_tools.js`).

```js
// code/src/startup/env_loader.js  (the exact deviation, scope = this one call)
content = fs.readFileSync(envPath, "utf8");
```

This is a Track A violation per Blueprint §L2: every file-system read must
go through a registered L2 Tool. It has not appeared in any prior §ARC entry
(§ARC-1 through §ARC-6). Discovered during PHASE-13.8 closure audit.

---

## 2. Justification

`env_loader.js` is required from `start-api.js` **before** the L2 Tool
Runtime is loaded:

```js
// start-api.js lines 16-17 (exact wiring)
const { loadDotEnv } = require("./code/src/startup/env_loader");
loadDotEnv(path.resolve(__dirname));   // ← runs HERE
// ... then apiServer (which loads the runtime) is required below
```

The L2 Tool Runtime is initialised inside `apiServer.js`. At the point
`loadDotEnv` runs, `code/src/runtime/tools/_registry.js` has not been
required yet. Routing through `tools.fs.read_file` at this point would
cause a circular-dependency crash: the tool runtime requires providers,
providers require `process.env.OPENAI_API_KEY`, which is what
`loadDotEnv` is trying to set.

This is the **pre-runtime bootstrap** pattern — identical to the precedent
established by:

| Precedent | File | Same pattern |
|---|---|---|
| §ARC-6 | `code/src/runtime/logging/log_writer.js` | direct `fs.*Sync` — re-entrancy prevention |
| §X.3 (stage 12.4) | `code/src/runtime/logging/metrics_initializer.js` | direct-fs, called before runtime is fully live |

The L2 Tool Runtime simply does not exist at the callsite. This is a
physical constraint, not a policy shortcut.

---

## 3. Scope boundary (strictly enforced)

This exception covers **exactly one function** in exactly one file:

| Scope | Detail |
|---|---|
| **File** | `code/src/startup/env_loader.js` |
| **Function** | `loadDotEnv(dir)` |
| **Permitted call** | `fs.readFileSync(envPath, "utf8")` — one call, read-only |
| **NOT permitted** | Any `fs.writeFileSync`, `fs.unlinkSync`, `fs.mkdirSync`, or any other `fs.*` in this file |
| **NOT a licence for** | Direct `fs.*` in any other `startup/` file, any other pre-runtime bootstrap, or any call outside `loadDotEnv` |

A future change that adds a second `fs.*` call to `env_loader.js`, or
adds a second function using direct `fs.*`, requires a new §ARC entry.

---

## 4. §ARC ledger update

This decision adds **§ARC-7** to the ledger in
`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`. The count goes from 6 → 7.
No other §ARC entry is created or modified by this decision.

---

## 5. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Future `env_loader.js` grows beyond `loadDotEnv` | LOW | Scope boundary §3 is explicit; any addition requires new §ARC |
| `.env` file path escape | LOW | `path.join(dir, ".env")` is constrained to the directory passed by `start-api.js` (`path.resolve(__dirname)`) — not user-controlled |
| Secret leakage via `readFileSync` | LOW | The file contains only env vars the server needs; no write or delete |

---

## 6. Approval

Registered by CTO-confirmed closure discipline (PHASE-13.8 closure task).
The deviation was discovered during Step-0 read of `env_loader.js`.
Owner implicit approval via PHASE-13.8 activation decision
(`DECISION-2026-05-23T20-00-phase-13-8-frontend-auth.md §2b`).

---

**END OF DECISION**

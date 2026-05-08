# Permission Policy Contract — Authoritative Specification

> **Authority:** Binding specification for the Permission/Safety layer (L3) introduced in PHASE-3.
> **Code location:** `code/src/runtime/permission/`
> **Companion doc:** `docs/04_autonomy/08_PERMISSION_POLICY_CONTRACT.md` (in PHASE-3 documentation update).

---

## 1. Why this exists

`CLAUDE.md` §3 mandates "no write without preview / approval" and "fail-closed when in doubt". `providerAuthorityEnforcer.js` only checks regex patterns post-hoc. Decision Gate exists in documentation but isn't called before every write. This layer enforces the rules at runtime: every Tool execution passes through `authorize(tool, input, ctx)` before its `execute()` runs.

## 2. The five modes

Three **data modes** (ordered, each contains the prior):

| Mode | Reads | Writes |
|---|---|---|
| `READ_ONLY` | yes | none |
| `WORKSPACE_WRITE` | yes | inside `artifacts/`, `progress/`, `logs/` |
| `DANGER_FULL_ACCESS` | yes | anywhere, including `code/`, `docs/`, Forge config |

Two **control modes** (orthogonal — combine with a data mode):

| Mode | Effect |
|---|---|
| `PROMPT` | Every gated write triggers a user permission request. Fail-closed on timeout. |
| `TEST` | Used by Scenario Harness. Auto-denies anything that would have triggered PROMPT (no human in the loop). |

The active mode is set via `FORGE_PERMISSION_MODE` env var (default `WORKSPACE_WRITE`). `DANGER_FULL_ACCESS` additionally requires `FORGE_ALLOW_SELF_MODIFY=1` — without it, the policy silently downgrades to `WORKSPACE_WRITE`.

## 3. The `authorize()` contract

```
authorize(tool, input, ctx) → { allow: boolean, reason: string, detail?: string, rule_id?: string }
```

- `allow: true` — Tool may execute.
- `allow: false` — Tool must not execute. `reason` is a stable identifier; `detail` is human-readable.

`authorize` is async because PROMPT mode awaits user input. TEST mode and pure data modes resolve synchronously inside the awaited Promise.

## 4. Decision sequence

```
1. Hard deny rules (permissionRules.HARD_DENY_RULES)
   → If any matches, return { allow:false, reason: rule.reason }

2. Resolve active context:
   active_mode → { data_mode, control_mode }

3. If tool.required_mode === READ_ONLY:
   return { allow:true, reason:"READ_ONLY" }

4. Compare data_mode vs tool.required_mode + scope check:
   data_allows = dataModeSatisfies(data_mode, required_mode)
   scope_ok = checkScope(tool, input, ctx, data_mode).allowed != false

   if (data_allows && scope_ok):
     - control_mode == TEST   → ALLOW (no prompt)
     - control_mode == PROMPT → ASK USER (await response)
     - else                   → ALLOW

   else (data insufficient OR scope blocked):
     - scope blocked          → DENY (regardless of control_mode)
     - control_mode == TEST   → DENY (TEST never escalates)
     - control_mode == PROMPT → ASK USER (escalation request)
     - else                   → DENY (INSUFFICIENT_MODE)
```

## 5. Hard deny rules

Three rules in PHASE-3:

| rule_id | Trigger | Reason |
|---|---|---|
| `absolute_filesystem_root` | fs.* / artifact.* with path under `/etc`, `/var`, `/root`, or Windows drive letter | `HARD_DENY_SYSTEM_PATH` |
| `shell_destructive_commands` | shell.* with argv[0] in {rm, dd, mkfs, shutdown, reboot, halt} | `HARD_DENY_DESTRUCTIVE_SHELL` |
| `delete_active_project` | (delegated to `project.delete`'s tool-level check; rule kept as documentation) | — |

Hard deny short-circuits and is **not** overridable by `DANGER_FULL_ACCESS`.

## 6. Scope rules

Two write zones:

```
WORKSPACE_WRITE_PREFIXES = [ "artifacts/", "progress/", "logs/" ]
FORGE_SELF_PREFIXES      = [ "code/", "docs/", "web/", "tools/", "bin/",
                             "architecture/", "package.json", "INSTRUCTIONS.md",
                             "CLAUDE.md", "README.md" ]
```

| Path | READ_ONLY | WORKSPACE_WRITE | DANGER_FULL_ACCESS |
|---|---|---|---|
| Under `WORKSPACE_WRITE_PREFIXES` | DENY (SCOPE_READ_ONLY) | ALLOW | ALLOW |
| Under `FORGE_SELF_PREFIXES` | DENY | DENY (SCOPE_FORGE_SELF) | ALLOW |
| Anywhere else (e.g. `/tmp/x`) | DENY | DENY (SCOPE_UNKNOWN_PATH) | ALLOW |

Tools that don't have a single write path (`shell.*`, `http.post`, `pipeline.*`) skip scope check and rely solely on mode comparison.

## 7. Stable reason codes

Used by Scenario Harness assertions:

| reason | Meaning |
|---|---|
| `READ_ONLY` | Tool is read-only; allowed unconditionally. |
| `MODE_SATISFIED` | Data mode was sufficient. |
| `TEST_MODE_ALLOWED` | TEST mode passthrough. |
| `PROMPT_ALLOWED` | PROMPT — user said yes. |
| `PROMPT_ALLOWED_ESCALATION` | PROMPT — user approved an escalation that mode comparison alone would have denied. |
| `INSUFFICIENT_MODE` | Mode comparison failed; no PROMPT/TEST in the picture. |
| `SCOPE_READ_ONLY` | READ_ONLY tried to write. |
| `SCOPE_FORGE_SELF` | WORKSPACE_WRITE tried to touch Forge itself. |
| `SCOPE_UNKNOWN_PATH` | Path is outside known scopes. |
| `TEST_MODE_DENIED` | TEST mode rejected an escalation. |
| `PROMPT_DENIED` | User denied. |
| `TIMEOUT` | PROMPT timed out (5min default). |
| `CANCELLED` | Pending request cancelled (e.g. server shutdown). |
| `HARD_DENY_SYSTEM_PATH`, `HARD_DENY_DESTRUCTIVE_SHELL` | Hard deny rules. |
| `INVALID_ACTIVE_MODE` | Active mode string corrupted. |
| `NOT_FOUND`, `INVALID_DECISION` | Prompter response API errors. |

## 8. PROMPT mode wire format

When the policy hits PROMPT, the Prompter (`permissionPrompter.js`) generates a unique `permission_request_id` (8-byte hex prefixed `preq_`), stores a Pending entry, and returns a Promise. The web UI / conversation engine surfaces pending requests via:

```
GET  /api/permission/pending          → list of pending requests
GET  /api/permission/pending/:id      → single request detail
POST /api/permission/respond
     body: { permission_request_id, decision: "ALLOW"|"DENY", note? }
```

(These endpoints are added to `apiServer.js` in PHASE-3 — single new endpoint group; the rest of the migration is PHASE-6.)

## 9. Audit log

Two complementary logs:

- `artifacts/audit/tool_audit.jsonl` — every Tool invocation (kind: `tool` or `permission`).
- `artifacts/audit/permission_audit.jsonl` — every authorization decision: outcome (ALLOWED/DENIED), stage (hard_deny/resolve/read_only/test_mode/prompt/scope/mode), tool, modes, reason, project_id.

The two are correlated by timestamp + tool name + project_id.

## 10. Boot wiring

In `apiServer.js` startup:

```
const { getDefaultRegistry } = require("./code/src/runtime/tools/_registry");
const { installDefaultPolicy } = require("./code/src/runtime/permission/permissionPolicy");

const toolRegistry = getDefaultRegistry();          // loads all tools, may throw
installDefaultPolicy(toolRegistry);                  // sets authorize() function
```

The registry was previously permit-all (PHASE-2 default); installing the policy is what flips L3 on.

#### Forbidden env vars

L3 MUST NOT read `process.env.FORGE_DECISION_OVERRIDE`. Reading it in any
permission policy code is a contract violation. `FORGE_DECISION_OVERRIDE`
belongs to the Pipeline Decision Gate layer
(`docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` §8),
which is a separate orchestration layer. The two layers have independent
env var namespaces and independent authority.

The only env vars L3 is permitted to read are:
- `FORGE_PERMISSION_MODE` — selects active permission mode
- `FORGE_ALLOW_SELF_MODIFY` — gates `DANGER_FULL_ACCESS`

## 11. What this contract does NOT cover

- **Provider call permissions.** Provider Contract v2 has its own surface (input/output schemas, retry, fail-closed). Permission policy applies to the Tool Runtime, not to LLM invocations.
- **Network egress firewall beyond allow-list.** http_tools has its own allow-list. The permission layer does not duplicate that — it simply gates the tool call itself.
- **Cost budgets.** Tracked in `cost_ledger.jsonl`. Future budget gate will be a separate Tool, not part of this policy.

---

**END OF SPECIFICATION**

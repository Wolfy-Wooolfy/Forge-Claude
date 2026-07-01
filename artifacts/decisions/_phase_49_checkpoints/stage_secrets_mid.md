# PHASE-49 — Mid-Checkpoint: Secrets (W-A + W-B, the code-touching half)

- Date: 2026-07-01
- Phase: PHASE-49 (Windows Production Polish)
- Decision: DECISION-2026-07-01-phase-49-windows-production-polish.md (+ Amendments A-1, A-2, A-3)
- Scope of this checkpoint: W-A (keychain get() fix) + W-B (OPENAI_API_KEY keychain migration)
- Cost: $0 (no OpenAI call; keychain presence/round-trip only)
- §ARC: frozen at 10 (no new exception)

---

## W-A — keychain get() fix (bug 1 newline + bug 2 C# rename)

### windows_credential_manager.js diff (get() only; set()/del() UNTOUCHED)
```diff
   "using System.Text;",
-  "public class CredRead {",
+  "public class ForgeCredReader {",
   ...
   "\"@",
-  "$result = [CredRead]::ReadGeneric($env:FORGE_TARGET)",
+  "$result = [ForgeCredReader]::ReadGeneric($env:FORGE_TARGET)",
   "if ($result -eq $null) { Write-Output 'NOT_FOUND' } else { Write-Output $result }"
-].join("; ");
+].join("\r\n");
```
- bug 1: `.join("; ")` collapsed the PowerShell here-string opener onto one line -> parser error. Fixed with `.join("\r\n")` (newline delimiting; `@"` ends its line, `"@` starts its line).
- bug 2 (masked by bug 1): the C# class `CredRead` contained a P/Invoke method also named `CredRead` -> "member names cannot be the same as their enclosing type" compile error. Fixed by renaming the class to `ForgeCredReader` (+ its `[…]::ReadGeneric` call site). The P/Invoke method name `CredRead`, `EntryPoint="CredReadW"`, and the signature are UNCHANGED.
- Committed to HEAD via the owner's interim "U" commits (e25aa35 = newline; 1e10a56 = rename); on origin.

### Real keychain set -> get -> del round-trip (windows_credential_manager directly)
Evidence: artifacts/spikes/phase49_keychain/roundtrip.json — verdict PASS
```json
{ "set": {"ok": true}, "get": {"ok": true, "value": "<matches>"},
  "get_value_matches": true, "del": {"ok": true},
  "get_after_del": {"ok": false, "reason": "not_found"}, "gone_after_del": true,
  "verdict": "PASS" }
```

---

## W-B — OPENAI_API_KEY keychain migration

### Recon (CTO-verified)
- OPENAI_API_KEY lived ONLY in .env (unset in ambient shell + Windows User/Machine env vars; .env is untracked + gitignored, so the plaintext was never in git/origin).
- bin/forge-doctor.js loads .env into its own process -> removing the key clears the CLI gate.
- checks/openaiApiKey.js reads secret_provider.get("openai_api_key") FIRST (keychain-first) -> no edit needed once stored.
- checks/secrets_in_env_var.js WARNs on ANY process.env presence of OPENAI/ANTHROPIC.

### Real keychain round-trip on the OpenAI key (via secret_provider — the doctor's abstraction)
Evidence: artifacts/spikes/phase49_openai_key/store_verify.json — verdict PASS
```json
{ "key_present_in_env": true, "key_length": 164, "set_ok": true, "get_ok": true,
  "get_length": 164, "value_matches": true, "provider_type": "windows_credential_manager",
  "verdict": "PASS" }
```
Stored under the exact name "openai_api_key" (secret_provider prefixes "forge." internally; get uses the same name -> the doctor check matches).

### Boot hydration wiring — start-api.js diff
```diff
 const { loadDotEnv } = require("./code/src/startup/env_loader");
 loadDotEnv(path.resolve(__dirname));

-const { createWorkspaceApiServer } = require("./code/src/workspace/apiServer");
+// W-B: hydrate OPENAI_API_KEY from the OS keychain when it is absent from env/.env.
+// ... §ARC-5 secret provider; env/.env still wins; completes before serving.
+const secret_provider = require("./code/src/runtime/secrets/secret_provider");
+
+(async () => {
+  if (!process.env.OPENAI_API_KEY) {
+    try {
+      const r = await secret_provider.get("openai_api_key");
+      if (r && r.ok && r.value) process.env.OPENAI_API_KEY = r.value;
+    } catch (_) { /* fail-open */ }
+  }
+
+  const { createWorkspaceApiServer } = require("./code/src/workspace/apiServer");
+  const port = Number(process.env.FORGE_API_PORT || process.env.FORGE_WORKSPACE_API_PORT || 3100);
+  try {
+    const { port: actualPort, host: actualHost } = await createWorkspaceApiServer({ port }).start();
+    console.log(`Forge API server running at http://${actualHost}:${actualPort}`);
+  } catch (err) { console.error("[FATAL] ..."); process.exit(1); }
+})();
```

### How env/.env fallback is preserved (proven, before .env removal)
Evidence: artifacts/spikes/phase49_openai_key/boot_resolution.json — verdict PASS
- (A) keychain-path: with OPENAI_API_KEY unset, hydration populates it from the keychain (resolved=true, length=164).
- (B) env-wins: with OPENAI_API_KEY pre-set, hydration does NOT override (preserved=true). loadDotEnv runs first, so .env/shell/pm2 env still wins; the keychain only fills a gap.

### .env removal (step 4)
Evidence (stdout): { had_openai_key_before: true, still_has_openai_key_after: false, verdict: PASS }.
.env now contains only: OPENAI_MODEL, OPENAI_IDEATION_MODEL, OPENAI_OPTIONS_MODEL. The plaintext OpenAI key is gone from disk; it lives encrypted in the Windows Credential Manager.

---

## Track A grep — every changed LIVE file
- code/src/runtime/secrets/windows_credential_manager.js: only the EXISTING §ARC-5 `require("child_process")` + `execFileSync` (comment lines 2/11 + line 15). NO new fs.*Sync / fetch / new OpenAI.
- start-api.js: CLEAN — no fs.*Sync / child_process / fetch / new OpenAI. (It requires secret_provider, the §ARC-5 home; the child_process call lives inside that module, not here.)
- openAiAdapter.js + the 12 legacy providers: UNTOUCHED.
- §ARC = 10 (unchanged). L2 = 80. roles = 13.

---

## forge-doctor delta (before -> after)
| check | before PHASE-49 | after W-A + W-B |
|---|---|---|
| api_auth_token | WARN — keychain_error (here-string parser death) | PASS — capability token present (64-char hex) |
| secrets_in_env_var | WARN — OPENAI_API_KEY in environment | PASS — no secrets in environment; provider windows_credential_manager |
| openai_api_key | PASS — from env, length=164 | PASS — from keychain, length=164 |
| overall | HEALTHY, 0 critical, 7 warning | HEALTHY, 0 critical, 5 warning |

Two of the four actionable warnings cleared (api_auth_token = W-A, secrets_in_env_var = W-B). Remaining actionable: install_path (W-C), service_lifecycle (W-D). Benign remainder: providers_registered (12 legacy v2), disk_space (665 MB), container_runtime (no Docker daemon).

## Accepted residual (Amendment A-3 ruling)
The running server process holds OPENAI_API_KEY in process.env (hydrated from keychain) because getClient() + the 12 legacy providers read it synchronously. CLI doctor (the W-B gate) PASSES; the in-server /api/system/doctor honestly WARNs. Accepted + documented; full async refactor deferred.

## Commit state
- W-A code: in HEAD/origin via owner "U" commits (e25aa35, 1e10a56).
- W-B code (start-api.js) + the 3 W-B spike scripts + evidence: UNCOMMITTED (per the W-B report-then-verify rule).
- progress/status.json: modified by the doctor runtime_health auto-patch (§ARC-9) — left uncommitted; W-E corrects current_task at closure.
- .env: modified locally (key removed) but untracked/gitignored — not in git.

## STOP
Code-touching half (W-A + W-B) complete and gate-proven. Awaiting CTO verification before W-C / W-D.

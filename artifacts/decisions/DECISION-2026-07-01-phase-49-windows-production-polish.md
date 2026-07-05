# DECISION-2026-07-01-phase-49-windows-production-polish

- Phase: PHASE-49
- Status: APPROVED (scope) — owner approval in chat 2026-07-01
- Author: CTO advisor
- Prior phase: PHASE-48 CLOSED — origin/main @ cbeca02 (tag phase-48-complete -> 1cb9cca; cbeca02 = owner interim "Update status.json" commit on top). Local == origin, working tree clean (verified 2026-07-01 pre-flight).

## 1. Context
Capability #12 (Personal Production Setup) — Windows-runnability + secrets subset. State established by CTO orientation @ cbeca02 + a live forge-doctor run on the owner machine (2026-07-01):
- Forge is ALREADY runnable on Windows: RUN_FORGE.bat starts the server via pm2 (ecosystem.config.js -> start-api.js on :3100) with crash auto-restart (max_restarts:10, restart_delay:3000) + pm2-daemon self-heal. forge-doctor = HEALTHY, 0 critical.
- Service infra is EXTENSIVELY built (NOT a from-scratch phase): scripts/service/ holds windows_task_scheduler_install.bat, windows_nssm_install.bat, forge.service (systemd), com.forge.api.plist (launchd), Dockerfile, compose.yml; scripts/install/ holds an install orchestrator + preflight + post_verify + rollback.
- forge-doctor (live) = 7 warnings. ACTIONABLE (production): api_auth_token, secrets_in_env_var, install_path, service_lifecycle. BENIGN (out of scope): providers_registered (12 legacy v2), disk_space (665 MB), container_runtime (no Docker daemon).
- THE bug: code/src/runtime/secrets/windows_credential_manager.js get() builds the PowerShell CredReadW script as an array joined by .join("; ") (line 111). This collapses the here-string opener @" onto one line -> PowerShell error "No characters are allowed after a here-string header before the end of the line" -> keychain READ fails -> api_auth_token cannot read the capability token. The module is ALREADY §ARC-5 authorized for child_process (secret_provider.js + windows_credential_manager.js + mac_keychain.js + linux_secret_service.js; DECISION-2026-05-18T11-30-phase-12-plan.md §6), so the fix is a here-string/delimiter change — NO new §ARC, NO new syscall.
- Data-hygiene: status.json current_task is stale ("PHASE-46 CLOSED...") while next_step reflects PHASE-48 and next_phase = PHASE-49-PENDING-DECISION. This is why the live doctor showed "PHASE-46" (statusJsonValid reads current_task, presence-only -> PASS). Corrected at closure (W-E).

## 2. Decision
PHASE-49 = Windows Production Polish — fix the one real production BUG (keychain) + migrate secrets + resolve copy/service hygiene. Small, contained, deterministic-gated, ~$0. NOT a from-scratch production build (scaffolding already exists). KB/Research (#9) stays deferred -> PHASE-50 (own decision; resolve TAVILY-vs-offline first).
Rationale: Forge is already runnable; highest-value lowest-risk next step is closing the four actionable doctor warnings (each has a deterministic gate: the warning clears). The keychain bug is concrete + unblocks the secrets migration.

## 3. Scope (work items)
- W-A Keychain round-trip fix (live surface, §ARC-5, ~$0): fix the here-string construction in windows_credential_manager.js get() (the .join("; ") collapse); audit set()/del() for the same pattern; prove a real Windows keychain set->get->del round-trip. CONSTRAINT: stay inside §ARC-5 — NO new fs write (no temp .ps1), keep -Command, fix newline delimiting only (@" ends a line, "@ starts a line).
- W-B Secrets migration (~$0): store OPENAI_API_KEY (and the capability-token flow once the server runs) in the Windows keychain via the fixed provider; make the boot secret-read prefer keychain with env/.env fallback; document removing the plaintext env var.
- W-C Stale-copy hygiene (ops, ~$0): resolve the stale D:\ForgeAI copy so pm2/the service run ONLY from d:\S\Halo\Tech\Forge-Claude.
- W-D Canonical service manager + boot-start verification (ops, ~$0): THREE Windows service mechanisms coexist (pm2 via RUN_FORGE.bat; Task Scheduler forge-api; NSSM installer). Pick ONE canonical (recommend at Step 0), prove boot-start + crash-restart via a deterministic OS test (start -> :3100 responds; kill process -> restarts within N s).
- W-E status.json current_task correction (config, ~$0): fold into closure; correct the stale current_task value (value-only; field stays present; statusJsonValid-safe).

## 4. Out of scope (no expansion without a new work item)
providers_registered v2 migration (12 legacy) -> separate phase; disk_space archival -> backlog; container_runtime -> benign; systemd/launchd/Docker paths -> Windows-only owner, deferred; KB/Research (#9) -> PHASE-50; Anthropic switch -> blocked on ANTHROPIC_API_KEY; INSTALL.md clean-VM verify -> later; any live-surface change beyond W-A keychain + W-B secret-read seam -> STOP-AND-REPORT.

## 5. Closure gate (deterministic — all must hold)
- W-A: forge-doctor api_auth_token no longer keychain_error; real set->get->del round-trip evidence captured.
- W-B: forge-doctor secrets_in_env_var -> PASS; boot reads key from keychain (env/.env fallback intact); evidence.
- W-C: forge-doctor install_path -> PASS.
- W-D: forge-doctor service_lifecycle -> PASS (running); boot-start + crash-restart proven by a deterministic OS test (documented; not an SU scenario, per Roadmap PHASE-12).
- forge-doctor overall: 4 targeted warnings cleared; only the benign set remains; 0 critical.
- SU suite INVARIANT: 338 pass / 0 fail / 5 skip (343) via bin/forge-test.js; no regression (any change here -> STOP-AND-REPORT).
- Live-surface changes itemized (expected: windows_credential_manager.js; possibly the secret-read boot seam) — each Track A grep-clean; §ARC=10; L2=80; roles=13.
- W-E: status.json current_task corrected (value-only; statusJsonValid still PASS) + this decision's CLOSURE block + checkpoint written.
- Closure commit stays LOCAL; push + annotated tag phase-49-complete await CTO closure-diff + explicit GO.

## 6. Cost
~$0 (ops/infra; no real LLM call required). Kill-bar $3/phase. Any unexpected need for a real call -> STOP-AND-REPORT with an estimate first.

## 7. §ARC / Track A
- W-A touches windows_credential_manager.js — already §ARC-5 (child_process for OS keychain CLIs). Fix is here-string/delimiter only: NO new §ARC, NO new syscall, NO new fs write (a temp-.ps1-file approach is FORBIDDEN — it would add an unauthorized fs write; keep -Command).
- W-B boot secret-read must route through the §ARC-5 secret provider (no new direct syscall on the live surface).
- W-C is filesystem hygiene outside the repo (D:\ForgeAI) — ops, not runtime code.
- W-D is service scripts under scripts/service/** (OUTSIDE Track A) + deterministic OS tests.
- W-E is a status.json value edit (config).
- If ANY item tempts a new §ARC -> STOP, do not code, report to CTO.

## 8. Amendment A-1 (2026-07-01) — FINDING A resolution (Step 0, CTO-approved)

Step 0 surfaced FINDING A: code/src/runtime/doctor/checks/service_lifecycle.js detects only NSSM + Task Scheduler on Windows, not pm2. The owner's runtime is pm2 (PHASE-12 migration), so the W-D gate "service_lifecycle -> PASS (running)" is unachievable via pm2 unless the check is made pm2-aware.

CTO resolution: Option (أ) APPROVED — make service_lifecycle.js pm2-aware. Option (ب) rejected (would break the owner's pm2 path — §4 "do not silently switch"); option (ج) rejected (PASS-via-absence does not prove "running"). Option (أ) aligns the doctor with the owner's actual, already-decided runtime.

Sanctioned scope addition: W-D now includes a bounded edit to service_lifecycle.js to detect the pm2 "forge" app (online -> PASS "running via pm2"). APPROVED live-surface addition beyond the originally-scoped surface. Track A CLEAN: the check already routes shell calls through reg.invoke("shell.run_read_only", ...), so pm2 detection uses the same L2 seam — NO new §ARC, NO new syscall, NO direct child_process.

Canonical service manager (W-D): pm2 (supervisor — crash-restart + daemon self-heal). Boot-start via the standard pm2-on-Windows pattern: pm2 save + a Task Scheduler "at logon" task running pm2 resurrect (the existing lingering ForgeAPI task may be repurposed). NSSM retired (abandoned since PHASE-12). Exact boot mechanism finalized at W-D GO.

W-D gate (updated): service_lifecycle.js (pm2-aware) -> PASS "running via pm2"; boot-start + crash-restart proven by a deterministic OS test (logoff/logon or reboot -> forge responds on :3100; kill the process -> pm2 restarts it). The service_lifecycle.js edit must be Track A grep-clean; §ARC frozen at 10.

FINDING B (noted, no scope change): W-C (stale D:\ForgeAI) + the lingering ForgeAPI Task Scheduler registration + pm2 consolidation form one interrelated cleanup — execute W-C and W-D together.

## 9. Amendment A-2 (2026-07-01) — W-A bug 2 (C# type/member name collision), CTO-approved

W-A's newline fix (.join("; ") -> .join("\r\n")) is PROVEN correct — the PowerShell here-string parser error (bug 1) is eliminated. The fix revealed a SECOND, independent defect that bug 1 had masked: in get()'s Add-Type C# source, the class is named CredRead AND it contains a P/Invoke method also named CredRead. C# forbids a member sharing its enclosing type's name -> Add-Type compile error -> the keychain READ still fails. Conclusion: keychain get() never worked on Windows since PHASE-12 (bug 1 then bug 2); the capability-token read and the W-B key read were fully broken the entire time — both bugs must be fixed to restore the read path.

CTO resolution: the bug 2 fix is APPROVED as part of W-A. The "newline delimiting only" constraint (§3 / W-A) predates knowledge of bug 2; W-A's actual goal ("prove a real keychain set->get->del round-trip") requires it. Approved fix: rename the colliding C# identifier (rename the class and its [Class]::ReadGeneric call site, OR rename the P/Invoke method and its internal call). String-literal only; the DllImport EntryPoint="CredReadW" mapping and the P/Invoke signature are UNCHANGED. Stays inside §ARC-5: NO new syscall, NO fs write, NO new §ARC. Sole live-surface file remains windows_credential_manager.js.

Updated W-A gate: real set->get->del round-trip PASSES (get value matches; gone after del) + forge-doctor api_auth_token no longer shows a keychain_error (benign "token not found" acceptable if the server hasn't run to write the token).

## 10. Amendment A-3 (2026-07-01) — W-B design + trade-off ruling (CTO-approved)

W-B recon (CTO-verified): OPENAI_API_KEY lives ONLY in .env (unset in the ambient shell + Windows User/Machine env vars); bin/forge-doctor.js loads .env into its own process; secrets_in_env_var.js flags ANY process.env presence of OPENAI/ANTHROPIC; openaiApiKey.js already reads secret_provider.get("openai_api_key") FIRST (keychain-first, env fallback) — no edit needed once the key is stored.

Approved W-B design (minimal live surface): store OPENAI_API_KEY in the keychain (secret_provider.set); add boot hydration in start-api.js (after loadDotEnv, before requiring apiServer: if process.env.OPENAI_API_KEY is unset AND the keychain read succeeds, populate it from secret_provider.get — §ARC-5, no new syscall/§ARC; env/.env wins; the async hydration must complete before the server serves); then remove OPENAI_API_KEY from .env. openAiAdapter.js + the 12 legacy providers are UNTOUCHED (they keep reading process.env, now keychain-populated). SAFE ordering (invariant: the key is never absent from BOTH env and keychain): store -> verify keychain round-trip on the real key -> add boot hydration -> confirm the server process resolves the key -> ONLY THEN remove from .env.

Trade-off ruling — ACCEPT + DOCUMENT: because getClient() and the 12 legacy providers read process.env synchronously, the running server process necessarily holds OPENAI_API_KEY in its process.env (hydrated from keychain). The CLI doctor (node bin/forge-doctor.js — the explicit W-B gate) PASSES (its process loads only .env, which no longer holds the key); the in-server /api/system/doctor honestly WARNs. Accepted: the security win (on-disk plaintext eliminated; secret now encrypted in the OS keychain) is real; the in-server residual is low-severity + honest. Full mitigation (async refactor of getClient + 12 legacy providers to read the keychain directly) is disproportionate to this phase -> DEFERRED as a documented residual. A hydration-source suppression flag is rejected as misleading.

W-B gate: node bin/forge-doctor.js -> secrets_in_env_var PASS + openai_api_key "from keychain" PASS; real keychain round-trip on the OpenAI key verified; in-server WARN documented as an accepted residual. W-B is $0 (no real OpenAI call — key presence/resolution suffices).

## 11. Amendment A-4 (2026-07-01) — S137 hermeticity regression surfaced by W-B (Option 1 ruling)

Finding (CTO-verified): the full SU run after W-A+W-B produced S120 (builtproject) = a one-time load-flake (FAIL run 1, PASS runs 2-3; pre-existing, unrelated to W-B) and S137 (kb.retrieve) = a DETERMINISTIC failure (4/4: full runs 1/2/3 + isolation 965ms, no HTTP). Root cause proven, not inferred: kb.retrieve -> retrieval.retrieve() embeds the query via getClient() FIRST (retrieval.js:107, `opts._client || getClient()`) before checking the vector store; getClient() (openAiAdapter.js:19) reads process.env.OPENAI_API_KEY and throws MissingApiKeyError when unset. S137 is a direct_tool scenario with an empty mock and injects no _client; scenario_runner._runDirectTool (L203+) injects NO mock key / base-URL / fetch override (unlike _runDirectProvider L127+, which injects `sk-mock-harness-…` + a fetch override). bin/forge-test.js loads .env (L8-20). Therefore, historically the harness loaded the real OPENAI_API_KEY from .env and S137 made a REAL text-embedding-3-small call (sub-cent, cost recorded in the KB ledger) every full-suite run -> empty store -> SUCCESS. Direct confirmation: `delete process.env.OPENAI_API_KEY; retrieve(...)` -> `THREW: MissingApiKeyError`.

Ruling: W-B is CORRECT — it moved the key off-disk into the keychain as designed; it did NOT introduce a defect. It SURFACED a pre-existing latent non-hermeticity: S137 was never truly mock-only, so the project's "SU 338/0/5, mock-only, $0" baseline was subtly inaccurate for this one scenario (one real sub-cent embeddings call per full run). Blast radius = S137 only (empirically the sole regression; all other kb scenarios pass — they either don't embed or fail-early before embedding).

Resolution = Option 1 (make S137 hermetic) — REJECTING Option 2 (keychain-hydrate the harness) and Option 3 (ambient-env wrapper), because both leave S137 making a real network embeddings call (non-deterministic, key/network-dependent, non-$0), perpetuating the exact latent defect W-B exposed. Option 1 is the only resolution that restores an HONEST $0 + deterministic baseline and removes the hidden real call permanently.

Scope: new scope item W-F (test-infra hermeticity). Bounded to making direct_tool scenarios that reach OpenAI (currently only S137/kb.retrieve) use a mock embeddings path — via the retrieval.js:107 `_client` seam or by mirroring _runDirectProvider's mock-key + fetch-override AND ensuring the mock serves /v1/embeddings. TEST INFRASTRUCTURE ONLY (bin/forge-test.js + code/src/testing/**) — the live surface (retrieval.js and other runtime/** modules) is NOT touched; retrieve()'s production behavior (embed-then-search) is correct and stays. Outside Track A. §ARC=10 unchanged. The specific mechanism is subject to a CC recon + CTO approval before implementation (decision-first).

Gate (W-F): S137 RED->GREEN; S137 provably needs NO OPENAI_API_KEY (passes with the key absent from env + keychain); full SU suite 338/0/5 (S120 flake excluded / re-run to green). Cost $0.

Forward observation (NOT this phase): a broader hermeticity audit — whether any OTHER scenario makes an unmocked real call whose result does not affect its assertions (so would not surface as a failure) — is logged for a future phase; it does not block PHASE-49.

## 12. Amendment A-5 (2026-07-05) — real-logon resurrect failure (FINDING 1, hardened) + cold-start secret-probe transient (FINDING 2, backlogged)

FINDING 1 (material — surfaced at closure verification, machine evidence): after a real reboot + logon (2026-07-05 10:36/10:37), the \ForgeAPI task ran `node "<pm2 CLI>" resurrect` and exited 0xC000013A (STATUS_CONTROL_C_EXIT); pm2.log shows NO daemon start at that time (first daemon 11:32, manual). Best-evidenced root cause: the AtLogOn task runs interactively and opens a visible console window; closing it kills the resurrect before the pm2 daemon detaches — the same kill-vector (identical LastResult) that terminated the pre-W-D direct-node task on 2026-06-30. TEST A (schtasks /run) validated resurrect mechanics but not the interactive-logon console context — a "scenario green / real path broken" instance on W-D's headline deliverable (boot-start).

Ruling — HARDEN, not residual: the task action changes to a windowless launch (wscript/VBS launcher or PowerShell -WindowStyle Hidden — implementer's choice), removing the console-close kill-vector. Re-registration via the idempotent installer. The S191 file-inspection strings must be preserved: "Register-ScheduledTask", "-RestartCount", "-RestartInterval", "$env:USERNAME", "-AtLogOn", "where node", "schtasks /delete". Closure gate additions: (1) a REAL logon test — owner reboot or sign-out/in, NO schtasks /run — must show forge online + :3100 responding with task result SUCCESS and no manual intervention; (2) full SU suite green after the bat edit (S190/S191 inspect it). The closure record's W-D wording is updated to cite the real-logon proof.

FINDING 2 (transient, non-blocking — recorded + backlogged): the first two post-reboot doctor runs FAILed openai_api_key ("no_master_password") while windows_credential_manager was healthy (3/3 standalone). Instrumentation showed the keychain read under the 35-concurrent-check storm took 23.7s (cold PowerShell + spawn contention) and the single-shot isAvailable() probe silently fell through to encrypted_file_provider. Self-recovered; the official gate run is HEALTHY 0-critical. Backlog (future phase): harden the provider probe/timeout under cold-start contention. Noted within the A-3 residual family: start-api.js boot hydration is fail-open, so an equivalent cold-start keychain miss at boot would start the server keyless until first-use error/restart; fail-open remains the correct trade (fail-closed boot would break startup on transient keychain hiccups); probe hardening shrinks this window.

## 13. Amendment A-6 (2026-07-05) — owner decision: auto-start-at-logon WITHDRAWN; manual one-click start is canonical

Owner ruling (in-chat): Forge must NOT start automatically at machine logon. Canonical operation is owner-initiated — one manual action brings everything up. This supersedes the boot-start-at-logon objective of W-D/A-5 as a product decision, not a technical failure.

Scope under this amendment:
1. The \ForgeAPI Task Scheduler task is UNREGISTERED (installer `uninstall`; idempotent). Nothing Forge-related launches at logon.
2. RUN_FORGE.bat is the canonical start path (pm2 daemon self-heal -> orphan :3100 cleanup -> `pm2 start ecosystem.config.js --update-env` -> open the UI). Minimal double-click UX polish permitted: replace the blind 3s wait with a poll on :3100 (up to ~30s); on success print a clear "Forge is running -> http://127.0.0.1:3100" line, open the browser, and pause briefly so the window is readable; on timeout print a clear failure line (+ `pm2 logs forge` hint) and pause. No change to the start mechanics. No SU scenario inspects this file.
3. The A-5 windowless installer (windows_task_scheduler_install.bat + resurrect_hidden.vbs) REMAINS in-repo as optional infrastructure for any future opt-in to logon auto-start. Honest status: the windowless action is proven in on-demand runs (task result 0; clean resurrect over a live instance); the real-logon context was never re-verified post-A-5 because the feature was withdrawn first. Any future re-enable must pass the A-5 real-logon gate before being considered proven.
4. Crash-restart supervision (pm2 autorestart) is unchanged and remains OS-proven (TEST B) — it applies whenever Forge is running, however started.
5. Closure-gate replacement: the A-5 real-logon gate is superseded by an owner-run manual-start test — from a fully stopped state (pm2 kill), the OWNER double-clicks RUN_FORGE.bat and Forge comes up end-to-end (pm2 forge online, :3100 responding, UI opens) with no further intervention. Full SU suite green after the final ops edits.

Trade-off (accepted by design): after a reboot Forge is OFF until the owner starts it; crash-restart protects only running sessions. This matches the owner's intent (personal tool, owner-controlled lifecycle).

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

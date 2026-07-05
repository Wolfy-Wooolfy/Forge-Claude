# DECISION-2026-07-01-phase-49-closure — PHASE-49 Windows Production Polish: CLOSURE

Status: CLOSED
Moves PHASE-49 (DECISION-2026-07-01-phase-49-windows-production-polish.md + Amendments A-1..A-4) from IN_PROGRESS to CLOSED.
Closure date: 2026-07-01

## 1. Scope executed
- W-A — Windows keychain get() repair. windows_credential_manager.js get() had two bugs (here-string newline join + a C# type/member name collision) that made keychain reads fail on Windows since PHASE-12. Fixed (class rename ForgeCredReader; \r\n join). Real keychain round-trip PASS. (Amendment A-2.)
- W-B — OPENAI_API_KEY migrated off-disk into the OS keychain. Stored via secret_provider; start-api.js boot-hydrates process.env from the keychain (env/.env wins; fail-safe; §ARC-5 seam, no new §ARC); the plaintext key removed from .env. openAiAdapter.js + the 12 legacy providers untouched. (Amendment A-3.)
- W-F — S137 harness hermeticity (necessitated by W-B). W-B surfaced that S137/kb.retrieve made a real OpenAI embeddings call every full-suite run via the plaintext .env key — a latent violation of Blueprint L5a ("the mock provider does not call OpenAI"). Fixed test-infra-only: an opt-in mock _client injected through retrieval.js's existing opts._client seam (scenario_runner.js + S137 flag). No live-surface change. S137 now $0/deterministic/key-independent. (Amendment A-4.)
- W-C — stale D:\ForgeAI copy removed (owner action). install_path.js flags it by existence; the directory was empty + inert (no .git, no process, no task pointed at it). Removed -> install_path PASS. No code change.
- W-D — service_lifecycle pm2-aware + pm2-canonical boot. service_lifecycle.js gained a pm2 detection block via the existing shell.run_read_only seam (no new §ARC) -> PASS "running via pm2". pm2 established as the single boot path: pm2 start + pm2 save, and the \ForgeAPI logon task repurposed from raw `node start-api.js` to `node "<pm2 CLI>" resurrect` (retiring the competing direct-node :3100 binder). Crash-restart proven by a deterministic OS test (direct kill -> pm2 auto-restarted, new pid, :3100 up). Boot-start-at-logon was built, then hardened to a windowless launcher after the first real logon exposed a console-close kill-vector (A-5), then WITHDRAWN by owner decision before real-logon re-verification (A-6): canonical operation is owner-initiated via RUN_FORGE.bat (one click -> pm2 start -> UI opens), proven by an owner-run test from a fully stopped state; the \ForgeAPI logon task is unregistered and the windowless installer remains in-repo as optional infrastructure. (Amendments A-1, A-5, A-6.)
- W-E — status.json current_task corrected (was stale at PHASE-46; statusJsonValid-safe value edit) + next_phase advanced.

## 2. Key finding
S137 was never hermetic: the "338/0/5, mock-only, $0" SU baseline silently made one real sub-cent embeddings call per run. W-B (correct production hardening) surfaced it; W-F restored true Blueprint-L5a hermeticity. The post-closure 338/0/5 is honestly mock-only for the first time.

## 3. Closure gate (all met)
- SU suite: 338 pass / 0 fail / 5 skip (343). One re-run cleared an S188 memory-allocation flake (500 MB decompression buffer failing under full-suite heap pressure; reason EXECUTE_ERROR "Failed to allocate memory"; 2/2 in isolation; intake logic untouched by the phase; same class as S120).
- forge-doctor: HEALTHY, 0 critical. Four phase-target checks PASS: api_auth_token, secrets_in_env_var, openai_api_key ("from keychain"), service_lifecycle ("via pm2"). Remaining 3 warnings benign + pre-existing (providers_registered 12-legacy, disk_space, container_runtime).
- Track A: grep-clean on the phase's live-surface files (start-api.js, service_lifecycle.js); the start-api.js keychain read is via the §ARC-5 secret_provider.
- §ARC = 10 (frozen), L2 tools = 80, agent roles = 13 — no drift.
- Manual-start canonical path (A-6): with Forge fully stopped (pm2 kill), the owner double-clicked RUN_FORGE.bat and Forge came up end-to-end (pm2 forge online, :3100 responding, UI opened) with no further intervention. The \ForgeAPI logon task is unregistered (auto-start withdrawn by owner decision); S190/S191 and the full SU suite green after the final ops edits.

## 4. Accepted residual (per A-3)
Because getClient() + the 12 legacy providers read process.env synchronously, the running server process holds OPENAI_API_KEY in process.env (hydrated from the keychain). The in-server /api/system/doctor therefore honestly WARNs on secrets_in_env_var while the CLI doctor (the phase gate) PASSes. Full mitigation (async refactor of getClient + the 12 legacy providers) is deferred to a future phase. The security win — plaintext removed from disk, secret now encrypted in the OS keychain — stands.

## 5. Outcome
Forge is production-hardened on local Windows: the OpenAI secret lives encrypted in the OS keychain (off-disk); operation is owner-initiated by design: RUN_FORGE.bat (one click) starts everything under pm2 with the UI opening automatically, and crash-restart (pm2 autorestart, OS-tested) protects the running session; auto-start-at-logon was withdrawn by owner decision (A-6) and the \ForgeAPI task unregistered; the stale D:\ForgeAI copy is gone; the SU suite is genuinely hermetic.

## 6. Next
PHASE-50-PENDING-DECISION — Knowledge Base & Research (capability #9), deferred from PHASE-49. Requires a fresh decision artifact + owner approval before it begins.

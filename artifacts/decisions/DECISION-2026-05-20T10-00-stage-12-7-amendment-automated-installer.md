# Stage 12.7 Amendment — Automated Installer

| Field | Value |
|---|---|
| **Decision ID** | DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer |
| **Date** | 2026-05-20 |
| **Phase** | PHASE-12, Stage 12.7 |
| **Author** | Claude (CTO advisor) |
| **Status** | ADOPTED — owner directive received 2026-05-20 |
| **Supersedes** | `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md` §3 Stage 12.7 (manual walkthrough only) |
| **Supersedes (file)** | `artifacts/stage_12_7/windows_walkthrough.md` (marked DEPRECATED — kept for audit trail) |
| **Parent** | `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md` |
| **Phase A preserved** | `artifacts/decisions/_phase_12_checkpoints/stage_12_7_mid.md` (S208/S209/helpers done — unchanged) |

---

## §1 — Authority

This amendment is authorised by an explicit owner directive received 2026-05-20:

> *"Forge يشتغل لوحده، بدون ما يعمل أي حاجة، بأعلى احترافية."*

This directive supersedes the original Stage 12.7 §3 design (manual Windows VM walkthrough — 15 manual steps executed by owner). The new design is an automated installer (`node bin/forge-install.js`) that requires a single owner command.

The amendment is consistent with **Blueprint Part B-2 §Owner-facing contract #1**: "Owner never needs technical vocabulary."

---

## §2 — Reason

The original Stage 12.7 plan required the owner to execute 15 PowerShell commands manually, save 15 evidence files, and upload them to the CTO. This is correct for closure-gate purposes but contradicts Forge's core identity as an automation-first system for non-technical owners.

The amended plan automates all 15 walkthrough steps:
- One command: `node bin/forge-install.js`
- Forge copies itself to `C:\Forge\`, installs dependencies, locates NSSM, installs the Windows service, starts it, runs all 10 post-install verifications, and writes evidence files automatically.
- The owner's only manual action: downloading NSSM 2.24 from the official URL (per supply-chain security — see §5 OQ-D).

---

## §3 — What Changes vs Original

| Original Stage 12.7 | Amended Stage 12.7 |
|---|---|
| 15-step PowerShell walkthrough | 1-command automated installer |
| Owner saves 15 evidence files manually | Installer writes 10 evidence files automatically |
| `artifacts/stage_12_7/windows_walkthrough.md` is the spec | `windows_walkthrough.md` DEPRECATED; installer is the spec |
| Phase B = manual execution | Phase B = `bin/forge-install.js` implementation |
| Phase C = CTO reviews uploaded evidence | Phase C = CTO reviews auto-generated evidence (unchanged) |
| Closure criterion #4: "Windows walkthrough evidence documented step-by-step" | Closure criterion #4: "Owner ran `node bin/forge-install.js` successfully — evidence/ populated with 10 files, all PASS" |

---

## §4 — What Stays the Same (Phase A Preserved — Zero Changes)

| Deliverable | Status |
|---|---|
| S208 — `code/src/testing/scenarios/S208_phase12_full_regression.json` | ✓ DONE — unchanged |
| S208 helper — `code/src/testing/helpers/phase_12_regression_helper.js` | ✓ DONE — unchanged |
| S209 — `code/src/testing/scenarios/S209_doctor_phase12_checks_pass.json` | ✓ DONE — unchanged |
| S209 extension to `monitoring_test_helper.js` | ✓ DONE — unchanged |
| `INSTALL.md` (root) | ✓ DONE — installer automates §3 |
| `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` | ✓ DONE — contract installer enforces |
| All Stage 12.0–12.6 closures | ✓ ALL CLOSED |
| SU baseline: 204 pass / 0 fail / 5 skip | ✓ CONFIRMED |
| §ARC count: 6 | ✓ CONFIRMED — stays 6 (see §6) |

---

## §5 — OQ Resolutions (Step 0 rulings — binding)

### OQ-A — §ARC boundary for install scripts
**Ruling: Extend §ARC-3.** Install scripts (`bin/forge-install.js`, `scripts/install/*`) are classified under the "infrastructure lifecycle" family, same as `harness_runner.js`. §ARC count stays 6. See §6 for the updated §ARC-3 entry.

### OQ-B — Evidence output location
**Ruling: Write to repo (`artifacts/stage_12_7/evidence/`).** Consistent with Phase A (directory already created). Evidence is committable alongside the closure artifact.

### OQ-C — Post-install verification failure
**Ruling: Auto-rollback + diagnostic dump.** If `post_verify.js` fails, the orchestrator auto-rolls back to clean state and saves a diagnostic dump to `C:\Forge_install_failure_<ts>\` (outside repo). The Fail-Closed principle applies.

### OQ-D — D1 conflict: "NEVER auto-download NSSM"
**Ruling: Option B — semi-automated, D1 spirit preserved.** The installer does NOT auto-download NSSM. It searches standard paths and the system PATH for `nssm.exe`. If found: proceeds automatically (zero interaction). If not found: displays a one-time prompt with the download URL, expected SHA-256, and expected extract path, then waits for the owner to place the binary before continuing.

> **D1 compliance statement:** This amendment preserves D1's spirit. The installer does NOT auto-download NSSM. NSSM presence is detected via standard paths and PATH lookup. If not found, the installer pauses with a clear one-time prompt for the owner to download from the official source (`https://nssm.cc/release/nssm-2.24.zip`) and place at the expected location. SHA-256 verification of the ZIP is the owner's responsibility per D1 — the installer verifies NSSM is executable via `nssm version`. The change vs original D1 is operational ergonomics only — supply-chain security posture unchanged.

**Risks averted via Step 0 discipline check:** OQ-D was not present in the original amendment prompt. The CTO's Step 0 analysis identified that the `nssm_download` step in the proposed `install_orchestrator.js` pseudocode would violate binding decision D1 ("Forge scripts NEVER auto-download NSSM"). This was caught and corrected before any code was written — exactly the kind of discipline the project requires. Recorded as an exemplar of the Forge process.

---

## §6 — §ARC-3 Extension (OQ-A ruling)

The §ARC-3 entry in `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` is extended to include the install scripts. The original §ARC-3 entry covered:

> `code/src/runtime/builtproject/harness_runner.js` — `child_process.spawn` for server lifecycle

**Extension (this decision):** The following install-time infrastructure files are added to §ARC-3 scope:

| File | Deviation |
|---|---|
| `bin/forge-install.js` | Entry point — no direct fs/child_process, delegates to orchestrator |
| `scripts/install/preflight.js` | `child_process.execSync` (admin check, service query, disk space via WMIC) + `net.createServer` (port check) |
| `scripts/install/install_orchestrator.js` | `child_process.execSync` (robocopy, npm install, NSSM commands, service start) + `fs.*Sync` (directory creation, file existence checks) |
| `scripts/install/rollback.js` | `child_process.execSync` (NSSM stop/remove) + `fs.*Sync` (evidence writing, diagnostic dump) |
| `scripts/install/post_verify.js` | `child_process.execSync` (forge-doctor.js, service query, crash test via PowerShell) + `fs.*Sync` (evidence file writes, uid_pin.json read, session file read) + `http` module (API calls to running server) |

**Rationale:** Install scripts are one-time infrastructure that runs outside the Forge runtime path. They are the installation equivalent of `harness_runner.js`'s server lifecycle management. Using `child_process.execSync` and `fs.*Sync` in install code is a standard and necessary pattern — routing these through L2 tool runtime would be circular (L2 tools are loaded by the runtime that the install scripts are setting up). §ARC-3 boundary expansion is the correct classification: same family, different lifecycle stage.

**§ARC count after this decision: 6** (no new §ARC-7 created).

The `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table §ARC-3 row is updated in this session to list the 5 new files.

---

## §7 — New File Inventory

| File | Type | Purpose |
|---|---|---|
| `bin/forge-install.js` | Entry point | CLI wrapper — `--dry-run` support, error routing |
| `scripts/install/preflight.js` | Safety check | Platform, admin rights, port, disk, service conflicts |
| `scripts/install/install_orchestrator.js` | Orchestrator | 11-step sequential install with rollback markers |
| `scripts/install/rollback.js` | Rollback | Inverse operations + diagnostic dump to `C:\Forge_install_failure_<ts>\` |
| `scripts/install/post_verify.js` | Verification | 10 automated evidence items written to `artifacts/stage_12_7/evidence/` |
| `artifacts/stage_12_7/windows_walkthrough.md` | Deprecated | Original manual walkthrough — kept for audit trail, DO NOT EXECUTE |

---

## §8 — Configuration

| Parameter | Value | Authority |
|---|---|---|
| Install location | `C:\Forge\` | Owner directive (canonical, professional) |
| Service supervisor | NSSM 2.24 | D1 (INSTALL.md §3 Option A) |
| NSSM download | Owner responsibility per D1 | OQ-D Option B |
| NSSM ZIP SHA-256 | `727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743` | INSTALL.md §3 (verified 2026-05-19) |
| NSSM search paths | `C:\tools\nssm-2.24\win64\nssm.exe`, `C:\tools\nssm-2.24\nssm.exe`, `C:\Program Files\nssm\nssm.exe`, system PATH | OQ-D Option B |
| Node.js auto-install | Via `winget` if v20+ absent | Amendment §1.3 |
| LLM calls | $0.00 — forbidden in install path | §2 binding |
| Evidence location | `artifacts/stage_12_7/evidence/` (source repo) | OQ-B |
| Rollback dump location | `C:\Forge_install_failure_<ts>\` (outside repo) | OQ-C |

---

## §9 — Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `robocopy` skips files silently | Low | robocopy exit codes 0-7 = success; 8+ = fail, orchestrator throws |
| Service starts but port 3100 taken | Low | Preflight checks port 3100 free before install |
| NSSM version mismatch | Low | `nssm version` output verified to contain "2.24" |
| Post-verify crash-recovery kills installer process | Low | Installer kills only the service's PID (via sc queryex), not all node processes |
| `C:\Forge\` already exists from prior install | Medium | copy_repo step handles idempotent overwrite; service is stopped before reinstall |
| Owner's env vars not inherited by service | Low | Service sets `OPENAI_API_KEY` via NSSM env config; post_verify tests auth without real key (infrastructure-only) |
| Evidence directory write fails | Low | `artifacts/stage_12_7/evidence/` already exists (Phase A); post_verify creates it if absent |

---

## §10 — Acceptance Criteria (Amended Closure Gate)

PHASE-12 closes when ALL true:

| # | Criterion | Verification |
|---|---|---|
| 1 | All 8 stage closures written (12.0–12.7) | 8 decision artifacts on disk |
| 2 | SU baseline ≥204/0/5 | `node bin/forge-test.js` output |
| 3 | Track A grep clean | 4 grep outputs in closure artifact |
| 4 | Owner ran `node bin/forge-install.js` successfully | `artifacts/stage_12_7/evidence/` populated with 10 evidence files, all PASS |
| 5 | Doctor PASS post-install | `step_14_doctor_final.txt` shows 0 FAIL |
| 6 | `progress/status.json` patched | `current_task = "PHASE-12-CLOSED"`, `next_phase = "PHASE-13"` |
| 7 | PHASE-12 closure decision artifact | `DECISION-<ts>-phase-12-closure.md` |
| 8 | Forge running as Windows service | `step_09_service_status.txt` shows `Status=Running` (or RUNNING in sc query output) |

---

## §11 — Cost

**$0.00 binding.** No LLM calls in `bin/forge-install.js` or `scripts/install/*`. Hard kill: $0.50 = STOP-AND-REPORT.

---

**END OF DECISION ARTIFACT — DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer**

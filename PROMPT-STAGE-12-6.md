# PROMPT-STAGE-12-6 — INSTALL.md + Production Setup Contract

**Stage:** 12.6 (Documentation-only — PHASE-12)
**Estimated effort:** 1-2 hours
**Cost target:** $0.00 (no API calls, no scenario runs needed)
**Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md` §3 Stage 12.6
**Predecessor:** Stage 12.5 (API Server Security Hardening) — CLOSED ✓

---

## §0 State Inheritance (MANDATORY — read before any write)

اقرأ بالكامل وبدون skim:

1. `architecture/FORGE_V2_BLUEPRINT.md` — Part B (L1-L5), Part D-Stage, Part E (governance gates)
2. `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-12 section
3. `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md` — Stage 12.6 deliverable spec + D1-D5 decisions
4. `progress/status.json` — current_task, runtime_health, recent_decisions
5. آخر 3 stage checkpoints في `artifacts/decisions/_phase_12_checkpoints/`:
   - `stage_12_3.md`
   - `stage_12_4.md`
   - `stage_12_5.md`
6. `artifacts/decisions/` — اقرأ آخر 5 decision artifacts (`ls -lt | head -5`)
7. `code/src/runtime/doctor/checks/` — list all 34 checks (للـ Doctor section في INSTALL.md)
8. `bin/` — list all CLI entry scripts (forge-doctor.js, forge-test.js, etc.)

**Step 0 deliverable:** اكتب رسالة summary بـ format:

```
## Step 0 — State Inheritance Summary

**Current phase:** ...
**Stage 12.6 deliverables (verbatim from plan):** ...
**INSTALL.md sections required (verbatim from plan):** ...
**D1-D5 decisions to reference in contract doc:** ...
**Existing INSTALL.md or production docs in repo?** (yes/no, paths if yes)
**Doctor checks count + names (for INSTALL Troubleshooting section):** ...
**CLI scripts in bin/ (for Quick Start section):** ...
**Open questions for CTO before writing:** ...
```

**STOP HERE.** انتظر CTO confirmation قبل ما تكتب أي markdown.

---

## §1 Deliverables

### 1.1 `INSTALL.md` (top-level, root of repo)

Sections (in order — match plan §3 exactly):

1. **Prerequisites**
   - Node.js version requirement (check `package.json` engines field)
   - npm version
   - Platform-specific notes (Windows / Linux / macOS)
   - Required env vars (reference `.env.example` if exists; else list explicitly)

2. **Quick Start**
   - `git clone` → `npm install` → `node bin/forge-doctor.js` → first scenario run
   - Expected output samples (exit codes, key log lines)
   - **DO NOT** include actual API keys or real secrets in examples

3. **Windows Service Setup**
   
   **Option A — NSSM (recommended for production):**
   - Download URL: `https://nssm.cc/release/nssm-2.24.zip`
   - **SHA-256 verification:** Claude Code يـ fetch الـ file ويـ compute الـ hash بنفسه. سجل الـ hash مع تاريخ الـ verification في الـ INSTALL.md كـ:
     ```
     **Verified SHA-256 (as of YYYY-MM-DD):** <hash>
     
     Verify locally:
       Windows: Get-FileHash nssm-2.24.zip -Algorithm SHA256
       Linux/macOS: sha256sum nssm-2.24.zip
     ```
   - Installation steps (extract, copy nssm.exe, register service)
   - Service start/stop/status commands
   - Log file location convention
   
   **Option B — Task Scheduler (lightweight alternative):**
   - XML task definition template
   - Import command via `schtasks /create /xml`
   - Run-as-user vs SYSTEM trade-offs (one paragraph)

4. **Linux systemd Setup (Tier 1)**
   - `.service` unit file template (paste verbatim, no placeholders unfilled)
   - `systemctl enable/start/status forge` commands
   - Log access via `journalctl -u forge`
   - User/group recommendation

5. **macOS launchd Setup (Tier 1)**
   - `.plist` template (paste verbatim)
   - `launchctl load/unload/list` commands
   - Log file path convention (`~/Library/Logs/forge/`)

6. **Secret Storage**
   - Reference D2 decision (Windows DPAPI / Linux libsecret / macOS Keychain)
   - DO NOT duplicate the contract spec — link to `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` §Secret Storage
   - Show ONE example per platform (how to store `OPENAI_API_KEY`)

7. **Backup**
   - Reference D3 decision (what gets backed up: `artifacts/`, `progress/`, `code/` exclusions)
   - Cron / Task Scheduler example for nightly tar.gz
   - Retention policy guidance (one paragraph)
   - Restore procedure (verify with `forge-doctor` after restore)

8. **Monitoring**
   - Reference D4 decision (Doctor endpoint + status.json polling)
   - `GET /api/system/doctor` curl example with expected JSON shape (abbreviated)
   - Alerting hook patterns (one paragraph — webhook on FAIL)

9. **Security**
   - Reference D5 decision (CORS, rate limits from Stage 12.5)
   - Network exposure recommendations (bind localhost by default)
   - File permission recommendations (chmod 600 on `.env`, etc.)
   - Link to `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` §Security

10. **Upgrading**
    - `git pull` → `npm install` → `node bin/forge-doctor.js` → `node bin/forge-test.js`
    - Migration discipline (always check `architecture/FORGE_V2_PHASE_ROADMAP.md` for breaking changes)
    - Backup-before-upgrade reminder

11. **Troubleshooting**
    - Table: failure symptom → Doctor check ID → resolution hint
    - Cover at least 6 common cases: port in use, missing API key, status.json corrupt, scenario harness hang, KB lance index lock, agent role not discovered
    - "When in doubt, run `node bin/forge-doctor.js`"

**Format rules:**
- Use code blocks (```bash, ```powershell, ```ini, ```xml, ```json) consistently
- No "TBD" or "TODO" anywhere in final doc
- Every platform-specific command labeled with platform header
- Internal links use relative paths (`docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` not absolute)

---

### 1.2 `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` (new L0 authority)

Sections:

1. **Authority** — declare this as L0 contract (peer to Blueprint per Part A)
2. **Scope** — production deployment governance only (not dev setup)
3. **Decisions D1-D5 referenced** — verbatim summary of each from `DECISION-2026-05-18T11-30-phase-12-plan.md`:
   - D1: Service supervisor strategy (NSSM Tier 1 Windows, systemd Tier 1 Linux, launchd Tier 1 macOS)
   - D2: Secret storage strategy (platform-native: DPAPI / libsecret / Keychain)
   - D3: Backup scope + retention
   - D4: Monitoring surface (Doctor + status.json)
   - D5: Security baseline (Stage 12.5 outcomes referenced)
4. **Compliance gates** — what proves a production deployment is contract-compliant:
   - `forge-doctor` exits 0
   - Secrets NOT in plaintext `.env` (verified via secret storage check — extend if a Doctor check exists for this)
   - Backup runs successfully + restore verified at least once
   - Service auto-restarts on crash (verified by planted `kill -9`)
5. **Out of scope** — explicitly: multi-tenant deployment, cloud orchestration, HA/failover. Reference Blueprint Part A frozen principle: "single-owner, local-first, not SaaS."
6. **Relationship to other L0 contracts** — table:
   | Contract | Relationship |
   |---|---|
   | Blueprint Part B (L1-L5) | Production deployment consumes L4 (Doctor) for health gates |
   | `docs/10_runtime/12_DOCTOR_CONTRACT.md` | Production monitoring extends Doctor checks |
   | `docs/04_autonomy/08_PERMISSION_POLICY_CONTRACT.md` | Production runs in `WORKSPACE_WRITE` by default |

**Format rules:**
- Match the style of existing `docs/12_ai_os/*.md` files (check `21_VISION_AUTHORITY_CONTRACT.md` and `22_KNOWLEDGE_BASE_CONTRACT.md` for tone)
- Date the doc at top: `Authored: 2026-05-XX`
- Status: `ADOPTED — Stage 12.6`

---

## §2 Track A Rules

**N/A for this stage.** Documentation-only.

ولكن صراحة:
- ❌ NO new code files
- ❌ NO modifications to `code/src/**`
- ❌ NO new scenarios, NO new Doctor checks, NO new L2 tools
- ❌ NO new §ARC exceptions
- ✅ ONLY: `INSTALL.md` (new) + `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` (new) + `progress/status.json` updates + checkpoint artifact

لو لقيت نفسك بـ تـ touch أي `.js` file → **STOP**. ده مش الـ stage الصح.

---

## §3 Mid-Stage Checkpoint

بعد ما تـ draft INSTALL.md (الـ 11 sections كاملة) وقبل ما تبدأ contract doc:

اكتب `artifacts/decisions/_phase_12_checkpoints/stage_12_6_mid.md` بـ:

```
# Stage 12.6 Mid-Checkpoint

**Date:** YYYY-MM-DDTHH:MM
**Drafted:** INSTALL.md (11 sections, ~XXX lines)
**Pending:** docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md
**NSSM SHA-256 verified:** <hash> at <date> from <URL>
**Open questions for CTO:**
- (any)
**Track A check:** N/A (docs-only stage)
**Cost so far:** $0.00
```

ثم STOP وانتظر CTO verification قبل ما تكتب contract doc.

---

## §4 STOP-AND-REPORT Triggers

اعمل STOP فوراً (مش "أحاول حل") لو:

1. **NSSM download fails** — الـ network call لـ `nssm.cc` returns non-200 أو timeout. لا تـ guess الـ hash من memory.
2. **Existing INSTALL.md found** — لو فيه INSTALL.md سابق في root الـ repo. اسأل CTO: replace أو merge؟
3. **D1-D5 decisions ambiguous** — لو الـ phase plan artifact مش clear على شي معين (مثلاً platform-native secret storage لـ Linux: libsecret أم gnome-keyring أم أي البديلين؟).
4. **NSSM 2.24 not the current stable release** — لو الـ NSSM site بـ يـ list version أحدث. اسأل قبل ما تـ update من 2.24.
5. **Cost > $0.00** — أي API call غير متوقع. الـ stage ده docs فقط، مفيش سبب لـ LLM calls.
6. **Track A violation accidental** — لو لاقيت نفسك بـ تـ touch code file بـ غلط.

Format الـ STOP message:
```
## ⛔ STOP-AND-REPORT

**Trigger:** <which of §4 1-6>
**Context:** <what happened>
**Recommendation:** <what I think should happen>
**Awaiting:** CTO decision before proceeding
```

---

## §5 Closure Gate (Deterministic)

Stage 12.6 يبقى CLOSED لما **كل** الـ following true:

| Check | How to verify |
|---|---|
| INSTALL.md exists in root | `ls INSTALL.md` returns the file |
| INSTALL.md has all 11 sections | `grep -E "^## " INSTALL.md \| wc -l` ≥ 11 |
| NSSM SHA-256 recorded + verification command included | `grep -i "sha-256\|sha256" INSTALL.md` returns ≥ 2 lines |
| 23_PRODUCTION_SETUP_CONTRACT.md exists | `ls docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` |
| Contract doc references D1-D5 | `grep -E "D[1-5]" docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` returns ≥ 5 |
| No code changes | `git diff --name-only` shows only `.md` files + `progress/status.json` + checkpoint artifact |
| No new §ARC exceptions | §ARC count still 6 (grep the §ARC ledger references) |
| SU baseline unchanged | NO scenario runs needed (docs stage) — just confirm scenarios dir untouched: `git diff --name-only code/src/testing/scenarios/` returns empty |
| Decision artifact written | `artifacts/decisions/DECISION-<ts>-stage-12-6-closure.md` exists |
| status.json updated | `progress/status.json` `current_task` reflects Stage 12.6 closure |
| Final checkpoint written | `artifacts/decisions/_phase_12_checkpoints/stage_12_6.md` exists with closure summary |

**Closure message format (لما كل ال above true):**

```
## ✓ Stage 12.6 — CLAIMED CLOSED

**Deliverables:**
- INSTALL.md (XXX lines, 11 sections)
- docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md (XXX lines, L0 authority)

**Verification commands run:**
[paste the §5 grep outputs verbatim]

**Cost:** $0.00
**Track A status:** N/A (docs-only) — confirmed no code touched
**SU baseline:** unchanged (207 total, 202 pass / 0 fail / 5 skip)
**§ARC count:** 6 (unchanged)

**Awaiting CTO independent verification.**
```

---

## §6 Cost Budget

**Target:** $0.00
**Hard kill:** $0.50 (if exceeded → STOP-AND-REPORT trigger #5)

ده docs stage. مفيش سبب لأي LLM call. لو لقيت نفسك محتاج LLM لـ:
- Generating example content → اكتبه بإيدك
- Rephrasing a section → اكتبه بإيدك
- Verifying a fact → web search فقط (which is free)

**Logged actuals:** $0.00 expected at closure.

---

## End of PROMPT-STAGE-12-6

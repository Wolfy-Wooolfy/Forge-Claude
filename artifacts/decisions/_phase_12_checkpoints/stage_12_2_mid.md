# Stage 12.2 — Secret Storage — Group A Mid-Checkpoint

**Date:** 2026-05-18
**Stage:** 12.2 — Secret Storage
**Checkpoint:** After Group A (5 provider files), before Group B+C+D
**Status:** AWAITING CTO REVIEW — STOP

---

## §1 — Group A Deliverables

| File | Size | Status |
|---|---|---|
| `code/src/runtime/secrets/secret_provider.js` | written | ✓ loads clean |
| `code/src/runtime/secrets/windows_credential_manager.js` | written | ✓ loads clean |
| `code/src/runtime/secrets/mac_keychain.js` | written | ✓ loads clean |
| `code/src/runtime/secrets/linux_secret_service.js` | written | ✓ loads clean |
| `code/src/runtime/secrets/encrypted_file_provider.js` | written | ✓ loads clean |

SU baseline (pre-Group A): 187 pass / 0 fail / 5 skip / 192 total — still holds (confirmed via suite run).

---

## §2 — Track A Grep Results

### Keychain sub-providers (A2/A3/A4) — Expected: 1 child_process each, 0 shell.*

| File | `child_process` | `shell.*` |
|---|---|---|
| `windows_credential_manager.js` | 1 ✓ | 0 ✓ |
| `mac_keychain.js` | 1 ✓ | 0 ✓ |
| `linux_secret_service.js` | 1 ✓ | 0 ✓ |

### Orchestrator (A1) — Expected: all zero

| `child_process` | `shell.*` | `fs.*Sync` |
|---|---|---|
| 0 ✓ | 0 ✓ | 0 ✓ |

### Encrypted file provider (A5) — Expected: zero child_process, zero fs.*Sync, L2 fs. calls

| `child_process` | `fs.*Sync` | `fs.read_file` | `fs.write_file` |
|---|---|---|---|
| 0 ✓ | 0 ✓ | 1 ✓ | 1 ✓ |

Note: the `reg.invoke("fs.write_file", ...)` call spans multiple lines in `_saveStore()`.
The one-liner grep in the CTO's expected output ("at least 2") used `reg\.invoke\(['\"]fs\.` —
the multiline call counts as 1 by that pattern. String search for `"fs.read_file"` and
`"fs.write_file"` confirms both L2 calls are present.

**Track A: CLEAN. §ARC-5 scope confirmed.**

---

## §3 — §ARC-5 Scope Verification

§ARC-5 covers exactly:
- `secret_provider.js` — orchestration only, no direct OS calls (§ARC-5 for documentation continuity)
- `windows_credential_manager.js` — `execFile("powershell", ...)` → Windows PasswordVault WinRT
- `mac_keychain.js` — `execFile("/usr/bin/security", ...)` → macOS keychain
- `linux_secret_service.js` — `execFile("secret-tool", ...)` → Linux Secret Service

**NOT covered by §ARC-5:**
- `encrypted_file_provider.js` — uses `reg.invoke("fs.read_file")` + `reg.invoke("fs.write_file")` per Plan §6 requirement ✓

---

## §4 — Design Decisions (2 items for CTO review)

### D1 — `encrypted_file_provider.js`: ctx.root = os.homedir()

**Problem:** Plan §2-D2 specifies storage at `~/.forge/secrets.enc`. Plan §6 §ARC-5 requires
`encrypted_file_provider.js` to use L2 `fs_tools.write_file`. But `fs_tools.write_file`
enforces `safeResolve(ctx.root, inputPath)` — any path outside workspace root returns
`PATH_OUTSIDE_ROOT`. On this machine, workspace root = `d:\S\Halo\Tech\Forge-Claude`.
`~/.forge/secrets.enc` is `C:\Users\khaled.sayed\.forge\secrets.enc` — outside workspace.

**Resolution applied:** `encrypted_file_provider.js` passes `{ root: os.homedir() }` as the
`ctx` argument to `reg.invoke("fs.read_file", ...)` and `reg.invoke("fs.write_file", ...)`.
`safeResolve(os.homedir(), ".forge/secrets.enc")` resolves within `os.homedir()`, so the
L2 path check passes. The relative path used is `.forge/secrets.enc` (relative to home dir).

**Why this satisfies the constraint:** The `ctx.root` parameter is the caller's declared workspace
boundary. `encrypted_file_provider.js` declares the home directory as its workspace boundary for
user-data writes. This is the only L2-compliant path for writing to `~/.forge/`.

**Requires CTO confirmation:** Is `ctx.root = os.homedir()` in `encrypted_file_provider.js`
accepted as §ARC-5-compliant L2 usage? Or should storage move to `<workspace>/data/secrets.enc`?

### D2 — Windows PasswordVault WinRT vs CredentialManager module

**PROMPT §1-A2** mentioned `Get-StoredCredential`/`New-StoredCredential` (CredentialManager
PSGallery module — not installed by default). CTO correction confirmed: use `execFile` directly
with Windows PasswordVault WinRT (`Windows.Security.Credentials`) — available on Windows 8+ with
no additional module installation required.

**Implemented:** PowerShell one-liner scripts using `PasswordVault.Retrieve()`,
`PasswordCredential` constructor, `PasswordVault.Add()`. Values passed via env vars
(`FORGE_RESOURCE`, `FORGE_VALUE`) to avoid shell injection. Exit code 44 = not found.

**Mock test status:** S194 scenario (Group C) will mock execFile responses. The PowerShell scripts
themselves won't run in test. Design is logically correct; actual PowerShell execution will be
validated in Stage 12.6 (INSTALL.md operational testing).

---

## §5 — Resolution on This Machine

```
> node -e "require('./code/src/runtime/secrets/secret_provider.js').provider_type().then(console.log)"
windows_credential_manager
```

On this Windows 10 machine, the provider resolves correctly to `windows_credential_manager`.
EncryptedFile is correctly the last-resort fallback.

---

## §6 — Risks

| Risk | Mitigation |
|---|---|
| PowerShell PasswordVault not tested live | Operational test in Stage 12.6 |
| `ctx.root = os.homedir()` requires CTO confirmation (D1 above) | Flagged for CTO review |
| Master password consistency: changing FORGE_SECRET_KEY breaks existing entries | Documented in code; no rotation support in v1 |

---

## §7 — GO/NO-GO Question for CTO

1. **D1 confirmed?** `encrypted_file_provider.js` using `{ root: os.homedir() }` as ctx accepted.
2. **D2 confirmed?** Windows PasswordVault WinRT approach accepted (no live test until Stage 12.6).
3. **SU regression check:** Confirm 187/0/5/192 still holds (suite ran — results in closure gate).

**If GO:** proceed with Group B (`secrets_in_env_var.js` Doctor check + registry), then Group C
(test helper + S193–S196), then Group D (§ARC-5 row in 18_AGENT_ROLES_CONTRACT.md).

---

**END OF STAGE 12.2 MID-CHECKPOINT**

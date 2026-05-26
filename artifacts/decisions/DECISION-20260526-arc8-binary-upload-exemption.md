# DECISION-20260526 — §ARC-8: Binary Upload Infrastructure Exemption

**Date:** 2026-05-26
**Owner approval:** CTO verbal — B7a Track A constraint acknowledged
**Scope:** `code/src/workspace/apiServer.js` — `POST /api/intake/upload` handler

## Decision

Grant §ARC-8 exemption for `fs.writeFileSync(savedPath, fileBuffer)` in the intake upload endpoint.

## Rationale

The L2 Tool Runtime layer (`fs.write_file`) converts content via `String(content)` before writing, which corrupts raw binary (ZIP) payloads. An upload endpoint receiving a `Buffer` cannot route through the text-only `fs.write_file` tool without data loss.

This is a narrow, single-site exemption:
- Applies only to `POST /api/intake/upload` handler
- Path is constrained to `artifacts/uploads/` only (resolved under `root`)
- Directory is created with `fs.mkdirSync(uploadsDir, { recursive: true })`
- Filename is sanitized: `filename.replace(/[^a-zA-Z0-9._-]/g, '_')`
- No other direct `fs.*` calls are added

## §ARC Ledger

| # | Site | Rationale |
|---|------|-----------|
| ARC-1 | server.listen() | TCP bind |
| ARC-2 | fs.readFileSync in loadApprovalPolicy | Config read before registry |
| ARC-3 | fs.mkdirSync in ensureDir | Directory init before registry available |
| ARC-4 | fs.readFileSync in getRecentWrites | Read-only scan |
| ARC-5 | secret_provider set in start() | Capability token storage |
| ARC-6 | fs.existsSync guard checks | Existence checks, not writes |
| ARC-7 | session file write via L2 with permissionRules exception | SYSTEM_SESSION_FILE |
| **ARC-8** | **fs.writeFileSync in /api/intake/upload** | **Binary Buffer — text tool would corrupt ZIP** |

Total: 8 entries.

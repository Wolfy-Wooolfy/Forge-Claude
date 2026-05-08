# Forge — AI Operating System (v2.0)

**Personal AI OS for building software projects.**

Forge is a single-owner, local-first system that turns conversation into specifications, specifications into verified code, and code into deliverables — with a deterministic test harness at every stage so nothing ships on judgment alone.

---

## Core Principles

1. **Conversation drives discovery.** No keyword matching. Every intent goes through a provider.
2. **Vision is authority.** Once locked, vision changes only via signed amendments.
3. **Side effects are tools.** Every write/shell/http call passes through the Tool Runtime.
4. **Permissions gate execution.** Read-only / workspace-write / danger-full-access modes.
5. **Tests are deterministic.** No "looks good". Scenarios assert on tool calls and state diffs.
6. **Forge tests its own builds.** Projects Forge generates ship with a scenario set Forge runs after every module.

---

## Quickstart

### Requirements

- Node.js 20+
- An OpenAI-compatible API key (`OPENAI_API_KEY` env var)
- Project root as working directory

### First run

```bash
# 1) Health check (متاح بعد PHASE-4)
node bin/forge-doctor.js

# 2) Baseline tests (متاح بعد PHASE-5)
node bin/forge-test.js

# 3) Start the API server + web UI
node start-api.js
# Then open the URL printed in stdout (default http://localhost:4505/)
```

### Layout

```
architecture/    Engineering blueprint + phase roadmap
artifacts/       All produced state: decisions, audits, scenarios, projects
bin/             CLI entry points (forge-doctor, forge-test, ...)
code/src/        Source — providers, ai_os, modules, orchestrator, runtime
docs/            Authoritative specifications
progress/        Live system status
web/             Current vanilla UI (refactored to React in PHASE-10)
```

---

## Authority Hierarchy

In order of precedence:

1. `INSTRUCTIONS.md` — execution authority
2. `architecture/FORGE_V2_BLUEPRINT.md` + `FORGE_V2_PHASE_ROADMAP.md` — architecture authority
3. `docs/**` — specification authority
4. `progress/status.json` — runtime state authority
5. `artifacts/decisions/**` — change authority

If any two conflict, the higher-numbered one is **subordinate** and must be reconciled in favor of the higher-precedence document.

---

## Current Status

See `progress/status.json` for the live runtime state. The phase currently in progress is recorded in `current_task`.

---

## What This Is Not

- ❌ A SaaS. Single-owner, local only.
- ❌ A multi-tenant platform.
- ❌ An autonomous agent that ships without human approval.
- ❌ A code generator that runs without scenario tests.

---

## Documentation

- **Engineering blueprint:** `architecture/FORGE_V2_BLUEPRINT.md`
- **Phase roadmap:** `architecture/FORGE_V2_PHASE_ROADMAP.md`
- **Operational rules:** `CLAUDE.md` (for Claude Code) + `INSTRUCTIONS.md` (binding)
- **AI OS spec pack:** `docs/12_ai_os/00_AI_OS_MASTER_SPEC.md` and siblings

---

END

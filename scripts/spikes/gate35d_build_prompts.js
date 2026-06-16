"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP D — derive reviewer_v5 / security_auditor_v3 into 18b (BUILD, $0)
// ════════════════════════════════════════════════════════════════════════════
// Deterministic doc transform. Copies the reviewer_v4 / security_auditor_v2
// bodies VERBATIM (via the prompt loader) so the new versions share a
// byte-identical opening, then inserts the new calibration clauses AFTER the
// protected 500-char prefix (reviewer: before "Output format:"; security:
// before "Threat level rubric:"). Splices new "## <id> (date)" blocks into the
// doc immediately after the prior version of each family. Asserts the
// stable-prefix invariant before writing. No real calls; doc-only.
// ════════════════════════════════════════════════════════════════════════════

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOC  = path.join(ROOT, "docs", "10_runtime", "18b_ROLE_PROMPTS.md");

const { loadPrompt, resetPromptCache } = require(path.join(ROOT, "code", "src", "runtime", "agents", "_prompt_loader"));

// ── New calibration clauses ──────────────────────────────────────────────────
const REVIEWER_SECTION =
`Severity discipline (reviewer_v5 — out-of-scope and not-required concerns):
- A BLOCKER is reserved for a defect that makes the code unsafe to ship — a behavioral or contract defect (the code does the wrong thing), a real security exploit, or data corruption. Reserve REJECTED for those.
- A legitimate-but-not-required concern that is NOT named in the spec's acceptance_criteria and is NOT exploitable — for example input validation on an endpoint the spec marks out-of-scope (e.g. out-of-scope for auth), missing tests, or optional error-handling hardening — is a WARN or INFO, NOT a BLOCKER. Do NOT REJECT clean, correct code over WARN-level concerns.

Anti-fabrication (reviewer_v5 — generalized):
- Do NOT raise a finding about something that is not present in the provided input — the input may be partial.
- If the code imports a module that is not included in the input, note it as a WARN ("verify this dependency exists"), NOT a BLOCKER.
- Recall is preserved: a genuine behavioral defect — e.g. a missing this.changes / affected-row check, or missing not-found (404) handling — is STILL a BLOCKER.`;

const SECURITY_SECTION =
`Respect out_of_scope (security_auditor_v3 — mandatory):
- If the spec lists out_of_scope items, do NOT raise a finding — and especially NOT a BLOCKER — about them. Example: the spec marks Authentication out-of-scope, so "missing authentication" is NOT a finding at any severity.

Severity discipline (security_auditor_v3):
- A concern that is not required by the spec and is not exploitable in the code as written is a WARN, not a BLOCKER.
- Recall is preserved: a real injection / SQLi / exploit confirmed present in the code as written is STILL a BLOCKER.`;

// ── Block headers ─────────────────────────────────────────────────────────────
const REVIEWER_HEADER =
`## reviewer_v5 (2026-06-16)

> Supersedes reviewer_v4 (PHASE-35 STEP D root-cause pivot — see
> DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md). Same OUTPUT schema and verdict
> rules. The first 500 characters are byte-identical to reviewer_v4 (and thus v3/v2) by design —
> preserves the deterministic mock prefix keys S89/S90; the new clauses are added AFTER the protected
> prefix, before "Output format:". Rationale: the gpt-4o cycles 1-2 AND the gpt-5.4 C-3a pre-flight
> both over-fired the SAME way — escalating not-required, not-exploitable concerns (input validation
> on an out-of-scope-for-auth endpoint) to BLOCKER, and fabricating findings about modules absent from
> the provided input. v5 adds severity discipline + a generalized anti-fabrication clause WITHOUT
> relaxing the v4 recall that catches the PHASE-31 this.changes / not-found defect.`;

const SECURITY_HEADER =
`## security_auditor_v3 (2026-06-16)

> Supersedes security_auditor_v2 (PHASE-35 STEP D root-cause pivot — see
> DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md). Same OUTPUT schema, threat rubric,
> and severity ladder. First 500 characters byte-identical to security_auditor_v2 (protects the
> prefix-keyed mock scenarios); new clauses added after the prefix, before "Threat level rubric:".
> Rationale: the auditor over-reported spec-declared out_of_scope items (e.g. "missing authentication"
> on an API whose spec marks Authentication out-of-scope) and inflated not-required concerns to
> BLOCKER. v3 adds an out_of_scope-respect clause + severity discipline WITHOUT relaxing the v2
> Verify-before-flag recall (a real SQLi/exploit is STILL a BLOCKER).`;

// ── Build bodies ──────────────────────────────────────────────────────────────
const v4 = loadPrompt("reviewer_v4");
const v2 = loadPrompt("security_auditor_v2");

const REV_ANCHOR = "\n\nOutput format:\n";
const SEC_ANCHOR = "\n\nThreat level rubric:\n";

if (v4.indexOf(REV_ANCHOR) === -1) throw new Error("reviewer_v4 anchor 'Output format:' not found");
if (v2.indexOf(SEC_ANCHOR) === -1) throw new Error("security_auditor_v2 anchor 'Threat level rubric:' not found");

const v5 = v4.replace(REV_ANCHOR, "\n\n" + REVIEWER_SECTION + REV_ANCHOR);
const v3 = v2.replace(SEC_ANCHOR, "\n\n" + SECURITY_SECTION + SEC_ANCHOR);

// ── STABLE-PREFIX assertions (hard gate) ──────────────────────────────────────
const revPrefixOk = v5.slice(0, 500) === v4.slice(0, 500);
const secPrefixOk = v3.slice(0, 500) === v2.slice(0, 500);
if (!revPrefixOk) throw new Error("STABLE-PREFIX VIOLATION: reviewer_v5 first-500 != reviewer_v4");
if (!secPrefixOk) throw new Error("STABLE-PREFIX VIOLATION: security_auditor_v3 first-500 != security_auditor_v2");
if (v5 === v4) throw new Error("reviewer_v5 identical to v4 — insertion did not happen");
if (v3 === v2) throw new Error("security_auditor_v3 identical to v2 — insertion did not happen");

// ── Splice into the doc ───────────────────────────────────────────────────────
let raw = fs.readFileSync(DOC, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

function block(header, body) {
  return header + "\n\n```\n" + body + "\n```\n\n---\n\n";
}

const REV_BLOCK = block(REVIEWER_HEADER, v5);
const SEC_BLOCK = block(SECURITY_HEADER, v3);

// Insert reviewer_v5 immediately before "## builder_v1 (" (i.e., after the
// reviewer family). Insert security_auditor_v3 before "## test_designer_v1 (".
const REV_MARKER = "## builder_v1 (";
const SEC_MARKER = "## test_designer_v1 (";

if (raw.indexOf("## reviewer_v5 (") !== -1) throw new Error("reviewer_v5 block already present — refusing to duplicate");
if (raw.indexOf("## security_auditor_v3 (") !== -1) throw new Error("security_auditor_v3 block already present — refusing to duplicate");
if (raw.indexOf(REV_MARKER) === -1) throw new Error("insert marker '" + REV_MARKER + "' not found");
if (raw.indexOf(SEC_MARKER) === -1) throw new Error("insert marker '" + SEC_MARKER + "' not found");

// Normalize the inserted blocks to the file's EOL.
const revIns = (eol === "\r\n" ? REV_BLOCK.replace(/\n/g, "\r\n") : REV_BLOCK);
const secIns = (eol === "\r\n" ? SEC_BLOCK.replace(/\n/g, "\r\n") : SEC_BLOCK);

raw = raw.replace(REV_MARKER, revIns + REV_MARKER);
raw = raw.replace(SEC_MARKER, secIns + SEC_MARKER);

fs.writeFileSync(DOC, raw, "utf8");

// ── Re-verify through the loader (post-write, fresh cache) ────────────────────
resetPromptCache();
const v5b = loadPrompt("reviewer_v5");
const v3b = loadPrompt("security_auditor_v3");
const revRoundtrip = v5b === v5 && v5b.slice(0, 500) === loadPrompt("reviewer_v4").slice(0, 500);
const secRoundtrip = v3b === v3 && v3b.slice(0, 500) === loadPrompt("security_auditor_v2").slice(0, 500);

console.log("══ STEP D — prompt build ══");
console.log("  reviewer_v5  : len " + v4.length + " → " + v5b.length + " (+" + (v5b.length - v4.length) + ")  first500==v4: " + revPrefixOk + "  roundtrip: " + revRoundtrip);
console.log("  security_v3  : len " + v2.length + " → " + v3b.length + " (+" + (v3b.length - v2.length) + ")  first500==v2: " + secPrefixOk + "  roundtrip: " + secRoundtrip);
if (!revRoundtrip || !secRoundtrip) { console.error("⛔ roundtrip mismatch"); process.exit(1); }
console.log("  doc written  : docs/10_runtime/18b_ROLE_PROMPTS.md");
process.exit(0);

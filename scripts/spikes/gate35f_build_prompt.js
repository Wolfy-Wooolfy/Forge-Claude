"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP F — derive security_auditor_v4 into 18b (BUILD, $0)
// ════════════════════════════════════════════════════════════════════════════
// Copies security_auditor_v3 VERBATIM (via the prompt loader) so v4 shares a
// byte-identical opening, then inserts an EXPLICIT input-validation severity rule
// AFTER the protected 500-char prefix (before "Threat level rubric:"). Sharpens
// the v3 "not exploitable = WARN" clause, which failed 4/8 in STEP E because the
// auditor treats any missing input validation as inherently exploitable.
// Asserts the stable-prefix invariant before writing. Doc-only; no real calls.
// ════════════════════════════════════════════════════════════════════════════

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOC  = path.join(ROOT, "docs", "10_runtime", "18b_ROLE_PROMPTS.md");

const { loadPrompt, resetPromptCache } = require(path.join(ROOT, "code", "src", "runtime", "agents", "_prompt_loader"));

// ── New refinement clause (fixture-agnostic — no test ids in the production prompt) ──
const V4_SECTION =
`Input-validation severity (security_auditor_v4 — explicit; sharpens the v3 severity clause):
- A general "missing input validation" observation — where the spec does not require validation AND you cannot point to a CONCRETE, demonstrated exploit path (a specific missing check that directly enables an injection the parameterization does not already prevent) — is a WARN, NOT a BLOCKER. "Inputs should be validated" is precautionary hardening: WARN at most, never a BLOCKER on its own.
- Reserve BLOCKER for a vulnerability you can concretely demonstrate end to end: a real injection, an actual authentication/authorization bypass, or real data corruption — name the exact untrusted input, the sink it reaches, and the exploit it produces. If you cannot demonstrate the exploit against the code as written, it is not a BLOCKER.
- Recall preserved: if a missing check DOES directly enable a real injection/exploit — e.g. untrusted input concatenated or interpolated into a query / command / path string — it is STILL a BLOCKER. A genuine SQL injection remains a BLOCKER; already-parameterized / bound code remains clean (no finding).`;

const V4_HEADER =
`## security_auditor_v4 (2026-06-16)

> Supersedes security_auditor_v3 (PHASE-35 STEP F — security severity refinement; see
> DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md). Same OUTPUT schema, threat rubric,
> and severity ladder. First 500 characters byte-identical to security_auditor_v3 (protects the
> prefix-keyed mock scenarios S96-S99); the refinement is added after the prefix, before "Threat level
> rubric:". Rationale: STEP E measured security_v3 over-fire at 4/8 — the residual was EXCLUSIVELY a
> general "missing input validation" raised as a BLOCKER (0/8 SQLi false-positive, 0/8 out_of_scope
> auth — those were fully fixed by v3). v4 adds an explicit input-validation severity rule: a
> precautionary "should validate inputs" with no demonstrated exploit is a WARN, never a BLOCKER;
> BLOCKER is reserved for a concretely demonstrable exploit. Recall is preserved (a real
> injection/bypass/corruption is STILL a BLOCKER).`;

// ── Build body ────────────────────────────────────────────────────────────────
const v3 = loadPrompt("security_auditor_v3");
const ANCHOR = "\n\nThreat level rubric:\n";
if (v3.indexOf(ANCHOR) === -1) throw new Error("security_auditor_v3 anchor 'Threat level rubric:' not found");

const v4 = v3.replace(ANCHOR, "\n\n" + V4_SECTION + ANCHOR);

// ── STABLE-PREFIX assertion (hard gate) ───────────────────────────────────────
const prefixOk = v4.slice(0, 500) === v3.slice(0, 500);
if (!prefixOk) throw new Error("STABLE-PREFIX VIOLATION: security_auditor_v4 first-500 != security_auditor_v3");
if (v4 === v3) throw new Error("security_auditor_v4 identical to v3 — insertion did not happen");

// ── Splice into the doc ───────────────────────────────────────────────────────
let raw = fs.readFileSync(DOC, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

const block = V4_HEADER + "\n\n```\n" + v4 + "\n```\n\n---\n\n";
const MARKER = "## test_designer_v1 (";

if (raw.indexOf("## security_auditor_v4 (") !== -1) throw new Error("security_auditor_v4 block already present — refusing to duplicate");
if (raw.indexOf(MARKER) === -1) throw new Error("insert marker '" + MARKER + "' not found");

const ins = (eol === "\r\n" ? block.replace(/\n/g, "\r\n") : block);
raw = raw.replace(MARKER, ins + MARKER);
fs.writeFileSync(DOC, raw, "utf8");

// ── Re-verify through the loader (post-write, fresh cache) ────────────────────
resetPromptCache();
const v4b = loadPrompt("security_auditor_v4");
const roundtrip = v4b === v4 && v4b.slice(0, 500) === loadPrompt("security_auditor_v3").slice(0, 500);

console.log("══ STEP F — prompt build ══");
console.log("  security_auditor_v4 : len " + v3.length + " → " + v4b.length + " (+" + (v4b.length - v3.length) + ")  first500==v3: " + prefixOk + "  roundtrip: " + roundtrip);
if (!roundtrip) { console.error("⛔ roundtrip mismatch"); process.exit(1); }
console.log("  doc written  : docs/10_runtime/18b_ROLE_PROMPTS.md");
process.exit(0);

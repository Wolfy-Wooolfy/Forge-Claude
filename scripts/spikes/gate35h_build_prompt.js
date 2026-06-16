"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP H — derive security_auditor_v6 (v5 + threat_level/severity
// disambiguation note) into 18b (BUILD, $0)
// ════════════════════════════════════════════════════════════════════════════
// v5's few-shot block SOLVED the over-fire (7/8 vs v3 4/8 / v4 2/8), but its heavy
// repetition of "severity WARN / severity BLOCKER" caused 2/14 trials to write a
// SEVERITY value (WARN/BLOCKER) into the threat_level field — a DIFFERENT enum
// (CRITICAL/HIGH/MEDIUM/LOW/NONE) — fail-closing as INVALID_ROLE_OUTPUT (correct
// fail-close, but 14% parse-failure is not production-clean). v6 = security_v5
// VERBATIM + ONE short field-disambiguation note INSIDE the few-shot block (after
// char 500, adjacent to the worked examples, before "Threat level rubric:"). The
// note uses the REAL enum values confirmed from the role's OUTPUT_SCHEMA:
//   threat_level : CRITICAL / HIGH / MEDIUM / LOW / NONE
//   findings[].severity : BLOCKER / WARN / INFO
// Stable-prefix (first 500 == v5 == v3) asserted before writing. No DF-fixture tokens.
// ════════════════════════════════════════════════════════════════════════════

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOC  = path.join(ROOT, "docs", "10_runtime", "18b_ROLE_PROMPTS.md");

const { loadPrompt, resetPromptCache } = require(path.join(ROOT, "code", "src", "runtime", "agents", "_prompt_loader"));

// ── The single disambiguation note (real enum values; no DF-fixture tokens) ──
const V6_NOTE =
`Field disambiguation (security_auditor_v6 — the two fields use DIFFERENT enums; do not conflate them): in the worked examples above, WARN and BLOCKER are values of an individual finding's \`severity\` field — findings[].severity, whose only allowed values are BLOCKER / WARN / INFO. The top-level \`threat_level\` field is SEPARATE and uses a DIFFERENT enum: CRITICAL / HIGH / MEDIUM / LOW / NONE. NEVER write WARN or BLOCKER into threat_level, and never write a threat_level value into a finding's severity. (severity describes one finding; threat_level summarizes the whole report.)`;

const V6_HEADER =
`## security_auditor_v6 (2026-06-16)

> Supersedes security_auditor_v5 (PHASE-35 STEP H — threat_level/severity disambiguation; see
> DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md). security_auditor_v5 VERBATIM + a
> single field-disambiguation note inside the few-shot block. Same OUTPUT schema, threat rubric, and
> severity ladder. First 500 characters byte-identical to security_auditor_v5 / v3 / v2 (protects the
> S96–S99 mock scenarios); the note is added after the prefix, adjacent to the worked examples, before
> "Threat level rubric:". The worked examples, the severity rules, and everything before char 500 are
> unchanged. Rationale: STEP G's few-shot block SOLVED the over-fire (v5 = 7/8 vs v3 4/8 / v4 2/8) but
> its heavy repetition of "severity WARN / severity BLOCKER" caused 2/14 trials to write a severity
> value (WARN/BLOCKER) into the top-level threat_level field — which uses a DIFFERENT enum
> (CRITICAL/HIGH/MEDIUM/LOW/NONE) — fail-closing as INVALID_ROLE_OUTPUT (correct fail-close, not a
> wrong verdict, but 14% parse-failure is not production-clean). v6 adds ONE note disambiguating the
> two fields to drive INVALID_ROLE_OUTPUT to 0. Over-fire/recall/precision inherited unchanged from v5.`;

// ── Build body from v5 (NOT v3/v4) ────────────────────────────────────────────
const v5 = loadPrompt("security_auditor_v5");
const v3 = loadPrompt("security_auditor_v3");
const ANCHOR = "\n\nThreat level rubric:\n";
if (v5.indexOf(ANCHOR) === -1) throw new Error("security_auditor_v5 anchor 'Threat level rubric:' not found");

// Insert the note after the few-shot block's closing paragraph, before the rubric anchor.
const v6 = v5.replace(ANCHOR, "\n\n" + V6_NOTE + ANCHOR);

// ── STABLE-PREFIX assertion (hard gate) ───────────────────────────────────────
const prefixOk_v5 = v6.slice(0, 500) === v5.slice(0, 500);
const prefixOk_v3 = v6.slice(0, 500) === v3.slice(0, 500);
if (!prefixOk_v5) throw new Error("STABLE-PREFIX VIOLATION: security_auditor_v6 first-500 != security_auditor_v5");
if (!prefixOk_v3) throw new Error("STABLE-PREFIX VIOLATION: security_auditor_v6 first-500 != security_auditor_v3");
if (v6 === v5) throw new Error("security_auditor_v6 identical to v5 — insertion did not happen");

// Body must be v5 + exactly the note (nothing else changed).
if (v6 !== v5.replace(ANCHOR, "\n\n" + V6_NOTE + ANCHOR)) throw new Error("v6 body is not v5 + the single note");

// Honesty guard: the note must NOT copy the DF-fixture identifiers.
for (const banned of ["todoController", "todos", "completed", "createTodo", "updateTodo", "deleteTodo", "title"]) {
  if (V6_NOTE.indexOf(banned) !== -1) throw new Error("HONESTY VIOLATION: note references DF-fixture token '" + banned + "'");
}

// ── Splice into the doc (after the v5 block, before test_designer_v1) ──────────
let raw = fs.readFileSync(DOC, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

const block = V6_HEADER + "\n\n```\n" + v6 + "\n```\n\n---\n\n";
const MARKER = "## test_designer_v1 (";

if (raw.indexOf("## security_auditor_v6 (") !== -1) throw new Error("security_auditor_v6 block already present — refusing to duplicate");
if (raw.indexOf(MARKER) === -1) throw new Error("insert marker '" + MARKER + "' not found");

const ins = (eol === "\r\n" ? block.replace(/\n/g, "\r\n") : block);
raw = raw.replace(MARKER, ins + MARKER);
fs.writeFileSync(DOC, raw, "utf8");

// ── Re-verify through the loader ──────────────────────────────────────────────
resetPromptCache();
const v6b = loadPrompt("security_auditor_v6");
const roundtrip = v6b === v6
  && v6b.slice(0, 500) === loadPrompt("security_auditor_v5").slice(0, 500)
  && v6b.slice(0, 500) === loadPrompt("security_auditor_v3").slice(0, 500);

// SHA proof of the stable prefix (first 500 chars across v6/v5/v3).
const crypto = require("crypto");
const sha500 = s => crypto.createHash("sha256").update(s.slice(0, 500), "utf8").digest("hex").slice(0, 16);

console.log("══ STEP H — prompt build (threat_level/severity disambiguation) ══");
console.log("  security_auditor_v6 : len " + v5.length + " (v5 base) → " + v6b.length + " (+" + (v6b.length - v5.length) + ")  first500==v5: " + prefixOk_v5 + "  roundtrip: " + roundtrip);
console.log("  first-500 sha256[:16]  v6=" + sha500(v6b) + "  v5=" + sha500(v5) + "  v3=" + sha500(v3));
console.log("  prefix byte-identical v6==v5==v3: " + (sha500(v6b) === sha500(v5) && sha500(v5) === sha500(v3)));
console.log("  built from v5 (NOT v3/v4); honesty guard passed (no DF-fixture tokens in the note)");
if (!roundtrip) { console.error("⛔ roundtrip mismatch"); process.exit(1); }
if (sha500(v6b) !== sha500(v5) || sha500(v5) !== sha500(v3)) { console.error("⛔ prefix sha mismatch"); process.exit(1); }
console.log("  doc written  : docs/10_runtime/18b_ROLE_PROMPTS.md");
process.exit(0);

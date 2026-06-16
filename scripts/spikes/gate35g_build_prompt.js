"use strict";

// ════════════════════════════════════════════════════════════════════════════
// PHASE-35 STEP G — derive security_auditor_v5 (FEW-SHOT) into 18b (BUILD, $0)
// ════════════════════════════════════════════════════════════════════════════
// MECHANISM CHANGE: v2/v3/v4 all stated severity RULES in prose; v4 (the sharpest
// rules) REGRESSED (2/8, revived SQLi-FP). v5 = security_v3 BASE (the best measured
// version, 4/8) + a FEW-SHOT block of generic/synthetic worked examples that teach
// the severity boundary by example. Built from v3 VERBATIM (v4 wording discarded).
// Examples are invented (items/label/search — NOT the DF todos/title fixtures): the
// evaluation stays honest. Stable-prefix (first 500 == v3) asserted before writing.
// ════════════════════════════════════════════════════════════════════════════

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOC  = path.join(ROOT, "docs", "10_runtime", "18b_ROLE_PROMPTS.md");

const { loadPrompt, resetPromptCache } = require(path.join(ROOT, "code", "src", "runtime", "agents", "_prompt_loader"));

// ── Few-shot block (generic/synthetic — different domain/identifiers from the DF fixtures) ──
const V5_SECTION =
`Worked examples (security_auditor_v5 — calibrate severity by example; these illustrate the boundary, follow the same pattern on the code under review):

Example A — parameterized query, no explicit validation layer → WARN, NOT a BLOCKER:
  app.post('/items', (req, res) => { const { label } = req.body; db.run('INSERT INTO items (label) VALUES (?)', [label], cb); });
  There is no input-validation layer on \`label\`, but the query is parameterized (\`?\` placeholder + bound array), so no injection is possible. Correct finding: severity WARN, vulnerability "missing input validation", mitigation "consider validating \`label\` (type/length)". This is precautionary hardening — nothing here is unsafe-to-ship — so it is NOT a BLOCKER.

Example B — untrusted input concatenated into the SQL string → BLOCKER (SQL injection):
  app.get('/search', (req, res) => { db.all("SELECT * FROM items WHERE label = '" + req.query.q + "'", cb); });
  \`req.query.q\` is concatenated directly into the query string. Correct finding: severity BLOCKER, vulnerability "SQL injection", attack_vector "q=' OR '1'='1 returns every row". This is a concrete, demonstrable exploit — recall is preserved.

Example C — missing required ownership check enables a real bypass → BLOCKER (unless out_of_scope):
  app.delete('/items/:id', (req, res) => { db.run('DELETE FROM items WHERE id = ?', [req.params.id], cb); });
  If the spec REQUIRES per-owner access control and there is none, any authenticated user can delete another user's row — a concrete authorization bypass → BLOCKER. BUT if the spec marks authorization/authentication out_of_scope, this is NOT a finding at all (respect out_of_scope).

The boundary these examples teach: a BLOCKER needs a concrete, demonstrable exploit (Examples B and C). A precautionary "should validate / should harden" observation with no demonstrable exploit (Example A) is a WARN at most — never a BLOCKER on its own.`;

const V5_HEADER =
`## security_auditor_v5 (2026-06-16)

> Supersedes security_auditor_v4 (PHASE-35 STEP G — mechanism change: few-shot, not more rules; see
> DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md). Built from the security_auditor_v3
> BASE (the best measured rule-based version, STEP E 4/8) — v4's sharper-rule wording is discarded
> (v4 REGRESSED to 2/8 and revived a SQLi false-positive). Same OUTPUT schema, threat rubric, and
> severity ladder. First 500 characters byte-identical to security_auditor_v3 / v2 (protects the
> S96-S99 mock scenarios); all new content after the prefix, before "Threat level rubric:". v5 keeps
> v3's rule text and ADDS a short few-shot block of generic/synthetic worked examples (items/label/
> search — NOT the DF fixtures) that teach the severity boundary by example, because models calibrate
> severity more reliably from concrete examples than from abstract rules. Recall/precision preserved
> (Example B/C: real injection/bypass = BLOCKER; Example A: parameterized code = WARN at most).`;

// ── Build body from v3 (NOT v4) ───────────────────────────────────────────────
const v3 = loadPrompt("security_auditor_v3");
const ANCHOR = "\n\nThreat level rubric:\n";
if (v3.indexOf(ANCHOR) === -1) throw new Error("security_auditor_v3 anchor 'Threat level rubric:' not found");

const v5 = v3.replace(ANCHOR, "\n\n" + V5_SECTION + ANCHOR);

// ── STABLE-PREFIX assertion (hard gate) ───────────────────────────────────────
const prefixOk = v5.slice(0, 500) === v3.slice(0, 500);
if (!prefixOk) throw new Error("STABLE-PREFIX VIOLATION: security_auditor_v5 first-500 != security_auditor_v3");
if (v5 === v3) throw new Error("security_auditor_v5 identical to v3 — insertion did not happen");

// Honesty guard: the few-shot examples must NOT copy the DF fixture identifiers.
for (const banned of ["todoController", "todos", "completed", "createTodo", "updateTodo", "deleteTodo"]) {
  if (V5_SECTION.indexOf(banned) !== -1) throw new Error("HONESTY VIOLATION: few-shot references DF-fixture token '" + banned + "'");
}

// ── Splice into the doc (after the v4 block, before test_designer_v1) ──────────
let raw = fs.readFileSync(DOC, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

const block = V5_HEADER + "\n\n```\n" + v5 + "\n```\n\n---\n\n";
const MARKER = "## test_designer_v1 (";

if (raw.indexOf("## security_auditor_v5 (") !== -1) throw new Error("security_auditor_v5 block already present — refusing to duplicate");
if (raw.indexOf(MARKER) === -1) throw new Error("insert marker '" + MARKER + "' not found");

const ins = (eol === "\r\n" ? block.replace(/\n/g, "\r\n") : block);
raw = raw.replace(MARKER, ins + MARKER);
fs.writeFileSync(DOC, raw, "utf8");

// ── Re-verify through the loader ──────────────────────────────────────────────
resetPromptCache();
const v5b = loadPrompt("security_auditor_v5");
const roundtrip = v5b === v5 && v5b.slice(0, 500) === loadPrompt("security_auditor_v3").slice(0, 500);

console.log("══ STEP G — prompt build (few-shot) ══");
console.log("  security_auditor_v5 : len " + v3.length + " (v3 base) → " + v5b.length + " (+" + (v5b.length - v3.length) + ")  first500==v3: " + prefixOk + "  roundtrip: " + roundtrip);
console.log("  built from v3 (NOT v4); honesty guard passed (no DF-fixture tokens in few-shot)");
if (!roundtrip) { console.error("⛔ roundtrip mismatch"); process.exit(1); }
console.log("  doc written  : docs/10_runtime/18b_ROLE_PROMPTS.md");
process.exit(0);

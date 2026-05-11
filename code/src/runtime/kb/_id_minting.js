"use strict";

// Deterministic ID generators for all KB record types.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §3–§6 (ID patterns)
// All IDs use sha256, truncated to 12 hex chars, with a type prefix.

const crypto = require("crypto");

function _sha256hex(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

// ── src_<sha256-prefix-12> ────────────────────────────────────────────────────

function srcId(urlOrContent) {
  if (!urlOrContent) throw new Error("srcId requires a non-empty url or content string");
  return "src_" + _sha256hex(urlOrContent).slice(0, 12);
}

// ── chk_<src_id_short(8)>_<ordinal> ──────────────────────────────────────────
// src_id is already "src_<12hex>" — we take the 12-hex part (skip "src_")
// to get the 8-char short form used in chk IDs.

function chkId(srcIdFull, ordinal) {
  if (typeof srcIdFull !== "string") throw new Error("chkId: srcIdFull must be a string");
  if (typeof ordinal !== "number" || ordinal < 0 || !Number.isInteger(ordinal))
    throw new Error("chkId: ordinal must be a non-negative integer");
  // src_aabbccddeeff → take first 8 chars of the hex part
  const hexPart = srcIdFull.replace(/^src_/, "").slice(0, 8);
  return "chk_" + hexPart + "_" + ordinal;
}

// ── cit_<sha256-prefix-12> ────────────────────────────────────────────────────
// Deterministic from: claim_text + sorted chunk_ids joined

function citId(claimText, chunkIds) {
  if (typeof claimText !== "string") throw new Error("citId: claimText required");
  const sorted  = (chunkIds || []).slice().sort().join("|");
  const payload = claimText + "\x00" + sorted;
  return "cit_" + _sha256hex(payload).slice(0, 12);
}

// ── find_<sha256-prefix-12> ───────────────────────────────────────────────────
// Deterministic from: claim + certainty

function findId(claim, certainty) {
  if (typeof claim !== "string") throw new Error("findId: claim required");
  if (typeof certainty !== "string") throw new Error("findId: certainty required");
  const payload = claim + "\x00" + certainty;
  return "find_" + _sha256hex(payload).slice(0, 12);
}

module.exports = { srcId, chkId, citId, findId };

"use strict";

// S210 helper — uid_pin_match service-account equivalence unit tests.
// Tests isIdentityMatch() in isolation via dependency injection (_platform, _hostname).
// Per §ARC convention, test helpers may use require() directly.

const { isIdentityMatch } = require("../../runtime/doctor/checks/uid_pin_match");

async function runS210UidPinServiceAccountEquivalence() {
  // ── Case 1: exact username match (all platforms) ──────────────────────────
  const r1 = isIdentityMatch(
    { username: "alice" },
    { username: "alice" }
  );
  const case1_exact_match_passes = r1.match === true && r1.reason === "exact";

  // ── Case 2: service-account equivalence — same machine (win32) ────────────
  // KHALEDSAYED$ (Local System) vs Khaled.Sayed (interactive), same hostname
  const r2 = isIdentityMatch(
    { username: "KHALEDSAYED$" },
    { username: "Khaled.Sayed" },
    { _platform: "win32", _hostname: "KHALEDSAYED" }
  );
  const case2_service_account_same_machine_passes =
    r2.match === true && r2.reason === "service_account_equivalence";

  // ── Case 3: service-account — DIFFERENT machine → reject ─────────────────
  // Same usernames, but hostname doesn't match the pinned computer account
  const r3 = isIdentityMatch(
    { username: "KHALEDSAYED$" },
    { username: "Khaled.Sayed" },
    { _platform: "win32", _hostname: "DIFFERENT-PC" }
  );
  const case3_service_account_diff_machine_rejects =
    r3.match === false && r3.reason === "mismatch";

  // ── Case 4: different humans → reject ────────────────────────────────────
  const r4 = isIdentityMatch(
    { username: "alice" },
    { username: "bob" },
    { _platform: "win32", _hostname: "MYMACHINE" }
  );
  const case4_different_humans_rejects =
    r4.match === false && r4.reason === "mismatch";

  // ── Case 5: non-Windows platform — service-account logic skipped ──────────
  // On Linux, COMPUTERNAME$ pattern is irrelevant; must return mismatch
  const r5 = isIdentityMatch(
    { username: "KHALEDSAYED$" },
    { username: "Khaled.Sayed" },
    { _platform: "linux", _hostname: "KHALEDSAYED" }
  );
  const case5_linux_skips_service_account =
    r5.match === false && r5.reason === "mismatch";

  return {
    case1_exact_match_passes,
    case2_service_account_same_machine_passes,
    case3_service_account_diff_machine_rejects,
    case4_different_humans_rejects,
    case5_linux_skips_service_account
  };
}

module.exports = { runS210UidPinServiceAccountEquivalence };

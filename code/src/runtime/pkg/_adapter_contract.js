"use strict";

// ── AdapterResult builders ────────────────────────────────────────────────────

function _buildResult(id, action, status, data) {
  return Object.assign(
    { adapter_id: id, action, status, executed_at: new Date().toISOString() },
    data || {}
  );
}

function adapterOk(id, action, data) {
  return _buildResult(id, action, "SUCCESS", data);
}

function adapterFailed(id, action, reason, data) {
  return _buildResult(id, action, "FAILED", Object.assign({ reason: reason || "FAILED" }, data || {}));
}

function adapterSkipped(id, action, reason) {
  return _buildResult(id, action, "SKIPPED", { reason: reason || "SKIPPED" });
}

// ── Tier validation ───────────────────────────────────────────────────────────

function assertTier1(adapter) {
  if (!adapter || adapter.tier !== 1) {
    throw new Error("Adapter '" + (adapter && adapter.id) + "' is not Tier 1");
  }
}

function assertTier2(adapter) {
  if (!adapter || adapter.tier !== 2) {
    throw new Error("Adapter '" + (adapter && adapter.id) + "' is not Tier 2");
  }
}

// ── Privilege guard (Tier-3 invariant) ────────────────────────────────────────
// Checks that an adapter's command templates do not contain privilege-escalation
// tokens. Call during registry load — rejects the adapter if violated.

const PRIV_ESC_TOKENS = ["sudo", "runas", "pkexec", "doas"];

function checkPrivilegeInvariant(adapter) {
  const cmdFields = ["_install_cmd", "_remove_cmd", "_audit_cmd"];
  for (const field of cmdFields) {
    const val = adapter[field];
    if (typeof val === "string") {
      const lower = val.toLowerCase();
      for (const token of PRIV_ESC_TOKENS) {
        if (lower.includes(token)) {
          return { ok: false, reason: "adapter '" + adapter.id + "' contains privilege-escalation token '" + token + "' in " + field };
        }
      }
    }
  }
  return { ok: true };
}

/**
 * Adapter audit() contract.
 *
 * Every adapter's audit(ctx) method MUST follow this pattern:
 *
 *   async audit(ctx) {
 *     // TEST-mode mock gate (AC #17 — only active in TEST mode)
 *     if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
 *       return adapterOk(this.id, "audit", {
 *         audit_result: ctx._mock_audit_result,
 *         _mock_used:   true
 *       });
 *     }
 *     // Production path: run real audit binary
 *     ...
 *   }
 *
 * The gate MUST check FORGE_PERMISSION_MODE === "TEST" first.
 * In any other mode, _mock_audit_result is silently ignored.
 * This prevents mock data from suppressing real security findings in production.
 */

module.exports = {
  adapterOk,
  adapterFailed,
  adapterSkipped,
  assertTier1,
  assertTier2,
  checkPrivilegeInvariant,
  PRIV_ESC_TOKENS
};

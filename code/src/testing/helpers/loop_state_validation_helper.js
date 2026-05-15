"use strict";

const { appendAuditRow } = require("../../runtime/orchestration/loop_state");

async function runS157Check() {
  const validBase = {
    ts:              new Date().toISOString(),
    loop_id:         "test-s157-loop",
    from_state:      "QUALITY_JUDGE",
    to_state:        "BUILDER",
    transition_type: "LOOP_BACK",
    mock:            true,
    cost_usd:        0
  };

  const rowWithExtraField = Object.assign({}, validBase, { bogus_field: "x" });

  var rejected_with_unexpected_field          = false;
  var rejection_message_contains_contract_ref = false;

  try {
    await appendAuditRow("test_s157", "test-s157-loop", rowWithExtraField, { mock: true });
  } catch (err) {
    const msg = err.message || "";
    rejected_with_unexpected_field          = msg.includes("unexpected field");
    rejection_message_contains_contract_ref = msg.includes("§12.2");
  }

  return {
    rejected_with_unexpected_field,
    rejection_message_contains_contract_ref
  };
}

module.exports = { runS157Check };

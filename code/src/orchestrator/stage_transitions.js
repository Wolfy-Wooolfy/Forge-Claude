const ALLOWED_STAGES = ["INIT", "READY", "A", "B", "C", "D"];

const ALLOWED_FORWARD = new Set([
  "INIT->READY",
  "READY->A",
  "A->B",
  "B->C",
  "C->D"
]);

const ALLOWED_RETURN = new Set([
  "B->A",
  "C->B",
  "D->C"
]);

function validateStageLabel(stage) {
  if (!ALLOWED_STAGES.includes(stage)) {
    throw new Error("Invalid stage label");
  }
}

function validateTransition(fromStage, toStage) {
  validateStageLabel(fromStage);
  validateStageLabel(toStage);

  if (fromStage === toStage) {
    throw new Error("No-op transition forbidden");
  }

  const key = `${fromStage}->${toStage}`;

  if (ALLOWED_FORWARD.has(key)) {
    return;
  }

  if (ALLOWED_RETURN.has(key)) {
    return;
  }

  throw new Error("Forbidden stage transition");
}

module.exports = {
  ALLOWED_STAGES,
  validateStageLabel,
  validateTransition
};

const pipeline = [
  {
    module_id: "INTAKE",
    task_name: "TASK-047: MODULE FLOW — Intake",
    ordinal_position: 1,
    required_previous_module: null,
    terminal_flag: false
  },
  {
    module_id: "AUDIT",
    task_name: "TASK-048: MODULE FLOW — Audit",
    ordinal_position: 2,
    required_previous_module: "INTAKE",
    terminal_flag: false
  },
  {
    module_id: "TRACE",
    task_name: "TASK-050: MODULE FLOW — Trace",
    ordinal_position: 3,
    required_previous_module: "AUDIT",
    terminal_flag: false
  },
  {
    module_id: "GAP",
    task_name: "TASK-051: MODULE FLOW — Gap",
    ordinal_position: 4,
    required_previous_module: "TRACE",
    terminal_flag: false
  },
  {
    module_id: "DESIGN_EXPLORATION",
    task_name: "TASK-066: MODULE FLOW — Design Exploration",
    ordinal_position: 5,
    required_previous_module: "GAP",
    terminal_flag: false
  },
  {
    module_id: "DECISION_GATE",
    task_name: "TASK-052: MODULE FLOW — Decision Gate",
    ordinal_position: 6,
    required_previous_module: "DESIGN_EXPLORATION",
    terminal_flag: false
  },
  {
    module_id: "BACKFILL",
    task_name: "TASK-053: MODULE FLOW — Backfill",
    ordinal_position: 7,
    required_previous_module: "DECISION_GATE",
    terminal_flag: false
  },
  {
    module_id: "EXECUTE",
    task_name: "TASK-054: MODULE FLOW — Execute",
    ordinal_position: 8,
    required_previous_module: "BACKFILL",
    terminal_flag: false
  },
  {
    module_id: "VERIFY",
    task_name: "TASK-061: MODULE FLOW — Verify",
    ordinal_position: 9,
    required_previous_module: "EXECUTE",
    terminal_flag: false
  },
  {
    module_id: "CLOSURE",
    task_name: "TASK-055: MODULE FLOW — Closure",
    ordinal_position: 10,
    required_previous_module: "VERIFY",
    terminal_flag: false
  },
  {
    module_id: "VISION_COMPLIANCE",
    task_name: "TASK-067: ENFORCE FULL VISION RUNTIME",
    ordinal_position: 11,
    required_previous_module: "CLOSURE",
    terminal_flag: false
  },
  {
    module_id: "AI_SYSTEM_ALIGNMENT",
    task_name: "TASK-068: FULL SYSTEM ALIGNMENT WITH AI OS AND AI LAYER CONTRACTS",
    ordinal_position: 12,
    required_previous_module: "VISION_COMPLIANCE",
    terminal_flag: true
  }
];

function getPipeline() {
  return pipeline;
}

function getModuleByTask(taskName) {
  return pipeline.find((m) => m.task_name === taskName) || null;
}

function getModuleById(moduleId) {
  return pipeline.find((m) => m.module_id === moduleId) || null;
}

function getNextModule(currentModuleId) {
  const index = pipeline.findIndex((m) => m.module_id === currentModuleId);
  if (index === -1) {
    return null;
  }
  return pipeline[index + 1] || null;
}

module.exports = {
  getPipeline,
  getModuleByTask,
  getModuleById,
  getNextModule
};
const fs = require("fs");
const path = require("path");

const { executeCognitive } = require("../cognitive/cognitive_adapter");

function readJson(absPath) {
  const txt = fs.readFileSync(absPath, "utf-8");
  return JSON.parse(txt);
}

function safeMkdir(dirAbs) {
  fs.mkdirSync(dirAbs, { recursive: true });
}

function readText(absPath) {
  return fs.readFileSync(absPath, "utf-8");
}

function listFilesRecursive(rootAbs) {
  const out = [];
  const stack = [rootAbs];
  while (stack.length) {
    const cur = stack.pop();
    if (!fs.existsSync(cur)) continue;
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      const items = fs.readdirSync(cur);
      for (let i = items.length - 1; i >= 0; i--) {
        stack.push(path.join(cur, items[i]));
      }
      continue;
    }
    out.push(cur);
  }
  out.sort();
  return out;
}

function stripMarkdownDecorators(s) {
  return String(s || "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDocId(docText, absPath) {
  const lines = String(docText || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripMarkdownDecorators(rawLine);
    const m = line.match(/^Document ID\s*:\s*([A-Za-z0-9][A-Za-z0-9._-]*)$/i);
    if (m && m[1]) return String(m[1]).trim();
  }

  const stem = path.basename(String(absPath || "")).replace(/\.md$/i, "").trim();
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stem)) {
    return stem;
  }

  throw new Error(`TRACE_ENGINE_CONTRACT_VIOLATION: unable to derive deterministic document id for ${String(absPath || "")}`);
}

function normalizeTitle(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isExecutionBoundDoc(docText) {
  const lines = String(docText || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripMarkdownDecorators(rawLine);
    if (/^Status\s*:\s*EXECUTION-BOUND$/i.test(line)) return true;
  }

  return false;
}

function buildRequirementsFromDocFiles(docFilesAbs, rootAbs) {
  const requirements = [];
  const docEntries = [];

  for (const abs of docFilesAbs) {
    const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
    const text = fs.readFileSync(abs, "utf-8");
    const baseDocId = extractDocId(text, abs);
    const fileStem = path.basename(abs, path.extname(abs)).trim();

    docEntries.push({
      abs,
      rel,
      text,
      baseDocId,
      fileStem
    });
  }

  const docIdCounts = new Map();
  for (const entry of docEntries) {
    const key = String(entry.baseDocId || "");
    docIdCounts.set(key, (docIdCounts.get(key) || 0) + 1);
  }

  for (const entry of docEntries) {
    const lines = entry.text.split(/\r?\n/);

    const docId =
      (docIdCounts.get(entry.baseDocId) || 0) > 1
        ? `${entry.baseDocId}__${entry.fileStem}`
        : entry.baseDocId;

    const headings = [];
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || "");
      if (line.startsWith("# ")) headings.push({ level: 1, title: normalizeTitle(line.slice(2)), line: i + 1 });
      else if (line.startsWith("## ")) headings.push({ level: 2, title: normalizeTitle(line.slice(3)), line: i + 1 });
    }

    let localIdx = 0;

    if (headings.length === 0) {
      localIdx += 1;
      requirements.push({
        requirement_id: `${docId}::R${String(localIdx).padStart(3, "0")}`,
        source_document: entry.rel,
        section_path: "",
        normalized_title: path.basename(entry.abs)
      });
      continue;
    }

    let currentH1 = "";
    for (const h of headings) {
      if (h.level === 1) currentH1 = h.title || "";
      localIdx += 1;
      const sectionPath = h.level === 1 ? currentH1 : `${currentH1} > ${h.title}`;

      requirements.push({
        requirement_id: `${docId}::R${String(localIdx).padStart(3, "0")}`,
        source_document: entry.rel,
        section_path: sectionPath,
        normalized_title: h.title || ""
      });
    }
  }

  requirements.sort((a, b) => {
    if (a.source_document < b.source_document) return -1;
    if (a.source_document > b.source_document) return 1;
    if (a.requirement_id < b.requirement_id) return -1;
    if (a.requirement_id > b.requirement_id) return 1;
    return 0;
  });

  return requirements;
}

function extractExportedSymbols(jsText) {
  const symbols = new Set();

  const reExportsDot = /exports\.([A-Za-z0-9_]+)\s*=/g;
  let m;
  while ((m = reExportsDot.exec(jsText)) !== null) {
    if (m[1]) symbols.add(m[1]);
  }

  const reModuleExportsObj = /module\.exports\s*=\s*\{([\s\S]*?)\}/g;
  const objMatch = reModuleExportsObj.exec(jsText);
  if (objMatch && objMatch[1]) {
    const body = objMatch[1];
    const reKey = /([A-Za-z0-9_]+)\s*:/g;
    let k;
    while ((k = reKey.exec(body)) !== null) {
      if (k[1]) symbols.add(k[1]);
    }
  }

  return Array.from(symbols).sort();
}

function buildCodeUnitsFromSrc(codeSrcAbs, rootAbs) {
  const jsFiles = listFilesRecursive(codeSrcAbs).filter((p) => p.toLowerCase().endsWith(".js"));
  const units = [];
  for (const abs of jsFiles) {
    const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
    const text = fs.readFileSync(abs, "utf-8");
    const syms = extractExportedSymbols(text);

    if (syms.length === 0) {
      units.push({
        unit_id: `CODE::${rel}::FILE`,
        file_path: rel,
        exported_symbol: "FILE",
        detected_role: "FILE"
      });
      continue;
    }

    for (const s of syms) {
      units.push({
        unit_id: `CODE::${rel}::${s}`,
        file_path: rel,
        exported_symbol: s,
        detected_role: "EXPORT"
      });
    }
  }
  units.sort((a, b) => (a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0));
  return units;
}

function findDuplicateValues(values) {
  const seen = new Set();
  const dup = new Set();

  for (const value of values) {
    const key = String(value || "");
    if (seen.has(key)) dup.add(key);
    else seen.add(key);
  }

  return Array.from(dup).sort();
}

function buildRequirementsFromAllDocs(rootAbs) {
  const docsRootAbs = path.resolve(rootAbs, "docs");
  if (!fs.existsSync(docsRootAbs)) {
    return [];
  }

  const allMdFiles = listFilesRecursive(docsRootAbs).filter((p) => p.toLowerCase().endsWith(".md"));
  const traceableDocs = [];

  for (const abs of allMdFiles) {
    const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
    const text = fs.readFileSync(abs, "utf-8");

    if (rel.startsWith("docs/03_pipeline/")) {
      traceableDocs.push(abs);
      continue;
    }

    if (isExecutionBoundDoc(text)) {
      traceableDocs.push(abs);
    }
  }

  traceableDocs.sort();
  return buildRequirementsFromDocFiles(traceableDocs, rootAbs);
}

function shouldTraceArtifact(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/");

  if (!p.startsWith("artifacts/")) return false;

  if (p === "artifacts/intake/entrypoint_classification.md") return false;

  if (p.startsWith("artifacts/tasks/")) return false;
  if (p.startsWith("artifacts/stage_A/")) return false;
  if (p.startsWith("artifacts/stage_B/")) return false;
  if (p.startsWith("artifacts/stage_C/")) return false;
  if (p.startsWith("artifacts/stage_D/")) return false;
  if (p.startsWith("artifacts/reports/")) return false;

  if (p.startsWith("artifacts/release/") && /^artifacts\/release\/RELEASE_\d+\.\d+\.\d+\..+\.md$/i.test(p)) return false;

  const allowedPrefixes = [
    "artifacts/intake/",
    "artifacts/audit/",
    "artifacts/trace/",
    "artifacts/cognitive/",
    "artifacts/gap/",
    "artifacts/decisions/",
    "artifacts/backfill/",
    "artifacts/execute/",
    "artifacts/verify/",
    "artifacts/closure/",
    "artifacts/release/"
  ];

  return allowedPrefixes.some((prefix) => p.startsWith(prefix));
}

function buildArtifactsIndex(artifactsAbs, rootAbs) {
  const files = listFilesRecursive(artifactsAbs).filter((p) => {
    const rel = path.relative(rootAbs, p).replace(/\\/g, "/");
    const low = rel.toLowerCase();

    if (!(low.endsWith(".md") || low.endsWith(".json"))) {
      return false;
    }

    return shouldTraceArtifact(rel);
  });

  const rels = files.map((abs) => path.relative(rootAbs, abs).replace(/\\/g, "/")).sort();
  return rels;
}

function mapDeterministically(requirements, codeUnits, artifacts, intakeContext) {
  const codeByKey = new Map();
  for (const u of codeUnits) {
    codeByKey.set(u.unit_id, u);
  }

  const artifactsSet = new Set(artifacts);

  const operatingMode =
    intakeContext && typeof intakeContext.operating_mode === "string"
      ? String(intakeContext.operating_mode).trim()
      : "";

  const mappings = requirements.map((r) => {
    const title = String(r.normalized_title || "").toLowerCase();
    const section = String(r.section_path || "").toLowerCase();
    const document = String(r.source_document || "").toLowerCase();

    const mapped_code_units = [];
    const mapped_artifacts = [];

    function addCodeByFileIncludes(fileIncludes) {
      for (const u of codeUnits) {
        if (fileIncludes.some((part) => u.file_path.includes(part))) {
          mapped_code_units.push(u.unit_id);
        }
      }
    }

    function addArtifactsIfPresent(paths) {
      for (const artifactPath of paths) {
        if (artifactsSet.has(artifactPath)) {
          mapped_artifacts.push(artifactPath);
        }
      }
    }

    function ensureCoverageBundle(fileIncludes, artifactPaths) {
      if (mapped_code_units.length === 0) {
        addCodeByFileIncludes(fileIncludes);
      }

      if (mapped_artifacts.length === 0) {
        addArtifactsIfPresent(artifactPaths);
      }
    }

    if (title.includes("intake") || section.includes("intake") || document.includes("intake")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/intakeEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/intake/intake_snapshot.json")) mapped_artifacts.push("artifacts/intake/intake_snapshot.json");
      if (artifactsSet.has("artifacts/intake/intake_context.json")) mapped_artifacts.push("artifacts/intake/intake_context.json");
      if (artifactsSet.has("artifacts/intake/intake_report.md")) mapped_artifacts.push("artifacts/intake/intake_report.md");
      if (artifactsSet.has("artifacts/intake/repository_inventory.json")) mapped_artifacts.push("artifacts/intake/repository_inventory.json");
    }

    if (title.includes("audit") || section.includes("audit") || document.includes("audit")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/auditEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/audit/audit_report.md")) mapped_artifacts.push("artifacts/audit/audit_report.md");
      if (artifactsSet.has("artifacts/audit/audit_findings.json")) mapped_artifacts.push("artifacts/audit/audit_findings.json");
      if (artifactsSet.has("artifacts/audit/audit_error.md")) mapped_artifacts.push("artifacts/audit/audit_error.md");
    }

    if (title.includes("trace") || section.includes("trace") || document.includes("trace")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/traceEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/trace/trace_matrix.json")) mapped_artifacts.push("artifacts/trace/trace_matrix.json");
      if (artifactsSet.has("artifacts/trace/trace_matrix.md")) mapped_artifacts.push("artifacts/trace/trace_matrix.md");
      if (artifactsSet.has("artifacts/trace/trace_error.md")) mapped_artifacts.push("artifacts/trace/trace_error.md");
    }

    if (title.includes("gap") || section.includes("gap") || document.includes("gap")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/gapEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/gap/gap_actions.json")) mapped_artifacts.push("artifacts/gap/gap_actions.json");
      if (artifactsSet.has("artifacts/gap/gap_report.md")) mapped_artifacts.push("artifacts/gap/gap_report.md");
      if (artifactsSet.has("artifacts/gap/gap_error.md")) mapped_artifacts.push("artifacts/gap/gap_error.md");
    }

    if (
      title.includes("design exploration") ||
      section.includes("design exploration") ||
      document.includes("design exploration") ||
      title.includes("exploration") ||
      section.includes("exploration") ||
      document.includes("exploration")
    ) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/designExplorationEngine.js")) mapped_code_units.push(u.unit_id);
      }
    }

    if (title.includes("decision") || section.includes("decision") || document.includes("decision")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/decisionGate.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/decisions/module_flow_decision_gate.json")) mapped_artifacts.push("artifacts/decisions/module_flow_decision_gate.json");
      if (artifactsSet.has("artifacts/decisions/module_flow_decision_gate.md")) mapped_artifacts.push("artifacts/decisions/module_flow_decision_gate.md");
    }

    if (title.includes("backfill") || section.includes("backfill") || document.includes("backfill")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/backfillEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/backfill/backfill_tasks.json")) mapped_artifacts.push("artifacts/backfill/backfill_tasks.json");
      if (artifactsSet.has("artifacts/backfill/backfill_report.md")) mapped_artifacts.push("artifacts/backfill/backfill_report.md");
      if (artifactsSet.has("artifacts/backfill/backfill_plan.json")) mapped_artifacts.push("artifacts/backfill/backfill_plan.json");
      if (artifactsSet.has("artifacts/backfill/backfill_execution_log.md")) mapped_artifacts.push("artifacts/backfill/backfill_execution_log.md");
      if (artifactsSet.has("artifacts/backfill/backfill_created_files.json")) mapped_artifacts.push("artifacts/backfill/backfill_created_files.json");
    }

    if (title.includes("execute") || section.includes("execute") || document.includes("execute")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/executeEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/execute/execute_plan.json")) mapped_artifacts.push("artifacts/execute/execute_plan.json");
      if (artifactsSet.has("artifacts/execute/execute_report.md")) mapped_artifacts.push("artifacts/execute/execute_report.md");
      if (artifactsSet.has("artifacts/execute/execute_diff.md")) mapped_artifacts.push("artifacts/execute/execute_diff.md");
      if (artifactsSet.has("artifacts/execute/execute_log.md")) mapped_artifacts.push("artifacts/execute/execute_log.md");
    }

    if (
      title.includes("verify") ||
      section.includes("verify") ||
      document.includes("verify") ||
      title.includes("verification") ||
      section.includes("verification") ||
      document.includes("verification") ||
      title.includes("acceptance") ||
      section.includes("acceptance") ||
      document.includes("acceptance") ||
      title.includes("release gate") ||
      section.includes("release gate") ||
      document.includes("release gate")
    ) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/verifyEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/verify/verification_results.json")) mapped_artifacts.push("artifacts/verify/verification_results.json");
      if (artifactsSet.has("artifacts/verify/verification_report.md")) mapped_artifacts.push("artifacts/verify/verification_report.md");
    }

    if (title.includes("closure") || section.includes("closure") || document.includes("closure")) {
      for (const u of codeUnits) {
        if (u.file_path.includes("modules/closureEngine.js")) mapped_code_units.push(u.unit_id);
      }
      if (artifactsSet.has("artifacts/closure/closure_report.md")) mapped_artifacts.push("artifacts/closure/closure_report.md");
      if (artifactsSet.has("artifacts/release/RELEASE_MANIFEST_v1.json")) mapped_artifacts.push("artifacts/release/RELEASE_MANIFEST_v1.json");
      if (artifactsSet.has("artifacts/release/repository_hash_snapshot.json")) mapped_artifacts.push("artifacts/release/repository_hash_snapshot.json");
    }

    if (
      title.includes("orchestration") ||
      section.includes("orchestration") ||
      document.includes("orchestration") ||
      title.includes("orchestrator") ||
      section.includes("orchestrator") ||
      document.includes("orchestrator") ||
      title.includes("pipeline") ||
      section.includes("pipeline") ||
      document.includes("pipeline") ||
      title.includes("module ordering") ||
      section.includes("module ordering") ||
      document.includes("module ordering") ||
      title.includes("pipeline definition") ||
      section.includes("pipeline definition") ||
      document.includes("pipeline definition") ||
      title.includes("runner") ||
      section.includes("runner") ||
      document.includes("runner") ||
      title.includes("stage transition") ||
      section.includes("stage transition") ||
      document.includes("stage transition") ||
      title.includes("status writer") ||
      section.includes("status writer") ||
      document.includes("status writer") ||
      title.includes("task registry") ||
      section.includes("task registry") ||
      document.includes("task registry") ||
      title.includes("task executor") ||
      section.includes("task executor") ||
      document.includes("task executor") ||
      title.includes("entry resolver") ||
      section.includes("entry resolver") ||
      document.includes("entry resolver") ||
      title.includes("autonomous runner") ||
      section.includes("autonomous runner") ||
      document.includes("autonomous runner") ||
      title.includes("forge state") ||
      section.includes("forge state") ||
      document.includes("forge_state") ||
      title.includes("build state") ||
      section.includes("build state") ||
      document.includes("build_state")
    ) {
      for (const u of codeUnits) {
        if (u.file_path.includes("code/src/orchestrator/runner.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/orchestrator/autonomous_runner.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/orchestrator/entry_resolver.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/modules/verifyEngine.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/orchestrator/pipeline_definition.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/orchestrator/stage_transitions.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/orchestrator/status_writer.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/execution/task_registry.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/execution/task_executor.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/forge/forge_state_resolver.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/forge/forge_state_writer.js")) mapped_code_units.push(u.unit_id);
      }
    }

    if (
      title.includes("cognitive") ||
      section.includes("cognitive") ||
      document.includes("cognitive") ||
      title.includes("adapter") ||
      section.includes("adapter") ||
      document.includes("adapter") ||
      title.includes("provider-agnostic") ||
      section.includes("provider-agnostic") ||
      document.includes("provider-agnostic") ||
      title.includes("driver") ||
      section.includes("driver") ||
      document.includes("driver") ||
      title.includes("routing") ||
      section.includes("routing") ||
      document.includes("routing") ||
      title.includes("selection") ||
      section.includes("selection") ||
      document.includes("selection") ||
      title.includes("config") ||
      section.includes("config") ||
      document.includes("config")
    ) {
      for (const u of codeUnits) {
        if (u.file_path.includes("code/src/cognitive/cognitive_adapter.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/cognitive/cognitive_config_resolver.js")) mapped_code_units.push(u.unit_id);
        if (u.file_path.includes("code/src/cognitive/drivers/openai_driver.js")) mapped_code_units.push(u.unit_id);
      }
    }

    if (
      title.includes("cognitive") ||
      section.includes("cognitive") ||
      document.includes("cognitive") ||
      title.includes("adapter") ||
      section.includes("adapter") ||
      document.includes("adapter") ||
      title.includes("provider-agnostic") ||
      section.includes("provider-agnostic") ||
      document.includes("provider-agnostic")
    ) {
      for (const a of artifacts) {
        if (typeof a === "string" && a.includes("artifacts/cognitive/")) {
          mapped_artifacts.push(a);
        }
      }
    }

    if (operatingMode === "BUILD" && (title.includes("build") || section.includes("build") || document.includes("build"))) {
      if (artifactsSet.has("artifacts/intake/intake_context.json")) mapped_artifacts.push("artifacts/intake/intake_context.json");
    }

    if (operatingMode === "IMPROVE" && (title.includes("improve") || section.includes("improve") || document.includes("improve"))) {
      if (artifactsSet.has("artifacts/intake/intake_context.json")) mapped_artifacts.push("artifacts/intake/intake_context.json");
      if (artifactsSet.has("artifacts/audit/audit_report.md")) mapped_artifacts.push("artifacts/audit/audit_report.md");
    }

    if (document.startsWith("docs/00_index/")) {
      ensureCoverageBundle(
        [
          "modules/traceEngine.js",
          "orchestrator/pipeline_definition.js",
          "forge/forge_state_resolver.js"
        ],
        [
          "artifacts/trace/trace_matrix.json",
          "artifacts/trace/trace_matrix.md",
          "artifacts/intake/intake_context.json"
        ]
      );
    }

    if (document.startsWith("docs/01_system/")) {
      ensureCoverageBundle(
        [
          "orchestrator/pipeline_definition.js",
          "orchestrator/entry_resolver.js",
          "orchestrator/autonomous_runner.js",
          "execution/task_executor.js",
          "forge/forge_state_resolver.js"
        ],
        [
          "artifacts/intake/intake_context.json",
          "artifacts/trace/trace_matrix.json",
          "artifacts/decisions/module_flow_decision_gate.json"
        ]
      );
    }

    if (document.startsWith("docs/02_scope/")) {
      ensureCoverageBundle(
        [
          "modules/gapEngine.js",
          "modules/decisionGate.js",
          "modules/designExplorationEngine.js"
        ],
        [
          "artifacts/gap/gap_actions.json",
          "artifacts/gap/gap_report.md",
          "artifacts/decisions/module_flow_decision_gate.json"
        ]
      );
    }

    if (document.startsWith("docs/03_pipeline/")) {
      ensureCoverageBundle(
        [
          "orchestrator/pipeline_definition.js",
          "execution/task_registry.js",
          "execution/task_executor.js",
          "orchestrator/runner.js",
          "orchestrator/entry_resolver.js",
          "orchestrator/autonomous_runner.js",
          "forge/forge_state_resolver.js"
        ],
        [
          "artifacts/trace/trace_matrix.json",
          "artifacts/gap/gap_actions.json",
          "artifacts/decisions/module_flow_decision_gate.json",
          "artifacts/backfill/backfill_plan.json",
          "artifacts/execute/execute_plan.json",
          "artifacts/verify/verification_results.json"
        ]
      );
    }

    if (document.startsWith("docs/04_autonomy/")) {
      ensureCoverageBundle(
        [
          "orchestrator/autonomous_runner.js",
          "orchestrator/entry_resolver.js",
          "orchestrator/runner.js",
          "forge/forge_state_resolver.js"
        ],
        [
          "artifacts/intake/intake_context.json",
          "artifacts/decisions/module_flow_decision_gate.json",
          "artifacts/verify/verification_results.json"
        ]
      );
    }

    if (document.startsWith("docs/05_artifacts/")) {
      ensureCoverageBundle(
        [
          "modules/traceEngine.js",
          "modules/closureEngine.js",
          "modules/verifyEngine.js"
        ],
        [
          "artifacts/trace/trace_matrix.json",
          "artifacts/verify/verification_results.json",
          "artifacts/release/RELEASE_MANIFEST_v1.json"
        ]
      );
    }

    if (document.startsWith("docs/06_progress/")) {
      ensureCoverageBundle(
        [
          "forge/forge_state_writer.js",
          "forge/forge_state_resolver.js",
          "orchestrator/status_writer.js",
          "orchestrator/stage_transitions.js",
          "modules/verifyEngine.js"
        ],
        [
          "progress/status.json",
          "artifacts/forge/forge_state.json",
          "artifacts/verify/verification_results.json"
        ]
      );
    }

    if (document.startsWith("docs/07_decisions/")) {
      ensureCoverageBundle(
        [
          "modules/decisionGate.js",
          "orchestrator/entry_resolver.js",
          "execution/task_executor.js"
        ],
        [
          "artifacts/decisions/module_flow_decision_gate.json",
          "artifacts/decisions/module_flow_decision_gate.md"
        ]
      );
    }

    if (document.startsWith("docs/08_audit/")) {
      ensureCoverageBundle(
        [
          "modules/auditEngine.js"
        ],
        [
          "artifacts/audit/audit_findings.json",
          "artifacts/audit/audit_report.md"
        ]
      );
    }

    if (document.startsWith("docs/09_verify/")) {
      ensureCoverageBundle(
        [
          "modules/verifyEngine.js",
          "modules/closureEngine.js"
        ],
        [
          "artifacts/verify/verification_results.json",
          "artifacts/verify/verification_report.md",
          "artifacts/release/RELEASE_MANIFEST_v1.json"
        ]
      );
    }

    if (document.startsWith("docs/10_runtime/")) {
      ensureCoverageBundle(
        [
          "orchestrator/autonomous_runner.js",
          "orchestrator/runner.js",
          "modules/executeEngine.js",
          "modules/verifyEngine.js"
        ],
        [
          "artifacts/execute/execute_plan.json",
          "artifacts/execute/execute_log.md",
          "artifacts/verify/verification_results.json"
        ]
      );
    }

    const uniqCode = Array.from(new Set(mapped_code_units)).sort();
    const uniqArt = Array.from(new Set(mapped_artifacts)).sort();

    let coverage_status = "NONE";
    if (uniqCode.length > 0 && uniqArt.length > 0) coverage_status = "FULL";
    else if (uniqCode.length > 0 || uniqArt.length > 0) coverage_status = "PARTIAL";

    return {
      requirement_id: r.requirement_id,
      document: r.source_document,
      mapped_code_units: uniqCode,
      mapped_artifacts: uniqArt,
      coverage_status
    };
  });

  for (const mapping of mappings) {
    const hasCode = Array.isArray(mapping.mapped_code_units) && mapping.mapped_code_units.length > 0;
    const hasArtifacts = Array.isArray(mapping.mapped_artifacts) && mapping.mapped_artifacts.length > 0;

    if (hasCode && !hasArtifacts) {
      for (const a of artifacts) {
        if (typeof a === "string") {
          mapping.mapped_artifacts.push(a);
        }
      }
      mapping.mapped_artifacts = Array.from(new Set(mapping.mapped_artifacts)).sort();
      mapping.coverage_status = mapping.mapped_artifacts.length > 0 ? "FULL" : "PARTIAL";
    }
  }

  const usedCode = new Set();
  const usedArtifacts = new Set();
  const coveredReq = new Set();

  for (const m of mappings) {
    if (m.coverage_status !== "NONE") coveredReq.add(m.requirement_id);
    for (const u of m.mapped_code_units) usedCode.add(u);
    for (const a of m.mapped_artifacts) usedArtifacts.add(a);
  }

  const orphan_code_units = codeUnits.map((u) => u.unit_id).filter((id) => !usedCode.has(id)).sort();
  const orphan_artifacts = artifacts.filter((a) => !usedArtifacts.has(a)).sort();
  const orphan_requirements = requirements.map((r) => r.requirement_id).filter((id) => !coveredReq.has(id)).sort();

  return { mappings, orphan_code_units, orphan_requirements, orphan_artifacts };
}

function writeTraceOutputs(rootAbs, traceJson) {
  const traceDir = path.resolve(rootAbs, "artifacts", "trace");
  safeMkdir(traceDir);

  const jsonAbs = path.resolve(traceDir, "trace_matrix.json");
  fs.writeFileSync(jsonAbs, JSON.stringify(traceJson, null, 2), "utf-8");

  const mdAbs = path.resolve(traceDir, "trace_matrix.md");
  const md = [
    "# Trace Matrix",
    "",
    "~~~json",
    JSON.stringify(traceJson, null, 2),
    "~~~",
    ""
  ].join("\n");
  fs.writeFileSync(mdAbs, md, "utf-8");

  return {
    json: "artifacts/trace/trace_matrix.json",
    md: "artifacts/trace/trace_matrix.md"
  };
}

function writeTraceError(rootAbs, msg) {
  const traceDir = path.resolve(rootAbs, "artifacts", "trace");
  safeMkdir(traceDir);

  const errAbs = path.resolve(traceDir, "trace_error.md");
  const md = [
    "# Trace Error",
    "",
    String(msg || "").trim(),
    ""
  ].join("\n");
  fs.writeFileSync(errAbs, md, "utf-8");

  return "artifacts/trace/trace_error.md";
}

async function runCognitiveTraceAnalysis(context) {
  const requestTimestamp = new Date().toISOString();

  const request = {
    request_id: `TRACE-${Date.now()}`,
    timestamp: requestTimestamp,
    task_context: {
      task_id: "TASK-050",
      module: "TRACE"
    },
    input: {
      type: "structured",
      content: context
    },
    constraints: {
      deterministic: true,
      max_tokens: 1000,
      temperature: 0
    }
  };

  const normalizedResponse = await executeCognitive(request, () => {
    return {
      note: "Cognitive trace placeholder",
      coverage_hint: []
    };
  });

  const responseId =
    normalizedResponse &&
    typeof normalizedResponse === "object" &&
    typeof normalizedResponse.response_id === "string" &&
    normalizedResponse.response_id.trim() !== ""
      ? normalizedResponse.response_id
      : null;

  const rawArtifactPath = responseId
    ? `artifacts/cognitive/${responseId}/raw_response.json`
    : null;

  const normalizedArtifactPath = responseId
    ? `artifacts/cognitive/${responseId}/normalized_response.json`
    : null;

  return {
    request_timestamp: requestTimestamp,
    response_id: responseId,
    artifact_paths: {
      raw_response: rawArtifactPath,
      normalized_response: normalizedArtifactPath
    },
    normalized_response: normalizedResponse
  };
}

async function runTrace(contextOrStatus) {
  const rootAbs = path.resolve(__dirname, "../../..");

  const artifactsIntakeAbs = path.resolve(rootAbs, "artifacts", "intake", "intake_snapshot.json");
  const artifactsIntakeContextAbs = path.resolve(rootAbs, "artifacts", "intake", "intake_context.json");
  const artifactsAuditAbs = path.resolve(rootAbs, "artifacts", "audit", "audit_findings.json");

  if (!fs.existsSync(artifactsIntakeAbs)) {
    const errRef = writeTraceError(rootAbs, "BLOCKED: missing required artifact artifacts/intake/intake_snapshot.json");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: missing intake_snapshot.json"],
      next_step: ""
      }
    };
  }

  if (!fs.existsSync(artifactsIntakeContextAbs)) {
    const errRef = writeTraceError(rootAbs, "BLOCKED: missing required artifact artifacts/intake/intake_context.json");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: missing intake_context.json"],
        next_step: ""
      }
    };
  }

  if (!fs.existsSync(artifactsAuditAbs)) {
    const errRef = writeTraceError(rootAbs, "BLOCKED: missing required artifact artifacts/audit/audit_findings.json");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: missing audit_findings.json"],
      next_step: ""
      }
    };
  }

  const intake = readJson(artifactsIntakeAbs);
  const intakeContext = readJson(artifactsIntakeContextAbs);
  const audit = readJson(artifactsAuditAbs);

  const locked = !!(intake && intake.locked_snapshot_flag);
  const auditBlocked = !!(audit && audit.blocked);
  const validOperatingMode =
    !!(intakeContext &&
      (intakeContext.operating_mode === "BUILD" || intakeContext.operating_mode === "IMPROVE") &&
      intakeContext.blocked === false);

  if (!locked) {
    const errRef = writeTraceError(rootAbs, "BLOCKED: intake_snapshot.locked_snapshot_flag != true");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: intake snapshot not locked"],
      next_step: ""
      }
    };
  }

  if (auditBlocked) {
    const errRef = writeTraceError(rootAbs, "BLOCKED: audit_findings.blocked == true");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: audit blocked == true"],
      next_step: ""
      }
    };
  }

  if (!validOperatingMode) {
    const errRef = writeTraceError(rootAbs, "BLOCKED: intake_context operating_mode invalid or intake still blocked");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: intake_context invalid or blocked"],
        next_step: ""
      }
    };
  }

  const requirements = buildRequirementsFromAllDocs(rootAbs);
  const codeUnits = buildCodeUnitsFromSrc(path.resolve(rootAbs, "code", "src"), rootAbs);
  const artifacts = buildArtifactsIndex(path.resolve(rootAbs, "artifacts"), rootAbs);

  const duplicateRequirementIds = findDuplicateValues(requirements.map((r) => r.requirement_id));
  if (duplicateRequirementIds.length > 0) {
    const errRef = writeTraceError(rootAbs, `BLOCKED: duplicate requirement_id detected: ${duplicateRequirementIds.join(", ")}`);
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: duplicate requirement_id detected"],
        next_step: ""
      }
    };
  }

  const duplicateUnitIds = findDuplicateValues(codeUnits.map((u) => u.unit_id));
  if (duplicateUnitIds.length > 0) {
    const errRef = writeTraceError(rootAbs, `BLOCKED: duplicate unit_id detected: ${duplicateUnitIds.join(", ")}`);
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Trace BLOCKED: duplicate unit_id detected"],
        next_step: ""
      }
    };
  }

  const mapped = mapDeterministically(requirements, codeUnits, artifacts, intakeContext);

  const cognitiveResult = await runCognitiveTraceAnalysis({
    requirements_count: requirements.length,
    code_units_count: codeUnits.length,
    artifacts_count: artifacts.length
  });

  const normalizedCognitiveResponse =
    cognitiveResult &&
    typeof cognitiveResult === "object" &&
    cognitiveResult.normalized_response &&
    typeof cognitiveResult.normalized_response === "object"
      ? cognitiveResult.normalized_response
      : null;

  const cognitiveResponseId =
    cognitiveResult &&
    typeof cognitiveResult.response_id === "string" &&
    cognitiveResult.response_id.trim() !== ""
      ? cognitiveResult.response_id
      : null;

  const rawArtifactRel =
    cognitiveResult &&
    cognitiveResult.artifact_paths &&
    typeof cognitiveResult.artifact_paths.raw_response === "string"
      ? cognitiveResult.artifact_paths.raw_response
      : null;

  const normalizedArtifactRel =
    cognitiveResult &&
    cognitiveResult.artifact_paths &&
    typeof cognitiveResult.artifact_paths.normalized_response === "string"
      ? cognitiveResult.artifact_paths.normalized_response
      : null;

  const cognitiveArtifactsStored =
    !!(
      rawArtifactRel &&
      normalizedArtifactRel &&
      fs.existsSync(path.resolve(rootAbs, rawArtifactRel)) &&
      fs.existsSync(path.resolve(rootAbs, normalizedArtifactRel))
    );

  const cognitiveTrace = {
    exists: !!normalizedCognitiveResponse,
    bound: !!(normalizedCognitiveResponse && cognitiveArtifactsStored),
    binding_type: "TRACE_COGNITIVE",
    source: "cognitive_adapter",
    request_timestamp:
      cognitiveResult && cognitiveResult.request_timestamp
        ? cognitiveResult.request_timestamp
        : null,
    response_id: cognitiveResponseId,
    storage_status: cognitiveArtifactsStored ? "PERSISTED" : "MISSING_ARTIFACTS",
    artifact_paths: {
      raw_response: rawArtifactRel,
      normalized_response: normalizedArtifactRel
    },
    response_status:
      normalizedCognitiveResponse && typeof normalizedCognitiveResponse.status === "string"
        ? normalizedCognitiveResponse.status
        : "UNAVAILABLE",
    provider_metadata:
      normalizedCognitiveResponse &&
      normalizedCognitiveResponse.provider_metadata &&
      typeof normalizedCognitiveResponse.provider_metadata === "object"
        ? normalizedCognitiveResponse.provider_metadata
        : {
            provider: "NONE",
            model: "NONE",
            latency_ms: 0
          },
    output:
      normalizedCognitiveResponse &&
      normalizedCognitiveResponse.output &&
      typeof normalizedCognitiveResponse.output === "object"
        ? normalizedCognitiveResponse.output
        : {
            type: "structured",
            content: {}
          },
    usage:
      normalizedCognitiveResponse &&
      normalizedCognitiveResponse.usage &&
      typeof normalizedCognitiveResponse.usage === "object"
        ? normalizedCognitiveResponse.usage
        : {
            prompt_tokens: 0,
            completion_tokens: 0
          }
  };

  const traceJson = {
    execution_id: `TRACE-${
  contextOrStatus &&
  typeof contextOrStatus.run_id === "string" &&
  contextOrStatus.run_id.trim() !== ""
    ? contextOrStatus.run_id
    : new Date().toISOString()
}`,
    cognitive_binding: {
      bound: cognitiveTrace.bound,
      type: "TRACE_COGNITIVE",
      response_id: cognitiveResponseId
    },
    operating_mode: intakeContext.operating_mode,
    repository_state: intakeContext.repository_state,
    total_requirements: requirements.length,
    total_code_units: codeUnits.length,
    total_artifacts: artifacts.length,
    mappings: mapped.mappings,
    orphan_code_units: mapped.orphan_code_units,
    orphan_requirements: mapped.orphan_requirements,
    orphan_artifacts: mapped.orphan_artifacts,
    cognitive_trace: cognitiveTrace
  };

  const outRefs = writeTraceOutputs(rootAbs, traceJson);

  return {
    blocked: false,
    artifact: outRefs.md,
    outputs: outRefs,
    status_patch: {}
  };
}

module.exports = {
  runTrace
};
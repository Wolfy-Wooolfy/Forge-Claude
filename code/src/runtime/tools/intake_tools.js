"use strict";

// Intake L2 tools — source ingestion and analysis for existing project intake.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §2-§3 (Intake Flow, SourceTreeAnalysis)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §7 (Language Support Matrix)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §8 (Vendored Binaries Policy)

const path = require("path");
const { defineTool, ok, failed, previewed } = require("./_contract");

// ── WASM lazy-init ────────────────────────────────────────────────────────────
// Separate module-level cached Promises per grammar (OQ-6/OQ-7 pattern).
// Parser.init() is idempotent — safe to call from multiple loaders.

let _pyLangPromise = null;
let _jsLangPromise = null;
let _tsLangPromise = null;

function _getPythonLanguage() {
  if (!_pyLangPromise) {
    _pyLangPromise = (async () => {
      const { Parser, Language } = require("web-tree-sitter");
      await Parser.init();
      return Language.load(path.resolve(
        __dirname, "../../../../artifacts/vendor/tree-sitter-grammars/python.wasm"
      ));
    })();
  }
  return _pyLangPromise;
}

function _getJavaScriptLanguage() {
  if (!_jsLangPromise) {
    _jsLangPromise = (async () => {
      const { Parser, Language } = require("web-tree-sitter");
      await Parser.init();
      return Language.load(path.resolve(
        __dirname, "../../../../artifacts/vendor/tree-sitter-grammars/javascript.wasm"
      ));
    })();
  }
  return _jsLangPromise;
}

function _getTypeScriptLanguage() {
  if (!_tsLangPromise) {
    _tsLangPromise = (async () => {
      const { Parser, Language } = require("web-tree-sitter");
      await Parser.init();
      return Language.load(path.resolve(
        __dirname, "../../../../artifacts/vendor/tree-sitter-grammars/typescript.wasm"
      ));
    })();
  }
  return _tsLangPromise;
}

// ── Language detection ────────────────────────────────────────────────────────

const EXT_MAP = {
  ".py":  "python",
  ".js":  "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts":  "typescript",
  ".tsx": "typescript"
};

const SUPPORTED_LANGUAGES = new Set(["python", "javascript", "typescript"]);

const ALWAYS_IGNORE     = new Set([".git", "node_modules", "__pycache__", ".DS_Store"]);
const ALWAYS_IGNORE_EXT = new Set([".pyc", ".pyo", ".pyd"]);

const MANIFEST_NAMES = new Set([
  "pyproject.toml", "requirements.txt", "setup.py",
  "package.json", "tsconfig.json",
  "next.config.js", "next.config.mjs", "next.config.ts",
  "README.md", "readme.md"
]);

const PY_ENTRY_BASES = new Set(["__main__.py", "main.py", "app.py", "cli.py", "manage.py"]);
const JS_ENTRY_BASES = new Set([
  "index.js", "index.ts", "index.mjs",
  "main.js", "main.ts",
  "server.js", "server.ts",
  "app.js", "app.ts"
]);

const MAX_AST_FILES   = 20;
const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_BYTES   = 50 * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _reg() { return require("./_registry").getDefaultRegistry(); }
function _root(ctx) { return (ctx && ctx.root) || process.cwd(); }

async function _walkDir(dirPath, baseDir, ignorer, ctx, root) {
  const relDirPath = path.relative(root || _root(ctx), dirPath);
  const result = await _reg().invoke("fs.list_dir", { path: relDirPath }, ctx || {});
  if (!result || result.status !== "SUCCESS") return [];

  const files = [];
  for (const entry of result.output.entries) {
    const name = entry.name;
    if (ALWAYS_IGNORE.has(name)) continue;

    const fullPath = path.join(dirPath, name);
    const relPath  = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.type === "dir" || entry.type === "directory") {
      const sub = await _walkDir(fullPath, baseDir, ignorer, ctx, root || _root(ctx));
      files.push(...sub);
    } else {
      if (ALWAYS_IGNORE_EXT.has(path.extname(name).toLowerCase())) continue;
      if (ignorer && ignorer.ignores(relPath)) continue;
      files.push({ fullPath, relPath, name });
    }
  }
  return files;
}

// ── Manifest parsers ──────────────────────────────────────────────────────────

function _parsePyproject(content) {
  const result = {};
  let inProject = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "[project]") { inProject = true; continue; }
    if (inProject && line.startsWith("[") && line !== "[project]") { inProject = false; continue; }
    if (!inProject) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (["name", "version", "description", "requires-python"].includes(key)) result[key] = val;
  }
  return result;
}

function _parsePackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    const result = {};
    if (pkg.name)        result.name        = pkg.name;
    if (pkg.version)     result.version     = pkg.version;
    if (pkg.description) result.description = pkg.description;
    if (pkg.type)        result.type        = pkg.type;
    if (pkg.scripts)     result.scripts     = Object.keys(pkg.scripts);
    const deps    = pkg.dependencies    ? Object.keys(pkg.dependencies)    : [];
    const devDeps = pkg.devDependencies ? Object.keys(pkg.devDependencies) : [];
    if (deps.length)    result.dependencies    = deps;
    if (devDeps.length) result.devDependencies = devDeps;
    return result;
  } catch (_) { return null; }
}

function _parseTsconfig(content) {
  try {
    const cleaned = content
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const cfg = JSON.parse(cleaned);
    const co = cfg.compilerOptions || {};
    const result = {};
    if (co.target)               result.target = co.target;
    if (co.module)               result.module = co.module;
    if (co.jsx)                  result.jsx    = co.jsx;
    if (co.strict !== undefined) result.strict = co.strict;
    return result;
  } catch (_) { return null; }
}

// ── Symbol extractors ─────────────────────────────────────────────────────────

function _extractPySymbols(rootNode) {
  const classes = [], functions = [], imports = [];
  for (const child of rootNode.children) {
    switch (child.type) {
      case "class_definition":
        classes.push(child.childForFieldName("name").text); break;
      case "function_definition":
        functions.push(child.childForFieldName("name").text); break;
      case "decorated_definition": {
        const inner = child.children.find(c =>
          c.type === "function_definition" || c.type === "class_definition"
        );
        if (inner) {
          const nm = inner.childForFieldName("name");
          if (nm) {
            if (inner.type === "function_definition") functions.push(nm.text);
            else classes.push(nm.text);
          }
        }
        break;
      }
      case "import_statement":
      case "import_from_statement":
        imports.push(child.text.split("\n")[0].trim()); break;
    }
  }
  return { classes, functions, imports };
}

function _extractJsSymbols(rootNode) {
  const classes = [], functions = [], imports = [];
  for (const child of rootNode.children) {
    switch (child.type) {
      case "class_declaration": {
        const nm = child.childForFieldName("name");
        if (nm) classes.push(nm.text); break;
      }
      case "function_declaration": {
        const nm = child.childForFieldName("name");
        if (nm) functions.push(nm.text); break;
      }
      case "export_statement": {
        for (let i = 0; i < child.childCount; i++) {
          const inner = child.child(i);
          if (inner.type === "function_declaration" || inner.type === "generator_function_declaration") {
            const nm = inner.childForFieldName("name");
            if (nm) functions.push(nm.text);
          } else if (inner.type === "class_declaration") {
            const nm = inner.childForFieldName("name");
            if (nm) classes.push(nm.text);
          }
        }
        break;
      }
      case "import_statement":
        imports.push(child.text.split("\n")[0].trim()); break;
    }
  }
  return { classes, functions, imports };
}

function _extractTsSymbols(rootNode) {
  const classes = [], functions = [], imports = [], types = [];
  for (const child of rootNode.children) {
    switch (child.type) {
      case "class_declaration": {
        const nm = child.childForFieldName("name");
        if (nm) classes.push(nm.text); break;
      }
      case "function_declaration": {
        const nm = child.childForFieldName("name");
        if (nm) functions.push(nm.text); break;
      }
      case "interface_declaration": {
        const nm = child.childForFieldName("name");
        if (nm) types.push("interface " + nm.text); break;
      }
      case "type_alias_declaration": {
        const nm = child.childForFieldName("name");
        if (nm) types.push("type " + nm.text); break;
      }
      case "export_statement": {
        for (let i = 0; i < child.childCount; i++) {
          const inner = child.child(i);
          if (inner.type === "function_declaration" || inner.type === "generator_function_declaration") {
            const nm = inner.childForFieldName("name");
            if (nm) functions.push(nm.text);
          } else if (inner.type === "class_declaration") {
            const nm = inner.childForFieldName("name");
            if (nm) classes.push(nm.text);
          } else if (inner.type === "interface_declaration") {
            const nm = inner.childForFieldName("name");
            if (nm) types.push("interface " + nm.text);
          } else if (inner.type === "type_alias_declaration") {
            const nm = inner.childForFieldName("name");
            if (nm) types.push("type " + nm.text);
          }
        }
        break;
      }
      case "import_statement":
        imports.push(child.text.split("\n")[0].trim()); break;
    }
  }
  return { classes, functions, imports, types };
}

// ── Framework detection (JS/TS) ───────────────────────────────────────────────

function _detectJsFramework(manifests, allFiles) {
  const pkg = manifests.package_json;
  const allDeps = [];
  if (pkg) {
    allDeps.push(...(pkg.dependencies || []), ...(pkg.devDependencies || []));
  }

  if (allDeps.includes("next") || manifests.next_config) return "next";

  const hasAppRouter = allFiles.some(f =>
    /^(?:src\/)?app\/page\.(tsx?|jsx?)$/.test(f.relPath)
  );
  const hasPagesDir = allFiles.some(f =>
    /^(?:src\/)?pages\//.test(f.relPath)
  );
  if (hasAppRouter || hasPagesDir) return "next";

  if (allDeps.includes("react") || allDeps.includes("react-dom")) return "react";

  return null;
}

// ── 1. project.intake_zip ─────────────────────────────────────────────────────

const intake_zip = defineTool({
  name:          "project.intake_zip",
  description:   "Extract a ZIP archive or copy a local directory into the project source tree at artifacts/projects/<project_id>/source/.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    required: ["project_id"],
    properties: {
      project_id:     { type: "string", minLength: 1 },
      zip_path:       { type: "string" },
      directory_path: { type: "string" }
    }
  },
  output_schema: {
    type: "object",
    required: ["extracted_path", "file_count"],
    properties: {
      extracted_path:     { type: "string" },
      file_count:         { type: "number" },
      total_bytes:        { type: "number" },
      languages_detected: { type: "array", items: { type: "string" } }
    }
  },

  preview(input) {
    const source = input.zip_path
      ? "zip: " + input.zip_path
      : input.directory_path
        ? "directory: " + input.directory_path
        : "(no source specified)";
    const root = process.cwd();
    const target = path.join(root, "artifacts", "projects", input.project_id || "?", "source");
    return Promise.resolve(previewed(null, {
      would_extract: true,
      project_id:    input.project_id,
      source,
      target_dir:    target,
      source_type:   input.zip_path ? "zip" : "directory"
    }));
  },

  async execute(input, ctx) {
    if (input.zip_path && input.directory_path) {
      return failed("AMBIGUOUS_INPUT", "provide zip_path OR directory_path, not both");
    }
    if (!input.zip_path && !input.directory_path) {
      return failed("MISSING_SOURCE_INPUT", "provide zip_path or directory_path");
    }

    const root         = _root(ctx);
    const targetDir    = path.join(root, "artifacts", "projects", input.project_id, "source");
    const relTargetDir = path.relative(root, targetDir).replace(/\\/g, "/");
    const reg          = _reg();

    const existsRes = await reg.invoke("fs.exists", { path: relTargetDir }, ctx || {});
    if (existsRes && existsRes.status === "SUCCESS" && existsRes.output.exists) {
      const listRes = await reg.invoke("fs.list_dir", { path: relTargetDir }, ctx || {});
      if (listRes && listRes.status === "SUCCESS" && listRes.output.entries.length > 0) {
        return failed("TARGET_NOT_EMPTY",
          "target directory already contains files: " + relTargetDir +
          " — delete it first if you want to re-ingest");
      }
    }

    let fileCount  = 0;
    let totalBytes = 0;
    const langSet  = new Set();

    if (input.zip_path) {
      const AdmZip = require("adm-zip");
      let zip;
      try { zip = new AdmZip(input.zip_path); } catch (e) {
        return failed("ZIP_EXTRACT_FAILED", "cannot open zip: " + e.message);
      }

      const entries = zip.getEntries();
      if (entries.length > MAX_ZIP_ENTRIES) {
        return failed("ZIP_TOO_LARGE", "zip has " + entries.length + " entries (cap: " + MAX_ZIP_ENTRIES + ")");
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.replace(/\\/g, "/");
        if (entryName.includes("../") || entryName.startsWith("/")) {
          return failed("ZIP_PATH_TRAVERSAL", "unsafe entry path: " + entryName);
        }

        const data = entry.getData();
        totalBytes += data.length;
        if (totalBytes > MAX_ZIP_BYTES) {
          return failed("ZIP_TOO_LARGE", "unpacked size exceeds 50 MB cap");
        }

        const absDestPath = path.join(targetDir, entryName);
        const relDestPath = path.relative(root, absDestPath).replace(/\\/g, "/");
        const writeRes = await reg.invoke("fs.write_file",
          { path: relDestPath, content: data.toString("utf8") }, ctx || {});
        if (!writeRes || writeRes.status !== "SUCCESS") {
          return failed("ZIP_EXTRACT_FAILED", "could not write " + entryName);
        }
        fileCount++;
        const ext = path.extname(entryName).toLowerCase();
        if (EXT_MAP[ext]) langSet.add(EXT_MAP[ext]);
      }

    } else {
      const srcDir    = path.resolve(root, input.directory_path);
      const relSrcDir = path.relative(root, srcDir).replace(/\\/g, "/");
      const srcExists = await reg.invoke("fs.exists", { path: relSrcDir }, ctx || {});
      if (!srcExists || srcExists.status !== "SUCCESS" || !srcExists.output.exists) {
        return failed("SOURCE_DIR_NOT_FOUND", "directory not found: " + input.directory_path);
      }

      const files = await _walkDir(srcDir, srcDir, null, ctx, root);
      if (files.length > MAX_ZIP_ENTRIES) {
        return failed("ZIP_TOO_LARGE", "directory has " + files.length + " files (cap: " + MAX_ZIP_ENTRIES + ")");
      }

      for (const { fullPath, relPath } of files) {
        const relFullPath = path.relative(root, fullPath).replace(/\\/g, "/");
        const readRes = await reg.invoke("fs.read_file", { path: relFullPath }, ctx || {});
        if (!readRes || readRes.status !== "SUCCESS") continue;

        const content = readRes.output.content;
        totalBytes += readRes.output.size || 0;
        if (totalBytes > MAX_ZIP_BYTES) {
          return failed("ZIP_TOO_LARGE", "total size exceeds 50 MB cap");
        }

        const absDestPath = path.join(targetDir, relPath);
        const relDestPath = path.relative(root, absDestPath).replace(/\\/g, "/");
        const writeRes = await reg.invoke("fs.write_file",
          { path: relDestPath, content }, ctx || {});
        if (!writeRes || writeRes.status !== "SUCCESS") {
          return failed("ZIP_EXTRACT_FAILED", "could not write " + relPath);
        }
        fileCount++;
        const ext = path.extname(relPath).toLowerCase();
        if (EXT_MAP[ext]) langSet.add(EXT_MAP[ext]);
      }
    }

    return ok({
      extracted_path:     relTargetDir,
      file_count:         fileCount,
      total_bytes:        totalBytes,
      languages_detected: Array.from(langSet)
    });
  }
});

// ── 2. project.analyze_source ─────────────────────────────────────────────────

const analyze_source = defineTool({
  name:          "project.analyze_source",
  description:   "Analyze the source tree at artifacts/projects/<project_id>/source/ and return a SourceTreeAnalysis with detected languages, framework, entry points, manifest files, and AST samples.",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    required: ["project_id"],
    properties: {
      project_id:  { type: "string", minLength: 1 },
      source_dir:  { type: "string" }
    }
  },
  output_schema: {
    type: "object",
    required: ["project_id", "analyzed_at", "detected_languages", "file_count"],
    properties: {
      project_id:             { type: "string" },
      analyzed_at:            { type: "string" },
      root_path:              { type: "string" },
      detected_languages:     { type: "array", items: { type: "string" } },
      detected_framework:     { type: ["string", "null"] },
      file_count:             { type: "number" },
      total_size_bytes:       { type: "number" },
      entry_points:           { type: "array", items: { type: "string" } },
      manifest_files:         { type: "object" },
      top_level_directories:  { type: "array", items: { type: "string" } },
      ast_samples:            { type: "array" },
      ignored_paths:          { type: "array", items: { type: "string" } }
    }
  },

  async execute(input, ctx) {
    const root      = _root(ctx);
    const sourceDir = input.source_dir
      ? path.resolve(root, input.source_dir)
      : path.join(root, "artifacts", "projects", input.project_id, "source");
    const relSourceDir = path.relative(root, sourceDir).replace(/\\/g, "/");

    const reg = _reg();

    // 1. Existence check
    const existsRes = await reg.invoke("fs.exists", { path: relSourceDir }, ctx || {});
    if (!existsRes || existsRes.status !== "SUCCESS" || !existsRes.output.exists) {
      return failed("SOURCE_DIR_NOT_FOUND", "source directory not found: " + relSourceDir);
    }

    // 2. Load .gitignore if present
    let ignorer = null;
    const relGitignorePath = relSourceDir + "/.gitignore";
    const giExists = await reg.invoke("fs.exists", { path: relGitignorePath }, ctx || {});
    if (giExists && giExists.status === "SUCCESS" && giExists.output.exists) {
      const giRes = await reg.invoke("fs.read_file", { path: relGitignorePath }, ctx || {});
      if (giRes && giRes.status === "SUCCESS") {
        const ignore = require("ignore");
        ignorer = ignore().add(giRes.output.content);
      }
    }

    // 3. Walk source tree
    const allFiles = await _walkDir(sourceDir, sourceDir, ignorer, ctx, root);
    if (allFiles.length === 0) {
      return failed("EMPTY_PROJECT", "no source files found after applying ignore rules");
    }

    // 4. Categorize files, parse manifests, detect entry points
    const langCount   = {};
    const manifests   = {};
    const entryPoints = [];
    let totalSizeBytes = 0;

    for (const { fullPath, relPath, name } of allFiles) {
      const ext  = path.extname(name).toLowerCase();
      const lang = EXT_MAP[ext];
      if (lang) langCount[lang] = (langCount[lang] || 0) + 1;

      if (MANIFEST_NAMES.has(name)) {
        const relManifestPath = path.relative(root, fullPath).replace(/\\/g, "/");
        const readRes = await reg.invoke("fs.read_file", { path: relManifestPath }, ctx || {});
        if (readRes && readRes.status === "SUCCESS") {
          const content = readRes.output.content;
          totalSizeBytes += readRes.output.size || content.length;

          if (name === "pyproject.toml") {
            manifests.pyproject_toml = _parsePyproject(content);
          } else if (name === "requirements.txt") {
            manifests.requirements_txt = content.split("\n")
              .map(l => l.trim()).filter(l => l && !l.startsWith("#"));
          } else if (name === "setup.py") {
            manifests.setup_py = "present_but_unparsed";
          } else if (name === "package.json") {
            manifests.package_json = _parsePackageJson(content);
          } else if (name === "tsconfig.json") {
            manifests.tsconfig = _parseTsconfig(content);
          } else if (name === "next.config.js" || name === "next.config.mjs" || name === "next.config.ts") {
            manifests.next_config = { file: name, excerpt: content.slice(0, 500) };
          } else if (name === "README.md" || name === "readme.md") {
            manifests.readme_excerpt = content.slice(0, 500);
          }
        }
      }

      // Python entry points
      if (PY_ENTRY_BASES.has(name)) entryPoints.push(relPath);
      // JS/TS top-level entry points
      if (JS_ENTRY_BASES.has(name) && !relPath.includes("/")) entryPoints.push(relPath);
      // Next.js App Router home and legacy pages
      if (/^(?:src\/)?app\/page\.(tsx?|jsx?)$/.test(relPath) ||
          /^(?:src\/)?pages\/index\.(tsx?|jsx?)$/.test(relPath)) {
        entryPoints.push(relPath);
      }
    }

    // 5. Language support check (SUPPORTED_LANGUAGES gate)
    const detectedLanguages = Object.keys(langCount).sort();
    if (detectedLanguages.length === 0) {
      return failed("UNSUPPORTED_LANGUAGE",
        "no supported language files found; detected extensions: " +
        [...new Set(allFiles.map(f => path.extname(f.name) || "(none)"))].join(", "),
        { detected_extensions: [...new Set(allFiles.map(f => path.extname(f.name) || "(none)"))] }
      );
    }

    // 6. Top-level directories
    const topDirRes = await reg.invoke("fs.list_dir", { path: relSourceDir }, ctx || {});
    const topDirs = (topDirRes && topDirRes.status === "SUCCESS")
      ? topDirRes.output.entries.filter(e => e.type === "dir" || e.type === "directory").map(e => e.name)
      : [];

    // 7. Framework detection (JS/TS only)
    const detectedFramework = (detectedLanguages.includes("javascript") || detectedLanguages.includes("typescript"))
      ? _detectJsFramework(manifests, allFiles)
      : null;

    // 8. AST samples — multi-language dispatch
    const langInstances = {};
    for (const lang of detectedLanguages) {
      if (!SUPPORTED_LANGUAGES.has(lang)) continue;
      try {
        if (lang === "python")     langInstances.python     = await _getPythonLanguage();
        if (lang === "javascript") langInstances.javascript = await _getJavaScriptLanguage();
        if (lang === "typescript") langInstances.typescript = await _getTypeScriptLanguage();
      } catch (e) {
        return failed("WASM_NOT_FOUND", "failed to load " + lang + " grammar: " + e.message);
      }
    }

    const { Parser } = require("web-tree-sitter");
    const parsers = {};
    for (const [lang, langInst] of Object.entries(langInstances)) {
      const p = new Parser();
      p.setLanguage(langInst);
      parsers[lang] = p;
    }

    const sampleFiles = allFiles
      .filter(f => SUPPORTED_LANGUAGES.has(EXT_MAP[path.extname(f.name).toLowerCase()]))
      .slice(0, MAX_AST_FILES);

    const astSamples = [];

    for (const { fullPath, relPath: fp } of sampleFiles) {
      const ext    = path.extname(fp).toLowerCase();
      const lang   = EXT_MAP[ext];
      const parser = parsers[lang];
      if (!parser) continue;

      const relFullPath = path.relative(root, fullPath).replace(/\\/g, "/");
      const readRes = await reg.invoke("fs.read_file", { path: relFullPath }, ctx || {});
      if (!readRes || readRes.status !== "SUCCESS") continue;

      const content = readRes.output.content;
      totalSizeBytes += readRes.output.size || content.length;

      let symbols = { classes: [], functions: [], imports: [], types: [] };
      try {
        const tree = parser.parse(content);
        if (lang === "python")          symbols = _extractPySymbols(tree.rootNode);
        else if (lang === "javascript") symbols = _extractJsSymbols(tree.rootNode);
        else if (lang === "typescript") symbols = _extractTsSymbols(tree.rootNode);
      } catch (_e) { /* best-effort */ }

      const topSymbols = [];
      if (lang === "python") {
        topSymbols.push(...symbols.classes.map(n => "class " + n));
        topSymbols.push(...symbols.functions.map(n => "def " + n));
      } else if (lang === "javascript") {
        topSymbols.push(...symbols.classes.map(n => "class " + n));
        topSymbols.push(...symbols.functions.map(n => "function " + n));
      } else if (lang === "typescript") {
        topSymbols.push(...symbols.classes.map(n => "class " + n));
        topSymbols.push(...symbols.functions.map(n => "function " + n));
        topSymbols.push(...(symbols.types || []));
      }

      astSamples.push({
        file:              fp,
        language:          lang,
        top_level_symbols: topSymbols,
        loc:               content.split("\n").length
      });
    }

    return ok({
      project_id:            input.project_id,
      analyzed_at:           new Date().toISOString(),
      root_path:             relSourceDir,
      detected_languages:    detectedLanguages,
      detected_framework:    detectedFramework,
      file_count:            allFiles.length,
      total_size_bytes:      totalSizeBytes,
      entry_points:          entryPoints,
      manifest_files:        manifests,
      top_level_directories: topDirs,
      ast_samples:           astSamples,
      ignored_paths:         []
    });
  }
});

module.exports = [intake_zip, analyze_source];

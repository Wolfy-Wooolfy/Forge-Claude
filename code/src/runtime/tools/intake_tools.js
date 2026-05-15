"use strict";

// Intake L2 tools — source ingestion and analysis for existing project intake.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §2 (Intake Flow)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §3 (SourceTreeAnalysis schema)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §8 (Vendored Binaries Policy — SHA256 not enforced here; enforced in reverseVisionProvider)

const path = require("path");
const { defineTool, ok, failed, previewed } = require("./_contract");

// ── WASM lazy-init (OQ-6/OQ-7) ───────────────────────────────────────────────
// Module-level cached Promise for web-tree-sitter Python grammar.
// Parser.init() is idempotent — safe to include in every load path.

let _langPromise = null;

function _getPythonLanguage() {
  if (!_langPromise) {
    _langPromise = (async () => {
      const { Parser, Language } = require("web-tree-sitter");
      await Parser.init();
      const wasmPath = path.resolve(
        __dirname,
        "../../../../artifacts/vendor/tree-sitter-grammars/python.wasm"
      );
      return Language.load(wasmPath);
    })();
  }
  return _langPromise;
}

// ── Language detection by extension ──────────────────────────────────────────

const EXT_MAP = {
  ".py": "python"
};

const ALWAYS_IGNORE = new Set([".git", "node_modules", "__pycache__", ".DS_Store"]);
const ALWAYS_IGNORE_EXT = new Set([".pyc", ".pyo", ".pyd"]);

const MANIFEST_NAMES = new Set(["pyproject.toml", "requirements.txt", "setup.py", "README.md", "readme.md"]);

const MAX_AST_FILES = 20;
const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

function _reg() {
  return require("./_registry").getDefaultRegistry();
}

function _root(ctx) {
  return (ctx && ctx.root) || process.cwd();
}

// Recursive directory walk via fs.list_dir (Track A — relative paths only).
// dirPath/baseDir are absolute (for path.join/path.relative computation only).
// root: workspace root — all registry calls use path.relative(root, absPath).
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

// Simple pyproject.toml [project] section parser (no TOML lib needed).
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
    if (["name", "version", "description", "requires-python"].includes(key)) {
      result[key] = val;
    }
  }
  return result;
}

// Extract top-level symbols from a parsed tree-sitter tree.
function _extractSymbols(rootNode) {
  const classes   = [];
  const functions = [];
  const imports   = [];

  for (const child of rootNode.children) {
    switch (child.type) {
      case "class_definition":
        classes.push(child.childForFieldName("name").text);
        break;
      case "function_definition":
        functions.push(child.childForFieldName("name").text);
        break;
      case "decorated_definition": {
        const inner = child.children.find(c =>
          c.type === "function_definition" || c.type === "class_definition"
        );
        if (inner) {
          const nameNode = inner.childForFieldName("name");
          if (nameNode) {
            if (inner.type === "function_definition") functions.push(nameNode.text);
            else classes.push(nameNode.text);
          }
        }
        break;
      }
      case "import_statement":
      case "import_from_statement":
        imports.push(child.text.split("\n")[0].trim());
        break;
    }
  }
  return { classes, functions, imports };
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

    // Refuse to overwrite non-empty target
    const existsRes = await reg.invoke("fs.exists", { path: relTargetDir }, ctx || {});
    if (existsRes && existsRes.status === "SUCCESS" && existsRes.output.exists) {
      // Check if non-empty by listing
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
      // ── ZIP path ─────────────────────────────────────────────────────────
      const AdmZip = require("adm-zip");
      let zip;
      try {
        zip = new AdmZip(input.zip_path);
      } catch (e) {
        return failed("ZIP_EXTRACT_FAILED", "cannot open zip: " + e.message);
      }

      const entries = zip.getEntries();
      if (entries.length > MAX_ZIP_ENTRIES) {
        return failed("ZIP_TOO_LARGE", "zip has " + entries.length + " entries (cap: " + MAX_ZIP_ENTRIES + ")");
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.replace(/\\/g, "/");

        // Security: reject path traversal
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
      // ── Directory path ───────────────────────────────────────────────────
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
  description:   "Analyze the source tree at artifacts/projects/<project_id>/source/ and return a SourceTreeAnalysis with detected languages, entry points, manifest files, and AST samples.",
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

    // 2. Load .gitignore if present (ignore npm package)
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

    // 4. Categorize files
    const langCount = {};
    const manifests = {};
    const entryPoints = [];
    let totalSizeBytes = 0;

    for (const { fullPath, relPath, name } of allFiles) {
      const ext = path.extname(name).toLowerCase();
      const lang = EXT_MAP[ext];
      if (lang) {
        langCount[lang] = (langCount[lang] || 0) + 1;
      }

      if (MANIFEST_NAMES.has(name)) {
        const relManifestPath = path.relative(root, fullPath).replace(/\\/g, "/");
        const readRes = await reg.invoke("fs.read_file",
          { path: relManifestPath }, ctx || {});
        if (readRes && readRes.status === "SUCCESS") {
          const content = readRes.output.content;
          totalSizeBytes += readRes.output.size || content.length;

          if (name === "pyproject.toml") {
            manifests.pyproject_toml = _parsePyproject(content);
          } else if (name === "requirements.txt") {
            manifests.requirements_txt = content.split("\n")
              .map(l => l.trim()).filter(l => l && !l.startsWith("#"));
          } else if (name === "README.md" || name === "readme.md") {
            manifests.readme_excerpt = content.slice(0, 500);
          } else if (name === "setup.py") {
            manifests.setup_py = "present_but_unparsed";
          }
        }
      }

      // Entry points: __main__.py, main.py, app.py, cli.py, manage.py
      const base = path.basename(relPath);
      if (["__main__.py", "main.py", "app.py", "cli.py", "manage.py"].includes(base)) {
        entryPoints.push(relPath);
      }
    }

    // 5. Language support check (§7 — only Python supported in Stage 11.1)
    const detectedLanguages = Object.keys(langCount).sort();
    if (detectedLanguages.length === 0) {
      return failed("UNSUPPORTED_LANGUAGE",
        "no supported language files found; detected extensions: " +
        [...new Set(allFiles.map(f => path.extname(f.name) || "(none)"))].join(", "),
        { detected_extensions: [...new Set(allFiles.map(f => path.extname(f.name) || "(none)"))] }
      );
    }
    if (!detectedLanguages.includes("python")) {
      return failed("UNSUPPORTED_LANGUAGE",
        "Python not detected; detected: " + detectedLanguages.join(", "),
        { detected: detectedLanguages }
      );
    }

    // 6. Top-level directories
    const topDirRes = await reg.invoke("fs.list_dir", { path: relSourceDir }, ctx || {});
    const topDirs = (topDirRes && topDirRes.status === "SUCCESS")
      ? topDirRes.output.entries.filter(e => e.type === "dir" || e.type === "directory").map(e => e.name)
      : [];

    // 7. AST samples (up to MAX_AST_FILES Python files)
    const pyFiles = allFiles.filter(f => path.extname(f.name).toLowerCase() === ".py");
    const sampleFiles = pyFiles.slice(0, MAX_AST_FILES);
    const astSamples = [];

    let lang;
    try {
      lang = await _getPythonLanguage();
    } catch (e) {
      return failed("WASM_NOT_FOUND", "failed to load python.wasm: " + e.message);
    }

    const { Parser } = require("web-tree-sitter");
    const parser = new Parser();
    parser.setLanguage(lang);

    for (const { fullPath, relPath: fp } of sampleFiles) {
      const relFullPath = path.relative(root, fullPath).replace(/\\/g, "/");
      const readRes = await reg.invoke("fs.read_file", { path: relFullPath }, ctx || {});
      if (!readRes || readRes.status !== "SUCCESS") continue;

      const content = readRes.output.content;
      totalSizeBytes += readRes.output.size || content.length;

      let symbols = { classes: [], functions: [], imports: [] };
      try {
        const tree = parser.parse(content);
        symbols = _extractSymbols(tree.rootNode);
      } catch (_e) {
        // best-effort: if parse fails, return empty symbols
      }

      astSamples.push({
        file:              fp,
        language:          "python",
        top_level_symbols: [
          ...symbols.classes.map(n => "class " + n),
          ...symbols.functions.map(n => "def " + n)
        ],
        loc: content.split("\n").length
      });
    }

    return ok({
      project_id:            input.project_id,
      analyzed_at:           new Date().toISOString(),
      root_path:             relSourceDir,
      detected_languages:    detectedLanguages,
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

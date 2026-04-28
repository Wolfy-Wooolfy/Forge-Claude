const { execFile, exec, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const execAsync = promisify(exec);

class CodexProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "codex";
    this.command = config.command || process.env.FORGE_CODEX_COMMAND || "C:\\Users\\Khaled\\AppData\\Roaming\\npm\\codex.cmd";
    this.args = Array.isArray(config.args) ? config.args : [];
  }

  executeWithStdin(prompt) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, ["exec"], {
        windowsHide: true,
        shell: process.platform === "win32"
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk || "");
      });

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });

      child.on("error", reject);

      child.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(new Error(stderr || stdout || `Codex exited with code ${code}`));
      });

      child.stdin.write(String(prompt || ""));
      child.stdin.end();
    });
  }

  async isAvailable() {
    try {
      if (process.platform === "win32") {
        await execAsync(`"${this.command}" --version`, {
          timeout: 10000,
          windowsHide: true
        });
      } else {
        await execFileAsync(this.command, ["--version"], { timeout: 10000 });
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  buildPrompt(task) {
    const safeTask = task && typeof task === "object" ? task : {};
    const safeRequest = String(safeTask.request || "").trim();
    const targetFiles =
      safeTask.context && Array.isArray(safeTask.context.target_files)
        ? safeTask.context.target_files.join(", ")
        : "";
    const operationType =
      safeTask.context && typeof safeTask.context.operation_type === "string"
        ? safeTask.context.operation_type
        : "";
    const currentFileContext =
      safeTask.context && typeof safeTask.context.current_file_context === "string"
        ? safeTask.context.current_file_context
        : "";
    const fileExists =
      safeTask.context && typeof safeTask.context.file_exists === "boolean"
        ? safeTask.context.file_exists
        : false;
    const expectedType =
      safeTask.expected_output && typeof safeTask.expected_output.type === "string"
        ? safeTask.expected_output.type
        : "";
    const expectedFormat =
      safeTask.expected_output && typeof safeTask.expected_output.format === "string"
        ? safeTask.expected_output.format
        : "";

    return [
      "Forge governed task.",
      "Return valid JSON only.",
      "No markdown fences.",
      "No explanations.",
      "Return targeted patch operations only.",
      "Do not return instructions, summaries, or prose inside JSON fields.",
      "diff must be a unified diff preview.",
      "For existing files, prefer exact anchored patch operations.",
      "Allowed operation types: replace_once, insert_after, insert_before, delete_once.",
      "If the target file does not exist, return one write_full_file operation with content.",
      "Use this exact JSON shape:",
      '{"task_id":"string","status":"SUCCESS","output":{"files":[{"path":"string","operations":[{"type":"replace_once","find":"exact old text","replace":"new text"}],"diff":"unified diff"}]},"metadata":{"engine":"codex"}}',
      `task_id: ${safeTask.task_id || ""}`,
      `request: ${safeRequest}`,
      `target_files: ${targetFiles}`,
      `operation_type: ${operationType}`,
      `file_exists: ${fileExists ? "true" : "false"}`,
      `expected_type: ${expectedType}`,
      `expected_format: ${expectedFormat}`,
      "Use only the provided file context window.",
      "Do not reconstruct the entire file.",
      "Generate the smallest valid patch needed for the request.",
      "If one operation is enough, return one operation only.",
      "Prefer stable structural anchors already present in the file context.",
      "Do not anchor patches to previously added AI comments when a structural anchor exists.",
      "Current file context starts below.",
      "----- CURRENT FILE CONTEXT START -----",
      currentFileContext,
      "----- CURRENT FILE CONTEXT END -----"
    ].join("\n\n");
  }

  extractJsonText(rawText) {
    const text = String(rawText || "").trim();

    if (!text) {
      return "";
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
      return fencedMatch[1].trim();
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];

      if (line.startsWith("{") && line.endsWith("}")) {
        try {
          JSON.parse(line);
          return line;
        } catch (err) {
        }
      }
    }

    for (let start = text.lastIndexOf("{"); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      const candidate = text.slice(start).trim();

      try {
        JSON.parse(candidate);
        return candidate;
      } catch (err) {
      }
    }

    return "";
  }

  normalizeFiles(files) {
    if (!Array.isArray(files)) {
      return [];
    }

    return files
      .map((file) => ({
        path: typeof file.path === "string" ? file.path.trim() : "",
        content: typeof file.content === "string" ? file.content : "",
        diff: typeof file.diff === "string" ? file.diff : "",
        operations: Array.isArray(file.operations)
          ? file.operations
              .map((operation) => ({
                type: typeof (operation && operation.type) === "string"
                  ? operation.type.trim()
                  : "",
                find: typeof (operation && operation.find) === "string"
                  ? operation.find
                  : "",
                replace: typeof (operation && operation.replace) === "string"
                  ? operation.replace
                  : "",
                anchor: typeof (operation && operation.anchor) === "string"
                  ? operation.anchor
                  : "",
                content: typeof (operation && operation.content) === "string"
                  ? operation.content
                  : ""
              }))
              .filter((operation) => operation.type.length > 0)
          : []
      }))
      .filter((file) => file.path.length > 0);
  }

  parseStructuredOutput(stdout, fallbackTaskId) {
    const jsonText = this.extractJsonText(stdout);

    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText);
      const files = this.normalizeFiles(
        parsed && parsed.output ? parsed.output.files : []
      );

      return {
        task_id:
          parsed && typeof parsed.task_id === "string"
            ? parsed.task_id
            : (fallbackTaskId || ""),
        status:
          parsed && typeof parsed.status === "string"
            ? parsed.status
            : "SUCCESS",
        output: {
          files
        },
        metadata:
          parsed && parsed.metadata && typeof parsed.metadata === "object"
            ? parsed.metadata
            : {}
      };
    } catch (err) {
      return null;
    }
  }

  async executeTask(task) {
    if (!task || typeof task !== "object") {
      throw new Error("Invalid task payload.");
    }

    const available = await this.isAvailable();

    if (!available) {
      return {
        task_id: task.task_id || "",
        status: "UNAVAILABLE",
        output: {
          files: []
        },
        metadata: {
          engine: "codex",
          command: this.command,
          note: "Codex CLI is not available on this machine"
        }
      };
    }

    try {
      const prompt = this.buildPrompt(task);

      const result = await this.executeWithStdin(prompt);
      const stdout = result.stdout || "";
      const stderr = result.stderr || "";

      const parsed = this.parseStructuredOutput(stdout, task.task_id || "");

      if (parsed) {
        return {
          task_id: parsed.task_id,
          status: parsed.status || "SUCCESS",
          output: {
            raw_stdout: stdout || "",
            raw_stderr: stderr || "",
            files: Array.isArray(parsed.output && parsed.output.files)
              ? parsed.output.files
              : []
          },
          metadata: {
            engine: "codex",
            command: this.command,
            ...(parsed.metadata || {})
          }
        };
      }

      return {
        task_id: task.task_id || "",
        status: "SUCCESS",
        output: {
          raw_stdout: stdout || "",
          raw_stderr: stderr || "",
          files: []
        },
        metadata: {
          engine: "codex",
          command: this.command,
          note: "Codex CLI executed successfully but structured JSON parsing failed"
        }
      };
    } catch (err) {
      return {
        task_id: task.task_id || "",
        status: "FAILED",
        output: {
          files: []
        },
        metadata: {
          engine: "codex",
          command: this.command,
          error: err && err.message ? err.message : "Unknown Codex execution error"
        }
      };
    }
  }
}

module.exports = CodexProvider;
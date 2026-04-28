const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

async function main() {
  const root = path.resolve(__dirname, "../../");

  const inputPath = path.join(root, "artifacts/llm/input/factory_mvp_scope.txt");

  if (!fs.existsSync(inputPath)) {
    console.log("Missing project_description.txt");
    return;
  }

  const description = fs.readFileSync(inputPath, "utf-8").trim();

  if (!description) {
    console.log("Empty project description");
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

const prompt = `
You are a CTO-level decision engine.

Analyze the project and return STRICT JSON with actionable decisions:

{
  "project_summary": "...",
  "should_build_now": true/false,
  "confidence": 0-100,
  "first_mvp_scope": [
    "exact feature 1",
    "exact feature 2"
  ],
  "core_value_proposition": "...",
  "biggest_risk": "...",
  "fastest_path_to_money": "...",
  "recommended_target_user": "...",
  "execution_difficulty": "LOW | MEDIUM | HIGH",
  "killer_insight": "one non-obvious insight that can change success probability"
}

Project:
${description}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0,
    messages: [
      { role: "system", content: "Strict JSON only. No text." },
      { role: "user", content: prompt }
    ]
  });

  const content = response.choices[0].message.content;

  const outDir = path.join(root, "artifacts/llm/outputs");
  fs.mkdirSync(outDir, { recursive: true });

  const fileName = `project_analysis_${Date.now()}.json`;
  const outPath = path.join(outDir, fileName);

  fs.writeFileSync(outPath, content);

  // --- Decision Memory Logging ---
  const logPath = path.join(root, "artifacts/llm/decision_log.json");

  let log = [];
  if (fs.existsSync(logPath)) {
    try {
      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    } catch (e) {
      log = [];
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parsed = { raw_output: content };
  }

  log.push({
    timestamp: new Date().toISOString(),
    input: description,
    decision: parsed
  });

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  console.log("Saved:", outPath);
  console.log("Decision logged.");
}

main().catch(err => {
  console.error("ERROR:", err.message);
});
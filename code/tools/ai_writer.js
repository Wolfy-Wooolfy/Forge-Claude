const fs = require("fs");
const path = require("path");
const readline = require("readline");
const OpenAI = require("openai");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const root = path.resolve(__dirname, "../../");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const userInput = await ask("Enter your request:\n");

  const prompt = `
You are a system that generates FILE OPERATIONS.

Return STRICT JSON:

{
  "files": [
    {
      "path": "relative/path/file.txt",
      "content": "file content here"
    }
  ]
}

Request:
${userInput}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0,
    messages: [
      { role: "system", content: "Strict JSON only" },
      { role: "user", content: prompt }
    ]
  });

  let content = response.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.log("Invalid JSON response:");
    console.log(content);
    rl.close();
    return;
  }

  console.log("\n--- Proposed Files ---\n");

  parsed.files.forEach((f, i) => {
    console.log(`#${i + 1}`);
    console.log("Path:", f.path);
    console.log("Content preview:");
    console.log(f.content.slice(0, 200));
    console.log("------\n");
  });

  const confirm = await ask("Approve writing these files? (yes/no): ");

  if (confirm.toLowerCase() !== "yes") {
    console.log("Cancelled.");
    rl.close();
    return;
  }

  for (const file of parsed.files) {
    const fullPath = path.join(root, file.path);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);

    console.log("Written:", file.path);
  }

  console.log("Done.");
  rl.close();
}

main().catch(err => {
  console.error("ERROR:", err.message);
  rl.close();
});
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Anthropic from "@anthropic-ai/sdk";

import { LEVELS, LEVEL_CODES, TOPICS } from "./data/levels.js";
import { FALLBACK_LESSONS } from "./data/fallback.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = "claude-opus-4-8";

// The SDK reads ANTHROPIC_API_KEY from the environment. If it's absent we run
// in "offline" mode and serve the curated fallback lessons instead.
const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasApiKey ? new Anthropic() : null;

app.use(express.static(join(__dirname, "public")));

// JSON schema the model must fill in. Structured outputs guarantee the first
// text block is valid JSON in exactly this shape.
const LESSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    text: { type: "string" },
    translation: { type: "string" },
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          german: { type: "string" },
          english: { type: "string" },
          note: { type: "string" },
        },
        required: ["german", "english", "note"],
        additionalProperties: false,
      },
    },
    grammar: {
      type: "array",
      items: {
        type: "object",
        properties: {
          point: { type: "string" },
          explanation: { type: "string" },
          examples: {
            type: "array",
            items: {
              type: "object",
              properties: {
                german: { type: "string" },
                english: { type: "string" },
              },
              required: ["german", "english"],
              additionalProperties: false,
            },
          },
        },
        required: ["point", "explanation", "examples"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "text", "translation", "vocabulary", "grammar"],
  additionalProperties: false,
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPrompt(levelCode, topic) {
  const level = LEVELS[levelCode];
  const focus = level.grammarFocus.map((g) => `- ${g}`).join("\n");
  return `Create a short German reading lesson for a self-study learner at CEFR level ${levelCode} (${level.label}).

Topic to write about: ${topic}.

Requirements for the German text:
- Write an interesting, natural-sounding passage of about ${
    levelCode === "A1" ? "4-6" : levelCode === "A2" ? "5-7" : "5-8"
  } sentences.
- The vocabulary and sentence complexity MUST be appropriate for ${levelCode}. Do not write above the level.
- The text should clearly showcase grammar that is characteristic of ${levelCode}, drawing from:
${focus}

Then provide:
- A natural, fluent English translation of the whole text.
- 4-6 useful vocabulary items from the text (German headword, English meaning, and a short note such as gender, separable prefix, or a usage tip; use an empty string for the note if there is nothing helpful to add).
- 2-3 grammar points that the text demonstrates. For each: the name of the point, a one- or two-sentence explanation aimed at a learner, and 1-2 example sentences taken from or based on the text with English translations.

Keep explanations concise and learner-friendly. Use real, correct German.`;
}

async function generateLesson(levelCode) {
  const topic = pick(TOPICS);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: LESSON_SCHEMA },
    },
    messages: [{ role: "user", content: buildPrompt(levelCode, topic) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in model response");

  const lesson = JSON.parse(textBlock.text);
  return { level: levelCode, topic, ...lesson, source: "generated" };
}

app.get("/api/levels", (_req, res) => {
  res.json({
    levels: LEVEL_CODES.map((code) => ({ code, ...LEVELS[code] })),
    mode: hasApiKey ? "live" : "offline",
  });
});

app.get("/api/lesson", async (req, res) => {
  const levelCode = String(req.query.level || "A1").toUpperCase();
  if (!LEVELS[levelCode]) {
    return res.status(400).json({ error: `Unknown level: ${levelCode}` });
  }

  if (!client) {
    return res.json({ ...FALLBACK_LESSONS[levelCode], source: "fallback" });
  }

  try {
    const lesson = await generateLesson(levelCode);
    res.json(lesson);
  } catch (err) {
    console.error("Generation failed, serving fallback:", err.message);
    res.json({ ...FALLBACK_LESSONS[levelCode], source: "fallback" });
  }
});

app.listen(PORT, () => {
  console.log(`German learning app running at http://localhost:${PORT}`);
  console.log(hasApiKey ? "Mode: live (Claude API)" : "Mode: offline (curated lessons)");
});

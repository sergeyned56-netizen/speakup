// Post-session report, written by a cheap text model from the transcript (costs fractions of a cent).
const REPORT_MODELS = ["gpt-5.4-mini", "gpt-5-mini", "gpt-4.1-mini"];
// $ per 1M tokens [input, output] — used only to show the cost
const REPORT_PRICES = { "gpt-5.4-mini": [0.75, 4.5], "gpt-5-mini": [0.25, 2], "gpt-4.1-mini": [0.4, 1.6] };

const CARD_ITEM = {
  type: "object", additionalProperties: false,
  properties: {
    phrase: { type: "string", description: "The word or phrase in its dictionary form." },
    pos: { type: "string", description: "Part of speech, e.g. 'phrasal verb', 'idiom', 'adjective'." },
    ipa: { type: "string", description: "IPA pronunciation, e.g. /ˈspɔɪlt/." },
    definition: { type: "string", description: "Clear explanation in SIMPLE English (no translation), max 20 words." },
    examples: { type: "array", description: "2 natural example sentences.", items: { type: "string" } },
    synonyms: { type: "array", description: "0-3 synonyms or related expressions.", items: { type: "string" } },
    note: { type: "string", description: "Optional usage tip (formal/informal, common mistake, collocation). Empty string if none." },
  },
  required: ["phrase", "pos", "ipa", "definition", "examples", "synonyms", "note"],
};

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "2 short sentences: how it went, in a friendly coach voice." },
    level: { type: "string", description: "CEFR estimate for THIS conversation, e.g. 'B1+'" },
    level_note: { type: "string", description: "One sentence: what keeps the learner at this level." },
    patterns: {
      type: "array",
      description: "Up to 3 recurring problems (grammar/vocab patterns), most important first. Empty if none.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          tip: { type: "string", description: "One-sentence rule of thumb." },
          examples: { type: "array", items: { type: "object", additionalProperties: false, properties: { you: { type: "string" }, better: { type: "string" } }, required: ["you", "better"] } },
        },
        required: ["title", "tip", "examples"],
      },
    },
    upgrades: {
      type: "array",
      description: "Learner sentences that were OK but simple, rewritten the way a fluent native would say them.",
      items: { type: "object", additionalProperties: false, properties: { you: { type: "string" }, native: { type: "string" } }, required: ["you", "native"] },
    },
    new_words: {
      type: "array",
      description: "3-5 useful words/phrases/collocations slightly above the learner's level: ones the learner was missing in THIS conversation, or ones the robot used that the learner probably doesn't know.",
      items: CARD_ITEM,
    },
    facts: {
      type: "array",
      description: "Durable personal facts the LEARNER said about themselves (job, plans, family, hobbies, events) worth remembering for future chats. Short third-person sentences. No sensitive data (health, money, politics, religion). Empty if none.",
      items: { type: "string" },
    },
    mission: {
      type: "object", additionalProperties: false,
      description: "Only for missions: did the learner reach the goal?",
      properties: { applicable: { type: "boolean" }, success: { type: "boolean" }, feedback: { type: "string" } },
      required: ["applicable", "success", "feedback"],
    },
    homework: { type: "string", description: "One concrete thing to practise before the next session." },
  },
  required: ["summary", "level", "level_note", "patterns", "upgrades", "new_words", "facts", "mission", "homework"],
};

async function makeReport({ apiKey, transcript, level, mission }) {
  const text = transcript.map((t) => (t.role === "user" ? "LEARNER: " : "ROBOT: ") + t.text).join("\n");
  const input = `You are an expert English teacher. Analyse this speaking-practice conversation between a learner (self-assessed ${level}) and a robot tutor.
Note: the learner's lines come from automatic speech recognition — ignore obvious transcription glitches, focus on real language problems.
${mission ? `This was a role-play MISSION. Goal: ${mission.goal}` : "This was free conversation (set mission.applicable=false)."}

TRANSCRIPT:
${text}`;

  let lastErr;
  for (const model of REPORT_MODELS) {
    const body = {
      model, input,
      text: { format: { type: "json_schema", name: "report", strict: true, schema: REPORT_SCHEMA } },
    };
    if (model.startsWith("gpt-5")) body.reasoning = { effort: "low" };
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { lastErr = new Error((data.error && data.error.message) || r.status); if (r.status === 401 || r.status === 429) break; continue; }
      const out = (data.output || []).flatMap((o) => o.content || []).find((c) => c.type === "output_text");
      const report = JSON.parse(out.text);
      const p = REPORT_PRICES[model] || [1, 4];
      const u = data.usage || {};
      report._cost = ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1]) / 1e6;
      return report;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Report failed");
}

// One flashcard for a word the learner adds by hand — uses the cheapest model.
const CARD_MODELS = ["gpt-5-nano", "gpt-4.1-nano", "gpt-4.1-mini"];
const CARD_PRICES = { "gpt-5-nano": [0.05, 0.4], "gpt-4.1-nano": [0.1, 0.4], "gpt-4.1-mini": [0.4, 1.6] };
async function makeCard({ apiKey, phrase, level }) {
  let lastErr;
  for (const model of CARD_MODELS) {
    const body = {
      model,
      input: `Make a vocabulary flashcard for an English learner (level ${level}) for: "${phrase}". If it's misspelled or not English, use the most likely intended English word/phrase. Explain in simple English only — no translation.`,
      text: { format: { type: "json_schema", name: "card", strict: true, schema: CARD_ITEM } },
    };
    if (model.startsWith("gpt-5")) body.reasoning = { effort: "minimal" };
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { lastErr = new Error((data.error && data.error.message) || r.status); if (r.status === 401 || r.status === 429) break; continue; }
      const out = (data.output || []).flatMap((o) => o.content || []).find((c) => c.type === "output_text");
      const card = JSON.parse(out.text);
      const p = CARD_PRICES[model] || [1, 4]; const u = data.usage || {};
      card._cost = ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1]) / 1e6;
      return card;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Card failed");
}

window.makeReport = makeReport;
window.makeCard = makeCard;

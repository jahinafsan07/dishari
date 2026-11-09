// DISHARI vision API: POST /api/vision
// Body: { mode: "scene"|"taka"|"text"|"obstacle"|"ask", image?: base64 JPEG, sampleId?: string, question?: string }
// Returns: { mode, say_bn, say_en, items, warning, confident, notes?, total?, source, model? }
import { json, gemini, VISION_MODELS, cacheGet, cacheSet, rateLimited, takaSentences } from "../lib/shared.mjs";

const SAMPLES = {
  "dhaka-street": "/samples/dhaka-hatirpool.jpg",
  "dhaka-rickshaw": "/samples/dhaka-highcourt.jpg",
  "taka-1000": "/samples/taka1000.jpg",
  "metro-farmgate": "/samples/metro-farmgate.jpg",
  "pharmacy-sign": "/samples/pharmacy-sign.jpg",
  "prothomalo": "/samples/prothomalo.jpg",
  "footpath-obstacle": "/samples/footpath-obstacle.jpg",
};
const MODES = ["auto", "live", "scene", "taka", "text", "obstacle", "ask"];
const MAX_BODY = 3_500_000;

const BASE = `You are DISHARI, an assistive vision companion for blind and visually impaired people in Bangladesh.
Rules:
- Describe only what is clearly visible in the photo. Never invent objects, text, people, brands or events.
- Do not give exact distances or claim that something is moving or that a path is safe; this is a single still photo.
- Use left, right or centre only when the position in the photo clearly supports it.
- Write simple, natural, spoken Bangladeshi Bangla (say_bn) with short sentences, and a matching plain English version (say_en).
- If the photo is too dark, blurry or unclear for the task, set confident to false and politely ask the user to take the photo again.`;

const TASK = {
  live: `Task: this is one frame from a live video the user is filming while moving. In one or two very short spoken Bangla sentences, say what is in front of the user right now, putting anything safety-relevant first (vehicles, people close by, steps, holes, obstacles). If a Bangladeshi banknote fills the view, just say its value; if readable text is the main thing, read it briefly. If a previous description is given and nothing important has changed, set changed to false and keep say_bn very short. Never repeat the previous description word for word.`,
  auto: `Task: first decide what the photo mainly shows, then answer in that way.
(a) Bangladeshi taka banknote(s): list each clearly visible note's value in notes (for example [500]); if unsure, notes = [] and confident = false. Never judge if a note is genuine.
(b) Mainly text (a sign, document, label, newspaper or screen): start say_bn with "এখানে লেখা আছে:" and read the main text as written; do not guess hidden words. For a newspaper, read the name and the main headlines.
(c) Anything else: describe the surroundings in 2 to 4 short sentences, safety-relevant things first (vehicles, holes, steps, obstacles), then people, then the place.
Leave notes empty unless the photo shows banknotes. List the main things you see in items.`,
  scene: `Task: describe the surroundings for someone who cannot see them, in 2 to 4 short sentences. Put safety-relevant things first (vehicles, open holes, steps, obstacles), then people, then the general place. List the main things you see in items.`,
  obstacle: `Task: identify hazards for a person walking: open manholes or drains, broken footpath, steps, vehicles or objects blocking the way, construction, hanging objects. Start with the most important hazard and its rough position in the photo (left, centre or right). End say_bn with "সাবধানে চলুন।" when there is a hazard. If no clear hazard is visible, say that no obvious hazard is visible in this photo, without saying the path is safe. Put each hazard in items.`,
  text: `Task: read the visible text exactly as written (Bangla or English), in natural reading order. Start say_bn with "এখানে লেখা আছে:" followed by the text as written. If some words are hidden or blurry, say that part is not readable instead of guessing. For medicine labels, only read the text; give no medical advice. Put each separate line of text in items.`,
  taka: `Task: identify Bangladeshi taka banknotes (old or new designs). In notes, list the denomination of each clearly visible note as a number (for example [500] or [500, 100]). If no Bangladeshi banknote is clearly visible, or you are not sure of the value, set notes to [] and confident to false. Never judge whether a note is genuine or fake.`,
  ask: `Task: answer the user's question about this photo in 1 to 3 short sentences, based only on what is visible. If the answer cannot be seen in the photo, say so honestly.`,
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    say_bn: { type: "STRING" },
    say_en: { type: "STRING" },
    items: { type: "ARRAY", items: { type: "STRING" } },
    warning: { type: "STRING" },
    confident: { type: "BOOLEAN" },
    notes: { type: "ARRAY", items: { type: "INTEGER" } },
    changed: { type: "BOOLEAN" },
  },
  required: ["say_bn", "say_en", "confident"],
};

const clean = (s, max = 700) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function shape(mode, raw) {
  const out = {
    mode,
    say_bn: clean(raw.say_bn),
    say_en: clean(raw.say_en),
    items: Array.isArray(raw.items) ? raw.items.map((x) => clean(x, 120)).filter(Boolean).slice(0, 12) : [],
    warning: clean(raw.warning, 200),
    confident: raw.confident !== false,
    changed: raw.changed !== false,
  };
  if (mode === "auto" || mode === "live") {
    const t = raw.confident === false ? null : takaSentences(raw.notes);
    if (t) Object.assign(out, { say_bn: t.bn, say_en: t.en, notes: t.notes, total: t.total, mode: mode === "live" ? "live" : "taka" });
  }
  if (mode === "taka") {
    const t = raw.confident === false ? null : takaSentences(raw.notes);
    if (t) Object.assign(out, { say_bn: t.bn, say_en: t.en, notes: t.notes, total: t.total, confident: true });
    else Object.assign(out, { say_bn: "নোটটি পরিষ্কার দেখা যাচ্ছে না। নোটটি সামনে সোজা করে ধরে আবার ছবি তুলুন।", say_en: "I can't see the note clearly. Hold it flat in front of the camera and take the photo again.", notes: [], confident: false });
  }
  if (!out.say_bn) throw new Error("empty");
  return out;
}

async function loadSample(req, id) {
  const path = SAMPLES[id];
  if (!path) return null;
  const r = await fetch(new URL(path, req.url));
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}

export default async (req) => {
  if (req.method === "GET") return json({ ok: Boolean(process.env.GEMINI_API_KEY) });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (rateLimited(req, 120)) return json({ error: "rate_limited" }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }

  const mode = MODES.includes(body.mode) ? body.mode : "auto";
  const question = clean(body.question, 300);
  if (mode === "ask" && !question) return json({ error: "no_question" }, 400);

  const sampleId = typeof body.sampleId === "string" ? body.sampleId : null;
  const cacheKey = sampleId && mode !== "ask" ? `vision:${sampleId}:${mode}:v1` : null;
  if (cacheKey) {
    const hit = await cacheGet(cacheKey);
    if (hit) return json({ ...hit, source: "cached" });
  }

  let image = typeof body.image === "string" ? body.image.replace(/^data:image\/\w+;base64,/, "") : null;
  if (!image && sampleId) image = await loadSample(req, sampleId);
  if (!image || image.length < 1000) return json({ error: "no_image" }, 400);

  const previous = clean(body.previous, 400);
  const prompt = mode === "ask" ? `${TASK.ask}\nUser question: ${question}` : mode === "live" && previous ? `${TASK.live}\nPrevious description: ${previous}` : TASK[mode];
  const result = await gemini(VISION_MODELS(), {
    systemInstruction: { parts: [{ text: BASE }] },
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 450, responseMimeType: "application/json", responseSchema: SCHEMA, thinkingConfig: { thinkingBudget: 0 } },
  }, 10000);
  if (result.error) return json({ error: result.error }, result.error === "not_configured" ? 503 : 502);

  let parsed;
  try { parsed = JSON.parse(result.parts.map((p) => p.text || "").join("").replace(/```json|```/g, "").trim()); } catch { return json({ error: "bad_model_output" }, 502); }
  let out;
  try { out = shape(mode, parsed); } catch { return json({ error: "bad_model_output" }, 502); }
  out.model = result.model;
  if (cacheKey && out.confident) await cacheSet(cacheKey, out);
  return json({ ...out, source: "live" });
};

export const config = { path: "/api/vision" };

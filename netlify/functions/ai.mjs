// DISHARI secure AI proxy (Netlify Function).
// The Gemini key lives in the GEMINI_API_KEY environment variable, never in the page.

const MAIN_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
const FAST_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"];
const MAX_BODY = 4_000_000; // ~4 MB, enough for a few compressed camera frames

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  const key = process.env.GEMINI_API_KEY;

  if (req.method === "GET") return json({ ok: Boolean(key) });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!key) return json({ error: "not_configured" }, 503);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }

  const parts = Array.isArray(body.parts) ? body.parts.slice(0, 12) : null;
  if (!parts || !parts.length) return json({ error: "no_parts" }, 400);

  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 500,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (body.json) generationConfig.responseMimeType = "application/json";

  const models = body.fast ? FAST_MODELS : MAIN_MODELS;
  let lastStatus = 502;

  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        signal: AbortSignal.timeout(body.fast ? 8000 : 12000), // slow model: move on to the next one
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
      });
      if (!r.ok) { lastStatus = r.status; continue; } // busy or retired model: try the next one
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
      if (text) return json({ text, model });
    } catch {
      lastStatus = 502;
    }
  }
  return json({ error: "unavailable", status: lastStatus }, 503);
};

export const config = { path: "/api/ai" };

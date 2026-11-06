// DISHARI speech API: POST /api/tts  Body: { text, lang: "bn"|"en" }  Returns: audio/wav
// Generates natural speech on the server so it plays on every phone, including iPhones without a Bangla voice.
import { createHash } from "node:crypto";
import { json, gemini, TTS_MODELS, cacheGet, cacheSet, rateLimited, pcmToWav } from "../lib/shared.mjs";

const wavResponse = (buf, source, type = "audio/wav") =>
  new Response(buf, { status: 200, headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Dishari-Audio": source } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (rateLimited(req, 30)) return json({ error: "rate_limited" }, 429);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const lang = body.lang === "en" ? "en" : "bn";
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 700) : "";
  if (!text) return json({ error: "no_text" }, 400);

  const voice = process.env.GEMINI_TTS_VOICE || "Kore";
  const key = "tts:" + createHash("sha1").update(`${lang}|${voice}|${text}`).digest("hex");
  const hit = await cacheGet(key, "arrayBuffer");
  if (hit) return wavResponse(Buffer.from(hit), "cached");

  const instruction = lang === "bn"
    ? "Read the following Bangladeshi Bangla text aloud in a warm, clear and calm voice at a moderate pace, with natural Bangladeshi pronunciation:"
    : "Read the following text aloud in a warm, clear and calm voice at a moderate pace:";
  const result = await gemini(TTS_MODELS(), {
    contents: [{ role: "user", parts: [{ text: `${instruction}\n${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  }, 20000);
  if (result.error) return json({ error: result.error }, result.error === "not_configured" ? 503 : 502);

  const part = result.parts.find((p) => p.inlineData || p.inline_data);
  const inline = part && (part.inlineData || part.inline_data);
  if (!inline?.data) return json({ error: "no_audio" }, 502);
  const mime = inline.mimeType || inline.mime_type || "";
  const audio = Buffer.from(inline.data, "base64");
  let wav;
  if (/mpeg|mp3/i.test(mime)) return wavResponse(audio, "live", "audio/mpeg");
  if (/wav/i.test(mime)) wav = audio;
  else {
    const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
    wav = pcmToWav(audio, rate);
  }
  await cacheSet(key, wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  return wavResponse(wav, "live");
};

export const config = { path: "/api/tts" };

// Shared helpers for DISHARI serverless functions. The Gemini key is read from the
// environment on the server and is never sent to the browser.

export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

const list = (env, fallback) => (env ? env.split(",").map((s) => s.trim()).filter(Boolean) : fallback);

export const VISION_MODELS = () => list(process.env.GEMINI_MODEL, ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]);
export const TTS_MODELS = () => list(process.env.GEMINI_TTS_MODEL, ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]);

// ---- cache (Netlify Blobs when available; silently skipped elsewhere) ----
let storePromise;
export async function cache() {
  if (!storePromise) {
    storePromise = (async () => {
      try { const { getStore } = await import("@netlify/blobs"); return getStore("dishari-cache"); } catch { return null; }
    })();
  }
  return storePromise;
}
export async function cacheGet(key, type = "json") {
  try { const s = await cache(); return s ? await s.get(key, { type }) : null; } catch { return null; }
}
export async function cacheSet(key, value) {
  try { const s = await cache(); if (s) await (typeof value === "string" || value instanceof ArrayBuffer ? s.set(key, value) : s.setJSON(key, value)); } catch { /* cache is optional */ }
}

// ---- best-effort rate limit per function instance ----
const hits = new Map();
export function rateLimited(req, limit = 20, windowMs = 60_000) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "anon";
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

// ---- Gemini call with model fallback ----
export async function gemini(models, body, timeoutMs = 15000) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "not_configured" };
  let last = "unavailable";
  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      if (r.status === 429) { last = "rate_limited"; continue; }
      if (!r.ok) { last = `http_${r.status}`; continue; }
      const d = await r.json();
      const parts = d.candidates?.[0]?.content?.parts || [];
      if (parts.length) return { parts, model };
      last = "empty";
    } catch { last = "timeout"; }
  }
  return { error: last };
}

// ---- audio: wrap raw 16-bit PCM in a WAV header ----
export function pcmToWav(pcm, rate = 24000, channels = 1) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---- taka wording ----
export const NOTE_WORDS_BN = { 2: "দুই", 5: "পাঁচ", 10: "দশ", 20: "বিশ", 50: "পঞ্চাশ", 100: "একশ", 200: "দুইশ", 500: "পাঁচশ", 1000: "এক হাজার" };
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const bnNum = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]).replace(/(\d|[০-৯])(?=([০-৯]{3})+$)/g, "$1,");

export function takaSentences(notes) {
  const valid = (notes || []).map(Number).filter((n) => NOTE_WORDS_BN[n]);
  if (!valid.length) return null;
  const total = valid.reduce((a, b) => a + b, 0);
  if (valid.length === 1) {
    const n = valid[0];
    return { bn: `এটা ${NOTE_WORDS_BN[n]} টাকার নোট।`, en: `This is a ${n} taka note.`, total, notes: valid };
  }
  const counts = {};
  valid.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
  const partsBn = Object.keys(counts).sort((a, b) => b - a).map((n) => `${bnNum(counts[n])}টি ${NOTE_WORDS_BN[n]} টাকার নোট`);
  const partsEn = Object.keys(counts).sort((a, b) => b - a).map((n) => `${counts[n]} × ${n} taka`);
  return { bn: `এখানে ${partsBn.join(" এবং ")} আছে। মোট ${bnNum(total)} টাকা।`, en: `There are ${partsEn.join(" and ")}. Total ${total} taka.`, total, notes: valid };
}

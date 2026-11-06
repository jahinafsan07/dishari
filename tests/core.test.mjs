import test from "node:test";
import assert from "node:assert/strict";
import { takaSentences, pcmToWav, bnNum } from "../netlify/lib/shared.mjs";
import vision, { shape } from "../netlify/functions/vision.mjs";
import tts from "../netlify/functions/tts.mjs";

test("single 500 note says the exact sentence", () => {
  assert.equal(takaSentences([500]).bn, "এটা পাঁচশ টাকার নোট।");
  assert.equal(takaSentences([100]).bn, "এটা একশ টাকার নোট।");
  assert.equal(takaSentences([1000]).bn, "এটা এক হাজার টাকার নোট।");
});
test("several notes are summed", () => {
  const r = takaSentences([500, 100, 100]);
  assert.equal(r.total, 700);
  assert.match(r.bn, /মোট ৭০০ টাকা/);
});
test("unknown denominations are rejected", () => { assert.equal(takaSentences([300]), null); assert.equal(takaSentences([]), null); });
test("Bangla digits with grouping", () => { assert.equal(bnNum(1000), "১,০০০"); assert.equal(bnNum(500), "৫০০"); });
test("unsure taka result asks to retake instead of guessing", () => {
  const o = shape("taka", { say_bn: "x", say_en: "x", confident: false, notes: [500] });
  assert.equal(o.confident, false); assert.match(o.say_bn, /আবার ছবি তুলুন/); assert.deepEqual(o.notes, []);
});
test("empty model answer is rejected", () => { assert.throws(() => shape("scene", { say_bn: " ", say_en: "", confident: true })); });
test("WAV header is valid", () => {
  const wav = pcmToWav(Buffer.alloc(4800), 24000);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF"); assert.equal(wav.readUInt32LE(24), 24000); assert.equal(wav.length, 4844);
});

const req = (body, method = "POST") => new Request("https://dishari.test/api/vision", { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
const img = "A".repeat(2000);

test("vision reports missing key", async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await vision(req(null, "GET")); assert.deepEqual(await r.json(), { ok: false });
  const r2 = await vision(req({ mode: "scene", image: img })); assert.equal(r2.status, 503);
});
test("vision returns validated Bangla answer (mocked Gemini)", async () => {
  process.env.GEMINI_API_KEY = "test";
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ say_bn: "আপনার সামনে একটি রিকশা আছে।", say_en: "A rickshaw is in front of you.", confident: true, items: ["rickshaw"] }) }] } }] }), { status: 200 });
  const r = await vision(req({ mode: "scene", image: img }));
  const d = await r.json(); global.fetch = orig;
  assert.equal(r.status, 200); assert.equal(d.say_bn, "আপনার সামনে একটি রিকশা আছে।"); assert.equal(d.source, "live");
});
test("taka answer wording comes from the server, not the model (mocked)", async () => {
  process.env.GEMINI_API_KEY = "test";
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ say_bn: "৫০০", say_en: "500", confident: true, notes: [500] }) }] } }] }), { status: 200 });
  const d = await (await vision(req({ mode: "taka", image: img }))).json(); global.fetch = orig;
  assert.equal(d.say_bn, "এটা পাঁচশ টাকার নোট।"); assert.equal(d.total, 500);
});
test("model falls back to next model on 429 (mocked)", async () => {
  process.env.GEMINI_API_KEY = "test"; let calls = 0;
  const orig = global.fetch;
  global.fetch = async () => { calls++; if (calls === 1) return new Response("busy", { status: 429 }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ say_bn: "ঠিক আছে।", say_en: "OK.", confident: true }) }] } }] }), { status: 200 }); };
  const r = await vision(req({ mode: "scene", image: img })); global.fetch = orig;
  assert.equal(r.status, 200); assert.equal(calls, 2);
});
test("tts converts PCM to playable WAV (mocked)", async () => {
  process.env.GEMINI_API_KEY = "test";
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: Buffer.alloc(9600).toString("base64") } }] } }] }), { status: 200 });
  const r = await tts(new Request("https://dishari.test/api/tts", { method: "POST", body: JSON.stringify({ text: "এটা পাঁচশ টাকার নোট।", lang: "bn" }) }));
  global.fetch = orig;
  assert.equal(r.headers.get("Content-Type"), "audio/wav");
  const b = Buffer.from(await r.arrayBuffer()); assert.equal(b.toString("ascii", 0, 4), "RIFF"); assert.equal(b.length, 9644);
});

test("auto mode: banknote photo answers with the taka sentence (mocked)", async () => {
  process.env.GEMINI_API_KEY = "test";
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ say_bn: "একটি নোট", say_en: "a note", confident: true, notes: [500] }) }] } }] }), { status: 200 });
  const d = await (await vision(req({ mode: "auto", image: img }))).json(); global.fetch = orig;
  assert.equal(d.say_bn, "এটা পাঁচশ টাকার নোট।"); assert.equal(d.mode, "taka");
});
test("auto mode: normal photo keeps the description (mocked)", async () => {
  process.env.GEMINI_API_KEY = "test";
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ say_bn: "সামনে একটি টেবিল আছে।", say_en: "A table is in front.", confident: true, notes: [] }) }] } }] }), { status: 200 });
  const d = await (await vision(req({ mode: "auto", image: img }))).json(); global.fetch = orig;
  assert.equal(d.say_bn, "সামনে একটি টেবিল আছে।"); assert.equal(d.mode, "auto");
});

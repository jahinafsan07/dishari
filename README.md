# DISHARI web app (GP FutureMakers 2026 finals)

Scan the QR code, take a photo, and DISHARI describes it in Bangla: surroundings, Taka notes, text and obstacles, with a spoken Bangla voice and follow-up questions.

## What is inside
- `site/index.html`: the whole app (plain HTML, CSS and JavaScript; no build step, loads fast on venue Wi-Fi)
- `site/samples/`: sample photos stored locally (no external image links)
- `netlify/functions/vision.mjs`: secure AI endpoint `/api/vision` (modes: scene, taka, text, obstacle, ask)
- `netlify/functions/tts.mjs`: Bangla/English voice endpoint `/api/tts` (server-generated audio, works on iPhones too)
- `netlify/lib/shared.mjs`: Gemini calls with model fallback, caching, rate limits, Taka wording
- `tests/core.test.mjs`: tests (run `npm test`)

The Gemini key stays on the server. It is never in the page or in GitHub.

## Deploy (replaces the current app at dishari-ai.netlify.app)
1. In your GitHub repo `jahinafsan07/dishari`, delete the old files and upload everything in this folder (keep the folder structure).
2. Netlify builds automatically. Check Site configuration > Build settings: publish directory `site`, functions directory `netlify/functions` (netlify.toml sets these).
3. Environment variables (Site configuration > Environment variables): keep `GEMINI_API_KEY`. The others in `.env.example` are optional.
4. **Turn on billing for the Gemini API key in Google AI Studio before the finals.** The free tier will hit its limit when many people scan at once, and the voice models may need a paid tier.

## Before the finals (important)
1. Open `https://dishari-ai.netlify.app/?warm=1` once. It runs every sample through the AI and creates the voices, then caches them, so sample taps are instant for everyone. The progress shows under the pilot form.
2. Tap each sample on an iPhone and an Android phone and confirm you hear the voice.
3. Take a real photo on both phones in each mode.

## Adding sample photos
Put the photo in `site/samples/` and add one line to the `SAMPLES` list in `site/index.html` (id, file, mode, Bangla and English titles, a short demo answer, photo credit). Also add the same id and file to `SAMPLES` in `netlify/functions/vision.mjs`. Then open `/?warm=1` again.

Slots already prepared in `vision.mjs`: `taka-500`, `taka-100`, `sign`, `obstacle`, `indoor`.

## How answers are labelled
- **Live AI**: analysed now by Gemini.
- **AI analysis (prepared)**: a sample photo the AI analysed earlier (cached), shown instantly.
- **Sample demo**: shown only if the AI is unreachable; written by the team, clearly labelled.

## Pilot sign-ups
The "Join the DISHARI pilot" form uses Netlify Forms. Submissions appear in Netlify > Forms > pilot.

## Finals checklist
- [ ] Billing on for the Gemini key
- [ ] `/?warm=1` finished with every sample "Warmed"
- [ ] Voice heard on iPhone (Safari) and Android (Chrome)
- [ ] Live photo works in all four modes
- [ ] 500 and 100 taka notes recognised from your own photos
- [ ] Camera permission denied: the "Upload image" button still works
- [ ] Airplane mode test: samples show the labelled demo answer, nothing crashes
- [ ] QR code on the slide opens the app

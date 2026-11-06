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
1. Sample photos need no AI call: their Bangla text and voice are stored in `site/samples/audio/` and inside `index.html`, so a tap shows and speaks instantly, even on weak Wi-Fi.
2. Tap each sample on an iPhone and an Android phone and confirm you hear the voice.
3. Take a real photo on both phones in each mode.

## Adding sample photos
Put the photo in `site/samples/`, add the same id and file to `SAMPLES` in `netlify/functions/vision.mjs`, and add an entry to `SAMPLES` in `site/index.html` with the AI's answer (`pre`). Generate the voice files `site/samples/audio/<id>-bn.mp3` and `<id>-en.mp3` from `/api/tts`. (Claude can do this for you.)

The app has 7 samples: Dhaka street, rickshaws, Farmgate metro, shop signs, Prothom Alo newspaper, sand on the footpath, and the 1,000 taka note.

## How answers are labelled
- **Live AI**: analysed now by Gemini.
- **AI analysis (prepared)**: a sample photo the AI analysed earlier; the answer and voice are stored with the site and shown instantly.

## Pilot sign-ups
The "Join the DISHARI pilot" form uses Netlify Forms. Submissions appear in Netlify > Forms > pilot.

## Finals checklist
- [ ] Billing on for the Gemini key
- [ ] Voice heard on iPhone (Safari) and Android (Chrome)
- [ ] Live photo works in all four modes
- [ ] 500 and 100 taka notes recognised from your own photos
- [ ] Camera permission denied: the "Upload image" button still works
- [ ] Airplane mode test: samples show the labelled demo answer, nothing crashes
- [ ] QR code on the slide opens the app

# DISHARI – দিশারী (web MVP)

AI-powered sensory companion for visually impaired people in Bangladesh. Prototype for GP FutureMakers 2026.

## What it does
- **Vision**: describes the scene in Bangla or English (Gemini Flash), live on-device object boxes with estimated distances (COCO-SSD).
- **Obstacle alert**: on-device, works without internet; left / ahead / right haptic preview, vibration (Android) and stereo beep.
- **Read**: Bangla, English and Banglish text, medicine labels.
- **Money**: Bangladeshi Taka notes.
- **Ask**: voice (Bangla / English) or typed questions about the scene.
- **Help**: trusted contact, real call / location SMS on tap, simulated live-assist flow.
- **Demo mode**: four labelled scenarios; turns on if the camera or AI is unavailable. "Show me DISHARI" runs a 6-second walkthrough.

## Files
- `index.html` – the whole app (edit demo scenarios in the `DEMOS` object)
- `netlify/functions/ai.mjs` – secure proxy; reads `GEMINI_API_KEY`, falls back across Gemini Flash models
- `netlify.toml` – Netlify config

## Deploy (Netlify + GitHub)
1. Push this folder to a GitHub repository.
2. Netlify → Add new site → Import from Git → pick the repo (no build command; publish directory `.`).
3. Site configuration → Environment variables → add `GEMINI_API_KEY` = your key → redeploy.
4. Open the site; the ⚙ status panel should show Cloud AI "Connected".

Never commit the key. It lives only in Netlify's environment variables.

## Simulated in this MVP
Glasses battery, the live-assist call, familiar-person detection (demo avatars), and depth (distances are estimates from the camera image). The physical glasses (camera array, ToF sensor, vibration motors) are planned.

## Sample photos
`samples/` holds two Dhaka street photos used by "Try it on a Dhaka street photo". Each photo is analysed live by the AI (not a canned answer).
- `dhaka-hatirpool.jpg`: Afifa Afrin, CC BY-SA 4.0, Wikimedia Commons ("Rickshaws in Hatirpool bazar, Dhaka 2")
- `dhaka-highcourt.jpg`: Biswarup Ganguly, CC BY 3.0, Wikimedia Commons ("Cycle Rickshaws - High Court Street - Dhaka 2015-05-31 2094")
Credits are shown on the photo inside the app.

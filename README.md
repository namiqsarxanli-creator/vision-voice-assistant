# VISION

**A clap-to-wake voice assistant with a WebGL particle body, hand-gesture control and real tools.**

🇦🇿 [Azərbaycan dilində](README.az.md)

![VISION's particle body, assembled after a double clap](docs/screenshots/particle-body.jpg)

Clap twice and a humanoid figure assembles itself from particles and starts listening. Ask in English
or Azerbaijani. VISION answers out loud in a deep voice and can act on your behalf:

- opens apps and sites
- drives a real browser
- finds nearby places
- reads your mail and calendar
- drafts replies

## Highlights

- **LLM tool-calling loop** (FastAPI): Groq `gpt-oss-120b`, with automatic fallback to OpenAI. The model
  only picks tools from a fixed allow-list. It never writes shell commands or queries.
- **Speech:**
  - Speech-to-text with Groq Whisper, which handles Azerbaijani; Chrome's built-in recognition doesn't.
  - Neural text-to-speech with Groq Orpheus, falling back to Windows SAPI + SSML pitch-shifting and a
    Web Audio filter chain.
- **Clap detection in the browser:** spectral high/low band balance, an adaptive noise floor, a
  refractory window against echoes, and a 140–900 ms timing gate. Audio leaves the device only after a
  wake event.
- **Hand gestures** with MediaPipe, running fully locally:
  - the head tracks your hand
  - open/close toggles the light
  - a swipe changes the palette
  - the camera feed is never displayed or sent anywhere
- **Controlled browser (Playwright):**
  - "search X", "open the first one", "scroll down", "go back", "read this page", YouTube play/pause
  - Runs on a dedicated thread because Playwright's sync API is thread-bound.
  - Uses system Chrome so H.264 video plays.
  - Cookie banners are auto-*declined*.
- **Nearby places** with OpenStreetMap (Nominatim + Overpass):
  - No API key or billing.
  - **Coordinates never reach the LLM.** Only the finished results (name, distance, address) do.
  - Categories are fixed, so query injection isn't possible.
- **Google Workspace:**
  - Gmail read and reply *drafts*, threaded correctly.
  - Calendar read.
  - Google Sheets meeting logging.
  - The code never calls any send method. Sending is always your own click in Gmail.
- **Persistent memory:** facts are stored in `memory.json` and treated as data, never as instructions.
- **Barge-in:** if you talk while VISION speaks, it stops and listens. Echo is rejected by comparing the
  microphone level against VISION's own output level.

## Run it

```bash
pip install -r requirements.txt
```

```bash
python -m playwright install chromium
```

```bash
python main.py
```

Then open http://127.0.0.1:8040/.

Put `GROQ_API_KEY` (optionally `OPENAI_API_KEY`) in `.env`. Without a key, the UI still runs on demo
answers. For Gmail and Calendar, add an OAuth Desktop `credentials.json` and press **GOOGLE QOŞ** in
the UI.

**Keyboard:**

| Key | Action |
|---|---|
| `V` | talk |
| `T` | type |
| `Esc` | stop |
| `M` | palette |
| `F` | fullscreen |
| `R` | replay the assembly animation |

## Structure

```
main.py          FastAPI: page + /api/chat, /api/listen, /api/speak
ai.py            LLM + tool-calling loop, provider fallback
tools.py         allow-listed actions: apps / sites / files / system
browser.py       Playwright-driven browser on its own thread
places.py        OpenStreetMap: where am I / nearby search
google_tools.py  Gmail, Calendar, Sheets
memory.py        persistent user facts
voice.py         neural TTS + SAPI fallback
static/          single page, WebGL particle renderer, clap & gesture detection, MediaPipe (local)
test-*.py/.cjs   tests: clap algorithm, gestures, fallback, mail routing, places, search, sheets
```

## Tests

```bash
node test-clap.cjs
```

```bash
node test-gestures.cjs
```

```bash
python test-fallback.py
```

```bash
python test-places.py
```

The clap test caught a real bug on its first run. Band energies were summed instead of averaged, so
speech looked "broadband". `test-places.py` asserts that no raw coordinates ever appear in tool output.

## Honest limitations

- **Clap detection** is tested on synthetic signals. Room acoustics may need tuning (`minPeak`,
  `highBandMin`).
- **"Snap" detection** is approximated by tracking fingers releasing contact, not by sound.
- **The model picks the tools,** so it can occasionally pick the wrong one. Every executed action is
  shown on screen.

## License

MIT

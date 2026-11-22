# ATC Predictor

Listen to a LiveATC feed, and this Chrome extension transcribes each radio call **on your own computer** (Whisper running inside Chrome, so there's no server and no API key). The website then groups the calls into scenarios by airport, facility, runway and phase of flight, so you can see what the controller is most likely to say next.

Personal use only. LiveATC's terms prohibit third-party use of its streams, so this only records the tab you're actively listening to. Don't republish the audio or transcripts.

## What's in the folder

| Folder | What it is |
|---|---|
| `extension/` | The ready-to-load Chrome extension. The website is built in (`dashboard.html`). |
| `site/index.html` | The same website as one standalone file (for GitHub Pages). Use **Data ▾ → Import JSON** to load an export from the extension. |
| `src/` | Source code. `src/lib/atc.js` is the phraseology parser. |
| `build.mjs` | Rebuilds `extension/` and `site/` from `src/` (`npm install` then `node build.mjs`, then copy `dist/extension` and `dist/site` over `extension/` and `site/`). |

## Install the extension (Windows, Chrome)

1. Unzip `atc-predictor.zip` somewhere you'll keep it, for example `C:\Users\<you>\Documents\atc-predictor`.
2. In Chrome, go to `chrome://extensions` in the address bar.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (top-left).
5. Select the `extension` folder inside the unzipped folder and click **Select Folder**.
6. Click the puzzle-piece icon in the toolbar, then the pin next to **ATC Predictor** so it stays visible.

## Record a feed

1. Open a LiveATC feed and press play so you can hear it. The pop-out player page works best, since its URL includes the feed name (for example `...hlisten.php?mount=kbos_twr&icao=kbos`).
2. While that tab is the active tab, click the **ATC Predictor** icon.
3. Check **Airport** (for example `KBOS`) and **Facility**. Both are filled in automatically from the LiveATC URL when possible.
4. Choose a **Speech model**. **Base** is the default. **Small** is more accurate but slower.
5. Click **Start listening**. The first time, the model downloads from Hugging Face (about 80 MB for Base) and is cached after that.
6. Leave the tab playing. The badge counts calls, and **Latest calls** shows them as they come in.
7. Click **Stop** when you're done, or just close the tab.

If calls get cut in half, raise **End-of-call gap** under **Advanced**. If static or noise gets transcribed, raise **Squelch sensitivity**.

## Use the website

Open it with **Open scenarios →** in the popup.

- **Predict**: Ranked scenarios for your filters. Each blue value is the most common value seen there, and you can hover it to see the alternatives. Each card shows the typical pilot readback and real examples (▶ plays the saved audio).
- **Flight script**: For one airport, goes phase by phase (clearance, taxi, takeoff, departure, enroute, arrival, approach, pattern, landing, taxi in), showing the top controller calls and pilot calls.
- **Transmissions**: Every call. Click the text to fix it (Enter saves), change the speaker or phase, mark calls as junk, or delete them.
- **ChatGPT cleanup**:
  1. Click **Copy prompt**. It copies up to 150 uncleaned calls, following your filters.
  2. Paste the prompt into ChatGPT.
  3. Copy ChatGPT's whole reply, paste it into box 2, and click **Apply**.

  ChatGPT fixes misheard words and numbers, labels who's talking and the phase, and adds a plain-English meaning. The scenarios update right away.
- **Data ▾**: Export and import JSON backups (optionally with audio), load or remove sample data, or delete everything.

## Known limits

- Plain Whisper isn't trained on ATC audio. Expect mistakes on callsigns and numbers, which is what the ChatGPT step and hand edits are for.
- Feeds that mix several frequencies only get one facility label. Set it to **Mixed feed** for those, and the phase is guessed from the wording instead.
- The scenarios are only as good as how much you've recorded. A few hours per airport is where the rankings start to mean something.

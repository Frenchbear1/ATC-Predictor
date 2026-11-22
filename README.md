# ATC Predictor

Pick your favorite LiveATC feeds, and this Chrome extension records them in the background and transcribes each radio call **on your own computer** (Whisper running inside Chrome, so there's no server and no API key). The website then groups the calls into scenarios by airport, facility, runway and phase of flight, so you can see what the controller is most likely to say next.

Personal use only. The favorites mode pulls LiveATC's audio streams directly, which their terms of use prohibit for third-party apps. Keep it to a few feeds for yourself, and don't republish the audio or transcripts.

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

## Record your favorite feeds (automatic)

1. Click the **ATC Predictor** icon, then **Manage…** (this opens the **Feeds** tab).
2. Under **Find feeds for an airport**, type an ICAO code (for example `KBOS`) and click **Find**.
3. Tick the feeds you want, like Tower and Ground. They appear at the top as favorites. You can also paste a LiveATC link or feed name (like `kbos_twr`) under **Add a feed by link or name**.
   Or let ChatGPT find them: under **Find feeds with ChatGPT**, type your airports (for example `KBOS, KBED`) and click **Copy prompt**. Paste the prompt into ChatGPT with web search on, then paste its reply into box 2 and click **Add these feeds**. Feeds ChatGPT couldn't confirm are added as *unverified* and left out of **Start all** until you check them with **Listen**.
4. Check each favorite's **Facility** (Tower, Ground…). It's guessed from the feed name.
5. Click **Start all**. The first time, the speech model downloads (about 80 MB for Base) and is cached after that.

The feeds record in the background with no tabs, windows or sound. Each favorite gets a green dot when it's connected, and the badge on the icon counts calls. Dropped streams reconnect on their own. Tick **Start favorites automatically when Chrome opens** if you want it to run every time Chrome starts. **Listen** opens the LiveATC player if you want to hear a feed.

Every feed shares one speech model on your laptop, so 2–4 feeds at a time is realistic. If calls pile up ("calls waiting to transcribe" in the popup), run fewer feeds or switch to the **Tiny** model in **Settings**.

### Feeds that share a frequency

LiveATC often has overlapping feeds, like a Tower feed and a combined Del/Gnd/Twr feed that both carry 128.8. Each favorite has a **Frequencies** box, which ChatGPT and **Find** fill in when they can. Shared frequencies are flagged with ⚠. When the same call arrives on two feeds a few seconds apart, it's saved once and tagged "also heard on". A pilot's readback is never merged with the controller's instruction. For older recordings, **Transmissions → Merge duplicates** cleans up copies that are already saved. If one feed fully covers another, you can turn the extra one off to save CPU.

### Or record the tab you're playing

Open a LiveATC player, press play, click the extension icon, open **Record this tab instead**, then click **Record this tab**.

### Tuning

In **Settings**: if calls get cut in half, raise **End-of-call gap**. If static gets transcribed, raise **Squelch sensitivity**. Changes apply the next time a feed starts.

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

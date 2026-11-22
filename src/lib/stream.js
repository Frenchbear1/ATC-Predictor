// Pulls a LiveATC (Icecast MP3) stream directly, with no tab and no player.
// Bytes are cut at MP3 frame boundaries and decoded to 16 kHz mono PCM with an
// OfflineAudioContext, so nothing has to play out loud and autoplay rules don't apply.

export function mountFromInput(input = '') {
  const s = input.trim();
  try {
    const u = new URL(s);
    if (u.searchParams.get('mount')) return u.searchParams.get('mount');
    const m = u.pathname.match(/\/(?:play\/)?([a-z0-9_.-]+?)(?:\.pls|\.m3u|\.mp3)?$/i);
    if (m) return m[1];
  } catch {}
  return s.replace(/\.(pls|m3u|mp3)$/i, '').replace(/[^a-z0-9_.-]/gi, '').toLowerCase();
}

export function airportFromMount(mount = '') {
  const m = mount.toUpperCase().match(/^([A-Z]{4})/);
  return m ? m[1] : '';
}

// Resolve a mount (e.g. "kbos_twr") to its actual stream URLs.
export async function resolveStreamUrls(mount) {
  const urls = [];
  try {
    const r = await fetch(`https://www.liveatc.net/play/${encodeURIComponent(mount)}.pls`, { cache: 'no-store' });
    if (r.ok) {
      const txt = await r.text();
      for (const m of txt.matchAll(/^File\d+=(.+)$/gim)) urls.push(m[1].trim());
    }
  } catch {}
  urls.push(`https://d.liveatc.net/${mount}`, `http://d.liveatc.net/${mount}`);
  // prefer https versions first
  const out = [];
  for (const u of urls) {
    const https = u.replace(/^http:/, 'https:');
    if (!out.includes(https)) out.push(https);
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

// Find the end of the last complete MP3/ADTS frame header in buf (returns index to cut at).
function lastFrameStart(buf, from) {
  for (let i = buf.length - 4; i > from; i--) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const b2 = buf[i + 2];
      const bitrateIdx = b2 >> 4; const srIdx = (b2 >> 2) & 3;
      // valid MPEG audio header, or ADTS (AAC) sync 0xFFF
      if ((bitrateIdx !== 15 && bitrateIdx !== 0 && srIdx !== 3) || (buf[i + 1] & 0xf6) === 0xf0) return i;
    }
  }
  return -1;
}

const decodeCtx = () => new OfflineAudioContext(1, 1, 16000);

async function decodeChunk(bytes) {
  // decodeAudioData resamples to the context rate (16 kHz)
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const audio = await decodeCtx().decodeAudioData(ab);
  const ch0 = audio.getChannelData(0);
  if (audio.numberOfChannels === 1) return ch0;
  const ch1 = audio.getChannelData(1); const out = new Float32Array(ch0.length);
  for (let i = 0; i < out.length; i++) out[i] = (ch0[i] + ch1[i]) / 2;
  return out;
}

// Opens the stream and keeps it open (reconnecting) until stop() is called.
// onPcm(Float32Array @16kHz), onStatus({state, detail})
export function openStream(mount, { onPcm, onStatus }) {
  let stopped = false; let ctrl = null; let attempt = 0;
  const CHUNK_BYTES = 8 * 1024; // ~2 s at 32 kbps (LiveATC feeds are low bitrate mono)

  async function runOnce() {
    const urls = await resolveStreamUrls(mount);
    let lastErr = 'no stream URL';
    for (const url of urls) {
      if (stopped) return;
      ctrl = new AbortController();
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok || !res.body) { lastErr = `HTTP ${res.status}`; continue; }
        onStatus({ state: 'listening', detail: 'Connected' });
        attempt = 0;
        const reader = res.body.getReader();
        let buf = new Uint8Array(0);
        let started = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done || stopped) {
            if (done && buf.length > 512) { try { onPcm(await decodeChunk(buf)); } catch {} }
            break;
          }
          const merged = new Uint8Array(buf.length + value.length); merged.set(buf); merged.set(value, buf.length); buf = merged;
          if (buf.length < CHUNK_BYTES) continue;
          // first chunk: skip any partial frame at the very start
          let start = 0;
          if (!started) { for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) { start = i; break; } started = true; }
          const cut = lastFrameStart(buf, start + 1);
          if (cut <= start) continue;
          const piece = buf.subarray(start, cut);
          buf = buf.slice(cut);
          try { onPcm(await decodeChunk(piece)); } catch (e) { /* bad chunk, skip */ }
        }
        lastErr = 'stream ended';
      } catch (e) {
        if (stopped) return;
        lastErr = e?.message || String(e);
      }
    }
    throw new Error(lastErr);
  }

  (async () => {
    while (!stopped) {
      try { await runOnce(); } catch (e) {
        if (stopped) break;
        attempt++;
        const wait = Math.min(60, 2 ** Math.min(attempt, 6));
        onStatus({ state: 'reconnecting', detail: `${e.message} · retrying in ${wait}s` });
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
    }
  })();

  return { stop() { stopped = true; try { ctrl?.abort(); } catch {} } };
}

// Look up the feeds LiveATC lists for an airport (scrapes its search page).
export async function findFeeds(icao) {
  const r = await fetch(`https://www.liveatc.net/search/?icao=${encodeURIComponent(icao.toLowerCase())}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`LiveATC search failed (HTTP ${r.status})`);
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const feeds = new Map();
  for (const a of doc.querySelectorAll('a[href*="mount="], a[href*="/play/"]')) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/mount=([a-z0-9_.-]+)/i) || href.match(/\/play\/([a-z0-9_.-]+)\.pls/i);
    if (!m) continue;
    const mount = m[1].toLowerCase();
    if (feeds.has(mount)) continue;
    // nearest heading-ish text for a label
    let label = '';
    const row = a.closest('table, tr, div');
    const strong = row?.querySelector('strong, b, h3, h2');
    if (strong) label = strong.textContent.replace(/\s+/g, ' ').trim();
    // frequencies listed in the same feed block (best effort)
    let block = a.closest('table'); if (block?.parentElement?.closest('table')) block = block.parentElement.closest('table');
    const freqs = [...new Set(((block || row)?.textContent || '').match(/\b1[1-3]\d\.\d{1,3}\b/g) || [])];
    feeds.set(mount, { mount, label: label || mount, freqs });
  }
  return [...feeds.values()];
}

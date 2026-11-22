// Offscreen document: records audio (direct LiveATC streams and/or a captured tab),
// splits it into transmissions using squelch gaps, transcribes each one with Whisper
// (runs locally in the browser) and saves it. Several feeds can run at once; they share
// one speech model and one transcription queue.
import { pipeline, env } from '@huggingface/transformers';
import { db, newId } from '../lib/db.js';
import { parseTransmission, looksLikeJunk } from '../lib/atc.js';
import { makeVad, resampleTo16k, toWav } from '../lib/audio.js';
import { openStream } from '../lib/stream.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/');

const sessions = new Map(); // id -> { id, kind, meta, settings, vad, stop() }
const queue = [];
let busy = false;
let asr = null;
let asrModel = null;
let loading = null;
const MAX_QUEUE = 40;

const send = (m) => chrome.runtime.sendMessage(m).catch(() => {});
const status = (s) => send({ type: 'status', status: s });
const feedStatus = (id, s) => send({ type: 'feedStatus', id, status: s });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  const fail = (e) => status({ state: 'error', detail: String(e?.message || e) });
  if (msg.type === 'start') startTab(msg).catch(fail);
  if (msg.type === 'startFeeds') startFeeds(msg).catch(fail);
  if (msg.type === 'stopFeed') stopSession(msg.id);
  if (msg.type === 'stop') stopAll();
});

async function loadModel(model) {
  if (asr && asrModel === model) return asr;
  if (loading?.model === model) return loading.p;
  const p = (async () => {
    const progress = {};
    const cb = (x) => {
      if (x.status === 'progress' && x.file) {
        progress[x.file] = x;
        const loaded = Object.values(progress).reduce((a, y) => a + (y.loaded || 0), 0);
        const total = Object.values(progress).reduce((a, y) => a + (y.total || 0), 0);
        if (total) status({ state: 'loading', detail: `Downloading model ${Math.round((loaded / total) * 100)}% (first time only)` });
      }
    };
    status({ state: 'loading', detail: 'Loading speech model…' });
    const tryLoad = (device) => pipeline('automatic-speech-recognition', model, {
      device,
      dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
      progress_callback: cb,
    });
    let a = null;
    if ('gpu' in navigator) {
      try { a = await tryLoad('webgpu'); } catch (e) { console.warn('WebGPU failed, using WASM', e); }
    }
    if (!a) a = await tryLoad('wasm');
    asr = a; asrModel = model;
    return a;
  })();
  loading = { model, p };
  try { return await p; } finally { loading = null; }
}

function overall() {
  const n = sessions.size;
  if (!n) return status({ state: 'idle', detail: 'Stopped' });
  status({ state: 'listening', detail: `Recording ${n} feed${n > 1 ? 's' : ''}${queue.length > 3 ? ` · ${queue.length} calls waiting to transcribe` : ''}` });
}

// --- direct LiveATC streams ---------------------------------------------------
async function startFeeds({ feeds, settings }) {
  await loadModel(settings?.model || 'Xenova/whisper-base.en');
  for (const f of feeds) {
    const id = `feed:${f.mount}`;
    if (sessions.has(id)) continue;
    const meta = { airport: f.airport, feed: f.mount, facility: f.facility };
    const s = { id, kind: 'feed', meta, settings, vad: makeVad(16000, settings) };
    feedStatus(id, { state: 'connecting', detail: 'Connecting…', count: 0 });
    const h = openStream(f.mount, {
      onPcm: (pcm) => { const seg = s.vad.push(pcm); if (seg) enqueue(s, seg); },
      onStatus: (st) => feedStatus(id, st),
    });
    s.stop = () => h.stop();
    sessions.set(id, s);
  }
  overall();
}

// --- captured tab ---------------------------------------------------------------
async function startTab({ streamId, meta, settings }) {
  stopSession('tab');
  await loadModel(settings?.model || 'Xenova/whisper-base.en');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  src.connect(ctx.destination); // keep the tab audible while we capture it
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;
  src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
  const s = { id: 'tab', kind: 'tab', meta, settings, vad: makeVad(ctx.sampleRate, settings) };
  proc.onaudioprocess = (e) => { const seg = s.vad.push(e.inputBuffer.getChannelData(0)); if (seg) enqueue(s, seg); };
  s.stop = () => {
    try { proc.disconnect(); } catch {}
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  stream.getAudioTracks()[0].addEventListener('ended', () => stopSession('tab'));
  sessions.set('tab', s);
  overall();
}

// --- stopping -----------------------------------------------------------------------
function stopSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  const tail = s.vad.flush();
  if (tail) enqueue(s, tail);
  try { s.stop(); } catch {}
  sessions.delete(id);
  if (s.kind === 'feed') feedStatus(id, { state: 'idle', detail: 'Stopped' });
  overall();
  maybeClose();
}

function stopAll() {
  for (const id of [...sessions.keys()]) stopSession(id);
  maybeClose();
}

function maybeClose() {
  if (sessions.size) return;
  const wait = () => (busy || queue.length ? setTimeout(wait, 500) : send({ type: 'closed' }));
  wait();
}

// --- transcription queue --------------------------------------------------------------
function enqueue(s, seg) {
  queue.push({ s, seg });
  if (queue.length > MAX_QUEUE) queue.shift(); // falling behind: drop oldest
  drain();
}

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const { s, seg } = queue.shift();
    try {
      const audio = resampleTo16k(seg.samples, seg.sampleRate);
      const res = await asr(audio, { chunk_length_s: 30 });
      const raw = (res?.text || '').trim();
      if (!raw || looksLikeJunk(raw)) continue;
      const meta = s.meta || {};
      const parsed = parseTransmission(raw, { facility: meta.facility });
      const tx = {
        id: newId(), ts: seg.startedAt, airport: (meta.airport || '').toUpperCase(), feed: meta.feed || '',
        facility: meta.facility || 'mixed', source: s.kind === 'feed' ? 'stream' : 'capture', model: asrModel,
        durationSec: +(audio.length / 16000).toFixed(1), raw, text: raw, ...parsed, hasAudio: !!s.settings?.keepAudio,
      };
      await db.put(tx);
      if (tx.hasAudio) await db.putAudio(tx.id, toWav(audio));
      send({ type: 'tx', tx, sessionId: s.id });
    } catch (e) {
      console.error(e);
      status({ state: sessions.size ? 'listening' : 'idle', detail: `Transcribe error: ${e?.message || e}` });
    }
    if (queue.length % 5 === 0) overall();
  }
  busy = false;
}

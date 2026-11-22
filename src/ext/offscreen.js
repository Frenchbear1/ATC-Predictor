// Offscreen document: captures tab audio, splits it into transmissions using squelch
// gaps, transcribes each one with Whisper (runs locally in the browser) and saves it.
import { pipeline, env } from '@huggingface/transformers';
import { db, newId } from '../lib/db.js';
import { parseTransmission, looksLikeJunk } from '../lib/atc.js';
import { makeVad, resampleTo16k, toWav } from '../lib/audio.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/');

let session = null; // { stream, ctx, proc, meta, settings, queue, stopped }
let asr = null;
let asrModel = null;

const status = (s) => chrome.runtime.sendMessage({ type: 'status', status: s }).catch(() => {});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg).catch((e) => status({ state: 'error', detail: String(e?.message || e) }));
  if (msg.type === 'stop') stop();
});

async function loadModel(model) {
  if (asr && asrModel === model) return asr;
  const progress = {};
  const cb = (p) => {
    if (p.status === 'progress' && p.file) {
      progress[p.file] = p;
      const loaded = Object.values(progress).reduce((a, x) => a + (x.loaded || 0), 0);
      const total = Object.values(progress).reduce((a, x) => a + (x.total || 0), 0);
      if (total) status({ state: 'loading', detail: `Downloading model ${Math.round((loaded / total) * 100)}% (first time only)` });
    }
  };
  status({ state: 'loading', detail: 'Loading speech model…' });
  const tryLoad = async (device) => pipeline('automatic-speech-recognition', model, {
    device,
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: cb,
  });
  let device = 'wasm';
  if ('gpu' in navigator) {
    try { asr = await tryLoad('webgpu'); device = 'webgpu'; } catch (e) { console.warn('WebGPU failed, using WASM', e); asr = null; }
  }
  if (!asr) asr = await tryLoad('wasm');
  asrModel = model;
  console.log('ASR ready on', device);
  return asr;
}

async function start({ streamId, meta, settings }) {
  if (session) stop();
  const model = settings?.model || 'Xenova/whisper-base.en';
  await loadModel(model);

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

  const s = {
    stream, ctx, proc, meta, settings, queue: [], busy: false, stopped: false, count: 0,
    vad: makeVad(ctx.sampleRate, settings),
  };
  session = s;

  proc.onaudioprocess = (e) => {
    if (s.stopped) return;
    const input = e.inputBuffer.getChannelData(0);
    const seg = s.vad.push(input);
    if (seg) enqueue(s, seg);
  };
  stream.getAudioTracks()[0].addEventListener('ended', () => stop());
  status({ state: 'listening', detail: `Listening to ${meta?.airport || '?'} ${meta?.feed || ''}`.trim() });
}

function stop() {
  const s = session;
  if (!s) { chrome.runtime.sendMessage({ type: 'closed' }).catch(() => {}); return; }
  s.stopped = true;
  const tail = s.vad.flush();
  if (tail) enqueue(s, tail);
  try { s.proc.disconnect(); } catch {}
  s.stream.getTracks().forEach((t) => t.stop());
  s.ctx.close().catch(() => {});
  session = null;
  // let queued transcriptions finish, then close
  const wait = () => (s.busy || s.queue.length ? setTimeout(wait, 500) : chrome.runtime.sendMessage({ type: 'closed' }).catch(() => {}));
  wait();
}

function enqueue(s, seg) {
  s.queue.push(seg);
  if (s.queue.length > 20) s.queue.shift(); // falling behind: drop oldest
  drain(s);
}

async function drain(s) {
  if (s.busy) return;
  s.busy = true;
  while (s.queue.length) {
    const seg = s.queue.shift();
    try {
      const audio = resampleTo16k(seg.samples, seg.sampleRate);
      const res = await asr(audio, { chunk_length_s: 30 });
      const raw = (res?.text || '').trim();
      if (!raw || looksLikeJunk(raw)) continue;
      const meta = s.meta || {};
      const parsed = parseTransmission(raw, { facility: meta.facility });
      const tx = {
        id: newId(), ts: seg.startedAt, airport: (meta.airport || '').toUpperCase(), feed: meta.feed || '',
        facility: meta.facility || 'mixed', source: 'capture', model: asrModel,
        durationSec: +(audio.length / 16000).toFixed(1), raw, text: raw, ...parsed, hasAudio: !!s.settings?.keepAudio,
      };
      await db.put(tx);
      if (tx.hasAudio) await db.putAudio(tx.id, toWav(audio));
      s.count++;
      chrome.runtime.sendMessage({ type: 'tx', tx }).catch(() => {});
    } catch (e) {
      console.error(e);
      status({ state: session ? 'listening' : 'idle', detail: `Transcribe error: ${e?.message || e}` });
    }
  }
  s.busy = false;
}

// --- voice activity / squelch detection --------------------------------------
// LiveATC feeds are squelched, so gaps between transmissions are near-silent.
export function makeVad(sampleRate, settings = {}) {
  const frame = Math.round(sampleRate * 0.02); // 20 ms
  const sens = settings.sensitivity ?? 3;      // x noise floor
  const absMin = 0.004;
  const hangFrames = Math.round((settings.gapMs ?? 700) / 20);
  const preFrames = 10; // 200 ms pre-roll
  const minVoiced = 12; // need ≥240 ms of actual signal (drops clicks)
  const maxFrames = 1500; // 30 s
  let floor = 0.002;
  let buf = new Float32Array(0);
  let pre = [];
  let cur = null; let quiet = 0; let loud = 0; let voiced = 0;

  function frameRms(f) { let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i]; return Math.sqrt(s / f.length); }
  function finish() {
    let frames = cur; const v = voiced; const q = quiet; cur = null; quiet = 0; voiced = 0;
    if (!frames || v < minVoiced) return null;
    if (q > 10) frames = frames.slice(0, frames.length - (q - 10)); // keep only 200 ms of trailing silence
    const out = new Float32Array(frames.length * frame);
    frames.forEach((f, i) => out.set(f, i * frame));
    return { samples: out, sampleRate, startedAt: Date.now() - Math.round((frames.length * frame / sampleRate) * 1000) };
  }
  return {
    push(chunk) {
      const merged = new Float32Array(buf.length + chunk.length); merged.set(buf); merged.set(chunk, buf.length);
      let off = 0; let result = null;
      while (off + frame <= merged.length) {
        const f = merged.slice(off, off + frame); off += frame;
        const rms = frameRms(f);
        const thr = Math.max(floor * sens, absMin);
        const on = rms > thr;
        if (!cur) {
          pre.push(f); if (pre.length > preFrames) pre.shift();
          if (on) { loud++; if (loud >= 3) { cur = [...pre]; pre = []; loud = 0; voiced = 3; } } else { loud = 0; floor = floor * 0.99 + rms * 0.01; }
        } else {
          cur.push(f);
          quiet = on ? 0 : quiet + 1; if (on) voiced++;
          if (quiet >= hangFrames || cur.length >= maxFrames) { const r = finish(); if (r) result = r; }
        }
      }
      buf = merged.slice(off);
      return result;
    },
    flush() { return cur ? finish() : null; },
  };
}

export function resampleTo16k(samples, rate) {
  const ratio = rate / 16000;
  const n = Math.floor(samples.length / ratio);
  const out = rate === 16000 ? Float32Array.from(samples) : new Float32Array(n);
  for (let i = 0; rate !== 16000 && i < n; i++) {
    // box-filter average over the source window (simple anti-alias)
    const a = Math.floor(i * ratio); const b = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += samples[j];
    out[i] = s / Math.max(1, b - a);
  }
  // normalize loudness a bit
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0 && peak < 0.5) { const g = 0.7 / peak; for (let i = 0; i < n; i++) out[i] *= g; }
  return out;
}

export function toWav(f32) {
  const buf = new ArrayBuffer(44 + f32.length * 2); const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, f32.length * 2, true);
  for (let i = 0; i < f32.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}


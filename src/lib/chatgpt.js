// Build a cleanup prompt to paste into ChatGPT, and apply the JSON it sends back.
import { PHASES, parseTransmission } from './atc.js';

export function buildPrompt(txs) {
  const airports = [...new Set(txs.map((t) => t.airport).filter(Boolean))].join(', ') || 'unknown';
  const lines = txs.map((t, i) => `${i + 1} | ${t.airport || '?'} ${t.facility || ''} | ${(t.corrected || t.text || t.raw || '').replace(/\s+/g, ' ')}`);
  const prompt = `You are cleaning up automatic speech-to-text transcripts of US air traffic control radio (FAA phraseology, 7110.65 / AIM style).
Airports: ${airports}. Each line is one radio transmission from the facility shown.

For every line:
1. Fix speech-recognition mistakes: callsigns, airline telephony, N-numbers, numbers, phonetic letters, taxiway names, fixes, SIDs/STARs, frequencies, runway numbers. Use what makes sense for that airport.
2. Write it the way it would be printed in a training guide: numbers as digits (runway 27L, heading 270, climb and maintain 3000, 124.75, squawk 4521, altimeter 29.92), taxiways and letters as capitals (taxi via A, B3), airline names normally (JetBlue 1234, N123AB).
3. Don't invent words that aren't implied by the transcript. If a part is unreadable, keep it as close as you can and lower confidence.
4. Decide who is talking: "atc" (controller) or "pilot".
5. Pick the phase of flight, one of: ${PHASES.join(', ')}.
6. Give a short plain-English meaning a student pilot would understand.
7. Set "junk": true if it isn't a real ATC/pilot transmission (music, noise, hallucinated filler).

Reply with ONLY a JSON array (no prose, no code fence), one object per line, same numbers:
[{"n":1,"text":"...","speaker":"atc","phase":"taxi-out","meaning":"...","confidence":0.9,"junk":false}]

Lines (n | airport facility | transcript):
${lines.join('\n')}`;
  return { prompt, map: txs.map((t) => t.id) };
}

export function parseReply(raw) {
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = s.indexOf('['); const b = s.lastIndexOf(']');
  if (a !== -1 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch {}
  }
  // JSON lines fallback
  const out = [];
  for (const line of s.split('\n')) {
    const t = line.trim().replace(/,$/, '');
    if (t.startsWith('{')) { try { out.push(JSON.parse(t)); } catch {} }
  }
  if (!out.length) throw new Error("Couldn't find a JSON array in what you pasted. Make sure you copied ChatGPT's whole reply.");
  return out;
}

export function applyReply(txs, map, raw) {
  const rows = parseReply(raw);
  const byId = new Map(txs.map((t) => [t.id, t]));
  const updated = []; let junk = 0; const missing = [];
  for (const r of rows) {
    const n = +(r.n ?? r.id ?? r.line);
    const id = map[n - 1];
    const tx = id && byId.get(id);
    if (!tx) { missing.push(n); continue; }
    const text = (r.text || r.corrected || '').trim();
    const next = { ...tx };
    if (text) {
      next.corrected = text;
      Object.assign(next, parseTransmission(text, { facility: tx.facility }));
      next.text = text;
    }
    if (r.speaker === 'atc' || r.speaker === 'pilot') next.speaker = r.speaker;
    if (PHASES.includes(r.phase)) next.phase = r.phase;
    if (r.meaning) next.meaning = String(r.meaning);
    if (typeof r.confidence === 'number') next.confidence = r.confidence;
    next.junk = !!r.junk; if (next.junk) junk++;
    next.cleaned = true; next.cleanedAt = Date.now();
    updated.push(next);
  }
  return { updated, junk, missing };
}

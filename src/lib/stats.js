// Group transmissions into "scenarios" (same template) and rank them.
import { PHASES } from './atc.js';

const FILLER = /\b(uh+|um+|ah+|the|and|a|good day|good morning|good afternoon|good evening|thanks|thank you|please|sir|ma'am)\b/g;

export function groupKey(tx) {
  const t = (tx.template || '').toLowerCase().replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  return `${tx.speaker}|${tx.phase}|${t}`;
}

function topValues(list, n = 3) {
  const c = new Map();
  for (const v of list) c.set(v, (c.get(v) || 0) + 1);
  const total = list.length;
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count, pct: count / total }));
}

export function buildScenarios(txs) {
  const groups = new Map();
  for (const tx of txs) {
    const k = groupKey(tx);
    let g = groups.get(k);
    if (!g) { g = { key: k, speaker: tx.speaker, phase: tx.phase, items: [], templates: new Map(), slotVals: {}, intents: new Map() }; groups.set(k, g); }
    g.items.push(tx);
    g.templates.set(tx.template, (g.templates.get(tx.template) || 0) + 1);
    for (const [name, vals] of Object.entries(tx.slots || {})) {
      if (name === 'CALLSIGN' || name === 'N') continue;
      const pos = (g.slotVals[name] ||= []);
      vals.forEach((v, i) => (pos[i] ||= []).push(v));
    }
    for (const i of tx.intents || []) g.intents.set(i, (g.intents.get(i) || 0) + 1);
  }
  const total = txs.length || 1;
  return [...groups.values()].map((g) => {
    const template = [...g.templates.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const slots = {}; const slotsPos = {};
    for (const [n, pos] of Object.entries(g.slotVals)) { slots[n] = topValues(pos.flat()); slotsPos[n] = pos.map((v) => topValues(v)); }
    const items = g.items.sort((a, b) => b.ts - a.ts);
    const meanings = items.map((t) => t.meaning).filter(Boolean);
    return {
      key: g.key, speaker: g.speaker, phase: g.phase, template, count: items.length, share: items.length / total,
      slots, slotsPos, intents: [...g.intents.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i).slice(0, 3),
      examples: items.slice(0, 6), meaning: meanings[0] || '', airports: [...new Set(items.map((t) => t.airport))],
      lastTs: items[0]?.ts || 0,
    };
  }).sort((a, b) => b.count - a.count || b.lastTs - a.lastTs);
}

// For an ATC call, find the pilot reply that followed (same feed, within 20 s).
export function attachReplies(txs) {
  const byFeed = new Map();
  for (const t of txs) { const k = `${t.airport}|${t.feed}`; (byFeed.get(k) || byFeed.set(k, []).get(k)).push(t); }
  const replies = new Map();
  for (const list of byFeed.values()) {
    list.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]; const b = list[i + 1];
      if (a.speaker === 'atc' && b.speaker === 'pilot' && b.ts - a.ts < 20000) replies.set(a.id, b);
    }
  }
  return replies;
}

export function flightScript(txs, { perPhase = 3 } = {}) {
  const order = PHASES.filter((p) => p !== 'other');
  return order.map((phase) => {
    const inPhase = txs.filter((t) => t.phase === phase);
    const atc = buildScenarios(inPhase.filter((t) => t.speaker === 'atc')).slice(0, perPhase);
    const pilot = buildScenarios(inPhase.filter((t) => t.speaker === 'pilot')).slice(0, perPhase);
    return { phase, total: inPhase.length, atc, pilot };
  }).filter((p) => p.total > 0);
}

// Short pilot readbacks ("tower 119.1, 3AB") rarely say which phase they belong to.
// Borrow the phase from the ATC call they answer (same feed, within 20 s). In-memory only.
export function withContext(txs) {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const lastAtc = new Map();
  return sorted.map((t) => {
    const k = `${t.airport}|${t.feed}`;
    const prev = lastAtc.get(k);
    let out = t;
    if (!t.cleaned && prev && t.ts - prev.ts < 20000 && t.speaker !== 'atc' && (t.phase === 'other' || t.speaker === 'unknown')) {
      out = { ...t, phase: t.phase === 'other' ? prev.phase : t.phase, speaker: t.speaker === 'unknown' ? 'pilot' : t.speaker, inferred: true };
    }
    if (out.speaker === 'atc') lastAtc.set(k, out);
    return out;
  });
}

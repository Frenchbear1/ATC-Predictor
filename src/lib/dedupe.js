// Several LiveATC feeds often carry the same frequency (e.g. "KBOS Tower" and a
// combined "KBOS Del/Gnd/Twr" feed). The same radio call then arrives twice, a few
// seconds apart. These helpers spot those copies so each call is only counted once.

export function normFreq(f) {
  const m = String(f).match(/(1[1-3]\d)\.?(\d{1,3})?/);
  if (!m) return null;
  const n = (m[2] || '0').padEnd(3, '0');
  return `${m[1]}.${n}`.replace(/0+$/, '').replace(/\.$/, '.0');
}

export function parseFreqs(input) {
  if (Array.isArray(input)) return [...new Set(input.map(normFreq).filter(Boolean))];
  return [...new Set(String(input || '').split(/[^0-9.]+/).map(normFreq).filter(Boolean))];
}

// Pairs of favorites that share at least one frequency: [{a, b, freqs:[...]}]
export function overlaps(feeds) {
  const out = [];
  for (let i = 0; i < feeds.length; i++) {
    for (let j = i + 1; j < feeds.length; j++) {
      const fa = parseFreqs(feeds[i].freqs); const fb = parseFreqs(feeds[j].freqs);
      const shared = fa.filter((x) => fb.includes(x));
      if (shared.length) out.push({ a: feeds[i].mount, b: feeds[j].mount, freqs: shared });
    }
  }
  return out;
}

function squash(t) {
  return (t.norm || t.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Character-trigram Dice similarity on text with spaces removed, so "jet blue" ~ "jetblue"
// and "take off" ~ "takeoff" still match.
export function similarity(a, b) {
  const sa = squash(a); const sb = squash(b);
  if (sa.length < 3 || sb.length < 3) return sa === sb ? 1 : 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 2; i++) { const g = s.slice(i, i + 3); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const ga = grams(sa); const gb = grams(sb);
  let inter = 0;
  for (const [g, c] of ga) inter += Math.min(c, gb.get(g) || 0);
  return (2 * inter) / (sa.length - 2 + sb.length - 2);
}

// freqMap: feed mount -> [freqs] (may be empty/unknown)
export function isDuplicate(a, b, freqMap = {}, { windowMs = 8000, minSim = 0.75 } = {}) {
  if (!a || !b || a.id === b.id) return false;
  if (a.feed === b.feed) return false;                 // same feed: a repeat is a real repeat
  if (a.airport !== b.airport) return false;
  if (Math.abs(a.ts - b.ts) > windowMs) return false;
  const fa = parseFreqs(freqMap[a.feed]); const fb = parseFreqs(freqMap[b.feed]);
  if (fa.length && fb.length && !fa.some((x) => fb.includes(x))) return false; // known to share nothing
  if (a.speaker !== 'unknown' && b.speaker !== 'unknown' && a.speaker !== b.speaker) return false; // readback, not a copy
  return similarity(a, b) >= minSim;
}

// For already-saved data: returns { keep: Map(id -> alsoOn[]), drop: [ids] }.
// Keeps the earliest copy (or the cleaned one) and records the other feeds on it.
export function findDuplicates(txs, freqMap = {}) {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const drop = new Set(); const keep = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]; if (drop.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length && sorted[j].ts - a.ts <= 8000; j++) {
      const b = sorted[j]; if (drop.has(b.id)) continue;
      if (!isDuplicate(a, b, freqMap)) continue;
      const [winner, loser] = b.cleaned && !a.cleaned ? [b, a] : [a, b];
      drop.add(loser.id);
      const also = keep.get(winner.id) || [...(winner.alsoOn || [])];
      for (const f of [loser.feed, ...(loser.alsoOn || [])]) if (f && f !== winner.feed && !also.includes(f)) also.push(f);
      keep.set(winner.id, also);
      if (winner === b) break;
    }
  }
  return { keep, drop: [...drop] };
}

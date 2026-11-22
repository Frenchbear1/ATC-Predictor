import { PHASES, PHASE_LABELS, FACILITIES, FACILITY_LABELS, parseTransmission, facilityFromFeed } from '../lib/atc.js';
import { db } from '../lib/db.js';
import { buildScenarios, flightScript, attachReplies, withContext } from '../lib/stats.js';
import { buildPrompt, applyReply, buildFeedPrompt, parseFeedReply } from '../lib/chatgpt.js';
import { overlaps, parseFreqs, findDuplicates } from '../lib/dedupe.js';
import { makeSample } from '../lib/sample.js';
import { findFeeds, mountFromInput, airportFromMount } from '../lib/stream.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const fmtTime = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const IN_EXT = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

let all = [];        // stored records
let view = [];       // with context (inferred phases)
let tab = 'predict';
let listLimit = 150;
const selected = new Set();
const PREF_KEY = 'atcp-filters';

// ---------- data ----------
async function load() {
  all = await db.all();
  view = withContext(all);
  fillFilterOptions();
  render();
}

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}

// ---------- filters ----------
function opt(v, label, cur) { return `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`; }

function fillFilterOptions() {
  const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  const cur = (id) => ($(id).dataset.ready ? $(id).value : saved[id]);
  const airports = [...new Set(all.map((t) => t.airport).filter(Boolean))].sort();
  const a = cur('fAirport');
  $('fAirport').innerHTML = opt('', 'All airports', a) + airports.map((x) => opt(x, x, a)).join('');
  const f = cur('fFacility');
  $('fFacility').innerHTML = opt('', 'All', f) + FACILITIES.map((x) => opt(x, FACILITY_LABELS[x], f)).join('');
  const p = cur('fPhase');
  $('fPhase').innerHTML = opt('', 'All phases', p) + PHASES.map((x) => opt(x, PHASE_LABELS[x], p)).join('');
  const rws = new Set();
  for (const t of all) if (!a || t.airport === a) for (const r of t.slots?.RWY || []) rws.add(r);
  const r = cur('fRunway');
  $('fRunway').innerHTML = opt('', 'Any', r) + [...rws].sort((x, y) => parseInt(x) - parseInt(y)).map((x) => opt(x, x, r)).join('');
  for (const id of ['fSpeaker', 'fWhen']) if (!$(id).dataset.ready && saved[id] != null) $(id).value = saved[id];
  if (!$('fSearch').dataset.ready && saved.fSearch) $('fSearch').value = saved.fSearch;
  ['fAirport', 'fFacility', 'fPhase', 'fRunway', 'fSpeaker', 'fWhen', 'fSearch'].forEach((id) => { $(id).dataset.ready = '1'; });
  $('count').textContent = `${all.length} calls`;
}

function saveFilters() {
  const v = {}; for (const id of ['fAirport', 'fFacility', 'fPhase', 'fRunway', 'fSpeaker', 'fWhen', 'fSearch']) v[id] = $(id).value;
  localStorage.setItem(PREF_KEY, JSON.stringify(v));
}

function filtered({ ignoreSpeaker = false, ignorePhase = false } = {}) {
  const a = $('fAirport').value, f = $('fFacility').value, p = $('fPhase').value, s = $('fSpeaker').value;
  const r = $('fRunway').value, w = +$('fWhen').value, q = $('fSearch').value.trim().toLowerCase();
  const since = w ? Date.now() - w * 86400000 : 0;
  return view.filter((t) => (!a || t.airport === a)
    && (!f || t.facility === f)
    && (ignorePhase || !p || t.phase === p)
    && (ignoreSpeaker || !s || t.speaker === s)
    && (!r || (t.slots?.RWY || []).includes(r))
    && (!since || t.ts >= since)
    && (!$('fHideJunk').checked || !t.junk)
    && (!q || `${t.text} ${t.norm} ${t.raw} ${t.meaning || ''}`.toLowerCase().includes(q)));
}

// ---------- rendering ----------
function renderTemplate(tpl, slots, ex, slotsPos) {
  // fill slots with the most common value, in order of appearance
  const counters = {};
  return esc(tpl).replace(/\{([A-Z]+)\}/g, (_, name) => {
    if (name === 'CALLSIGN') return '<span class="slot cs" title="Callsign">callsign</span>';
    const idx = counters[name] = (counters[name] ?? -1) + 1;
    const choices = slotsPos?.[name]?.[idx] || slots?.[name] || [];
    let val = choices[0]?.value ?? null;
    if (!val && ex?.slots?.[name]) val = ex.slots[name][idx] ?? ex.slots[name][0];
    const tip = choices.map((v) => `${v.value} (${pct(v.pct)})`).join(', ') || name;
    return `<span class="slot" title="${esc(name)}: ${esc(tip)}">${esc(val ?? name.toLowerCase())}</span>`;
  });
}

const SLOT_NAMES = { RWY: 'Runway', TWY: 'Taxiways', ALT: 'Altitude', FL: 'Flight level', HDG: 'Heading', FREQ: 'Frequency', SQUAWK: 'Squawk', ALTIM: 'Altimeter', WIND: 'Wind', SPD: 'Speed', INFO: 'ATIS', DIST: 'Miles', CLOCK: "O'clock" };

function slotSummary(slots) {
  return Object.entries(slots).filter(([n]) => SLOT_NAMES[n]).map(([n, vals]) =>
    `<span>${SLOT_NAMES[n]}: ${vals.map((v) => `<b>${esc(v.value)}</b> ${pct(v.pct)}`).join(' · ')}</span>`).join('');
}

function exampleRows(items, replies) {
  return items.map((t) => {
    const rep = replies?.get(t.id);
    return `<div class="exrow"><time>${fmtTime(t.ts)}</time>${t.hasAudio ? `<button class="play" data-play="${t.id}">▶</button>` : ''}
      <div>${esc(t.text)} <span class="muted">· ${esc(t.airport)} ${esc(FACILITY_LABELS[t.facility] || '')}${t.cleaned ? ' · cleaned' : ''}${t.source === 'sample' ? ' · sample' : ''}</span>
      ${rep ? `<div class="reply"><span>Reply:</span> ${esc(rep.text)}</div>` : ''}</div></div>`;
  }).join('');
}

function renderPredict() {
  const txs = filtered();
  const sc = buildScenarios(txs);
  const replies = attachReplies(view);
  const a = $('fAirport').value || 'all airports';
  const p = $('fPhase').value ? PHASE_LABELS[$('fPhase').value] : 'every phase';
  const who = { atc: 'controller calls', pilot: 'pilot calls', '': 'calls' }[$('fSpeaker').value];
  $('predictHead').innerHTML = `<h2>Most likely ${who} · ${esc(a)} · ${esc(p)}</h2>
    <p class="muted">${txs.length} transmissions grouped into ${sc.length} scenarios. Percentages are share of the filtered calls. Hover a blue value to see the alternatives.</p>`;
  if (!all.length) { $('scenarios').innerHTML = ''; $('scenarios').append($('tplEmpty').content.cloneNode(true)); return; }
  if (!sc.length) { $('scenarios').innerHTML = '<div class="empty"><p>Nothing matches these filters.</p></div>'; return; }
  $('scenarios').innerHTML = sc.slice(0, 60).map((g, i) => {
    const rep = g.speaker === 'atc' ? topReply(g, replies) : null;
    return `<article class="sc">
      <div class="rank"><b>${i + 1}</b><small>${g.count}× · ${pct(g.share)}</small><div class="bar"><i style="width:${Math.max(4, g.share * 100)}%"></i></div></div>
      <div>
        <div class="tpl">${renderTemplate(g.template, g.slots, g.examples[0], g.slotsPos)}</div>
        <div class="meta"><span class="chip ${g.speaker}">${g.speaker === 'atc' ? 'Controller' : g.speaker === 'pilot' ? 'Pilot' : 'Unknown'}</span>
          <span class="chip ph">${esc(PHASE_LABELS[g.phase] || g.phase)}</span>
          ${g.intents.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}
          ${g.airports.length > 1 ? `<span class="chip">${g.airports.length} airports</span>` : ''}</div>
        ${Object.keys(g.slots).length ? `<div class="vals">${slotSummary(g.slots)}</div>` : ''}
        ${g.meaning ? `<div class="meaning">${esc(g.meaning)}</div>` : ''}
        ${rep ? `<div class="reply"><span>Typical readback:</span> ${esc(rep)}</div>` : ''}
        <details class="ex"><summary>Real examples (${Math.min(g.count, 6)} of ${g.count})</summary>${exampleRows(g.examples, replies)}</details>
      </div></article>`;
  }).join('');
}

function topReply(g, replies) {
  const reps = g.examples.map((t) => replies.get(t.id)).filter(Boolean);
  if (!reps.length) return null;
  const top = buildScenarios(reps)[0];
  return top?.examples[0]?.text || null;
}

function renderScript() {
  const base = filtered({ ignoreSpeaker: true, ignorePhase: true });
  if (!all.length) { $('script').innerHTML = ''; $('script').append($('tplEmpty').content.cloneNode(true)); return; }
  const fs = flightScript(base);
  if (!fs.length) { $('script').innerHTML = '<div class="empty"><p>Nothing matches these filters.</p></div>'; return; }
  const mini = (g) => `<div class="mini"><div class="pct">${g.count}× · ${pct(g.share)}</div><div class="tpl">${renderTemplate(g.template, g.slots, g.examples[0], g.slotsPos)}</div>
    ${g.meaning ? `<div class="muted" style="font-size:12px;margin-top:3px">${esc(g.meaning)}</div>` : ''}</div>`;
  $('script').innerHTML = fs.map((p) => `<div class="phase"><h3>${esc(PHASE_LABELS[p.phase])} <span class="muted">${p.total} calls</span></h3>
    <div class="cols"><div><div class="colh">Controller says</div>${p.atc.map(mini).join('') || '<p class="muted">—</p>'}</div>
    <div><div class="colh">Pilot says</div>${p.pilot.map(mini).join('') || '<p class="muted">—</p>'}</div></div></div>`).join('');
}

function renderList() {
  const txs = filtered({ ignoreSpeaker: !$('fSpeaker').value }).sort((a, b) => b.ts - a.ts);
  $('listTitle').textContent = `Transmissions (${txs.length})`;
  if (!all.length) { $('list').innerHTML = ''; $('list').append($('tplEmpty').content.cloneNode(true)); $('more').classList.add('hidden'); return; }
  const sel = (cls, cur, opts) => `<select data-field="${cls}">${opts.map(([v, l]) => opt(v, l, cur)).join('')}</select>`;
  $('list').innerHTML = txs.slice(0, listLimit).map((t) => `<div class="tx${t.junk ? ' junk' : ''}" data-id="${t.id}">
    <input type="checkbox" data-sel ${selected.has(t.id) ? 'checked' : ''}>
    <div class="when">${fmtTime(t.ts)}<br>${esc(t.airport)} · ${esc(t.facility)}</div>
    <div><div class="txt" contenteditable="plaintext-only" spellcheck="false" data-edit>${esc(t.text)}</div>
      ${t.raw && t.raw !== t.text ? `<div class="raw">heard: ${esc(t.raw)}</div>` : ''}
      ${t.meaning ? `<div class="raw">means: ${esc(t.meaning)}</div>` : ''}
      ${t.alsoOn?.length ? `<div class="raw">also heard on: ${esc(t.alsoOn.join(', '))}</div>` : ''}</div>
    <div class="sel">${t.hasAudio ? `<button class="play" data-play="${t.id}">▶</button>` : ''}
      ${sel('speaker', t.speaker, [['atc', 'ATC'], ['pilot', 'Pilot'], ['unknown', '?']])}
      ${sel('phase', t.phase, PHASES.map((p) => [p, PHASE_LABELS[p]]))}
      <button class="play" data-junk title="Toggle junk">${t.junk ? 'unjunk' : 'junk'}</button></div>
  </div>`).join('');
  $('more').classList.toggle('hidden', txs.length <= listLimit);
}

function gptBatch() {
  let txs = $('gUseFilter').checked ? filtered({ ignoreSpeaker: true }) : [...view];
  if ($('gOnlyRaw').checked) txs = txs.filter((t) => !t.cleaned);
  txs = txs.filter((t) => !t.junk).sort((a, b) => a.ts - b.ts).slice(0, +$('gSize').value);
  return txs;
}

function renderGpt() {
  $('gSizeOut').textContent = $('gSize').value;
  const b = gptBatch();
  const left = ($('gUseFilter').checked ? filtered({ ignoreSpeaker: true }) : view).filter((t) => !t.cleaned && !t.junk).length;
  $('gInfo').textContent = b.length ? `${b.length} transmissions in this batch · ${left} not cleaned yet` : 'Nothing to send with these settings.';
  $('gPreview').textContent = b.length ? buildPrompt(b).prompt : '';
}

function render() {
  const sample = all.some((t) => t.source === 'sample');
  $('banner').classList.toggle('hidden', !sample);
  $('banner').textContent = sample ? 'Sample data is loaded (airport KSMP is made up). Remove it from Data ▾ when you have real recordings.' : '';
  if (tab === 'predict') renderPredict();
  if (tab === 'script') renderScript();
  if (tab === 'list') renderList();
  if (tab === 'gpt') renderGpt();
  if (tab === 'feeds') renderFeeds();
  $('filters').classList.toggle('hidden', tab === 'feeds');
}

// ---------- events ----------
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]'); if (!b) return;
  tab = b.dataset.view;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${tab}`));
  render();
});

for (const id of ['fAirport', 'fFacility', 'fPhase', 'fRunway', 'fSpeaker', 'fWhen', 'fHideJunk']) {
  $(id).addEventListener('change', () => { if (id === 'fAirport') { $('fRunway').value = ''; fillFilterOptions(); } saveFilters(); listLimit = 150; render(); });
}
let qT; $('fSearch').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { saveFilters(); render(); }, 200); });

document.addEventListener('click', async (e) => {
  const play = e.target.closest('[data-play]');
  if (play) {
    const blob = await db.getAudio(play.dataset.play);
    if (!blob) return toast('No audio saved for this one.');
    const url = URL.createObjectURL(blob); const a = new Audio(url); a.play(); a.onended = () => URL.revokeObjectURL(url);
    return;
  }
  if (e.target.closest('[data-act="sample"]')) return loadSample();
  const junk = e.target.closest('[data-junk]');
  if (junk) {
    const id = junk.closest('.tx').dataset.id; const t = all.find((x) => x.id === id);
    t.junk = !t.junk; await db.put(t); view = withContext(all); render();
  }
  if (!e.target.closest('.data')) $('dataMenu').classList.add('hidden');
});

$('list').addEventListener('change', async (e) => {
  const row = e.target.closest('.tx'); if (!row) return;
  const id = row.dataset.id;
  if (e.target.matches('[data-sel]')) { e.target.checked ? selected.add(id) : selected.delete(id); return; }
  const field = e.target.dataset.field;
  if (field) {
    const t = all.find((x) => x.id === id); t[field] = e.target.value; t.manual = true; t.cleaned = true;
    await db.put(t); view = withContext(all);
  }
});
$('list').addEventListener('focusout', async (e) => {
  if (!e.target.matches('[data-edit]')) return;
  const id = e.target.closest('.tx').dataset.id; const t = all.find((x) => x.id === id);
  const text = e.target.textContent.trim();
  if (!text || text === t.text) return;
  const keep = { speaker: t.speaker, phase: t.phase }; const wasLabeled = t.manual || t.cleaned;
  Object.assign(t, parseTransmission(text, { facility: t.facility }), { text, corrected: text, cleaned: true, manual: true });
  if (wasLabeled) Object.assign(t, keep); // keep labels you or ChatGPT already set
  await db.put(t); view = withContext(all); toast('Saved');
});
$('list').addEventListener('keydown', (e) => { if (e.target.matches('[data-edit]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('selAll').onclick = () => { filtered({ ignoreSpeaker: !$('fSpeaker').value }).slice(0, listLimit).forEach((t) => selected.add(t.id)); render(); };
$('delSel').onclick = async () => {
  if (!selected.size) return toast('Nothing selected');
  if (!confirm(`Delete ${selected.size} transmissions? This can't be undone.`)) return;
  await db.remove([...selected]); selected.clear(); await load(); toast('Deleted');
};
$('reparse').onclick = async () => {
  const ids = new Set(filtered({ ignoreSpeaker: !$('fSpeaker').value }).map((t) => t.id));
  const upd = all.filter((t) => ids.has(t.id)).map((t) => {
    const p = parseTransmission(t.text, { facility: t.facility });
    if (t.cleaned) { delete p.speaker; delete p.phase; }
    return Object.assign(t, p);
  });
  await db.putMany(upd); await load(); toast(`Re-parsed ${upd.length}`);
};
$('more').onclick = () => { listLimit += 150; render(); };
$('dedupe').onclick = async () => {
  const freqMap = {};
  if (IN_EXT) for (const f of (await chrome.storage.local.get('favorites')).favorites || []) freqMap[f.mount] = f.freqs || [];
  const { keep, drop } = findDuplicates(all, freqMap);
  if (!drop.length) return toast('No duplicates found');
  if (!confirm(`Found ${drop.length} calls that were recorded twice on feeds sharing a frequency. Merge them? The extra copies are deleted.`)) return;
  const upd = all.filter((t) => keep.has(t.id)).map((t) => ({ ...t, alsoOn: keep.get(t.id) }));
  await db.putMany(upd); await db.remove(drop); await load(); toast(`Merged ${drop.length} duplicates`);
};

// ChatGPT
['gOnlyRaw', 'gUseFilter', 'gSize'].forEach((id) => $(id).addEventListener('input', renderGpt));
$('gCopy').onclick = async () => {
  const b = gptBatch(); if (!b.length) return toast('Nothing to copy');
  const { prompt, map } = buildPrompt(b);
  localStorage.setItem('atcp-gpt-map', JSON.stringify(map));
  try { await navigator.clipboard.writeText(prompt); toast(`Copied ${b.length} lines. Paste into ChatGPT.`); }
  catch { $('gPreview').closest('details').open = true; toast('Clipboard blocked — copy it from the preview.'); }
};
$('gApply').onclick = async () => {
  const map = JSON.parse(localStorage.getItem('atcp-gpt-map') || '[]');
  if (!map.length) { $('gResult').innerHTML = '<span class="bad">Copy a prompt first, so I know which lines the reply belongs to.</span>'; return; }
  try {
    const { updated, junk, missing } = applyReply(all, map, $('gReply').value);
    await db.putMany(updated);
    $('gResult').innerHTML = `<span class="ok">Updated ${updated.length} transmissions${junk ? `, ${junk} marked junk` : ''}.</span>${missing.length ? ` <span class="bad">${missing.length} lines didn't match.</span>` : ''}`;
    $('gReply').value = '';
    await load();
  } catch (err) { $('gResult').innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
};

// Data menu
$('dataBtn').onclick = (e) => { e.stopPropagation(); $('dataMenu').classList.toggle('hidden'); };
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.transmissions || [];
    const txs = []; let audio = 0;
    for (const t of list) {
      if (!t.id || !(t.text || t.raw)) continue;
      const { audioData, ...rest } = t;
      if (!rest.template) Object.assign(rest, parseTransmission(rest.text || rest.raw, { facility: rest.facility }));
      txs.push(rest);
      if (audioData) { await db.putAudio(t.id, await (await fetch(audioData)).blob()); audio++; }
    }
    await db.putMany(txs); await load(); toast(`Imported ${txs.length} transmissions${audio ? ` with ${audio} clips` : ''}`);
  } catch (err) { toast(`Import failed: ${err.message}`); }
  e.target.value = '';
};
async function doExport(withAudio) {
  const list = [];
  for (const t of all) {
    const row = { ...t };
    if (withAudio && t.hasAudio) {
      const blob = await db.getAudio(t.id);
      if (blob) row.audioData = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    }
    list.push(row);
  }
  const blob = new Blob([JSON.stringify({ app: 'atc-predictor', version: 1, exportedAt: new Date().toISOString(), transmissions: list })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `atc-predictor-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('exportBtn').onclick = () => doExport(false);
$('exportAudioBtn').onclick = () => doExport(true);
async function loadSample() { await db.putMany(makeSample()); await load(); toast('Sample data loaded'); }
$('sampleBtn').onclick = loadSample;
$('clearSampleBtn').onclick = async () => { await db.remove(all.filter((t) => t.source === 'sample').map((t) => t.id)); await load(); toast('Sample data removed'); };
$('clearBtn').onclick = async () => {
  if (!confirm(`Delete all ${all.length} transmissions and audio? Export first if you want a backup. This can't be undone.`)) return;
  await db.clear(); await load(); toast('Everything deleted');
};

// ---------- feeds (extension only) ----------
const getFavs = async () => (await chrome.storage.local.get('favorites')).favorites || [];
const setFavs = (favorites) => chrome.storage.local.set({ favorites });

async function addFav(mount, label = '', freqs = []) {
  mount = mountFromInput(mount);
  if (!mount) return false;
  const favs = await getFavs();
  if (favs.some((f) => f.mount === mount)) return false;
  favs.push({ mount, airport: airportFromMount(mount), facility: facilityFromFeed(`${mount} ${label}`), label, freqs: parseFreqs(freqs), enabled: true });
  await setFavs(favs);
  return true;
}

async function renderFeeds() {
  if (!IN_EXT) return;
  const favs = await getFavs();
  const { feedState = {} } = await chrome.storage.session.get('feedState');
  const { feedPrefs = {} } = await chrome.storage.local.get('feedPrefs');
  $('fdAuto').checked = !!feedPrefs.autoStart;
  if (!favs.length) { $('favTable').innerHTML = '<div class="empty"><p>No favorites yet. Find an airport’s feeds below and tick the ones you want.</p></div>'; return; }
  const counts = {};
  for (const t of all) counts[t.feed] = (counts[t.feed] || 0) + 1;
  const ov = overlaps(favs);
  const ovFor = (m) => ov.filter((o) => o.a === m || o.b === m).map((o) => `${o.freqs.join(', ')} also on ${o.a === m ? o.b : o.a}`);
  $('favTable').innerHTML = favs.map((f) => {
    const fs = feedState[`feed:${f.mount}`] || { state: 'idle' };
    const on = fs.state && fs.state !== 'idle';
    return `<div class="frow" data-mount="${esc(f.mount)}">
      <span class="dot ${esc(fs.state || 'idle')}" title="${esc(fs.detail || '')}"></span>
      <input data-f="airport" value="${esc(f.airport)}" maxlength="4" title="Airport ICAO">
      <div><input data-f="label" value="${esc(f.label)}" placeholder="${esc(f.mount)}" title="Label"><div class="st">${esc(f.mount)} · ${counts[f.mount] || 0} calls saved${on ? ` · ${esc(fs.detail || fs.state)}${fs.count ? ` · ${fs.count} this session` : ''}` : ''}</div>
        <input data-f="freqs" value="${esc(parseFreqs(f.freqs).join(', '))}" placeholder="Frequencies, e.g. 128.8, 121.9" title="Frequencies this feed covers (used to merge duplicate calls)">
        ${ovFor(f.mount).map((w) => `<div class="warn">⚠ Shares ${esc(w)}. The same call on both feeds is saved once.</div>`).join('')}
        ${f.unverified ? '<div class="unv">Unverified (ChatGPT guessed this one). Press Listen to check it exists, then tick “In Start all”.</div>' : ''}</div>
      <select data-f="facility">${FACILITIES.map((x) => opt(x, FACILITY_LABELS[x], f.facility)).join('')}</select>
      <label class="check"><input type="checkbox" data-f="enabled" ${f.enabled !== false ? 'checked' : ''}> In “Start all”</label>
      <div class="btns"><button data-fa="toggle">${on ? 'Stop' : 'Start'}</button>
        <button data-fa="listen" title="Open the LiveATC player to listen">Listen</button>
        <button data-fa="remove" class="danger" title="Remove from favorites">✕</button></div>
    </div>`;
  }).join('');
}

if (IN_EXT) {
  $('feedsTab').classList.remove('hidden');
  $('favTable').addEventListener('change', async (e) => {
    const row = e.target.closest('.frow'); const k = e.target.dataset.f; if (!row || !k) return;
    const favs = await getFavs(); const f = favs.find((x) => x.mount === row.dataset.mount);
    f[k] = e.target.type === 'checkbox' ? e.target.checked : (k === 'airport' ? e.target.value.toUpperCase() : k === 'freqs' ? parseFreqs(e.target.value) : e.target.value);
    if (k === 'enabled' && e.target.checked) delete f.unverified;
    await setFavs(favs); toast('Saved. Restart the feed for changes to apply.');
  });
  $('favTable').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fa]'); if (!b) return;
    const mount = b.closest('.frow').dataset.mount;
    const favs = await getFavs(); const f = favs.find((x) => x.mount === mount);
    if (b.dataset.fa === 'toggle') {
      const r = b.textContent === 'Stop'
        ? await chrome.runtime.sendMessage({ type: 'stopFeed', id: `feed:${mount}` })
        : await chrome.runtime.sendMessage({ type: 'startFeeds', feeds: [f] });
      if (!r?.ok) toast(r?.error || 'Failed');
    }
    if (b.dataset.fa === 'listen') window.open(`https://www.liveatc.net/hlisten.php?mount=${encodeURIComponent(mount)}&icao=${encodeURIComponent((f.airport || '').toLowerCase())}`, '_blank');
    if (b.dataset.fa === 'remove') {
      await chrome.runtime.sendMessage({ type: 'stopFeed', id: `feed:${mount}` });
      await setFavs(favs.filter((x) => x.mount !== mount));
    }
    renderFeeds();
  });
  $('fdStartAll').onclick = async () => { const r = await chrome.runtime.sendMessage({ type: 'startFavorites' }); if (!r?.ok) toast(r?.error || 'Failed'); };
  $('fdStopAll').onclick = () => chrome.runtime.sendMessage({ type: 'stop' });
  $('fdAuto').onchange = async () => {
    const { feedPrefs = {} } = await chrome.storage.local.get('feedPrefs');
    await chrome.storage.local.set({ feedPrefs: { ...feedPrefs, autoStart: $('fdAuto').checked } });
  };
  const find = async () => {
    const icao = $('fdIcao').value.trim(); if (!icao) return;
    $('fdResults').textContent = 'Searching LiveATC…';
    try {
      const feeds = await findFeeds(icao);
      const favs = await getFavs();
      if (!feeds.length) { $('fdResults').textContent = 'No feeds found for that airport. You can still add one by name on the right.'; return; }
      $('fdResults').innerHTML = `<div class="found">${feeds.map((f) => `<label><input type="checkbox" data-add="${esc(f.mount)}" data-label="${esc(f.label === f.mount ? '' : f.label)}" data-freqs="${esc(f.freqs.join(','))}" ${favs.some((x) => x.mount === f.mount) ? 'checked disabled' : ''}>
        <span>${esc(f.label)} <small>${esc(f.mount)}${f.freqs.length ? ` · ${esc(f.freqs.join(', '))}` : ''}</small></span></label>`).join('')}</div>`;
    } catch (err) { $('fdResults').textContent = err.message; }
  };
  $('fdFind').onclick = find;
  $('fdIcao').addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });
  $('fdResults').addEventListener('change', async (e) => {
    const c = e.target.closest('[data-add]'); if (!c || !c.checked) return;
    if (await addFav(c.dataset.add, c.dataset.label, c.dataset.freqs)) { c.disabled = true; toast(`Added ${c.dataset.add}`); renderFeeds(); }
  });
  $('fdAdd').onclick = async () => {
    const ok = await addFav($('fdManual').value);
    $('fdMsg').innerHTML = ok ? '<span class="ok">Added.</span>' : '<span class="bad">Not added (empty or already a favorite).</span>';
    if (ok) { $('fdManual').value = ''; renderFeeds(); }
  };
  $('fgCopy').onclick = async () => {
    const airports = $('fgAirports').value.split(/[\s,;]+/).filter((x) => /^[a-z0-9]{3,4}$/i.test(x));
    if (!airports.length) return toast('Type at least one airport code');
    const prompt = buildFeedPrompt(airports, $('fgWants').value.trim());
    try { await navigator.clipboard.writeText(prompt); toast('Copied. Paste it into ChatGPT.'); }
    catch { $('fgReply').value = prompt; toast('Clipboard blocked; the prompt is in the box. Copy it from there.'); }
  };
  $('fgApply').onclick = async () => {
    let rows;
    try { rows = parseFeedReply($('fgReply').value); } catch (err) { $('fgResult').innerHTML = `<span class="bad">${esc(err.message)}</span>`; return; }
    const favs = await getFavs(); const lines = [];
    for (const r of rows) {
      const ex = favs.find((f) => f.mount === r.mount);
      if (ex) {
        const freqs = parseFreqs([...(ex.freqs || []), ...r.freqs]);
        const changed = freqs.length !== parseFreqs(ex.freqs).length || (!ex.label && r.label);
        ex.freqs = freqs; ex.label ||= r.label;
        lines.push(`<span class="muted">${esc(r.mount)}: already a favorite${changed ? ' (filled in frequencies/label)' : ''}</span>`);
        continue;
      }
      favs.push({ mount: r.mount, airport: r.airport, label: r.label, facility: r.facility || facilityFromFeed(`${r.mount} ${r.label}`), freqs: parseFreqs(r.freqs), enabled: r.verified, ...(r.verified ? {} : { unverified: true }) });
      lines.push(r.verified ? `<span class="ok">Added ${esc(r.airport)} ${esc(r.label || r.mount)} (${esc(r.mount)})</span>` : `<span class="warn">Added ${esc(r.mount)} as unverified (not in Start all)</span>`);
    }
    await setFavs(favs);
    const ov = overlaps(favs);
    if (ov.length) lines.push(`<span class="muted">${ov.length} pair${ov.length > 1 ? 's' : ''} of feeds share a frequency. Duplicate calls are merged automatically.</span>`);
    $('fgResult').innerHTML = `<div class="fgres">${lines.join('') || '<span class="bad">No feeds found in that reply.</span>'}</div>`;
    if (rows.length) $('fgReply').value = '';
    renderFeeds();
  };
  chrome.storage.onChanged.addListener(() => { if (tab === 'feeds') renderFeeds(); });
  if (location.hash === '#feeds') document.querySelector('#tabs button[data-view=feeds]').click();
}

// Live updates while the extension is recording
if (IN_EXT) {
  let t; chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'tx') { clearTimeout(t); t = setTimeout(load, 800); } });
}

load();

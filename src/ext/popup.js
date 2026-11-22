import { facilityFromFeed, PHASE_LABELS } from '../lib/atc.js';

const $ = (id) => document.getElementById(id);
const fields = ['airport', 'feed', 'facility', 'model', 'customModel', 'sensitivity', 'gapMs', 'keepAudio'];
let tab;

function readSettings() {
  const model = $('model').value === 'custom' ? ($('customModel').value.trim() || 'Xenova/whisper-base.en') : $('model').value;
  return { model, sensitivity: +$('sensitivity').value, gapMs: +$('gapMs').value, keepAudio: $('keepAudio').checked };
}

function guessFromTab(t) {
  const out = {};
  try {
    const u = new URL(t.url);
    if (/liveatc\.net$/.test(u.hostname)) {
      const mount = u.searchParams.get('mount');
      const icao = u.searchParams.get('icao');
      if (mount) out.feed = mount;
      if (icao) out.airport = icao.toUpperCase();
      else if (mount) out.airport = mount.split('_')[0].toUpperCase();
    }
  } catch {}
  if (!out.feed && t.title) {
    const m = t.title.match(/\b([KCP][A-Z0-9]{3})\b\s*(.*)/);
    if (m) { out.airport ||= m[1]; out.feed = m[2] || m[1]; }
  }
  if (out.feed) out.facility = facilityFromFeed(out.feed);
  return out;
}

async function init() {
  const saved = (await chrome.storage.local.get('popup')).popup || {};
  for (const f of fields) if (saved[f] != null) {
    if ($(f).type === 'checkbox') $(f).checked = saved[f]; else $(f).value = saved[f];
  }
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const g = tab ? guessFromTab(tab) : {};
  if (g.airport) $('airport').value = g.airport;
  if (g.feed) $('feed').value = g.feed;
  if (g.facility) $('facility').value = g.facility;
  syncOutputs();
  render();
}

function syncOutputs() {
  $('sensOut').textContent = $('sensitivity').value;
  $('gapOut').textContent = $('gapMs').value;
  $('customWrap').classList.toggle('hidden', $('model').value !== 'custom');
}

async function save() {
  const v = {};
  for (const f of fields) v[f] = $(f).type === 'checkbox' ? $(f).checked : $(f).value;
  await chrome.storage.local.set({ popup: v });
}

async function render() {
  const { status = { state: 'idle' }, recent = [] } = await chrome.storage.session.get(['status', 'recent']);
  const st = status.state || 'idle';
  $('state').textContent = st;
  $('state').className = `pill ${st}`;
  if (status.detail) $('detail').textContent = status.detail;
  const on = st === 'listening' || st === 'loading';
  $('start').disabled = on;
  $('stop').disabled = !on;
  const ul = $('recent');
  ul.innerHTML = '';
  if (!recent.length) { ul.innerHTML = '<li class="empty">Nothing yet.</li>'; return; }
  for (const r of recent) {
    const li = document.createElement('li');
    li.className = r.speaker;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${r.speaker === 'atc' ? 'ATC' : r.speaker === 'pilot' ? 'Pilot' : '?'} · ${PHASE_LABELS[r.phase] || r.phase}`;
    li.append(tag, document.createTextNode(r.text));
    ul.append(li);
  }
}

$('start').onclick = async () => {
  if (!tab) return;
  if (!$('airport').value.trim()) { $('detail').textContent = 'Enter the airport ICAO first (e.g. KBOS).'; return; }
  await save();
  $('start').disabled = true;
  const meta = { airport: $('airport').value.trim().toUpperCase(), feed: $('feed').value.trim(), facility: $('facility').value };
  const res = await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id, meta, settings: readSettings() });
  if (!res?.ok) $('detail').textContent = `Couldn't start: ${res?.error || 'unknown error'}`;
  render();
};
$('stop').onclick = async () => { await chrome.runtime.sendMessage({ type: 'stop' }); render(); };
$('open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
$('feed').addEventListener('input', () => { $('facility').value = facilityFromFeed($('feed').value); });
for (const f of fields) $(f).addEventListener('change', () => { syncOutputs(); save(); });
['sensitivity', 'gapMs'].forEach((f) => $(f).addEventListener('input', syncOutputs));
chrome.storage.onChanged.addListener((c, area) => { if (area === 'session') render(); });

init();

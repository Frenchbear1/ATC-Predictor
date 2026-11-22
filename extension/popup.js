// src/lib/atc.js
var PHASE_LABELS = {
  "clearance": "Clearance",
  "taxi-out": "Taxi out",
  "takeoff": "Takeoff",
  "departure": "Departure",
  "enroute": "Enroute",
  "arrival": "Arrival",
  "approach": "Approach",
  "pattern": "Pattern",
  "landing": "Landing",
  "taxi-in": "Taxi in",
  "atis": "ATIS",
  "other": "Other"
};
function facilityFromFeed(feed = "") {
  const f = feed.toLowerCase();
  if (/atis/.test(f)) return "atis";
  if (/(^|[_\s-])(del|clnc|clr|clearance)/.test(f)) return "del";
  if (/(gnd|ground|ramp)/.test(f)) return "gnd";
  if (/(twr|tower|local)/.test(f)) return "twr";
  if (/(app|dep|approach|departure|tracon|final|director)/.test(f)) return "app";
  if (/(ctr|center|artcc)/.test(f)) return "ctr";
  if (/(ctaf|unicom|cta)/.test(f)) return "ctaf";
  if (/(del.*gnd|gnd.*twr|twr.*app|combined|mixed)/.test(f)) return "mixed";
  return "mixed";
}
var TELEPHONY = [
  "american",
  "delta",
  "united",
  "southwest",
  "jetblue",
  "jet blue",
  "spirit",
  "wings",
  "frontier",
  "frontier flight",
  "alaska",
  "hawaiian",
  "skywest",
  "sky west",
  "envoy",
  "republic",
  "brickyard",
  "piedmont",
  "endeavor",
  "endeavour",
  "air shuttle",
  "cactus",
  "speedbird",
  "virgin",
  "air canada",
  "jazz",
  "westjet",
  "lufthansa",
  "air france",
  "klm",
  "aer lingus",
  "shamrock",
  "iberia",
  "emirates",
  "qatari",
  "fedex",
  "ups",
  "atlas",
  "amazon",
  "prime air",
  "kalitta",
  "connie",
  "flexjet",
  "execjet",
  "lifeguard",
  "medevac",
  "mercy",
  "sun country",
  "breeze",
  "moxy",
  "allegiant",
  "gojet",
  "lindbergh",
  "commutair",
  "commuter",
  "jet link",
  "redwood",
  "state",
  "citrus",
  "ameriflight",
  "baron",
  "wheels up",
  "cessna",
  "skyhawk",
  "skylane",
  "piper",
  "cherokee",
  "warrior",
  "archer",
  "arrow",
  "seminole",
  "mooney",
  "bonanza",
  "beech",
  "beechcraft",
  "cirrus",
  "diamond",
  "katana",
  "citation",
  "gulfstream",
  "learjet",
  "king air",
  "challenger",
  "embraer",
  "phenom",
  "pilatus",
  "helicopter",
  "november",
  "army",
  "navy",
  "air force",
  "reach",
  "coast guard",
  "police",
  "eagle"
];
var TEL_ALT = TELEPHONY.map((t) => t.replace(/ /g, "\\s")).join("|");
var CALLSIGN_SRC = [
  `\\b(?:${TEL_ALT})\\s(?:[A-Z]{0,2}\\d{1,5}[A-Z]{0,2}|[A-Z0-9]{2,6})\\b`,
  // "delta 2790", "skyhawk 82CP"
  `\\bN\\d{1,5}[A-Z]{0,2}\\b`,
  // N54321
  `(?<!runway |short |heading |of |takeoff |land )\\b\\d{1,5}[A-Z]{1,2}\\b(?=\\s*$)`,
  // trailing "123AB"
  `\\b(?:\\d{3,5}[A-Z]{1,2}|\\d{1,2}[A-Z]{2}|\\d{1,2}[ABD-KM-QS-Z]|[4-9]\\d[A-Z])\\b(?=\\s*$)`
  // trailing tail that can't be a runway
].join("|");
var CALLSIGN_RE = new RegExp(CALLSIGN_SRC);
var CALLSIGN_G = new RegExp(CALLSIGN_SRC, "g");

// src/ext/popup.js
var $ = (id) => document.getElementById(id);
var fields = ["airport", "feed", "facility", "model", "customModel", "sensitivity", "gapMs", "keepAudio"];
var tab;
function readSettings() {
  const model = $("model").value === "custom" ? $("customModel").value.trim() || "Xenova/whisper-base.en" : $("model").value;
  return { model, sensitivity: +$("sensitivity").value, gapMs: +$("gapMs").value, keepAudio: $("keepAudio").checked };
}
function guessFromTab(t) {
  const out = {};
  try {
    const u = new URL(t.url);
    if (/liveatc\.net$/.test(u.hostname)) {
      const mount = u.searchParams.get("mount");
      const icao = u.searchParams.get("icao");
      if (mount) out.feed = mount;
      if (icao) out.airport = icao.toUpperCase();
      else if (mount) out.airport = mount.split("_")[0].toUpperCase();
    }
  } catch {
  }
  if (!out.feed && t.title) {
    const m = t.title.match(/\b([KCP][A-Z0-9]{3})\b\s*(.*)/);
    if (m) {
      out.airport ||= m[1];
      out.feed = m[2] || m[1];
    }
  }
  if (out.feed) out.facility = facilityFromFeed(out.feed);
  return out;
}
async function init() {
  const saved = (await chrome.storage.local.get("popup")).popup || {};
  for (const f of fields) if (saved[f] != null) {
    if ($(f).type === "checkbox") $(f).checked = saved[f];
    else $(f).value = saved[f];
  }
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const g = tab ? guessFromTab(tab) : {};
  if (g.airport) $("airport").value = g.airport;
  if (g.feed) $("feed").value = g.feed;
  if (g.facility) $("facility").value = g.facility;
  syncOutputs();
  render();
}
function syncOutputs() {
  $("sensOut").textContent = $("sensitivity").value;
  $("gapOut").textContent = $("gapMs").value;
  $("customWrap").classList.toggle("hidden", $("model").value !== "custom");
}
async function save() {
  const v = {};
  for (const f of fields) v[f] = $(f).type === "checkbox" ? $(f).checked : $(f).value;
  await chrome.storage.local.set({ popup: v });
}
async function render() {
  const { status = { state: "idle" }, recent = [] } = await chrome.storage.session.get(["status", "recent"]);
  const st = status.state || "idle";
  $("state").textContent = st;
  $("state").className = `pill ${st}`;
  if (status.detail) $("detail").textContent = status.detail;
  const on = st === "listening" || st === "loading";
  $("start").disabled = on;
  $("stop").disabled = !on;
  const ul = $("recent");
  ul.innerHTML = "";
  if (!recent.length) {
    ul.innerHTML = '<li class="empty">Nothing yet.</li>';
    return;
  }
  for (const r of recent) {
    const li = document.createElement("li");
    li.className = r.speaker;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${r.speaker === "atc" ? "ATC" : r.speaker === "pilot" ? "Pilot" : "?"} \xB7 ${PHASE_LABELS[r.phase] || r.phase}`;
    li.append(tag, document.createTextNode(r.text));
    ul.append(li);
  }
}
$("start").onclick = async () => {
  if (!tab) return;
  if (!$("airport").value.trim()) {
    $("detail").textContent = "Enter the airport ICAO first (e.g. KBOS).";
    return;
  }
  await save();
  $("start").disabled = true;
  const meta = { airport: $("airport").value.trim().toUpperCase(), feed: $("feed").value.trim(), facility: $("facility").value };
  const res = await chrome.runtime.sendMessage({ type: "start", tabId: tab.id, meta, settings: readSettings() });
  if (!res?.ok) $("detail").textContent = `Couldn't start: ${res?.error || "unknown error"}`;
  render();
};
$("stop").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  render();
};
$("open").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
$("feed").addEventListener("input", () => {
  $("facility").value = facilityFromFeed($("feed").value);
});
for (const f of fields) $(f).addEventListener("change", () => {
  syncOutputs();
  save();
});
["sensitivity", "gapMs"].forEach((f) => $(f).addEventListener("input", syncOutputs));
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "session") render();
});
init();

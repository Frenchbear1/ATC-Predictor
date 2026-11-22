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
var FACILITY_LABELS = {
  del: "Clearance Delivery",
  gnd: "Ground",
  twr: "Tower",
  app: "Approach/Departure",
  ctr: "Center",
  atis: "ATIS",
  ctaf: "CTAF/UNICOM",
  mixed: "Mixed feed"
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

// src/lib/stream.js
function airportFromMount(mount = "") {
  const m = mount.toUpperCase().match(/^([A-Z]{4})/);
  return m ? m[1] : "";
}

// src/ext/popup.js
var $ = (id) => document.getElementById(id);
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var fields = ["airport", "feed", "facility", "model", "customModel", "sensitivity", "gapMs", "keepAudio"];
var tab;
var tabGuess = {};
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
      else if (mount) out.airport = airportFromMount(mount);
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
  const { feedPrefs = {} } = await chrome.storage.local.get("feedPrefs");
  $("autoStart").checked = !!feedPrefs.autoStart;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabGuess = tab ? guessFromTab(tab) : {};
  if (tabGuess.airport) $("airport").value = tabGuess.airport;
  if (tabGuess.feed) $("feed").value = tabGuess.feed;
  if (tabGuess.facility) $("facility").value = tabGuess.facility;
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
  const { status = { state: "idle" }, recent = [], feedState = {} } = await chrome.storage.session.get(["status", "recent", "feedState"]);
  const { favorites = [] } = await chrome.storage.local.get("favorites");
  const st = status.state || "idle";
  $("state").textContent = st;
  $("state").className = `pill ${st}`;
  if (status.detail) $("detail").textContent = status.detail;
  const favUl = $("favs");
  if (!favorites.length) favUl.innerHTML = '<li class="empty">No favorites yet. Click Manage\u2026 to add airports.</li>';
  else {
    favUl.innerHTML = favorites.map((f) => {
      const fs = feedState[`feed:${f.mount}`] || { state: "idle" };
      const on = fs.state && fs.state !== "idle";
      return `<li class="fav"><span class="dot ${esc(fs.state || "idle")}" title="${esc(fs.detail || fs.state || "")}"></span>
        <div class="fname"><b>${esc(f.airport)}</b> ${esc(f.label || FACILITY_LABELS[f.facility] || f.mount)}
          <small>${esc(f.mount)}${fs.count ? ` \xB7 ${fs.count} calls` : ""}${fs.state === "reconnecting" ? ` \xB7 ${esc(fs.detail)}` : ""}</small></div>
        <button class="mini" data-toggle="${esc(f.mount)}">${on ? "Stop" : "Start"}</button></li>`;
    }).join("");
  }
  const anyOn = Object.values(feedState).some((x) => x.state && x.state !== "idle");
  $("startAll").disabled = !favorites.length;
  $("stopAll").disabled = !(anyOn || st === "listening" || st === "loading");
  const isFav = favorites.some((f) => f.mount === tabGuess.feed);
  $("addTab").classList.toggle("hidden", !tabGuess.feed || isFav || !/liveatc/.test(tab?.url || ""));
  const ul = $("recent");
  if (!recent.length) {
    ul.innerHTML = '<li class="empty">Nothing yet.</li>';
    return;
  }
  ul.innerHTML = "";
  for (const r of recent) {
    const li = document.createElement("li");
    li.className = r.speaker;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${r.airport || ""} \xB7 ${r.speaker === "atc" ? "ATC" : r.speaker === "pilot" ? "Pilot" : "?"} \xB7 ${PHASE_LABELS[r.phase] || r.phase}`;
    li.append(tag, document.createTextNode(r.text));
    ul.append(li);
  }
}
$("startAll").onclick = async () => {
  await save();
  const res = await chrome.runtime.sendMessage({ type: "startFavorites" });
  if (!res?.ok) $("detail").textContent = `Couldn't start: ${res?.error || "unknown error"}`;
  render();
};
$("stopAll").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  render();
};
$("favs").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-toggle]");
  if (!b) return;
  const mount = b.dataset.toggle;
  const { favorites = [] } = await chrome.storage.local.get("favorites");
  const f = favorites.find((x) => x.mount === mount);
  await save();
  if (b.textContent === "Stop") await chrome.runtime.sendMessage({ type: "stopFeed", id: `feed:${mount}` });
  else await chrome.runtime.sendMessage({ type: "startFeeds", feeds: [f] });
  render();
});
$("addTab").onclick = async () => {
  const { favorites = [] } = await chrome.storage.local.get("favorites");
  favorites.push({ mount: tabGuess.feed, airport: tabGuess.airport || airportFromMount(tabGuess.feed), facility: tabGuess.facility || "mixed", label: "", enabled: true });
  await chrome.storage.local.set({ favorites });
  render();
};
$("autoStart").onchange = async () => {
  const { feedPrefs = {} } = await chrome.storage.local.get("feedPrefs");
  await chrome.storage.local.set({ feedPrefs: { ...feedPrefs, autoStart: $("autoStart").checked } });
};
$("start").onclick = async () => {
  if (!tab) return;
  if (!$("airport").value.trim()) {
    $("detail").textContent = "Enter the airport ICAO first (e.g. KBOS).";
    return;
  }
  await save();
  const meta = { airport: $("airport").value.trim().toUpperCase(), feed: $("feed").value.trim(), facility: $("facility").value };
  const res = await chrome.runtime.sendMessage({ type: "start", tabId: tab.id, meta, settings: readSettings() });
  if (!res?.ok) $("detail").textContent = `Couldn't start: ${res?.error || "unknown error"}`;
  render();
};
$("manage").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html#feeds") });
$("open").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
$("feed").addEventListener("input", () => {
  $("facility").value = facilityFromFeed($("feed").value);
});
for (const f of fields) $(f).addEventListener("change", () => {
  syncOutputs();
  save();
});
["sensitivity", "gapMs"].forEach((f) => $(f).addEventListener("input", syncOutputs));
chrome.storage.onChanged.addListener(() => render());
init();

// src/lib/atc.js
var PHASES = [
  "clearance",
  "taxi-out",
  "takeoff",
  "departure",
  "enroute",
  "arrival",
  "approach",
  "pattern",
  "landing",
  "taxi-in",
  "atis",
  "other"
];
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
var FACILITIES = ["del", "gnd", "twr", "app", "ctr", "atis", "ctaf", "mixed"];
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
var DIGIT_WORDS = {
  zero: "0",
  oh: "0",
  one: "1",
  won: "1",
  two: "2",
  too: "2",
  to: null,
  three: "3",
  tree: "3",
  four: "4",
  for: null,
  fower: "4",
  five: "5",
  fife: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
  niner: "9"
};
var TEENS = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
};
var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
var PHONETIC = {
  alpha: "A",
  alfa: "A",
  bravo: "B",
  charlie: "C",
  delta: "D",
  echo: "E",
  foxtrot: "F",
  golf: "G",
  hotel: "H",
  india: "I",
  juliet: "J",
  juliett: "J",
  kilo: "K",
  lima: "L",
  mike: "M",
  november: "N",
  oscar: "O",
  papa: "P",
  quebec: "Q",
  romeo: "R",
  sierra: "S",
  tango: "T",
  uniform: "U",
  victor: "V",
  whiskey: "W",
  whisky: "W",
  xray: "X",
  "x-ray": "X",
  yankee: "Y",
  zulu: "Z"
};
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
var PHASE_ORDER_HINT = { del: "clearance", gnd: "taxi-out", twr: "takeoff", app: "departure", ctr: "enroute", atis: "atis", ctaf: "pattern" };
function tokenize(text) {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/x-ray/g, "xray").replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d)([a-z])/g, "$1 $2").replace(/[,;!?]+|\.(?=\s|$)/g, " | ").replace(/[^a-z0-9.|\s'-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean).map((t) => t.replace(/\.$/, ""));
}
function joinNumbers(tokens) {
  const out = [];
  let i = 0;
  const isDigitTok = (t) => /^\d+$/.test(t) || DIGIT_WORDS[t] != null;
  const digitOf = (t) => /^\d+$/.test(t) ? t : DIGIT_WORDS[t];
  while (i < tokens.length) {
    const t = tokens[i];
    if (TENS[t] != null) {
      let v = TENS[t];
      if (DIGIT_WORDS[tokens[i + 1]] && DIGIT_WORDS[tokens[i + 1]] !== "0") {
        v += +DIGIT_WORDS[tokens[i + 1]];
        i++;
      }
      i++;
      if (TENS[tokens[i]] != null || TEENS[tokens[i]] != null) {
        let w = TENS[tokens[i]] ?? TEENS[tokens[i]];
        if (TENS[tokens[i]] != null && DIGIT_WORDS[tokens[i + 1]] && DIGIT_WORDS[tokens[i + 1]] !== "0") {
          w += +DIGIT_WORDS[tokens[i + 1]];
          i++;
        }
        i++;
        out.push(`${v}${String(w).padStart(2, "0")}`);
        continue;
      }
      out.push(String(v));
      continue;
    }
    if (TEENS[t] != null) {
      out.push(String(TEENS[t]));
      i++;
      continue;
    }
    if (isDigitTok(t) || /^\d+\.\d+$/.test(t)) {
      let s = "";
      while (i < tokens.length && (isDigitTok(tokens[i]) || /^\d+\.\d+$/.test(tokens[i]))) {
        s += digitOf(tokens[i]) ?? tokens[i];
        i++;
      }
      if ((tokens[i] === "point" || tokens[i] === "decimal") && isDigitTok(tokens[i + 1] || "")) {
        i++;
        let d = "";
        while (i < tokens.length && isDigitTok(tokens[i])) {
          d += digitOf(tokens[i]);
          i++;
        }
        s = `${s}.${d}`;
      }
      if (tokens[i] === "thousand") {
        let v = (parseFloat(s) || 0) * 1e3;
        i++;
        if (isDigitTok(tokens[i] || "") && tokens[i + 1] === "hundred") {
          v += +digitOf(tokens[i]) * 100;
          i += 2;
        }
        s = String(v);
      } else if (tokens[i] === "hundred") {
        s = String((parseFloat(s) || 0) * 100);
        i++;
      }
      out.push(s);
      continue;
    }
    out.push(t);
    i++;
  }
  return out;
}
function joinPhonetics(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = out[out.length - 1] || "";
    if (t === "delta" && /^\d/.test(tokens[i + 1] || "") && !/^(taxiway|via|at|and|on)$/.test(prev)) {
      out.push(t);
      continue;
    }
    if (/^\d+$/.test(t) && /^\d+$/.test(prev) && (prev + t).length <= 5 && TELEPHONY.includes(out[out.length - 2] || "")) {
      out[out.length - 1] = prev + t;
      continue;
    }
    if (PHONETIC[t] && /^\d{1,5}[A-Z]*$/.test(prev) && prev.length < 6 && TELEPHONY.includes(out[out.length - 2] || "")) {
      out[out.length - 1] = prev + PHONETIC[t];
      continue;
    }
    if (PHONETIC[t] && /^\d{1,5}$/.test(prev)) {
      let j = i, letters = "";
      while (j < tokens.length && PHONETIC[tokens[j]] && letters.length < 2) {
        letters += PHONETIC[tokens[j]];
        j++;
      }
      if (j >= tokens.length || tokens[j] === "|") {
        out[out.length - 1] = prev + letters;
        i = j - 1;
        continue;
      }
    }
    if (PHONETIC[t]) {
      let id = PHONETIC[t];
      let j = i + 1;
      while (j < tokens.length && (PHONETIC[tokens[j]] || /^\d+$/.test(tokens[j]))) {
        if (id[0] !== "N" && PHONETIC[tokens[j]] && /[A-Z]$/.test(id) && !/\d/.test(id)) break;
        id += PHONETIC[tokens[j]] || tokens[j];
        j++;
        if (id.length >= 6) break;
      }
      out.push(id);
      i = j - 1;
      continue;
    }
    out.push(t);
  }
  return out;
}
function normalize(text = "") {
  let toks = tokenize(text);
  toks = joinNumbers(toks);
  toks = joinPhonetics(toks);
  let s = toks.join(" ");
  s = s.replace(/\b(\d{1,2}) (left|right|center)\b/g, (_, n, side) => `${n}${side[0].toUpperCase()}`).replace(/\b(\d{1,2}) ([lrc])\b/g, (_, n, side) => `${n}${side.toUpperCase()}`).replace(/\bflight level (\d{2,3})\b/g, "FL$1").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  return s;
}
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
function findCallsign(norm) {
  const m = norm.match(CALLSIGN_RE);
  return m ? m[0] : null;
}
function guessSpeaker(norm) {
  const s = norm;
  let atc = 0, pilot = 0;
  const cs = [...s.matchAll(CALLSIGN_G)];
  if (cs.length) {
    if (cs[0].index <= 2) atc += 2;
    const last = cs[cs.length - 1];
    if (last.index + last[0].length >= s.length - 1 && last.index > 3) pilot += 2.5;
  }
  if (/\b(with you|request(ing)?|ready (to copy|for (departure|takeoff|taxi))|with (information|the numbers|[A-Z]\b)|inbound|we're|we are|looking for|we have|unable|holding short|on the go|say again|wilco|for the|good day|have a good)\b/.test(s)) pilot += 1.5;
  if (/\b(radar contact|wind \d|altimeter|traffic|cleared for|cleared to land|number \d|caution|expect|say (altitude|intentions|heading)|ident|squawk|runway \d+[LRC]? (taxi|cleared|line)|contact (ground|tower|departure|approach|center))\b/.test(s)) atc += 1;
  if (/^(roger|wilco|copy|affirmative|negative|thanks|thank you)\b/.test(s)) pilot += 1;
  if (/\b(good day|so long|see ya)\b/.test(s) && cs.length && cs[0].index <= 2) atc += 0.5;
  if (atc === pilot) return "unknown";
  return atc > pilot ? "atc" : "pilot";
}
var PHASE_RULES = [
  ["atis", /\b(information [A-Z]\b.*\b(wind|visibility|sky|altimeter)|automated|advise (on initial )?contact you have)\b/, 4],
  ["clearance", /\bcleared to (the )?\S+( \S+)? (airport|via)\b/, 4],
  ["clearance", /\b(as filed|climb via|departure frequency|dep freq|squawk \d{4}|readback correct|clearance on request|ready to copy|void (time|if)|release|expect (FL\d+|\d+) \d+ (min|minutes))\b/, 2.5],
  ["clearance", /\b(after departure|on departure) (fly|turn|maintain|heading)\b/, 1.5],
  ["taxi-out", /\b(taxi to runway|runway \S+ taxi via|hold short of runway|cross runway|give way|monitor tower|holding short|ready to taxi|request taxi|taxi via)\b/, 3],
  ["taxi-in", /\b(taxi to (the )?(ramp|parking|fbo|gate|hangar|terminal|spot)|exit (left|right|at)|turn (left|right) (at|on) [A-Z]\d?\b.*(contact ground|ground)|clear of (the )?runway|on the ramp)\b/, 3],
  ["taxi-in", /\bcontact ground\b/, 1],
  ["takeoff", /\b(cleared for (immediate )?takeoff|line up and wait|position and hold|fly runway heading|ready for departure|ready for takeoff|holding short .* ready|rolling|cancel takeoff)\b/, 4],
  ["departure", /\b(radar contact|contact departure|climb (and maintain|via)|passing \S+ for|resume own navigation|proceed direct|turn (left|right) heading .* climb|departure)\b/, 2],
  ["enroute", /\b(contact \S+ center|center|FL\d{2,3}|flight following|cruise|ride report|chop|request (higher|lower|FL))\b/, 2],
  ["arrival", /\b(descend (and maintain|via)|cross \S+ at|expect (the )?(ils|rnav|visual|vor|loc|gps|localizer)|with (information|[A-Z]\b)|have (information|the numbers)|landing \S+|inbound for landing|descending)\b/, 2],
  ["approach", /\bcleared (ils|rnav|visual|vor|loc|gps|localizer|straight in)\b/, 1.5],
  ["approach", /\b(cleared (ils|rnav|visual|vor|loc|gps|localizer|straight)|maintain \S+ until established|join (the )?localizer|intercept|turn (left|right) heading \d+ (join|intercept|vector)|vectors? (for|to)|field in sight|airport in sight|report (the )?(field|airport)|contact tower|miles from \S+|established)\b/, 2.5],
  ["pattern", /\b(touch and go|stop and go|low approach|the option|make (left|right) (closed )?traffic|enter (left|right) (downwind|base)|report (left|right )?(midfield|downwind|base|final)|extend (your )?downwind|closed traffic|remain in the pattern|full stop)\b/, 3],
  ["landing", /\b(cleared to land|number (1|2|3|4|one|two|three)|go around|continue|landing runway|wind \d+ at \d+ runway|follow .* traffic|short final|on final)\b/, 2.5]
];
function guessPhase(norm, facility) {
  const scores = {};
  for (const [phase, re, w] of PHASE_RULES) if (re.test(norm)) scores[phase] = (scores[phase] || 0) + w;
  const prior = PHASE_ORDER_HINT[facility];
  if (prior) scores[prior] = (scores[prior] || 0) + 0.75;
  if (facility === "gnd" && scores["taxi-in"]) scores["taxi-in"] += 0.5;
  if (facility === "twr") {
    scores["landing"] = (scores["landing"] || 0) + 0.3;
  }
  if (facility === "app") {
    scores["arrival"] = (scores["arrival"] || 0) + 0.5;
  }
  if (facility === "atis") return "atis";
  let best = "other", bv = 0.9;
  for (const [k, v] of Object.entries(scores)) if (v > bv) {
    best = k;
    bv = v;
  }
  return best;
}
var INTENT_RULES = [
  ["IFR clearance", /\bcleared to \S+.*\b(via|as filed|climb|squawk)\b/],
  ["Squawk", /\bsquawk \d{4}\b/],
  ["Takeoff clearance", /\bcleared for (immediate )?takeoff\b/],
  ["Landing clearance", /\bcleared to land\b|\bcleared (for )?the option\b|\bcleared touch and go\b/],
  ["Line up and wait", /\bline up and wait|position and hold\b/],
  ["Taxi", /\btaxi (to|via)\b/],
  ["Hold short", /\bhold(ing)? short\b/],
  ["Cross runway", /\bcross runway\b/],
  ["Approach clearance", /\bcleared (ils|rnav|visual|vor|loc|gps|localizer|straight)/],
  ["Vector", /\b(turn (left|right) )?heading \d{3}\b|\bfly heading\b/],
  ["Altitude", /\b(climb|descend)( and maintain)?\b|\bmaintain \d{3,5}\b|\bFL\d+\b/],
  ["Speed", /\b(speed \d+|reduce speed|increase speed|maintain \d+ knots)\b/],
  ["Frequency change", /\bcontact \S+.*\d{3}\.\d+|\bmonitor \S+|\bfrequency change approved\b/],
  ["Traffic", /\btraffic (\d|is|alert|no factor|in sight|holding|\S+ o'?clock)|\b\d{1,2} o'?clock\b/],
  ["Pattern", /\b(make (left|right) traffic|downwind|base|midfield|extend|closed traffic)\b/],
  ["Radar contact", /\bradar contact\b/],
  ["Check-in", /\bwith you\b|\bwith (information|[A-Z]\b)|\bchecking in\b/],
  ["Request", /\brequest(ing)?\b/],
  ["Go around", /\bgo around\b/],
  ["Weather/altimeter", /\b(altimeter|wind \d|visibility|ceiling)\b/],
  ["Readback/ack", /^(roger|wilco|copy|affirmative|negative)\b/]
];
function guessIntents(norm) {
  return INTENT_RULES.filter(([, re]) => re.test(norm)).map(([n]) => n).slice(0, 4);
}
var SLOT_RULES = [
  ["FREQ", /\b(1[1-3]\d\.\d{1,3})\b/g, 1],
  ["SQUAWK", /\b(squawk) (\d{4})\b/g, 2],
  ["ALTIM", /\b(altimeter) (\d{4}|\d{2}\.\d{2})\b/g, 2],
  ["WIND", /\b(wind) (\d{3} at \d{1,2}( gust(ing|s)? \d{1,2})?|calm|variable at \d+)\b/g, 2],
  ["RWY", /\b(runway) (\d{1,2}[LRC]?)\b/g, 2],
  ["RWY", /\b(hold(?:ing)? short(?: of)?|cross|crossing) (\d{1,2}[LRC]?)\b/g, 2],
  ["HDG", /\b(heading) (\d{3})\b/g, 2],
  ["HDG", /\b(left|right) (\d{3})\b/g, 2],
  ["RWY", /\b(takeoff|land|ils|rnav|visual|approach|wait|traffic|departure|arrival|via the \S+ \S+|expect) (\d{1,2}[LRC]?)\b(?!\d)/g, 2],
  ["FL", /\b(FL\d{2,3})\b/g, 1],
  ["ALT", /\b(maintain|climb|descend|climbing|descending|at|to|cross \S+ at|expect|leaving|passing|through) (\d{1,2}000|\d{1,2}[1-9]00|\d{3,5})\b(?! knots)/g, 2],
  ["SPD", /\b(speed|maintain) (\d{3}) knots\b|\bspeed (\d{3})\b/g, 0],
  ["TWY", /\b(via|taxiway|at|on|left on|right on|left at|right at) ((?:[A-Z]\d{0,2}\b ?){1,6})(?=\b)/g, 2],
  ["INFO", /\b(information|with) ([A-Z])\b(?!\d)/g, 2],
  ["DIST", /\b(\d{1,2}) (miles?|mile)\b/g, 1],
  ["CLOCK", /\b(\d{1,2}) o'?clock\b/g, 1]
];
function templatize(norm) {
  let tpl = ` ${norm} `;
  const slots = {};
  const add = (name, val) => {
    (slots[name] ||= []).push(val.trim());
  };
  tpl = tpl.replace(CALLSIGN_G, (m) => {
    add("CALLSIGN", m);
    return " {CALLSIGN} ";
  });
  for (const [name, re, g] of SLOT_RULES) {
    tpl = tpl.replace(re, (...args) => {
      const m = args[0];
      if (name === "SPD") {
        const v2 = args[2] || args[3];
        add(name, v2);
        return m.replace(v2, `{${name}}`);
      }
      const val = args[g];
      if (val == null) return m;
      if (name === "ALT" && /^\d{3}$/.test(val) && !/maintain|climb|descend/.test(args[1])) return m;
      const v = val.trim();
      if (name === "TWY" && !/[A-Z]/.test(v)) return m;
      add(name, v);
      return g === 0 ? `{${name}}` : m.replace(new RegExp(`${escapeRe(v)}(?![\\s\\S]*${escapeRe(v)})`), `{${name}}`);
    });
  }
  tpl = tpl.replace(/\b\d+(\.\d+)?\b/g, (m) => {
    add("N", m);
    return "{N}";
  });
  tpl = tpl.replace(/\s+/g, " ").trim();
  return { template: tpl, slots };
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseTransmission(text, { facility = "mixed" } = {}) {
  const norm = normalize(text);
  const { template, slots } = templatize(norm);
  return {
    norm,
    template,
    slots,
    callsign: findCallsign(norm),
    speaker: guessSpeaker(norm),
    phase: guessPhase(norm, facility),
    intents: guessIntents(norm)
  };
}

// src/lib/db.js
var DB_NAME = "atc-predictor";
var VERSION = 1;
var dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db2 = req.result;
      if (!db2.objectStoreNames.contains("tx")) {
        const s = db2.createObjectStore("tx", { keyPath: "id" });
        s.createIndex("ts", "ts");
        s.createIndex("airport", "airport");
      }
      if (!db2.objectStoreNames.contains("audio")) db2.createObjectStore("audio");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function run(store, mode, fn) {
  return open().then((db2) => new Promise((resolve, reject) => {
    const t = db2.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => {
      result = r;
    });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
var reqP = (r) => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
var db = {
  async all() {
    return run("tx", "readonly", (s) => reqP(s.getAll()));
  },
  async put(tx) {
    return run("tx", "readwrite", (s) => {
      s.put(tx);
    });
  },
  async putMany(list) {
    return run("tx", "readwrite", (s) => {
      list.forEach((t) => s.put(t));
    });
  },
  async remove(ids) {
    await run("tx", "readwrite", (s) => {
      ids.forEach((id) => s.delete(id));
    });
    await run("audio", "readwrite", (s) => {
      ids.forEach((id) => s.delete(id));
    });
  },
  async clear() {
    await run("tx", "readwrite", (s) => {
      s.clear();
    });
    await run("audio", "readwrite", (s) => {
      s.clear();
    });
  },
  async putAudio(id, blob) {
    return run("audio", "readwrite", (s) => {
      s.put(blob, id);
    });
  },
  async getAudio(id) {
    return run("audio", "readonly", (s) => reqP(s.get(id)));
  },
  async count() {
    return run("tx", "readonly", (s) => reqP(s.count()));
  }
};
function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// src/lib/stats.js
var FILLER = /\b(uh+|um+|ah+|the|and|a|good day|good morning|good afternoon|good evening|thanks|thank you|please|sir|ma'am)\b/g;
function groupKey(tx) {
  const t = (tx.template || "").toLowerCase().replace(FILLER, " ").replace(/\s+/g, " ").trim();
  return `${tx.speaker}|${tx.phase}|${t}`;
}
function topValues(list, n = 3) {
  const c = /* @__PURE__ */ new Map();
  for (const v of list) c.set(v, (c.get(v) || 0) + 1);
  const total = list.length;
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count, pct: count / total }));
}
function buildScenarios(txs) {
  const groups = /* @__PURE__ */ new Map();
  for (const tx of txs) {
    const k = groupKey(tx);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, speaker: tx.speaker, phase: tx.phase, items: [], templates: /* @__PURE__ */ new Map(), slotVals: {}, intents: /* @__PURE__ */ new Map() };
      groups.set(k, g);
    }
    g.items.push(tx);
    g.templates.set(tx.template, (g.templates.get(tx.template) || 0) + 1);
    for (const [name, vals] of Object.entries(tx.slots || {})) {
      if (name === "CALLSIGN" || name === "N") continue;
      const pos = g.slotVals[name] ||= [];
      vals.forEach((v, i) => (pos[i] ||= []).push(v));
    }
    for (const i of tx.intents || []) g.intents.set(i, (g.intents.get(i) || 0) + 1);
  }
  const total = txs.length || 1;
  return [...groups.values()].map((g) => {
    const template = [...g.templates.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const slots = {};
    const slotsPos = {};
    for (const [n, pos] of Object.entries(g.slotVals)) {
      slots[n] = topValues(pos.flat());
      slotsPos[n] = pos.map((v) => topValues(v));
    }
    const items = g.items.sort((a, b) => b.ts - a.ts);
    const meanings = items.map((t) => t.meaning).filter(Boolean);
    return {
      key: g.key,
      speaker: g.speaker,
      phase: g.phase,
      template,
      count: items.length,
      share: items.length / total,
      slots,
      slotsPos,
      intents: [...g.intents.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i).slice(0, 3),
      examples: items.slice(0, 6),
      meaning: meanings[0] || "",
      airports: [...new Set(items.map((t) => t.airport))],
      lastTs: items[0]?.ts || 0
    };
  }).sort((a, b) => b.count - a.count || b.lastTs - a.lastTs);
}
function attachReplies(txs) {
  const byFeed = /* @__PURE__ */ new Map();
  for (const t of txs) {
    const k = `${t.airport}|${t.feed}`;
    (byFeed.get(k) || byFeed.set(k, []).get(k)).push(t);
  }
  const replies = /* @__PURE__ */ new Map();
  for (const list of byFeed.values()) {
    list.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (a.speaker === "atc" && b.speaker === "pilot" && b.ts - a.ts < 2e4) replies.set(a.id, b);
    }
  }
  return replies;
}
function flightScript(txs, { perPhase = 3 } = {}) {
  const order = PHASES.filter((p) => p !== "other");
  return order.map((phase) => {
    const inPhase = txs.filter((t) => t.phase === phase);
    const atc = buildScenarios(inPhase.filter((t) => t.speaker === "atc")).slice(0, perPhase);
    const pilot = buildScenarios(inPhase.filter((t) => t.speaker === "pilot")).slice(0, perPhase);
    return { phase, total: inPhase.length, atc, pilot };
  }).filter((p) => p.total > 0);
}
function withContext(txs) {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const lastAtc = /* @__PURE__ */ new Map();
  return sorted.map((t) => {
    const k = `${t.airport}|${t.feed}`;
    const prev = lastAtc.get(k);
    let out = t;
    if (!t.cleaned && prev && t.ts - prev.ts < 2e4 && t.speaker !== "atc" && (t.phase === "other" || t.speaker === "unknown")) {
      out = { ...t, phase: t.phase === "other" ? prev.phase : t.phase, speaker: t.speaker === "unknown" ? "pilot" : t.speaker, inferred: true };
    }
    if (out.speaker === "atc") lastAtc.set(k, out);
    return out;
  });
}

// src/lib/chatgpt.js
function buildPrompt(txs) {
  const airports = [...new Set(txs.map((t) => t.airport).filter(Boolean))].join(", ") || "unknown";
  const lines = txs.map((t, i) => `${i + 1} | ${t.airport || "?"} ${t.facility || ""} | ${(t.corrected || t.text || t.raw || "").replace(/\s+/g, " ")}`);
  const prompt = `You are cleaning up automatic speech-to-text transcripts of US air traffic control radio (FAA phraseology, 7110.65 / AIM style).
Airports: ${airports}. Each line is one radio transmission from the facility shown.

For every line:
1. Fix speech-recognition mistakes: callsigns, airline telephony, N-numbers, numbers, phonetic letters, taxiway names, fixes, SIDs/STARs, frequencies, runway numbers. Use what makes sense for that airport.
2. Write it the way it would be printed in a training guide: numbers as digits (runway 27L, heading 270, climb and maintain 3000, 124.75, squawk 4521, altimeter 29.92), taxiways and letters as capitals (taxi via A, B3), airline names normally (JetBlue 1234, N123AB).
3. Don't invent words that aren't implied by the transcript. If a part is unreadable, keep it as close as you can and lower confidence.
4. Decide who is talking: "atc" (controller) or "pilot".
5. Pick the phase of flight, one of: ${PHASES.join(", ")}.
6. Give a short plain-English meaning a student pilot would understand.
7. Set "junk": true if it isn't a real ATC/pilot transmission (music, noise, hallucinated filler).

Reply with ONLY a JSON array (no prose, no code fence), one object per line, same numbers:
[{"n":1,"text":"...","speaker":"atc","phase":"taxi-out","meaning":"...","confidence":0.9,"junk":false}]

Lines (n | airport facility | transcript):
${lines.join("\n")}`;
  return { prompt, map: txs.map((t) => t.id) };
}
function parseReply(raw) {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a !== -1 && b > a) {
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {
    }
  }
  const out = [];
  for (const line of s.split("\n")) {
    const t = line.trim().replace(/,$/, "");
    if (t.startsWith("{")) {
      try {
        out.push(JSON.parse(t));
      } catch {
      }
    }
  }
  if (!out.length) throw new Error("Couldn't find a JSON array in what you pasted. Make sure you copied ChatGPT's whole reply.");
  return out;
}
function applyReply(txs, map, raw) {
  const rows = parseReply(raw);
  const byId = new Map(txs.map((t) => [t.id, t]));
  const updated = [];
  let junk = 0;
  const missing = [];
  for (const r of rows) {
    const n = +(r.n ?? r.id ?? r.line);
    const id = map[n - 1];
    const tx = id && byId.get(id);
    if (!tx) {
      missing.push(n);
      continue;
    }
    const text = (r.text || r.corrected || "").trim();
    const next = { ...tx };
    if (text) {
      next.corrected = text;
      Object.assign(next, parseTransmission(text, { facility: tx.facility }));
      next.text = text;
    }
    if (r.speaker === "atc" || r.speaker === "pilot") next.speaker = r.speaker;
    if (PHASES.includes(r.phase)) next.phase = r.phase;
    if (r.meaning) next.meaning = String(r.meaning);
    if (typeof r.confidence === "number") next.confidence = r.confidence;
    next.junk = !!r.junk;
    if (next.junk) junk++;
    next.cleaned = true;
    next.cleanedAt = Date.now();
    updated.push(next);
  }
  return { updated, junk, missing };
}
var FACILITY_CODES = ["del", "gnd", "twr", "app", "ctr", "atis", "ctaf", "mixed"];
function buildFeedPrompt(airports, wants = "") {
  const list = airports.map((a) => a.trim().toUpperCase()).filter(Boolean);
  return `Please look up the live air traffic control audio feeds on LiveATC.net for these airports: ${list.join(", ")}.
${wants ? `I mostly want: ${wants}.
` : ""}Search the web / liveatc.net (each airport has a page like https://www.liveatc.net/search/?icao=kbos).

For every feed you find, give me:
- "mount": the feed's ID exactly as LiveATC uses it. It's the value after "mount=" in the player link (https://www.liveatc.net/hlisten.php?mount=kbos_twr&icao=kbos) or the name of the .pls file (https://www.liveatc.net/play/kbos_twr.pls). Lowercase, e.g. "kbos_twr".
- "airport": the 4-letter ICAO code.
- "label": the feed's name on LiveATC, e.g. "Boston Tower" or "KBOS Del/Gnd/Twr".
- "facility": one of ${FACILITY_CODES.join(", ")} ("mixed" if the feed combines several facilities).
- "freqs": every frequency the feed covers, as strings like "128.8". This matters: different feeds often share a frequency, and I use it to remove duplicate calls.
- "verified": true only if you actually saw this mount on LiveATC; false if you're guessing.

Don't make up mounts. If you can't browse, say so and set "verified": false.
Reply with ONLY a JSON array (no prose, no code fence), like:
[{"mount":"kbos_twr","airport":"KBOS","label":"Boston Tower","facility":"twr","freqs":["128.8","132.225"],"verified":true}]`;
}
function parseFeedReply(raw) {
  const rows = parseReply(raw);
  const out = [];
  for (const r of rows) {
    const mount = String(r.mount || r.id || "").toLowerCase().replace(/^.*mount=/, "").replace(/[&?].*$/, "").replace(/\.pls$/, "").replace(/[^a-z0-9_.-]/g, "");
    if (!mount) continue;
    out.push({
      mount,
      airport: String(r.airport || mount.slice(0, 4)).toUpperCase().slice(0, 4),
      label: String(r.label || r.name || "").trim(),
      facility: FACILITY_CODES.includes(r.facility) ? r.facility : null,
      freqs: Array.isArray(r.freqs || r.frequencies) ? (r.freqs || r.frequencies).map(String) : String(r.freqs || r.frequencies || "").split(/[,;\s]+/).filter(Boolean),
      verified: r.verified !== false
    });
  }
  return out;
}

// src/lib/dedupe.js
function normFreq(f) {
  const m = String(f).match(/(1[1-3]\d)\.?(\d{1,3})?/);
  if (!m) return null;
  const n = (m[2] || "0").padEnd(3, "0");
  return `${m[1]}.${n}`.replace(/0+$/, "").replace(/\.$/, ".0");
}
function parseFreqs(input) {
  if (Array.isArray(input)) return [...new Set(input.map(normFreq).filter(Boolean))];
  return [...new Set(String(input || "").split(/[^0-9.]+/).map(normFreq).filter(Boolean))];
}
function overlaps(feeds) {
  const out = [];
  for (let i = 0; i < feeds.length; i++) {
    for (let j = i + 1; j < feeds.length; j++) {
      const fa = parseFreqs(feeds[i].freqs);
      const fb = parseFreqs(feeds[j].freqs);
      const shared = fa.filter((x) => fb.includes(x));
      if (shared.length) out.push({ a: feeds[i].mount, b: feeds[j].mount, freqs: shared });
    }
  }
  return out;
}
function squash(t) {
  return (t.norm || t.text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function similarity(a, b) {
  const sa = squash(a);
  const sb = squash(b);
  if (sa.length < 3 || sb.length < 3) return sa === sb ? 1 : 0;
  const grams = (s) => {
    const m = /* @__PURE__ */ new Map();
    for (let i = 0; i < s.length - 2; i++) {
      const g = s.slice(i, i + 3);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(sa);
  const gb = grams(sb);
  let inter = 0;
  for (const [g, c] of ga) inter += Math.min(c, gb.get(g) || 0);
  return 2 * inter / (sa.length - 2 + sb.length - 2);
}
function isDuplicate(a, b, freqMap = {}, { windowMs = 8e3, minSim = 0.75 } = {}) {
  if (!a || !b || a.id === b.id) return false;
  if (a.feed === b.feed) return false;
  if (a.airport !== b.airport) return false;
  if (Math.abs(a.ts - b.ts) > windowMs) return false;
  const fa = parseFreqs(freqMap[a.feed]);
  const fb = parseFreqs(freqMap[b.feed]);
  if (fa.length && fb.length && !fa.some((x) => fb.includes(x))) return false;
  if (a.speaker !== "unknown" && b.speaker !== "unknown" && a.speaker !== b.speaker) return false;
  return similarity(a, b) >= minSim;
}
function findDuplicates(txs, freqMap = {}) {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const drop = /* @__PURE__ */ new Set();
  const keep = /* @__PURE__ */ new Map();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (drop.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length && sorted[j].ts - a.ts <= 8e3; j++) {
      const b = sorted[j];
      if (drop.has(b.id)) continue;
      if (!isDuplicate(a, b, freqMap)) continue;
      const [winner, loser] = b.cleaned && !a.cleaned ? [b, a] : [a, b];
      drop.add(loser.id);
      const also = keep.get(winner.id) || [...winner.alsoOn || []];
      for (const f of [loser.feed, ...loser.alsoOn || []]) if (f && f !== winner.feed && !also.includes(f)) also.push(f);
      keep.set(winner.id, also);
      if (winner === b) break;
    }
  }
  return { keep, drop: [...drop] };
}

// src/lib/sample.js
var CS = [
  ["Cessna one two three alpha bravo", "three alpha bravo"],
  ["Skyhawk four seven two charlie papa", "two charlie papa"],
  ["Cherokee eight one lima", "eight one lima"],
  ["JetBlue fourteen twenty two", "JetBlue fourteen twenty two"],
  ["Delta twenty seven ninety", "Delta twenty seven ninety"],
  ["Southwest four fifty five", "Southwest four fifty five"],
  ["Archer niner five two sierra", "five two sierra"]
];
var pick = (a, i) => a[i % a.length];
var SCRIPT = [
  ["del", "{cs}, cleared to the Bradley airport via the Sample two departure, then as filed. Climb and maintain three thousand, expect five thousand one zero minutes after departure. Departure frequency one two four point seven five, squawk four five two one.", "Cleared to Bradley via the Sample two, three thousand, expect five thousand in ten, one two four point seven five, squawk four five two one, {sh}"],
  ["del", "{cs}, readback correct, contact ground one two one point niner when ready to taxi.", "Ground point niner, {sh}"],
  ["gnd", "{cs}, runway two seven, taxi via alpha, hold short of runway two seven.", "Runway two seven via alpha, hold short, {sh}"],
  ["gnd", "{cs}, runway two seven, taxi via alpha bravo, hold short of runway three three.", "Two seven via alpha bravo, hold short three three, {sh}"],
  ["gnd", "{cs}, cross runway three three, continue via alpha, monitor tower one one niner point one.", "Cross three three, alpha, monitor tower, {sh}"],
  ["twr", "{cs}, runway two seven, line up and wait.", "Line up and wait two seven, {sh}"],
  ["twr", "{cs}, wind two eight zero at one two, runway two seven, cleared for takeoff.", "Cleared for takeoff two seven, {sh}"],
  ["twr", "{cs}, fly runway heading, runway two seven, cleared for takeoff.", "Runway heading, cleared for takeoff, {sh}"],
  ["twr", "{cs}, contact departure, good day.", "Departure, {sh}, good day"],
  ["app", "{cs}, Sample departure, radar contact, climb and maintain five thousand.", "Climb and maintain five thousand, {sh}"],
  ["app", "{cs}, turn left heading two one zero, climb and maintain five thousand.", "Left two one zero, five thousand, {sh}"],
  ["ctr", "{cs}, contact Boston Center one three two point four five.", "One three two point four five, {sh}"],
  ["app", "{cs}, descend and maintain three thousand, expect the ILS runway two seven approach.", "Down to three thousand, expect ILS two seven, {sh}"],
  ["app", "{cs}, turn right heading two four zero, maintain two thousand five hundred until established on the localizer, cleared ILS runway two seven approach.", "Right two four zero, two thousand five hundred until established, cleared ILS two seven, {sh}"],
  ["app", "{cs}, contact tower one one niner point one.", "Tower one one niner point one, {sh}"],
  ["twr", "{cs}, runway two seven, cleared to land.", "Cleared to land two seven, {sh}"],
  ["twr", "{cs}, wind two seven zero at eight, runway two seven, cleared to land.", "Cleared to land runway two seven, {sh}"],
  ["twr", "{cs}, make left traffic runway two seven, report midfield downwind.", "Left traffic two seven, report midfield, {sh}"],
  ["twr", "{cs}, number two, follow the Skyhawk on left base, runway two seven, cleared touch and go.", "Number two, traffic in sight, cleared touch and go, {sh}"],
  ["twr", "{cs}, turn left at bravo, contact ground point niner.", "Left at bravo, ground point niner, {sh}"],
  ["gnd", "{cs}, taxi to the ramp via bravo alpha.", "Ramp via bravo alpha, {sh}"]
];
var PILOT_INIT = [
  ["gnd", "Sample Ground, {cs}, at the FBO with information kilo, ready to taxi, VFR to the south."],
  ["twr", "Sample Tower, {cs}, holding short runway two seven, ready for departure."],
  ["app", "Sample Approach, {cs}, with you at four thousand with information kilo."],
  ["twr", "Sample Tower, {cs}, one zero miles south, inbound for landing with information kilo."]
];
var MESSY = [
  ["gnd", "Jet blue 14 22 runway to 7 taxi via alpha holds short of runway 27"],
  ["twr", "Delta 27 90 wins 280 at 12 runway 2 7 clear for take off"],
  ["app", "Southwest 455 descended maintain 3000 expect the eye less runway 27 approach"]
];
function makeSample() {
  const out = [];
  let ts = Date.now() - 1e3 * 60 * 60 * 30;
  const push = (facility, text, i) => {
    ts += 15e3 + i % 7 * 9e3;
    const p = parseTransmission(text, { facility });
    out.push({ id: newId(), ts, airport: "KSMP", feed: `ksmp_${facility}`, facility, source: "sample", raw: text, text, durationSec: 3, ...p });
  };
  let n = 0;
  for (let rep = 0; rep < 3; rep++) {
    SCRIPT.forEach(([fac, atc, reply], k) => {
      if ((k + rep) % 4 === 3 && rep > 0) return;
      const [cs, sh] = pick(CS, k + rep * 3);
      push(fac, atc.replace("{cs}", cs), n++);
      push(fac, reply.replace("{sh}", sh), n++);
    });
    PILOT_INIT.forEach(([fac, line], k) => push(fac, line.replace("{cs}", pick(CS, k + rep)[0]), n++));
  }
  MESSY.forEach(([fac, line]) => push(fac, line, n++));
  return out;
}

// src/lib/stream.js
function mountFromInput(input = "") {
  const s = input.trim();
  try {
    const u = new URL(s);
    if (u.searchParams.get("mount")) return u.searchParams.get("mount");
    const m = u.pathname.match(/\/(?:play\/)?([a-z0-9_.-]+?)(?:\.pls|\.m3u|\.mp3)?$/i);
    if (m) return m[1];
  } catch {
  }
  return s.replace(/\.(pls|m3u|mp3)$/i, "").replace(/[^a-z0-9_.-]/gi, "").toLowerCase();
}
function airportFromMount(mount = "") {
  const m = mount.toUpperCase().match(/^([A-Z]{4})/);
  return m ? m[1] : "";
}
async function findFeeds(icao) {
  const r = await fetch(`https://www.liveatc.net/search/?icao=${encodeURIComponent(icao.toLowerCase())}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`LiveATC search failed (HTTP ${r.status})`);
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const feeds = /* @__PURE__ */ new Map();
  for (const a of doc.querySelectorAll('a[href*="mount="], a[href*="/play/"]')) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/mount=([a-z0-9_.-]+)/i) || href.match(/\/play\/([a-z0-9_.-]+)\.pls/i);
    if (!m) continue;
    const mount = m[1].toLowerCase();
    if (feeds.has(mount)) continue;
    let label = "";
    const row = a.closest("table, tr, div");
    const strong = row?.querySelector("strong, b, h3, h2");
    if (strong) label = strong.textContent.replace(/\s+/g, " ").trim();
    let block = a.closest("table");
    if (block?.parentElement?.closest("table")) block = block.parentElement.closest("table");
    const freqs = [...new Set(((block || row)?.textContent || "").match(/\b1[1-3]\d\.\d{1,3}\b/g) || [])];
    feeds.set(mount, { mount, label: label || mount, freqs });
  }
  return [...feeds.values()];
}

// src/site/app.js
var $ = (id) => document.getElementById(id);
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var pct = (x) => `${Math.round(x * 100)}%`;
var fmtTime = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
var IN_EXT = typeof chrome !== "undefined" && !!chrome.runtime?.id;
var all = [];
var view = [];
var tab = "predict";
var listLimit = 150;
var selected = /* @__PURE__ */ new Set();
var PREF_KEY = "atcp-filters";
async function load() {
  all = await db.all();
  view = withContext(all);
  fillFilterOptions();
  render();
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
function opt(v, label, cur) {
  return `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
}
function fillFilterOptions() {
  const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  const cur = (id) => $(id).dataset.ready ? $(id).value : saved[id];
  const airports = [...new Set(all.map((t) => t.airport).filter(Boolean))].sort();
  const a = cur("fAirport");
  $("fAirport").innerHTML = opt("", "All airports", a) + airports.map((x) => opt(x, x, a)).join("");
  const f = cur("fFacility");
  $("fFacility").innerHTML = opt("", "All", f) + FACILITIES.map((x) => opt(x, FACILITY_LABELS[x], f)).join("");
  const p = cur("fPhase");
  $("fPhase").innerHTML = opt("", "All phases", p) + PHASES.map((x) => opt(x, PHASE_LABELS[x], p)).join("");
  const rws = /* @__PURE__ */ new Set();
  for (const t of all) if (!a || t.airport === a) for (const r2 of t.slots?.RWY || []) rws.add(r2);
  const r = cur("fRunway");
  $("fRunway").innerHTML = opt("", "Any", r) + [...rws].sort((x, y) => parseInt(x) - parseInt(y)).map((x) => opt(x, x, r)).join("");
  for (const id of ["fSpeaker", "fWhen"]) if (!$(id).dataset.ready && saved[id] != null) $(id).value = saved[id];
  if (!$("fSearch").dataset.ready && saved.fSearch) $("fSearch").value = saved.fSearch;
  ["fAirport", "fFacility", "fPhase", "fRunway", "fSpeaker", "fWhen", "fSearch"].forEach((id) => {
    $(id).dataset.ready = "1";
  });
  $("count").textContent = `${all.length} calls`;
}
function saveFilters() {
  const v = {};
  for (const id of ["fAirport", "fFacility", "fPhase", "fRunway", "fSpeaker", "fWhen", "fSearch"]) v[id] = $(id).value;
  localStorage.setItem(PREF_KEY, JSON.stringify(v));
}
function filtered({ ignoreSpeaker = false, ignorePhase = false } = {}) {
  const a = $("fAirport").value, f = $("fFacility").value, p = $("fPhase").value, s = $("fSpeaker").value;
  const r = $("fRunway").value, w = +$("fWhen").value, q = $("fSearch").value.trim().toLowerCase();
  const since = w ? Date.now() - w * 864e5 : 0;
  return view.filter((t) => (!a || t.airport === a) && (!f || t.facility === f) && (ignorePhase || !p || t.phase === p) && (ignoreSpeaker || !s || t.speaker === s) && (!r || (t.slots?.RWY || []).includes(r)) && (!since || t.ts >= since) && (!$("fHideJunk").checked || !t.junk) && (!q || `${t.text} ${t.norm} ${t.raw} ${t.meaning || ""}`.toLowerCase().includes(q)));
}
function renderTemplate(tpl, slots, ex, slotsPos) {
  const counters = {};
  return esc(tpl).replace(/\{([A-Z]+)\}/g, (_, name) => {
    if (name === "CALLSIGN") return '<span class="slot cs" title="Callsign">callsign</span>';
    const idx = counters[name] = (counters[name] ?? -1) + 1;
    const choices = slotsPos?.[name]?.[idx] || slots?.[name] || [];
    let val = choices[0]?.value ?? null;
    if (!val && ex?.slots?.[name]) val = ex.slots[name][idx] ?? ex.slots[name][0];
    const tip = choices.map((v) => `${v.value} (${pct(v.pct)})`).join(", ") || name;
    return `<span class="slot" title="${esc(name)}: ${esc(tip)}">${esc(val ?? name.toLowerCase())}</span>`;
  });
}
var SLOT_NAMES = { RWY: "Runway", TWY: "Taxiways", ALT: "Altitude", FL: "Flight level", HDG: "Heading", FREQ: "Frequency", SQUAWK: "Squawk", ALTIM: "Altimeter", WIND: "Wind", SPD: "Speed", INFO: "ATIS", DIST: "Miles", CLOCK: "O'clock" };
function slotSummary(slots) {
  return Object.entries(slots).filter(([n]) => SLOT_NAMES[n]).map(([n, vals]) => `<span>${SLOT_NAMES[n]}: ${vals.map((v) => `<b>${esc(v.value)}</b> ${pct(v.pct)}`).join(" \xB7 ")}</span>`).join("");
}
function exampleRows(items, replies) {
  return items.map((t) => {
    const rep = replies?.get(t.id);
    return `<div class="exrow"><time>${fmtTime(t.ts)}</time>${t.hasAudio ? `<button class="play" data-play="${t.id}">\u25B6</button>` : ""}
      <div>${esc(t.text)} <span class="muted">\xB7 ${esc(t.airport)} ${esc(FACILITY_LABELS[t.facility] || "")}${t.cleaned ? " \xB7 cleaned" : ""}${t.source === "sample" ? " \xB7 sample" : ""}</span>
      ${rep ? `<div class="reply"><span>Reply:</span> ${esc(rep.text)}</div>` : ""}</div></div>`;
  }).join("");
}
function renderPredict() {
  const txs = filtered();
  const sc = buildScenarios(txs);
  const replies = attachReplies(view);
  const a = $("fAirport").value || "all airports";
  const p = $("fPhase").value ? PHASE_LABELS[$("fPhase").value] : "every phase";
  const who = { atc: "controller calls", pilot: "pilot calls", "": "calls" }[$("fSpeaker").value];
  $("predictHead").innerHTML = `<h2>Most likely ${who} \xB7 ${esc(a)} \xB7 ${esc(p)}</h2>
    <p class="muted">${txs.length} transmissions grouped into ${sc.length} scenarios. Percentages are share of the filtered calls. Hover a blue value to see the alternatives.</p>`;
  if (!all.length) {
    $("scenarios").innerHTML = "";
    $("scenarios").append($("tplEmpty").content.cloneNode(true));
    return;
  }
  if (!sc.length) {
    $("scenarios").innerHTML = '<div class="empty"><p>Nothing matches these filters.</p></div>';
    return;
  }
  $("scenarios").innerHTML = sc.slice(0, 60).map((g, i) => {
    const rep = g.speaker === "atc" ? topReply(g, replies) : null;
    return `<article class="sc">
      <div class="rank"><b>${i + 1}</b><small>${g.count}\xD7 \xB7 ${pct(g.share)}</small><div class="bar"><i style="width:${Math.max(4, g.share * 100)}%"></i></div></div>
      <div>
        <div class="tpl">${renderTemplate(g.template, g.slots, g.examples[0], g.slotsPos)}</div>
        <div class="meta"><span class="chip ${g.speaker}">${g.speaker === "atc" ? "Controller" : g.speaker === "pilot" ? "Pilot" : "Unknown"}</span>
          <span class="chip ph">${esc(PHASE_LABELS[g.phase] || g.phase)}</span>
          ${g.intents.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}
          ${g.airports.length > 1 ? `<span class="chip">${g.airports.length} airports</span>` : ""}</div>
        ${Object.keys(g.slots).length ? `<div class="vals">${slotSummary(g.slots)}</div>` : ""}
        ${g.meaning ? `<div class="meaning">${esc(g.meaning)}</div>` : ""}
        ${rep ? `<div class="reply"><span>Typical readback:</span> ${esc(rep)}</div>` : ""}
        <details class="ex"><summary>Real examples (${Math.min(g.count, 6)} of ${g.count})</summary>${exampleRows(g.examples, replies)}</details>
      </div></article>`;
  }).join("");
}
function topReply(g, replies) {
  const reps = g.examples.map((t) => replies.get(t.id)).filter(Boolean);
  if (!reps.length) return null;
  const top = buildScenarios(reps)[0];
  return top?.examples[0]?.text || null;
}
function renderScript() {
  const base = filtered({ ignoreSpeaker: true, ignorePhase: true });
  if (!all.length) {
    $("script").innerHTML = "";
    $("script").append($("tplEmpty").content.cloneNode(true));
    return;
  }
  const fs = flightScript(base);
  if (!fs.length) {
    $("script").innerHTML = '<div class="empty"><p>Nothing matches these filters.</p></div>';
    return;
  }
  const mini = (g) => `<div class="mini"><div class="pct">${g.count}\xD7 \xB7 ${pct(g.share)}</div><div class="tpl">${renderTemplate(g.template, g.slots, g.examples[0], g.slotsPos)}</div>
    ${g.meaning ? `<div class="muted" style="font-size:12px;margin-top:3px">${esc(g.meaning)}</div>` : ""}</div>`;
  $("script").innerHTML = fs.map((p) => `<div class="phase"><h3>${esc(PHASE_LABELS[p.phase])} <span class="muted">${p.total} calls</span></h3>
    <div class="cols"><div><div class="colh">Controller says</div>${p.atc.map(mini).join("") || '<p class="muted">\u2014</p>'}</div>
    <div><div class="colh">Pilot says</div>${p.pilot.map(mini).join("") || '<p class="muted">\u2014</p>'}</div></div></div>`).join("");
}
function renderList() {
  const txs = filtered({ ignoreSpeaker: !$("fSpeaker").value }).sort((a, b) => b.ts - a.ts);
  $("listTitle").textContent = `Transmissions (${txs.length})`;
  if (!all.length) {
    $("list").innerHTML = "";
    $("list").append($("tplEmpty").content.cloneNode(true));
    $("more").classList.add("hidden");
    return;
  }
  const sel = (cls, cur, opts) => `<select data-field="${cls}">${opts.map(([v, l]) => opt(v, l, cur)).join("")}</select>`;
  $("list").innerHTML = txs.slice(0, listLimit).map((t) => `<div class="tx${t.junk ? " junk" : ""}" data-id="${t.id}">
    <input type="checkbox" data-sel ${selected.has(t.id) ? "checked" : ""}>
    <div class="when">${fmtTime(t.ts)}<br>${esc(t.airport)} \xB7 ${esc(t.facility)}</div>
    <div><div class="txt" contenteditable="plaintext-only" spellcheck="false" data-edit>${esc(t.text)}</div>
      ${t.raw && t.raw !== t.text ? `<div class="raw">heard: ${esc(t.raw)}</div>` : ""}
      ${t.meaning ? `<div class="raw">means: ${esc(t.meaning)}</div>` : ""}
      ${t.alsoOn?.length ? `<div class="raw">also heard on: ${esc(t.alsoOn.join(", "))}</div>` : ""}</div>
    <div class="sel">${t.hasAudio ? `<button class="play" data-play="${t.id}">\u25B6</button>` : ""}
      ${sel("speaker", t.speaker, [["atc", "ATC"], ["pilot", "Pilot"], ["unknown", "?"]])}
      ${sel("phase", t.phase, PHASES.map((p) => [p, PHASE_LABELS[p]]))}
      <button class="play" data-junk title="Toggle junk">${t.junk ? "unjunk" : "junk"}</button></div>
  </div>`).join("");
  $("more").classList.toggle("hidden", txs.length <= listLimit);
}
function gptBatch() {
  let txs = $("gUseFilter").checked ? filtered({ ignoreSpeaker: true }) : [...view];
  if ($("gOnlyRaw").checked) txs = txs.filter((t) => !t.cleaned);
  txs = txs.filter((t) => !t.junk).sort((a, b) => a.ts - b.ts).slice(0, +$("gSize").value);
  return txs;
}
function renderGpt() {
  $("gSizeOut").textContent = $("gSize").value;
  const b = gptBatch();
  const left = ($("gUseFilter").checked ? filtered({ ignoreSpeaker: true }) : view).filter((t) => !t.cleaned && !t.junk).length;
  $("gInfo").textContent = b.length ? `${b.length} transmissions in this batch \xB7 ${left} not cleaned yet` : "Nothing to send with these settings.";
  $("gPreview").textContent = b.length ? buildPrompt(b).prompt : "";
}
function render() {
  const sample = all.some((t) => t.source === "sample");
  $("banner").classList.toggle("hidden", !sample);
  $("banner").textContent = sample ? "Sample data is loaded (airport KSMP is made up). Remove it from Data \u25BE when you have real recordings." : "";
  if (tab === "predict") renderPredict();
  if (tab === "script") renderScript();
  if (tab === "list") renderList();
  if (tab === "gpt") renderGpt();
  if (tab === "feeds") renderFeeds();
  $("filters").classList.toggle("hidden", tab === "feeds");
}
$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  tab = b.dataset.view;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== `view-${tab}`));
  render();
});
for (const id of ["fAirport", "fFacility", "fPhase", "fRunway", "fSpeaker", "fWhen", "fHideJunk"]) {
  $(id).addEventListener("change", () => {
    if (id === "fAirport") {
      $("fRunway").value = "";
      fillFilterOptions();
    }
    saveFilters();
    listLimit = 150;
    render();
  });
}
var qT;
$("fSearch").addEventListener("input", () => {
  clearTimeout(qT);
  qT = setTimeout(() => {
    saveFilters();
    render();
  }, 200);
});
document.addEventListener("click", async (e) => {
  const play = e.target.closest("[data-play]");
  if (play) {
    const blob = await db.getAudio(play.dataset.play);
    if (!blob) return toast("No audio saved for this one.");
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.play();
    a.onended = () => URL.revokeObjectURL(url);
    return;
  }
  if (e.target.closest('[data-act="sample"]')) return loadSample();
  const junk = e.target.closest("[data-junk]");
  if (junk) {
    const id = junk.closest(".tx").dataset.id;
    const t = all.find((x) => x.id === id);
    t.junk = !t.junk;
    await db.put(t);
    view = withContext(all);
    render();
  }
  if (!e.target.closest(".data")) $("dataMenu").classList.add("hidden");
});
$("list").addEventListener("change", async (e) => {
  const row = e.target.closest(".tx");
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.matches("[data-sel]")) {
    e.target.checked ? selected.add(id) : selected.delete(id);
    return;
  }
  const field = e.target.dataset.field;
  if (field) {
    const t = all.find((x) => x.id === id);
    t[field] = e.target.value;
    t.manual = true;
    t.cleaned = true;
    await db.put(t);
    view = withContext(all);
  }
});
$("list").addEventListener("focusout", async (e) => {
  if (!e.target.matches("[data-edit]")) return;
  const id = e.target.closest(".tx").dataset.id;
  const t = all.find((x) => x.id === id);
  const text = e.target.textContent.trim();
  if (!text || text === t.text) return;
  const keep = { speaker: t.speaker, phase: t.phase };
  const wasLabeled = t.manual || t.cleaned;
  Object.assign(t, parseTransmission(text, { facility: t.facility }), { text, corrected: text, cleaned: true, manual: true });
  if (wasLabeled) Object.assign(t, keep);
  await db.put(t);
  view = withContext(all);
  toast("Saved");
});
$("list").addEventListener("keydown", (e) => {
  if (e.target.matches("[data-edit]") && e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
});
$("selAll").onclick = () => {
  filtered({ ignoreSpeaker: !$("fSpeaker").value }).slice(0, listLimit).forEach((t) => selected.add(t.id));
  render();
};
$("delSel").onclick = async () => {
  if (!selected.size) return toast("Nothing selected");
  if (!confirm(`Delete ${selected.size} transmissions? This can't be undone.`)) return;
  await db.remove([...selected]);
  selected.clear();
  await load();
  toast("Deleted");
};
$("reparse").onclick = async () => {
  const ids = new Set(filtered({ ignoreSpeaker: !$("fSpeaker").value }).map((t) => t.id));
  const upd = all.filter((t) => ids.has(t.id)).map((t) => {
    const p = parseTransmission(t.text, { facility: t.facility });
    if (t.cleaned) {
      delete p.speaker;
      delete p.phase;
    }
    return Object.assign(t, p);
  });
  await db.putMany(upd);
  await load();
  toast(`Re-parsed ${upd.length}`);
};
$("more").onclick = () => {
  listLimit += 150;
  render();
};
$("dedupe").onclick = async () => {
  const freqMap = {};
  if (IN_EXT) for (const f of (await chrome.storage.local.get("favorites")).favorites || []) freqMap[f.mount] = f.freqs || [];
  const { keep, drop } = findDuplicates(all, freqMap);
  if (!drop.length) return toast("No duplicates found");
  if (!confirm(`Found ${drop.length} calls that were recorded twice on feeds sharing a frequency. Merge them? The extra copies are deleted.`)) return;
  const upd = all.filter((t) => keep.has(t.id)).map((t) => ({ ...t, alsoOn: keep.get(t.id) }));
  await db.putMany(upd);
  await db.remove(drop);
  await load();
  toast(`Merged ${drop.length} duplicates`);
};
["gOnlyRaw", "gUseFilter", "gSize"].forEach((id) => $(id).addEventListener("input", renderGpt));
$("gCopy").onclick = async () => {
  const b = gptBatch();
  if (!b.length) return toast("Nothing to copy");
  const { prompt, map } = buildPrompt(b);
  localStorage.setItem("atcp-gpt-map", JSON.stringify(map));
  try {
    await navigator.clipboard.writeText(prompt);
    toast(`Copied ${b.length} lines. Paste into ChatGPT.`);
  } catch {
    $("gPreview").closest("details").open = true;
    toast("Clipboard blocked \u2014 copy it from the preview.");
  }
};
$("gApply").onclick = async () => {
  const map = JSON.parse(localStorage.getItem("atcp-gpt-map") || "[]");
  if (!map.length) {
    $("gResult").innerHTML = '<span class="bad">Copy a prompt first, so I know which lines the reply belongs to.</span>';
    return;
  }
  try {
    const { updated, junk, missing } = applyReply(all, map, $("gReply").value);
    await db.putMany(updated);
    $("gResult").innerHTML = `<span class="ok">Updated ${updated.length} transmissions${junk ? `, ${junk} marked junk` : ""}.</span>${missing.length ? ` <span class="bad">${missing.length} lines didn't match.</span>` : ""}`;
    $("gReply").value = "";
    await load();
  } catch (err) {
    $("gResult").innerHTML = `<span class="bad">${esc(err.message)}</span>`;
  }
};
$("dataBtn").onclick = (e) => {
  e.stopPropagation();
  $("dataMenu").classList.toggle("hidden");
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.transmissions || [];
    const txs = [];
    let audio = 0;
    for (const t of list) {
      if (!t.id || !(t.text || t.raw)) continue;
      const { audioData, ...rest } = t;
      if (!rest.template) Object.assign(rest, parseTransmission(rest.text || rest.raw, { facility: rest.facility }));
      txs.push(rest);
      if (audioData) {
        await db.putAudio(t.id, await (await fetch(audioData)).blob());
        audio++;
      }
    }
    await db.putMany(txs);
    await load();
    toast(`Imported ${txs.length} transmissions${audio ? ` with ${audio} clips` : ""}`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
  e.target.value = "";
};
async function doExport(withAudio) {
  const list = [];
  for (const t of all) {
    const row = { ...t };
    if (withAudio && t.hasAudio) {
      const blob2 = await db.getAudio(t.id);
      if (blob2) row.audioData = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob2);
      });
    }
    list.push(row);
  }
  const blob = new Blob([JSON.stringify({ app: "atc-predictor", version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), transmissions: list })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atc-predictor-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
}
$("exportBtn").onclick = () => doExport(false);
$("exportAudioBtn").onclick = () => doExport(true);
async function loadSample() {
  await db.putMany(makeSample());
  await load();
  toast("Sample data loaded");
}
$("sampleBtn").onclick = loadSample;
$("clearSampleBtn").onclick = async () => {
  await db.remove(all.filter((t) => t.source === "sample").map((t) => t.id));
  await load();
  toast("Sample data removed");
};
$("clearBtn").onclick = async () => {
  if (!confirm(`Delete all ${all.length} transmissions and audio? Export first if you want a backup. This can't be undone.`)) return;
  await db.clear();
  await load();
  toast("Everything deleted");
};
var getFavs = async () => (await chrome.storage.local.get("favorites")).favorites || [];
var setFavs = (favorites) => chrome.storage.local.set({ favorites });
async function addFav(mount, label = "", freqs = []) {
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
  const { feedState = {} } = await chrome.storage.session.get("feedState");
  const { feedPrefs = {} } = await chrome.storage.local.get("feedPrefs");
  $("fdAuto").checked = !!feedPrefs.autoStart;
  if (!favs.length) {
    $("favTable").innerHTML = '<div class="empty"><p>No favorites yet. Find an airport\u2019s feeds below and tick the ones you want.</p></div>';
    return;
  }
  const counts = {};
  for (const t of all) counts[t.feed] = (counts[t.feed] || 0) + 1;
  const ov = overlaps(favs);
  const ovFor = (m) => ov.filter((o) => o.a === m || o.b === m).map((o) => `${o.freqs.join(", ")} also on ${o.a === m ? o.b : o.a}`);
  $("favTable").innerHTML = favs.map((f) => {
    const fs = feedState[`feed:${f.mount}`] || { state: "idle" };
    const on = fs.state && fs.state !== "idle";
    return `<div class="frow" data-mount="${esc(f.mount)}">
      <span class="dot ${esc(fs.state || "idle")}" title="${esc(fs.detail || "")}"></span>
      <input data-f="airport" value="${esc(f.airport)}" maxlength="4" title="Airport ICAO">
      <div><input data-f="label" value="${esc(f.label)}" placeholder="${esc(f.mount)}" title="Label"><div class="st">${esc(f.mount)} \xB7 ${counts[f.mount] || 0} calls saved${on ? ` \xB7 ${esc(fs.detail || fs.state)}${fs.count ? ` \xB7 ${fs.count} this session` : ""}` : ""}</div>
        <input data-f="freqs" value="${esc(parseFreqs(f.freqs).join(", "))}" placeholder="Frequencies, e.g. 128.8, 121.9" title="Frequencies this feed covers (used to merge duplicate calls)">
        ${ovFor(f.mount).map((w) => `<div class="warn">\u26A0 Shares ${esc(w)}. The same call on both feeds is saved once.</div>`).join("")}
        ${f.unverified ? '<div class="unv">Unverified (ChatGPT guessed this one). Press Listen to check it exists, then tick \u201CIn Start all\u201D.</div>' : ""}</div>
      <select data-f="facility">${FACILITIES.map((x) => opt(x, FACILITY_LABELS[x], f.facility)).join("")}</select>
      <label class="check"><input type="checkbox" data-f="enabled" ${f.enabled !== false ? "checked" : ""}> In \u201CStart all\u201D</label>
      <div class="btns"><button data-fa="toggle">${on ? "Stop" : "Start"}</button>
        <button data-fa="listen" title="Open the LiveATC player to listen">Listen</button>
        <button data-fa="remove" class="danger" title="Remove from favorites">\u2715</button></div>
    </div>`;
  }).join("");
}
if (IN_EXT) {
  $("feedsTab").classList.remove("hidden");
  $("favTable").addEventListener("change", async (e) => {
    const row = e.target.closest(".frow");
    const k = e.target.dataset.f;
    if (!row || !k) return;
    const favs = await getFavs();
    const f = favs.find((x) => x.mount === row.dataset.mount);
    f[k] = e.target.type === "checkbox" ? e.target.checked : k === "airport" ? e.target.value.toUpperCase() : k === "freqs" ? parseFreqs(e.target.value) : e.target.value;
    if (k === "enabled" && e.target.checked) delete f.unverified;
    await setFavs(favs);
    toast("Saved. Restart the feed for changes to apply.");
  });
  $("favTable").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fa]");
    if (!b) return;
    const mount = b.closest(".frow").dataset.mount;
    const favs = await getFavs();
    const f = favs.find((x) => x.mount === mount);
    if (b.dataset.fa === "toggle") {
      const r = b.textContent === "Stop" ? await chrome.runtime.sendMessage({ type: "stopFeed", id: `feed:${mount}` }) : await chrome.runtime.sendMessage({ type: "startFeeds", feeds: [f] });
      if (!r?.ok) toast(r?.error || "Failed");
    }
    if (b.dataset.fa === "listen") window.open(`https://www.liveatc.net/hlisten.php?mount=${encodeURIComponent(mount)}&icao=${encodeURIComponent((f.airport || "").toLowerCase())}`, "_blank");
    if (b.dataset.fa === "remove") {
      await chrome.runtime.sendMessage({ type: "stopFeed", id: `feed:${mount}` });
      await setFavs(favs.filter((x) => x.mount !== mount));
    }
    renderFeeds();
  });
  $("fdStartAll").onclick = async () => {
    const r = await chrome.runtime.sendMessage({ type: "startFavorites" });
    if (!r?.ok) toast(r?.error || "Failed");
  };
  $("fdStopAll").onclick = () => chrome.runtime.sendMessage({ type: "stop" });
  $("fdAuto").onchange = async () => {
    const { feedPrefs = {} } = await chrome.storage.local.get("feedPrefs");
    await chrome.storage.local.set({ feedPrefs: { ...feedPrefs, autoStart: $("fdAuto").checked } });
  };
  const find = async () => {
    const icao = $("fdIcao").value.trim();
    if (!icao) return;
    $("fdResults").textContent = "Searching LiveATC\u2026";
    try {
      const feeds = await findFeeds(icao);
      const favs = await getFavs();
      if (!feeds.length) {
        $("fdResults").textContent = "No feeds found for that airport. You can still add one by name on the right.";
        return;
      }
      $("fdResults").innerHTML = `<div class="found">${feeds.map((f) => `<label><input type="checkbox" data-add="${esc(f.mount)}" data-label="${esc(f.label === f.mount ? "" : f.label)}" data-freqs="${esc(f.freqs.join(","))}" ${favs.some((x) => x.mount === f.mount) ? "checked disabled" : ""}>
        <span>${esc(f.label)} <small>${esc(f.mount)}${f.freqs.length ? ` \xB7 ${esc(f.freqs.join(", "))}` : ""}</small></span></label>`).join("")}</div>`;
    } catch (err) {
      $("fdResults").textContent = err.message;
    }
  };
  $("fdFind").onclick = find;
  $("fdIcao").addEventListener("keydown", (e) => {
    if (e.key === "Enter") find();
  });
  $("fdResults").addEventListener("change", async (e) => {
    const c = e.target.closest("[data-add]");
    if (!c || !c.checked) return;
    if (await addFav(c.dataset.add, c.dataset.label, c.dataset.freqs)) {
      c.disabled = true;
      toast(`Added ${c.dataset.add}`);
      renderFeeds();
    }
  });
  $("fdAdd").onclick = async () => {
    const ok = await addFav($("fdManual").value);
    $("fdMsg").innerHTML = ok ? '<span class="ok">Added.</span>' : '<span class="bad">Not added (empty or already a favorite).</span>';
    if (ok) {
      $("fdManual").value = "";
      renderFeeds();
    }
  };
  $("fgCopy").onclick = async () => {
    const airports = $("fgAirports").value.split(/[\s,;]+/).filter((x) => /^[a-z0-9]{3,4}$/i.test(x));
    if (!airports.length) return toast("Type at least one airport code");
    const prompt = buildFeedPrompt(airports, $("fgWants").value.trim());
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Copied. Paste it into ChatGPT.");
    } catch {
      $("fgReply").value = prompt;
      toast("Clipboard blocked; the prompt is in the box. Copy it from there.");
    }
  };
  $("fgApply").onclick = async () => {
    let rows;
    try {
      rows = parseFeedReply($("fgReply").value);
    } catch (err) {
      $("fgResult").innerHTML = `<span class="bad">${esc(err.message)}</span>`;
      return;
    }
    const favs = await getFavs();
    const lines = [];
    for (const r of rows) {
      const ex = favs.find((f) => f.mount === r.mount);
      if (ex) {
        const freqs = parseFreqs([...ex.freqs || [], ...r.freqs]);
        const changed = freqs.length !== parseFreqs(ex.freqs).length || !ex.label && r.label;
        ex.freqs = freqs;
        ex.label ||= r.label;
        lines.push(`<span class="muted">${esc(r.mount)}: already a favorite${changed ? " (filled in frequencies/label)" : ""}</span>`);
        continue;
      }
      favs.push({ mount: r.mount, airport: r.airport, label: r.label, facility: r.facility || facilityFromFeed(`${r.mount} ${r.label}`), freqs: parseFreqs(r.freqs), enabled: r.verified, ...r.verified ? {} : { unverified: true } });
      lines.push(r.verified ? `<span class="ok">Added ${esc(r.airport)} ${esc(r.label || r.mount)} (${esc(r.mount)})</span>` : `<span class="warn">Added ${esc(r.mount)} as unverified (not in Start all)</span>`);
    }
    await setFavs(favs);
    const ov = overlaps(favs);
    if (ov.length) lines.push(`<span class="muted">${ov.length} pair${ov.length > 1 ? "s" : ""} of feeds share a frequency. Duplicate calls are merged automatically.</span>`);
    $("fgResult").innerHTML = `<div class="fgres">${lines.join("") || '<span class="bad">No feeds found in that reply.</span>'}</div>`;
    if (rows.length) $("fgReply").value = "";
    renderFeeds();
  };
  chrome.storage.onChanged.addListener(() => {
    if (tab === "feeds") renderFeeds();
  });
  if (location.hash === "#feeds") document.querySelector("#tabs button[data-view=feeds]").click();
}
if (IN_EXT) {
  let t;
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type === "tx") {
      clearTimeout(t);
      t = setTimeout(load, 800);
    }
  });
}
load();

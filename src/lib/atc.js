// ATC transcript parsing: normalize spoken phraseology, guess speaker and phase,
// and turn each call into a template with slots so similar calls group together.

export const PHASES = [
  'clearance', 'taxi-out', 'takeoff', 'departure', 'enroute',
  'arrival', 'approach', 'pattern', 'landing', 'taxi-in', 'atis', 'other',
];

export const PHASE_LABELS = {
  'clearance': 'Clearance', 'taxi-out': 'Taxi out', 'takeoff': 'Takeoff',
  'departure': 'Departure', 'enroute': 'Enroute', 'arrival': 'Arrival',
  'approach': 'Approach', 'pattern': 'Pattern', 'landing': 'Landing',
  'taxi-in': 'Taxi in', 'atis': 'ATIS', 'other': 'Other',
};

export const FACILITIES = ['del', 'gnd', 'twr', 'app', 'ctr', 'atis', 'ctaf', 'mixed'];
export const FACILITY_LABELS = {
  del: 'Clearance Delivery', gnd: 'Ground', twr: 'Tower', app: 'Approach/Departure',
  ctr: 'Center', atis: 'ATIS', ctaf: 'CTAF/UNICOM', mixed: 'Mixed feed',
};

// Guess facility from a LiveATC mount name / feed title, e.g. "kbos_twr", "KJFK Ground".
export function facilityFromFeed(feed = '') {
  const f = feed.toLowerCase();
  if (/atis/.test(f)) return 'atis';
  if (/(^|[_\s-])(del|clnc|clr|clearance)/.test(f)) return 'del';
  if (/(gnd|ground|ramp)/.test(f)) return 'gnd';
  if (/(twr|tower|local)/.test(f)) return 'twr';
  if (/(app|dep|approach|departure|tracon|final|director)/.test(f)) return 'app';
  if (/(ctr|center|artcc)/.test(f)) return 'ctr';
  if (/(ctaf|unicom|cta)/.test(f)) return 'ctaf';
  if (/(del.*gnd|gnd.*twr|twr.*app|combined|mixed)/.test(f)) return 'mixed';
  return 'mixed';
}

const DIGIT_WORDS = {
  zero: '0', oh: '0', one: '1', won: '1', two: '2', too: '2', to: null, three: '3', tree: '3',
  four: '4', for: null, fower: '4', five: '5', fife: '5', six: '6', seven: '7',
  eight: '8', ate: '8', nine: '9', niner: '9',
};
const TEENS = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

export const PHONETIC = {
  alpha: 'A', alfa: 'A', bravo: 'B', charlie: 'C', delta: 'D', echo: 'E', foxtrot: 'F',
  golf: 'G', hotel: 'H', india: 'I', juliet: 'J', juliett: 'J', kilo: 'K', lima: 'L',
  mike: 'M', november: 'N', oscar: 'O', papa: 'P', quebec: 'Q', romeo: 'R', sierra: 'S',
  tango: 'T', uniform: 'U', victor: 'V', whiskey: 'W', whisky: 'W', xray: 'X', 'x-ray': 'X',
  yankee: 'Y', zulu: 'Z',
};

// Airline / GA telephony that usually precede a flight number.
export const TELEPHONY = [
  'american', 'delta', 'united', 'southwest', 'jetblue', 'jet blue', 'spirit', 'wings', 'frontier',
  'frontier flight', 'alaska', 'hawaiian', 'skywest', 'sky west', 'envoy', 'republic', 'brickyard',
  'piedmont', 'endeavor', 'endeavour', 'air shuttle', 'cactus', 'speedbird', 'virgin', 'air canada',
  'jazz', 'westjet', 'lufthansa', 'air france', 'klm', 'aer lingus', 'shamrock', 'iberia', 'emirates',
  'qatari', 'fedex', 'ups', 'atlas', 'amazon', 'prime air', 'kalitta', 'connie', 'flexjet', 'execjet',
  'lifeguard', 'medevac', 'mercy', 'sun country', 'breeze', 'moxy', 'allegiant', 'gojet', 'lindbergh',
  'commutair', 'commuter', 'jet link', 'redwood', 'state', 'citrus', 'ameriflight', 'baron', 'wheels up',
  'cessna', 'skyhawk', 'skylane', 'piper', 'cherokee', 'warrior', 'archer', 'arrow', 'seminole',
  'mooney', 'bonanza', 'beech', 'beechcraft', 'cirrus', 'diamond', 'katana', 'citation', 'gulfstream',
  'learjet', 'king air', 'challenger', 'embraer', 'phenom', 'pilatus', 'helicopter', 'november',
  'army', 'navy', 'air force', 'reach', 'coast guard', 'police', 'eagle',
];

const PHASE_ORDER_HINT = { del: 'clearance', gnd: 'taxi-out', twr: 'takeoff', app: 'departure', ctr: 'enroute', atis: 'atis', ctaf: 'pattern' };

// --- number handling -------------------------------------------------------

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/x-ray/g, 'xray')
    .replace(/(\d),(\d{3})/g, '$1$2')          // 3,000 -> 3000
    .replace(/(\d)([a-z])/g, '$1 $2')          // 27left -> 27 left (but keep 27L handled later)
    .replace(/[,;!?]+|\.(?=\s|$)/g, ' | ')       // keep clause boundaries
    .replace(/[^a-z0-9.|\s'-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/\.$/, ''));
}

// Turn runs of spoken digits into numbers. Handles "one two three point four five",
// "three thousand five hundred", "one zero thousand", "flight level two four zero",
// "twenty seven", "niner".
function joinNumbers(tokens) {
  const out = [];
  let i = 0;
  const isDigitTok = (t) => /^\d+$/.test(t) || (DIGIT_WORDS[t] != null);
  const digitOf = (t) => (/^\d+$/.test(t) ? t : DIGIT_WORDS[t]);
  while (i < tokens.length) {
    const t = tokens[i];
    // "to" / "for" only count as numbers when sandwiched between digits ("one to one" is rare; skip)
    if (TENS[t] != null) {
      let v = TENS[t];
      if (DIGIT_WORDS[tokens[i + 1]] && DIGIT_WORDS[tokens[i + 1]] !== '0') { v += +DIGIT_WORDS[tokens[i + 1]]; i++; }
      i++;
      // "twenty seven ninety" -> 2790 (flight numbers)
      if (TENS[tokens[i]] != null || TEENS[tokens[i]] != null) {
        let w = TENS[tokens[i]] ?? TEENS[tokens[i]];
        if (TENS[tokens[i]] != null && DIGIT_WORDS[tokens[i + 1]] && DIGIT_WORDS[tokens[i + 1]] !== '0') { w += +DIGIT_WORDS[tokens[i + 1]]; i++; }
        i++; out.push(`${v}${String(w).padStart(2, '0')}`); continue;
      }
      out.push(String(v)); continue;
    }
    if (TEENS[t] != null) { out.push(String(TEENS[t])); i++; continue; }
    if (isDigitTok(t) || /^\d+\.\d+$/.test(t)) {
      let s = '';
      while (i < tokens.length && (isDigitTok(tokens[i]) || /^\d+\.\d+$/.test(tokens[i]))) {
        s += digitOf(tokens[i]) ?? tokens[i]; i++;
      }
      // decimal: "point/decimal" followed by digits
      if ((tokens[i] === 'point' || tokens[i] === 'decimal') && isDigitTok(tokens[i + 1] || '')) {
        i++; let d = '';
        while (i < tokens.length && isDigitTok(tokens[i])) { d += digitOf(tokens[i]); i++; }
        s = `${s}.${d}`;
      }
      // thousand / hundred
      if (tokens[i] === 'thousand') {
        let v = (parseFloat(s) || 0) * 1000; i++;
        if (isDigitTok(tokens[i] || '') && tokens[i + 1] === 'hundred') { v += +digitOf(tokens[i]) * 100; i += 2; }
        s = String(v);
      } else if (tokens[i] === 'hundred') {
        s = String((parseFloat(s) || 0) * 100); i++;
      }
      out.push(s); continue;
    }
    out.push(t); i++;
  }
  return out;
}

// Merge phonetic letters + digits into identifiers: "november 1 2 3 alpha bravo" -> N123AB,
// "bravo 3" -> B3, "alpha" -> A. Keeps standalone words where context is clearly not a letter
// (e.g. airline "delta 123" stays "delta 123").
function joinPhonetics(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = out[out.length - 1] || '';
    // airline "delta" followed by digits is a callsign, leave it
    if (t === 'delta' && /^\d/.test(tokens[i + 1] || '') && !/^(taxiway|via|at|and|on)$/.test(prev)) { out.push(t); continue; }
    // spoken flight numbers split into groups: "jetblue 14 22" -> 1422, "southwest 4 55" -> 455
    if (/^\d+$/.test(t) && /^\d+$/.test(prev) && (prev + t).length <= 5 && TELEPHONY.includes(out[out.length - 2] || '')) {
      out[out.length - 1] = prev + t; continue;
    }
    // letters right after a GA callsign number: "skyhawk 82 charlie papa" -> 82CP
    if (PHONETIC[t] && /^\d{1,5}[A-Z]*$/.test(prev) && prev.length < 6 && TELEPHONY.includes(out[out.length - 2] || '')) {
      out[out.length - 1] = prev + PHONETIC[t]; continue;
    }
    // abbreviated tail at end of a clause: "... 33 | 123 alpha bravo" -> 123AB
    if (PHONETIC[t] && /^\d{1,5}$/.test(prev)) {
      let j = i, letters = '';
      while (j < tokens.length && PHONETIC[tokens[j]] && letters.length < 2) { letters += PHONETIC[tokens[j]]; j++; }
      if (j >= tokens.length || tokens[j] === '|') { out[out.length - 1] = prev + letters; i = j - 1; continue; }
    }
    if (PHONETIC[t]) {
      let id = PHONETIC[t];
      let j = i + 1;
      // N-numbers: november + digits + letters
      while (j < tokens.length && (PHONETIC[tokens[j]] || /^\d+$/.test(tokens[j]))) {
        // stop letter chains at 5 chars to avoid gluing a taxi route "A B C" into "ABC" when not N-number
        if (id[0] !== 'N' && PHONETIC[tokens[j]] && /[A-Z]$/.test(id) && !/\d/.test(id)) break;
        id += PHONETIC[tokens[j]] || tokens[j]; j++;
        if (id.length >= 6) break;
      }
      // a single "N" alone is likely "november" said as a word — keep as N
      out.push(id); i = j - 1; continue;
    }
    out.push(t);
  }
  return out;
}

export function normalize(text = '') {
  let toks = tokenize(text);
  toks = joinNumbers(toks);
  toks = joinPhonetics(toks);
  let s = toks.join(' ');
  s = s
    .replace(/\b(\d{1,2}) (left|right|center)\b/g, (_, n, side) => `${n}${side[0].toUpperCase()}`)
    .replace(/\b(\d{1,2}) ([lrc])\b/g, (_, n, side) => `${n}${side.toUpperCase()}`)
    .replace(/\bflight level (\d{2,3})\b/g, 'FL$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // frequencies spoken without "point": "contact departure 1 2 4 7" -> leave; with point handled above
  return s;
}

// --- speaker ---------------------------------------------------------------

const TEL_ALT = TELEPHONY.map((t) => t.replace(/ /g, '\\s')).join('|');
const CALLSIGN_SRC = [
  `\\b(?:${TEL_ALT})\\s(?:[A-Z]{0,2}\\d{1,5}[A-Z]{0,2}|[A-Z0-9]{2,6})\\b`, // "delta 2790", "skyhawk 82CP"
  `\\bN\\d{1,5}[A-Z]{0,2}\\b`,                                          // N54321
  `(?<!runway |short |heading |of |takeoff |land )\\b\\d{1,5}[A-Z]{1,2}\\b(?=\\s*$)`, // trailing "123AB"
  `\\b(?:\\d{3,5}[A-Z]{1,2}|\\d{1,2}[A-Z]{2}|\\d{1,2}[ABD-KM-QS-Z]|[4-9]\\d[A-Z])\\b(?=\\s*$)`,        // trailing tail that can't be a runway
].join('|');
const CALLSIGN_RE = new RegExp(CALLSIGN_SRC);
const CALLSIGN_G = new RegExp(CALLSIGN_SRC, 'g');

export function findCallsign(norm) {
  const m = norm.match(CALLSIGN_RE);
  return m ? m[0] : null;
}

export function guessSpeaker(norm) {
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
  if (atc === pilot) return 'unknown';
  return atc > pilot ? 'atc' : 'pilot';
}

// --- phase -----------------------------------------------------------------

const PHASE_RULES = [
  ['atis', /\b(information [A-Z]\b.*\b(wind|visibility|sky|altimeter)|automated|advise (on initial )?contact you have)\b/, 4],
  ['clearance', /\bcleared to (the )?\S+( \S+)? (airport|via)\b/, 4],
  ['clearance', /\b(as filed|climb via|departure frequency|dep freq|squawk \d{4}|readback correct|clearance on request|ready to copy|void (time|if)|release|expect (FL\d+|\d+) \d+ (min|minutes))\b/, 2.5],
  ['clearance', /\b(after departure|on departure) (fly|turn|maintain|heading)\b/, 1.5],
  ['taxi-out', /\b(taxi to runway|runway \S+ taxi via|hold short of runway|cross runway|give way|monitor tower|holding short|ready to taxi|request taxi|taxi via)\b/, 3],
  ['taxi-in', /\b(taxi to (the )?(ramp|parking|fbo|gate|hangar|terminal|spot)|exit (left|right|at)|turn (left|right) (at|on) [A-Z]\d?\b.*(contact ground|ground)|clear of (the )?runway|on the ramp)\b/, 3],
  ['taxi-in', /\bcontact ground\b/, 1],
  ['takeoff', /\b(cleared for (immediate )?takeoff|line up and wait|position and hold|fly runway heading|ready for departure|ready for takeoff|holding short .* ready|rolling|cancel takeoff)\b/, 4],
  ['departure', /\b(radar contact|contact departure|climb (and maintain|via)|passing \S+ for|resume own navigation|proceed direct|turn (left|right) heading .* climb|departure)\b/, 2],
  ['enroute', /\b(contact \S+ center|center|FL\d{2,3}|flight following|cruise|ride report|chop|request (higher|lower|FL))\b/, 2],
  ['arrival', /\b(descend (and maintain|via)|cross \S+ at|expect (the )?(ils|rnav|visual|vor|loc|gps|localizer)|with (information|[A-Z]\b)|have (information|the numbers)|landing \S+|inbound for landing|descending)\b/, 2],
  ['approach', /\bcleared (ils|rnav|visual|vor|loc|gps|localizer|straight in)\b/, 1.5],
  ['approach', /\b(cleared (ils|rnav|visual|vor|loc|gps|localizer|straight)|maintain \S+ until established|join (the )?localizer|intercept|turn (left|right) heading \d+ (join|intercept|vector)|vectors? (for|to)|field in sight|airport in sight|report (the )?(field|airport)|contact tower|miles from \S+|established)\b/, 2.5],
  ['pattern', /\b(touch and go|stop and go|low approach|the option|make (left|right) (closed )?traffic|enter (left|right) (downwind|base)|report (left|right )?(midfield|downwind|base|final)|extend (your )?downwind|closed traffic|remain in the pattern|full stop)\b/, 3],
  ['landing', /\b(cleared to land|number (1|2|3|4|one|two|three)|go around|continue|landing runway|wind \d+ at \d+ runway|follow .* traffic|short final|on final)\b/, 2.5],
];

export function guessPhase(norm, facility) {
  const scores = {};
  for (const [phase, re, w] of PHASE_RULES) if (re.test(norm)) scores[phase] = (scores[phase] || 0) + w;
  // facility priors
  const prior = PHASE_ORDER_HINT[facility];
  if (prior) scores[prior] = (scores[prior] || 0) + 0.75;
  if (facility === 'gnd' && scores['taxi-in']) scores['taxi-in'] += 0.5;
  if (facility === 'twr') { scores['landing'] = (scores['landing'] || 0) + 0.3; }
  if (facility === 'app') { scores['arrival'] = (scores['arrival'] || 0) + 0.5; }
  if (facility === 'atis') return 'atis';
  let best = 'other', bv = 0.9;
  for (const [k, v] of Object.entries(scores)) if (v > bv) { best = k; bv = v; }
  return best;
}

// --- intent ----------------------------------------------------------------

const INTENT_RULES = [
  ['IFR clearance', /\bcleared to \S+.*\b(via|as filed|climb|squawk)\b/],
  ['Squawk', /\bsquawk \d{4}\b/],
  ['Takeoff clearance', /\bcleared for (immediate )?takeoff\b/],
  ['Landing clearance', /\bcleared to land\b|\bcleared (for )?the option\b|\bcleared touch and go\b/],
  ['Line up and wait', /\bline up and wait|position and hold\b/],
  ['Taxi', /\btaxi (to|via)\b/],
  ['Hold short', /\bhold(ing)? short\b/],
  ['Cross runway', /\bcross runway\b/],
  ['Approach clearance', /\bcleared (ils|rnav|visual|vor|loc|gps|localizer|straight)/],
  ['Vector', /\b(turn (left|right) )?heading \d{3}\b|\bfly heading\b/],
  ['Altitude', /\b(climb|descend)( and maintain)?\b|\bmaintain \d{3,5}\b|\bFL\d+\b/],
  ['Speed', /\b(speed \d+|reduce speed|increase speed|maintain \d+ knots)\b/],
  ['Frequency change', /\bcontact \S+.*\d{3}\.\d+|\bmonitor \S+|\bfrequency change approved\b/],
  ['Traffic', /\btraffic (\d|is|alert|no factor|in sight|holding|\S+ o'?clock)|\b\d{1,2} o'?clock\b/],
  ['Pattern', /\b(make (left|right) traffic|downwind|base|midfield|extend|closed traffic)\b/],
  ['Radar contact', /\bradar contact\b/],
  ['Check-in', /\bwith you\b|\bwith (information|[A-Z]\b)|\bchecking in\b/],
  ['Request', /\brequest(ing)?\b/],
  ['Go around', /\bgo around\b/],
  ['Weather/altimeter', /\b(altimeter|wind \d|visibility|ceiling)\b/],
  ['Readback/ack', /^(roger|wilco|copy|affirmative|negative)\b/],
];

export function guessIntents(norm) {
  return INTENT_RULES.filter(([, re]) => re.test(norm)).map(([n]) => n).slice(0, 4);
}

// --- templating --------------------------------------------------------------

// Each slot: [name, regex, valueGroup]. Order matters (specific first).
const SLOT_RULES = [
  ['FREQ', /\b(1[1-3]\d\.\d{1,3})\b/g, 1],
  ['SQUAWK', /\b(squawk) (\d{4})\b/g, 2],
  ['ALTIM', /\b(altimeter) (\d{4}|\d{2}\.\d{2})\b/g, 2],
  ['WIND', /\b(wind) (\d{3} at \d{1,2}( gust(ing|s)? \d{1,2})?|calm|variable at \d+)\b/g, 2],
  ['RWY', /\b(runway) (\d{1,2}[LRC]?)\b/g, 2],
  ['RWY', /\b(hold(?:ing)? short(?: of)?|cross|crossing) (\d{1,2}[LRC]?)\b/g, 2],
  ['HDG', /\b(heading) (\d{3})\b/g, 2],
  ['HDG', /\b(left|right) (\d{3})\b/g, 2],
  ['RWY', /\b(takeoff|land|ils|rnav|visual|approach|wait|traffic|departure|arrival|via the \S+ \S+|expect) (\d{1,2}[LRC]?)\b(?!\d)/g, 2],
  ['FL', /\b(FL\d{2,3})\b/g, 1],
  ['ALT', /\b(maintain|climb|descend|climbing|descending|at|to|cross \S+ at|expect|leaving|passing|through) (\d{1,2}000|\d{1,2}[1-9]00|\d{3,5})\b(?! knots)/g, 2],
  ['SPD', /\b(speed|maintain) (\d{3}) knots\b|\bspeed (\d{3})\b/g, 0],
  ['TWY', /\b(via|taxiway|at|on|left on|right on|left at|right at) ((?:[A-Z]\d{0,2}\b ?){1,6})(?=\b)/g, 2],
  ['INFO', /\b(information|with) ([A-Z])\b(?!\d)/g, 2],
  ['DIST', /\b(\d{1,2}) (miles?|mile)\b/g, 1],
  ['CLOCK', /\b(\d{1,2}) o'?clock\b/g, 1],
];

export function templatize(norm) {
  let tpl = ` ${norm} `;
  const slots = {};
  const add = (name, val) => { (slots[name] ||= []).push(val.trim()); };

  // callsigns first
  tpl = tpl.replace(CALLSIGN_G, (m) => { add('CALLSIGN', m); return ' {CALLSIGN} '; });

  for (const [name, re, g] of SLOT_RULES) {
    tpl = tpl.replace(re, (...args) => {
      const m = args[0];
      if (name === 'SPD') {
        const v = args[2] || args[3]; add(name, v);
        return m.replace(v, `{${name}}`);
      }
      const val = args[g];
      if (val == null) return m;
      if (name === 'ALT' && /^\d{3}$/.test(val) && !/maintain|climb|descend/.test(args[1])) return m;
      const v = val.trim();
      if (name === 'TWY' && !/[A-Z]/.test(v)) return m;
      add(name, v);
      return g === 0 ? `{${name}}` : m.replace(new RegExp(`${escapeRe(v)}(?![\\s\\S]*${escapeRe(v)})`), `{${name}}`);
    });
  }
  // leftover numbers
  tpl = tpl.replace(/\b\d+(\.\d+)?\b/g, (m) => { add('N', m); return '{N}'; });
  tpl = tpl.replace(/\s+/g, ' ').trim();
  return { template: tpl, slots };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// --- full parse --------------------------------------------------------------

export function parseTransmission(text, { facility = 'mixed' } = {}) {
  const norm = normalize(text);
  const { template, slots } = templatize(norm);
  return {
    norm,
    template,
    slots,
    callsign: findCallsign(norm),
    speaker: guessSpeaker(norm),
    phase: guessPhase(norm, facility),
    intents: guessIntents(norm),
  };
}

// Whisper hallucinations on silence / noise
export function looksLikeJunk(text = '') {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return true;
  if (/^(\[.*\]|\(.*\))$/.test(t)) return true;
  if (/^(thank you\.?|thanks for watching.*|you|bye\.?|\.+|music|silence)$/.test(t)) return true;
  if (/subscribe|amara\.org|subtitles by/.test(t)) return true;
  return false;
}

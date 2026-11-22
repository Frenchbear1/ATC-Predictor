// Made-up demo data so the site is usable before you record anything.
// Airport "KSMP" is fictional. Every record is tagged source: "sample".
import { parseTransmission } from './atc.js';
import { newId } from './db.js';

const CS = [
  ['Cessna one two three alpha bravo', 'three alpha bravo'],
  ['Skyhawk four seven two charlie papa', 'two charlie papa'],
  ['Cherokee eight one lima', 'eight one lima'],
  ['JetBlue fourteen twenty two', 'JetBlue fourteen twenty two'],
  ['Delta twenty seven ninety', 'Delta twenty seven ninety'],
  ['Southwest four fifty five', 'Southwest four fifty five'],
  ['Archer niner five two sierra', 'five two sierra'],
];
const pick = (a, i) => a[i % a.length];

// [facility, atcLine, pilotReply] — {cs}=full callsign, {sh}=short
const SCRIPT = [
  ['del', '{cs}, cleared to the Bradley airport via the Sample two departure, then as filed. Climb and maintain three thousand, expect five thousand one zero minutes after departure. Departure frequency one two four point seven five, squawk four five two one.', 'Cleared to Bradley via the Sample two, three thousand, expect five thousand in ten, one two four point seven five, squawk four five two one, {sh}'],
  ['del', '{cs}, readback correct, contact ground one two one point niner when ready to taxi.', 'Ground point niner, {sh}'],
  ['gnd', '{cs}, runway two seven, taxi via alpha, hold short of runway two seven.', 'Runway two seven via alpha, hold short, {sh}'],
  ['gnd', '{cs}, runway two seven, taxi via alpha bravo, hold short of runway three three.', 'Two seven via alpha bravo, hold short three three, {sh}'],
  ['gnd', '{cs}, cross runway three three, continue via alpha, monitor tower one one niner point one.', 'Cross three three, alpha, monitor tower, {sh}'],
  ['twr', '{cs}, runway two seven, line up and wait.', 'Line up and wait two seven, {sh}'],
  ['twr', '{cs}, wind two eight zero at one two, runway two seven, cleared for takeoff.', 'Cleared for takeoff two seven, {sh}'],
  ['twr', '{cs}, fly runway heading, runway two seven, cleared for takeoff.', 'Runway heading, cleared for takeoff, {sh}'],
  ['twr', '{cs}, contact departure, good day.', 'Departure, {sh}, good day'],
  ['app', '{cs}, Sample departure, radar contact, climb and maintain five thousand.', 'Climb and maintain five thousand, {sh}'],
  ['app', '{cs}, turn left heading two one zero, climb and maintain five thousand.', 'Left two one zero, five thousand, {sh}'],
  ['ctr', '{cs}, contact Boston Center one three two point four five.', 'One three two point four five, {sh}'],
  ['app', '{cs}, descend and maintain three thousand, expect the ILS runway two seven approach.', 'Down to three thousand, expect ILS two seven, {sh}'],
  ['app', '{cs}, turn right heading two four zero, maintain two thousand five hundred until established on the localizer, cleared ILS runway two seven approach.', 'Right two four zero, two thousand five hundred until established, cleared ILS two seven, {sh}'],
  ['app', '{cs}, contact tower one one niner point one.', 'Tower one one niner point one, {sh}'],
  ['twr', '{cs}, runway two seven, cleared to land.', 'Cleared to land two seven, {sh}'],
  ['twr', '{cs}, wind two seven zero at eight, runway two seven, cleared to land.', 'Cleared to land runway two seven, {sh}'],
  ['twr', '{cs}, make left traffic runway two seven, report midfield downwind.', 'Left traffic two seven, report midfield, {sh}'],
  ['twr', '{cs}, number two, follow the Skyhawk on left base, runway two seven, cleared touch and go.', 'Number two, traffic in sight, cleared touch and go, {sh}'],
  ['twr', '{cs}, turn left at bravo, contact ground point niner.', 'Left at bravo, ground point niner, {sh}'],
  ['gnd', '{cs}, taxi to the ramp via bravo alpha.', 'Ramp via bravo alpha, {sh}'],
];
// Pilot-initiated calls
const PILOT_INIT = [
  ['gnd', 'Sample Ground, {cs}, at the FBO with information kilo, ready to taxi, VFR to the south.'],
  ['twr', 'Sample Tower, {cs}, holding short runway two seven, ready for departure.'],
  ['app', 'Sample Approach, {cs}, with you at four thousand with information kilo.'],
  ['twr', 'Sample Tower, {cs}, one zero miles south, inbound for landing with information kilo.'],
];
// A few deliberately messy lines, like raw Whisper output, to try the ChatGPT cleanup on
const MESSY = [
  ['gnd', 'Jet blue 14 22 runway to 7 taxi via alpha holds short of runway 27'],
  ['twr', 'Delta 27 90 wins 280 at 12 runway 2 7 clear for take off'],
  ['app', 'Southwest 455 descended maintain 3000 expect the eye less runway 27 approach'],
];

export function makeSample() {
  const out = [];
  let ts = Date.now() - 1000 * 60 * 60 * 30;
  const push = (facility, text, i) => {
    ts += 15000 + (i % 7) * 9000;
    const p = parseTransmission(text, { facility });
    out.push({ id: newId(), ts, airport: 'KSMP', feed: `ksmp_${facility}`, facility, source: 'sample', raw: text, text, durationSec: 3, ...p });
  };
  let n = 0;
  for (let rep = 0; rep < 3; rep++) {
    SCRIPT.forEach(([fac, atc, reply], k) => {
      if ((k + rep) % 4 === 3 && rep > 0) return; // vary counts
      const [cs, sh] = pick(CS, k + rep * 3);
      push(fac, atc.replace('{cs}', cs), n++);
      push(fac, reply.replace('{sh}', sh), n++);
    });
    PILOT_INIT.forEach(([fac, line], k) => push(fac, line.replace('{cs}', pick(CS, k + rep)[0]), n++));
  }
  MESSY.forEach(([fac, line]) => push(fac, line, n++));
  return out;
}

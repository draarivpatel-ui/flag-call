'use strict';

/*
 * Engine test suite for Flag Call.
 * Covers unit conversion, wet bulb math (with an independent psychrometric
 * cross check), the globe model, WBGT composition, tier mapping, presets,
 * schedule evaluation, scoring, plan generators, and copy hygiene.
 * The self audit assertion at the end locks the content assertion count.
 */

const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

let count = 0;
function ok(cond, msg) { count += 1; assert.ok(cond, msg); }
function eq(actual, expected, msg) { count += 1; assert.strictEqual(actual, expected, msg); }
function deq(actual, expected, msg) { count += 1; assert.deepStrictEqual(actual, expected, msg); }
function approx(actual, expected, tol, msg) {
  count += 1;
  assert.ok(Math.abs(actual - expected) <= tol, msg + ' (got ' + actual + ', want ' + expected + ' plus or minus ' + tol + ')');
}

// Independent psychrometric wet bulb solver (Magnus formula, bisection on the
// psychrometric equation at standard sea level pressure). Deliberately does
// not share code with the engine's Stull approximation.
function psychroWetBulbC(tempC, rhPct) {
  const satVaporPressure = 0.61094 * Math.exp(17.625 * tempC / (tempC + 243.04));
  const actualVaporPressure = rhPct / 100 * satVaporPressure;
  let lo = -30;
  let hi = tempC;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const gamma = 0.00066 * (1 + 0.00115 * mid) * 101.325;
    const value = 0.61094 * Math.exp(17.625 * mid / (mid + 243.04)) - gamma * (tempC - mid);
    if (value > actualVaporPressure) { hi = mid; } else { lo = mid; }
  }
  return (lo + hi) / 2;
}

test('unit conversion and clamping', () => {
  eq(E.fToC(32), 0, 'freezing point converts to zero Celsius');
  approx(E.fToC(101), 38.3333, 0.001, '101 F converts to about 38.33 C');
  approx(E.fToC(118), 47.7778, 0.001, '118 F converts to about 47.78 C');
  eq(E.cToF(0), 32, 'zero Celsius converts to 32 F');
  eq(E.cToF(100), 212, 'boiling point converts to 212 F');
  approx(E.cToF(E.fToC(75)), 75, 1e-9, 'F to C to F round trip is identity');
  eq(E.clamp(5, 0, 10), 5, 'clamp keeps in range values');
  eq(E.clamp(-3, 0, 10), 0, 'clamp lifts values below the floor');
  eq(E.clamp(42, 0, 10), 10, 'clamp caps values above the ceiling');
  eq(E.clamp(0, 0, 10), 0, 'clamp floor boundary is inclusive');
  eq(E.clamp(10, 0, 10), 10, 'clamp ceiling boundary is inclusive');
});

test('Stull wet bulb spot vectors', () => {
  approx(E.stullWetBulbC(20, 10), 6.961151, 0.02, 'wet bulb at 20 C and 10 percent');
  approx(E.stullWetBulbC(25, 30), 14.592668, 0.02, 'wet bulb at 25 C and 30 percent');
  approx(E.stullWetBulbC(30, 50), 22.296834, 0.02, 'wet bulb at 30 C and 50 percent');
  approx(E.stullWetBulbC(35, 70), 30.253356, 0.02, 'wet bulb at 35 C and 70 percent');
  approx(E.stullWetBulbC(40, 90), 38.469351, 0.02, 'wet bulb at 40 C and 90 percent');
  approx(E.stullWetBulbC(45, 20), 26.105251, 0.02, 'wet bulb at 45 C and 20 percent');
  approx(E.stullWetBulbC(30, 5), 10.772176, 0.02, 'wet bulb at the 5 percent humidity floor');
  approx(E.stullWetBulbC(15, 7), 3.513847, 0.02, 'wet bulb at 15 C and 7 percent');
  approx(E.stullWetBulbC(35, 95), 34.334772, 0.02, 'wet bulb near the 99 percent ceiling');
  approx(E.stullWetBulbC(50, 60), 41.966281, 0.02, 'wet bulb at 50 C and 60 percent');
  approx(E.stullWetBulbC(48, 12), 24.265163, 0.02, 'wet bulb in dry extreme heat');
});

test('independent psychrometric cross check', () => {
  for (const tempC of [20, 30, 40]) {
    for (const rhPct of [20, 50, 90]) {
      const stull = E.stullWetBulbC(tempC, rhPct);
      const reference = psychroWetBulbC(tempC, rhPct);
      approx(stull, reference, 0.75,
        'Stull agrees with the psychrometric solver at ' + tempC + ' C and ' + rhPct + ' percent');
    }
  }
});

test('globe model behavior', () => {
  eq(E.globeRiseC(0, 10), 0, 'no radiant heat means no globe rise');
  eq(E.globeRiseC(1200, 0), 16, 'maximum sun in still air hits the cap');
  approx(E.globeRiseC(600, 4), 4.689803, 0.01, 'moderate sun and breeze gives a moderate rise');
  ok(E.globeRiseC(600, 2) > E.globeRiseC(600, 8), 'more wind lowers the globe rise');
  ok(E.globeRiseC(900, 4) > E.globeRiseC(300, 4), 'more radiant heat raises the globe rise');
  eq(E.globeRiseC(-50, 5), 0, 'negative solar input is clamped to zero rise');
  eq(E.globeRiseC(2000, 5), E.globeRiseC(1200, 5), 'solar input caps at 1200 watts per square meter');
  eq(E.globeRiseC(600, -10), E.globeRiseC(600, 0), 'negative wind is clamped to calm');
  approx(E.globeTempC(40, 0, 10), 40, 1e-9, 'no sun leaves globe equal to air temperature');
});

test('WBGT composition', () => {
  approx(E.wbgtFromInputs({ tempF: 101, humidityPct: 65, solarWm2: 950, windMph: 6 }).wbgtF, 95.51, 0.15, 'Houston base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 118, humidityPct: 12, solarWm2: 1100, windMph: 5 }).wbgtF, 90.81, 0.15, 'Phoenix base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 104, humidityPct: 40, solarWm2: 980, windMph: 16 }).wbgtF, 90.46, 0.15, 'Dallas base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 103, humidityPct: 55, solarWm2: 920, windMph: 7 }).wbgtF, 94.61, 0.15, 'San Antonio base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 96, humidityPct: 45, solarWm2: 900, windMph: 12 }).wbgtF, 85.04, 0.15, 'Austin base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 108, humidityPct: 15, solarWm2: 1050, windMph: 8 }).wbgtF, 84.43, 0.15, 'El Paso base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 93, humidityPct: 72, solarWm2: 800, windMph: 12 }).wbgtF, 88.44, 0.15, 'Corpus Christi base WBGT snapshot');
  approx(E.wbgtFromInputs({ tempF: 100, humidityPct: 25, solarWm2: 900, windMph: 18 }).wbgtF, 81.83, 0.15, 'Lubbock base WBGT snapshot');

  const houston = E.wbgtFromInputs({ tempF: 101, humidityPct: 65, solarWm2: 950, windMph: 6 });
  const dryC = E.fToC(houston.dryF);
  const globeC = E.fToC(houston.globeF);
  const wetC = E.stullWetBulbC(dryC, 65);
  ok(houston.wbgtC >= Math.min(dryC, globeC, wetC) - 1e-9 && houston.wbgtC <= Math.max(dryC, globeC, wetC) + 1e-9,
    'WBGT stays inside its physical component range');
  approx(houston.wbgtC, 0.7 * wetC + 0.2 * globeC + 0.1 * dryC, 1e-6,
    'WBGT equals the 0.7, 0.2, 0.1 weighted blend');

  const cooler = E.wbgtFromInputs({ tempF: 100, humidityPct: 65, solarWm2: 950, windMph: 6 }).wbgtF;
  const hotter = E.wbgtFromInputs({ tempF: 105, humidityPct: 65, solarWm2: 950, windMph: 6 }).wbgtF;
  ok(hotter > cooler, 'WBGT rises with air temperature');
  const drier = E.wbgtFromInputs({ tempF: 101, humidityPct: 30, solarWm2: 950, windMph: 6 }).wbgtF;
  const humid = E.wbgtFromInputs({ tempF: 101, humidityPct: 80, solarWm2: 950, windMph: 6 }).wbgtF;
  ok(humid > drier, 'WBGT rises with humidity');
});

test('tier mapping and escalation thresholds', () => {
  eq(E.tierIndexFromF(81.99), 0, '81.99 F stays Normal');
  eq(E.tierIndexFromF(82), 1, '82 F escalates to Watch');
  eq(E.tierIndexFromF(84.99), 1, '84.99 F stays Watch');
  eq(E.tierIndexFromF(85), 2, '85 F escalates to Caution');
  eq(E.tierIndexFromF(87.99), 2, '87.99 F stays Caution');
  eq(E.tierIndexFromF(88), 3, '88 F escalates to Warning');
  eq(E.tierIndexFromF(89.99), 3, '89.99 F stays Warning');
  eq(E.tierIndexFromF(90), 4, '90 F escalates to Danger');
  deq(E.TIER_THRESHOLDS_F, { watch: 82, caution: 85, warning: 88, danger: 90 }, 'threshold table matches the published bands');
  eq(E.TIERS.length, 5, 'five activity tiers exist');
  deq(E.TIERS.map(function (t) { return t.key; }), ['normal', 'watch', 'caution', 'warning', 'danger'], 'tier keys are in escalation order');
  ok(E.TIERS.every(function (t) { return t.name && t.summary && t.chipClass && Array.isArray(t.actions); }), 'every tier carries name, summary, chip class, and actions');
  ok(E.TIERS.every(function (t) { return t.actions.length >= 2; }), 'every tier lists at least two required actions');
  const houston = { tempF: 101, humidityPct: 65, solarWm2: 950, windMph: 6 };
  eq(E.tierForInputs(houston), E.tierIndexFromF(E.wbgtFromInputs(houston).wbgtF), 'tierForInputs agrees with the WBGT path');
  ok(E.tierForInputs({ tempF: 105, humidityPct: 80, solarWm2: 1000, windMph: 2 }) > E.tierForInputs({ tempF: 80, humidityPct: 30, solarWm2: 300, windMph: 10 }),
    'harsher conditions escalate to a higher tier');
  deq(new Set(E.TIERS.map(function (t) { return t.chipClass; })).size, 5, 'tier chip classes are unique');
  eq(E.TIERS[4].key, 'danger', 'the top tier is Danger');
});

test('city presets', () => {
  eq(E.PRESETS.length, 8, 'eight city presets ship');
  deq(new Set(E.PRESETS.map(function (p) { return p.id; })).size, 8, 'preset ids are unique');
  deq(new Set(E.PRESETS.map(function (p) { return p.city; })).size, 8, 'preset city names are unique');
  eq(E.PRESETS.find(function (p) { return p.id === 'houston'; }).tempF, 101, 'Houston preset reads 101 F');
  eq(E.PRESETS.find(function (p) { return p.id === 'phoenix'; }).tempF, 118, 'Phoenix preset reads 118 F');
  ok(E.PRESETS.every(function (p) {
    return p.tempF >= 85 && p.tempF <= 125 && p.humidityPct >= 5 && p.humidityPct <= 99 &&
      p.solarWm2 >= 0 && p.solarWm2 <= 1200 && p.windMph >= 0;
  }), 'every preset sits inside sane physical ranges');
  ok(E.PRESETS.every(function (p) { return typeof p.blurb === 'string' && p.blurb.length > 10; }), 'every preset has a blurb');
  const baseTiers = new Set(E.PRESETS.map(function (p) { return E.tierIndexFromF(E.wbgtFromInputs(p).wbgtF); }));
  deq(baseTiers.size, 5, 'preset base readings cover all five tiers');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'houston'; })).wbgtF), 4, 'Houston lands in Danger');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'phoenix'; })).wbgtF), 4, 'Phoenix lands in Danger');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'dallas'; })).wbgtF), 4, 'Dallas lands in Danger');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'sanantonio'; })).wbgtF), 4, 'San Antonio lands in Danger');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'austin'; })).wbgtF), 2, 'Austin lands in Caution');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'elpaso'; })).wbgtF), 1, 'El Paso lands in Watch');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'corpus'; })).wbgtF), 3, 'Corpus Christi lands in Warning');
  eq(E.tierIndexFromF(E.wbgtFromInputs(E.PRESETS.find(function (p) { return p.id === 'lubbock'; })).wbgtF), 0, 'Lubbock lands in Normal');
});

test('schedule templates and block evaluation', () => {
  eq(E.SCHEDULE_TEMPLATES.length, 8, 'eight schedule templates ship');
  deq(new Set(E.SCHEDULE_TEMPLATES.map(function (t) { return t.id; })).size, 8, 'template ids are unique');
  ok(E.SCHEDULE_TEMPLATES.every(function (t) { return t.blocks.length >= 2 && t.blocks.length <= 4; }), 'templates carry two to four blocks');
  ok(E.SCHEDULE_TEMPLATES.every(function (t) {
    return t.blocks.every(function (b) {
      return b.time && b.label && b.intensity >= 1 && b.intensity <= 3 &&
        typeof b.tempAdjF === 'number' && b.solarFactor >= 0.1 && b.solarFactor <= 1;
    });
  }), 'every block carries time, label, intensity, and adjustment fields');

  const houston = E.PRESETS.find(function (p) { return p.id === 'houston'; });
  const t0 = E.SCHEDULE_TEMPLATES[0];
  const recs = E.recommendedFlagsFor(houston, t0);
  eq(recs.length, t0.blocks.length, 'recommendation count matches block count');
  const marching = E.SCHEDULE_TEMPLATES.find(function (t) { return t.id === 'marching-rehearsal'; });
  eq(E.blockConditions(houston, marching.blocks[0]).tempF, 100, 'marching basics block shifts Houston one degree cooler');
  const gameDay = E.SCHEDULE_TEMPLATES.find(function (t) { return t.id === 'game-day'; });
  approx(E.blockConditions(houston, gameDay.blocks[2]).windMph, 3, 1e-9, 'kickoff block applies the evening wind drop');
  approx(E.blockConditions(houston, t0.blocks[0]).solarWm2, 0.35 * houston.solarWm2, 1e-9, 'morning block scales sunlight down');

  let tiersValid = true;
  for (const preset of E.PRESETS) {
    for (const template of E.SCHEDULE_TEMPLATES) {
      for (const rec of E.recommendedFlagsFor(preset, template)) {
        if (!Number.isInteger(rec.tier) || rec.tier < 0 || rec.tier > 4) { tiersValid = false; }
      }
    }
  }
  ok(tiersValid, 'every block recommendation is an integer tier from 0 to 4');

  const again = E.recommendedFlagsFor(houston, t0);
  deq(again, recs, 'evaluation is deterministic for identical inputs');
  eq(recs[2].tier, 4, 'Houston scrimmage at 1:30 PM calls Danger');
  eq(E.recommendedFlagsFor(E.PRESETS.find(function (p) { return p.id === 'phoenix'; }), t0)[1].tier, 3, 'Phoenix late morning block calls Warning');
  eq(E.recommendedFlagsFor(E.PRESETS.find(function (p) { return p.id === 'lubbock'; }), t0)[1].tier, 0, 'Lubbock morning block stays Normal');
  eq(E.recommendedFlagsFor(E.PRESETS.find(function (p) { return p.id === 'austin'; }), t0)[2].tier, 3, 'Austin afternoon block calls Warning');
  ok(recs.every(function (rec) { return Math.abs(rec.wbgtF - E.wbgtFromInputs(rec.inputs).wbgtF) < 1e-9; }),
    'block WBGT equals a direct readout of the same inputs');
  ok(recs.every(function (rec) { return rec.time.length > 0 && rec.label.length > 0; }), 'every block shows a time and label');
});

test('scoring, streaks, grades, and day reports', () => {
  deq(E.scoreCall(2, 2), { points: 100, quality: 'exact', unsafe: false }, 'an exact call scores 100');
  deq(E.scoreCall(1, 2), { points: 75, quality: 'cautious', unsafe: false }, 'one tier cautious scores 75');
  deq(E.scoreCall(0, 2), { points: 40, quality: 'overcautious', unsafe: false }, 'two tiers cautious scores 40');
  deq(E.scoreCall(3, 2), { points: 15, quality: 'undercall', unsafe: true }, 'one tier loose scores 15 and is unsafe');
  deq(E.scoreCall(4, 2), { points: 0, quality: 'critical', unsafe: true }, 'two tiers loose scores zero and is critical');
  eq(E.scoreCall(2, 2).unsafe, false, 'exact calls are never unsafe');
  eq(E.scoreCall(3, 2).unsafe, true, 'undercalls are flagged unsafe');
  eq(E.scoreCall(4, 0).points, 0, 'calling Normal in Danger scores zero');
  eq(E.scoreCall(0, 4).points, 40, 'calling Danger in Normal is overcautious, not dangerous');
  eq(E.scoreCall(4, 4).quality, 'exact', 'a Danger call under Danger conditions is exact');
  eq(E.scoreCall(0, 0).quality, 'exact', 'a Normal call under Normal conditions is exact');
  eq(E.scoreCall(1, 0).unsafe, true, 'loosening a Normal day is still an undercall');
  deq(E.scoreCall(3, 0).quality, 'critical', 'three tiers loose is a critical undercall');
  eq(E.computeStreakBonus(['exact', 'exact']), 10, 'a second consecutive exact adds 10');
  eq(E.computeStreakBonus(['exact', 'exact', 'exact']), 20, 'a third consecutive exact adds 20 more');
  eq(E.computeStreakBonus(['exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact']), 50, 'the streak bonus caps at 50');
  eq(E.computeStreakBonus(['exact', 'undercall', 'exact']), 0, 'a broken streak earns nothing');
  eq(E.computeStreakBonus(['exact', 'cautious', 'exact', 'exact']), 10, 'a fresh streak restarts after a miss');

  eq(E.gradeFor(0.96), 'A', '96 percent earns an A');
  eq(E.gradeFor(0.95), 'A', '95 percent is the A cutoff');
  eq(E.gradeFor(0.90), 'B', '90 percent earns a B');
  eq(E.gradeFor(0.85), 'B', '85 percent is the B cutoff');
  eq(E.gradeFor(0.75), 'C', '75 percent earns a C');
  eq(E.gradeFor(0.70), 'C', '70 percent is the C cutoff');
  eq(E.gradeFor(0.55), 'D', '55 percent earns a D');
  eq(E.gradeFor(0.50), 'D', '50 percent is the D cutoff');
  eq(E.gradeFor(0.30), 'F', '30 percent fails');

  const perfect = E.dayReport([{ chosen: 2, recommended: 2 }, { chosen: 1, recommended: 1 }, { chosen: 0, recommended: 0 }, { chosen: 4, recommended: 4 }]);
  eq(perfect.total, 400, 'four exact calls max out the day');
  eq(perfect.grade, 'A', 'a perfect day earns an A');
  eq(perfect.unsafeCount, 0, 'a perfect day has no unsafe calls');
  const mixed = E.dayReport([{ chosen: 2, recommended: 2 }, { chosen: 3, recommended: 2 }, { chosen: 2, recommended: 2 }, { chosen: 2, recommended: 2 }]);
  eq(mixed.points, 315, 'one undercall costs 85 points');
  eq(mixed.unsafeCount, 1, 'the report counts the unsafe call');
  eq(mixed.grade, 'C', 'one undercall drops the day to a C');
  const empty = E.dayReport([]);
  eq(empty.grade, 'F', 'an empty day fails');
  eq(empty.pct, 0, 'an empty day scores zero percent');
});

test('judge plan generators', () => {
  const houston = E.PRESETS.find(function (p) { return p.id === 'houston'; });
  const recs = E.recommendedFlagsFor(houston, E.SCHEDULE_TEMPLATES[0]);
  const unsafe = E.unsafePlanFor(recs);
  eq(unsafe.picks.length, recs.length, 'the unsafe plan covers every block');
  ok(unsafe.picks.every(function (pick, i) {
    return pick.chosen === E.clamp(recs[i].tier - 2, 0, 4) && pick.recommended === recs[i].tier;
  }), 'unsafe picks run two tiers loose where possible');
  eq(unsafe.picks[2].chosen, 2, 'the Danger scrimmage gets flagged only Caution in the unsafe plan');
  const phoenixRecs = E.recommendedFlagsFor(E.PRESETS.find(function (p) { return p.id === 'phoenix'; }), E.SCHEDULE_TEMPLATES[0]);
  ok(E.unsafePlanFor(phoenixRecs).violations[0].indexOf('no added water breaks') !== -1,
    'a Watch tier block gets the water break violation copy');
  eq(unsafe.violations.length, recs.length, 'the unsafe plan lists a violation per block');
  ok(unsafe.violations[2].indexOf('full pads') !== -1, 'the peak heat violation calls out full pads');
  deq(E.unsafePlanFor(recs), unsafe, 'the unsafe plan generator is deterministic');

  const safe = E.safeCallFor(recs);
  eq(safe.length, recs.length, 'the safe call covers every block');
  ok(safe.every(function (call, i) { return call.tier === recs[i].tier; }), 'safe calls match the recommended tiers');
  ok(safe.every(function (call) { return call.reason.indexOf('Wet bulb globe temperature') === 0; }), 'every safe call reason opens with the reading');
  ok(safe.every(function (call) { return call.actions.length >= 2; }), 'every safe call carries required actions');
});

test('walkthrough copy and engine copy hygiene', () => {
  eq(E.WALKTHROUGH_STEPS.length, 9, 'the Day 1 walkthrough has nine steps');
  deq(new Set(E.WALKTHROUGH_STEPS.map(function (s) { return s.id; })).size, 9, 'walkthrough step ids are unique');
  ok(E.WALKTHROUGH_STEPS.every(function (s) { return s.title.length > 3 && s.body.length > 20; }), 'every step has a title and a real body');
  eq(E.WALKTHROUGH_STEPS[0].title, 'Welcome To Flag Call', 'the walkthrough opens with a welcome');
  ok(E.WALKTHROUGH_STEPS.every(function (s) { return /^\.[a-z-]+$/.test(s.focus); }), 'every step focuses a real selector target');
  ok(E.WALKTHROUGH_STEPS.some(function (s) { return s.body.indexOf('See an Unsafe Plan') !== -1; }), 'the walkthrough teaches the unsafe plan shortcut');
  ok(E.WALKTHROUGH_STEPS.some(function (s) { return s.body.indexOf('Show the Safe Call') !== -1; }), 'the walkthrough teaches the safe call shortcut');

  const allCopy = JSON.stringify([E.TIERS, E.PRESETS, E.SCHEDULE_TEMPLATES, E.WALKTHROUGH_STEPS]);
  ok(allCopy.indexOf('\u2014') === -1, 'engine copy contains no em dash');
  ok(allCopy.indexOf('\u2013') === -1, 'engine copy contains no en dash');
  ok(!/(?:[A-Z][\s']{0,2}){6,}/.test(allCopy.replace(/\\u/g, '')) || E.TIERS.every(function (t) { return t.name !== t.name.toUpperCase(); }),
    'tier names are never rendered as all caps');

  eq(E.formatF(95.51), '95.5 F', 'formatF keeps one decimal and a space before F');
});

test('self audit: content assertion count is exact', () => {
  assert.strictEqual(count, 158, 'the engine suite must hold exactly 158 content assertions');
});

'use strict';

/*
 * Audit Lab test suite for Flag Call.
 * Covers the five heat-day scenarios, the five calling policies,
 * per block evaluation against an independent oracle, deterministic
 * accuracy/safety/efficiency metrics, worst-case failure margins,
 * counterfactual deltas, stress shift behavior, and the self test suite.
 * The self audit assertion at the end locks the content assertion count.
 */

const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const L = require('../js/lab.js');

let count = 0;
function ok(cond, msg) { count += 1; assert.ok(cond, msg); }
function eq(actual, expected, msg) { count += 1; assert.strictEqual(actual, expected, msg); }
function deq(actual, expected, msg) { count += 1; assert.deepStrictEqual(actual, expected, msg); }
function approx(actual, expected, tol, msg) {
  count += 1;
  assert.ok(Math.abs(actual - expected) <= tol, msg + ' (got ' + actual + ', want ' + expected + ' plus or minus ' + tol + ')');
}

// Independent oracle for scenario block inputs: recomputes the drifted
// base plus template offsets without touching lab internals.
function oracleInputs(scenario, index, shiftF) {
  const template = E.SCHEDULE_TEMPLATES.find(function (t) { return t.id === scenario.templateId; });
  const block = template.blocks[index];
  const base = {
    tempF: scenario.base.tempF + scenario.drift.tempF * index + shiftF,
    humidityPct: scenario.base.humidityPct + scenario.drift.humidityPct * index,
    solarWm2: scenario.base.solarWm2 + scenario.drift.solarWm2 * index,
    windMph: Math.max(0, scenario.base.windMph + scenario.drift.windMph * index)
  };
  return {
    tempF: base.tempF + block.tempAdjF,
    humidityPct: base.humidityPct,
    solarWm2: Math.max(0, Math.min(1200, base.solarWm2 * block.solarFactor)),
    windMph: Math.max(0, base.windMph + (block.windAdjMph || 0))
  };
}

function oracleTier(scenario, index, shiftF) {
  return E.tierIndexFromF(E.wbgtFromInputs(oracleInputs(scenario, index, shiftF)).wbgtF);
}

test('scenario deck integrity', () => {
  eq(L.SCENARIOS.length, 5, 'five heat-day scenarios ship');
  deq(new Set(L.SCENARIOS.map(function (s) { return s.id; })).size, 5, 'scenario ids are unique');
  ok(L.SCENARIOS.every(function (s) {
    return typeof s.name === 'string' && s.name.length > 3 &&
      typeof s.blurb === 'string' && s.blurb.length > 40 &&
      typeof s.templateId === 'string';
  }), 'every scenario carries a name, a real blurb, and a template');
  ok(L.SCENARIOS.every(function (s) {
    return L.templateFor(s) !== null;
  }), 'every scenario points at a real schedule template');
  ok(L.SCENARIOS.every(function (s) {
    const b = s.base;
    const d = s.drift;
    return Number.isFinite(b.tempF) && Number.isFinite(b.humidityPct) &&
      Number.isFinite(b.solarWm2) && Number.isFinite(b.windMph) &&
      Number.isFinite(d.tempF) && Number.isFinite(d.humidityPct) &&
      Number.isFinite(d.solarWm2) && Number.isFinite(d.windMph);
  }), 'every base and drift value is finite');
  ok(L.SCENARIOS.every(function (s) {
    return s.base.tempF >= 60 && s.base.tempF <= 125 &&
      s.base.humidityPct >= 5 && s.base.humidityPct <= 99 &&
      s.base.solarWm2 >= 0 && s.base.solarWm2 <= 1200 && s.base.windMph >= 0;
  }), 'every base snapshot sits inside sane physical ranges');
});

test('scenario arcs exercise real band crossings', () => {
  const arcs = {};
  L.SCENARIOS.forEach(function (s) {
    arcs[s.id] = L.recommendedSeries(s, 0).map(function (r) { return r.tier; });
  });
  deq(arcs['gulf-surge'], [0, 0, 4, 4], 'gulf surge ramps Normal into Danger');
  deq(arcs['desert-oven'], [0, 0, 1, 1], 'desert oven stays mild but climbs to Watch');
  deq(arcs['blue-front'], [3, 4, 1], 'blue front peaks at Danger then drops to Watch');
  deq(arcs['steam-dawn'], [0, 2, 4], 'steam dawn climbs the full ladder');
  deq(arcs['evening-hang'], [2, 4, 2], 'evening hang peaks midday and hangs at Caution');
  const distinct = new Set();
  Object.keys(arcs).forEach(function (k) { arcs[k].forEach(function (t) { distinct.add(t); }); });
  ok(distinct.size >= 4, 'the scenario deck exercises at least four distinct bands');
});

test('policy deck integrity', () => {
  eq(L.POLICIES.length, 5, 'five calling policies ship');
  deq(new Set(L.POLICIES.map(function (p) { return p.id; })).size, 5, 'policy ids are unique');
  eq(L.POLICIES[0].id, 'band-exact', 'the benchmark policy is listed first');
  ok(L.POLICIES.every(function (p) {
    return typeof p.name === 'string' && p.name.length > 3 &&
      typeof p.blurb === 'string' && p.blurb.length > 40 &&
      typeof p.choose === 'function';
  }), 'every policy carries a name, a blurb, and a chooser');
  ok(L.POLICIES.every(function (p) {
    return p.name !== p.name.toUpperCase();
  }), 'no policy name is a fake all caps kicker');
});

test('lookup helpers and shift clamping', () => {
  eq(L.scenarioById('gulf-surge').name, 'Gulf Surge', 'scenario lookup by id');
  eq(L.scenarioById('nope'), null, 'unknown scenario returns null');
  eq(L.policyById('cancel-all').name, 'Cancel Everything', 'policy lookup by id');
  eq(L.policyById('nope'), null, 'unknown policy returns null');
  eq(L.clampShift(7), 7, 'in range shift keeps its value');
  eq(L.clampShift(99), 20, 'high shift clamps to plus 20');
  eq(L.clampShift(-99), -20, 'low shift clamps to minus 20');
  eq(L.clampShift('x'), 0, 'non numeric shift degrades to zero');
  eq(L.clampShift(3.6), 4, 'fractional shift rounds');
  eq(L.evaluateScenario('nope', 'band-exact', 0), null, 'unknown scenario evaluates to null');
  eq(L.evaluateScenario('gulf-surge', 'nope', 0), null, 'unknown policy evaluates to null');
});

// One test per scenario per policy per block: recompute the inputs and
// the recommendation with the oracle and check the lab agrees.
for (const scenario of L.SCENARIOS) {
  for (const policy of L.POLICIES) {
    const ev = L.evaluateScenario(scenario.id, policy.id, 0);
    for (let index = 0; index < ev.blocks.length; index += 1) {
      test(scenario.id + ' x ' + policy.id + ' block ' + index + ' (' + ev.blocks[index].time + ')', () => {
        const b = ev.blocks[index];
        const oi = oracleInputs(scenario, index, 0);
        approx(b.inputs.tempF, oi.tempF, 1e-9, 'block air temperature matches the oracle');
        approx(b.inputs.humidityPct, oi.humidityPct, 1e-9, 'block humidity matches the oracle');
        approx(b.inputs.solarWm2, oi.solarWm2, 1e-9, 'block solar matches the oracle');
        approx(b.inputs.windMph, oi.windMph, 1e-9, 'block wind matches the oracle');
        eq(b.recommended, oracleTier(scenario, index, 0), 'recommended flag matches the oracle tier');
        eq(b.tier === undefined, true, 'no stray tier field leaks into block output');
        ok(b.chosen >= 0 && b.chosen <= 4, 'the chosen flag is inside the five bands');
        const rescore = E.scoreCall(b.chosen, b.recommended);
        eq(b.points, rescore.points, 'block points rescore identically through the engine');
        eq(b.quality, rescore.quality, 'block quality rescores identically');
        eq(b.unsafe, rescore.unsafe, 'block safety rescores identically');
        ok(Number.isFinite(b.wbgtF) && b.shownWbgtF === Number(b.wbgtF.toFixed(1)),
          'the shown reading is the one decimal value the flag was called on');
      });
    }
  }
}

test('band-exact is the perfect benchmark on every scenario', () => {
  for (const s of L.SCENARIOS) {
    const ev = L.evaluateScenario(s.id, 'band-exact', 0);
    eq(ev.totals.rawPoints, ev.totals.max, s.id + ' benchmark earns every point');
    eq(ev.totals.unsafeCount, 0, s.id + ' benchmark has zero unsafe calls');
    eq(ev.totals.grade, 'A', s.id + ' benchmark grades an A');
    ok(ev.blocks.every(function (b) { return b.chosen === b.recommended; }),
      s.id + ' benchmark calls the recommendation every block');
  }
});

test('cancel-all never undercalls but maximally restricts', () => {
  for (const s of L.SCENARIOS) {
    const ev = L.evaluateScenario(s.id, 'cancel-all', 0);
    eq(ev.totals.unsafeCount, 0, s.id + ' cancel all is never unsafe');
    eq(ev.totals.worstUnderGap, 0, s.id + ' cancel all has zero undercall gap');
    ok(ev.totals.overRestriction >= 2, s.id + ' cancel all pays a real restriction tax');
    ok(ev.blocks.every(function (b) { return b.chosen === 4; }), s.id + ' every block is Danger');
  }
});

test('flat-caution undercalls wherever the day runs hot', () => {
  const gulf = L.evaluateScenario('gulf-surge', 'flat-caution', 0);
  eq(gulf.totals.unsafeCount, 2, 'gulf surge flat caution misses both Danger blocks');
  eq(gulf.totals.worstUnderGap, 2, 'the worst miss is two full flags');
  approx(gulf.totals.worstExposureF, 5, 0.2, 'the worst block ran about 5 F past its called ceiling');
  const desert = L.evaluateScenario('desert-oven', 'flat-caution', 0);
  eq(desert.totals.unsafeCount, 0, 'desert oven flat caution never undercalls');
  ok(desert.totals.overRestriction >= 4, 'desert oven flat caution overcalls the mild blocks');
});

test('stale-read lags ramps and overshoots fronts', () => {
  const gulf = L.evaluateScenario('gulf-surge', 'stale-read', 0);
  eq(gulf.blocks[1].chosen, gulf.blocks[0].recommended, 'gulf block two reuses the opening call');
  eq(gulf.blocks[2].chosen, gulf.blocks[1].recommended, 'gulf scrimmage reuses the practice call');
  eq(gulf.blocks[2].unsafe, true, 'the ramping scrimmage is undercalled');
  eq(gulf.totals.worstUnderGap, 4, 'the gulf scrimmage gap is a full four flags');
  const front = L.evaluateScenario('blue-front', 'stale-read', 0);
  eq(front.blocks[2].chosen, 4, 'the cooled final still carries the Danger call');
  eq(front.blocks[2].recommended, 1, 'the front actually dropped the day to Watch');
  ok(front.totals.overRestriction >= 3, 'the stale plan overcancels the cooled final');
});

test('dry-bulb overflags dry heat and tracks humid heat', () => {
  const desert = L.evaluateScenario('desert-oven', 'dry-bulb', 0);
  eq(desert.totals.unsafeCount, 0, 'dry bulb never undercalls the desert day');
  ok(desert.totals.overRestriction >= 10, 'dry bulb overflags the dry day by a wide margin');
  const steam = L.evaluateScenario('steam-dawn', 'dry-bulb', 0);
  ok(steam.totals.rawPoints > desert.totals.rawPoints * 0.5,
    'dry bulb tracks humid days far better than dry ones');
});

test('metrics rollups rescore independently', () => {
  for (const s of L.SCENARIOS) {
    for (const p of L.POLICIES) {
      const ev = L.evaluateScenario(s.id, p.id, 0);
      const t = ev.totals;
      const raw = ev.blocks.reduce(function (sum, b) { return sum + b.points; }, 0);
      eq(t.rawPoints, raw, s.id + ' x ' + p.id + ' raw points re-add');
      eq(t.max, ev.blocks.length * 100, s.id + ' x ' + p.id + ' max is 100 per block');
      eq(t.unsafeCount, t.undercall + t.critical, s.id + ' x ' + p.id + ' unsafe is undercall plus critical');
      ok(t.pct >= 0 && t.pct <= 1, s.id + ' x ' + p.id + ' pct stays inside zero to one');
      eq(t.grade, E.gradeFor(t.pct), s.id + ' x ' + p.id + ' grade matches the engine grader');
      let gap = 0;
      let expF = 0;
      let over = 0;
      ev.blocks.forEach(function (b) {
        const g = b.recommended - b.chosen;
        if (g > gap) { gap = g; }
        if (g > 0 && b.shownWbgtF - L.BAND_CEILING_F[b.chosen] > expF) {
          expF = b.shownWbgtF - L.BAND_CEILING_F[b.chosen];
        }
        if (b.chosen > b.recommended) { over += b.chosen - b.recommended; }
      });
      eq(t.worstUnderGap, gap, s.id + ' x ' + p.id + ' worst gap recomputes');
      approx(t.worstExposureF, expF, 1e-9, s.id + ' x ' + p.id + ' worst exposure recomputes');
      eq(t.overRestriction, over, s.id + ' x ' + p.id + ' over restriction recomputes');
      count += 0;
    }
  }
});

test('comparator structure and counterfactual deltas', () => {
  const cmp = L.compareAll(0);
  eq(cmp.scenarios.length, 5, 'the comparator covers five scenarios');
  cmp.scenarios.forEach(function (s) {
    eq(s.rows.length, 5, s.id + ' has five policy rows');
    eq(s.rows[0].policyId, 'band-exact', 'the benchmark is row zero on ' + s.id);
    s.rows.forEach(function (row) {
      ok(row.pointsDelta <= 0, 'no policy beats the benchmark on ' + s.id + ' (' + row.policyId + ')');
      eq(row.unsafeDelta >= 0, true, 'unsafe deltas never go negative on ' + s.id);
      eq(row.pointsDelta, row.totals.rawPoints - s.rows[0].totals.rawPoints,
        'the delta is raw points against the benchmark on ' + s.id);
    });
  });
  eq(cmp.policies.length, 5, 'five aggregate policy lines');
  eq(cmp.policies[0].pct, 1, 'the benchmark aggregate is a perfect run');
  ok(cmp.policies[0].rawPoints > cmp.policies[2].rawPoints, 'the benchmark outscores flat caution overall');
  ok(cmp.policies.every(function (p) { return p.unsafe >= 0 && p.pct >= 0 && p.pct <= 1; }),
    'every aggregate stays inside sane bounds');
  const benchTotal = cmp.scenarios.reduce(function (sum, s) {
    return sum + s.rows[0].totals.rawPoints;
  }, 0);
  cmp.policies.forEach(function (p, i) {
    eq(p.pointsDelta, p.rawPoints - benchTotal,
      'aggregate delta for ' + p.policyId + ' is against the total benchmark, not one scenario');
    if (i === 0) { eq(p.pointsDelta, 0, 'the benchmark delta against itself is zero'); }
    if (i > 0) { ok(p.pointsDelta <= 0, 'no aggregate policy beats the total benchmark'); }
  });
});

test('stress shift moves readings and never decreases them going up', () => {
  for (const s of L.SCENARIOS) {
    const base = L.recommendedSeries(s.id, 0);
    const hot = L.recommendedSeries(s.id, 10);
    const cold = L.recommendedSeries(s.id, -10);
    for (let i = 0; i < base.length; i += 1) {
      ok(hot[i].wbgtF > base[i].wbgtF, s.id + ' block ' + i + ' reads hotter at plus ten');
      ok(cold[i].wbgtF < base[i].wbgtF, s.id + ' block ' + i + ' reads cooler at minus ten');
    }
    let prev = -Infinity;
    for (let t = -20; t <= 20; t += 5) {
      const v = L.recommendedSeries(s.id, t)[0].wbgtF;
      ok(v >= prev - 1e-9, s.id + ' stress shift monotonic at t=' + t);
      prev = v;
    }
  }
});

test('stress shift escalates tiers monotonically on the hottest scenario', () => {
  const tiers = [];
  for (let t = -20; t <= 20; t += 4) {
    tiers.push(L.recommendedSeries('gulf-surge', t)[2].tier);
  }
  let prev = -1;
  let okMono = true;
  tiers.forEach(function (t) { if (t < prev) { okMono = false; } prev = t; });
  ok(okMono, 'the scrimmage flag never drops as the day is stressed hotter');
  ok(tiers[0] < tiers[tiers.length - 1], 'a forty degree swing moves the scrimmage at least one flag');
});

test('evaluation is fully deterministic', () => {
  deq(L.evaluateScenario('blue-front', 'stale-read', 3), L.evaluateScenario('blue-front', 'stale-read', 3),
    'identical inputs give identical evaluations');
  eq(L.digestBrief(L.buildBrief(-5, 'fixed')), L.digestBrief(L.buildBrief(-5, 'fixed')),
    'identical briefs digest identically');
  deq(L.compareAll(0), L.compareAll(0), 'the whole comparator is deterministic');
});

test('predawn reference tier is a real engine output', () => {
  for (const s of L.SCENARIOS) {
    const pre = L.predawnTier(s, 0);
    ok(pre >= 0 && pre <= 4, s.id + ' predawn tier is a real band');
    const ev = L.evaluateScenario(s.id, 'stale-read', 0);
    eq(ev.blocks[0].chosen, pre, s.id + ' stale read opens on the predawn call');
    eq(ev.predawnTier, pre, s.id + ' evaluation exposes the predawn tier');
  }
});

test('recommended series matches per block evaluation', () => {
  for (const s of L.SCENARIOS) {
    const series = L.recommendedSeries(s.id, 0);
    const ev = L.evaluateScenario(s.id, 'band-exact', 0);
    eq(series.length, ev.blocks.length, s.id + ' series length matches block count');
    series.forEach(function (r, i) {
      eq(r.tier, ev.blocks[i].recommended, s.id + ' block ' + i + ' tier agrees');
      approx(r.wbgtF, ev.blocks[i].wbgtF, 1e-9, s.id + ' block ' + i + ' reading agrees');
    });
  }
});

test('lab copy hygiene', () => {
  const copy = JSON.stringify([L.SCENARIOS, L.POLICIES]);
  ok(copy.indexOf('\u2014') === -1, 'lab copy contains no em dash');
  ok(copy.indexOf('\u2013') === -1, 'lab copy contains no en dash');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u.test(copy), 'lab copy contains no emoji');
});

test('the self test suite passes end to end', () => {
  const result = L.selfTests();
  ok(result.total >= 20, 'the suite runs at least twenty checks (got ' + result.total + ')');
  eq(result.passed, result.total, 'every self test passes');
  eq(result.ok, true, 'the suite reports a clean bill');
  ok(result.tests.every(function (t) { return typeof t.name === 'string' && t.name.length > 8; }),
    'every self test carries a real name');
});

test('self audit: lab assertion count is exact', () => {
  assert.strictEqual(count, 1463, 'the lab suite must hold exactly 1463 content assertions');
});

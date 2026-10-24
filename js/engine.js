'use strict';

/*
 * Flag Call engine.
 *
 * Pure logic only: wet bulb globe temperature math, activity tier mapping,
 * city presets, schedule templates, scoring, plan generators, and the
 * Day 1 walkthrough copy. No DOM access. Loaded by the browser through a
 * script tag and by Node tests through require.
 *
 * Science notes, stated honestly:
 * - Wet bulb temperature uses the Stull (2011) approximation, accurate to
 *   roughly 0.3 C for relative humidity between 5 and 99 percent and air
 *   temperature between minus 20 and 50 C. Inputs are clamped to that window.
 * - Outdoor WBGT uses the standard weighting 0.7 wet bulb, 0.2 globe,
 *   0.1 dry bulb.
 * - Globe temperature uses a simplified empirical rise over air temperature
 *   driven by solar radiation and wind. It is tuned for gameplay clarity and
 *   is not a substitute for a real black globe sensor or an official
 *   meteorological instrument.
 * - Tier bands (under 82 F, 82 to 85, 85 to 88, 88 to 90, 90 and up) follow
 *   the WBGT activity bands used in UIL style heat guidance. This game is
 *   educational and is not an authority on any league's current policy.
 */

const FlagCallEngine = (function () {
  const VERSION = '1.0.0';

  // Escalation thresholds in degrees Fahrenheit. Each tier starts at its
  // threshold; the previous tier owns everything below it.
  const TIER_THRESHOLDS_F = { watch: 82, caution: 85, warning: 88, danger: 90 };

  const TIERS = [
    {
      key: 'normal',
      name: 'Normal',
      chipClass: 'tier-normal',
      summary: 'Full activity with routine water breaks and normal monitoring.',
      actions: [
        'Unlimited outdoor activity with routine water breaks',
        'Keep an eye on players with a history of heat illness'
      ]
    },
    {
      key: 'watch',
      name: 'Watch',
      chipClass: 'tier-watch',
      summary: 'Vigorous activity moves into shorter segments with extra water.',
      actions: [
        'Break vigorous work into shorter segments',
        'Water breaks at least every 30 minutes'
      ]
    },
    {
      key: 'caution',
      name: 'Caution',
      chipClass: 'tier-caution',
      summary: 'Limit intense activity and shed heavy gear when not in use.',
      actions: [
        'Limit intense activity and reduce total practice time',
        'Helmets and pads off whenever possible',
        'Water breaks at least every 20 minutes'
      ]
    },
    {
      key: 'warning',
      name: 'Warning',
      chipClass: 'tier-warning',
      summary: 'Minimize intense activity and build in shade and rest.',
      actions: [
        'Minimize intense activity for all players',
        'Rest and shade breaks at least every 15 minutes',
        'Monitor players closely for heat illness signs'
      ]
    },
    {
      key: 'danger',
      name: 'Danger',
      chipClass: 'tier-danger',
      summary: 'Suspend outdoor activity and move indoors or postpone.',
      actions: [
        'Suspend all outdoor practice and play',
        'Move indoors, postpone, or reschedule',
        'Treat any heat illness symptoms as an emergency'
      ]
    }
  ];

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function fToC(tempF) {
    return (tempF - 32) * 5 / 9;
  }

  function cToF(tempC) {
    return tempC * 9 / 5 + 32;
  }

  // Stull (2011) wet bulb approximation, in Celsius.
  function stullWetBulbC(tempC, rhPct) {
    const t = clamp(tempC, -20, 55);
    const rh = clamp(rhPct, 5, 99);
    const first = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659));
    const second = Math.atan(t + rh);
    const third = Math.atan(rh - 1.676331);
    const fourth = 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh);
    return first + second - third + fourth - 4.686035;
  }

  // Simplified globe rise over air temperature in Celsius. Strong sun pushes
  // a black globe up; wind drags it back down. Capped at 16 C.
  function globeRiseC(solarWm2, windMph) {
    const solar = clamp(solarWm2, 0, 1200);
    const windMs = Math.max(0, windMph) * 0.44704;
    const raw = 14 * (solar / 1200) * (1.6 / (0.6 + windMs));
    return Math.min(16, raw);
  }

  function globeTempC(tempC, solarWm2, windMph) {
    return tempC + globeRiseC(solarWm2, windMph);
  }

  // Core readout. inputs: { tempF, humidityPct, solarWm2, windMph }.
  function wbgtFromInputs(inputs) {
    const tempF = clamp(Number(inputs.tempF), 32, 131);
    const rhPct = clamp(Number(inputs.humidityPct), 5, 99);
    const solarWm2 = clamp(Number(inputs.solarWm2), 0, 1200);
    const windMph = Math.max(0, Number(inputs.windMph));
    const tempC = fToC(tempF);
    const wetBulbC = stullWetBulbC(tempC, rhPct);
    const globeC = globeTempC(tempC, solarWm2, windMph);
    const wbgtC = 0.7 * wetBulbC + 0.2 * globeC + 0.1 * tempC;
    return {
      wbgtF: cToF(wbgtC),
      wbgtC: wbgtC,
      wetBulbF: cToF(wetBulbC),
      globeF: cToF(globeC),
      dryF: tempF
    };
  }

  function tierIndexFromF(wbgtF) {
    if (wbgtF >= TIER_THRESHOLDS_F.danger) { return 4; }
    if (wbgtF >= TIER_THRESHOLDS_F.warning) { return 3; }
    if (wbgtF >= TIER_THRESHOLDS_F.caution) { return 2; }
    if (wbgtF >= TIER_THRESHOLDS_F.watch) { return 1; }
    return 0;
  }

  function tierForInputs(inputs) {
    return tierIndexFromF(wbgtFromInputs(inputs).wbgtF);
  }

  function formatF(value) {
    return value.toFixed(1) + ' F';
  }

  // Eight representative heat wave snapshots. Values are modeled snapshots in
  // the spirit of NOAA climate extremes, not dated station records.
  const PRESETS = [
    {
      id: 'houston', city: 'Houston', state: 'TX',
      tempF: 101, humidityPct: 65, solarWm2: 950, windMph: 6,
      blurb: 'Gulf moisture keeps the wet bulb brutal long after sunset.'
    },
    {
      id: 'phoenix', city: 'Phoenix', state: 'AZ',
      tempF: 118, humidityPct: 12, solarWm2: 1100, windMph: 5,
      blurb: 'Dry desert air with a ferocious globe reading in full sun.'
    },
    {
      id: 'dallas', city: 'Dallas', state: 'TX',
      tempF: 104, humidityPct: 40, solarWm2: 980, windMph: 16,
      blurb: 'A stiff prairie breeze helps, but the afternoon sun wins.'
    },
    {
      id: 'sanantonio', city: 'San Antonio', state: 'TX',
      tempF: 103, humidityPct: 55, solarWm2: 920, windMph: 7,
      blurb: 'Hill Country heat with humid air pooling over the practice field.'
    },
    {
      id: 'austin', city: 'Austin', state: 'TX',
      tempF: 96, humidityPct: 45, solarWm2: 900, windMph: 12,
      blurb: 'Hot but moving air keeps this one on the edge of caution.'
    },
    {
      id: 'elpaso', city: 'El Paso', state: 'TX',
      tempF: 108, humidityPct: 15, solarWm2: 1050, windMph: 8,
      blurb: 'High desert sun at altitude; shade is the whole ballgame.'
    },
    {
      id: 'corpus', city: 'Corpus Christi', state: 'TX',
      tempF: 93, humidityPct: 72, solarWm2: 800, windMph: 12,
      blurb: 'Coastal humidity turns a mild temperature into a heavy load.'
    },
    {
      id: 'lubbock', city: 'Lubbock', state: 'TX',
      tempF: 100, humidityPct: 25, solarWm2: 900, windMph: 18,
      blurb: 'Dry and windy on the caprock; the readings stay manageable.'
    }
  ];

  // Eight practice cards. tempAdjF shifts the preset air temperature for that
  // block; solarFactor scales sunlight; windAdjMph nudges the breeze.
  const SCHEDULE_TEMPLATES = [
    {
      id: 'two-a-day', name: 'Two A Day Opener',
      blocks: [
        { time: '7:30 AM', label: 'Walk Through', intensity: 1, tempAdjF: -9, solarFactor: 0.35 },
        { time: '10:00 AM', label: 'Varsity Practice', intensity: 3, tempAdjF: -3, solarFactor: 0.85 },
        { time: '1:30 PM', label: 'Scrimmage', intensity: 3, tempAdjF: 5, solarFactor: 1.0 },
        { time: '4:30 PM', label: 'Special Teams', intensity: 2, tempAdjF: 2, solarFactor: 0.6 }
      ]
    },
    {
      id: 'game-day', name: 'Game Day',
      blocks: [
        { time: '9:00 AM', label: 'Captains Practice', intensity: 2, tempAdjF: -6, solarFactor: 0.6 },
        { time: '12:00 PM', label: 'Pep Rally Setup', intensity: 1, tempAdjF: 1, solarFactor: 0.95 },
        { time: '7:00 PM', label: 'Kickoff', intensity: 3, tempAdjF: -2, solarFactor: 0.15, windAdjMph: -3 }
      ]
    },
    {
      id: 'band-camp', name: 'Band Camp',
      blocks: [
        { time: '8:00 AM', label: 'Outside Visual Block', intensity: 2, tempAdjF: -7, solarFactor: 0.5 },
        { time: '11:00 AM', label: 'Music on the Lot', intensity: 2, tempAdjF: 0, solarFactor: 0.9 },
        { time: '2:30 PM', label: 'Full Ensemble Run', intensity: 3, tempAdjF: 4, solarFactor: 1.0 }
      ]
    },
    {
      id: 'xc-meet', name: 'Cross Country Meet',
      blocks: [
        { time: '8:30 AM', label: 'Warmup Mile', intensity: 2, tempAdjF: -8, solarFactor: 0.45 },
        { time: '9:30 AM', label: 'Varsity Race', intensity: 3, tempAdjF: -5, solarFactor: 0.7 },
        { time: '11:15 AM', label: 'JV Race', intensity: 3, tempAdjF: -2, solarFactor: 0.9 }
      ]
    },
    {
      id: 'soccer-double', name: 'Soccer Doubleheader',
      blocks: [
        { time: '10:00 AM', label: 'Match One', intensity: 3, tempAdjF: -4, solarFactor: 0.8 },
        { time: '12:30 PM', label: 'Match Two', intensity: 3, tempAdjF: 2, solarFactor: 1.0 }
      ]
    },
    {
      id: 'track-workout', name: 'Track Workout',
      blocks: [
        { time: '6:30 AM', label: 'Interval Session', intensity: 3, tempAdjF: -12, solarFactor: 0.25 },
        { time: '4:00 PM', label: 'Tempo Run', intensity: 3, tempAdjF: 3, solarFactor: 0.65 }
      ]
    },
    {
      id: 'tennis-tourney', name: 'Tennis Tournament',
      blocks: [
        { time: '9:00 AM', label: 'First Round', intensity: 2, tempAdjF: -5, solarFactor: 0.55 },
        { time: '1:00 PM', label: 'Second Round', intensity: 2, tempAdjF: 4, solarFactor: 1.0 },
        { time: '4:30 PM', label: 'Finals', intensity: 3, tempAdjF: 1, solarFactor: 0.7 }
      ]
    },
    {
      id: 'marching-rehearsal', name: 'Marching Rehearsal',
      blocks: [
        { time: '5:30 PM', label: 'Basics Block', intensity: 2, tempAdjF: -1, solarFactor: 0.4, windAdjMph: -3 },
        { time: '7:00 PM', label: 'Full Run', intensity: 3, tempAdjF: -3, solarFactor: 0.2 }
      ]
    }
  ];

  // Conditions for one schedule block under a base weather snapshot.
  function blockConditions(base, block) {
    return {
      tempF: base.tempF + block.tempAdjF,
      humidityPct: base.humidityPct,
      solarWm2: clamp(base.solarWm2 * block.solarFactor, 0, 1200),
      windMph: Math.max(0, base.windMph + (block.windAdjMph || 0))
    };
  }

  // Evaluate every block of a template against a base weather snapshot.
  function recommendedFlagsFor(base, template) {
    return template.blocks.map(function (block, index) {
      const inputs = blockConditions(base, block);
      const readout = wbgtFromInputs(inputs);
      return {
        index: index,
        time: block.time,
        label: block.label,
        intensity: block.intensity,
        inputs: inputs,
        wbgtF: readout.wbgtF,
        wetBulbF: readout.wetBulbF,
        globeF: readout.globeF,
        tier: tierIndexFromF(readout.wbgtF)
      };
    });
  }

  // Scoring. Chosen tier lower than recommended means the player was more
  // cautious than required. Higher means less safe. Undercalling is punished
  // much harder than overcalling.
  function scoreCall(chosenTier, recommendedTier) {
    const diff = chosenTier - recommendedTier;
    if (diff === 0) {
      return { points: 100, quality: 'exact', unsafe: diff > 0 };
    }
    if (diff === -1) {
      return { points: 75, quality: 'cautious', unsafe: diff > 0 };
    }
    if (diff <= -2) {
      return { points: 40, quality: 'overcautious', unsafe: diff > 0 };
    }
    if (diff === 1) {
      return { points: 15, quality: 'undercall', unsafe: diff > 0 };
    }
    return { points: 0, quality: 'critical', unsafe: diff > 0 };
  }

  // Ten bonus points for each exact call beyond the first in a consecutive
  // exact streak, capped at 50.
  function computeStreakBonus(qualities) {
    let bonus = 0;
    let run = 0;
    for (let i = 0; i < qualities.length; i += 1) {
      if (qualities[i] === 'exact') {
        run += 1;
        if (run > 1) {
          bonus = Math.min(50, bonus + 10);
        }
      } else {
        run = 0;
      }
    }
    return bonus;
  }

  function gradeFor(pct) {
    if (pct >= 0.95) { return 'A'; }
    if (pct >= 0.85) { return 'B'; }
    if (pct >= 0.70) { return 'C'; }
    if (pct >= 0.50) { return 'D'; }
    return 'F';
  }

  // calls: array of { chosen, recommended } in block order.
  function dayReport(calls) {
    const perCall = calls.map(function (call) {
      return scoreCall(call.chosen, call.recommended);
    });
    const points = perCall.reduce(function (sum, r) { return sum + r.points; }, 0);
    const max = calls.length * 100;
    const bonus = computeStreakBonus(perCall.map(function (r) { return r.quality; }));
    const total = Math.min(max, points + bonus);
    const pct = max === 0 ? 0 : total / max;
    const unsafeCount = perCall.filter(function (r) { return r.unsafe; }).length;
    return {
      perCall: perCall,
      points: points,
      bonus: bonus,
      total: total,
      max: max,
      pct: pct,
      grade: gradeFor(pct),
      unsafeCount: unsafeCount
    };
  }

  function reasonForTier(tier, wbgtF) {
    const band = TIERS[tier].name;
    return 'Wet bulb globe temperature ' + formatF(wbgtF) + ' falls in the ' +
      band + ' band. ' + TIERS[tier].summary;
  }

  // The one tap judge shortcut: a plan that ignores the heat picture.
  function unsafePlanFor(recs) {
    const picks = recs.map(function (rec) {
      return {
        index: rec.index,
        time: rec.time,
        label: rec.label,
        chosen: clamp(rec.tier - 2, 0, 4),
        recommended: rec.tier
      };
    });
    const violations = [];
    recs.forEach(function (rec) {
      const pick = picks[rec.index];
      const score = scoreCall(pick.chosen, rec.tier);
      if (rec.tier >= 2 && pick.chosen < rec.tier) {
        violations.push(rec.time + ' ' + rec.label + ': full pads at peak heat while the ' +
          'recommended call was ' + TIERS[rec.tier].name + '.');
      } else if (rec.tier >= 1 && pick.chosen < rec.tier) {
        violations.push(rec.time + ' ' + rec.label + ': no added water breaks even though ' +
          'the recommended call was ' + TIERS[rec.tier].name + '.');
      } else if (score.points < 100) {
        violations.push(rec.time + ' ' + rec.label + ': call does not match the ' +
          TIERS[rec.tier].name + ' recommendation.');
      } else {
        violations.push(rec.time + ' ' + rec.label + ': skips routine water breaks and ' +
          'shade checks that every good plan includes.');
      }
    });
    return { picks: picks, violations: violations };
  }

  // The other one tap judge shortcut: the recommended calls with reasons.
  function safeCallFor(recs) {
    return recs.map(function (rec) {
      return {
        index: rec.index,
        time: rec.time,
        label: rec.label,
        tier: rec.tier,
        wbgtF: rec.wbgtF,
        reason: reasonForTier(rec.tier, rec.wbgtF),
        actions: TIERS[rec.tier].actions
      };
    });
  }

  // Day 1 walkthrough copy. Focus is a CSS selector the app spotlights.
  const WALKTHROUGH_STEPS = [
    {
      id: 'welcome', title: 'Welcome To Flag Call',
      body: 'You are the official holding the heat flag for a full day of outdoor ' +
        'activities. Your one job: read the wet bulb globe temperature and make the ' +
        'call that keeps everyone safe.',
      focus: '.intro-card'
    },
    {
      id: 'pick-city', title: 'Pick A Heat Snapshot',
      body: 'Start in Houston on a 101 F afternoon. Gulf humidity means the air alone ' +
        'does not tell the story. Tap the Houston card to load it.',
      focus: '.preset-grid'
    },
    {
      id: 'read-inputs', title: 'Read The Four Inputs',
      body: 'Air temperature, relative humidity, radiant heat from the sun, and wind. ' +
        'Humidity and radiant heat push the heat load up. Wind drags it down.',
      focus: '.conditions-panel'
    },
    {
      id: 'watch-wbgt', title: 'Watch The Number',
      body: 'The engine blends the inputs into one wet bulb globe temperature reading: ' +
        '70 percent wet bulb, 20 percent globe, 10 percent air temperature. This is the ' +
        'number heat plans are written around.',
      focus: '.readout-panel'
    },
    {
      id: 'learn-flags', title: 'Learn The Five Flags',
      body: 'Normal under 82 F, Watch from 82, Caution from 85, Warning from 88, and ' +
        'Danger at 90 F and up. Each step up takes activity away.',
      focus: '.flag-scale'
    },
    {
      id: 'first-call', title: 'Make Your First Call',
      body: 'Look at the first block on the schedule card and pick the flag you believe ' +
        'in. Exact calls score 100. Undercalls score almost nothing, because a low flag ' +
        'is the dangerous mistake.',
      focus: '.schedule-panel'
    },
    {
      id: 'unsafe-plan', title: 'See An Unsafe Plan',
      body: 'Tap the See an Unsafe Plan shortcut. This is what a bad day looks like: ' +
        'full pads at peak heat, no added water, and nobody watching the flag.',
      focus: '.judge-panel'
    },
    {
      id: 'safe-call', title: 'Show The Safe Call',
      body: 'Tap the Show the Safe Call shortcut to reveal the recommended flag for ' +
        'every block with the reasoning spelled out. Compare it with your own calls.',
      focus: '.judge-panel'
    },
    {
      id: 'finish', title: 'Finish The Day',
      body: 'Call the rest of the blocks to complete your Day 1 report card. When you ' +
        'are ready, switch to Free Play and take on all eight cities.',
      focus: '.report-panel'
    }
  ];

  return {
    VERSION: VERSION,
    TIER_THRESHOLDS_F: TIER_THRESHOLDS_F,
    TIERS: TIERS,
    PRESETS: PRESETS,
    SCHEDULE_TEMPLATES: SCHEDULE_TEMPLATES,
    WALKTHROUGH_STEPS: WALKTHROUGH_STEPS,
    clamp: clamp,
    fToC: fToC,
    cToF: cToF,
    stullWetBulbC: stullWetBulbC,
    globeRiseC: globeRiseC,
    globeTempC: globeTempC,
    wbgtFromInputs: wbgtFromInputs,
    tierIndexFromF: tierIndexFromF,
    tierForInputs: tierForInputs,
    formatF: formatF,
    blockConditions: blockConditions,
    recommendedFlagsFor: recommendedFlagsFor,
    scoreCall: scoreCall,
    computeStreakBonus: computeStreakBonus,
    gradeFor: gradeFor,
    dayReport: dayReport,
    reasonForTier: reasonForTier,
    unsafePlanFor: unsafePlanFor,
    safeCallFor: safeCallFor
  };
})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = FlagCallEngine;
}

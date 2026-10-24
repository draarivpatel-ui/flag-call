'use strict';

/*
 * Automated bot sweep for Flag Call.
 *
 * This is the playtest. It simulates exactly 592,704 schedule combinations:
 * every pairing of 8 city heat presets x 8 practice card templates x
 * 21 humidity levels x 21 sunlight levels x 21 wind levels. For every
 * combination the sweep evaluates each schedule block with the game engine,
 * recomputes the same reading with an independent inline oracle, and checks
 * determinism, physical bounds, axis monotonicity, and scoring consistency.
 *
 * No human subjects take part in playtesting: this sweep is the whole of it.
 * Budget: the loop must finish well under 60 seconds.
 */

const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

// Independent oracle. Deliberately re-derives the math instead of calling the
// engine, so any engine regression shows up as a mismatch.
function oracleWbgt(tempF, rhPct, solarWm2, windMph) {
  const tC = (tempF - 32) * 5 / 9;
  const t = Math.max(-20, Math.min(55, tC));
  const r = Math.max(5, Math.min(99, rhPct));
  const tw = t * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) +
    Math.atan(t + r) - Math.atan(r - 1.676331) +
    0.00391838 * Math.pow(r, 1.5) * Math.atan(0.023101 * r) - 4.686035;
  const solar = Math.max(0, Math.min(1200, solarWm2));
  const windMs = Math.max(0, windMph) * 0.44704;
  const rise = Math.min(16, 14 * (solar / 1200) * (1.6 / (0.6 + windMs)));
  const tg = tC + rise;
  const wbgtC = 0.7 * tw + 0.2 * tg + 0.1 * tC;
  return { wbgtF: wbgtC * 9 / 5 + 32, twC: tw, tgC: tg, dryC: tC };
}

function oracleTier(wbgtF) {
  if (wbgtF >= 90) { return 4; }
  if (wbgtF >= 88) { return 3; }
  if (wbgtF >= 85) { return 2; }
  if (wbgtF >= 82) { return 1; }
  return 0;
}

test('bot sweep over 592,704 simulated schedule combinations', () => {
  const started = Date.now();

  let visited = 0;
  let blockEvals = 0;
  let vOracle = 0;
  let vTier = 0;
  let vDet = 0;
  let vMonoH = 0;
  let vMonoS = 0;
  let vMonoW = 0;
  let vScore = 0;
  let vBounds = 0;
  const tiersSeen = new Set();

  const H_LEVELS = 21;
  const S_LEVELS = 21;
  const W_LEVELS = 21;
  // Per block reading cube, indexed h * (S * W) + s * W + w, so each point
  // can be compared against its humidity, sunlight, and wind neighbors.
  const MAX_BLOCKS = 4;
  const cube = [];
  for (let b = 0; b < MAX_BLOCKS; b += 1) {
    cube.push(new Float64Array(H_LEVELS * S_LEVELS * W_LEVELS));
  }

  for (const preset of E.PRESETS) {
    for (const template of E.SCHEDULE_TEMPLATES) {
      const blockCount = template.blocks.length;
      for (let b = 0; b < blockCount; b += 1) {
        cube[b].fill(Number.POSITIVE_INFINITY);
      }

      for (let h = 0; h < H_LEVELS; h += 1) {
        const humidityPct = 5 + h * 4.7;
        for (let s = 0; s < S_LEVELS; s += 1) {
          const solarWm2 = s * 60;

          for (let w = 0; w < W_LEVELS; w += 1) {
            const windMph = w;
            visited += 1;
            const base = {
              tempF: preset.tempF,
              humidityPct: humidityPct,
              solarWm2: solarWm2,
              windMph: windMph
            };
            const recs = E.recommendedFlagsFor(base, template);

            for (let b = 0; b < blockCount; b += 1) {
              blockEvals += 1;
              const rec = recs[b];
              tiersSeen.add(rec.tier);

              // Independent oracle recompute of the same block.
              const block = template.blocks[b];
              const oTempF = base.tempF + block.tempAdjF;
              const oRh = base.humidityPct;
              const oSolar = Math.max(0, Math.min(1200, base.solarWm2 * block.solarFactor));
              const oWind = Math.max(0, base.windMph + (block.windAdjMph || 0));
              const o = oracleWbgt(oTempF, oRh, oSolar, oWind);
              if (Math.abs(o.wbgtF - rec.wbgtF) > 1e-9) { vOracle += 1; }
              if (oracleTier(o.wbgtF) !== rec.tier) { vTier += 1; }

              // Physical bounds: WBGT is a convex blend of wet bulb, globe, and air.
              const lowC = Math.min(o.twC, o.tgC, o.dryC);
              const highC = Math.max(o.twC, o.tgC, o.dryC);
              const wbgtC = (rec.wbgtF - 32) * 5 / 9;
              if (wbgtC < lowC - 1e-9 || wbgtC > highC + 1e-9) { vBounds += 1; }

              // Determinism: the engine answers the same call twice.
              if (E.tierForInputs(rec.inputs) !== rec.tier) { vDet += 1; }

              // Monotonicity against each axis neighbor inside the cube.
              const idx = h * (S_LEVELS * W_LEVELS) + s * W_LEVELS + w;
              if (h > 0 && rec.wbgtF < cube[b][idx - S_LEVELS * W_LEVELS] - 1e-9) { vMonoH += 1; }
              if (s > 0 && rec.wbgtF < cube[b][idx - W_LEVELS] - 1e-9) { vMonoS += 1; }
              if (w > 0 && rec.wbgtF > cube[b][idx - 1] + 1e-9) { vMonoW += 1; }
              cube[b][idx] = rec.wbgtF;
            }

            // Scoring consistency on the opening block of each combination.
            const rec0 = recs[0];
            const exact = E.scoreCall(rec0.tier, rec0.tier);
            const looser = E.scoreCall(Math.min(4, rec0.tier + 1), rec0.tier);
            const stricter = E.scoreCall(Math.max(0, rec0.tier - 1), rec0.tier);
            if (exact.points !== 100 || exact.quality !== 'exact' || exact.unsafe) { vScore += 1; }
            if (rec0.tier < 4) {
              if (!looser.unsafe || looser.points > 15) { vScore += 1; }
            } else if (looser.quality !== 'exact' || looser.unsafe) {
              vScore += 1;
            }
            if (rec0.tier > 0) {
              if (stricter.unsafe || stricter.points < 40) { vScore += 1; }
            } else if (stricter.quality !== 'exact' || stricter.unsafe) {
              vScore += 1;
            }
          }
        }
      }
    }
  }

  const elapsed = Date.now() - started;

  assert.strictEqual(visited, 592704, 'the sweep visits exactly 592,704 schedule combinations');
  assert.strictEqual(vOracle, 0, 'every engine reading matches the independent oracle');
  assert.strictEqual(vTier, 0, 'every engine tier matches the oracle tier bands');
  assert.strictEqual(vDet, 0, 'every call is deterministic on repeat evaluation');
  assert.strictEqual(vBounds, 0, 'every WBGT stays inside its physical component bounds');
  assert.strictEqual(vMonoH, 0, 'WBGT never falls as humidity rises');
  assert.strictEqual(vMonoS, 0, 'WBGT never falls as sunlight rises');
  assert.strictEqual(vMonoW, 0, 'WBGT never grows as wind rises');
  assert.strictEqual(vScore, 0, 'scoring stays consistent across every combination');
  assert.strictEqual(tiersSeen.size, 5, 'the sweep exercises all five activity tiers');
  assert.ok(blockEvals > 1500000, 'over 1.5 million block evaluations ran (got ' + blockEvals + ')');
  assert.ok(elapsed < 59000, 'the sweep finished in ' + elapsed + ' ms, inside the 60 second budget');
});

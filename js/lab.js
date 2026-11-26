'use strict';

/*
 * Flag Call Audit Lab.
 *
 * Pure logic only: a five scenario by five policy comparator that runs the
 * real game engine over realistic heat-day edge cases, deterministic
 * accuracy/safety/efficiency metrics, worst-case failure margins,
 * counterfactual deltas against the benchmark policy, CSV/JSON/Markdown
 * audit brief exports with an unkeyed SHA-256 tamper-detection digest,
 * strict URL hash bookmarking, and an in-page self test suite.
 *
 * No DOM access. Loaded by the browser through a script tag and by Node
 * tests through require. The digest is a SHA-256 integrity check, not a
 * signature: it detects edits, it does not prove authorship.
 */

const FlagCallLab = (function () {
  // Resolve dependencies without redeclaring the globals: engine.js and
  // sha256.js bind their names as top level consts, so a var here would
  // collide in the browser. Node falls back to require.
  let E = null;
  let SHA = null;
  if (typeof FlagCallEngine !== 'undefined') { E = FlagCallEngine; }
  if (typeof FlagCallSHA256 !== 'undefined') { SHA = FlagCallSHA256; }
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    if (!E) { E = require('./engine.js'); }
    if (!SHA) { SHA = require('./sha256.js'); }
  }
  const VERSION = '1.0.0';
  const BRIEF_FORMAT_JSON = 'flag-call-audit-json-v1';
  const BRIEF_FORMAT_CSV = 'flag-call-audit-csv-v1';
  const BRIEF_FORMAT_MD = 'flag-call-audit-md-v1';
  const BOOKMARK_PREFIX = '#fc=';
  const SHIFT_MIN_F = -20;
  const SHIFT_MAX_F = 20;

  /*
   * Five heat-day scenarios. Each is a base weather snapshot plus a per
   * block drift applied on top of a real schedule template, so every
   * reading still flows through the game's blockConditions and
   * wbgtFromInputs. Drift fields are additive per block index.
   */
  const SCENARIOS = [
    {
      id: 'gulf-surge',
      name: 'Gulf Surge',
      templateId: 'two-a-day',
      blurb: 'A Gulf moisture push builds through a two a day opener. ' +
        'Humidity climbs all day and the calm morning lies about the ' +
        'afternoon: lagging calls get left two flags short at the scrimmage.',
      base: { tempF: 86, humidityPct: 66, solarWm2: 700, windMph: 7 },
      drift: { tempF: 2.6, humidityPct: 4, solarWm2: 70, windMph: -1 }
    },
    {
      id: 'desert-oven',
      name: 'Desert Oven',
      templateId: 'two-a-day',
      blurb: 'Bone dry desert heat where the wet bulb stays low but the ' +
        'black globe soars in still air. Air temperature reads scarier ' +
        'than the real load, so dry bulb callers burn points overflagging.',
      base: { tempF: 97, humidityPct: 15, solarWm2: 380, windMph: 6 },
      drift: { tempF: 3.2, humidityPct: -1, solarWm2: 170, windMph: -0.5 }
    },
    {
      id: 'blue-front',
      name: 'Blue Front',
      templateId: 'tennis-tourney',
      blurb: 'A hard cold front arrives mid tournament. The day opens ' +
        'dangerous, peaks worse, then the wind shift knocks the wet bulb ' +
        'down fast. Stale plans keep canceling matches that turned safe.',
      base: { tempF: 103, humidityPct: 52, solarWm2: 950, windMph: 4 },
      drift: { tempF: -4.5, humidityPct: -6, solarWm2: -60, windMph: 5 }
    },
    {
      id: 'steam-dawn',
      name: 'Steam Dawn',
      templateId: 'band-camp',
      blurb: 'A saturated coastal morning. The wet bulb starts near the ' +
        'top of its physical range before the sun is even up, and every ' +
        'small rise flips a band. Boundary readings everywhere.',
      base: { tempF: 86, humidityPct: 80, solarWm2: 360, windMph: 3 },
      drift: { tempF: 2.2, humidityPct: 3, solarWm2: 150, windMph: 0 }
    },
    {
      id: 'evening-hang',
      name: 'Evening Hang',
      templateId: 'game-day',
      blurb: 'The sun drops but the wet bulb refuses to follow. Kickoff ' +
        'at 7 PM reads cooler on the thermometer than it plays on the ' +
        'field: the classic trap of trusting daylight over the globe.',
      base: { tempF: 99, humidityPct: 60, solarWm2: 820, windMph: 6 },
      drift: { tempF: -1.5, humidityPct: 3, solarWm2: -280, windMph: -1 }
    }
  ];

  /*
   * Five flag calling policies. choose(ctx) returns a tier index given
   * the full scenario context; ctx carries this block's recommended tier,
   * every recommended tier so far, and the pre dawn reference tier used
   * by the stale plan for its first block.
   */
  const POLICIES = [
    {
      id: 'band-exact',
      name: 'Band Exact',
      blurb: 'Calls exactly the flag the WBGT band recommends on every ' +
        'block. The benchmark: every other policy is scored against it.',
      choose: function (ctx) { return ctx.recommended; }
    },
    {
      id: 'dry-bulb',
      name: 'Dry Bulb Guess',
      blurb: 'Reads the flag straight off the air temperature on the same ' +
        'band numbers, ignoring humidity and radiant load. The most ' +
        'common real world shortcut and a quiet point bleeder.',
      choose: function (ctx) { return E.tierIndexFromF(ctx.inputs.tempF); }
    },
    {
      id: 'flat-caution',
      name: 'One Flag Caution',
      blurb: 'Plants a Caution flag on every block no matter what the ' +
        'meter says. Easy to announce, wrong in both directions at once.',
      choose: function () { return 2; }
    },
    {
      id: 'cancel-all',
      name: 'Cancel Everything',
      blurb: 'Holds Danger on every block from dawn to dark. Nobody is ' +
        'ever underprotected; the field just sits empty on playable ' +
        'mornings. Perfectly safe and perfectly inefficient.',
      choose: function () { return 4; }
    },
    {
      id: 'stale-read',
      name: 'Stale Read',
      blurb: 'Reuses the flag the previous block earned, starting the day ' +
        'on a pre dawn reading. Falls two flags behind a ramping ' +
        'afternoon and keeps canceling after a front passes.',
      choose: function (ctx) {
        return ctx.index === 0 ? ctx.predawnTier : ctx.recommendedAll[ctx.index - 1];
      }
    }
  ];

  const BAND_FLOOR_F = [0, 82, 85, 88, 90];
  const BAND_CEILING_F = [82, 85, 88, 90, Infinity];

  function scenarioById(id) {
    for (let i = 0; i < SCENARIOS.length; i += 1) {
      if (SCENARIOS[i].id === id) { return SCENARIOS[i]; }
    }
    return null;
  }

  function policyById(id) {
    for (let i = 0; i < POLICIES.length; i += 1) {
      if (POLICIES[i].id === id) { return POLICIES[i]; }
    }
    return null;
  }

  function templateFor(scenario) {
    for (let i = 0; i < E.SCHEDULE_TEMPLATES.length; i += 1) {
      if (E.SCHEDULE_TEMPLATES[i].id === scenario.templateId) {
        return E.SCHEDULE_TEMPLATES[i];
      }
    }
    return null;
  }

  function clampShift(shiftF) {
    const n = Number(shiftF);
    if (!Number.isFinite(n)) { return 0; }
    return E.clamp(Math.round(n), SHIFT_MIN_F, SHIFT_MAX_F);
  }

  // Base snapshot at a block index: the day drifts while the block
  // template keeps its own time of day offsets. The heat shift applies
  // to the air temperature of the whole day.
  function scenarioBase(scenario, index, shiftF) {
    return {
      tempF: scenario.base.tempF + scenario.drift.tempF * index + clampShift(shiftF),
      humidityPct: scenario.base.humidityPct + scenario.drift.humidityPct * index,
      solarWm2: scenario.base.solarWm2 + scenario.drift.solarWm2 * index,
      windMph: Math.max(0, scenario.base.windMph + scenario.drift.windMph * index)
    };
  }

  // Resolved weather inputs for one block: drifted base plus the
  // template's block offsets, straight through the engine path.
  function blockInputs(scenario, index, shiftF) {
    const template = templateFor(scenario);
    return E.blockConditions(scenarioBase(scenario, index, shiftF), template.blocks[index]);
  }

  // The stale plan's first call leans on a pre dawn check: cooler air,
  // almost no sun, slightly wetter. Computed through the same engine so
  // it stays honest.
  function predawnTier(scenario, shiftF) {
    const dawn = scenarioBase(scenario, -1, shiftF);
    const readout = E.wbgtFromInputs({
      tempF: dawn.tempF - 8,
      humidityPct: dawn.humidityPct + 4,
      solarWm2: dawn.solarWm2 * 0.05,
      windMph: dawn.windMph
    });
    return E.tierIndexFromF(readout.wbgtF);
  }

  // Evaluate one policy over one scenario. Returns per block detail plus
  // roll up totals. All numbers are deterministic engine outputs.
  function evaluateScenario(scenarioId, policyId, shiftF) {
    const scenario = typeof scenarioId === 'string' ? scenarioById(scenarioId) : scenarioId;
    const policy = typeof policyId === 'string' ? policyById(policyId) : policyId;
    if (!scenario || !policy) { return null; }
    const shift = clampShift(shiftF);
    const template = templateFor(scenario);
    const pre = predawnTier(scenario, shift);

    const recommendedAll = template.blocks.map(function (block, index) {
      const inputs = E.blockConditions(scenarioBase(scenario, index, shift), block);
      return E.tierIndexFromF(E.wbgtFromInputs(inputs).wbgtF);
    });

    const blocks = template.blocks.map(function (block, index) {
      const inputs = E.blockConditions(scenarioBase(scenario, index, shift), block);
      const readout = E.wbgtFromInputs(inputs);
      const recommended = recommendedAll[index];
      const ctx = {
        index: index,
        scenario: scenario,
        inputs: inputs,
        wbgtF: readout.wbgtF,
        shownWbgtF: Number(readout.wbgtF.toFixed(1)),
        recommended: recommended,
        recommendedAll: recommendedAll,
        predawnTier: pre
      };
      const chosen = policy.choose(ctx);
      const score = E.scoreCall(chosen, recommended);
      return {
        index: index,
        time: block.time,
        label: block.label,
        intensity: block.intensity,
        inputs: inputs,
        wbgtF: readout.wbgtF,
        shownWbgtF: ctx.shownWbgtF,
        wetBulbF: readout.wetBulbF,
        globeF: readout.globeF,
        recommended: recommended,
        chosen: E.clamp(Math.round(Number(chosen)), 0, 4),
        quality: score.quality,
        points: score.points,
        unsafe: score.unsafe
      };
    });

    const qualities = blocks.map(function (b) { return b.quality; });
    const counts = { exact: 0, cautious: 0, overcautious: 0, undercall: 0, critical: 0 };
    qualities.forEach(function (q) { counts[q] += 1; });
    const rawPoints = blocks.reduce(function (sum, b) { return sum + b.points; }, 0);
    const report = E.dayReport(blocks.map(function (b) {
      return { chosen: b.chosen, recommended: b.recommended };
    }));
    const unsafeCount = counts.undercall + counts.critical;
    let worstUnderGap = 0;
    let worstExposureF = 0;
    let overRestriction = 0;
    let minBlockPoints = 100;
    blocks.forEach(function (b) {
      const gap = b.recommended - b.chosen;
      if (gap > worstUnderGap) { worstUnderGap = gap; }
      if (gap > 0) {
        const exposure = b.shownWbgtF - BAND_CEILING_F[b.chosen];
        if (exposure > worstExposureF) { worstExposureF = exposure; }
      }
      if (b.chosen - b.recommended > 0) { overRestriction += b.chosen - b.recommended; }
      if (b.points < minBlockPoints) { minBlockPoints = b.points; }
    });
    if (blocks.length === 0) { minBlockPoints = 0; }

    return {
      scenario: scenario,
      policy: policy,
      shiftF: shift,
      templateId: template.id,
      templateName: template.name,
      predawnTier: pre,
      blocks: blocks,
      totals: {
        blocks: blocks.length,
        rawPoints: rawPoints,
        max: blocks.length * 100,
        score: report.total,
        bonus: report.bonus,
        pct: report.pct,
        grade: report.grade,
        exact: counts.exact,
        cautious: counts.cautious,
        overcautious: counts.overcautious,
        undercall: counts.undercall,
        critical: counts.critical,
        unsafeCount: unsafeCount,
        worstUnderGap: worstUnderGap,
        worstExposureF: worstExposureF,
        overRestriction: overRestriction,
        minBlockPoints: minBlockPoints
      }
    };
  }

  // Recommended tier series for a scenario (the flags the benchmark
  // calls). Used by the chart and the comparator.
  function recommendedSeries(scenarioId, shiftF) {
    const scenario = typeof scenarioId === 'string' ? scenarioById(scenarioId) : scenarioId;
    if (!scenario) { return null; }
    const shift = clampShift(shiftF);
    const template = templateFor(scenario);
    return template.blocks.map(function (block, index) {
      const inputs = E.blockConditions(scenarioBase(scenario, index, shift), block);
      const readout = E.wbgtFromInputs(inputs);
      return {
        index: index,
        time: block.time,
        label: block.label,
        wbgtF: readout.wbgtF,
        shownWbgtF: Number(readout.wbgtF.toFixed(1)),
        tier: E.tierIndexFromF(readout.wbgtF),
        inputs: inputs
      };
    });
  }

  /*
   * The full comparator: every policy on every scenario at one stress
   * shift, with counterfactual deltas against the Band Exact benchmark.
   * Deltas use raw points so they can never be flattering: the benchmark
   * always earns the per block maximum before any streak bonus.
   */
  function compareAll(shiftF) {
    const shift = clampShift(shiftF);
    const scenarios = SCENARIOS.map(function (scenario) {
      const rows = POLICIES.map(function (policy) {
        const evald = evaluateScenario(scenario, policy, shift);
        return {
          policyId: policy.id,
          policyName: policy.name,
          totals: evald.totals,
          blocks: evald.blocks
        };
      });
      const bench = rows[0].totals;
      rows.forEach(function (row) {
        row.pointsDelta = row.totals.rawPoints - bench.rawPoints;
        row.unsafeDelta = row.totals.unsafeCount - bench.unsafeCount;
      });
      return {
        id: scenario.id,
        name: scenario.name,
        templateId: scenario.templateId,
        blockCount: bench.blocks,
        rows: rows
      };
    });

    const benchTotal = scenarios.reduce(function (sum, s) {
      return sum + s.rows[0].totals.rawPoints;
    }, 0);
    const policies = POLICIES.map(function (policy, pIdx) {
      let rawPoints = 0;
      let max = 0;
      let unsafe = 0;
      let overRestriction = 0;
      let worstGap = 0;
      let worstExposureF = 0;
      let exact = 0;
      let blockCount = 0;
      scenarios.forEach(function (s) {
        const t = s.rows[pIdx].totals;
        rawPoints += t.rawPoints;
        max += t.max;
        unsafe += t.unsafeCount;
        overRestriction += t.overRestriction;
        exact += t.exact;
        blockCount += t.blocks;
        if (t.worstUnderGap > worstGap) { worstGap = t.worstUnderGap; }
        if (t.worstExposureF > worstExposureF) { worstExposureF = t.worstExposureF; }
      });
      return {
        policyId: policy.id,
        name: policy.name,
        rawPoints: rawPoints,
        max: max,
        pct: max === 0 ? 0 : rawPoints / max,
        grade: E.gradeFor(max === 0 ? 0 : rawPoints / max),
        unsafe: unsafe,
        overRestriction: overRestriction,
        worstGap: worstGap,
        worstExposureF: worstExposureF,
        exact: exact,
        blocks: blockCount,
        pointsDelta: rawPoints - benchTotal
      };
    });
    return { shiftF: shift, scenarios: scenarios, policies: policies };
  }

  /* ---------- audit brief exports ---------- */

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  // Deterministic canonical JSON: object keys sorted recursively, arrays
  // kept in order, no whitespace. The digest is computed over this.
  function canonicalJson(value) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number' && !Number.isFinite(value)) { return 'null'; }
      return JSON.stringify(value);
    }
    if (typeof value.toJSON === 'function') { return canonicalJson(value.toJSON()); }
    if (Array.isArray(value)) {
      return '[' + value.map(function (entry) {
        const serialized = canonicalJson(entry);
        return serialized === undefined ? 'null' : serialized;
      }).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    const parts = [];
    keys.forEach(function (k) {
      const serialized = canonicalJson(value[k]);
      if (serialized !== undefined) { parts.push(JSON.stringify(k) + ':' + serialized); }
    });
    return '{' + parts.join(',') + '}';
  }

  // The brief is a compact, fully replayable record of the comparison:
  // every number in it can be recomputed from the engine alone.
  function buildBrief(shiftF, createdUtc) {
    const comparison = compareAll(shiftF);
    const brief = {
      format: 'flag-call-audit-v1',
      tool: 'Flag Call Audit Lab',
      engineVersion: E.VERSION,
      labVersion: VERSION,
      shiftF: comparison.shiftF,
      created: typeof createdUtc === 'string' ? createdUtc : 'undated local run',
      digestNote: 'sha256 is an unkeyed tamper-detection digest over the ' +
        'canonical JSON of this brief; it detects edits and does not ' +
        'prove authorship.',
      scenarios: comparison.scenarios.map(function (s) {
        return {
          id: s.id,
          name: s.name,
          templateId: s.templateId,
          blocks: s.blockCount,
          policies: s.rows.map(function (row) {
            return {
              policy: row.policyId,
              rawPoints: row.totals.rawPoints,
              max: row.totals.max,
              pct: round3(row.totals.rawPoints / row.totals.max),
              grade: row.totals.grade,
              exact: row.totals.exact,
              undercall: row.totals.undercall,
              critical: row.totals.critical,
              unsafe: row.totals.unsafeCount,
              worstGap: row.totals.worstUnderGap,
              worstExposureF: round3(row.totals.worstExposureF),
              overRestriction: row.totals.overRestriction,
              pointsDeltaVsBenchmark: row.pointsDelta
            };
          })
        };
      })
    };
    return brief;
  }

  function digestBrief(brief) {
    return SHA.sha256Hex(canonicalJson(brief));
  }

  function exportJson(brief) {
    return JSON.stringify({
      format: BRIEF_FORMAT_JSON,
      digestAlgorithm: 'SHA-256 (FIPS 180-4, unkeyed tamper-detection digest)',
      digest: digestBrief(brief),
      brief: brief
    }, null, 2) + '\n';
  }

  // Spreadsheet formula injection guard: a cell whose text opens with
  // =, +, -, @, a tab or a carriage return gets a leading apostrophe so
  // Excel, Sheets and friends keep it as text. Every cell is quoted.
  function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    const formula = /^[\t\r\n]/.test(s) || /^[\p{White_Space}\p{Cc}\p{Cf}\p{M}]*[=+\-@]/u.test(s);
    s = s.replace(/[\r\n]+/g, ' ');
    if (typeof value !== 'number' && formula) { s = "'" + s; }
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCsv(brief) {
    const head = ['format', 'shift_f', 'scenario', 'policy', 'raw_points', 'max',
      'pct', 'grade', 'exact', 'undercall', 'critical', 'unsafe',
      'worst_gap_flags', 'worst_exposure_f', 'over_restriction_flags',
      'points_delta_vs_benchmark'];
    const lines = [];
    lines.push('# ' + BRIEF_FORMAT_CSV);
    lines.push('# digest covers every line below the sha256 line, in order');
    lines.push(head.map(csvCell).join(','));
    brief.scenarios.forEach(function (s) {
      s.policies.forEach(function (p) {
        lines.push([brief.format, brief.shiftF, s.id, p.policy, p.rawPoints,
          p.max, p.pct, p.grade, p.exact, p.undercall, p.critical, p.unsafe,
          p.worstGap, p.worstExposureF, p.overRestriction,
          p.pointsDeltaVsBenchmark].map(csvCell).join(','));
      });
    });
    const body = lines.join('\n').replace(/[\r\n]+$/, '');
    return body + '\n# sha256: ' + SHA.sha256Hex(body) + '\n';
  }

  function exportMarkdown(brief) {
    const lines = [];
    lines.push('# Flag Call Audit Brief');
    lines.push('');
    lines.push('Format `' + brief.format + '`, engine `' + brief.engineVersion +
      '`, lab `' + brief.labVersion + '`, stress shift `' + brief.shiftF + ' F`, ' +
      brief.created + '.');
    lines.push('');
    lines.push('The digest is an unkeyed SHA-256 tamper-detection digest. ' +
      'It proves the content below was not edited after export; it is ' +
      'not a signature and does not prove authorship.');
    lines.push('');
    brief.scenarios.forEach(function (s) {
      lines.push('## ' + s.name + ' (`' + s.id + '`, ' + s.blocks + ' blocks, `' +
        s.templateId + '`)');
      lines.push('');
      lines.push('| Policy | Points | Max | Pct | Grade | Unsafe | Worst gap | Worst exposure F | Over restriction | Delta vs benchmark |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      s.policies.forEach(function (p) {
        lines.push('| ' + p.policy + ' | ' + p.rawPoints + ' | ' + p.max + ' | ' +
          p.pct + ' | ' + p.grade + ' | ' + p.unsafe + ' | ' + p.worstGap + ' | ' +
          p.worstExposureF + ' | ' + p.overRestriction + ' | ' +
          p.pointsDeltaVsBenchmark + ' |');
      });
      lines.push('');
    });
    const body = lines.join('\n').replace(/[\r\n]+$/, '');
    return body + '\nsha256: ' + SHA.sha256Hex(body) + '\n';
  }

  /*
   * Replay verification: rebuild every metric in the brief from the
   * engine and compare. Catches a brief that is internally consistent
   * but wrong, the case a digest alone cannot see.
   */
  function replayBrief(brief) {
    if (!brief || brief.format !== 'flag-call-audit-v1' || !Array.isArray(brief.scenarios)) {
      return { ok: false, detail: 'brief is not a flag-call-audit-v1 payload' };
    }
    if (clampShift(brief.shiftF) !== brief.shiftF) {
      return { ok: false, detail: 'brief stress shift is outside the export schema' };
    }
    if (brief.scenarios.length !== SCENARIOS.length) {
      return { ok: false, detail: 'brief does not cover every scenario exactly once' };
    }
    const mismatches = [];
    brief.scenarios.forEach(function (s, scenarioIndex) {
      const expectedScenario = SCENARIOS[scenarioIndex];
      if (!s || s.id !== expectedScenario.id) {
        mismatches.push('scenario order or coverage mismatch at position ' + scenarioIndex);
        return;
      }
      if (!Array.isArray(s.policies) || s.policies.length !== POLICIES.length) {
        mismatches.push(s.id + ' does not cover every policy exactly once');
        return;
      }
      const scenario = scenarioById(s.id);
      s.policies.forEach(function (p, policyIndex) {
        if (!p || p.policy !== POLICIES[policyIndex].id) {
          mismatches.push(s.id + ' policy order or coverage mismatch at position ' + policyIndex);
          return;
        }
        const evald = evaluateScenario(scenario, p.policy, brief.shiftF);
        const t = evald.totals;
        const checks = [
          ['rawPoints', t.rawPoints, p.rawPoints],
          ['max', t.max, p.max],
          ['pct', round3(t.rawPoints / t.max), p.pct],
          ['grade', t.grade, p.grade],
          ['exact', t.exact, p.exact],
          ['undercall', t.undercall, p.undercall],
          ['critical', t.critical, p.critical],
          ['unsafe', t.unsafeCount, p.unsafe],
          ['worstGap', t.worstUnderGap, p.worstGap],
          ['worstExposureF', round3(t.worstExposureF), p.worstExposureF],
          ['overRestriction', t.overRestriction, p.overRestriction],
          ['pointsDeltaVsBenchmark',
            t.rawPoints - evaluateScenario(scenario, 'band-exact', brief.shiftF).totals.rawPoints,
            p.pointsDeltaVsBenchmark]
        ];
        checks.forEach(function (c) {
          if (c[1] !== c[2]) {
            mismatches.push(s.id + '/' + p.policy + ' ' + c[0] +
              ': brief ' + c[2] + ' vs engine ' + c[1]);
          }
        });
      });
    });
    if (mismatches.length) {
      return { ok: false, detail: mismatches.length + ' replay mismatch(es)', mismatches: mismatches };
    }
    return { ok: true, detail: 'every number replays exactly from the engine' };
  }

  /*
   * Verify an export. JSON verifies the embedded digest over the
   * canonical brief and then replays the metrics through the engine.
   * Text exports verify the sha256 line over the content above it.
   */
  function verifyExport(text) {
    if (typeof text !== 'string' || text.trim() === '') {
      return { ok: false, mode: null, detail: 'nothing to verify' };
    }
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    if (parsed && parsed.format === BRIEF_FORMAT_JSON && parsed.brief && typeof parsed.digest === 'string') {
      const recomputed = digestBrief(parsed.brief);
      if (recomputed !== parsed.digest.toLowerCase()) {
        return { ok: false, mode: 'json', detail: 'digest mismatch: the brief was edited after export' };
      }
      const replay = replayBrief(parsed.brief);
      return {
        ok: replay.ok,
        mode: 'json',
        detail: replay.ok ? 'digest verified, ' + replay.detail : 'digest verified but ' + replay.detail,
        replay: replay
      };
    }
    const match = text.match(/^#?\s*sha256:\s*([0-9a-fA-F]{64})\s*$/m);
    if (!match) {
      return { ok: false, mode: null, detail: 'no recognizable audit digest found' };
    }
    const after = text.slice(match.index + match[0].length);
    if (after.trim() !== '') {
      return { ok: false, mode: 'text', detail: 'unexpected content follows the audit digest' };
    }
    const before = text.slice(0, match.index).replace(/[\r\n]+$/, '');
    const recomputed = SHA.sha256Hex(before.replace(/\r\n/g, '\n'));
    if (recomputed === match[1].toLowerCase()) {
      return { ok: true, mode: 'text', detail: 'digest verified: the export is untouched' };
    }
    return { ok: false, mode: 'text', detail: 'digest mismatch: the export was edited after export' };
  }

  /* ---------- bookmark codec ---------- */

  /*
   * Strict hash form: #fc=v1.s<0-4>.p<0-4>.t<signed int -20..20>.
   * Anything else returns null and the page keeps its defaults.
   */
  function encodeBookmark(sel) {
    const src = sel || {};
    const num = function (v) {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? n : 0;
    };
    const s = E.clamp(num(src.s), 0, SCENARIOS.length - 1);
    const p = E.clamp(num(src.p), 0, POLICIES.length - 1);
    const t = clampShift(src.t);
    return BOOKMARK_PREFIX + 'v1.s' + s + '.p' + p + '.t' + t;
  }

  function decodeBookmark(hash) {
    if (typeof hash !== 'string' || hash.indexOf(BOOKMARK_PREFIX) !== 0) { return null; }
    const body = hash.slice(BOOKMARK_PREFIX.length);
    const m = body.match(/^v1\.s([0-9])\.p([0-9])\.t([+-]?\d{1,2})$/);
    if (!m) { return null; }
    const s = Number(m[1]);
    const p = Number(m[2]);
    const t = Number(m[3]);
    if (s >= SCENARIOS.length || p >= POLICIES.length || t < SHIFT_MIN_F || t > SHIFT_MAX_F) {
      return null;
    }
    return { s: s, p: p, t: t };
  }

  /* ---------- in-page self tests ---------- */

  /*
   * A compact proving panel run live in the browser: domain
   * conservation, axis monotonicity, band boundaries, scoring
   * direction, CSV injection armor, tamper detection, and the FIPS
   * 180-4 SHA-256 known answer vectors.
   */
  function selfTests() {
    const out = [];
    function check(name, pass, detail) {
      out.push({ name: name, pass: !!pass, detail: detail || '' });
    }

    check('SHA-256 empty message matches FIPS 180-4',
      SHA.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    check('SHA-256 "abc" matches FIPS 180-4',
      SHA.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    check('SHA-256 56 byte vector matches FIPS 180-4',
      SHA.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq') ===
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    check('SHA-256 64 byte vector matches FIPS 180-4',
      SHA.sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu') ===
        'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
    check('SHA-256 one million a vector matches FIPS 180-4',
      SHA.sha256Hex('a'.repeat(1000000)) === 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');

    let conserved = true;
    SCENARIOS.forEach(function (s) {
      const recs = recommendedSeries(s, 0);
      recs.forEach(function (r) {
        const lo = Math.min(r.inputs.tempF, E.cToF(E.fToC(r.inputs.tempF)), r.wbgtF);
        const comps = E.wbgtFromInputs(r.inputs);
        const lowF = Math.min(comps.wetBulbF, comps.globeF, comps.dryF);
        const highF = Math.max(comps.wetBulbF, comps.globeF, comps.dryF);
        if (r.wbgtF < lowF - 1e-6 || r.wbgtF > highF + 1e-6) { conserved = false; }
        if (lo !== lo) { conserved = false; }
      });
    });
    check('WBGT stays inside its physical component bounds on every scenario block', conserved);

    let monoH = true;
    let monoS = true;
    let monoW = true;
    SCENARIOS.forEach(function (s) {
      const b = scenarioBase(s, 0, 0);
      let prev = -Infinity;
      for (let h = 5; h <= 99; h += 4) {
        const v = E.wbgtFromInputs({ tempF: b.tempF, humidityPct: h, solarWm2: b.solarWm2, windMph: b.windMph }).wbgtF;
        if (v < prev - 1e-9) { monoH = false; }
        prev = v;
      }
      prev = -Infinity;
      for (let sol = 0; sol <= 1200; sol += 60) {
        const v = E.wbgtFromInputs({ tempF: b.tempF, humidityPct: b.humidityPct, solarWm2: sol, windMph: b.windMph }).wbgtF;
        if (v < prev - 1e-9) { monoS = false; }
        prev = v;
      }
      prev = Infinity;
      for (let w = 0; w <= 25; w += 1) {
        const v = E.wbgtFromInputs({ tempF: b.tempF, humidityPct: b.humidityPct, solarWm2: b.solarWm2, windMph: w }).wbgtF;
        if (v > prev + 1e-9) { monoW = false; }
        prev = v;
      }
    });
    check('WBGT never falls as humidity rises on every scenario', monoH);
    check('WBGT never falls as radiant heat rises on every scenario', monoS);
    check('WBGT never rises as wind rises on every scenario', monoW);

    check('escalation thresholds land exactly at 82, 85, 88 and 90 F',
      E.tierIndexFromF(82) === 1 && E.tierIndexFromF(85) === 2 &&
      E.tierIndexFromF(88) === 3 && E.tierIndexFromF(90) === 4 &&
      E.tierIndexFromF(81.94) === 0 && E.tierIndexFromF(89.94) === 3);

    let unsafeDirection = true;
    for (let rec = 0; rec <= 4; rec += 1) {
      for (let chosen = 0; chosen <= 4; chosen += 1) {
        const s = E.scoreCall(chosen, rec);
        if (s.unsafe !== (chosen < rec)) { unsafeDirection = false; }
      }
    }
    check('a call is unsafe exactly when it undercalls the recommendation, all 25 pairs', unsafeDirection);

    let benchPerfect = true;
    SCENARIOS.forEach(function (s) {
      const ev = evaluateScenario(s, 'band-exact', 0);
      if (ev.totals.rawPoints !== ev.totals.max || ev.totals.unsafeCount !== 0) { benchPerfect = false; }
    });
    check('Band Exact scores a perfect safe day on all five scenarios', benchPerfect);

    const det1 = JSON.stringify(evaluateScenario('gulf-surge', 'stale-read', 0));
    const det2 = JSON.stringify(evaluateScenario('gulf-surge', 'stale-read', 0));
    check('scenario evaluation is deterministic', det1 === det2);

    check('CSV export neutralizes formula injection cells',
      csvCell('=2+3') === '"\'=2+3"' && csvCell('@cmd') === '"\'@cmd"' &&
      csvCell('-10') === '"\'-10"' && csvCell('+4') === '"\'+4"');
    check('CSV export escapes embedded quotes and strips line breaks',
      csvCell('say "hi"') === '"say ""hi"""' && csvCell('a\nb') === '"a b"');

    const brief = buildBrief(0, 'self-test');
    const verifyOk = verifyExport(exportJson(brief));
    check('a fresh JSON export verifies clean', verifyOk.ok === true);
    const tamperedText = exportJson(brief).replace('"rawPoints": 400', '"rawPoints": 401');
    check('a one digit edit to the JSON export is caught',
      verifyExport(tamperedText).ok === false);
    const csv = exportCsv(brief);
    const csvTampered = csv.replace('"400"', '"401"');
    check('a one digit edit to the CSV export is caught',
      verifyExport(csv).ok === true && verifyExport(csvTampered).ok === false);
    const replayBad = JSON.parse(exportJson(brief));
    replayBad.brief.scenarios[0].policies[1].rawPoints = 999;
    replayBad.digest = digestBrief(replayBad.brief);
    const replayCheck = verifyExport(JSON.stringify(replayBad));
    check('a self consistent but wrong brief fails replay verification', replayCheck.ok === false);

    check('bookmark round trip holds', (function () {
      const enc = encodeBookmark({ s: 3, p: 4, t: -7 });
      const dec = decodeBookmark(enc);
      return dec && dec.s === 3 && dec.p === 4 && dec.t === -7;
    })());
    check('malformed bookmarks are rejected',
      decodeBookmark('#fc=v2.s0.p0.t0') === null &&
      decodeBookmark('#fc=v1.s9.p0.t0') === null &&
      decodeBookmark('#fc=v1.s0.p0.t99') === null &&
      decodeBookmark('garbage') === null &&
      decodeBookmark('#fc=v1.s0.p0.t0.extra') === null);

    let counterfactual = true;
    compareAll(0).scenarios.forEach(function (s) {
      s.rows.forEach(function (row) {
        if (row.pointsDelta > 0) { counterfactual = false; }
      });
    });
    check('no policy beats the benchmark: every counterfactual delta is at or below zero', counterfactual);

    const passed = out.filter(function (t) { return t.pass; }).length;
    return { tests: out, passed: passed, total: out.length, ok: passed === out.length };
  }

  return {
    VERSION: VERSION,
    SCENARIOS: SCENARIOS,
    POLICIES: POLICIES,
    BAND_FLOOR_F: BAND_FLOOR_F,
    BAND_CEILING_F: BAND_CEILING_F,
    SHIFT_MIN_F: SHIFT_MIN_F,
    SHIFT_MAX_F: SHIFT_MAX_F,
    BRIEF_FORMAT_JSON: BRIEF_FORMAT_JSON,
    scenarioById: scenarioById,
    policyById: policyById,
    templateFor: templateFor,
    clampShift: clampShift,
    scenarioBase: scenarioBase,
    blockInputs: blockInputs,
    predawnTier: predawnTier,
    evaluateScenario: evaluateScenario,
    recommendedSeries: recommendedSeries,
    compareAll: compareAll,
    canonicalJson: canonicalJson,
    buildBrief: buildBrief,
    digestBrief: digestBrief,
    exportJson: exportJson,
    exportCsv: exportCsv,
    exportMarkdown: exportMarkdown,
    csvCell: csvCell,
    replayBrief: replayBrief,
    verifyExport: verifyExport,
    encodeBookmark: encodeBookmark,
    decodeBookmark: decodeBookmark,
    selfTests: selfTests
  };
})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = FlagCallLab;
}

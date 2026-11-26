'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const L = require('../js/lab.js');

function signedExport(brief) {
  return JSON.stringify({
    format: L.BRIEF_FORMAT_JSON,
    digestAlgorithm: 'SHA-256 test wrapper',
    digest: L.digestBrief(brief),
    brief: brief
  });
}

test('null and blank weather fields fail toward the protective Danger reading', () => {
  const nullInputs = { tempF: null, humidityPct: null, solarWm2: null, windMph: null };
  const blankInputs = { tempF: '', humidityPct: '', solarWm2: '', windMph: '' };
  assert.equal(E.tierForInputs(nullInputs), 4);
  assert.equal(E.tierForInputs(blankInputs), 4);
  assert.equal(E.tierForInputs({ tempF: false, humidityPct: false, solarWm2: false, windMph: false }), 4);
});

test('null blank and boolean calls never masquerade as exact flags', () => {
  for (const bad of [null, '', false]) {
    assert.deepEqual(E.scoreCall(bad, 0), { points: 0, quality: 'critical', unsafe: true });
  }
  assert.deepEqual(E.scoreCall('0', 0), { points: 100, quality: 'exact', unsafe: false });
});

test('canonicalJson follows JSON undefined and non finite number rules', () => {
  assert.equal(L.canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(L.canonicalJson([undefined, NaN, Infinity, -Infinity]), '[null,null,null,null]');
  assert.equal(L.canonicalJson({ nested: { gone: undefined, kept: 2 } }), '{"nested":{"kept":2}}');
});

test('csvCell neutralizes whitespace prefixed spreadsheet formulas', () => {
  for (const input of [' =cmd', '\t=cmd', '\n=cmd', '  +2+3', ' -10', ' @lookup']) {
    const cell = L.csvCell(input);
    assert.equal(cell[1], "'", `cell for ${JSON.stringify(input)} must open as text`);
  }
});

test('text audit verification rejects unauthenticated content after the digest', () => {
  const brief = L.buildBrief(0, 'regression-test');
  for (const exporter of [L.exportCsv, L.exportMarkdown]) {
    const clean = exporter(brief);
    assert.equal(L.verifyExport(clean).ok, true, 'clean export must still verify');
    assert.equal(L.verifyExport(clean + 'unauthenticated trailing row\n').ok, false);
  }
});

test('replay verification rejects incomplete scenario coverage', () => {
  const brief = L.buildBrief(0, 'regression-test');
  const stripped = Object.assign({}, brief, { scenarios: brief.scenarios.slice(0, 1) });
  assert.equal(L.verifyExport(signedExport(stripped)).ok, false);
});

test('replay verification rejects malformed payloads without throwing', () => {
  const brief = L.buildBrief(0, 'regression-test');
  const malformed = Object.assign({}, brief, { scenarios: [{ id: 'gulf-surge' }] });
  let result = null;
  assert.doesNotThrow(() => { result = L.verifyExport(signedExport(malformed)); });
  assert.equal(result.ok, false);
});

test('replay verification rejects fractional stress shifts outside the export schema', () => {
  const brief = L.buildBrief(6, 'regression-test');
  const shifted = Object.assign({}, brief, { shiftF: 5.7 });
  assert.equal(L.verifyExport(signedExport(shifted)).ok, false);
});

test('replay verification checks every published quality count', () => {
  const brief = L.buildBrief(0, 'regression-test');
  const edited = JSON.parse(JSON.stringify(brief));
  const row = edited.scenarios[0].policies.find((p) => p.undercall > 0 || p.critical > 0) || edited.scenarios[0].policies[1];
  if (row.undercall > 0) {
    row.undercall -= 1;
    row.critical += 1;
  } else {
    row.critical -= 1;
    row.undercall += 1;
  }
  assert.equal(L.verifyExport(signedExport(edited)).ok, false);
});

test('csvCell neutralizes invisible Unicode formula prefixes and preserves numeric negative shifts', () => {
  for (const input of ['\u200b=1+1', '\u00a0+2', ' =3', '\u061c@sum', '\tx']) {
    const escaped = L.csvCell(input);
    assert.equal(escaped.charAt(1), "'", input);
  }
  assert.equal(L.csvCell(-20), '"-20"');
});

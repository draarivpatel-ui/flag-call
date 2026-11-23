'use strict';

/*
 * Node side wiring smoke test for the Flag Call Audit Lab panel.
 * Loads js/lab.js and js/lab-ui.js with a minimal DOM stub and clicks
 * through the lab flows: scenario select, stress shift, charts, the
 * comparison table, all three exports, verification, the bookmark
 * button, hash restore, and the self test panel. Not part of npm test;
 * run it with `node scripts/lab-smoke.js`. It is a wiring check, not a
 * browser.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.join(__dirname, '..');
const engine = require(path.join(root, 'js/engine.js'));
const sha256 = require(path.join(root, 'js/sha256.js'));
const lab = require(path.join(root, 'js/lab.js'));
const uiSource = fs.readFileSync(path.join(root, 'js/lab-ui.js'), 'utf8');

function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    listeners: {},
    attrs: {},
    dataset: {},
    className: '',
    id: '',
    value: '',
    name: '',
    textContent: '',
    disabled: false,
    hidden: false,
    parent: null,
    _html: '',
    focus: function () { el.focused = true; },
    scrollIntoView: function () {},
    appendChild: function (child) { el.children.push(child); child.parent = el; return child; },
    removeChild: function (child) {
      const i = el.children.indexOf(child);
      if (i >= 0) { el.children.splice(i, 1); }
      return child;
    },
    setAttribute: function (k, v) {
      el.attrs[k] = String(v);
      if (k === 'id') { el.id = String(v); }
      if (k === 'class') { el.className = String(v); }
    },
    getAttribute: function (k) { return el.attrs[k]; },
    addEventListener: function (type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    dispatch: function (type, ev) { (el.listeners[type] || []).forEach(function (fn) { fn(ev); }); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return el._html; },
    set: function (v) { el._html = String(v); el.children = []; }
  });
  return el;
}

const LAB_IDS = ['lab-scenario', 'lab-shift', 'lab-shift-out', 'lab-bookmark', 'lab-blurb',
  'lab-hash-out', 'lab-chart', 'lab-table', 'lab-bars', 'lab-export-json', 'lab-export-csv',
  'lab-export-md', 'lab-verify-text', 'lab-verify-btn', 'lab-verify-out',
  'lab-selftest-btn', 'lab-selftest-summary', 'lab-selftest-out'];

let checks = 0;
function ok(cond, msg) { checks += 1; assert.ok(cond, msg); }

function runPass(hash, label) {
  const registry = {};
  LAB_IDS.forEach(function (id) { registry[id] = makeEl(id === 'lab-verify-text' ? 'textarea' : 'div'); });
  const documentStub = {
    body: makeEl('body'),
    getElementById: function (id) {
      if (!registry[id]) { registry[id] = makeEl('div'); }
      return registry[id];
    },
    createElement: function (tag) { return makeEl(tag); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  const replaced = [];
  const windowStub = {
    location: { hash: hash, href: 'file:///flag-call/index.html' + hash },
    history: { replaceState: function (a, b, url) { replaced.push(url); } }
  };

  const run = new Function('window', 'document', 'location', 'history',
    'FlagCallEngine', 'FlagCallSHA256', 'FlagCallLab', uiSource);
  // lab-ui.js reads the bare globals location/history, so bind them as
  // the argument names the IIFE scope will pick up.
  run(windowStub, documentStub, windowStub.location, windowStub.history, engine, sha256, lab);

  const byId = function (id) { return registry[id]; };
  return { registry: registry, byId: byId, replaced: replaced, document: documentStub };
}

/* ---------- pass one: default state, full click-through ---------- */

const p1 = runPass('', 'default');
const byId = p1.byId;

ok(byId('lab-scenario').children.length === 5, 'five heat day scenarios loaded into the select');
ok(byId('lab-chart').innerHTML.indexOf('<svg') === 0, 'the stress chart renders an SVG');
ok(byId('lab-chart').innerHTML.indexOf('82+ Watch') !== -1, 'the chart draws the Watch boundary');
ok(byId('lab-chart').innerHTML.indexOf('90+ Danger') !== -1, 'the chart draws the Danger boundary');
ok(byId('lab-chart').innerHTML.indexOf('baseline day') !== -1, 'at zero shift the chart is a single baseline');
ok(byId('lab-table').innerHTML.indexOf('Band Exact') !== -1, 'the table lists the benchmark policy');
ok(byId('lab-table').innerHTML.indexOf('benchmark') !== -1, 'the table marks the benchmark row');
ok(byId('lab-bars').innerHTML.indexOf('unsafe') !== -1, 'the bar chart flags unsafe policy counts');
ok(byId('lab-blurb').textContent.length > 40, 'the scenario blurb is populated');
ok(/Gulf moisture/.test(byId('lab-blurb').textContent), 'the default scenario is Gulf Surge');

byId('lab-shift').value = '10';
byId('lab-shift').dispatch('input', { target: byId('lab-shift') });
ok(byId('lab-shift-out').textContent === '+10 F', 'the shift output tracks the slider');
ok(byId('lab-chart').innerHTML.indexOf('+10 F') !== -1, 'the chart legend shows the stressed day');
ok(byId('lab-chart').innerHTML.indexOf('stroke-dasharray') !== -1, 'a dashed baseline appears under stress');
ok(byId('lab-table').innerHTML.indexOf('+10') !== -1, 'the table caption shows the stress shift');

byId('lab-scenario').children[2].value = '2';
byId('lab-scenario').value = '2';
byId('lab-scenario').dispatch('change', { target: byId('lab-scenario') });
ok(/cold front/.test(byId('lab-blurb').textContent), 'switching to Blue Front swaps the blurb');

byId('lab-export-json').dispatch('click', {});
ok(byId('lab-verify-text').value.indexOf('flag-call-audit-json-v1') !== -1,
  'the JSON export lands in the verify box');
ok(byId('lab-verify-text').value.indexOf('"digest"') !== -1, 'the JSON export carries a digest');

byId('lab-verify-btn').dispatch('click', {});
ok(/^Verified\./.test(byId('lab-verify-out').textContent), 'a fresh export verifies clean');
ok(byId('lab-verify-out').className === 'lab-status-ok', 'the verify status renders green');

byId('lab-verify-text').value = byId('lab-verify-text').value.replace('"rawPoints": 400', '"rawPoints": 401');
byId('lab-verify-btn').dispatch('click', {});
ok(/^Failed\./.test(byId('lab-verify-out').textContent), 'a one digit edit fails verification');
ok(byId('lab-verify-out').className === 'lab-status-bad', 'the verify status renders red on tamper');

byId('lab-export-csv').dispatch('click', {});
ok(byId('lab-verify-text').value.indexOf('# sha256: ') !== -1, 'the CSV export lands with a digest line');
byId('lab-verify-btn').dispatch('click', {});
ok(/^Verified\./.test(byId('lab-verify-out').textContent), 'the CSV export verifies clean');

byId('lab-selftest-btn').dispatch('click', {});
ok(/of \d+ self tests pass/.test(byId('lab-selftest-summary').textContent),
  'the self test summary reports a count: ' + byId('lab-selftest-summary').textContent);
ok(byId('lab-selftest-summary').className === 'lab-status-ok', 'self tests pass clean');
ok(byId('lab-selftest-out').innerHTML.indexOf('st-fail') === -1, 'no self test renders a failure');
ok(byId('lab-selftest-out').innerHTML.indexOf('SHA-256') !== -1, 'the self test list includes the KATs');

byId('lab-bookmark').dispatch('click', {});
ok(byId('lab-hash-out').hidden === false, 'the bookmark output unhides');
ok(byId('lab-hash-out').textContent.indexOf('#fc=v1.') !== -1, 'the bookmark shows a strict hash');
ok(p1.replaced.length === 1 && p1.replaced[0] === '#fc=v1.s2.p0.t10',
  'the address bar hash updated to the current state: ' + p1.replaced[0]);

/* ---------- pass two: restore state from a bookmark hash ---------- */

const p2 = runPass('#fc=v1.s3.p2.t-6', 'restored');
ok(p2.byId('lab-scenario').value === '3', 'the select restores the bookmarked scenario');
ok(p2.byId('lab-shift-out').textContent === '-6 F', 'the shift output restores the bookmarked stress');
ok(/saturated coastal/.test(p2.byId('lab-blurb').textContent), 'the blurb matches the bookmarked scenario');
ok(p2.byId('lab-chart').innerHTML.indexOf('-6 F') !== -1, 'the chart draws the cooled day');

const p3 = runPass('#fc=garbage-nonsense', 'malformed');
ok(p3.byId('lab-scenario').value === '0', 'a malformed hash falls back to the default scenario');
ok(p3.byId('lab-shift-out').textContent === '0 F', 'a malformed hash keeps zero shift');

console.log('lab smoke: ' + checks + ' checks passed across scenarios, stress, charts, exports, ' +
  'verification, bookmarking, hash restore, and self tests');

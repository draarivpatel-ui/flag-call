'use strict';

/*
 * Node side wiring smoke test for the Flag Call page.
 * Loads the inline app script with a minimal DOM stub and clicks through the
 * main flows: presets, sliders, flag calls, the report card, both judge
 * dialogs, and the full Day 1 walkthrough. This is not part of npm test; run
 * it with `node scripts/dom-smoke.js`. It is a wiring check, not a browser.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = require(path.join(root, 'js/engine.js'));

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
    parent: null,
    _html: '',
    focus: function () { el.focused = true; },
    scrollIntoView: function () {},
    showModal: function () { el.modalOpen = true; },
    appendChild: function (child) { el.children.push(child); child.parent = el; return child; },
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

const registry = {};
const staticIds = ['main', 'preset-grid', 'temp-input', 'temp-out', 'humidity-input', 'humidity-out',
  'solar-input', 'solar-out', 'wind-input', 'wind-out', 'wbgt-number', 'tier-chip', 'tier-name',
  'fact-wet', 'fact-globe', 'fact-dry', 'run-wbgt', 'run-tier', 'run-dot', 'run-score',
  'run-unsafe', 'run-safe', 'schedule-list', 'template-select', 'reset-day', 'report-body',
  'judge-dialog', 'judge-dialog-title', 'judge-dialog-body', 'btn-unsafe', 'btn-safe',
  'mode-walk', 'mode-free', 'start-walk', 'start-free', 'coach-step', 'coach-step-title',
  'coach-step-body', 'coach-back', 'coach-next', 'coach-dots', 'flag-scale', 'judge-close'];
staticIds.forEach(function (id) { registry[id] = makeEl('div'); });

const documentStub = {
  getElementById: function (id) {
    if (!registry[id]) { registry[id] = makeEl('div'); }
    return registry[id];
  },
  createElement: function (tag) { return makeEl(tag); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};

global.FlagCallEngine = engine;
global.document = documentStub;
global.window = { matchMedia: function () { return { matches: true }; } };

const scripts = [];
const scriptMatches = html.matchAll(/<script>([\s\S]*?)<\/script>/g);
for (const m of scriptMatches) { scripts.push(m[1]); }
assert.strictEqual(scripts.length, 1, 'the page carries exactly one inline script');

const run = new Function('window', 'document', 'FlagCallEngine', scripts[0]);
run(global.window, global.document, engine);

const byId = function (id) { return registry[id]; };
let checks = 0;
function ok(cond, msg) { checks += 1; assert.ok(cond, msg); }

ok(byId('preset-grid').children.length === 8, 'eight city preset buttons rendered');
ok(byId('flag-scale').children.length === 5, 'five flag bands rendered');
ok(byId('schedule-list').children.length === 4, 'the default practice card renders four blocks');
ok(byId('template-select').children.length === 8, 'eight schedule options loaded');
ok(/95\.5/.test(byId('wbgt-number').textContent), 'the Houston readout shows about 95.5 F WBGT');
ok(byId('tier-name').textContent === 'Danger', 'Houston opens in the Danger tier');

byId('preset-grid').children[1].dispatch('click', {});
ok(/90\.8/.test(byId('wbgt-number').textContent), 'selecting Phoenix moves the readout to about 90.8 F');
ok(byId('tier-name').textContent === 'Danger', 'Phoenix also reads Danger');

byId('temp-input').value = '70';
byId('temp-input').dispatch('input', { target: byId('temp-input') });
const cooled = parseFloat(byId('wbgt-number').textContent);
ok(cooled > 40 && cooled < 82, 'dropping the air temperature to 70 F pulls the Phoenix readout under the watch band (got ' + cooled + ' F)');

byId('preset-grid').children[0].dispatch('click', {});
byId('template-select').children.forEach(function (opt, i) { opt.value = String(i); });
byId('template-select').value = '4';
byId('template-select').dispatch('change', { target: byId('template-select') });
ok(byId('schedule-list').children.length === 2, 'the soccer doubleheader card has two blocks');

for (let block = 0; block < 2; block += 1) {
  const input = makeEl('input');
  input.name = 'call-' + block;
  input.value = '0';
  byId('schedule-list').dispatch('change', { target: input });
}
ok(byId('report-body').innerHTML.indexOf('<table') !== -1, 'calling every block renders the report table');
ok(byId('report-body').innerHTML.indexOf('Grade') !== -1, 'the report carries a labelled grade');

byId('reset-day').dispatch('click', {});
ok(byId('report-body').innerHTML.indexOf('blocks called') !== -1, 'reset returns the report to a progress state');

byId('btn-unsafe').dispatch('click', {});
ok(byId('judge-dialog').modalOpen === true, 'the unsafe plan opens the dialog');
ok(byId('judge-dialog-body').innerHTML.indexOf('What goes wrong') !== -1, 'the unsafe plan lists violations');
ok(byId('judge-dialog-title').textContent === 'See an Unsafe Plan', 'the unsafe dialog keeps the spec shortcut name');

byId('btn-safe').dispatch('click', {});
ok(byId('judge-dialog-title').textContent === 'Show the Safe Call', 'the safe dialog keeps the spec shortcut name');
ok(byId('judge-dialog-body').innerHTML.indexOf('recommended flags') !== -1, 'the safe call lists recommended flags');

byId('mode-walk').dispatch('click', {});
ok(byId('coach-step').textContent === 'Step 1 of 9', 'walkthrough mode starts at step 1 of 9');
for (let s = 0; s < 8; s += 1) { byId('coach-next').dispatch('click', {}); }
ok(byId('coach-step').textContent === 'Step 9 of 9', 'the walkthrough advances to the last step');
ok(byId('coach-next').textContent === 'Enter Free Play', 'the last step offers the exit to free play');
byId('coach-next').dispatch('click', {});
ok(byId('mode-free').getAttribute('aria-pressed') === 'true', 'finishing the walkthrough returns to free play');

byId('mode-walk').dispatch('click', {});
ok(byId('mode-walk').getAttribute('aria-pressed') === 'true', 'the walkthrough mode switch toggles aria pressed');
byId('mode-free').dispatch('click', {});
ok(byId('mode-free').getAttribute('aria-pressed') === 'true', 'the free play mode switch toggles aria pressed');

console.log('dom smoke: ' + checks + ' checks passed across presets, sliders, calls, report, dialogs, and walkthrough');

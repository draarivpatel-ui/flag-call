'use strict';

/*
 * Accessibility checkpoint suite for Flag Call.
 * Static analysis over index.html and styles.css in the spirit of an axe
 * run without a browser: landmarks, labels, heading order, focus styles,
 * computed contrast on tokens, and copy hygiene. Exactly 34 content
 * assertions, locked by a self audit at the end.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let count = 0;
function ok(cond, msg) { count += 1; assert.ok(cond, msg); }

function relum(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = function (c) {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const hi = Math.max(relum(fg), relum(bg));
  const lo = Math.min(relum(fg), relum(bg));
  return (hi + 0.05) / (lo + 0.05);
}

function token(name) {
  const match = css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  return match ? match[1] : null;
}

test('document head and landmarks', () => {
  ok(/<html[^>]*\slang="en"/.test(html), 'the html element declares lang en');
  ok(/<title>[^<]*Flag Call[^<]*<\/title>/.test(html), 'the title names the game');
  ok(/<meta[^>]*name="viewport"[^>]*content="[^"]*width=device-width[^"]*"/.test(html), 'the viewport meta enables a true mobile layout');
  ok(/<meta[^>]*name="description"[^>]*content="[^"]{20,}"/.test(html), 'a real meta description ships');
  ok((html.match(/<main[\s>]/g) || []).length === 1, 'exactly one main landmark exists');
  ok(/<header[\s>]/.test(html), 'a header landmark exists');
  ok(/<footer[\s>]/.test(html), 'a footer landmark exists');
});

test('headings, skip link, and navigation', () => {
  const headingLevels = (html.match(/<h([1-6])[\s>]/g) || []).map(function (tag) {
    return Number(tag.replace(/\D/g, ''));
  });
  ok((html.match(/<h1[\s>]/g) || []).length === 1, 'exactly one h1 exists');
  let skips = 0;
  for (let i = 1; i < headingLevels.length; i += 1) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) { skips += 1; }
  }
  ok(skips === 0, 'heading levels never skip down the page');
  ok(/class="skip-link"/.test(html) && /href="#main"/.test(html) && /id="main"/.test(html),
    'a skip link points at the real main landmark');
  ok(/<nav[^>]*aria-label="[^"]+"/.test(html), 'the nav carries an aria label');
});

test('labels and programmatic associations', () => {
  const forIds = (html.match(/<label[^>]*\sfor="([^"]+)"/g) || []).map(function (attr) {
    return attr.match(/for="([^"]+)"/)[1];
  });
  const allIds = new Set((html.match(/\sid="([^"]+)"/g) || []).map(function (m) {
    return m.match(/\sid="([^"]+)"/)[1];
  }));
  ok(forIds.every(function (id) { return allIds.has(id); }), 'every label for points at a real id');
  const inputIds = (html.match(/<(?:input|select)[^>]*\sid="([^"]+)"/g) || []).map(function (m) {
    return m.match(/\sid="([^"]+)"/)[1];
  });
  ok(inputIds.length >= 5 && inputIds.every(function (id) { return forIds.indexOf(id) !== -1; }),
    'every form control carries a label association');
  ok((html.match(/\saria-label="/g) || []).length >= 10, 'rich aria labeling appears ten or more times');
  ok((html.match(/\saria-describedby="/g) || []).length >= 4, 'the four weather inputs carry describedby hints');
  const idList = (html.match(/\sid="([^"]+)"/g) || []).map(function (m) { return m.match(/\sid="([^"]+)"/)[1]; });
  ok(new Set(idList).size === idList.length, 'no duplicate ids exist');
  ok(/aria-live="(polite|assertive)"/.test(html), 'an aria live region announces readouts');
  ok(/<fieldset[\s>]/.test(html) && /<legend[\s>]/.test(html), 'flag groups use fieldset and legend');
});

test('controls, dialog, and keyboard access', () => {
  const buttons = html.match(/<button([^>]*)>([\s\S]*?)<\/button>/g) || [];
  ok(buttons.length >= 12 && buttons.every(function (btn) {
    const attrs = btn.match(/<button([^>]*)>/)[1];
    const text = btn.replace(/<[^>]+>/g, '').trim();
    return text.length > 0 || /aria-label="/.test(attrs);
  }), 'every one of the twelve plus real buttons has accessible text');
  ok(/<dialog[^>]*aria-labelledby="[^"]+"/.test(html), 'the judge dialog is labelled');
  ok(!/tabindex="[1-9]/.test(html), 'no positive tabindex values break tab order');
  ok(!/\sonclick="/.test(html), 'no inline onclick handlers, all wiring is addEventListener');
  ok(/:focus-visible/.test(css), 'a visible focus style exists for keyboard users');
  ok(/@media[^{]*prefers-reduced-motion/.test(css), 'motion respects the reduced motion preference');
});

test('color tokens and contrast', () => {
  const tokens = css.match(/--[a-z0-9-]+:\s*#[0-9a-fA-F]{6}/g) || [];
  ok(tokens.length >= 12, 'twelve or more color tokens are defined as custom properties');
  const afterRoot = css.slice(css.indexOf('}') + 1);
  ok(!/[^-]color:\s*#[0-9a-fA-F]{3,6}/.test(afterRoot), 'text colors reference tokens instead of raw hex');
  const pairs = [
    ['ink', 'bg'], ['ink', 'panel'], ['ink-muted', 'panel'], ['accent', 'panel']
  ];
  let checked = 0;
  for (const pair of pairs) {
    const fg = token(pair[0]);
    const bg = token(pair[1]);
    if (fg && bg) {
      checked += 1;
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, 'contrast of ' + pair[0] + ' on ' + pair[1] + ' is ' + ratio.toFixed(2) + ', needs 4.5');
      count += 1;
    }
  }
  ok(checked === 4, 'all four contrast pairs resolved from real tokens');
});

test('copy hygiene and mobile affordances', () => {
  ok(!/[\u2014\u2013]/.test(html) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u.test(html) &&
    !/text-transform:\s*uppercase/.test(css),
    'no dashes, no emoji, and no uppercase transform fake kickers anywhere');
  ok(/min-height:\s*44px/.test(css) && /max-width:\s*760px/.test(css) && /\.run-bar/.test(css),
    'the mobile layout ships a 44 pixel touch floor and the run bar breakpoint');
  ok(!/https?:\/\//.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'the page makes no network requests');
});

test('self audit: accessibility assertion count is exact', () => {
  assert.strictEqual(count, 34, 'the accessibility suite must hold exactly 34 content assertions');
});

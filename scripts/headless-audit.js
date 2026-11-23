'use strict';

/*
 * Real headless Chromium audit for Flag Call.
 *
 * Launches a real Chromium (Playwright's headless shell if present,
 * Google Chrome otherwise) with a debugging port, drives it over the
 * DevTools protocol using Node's built in WebSocket (no dependencies),
 * and audits index.html at two viewports: 1440x900 desktop and 390x844
 * mobile. For each viewport it counts console errors, uncaught page
 * errors, external network requests, and horizontal overflow, and it
 * runs the in page self test suite inside the real browser.
 *
 * Process hygiene: the WebSocket and the browser are closed in a
 * finally block no matter what fails. Run via npm run test:audit.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = process.env.FC_PAGE || ('file://' + path.join(ROOT, 'index.html'));

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  path.join(os.homedir(), 'Library/Caches/ms-playwright',
    'chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) { return p; }
  }
  return null;
}

function waitForFile(file, ms) {
  const deadline = Date.now() + ms;
  return new Promise(function (resolve, reject) {
    const tick = function () {
      if (fs.existsSync(file) && fs.statSync(file).size > 0) { return resolve(true); }
      if (Date.now() > deadline) { return reject(new Error('timed out waiting for ' + file)); }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function httpJson(url) {
  return new Promise(function (resolve, reject) {
    fetch(url).then(function (r) { return r.json(); }).then(resolve, reject);
  });
}

// Minimal DevTools protocol client over the built in WebSocket.
function cdpConnect(wsUrl) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const events = [];
    let nextId = 1;
    const listeners = [];
    ws.onopen = function () {
      resolve({
        send: function (method, params, sessionId) {
          const id = nextId;
          nextId += 1;
          const msg = { id: id, method: method, params: params || {} };
          if (sessionId) { msg.sessionId = sessionId; }
          return new Promise(function (res, rej) {
            pending.set(id, { res: res, rej: rej });
            ws.send(JSON.stringify(msg));
          });
        },
        onEvent: function (fn) { listeners.push(fn); },
        events: events,
        close: function () { try { ws.close(); } catch (e) { /* already closed */ } }
      });
    };
    ws.onerror = function (e) { reject(new Error('websocket error')); };
    ws.onmessage = function (m) {
      let data;
      try { data = JSON.parse(m.data); } catch (e) { return; }
      if (data.id && pending.has(data.id)) {
        const p = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) { p.rej(new Error(data.error.message)); } else { p.res(data.result); }
      } else if (data.method) {
        events.push(data);
        listeners.forEach(function (fn) { fn(data); });
      }
    };
  });
}

async function auditViewport(cdp, sessionId, width, height, mobile) {
  const errors = { console: [], page: [], log: [], external: [] };
  let active = true;
  const onEvent = function (data) {
    if (!active) { return; }
    if (data.method === 'Runtime.consoleAPICalled' &&
        (data.params.type === 'error' || data.params.type === 'assert')) {
      errors.console.push(data.params.args.map(function (a) {
        return a.value !== undefined ? a.value : a.description;
      }).join(' '));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      const d = data.params.exceptionDetails;
      errors.page.push((d.exception && d.exception.description) || d.text);
    }
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error' &&
        data.params.entry.source !== 'network') {
      errors.log.push(data.params.entry.text);
    }
    if (data.method === 'Network.requestWillBeSent') {
      const u = data.params.request.url;
      if (!/^(file:|data:|about:|blob:)/.test(u)) { errors.external.push(u); }
    }
  };
  cdp.onEvent(onEvent);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: width, height: height, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile
  }, sessionId);
  const loaded = new Promise(function (resolve) {
    const timer = setTimeout(resolve, 8000);
    cdp.onEvent(function (data) {
      if (data.method === 'Page.loadEventFired') { clearTimeout(timer); resolve(); }
    });
  });
  await cdp.send('Page.navigate', { url: PAGE_URL }, sessionId);
  await loaded;
  await new Promise(function (resolve) { setTimeout(resolve, 400); });

  const evalExpr = async function (expr) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error('evaluate failed for [' + expr.slice(0, 60) + ']: ' +
        JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  };

  const ready = await evalExpr('document.readyState + "|" + location.href');
  const overflowX = await evalExpr(
    'document.documentElement.scrollWidth > document.documentElement.clientWidth || ' +
    '(document.body && document.body.scrollWidth > document.documentElement.clientWidth)');
  const labOk = await evalExpr(
    '!!document.querySelector("#lab-chart svg") && ' +
    '!!document.querySelector("#lab-bars svg") && ' +
    '!!document.querySelector("#lab-table table")');
  const selfTest = await evalExpr(
    'typeof FlagCallLab !== "undefined" ? FlagCallLab.selfTests() : null');
  const gameOk = await evalExpr(
    'document.querySelectorAll(".preset").length === 8 && ' +
    'document.querySelectorAll("#schedule-list li").length > 0 && ' +
    'document.getElementById("tier-name").textContent.length > 0');

  let culprits = [];
  if (overflowX) {
    culprits = await evalExpr(
      'Array.from(document.querySelectorAll("body *")).filter(function (el) {' +
      ' return el.namespaceURI !== "http://www.w3.org/2000/svg" && ' +
      'el.scrollWidth > document.documentElement.clientWidth; })' +
      '.sort(function (a, b) { return a.scrollWidth - b.scrollWidth; }).slice(0, 8)' +
      '.map(function (el) { return el.tagName + (el.id ? "#" + el.id : "") + "." + ' +
      '(el.className && el.className.baseVal !== undefined ? "svg" : String(el.className).split(" ")[0]) + ' +
      '"=" + el.scrollWidth; })');
  }
  active = false;
  return { errors: errors, overflowX: overflowX, labOk: labOk, selfTest: selfTest,
    gameOk: gameOk, culprits: culprits };
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('headless audit: no Chromium binary found');
    process.exit(1);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'flagcall-audit-'));
  const portFile = path.join(profile, 'DevToolsActivePort');
  const proc = spawn(chrome, [
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--disable-gpu',
    '--disable-extensions',
    '--mute-audio',
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const chromeStderr = [];
  proc.stderr.on('data', function (d) { chromeStderr.push(String(d)); });

  let cdp = null;
  const results = [];
  try {
    await waitForFile(portFile, 15000);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const version = await httpJson('http://127.0.0.1:' + port + '/json/version');
    cdp = await cdpConnect(version.webSocketDebuggerUrl);

    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId, flatten: true
    });
    const sessionId = attached.sessionId;
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);

    const viewports = [
      { name: 'desktop 1440x900', w: 1440, h: 900, mobile: false },
      { name: 'mobile 390x844', w: 390, h: 844, mobile: true }
    ];
    for (const v of viewports) {
      results.push(Object.assign({ name: v.name },
        await auditViewport(cdp, sessionId, v.w, v.h, v.mobile)));
    }
  } finally {
    if (cdp) { cdp.close(); }
    proc.kill('SIGTERM');
    await new Promise(function (resolve) {
      const t = setTimeout(function () {
        try { proc.kill('SIGKILL'); } catch (e) { /* already dead */ }
        resolve();
      }, 2500);
      proc.on('exit', function () { clearTimeout(t); resolve(); });
    });
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* temp dir */ }
  }

  let checks = 0;
  let failed = 0;
  function report(cond, msg) {
    checks += 1;
    if (!cond) { failed += 1; }
    console.log((cond ? '  ok  ' : '  FAIL') + ' ' + msg);
  }

  for (const r of results) {
    console.log('[' + r.name + ']');
    report(r.errors.console.length === 0,
      'console errors: ' + r.errors.console.length + (r.errors.console[0] ? ' (' + r.errors.console[0] + ')' : ''));
    report(r.errors.page.length === 0,
      'uncaught page errors: ' + r.errors.page.length + (r.errors.page[0] ? ' (' + r.errors.page[0] + ')' : ''));
    report(r.errors.log.length === 0,
      'browser log errors: ' + r.errors.log.length + (r.errors.log[0] ? ' (' + r.errors.log[0] + ')' : ''));
    report(r.errors.external.length === 0,
      'external network requests: ' + r.errors.external.length +
      (r.errors.external[0] ? ' (' + r.errors.external[0] + ')' : ''));
    report(r.overflowX === false, 'horizontal page overflow: none' +
      (r.culprits && r.culprits.length ? ' [wide: ' + r.culprits.join(', ') + ']' : ''));
    report(r.gameOk === true, 'the game itself renders: presets, schedule, tier chip');
    report(r.labOk === true, 'the audit lab renders: both SVG charts and the comparison table');
    report(r.selfTest && r.selfTest.ok === true,
      'in page self tests: ' + (r.selfTest ? r.selfTest.passed + '/' + r.selfTest.total + ' pass' : 'unavailable'));
  }

  console.log('headless audit: ' + checks + ' checks, ' + failed + ' failed' +
    (chromeStderr.length ? ' (chromium stderr captured ' + chromeStderr.length + ' chunks)' : ''));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.error('headless audit crashed: ' + e.message);
  process.exit(1);
});

'use strict';

/*
 * Audit Lab UI for Flag Call.
 * Wires the lab panel: the scenario and stress controls, two zero
 * dependency SVG charts, the policy comparison table, the checksummed
 * audit brief exports with in page verification, bookmark hashing, and
 * the live self test panel. Everything renders from FlagCallLab against
 * the same FlagCallEngine the game scores on. No network, no libraries.
 */

(function () {
  var L = FlagCallLab;
  var $ = function (id) { return document.getElementById(id); };

  var TIER_HEX = ['#46d68c', '#ffd166', '#ffa24d', '#ff6b6b', '#ffd9d9'];
  var INK_HEX = '#f2ede3';
  var MUTED_HEX = '#a9b2c0';
  var LINE_HEX = '#2a3446';

  var state = { s: 0, p: 0, t: 0 };
  if (typeof location !== 'undefined' && location.hash) {
    var restored = L.decodeBookmark(location.hash);
    if (restored) { state = restored; }
  }

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function num(v, digits) {
    return Number(v).toFixed(digits === undefined ? 1 : digits);
  }

  /* ---------- scenario stress chart ---------- */

  function chartSvg() {
    var scenario = L.SCENARIOS[state.s];
    var base = L.recommendedSeries(scenario, 0);
    var stressed = state.t === 0 ? base : L.recommendedSeries(scenario, state.t);
    var same = state.t === 0;

    var lo = 78;
    var hi = 94;
    [base, stressed].forEach(function (series) {
      series.forEach(function (r) {
        if (r.wbgtF - 4 < lo) { lo = Math.floor(r.wbgtF - 4); }
        if (r.wbgtF + 4 > hi) { hi = Math.ceil(r.wbgtF + 4); }
      });
    });
    lo = Math.min(lo, 78);
    hi = Math.max(hi, 94);

    var W = 720;
    var H = 320;
    var padL = 46;
    var padR = 86;
    var padT = 20;
    var padB = 46;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = base.length;
    var xOf = function (i) { return padL + (n === 1 ? plotW / 2 : plotW * i / (n - 1)); };
    var yOf = function (f) { return padT + plotH * (1 - (f - lo) / (hi - lo)); };

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    var bands = [
      [lo, 82, TIER_HEX[0], 'Normal'],
      [82, 85, TIER_HEX[1], 'Watch'],
      [85, 88, TIER_HEX[2], 'Caution'],
      [88, 90, TIER_HEX[3], 'Warning'],
      [90, hi, TIER_HEX[4], 'Danger']
    ];
    bands.forEach(function (b) {
      var y1 = yOf(b[1]);
      var y0 = yOf(b[0]);
      svg += '<rect x="' + padL + '" y="' + num(y1, 2) + '" width="' + plotW +
        '" height="' + num(y0 - y1, 2) + '" fill="' + b[2] + '" fill-opacity="0.08"></rect>';
    });
    L.BAND_FLOOR_F.slice(1).forEach(function (f, i) {
      svg += '<line x1="' + padL + '" y1="' + num(yOf(f), 2) + '" x2="' + (padL + plotW) +
        '" y2="' + num(yOf(f), 2) + '" stroke="' + LINE_HEX + '" stroke-width="1.4"></line>';
      svg += '<text x="' + (padL + plotW + 8) + '" y="' + num(yOf(f) + 4, 2) +
        '" class="lab-svg-note">' + f + '+ ' + bands[i + 1][3] + '</text>';
    });
    svg += '<text x="' + (padL + plotW + 8) + '" y="' + num(yOf(lo) - 4, 2) +
      '" class="lab-svg-note">under 82</text>';

    for (var tick = Math.ceil(lo / 10) * 10; tick <= Math.floor(hi / 10) * 10; tick += 10) {
      svg += '<text x="' + (padL - 8) + '" y="' + num(yOf(tick) + 4, 2) +
        '" text-anchor="end" class="lab-svg-note">' + tick + ' F</text>';
    }

    var path = function (series, w, dash, hex) {
      var d = series.map(function (r, i) {
        return (i === 0 ? 'M' : 'L') + num(xOf(i), 2) + ' ' + num(yOf(r.wbgtF), 2);
      }).join(' ');
      return '<path d="' + d + '" fill="none" stroke="' + hex + '" stroke-width="' + w +
        '"' + (dash ? ' stroke-dasharray="6 5"' : '') + ' stroke-linejoin="round" stroke-linecap="round"></path>';
    };
    if (!same) { svg += path(base, 2, true, MUTED_HEX); }
    svg += path(stressed, 2.6, false, '#ffa24d');

    if (!same) {
      base.forEach(function (r, i) {
        svg += '<circle cx="' + num(xOf(i), 2) + '" cy="' + num(yOf(r.wbgtF), 2) +
          '" r="3.5" fill="' + TIER_HEX[r.tier] + '" fill-opacity="0.65"></circle>';
      });
    }
    stressed.forEach(function (r, i) {
      svg += '<circle cx="' + num(xOf(i), 2) + '" cy="' + num(yOf(r.wbgtF), 2) +
        '" r="5" fill="' + TIER_HEX[r.tier] + '" stroke="' + INK_HEX + '" stroke-opacity="0.35" stroke-width="1"></circle>';
      svg += '<text x="' + num(xOf(i), 2) + '" y="' + num(yOf(r.wbgtF) - 10, 2) +
        '" text-anchor="middle" class="lab-svg-val">' + num(r.shownWbgtF) + '</text>';
    });

    base.forEach(function (r, i) {
      svg += '<text x="' + num(xOf(i), 2) + '" y="' + (H - padB + 18) +
        '" text-anchor="middle" class="lab-svg-note">' + esc(r.time) + '</text>';
      svg += '<text x="' + num(xOf(i), 2) + '" y="' + (H - padB + 32) +
        '" text-anchor="middle" class="lab-svg-note">' + esc(r.label) + '</text>';
    });

    svg += '<text x="' + padL + '" y="' + (padT - 6) + '" class="lab-svg-note">';
    svg += same ? 'baseline day' : 'dashed baseline, solid stressed ' +
      (state.t > 0 ? '+' : '') + state.t + ' F';
    svg += '</text>';
    svg += '</svg>';
    return svg;
  }

  /* ---------- policy score bars ---------- */

  function barsSvg() {
    var cmp = L.compareAll(state.t);
    var rows = cmp.scenarios[state.s].rows;
    var W = 720;
    var rowH = 40;
    var padT = 8;
    var padL = 150;
    var padR = 108;
    var H = padT * 2 + rows.length * rowH;
    var barW = W - padL - padR;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    rows.forEach(function (row, i) {
      var y = padT + i * rowH;
      var pct = row.totals.max === 0 ? 0 : row.totals.rawPoints / row.totals.max;
      var hex = i === 0 ? '#ffa24d' : (row.totals.unsafeCount > 0 ? '#ff6b6b' : MUTED_HEX);
      svg += '<text x="' + (padL - 10) + '" y="' + (y + rowH / 2 + 4) +
        '" text-anchor="end" class="lab-svg-name">' + esc(row.policyName) + '</text>';
      svg += '<rect x="' + padL + '" y="' + (y + 8) + '" width="' + barW +
        '" height="' + (rowH - 16) + '" rx="6" fill="' + LINE_HEX + '" fill-opacity="0.45"></rect>';
      svg += '<rect x="' + padL + '" y="' + (y + 8) + '" width="' + num(barW * pct, 2) +
        '" height="' + (rowH - 16) + '" rx="6" fill="' + hex + '" fill-opacity="0.85"></rect>';
      var tag = Math.round(pct * 100) + '%';
      if (row.totals.unsafeCount > 0) {
        tag += ' · ' + row.totals.unsafeCount + ' unsafe';
      }
      svg += '<text x="' + (padL + barW + 8) + '" y="' + (y + rowH / 2 + 4) +
        '" class="lab-svg-val">' + esc(tag) + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  /* ---------- comparison table ---------- */

  function tableHtml() {
    var cmp = L.compareAll(state.t);
    var scenario = cmp.scenarios[state.s];
    var rows = scenario.rows.map(function (row, i) {
      var t = row.totals;
      var cls = i === 0 ? ' class="bench"' : (i === state.p ? ' class="focus"' : '');
      var unsafeCls = t.unsafeCount > 0 ? ' bad' : '';
      return '<tr' + cls + '><td>' + esc(row.policyName) + '</td>' +
        '<td class="num">' + t.rawPoints + ' / ' + t.max + '</td>' +
        '<td class="num">' + Math.round(t.pct * 100) + '%</td>' +
        '<td>' + t.grade + '</td>' +
        '<td class="num' + unsafeCls + '">' + t.unsafeCount + '</td>' +
        '<td class="num">' + t.worstUnderGap + '</td>' +
        '<td class="num">' + num(t.worstExposureF) + '</td>' +
        '<td class="num">' + t.overRestriction + '</td>' +
        '<td class="num">' + (row.pointsDelta === 0 ? 'benchmark' : num(row.pointsDelta, 0)) + '</td></tr>';
    });
    return '<table class="lab-compare"><caption>' + esc(scenario.name) +
      ' under a ' + (state.t === 0 ? '0' : (state.t > 0 ? '+' : '') + state.t) +
      ' F stress shift, every policy on the ' + esc(scenario.templateId) + ' card</caption>' +
      '<thead><tr><th scope="col">Policy</th><th scope="col">Points</th><th scope="col">Pct</th>' +
      '<th scope="col">Grade</th><th scope="col">Unsafe</th><th scope="col">Worst gap</th>' +
      '<th scope="col">Exposure F</th><th scope="col">Over restr.</th><th scope="col">Delta</th></tr></thead>' +
      '<tbody>' + rows.join('') + '</tbody></table>';
  }

  /* ---------- render ---------- */

  function render() {
    var scenario = L.SCENARIOS[state.s];
    $('lab-scenario').value = String(state.s);
    $('lab-shift-out').textContent = (state.t > 0 ? '+' : '') + state.t + ' F';
    $('lab-blurb').textContent = scenario.blurb;
    $('lab-chart').innerHTML = chartSvg();
    $('lab-table').innerHTML = tableHtml();
    $('lab-bars').innerHTML = barsSvg();
  }

  /* ---------- exports and verification ---------- */

  function briefNow() {
    var stamp;
    try { stamp = new Date().toISOString(); } catch (e) { stamp = 'undated local run'; }
    return L.buildBrief(state.t, stamp);
  }

  function download(name, text, mime) {
    var ta = $('lab-verify-text');
    ta.value = text;
    try {
      if (typeof URL === 'undefined' || !URL.createObjectURL || typeof Blob === 'undefined') {
        return;
      }
      var blob = new Blob([text], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      /* the text is already in the verify box for manual copying */
    }
  }

  function setOut(id, msg, good) {
    var el = $(id);
    el.textContent = msg;
    el.className = good ? 'lab-status-ok' : 'lab-status-bad';
  }

  /* ---------- init ---------- */

  function init() {
    var sel = $('lab-scenario');
    L.SCENARIOS.forEach(function (s, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    sel.value = String(state.s);
    $('lab-shift').value = String(state.t);

    sel.addEventListener('change', function () {
      state.s = parseInt(sel.value, 10) || 0;
      render();
    });
    $('lab-shift').addEventListener('input', function (ev) {
      state.t = L.clampShift(ev.target.value);
      render();
    });
    $('lab-bookmark').addEventListener('click', function () {
      var enc = L.encodeBookmark(state);
      var link = '#';
      if (typeof location !== 'undefined') {
        link = location.href.split('#')[0] + enc;
        if (typeof history !== 'undefined' && history.replaceState) {
          history.replaceState(null, '', enc);
        }
      }
      var out = $('lab-hash-out');
      out.hidden = false;
      var done = function (note) { out.textContent = note + ' ' + link; };
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          done('Bookmark copied.');
        }, function () {
          done('Bookmark link:');
        });
      } else {
        done('Bookmark link:');
      }
    });

    $('lab-export-json').addEventListener('click', function () {
      download('flag-call-audit.json', L.exportJson(briefNow()), 'application/json');
    });
    $('lab-export-csv').addEventListener('click', function () {
      download('flag-call-audit.csv', L.exportCsv(briefNow()), 'text/csv');
    });
    $('lab-export-md').addEventListener('click', function () {
      download('flag-call-audit.md', L.exportMarkdown(briefNow()), 'text/markdown');
    });
    $('lab-verify-btn').addEventListener('click', function () {
      var v = L.verifyExport($('lab-verify-text').value);
      setOut('lab-verify-out', (v.ok ? 'Verified. ' : 'Failed. ') + v.detail, v.ok);
    });
    $('lab-selftest-btn').addEventListener('click', function () {
      var result = L.selfTests();
      var list = $('lab-selftest-out');
      list.innerHTML = result.tests.map(function (t) {
        return '<li class="' + (t.pass ? 'st-pass' : 'st-fail') + '">' +
          (t.pass ? 'Pass' : 'FAIL') + ' · ' + esc(t.name) + '</li>';
      }).join('');
      setOut('lab-selftest-summary',
        result.passed + ' of ' + result.total + ' self tests pass', result.ok);
    });

    render();
  }

  if (typeof document !== 'undefined') {
    init();
  }
})();

'use strict';

/*
 * Crypto and export test suite for the Flag Call Audit Lab.
 * Covers the pure JS SHA-256 against FIPS 180-4 known answer vectors and
 * an independent node:crypto oracle, the UTF-8 encoder, canonical JSON,
 * CSV injection armor, the audit brief exports, tamper verification,
 * replay verification, and the strict bookmark codec.
 * The self audit assertion at the end locks the content assertion count.
 */

const test = require('node:test');
const assert = require('node:assert');
const nodeCrypto = require('node:crypto');
const SHA = require('../js/sha256.js');
const L = require('../js/lab.js');

let count = 0;
function ok(cond, msg) { count += 1; assert.ok(cond, msg); }
function eq(actual, expected, msg) { count += 1; assert.strictEqual(actual, expected, msg); }
function deq(actual, expected, msg) { count += 1; assert.deepStrictEqual(actual, expected, msg); }

function refHex(str) {
  return nodeCrypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// Deterministic pseudo random strings: a mulberry32 LCG so the corpus is
// fixed across runs and machines.
function lcg(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('FIPS 180-4 known answer vectors', () => {
  eq(SHA.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'empty message');
  eq(SHA.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'abc');
  eq(SHA.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    'the 56 byte two block boundary vector');
  eq(SHA.sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu'),
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    'the 112 byte vector');
  eq(SHA.sha256Hex('The quick brown fox jumps over the lazy dog'),
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    'the quick brown fox');
  eq(SHA.sha256Hex('The quick brown fox jumps over the lazy cog'),
    'e4c4d8f3bf76b692de791a173e05321150f7a345b46484fe427f6acc7ecc81be',
    'the quick brown fox variant ending in cog');
  eq(SHA.sha256Hex('a'.repeat(1000000)),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    'the one million a vector');
});

test('padding boundaries at 55, 56, 63, 64, 65 and 119 byte messages', () => {
  for (const n of [1, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 127, 128]) {
    const msg = 'x'.repeat(n);
    eq(SHA.sha256Hex(msg), refHex(msg), 'message length ' + n + ' bytes');
  }
});

test('independent node:crypto oracle over a deterministic corpus', () => {
  const rnd = lcg(0x5eed);
  for (let i = 0; i < 40; i += 1) {
    const len = 1 + Math.floor(rnd() * 400);
    let msg = '';
    for (let j = 0; j < len; j += 1) {
      const pick = rnd();
      if (pick < 0.6) {
        msg += String.fromCharCode(32 + Math.floor(rnd() * 95));
      } else if (pick < 0.9) {
        msg += String.fromCharCode(0xa0 + Math.floor(rnd() * 800));
      } else {
        msg += String.fromCodePoint(0x1f300 + Math.floor(rnd() * 600));
      }
    }
    eq(SHA.sha256Hex(msg), refHex(msg), 'corpus string ' + i + ' of ' + len + ' chars');
  }
});

test('utf8 encoder handles ascii, latin, astral and broken surrogates', () => {
  deq(Array.from(SHA.utf8Bytes('A')), [0x41], 'ascii byte');
  deq(Array.from(SHA.utf8Bytes('é')), [0xc3, 0xa9], 'two byte sequence for e acute');
  deq(Array.from(SHA.utf8Bytes('€')), [0xe2, 0x82, 0xac], 'three byte euro sign');
  deq(Array.from(SHA.utf8Bytes('\u{1f4a9}')), [0xf0, 0x9f, 0x92, 0xa9], 'four byte astral character');
  deq(Array.from(SHA.utf8Bytes('\ud800')), [0xef, 0xbf, 0xbd], 'lone high surrogate becomes the replacement character');
  deq(Array.from(SHA.utf8Bytes('\udc00')), [0xef, 0xbf, 0xbd], 'lone low surrogate becomes the replacement character');
  eq(SHA.utf8Bytes('').length, 0, 'empty string encodes to no bytes');
  eq(SHA.sha256Hex('✓'), refHex('✓'), 'check mark digests identically to the oracle');
});

test('hexOf renders lowercase hex with leading zeros', () => {
  eq(SHA.hexOf(new Uint8Array([0, 15, 16, 255])), '000f10ff', 'byte to hex mapping keeps leading zeros');
  eq(SHA.sha256Hex('abc').length, 64, 'a digest is 64 hex characters');
  ok(/^[0-9a-f]{64}$/.test(SHA.sha256Hex('flag call')), 'digest output is clean lowercase hex');
});

test('canonicalJson is deterministic and key order independent', () => {
  const a = { b: 2, a: 1, c: { z: 1, y: [3, 2, 1] } };
  const b = { c: { y: [3, 2, 1], z: 1 }, a: 1, b: 2 };
  eq(L.canonicalJson(a), L.canonicalJson(b), 'key order does not change the canonical form');
  eq(L.canonicalJson(a), '{"a":1,"b":2,"c":{"y":[3,2,1],"z":1}}', 'canonical form is sorted and compact');
  eq(L.canonicalJson([1, 'a', null]), '[1,"a",null]', 'arrays keep their order');
  eq(L.canonicalJson('s'), '"s"', 'strings serialize with quotes');
  eq(L.canonicalJson({}), '{}', 'empty object');
  eq(L.canonicalJson([]), '[]', 'empty array');
});

test('csvCell armor: quoting, escaping, and formula injection', () => {
  eq(L.csvCell('plain'), '"plain"', 'a plain cell is quoted');
  eq(L.csvCell('say "hi"'), '"say ""hi"""', 'embedded quotes double up');
  eq(L.csvCell('=2+3'), '"\'=2+3"', 'equals sign is neutralized');
  eq(L.csvCell('+SUM(A1:A2)'), '"\'+SUM(A1:A2)"', 'leading plus is neutralized');
  eq(L.csvCell('-10'), '"\'-10"', 'leading minus is neutralized');
  eq(L.csvCell('@mention'), '"\'@mention"', 'leading at sign is neutralized');
  eq(L.csvCell('\t-tabbed'), '"\'\t-tabbed"', 'leading tab is neutralized');
  eq(L.csvCell('line1\nline2'), '"line1 line2"', 'newlines collapse to spaces');
  eq(L.csvCell('a\rb'), '"a b"', 'carriage returns collapse to spaces');
  eq(L.csvCell(''), '""', 'empty cell stays quoted');
  eq(L.csvCell(null), '""', 'null renders as an empty quoted cell');
  eq(L.csvCell(undefined), '""', 'undefined renders as an empty quoted cell');
  eq(L.csvCell(42), '"42"', 'numbers serialize plainly');
  eq(L.csvCell(' normal'), '" normal"', 'leading space is harmless and kept');
  ok(L.csvCell('=HYPERLINK("http://evil")').indexOf('"\'') === 0,
    'a realistic hyperlink injection is neutralized');
});

// One test per legal bookmark state: the strict codec must round trip
// every scenario, policy, and shift combination exactly.
for (let bs = 0; bs < 5; bs += 1) {
  for (let bp = 0; bp < 5; bp += 1) {
    for (let bt = -20; bt <= 20; bt += 2) {
      test('bookmark round trip s' + bs + ' p' + bp + ' t' + (bt >= 0 ? '+' : '') + bt, () => {
        const enc = L.encodeBookmark({ s: bs, p: bp, t: bt });
        eq(enc, '#fc=v1.s' + bs + '.p' + bp + '.t' + bt, 'encoded form is the strict shape');
        const dec = L.decodeBookmark(enc);
        deq(dec, { s: bs, p: bp, t: bt }, 'decode recovers the exact state');
        eq(L.decodeBookmark(enc + ' '), null, 'a trailing space is rejected');
      });
    }
  }
}

test('encodeBookmark clamps out of range values', () => {
  eq(L.encodeBookmark({ s: 99, p: 99, t: 99 }), '#fc=v1.s4.p4.t20', 'high values clamp into range');
  eq(L.encodeBookmark({ s: -3, p: -1, t: -99 }), '#fc=v1.s0.p0.t-20', 'low values clamp into range');
  eq(L.encodeBookmark({ s: 1.6, p: 2.4, t: 3.5 }), '#fc=v1.s2.p2.t4', 'fractions round to integers');
  eq(L.encodeBookmark({ s: 'x', p: 'y', t: 'z' }), '#fc=v1.s0.p0.t0',
    'non numeric fields degrade to zero rather than emitting junk');
});

test('decodeBookmark rejects every malformed form', () => {
  const bad = [
    '', '#', '#fc=', '#fc', '#other=v1.s0.p0.t0',
    '#fc=v2.s0.p0.t0', '#fc=v1.s0.p0', '#fc=v1.s0',
    '#fc=v1.s5.p0.t0', '#fc=v1.s0.p5.t0', '#fc=v1.s9.p9.t0',
    '#fc=v1.s0.p0.t21', '#fc=v1.s0.p0.t-21', '#fc=v1.s0.p0.t123',
    '#fc=v1.s0.p0.t', '#fc=v1.s-1.p0.t0', '#fc=v1.s0.p0.t0.extra',
    '#fc=v1.s0.p0.t0 ', ' #fc=v1.s0.p0.t0', '#fc=v1.s0.p0.t0\n',
    '#fc=v1.s0.p0.t0x', '#fc=v1.s00.p0.t0', '#fc=v1..s0.p0.t0',
    'null', 'undefined', '#fc=V1.S0.P0.T0'
  ];
  bad.forEach(function (h, i) {
    eq(L.decodeBookmark(h), null, 'rejected form ' + i + ': ' + JSON.stringify(h));
  });
});

test('decodeBookmark accepts plus signs and zeros at the edges', () => {
  deq(L.decodeBookmark('#fc=v1.s0.p0.t0'), { s: 0, p: 0, t: 0 }, 'the all zero bookmark');
  deq(L.decodeBookmark('#fc=v1.s4.p4.t+20'), { s: 4, p: 4, t: 20 }, 'plus signed maximum');
  deq(L.decodeBookmark('#fc=v1.s0.p0.t-20'), { s: 0, p: 0, t: -20 }, 'signed minimum');
});

test('JSON export verifies and detects a single digit edit', () => {
  const brief = L.buildBrief(0, 'test-time');
  const text = L.exportJson(brief);
  const v = L.verifyExport(text);
  ok(v.ok === true && v.mode === 'json', 'fresh export verifies');
  const flipped = text.replace('"rawPoints": 400', '"rawPoints": 401');
  ok(flipped !== text, 'the mutation actually changed the text');
  eq(L.verifyExport(flipped).ok, false, 'mutated points are caught');
  const digestFlip = text.slice(0, -3) + (text.slice(-3, -2) === 'a' ? 'b' : 'a') + text.slice(-2);
  eq(L.verifyExport(digestFlip).ok, false, 'a corrupted digest is caught');
});

test('CSV export verifies and detects edits above the digest line', () => {
  const brief = L.buildBrief(0, 'test-time');
  const csv = L.exportCsv(brief);
  eq(L.verifyExport(csv).ok, true, 'fresh CSV verifies');
  const tampered = csv.replace('"400"', '"401"');
  eq(L.verifyExport(tampered).ok, false, 'mutated CSV is caught');
  ok(csv.indexOf('# sha256: ') !== -1, 'the digest line is clearly labeled');
  ok(csv.indexOf('"\'"') === -1, 'data cells carry no injection prefix');
});

test('Markdown export verifies and detects edits', () => {
  const brief = L.buildBrief(0, 'test-time');
  const md = L.exportMarkdown(brief);
  eq(L.verifyExport(md).ok, true, 'fresh markdown verifies');
  const tampered = md.replace('| 400 |', '| 401 |');
  eq(L.verifyExport(tampered).ok, false, 'mutated markdown is caught');
  ok(md.indexOf('unkeyed SHA-256 tamper-detection digest') !== -1,
    'the honest digest disclaimer ships in the brief');
  ok(md.indexOf('| band-exact |') !== -1, 'markdown tables list every policy row');
});

test('verifyExport rejects junk and empty input', () => {
  eq(L.verifyExport('').ok, false, 'empty string');
  eq(L.verifyExport('hello world').ok, false, 'plain text');
  eq(L.verifyExport('{"a":1}').ok, false, 'unrelated json');
  eq(L.verifyExport('sha256: zzz').ok, false, 'malformed digest line');
  eq(L.verifyExport('x'.repeat(100)).ok, false, 'long junk');
});

test('replay verification catches a self consistent but wrong brief', () => {
  const brief = L.buildBrief(0, 'test-time');
  const parsed = JSON.parse(L.exportJson(brief));
  parsed.brief.scenarios[0].policies[1].rawPoints = 399;
  parsed.digest = L.digestBrief(parsed.brief);
  const text = JSON.stringify(parsed);
  const v = L.verifyExport(text);
  eq(v.ok, false, 'a recomputed digest over wrong numbers still fails');
  ok(v.detail.indexOf('replay') !== -1 || v.detail.indexOf('mismatch') !== -1,
    'the failure is explained as a replay mismatch');
});

test('replay of a brief built at a nonzero stress shift agrees', () => {
  const brief = L.buildBrief(9, 'test-time');
  eq(L.replayBrief(brief).ok, true, 'a stressed brief replays exactly');
  const briefNeg = L.buildBrief(-14, 'test-time');
  eq(L.replayBrief(briefNeg).ok, true, 'a cooled brief replays exactly');
});

test('golden digest locks the whole comparator output', () => {
  const brief = L.buildBrief(0, 'golden');
  eq(L.digestBrief(brief), '96b84d236e3230b136e7cf8517a15535689c7a503e93714e29ea9416f023e0b9',
    'the canonical brief digest matches the golden value');
});

test('brief shape and honest labels', () => {
  const brief = L.buildBrief(0, 'test-time');
  eq(brief.format, 'flag-call-audit-v1', 'brief carries its format tag');
  eq(brief.scenarios.length, 5, 'the brief covers all five scenarios');
  ok(brief.scenarios.every(function (s) { return s.policies.length === 5; }),
    'every scenario lists all five policies');
  ok(brief.digestNote.indexOf('unkeyed') !== -1, 'the unkeyed caveat ships in the payload');
  ok(brief.scenarios.every(function (s) { return s.policies[0].policy === 'band-exact'; }),
    'the benchmark policy is always the first row');
  eq(L.exportJson(brief).indexOf('tamper-detection') !== -1, true,
    'the JSON export labels the digest algorithm honestly');
});

test('self audit: crypto assertion count is exact', () => {
  assert.strictEqual(count, 1728, 'the crypto suite must hold exactly 1728 content assertions');
});

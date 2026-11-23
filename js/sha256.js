'use strict';

/*
 * Pure JavaScript SHA-256, implemented straight from FIPS 180-4.
 *
 * Used by the audit lab to checksum exported briefs. This is an unkeyed
 * tamper-detection digest: it proves a file was not altered after export,
 * it is NOT a signature or a MAC and proves nothing about who wrote it.
 * No dependencies. Loaded in the browser through a script tag and in Node
 * through require.
 */

const FlagCallSHA256 = (function () {
  // Round constants: first 32 bits of the fractional parts of the cube
  // roots of the first 64 primes (FIPS 180-4 section 4.2.2).
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Initial hash value: first 32 bits of the fractional parts of the
  // square roots of the first 8 primes.
  const H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  // Manual UTF-8 encoder so the digest depends on nothing outside this
  // file. Handles lone surrogates the way encodeURIComponent-free code
  // should: they are replaced with U+FFFD.
  function utf8Bytes(str) {
    const s = String(str);
    const out = [];
    for (let i = 0; i < s.length; i += 1) {
      let cp = s.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff) {
        const lo = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
          i += 1;
        } else {
          cp = 0xfffd;
        }
      } else if (cp >= 0xdc00 && cp <= 0xdfff) {
        cp = 0xfffd;
      }
      if (cp < 0x80) {
        out.push(cp);
      } else if (cp < 0x800) {
        out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      } else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  // Core: SHA-256 over a Uint8Array, per FIPS 180-4 sections 5 and 6.
  function sha256Bytes(bytes) {
    const h = H0.slice();
    const bitLenLo = (bytes.length << 3) >>> 0;
    const bitLenHi = Math.floor(bytes.length / 0x20000000) >>> 0;

    // Padded length: message + 0x80 + zeros to 56 mod 64 + 8 byte length.
    const padLen = ((bytes.length + 8 + 63 + 1) >> 6 << 6);
    const msg = new Uint8Array(padLen);
    msg.set(bytes);
    msg[bytes.length] = 0x80;
    const dv = new DataView(msg.buffer);
    dv.setUint32(padLen - 8, bitLenHi);
    dv.setUint32(padLen - 4, bitLenLo);

    const w = new Int32Array(64);
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i += 1) {
        w[i] = dv.getInt32(off + i * 4);
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      let a = h[0]; let b = h[1]; let c = h[2]; let d = h[3];
      let e = h[4]; let f = h[5]; let g = h[6]; let hh = h[7];

      for (let i = 0; i < 64; i += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + s1 + ch + K[i] + w[i]) | 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }

      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0;
      h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }

    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i += 1) {
      odv.setUint32(i * 4, h[i]);
    }
    return out;
  }

  function hexOf(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += (bytes[i] >>> 4).toString(16) + (bytes[i] & 15).toString(16);
    }
    return out;
  }

  // Convenience: digest of a JS string, UTF-8 encoded first.
  function sha256Hex(str) {
    return hexOf(sha256Bytes(utf8Bytes(str)));
  }

  return {
    utf8Bytes: utf8Bytes,
    sha256Bytes: sha256Bytes,
    sha256Hex: sha256Hex,
    hexOf: hexOf
  };
})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = FlagCallSHA256;
}

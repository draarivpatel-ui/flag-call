# Flag Call

A UIL wet bulb globe temperature (WBGT) heat safety decision game. Read the weather, watch the
WBGT number move, and call the right flag for every block of a real activity schedule. Static,
vanilla, zero dependencies, GitHub Pages ready.

## How to play

1. Pick a city heat snapshot or dial in your own weather with four sliders: air temperature,
   relative humidity, radiant heat, and wind.
2. The engine blends them into one WBGT reading: 70 percent wet bulb, 20 percent globe,
   10 percent air temperature.
3. Call the flag for every block on the practice card. Exact calls score 100. Undercalls score
   almost nothing, because a low flag is the dangerous mistake.
4. Tap **See an Unsafe Plan** to see what a bad day looks like, or **Show the Safe Call** to see
   the recommended flags with the reasoning spelled out.
5. Finish the day for a report card with a grade, or start the **Day 1 Walkthrough** for a guided
   nine step tour.
6. Scroll to the **Audit Lab** to stress test calling policies: five scripted heat day scenarios,
   a stress shift slider, five calling policies scored head to head, checksummed audit briefs,
   and an in page self test run.

Eight city snapshots ship with the game, including Houston at 101 F and Phoenix at 118 F. Each one
has its own humidity, sunlight, and wind personality, so the same temperature can produce very
different readings. The sticky run bar on mobile keeps the live reading, tier, score, and both
judge shortcuts one tap away.

## The science, stated honestly

- Wet bulb temperature uses the Stull (2011) approximation, accurate to roughly 0.3 C across the
  game's input range. The test suite cross checks it against an independently implemented
  psychrometric solver.
- Outdoor WBGT uses the standard 0.7, 0.2, 0.1 weighting.
- Globe temperature uses a simplified empirical rise driven by sunlight and wind. It is tuned for
  gameplay clarity, not instrument replacement.
- Tier bands (under 82 F Normal, 82 to 85 Watch, 85 to 88 Caution, 88 to 90 Warning, 90 and up
  Danger) follow the WBGT activity bands used in UIL style heat guidance. This game is an
  educational tool, not an authority on any league's current policy.
- City presets are representative heat wave snapshots modeled in the spirit of NOAA climate
  extremes, not dated station records.

## The Audit Lab

Below the game panels sits a full width workbench for evaluating calling policies against the
same engine the game scores on:

- **Five scripted heat day scenarios**, each tuned against the real engine: a Gulf moisture
  ramp, a dry desert arc, a cold front passage, a humid pre-dawn build, and an evening where the
  sun drops but the heat lingers.
- **Five calling policies** run every block of every scenario head to head: the engine's exact
  band call (benchmark), a dry bulb guess, a one flag caution, a cancel everything stance, and a
  stale read that calls yesterday's weather.
- **A stress shift slider** runs the whole day up to 20 F hotter or cooler and every metric,
  chart, and export recomputes live.
- **Deterministic metrics per policy**: points and percent of the benchmark max, grade, unsafe
  undercall count, worst flag gap, worst temperature exposure past the called flag's ceiling,
  over restriction count, and the delta from the benchmark.
- **Two SVG charts**: a stress chart drawing WBGT across each schedule block over the five flag
  bands, and a policy bar chart comparing scores.
- **Audit brief exports** in JSON, CSV, and Markdown, each ending in an unkeyed SHA-256 digest
  line (a tamper detection digest, not a signature). CSV cells are neutralized against
  spreadsheet formula injection. Pasting an export into the verifier rehashes it and, for JSON
  briefs, replays every number back through the engine.
- **URL hash bookmarking** in a strict `#fc=v1.s<0-4>.p<0-4>.t<-20..20>` format that restores
  the selected scenario, policy focus, and stress shift.
- **A self test button** that runs 22 in page checks: engine invariants, tier monotonicity,
  boundary behavior, CSV escaping, tamper detection, and FIPS 180-4 SHA-256 known answer tests.

Everything is computed in the browser with zero dependencies and zero network requests. The
SHA-256 module is a standalone FIPS 180-4 implementation in `js/sha256.js` that also runs under
Node for the test suite.

## Honest testing note

Playtesting was performed entirely by automated bots over 592,704 simulated schedule combinations
(every pairing of 8 city presets, 8 practice cards, and 21 humidity, 21 sunlight, and 21 wind
levels). The sweep evaluates 1,629,936 schedule blocks against an independent inline oracle and
checks determinism, physical bounds, monotonicity along each weather axis, and scoring
consistency. No human subjects took part in playtesting. See NOTES.md for the full log.

## Running the tests

Requires Node 18 or newer. No installs, no network.

```
npm test
```

That runs 682 node:test tests in well under a second:

- `tests/engine.test.js`: 178 content assertions covering conversion, wet bulb math, the globe
  model, WBGT composition, tier mapping, presets, schedule evaluation, scoring, plan generators,
  and copy hygiene (14 tests).
- `tests/accessibility.test.js`: 43 static accessibility checkpoints over the markup and CSS
  (landmarks, labels, heading order, focus styles, computed contrast on design tokens, copy
  hygiene, mobile affordances) (9 tests).
- `tests/bot-sweep.test.js`: the 592,704 combination bot sweep described above (1 test).
- `tests/crypto.test.js`: 1,728 content assertions covering the SHA-256 module against FIPS
  180-4 known answers and edge vectors, UTF-8 encoding including lone surrogates, CSV escaping
  and formula injection, digest verify and tamper detection, and every bookmark encode and decode
  combination (544 tests).
- `tests/lab.test.js`: 1,463 content assertions covering scenario definitions, policy behavior,
  comparator metrics, stress shifting, audit brief formats, replay verification, bookmark logic,
  and the self test suite (104 tests).
- `tests/revamp-regression.test.js`: 10 targeted regression tests for null input hardening,
  canonical JSON boundaries, CSV injection whitespace, trailing digest bytes, and complete
  schema replay verification.

Extras outside the default suite:

```
npm run test:smoke
```

runs `scripts/dom-smoke.js`, a Node side wiring check that loads the page's app script with a
minimal DOM stub and clicks through presets, sliders, flag calls, the report card, both judge
dialogs, and the full walkthrough (33 checks across two motion passes), then
`scripts/lab-smoke.js`, the same style of check driving the Audit Lab through scenario
switching, stress shifts, exports, verification, bookmarking, hash restore, and self tests
(36 checks).

```
npm run test:audit
```

runs `scripts/headless-audit.js`, a zero dependency Chrome DevTools Protocol audit that loads the
page in real headless Chromium at 1440x900 and 390x844 and fails on any console error, uncaught
page error, browser log error, external network request, or horizontal overflow, plus renders of
the game UI, both lab charts, the comparison table, and the in page self tests (16 checks).

## Deployment

The site is a single static page. Point GitHub Pages at the repository root and `index.html`
serves as-is. There is no build step and there are no dependencies.

## Project structure

```
index.html                  the whole app: markup, styles link, and the inline UI script
styles.css                  design tokens and layout
js/engine.js                WBGT math, tiers, presets, schedules, scoring, walkthrough copy
js/sha256.js                standalone FIPS 180-4 SHA-256 (Node and browser)
js/lab.js                   scenario and policy comparator, metrics, exporters, self tests
js/lab-ui.js                Audit Lab DOM adapter: charts, table, exports, bookmarking
tests/engine.test.js        178 engine assertions
tests/accessibility.test.js 43 accessibility checkpoints
tests/bot-sweep.test.js     the 592,704 combination bot sweep
tests/crypto.test.js        1,728 crypto, encoding, CSV, digest, and bookmark assertions
tests/lab.test.js           1,463 comparator, export, verify, and self test assertions
tests/revamp-regression.test.js 9 targeted regression tests
scripts/dom-smoke.js        DOM stub wiring check (33 checks)
scripts/lab-smoke.js        Audit Lab DOM stub wiring check (36 checks)
scripts/headless-audit.js   CDP Chromium audit at two viewports (16 checks)
NOTES.md                    build log, exact counts, honest caveats
```

## Author and license

Built by Aariv Patel. Released under the MIT License.

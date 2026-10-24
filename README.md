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

That runs 20 node:test tests with 192 content assertions in well under a second:

- `tests/engine.test.js`: 158 assertions covering conversion, wet bulb math, the globe model, WBGT
  composition, tier mapping, presets, schedule evaluation, scoring, plan generators, and copy
  hygiene.
- `tests/accessibility.test.js`: 34 static accessibility checkpoints over the markup and CSS
  (landmarks, labels, heading order, focus styles, computed contrast on design tokens, copy
  hygiene, mobile affordances).
- `tests/bot-sweep.test.js`: the 592,704 combination bot sweep described above.

There are two extras outside the default suite:

```
npm run test:smoke
```

runs `scripts/dom-smoke.js`, a Node side wiring check that loads the page's app script with a
minimal DOM stub and clicks through presets, sliders, flag calls, the report card, both judge
dialogs, and the full walkthrough (24 checks).

## Deployment

The site is a single static page. Point GitHub Pages at the repository root and `index.html`
serves as-is. There is no build step and there are no dependencies.

## Project structure

```
index.html                  the whole app: markup, styles link, and the inline UI script
styles.css                  design tokens and layout
js/engine.js                WBGT math, tiers, presets, schedules, scoring, walkthrough copy
tests/engine.test.js        158 engine assertions
tests/accessibility.test.js 34 accessibility checkpoints
tests/bot-sweep.test.js     the 592,704 combination bot sweep
scripts/dom-smoke.js        DOM stub wiring check (24 checks)
NOTES.md                    build log, exact counts, honest caveats
```

## Author and license

Built by Aariv Patel. Released under the MIT License.

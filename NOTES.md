# Flag Call: Build Notes

Built 2026-10-23 for the Girls Who Code HHS Hackathon 2026 (Devpost window Oct 24 to Oct 28).
Author: Aariv Patel. Node v26.8.1. No git repository, remote, push, or install was performed in
this build; the repo goes public tomorrow per the pipeline plan.

## What was built

- `index.html`: the entire game as a static single page at the repo root. Markup plus one inline
  UI script. Semantic landmarks, skip link, labelled sliders, fieldset radio flag groups, a native
  dialog for the judge views, and a footer honesty note.
- `styles.css`: design tokens (17 color custom properties), the deep slate and sun orange palette,
  system fonts, tabular numerals, focus visible rings, a 44 pixel touch floor, the sticky mobile
  run bar breakpoint at 760 pixels, and a reduced motion block.
- `js/engine.js`: the pure logic. Stull (2011) wet bulb approximation, a simplified empirical globe
  model driven by solar radiation and wind, the standard 0.7, 0.2, 0.1 outdoor WBGT weighting, five
  activity tiers with escalation thresholds at 82, 85, 88, and 90 F, eight city presets, eight
  practice card templates, call scoring with streak bonus and grades, the unsafe plan and safe call
  generators, and the Day 1 walkthrough copy. Node importable for tests.
- `tests/`: three suites, detailed below.
- `scripts/dom-smoke.js`: a Node side wiring check with a minimal DOM stub (24 checks). Not part of
  the default suite.
- `README.md` and `LICENSE` (MIT).

## Spec compliance

- Eight city NOAA style presets including Houston at 101 F and Phoenix at 118 F: yes, all eight
  presets carry temperature, humidity, radiant heat, and wind.
- WBGT category risk from temperature, humidity, radiant heat, and wind: yes.
- Activity tier mapping with escalation thresholds: Normal, Watch, Caution, Warning, Danger at
  82, 85, 88, and 90 F.
- Day 1 walkthrough mode: yes, a nine step guided tour with a coach panel, progress dots, and
  spotlight highlighting.
- Sticky mobile run bar: yes, fixed bottom bar under 760 pixels with the live WBGT, tier, score,
  and compact judge shortcuts.
- One tap judge shortcuts: yes, "See an Unsafe Plan" and "Show the Safe Call" in the panel and in
  the run bar.
- Scoring: exact 100, one tier cautious 75, two or more cautious 40, one tier loose 15, two or more
  loose 0 and marked unsafe, plus a capped 50 point exact streak bonus.

## Exact real test counts

`npm test` runs 20 tests, 20 pass, 0 fail, about 242 ms on this machine. Well inside the 60 second
budget. No network access anywhere.

- `tests/engine.test.js`: 158 content assertions plus 1 self audit assertion that locks the count
  at exactly 158. 12 tests total.
- `tests/accessibility.test.js`: 34 content assertions plus 1 self audit assertion that locks the
  count at exactly 34. 7 tests total. Four of the checkpoints compute real WCAG contrast ratios
  from the parsed CSS tokens and require 4.5 to 1 or better.
- `tests/bot-sweep.test.js`: 1 test with 12 assertions over the sweep run.

That is 192 content assertions and 206 total assertion calls. `scripts/dom-smoke.js` adds 24 wiring
checks outside the default suite.

## The bot sweep

The sweep is the playtest. It simulates exactly 592,704 schedule combinations: 8 city presets times
8 practice cards times 21 humidity levels times 21 sunlight levels times 21 wind levels. For every
combination it evaluates each schedule block with the game engine (1,629,936 block evaluations),
recomputes the same reading with an independent inline oracle, and checks:

- engine versus oracle agreement within 1e-9,
- tier band agreement,
- determinism on repeat evaluation,
- WBGT inside its physical component bounds,
- monotonicity along the humidity, sunlight, and wind axes,
- scoring consistency for exact, one tier loose, and one tier cautious calls,
- that all five tiers actually occur.

The sweep finishes in about 205 ms.

## Honesty statement

Playtesting was conducted via automated bots over 592,704 simulated schedule combinations. No human
subjects took part in playtesting, and nothing in this repository or its docs should be read as
claiming otherwise.

## Honest caveats

- The globe temperature term is a simplified empirical model tuned for gameplay clarity. It is not
  Liljegren level instrumentation math and the game is not a substitute for a calibrated WBGT
  device.
- City presets are representative heat wave snapshots modeled in the spirit of NOAA climate
  extremes. They are not dated station records and should not be cited as such.
- Tier bands follow WBGT activity bands in the style used by UIL heat guidance. The game is
  educational and is not an authority on any league's current policy.
- The 34 accessibility checkpoints are static analysis over the markup and CSS, not a live browser
  audit. This build used no browser at all: the page was verified with static tests, a syntax
  check of the inline script, and the Node DOM stub smoke script. A real browser pass (focus order,
  screen reader announcement behavior, paint quality) is still worth doing before demoing.
- The WBGT engine is well covered by tests; the presentation layer is covered by the 24 stub
  checks and static analysis only.
- The sweep's scoring checks cover the opening block of every combination, not every block of
  every combination, to keep the run fast.

## Devpost bullets

- Flag Call turns wet bulb globe temperature science into a decision game: blend air temperature,
  humidity, radiant heat, and wind into one WBGT reading, then call the flag for every block of a
  real practice card across eight city heat snapshots including Houston at 101 F and Phoenix at
  118 F.
- A nine step Day 1 walkthrough teaches the five flag bands (Normal, Watch, Caution, Warning,
  Danger) on a live Houston afternoon before Free Play unlocks all eight cities and eight practice
  cards.
- Two one tap judge shortcuts, "See an Unsafe Plan" and "Show the Safe Call", put the heat policy
  reasoning on the table instantly, on desktop or in the sticky mobile run bar.
- The engine is verified by 192 content assertions across 20 node:test tests (158 engine, 34
  accessibility checkpoints with real computed contrast ratios), including an independent
  psychrometric cross check of the wet bulb math. Static, vanilla, zero dependencies, GitHub Pages
  ready.
- Automated bot playtesting simulated 592,704 schedule combinations (1,629,936 block evaluations)
  against an independent oracle in about a fifth of a second, checking determinism, physical
  bounds, weather axis monotonicity, tier agreement, and scoring consistency.

## Verification log

- `npm test`: 20 of 20 passing, 0 failing, duration about 242 ms.
- `node scripts/dom-smoke.js`: 24 of 24 checks passing.
- Honesty and privacy scans: no em or en dashes anywhere, no emoji, no private email or address
  strings, no school, city, or club claims about the author.

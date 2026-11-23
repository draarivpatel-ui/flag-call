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
- `scripts/dom-smoke.js`: a Node side wiring check with a minimal DOM stub (33 checks across a
  reduced motion pass and a normal motion pass). Not part of the default suite.
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
- Scoring: exact 100, one flag above the recommendation (overcautious) 75, two or more above 40,
  one flag below the recommendation (undercall) 15, two or more below 0 and marked unsafe, plus a
  capped 50 point exact streak bonus.

## Exact real test counts

`npm test` runs 670 tests, 670 pass, 0 fail, about 0.6 s on this machine. Well inside the 60
second budget. No network access anywhere.

- `tests/engine.test.js`: 178 content assertions plus 1 self audit assertion that locks the count
  at exactly 178. 14 tests total.
- `tests/accessibility.test.js`: 34 content assertions plus 1 self audit assertion that locks the
  count at exactly 34. 7 tests total. Four of the checkpoints compute real WCAG contrast ratios
  from the parsed CSS tokens and require 4.5 to 1 or better.
- `tests/bot-sweep.test.js`: 1 test with 12 assertions over the sweep run.
- `tests/crypto.test.js`: 1,728 content assertions plus 1 self audit assertion that locks the
  count at exactly 1728. 544 tests total.
- `tests/lab.test.js`: 1,463 content assertions plus 1 self audit assertion that locks the count
  at exactly 1463. 104 tests total.

That is 3,403 content assertions and 3,419 total assertion calls. `scripts/dom-smoke.js` adds 33
wiring checks outside the default suite, 25 on the reduced motion pass and 8 on the normal motion
pass. `scripts/lab-smoke.js` adds 36 Audit Lab wiring checks, and `scripts/headless-audit.js`
adds 16 real Chromium checks across two viewports.

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
- scoring consistency for exact, one flag undercall, and one flag overcall,
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
- The WBGT engine is well covered by tests; the presentation layer is covered by the 25 stub
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
- The engine is verified by 212 content assertions across 22 node:test tests (178 engine, 34
  accessibility checkpoints with real computed contrast ratios), including an independent
  psychrometric cross check of the wet bulb math. Static, vanilla, zero dependencies, GitHub Pages
  ready.
- Automated bot playtesting simulated 592,704 schedule combinations (1,629,936 block evaluations)
  against an independent oracle in about a fifth of a second, checking determinism, physical
  bounds, weather axis monotonicity, tier agreement, and scoring consistency.

## Verification log

- `npm test`: 22 of 22 passing, 0 failing, duration about 1.2 s.
- `node scripts/dom-smoke.js`: 25 checks on the reduced motion pass plus 8 on the normal motion
  path, all passing.
- Honesty and privacy scans: no em or en dashes anywhere, no emoji, no private email or address
  strings, no school, city, or club claims about the author.

## Refinement Pass 2026-10-24

- Wiring proof. `scripts/dom-smoke.js` gains a second pass that runs the same init under normal
  motion with a pumped requestAnimationFrame clock, so the animated readout tween, the preset
  switch, and the dialogs are exercised on the path real visitors take. 8 more checks pass on top
  of the existing 24, and the HTML has no duplicate ids.
- Fixed. The page shipped no Open Graph tags; og:title, og:description, and og:type are now in the head.
- Fixed. No favicon existed. A code drawn inline SVG of the flag wordmark on the page background
  now ships as the icon, percent encoded so the markup still contains no network URL.
- Fixed. The two intro call to action buttons carried aria labels that did not contain their
  visible text, a label in name failure for voice control users. The visible text already names
  each button, so the extra labels came off.
- Fixed. The pinned run bar could crush its buttons at very narrow widths; it now wraps.
- Fixed. The walkthrough dot buttons drew at 14 px, under the 24 px pointer target floor; an
  invisible pseudo element widens each hit area with no change to the drawn dots.
- Accessibility and contrast rechecked from the tokens. Every text pair is at or above 4.5, the
  lowest being the warning color on panel 2 at 5.48. Labels, live regions, and the 44 px touch
  floor still hold, and the accessibility suite keeps its exact 34 checkpoint count.
- Risk left as is. The selected and keyboard focus styling on the flag choices uses the :has
  selector. Browsers without it still let the radio group work; the chosen flag just does not
  gain the accent ring.
- Tests: 20 before the pass, 20 after, all passing. Smoke: 24 checks plus 8 on the normal motion path.

## Revamp Pass 2026-11-21

- Fixed, scoring direction. `scoreCall` had the flag axis inverted: calling below the recommended
  flag (the dangerous undercall) scored 75 or 40 and read safe, while calling above it scored 15 or
  0 and was marked unsafe. The game's own unsafe plan scored zero unsafe calls. Direction is now
  undercall below, overcautious above, and the sweep and engine tests assert the real axis.
- Fixed, display and flag agreement. The tier was computed from the raw float while the readout
  showed one decimal, so a block could display 90.0 F WBGT next to a Warning flag. The tier is now
  computed from the same rounded value the player sees.
- Fixed, focus loss. Every flag selection rebuilt the schedule list and dropped keyboard focus.
  Focus now returns to the rebuilt control.
- Fixed, free play coach bleed. The walkthrough next and back controls still spotlighted and
  grabbed focus in free play. They are gated to walk mode and disabled outside it, and the dead
  `document.body.dataset.mode` write is gone.
- Fixed, live region scope. `aria-live` wrapped the animated readout, which announces every tween
  frame. It now sits on the tier chip, whose changes are discrete and meaningful.
- Fixed, smoke harness. `scripts/dom-smoke.js` had no `document.body` in its stub and crashed on
  the mode switch. Both stubs carry one, plus a focus restoration check.
- Fixed, input hardening. Non numeric weather inputs produced NaN readouts and a silent Normal
  flag. They now degrade toward the protective reading, and non numeric or out of range flag calls
  fail toward critical rather than safe.
- Fixed, physics guard. The Stull fit overshot the dry bulb by a few hundredths of a degree near
  saturation; wet bulb is now capped at the dry bulb value.
- Fixed, label in name. The city preset buttons carried aria labels that did not contain their
  visible text. The visible text names them, so the override came off.
- Hygiene. `html { scroll-behavior: smooth }` removed; the reduced motion block still covers the
  JS scrolling calls, which already honor the preference. The header tagline under the title is
  gone; the title stands alone.
- Tests: 20 before the pass, 22 after, all passing. Assertions: 192 content, 212 after. Smoke: 25
  checks plus 8 on the normal motion path.

## Audit Lab Pass 2026-11-23

Added a full width Audit Lab workbench under the game grid, built around three new modules plus
markup, styles, and test coverage. The lab exercises the same `js/engine.js` the game scores on;
no parallel ruleset was written.

- `js/sha256.js`: a standalone FIPS 180-4 SHA-256 in pure JS, about 90 lines, exporting for Node
  (`module.exports`) and the browser (`FlagCallSHA256`). Verified against the FIPS known answers
  including the million `a` vector, plus a UTF-8 encoder that maps lone surrogates to U+FFFD.
- `js/lab.js`: the comparator core. Five scripted heat day scenarios (Gulf Surge, Desert Oven,
  Blue Front, Steam Dawn, Evening Hang) tuned against real engine outputs so each produces
  genuine band crossing edge cases. Five calling policies (Band Exact benchmark, Dry Bulb Guess,
  One Flag Caution, Cancel Everything, Stale Read) run every block of every scenario under a
  stress shift of -20 to +20 F. Metrics: points, percent, grade, unsafe undercalls, worst flag
  gap, worst temperature exposure past the called flag ceiling, over restriction count, and delta
  from benchmark. Also JSON, CSV, and Markdown audit brief exporters with an unkeyed SHA-256
  trailer line (labeled as tamper detection, not a signature), CSV formula injection
  neutralization, a replay verifier, the strict `#fc=v1.s<p>.t<s>` bookmark codec, and a 22 check
  self test suite. Browser dependencies resolve through `typeof` guards so the file shares global
  scope cleanly with `engine.js` and `sha256.js`.
- `js/lab-ui.js`: the DOM adapter, loaded as an external script so the single inline script
  expectation in the smoke suite still holds. Renders the scenario select, stress slider,
  bookmark button, a band annotated WBGT line chart, the policy comparison table, a policy score
  bar chart, export and verify controls, and the self test list. All charts are inline SVG built
  from strings; no canvas and no library.
- `index.html`: the lab section is a sibling of `.game-layout` inside `.wrap`, so it spans the
  full wrap width on desktop and stacks naturally on mobile. Script order is engine, sha256, lab,
  the inline game script, then lab-ui so lab-ui can read the globals it needs.
- `styles.css`: lab block styles (controls row, subheads, chart wells, table, self test list)
  plus the mobile fix that motivated the layout change: `.game-layout` became
  `minmax(0, 1fr)` and `.lab-table-wrap` gained `min-width: 0` so the 660 pixel comparison table
  scrolls inside its wrapper instead of stretching the grid track and the whole page.
- Fixed during development. `var FlagCallEngine` and friends at the top of `lab.js` collided with
  the `const` globals in `engine.js` and `sha256.js` under the browser's shared script scope,
  killing the lab script silently in Chromium while Node tests stayed green. Resolved with
  `typeof` guards instead of redeclarations. The headless audit caught this; Node alone did not.
- Fixed during development. Lone trailing high surrogates encoded as raw bytes instead of the
  U+FFFD replacement character; `encodeBookmark` let `NaN` slip through the clamp; and the
  Markdown and CSV exporters hashed a body that included a trailing newline the verifier
  stripped, so self verification always failed. All three are covered by regression tests now.
- Representative comparator findings at 0 F shift: Band Exact scores 400 of 400 on every
  scenario; Dry Bulb Guess bleeds points overcalling the desert arc (88 percent on Gulf Surge);
  One Flag Caution leaves real exposure (5 F past its ceiling on Gulf Surge, 2 unsafe calls);
  Cancel Everything stays safe but wastes 8 blocks to over restriction; Stale Read runs 11 F
  past its ceiling on Gulf Surge. These are deterministic outputs, recomputed live.
- `scripts/lab-smoke.js`: 36 DOM stub checks across scenario controls, the stress shift, both
  charts, all three exports, verify and tamper paths, bookmark copy and hash restore, and the
  self test button.
- `scripts/headless-audit.js`: a zero dependency CDP driver (built in WebSocket on Node 26) that
  launches real headless Chromium at 1440x900 and 390x844, fails on console errors, uncaught
  page errors, browser log errors, external network requests, or horizontal overflow, and checks
  that the game UI, both SVG charts, the comparison table, and the in page self tests (22 of 22)
  all render. 16 checks, 0 failures.
- Tests: 22 before the pass, 670 after, all passing. Content assertions: 212 before, 3,403
  after. Smoke: 33 dom checks plus 36 lab checks. Headless audit: 16 checks. The lab section adds
  no external requests; the CSP is unchanged.
- Honesty note: the digest is unkeyed SHA-256 tamper detection, never described as a signature.
  All "verify" flows recompute rather than trust, and every number in the README, this file, and
  the tests was read off live runs, not written from memory.

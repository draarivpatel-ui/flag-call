# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/flag-call/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers the static Flag Call browser game, the wet bulb globe temperature engine, schedule scoring, the audit lab, checksum-backed exports, bookmark links, local storage and browser rendering.

In scope:

- A cross-site scripting or HTML injection path through weather values, schedule content, audit output, bookmark state, verification input or exported reports.
- A validation or state-transition flaw that corrupts score state, bypasses documented input bounds or presents tampered audit output as verified.
- A checksum, canonicalization or bookmark-decoding flaw that causes corrupted or attacker-controlled state to be treated as authentic.
- A CSV, JSON or Markdown export flaw that makes generated output execute a formula or script when opened.

Out of scope:

- Use of this educational game as a medical, athletic or workplace safety authority.
- Browser vulnerabilities, operating system compromise or physical access to the machine.
- The documented approximations and invented practice scenarios, unless a report shows a specific validation or output integrity failure.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.

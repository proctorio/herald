# Chrome Web Store Submission Runbook

Status as of 2026-08-14, against the checklist in `07-store-submission.md`.
Three lanes: what automation has verified, what the submitter does at upload
time, and what manual QA covers before or alongside review.

## Verified by automation (green on every PR and re-verified on the artifact)

| Item | Status |
|---|---|
| Production artifact | `build/herald-<version>.zip` (production: clean icons and name) built by `npm run package`; the beta channel package is assembled by the internal release pipeline |
| Audit scripts clean against the UNPACKED ZIP, not just the tree | PASS (the packaging gate also fixed a hole where dist audits scanned nothing; a canary test now proves the gate is live) |
| No `key`, no `oauth2`, MV3, version 1.0.0 | PASS (`verify-manifest.sh`: 0 blocking) |
| Five install permissions, no install-time host permissions, every permission justified | PASS (`PERMISSIONS.md`) |
| No `webRequest` or `declarativeNetRequest` | PASS |
| Zero network egress in default mode | PASS (automated Playwright gate plus static sweep; no fetch call sites exist in first-party code) |
| No source maps, no tests, no `.env`, no `node_modules` in the package | PASS (zip inspected) |
| `NOTICE` and `LICENSE` in the package | PASS |
| Branding: no upstream name in any casing anywhere except the attribution surfaces | PASS (case-insensitive audit) |
| Accessibility: axe zero violations, all pages, both themes, including during playback | PASS (hard e2e gate) |
| Unit suite 270 tests, coverage over 80 on all four metrics | PASS |

## Submitter lane (Mike, at upload time)

1. Developer dashboard: upload `build/herald-1.0.0.zip` under the Proctorio
   Inc. verified publisher account.
2. Listing fields from `introduction.md`: title `Herald, Text to Speech
   Reader` (no Proctorio in the title), short and long descriptions verbatim,
   category Accessibility. The attribution and non-affiliation line at the
   bottom of the long description is required, not optional.
3. Screenshots: at least 3 (popup during a read with highlighting, options
   page, a page being read). Produce fresh; never reuse upstream imagery.
   Promo tile: a draft exists at `docs/herald/promo-tile-440x280-draft.png`;
   replace with commissioned art if available (open question 6).
4. Privacy tab: policy text lives at `docs/herald/PRIVACY.md` and is hosted
   by the public GitHub repository; link
   `https://github.com/proctorio/herald/blob/main/docs/herald/PRIVACY.md`.
   Data disclosures: collects NOTHING; single purpose: reads page text
   aloud. The disclosures must match the manifest, and they do.
5. Homepage URL: `https://github.com/proctorio/herald`. Support URL:
   `https://github.com/proctorio/herald/issues` (DECIDED: the GitHub
   repository is the community front door for contact, issues, discussions,
   and pull requests; issues reach maintainers, and the accessibility issue
   template is the distinct accessibility path).
6. Before going live: USPTO confirmatory clearance on the name (open
   question 1; held alternates Rostrum, Sonant, Praelector).
7. ON APPROVAL, SAME DAY: record the assigned extension ID in `FORK.md`
   (never change it afterward) and open the Proctorio allow-list ticket plus
   partner allow-list tickets per `04-proctorio-compatibility.md`.
8. Expect one review round; the differentiation statement in the long
   description is the reviewer's answer to the duplication policy.

## Manual QA lane (Christopher, per the internal QA workbook)

1. Functional sheet: the 33 F-tests. The former blockers (answer choices,
   alt text) have automated regression fixtures, but the live Canvas pass
   in a real Proctorio session is the acceptance evidence. Note: New Quizzes
   launched through assignment URLs are a known gap flagged for this pass.
2. Compatibility sheet: the 63 C-tests across the Proctorio settings matrix
   (recordings valid, no unexpected flags, lockdown option combinations).
   Log every integrity flag observed, related or not.
3. Accessibility sheet: the 18 A-tests plus the screen reader matrix (NVDA,
   JAWS, VoiceOver, ChromeVox), double-speech checks, and Windows High
   Contrast review. Automation guarantees markup; only humans hear quality.
4. Exam-safe mode: verify the toggle behavior matches the options
   description in a live session; the overlay auto-announce ships disabled
   until the extension team provides the overlay selector (decision D15).

## Blocked or deferred, tracked

- D15 overlay selector (extension team) gates the F-029/F-030 auto-announce
  tests; manual replay of overlays works today.
- Commissioned icon artwork (open question 6) may replace the in-house
  placeholder set at any time before or after submission; it changes no code.
- Non-English locales return post-1.0 via retranslation (decision D10).
- VPAT via the Deque engagement (open question 7) and the public
  accessibility statement are launch blockers per the build plan, not
  submission blockers.

# 00. Implementation Plan

The comprehensive work order to take the read-aloud fork and ship it as
Herald. This plan binds together the build brief (02 to 07), the field
findings and QA plan (internal documentation vault), and a full code survey of the fork at commit
7f2764b performed on 2026-08-12. Every code claim below was verified against
the actual source; file:line references are to the fork commit.

Read this first, then work the milestones in order. The phase numbers from
`06-build-plan.md` are preserved; this plan adds a modernization workstream
(Phase 3.5) and folds the field findings into Phase 5.

## Baseline, measured

State of the pristine fork, quantified with the repo's own gates:

- `scripts/verify-manifest.sh`: FAILED, 4 blocking (inherited `key`,
  inherited `oauth2` block, `identity` permission, `webRequest` permission),
  9 warnings.
- `scripts/audit-remote-code.sh`: FAILED, all 10 categories, 181 findings.
- 154 source files. No tests, no lint, no build step, no npm dependencies.
  100 percent script-tag globals, zero ESM.
- Five JS contexts: service worker (thin RPC router), player page (all
  synthesis and all network engines), popup and options pages, injected
  content scripts (22 per-site extractors), offscreen document (audio only).

## Corrections to the build brief

The survey found eight places where the brief and the code disagree. Per
CLAUDE.md, the code wins. The brief docs stay as written for provenance;
this section is authoritative where they conflict.

1. Google Docs injection is PRESENT, not absent. `js/page/google-doc.js:1`
   sets `window._docs_annotate_canvas_by_ext` to a third party's extension
   ID (`ljflmlehinmoeknoonhibbjpldiijjmm`, neither upstream's nor ours) via
   a MAIN-world content script registered at `document_start` on
   `docs.google.com/document/*` (`js/events.js:36-43`). Phase 3's "confirm
   absent" is real removal or redesign work.
2. The premium tier composition differs from `02-fork-delinking-plan.md`.
   Server synthesis through the author's server covers Amazon cloud,
   Microsoft cloud, and RHVoice voices (`js/defaults.js:302-304`). WaveNet,
   Polly, Watson, Azure, and OpenAI are separate bring-your-own-credentials
   engines that call providers directly. The two deletion scopes are
   distinct and both are in Phase 2.
3. Sec-Fetch-Site header rewriting does not exist in this tree. The live
   `webRequest` use is `authWavenet()` (`js/events.js:294-352`), which
   sniffs a Google demo-page token from `cxl-services.appspot.com` traffic
   and requests `https://*/` host access to do it. Remove that flow.
4. There is no extension-runtime S3 page-script loader at this commit.
   `page-scripts/` is a staging dir synced TO S3 by the npm script; the
   packaged zip excludes it. `loadPageScript()` (`js/content.js:162`) has
   zero callers. Still delete all of it.
5. The brief undercounts remote endpoints. Beyond readaloud.app and
   lsdsoftware.com there are six remote iframes: `piper.ttstool.com`,
   `supertonic.ttstool.com`, `nghitts.ttstool.com`, `ttstool.com/fasttext`,
   `ttstool.com/ocr.html` (Kindle OCR), and the remote PDF viewer on
   `assets.lsdsoftware.com`. Plus `translate.google.com` synthesis,
   `cxl-services.appspot.com`, the PeerJS public broker, and a remote
   Google Fonts stylesheet in `popup.html:8`.
6. `templates/` paths in `06-build-plan.md` refer to the handoff package
   layout. In this repo: `FORK.md` and `NOTICE` are at root, the privacy
   skeleton is `docs/herald/PRIVACY.md`.
7. Locale message keys are `extension_name` / `extension_description`, not
   the `extName` sketch in `03-branding-spec.md`. Keep the existing keys.
8. No hardcoded upstream-extension-ID checks exist in runtime code. The IDs
   that do appear in runtime code are third-party (EPUBReader, Adobe
   Acrobat, the Docs annotate token above).

Findings the brief missed entirely, all confirmed and all must-fix:

- Credential exfiltration path: every playback error auto-fires
  `reportIssue` (`js/player.js:361-370`), POSTing the page URL and the full
  settings JSON, which includes stored AWS, GCP, IBM, Azure, and OpenAI
  credentials and the auth token, to the author's server
  (`js/events.js:280-292`).
- `chrome.runtime.onMessageExternal` accepts play/pause/stop/resume from
  ANY website, with arbitrary text, no sender allow-list
  (`js/events.js:128-149`).
- The popup auto-starts reading when opened (`js/popup.js:75-77`).
- Server-rendered announcement HTML is injected into the popup DOM with an
  unescaped link (`js/popup.js:398`).
- MathML is POSTed to the author's server for speech conversion
  (`js/content.js:226`); language detection falls back to a remote service
  (`js/document.js:299`).
- Full page text of the default free voice path goes to the author's server
  as a GET query string (`js/tts-engines.js:248`), and auto-selection can
  pick that path without an explicit user choice (`js/defaults.js:327-330`).

## Product decisions this plan assumes

These are the recommendations from 08 plus new ones surfaced by the survey.
Each is marked with its owner. Items marked RECOMMENDED are what this
plan builds unless the owner overrides; items marked OWNER block their
milestone.

| # | Decision | Position |
|---|---|---|
| D1 | Bring-your-own-key cloud voices | RECOMMENDED: cut entirely for 1.0. Voices are `chrome.tts` plus Web Speech only. Absolute zero-network claim. Revisit in 1.1 behind an off-by-default toggle that exam-safe mode overrides. |
| D2 | Google Translate voice engine | RECOMMENDED: cut. Unofficial scraped endpoint, breaks silently, sends text to Google, sole reason for the translate.google.com host permission. |
| D3 | Piper, Supertonic, NghiTTS, phone pairing, Kindle OCR | RECOMMENDED: cut. All depend on remote iframes or the PeerJS public broker. |
| D4 | PDF support | RECOMMENDED: drop for 1.0 (viewer is remote-hosted). Revisit with a vendored pdf.js viewer if demand appears. |
| D5 | Google Docs support | OWNER. Options: (a) drop for 1.0, (b) keep the SVG-canvas extraction path with our own handling and no foreign annotate token. LMS exams rarely run in Docs; recommend (a) for 1.0. |
| D6 | Site-handler scope | RECOMMENDED: keep the generic extractor plus education handlers (Canvas handler is new work, plus google-drive, google-slides, onedrive, pearson, wwnorton, ixl, khan-academy, acrobatiq). Kill kindle-book, chatgpt, webnovel, yd-app-web, libbyapp, chegg-book, vitalsource, google-play-book (paywalled ereaders, off-thesis). |
| D7 | Popup auto-play on open | RECOMMENDED: remove. Reading starts only on explicit user action. Aligns with the accessibility spec and exam integrity. |
| D8 | External messaging API | RECOMMENDED: restrict via `externally_connectable` to the Proctorio extension ID(s) instead of deleting. This becomes the exam-signal channel for open question 5 (exam-safe mode auto-engage) when the extension team is ready; the manual toggle ships first. |
| D9 | UI surface under Force Full Screen and Block New Tabs | RECOMMENDED: popup remains primary; add `chrome.sidePanel` as the persistent surface (opens without a tab or window, survives full screen); the player never opens tabs in exam-safe mode (embedded iframe or offscreen only). The pinned player-tab fallback (`js/events.js:472-479`) is removed. |
| D10 | Locales | RECOMMENDED: ship English complete at 1.0, keep the `_locales` infrastructure, mark others unshipped until retranslated (per 03). |
| D11 | ESLint filename convention | RECOMMENDED: adopt `@proctorio/eslint-config` fully, with one repo-level override: kebab-case filenames for extension source (web-extension convention, keeps names near upstream for cherry-pick archaeology). Tests use house `*.Test.js` PascalCase. |
| D12 | Reformat timing | RECOMMENDED: one dedicated mechanical reformat commit inside Phase 3.5, after subtraction and after the ESM conversion, never interleaved with logic changes. |
| D13 | jQuery | RECOMMENDED: keep vendored through 1.0 (447 call sites), remove in a post-1.0 cleanup. RxJS moves from vendored UMD to a pinned npm copy during Phase 3.5. |
| D14 | Bootstrap CSS | RECOMMENDED: replace with small custom CSS during Phase 6 (only player, shortcuts, languages pages still need it after subtraction). |
| D15 | Overlay auto-announce exception | OWNER plus extension team: confirm the DOM signature of Proctorio intervention overlays so detection can be scoped to them alone. See Phase 5. |

Open questions 1 to 12 in the internal open-questions document remain
live; D1 resolves
open question 4 and D8 tees up open question 5. USPTO clearance (Q1),
domain (Q2), privacy policy hosting (Q3), icon commissioning (Q6), VPAT
scope (Q7), and support channel (Q9) are external tracks that can run in
parallel with all engineering milestones and only block Phase 8.

## Milestones

Each milestone is a PR (or short PR series) into `main` with its
acceptance gate. Phases 1 and 2 remain blocking as in the brief.

### M0. Repo bootstrap (Phase 0), mostly done

Done already on `setup/fork-import` (the setup PR): fork imported at
7f2764b with full history, remotes wired (`origin`, `github` fork,
`upstream` ken107/read-aloud), handoff docs installed, `FORK.md` and `NOTICE` filled,
field findings and QA plan recorded in the internal documentation
vault, audit scripts run for baseline.

Remaining:

- `INVENTORY.md`: commit the file-by-file inventory with keep/kill/rework
  verdicts (survey output; place at `docs/herald/INVENTORY.md`).
- CI: add `pr.yml` (core-templates `PR/js/default.yml`, `testing: true`)
  and `sync.yml` (mirror main to github.com/proctorio/herald), modeled
  on hulk.js. Wire the branch policy to pr.yml.
- GitHub: switch the fork's default branch to `main` once sync publishes
  it. Keep upstream's `master` untouched as a reference branch.
- PR template reminding authors that a fork's GitHub PR base defaults to
  the parent repo.
- Delete `docs/` (the upstream readaloud.app website: marketing pages,
  login/logout relays, Stripe purchase page, GA beacon, CNAME, and a
  456 KB signed upstream CRX). None of it is extension code. This single
  deletion removes a large share of the 181 audit findings.

Acceptance: pipelines green on a docs-only change; `docs/` gone;
INVENTORY.md committed; GitHub mirror shows `main`.

### M1. Identity de-linking (Phase 1, BLOCKING)

Exactly as `06-build-plan.md` Phase 1, with survey-verified targets:

- `manifest.json`: delete `key` (line 19), delete the whole `oauth2` block
  (lines 20 to 27), drop `identity` from permissions.
- `package.json`: name `herald`, `private: true`, author Proctorio,
  repository github.com/proctorio/herald, delete `sync-page-scripts`.
- Remove upstream identity strings: `js/report.js:25` (author's personal
  email), `README.md` store links and badges, `options.html:55` and
  `js/content/google-doc.js:170` (blog links).

Acceptance: `verify-manifest.sh` shows no key, no oauth2, no identity; the
identity sections of `audit-remote-code.sh` are clean; extension loads
unpacked without errors.

### M2. Server de-linking and permission minimization (Phases 2 and 3, BLOCKING)

The big subtraction, done on the upstream-shaped tree BEFORE any
modernization so each removal is a clean, reviewable diff. Kill list, all
verified by the survey:

Engines and features (D1 to D6):
- `PremiumTtsEngine`, account, entitlement, sign-in, purchase surfaces:
  `js/tts-engines.js:197-260`, `js/defaults.js:644-717` (getAuthToken,
  clearAuthToken, getAccountInfo), `options.html:28-33` account block,
  `js/options.js:36-48,497-505`, sign-in link handlers in popup and
  options, premium voice grouping (`js/options.js:334-407`), premium locale
  strings, the broken `premium-voices.html` reference (`js/options.js:78`).
- BYO cloud engines: AmazonPolly, GoogleWavenet (and cxl-services proxy),
  IbmWatson, OpenAI, Azure (`js/tts-engines.js:486-1105`), plus
  `custom-voices.html`, `js/custom-voices.js`, `js/aws-sdk.js`.
- GoogleTranslate engine: `js/google-translate.js`, engine registration,
  the `https://translate.google.com/` host permission, `TimeoutTtsEngine`
  usage tied to it.
- Remote-iframe engines and services: Piper, Supertonic, NghiTTS, FastText
  (`js/player.js:9-126,503-600`, `js/tts-engines.js:1107-1356`), their
  dispatchers and manage* handlers, the COOP/COEP manifest keys that exist
  only for them.
- Phone pairing: `PhoneTtsEngine`, `js/peerjs.min.js`, `connect-phone.*`.
- Kindle OCR handler and the other D6 kill-list handlers.
- PDF: `pdf-viewer.html`, `js/pdf-viewer.js`, `js/content/pdf-doc.js`,
  `config.pdfViewerUrl`.
- `page-scripts/` directory entirely; `loadPageScript()` dead code.

Telemetry and stray egress:
- `reportIssue` and `report.html`/`js/report.js`; the auto-fire on playback
  error (`js/player.js:361-370`).
- Popup announcements (`js/popup.js:366-398`).
- Server MathML (`js/content.js:226`): degrade to skipping math with the
  existing visible-text fallback, or announce "math content" locally.
- Server and iframe language detection (`js/document.js:254-311`): local
  `i18n.detectLanguage` only, with the Phase 5 F8 fixes.
- Demo speech text fetch (`js/options.js:226`): use a bundled string.
- Google Fonts stylesheet in `popup.html:8`: bundle or drop the font.
- `getRemoteConfig` dead code (`js/defaults.js:898-917`).

Permissions and injection (Phase 3):
- Remove `webRequest` and the whole `authWavenet` flow
  (`js/events.js:294-352`, `js/defaults.js:28-31`, request sites in popup
  and options).
- Remove `ttsEngine` (declared, never used) and `identity` (M1).
- Keep and justify in `docs/herald/PERMISSIONS.md`: `activeTab`,
  `contextMenus`, `offscreen`, `scripting`, `storage`, `tts`. Keep
  `webNavigation` optional (frame resolution for the Canvas handler, see
  Phase 5). Review `optional_host_permissions` scope after handler pruning.
- Remove the Google Docs MAIN-world script and foreign annotate token per
  D5, or replace with our own design if (b) is chosen.
- Restrict or remove `onMessageExternal` per D8.
- Remove popup auto-play (D7).
- Remove the pinned player-tab path (D9): embedded iframe and offscreen
  only. (With Piper gone, the "must use tab player" condition disappears.)

Acceptance: both audit scripts fully clean (0 findings, not fewer);
loading unpacked and exercising every surviving UI path with DevTools
Network open shows ZERO outbound requests; voice picker lists only voices
that resolve; no dead UI. This is the zero-egress moment; everything after
builds on it.

### M3. Modernization (new Phase 3.5): ESM, build, lint, tests, CI gates

Sequenced after subtraction so the conversion is mechanical and the
security diff stayed readable. Target stack matches the sibling Proctorio open source repos.

Layout and build:
- Restructure to house layout: extension source to `src/` (manifest, html,
  js, css, img, sound, `_locales`), tests to `test/`, build output to
  `dist/`. The store zip is built from `dist/` only.
- ESM conversion, one file per commit, no logic edits. Native ESM for the
  service worker (`"type": "module"`) and pages (`<script type="module">`),
  so shipped SW/page code is source code with no transformation: the best
  auditability posture for store review and institutional review.
- Content scripts must stay classic scripts: a ~50-line pinned esbuild
  script emits one IIFE bundle per content entry into `dist/`, preserving
  the two-phase runtime injection. Assign `globalThis.brapi` explicitly so
  the re-injection sentinel keeps working.
- Known traps (from the survey, mitigations in place): the `voices$` to
  tts-engines circular forward reference (break by moving `voices$` next to
  the engines), `readAloudDoc` global protocol across separately injected
  handler files, per-page script subsets, synchronous event-listener
  registration in the module service worker, the `Array.prototype.groupBy`
  polyfill ordering.
- Extract `brapi` into its own module: the single chrome touchpoint, and
  the single mock seam for tests.
- Replace vendored `rxjs.umd.min.js` with a pinned npm rxjs (test copy
  equals runtime copy). jQuery stays vendored for 1.0 (D13).

Lint:
- `@proctorio/eslint-config` (exact-pinned, ESLint 10 flat config), the
  D11 filename override, and the D12 single reformat commit. No prettier,
  no editorconfig, matching the other repos.
- `npm run lint` / `lint:check` script names per house convention.

Tests (vitest, house config):
- vitest + `@vitest/coverage-v8`, exact-pinned; house `vitest.config.js`
  shape: `test/**/*.{Test,test}.js`, globals true, junit + cobertura
  reporters to `.test_output/`, v8 coverage over `src/**`, thresholds 80
  across branches, statements, functions, lines.
- Mocking: `@webext-core/fake-browser` for storage/runtime/tabs behavioral
  fakes; hand-rolled typed stubs for `chrome.tts`, `chrome.offscreen`,
  `chrome.scripting`, `chrome.contextMenus`, `chrome.commands`; hand-rolled
  `speechSynthesis` and `Audio` fakes (jsdom implements neither); real npm
  rxjs with TestScheduler marbles for the playback pipelines.
- Unit-test targets, highest value first: text extraction (`html-doc.js`)
  against LMS fixture DOMs, chunking and seek math (`speech.js`), voice
  selection (`defaults.js`), messaging dispatchers, content-handler URL
  routing, settings observables, `Doc` state machine.
- LMS fixture corpus: saved DOM captures of the standardized quizzes in
  the internal QA plan's test-content sheet (Canvas Classic and New, Blackboard Ultra and
  Original, D2L, Moodle), with expected extraction transcripts. These
  fixtures are what make the field-finding blockers regression-proof.
- Integration (Playwright + pinned Chrome for Testing, `--load-extension`):
  1. The zero-egress gate as an automated test: exercise popup, play,
     stop on a fixture page and assert no request leaves the browser except
     allow-listed extension URLs. This automates the CLAUDE.md manual gate
     and permanently pins M2.
  2. Service worker boot health (the current bootstrap swallows errors).
  3. Injection pipeline: play on a fixture page, assert handler injection
     and highlight DOM.
  4. Popup and options pages driven at `chrome-extension://` URLs,
     including axe-core scans (zero violations, wired as a test).
  CI caveat: Linux runners expose no chrome.tts voices; assert engine
  selection and state transitions, keep audible-playback smoke manual or
  on a Windows runner.

CI:
- `pr.yml` runs lint:check plus `npm test` (coverage thresholds are the
  gate, enforced by vitest config, same as hulk.js).
- The two audit scripts join the PR pipeline as a hard step, run against
  both the source tree and a fresh `dist/` build.

Acceptance: CI green with coverage at or above 80 on all four metrics;
audit scripts clean against `dist/`; extension behavior verified unchanged
by the integration suite before and after the ESM conversion.

### M4. Rebrand (Phase 4)

Per `03-branding-spec.md`, with survey corrections:

- `manifest.json`: keep the existing `__MSG_extension_name__` key names,
  set values via `_locales/en/messages.json` to "Herald"; `short_name`
  "Herald"; version reset to `1.0.0`.
- English locale rewritten completely; delete premium, account, payment,
  phone, and report strings orphaned by M2; other locales handled per D10.
- Icons: new original artwork at 16, 32, 48, 128 plus monochrome
  high-contrast variant and the 440x280 promo tile (open question 6 must
  be resolved by now). Delete every `img/` upstream asset and the orphaned
  jQuery-UI sprites in `css/images/`.
- README rewritten for Herald in the house style (hulk.js structure:
  pitch, features, install, usage, development, contributing, author
  Proctorio; no emojis, no em-dashes, no stale static badges). Rewrite
  `introduction.md` as store-listing copy or fold it into docs.
- About/Credits surface in options: upstream attribution, MIT license
  text, non-affiliation line (satisfies the "included in all copies"
  obligation in a distributed binary).
- `tools/i18n.js`: retarget away from the upstream GCP project or park it
  until D10's retranslation effort.

Acceptance: Phase 4 grep gate as written in the brief (case-insensitive
"read aloud" hits only in NOTICE, FORK.md, LICENSE context, and the About
surface); no upstream artwork by file hash; icon legible at 16px in light
and dark themes.

### M5. Exam behavior: the field findings and Proctorio compatibility (Phase 5)

Root causes are pinned; fixes below reference them. LMS fixtures from M3
turn each into a regression test. QA IDs refer to the internal QA plan (functional and
compatibility sheets).

**F4, answer choices (Blocker; F-019, F-027, C-034 to C-039).** The
extractor takes `innerText` only and pre-hides every `<label>` (the
`ignoreTags` list at `js/content/html-doc.js:5`, hide at :141), which is
exactly where Canvas puts radio and checkbox answer text; Canvas's
screen-reader-only legend "Group of answer choices" survives and leaks.
Fix: stop ignoring labels bound to radio/checkbox inputs; add fieldset
handling that reads choices in order with option numbering (the numbering
span mechanism at :156 already exists); suppress or replace sr-only legend
noise. Add a Canvas content handler (new `js/content/canvas-quiz.js`)
registered for `*.instructure.com`, with `getFrameId` targeting the quiz
LTI iframe for New Quizzes (cross-origin iframes are currently silently
skipped, `html-doc.js:101`; the Liberty University handler at
`content-handlers.js:161-182` is the in-tree precedent for this pattern).
Then extend the same treatment to Blackboard, D2L, and Moodle using the
fixture corpus.

**F5, image alt text (Blocker; F-020, F-028).** `innerText` never includes
alt. Fix: mirror the existing MathML surrogate-span pattern
(`js/content.js:196-248`): before reading a block, insert temporary spans
carrying `img[alt]` text at the image's position, remove after extraction.
Depends on F4's label fix for images inside answer labels.

**F7, click-to-read targeting (F-031 to F-033).** The clickable units in
the popup are TTS chunks, not paragraphs: `CharBreaker(750, ..., 200)`
merges short paragraphs into one chunk (`js/speech.js:6,58,389`), so
clicking the second paragraph of a merged chunk seeks to the chunk start,
which reads as "it played the previous section." Fix: render one span per
paragraph and seek by (chunk, offset), splitting playback at the nearest
sentence boundary (the sentence machinery exists at `js/speech.js:404`),
or stop merging for display. Also rebind spans immediately on engine state
change rather than waiting for the 500 ms poll.

**F8, voice and language consistency (High).** Detection overrides the
declared page language whenever they disagree (`js/document.js:316`), and
the context-menu path detects on the whole tab, then re-detects the (often
short) selection remotely. Fix: with remote detection already removed in
M2, add a confidence bar: prefer the declared or frame language unless
local detection is long enough (at or above 100 chars) and confident;
unify the context-menu path with the playTab selection path (see F-025),
which preserves paragraph structure, declared language, and MathML
handling; honor per-language preferred voices before switching languages.

**F6, overlay auto-announce (High; F-029, F-030).** Feasible with modest
changes, verified: a MutationObserver in the content script (which already
holds a live player RPC channel and a 5 s keepalive) detects the Proctorio
intervention overlay and calls a new `announce(text)` player method that
pauses the active utterance, speaks the announcement on the local browser
engine, then resumes. Constraints: detection must be scoped to Proctorio's
own overlay signature (D15, needs the extension team's selector or a data
attribute contract); the announcement queue must be reentrant; the content
script must be present, which today only happens after playTab (the
context-menu unification in F8 narrows that gap). This is the one sanctioned
exception to never-auto-read, documented in the internal
field-findings doc.

**F1 to F3, lockdown coexistence (High; C-029 to C-033, C-040 to C-051).**
Herald-side work: D9 (side panel surface, no tab or window creation
anywhere in exam mode, embedded player only), keyboard-first operation
(commands already exist; global stop moves to Phase 6), graceful
degradation when right-click is blocked (toolbar and shortcut paths cover
everything, C-033). Proctorio-side work (cross-team tickets, not Herald
code): allow-list exceptions for the extension popup and context menu
under Block New Tabs, Disable Right-Click, Disable Printing; Exam Toolbar
integration (F-002, C-030) rides on D8's `externally_connectable` channel.

**Exam-safe mode (Phase 5 core).** Manual toggle first (per 08 Q5
recommendation): local voices only (moot after D1 until BYO returns, but
the enforcement hook ships now), no persistence of read content, active
tab only, no tab or window creation, overlay announcements on. D8's
channel upgrades it to auto-engage later.

Acceptance: Phase 5 acceptance as in the brief (zero DOM nodes added until
a read is invoked, byte-identical DOM after stop via snapshot diff,
exam-safe mode disables every network-capable path) plus: all F-tests for
findings 4, 5, 7, 8 pass on all six LMS fixtures; F-029/F-030 pass against
a simulated overlay fixture; a live Proctorio session pass per the C-matrix
on at least Windows plus Chrome before sign-off.

### M6. Accessibility hardening (Phase 6)

As written in `05-accessibility-spec.md` and the internal QA
accessibility sheet (A-001 to A-018), with the survey-informed additions:

- The popup poll-and-redraw loop must not steal focus or reset the reading
  order for screen reader users; verify with the single polite live region.
- Keyboard: global stop from any focus location (`chrome.commands`), the
  Alt-key defaults from the spec, no collisions with JAWS/NVDA layers.
- Replace Bootstrap-dependent pages with small custom CSS (D14), fixing
  contrast and focus-visible styling in the same pass.
- axe-core scans are already automated in CI from M3; this milestone
  clears them to zero and completes the manual matrix (NVDA, JAWS,
  VoiceOver, ChromeVox, plus keyboard-only, zoom, high contrast, dark).

Acceptance: Phase 6 acceptance as in the brief; WCAG 2.2 AA target (the
QA plan's 2.1 AA rows pass as a subset).

### M7. Verification gate and store submission (Phases 7 and 8)

As written in the brief, no changes, with two additions:

- The production zip is built from `dist/`; both audit scripts run against
  the unpacked production build in CI, not just the tree.
- The privacy policy (`docs/herald/PRIVACY.md` skeleton) is finalized
  against the shipped code; with D1 through D4 taken, the "optional
  network features" section is deleted entirely and the store data
  disclosure declares nothing collected.

Launch blockers tracked as in the brief: store approval, Proctorio
allow-list, top partner allow-lists, VPAT update, accessibility statement.

## Testing strategy summary

| Layer | Tooling | Gate |
|---|---|---|
| Lint | ESLint 10, @proctorio/eslint-config + belgradian | PR pipeline, zero errors |
| Unit | vitest + coverage-v8, fake-browser + typed chrome stubs, LMS fixture corpus | 80/80/80/80 thresholds |
| Integration | Playwright + Chrome for Testing, loaded extension | zero-egress test, boot health, injection, popup UI, axe zero violations |
| Security | audit-remote-code.sh + verify-manifest.sh | PR pipeline, clean on tree and on dist |
| Manual | internal QA matrices (120 cases, 95 blockers), screen reader matrix, live Proctorio sessions | signed-off matrices before store upload |

## Risk register

1. ESM conversion regressions from implicit-global coupling (voices$
   cycle, readAloudDoc protocol, per-page script subsets). Mitigation:
   subtraction first, mechanical one-file commits, integration smoke per
   batch, no logic edits during conversion.
2. Canvas New Quizzes cross-origin iframe extraction requires optional
   `webNavigation` and host permission prompts. Mitigation: request at
   point of use with clear UX; test the permission prompt flow per LMS.
3. Overlay detection contract with the Proctorio extension (D15) slips.
   Mitigation: ship manual replay of overlays (F-023 baseline) and land
   auto-announce when the selector contract exists.
4. Store review flags the fork. Mitigation: 07's differentiation and
   non-affiliation lines, permissions minimized to six, zero-egress
   demonstrable, budget one rejection round as the brief says.
5. Supply chain expansion (vitest, esbuild, playwright devDeps in a
   formerly zero-dep repo). Mitigation: exact pins, committed lockfile,
   audit scripts cover dist, `.npmrc` pins the registry.
6. Diff-against-upstream erodes after reformat (D12). Mitigation: the
   divergence policy already limits upstream interaction to cherry-picked
   security fixes; FORK.md records the fork SHA for archaeology.
7. Linux CI cannot exercise chrome.tts voices. Mitigation: state-machine
   assertions in CI, audible smoke on Windows runner or manual.

## Immediate next actions

1. Owner review: the setup PR (fork import plus docs) and this plan;
   rule on D5, D15, and any D-item overrides.
2. GitHub publication happens ONLY through sync.yml after merge, exactly
   like our other open source repos. Never push to GitHub from a workstation:
   local pushes risk exposing private email identities in commit metadata.
   After the first sync, flip the fork default branch to `main`.
3. Engineering: M0 remainder (INVENTORY.md, pipelines, docs/ deletion),
   then M1 immediately (it is a one-day, high-value de-risk).
4. Parallel external tracks: USPTO clearance, domain, icon commissioning,
   Deque VPAT scoping (open questions 1, 2, 6, 7).

# Source Inventory

File-by-file inventory of the fork at commit 7f2764b, produced during the
2026-08-12 code survey. This is the Phase 0 map required by
06-build-plan.md: every file, what it does, and whether it survives.
Verdicts: KEEP, KILL, REWORK, VENDORED-LIB. Update this file as milestones
land; record actual removals in FORK.md's "Removed from upstream" table.

Thesis applied for verdicts: **local-first minimal reader, no server, no premium, no account**. "Server" findings cite the upstream backend `https://support.readaloud.app` / `https://readaloud.app` (defaults.js:6-8) and remote-code hosts `assets.lsdsoftware.com` / `*.ttstool.com`.

## Repo root

| Path | What it does | Verdict | Reason |
|---|---|---|---|
| `.gitignore` | Standard Node gitignore (logs, node_modules, build/dist) | KEEP | Neutral dev hygiene |
| `LICENSE` | MIT, Copyright (c) 2016 Hai Phan | KEEP | Required to retain for the fork |
| `README.md` | Upstream Read Aloud README: store links, ken107 badges, donation/premium mentions | REWORK | De-link from upstream brand, stores, blog |
| `introduction.md` | Store-listing marketing copy; advertises Polly/Wavenet paid voices, in-app purchase (introduction.md:20) | REWORK | Rewrite for Herald; premium copy must go |
| `manifest.json` | MV3 manifest: action popup, SW `background.js`, tts/ttsEngine perms, commands; also upstream CWS `key` (line 19), Google `oauth2` client for account login (lines 20-27), `identity` permission (line 31) | REWORK | Core skeleton keeps; strip `key`, `oauth2`, `identity`, translate.google.com host perm; rebrand `__MSG__` names |
| `package.json` | npm metadata + `package` zip script + `sync-page-scripts` that rsyncs to author's S3 bucket (line 10) | REWORK | Keep package script; delete S3 sync; rename/re-author |
| `package-lock.json` | Empty lockfile, zero runtime deps | KEEP | Confirms no-npm-deps build; regenerate on rename |
| `background.js` | SW bootstrap: `importScripts` rxjs, defaults, messaging, content-handlers, events (background.js:2-8) | KEEP | Minimal, local |
| `advanced-options.html` | Page with one checkbox: `fixBtSilenceGap` | KEEP | Local-only setting |
| `connect-phone.html` | "Use My Phone" pairing-code UI | KILL | Phone TTS uses PeerJS cloud broker, remote dependency |
| `custom-voices.html` | Forms to enter AWS/GCP/IBM/Azure cloud-TTS credentials | KILL | BYO cloud voices contradict local-first; sends text to third-party APIs |
| `languages.html` | Language-filter picker page | KEEP | Local voice filtering |
| `offscreen.html` | Loads offscreen.js for MV3 offscreen audio playback | KEEP | Core local audio path |
| `options.html` | Options UI: voice select, rate/pitch/volume, highlighting; includes account/logout buttons and premium optgroup hooks | REWORK | Keep controls; strip account section and premium group |
| `pdf-viewer.html` | Shell page hosting an iframe of the **remotely hosted** PDF viewer (`config.pdfViewerUrl`) | REWORK | PDF support requires vendoring a local pdf.js viewer, else KILL |
| `player.html` | Hidden player page; loads peerjs, aws-sdk, google-translate, tts-engines, speech, document, player (player.html scripts) | REWORK | Keep player shell; drop peerjs/aws/google-translate includes |
| `popup.html` | Main playback popup (play/pause/stop/settings, highlight box, dark mode) | KEEP | The product |
| `report.html` | "Report issue" form; posts settings dump + comment to upstream server; fallback email hai.phan@gmail.com (report.js:25) | KILL | Server + upstream author contact |
| `shortcuts.html` | Static instructions for setting shortcut keys (non-Chrome browsers) | KEEP | Local help page |

## js/ (top level)

| Path | What it does | Verdict | Reason |
|---|---|---|---|
| `js/advanced-options.js` | Binds the fixBtSilenceGap checkbox to settings (13 lines) | KEEP | Local |
| `js/aws-sdk.js` | Hand-vendored minimal AWS SigV4 request signer + `AWS.Polly` (`synthesizeSpeech`, `describeVoices`) wrapper (aws-sdk.js:33, 304) | VENDORED-LIB | Only used by Polly engine + custom-voices test; dead once cloud voices are cut → KILL |
| `js/connect-phone.js` | Drives pairing UI; polls `isPaired` via player | KILL | Phone/PeerJS feature |
| `js/content-handlers.js` | URL→handler routing table for special sites (Google Docs/Play Books, OneDrive, Chegg, VitalSource, Libby, PDF, EPUBReader, Adobe/Kami extensions) | REWORK | Keep routing mechanism + generic default; prune handlers tied to remote viewers/OCR |
| `js/content.js` | Injected content-script core: getDocumentInfo/getTexts, picks per-site script (content.js:24-54); **sends MathML to server for speech conversion** (content.js:226) | REWORK | Core is local; remove `/read-aloud/mathml` server call |
| `js/custom-voices.js` | Saves/tests AWS/GCP/IBM/Azure creds (calls texttospeech.googleapis.com etc.) | KILL | Cloud-voice config |
| `js/defaults.js` | Core shared lib: `brapi` shim, config (serviceUrl/webAppUrl/pdfViewerUrl, defaults.js:6-8), settings observables, voice catalog/auto-selection, helpers; also `getAuthToken`/`clearAuthToken` web-auth login (644-699), `getAccountInfo` server call (701-717), `getRemoteConfig` (898-917), silence track (856-896) | REWORK | Keep settings/voice-selection/helpers; excise auth, account, remoteConfig, premium branches in `getSpeechVoice` (327-330) |
| `js/document.js` | `SimpleSource`/`TabSource` + `Doc` reading pipeline; **server language-detection** POST (document.js:299) | REWORK | Keep pipeline; replace detect-language with local heuristic/`tabs.detectLanguage` |
| `js/events.js` | SW event wiring: context menu, keyboard commands, external messages, script/player injection; `reportIssue` server POST (287), `authWavenet` webRequest token sniff (294-352), Google-Docs MAIN-world script registration (36-44) | REWORK | Keep command/injection core; remove reportIssue, authWavenet, piper/supertonic/nghi handlers |
| `js/google-translate.js` | Scrapes translate.google.com `batchexecute` to synthesize speech (free GT voices) | KILL | Sends read text to Google via unofficial endpoint; not local-first |
| `js/jquery-3.7.1.min.js` | jQuery 3.7.1 minified | VENDORED-LIB | Still load-bearing (see VENDORED-LIBS) |
| `js/languages.js` | ISO-639 language list + language-picker page logic | KEEP | Local |
| `js/messaging.js` | Messaging/RPC plumbing: `registerMessageListener`, `RpcPeer`, `makeDispatcher`, `errorToJson` | KEEP | Core IPC |
| `js/offscreen.js` | Offscreen-document audio player driven by player messages | KEEP | Core local audio |
| `js/options.js` | Options page logic: voice grouping (standard/**premium**, 334-407), account button → `webAppUrl/premium-voices.html` (38-39), demo speech text fetched from server (226), sliders, highlighting | REWORK | Keep voice/slider/highlight logic; strip account/premium/demo-fetch |
| `js/pdf-viewer.js` | Bridges local shell page to remote-hosted viewer iframe; fetches PDF bytes and posts to it | REWORK | Only viable with a vendored local viewer; else KILL |
| `js/peerjs.min.js` | PeerJS 1.5.2 bundle | VENDORED-LIB | Only PhoneTtsEngine uses it → KILL |
| `js/player.js` | Playback controller: message handlers, autoclose, audio player; creates **remote iframes** `piper.ttstool.com` (506), `supertonic.ttstool.com` (541), `nghitts.ttstool.com` (576), `ttstool.com/fasttext` (596) | REWORK | Keep controller; remove all ttstool.com iframes/dispatchers |
| `js/popup.js` | Popup logic: play/pause/stop, highlight rendering, popout window; `checkAnnouncements` polls server (366-374) | REWORK | Keep UI; remove announcements |
| `js/report.js` | Submits issue report via `bgPageInvoke("reportIssue")`; mentions author's email | KILL | Server + upstream contact |
| `js/rxjs.umd.min.js` | RxJS UMD bundle (v7-family) | VENDORED-LIB | Core dependency everywhere, KEEP |
| `js/speech.js` | Text chunking (Word/CharBreaker, punctuators), engine picker (28-45), playback state machine | REWORK | Keep; delete premium/cloud/phone/piper branches in `pickEngine` |
| `js/tts-engines.js` | All engines: `BrowserTtsEngine`/`WebSpeechEngine`/`Timeout`/`Dummy` (local, 62-196); `PremiumTtsEngine` w/ auth+balance checks against server (197-260); GoogleTranslate (392); AmazonPolly (486); GoogleWavenet incl. cxl-services proxy (597,661); IBM Watson (777); Phone/PeerJS (847); OpenAI (964); Azure (1039); Piper/Supertonic/Nghi remote-iframe engines (1107,1192,1276) | REWORK | Keep the four local engines + audio cache; delete every remote engine |

## js/content/ (per-site extractors, injected on demand)

| Path | What it does | Verdict | Reason |
|---|---|---|---|
| `js/content/html-doc.js` | Generic webpage text extractor (ignoreTags heuristics, MathML hook) | KEEP | The core reader |
| `js/content/acrobatiq.js` | 3-line tweak to html-doc ignoreTags for Acrobatiq courseware | KEEP | Trivial, local DOM |
| `js/content/archiveofourown.js` | Parses AO3 chapter text | KEEP | Local DOM only |
| `js/content/chatgpt.js` | Injects read buttons on chat.openai.com assistant messages | KILL | Site UI mutation, off-thesis niche; harmless but not minimal |
| `js/content/chegg-book.js` | Pages through Chegg ereader frames, scrapes text | REWORK | Local DOM but DRM-adjacent paywalled reader; decide scope |
| `js/content/google-doc.js` | Google Docs extractor: SVG canvas / legacy kix / DOCS_modelChunk fallback (google-doc.js:2-21); links blog.readaloud.app (170) | REWORK | Keep if Docs support wanted; remove upstream blog link |
| `js/content/googleDocsUtil.js` | Third-party MIT util (Dictus ApS 2017) to read Google Docs cursor/selection | VENDORED-LIB | Needed only while Docs support kept |
| `js/content/google-drive-doc.js` | Reads paginated Drive viewer pages | KEEP | Local DOM |
| `js/content/google-drive-preview.js` | Reads Drive quick-preview documents | KEEP | Local DOM |
| `js/content/google-play-book.js` | Pages Play Books reader and scrapes segments | REWORK | Local DOM, paywalled-content scope call |
| `js/content/google-slides.js` | Reads slides, optional auto-flip panel | KEEP | Local DOM |
| `js/content/ixl.js` | Parses IXL exercise content | KEEP | Local DOM, education site |
| `js/content/khan-academy.js` | Parses Khan Academy paragraphs, skips KaTeX | KEEP | Local DOM, education site |
| `js/content/kindle-book.js` | Kindle Cloud Reader: page-turns then **OCRs page images via hidden iframe `https://ttstool.com/ocr.html`** (kindle-book.js:101) | KILL | Depends on remote OCR service |
| `js/content/libbyapp.js` | Pages Libby ebook reader frames | REWORK | Local DOM; scope call |
| `js/content/onedrive-doc.js` | Word-online / OneDrive PDF text extraction | KEEP | Local DOM |
| `js/content/pdf-doc.js` | Detects embedded PDFs and loads **remote viewer `assets.lsdsoftware.com/read-aloud/pdf-viewer-2`** (pdf-doc.js:6) | REWORK | PDF path must move to a vendored viewer |
| `js/content/pearson.js` | Pages Pearson+ reader via prev/next buttons | KEEP | Local DOM, education site |
| `js/content/vitalsource-book.js` | Scrapes h1-h6/p from VitalSource jigsaw frame | REWORK | Local DOM; scope call |
| `js/content/webnovel.js` | Reads webnovel.com chapters with infinite-scroll handling | KEEP | Local DOM |
| `js/content/wwnorton.js` | Pages W.W. Norton digital textbook frames | KEEP | Local DOM, education site |
| `js/content/yd-app-web.js` | Reads a Chinese ebook web app served on LAN `:1122` | KILL | Hyper-niche, selector-fragile |

## js/page/ and page-scripts/

| Path | What it does | Verdict | Reason |
|---|---|---|---|
| `js/page/google-doc.js` | One line: sets `window._docs_annotate_canvas_by_ext = "<upstream extension ID>"` to force Docs SVG-annotated canvas | REWORK | Mechanism needed for Docs; ID must become Herald's own |
| `page-scripts/google-doc.js` | S3-hosted copy: extracts `DOCS_modelChunk` text, postMessage back | KILL | Remote-code distribution dir (synced to author's S3 per package.json:10); logic duplicated in js/content/google-doc.js `altGetTexts` |
| `page-scripts/google-translate.js` | Page script for translate.google.com; loads messaging.js from `assets.lsdsoftware.com` and jQuery/jQuery-UI from Google CDN (lines 6, 29-31) | KILL | Remote code loading remote code; legacy GT path |
| `page-scripts/messaging.js` | Copy of the messaging lib for S3 hosting | KILL | Same reason; canonical copy lives at js/messaging.js |

## css/, img/, sound/

| Path | What it does | Verdict | Reason |
|---|---|---|---|
| `css/bootstrap.min.css` | Bootstrap 4.0.0 (MIT) full build; used by player/report/shortcuts/languages/connect-phone/custom-voices pages and injected into kindle dialog | VENDORED-LIB | Keep temporarily; candidate for replacement with small custom CSS |
| `css/bootstrap.min.css.map` | Source map for the above (551 KB, largest file; already excluded from `package` zip) | KILL | Dev artifact, dead weight |
| `css/common.css` | Shared styles: Material Icons @font-face, dark-mode palette | KEEP | Core UI |
| `css/options.css` | Options page styles | KEEP | Core UI |
| `css/popup.css` | Popup/player styles incl. highlight box | KEEP | Core UI |
| `css/material-icons.woff2` | Material Icons font subset (Apache-2.0) | VENDORED-LIB | Popup/options buttons use it, KEEP |
| `css/images/ui-*.png` (13 files) | jQuery-UI "smoothness/le-frog"-era theme sprites | KILL | Orphaned, zero references anywhere in repo (grep for `css/images`/`ui-icons`: no matches) |
| `img/icon.png`, `img/icon-16.png`, `img/icon-48.png` | Read Aloud brand icons (manifest icons) | REWORK | Must be replaced with Herald branding |
| `img/loading.gif` | Popup loading spinner | KEEP | Local UI asset |
| `sound/silence.mp3` | Looped silence track used by `makeSilenceTrack` (defaults.js:856) for the Bluetooth silence-gap fix / keepalive | KEEP | Local playback quality feature |

## _locales/ (one row per locale, each = `messages.json`)

All are UI-string catalogs keyed off `_locales/en/messages.json` (name/description, errors, options labels, includes `options_voicegroup_premium` and login/payment error strings like `error_login_required`/`error_payment_required` referenced from tts-engines.js:204-208).

| Locale | Verdict | Reason |
|---|---|---|
| `en` | REWORK | Canonical catalog: rebrand `extension_name`/`description`, delete premium/account/payment strings |
| `ar`, `cs`, `da`, `de`, `es`, `fi`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt_BR`, `ru`, `sv`, `tg`, `th`, `tr`, `uk`, `vi`, `zh_CN`, `zh_TW` (25 locales) | REWORK | Regenerate from reworked en (tools/i18n.js flow); machine-translated upstream |

## docs/ (upstream readaloud.app website, grouped; excludes docs/herald per instructions)

| Group | What it does | Verdict | Reason |
|---|---|---|---|
| `docs/index.html`, `contact.html`, `privacy.html`, `tos.html`, `36a213dec58f9ae20b81cd14.html`, `CNAME` | Upstream marketing site: Google Analytics (index.html:9), redirect to lsdsoftware.com contact, upstream ToS/privacy, empty search-console verification stub, `CNAME → readaloud.app` | KILL | Upstream website/brand; Herald has no server/site to publish from this repo |
| `docs/login.html`, `docs/logout.html` | OAuth relay pages against `auth.readaloud.app` Cognito + `support.readaloud.app` token exchange (login.html:11-16) | KILL | Account system |
| `docs/premium-voices.html`, `docs/css/premium-voices.css`, `docs/js/premium-voices.js`, `docs/js/utils.js` | Premium voice purchase page: live **Stripe** key (premium-voices.js:18), account balance, remote `databind.js` | KILL | Premium/payments |
| `docs/phone.html` | Phone-companion TTS web app: CDN Bootstrap 5.3, jQuery slim, **peerjs 1.4.7 from unpkg**, `databind.js` from assets.lsdsoftware.com | KILL | Phone/PeerJS feature |
| `docs/css/main.css`, `docs/images/*` (18 files) | Website styles and art (logo-text, demos, marquee, play/pause button art, octocat) | KILL | Upstream branding/site assets |
| `docs/release/chrome/latest.crx` | Packaged upstream CRX v3 binary (456 KB) | KILL | Upstream signed release artifact; must not ship in fork |
| `docs/usage/basics.md` | Extension basic-usage guide | REWORK | Usable seed for Herald docs after rebrand |
| `docs/usage/premium-voices.md` | Guide for buying/enabling premium voices | KILL | Premium |

## tools/

| Path | What it does | Verdict | Reason |
|---|---|---|---|
| `tools/i18n.js` | Dev script: fills missing locale strings via Google Cloud Translate v3 under upstream GCP project `read-aloud-188001` (i18n.js:4) | REWORK | Useful dev tool for locale regen, but needs own GCP project (or replacement); never shipped |

## VENDORED-LIBS

| Library | File(s) | Version | License | Still needed after premium/server removal? |
|---|---|---|---|---|
| jQuery | `js/jquery-3.7.1.min.js` | 3.7.1 (header) | MIT (OpenJS Foundation) | **Yes**, injected into every read tab (events.js:414-419), used by all content extractors and all UI pages (`domReady`/`setI18nText` in defaults.js:559-572) |
| RxJS | `js/rxjs.umd.min.js` | 7.x, exact patch version NOT FOUND in bundle (Apache-2.0 header; v7-only APIs `firstValueFrom`/`lastValueFrom` present) | Apache-2.0 | **Yes**, settings observables, voices$, playback pipelines across background/player/offscreen/popup/options |
| PeerJS | `js/peerjs.min.js` | 1.5.2 (embedded package.json string) | MIT | **No**, sole consumer is `PhoneTtsEngine` (tts-engines.js:847-961) + connect-phone UI; delete with the phone feature. Note it dials PeerJS's public broker (peerjs.com:3478) |
| AWS SigV4/Polly mini-client | `js/aws-sdk.js` | n/a (hand-vendored, 341 lines; code mirrors aws4fetch's signer, original header/license NOT FOUND in file) | Unlabeled (repo MIT umbrella; provenance should be resolved in legal clearance) | **No**, only `AmazonPollyTtsEngine` (tts-engines.js:486) and custom-voices.js AWS test |
| Bootstrap CSS | `css/bootstrap.min.css` (+ `.map`) | 4.0.0 (header) | MIT | **Partially**, player/report/shortcuts/languages/connect-phone/custom-voices pages + kindle-book dialog (kindle-book.js:80); after KILLs only player/shortcuts/languages remain, replaceable with small custom CSS; `.map` never needed |
| Material Icons font | `css/material-icons.woff2` | unversioned | Apache-2.0 | **Yes**, popup/options button glyphs (popup.html:22-51) |
| googleDocsUtil | `js/content/googleDocsUtil.js` | 2017 snapshot | MIT (Dictus ApS) | **Only if** Google Docs support is retained (loaded by content.js:27) |
| jQuery UI theme sprites | `css/images/ui-*.png` (13) | unknown theme leftovers | jQuery UI (MIT) | **No**, referenced by nothing in the repo today |

Remote-loaded third-party code (not vendored, all must die or be vendored): jQuery 3.3.1 + jQuery UI 1.12.1 from Google CDN (page-scripts/google-translate.js:29-31), `assets.lsdsoftware.com` messaging.js (page-scripts/google-translate.js:6) and pdf-viewer-2 (defaults.js:8, js/content/pdf-doc.js:6), `piper/supertonic/nghitts.ttstool.com` + `ttstool.com/fasttext` iframes (js/player.js:506,541,576,596), `ttstool.com/ocr.html` (js/content/kindle-book.js:101), peerjs 1.4.7 unpkg + Bootstrap 5.3 CDN + databind.js (docs/phone.html), Stripe.js (docs/js/premium-voices.js:18), Google Analytics (docs/index.html:9), `cxl-services.appspot.com` Wavenet proxy (js/tts-engines.js:661, js/events.js:303).

## COUNTS

- Tracked files in repo at survey end: **175** (git ls-files; docs/herald grew from 9 to 16 files while this survey ran, those are ignored planning docs)
- Excluded per instructions: docs/herald (16), scripts/ (2), CLAUDE.md, FORK.md, NOTICE (3) = 21
- **Inventoried: 154 files**, root 19, js/ 46 (23 top-level + 22 content + 1 page), page-scripts/ 3, css/ 19, img/ 4, sound/ 1, _locales/ 26, docs/ (upstream site) 35, tools/ 1

10 largest files (bytes, excluding .git):

| Size | File |
|---|---|
| 551,641 | `css/bootstrap.min.css.map` |
| 455,782 | `docs/release/chrome/latest.crx` |
| 144,877 | `css/bootstrap.min.css` |
| 142,931 | `docs/images/demo-extension-button.gif` |
| 128,352 | `css/material-icons.woff2` |
| 94,430 | `js/peerjs.min.js` |
| 88,037 | `js/rxjs.umd.min.js` |
| 87,533 | `js/jquery-3.7.1.min.js` |
| 66,364 | `js/tts-engines.js` |
| 66,296 | `docs/images/demo-right-click.gif` |

Notable dead reference found while reading: `js/options.js:78` opens `premium-voices.html` inside the extension, but no such file exists in the extension package (only `docs/premium-voices.html` on the website), already-broken premium path, safe to delete.
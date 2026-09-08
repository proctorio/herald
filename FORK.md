# Fork Provenance

Operational record. Not a legal requirement, but keep it current.

> Renamed 2026-09-08: the product previously shipped as "Lectern: Text to
> Speech Reader" (v1.0.0 through v1.0.4). Everything is now Herald. The
> Chrome Web Store extension id is unchanged (ids are permanent); versions
> up to 1.0.4 were published under the Lectern name.

## Upstream

| Field | Value |
|---|---|
| Upstream repository | https://github.com/ken107/read-aloud |
| Upstream author | Hai Phan (GitHub: ken107) |
| Upstream license | MIT, Copyright (c) 2016 Hai Phan |
| Upstream Chrome Web Store ID | hdhinadidafjejdhmfkjgnolgimiaplp |
| Fork commit SHA | 7f2764ba5629ddf3dfc6a8db09d552be7b5846b6 |
| Fork date | 2026-08-13 (UTC) |
| Upstream version at fork point | 2.23.0 |

## This fork

| Field | Value |
|---|---|
| Product name | Herald |
| Repository | https://github.com/proctorio/herald |
| Publisher | Proctor.io Incorporated, 7340 E Main St, Scottsdale, AZ |
| Chrome Web Store ID (Beta channel) | jnchlbdjpliafjnppcmhfjogpajfejjl. Never change this. |
| Chrome Web Store ID (Production channel) | FILL IN when the production application is approved. Never change this. |
| License | MIT (retains upstream copyright, see LICENSE) |

## Divergence policy

- `upstream` is configured as a git remote for cherry-picking.
- Cherry-pick security and correctness fixes only.
- Never merge upstream branches wholesale. Upstream carries server dependencies that were deliberately removed (see docs/herald/02-fork-delinking-plan.md).
- GitHub defaults a fork's pull request base to the parent repository. Verify the base on every PR.

## Removed from upstream

Record each removal so nobody reintroduces it by accident.

| Removed | Reason | Commit |
|---|---|---|
| manifest `key` field | Inherited extension identity | phase1 (main 2a98f78) |
| manifest `oauth2` block | Upstream author's Google client_id | phase1 (main 2a98f78) |
| manifest `identity` permission | No sign-in | phase1 (main 2a98f78) |
| Premium voice server synthesis | Routes user text to upstream author's server | phase2 |
| Account system and purchase flow | Tied to upstream entitlements | phase2 |
| Bring-your-own-key cloud engines (Polly, Wavenet, Watson, Azure, OpenAI) | Network egress, cut per decision D1 | phase2 |
| Google Translate voice engine | Unofficial scraped endpoint, sole reason for translate.google.com host permission | phase2 |
| Piper, Supertonic, NghiTTS, FastText remote iframes | Remotely served code on ttstool.com | phase2 |
| Phone pairing (PeerJS) | Public broker, guessable pairing namespace | phase2 |
| Error telemetry (`reportIssue`) | Auto-POSTed settings including credentials to upstream server | phase2 |
| Popup announcements | Server-rendered HTML injected into extension page | phase2 |
| External message listener | Unrestricted play/pause control from other extensions; exam-signal channel gets a deliberate design in phase 5 | phase2 |
| Popup auto-play on open | Reading must be explicitly user-invoked | phase2 |
| Remote Google Fonts stylesheet | Network request on every popup open | phase2 |
| Pinned player tab | Embedded player plus offscreen audio only; no tab creation | phase2 |
| S3 page-script loader | Remote hosted code, MV3 violation | phase2 |
| `sync-page-scripts` npm script | References upstream author's S3 bucket | phase1 (main 2a98f78) |
| `authWavenet` token capture (webRequest) | Network observation, store review risk; only live webRequest use (header rewriting was already absent) | phase2 |
| Google Docs MAIN-world annotate token | Hardcoded third-party extension ID | phase2 |
| Upstream Workspace add-on prompts | Upstream service dependency | phase2 |
| PDF viewer (remote-hosted) | Served from upstream author's CDN, cut per decision D4 | phase2 |
| Kindle OCR, Chegg, VitalSource, LibbyApp, Play Books, EPUBReader, Adobe, Kami, ChatGPT, webnovel, yd-app handlers | Remote services, paywalled readers, off-thesis surface | phase2 |
| Server MathML and language detection | Page content egress; both are local-only now | phase2 |
| Upstream icons and images | Streamline Labs / Freepik assets, not sublicensable | phase4 (replaced with in-house placeholder set pending commissioned art, decision Q6) |

## Extension ID history

The Chrome Web Store extension ID is the key to every downstream allow-list entry
(Proctorio's own list plus each partner's independent list). Changing it invalidates
all of them. Do not change it. Do not republish under a new listing.

| Date | ID | Note |
|---|---|---|
| 2026-08-18 | jnchlbdjpliafjnppcmhfjogpajfejjl | Initial publish, approved and public. Designated the BETA channel: its uploads carry the "Herald Beta" name once the release pipeline runs; the clean name is reserved for the production listing (separate application, ID pending). |

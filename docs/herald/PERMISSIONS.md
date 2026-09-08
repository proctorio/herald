# Permission Justifications

Every permission in `manifest.json` must have a live code path and a written
justification here, per Phase 3 of the build plan. Update this file in the
same commit as any manifest permission change.

## permissions (granted at install)

| Permission | Code path | Justification |
|---|---|---|
| `activeTab` | `getActiveTab` in `js/defaults.js`, used by `playTab` in `js/events.js` | Identifies the tab to read when the user invokes a read action. Grants temporary access only on user gesture, which is the minimal model for a reader. |
| `contextMenus` | `installContextMenus` and the `read-selection` click handler in `js/events.js` | The right-click "read selection" entry point. |
| `scripting` | `injectContentScript` and `injectPlayer` in `js/events.js` | Injects the text extractor and the embedded player frame into the page the user asked to read. Injection happens only on explicit invocation, never at page load. |
| `storage` | `getSettings` / `updateSettings` in `js/defaults.js` | Persists voice, rate, pitch, volume, and highlighting preferences in `chrome.storage.local`. No read content is ever stored. |
| `tts` | `BrowserTtsEngine` in `js/tts-engines.js` | The speech engine. All synthesis uses voices installed in the browser and operating system. |

## optional_permissions (requested at point of use)

| Permission | Code path | Justification |
|---|---|---|
| `webNavigation` | `getAllFrames` in `js/defaults.js`, used by `playTab` frame resolution in `js/events.js`; requested by `validate()` in `js/content-handlers.js` entries | Resolves the correct child frame when readable content lives in a cross-origin iframe (LMS and document viewers). Requested only when the user tries to read such a site. |

## optional_host_permissions (requested at point of use)

| Pattern | Code path | Justification |
|---|---|---|
| `http://*/`, `https://*/`, `file://*/*` | `error_add_permissions` flow raised by `validate()` in `js/content-handlers.js`, surfaced to the user in `js/popup.js` | Site handlers that must reach a specific origin (for example a document viewer frame) ask for that origin when the user first reads there. Nothing is granted at install; the install prompt stays clean. |

## Explicitly absent

- `webRequest`, `declarativeNetRequest`: removed in phase 2. No network
  observation or interference of any kind.
- `identity`: removed in phase 1. No sign-in.
- `ttsEngine`: removed in phase 2. Herald consumes voices, it does not
  provide them.
- `offscreen`: removed in phase 3.5. It existed for URL-audio playback
  from the cloud voice engines; with those gone in phase 2, chrome.tts and
  speechSynthesis speak directly and no offscreen document is needed.
- Install-time `host_permissions`: none. The former
  `https://translate.google.com/` grant died with the Google Translate
  engine in phase 2.

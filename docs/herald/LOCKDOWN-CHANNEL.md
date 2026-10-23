# Lockdown channel

Decision D8: Proctorio's lockdown extension talks to Herald over
`chrome.runtime.sendMessage(heraldId, message)`, received by
`runtime.onMessageExternal` in `js/external-messaging.js`. This page is the
contract for both sides.

## Who gets an answer

Herald answers only the thirteen lockdown builds (stable, beta, dev, staging,
canary, partners, automation), in every Herald channel, dev and prod. Most of
those builds are not public, so no lockdown extension ID appears anywhere in
this repository, and Chrome's own allowlist, which takes plain IDs, cannot be
used:

1. **Chrome**, from `manifest.json`: `externally_connectable` is declared
   explicitly as `{"ids": ["*"]}`. Every extension can deliver a message; with
   no `matches`, no web page can. The key is explicit rather than absent so
   the intent is visible in the manifest, does not rest on Chrome's default for
   a missing key, and can be pinned by the build gate.
2. **Herald**, from `LOCKDOWN_ID_HASHES` in `js/lockdown-ids.js`: the SHA-256
   of each lockdown build's ID, each commented with the build's name. A sender
   is a lockdown build when its ID hashes to an entry. `js/sha256.js` computes
   the hash synchronously, because the listener must decide at once whether to
   answer and `crypto.subtle.digest` is asynchronous only.

Any other sender gets **no answer at all**: no refusal, no error code, nothing
that tells it what Herald accepts. The listener does not call `sendResponse`
and does not hold the channel open, so Chrome resolves the sender's
`sendMessage` with `undefined`. Chrome still reports "Could not establish
connection" when Herald is not installed, so an extension that already knows
Herald's public store ID can tell whether Herald is installed; it cannot learn
anything else.

To add or retire a lockdown build, hash its ID
(`printf %s <id> | shasum -a 256`) and change `js/lockdown-ids.js`, naming
the build, never the ID, in the comment. Never put the ID itself in the
repository, a commit message, or a pull request.

Three gates hold these rules:

- `scripts/verify-manifest.sh` fails unless `externally_connectable` is
  exactly `{"ids": ["*"]}`: no `matches`, no plain ID list, no other key.
- `tools/audit-lockdown-ids.js` hashes every 32-letter a-p run in a tree and
  fails if one hashes to a lockdown build, so a plain ID cannot slip back in.
  It carries no ID itself, and it reports the file and hash, never the ID.
  `npm run audit:lockdown-ids` runs it on `dist/`, `tools/package.js` refuses
  to package when it finds one, and `test/LockdownIdAudit.Test.js` runs it on
  the whole repository.
- `test/ExternalMessaging.Test.js` pins thirteen distinct hashes and the
  manifest shape.

## Messages

A request is a plain object:

```
{ v: 1, type: "<type>", payload?: <per type> }
```

Herald answers every request from a lockdown build exactly once,
synchronously:

```
{ v: 1, ok: true, type: "<type>", ...result }
{ v: 1, ok: false, error: { code: "<code>" } }
```

| Code | Meaning |
|---|---|
| `malformed` | Not a plain object, `type` not a string, a key other than `v`, `type`, `payload`, or a payload the type does not accept. |
| `unsupported_version` | `v` is anything other than the number `1`. |
| `unknown_type` | This Herald does not implement `type`. |
| `internal` | Herald failed while answering. Logged in Herald's service worker console. |

The listener never throws, never touches a page, and makes no network
request.

## Types

| Type | Payload | Result |
|---|---|---|
| `hello` | none | `version` (Herald's manifest version), `types` (every type this Herald accepts) |
| `readSelection` | `{tabId, text}` | none: `ok: true` means Herald accepted the text, not that speech started |
| `stop` | none | none: `ok: true` also when nothing was playing |

`hello` is the capability handshake. Herald and the lockdown extension release
on separate schedules, so the lockdown side should call `hello` first and only
send a type that appears in `types`. An older Herald answers a newer type with
`unknown_type`, never with a wrong action.

The remaining feature types (`announce`, `examState`, `getState`) are not
implemented. Each arrives with its own work item and its own entry in this
table.

### readSelection

Reads text the student selected in the exam (WI-B, the "Read with Herald"
menu). The payload is a plain object with exactly two keys:

- `tabId`: the exam tab the selection came from, a non-negative safe integer.
  Herald checks it and does not use it: it reads the text in the message and
  never the tab.
- `text`: the selected text, a string that is not empty after trimming, at
  most 10000 UTF-16 code units (`READ_SELECTION_MAX_LENGTH`). The lockdown
  truncates to the first 10000 UTF-16 code units, never mid surrogate pair;
  Herald answers `malformed` above 10000.

Any other payload answers `malformed`. Herald answers before it looks up a
voice, then speaks in its service worker:

- **No page access.** The text is spoken with `chrome.tts` from the service
  worker: no script in the exam page, no player frame, no highlighting, and no
  permission beyond `tts`.
- **The student's settings, local voices only.** Herald uses the student's
  voice, rate, pitch, volume and pronunciation corrections, but only local
  voices, whatever exam-safe mode says: a pinned network voice is replaced by
  a local one, so exam text never leaves the device. The language is detected
  from the text with the same confidence bar as page reading, else the
  browser's UI language. With no local voice for it, nothing is spoken and the
  error is logged in Herald's service worker console.
- **One utterance**, the text as written. Text shaped like an SSML document is
  escaped, so it is read rather than interpreted.
- **A new read replaces the old one.** `readSelection` stops whatever Herald is
  reading, an earlier lockdown read or the student's own page reading, before
  it speaks. The student's own reading, started from Herald, replaces a
  lockdown read the same way.
- **Herald's own controls work on it.** Herald's play, pause and stop
  shortcuts and popup buttons pause, resume and stop a lockdown read; forward
  and rewind do nothing during one. Voices that cannot pause (Google and
  Chrome OS native voices) stop instead.

### stop

Stops a read that came from `readSelection`. The lockdown sends it when the
student moves to another question (Next, Previous, a jump) and when the exam
ends or is submitted, gated on `types` including `stop`. It never stops the
student's own Herald reading, and it answers `ok: true` whether or not a
lockdown read was playing. The lockdown's own `chrome.tts.stop()` cannot do
this: it stops only the lockdown's own speech.

Herald keeps a "lockdown read" record in `chrome.storage.session` (no text,
only an id, the start time and the paused flag), because the service worker
may sleep in the middle of a read and must still find it when `stop`, or one of
Herald's own controls, wakes it. With no live record, `stop` does nothing.

## Tests

- `test/ExternalMessaging.Test.js`: every rule above. It adds the hash of an
  ID generated for the run to the list, so no lockdown ID appears in it.
- `test/LockdownRead.Test.js`: how a lockdown read is spoken, replaced,
  paused, stopped and found again after a service worker restart.
- `test/Events.Test.js`: the service worker wiring: a lockdown read stops
  Herald's player and touches no page, the student's own read survives a
  lockdown `stop`, and Herald's shortcuts drive a lockdown read.
- `test/Sha256.Test.js`: the hash against the FIPS 180-4 examples and
  node:crypto.
- `e2e/LockdownChannel.Test.js`: real Chromium with two stub lockdown
  extensions (`e2e/fixtures/lockdown-stub/`), each keyed for that run only.
  The hash of one stub's ID is added to the test copy's list; it gets the
  handshake and the structured errors. The other stands for any other
  extension; Chrome delivers its messages and Herald leaves every one
  unanswered. The run also asserts the page is untouched, no request leaves
  the browser, and `dist/` carries the thirteen hashes, no stub, and no
  lockdown ID in plain text.

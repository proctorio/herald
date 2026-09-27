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

`hello` is the capability handshake. Herald and the lockdown extension release
on separate schedules, so the lockdown side should call `hello` first and only
send a type that appears in `types`. An older Herald answers a newer type with
`unknown_type`, never with a wrong action.

Feature types (`readSelection`, `announce`, `examState`, `getState`) are not
implemented. Each arrives with its own work item and its own entry in this
table.

## Tests

- `test/ExternalMessaging.Test.js`: every rule above. It adds the hash of an
  ID generated for the run to the list, so no lockdown ID appears in it.
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

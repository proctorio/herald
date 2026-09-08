# 02. Fork De-linking Plan

The fork inherits three classes of dependency on the upstream author's infrastructure and identity. All three must be severed before the first store upload. This is the blocking work.

## Class 1: Extension identity

### 1.1 The hardcoded manifest key

VERIFIED: upstream `manifest.json` contains a `"key"` field. That field is the extension's public key and it pins the extension ID. It exists upstream so the author gets a stable ID across local builds and the store.

If you ship it:
- Your extension claims the upstream author's ID namespace.
- The store will reject it or, worse, you get ID collisions in enterprise policy deployments.
- Anything keyed to that ID upstream (OAuth consent, allow-lists) leaks into your build.

**Action: delete the `key` field entirely.** Let the Chrome Web Store assign a fresh ID on first upload. Record the assigned ID in `FORK.md` and in the Proctorio allow-list ticket the moment you have it. If you need a stable ID for local development before publishing, generate your own keypair and use your own key, never the inherited one.

### 1.2 The inherited OAuth client

VERIFIED: upstream `manifest.json` contains an `"oauth2"` block with the author's Google client_id:

```
311515340069-gr48lfk7ufpg8ath9qkfsatq60tr6147.apps.googleusercontent.com
```

That client belongs to Hai Phan. It is bound to his extension ID and his Google Cloud project. It will not work for you, and attempting to use it is a mess you do not want.

**Action: delete the entire `oauth2` block.** Herald has no sign-in. There is no replacement client_id. If someone later argues for adding auth, that is a new design decision, not a port.

### 1.3 Anything else keyed to upstream identity

VERIFY IN REPO: grep for the upstream extension ID `hdhinadidafjejdhmfkjgnolgimiaplp`, for `lsdsoftware`, for `readaloud.app`, and for `hai.phan`. Expect hits in `package.json` (`homepage`, `author`), support links, feedback forms, and possibly hardcoded checks. Remove or repoint all of them. `scripts/audit-remote-code.sh` covers this.

## Class 2: Upstream-hosted services

### 2.1 Premium voice synthesis

VERIFIED, from the upstream privacy policy: when a user selects a premium voice, the input text is sent to the author's cloud server for synthesis. The premium tier covers Google WaveNet, Amazon Polly, IBM Watson, Azure, and OpenAI voices, and is gated behind an in-app purchase tied to the author's account system with Google, Facebook, and Apple sign-in.

You cannot use any of it. The endpoints, the billing, and the entitlement checks are his.

**Action: remove the entire server-synthesis code path**, including the purchase flow, the entitlement check, the account UI, and the voice-list entries that depend on it. Do not leave dead UI that offers voices which cannot load. A voice picker listing unreachable voices is a support burden and a store review risk (broken functionality).

VERIFY IN REPO: locate the synthesis dispatch layer and the voice registry. The likely shape is a set of voice "engines" registered by name, where local engines call `chrome.tts` or `speechSynthesis` and remote engines POST to an endpoint. Read the actual code. Do not assume the file names.

### 2.2 Page-scripts served from the author's S3 bucket

VERIFIED: `package.json` contains a `sync-page-scripts` script that runs `aws s3 sync` against `s3://lsdsoftware-assets/read-aloud/page-scripts`.

Two problems. First, that bucket is his, so the content can change or vanish under you. Second and fatal: if any runtime path fetches script from it, that is remotely hosted code, which Manifest V3 forbids outright.

**Action:**
- Delete the `sync-page-scripts` npm script.
- Find every runtime fetch of a page-script and eliminate it. Either bundle the needed page-scripts into the extension package as local files, or drop the site-specific handling entirely.
- Bundling is the right default. Site-specific readers for a handful of document hosts are a large maintenance surface for a product whose thesis is minimalism. Prefer dropping all but the ones you can justify.

Chrome's own guidance for the remote-code rejection ("Blue Argon") is to search the project for `http://` and `https://`. `scripts/audit-remote-code.sh` automates that and filters the noise.

### 2.3 Support, feedback, and telemetry endpoints

VERIFY IN REPO: in-app "report issue" and contact paths point at `lsdsoftware.com` and `readaloud.app`. Repoint to Proctorio support or remove. Any analytics, error reporting, or version-check ping gets removed outright. Herald makes zero outbound requests in default mode. That is a product commitment, not a nice-to-have.

## Class 3: Permission and injection surface inherited by default

Upstream is a maximalist reader. Its permission set reflects features you are deleting. Every permission you keep without a live code path is a store review question and an institutional security review question.

### 3.1 Host permissions

**Action:** after Class 2 removals, regenerate the permission set from what the code actually calls. Prefer `activeTab` plus optional host permissions requested at the point of use over broad `<all_urls>` at install time. An education buyer reading the permission prompt is a real gate here.

### 3.2 webRequest header rewriting

VERIFIED as historical upstream behavior: upstream modified the `Sec-Fetch-Site` header via webRequest to enable Google Translate voices.

**Action: remove it.** It is tied to a remote voice path you are deleting, it is exactly the kind of network interference that trips exam integrity heuristics, and `webRequest` header modification is a red flag in store review and in institutional security review. Confirm no remaining `declarativeNetRequest` or `webRequest` rules ship.

### 3.3 Google Docs DOM injection

VERIFIED as historical upstream behavior: an HTML injection workaround for Google Docs was added and then reverted upstream in v1.54.1, with the maintainer citing confusion over the extra permissions it required.

**Action:** confirm it is absent in the commit you forked from. If any variant is present, remove it. Google Docs support, if you want it, gets designed deliberately under the injection rules in `04-proctorio-compatibility.md`, not inherited.

## Order of operations

Do Class 1 first. It is small, mechanical, and it prevents an accidental upload carrying inherited credentials. Then Class 2, which is the bulk of the deletion. Then Class 3, which is easier once the code paths that needed the permissions are gone.

## Definition of done for this phase

- `scripts/verify-manifest.sh` passes: no `key`, no `oauth2`, no `webRequest`, no broad host permissions without justification.
- `scripts/audit-remote-code.sh` passes: no `lsdsoftware`, no `readaloud.app`, no upstream extension ID, no S3 references, no remote script loads.
- Load unpacked, open DevTools Network, exercise every UI surface, confirm zero outbound requests.
- Voice picker shows only voices that actually work.

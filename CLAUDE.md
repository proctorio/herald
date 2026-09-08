# Herald

Chrome extension. A hardened, accessibility-first text to speech reader, forked from `ken107/read-aloud` (MIT), rebuilt to run with zero network dependency by default and to coexist cleanly with Proctorio's exam integrity extension.

Publisher: Proctorio Inc., 7340 E Main St, Scottsdale, AZ.

## Ground rules

1. **No em-dashes.** Not in code comments, commit messages, docs, UI strings, or store copy. Use commas, periods, colons, or parentheses. This applies to everything you generate.
2. **Verify before you assert.** This repo is a fork of a live upstream project. File paths, function names, and module layout in `docs/herald/` are marked VERIFIED, ASSUMPTION, or VERIFY IN REPO. Anything not marked VERIFIED must be confirmed by reading the actual source before you act on it. If a doc contradicts the code, the code wins. Flag the contradiction, do not silently work around it.
3. **Do not invent upstream behavior.** If you cannot find where something happens, say so and ask. Do not guess at the shape of the premium voice pipeline or the page-script loader.
4. **Phases are ordered.** Work `docs/herald/06-build-plan.md` top to bottom. Phase 1 and Phase 2 are blocking. Nothing ships until `scripts/audit-remote-code.sh` and `scripts/verify-manifest.sh` both pass clean.
5. **Small commits, conventional messages.** One concern per commit. Reference the phase, for example `phase2: remove S3 page-script loader`.
6. **Never commit secrets.** If you find an API key, client_id, or bucket credential inherited from upstream, remove it and note it in the commit body. Do not replace it with a Proctorio credential without an explicit instruction.

## Architecture intent

The product thesis is subtraction, not addition. Upstream is a feature-rich reader with a cloud voice marketplace. Herald is the opposite: a small, auditable, local-first reader that an institution can allow-list inside a locked-down exam without opening a network egress path or a third-party data processor.

- **Default mode is local only.** Voices come from `chrome.tts` and the Web Speech API. Zero outbound requests. This is the differentiator and the store listing's unique-value argument.
- **Bring your own key is optional and off by default.** If retained, it calls the cloud provider directly with the user's own credentials. It never routes through a Proctorio or third-party proxy.
- **No account system.** No sign-in, no purchases, no telemetry, no analytics.
- **Minimal injection.** Content scripts do the least possible and never run during an active exam session unless explicitly invoked by the user.

If a proposed change increases network surface, permission scope, or injected DOM footprint, it needs a written justification in the PR body.

## Repo layout

```
docs/herald/    Build brief. Read 06-build-plan.md first.
scripts/         Audit and verification scripts. Run before every store upload.
FORK.md          Fork provenance. Upstream commit SHA. Keep current.
NOTICE           Upstream MIT attribution. Ships in the package.
LICENSE          MIT. Retains the upstream copyright line. Do not delete it.
```

Everything else is inherited from upstream and subject to audit.

## Upstream relationship

- Upstream: `https://github.com/ken107/read-aloud`, MIT, Copyright (c) 2016 Hai Phan. VERIFIED.
- Upstream is actively maintained (commits and issues into 2026). VERIFIED. Expect divergence.
- Set upstream as a git remote. Cherry-pick security and correctness fixes. Do not merge upstream branches wholesale, because that reintroduces the server dependencies you removed.
- Do not open PRs against upstream by accident. GitHub defaults a fork's PR base to the parent repo. Check the base on every PR.

## Verification gates

Before any Chrome Web Store upload, all of these must pass:

```bash
./scripts/audit-remote-code.sh    # no remote script loads, no upstream endpoints, no inherited secrets
./scripts/verify-manifest.sh      # no inherited key or oauth2, permissions minimized
```

Manual gate: load unpacked, open DevTools Network, exercise every UI path, confirm zero outbound requests in default mode.

## What to ask about instead of deciding

See the Herald open-questions document in the internal documentation vault. Short version: do not decide the final store listing name string, whether bring-your-own-key survives, the privacy policy URL, or anything touching Proctorio's allow-list without asking.

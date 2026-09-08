# Contributing to Herald

Thanks for helping make reading the web aloud better, especially for people
who rely on it.

## Where things happen

Everything community-facing happens in this GitHub repository: issues,
discussions, security reports, and pull requests. Maintainers review and
merge pull requests right here. After a merge, an automated sync imports the
change into the project's build system and republishes `main`, so expect the
merged history to be normalized shortly after (your change and its
attribution are preserved; commit hashes on `main` are not stable across
that normalization, which is also why long-lived forks should rebase onto
fresh `main` rather than merge it).

## Ground rules for changes

1. **Zero network egress is the product.** The extension's own code performs
   no network requests, and the default configuration must stay that way. A
   change that adds network surface, new permissions, or injected DOM
   footprint needs a written justification in the pull request and will get
   extra scrutiny.
2. **Accessibility is a gate, not a feature.** The end-to-end suite enforces
   zero axe violations on every page, in both themes, including during
   playback. Keyboard operability, reduced motion, and forced-colors support
   are requirements.
3. **Tests come with the change.** Unit coverage gates at 80 percent on all
   four metrics. Playwright covers extraction, exam behavior, and the
   zero-egress guarantee.

## Working locally

```bash
npm install
npm test                  # unit suite with coverage gates
npm run build             # produces dist/
npm run test:integration  # Playwright end-to-end suite (downloads a browser)
npm run lint              # eslint over src and test
bash scripts/audit-remote-code.sh dist
bash scripts/verify-manifest.sh dist/manifest.json
```

Load `dist/` unpacked via `chrome://extensions` to try changes in a real
browser.

## Style

- ESLint enforces formatting and conventions; run `npm run lint` before
  pushing.
- Extension source files keep kebab-case names (upstream-diffable); tests use
  PascalCase.
- Small commits, one concern per commit, conventional messages.

## License

By contributing you agree your contributions are licensed under the MIT
license that covers the project. See `LICENSE` and `NOTICE`.

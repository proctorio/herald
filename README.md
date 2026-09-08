# Herald

A local-first text to speech reader for the browser, built to coexist with
locked-down assessment environments. Herald reads web page content aloud
using the voices already installed on your device. It makes zero network
requests: no account, no cloud, no telemetry.

Status: version 1.0.0 is under Chrome Web Store review. Releases, with the
exact store artifact attached, are published under
[Releases](https://github.com/proctorio/herald/releases).

## Getting help

This repository is the front door for everything Herald:

- **Bugs and accessibility issues:** open an
  [issue](https://github.com/proctorio/herald/issues). Accessibility
  problems have their own template and are treated as high priority.
- **Questions and ideas:** start a
  [discussion](https://github.com/proctorio/herald/discussions).
- **Security or privacy reports:** use GitHub's
  [private vulnerability reporting](https://github.com/proctorio/herald/security/advisories/new)
  on this repository. See `SECURITY.md`.
- **Privacy policy:** [docs/herald/PRIVACY.md](docs/herald/PRIVACY.md).

## Contributing

Pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) for how
changes are reviewed and landed, and for the project's hard rules (the
zero-network-egress default is not negotiable).

## Design principles

- **Local only by default.** Voices come from the browser and the operating
  system. The extension's own code performs no network requests.
- **Minimal footprint.** Content scripts do the least possible and never run
  until the user invokes a read action.
- **Auditable.** Two verification scripts gate every release:

```bash
./scripts/audit-remote-code.sh dist       # no remote code, no upstream endpoints, no inherited secrets
./scripts/verify-manifest.sh dist/manifest.json    # no inherited identity, permissions minimized
```

## Provenance

Herald is a fork of the MIT licensed
[Read Aloud](https://github.com/ken107/read-aloud) project by Hai Phan.
Herald is an independent project and is not affiliated with or endorsed by
the original author. See `FORK.md` for the fork record, `NOTICE` for
attribution, and `LICENSE` for the license text, which retains the original
copyright line.

## Author

**Proctorio**

## License

MIT. See `LICENSE` and `NOTICE`.

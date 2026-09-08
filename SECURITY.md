# Security Policy

Herald's security posture is its absence of surface: the extension's own
code makes no network requests, collects nothing, and stores only local
preferences. Reports that challenge those guarantees get priority attention.

## Reporting a vulnerability

Use GitHub's
[private vulnerability reporting](https://github.com/proctorio/herald/security/advisories/new)
on this repository. Please do not open a public issue for anything you
believe is exploitable.

Include what you observed, the extension version (visible on the options
page), and reproduction steps. Reports are read by maintainers; you will get
a human response.

## Scope

Especially interesting:

- Any network request originating from the extension's own code.
- Any way page content, selections, or read text persists or leaves the
  device through the extension.
- Escapes from exam-safe mode's guarantees (local voices only, active tab
  only).
- Content-script injection beyond what the user invoked.

Out of scope: transmissions performed by the browser itself when a user
selects a browser-provided network voice (documented in the privacy policy),
and issues in upstream Read Aloud that do not exist in Herald's code.

## Supported versions

The latest published release. Fixes ship as new releases; we do not patch
old versions.

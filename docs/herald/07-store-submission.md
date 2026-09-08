# 07. Chrome Web Store Submission

## Policy position

Three policies matter for a fork. You clear all three, but only if you do the work in Phases 3 through 5.

### Spam and duplication

The store prohibits a developer, related developer accounts, or affiliates from submitting multiple extensions providing duplicate experiences or functionality.

The scope clarification is the important part: competing extensions from unrelated developers or publishers are not treated as repetitive content. VERIFIED from the store's spam policy FAQ.

Proctorio is unrelated to Hai Phan. Publishing a differentiated fork is permitted. You still need to provide unique value, and yours is real: local-only operation, minimal injection, exam-environment compatibility, and accessibility hardening. State it explicitly in the listing. Do not make the reviewer infer it.

### Impersonation and intellectual property

The policy prohibits pretending to be someone else and infringing others' IP.

Compliance requires: different name, different icon, no upstream branding, and an explicit non-affiliation statement in the listing. The attribution line in `03-branding-spec.md` handles this.

### Manifest V3 remote hosted code

Forbidden. Chrome's guidance for the associated rejection ("Blue Argon") is to search the project for `http://` and `https://`. `scripts/audit-remote-code.sh` does this and filters the noise.

The upstream S3 page-script mechanism is the specific hazard. See `02-fork-delinking-plan.md` section 2.2.

## Submission checklist

**Package**
- [ ] Production build, not the dev tree
- [ ] Both audit scripts pass against the unpacked production build
- [ ] `NOTICE` file included in the package
- [ ] No source maps, no `.env`, no test fixtures, no `node_modules`
- [ ] Version `1.0.0`

**Manifest**
- [ ] No `key` field
- [ ] No `oauth2` block
- [ ] Every permission justified and used
- [ ] No `webRequest` or `declarativeNetRequest`
- [ ] `manifest_version: 3`
- [ ] Single purpose clearly expressed and narrow

**Listing**
- [ ] Title: `Herald, Text to Speech Reader`. No keyword stuffing, no "Proctorio" in the title.
- [ ] Short description leads with the local-only privacy claim
- [ ] Long description covers: what it does, privacy claim, who it is for, explicit differentiation
- [ ] Non-affiliation and MIT attribution line present
- [ ] Publisher shown as Proctorio Inc., publisher verified
- [ ] Homepage URL on a controlled domain
- [ ] Support URL reaching a real human
- [ ] Screenshots: at least 3, showing popup, options, and in-page reading
- [ ] 440x280 small promo tile
- [ ] Category: Accessibility

**Privacy**
- [ ] Privacy policy published at a stable URL on a Proctorio-controlled domain
- [ ] Data usage disclosures completed accurately. If default mode collects nothing, declare nothing, and make sure that is true.
- [ ] Limited use disclosure completed if any user data is handled at all
- [ ] The privacy policy must match the code. A reviewer comparing your declared data practices against your permission set is the most common source of rejection for a privacy-forward extension.

## Review traps specific to this fork

1. **Permission and description mismatch.** If you keep broad host permissions but describe a minimal reader, expect a rejection asking why. Fix the permissions, not the description.
2. **Dead premium voice UI.** If any remnant of the purchase or account flow ships, a reviewer will find it and ask what it connects to. Full removal, not feature-flagging.
3. **Locale leakage.** A non-English locale string still reading "Read Aloud" is both a branding failure and an impersonation flag. Grep every locale file.
4. **Inherited screenshots.** Do not reuse anything from the upstream listing.
5. **Single purpose.** An extension that reads pages aloud is a clean single purpose. Do not add a dictionary, a translator, or a summarizer. It breaks single purpose and it breaks the exam integrity story.

## After approval

- Capture the assigned extension ID immediately. Record in `FORK.md`.
- Do not change the ID. Ever. It is the key to every allow-list entry downstream.
- Open the Proctorio allow-list ticket the same day.
- Open partner allow-list tickets. Partner lists are independent, for example Imagine / Edgenuity runs its own.
- Set a calendar reminder to re-review store policy before each major release. Policies change and enforcement is manual.

## Sources

- Spam and abuse policy: https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse
- Spam policy FAQ: https://developer.chrome.com/docs/webstore/program-policies/spam-faq
- Impersonation and IP policy: https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property
- MV3 requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Remote hosted code guidance: https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code

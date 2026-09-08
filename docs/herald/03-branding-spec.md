# 03. Branding Spec

## Name

**Herald.**

Latin root (`legere`, to read). The object you read aloud from. Academic without being clinical. Three syllables that every screen reader and TTS engine pronounces correctly on first pass, which matters more than usual here because a meaningful share of users will hear the product name before they see it.

Clearance status: no collision surfaced in the Chrome Web Store, npm, or the TTS and accessibility product space. That is a negative search result, not a legal opinion. Confirmatory USPTO clearance in Classes 009 and 042 is an open item in `08-open-questions.md`.

### Rejected, with reasons

| Name | Why not |
|---|---|
| Read Aloud | Upstream's name. Impersonation and duplication risk. Generic. |
| Aloud | Pending Class 009 application covering speech and TTS software. |
| Recita / Recite | A "Recite" TTS extension already exists. Recite Me is an established accessibility toolbar vendor. |
| Legere | Legere Reader is an existing accessible reading app with Bookshare integration. Direct category hit. |
| Aura | Already an accessibility TTS Chrome extension. |
| Readvox, Voice Out, Verbose, Talkie, Audeus, Capti, TTSReader, ElevenReader | Taken. |
| NaturalReader, Speechify, TextAloud, ReadPlease, Kurzweil, Texthelp | Registered marks. |

Held alternates if Herald fails clearance: **Rostrum**, **Sonant**, **Praelector**.

## Proctorio's relationship to the brand

Keep Proctorio out of the product name. Put it in the publisher field and the description.

Rationale: the institutional credibility and the VPAT lineage are worth having, but a student encountering a Proctorio-branded accessibility tool reads it as surveillance, and adoption suffers. "Herald, from Proctorio" in the listing gets the credibility without the baggage. It also keeps the extension genuinely useful outside exam contexts, which strengthens the unique-value argument in store review.

## Manifest fields

```jsonc
{
  "name": "__MSG_extName__",           // "Herald"
  "short_name": "Herald",
  "description": "__MSG_extDescription__",
  "version": "1.0.0",                  // reset. Do not inherit upstream's 2.x line.
  "manifest_version": 3
  // "key": DELETED (see 02-fork-delinking-plan.md)
  // "oauth2": DELETED
}
```

Version reset to `1.0.0` is deliberate. Inheriting upstream's `2.23.x` line implies a lineage that does not exist for your users and creates confusing changelogs.

Update `_locales/en/messages.json` and every other locale that survives. VERIFY IN REPO: upstream ships many locales. Decide whether to keep translations for strings you have changed. A stale translation that still says "Read Aloud" in Portuguese is a real branding leak and a plausible store review flag. Safest path: keep locale infrastructure, ship English complete, mark other locales as needing retranslation rather than shipping half-rebranded strings.

`package.json`: update `name`, `description`, `author`, `homepage`, `repository`. Remove `sync-page-scripts`.

## Icons

Every upstream icon and image gets replaced. They are Streamline Labs and Freepik derived, not the author's to sublicense (see `01-legal-clearance.md`).

Requirements:
- Original artwork, commissioned or created in-house, with a written assignment on file.
- Sizes: 16, 32, 48, 128 at minimum. Provide a 440x280 small promo tile for the store.
- Must be legible at 16px in both light and dark browser themes.
- Must not resemble the upstream icon. Different silhouette, different color family.
- Concept direction: the herald silhouette, or a simplified sound-from-page mark. Avoid speaker cones and sound waves, which is what every competitor uses.
- Provide a monochrome variant for high contrast mode.

## Store listing copy

Title field: `Herald, Text to Speech Reader`

Do not keyword-stuff the title. Do not put "Proctorio" in the title.

Short description, one sentence, leads with the differentiator:

> Reads web pages aloud using your device's built-in voices. No account, no cloud, no data leaves your browser.

Long description must establish four things, in this order:

1. **What it does.** Reads selected text or full pages aloud with your operating system and browser voices. Keyboard driven. Works alongside screen readers rather than fighting them.
2. **The privacy claim, stated plainly.** Default mode makes zero network requests. Text never leaves the device. No account, no sign-in, no analytics.
3. **Who it is for.** Students with reading disabilities, low vision users, institutions with Section 508 and WCAG obligations, and anyone taking a proctored assessment who needs assistive technology that will not conflict with exam software.
4. **The differentiation from upstream and competitors.** This is the sentence store review cares about. Say it explicitly: Herald is a minimal, local-only, allow-list-friendly reader built for locked-down assessment environments, which is a different product from cloud-voice readers.

Attribution line at the bottom of the long description:

> Built on Read Aloud by Hai Phan, MIT licensed. Herald is an independent project and is not affiliated with or endorsed by the original author.

That second sentence is not optional. It is the cleanest defense against the store's impersonation policy.

## Repo and identifiers

- GitHub repo name: `herald`. Not `read-aloud-fork`, which carries the name you are shedding.
- Commit `FORK.md` recording the upstream repo, the exact fork commit SHA, and the MIT attribution.
- Add `upstream` as a git remote pointing at `ken107/read-aloud` for cherry-picking. Never merge upstream branches wholesale.
- GitHub defaults a fork's pull request base to the parent repo. Check the base branch on every PR or you will send Proctorio's changes to Hai Phan.

## Domain

Secure a domain before the listing goes live. The store listing needs a homepage URL and a privacy policy URL, and both should be on a domain you control that matches the product name. See `08-open-questions.md`.

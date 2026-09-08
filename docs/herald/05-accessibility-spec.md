# 05. Accessibility Spec

This is the product, not a compliance checkbox. A text to speech extension with an inaccessible UI is a joke that institutional buyers will notice.

## Target

WCAG 2.2 Level AA for all extension-owned UI (popup, options page, any injected control surface). Section 508 conformance documented in a VPAT. Proctorio has an existing Deque Systems relationship for annual VPATs, so route Herald's audit through the same engagement rather than standing up a new one.

## The hard problem: coexisting with screen readers

The failure mode nobody tests for is double-speech. A blind user running JAWS or NVDA already has a reader. Herald must not compete with it.

Rules:

1. **Never auto-read.** Reading is always explicitly user-invoked. No read-on-page-load, no read-on-navigate, ever. This is also an exam integrity requirement.
   Amendment (phase 5): the single sanctioned exception is the exam-safe
   overlay announcement. It is off by default, activates only when the user
   has enabled exam-safe mode AND an overlay selector is configured
   (decision D15), runs only after a user-invoked read injected the content
   script, and announces exam-critical interrupt overlays that a student
   must not miss. It never reads page content.
2. **Do not narrate your own UI through the TTS engine.** Extension UI is announced by the user's screen reader through normal accessible markup. Herald's synthesized voice is for page content only.
3. **Status changes use a single polite live region.** One `aria-live="polite"` region for playback state. Do not use `assertive` for anything short of an error. Do not add a second live region.
4. **Pause on screen reader interruption is not detectable, so give the user a fast out.** A global keyboard shortcut that stops speech immediately, working regardless of focus location.
5. **Do not steal focus.** Invoking a read must not move focus. When a read completes, focus stays where the user left it.
6. **Highlighting must not break the accessibility tree.** If you implement word or sentence highlighting, use an overlay or the CSS Custom Highlight API. Wrapping page text in injected spans fragments the accessibility tree and can make the page worse for the exact users you are serving.

## Extension UI requirements

- Every control reachable and operable by keyboard alone. Logical tab order. No focus traps.
- Visible focus indicator meeting WCAG 2.2 focus appearance. Do not rely on the browser default if you have restyled anything.
- All controls have accessible names. Icon-only buttons get `aria-label`. Do not label a button "play" and change its behavior to pause without changing the accessible name.
- Text contrast 4.5:1 minimum, UI component contrast 3:1 minimum, verified in both light and dark themes.
- Respect `prefers-reduced-motion`. No animated progress indicators for users who opted out.
- Respect `prefers-contrast` and OS high contrast mode. Icons need a monochrome variant.
- Popup must be usable at 200% browser zoom and at 320 CSS pixel width without horizontal scroll.
- Do not convey state by color alone. Playing versus paused needs a shape or text difference.
- Form controls in the options page have real `<label>` associations, not placeholder text.

## Keyboard shortcuts

Define via `chrome.commands` so users can rebind them. At minimum:

| Action | Suggested default | Notes |
|---|---|---|
| Read selection, or resume | Alt+R | Must work without opening the popup |
| Stop | Alt+S | Highest priority. Must work from any focus location. |
| Pause / resume toggle | Alt+P | |
| Speed up / slow down | Alt+Up / Alt+Down | |

Do not bind anything that collides with common screen reader command layers. JAWS and NVDA claim large swaths of Insert-modified and Caps Lock-modified keys. Alt-modified combinations are comparatively safe, but verify against each reader during testing.

## Test matrix

Every combination gets a manual pass before launch. Automated testing does not catch double-speech, focus theft, or announcement quality.

| Screen reader | Browser | Platform | Priority |
|---|---|---|---|
| NVDA | Chrome | Windows | P0 |
| JAWS | Chrome | Windows | P0 |
| VoiceOver | Chrome | macOS | P0 |
| ChromeVox | Chrome | ChromeOS | P0, education market |
| Narrator | Edge | Windows | P1 |
| None (keyboard only) | Chrome | All | P0 |

For each: install, configure a voice, read a selection, read a full page, pause, resume, stop, change speed, and do it all again with the extension popup opened by keyboard.

Additional passes:
- 200% and 400% browser zoom.
- Windows high contrast mode.
- Dark theme.
- Automated axe-core scan of the popup and options page. Zero violations, not "zero criticals."

## Accessibility statement

Ship a public accessibility conformance statement alongside the VPAT. Include a contact path for accessibility issues that reaches a human, not a generic support queue. This is table stakes for education procurement and it is the first thing a disability services office looks for.

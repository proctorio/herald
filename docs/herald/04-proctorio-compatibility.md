# 04. Proctorio Compatibility

## The problem being solved

Proctoring software closes or blocks incompatible extensions when an assessment launches, then restores them afterward. Partners maintain their own allow-lists. An assistive technology user whose reader gets killed at exam start has an accessibility failure, not an inconvenience.

Proctorio already supports OS-level and browser screen readers: VoiceOver, ChromeVox, JAWS, NVDA, and Kurzweil 3000 / Read the Web as browser extensions. VERIFIED from Proctorio's public accessibility page, which also documents annual VPATs with Deque Systems since 2019 affirming Revised Section 508 compliance.

The gap is a general-purpose page reader that behaves well enough under exam conditions to be allow-listed with confidence. That is Herald.

## Design constraints, in priority order

### 1. Deterministic, minimal injection

Exam integrity heuristics react to extensions that mutate the DOM broadly, inject at document_start, or rewrite network traffic. Herald must be boring.

- Content script runs at `document_idle`, not `document_start`.
- Injects nothing into the page DOM until the user explicitly invokes a read action. No always-on overlay, no persistent floating panel injected on page load.
- When a UI surface is required in-page, prefer a closed shadow root on a single container element, removed entirely on stop.
- No mutation of page content. Read the DOM, do not rewrite it. Word-level highlighting, if implemented, must use an overlay or the CSS Custom Highlight API rather than wrapping page text in injected spans.
- No `webRequest` or `declarativeNetRequest` rules. None. See `02-fork-delinking-plan.md` section 3.2.

### 2. Zero network in default mode

An extension that makes no outbound requests during an exam is trivially auditable and trivially allow-listable. This is the single strongest argument you can hand an institutional security reviewer. Protect it: any feature that breaks it must be opt-in, off by default, and clearly disabled during exam contexts.

### 3. Exam-safe mode

Implement an explicit mode that can be entered by user preference and, if a mechanism exists, signaled by the exam environment.

Behavior in exam-safe mode:
- Local voices only. Bring-your-own-key paths disabled regardless of user setting.
- No clipboard access, no history access, no cross-tab state.
- No persistence of read content. Nothing written to `chrome.storage` beyond voice and rate preferences.
- No reading of content outside the active tab.

DESIGN DECISION NEEDED: whether Proctorio's extension signals exam start to Herald, and if so by what mechanism (`externally_connectable` messaging, a documented custom event, or nothing at all and the user toggles it manually). This is a cross-team decision, not a Claude Code decision. See `08-open-questions.md`.

Default to the manual toggle. It ships without cross-team dependency and it can be upgraded later.

### 4. No capability that could be mistaken for cheating assistance

This is the reason a proctoring vendor shipping a reader gets scrutinized. Herald reads what is already on screen. It must not:
- Summarize, define, translate, or explain content.
- Fetch anything about the content.
- Persist or export read text.
- Read content the user could not otherwise see.

Any AI feature is out of scope, permanently. Write this into the product description so nobody proposes it in six months.

## Allow-listing workflow

1. Publish to the store and capture the assigned extension ID.
2. Record it in `FORK.md` and in the internal allow-list ticket.
3. Add to Proctorio's own allowed-extensions list.
4. Repeat per partner. Partner allow-lists are independent. Imagine / Edgenuity, for example, maintains its own list and support channel. Budget for this as ongoing partner relations work, not a one-time task.
5. Any change to the extension ID invalidates every allow-list entry. Do not change the ID after launch. Do not republish under a new listing.

## Test matrix, exam conditions

Test inside a live Proctorio exam session, not a mock. Verify for each:

- Extension survives exam start without being closed.
- Reading works during the exam.
- No integrity warnings or flags raised in the proctoring report attributable to Herald.
- Extension state survives a tab reload mid-exam.
- Stopping and restarting a read leaves no residual DOM.
- Behavior with the screen reader also active (see `05-accessibility-spec.md`).
- Behavior when the exam ends and extensions are restored.

Log every integrity flag observed, even ones you believe are unrelated. The point is a clean evidentiary record for the allow-list decision.

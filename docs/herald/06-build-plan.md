# 06. Build Plan

Work these in order. Phases 1 and 2 are blocking. Nothing uploads to the store until Phase 7 passes.

Each phase has acceptance criteria. Do not advance on a partial pass.

---

## Phase 0: Repo hygiene

**Tasks**
- Confirm the fork's upstream commit SHA. `git log --oneline -1` on the fork point.
- Create `FORK.md` from `templates/FORK.md`. Fill in the SHA, date, upstream URL, and license.
- Verify `LICENSE` is present and still carries "Copyright (c) 2016 Hai Phan". If a previous step overwrote it, restore it from upstream.
- Create `NOTICE` from `templates/NOTICE`.
- Add the upstream git remote: `git remote add upstream https://github.com/ken107/read-aloud.git`.
- Create a `main` branch that is your line of development. Keep the upstream default branch untouched as a reference.
- Add a PR template that reminds the author to check the base repo, because GitHub defaults a fork's PR base to the parent.
- Inventory the tree. Produce `docs/herald/INVENTORY.md`: every source file, one line each, what it does, and whether it survives. This is the map for Phase 2 and it forces you to actually read the code before deleting it.

**Acceptance**
- `FORK.md`, `NOTICE`, `LICENSE` all present and correct.
- `INVENTORY.md` covers every file in the repo.
- `git remote -v` shows both `origin` and `upstream`.

---

## Phase 1: Identity de-linking (BLOCKING)

Reference: `02-fork-delinking-plan.md` Class 1.

**Tasks**
- Delete the `key` field from `manifest.json`.
- Delete the entire `oauth2` block from `manifest.json`.
- Grep and remove every reference to: the upstream extension ID `hdhinadidafjejdhmfkjgnolgimiaplp`, `lsdsoftware`, `readaloud.app`, `hai.phan`, and the inherited Google client_id.
- Update `package.json`: `name`, `description`, `author`, `homepage`, `repository`. Remove the `sync-page-scripts` script.

**Acceptance**
- `./scripts/verify-manifest.sh` reports no inherited key and no oauth2 block.
- `./scripts/audit-remote-code.sh` reports zero upstream identity hits.
- Extension loads unpacked without errors.

---

## Phase 2: Server de-linking (BLOCKING)

Reference: `02-fork-delinking-plan.md` Class 2.

**Tasks**
- Locate the voice engine registry and the synthesis dispatch layer. Document what you found in `INVENTORY.md` before changing anything.
- Remove the server-synthesis code path entirely: the premium voice engines, the entitlement check, the purchase flow, the account UI, and the sign-in integration.
- Remove every premium voice from the voice registry. The picker must list only voices that resolve.
- Remove the S3 page-script loader. Bundle locally any page-script you have a specific justification to keep, otherwise delete.
- Remove telemetry, analytics, error reporting, and version-check pings.
- Repoint or remove in-app support and feedback links.
- DECISION GATE: does bring-your-own-key survive? See `08-open-questions.md`. Do not decide this alone. If it survives, it stays off by default, calls the provider directly, and is disabled in exam-safe mode.

**Acceptance**
- `./scripts/audit-remote-code.sh` passes clean.
- Load unpacked, open DevTools Network with "preserve log" on, exercise every UI path including options, confirm zero outbound requests.
- No dead UI. Every control in the popup and options page does something.
- Voice picker lists only working voices.

---

## Phase 3: Permission minimization

Reference: `02-fork-delinking-plan.md` Class 3.

**Tasks**
- Remove `webRequest` and any `declarativeNetRequest` rules.
- Confirm no Google Docs DOM injection variant survives.
- Regenerate the permission set from what the code actually calls. Justify each surviving permission in a comment or in `docs/herald/PERMISSIONS.md`.
- Convert broad host permissions to `activeTab` plus optional host permissions requested at point of use, where feasible.
- Remove unused permissions from `manifest.json` and unused entries from `optional_permissions`.

**Acceptance**
- `./scripts/verify-manifest.sh` passes clean.
- Every permission in the manifest has a written justification and a code path that uses it.
- Install prompt reviewed and screenshotted. If it still says "read and change all your data on all websites," revisit.

---

## Phase 4: Rebrand

Reference: `03-branding-spec.md`.

**Tasks**
- Update `manifest.json`: `name`, `short_name`, `description`. Reset `version` to `1.0.0`.
- Update `_locales/en/messages.json` completely.
- Handle other locales: either retranslate or mark as incomplete. Do not ship half-rebranded strings.
- Replace every icon and image with original artwork at 16, 32, 48, 128, plus a monochrome high-contrast variant.
- Add an About / Credits surface in the options page linking to the upstream repo and the MIT license text.
- Update README, and any in-repo docs, to describe Herald.

**Acceptance**
- Grep for "read aloud", "readaloud", "Read Aloud" across the whole tree, case-insensitive. The only surviving hits are attribution text in `NOTICE`, `FORK.md`, `LICENSE` context, and the About surface.
- No upstream artwork remains. Verify by file hash against the upstream assets if you are not certain.
- Icon legible at 16px in light and dark themes.

---

## Phase 5: Proctorio compatibility

Reference: `04-proctorio-compatibility.md`.

**Tasks**
- Move content script injection to `document_idle`.
- Remove any always-on injected overlay. Inject only on explicit user invocation, tear down completely on stop.
- Move any required in-page UI into a closed shadow root on a single container element.
- Replace span-wrapping highlight with an overlay or the CSS Custom Highlight API, if highlighting is retained.
- Implement exam-safe mode as a user-toggleable preference: local voices only, no persistence of read content, active tab only.
- Confirm no capability for summarizing, defining, translating, explaining, persisting, or exporting content.

**Acceptance**
- Content script adds zero nodes to the page DOM until a read is invoked.
- Stopping a read leaves the page DOM byte-identical to its pre-read state. Verify with a DOM snapshot diff.
- Exam-safe mode toggles cleanly and disables every network-capable path.
- Live Proctorio exam session test passes per the matrix in `04-proctorio-compatibility.md`.

---

## Phase 6: Accessibility hardening

Reference: `05-accessibility-spec.md`.

**Tasks**
- Audit and fix popup and options page: keyboard operability, focus order, focus indicators, accessible names, label associations, contrast, zoom, reduced motion, high contrast.
- Implement the single polite live region for playback status.
- Implement `chrome.commands` shortcuts, including a global stop that works from any focus location.
- Verify no focus theft on read invocation or completion.
- Verify the extension never speaks its own UI.
- Run axe-core against popup and options page.

**Acceptance**
- axe-core: zero violations.
- Full manual pass against the screen reader test matrix, all P0 rows.
- No double-speech observed with any P0 screen reader.
- Popup usable at 200% zoom and 320px width.

---

## Phase 7: Verification gate (BLOCKING before upload)

**Tasks**
- `./scripts/audit-remote-code.sh` clean.
- `./scripts/verify-manifest.sh` clean.
- Build a production zip. Unzip it into a clean directory and re-run both scripts against the unpacked build, not the source tree. Build steps can reintroduce things.
- Manual network audit on the production build.
- Full accessibility matrix pass on the production build.
- Full Proctorio exam matrix pass on the production build.

**Acceptance**
- All scripts clean against the built artifact.
- Signed-off test matrices for accessibility and exam compatibility.

---

## Phase 8: Store submission

Reference: `07-store-submission.md`.

**Tasks**
- Write listing copy per `03-branding-spec.md`.
- Publish the privacy policy at a stable URL on a Proctorio-controlled domain. Template in `templates/PRIVACY.md`.
- Complete the store's data usage disclosures. If default mode collects nothing, say so precisely and make sure it is true.
- Produce screenshots and the 440x280 promo tile.
- Submit. Expect a review round. Budget for one rejection and a resubmit.
- On approval: capture the assigned extension ID, record it in `FORK.md`, and open the allow-list tickets.

**Acceptance**
- Listing live.
- Extension ID recorded and submitted to Proctorio's allow-list and each relevant partner allow-list.

---

## What "shipped" means

Not "approved by the store." Shipped means approved, allow-listed by Proctorio, allow-listed by at least the top partner environments, VPAT updated, and the accessibility statement published. Track those four as launch blockers, not follow-ups.

# Privacy Policy Skeleton

Draft pending final legal sign-off. Hosted by the public repository at
https://github.com/proctorio/herald/blob/main/docs/herald/PRIVACY.md and linked from
the Chrome Web Store listing (decided: the repository is the public home for the
policy, support, and contact).

The policy must match the shipped code exactly. A reviewer comparing declared data
practices against the manifest permission set is the most common rejection path for a
privacy-forward extension.

---

## Herald Privacy Policy

Last updated: 2026-08-17 (draft pending legal review and hosting URL)

### Summary

Herald is a browser extension for Google Chrome, published and maintained by
Proctorio Incorporated of Scottsdale, Arizona. It reads web page text aloud using the
voices your device provides. Herald itself makes no network requests. There is no
account, no sign-in, and no analytics. The only way text can leave your machine is if
you choose a network voice supplied by your browser, described below.

### What Herald accesses

- **Page text you ask it to read.** When you invoke a read action, Herald reads text from
  the active tab in order to pass it to your device's speech engine. Herald does not
  transmit, log, or store that text.
- **Your preferences.** Voice selection, speech rate, pitch, and mode settings are stored
  locally in browser storage on your device. Herald does not use browser sync, and
  nothing is sent to any server operated by Proctorio.

### Browser-provided network voices

Some browsers and operating systems offer network-backed voices through their built-in
speech engines (for example, Google network voices in Chrome). If you select one of
these voices, your browser sends the text to that voice provider to synthesize the
audio. That transmission is performed by the browser, not by Herald, and is governed
by the browser vendor's privacy policy. Voices your browser marks as local are
processed entirely on your device. Exam-safe mode never uses a network voice,
regardless of your voice setting.

### Browser permissions

Installing Herald asks you to grant these Chrome permissions. They are the complete
set the extension declares, and each exists solely to read the current page aloud:

- **Read the page you invoke it on (activeTab).** Grants access to the current tab's
  content only when you click Herald's button or use its keyboard shortcut, and only
  until that tab navigates away.
- **Add a right-click menu entry (contextMenus).** Provides the "read selection"
  context-menu item.
- **Run its reader script (scripting).** Lets Herald place its text-extraction script
  into the page you asked it to read.
- **Save your settings (storage).** Stores your voice, rate, pitch, and mode
  preferences locally on your device.
- **Speak (tts).** Uses the browser's text-to-speech engine and the voices installed
  on your device.

Two kinds of optional permission exist that Herald requests only at the point of use,
with a Chrome prompt you can decline: locating readable content inside embedded frames
on sites that require it (webNavigation), and reading a specific site or local file
whose viewer needs direct access (site access you approve per request). Nothing
optional is granted at install, and you can revoke any grant at any time from Chrome's
extension settings.

### Cookies and tracking technologies

Herald does not use cookies, web beacons, or similar tracking technologies.

### What Herald does not do

- Does not create an account or require sign-in.
- Does not collect analytics, usage statistics, or crash reports.
- Does not itself transmit page content anywhere (see the note on browser-provided
  network voices above).
- Does not store the content it reads.
- Does not track browsing history.
- Does not sell or share data with third parties, because it does not collect any.

### Exam-safe mode

When exam-safe mode is active, Herald uses only local device voices, disables any
network-capable feature regardless of user setting, and reads only the active tab.
In the current release, exam-safe mode is enabled from Herald's options page;
institutions may instruct test takers to enable it before an assessment.

### Use during proctored exams

If you use Herald during a proctored assessment, the proctoring software in use (for
example Proctorio) may record the exam session, including audio and the screen. Those
recordings can capture the text Herald displays or speaks aloud. Such recordings are
made by the proctoring service under your institution's agreements and the proctoring
provider's own privacy policy; they are not made by Herald and are not governed by
this policy.

### Children's privacy and regulatory posture

Herald is used in K-12 and higher education settings. The statements below address
FERPA, COPPA, GDPR, and other applicable data privacy regulations.

#### FERPA (Family Educational Rights and Privacy Act)

Herald is often used within institutional learning environments alongside assessment
tools like Proctorio. Because Herald processes page text entirely on the user's device
and never transmits or stores that text, it does not create, receive, or maintain
education records on behalf of any institution. Herald does not function as a "school
official" under FERPA and does not require a separate data-sharing or data-processing
agreement, since no student data leaves the device through Herald's operation.

#### COPPA (Children's Online Privacy Protection Act)

Herald does not collect personal information from any user, including children under
13. It does not require an account, does not use persistent identifiers to track users
across sites or sessions, and does not serve behavioral advertising. Because Herald
collects no personal information from any user, it does not meet COPPA's definition of
an operator that collects information from children, and verifiable parental consent
requirements are not triggered. Where a school deploys Herald on students' behalf, no
additional parental consent is needed given Herald's no-collection design.

#### GDPR / UK GDPR (EU, EEA, and UK users)

Herald does not process personal data as defined under GDPR Article 4(1). Page text
and preference settings are handled entirely on the user's device and are never
transmitted by Herald to Proctorio or any third party. Because no personal data is
collected, Herald does not act as a data controller or processor, and GDPR
requirements concerning lawful basis, data subject access requests, the right to
erasure, and cross-border transfer safeguards (SCCs, adequacy decisions) do not apply
to its current functionality. If a future version introduces any network-connected
feature, this policy will be updated before that feature ships to identify the lawful
basis, data controller, and applicable safeguards.

#### International Data Transfers

Because Herald does not collect or transmit personal data, there are no international
transfers of personal data by Herald to disclose. Where a user selects a
browser-provided network voice (see "Browser-provided network voices" above), any
resulting transmission of text is performed by the browser vendor, not Herald, and is
governed by that vendor's own privacy policy, including whatever international-transfer
safeguards that vendor has in place.

#### CCPA / CPRA (California)

Herald does not sell, share, or collect personal information as defined under the
CCPA/CPRA. Because no personal information is held, there is nothing to act on for
requests to know, delete, correct, or opt out of sale or sharing. If this changes,
Proctorio will update this policy and provide a mechanism for exercising these rights
before any collection begins.

#### State student privacy laws (SOPIPA, SOPPA, and similar)

Because Herald is used in K-12 settings, this covers laws like California's SOPIPA,
Illinois' SOPPA, and comparable state student-data statutes. Herald does not use
student data for targeted advertising, does not build student profiles, does not sell
student data, and does not retain student data of any kind, consistent with these laws'
core obligations.

#### New York Education Law 2-d / Parents' Bill of Rights

Suggested vendor supplement language for districts that require one:

> Herald Parents' Bill of Rights Supplement: Herald does not collect, store, or
> transmit personally identifiable student information. All text-to-speech processing
> occurs locally on the student's device, using voices already installed in the
> operating system or browser. No student data is shared with Proctorio, the school, or
> any third party through Herald's operation.

#### Other jurisdictions

Herald's design (no collection, no transmission, no storage of user data) means it
does not trigger obligations under other regional or sectoral privacy laws, including
Canada's PIPEDA, Australia's Privacy Act, and U.S. state comprehensive privacy laws
such as Virginia's VCDPA or Colorado's CPA. If Herald's functionality changes to
include data collection or network transmission, this policy will be updated to address
the applicable requirements before that change takes effect.

### Changes

Material changes to this policy will be announced in the extension's release
notes and reflected in the date above. Because Herald collects nothing,
changes are expected to be rare and editorial.

### Contact

Herald is developed in the open, and its public repository is the way to reach the
people who build it:

- **Questions about this policy or anything else:** open an issue at
  https://github.com/proctorio/herald/issues or start a discussion at
  https://github.com/proctorio/herald/discussions. Issues are read and answered by
  the maintainers.
- **Accessibility barriers:** use the dedicated accessibility issue template at the
  same address; these reports are treated as high priority.
- **Security or privacy vulnerability reports:** use the repository's private
  vulnerability reporting at https://github.com/proctorio/herald/security so the
  report is not public before it is addressed.

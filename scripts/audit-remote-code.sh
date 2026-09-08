#!/usr/bin/env bash
#
# audit-remote-code.sh
#
# Scans for the three things that must not ship in Herald:
#   1. Upstream identity (extension ID, author domains, inherited OAuth client)
#   2. Upstream-hosted services (S3 bucket, synthesis endpoints)
#   3. Remotely hosted code (any http/https script reference)
#
# Run against the source tree during development, and against the UNPACKED
# PRODUCTION BUILD before every store upload. Build steps can reintroduce things.
#
# Usage:
#   ./scripts/audit-remote-code.sh [path]     # defaults to repo root
#
# Exit 0 = clean. Exit 1 = findings. Exit 2 = usage error.

set -uo pipefail

TARGET="${1:-.}"
FAIL=0

if [ ! -d "$TARGET" ]; then
  echo "error: not a directory: $TARGET" >&2
  exit 2
fi

# Scan from inside the target so directory-name excludes (dist, build, docs)
# can never swallow the target root itself: invoking this script as
# "audit-remote-code.sh dist" previously matched --exclude-dir=dist against
# the target and silently scanned nothing.
DISPLAY_TARGET="$(cd "$TARGET" && pwd)"
cd "$TARGET" || exit 2
TARGET="."

# Paths excluded from scanning. Attribution files are allowed to name upstream.
EXCLUDES=(
  --exclude-dir=.git
  --exclude-dir=node_modules
  --exclude-dir=dist
  --exclude-dir=build
  --exclude-dir=docs
  --exclude-dir=coverage
  # Test output: junit xml, traces, and the e2e test build (which carries a
  # localhost fixture host permission by design) are not shipped artifacts.
  --exclude-dir=.test_output
  --exclude-dir=test-results
  # Unit and integration tests plus repo tooling are not shipped artifacts
  # (the package zip is built from dist/ only).
  --exclude-dir=test
  --exclude-dir=e2e
  --exclude-dir=tools
  --exclude=.npmrc
  --exclude=eslint.config.js
  --exclude=vitest.config.js
  --exclude=playwright.config.js
  --exclude-dir=.github
  --exclude=NOTICE
  --exclude=FORK.md
  --exclude=LICENSE
  --exclude=CLAUDE.md
  --exclude=audit-remote-code.sh
  --exclude=verify-manifest.sh
  --exclude=package-lock.json
  --exclude='*.map'
  # Non-shipped files. The package script zips only _locales css img js sound
  # *.html manifest.json background.js, so repo docs and tooling metadata are
  # not part of the store artifact.
  --exclude='*.md'
  --exclude='*.yml'
  --exclude=.gitignore
  --exclude=package.json
)

# URLs permitted to appear in shipped code. Attribution links live here.
# Add entries only with a written justification.
#
# Justified additions (phase 2):
# - getbootstrap.com, github.com/twbs, github.com/ReactiveX: license
#   attribution headers inside vendored minified libraries. Comments, not code.
# - stackoverflow.com, developer.chrome.com: source comments citing references.
# - docs.google.com, onedrive.live.com, dropbox.com, officeapps.live.com,
#   luoa.instructure.com, *.instructure.com (canvas point-of-use origin
#   pattern, phase 5), luoa-content.s3.amazonaws.com: URL match patterns
#   and origin strings in js/content-handlers.js used to route per-site
#   extractors and request point-of-use host permissions. Nothing is fetched
#   from these strings; they are compared against tab and frame URLs.
# - chromewebstore.google.com, addons.mozilla.org: unsupported-sites list in
#   js/defaults.js, matched against tab URLs to show a friendly error.
# - https?://*/ wildcards: manifest optional_host_permissions patterns.
ALLOWLIST_REGEX='https://github\.com/ken107/read-aloud|https://opensource\.org/licenses/MIT|http://www\.w3\.org/|https://getbootstrap\.com|https://github\.com/twbs/bootstrap|https://github\.com/ReactiveX/RxJS|http://stackoverflow\.com|https://developer\.chrome\.com|https://docs\.google\.com/|https://onedrive\.live\.com/|https://www\.dropbox\.com/|https://(usc-)?word-edit\.officeapps\.live\.com/|https://luoa\.instructure\.com/|https://\*\.instructure\.com/|https://luoa-content\.s3\.amazonaws\.com/|https://chromewebstore\.google\.com|https://addons\.mozilla\.org|https?://\*/'

hr() { printf '%s\n' "----------------------------------------------------------------"; }

report() {
  # $1 = section label, $2 = grep output
  local label="$1" out="$2"
  if [ -n "$out" ]; then
    hr
    echo "FAIL: $label"
    hr
    printf '%s\n' "$out"
    echo
    FAIL=1
  else
    echo "  ok: $label"
  fi
}

echo "Herald remote code audit"
echo "target: $DISPLAY_TARGET"
echo

# ---------------------------------------------------------------- 1. identity

out=$(grep -rInE "hdhinadidafjejdhmfkjgnolgimiaplp" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null)
report "upstream Chrome Web Store extension ID" "$out"

out=$(grep -rInE "lsdsoftware|readaloud\.app|hai\.phan" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null)
report "upstream author domains and contact" "$out"

out=$(grep -rInE "311515340069|apps\.googleusercontent\.com" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null)
report "inherited Google OAuth client_id" "$out"

# ---------------------------------------------------------------- 2. services

# The generic s3.amazonaws.com pattern is filtered through the allowlist:
# customer content hosts (luoa-content) appear as frame URL matchers in
# content-handlers.js, never as fetch targets. The upstream bucket pattern
# stays unconditional.
out=$(grep -rInE "lsdsoftware-assets|s3://|s3\.amazonaws\.com|page-scripts" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null \
      | grep -vE "$ALLOWLIST_REGEX")
report "upstream S3 bucket and page-script loader" "$out"

out=$(grep -rInE "sync-page-scripts|aws s3 sync" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null)
report "S3 sync tooling" "$out"

# ------------------------------------------------------- 3. remote hosted code

# Chrome's own guidance for the MV3 remote-code rejection is to search for
# http:// and https:// across the project. Allowlisted URLs are filtered out.
out=$(grep -rInE "https?://" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null \
      | grep -vE "$ALLOWLIST_REGEX")
report "http/https references (MV3 remote hosted code check)" "$out"

# Dynamic code execution patterns that reviewers flag.
# background.js is excluded with justification: it is a 12-line classic
# service worker bootstrap whose importScripts() loads only extension-local
# js/ files (audited by eye on every change; goes away entirely when the
# worker converts to a module in phase 3.5).
out=$(grep -rInE "\beval\(|new Function\(|importScripts\(|document\.write\(" "${EXCLUDES[@]}" --exclude=background.js "$TARGET" 2>/dev/null)
report "dynamic code execution patterns" "$out"

# Script tags built at runtime, the classic remote-load pattern.
# jquery-3.7.1.min.js is excluded with justification: jQuery's internal
# globalEval/script helpers create script elements from local strings; no
# first-party code passes remote content into them. The vendored jQuery is
# scheduled for removal after 1.0 (decision D13).
out=$(grep -rInE "createElement\(['\"]script['\"]\)" "${EXCLUDES[@]}" --exclude=jquery-3.7.1.min.js "$TARGET" 2>/dev/null)
report "runtime script element creation" "$out"

# --------------------------------------------------------------- 4. leftovers

# The allowlisted attribution URL legitimately contains the upstream name, so it
# is filtered here. A bare mention of the upstream name anywhere else is a leak.
# Case-insensitive since phase 4: store review cares about the visible name
# in any casing. The verbatim MIT attribution sentence in the options About
# surface is allowlisted by exact text.
ATTRIBUTION_REGEX='Read Aloud</a> by Hai Phan'
out=$(grep -rIinE "read[ _-]?aloud" "${EXCLUDES[@]}" "$TARGET" 2>/dev/null \
      | grep -vE "$ALLOWLIST_REGEX" | grep -vE "$ATTRIBUTION_REGEX")
report "upstream product name in shipped files (branding leak)" "$out"

# Locale files are the classic leak. Scanned separately so the finding is obvious.
if [ -d "$TARGET/_locales" ]; then
  out=$(grep -rIinE "read[ _-]?aloud" "$TARGET/_locales" 2>/dev/null)
  report "upstream product name in _locales (check every language)" "$out"
fi

echo
hr
if [ "$FAIL" -eq 0 ]; then
  echo "AUDIT CLEAN"
  hr
  exit 0
else
  echo "AUDIT FAILED. Resolve every finding above before uploading."
  echo "Anything genuinely intentional goes in the allowlist with a written"
  echo "justification, not silently ignored."
  hr
  exit 1
fi

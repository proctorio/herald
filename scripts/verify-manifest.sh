#!/usr/bin/env bash
#
# verify-manifest.sh
#
# Checks manifest.json for inherited upstream identity, forbidden APIs, and
# permission bloat. Run before every store upload, against the production build.
#
# Usage:
#   ./scripts/verify-manifest.sh [path/to/manifest.json]
#
# Exit 0 = clean. Exit 1 = findings. Exit 2 = usage error.

set -uo pipefail

MANIFEST="${1:-manifest.json}"

if [ ! -f "$MANIFEST" ]; then
  echo "error: manifest not found: $MANIFEST" >&2
  exit 2
fi

# Prefer python3, but fall back to python. On Windows the python3 on PATH is
# often a non-executable store stub, so probe by running it, not by locating it.
if python3 -c "pass" >/dev/null 2>&1; then
  PYTHON=python3
elif python -c "pass" >/dev/null 2>&1; then
  PYTHON=python
else
  echo "error: python3 or python required" >&2
  exit 2
fi

"$PYTHON" - "$MANIFEST" <<'PY'
import json, sys

path = sys.argv[1]
try:
    with open(path) as f:
        m = json.load(f)
except json.JSONDecodeError as e:
    print(f"error: manifest is not valid JSON: {e}", file=sys.stderr)
    sys.exit(2)

fails, warns, oks = [], [], []

def fail(msg): fails.append(msg)
def warn(msg): warns.append(msg)
def ok(msg):   oks.append(msg)

# ------------------------------------------------ inherited upstream identity

if "key" in m:
    fail("manifest contains a 'key' field. This pins the extension ID to the "
         "upstream author's keypair. Delete it and let the store assign an ID.")
else:
    ok("no inherited 'key' field")

if "oauth2" in m:
    fail("manifest contains an 'oauth2' block. The upstream client_id belongs to "
         "the upstream author. Delete the whole block. Herald has no sign-in.")
else:
    ok("no 'oauth2' block")

name = str(m.get("name", ""))
short = str(m.get("short_name", ""))
if "read" in name.lower().replace(" ", "") and "aloud" in name.lower().replace(" ", ""):
    fail(f"manifest name still references upstream: {name!r}")
elif name.startswith("__MSG_"):
    warn(f"name is localized ({name}). Verify every _locales file, including "
         "non-English, for leftover upstream branding.")
else:
    ok(f"name: {name!r}")

if short and "aloud" in short.lower():
    fail(f"short_name still references upstream: {short!r}")

# --------------------------------------------------------------- MV3 basics

mv = m.get("manifest_version")
if mv != 3:
    fail(f"manifest_version is {mv}. Must be 3.")
else:
    ok("manifest_version 3")

version = str(m.get("version", ""))
if version.startswith("2."):
    warn(f"version {version} looks inherited from the upstream 2.x line. "
         "Reset to 1.0.0 for the first Herald release.")
elif version:
    ok(f"version {version}")

if "background" in m and "scripts" in m.get("background", {}):
    fail("background.scripts is MV2. Use background.service_worker.")

# ---------------------------------------------------------- forbidden APIs

perms = list(m.get("permissions", []))
opt_perms = list(m.get("optional_permissions", []))
host_perms = list(m.get("host_permissions", []))
opt_hosts = list(m.get("optional_host_permissions", []))

FORBIDDEN = {
    "webRequest": "network interference, trips exam integrity heuristics and store review",
    "webRequestBlocking": "MV2 only and forbidden here",
    "declarativeNetRequest": "no network rules should ship",
    "declarativeNetRequestWithHostAccess": "no network rules should ship",
    "identity": "no sign-in in Herald",
    "identity.email": "no sign-in in Herald",
    "history": "not needed, and a red flag in exam contexts",
    "cookies": "not needed",
    "management": "not needed, and reads as extension surveillance",
    "debugger": "never",
    "proxy": "never",
    "downloads": "no export of read content, by design",
    "clipboardRead": "disallowed in exam contexts",
}

for p in perms + opt_perms:
    if p in FORBIDDEN:
        fail(f"forbidden permission {p!r}: {FORBIDDEN[p]}")

if not any(p in FORBIDDEN for p in perms + opt_perms):
    ok("no forbidden permissions")

# ------------------------------------------------------- permission scope

BROAD = {"<all_urls>", "*://*/*", "http://*/*", "https://*/*"}
broad_found = [h for h in host_perms if h in BROAD]
if broad_found:
    warn(f"broad host permissions at install time: {broad_found}. Prefer "
         "'activeTab' plus optional_host_permissions requested at point of use. "
         "The install prompt is a real gate for education buyers.")
elif host_perms:
    ok(f"host_permissions scoped: {host_perms}")
else:
    ok("no install-time host permissions")

if "activeTab" in perms:
    ok("uses activeTab")

for p in perms:
    if p not in FORBIDDEN:
        warn(f"permission {p!r} present. Confirm a live code path uses it and "
             "that it is justified in docs/herald/PERMISSIONS.md.")

# ----------------------------------------------------- content script shape

for i, cs in enumerate(m.get("content_scripts", [])):
    run_at = cs.get("run_at", "document_idle")
    if run_at != "document_idle":
        fail(f"content_scripts[{i}] run_at is {run_at!r}. Must be 'document_idle'. "
             "Early injection is what exam integrity heuristics react to.")
    else:
        ok(f"content_scripts[{i}] run_at document_idle")
    if cs.get("all_frames"):
        warn(f"content_scripts[{i}] injects into all_frames. Justify or remove.")
    for pat in cs.get("matches", []):
        if pat in BROAD:
            warn(f"content_scripts[{i}] matches {pat!r}. Broad injection surface.")

# -------------------------------------------------------------- CSP checks

csp = m.get("content_security_policy", {})
if isinstance(csp, dict):
    for k, v in csp.items():
        if "http" in str(v):
            fail(f"CSP {k} allows a remote origin: {v!r}. MV3 forbids remote code.")
        if "unsafe-eval" in str(v):
            fail(f"CSP {k} allows unsafe-eval: {v!r}")

# ------------------------------------------------------------------ output

def section(title, items, prefix):
    if items:
        print(f"\n{title}")
        print("-" * 64)
        for it in items:
            print(f"{prefix} {it}")

print("Herald manifest verification")
print(f"target: {path}")

section("PASS", oks, "  ok:")
section("WARN (review each, not automatically blocking)", warns, "  !!")
section("FAIL (blocking)", fails, "  XX")

print()
print("-" * 64)
if fails:
    print(f"MANIFEST FAILED: {len(fails)} blocking, {len(warns)} warnings")
    print("-" * 64)
    sys.exit(1)
else:
    print(f"MANIFEST CLEAN: 0 blocking, {len(warns)} warnings")
    print("-" * 64)
    sys.exit(0)
PY

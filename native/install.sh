#!/bin/sh
# Installs the MarkCraft native messaging host for Chrome-family browsers (macOS & Linux).
# Usage: ./native/install.sh [extension-id]   (defaults to the id fixed by the manifest key)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="${1:-ollacgmpgcahkaknhhanopkaeimhckbn}"
NAME="com.markcraft.host"
PY="$(command -v python3 || true)"
[ -z "$PY" ] && { echo "python3 is required" >&2; exit 1; }

# Chrome starts hosts with a minimal PATH, so record absolute locations now.
LAUNCHER="$HERE/markcraft-host"
cat > "$LAUNCHER" <<SH
#!/bin/sh
exec "$PY" "$HERE/markcraft_host.py" "\$@"
SH
chmod +x "$LAUNCHER" "$HERE/markcraft_host.py"

"$PY" - "$HERE/config.json" <<PYEOF
import json, shutil, sys
json.dump({"path": "$PATH", "clis": {"claude": shutil.which("claude"), "codex": shutil.which("codex")}}, open(sys.argv[1], "w"), indent=2)
PYEOF

MANIFEST=$(cat <<JSON
{
  "name": "$NAME",
  "description": "MarkCraft native helper",
  "path": "$LAUNCHER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON
)

if [ "$(uname)" = "Darwin" ]; then
  BASE="$HOME/Library/Application Support"
  DIRS="Google/Chrome
Google/Chrome Beta
Google/Chrome Canary
Google/Chrome for Testing
Chromium
Microsoft Edge
BraveSoftware/Brave-Browser
Arc/User Data"
else
  BASE="$HOME/.config"
  DIRS="google-chrome
google-chrome-beta
google-chrome-unstable
chromium
microsoft-edge
BraveSoftware/Brave-Browser"
fi

installed=0
OLDIFS="$IFS"; IFS='
'
for d in $DIRS; do
  [ -d "$BASE/$d" ] || continue
  mkdir -p "$BASE/$d/NativeMessagingHosts"
  printf '%s\n' "$MANIFEST" > "$BASE/$d/NativeMessagingHosts/$NAME.json"
  echo "Installed for $d"
  installed=1
done
IFS="$OLDIFS"
[ "$installed" = 1 ] || { echo "No Chrome-family browser profile found under $BASE" >&2; exit 1; }
echo "Done. Reload the MarkCraft tab to use agents, the terminal and direct saving."

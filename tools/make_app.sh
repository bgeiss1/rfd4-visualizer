#!/usr/bin/env bash
# Builds "RFD4 Dashboard.app" on the Desktop. Double clicking it starts the local server
# if it is not already running and opens the text dashboard, the same way the GROMACS one does.
#
#   bash tools/make_app.sh
#
# Safe to run again. That is also how you fix the app after moving the site folder.
set -euo pipefail

SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$HOME/Desktop/RFD4 Dashboard.app}"

[ -f "$SITE/serve.mjs" ] || { echo "No serve.mjs in $SITE. Run this from inside the site folder."; exit 1; }

rm -rf "$DEST"
mkdir -p "$DEST/Contents/MacOS" "$DEST/Contents/Resources"

cat > "$DEST/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>RFD4 Dashboard</string>
  <key>CFBundleDisplayName</key><string>RFD4 Dashboard</string>
  <key>CFBundleIdentifier</key><string>edu.colostate.mip662.rfd4dashboard</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>RFD4 Dashboard</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# The launcher remembers where the site was when the app was built, and says so plainly if
# the folder has moved rather than failing silently.
cat > "$DEST/Contents/MacOS/RFD4 Dashboard" <<LAUNCH
#!/usr/bin/env bash
site="$SITE"
if [ ! -f "\$site/tools/open_dashboard.sh" ]; then
  osascript -e 'display alert "RFD4 Dashboard" message "The site folder has moved. Run bash tools/make_app.sh in the new folder to rebuild this app."'
  exit 1
fi
exec bash "\$site/tools/open_dashboard.sh"
LAUNCH

chmod +x "$DEST/Contents/MacOS/RFD4 Dashboard"
chmod +x "$SITE/tools/open_dashboard.sh"

# Borrow the GROMACS app's icon if there is one, so the two look like a pair.
for src in "$HOME/Desktop/GROMACS Dashboard.app/Contents/Resources"/*.icns; do
  [ -f "$src" ] || continue
  cp "$src" "$DEST/Contents/Resources/app.icns"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string app" "$DEST/Contents/Info.plist" >/dev/null 2>&1 || true
  break
done

touch "$DEST"
echo "Built: $DEST"
echo "It serves $SITE on port 8004 and opens the dashboard."
echo
echo "Double click it. The first time, macOS may ask whether you are sure, because it is"
echo "an app you built rather than one you downloaded. Open it once and it stops asking."

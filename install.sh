#!/bin/bash
# Installs the RFD4 Visualizer next to the other MIP 662 sites.
# Run it from the folder this archive unpacked into:   bash install.sh
set -euo pipefail
DEST="${1:-$HOME/Desktop/Code/MIP662_practice_tool/rfd4-visualizer}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -d "$DEST" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  echo "A site is already there. Backing it up to ${DEST}_backup_$STAMP"
  cp -R "$DEST" "${DEST}_backup_$STAMP"
  # Keep the text and the run registry the dashboard has saved.
  for keep in data/text.json data/runs.json data/bc2_comparison.json; do
    if [ -f "$DEST/$keep" ]; then
      echo "Keeping your $keep (the new one is at $keep.new)"
      cp "$HERE/$keep" "$HERE/$keep.new"
      cp "$DEST/$keep" "$HERE/$keep"
    fi
  done
fi

mkdir -p "$DEST"
# Copy everything except captured run data already at the destination.
rsync -a --exclude 'data/monomer' --exclude 'data/motif' --exclude 'data/binder_3evg' \
      --exclude 'data/backups' "$HERE"/ "$DEST"/
echo
echo "Installed to $DEST"
echo "Start it with:   cd $DEST && node serve.mjs"
echo "Then open:       http://localhost:8004/  (dashboard: /admin.html)"
echo
echo "If node is not on your PATH, use the copy inside VS Code:"
echo "  ELECTRON_RUN_AS_NODE=1 \"/Applications/Visual Studio Code.app/Contents/MacOS/Code\" serve.mjs"

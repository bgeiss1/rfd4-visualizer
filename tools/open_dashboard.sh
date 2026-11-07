#!/usr/bin/env bash
# Opens the text dashboard. Starts the local server first if it isn't running, using VS Code's
# Node (or node, if installed). The "RFD4 Dashboard" app on the Desktop runs this.
# Same shape as the GROMACS visualizer's tools/open_dashboard.sh, one port along.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # apps start with a short PATH, and Publish needs git and gh
site=$(cd "$(dirname "$0")/.." && pwd)
port=${PORT:-8004}
url=http://localhost:$port/admin.html
log="$HOME/Library/Logs/rfd4-visualizer.log"
mkdir -p "$(dirname "$log")" 2>/dev/null || log="/tmp/rfd4-visualizer.log"

alert() { osascript -e "display alert \"RFD4 Dashboard\" message \"$1\"" >/dev/null 2>&1; }

if ! curl -s -o /dev/null "$url"; then
  cd "$site"
  vscode="/Applications/Visual Studio Code.app/Contents/MacOS/Code"
  if command -v node >/dev/null; then run=(node serve.mjs)
  elif [ -x "$vscode" ]; then export ELECTRON_RUN_AS_NODE=1; run=("$vscode" serve.mjs)
  else
    alert "No Node found. Install Node, or install Visual Studio Code, which ships one."
    exit 1
  fi
  PORT=$port nohup "${run[@]}" > "$log" 2>&1 < /dev/null &
  for _ in $(seq 1 50); do curl -s -o /dev/null "$url" && break; sleep 0.2; done
  if ! curl -s -o /dev/null "$url"; then
    alert "The server did not start. The log is at $log"
    exit 1
  fi
fi
open "$url"

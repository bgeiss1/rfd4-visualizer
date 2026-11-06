#!/bin/bash
# Install RFD4-Proteina on UncleBen.
#
# Run it in two passes on purpose.
#
#   bash install_uncleben.sh inspect    clone the repo and show what the installer would do
#   bash install_uncleben.sh install    actually install
#
# Why two passes: the project's own installation page tells you to fetch a specific pip from
# a pinned URL, citing a certificate authority compromise in October 2026. That may well be
# true, but it is not something to run unseen on a machine with GPUs and data on it. The
# inspect pass prints every network fetch and every pip line in setup.sh so you can read
# them first.
#
# Facts this script relies on, from the docs read 2026-11-06:
#   Linux x86_64, Python 3.12, NVIDIA driver for CUDA 12 or 13.
#   RTX PRO 6000 Blackwell is on the tested hardware list, both editions.
#   make setup creates .venv, downloads ~1.74 GB of weights and ~63 MB of benchmarks.
#   --skip-search-envs leaves out the AlphaFold environments, which are the big downloads.
set -euo pipefail

MODE="${1:-inspect}"
ROOT="${RFD4_ROOT:-$HOME/rfd4}"
REPO="https://github.com/RosettaCommons/RFD4-Proteina.git"
SRC="$ROOT/RFD4-Proteina"

say() { printf '\n== %s ==\n' "$1"; }

say "Where this is going"
echo "repo      $REPO"
echo "clone to  $SRC"
echo "mode      $MODE"

say "The machine"
echo "host      $(hostname)"
echo "kernel    $(uname -sr)"
python3 --version 2>/dev/null || echo "python3 not on PATH"
if command -v nvidia-smi >/dev/null; then
  nvidia-smi --query-gpu=index,name,memory.total,memory.used --format=csv
  echo
  echo "Driver and CUDA: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)"
else
  echo "nvidia-smi not found. RFD4 needs an NVIDIA GPU."
fi

say "Checking GPU 0 is free"
# Brian's gmx_mpi work often owns GPU 0, so this install and every run pins to GPU 1.
nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv 2>/dev/null || true
echo "This site's runs pin to GPU 1 with CUDA_VISIBLE_DEVICES=1. Change that only if GPU 0 is idle."

mkdir -p "$ROOT"
if [ -d "$SRC/.git" ]; then
  say "Repo already cloned, fetching"
  git -C "$SRC" fetch --depth 1 origin
else
  say "Cloning"
  git clone --depth 1 "$REPO" "$SRC"
fi
echo "commit $(git -C "$SRC" rev-parse --short HEAD)"

say "What the installer would do"
for f in setup.sh Makefile; do
  [ -f "$SRC/$f" ] || continue
  echo "--- $f: every line that fetches something or runs pip ---"
  grep -nE 'curl|wget|pip|uv |huggingface|hf |https?://' "$SRC/$f" || echo "(nothing matched)"
  echo
done
echo "--- the licence ---"
head -4 "$SRC/LICENSE" 2>/dev/null || echo "(no LICENSE file found)"

if [ "$MODE" != "install" ]; then
  say "Stopping here"
  echo "Read the lines above. If they look fine, run:"
  echo "  bash $0 install"
  exit 0
fi

say "Installing"
cd "$SRC"
# --skip-search-envs leaves out AlphaFold 2 and AlphaFold 3 / OpenFold3, which together are
# roughly 10 GB and are only needed for refolding metrics. Add them later with
# bash scripts/setup_search_envs.sh if we decide we want those numbers.
bash setup.sh --skip-search-envs

say "Checking it works"
# shellcheck disable=SC1091
source "$SRC/.venv/bin/activate"
python -c "import rfd4_proteina, torch; print('rfd4_proteina', getattr(rfd4_proteina,'__version__','?')); print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.device_count(), 'device(s)')"
rfd4-generate --help | head -20

say "Done"
echo "Activate it with:  source $SRC/.venv/bin/activate"
echo "Then capture runs: bash $(dirname "$0")/run_captures.sh"

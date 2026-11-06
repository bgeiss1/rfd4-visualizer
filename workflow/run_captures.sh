#!/bin/bash
# Capture the runs the visualizer plays back. Run it on UncleBen with the RFD4 venv active.
#
#   source ~/rfd4/RFD4-Proteina/.venv/bin/activate
#   bash run_captures.sh            all three runs
#   bash run_captures.sh monomer    just one
#
# Every run here sets the two options that make playback possible. They are off by default,
# and a run without them produces nothing to watch:
#   generation.args.save_trajectory_every=2        a snapshot every 2 of the 60 steps
#   generation.args.bb_ca_only_trajectories=false  all atom CIF frames, not binary CA only
# The third, dump_noisy_trajectories, saves the noisy state beside each clean prediction.
#
# GPU 1 only. Brian's gmx_mpi work often owns GPU 0.
set -euo pipefail

export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-1}"
RUNS="${RFD4_RUNS:-$HOME/rfd4-visualizer-runs}"
INPUTS="${RFD4_INPUTS:-$RUNS/inputs}"
SEED=1234
WANT="${1:-all}"

mkdir -p "$RUNS" "$INPUTS"
command -v rfd4-generate >/dev/null || { echo "rfd4-generate not on PATH. Activate the venv first."; exit 1; }

TRAJ="generation.args.save_trajectory_every=2 generation.args.bb_ca_only_trajectories=false generation.args.dump_noisy_trajectories=true"

run () {
  local name="$1" replicates="$2" spec="$3"
  [ "$WANT" = all ] || [ "$WANT" = "$name" ] || return 0
  local out="$RUNS/$name"
  if [ -d "$out/inference_samples" ]; then
    echo "== $name already has output in $out, skipping. Delete it to redo. =="
    return 0
  fi
  [ -f "$spec" ] || { echo "== $name needs $spec, which is not there yet. Skipping. =="; return 0; }
  echo "== $name =="
  mkdir -p "$out"
  # The command is saved beside the run, because the site shows it next to the structures.
  local cmd="rfd4-generate inputs=$spec out_dir=$out num_replicates=$replicates seed=$SEED metrics_tags='[design]' $TRAJ"
  echo "$cmd" > "$out/command.txt"
  echo "$cmd"
  /usr/bin/time -v bash -c "$cmd" 2>&1 | tee "$out/run.log"
  echo "wrote $out"
}

# Inputs. A spec file's relative paths resolve against the SPEC FILE, not the working
# directory, so every spec written here uses absolute paths.
echo "Specs are read from $INPUTS. Put the target structures there as CIF, not PDB."
ls -la "$INPUTS" || true

run quickstart   8 "$INPUTS/quickstart.yaml"
run motif       16 "$INPUTS/motif.yaml"
run binder_3evg 32 "$INPUTS/binder_3evg.yaml"

echo
echo "Now export them for the site:"
echo "  python $(dirname "$0")/export_playback.py $RUNS/<name> --name <name> --out <site>/data"

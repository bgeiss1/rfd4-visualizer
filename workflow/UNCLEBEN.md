# Installing RFD4-Proteina on UncleBen, and capturing the runs

This is a self contained brief. Hand the whole file to a fresh Claude Code session in a
terminal on your Mac, or work through it yourself. It assumes nothing about what that
session has seen before.

## What this is for

MIP 662 has three teaching sites. The third one, the RFD4 Visualizer, plays back real
RFD4-Proteina runs in a browser. The site is built and works. It needs real runs.

## The machine

**UncleBen**, Brian's GPU server, reached over ssh from his Mac. Two NVIDIA RTX PRO 6000
Blackwell cards. **GPU 0 is often busy with `gmx_mpi`, so everything here pins to GPU 1**
with `CUDA_VISIBLE_DEVICES=1`. Check `nvidia-smi` before assuming either card is free.

## Facts worth having before you start

Read from the RFD4-Proteina repository, <https://rfd4-proteina.org/latest/> and the
Hugging Face model card on 2026-11-06.

- Licence is **BSD 3-Clause for both the code and the weights**. No hosting restriction.
- Linux x86_64, Python 3.12, an NVIDIA driver for CUDA 12 or 13. **RTX PRO 6000 Blackwell
  is on the tested hardware list**, both the workstation and the server edition.
- Install is `git clone` then `make setup`: it makes a `.venv`, downloads about 1.74 GB of
  weights and 63 MB of benchmarks, and the environment comes to roughly 7 GB.
- `bash setup.sh --skip-search-envs` leaves out the AlphaFold 2 and AlphaFold 3 setups.
  Those are about 10 GB between them and are only needed for refolding metrics. Skip them
  for now. They can be added later with `bash scripts/setup_search_envs.sh`.
- Two commands: `rfd4-generate` and `rfd4-evaluate`. Configuration is Hydra `key=value`
  only. No flags with dashes. A list value needs quotes: `metrics_tags='[design]'`.
- Output is **CIF, never PDB**, in `<out_dir>/inference_samples/<example>/`.
- The metrics CSV is only written when `metrics_tags` is set.

### One thing to look at before running the installer

The project's installation and quickstart pages tell you to install a specific pip from a
hash pinned URL, saying older pip releases still trust a certificate authority that was
compromised in October 2026. That may be entirely true. It has not been verified here, and
it is not something to run unseen on a machine with GPUs and data on it.

So `install_uncleben.sh` has two passes. The first prints every line in `setup.sh` and the
`Makefile` that fetches something or runs pip, and stops. Read those, then run the second.

## Steps

```bash
# on your Mac
scp -r workflow/ uncleben:~/rfd4-visualizer-workflow/
ssh uncleben
cd ~/rfd4-visualizer-workflow

# 1. look before installing
bash install_uncleben.sh inspect

# 2. install, once the output above looks fine
bash install_uncleben.sh install

# 3. the specs and the structures
source ~/rfd4/RFD4-Proteina/.venv/bin/activate
mkdir -p ~/rfd4-visualizer-runs/inputs
cp inputs/*.yaml ~/rfd4-visualizer-runs/inputs/
cp ~/rfd4/RFD4-Proteina/docs/examples/inputs/5o45_cropped.cif.zst ~/rfd4-visualizer-runs/inputs/
# and put 3evg_apo.cif there too, converted from PDB if needed (see inputs/README.md)

# 4. the canary run first, on its own
bash run_captures.sh quickstart

# 5. check it actually produced frames before spending more GPU time
ls ~/rfd4-visualizer-runs/quickstart/inference_samples/*/trajectories/

# 6. the rest
bash run_captures.sh

# 7. export for the site
python export_playback.py ~/rfd4-visualizer-runs/quickstart --name quickstart \
    --title "The documentation's own example" --out ~/rfd4-site-data
python export_playback.py ~/rfd4-visualizer-runs/motif --name motif \
    --title "Scaffold a motif" --out ~/rfd4-site-data
python export_playback.py ~/rfd4-visualizer-runs/binder_3evg --name binder_3evg \
    --title "A binder against 3EVG" --target 3evg_apo --out ~/rfd4-site-data
```

Then copy `~/rfd4-site-data/*` back to the Mac into the site's `data/` folder, and paste
each `runs-fragment.json` into the site's `data/runs.json` under `"runs"`.

## Stop and ask rather than guessing

- **If the canary run produces no `trajectories/` folder.** The two options that turn
  frames on are already in `run_captures.sh`. If they did not work, the option names have
  changed, and the right move is to check `rfd4-generate --cfg job` rather than guess.
- **If `make setup` wants to download AlphaFold anyway.** It should not with
  `--skip-search-envs`. Stop and say so.
- **If GPU 1 is busy.** Do not move to GPU 0 without asking Brian.
- **If a run would take more than a couple of hours.** Say what it is going to cost before
  starting it, not after.

## Rough expectations

RFD4 publishes no per design timings, so there is no honest number to put here. The
quickstart run of 8 designs at 60 steps each should be minutes, not hours. If it is not,
something is wrong and it is worth stopping to find out what.

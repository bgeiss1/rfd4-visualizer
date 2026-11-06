# RFD4 Visualizer

A teaching site for RFD4-Proteina, for MIP 662. It is the third of three sites built the
same way, after the GROMACS visualizer (port 8002) and the BindCraft2 visualizer (port 8003).
This one runs on **port 8004**, so all four things can run at once alongside Shell Lab.

Everything the site shows about a run comes from a real run. Until a run has been captured
the pages say so rather than showing invented numbers.

## Running it

```bash
cd rfd4-visualizer
node serve.mjs            # or: npm run serve
```

Then open <http://localhost:8004/>. The dashboard is at
<http://localhost:8004/admin.html>.

If `node` is not on your PATH, VS Code ships one:

```bash
ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" serve.mjs
```

## The pages

| Page | What it teaches |
| --- | --- |
| `index` | What RFD4-Proteina is, and how it differs from BindCraft2 |
| `process` | The sixty sampling steps, and the options that change them |
| `spec` | The contig string, the conditions, and the `sel()` language. The core skill |
| `command` | The Hydra command line, with live checking and what each run would produce |
| `run` | One real run: its command, its log, its counts, its files |
| `trajectory` | The saved frames, played back |
| `designs` | The structures, in 3D |
| `metrics` | `per_example_metrics.csv`, column by column |
| `guidance` | Partial diffusion, inverse folding, metric guidance, reward guided search |
| `compare` | RFD4 against BindCraft2, and the same target through both |

## The dashboard

`admin.html` edits every piece of prose on the site. It is the same dashboard as the other
two sites: pick a page on the left, edit a box, watch the preview, press **Save** to write
`data/text.json` (the old copy goes to `data/backups/`), press **Publish** to commit and
push once this folder is a git repo with a remote.

It checks the course style rules as you type: no em or en dashes, no semicolons, and a list
of words to avoid. It does not edit the numbers or the structures, which come from the runs.

## Capturing a run

On UncleBen, with the RFD4 venv active:

```bash
bash workflow/install_uncleben.sh inspect   # read what the installer does, first
bash workflow/install_uncleben.sh install
bash workflow/run_captures.sh
python workflow/export_playback.py ~/rfd4-visualizer-runs/monomer --name monomer --out ./site-data
```

Then copy `site-data/monomer/` into this folder's `data/` and paste
`runs-fragment.json` into `data/runs.json` under `"runs"`.

**Two options decide whether there is anything to play back**, and both are off by default:

```
generation.args.save_trajectory_every=2
generation.args.bb_ca_only_trajectories=false
```

Without the first, no frames are saved. Without the second, the frames are alpha carbons
only in a binary XTC file, which the browser viewer will not read. `run_captures.sh` sets
both.

Runs pin to **GPU 1** (`CUDA_VISIBLE_DEVICES=1`), because `gmx_mpi` work often owns GPU 0.

## Tests

```bash
npm test
```

The suite covers the contig parser, the condition checks, the `sel()` parser, the Hydra
command line, and the shipped data files. It also fails the build if a page asks for a
piece of text that is not in `data/text.json`, and if any example spec on the spec page is
one RFD4 would refuse.

## What is true about RFD4-Proteina

Read from the repository, <https://rfd4-proteina.org/latest/> and the Hugging Face model
card on 2026-11-06.

- **BSD 3-Clause, code and weights.** No hosting restriction, so unlike BindCraft2 this
  site can go on public GitHub Pages. The optional AlphaFold images have their own terms.
- Two commands: `rfd4-generate` and `rfd4-evaluate`. Config is Hydra `key=value` only.
- Install with `git clone` then `make setup`: a `.venv`, 1.74 GB of weights, about 7 GB.
- RTX PRO 6000 Blackwell is on the tested hardware list, both editions.
- Designs come out as **CIF, never PDB**, in `<out_dir>/inference_samples/`.
- Metrics are written only when `metrics_tags` is set. The metrics CSV embeds the run's
  own config, so it doubles as the run's record of itself.
- The resolved config snapshot goes to `./hydra_outputs`, outside `out_dir`.

One caution carried over into `workflow/install_uncleben.sh`: the project's installation
page tells you to fetch a pinned pip because of a certificate authority compromise in
October 2026. That claim has not been verified here, which is why the install script makes
you read the installer's network and pip lines before it runs anything.

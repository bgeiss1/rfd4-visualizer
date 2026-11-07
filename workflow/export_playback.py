#!/usr/bin/env python3
"""Turn a finished rfd4-generate run into the files the visualizer plays back.

Run it on UncleBen inside the RFD4 venv, because it borrows biotite from there to read CIF.

    python export_playback.py ~/rfd4-visualizer-runs/monomer --name monomer --out ./site-data

It writes, under <out>/<name>/:
    <design>.cif        the design exactly as RFD4 wrote it
    <design>/frames.pdb the trajectory as a multi model PDB, which 3Dmol reads reliably
    per_example_metrics.csv, run.log, command.txt   copied across
    runs-fragment.json  the entry to paste into the site's data/runs.json

Nothing is invented. A design with no trajectory simply has no frames.pdb, and the site
then shows it on the designs page but not the trajectory page.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path


def read_structure_stack(path: Path):
    """Read a CIF, returning a biotite AtomArrayStack (one entry per model)."""
    from biotite.structure.io.pdbx import CIFFile, BinaryCIFFile, get_structure

    if path.suffix == ".bcif":
        f = BinaryCIFFile.read(path)
    else:
        f = CIFFile.read(path)
    # model=None gives every model, as a stack.
    return get_structure(f)


def read_models(path: Path) -> list:
    """Every model in a CIF, as a list of AtomArrays.

    An RFD4 trajectory changes atom count from frame to frame, because the side chains
    appear as the sequence is decided. Measured on a real run: 1248 to 1351 atoms across
    31 frames. A biotite stack needs one atom count for every model, so it refuses the
    file with "unequal amount of atoms". Reading the models one at a time works.
    """
    from biotite.structure.io.pdbx import CIFFile, BinaryCIFFile, get_structure

    f = BinaryCIFFile.read(path) if path.suffix == ".bcif" else CIFFile.read(path)
    try:
        stack = get_structure(f)
        if hasattr(stack, "stack_depth"):
            return [stack[i] for i in range(stack.stack_depth())]
        return [stack]
    except Exception:
        pass
    try:
        numbers = f.block["atom_site"]["pdbx_PDB_model_num"].as_array(int)
        count = int(max(numbers))
    except Exception:
        count = 1
    models = []
    for n in range(1, count + 1):
        try:
            models.append(get_structure(f, model=n))
        except Exception as e:
            print(f"  frame {n} of {path.name} could not be read: {e}")
    return models


def write_pdb(models, path: Path) -> int:
    """Write the frames as one multi model PDB, which 3Dmol plays back directly.

    Each frame is written on its own and the blocks are concatenated, because the frames do
    not share an atom count and biotite can only write a stack that does.
    """
    from biotite.structure.io.pdb import PDBFile

    if hasattr(models, "stack_depth"):
        models = [models[i] for i in range(models.stack_depth())]
    elif not isinstance(models, list):
        models = [models]

    lines: list[str] = []
    for n, arr in enumerate(models, start=1):
        one = PDBFile()
        one.set_structure(arr)
        lines.append(f"MODEL     {n:>4}")
        lines.extend(l for l in one.lines if l.startswith(("ATOM", "HETATM", "TER")))
        lines.append("ENDMDL")
    lines.append("END")
    path.write_text("\n".join(lines) + "\n")
    return len(models)


def chain_ids(stack) -> list[str]:
    arr = stack[0] if hasattr(stack, "stack_depth") else stack
    seen = []
    for c in arr.chain_id:
        if c not in seen:
            seen.append(str(c))
    return seen


def n_residues(stack) -> int:
    import biotite.structure as struc

    arr = stack[0] if hasattr(stack, "stack_depth") else stack
    return int(struc.get_residue_count(arr))


def count_passing(metrics: dict) -> int | None:
    """How many designs met the oracle's own pass criteria.

    A ppi_refolding run writes a ppi.pass column, 1.0 or 0.0 per design. Without an oracle
    there is no such column and no verdict to give, so this returns None and the site shows
    a dash rather than a zero, which would read as "all of them failed".
    """
    if not metrics:
        return None
    columns = [c for c in next(iter(metrics.values())) if c.endswith(".pass")]
    columns = [c for c in columns if c != "pre_oracle_pass"] or columns
    if not columns:
        return None
    column = columns[0]
    passed = 0
    for row in metrics.values():
        try:
            passed += 1 if float(row[column]) >= 1 else 0
        except (KeyError, TypeError, ValueError):
            continue
    return passed


def wall_hours(log: Path) -> float | None:
    """Wall clock for the run, from the `/usr/bin/time -v` line the capture script writes."""
    if not log.exists():
        return None
    m = re.search(r"Elapsed \(wall clock\) time.*?:\s*([\d:.]+)", log.read_text(errors="replace"))
    if not m:
        return None
    parts = [float(p) for p in m.group(1).split(":")]
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + p
    return round(seconds / 3600, 3)


def save_every(command: str) -> int:
    m = re.search(r"save_trajectory_every=(\d+)", command or "")
    return int(m.group(1)) if m else 1


def nsteps(command: str) -> int:
    m = re.search(r"nsteps=(\d+)", command or "")
    return int(m.group(1)) if m else 60


def read_metrics(path: Path) -> dict[str, dict]:
    """per_example_metrics.csv, keyed by whatever column looks like the design id."""
    if not path.exists():
        return {}
    with path.open(newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        return {}
    cols = rows[0].keys()
    key = next((c for c in cols if c.lower() in ("example_id", "id", "name", "sample_id")), None)
    if key is None:
        key = list(cols)[0]
    skip = re.compile(r"^(generation|search|guidance)\.|^ckpt_")
    out = {}
    for r in rows:
        out[str(r[key])] = {k: v for k, v in r.items() if k != key and not skip.match(k) and v not in ("", None)}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir", type=Path, help="the out_dir the run used")
    ap.add_argument("--name", required=True, help="the key this run gets in data/runs.json")
    ap.add_argument("--out", type=Path, default=Path("./site-data"), help="where to write the site files")
    ap.add_argument("--title", default=None)
    ap.add_argument("--target", default=None, help="a target key, so the compare page can match it to a BindCraft2 campaign")
    ap.add_argument("--max-designs", type=int, default=24, help="how many designs to export structures for")
    ap.add_argument("--frames-for", type=int, default=6, metavar="N",
                    help="export trajectory frames for only the N most interesting designs "
                         "(default 6). Frames are roughly 8 MB a design, so a 32 replicate run "
                         "would otherwise be a quarter of a gigabyte. The structures and the "
                         "metrics are still exported for every design. 0 means all of them.")
    args = ap.parse_args()

    run_dir: Path = args.run_dir
    samples = run_dir / "inference_samples"
    if not samples.is_dir():
        print(f"No inference_samples/ under {run_dir}. Is that the out_dir of a finished run?", file=sys.stderr)
        return 1

    dest = args.out / args.name
    dest.mkdir(parents=True, exist_ok=True)

    command = ""
    if (run_dir / "command.txt").exists():
        command = (run_dir / "command.txt").read_text().strip()
        shutil.copy2(run_dir / "command.txt", dest / "command.txt")
    for extra in ("run.log",):
        if (run_dir / extra).exists():
            shutil.copy2(run_dir / extra, dest / extra)

    metrics_csv = run_dir / "inference_metrics" / "per_example_metrics.csv"
    if metrics_csv.exists():
        shutil.copy2(metrics_csv, dest / "per_example_metrics.csv")
    metrics = read_metrics(metrics_csv)

    designs = []
    frames_total = 0
    every = save_every(command)

    # Which designs get frames. Playing back the one design that actually bound teaches more
    # than playing back thirty that did not, so when the oracle has ranked them we keep the
    # best. Without an oracle there is nothing to rank on, so we keep the first few.
    sample_dirs = sorted(p for p in samples.iterdir() if p.is_dir())
    if args.frames_for and args.frames_for > 0:
        def rank(p):
            row = metrics.get(p.name, {})
            for key in ("oracle_ppi.iptm_coi", "oracle_ppi.ranking_score", "oracle.iptm"):
                try:
                    return -float(row[key])
                except (KeyError, TypeError, ValueError):
                    continue
            return 0.0
        frames_wanted = {p.name for p in sorted(sample_dirs, key=rank)[: args.frames_for]}
        print(f"frames for {len(frames_wanted)} of {len(sample_dirs)} design(s): "
              f"{', '.join(sorted(frames_wanted))}")
    else:
        frames_wanted = {p.name for p in sample_dirs}

    for d in sorted(p for p in samples.iterdir() if p.is_dir()):
        generated = sorted(d.glob("*_generated.cif")) + sorted(d.glob("*_generated.cif.zst"))
        if not generated:
            continue
        src = generated[0]
        if src.suffix == ".zst":
            print(f"skipping {src.name}: it is zstandard compressed, rerun without compress_outputs or decompress it first")
            continue
        design_id = d.name
        entry = {"id": design_id, "path": f"data/{args.name}/{design_id}.cif"}
        shutil.copy2(src, dest / f"{design_id}.cif")

        try:
            stack = read_structure_stack(src)
            entry["length"] = n_residues(stack)
            chains = chain_ids(stack)
            entry["chains"] = {"designed": chains[:1], "target": chains[1:]}
        except Exception as e:  # a structure we cannot read is still worth listing
            print(f"could not read {src.name}: {e}")

        traj_dir = d / "trajectories"
        traj = sorted(traj_dir.glob("*.cif")) if traj_dir.is_dir() else []
        # RFD4 writes two trajectories per design: _x1 is the model's guess at the answer
        # at each step, _xt the noisy state it was handed. Name them rather than trusting
        # the sort order.
        if design_id not in frames_wanted:
            traj = []
        clean = next((p for p in traj if "_x1" in p.stem), traj[0] if traj else None)
        noisy = next((p for p in traj if "_xt" in p.stem), None)
        if clean is not None:
            try:
                (dest / design_id).mkdir(exist_ok=True)
                n = write_pdb(read_models(clean), dest / design_id / "frames.pdb")
                entry["frames"] = f"data/{args.name}/{design_id}/frames.pdb"
                entry["nframes"] = n
                frames_total += n
            except Exception as e:
                print(f"could not convert the trajectory for {design_id}: {e}")
        if noisy is not None:
            try:
                (dest / design_id).mkdir(exist_ok=True)
                write_pdb(read_models(noisy), dest / design_id / "frames_noisy.pdb")
                entry["framesNoisy"] = f"data/{args.name}/{design_id}/frames_noisy.pdb"
            except Exception as e:
                print(f"could not convert the noisy trajectory for {design_id}: {e}")
        elif traj_dir.is_dir():
            xtc = list(traj_dir.glob("*.xtc"))
            if xtc:
                print(f"{design_id}: the trajectory is CA only XTC. Rerun with "
                      f"generation.args.bb_ca_only_trajectories=false for frames the site can play.")

        if design_id in metrics:
            entry["metrics"] = metrics[design_id]

        refolded = sorted(d.glob("*_refolded.cif"))
        if refolded:
            shutil.copy2(refolded[0], dest / f"{design_id}_refolded.cif")
            entry["refolded"] = f"data/{args.name}/{design_id}_refolded.cif"

        designs.append(entry)
        if len(designs) >= args.max_designs:
            break

    requested = None
    m = re.search(r"num_replicates=(\d+)", command or "")
    if m:
        requested = int(m.group(1))

    fragment = {
        args.name: {
            "title": args.title or args.name,
            "what": "",
            "captured": True,
            "command": command,
            "nsteps": nsteps(command),
            "saveEvery": every,
            "designs": len(designs),
            "frames": frames_total,
            "counts": {
                "requested": requested if requested is not None else len(designs),
                "written": len(designs),
                "frames": frames_total,
                "scored": len(metrics) or None,
                # RFD4's own verdict, not a bar invented here. A ppi_refolding run writes
                # ppi.pass; other tags write their own. None of them exists without an
                # oracle, and then there is no verdict to report.
                "passing": count_passing(metrics),
            },
            "gpuHours": wall_hours(dest / "run.log"),
            "log": f"data/{args.name}/run.log" if (dest / "run.log").exists() else None,
            "metrics": f"data/{args.name}/per_example_metrics.csv" if (dest / "per_example_metrics.csv").exists() else None,
            "designsList": designs,
        }
    }
    if args.target:
        fragment[args.name]["target"] = args.target
    fragment[args.name]["counts"] = {k: v for k, v in fragment[args.name]["counts"].items() if v is not None}

    (dest / "runs-fragment.json").write_text(json.dumps(fragment, indent=1) + "\n")

    print(f"\nexported {len(designs)} design(s) and {frames_total} frame(s) to {dest}")
    print(f"copy {dest} into the site's data/ folder, then paste the contents of")
    print(f"{dest / 'runs-fragment.json'} into the site's data/runs.json under \"runs\"")
    if not frames_total:
        # Two different problems, and telling them apart saves a wasted rerun.
        if any((p / "trajectories").is_dir() for p in samples.iterdir() if p.is_dir()):
            print("\nNo frames were exported, but the run did save trajectories. So the flags")
            print("were set and something went wrong converting them. Read the errors above.")
        else:
            print("\nNo frames were exported, and the run saved no trajectories at all. It needed")
            print("  generation.args.save_trajectory_every=2 generation.args.bb_ca_only_trajectories=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

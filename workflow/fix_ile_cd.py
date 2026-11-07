"""Rename ILE CD to CD1 in a PDB, writing a corrected copy.

GROMACS and CHARMM write isoleucine's delta carbon as CD. The PDB chemical component
dictionary calls it CD1, and RFD4 validates against the CCD, so it refuses the file with
"Atom 'CD' in residue ILE matches neither standard nor alternative CCD names".
Only the atom name changes; no coordinates are touched.
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
changed = 0
out = []
for line in open(src):
    if line.startswith(("ATOM", "HETATM")) and line[12:16] == " CD " and line[17:20] == "ILE":
        line = line[:12] + " CD1" + line[16:]
        changed += 1
    out.append(line)
open(dst, "w").writelines(out)
print(f"renamed {changed} ILE CD atoms -> CD1")
print(f"wrote {dst}")

# Spec files for the capture runs

Put the target structures here as **CIF**. RFD4 reads `.cif`, `.cif.gz` and `.bcif`, and
refuses a PDB file.

A spec file's relative paths resolve against **the spec file's own directory**, not the
directory you run the command from. The same trap BindCraft2 has. Every spec here uses a
path relative to this folder, so keep the structures beside the specs.

Converting a PDB to CIF, inside the RFD4 venv:

```bash
python -c "
from biotite.structure.io.pdb import PDBFile
from biotite.structure.io.pdbx import CIFFile, set_structure
a = PDBFile.read('3evg_apo.pdb').get_structure(model=1)
f = CIFFile(); set_structure(f, a); f.write('3evg_apo.cif')
"
```

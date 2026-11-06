// The condition spec: the contig string, the condition annotations, and the sel() language.
//
// This is the part of RFD4-Proteina a student actually has to learn, so it is the part the
// site checks for them. Everything here comes from the docs' YAML/JSON reference
// (rfd4-proteina.org/latest/reference/yaml-json.html, read 2026-11-06). Where the docs are
// silent the code says so rather than guessing.

// ---------------------------------------------------------------------------
// The contig string
// ---------------------------------------------------------------------------

export const CHAIN_TYPES = { P: 'protein', R: 'RNA', D: 'DNA' };
const PRESERVED = /^([A-Za-z]+)(\d+)(?:-(\d+))?$/;
const NAMED = /^([A-Za-z][A-Za-z0-9_]*):(\d+)(?:-(\d+))?([PRD])?$/;
const UNNAMED = /^(\d+)(?:-(\d+))?([PRD])?$/;

// Split a contig into tokens. One token per comma, whitespace ignored.
export function contigTokens(s) {
  return String(s ?? '').split(',').map(t => t.trim()).filter(t => t !== '');
}

// Parse one token. Returns a segment, or a token with an error on it.
export function parseToken(raw) {
  const t = raw.trim();
  if (/^\/\d+$/.test(t)) {
    if (t !== '/0') return { raw: t, kind: 'break', error: `A chainbreak is written /0. ${t} is not one.` };
    return { raw: t, kind: 'break' };
  }
  let m = t.match(NAMED);
  if (m) {
    const [, name, lo, hi, type] = m;
    const seg = { raw: t, kind: 'expandable', name, min: Number(lo), max: Number(hi ?? lo), type: type || null };
    if (hi && Number(hi) < Number(lo)) seg.error = `${t} counts down. A length range is written low to high, so write ${hi}-${lo}.`;
    if (name === 'MASKED') seg.error = 'MASKED is reserved, so an expandable segment cannot be called that.';
    return seg;
  }
  m = t.match(UNNAMED);
  if (m) {
    const [, lo, hi, type] = m;
    const seg = { raw: t, kind: 'expandable', name: null, min: Number(lo), max: Number(hi ?? lo), type: type || null };
    if (hi && Number(hi) < Number(lo)) seg.error = `${t} counts down. A length range is written low to high, so write ${hi}-${lo}.`;
    return seg;
  }
  m = t.match(PRESERVED);
  if (m) {
    const [, chain, lo, hi] = m;
    const seg = { raw: t, kind: 'preserved', chain, from: Number(lo), to: Number(hi ?? lo) };
    if (hi && Number(hi) < Number(lo)) seg.error = `${t} counts down. A preserved range is written low to high, so write ${chain}${hi}-${lo}.`;
    return seg;
  }
  if (t.includes(':')) return { raw: t, kind: 'bad', error: `${t} is not a named segment. A name holds letters, digits and underscores, then a colon, then a length, as in E1:50-120.` };
  return { raw: t, kind: 'bad', error: `${t} is not a contig token. Use A17-131 to keep part of the input, 50-120 for a new stretch, or /0 to start a new chain.` };
}

const nextChainId = used => {
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  return '?';
};

// Parse a whole contig. Returns the segments, the output chains it builds, and every problem
// found. A run is the stretch of tokens between chainbreaks: the docs say a run that holds a
// preserved segment takes that segment's chain ID and type, so chain identity is decided here,
// not token by token.
export function parseContig(s) {
  const segments = contigTokens(s).map(parseToken);
  const errors = segments.filter(x => x.error).map(x => x.error);

  // Split into runs at the chainbreaks.
  const runs = [[]];
  for (const seg of segments) {
    if (seg.kind === 'break') runs.push([]);
    else runs[runs.length - 1].push(seg);
  }
  const used = new Set(segments.filter(x => x.kind === 'preserved').map(x => x.chain));

  const seenNames = new Map();
  for (const seg of segments) {
    if (seg.kind !== 'expandable' || !seg.name) continue;
    if (seenNames.has(seg.name)) errors.push(`Two segments are both called ${seg.name}. A name has to be unique, because conditions select by it.`);
    seenNames.set(seg.name, seg);
  }

  const chains = [];
  for (const run of runs) {
    if (!run.length) continue;
    const anchor = run.find(x => x.kind === 'preserved');
    const explicitType = run.find(x => x.type)?.type;
    const id = anchor ? anchor.chain : nextChainId(used);
    if (!anchor) used.add(id);
    const type = anchor ? (explicitType || 'P') : (explicitType || 'P');
    let min = 0, max = 0;
    for (const seg of run) {
      if (seg.kind === 'preserved') { const n = seg.to - seg.from + 1; min += n; max += n; }
      else if (seg.kind === 'expandable') { min += seg.min; max += seg.max; }
    }
    chains.push({ id, type, fromInput: !!anchor, segments: run, min, max });
  }

  if (!segments.some(x => x.kind === 'preserved')) {
    errors.push('A contig needs at least one preserved segment, something like A17-131, so the model has an input to build on. An all new contig is refused.');
  }
  const byId = new Map();
  for (const c of chains) {
    if (byId.has(c.id)) errors.push(`Two runs both end up on chain ${c.id}. Check the /0 chainbreaks.`);
    byId.set(c.id, c);
  }
  return { segments, chains, errors, names: [...seenNames.keys()] };
}

// What the designed thing will be: one line per output chain, with its length range.
export function contigSummary(s) {
  const { chains } = parseContig(s);
  return chains.map(c => ({
    id: c.id,
    type: CHAIN_TYPES[c.type] || c.type,
    kept: c.segments.filter(x => x.kind === 'preserved').map(x => x.raw),
    designed: c.segments.filter(x => x.kind === 'expandable').map(x => x.raw),
    min: c.min,
    max: c.max,
    fixed: c.min === c.max
  }));
}

// ---------------------------------------------------------------------------
// The sel() selection language
// ---------------------------------------------------------------------------

// Annotations the query form can test. The docs name these and say "any annotation", so an
// unknown name is a warning rather than an error.
export const ANNOTATIONS = ['chain_id', 'res_id', 'res_name', 'atom_name', 'element',
  'is_ligand', 'is_protein', 'is_protein_backbone', 'is_polymer', 'is_water', 'hetero'];

const FIELD_NAMES = ['chain', 'res_name', 'res_id', 'atom_name'];

// Parse one bracket list or bare value into the values it covers.
function fieldValues(raw) {
  const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return inner.split(',').map(v => v.trim()).filter(v => v !== '');
}

// Parse a select string. Two forms: a path inside sel('...'), or a Python boolean expression.
export function parseSelect(q) {
  const s = String(q ?? '').trim();
  const out = { raw: s, kind: null, fields: {}, errors: [], warnings: [] };
  if (!s) { out.errors.push('A select cannot be empty.'); return out; }

  const m = s.match(/^sel\(\s*(['"])([\s\S]*?)\1\s*\)$/);
  if (!m) {
    if (/^sel\(/.test(s)) { out.kind = 'path'; out.errors.push("A path select is written sel('A/*/*/CA'), with the path in quotes inside the brackets."); return out; }
    out.kind = 'query';
    const ids = [...s.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(x => x[0])
      .filter(w => !['and', 'or', 'not', 'in', 'True', 'False', 'None'].includes(w));
    for (const id of new Set(ids)) {
      if (!ANNOTATIONS.includes(id)) out.warnings.push(`${id} is not an annotation this site knows about. Check it against the annotations reference before you rely on it.`);
    }
    if (!ids.length) out.errors.push('A query select needs at least one annotation to test, such as is_ligand.');
    return out;
  }

  out.kind = 'path';
  const path = m[2].trim();
  if (!path) { out.errors.push("sel('') selects nothing. Use sel('*') for everything."); return out; }
  const parts = path.split('/').map(p => p.trim());
  if (parts.length > 4) {
    out.errors.push(`This path has ${parts.length} parts. There are only four: chain, residue name, residue number, atom name.`);
    return out;
  }
  for (let i = 0; i < 4; i++) out.fields[FIELD_NAMES[i]] = parts[i] ?? '*';

  // The gotcha the docs call out: fields are positional, so an atom name in slot three is
  // read as a residue number and the run fails.
  const resId = out.fields.res_id;
  if (resId !== '*') {
    const vals = fieldValues(resId);
    const bad = vals.filter(v => !/^\d+(-\d+)?$/.test(v));
    if (bad.length) {
      const looksAtomic = bad.every(v => /^[A-Z][A-Z0-9']{0,3}$/.test(v));
      out.errors.push(looksAtomic && parts.length === 3
        ? `${bad.join(', ')} is in the residue number slot, so RFD4 reads it as a residue number and the run fails. The atom name is the fourth field, so write sel('${out.fields.chain}/${out.fields.res_name}/*/${bad.join(',')}').`
        : `${bad.join(', ')} is not a residue number or range.`);
    } else {
      for (const v of vals) {
        const r = v.match(/^(\d+)-(\d+)$/);
        if (r && Number(r[2]) < Number(r[1])) out.errors.push(`${v} counts down. A residue range is written low to high.`);
      }
      out.residues = vals;
    }
  }
  return out;
}

// Which named contig segments does this select name? Used to warn when a select reaches for
// a designed stretch by residue number, which it has none of.
export function selectsName(sel, names) {
  const n = sel.fields?.res_name;
  if (!n || n === '*') return [];
  return fieldValues(n).filter(v => names.includes(v));
}

// ---------------------------------------------------------------------------
// The condition annotations
// ---------------------------------------------------------------------------

export const AMINO = ['ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL'];
export const RNA = ['A', 'C', 'G', 'U'];
export const DNA = ['DA', 'DC', 'DG', 'DT'];
export const SEQ_PROB_TOKENS = [...AMINO, ...RNA, ...DNA];

// value: 'bool' true/false, a list of allowed words, 'int+' a positive integer or null,
// 'centroid' an x,y,z string, 'cath' a C.A.T label, 'false' only false, 'prob' a 0 to 1 float.
export const CONDITIONS = {
  C_CRD: { value: 'bool', on: 'atoms' },
  C_SEQ: { value: 'bool', on: 'residues' },
  C_HOT: { value: 'bool', on: 'atoms' },
  C_RAS: { value: ['BURIED', 'INTERMEDIATE', 'EXPOSED', 'UNSPECIFIED'], on: 'atoms' },
  C_HB: { value: ['DONOR', 'ACCEPTOR', 'BOTH'], on: 'atoms' },
  C_PISTACK: { value: 'bool', on: 'aromatic rings' },
  C_PICATION: { value: ['AROMATIC', 'CATION', 'BOTH'], on: 'atoms' },
  C_CATH: { value: 'cath', on: 'residues' },
  C_CENTROID: { value: 'centroid', on: 'whole chains' },
  C_IDX: { value: 'false', on: 'atoms', needsGroup: true },
  C_CRDGRP: { value: 'int+', on: 'atoms' }
};

const isSeqProb = k => /^C_SEQ_PROB_/.test(k);
const seqProbToken = k => k.replace(/^C_SEQ_PROB_/, '');
const BOOLS = ['true', 'false', 'True', 'False'];

function valueProblem(key, spec, value) {
  const v = String(value);
  if (spec.value === 'bool') return BOOLS.includes(v) ? null : `${key} takes true or false, not ${v}.`;
  if (spec.value === 'false') return /^false$/i.test(v) ? null : `${key} only takes false. The docs allow no other value.`;
  if (Array.isArray(spec.value)) return spec.value.includes(v) ? null : `${key} takes ${spec.value.join(', ')}, not ${v}.`;
  if (spec.value === 'centroid') return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v) ? null
    : `${key} takes a position written "x,y,z", not ${v}.`;
  if (spec.value === 'cath') return /^\d+(\.(\d+|x)){0,2}$/.test(v) ? null
    : `${key} takes a C.A.T label such as "2.60.40", with x for a level you are leaving open, not ${v}.`;
  if (spec.value === 'int+') {
    if (/^null$/i.test(v)) return null;
    if (!/^-?\d+$/.test(v)) return `${key} takes a whole number group id, or null to take atoms out of a group. ${v} is neither.`;
    const n = Number(v);
    if (n === 0 || n === -1) return `Group ${n} is reserved, so pick a group id of 1 or more.`;
    if (n < 0) return `A group id is 1 or more. ${v} is not.`;
    return null;
  }
  if (spec.value === 'prob') {
    if (!/^\d*\.?\d+$/.test(v)) return `${key} takes a number between 0 and 1, not ${v}.`;
    const n = Number(v);
    return n >= 0 && n <= 1 ? null : `${key} takes a number between 0 and 1. ${v} is outside that.`;
  }
  return null;
}

// Check a conditions block. `names` are the named contig segments, so a select can be told
// off for reaching into a designed stretch by residue number.
export function checkConditions(conditions, { names = [] } = {}) {
  const out = [];
  if (conditions === undefined || conditions === null) return out;
  if (typeof conditions !== 'object' || Array.isArray(conditions)) {
    out.push({ code: 'conditions_shape', message: 'conditions is a mapping of annotation names to values, not a list.' });
    return out;
  }
  const probSums = new Map();

  for (const [key, byValue] of Object.entries(conditions)) {
    if (key === 'C_INTCRD') {
      out.push({ code: 'intcrd', message: 'C_INTCRD is refused in a spec file. Use C_CRDGRP to hold a set of atoms rigid with respect to each other.' });
      continue;
    }
    const spec = CONDITIONS[key] || (isSeqProb(key) ? { value: 'prob', on: 'residues' } : null);
    if (!spec) {
      out.push({ code: 'unknown_condition', message: `${key} is not a condition this site knows. The ones it knows are ${Object.keys(CONDITIONS).join(', ')} and C_SEQ_PROB_<token>.` });
      continue;
    }
    if (isSeqProb(key) && !SEQ_PROB_TOKENS.includes(seqProbToken(key))) {
      out.push({ code: 'unknown_token', message: `${seqProbToken(key)} is not a canonical token. Use a three letter amino acid such as CYS, an RNA base A, C, G or U, or a DNA base DA, DC, DG or DT.` });
      continue;
    }
    if (typeof byValue !== 'object' || byValue === null || Array.isArray(byValue)) {
      out.push({ code: 'entry_shape', message: `${key} holds a mapping of value to a list of selections, as in ${key}: {true: [{select: "sel('A')"}]}.` });
      continue;
    }

    for (const [value, selects] of Object.entries(byValue)) {
      const problem = valueProblem(key, spec, value);
      if (problem) out.push({ code: 'bad_value', message: problem });
      if (!Array.isArray(selects)) {
        out.push({ code: 'select_shape', message: `${key}: ${value} needs a list of selections, each one {select: "..."}.` });
        continue;
      }
      for (const entry of selects) {
        if (!entry || typeof entry !== 'object') {
          out.push({ code: 'select_shape', message: `${key}: ${value} holds something that is not a selection. Each one is {select: "..."}.` });
          continue;
        }
        if (spec.needsGroup && !entry.group) {
          out.push({ code: 'needs_group', message: `${key} needs a group label on every selection, so RFD4 knows which selections share an index group.` });
        }
        if (entry.select === undefined) {
          out.push({ code: 'no_select', message: `${key}: ${value} has a selection with no select in it.` });
          continue;
        }
        const sel = parseSelect(entry.select);
        for (const e of sel.errors) out.push({ code: 'bad_select', message: e });
        for (const w of sel.warnings) out.push({ code: 'select_warning', message: w, warning: true });
        if (sel.residues && selectsName(sel, names).length) {
          out.push({ code: 'designed_resid', message: `${selectsName(sel, names).join(', ')} is a designed stretch, so it has no input residue numbers to select. Select it by name only.`, warning: true });
        }
        if (isSeqProb(key)) {
          const k = String(entry.select);
          probSums.set(k, (probSums.get(k) || 0) + (Number(value) || 0));
        }
      }
    }
  }

  for (const [sel, sum] of probSums) {
    if (sum > 1.0000001) out.push({ code: 'prob_sum', message: `The sequence probabilities on ${sel} add up to ${sum.toFixed(2)}. They cannot add up to more than 1.` });
  }

  // Ordering trap: putting atoms in a coordinate group without clearing absolute
  // conditioning first. The docs say to clear it with C_CRD: false.
  if (conditions.C_CRDGRP && conditions.C_CRD && Object.keys(conditions.C_CRD).some(v => /^true$/i.test(v))) {
    out.push({
      code: 'crd_before_group',
      message: 'C_CRD: true and C_CRDGRP are both set. C_CRD: true takes atoms out of their group, so clear the absolute coordinates with C_CRD: false before assigning a group.',
      warning: true
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The whole spec
// ---------------------------------------------------------------------------

export const SPEC_FIELDS = ['input', 'input_as_annotated_cif', 'contig', 'conditions'];
const INPUT_EXT = /\.(cif|cif\.gz|bcif)(\.zst)?$/i;

// Check one design entry out of a spec file. Returns problems, worst first.
export function checkDesign(name, design) {
  const out = [];
  if (!design || typeof design !== 'object' || Array.isArray(design)) {
    return [{ code: 'design_shape', message: `${name} has to be a mapping with an input in it.` }];
  }
  for (const k of Object.keys(design)) {
    if (!SPEC_FIELDS.includes(k)) {
      out.push({ code: 'unknown_field', message: `${k} is not a field of a design. RFD4 stops on an unrecognised field. The fields are ${SPEC_FIELDS.join(', ')}.` });
    }
  }
  if (design.input === undefined) {
    out.push({ code: 'no_input', message: 'A design needs an input, the structure RFD4 builds on.' });
  } else {
    for (const p of [].concat(design.input)) {
      if (typeof p !== 'string') { out.push({ code: 'bad_input', message: 'An input is a path, or a list of paths.' }); continue; }
      if (!INPUT_EXT.test(p)) out.push({ code: 'input_ext', message: `${p} is not a structure RFD4 reads. It takes .cif, .cif.gz or .bcif, so convert a PDB file first.` });
    }
  }
  if (design.input_as_annotated_cif !== undefined && typeof design.input_as_annotated_cif !== 'boolean') {
    out.push({ code: 'bad_annotated', message: 'input_as_annotated_cif is true or false.' });
  }
  const contig = parseContig(design.contig ?? '');
  if (design.contig !== undefined) {
    for (const e of contig.errors) out.push({ code: 'contig', message: e });
  }
  out.push(...checkConditions(design.conditions, { names: contig.names }));
  return out;
}

// Check a whole spec file: a mapping of design name to design, plus the one reserved key.
export function checkSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return [{ code: 'spec_shape', message: 'A spec file is a mapping of design names to designs.' }];
  }
  const names = Object.keys(spec).filter(k => k !== 'global_args');
  if (!names.length) return [{ code: 'no_designs', message: 'A spec file needs at least one design in it.' }];
  const out = [];
  for (const n of names) out.push(...checkDesign(n, spec[n]).map(p => ({ ...p, design: n })));
  return out;
}

// Tests for the parts of the site that compute something: the contig parser, the condition
// checks, the sel() parser, the Hydra command line, and the shipped data files.
// Run with: npm test
//
// These are the places a student's typing meets our code, so they are the places where a
// quiet mistake would teach the wrong thing.
import { parseContig, parseToken, contigSummary, parseSelect, checkConditions, checkDesign, checkSpec, SEQ_PROB_TOKENS } from '../js/spec.js';
import { words, parse, parseValue, effective, consequences, rebuild, outputs, KEYS } from '../js/command.js';
import { parseCSV, ranges, formatOf } from '../js/site.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; return; }
  fail++;
  console.error(`FAIL ${what}\n  got  ${a}\n  want ${b}`);
};
const ok = (cond, what) => eq(!!cond, true, what);
const has = (list, needle, what) => ok(list.some(x => String(x).includes(needle)), what);

// --- contig tokens ----------------------------------------------------------
eq(parseToken('/0').kind, 'break', 'a chainbreak is recognised');
ok(parseToken('/1').error, 'only /0 is a chainbreak');
eq(parseToken('A17-131'), { raw: 'A17-131', kind: 'preserved', chain: 'A', from: 17, to: 131 }, 'a preserved range parses');
eq(parseToken('A52'), { raw: 'A52', kind: 'preserved', chain: 'A', from: 52, to: 52 }, 'a single preserved residue parses');
eq(parseToken('AA52').chain, 'AA', 'a two letter chain id parses');
eq(parseToken('50-120'), { raw: '50-120', kind: 'expandable', name: null, min: 50, max: 120, type: null }, 'an unnamed expandable parses');
eq(parseToken('10R').type, 'R', 'a trailing R sets the chain type');
eq(parseToken('E1:2-20'), { raw: 'E1:2-20', kind: 'expandable', name: 'E1', min: 2, max: 20, type: null }, 'a named expandable parses');
eq(parseToken('E2:10R').name, 'E2', 'a named fixed length expandable parses');
ok(parseToken('A48-42').error, 'a preserved range that counts down is refused');
ok(parseToken('120-50').error, 'a length range that counts down is refused');
ok(parseToken('MASKED:10').error, 'MASKED cannot be a segment name');
ok(parseToken('nonsense!').error, 'a token that is not a token is explained');
has([parseToken('E1:').error], 'named segment', 'a name with no length is explained');

// --- whole contigs ----------------------------------------------------------
const binder = parseContig('50-120, /0, A17-131');
eq(binder.errors, [], 'the docs binder contig is clean');
eq(binder.chains.length, 2, 'it builds two chains');
eq(binder.chains[1].id, 'A', 'the preserved run keeps chain A');
eq(binder.chains[1].min, 115, 'and A17-131 is 115 residues');
eq(binder.chains[0].min, 50, 'the designed chain is 50 at least');
eq(binder.chains[0].max, 120, 'and 120 at most');
ok(binder.chains[0].id !== 'A', 'the designed chain does not reuse chain A');

// The docs' chain assignment rule: a run takes the chain of the preserved segment in it.
const assigned = parseContig('A1-10, /0, E1:1-20, B1-10');
eq(assigned.chains[1].id, 'B', 'a run with a preserved segment puts the whole run on that chain');
eq(assigned.names, ['E1'], 'and the named segment is remembered');

has(parseContig('50-120').errors, 'at least one preserved', 'an all new contig is refused');
has(parseContig('E1:10, /0, E1:20, A1-5').errors, 'both called E1', 'two segments cannot share a name');
eq(parseContig('A1-10').chains[0].min, 10, 'a plain preserved contig is its own length');

const sum = contigSummary('50-120, /0, A17-131');
eq(sum[1].kept, ['A17-131'], 'the summary lists what is kept');
eq(sum[0].designed, ['50-120'], 'and what is designed');
eq(sum[0].fixed, false, 'a range is not a fixed length');
eq(contigSummary('20, /0, A1-5')[0].fixed, true, 'a single number is a fixed length');
eq(sum[1].type, 'protein', 'a chain type is spelled out');

// --- sel() ------------------------------------------------------------------
eq(parseSelect("sel('A')").fields, { chain: 'A', res_name: '*', res_id: '*', atom_name: '*' }, 'trailing fields default to everything');
eq(parseSelect("sel('A/*/*/[N,CA,C,O]')").fields.atom_name, '[N,CA,C,O]', 'an atom list parses');
eq(parseSelect("sel('A/*/[10-20]')").residues, ['10-20'], 'a residue range parses');
eq(parseSelect("sel('A/*/[1-30, 120-150]')").residues, ['1-30', '120-150'], 'two residue ranges parse');
eq(parseSelect("sel('A')").errors, [], 'a good select has no errors');

// The gotcha the docs call out: fields are positional.
const trap = parseSelect("sel('B/*/N')");
has(trap.errors, 'fourth field', "sel('B/*/N') is caught and the fix is given");
has(trap.errors, "sel('B/*/*/N')", 'and the fix is written out in full');
has(parseSelect("sel('A/*/[20-10]')").errors, 'counts down', 'a residue range that counts down is refused');
has(parseSelect("sel('A/B/C/D/E')").errors, 'only four', 'a five part path is refused');
has(parseSelect('sel(A)').errors, 'in quotes', 'an unquoted path is explained');
eq(parseSelect('is_ligand and not is_protein_backbone').kind, 'query', 'the query form is recognised');
eq(parseSelect('is_ligand and not is_protein_backbone').warnings, [], 'and known annotations pass quietly');
has(parseSelect('is_lignad').warnings, 'is_lignad', 'an unknown annotation is flagged as a warning');
ok(parseSelect('').errors.length, 'an empty select is an error');

// --- conditions -------------------------------------------------------------
const clean = { C_CRDGRP: { 1: [{ select: "sel('A/*/*/[N,CA,C,O]')" }] }, C_SEQ: { true: [{ select: "sel('A')" }] } };
eq(checkConditions(clean), [], 'the docs binder conditions are clean');

const codes = c => checkConditions(c).map(x => x.code);
has(codes({ C_INTCRD: { 1: [{ select: "sel('A')" }] } }), 'intcrd', 'C_INTCRD is refused');
has(checkConditions({ C_INTCRD: {} }).map(x => x.message), 'C_CRDGRP', 'and it points at C_CRDGRP');
has(codes({ C_NONSENSE: { true: [] } }), 'unknown_condition', 'an unknown condition is refused');
has(codes({ C_SEQ: { maybe: [{ select: "sel('A')" }] } }), 'bad_value', 'C_SEQ takes only true or false');
has(codes({ C_RAS: { VERY_BURIED: [{ select: "sel('A')" }] } }), 'bad_value', 'C_RAS checks its word list');
eq(codes({ C_RAS: { BURIED: [{ select: "sel('A')" }] } }), [], 'and accepts a real one');
eq(checkConditions({ C_HB: { BOTH: [{ select: "sel('A')" }] } }), [], 'C_HB accepts BOTH');
has(codes({ C_CRDGRP: { 0: [{ select: "sel('A')" }] } }), 'bad_value', 'coordinate group 0 is reserved');
has(checkConditions({ C_CRDGRP: { '-1': [{ select: "sel('A')" }] } }).map(x => x.message), 'reserved', 'and so is group -1');
eq(checkConditions({ C_CRDGRP: { null: [{ select: "sel('A')" }] } }), [], 'null takes atoms out of a group');
has(codes({ C_IDX: { false: [{ select: "sel('A')" }] } }), 'needs_group', 'C_IDX needs a group label');
eq(checkConditions({ C_IDX: { false: [{ select: "sel('A')", group: 'g1' }] } }), [], 'and is happy with one');
has(codes({ C_IDX: { true: [{ select: "sel('A')", group: 'g' }] } }), 'bad_value', 'C_IDX only takes false');
has(codes({ C_CENTROID: { '1,2': [{ select: "sel('A')" }] } }), 'bad_value', 'a centroid needs three numbers');
eq(checkConditions({ C_CENTROID: { '1.0,2.0,-3.5': [{ select: "sel('A')" }] } }), [], 'and takes x,y,z');
eq(checkConditions({ C_CATH: { '2.60.40': [{ select: "sel('A')" }] } }), [], 'a C.A.T label is accepted');
eq(checkConditions({ C_CATH: { '2.60.x': [{ select: "sel('A')" }] } }), [], 'and x stands for a level left open');
has(codes({ C_CATH: { globular: [{ select: "sel('A')" }] } }), 'bad_value', 'but a word is not a C.A.T label');

// Sequence probabilities, which is how you forbid a residue.
eq(checkConditions({ C_SEQ_PROB_CYS: { 0.0: [{ select: "sel('A')" }] } }), [], 'forbidding cysteine is clean');
has(codes({ C_SEQ_PROB_CYSTEINE: { 0: [{ select: "sel('A')" }] } }), 'unknown_token', 'the token has to be canonical');
has(codes({ C_SEQ_PROB_CYS: { 1.5: [{ select: "sel('A')" }] } }), 'bad_value', 'a probability above 1 is refused');
has(codes({ C_SEQ_PROB_CYS: { 0.7: [{ select: "sel('A')" }] }, C_SEQ_PROB_MET: { 0.6: [{ select: "sel('A')" }] } }),
  'prob_sum', 'probabilities on one selection cannot add up past 1');
eq(checkConditions({ C_SEQ_PROB_CYS: { 0.5: [{ select: "sel('A')" }] }, C_SEQ_PROB_MET: { 0.5: [{ select: "sel('B')" }] } }), [],
  'but the same numbers on different selections are fine');
eq(SEQ_PROB_TOKENS.length, 28, 'there are 28 canonical tokens, 20 amino acids and 8 bases');

// The ordering trap the docs warn about.
has(codes({ C_CRD: { true: [{ select: "sel('A')" }] }, C_CRDGRP: { 1: [{ select: "sel('A')" }] } }),
  'crd_before_group', 'setting C_CRD true alongside a group is flagged');
ok(checkConditions({ C_CRD: { true: [{ select: "sel('A')" }] }, C_CRDGRP: { 1: [{ select: "sel('A')" }] } })
  .find(x => x.code === 'crd_before_group').warning, 'and it is a warning, not a refusal');

// Shape mistakes.
has(codes({ C_SEQ: [{ select: "sel('A')" }] }), 'entry_shape', 'a condition has to be a mapping');
has(codes({ C_SEQ: { true: { select: "sel('A')" } } }), 'select_shape', 'its value has to be a list');
has(codes({ C_SEQ: { true: [{}] } }), 'no_select', 'a selection needs a select in it');
has(checkConditions([]).map(x => x.code), 'conditions_shape', 'conditions cannot be a list');
eq(checkConditions(undefined), [], 'no conditions at all is fine');

// A select reaching into a designed stretch by residue number.
has(checkConditions({ C_SEQ: { true: [{ select: "sel('A/E1/[1-10]')" }] } }, { names: ['E1'] }).map(x => x.code),
  'designed_resid', 'selecting a designed stretch by residue number is flagged');

// --- a whole design ---------------------------------------------------------
const design = { input: 'target.cif', contig: '50-120, /0, A17-131', conditions: clean };
eq(checkDesign('binder', design), [], 'the docs example design is clean');
has(checkDesign('x', { contig: 'A1-5' }).map(x => x.code), 'no_input', 'a design needs an input');
has(checkDesign('x', { input: 'target.pdb' }).map(x => x.message), '.cif', 'a PDB input is refused with the reason');
eq(checkDesign('x', { input: 'target.cif.zst' }).length, 0, 'a zstandard cif is accepted');
eq(checkDesign('x', { input: 'target.bcif' }).length, 0, 'a binary cif is accepted');
has(checkDesign('x', { input: 'a.cif', hotspots: 'A54' }).map(x => x.code), 'unknown_field',
  'a BindCraft2 style field is refused, because RFD4 stops on an unknown field');
has(checkDesign('x', { input: 'a.cif', input_as_annotated_cif: 'yes' }).map(x => x.code), 'bad_annotated', 'that field is a boolean');

eq(checkSpec({ binder: design }), [], 'a one design spec file is clean');
eq(checkSpec({ global_args: { num_replicates: 2 }, binder: design }), [], 'global_args is allowed beside a design');
has(checkSpec({}).map(x => x.code), 'no_designs', 'an empty spec file is refused');
has(checkSpec({ binder: design, other: { contig: 'A1-5' } }).map(x => x.design), 'other', 'a problem says which design it is in');

// --- the command line -------------------------------------------------------
eq(words("rfd4-generate metrics_tags='[design,refold]'"), ['rfd4-generate', 'metrics_tags=[design,refold]'],
  'a quoted list stays one word');
eq(words(''), [], 'an empty command has no words');

const good = parse('rfd4-generate inputs=binder.yaml out_dir=./runs/first num_replicates=2');
eq(good.ok, true, 'the quickstart command parses');
eq(good.parsed.overrides.num_replicates, 2, 'and a number comes out a number');
eq(good.parsed.overrides.inputs, 'binder.yaml', 'and the input is picked up');

has(parse('rfd4-generate').errors, 'needs inputs=', 'a run with no inputs is refused');
has(parse('rfd4-genrate inputs=a.yaml').errors, 'rfd4-generate', 'a misspelled program suggests the real one');
has(parse('bindcraft design a.json').errors, 'different program', 'another tool is rejected by name');
has(parse('rfd4-generate binder.yaml').errors, 'inputs=binder.yaml', 'a bare file name is explained, with the fix');
has(parse('rfd4-generate --inputs binder.yaml').errors, 'key=value', 'a double dash flag is explained, not just refused');
has(parse('rfd4-generate --num-replicates=2 inputs=a.yaml').errors, 'num_replicates=', 'and a dashed name is mapped to the real key');
has(parse('rfd4-generate inputs=a.yaml nreplicates=2').errors, 'num_replicates', 'a typo in a key suggests the real one');
has(parse('rfd4-generate inputs=a.yaml num_replicates=two').errors, 'whole number', 'a word where a number goes is refused');
has(parse('rfd4-generate inputs=a.yaml num_replicates=2.5').errors, 'whole number', 'and so is a fraction');
has(parse('rfd4-generate inputs=a.yaml generation.args.nsteps=0').errors, 'below 1', 'nsteps cannot be zero');
has(parse('rfd4-generate inputs=a.yaml inference_backend=fast').errors, 'native or bioir', 'a backend outside the list is refused');
has(parse('rfd4-generate inputs=a.yaml compress_outputs=yes').errors, 'true or false', 'a boolean takes true or false');
has(parse('rfd4-generate inputs=a.yaml generation.args.partial_t_backbone=1.4').errors, 'above 1',
  'a partial diffusion time outside 0 to 1 is refused');
eq(parse('rfd4-generate inputs=a.yaml seed=null').parsed.overrides.seed, null, 'null parses as nothing');
eq(parse("rfd4-generate inputs=a.yaml metrics_tags='[design,refold]'").parsed.overrides.metrics_tags, ['design', 'refold'],
  'a quoted list becomes a list');
has(parse("rfd4-generate inputs=a.yaml metrics_tags='[design'").errors, 'closing bracket', 'a broken list is reported');
eq(parse("rfd4-generate inputs=a.yaml '~metrics'").parsed.deletes, ['metrics'], 'a tilde deletes a key');
eq(parse('rfd4-generate inputs=a.yaml +new_thing=1').ok, true, 'a plus adds a key with no default');
has(parse('rfd4-generate inputs=a.yaml new_thing=1').errors, '+new_thing=1', 'and without the plus it says so');
eq(parse('rfd4-generate --help').ok, true, '--help is allowed on its own');
has(parse('rfd4-generate inputs=a.yaml inputs=b.yaml').warnings, 'set twice', 'setting a key twice is a warning');
has(parse('rfd4-evaluate inputs=a.cif').errors, 'out_dir=', 'rfd4-evaluate needs its out_dir');
has(parse('rfd4-evaluate inputs=a.cif out_dir=./x').errors, 'metrics_tags=', 'and its metrics_tags');

eq(parseValue('num_replicates', '40').value, 40, 'a count parses');
eq(parseValue('generation.args.guidance_w', '1.5').value, 1.5, 'a float parses');
eq(parseValue('metrics_tags', 'design').value, ['design'], 'a single tag becomes a one item list');

// --- defaults and consequences ---------------------------------------------
const eff = effective(parse('rfd4-generate inputs=a.yaml num_replicates=8').parsed);
eq(eff.settings.num_replicates, 8, 'the command line wins over the default');
eq(eff.from.num_replicates, 'command', 'and the site says where the value came from');
eq(eff.settings['generation.args.nsteps'], 60, 'an untouched option keeps its default');
eq(eff.from['generation.args.nsteps'], 'default', 'and says it is a default');
eq(effective(parse("rfd4-generate inputs=a.yaml '~metrics'").parsed).from.metrics, 'deleted', 'a deleted key is reported as deleted');

const plain = consequences(parse('rfd4-generate inputs=a.yaml').parsed);
has(plain.map(x => x.text), 'nothing to play back', 'a default run warns that no trajectory is saved');
has(plain.map(x => x.text), 'metrics_tags is empty', 'and that nothing is scored');
has(plain.map(x => x.text), 'cannot be repeated', 'and that there is no seed');

const traj = consequences(parse('rfd4-generate inputs=a.yaml generation.args.save_trajectory_every=2').parsed);
has(traj.map(x => x.text), 'about 30 frames', '60 steps every 2 is about 30 frames');
has(traj.map(x => x.text), 'alpha carbons only', 'and the default CA only format is called out');
const allatom = consequences(parse('rfd4-generate inputs=a.yaml generation.args.save_trajectory_every=2 generation.args.bb_ca_only_trajectories=false').parsed);
has(allatom.map(x => x.text), 'this site can play', 'turning off CA only gives frames the site can play');

// --- rebuilding and outputs -------------------------------------------------
const rb = rebuild(parse("rfd4-generate num_replicates=2 inputs=a.yaml metrics_tags='[design]'").parsed);
ok(rb.startsWith('rfd4-generate inputs=a.yaml'), 'a rebuilt command leads with the input');
ok(rb.includes("metrics_tags='[design]'"), 'and quotes a list so the shell leaves it alone');
ok(rebuild(parse("rfd4-generate inputs=a.yaml '~metrics'").parsed).includes("'~metrics'"), 'and keeps a deletion quoted');

const out = outputs(parse('rfd4-generate inputs=a.yaml out_dir=./runs/first').parsed);
eq(out.dir, './runs/first', 'out_dir is used as given');
has(out.list.map(x => x.path), 'inference_samples/<example>/<example>_generated.cif', 'a design lands in inference_samples');
ok(!out.list.some(x => x.path.includes('per_example_metrics')), 'with no metrics_tags there is no metrics csv');
has(outputs(parse("rfd4-generate inputs=a.yaml metrics_tags='[design]'").parsed).list.map(x => x.path),
  'inference_metrics/per_example_metrics.csv', 'and with one there is');
has(outputs(parse('rfd4-generate inputs=a.yaml compress_outputs=true').parsed).list.map(x => x.path), '.cif.zst',
  'compress_outputs changes the file names');
has(outputs(parse('rfd4-generate inputs=a.yaml').parsed).list.map(x => x.path), './hydra_outputs/',
  'the config snapshot is outside out_dir, which catches people out');
eq(outputs(parse('rfd4-generate inputs=a.yaml').parsed).dir, './runs/inference', 'the default run directory is named');

// --- small shared helpers ---------------------------------------------------
eq(parseCSV('a,b\n1,2\n3,4').rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }], 'a metrics csv parses');
eq(parseCSV('a,b\n"x,y",2').rows, [{ a: 'x,y', b: '2' }], 'a quoted cell keeps its comma, which the config columns need');
eq(parseCSV('').rows, [], 'an empty csv is empty, not an error');
eq(ranges([17, 18, 19, 23]), '17-19, 23', 'residue numbers collapse into ranges');
eq(ranges([]), '', 'no residues is an empty string');
eq(formatOf('x_generated.cif'), 'cif', 'RFD4 output is read as cif');
eq(formatOf('x.cif.zst'), 'cif', 'and so is a compressed one');
eq(formatOf('old.pdb'), 'pdb', 'a pdb is still read as a pdb');

// --- the shipped data files are valid ---------------------------------------
const here = fileURLToPath(new URL('.', import.meta.url));
for (const file of ['data/text.json', 'data/runs.json', 'data/examples.json']) {
  const raw = readFileSync(here + '../' + file, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); ok(true, `${file} is valid JSON`); }
  catch (e) { fail++; console.error(`FAIL ${file} is not valid JSON: ${e.message}`); continue; }
  if (file === 'data/text.json') {
    const banned = /\b(importantly|notably|interestingly|indeed|crucially|moreover|furthermore|hence|consequently|nevertheless|groundbreaking|transformative|cutting-edge|remarkable)\b/i;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string') { fail++; console.error(`FAIL ${file} ${k} is not a string`); continue; }
      if (/[—–]/.test(v)) { fail++; console.error(`FAIL ${file} ${k} has an em or en dash`); continue; }
      const prose = v.replace(/&\w+;|&#\d+;/g, '');
      if (/;/.test(prose)) { fail++; console.error(`FAIL ${file} ${k} has a semicolon`); continue; }
      if (banned.test(v)) { fail++; console.error(`FAIL ${file} ${k} uses "${v.match(banned)[0]}"`); continue; }
      pass++;
    }
  }
  // Every example on the spec page has to be one RFD4 would accept, or the page teaches a mistake.
  if (file === 'data/examples.json') {
    for (const [key, ex] of Object.entries(parsed.examples ?? {})) {
      const problems = checkSpec(ex.spec).filter(p => !p.warning);
      if (problems.length) { fail++; console.error(`FAIL example ${key} is not a valid spec: ${problems[0].message}`); }
      else pass++;
    }
  }
}

// --- every piece of text a page asks for exists -----------------------------
// A missing key shows up on the page as [key.name] in red, which students would see
// before we did. So the build refuses to ship one.
{
  const root = here + '../';
  const text = JSON.parse(readFileSync(root + 'data/text.json', 'utf8'));
  const walk = d => readdirSync(root + d, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const files = [...walk('js'), ...readdirSync(root).filter(f => f.endsWith('.html'))];
  const asked = new Set();
  for (const f of files) {
    const s = readFileSync(root + f, 'utf8');
    for (const m of s.matchAll(/data-t="([^"]+)"/g)) asked.add(m[1]);
    for (const m of s.matchAll(/\bT(?:plain)?\(\s*['"]([^'"]+)['"]/g)) asked.add(m[1]);
  }
  const missing = [...asked].filter(k => !k.endsWith('.') && !(k in text));
  if (missing.length) { fail++; console.error(`FAIL the pages ask for text that is not in data/text.json: ${missing.join(', ')}`); }
  else ok(true, 'every piece of text the pages ask for by name exists');

  // The keys built by joining a prefix to a value, such as "phase." plus a phase key.
  const prefixes = [...asked].filter(k => k.endsWith('.'));
  for (const p of prefixes) {
    const any = Object.keys(text).some(k => k.startsWith(p));
    if (!any) { fail++; console.error(`FAIL nothing in data/text.json starts with "${p}", which a page builds keys from`); }
    else pass++;
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

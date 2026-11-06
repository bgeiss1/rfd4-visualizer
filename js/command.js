// The rfd4-generate command line.
//
// RFD4-Proteina is driven by Hydra, so every option is key=value and nothing is a --flag.
// That is the first thing students get wrong, so the parser explains it rather than just
// refusing. Option names, types and defaults are from reference/cli-options.html
// (read 2026-11-06); anything the docs did not state is marked unknown here instead of
// being invented.

export const PROGRAMS = ['rfd4-generate', 'rfd4-evaluate'];

// type: 'path' | 'int' | 'float' | 'bool' | 'str' | 'list' | 'choice'
export const KEYS = {
  inputs: { type: 'path', default: null, required: true },
  out_dir: { type: 'path', default: null },
  num_replicates: { type: 'int', default: 1, min: 1 },
  batch_size: { type: 'int', default: 1, min: 1 },
  metrics_tags: { type: 'list', default: [] },
  subset_to_examples: { type: 'list', default: null },
  skip_existing: { type: 'bool', default: true },
  prevalidate_inputs: { type: 'bool', default: false },
  seed: { type: 'int', default: null },
  torch_deterministic: { type: 'bool', default: false },
  hf_ckpt_path: { type: 'str', default: 'nvidia/RFD4-Proteina' },
  hf_ckpt_revision: { type: 'str', default: null },
  ckpt_path: { type: 'path', default: '${oc.env:DATA_PATH}/flow_checkpoints' },
  ckpt_name: { type: 'str', default: null },
  autoencoder_ckpt_path: { type: 'path', default: null },
  adapter_path: { type: 'path', default: null },
  compress_outputs: { type: 'bool', default: false },
  save_chain_of_interest: { type: 'bool', default: false },
  verbose: { type: 'bool', default: false },
  compile_lengths: { type: 'list', default: 'null or 15 buckets from 128 to 1024' },
  gen_njobs: { type: 'int', default: 1, min: 1 },
  inference_experiment: { type: 'str', default: 'inference_on_user_inputs' },
  inference_backend: { type: 'choice', choices: ['native', 'bioir'], default: 'native' },
  recycle_strategy: { type: 'str', default: 'thinking_medium' },
  n_recycle: { type: 'int', default: 0, min: 0 },
  generation: { type: 'choice', choices: ['inference_base', 'inverse_folding'], default: 'inference_base' },
  precision: { type: 'str', default: 'bf16-mixed' },
  'generation.args.nsteps': { type: 'int', default: 60, min: 1 },
  'generation.args.guidance_w': { type: 'float', default: 1.0 },
  'generation.args.save_trajectory_every': { type: 'int', default: 0, min: 0 },
  'generation.args.bb_ca_only_trajectories': { type: 'bool', default: true },
  'generation.args.dump_noisy_trajectories': { type: 'bool', default: false },
  'generation.args.partial_trajectory_fraction_steps': { type: 'float', default: null, min: 0, max: 1 },
  'generation.args.partial_t_backbone': { type: 'float', default: null, min: 0, max: 1 },
  'generation.args.partial_t_latent': { type: 'float', default: null, min: 0, max: 1 },
  'generation.args.couple_partial_t': { type: 'bool', default: false },
  'search.beam_width': { type: 'int', default: 4, min: 1 },
  'search.n_branch': { type: 'int', default: 4, min: 1 },
  'search.save_rollouts': { type: 'bool', default: false }
};

// Split a command into words, keeping quoted strings together. Hydra list values have to be
// quoted or the shell eats the brackets, so the quoting is part of the lesson.
export function words(cmd) {
  const out = [];
  let cur = '', q = null, had = false;
  for (const c of String(cmd ?? '')) {
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; had = true; continue; }
    if (/\s/.test(c)) { if (cur || had) { out.push(cur); cur = ''; had = false; } continue; }
    cur += c;
  }
  if (cur || had) out.push(cur);
  return out;
}

const near = (word, list) => {
  let best = null, score = 1e9;
  for (const k of list) {
    const d = distance(word, k);
    if (d < score) { score = d; best = k; }
  }
  return score <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
};

function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Turn a written value into a value, and say when it does not fit the option.
export function parseValue(key, raw) {
  const spec = KEYS[key];
  const s = String(raw);
  if (!spec) return { value: s };
  if (/^null$/i.test(s)) return { value: null };
  switch (spec.type) {
    case 'bool': {
      if (/^(true|false)$/i.test(s)) return { value: /^true$/i.test(s) };
      return { value: s, error: `${key} is true or false, not ${s}.` };
    }
    case 'int': {
      if (!/^-?\d+$/.test(s)) return { value: s, error: /^-?\d*\.\d+$/.test(s) ? `${key} is a whole number, so ${s} will not do.` : `${key} is a whole number, not ${s}.` };
      const n = Number(s);
      if (spec.min !== undefined && n < spec.min) return { value: n, error: `${key} cannot be below ${spec.min}.` };
      return { value: n };
    }
    case 'float': {
      if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return { value: s, error: `${key} is a number, not ${s}.` };
      const n = Number(s);
      if (spec.min !== undefined && n < spec.min) return { value: n, error: `${key} cannot be below ${spec.min}.` };
      if (spec.max !== undefined && n > spec.max) return { value: n, error: `${key} cannot be above ${spec.max}.` };
      return { value: n };
    }
    case 'choice':
      return spec.choices.includes(s) ? { value: s } : { value: s, error: `${key} takes ${spec.choices.join(' or ')}, not ${s}.` };
    case 'list': {
      if (!s.startsWith('[')) return { value: [s] };
      if (!s.endsWith(']')) return { value: s, error: `${key}=${s} is missing its closing bracket.` };
      const items = s.slice(1, -1).split(',').map(x => x.trim()).filter(x => x !== '');
      return { value: items };
    }
    default:
      return { value: s };
  }
}

// Parse a whole command line.
export function parse(cmd) {
  const w = words(cmd);
  const errors = [], warnings = [];
  const parsed = { program: null, overrides: {}, adds: [], deletes: [], help: false };

  if (!w.length) return { ok: false, parsed, errors: ['Type a command.'], warnings };

  parsed.program = w[0];
  if (!PROGRAMS.includes(w[0])) {
    const guess = near(w[0], PROGRAMS);
    errors.push(guess ? `${w[0]} is not a command here. Did you mean ${guess}?`
      : `This site runs ${PROGRAMS.join(' and ')}. ${w[0]} is a different program.`);
  }

  for (const arg of w.slice(1)) {
    if (arg === '--help' || arg === '-h') { parsed.help = true; continue; }
    if (arg === '--cfg' || arg === 'job') { parsed.help = true; continue; }
    if (arg.startsWith('--')) {
      const bare = arg.replace(/^--/, '').replace(/=.*$/, '').replace(/-/g, '_');
      const guess = KEYS[bare] ? bare : near(bare, Object.keys(KEYS));
      errors.push(guess
        ? `RFD4 has no ${arg} flag. Hydra options are written key=value, so use ${guess}=... instead.`
        : `RFD4 has no ${arg} flag. Every option is written key=value, with no dashes.`);
      continue;
    }
    if (arg.startsWith('~')) {
      const key = arg.slice(1);
      parsed.deletes.push(key);
      continue;
    }
    const add = arg.startsWith('+');
    const body = add ? arg.slice(1) : arg;
    const eq = body.indexOf('=');
    if (eq < 0) {
      if (/\.(ya?ml|json|cif|bcif)(\.zst)?$/i.test(body)) {
        errors.push(`${body} is a file with no option name in front of it. RFD4 takes its input as inputs=${body}.`);
      } else {
        errors.push(`${body} is not an option. Hydra options are written key=value.`);
      }
      continue;
    }
    const key = body.slice(0, eq), raw = body.slice(eq + 1);
    if (!KEYS[key] && !add) {
      const guess = near(key, Object.keys(KEYS));
      errors.push(guess
        ? `${key} is not an option this site knows. Did you mean ${guess}?`
        : `${key} is not an option this site knows. A key with no default has to be added with a plus, as in +${key}=${raw}.`);
      continue;
    }
    if (add) parsed.adds.push(key);
    const { value, error } = parseValue(key, raw);
    if (error) errors.push(error);
    if (key in parsed.overrides) warnings.push(`${key} is set twice. Hydra keeps the last one.`);
    parsed.overrides[key] = value;
    if (KEYS[key]?.type === 'list' && raw.startsWith('[') && !/['"]/.test(String(cmd).match(new RegExp(`${key}=\\S*`))?.[0] ?? '')) {
      warnings.push(`Put quotes round ${key}='${raw}' or the shell will take the brackets apart before RFD4 sees them.`);
    }
  }

  if (!parsed.help && !errors.length) {
    if (parsed.overrides.inputs === undefined) errors.push('A run needs inputs=, the spec file or structure to design from.');
    if (parsed.program === 'rfd4-evaluate') {
      if (parsed.overrides.out_dir === undefined) errors.push('rfd4-evaluate needs out_dir=, unlike rfd4-generate which has a default.');
      if (parsed.overrides.metrics_tags === undefined) errors.push('rfd4-evaluate needs metrics_tags=, because scoring is the whole job.');
    }
  }
  return { ok: !errors.length, parsed, errors, warnings };
}

// Every option this run will use: the defaults with the command line on top.
export function effective(parsed) {
  const out = {}, from = {};
  for (const [k, spec] of Object.entries(KEYS)) { out[k] = spec.default; from[k] = 'default'; }
  for (const [k, v] of Object.entries(parsed.overrides ?? {})) { out[k] = v; from[k] = 'command'; }
  for (const k of parsed.deletes ?? []) { out[k] = undefined; from[k] = 'deleted'; }
  return { settings: out, from };
}

// What this command will and will not produce. These are the notes the run page shows.
export function consequences(parsed) {
  const o = parsed.overrides ?? {};
  const out = [];
  const every = o['generation.args.save_trajectory_every'] ?? KEYS['generation.args.save_trajectory_every'].default;
  const caOnly = o['generation.args.bb_ca_only_trajectories'] ?? KEYS['generation.args.bb_ca_only_trajectories'].default;
  const nsteps = o['generation.args.nsteps'] ?? KEYS['generation.args.nsteps'].default;
  const tags = o.metrics_tags ?? KEYS.metrics_tags.default;

  if (!every) {
    out.push({ kind: 'warn', text: 'No trajectory will be saved, so there is nothing to play back. save_trajectory_every is 0 unless you set it.' });
  } else {
    out.push({ kind: 'note', text: `A snapshot every ${every} of ${nsteps} steps gives about ${Math.floor(nsteps / every)} frames per design.` });
    if (caOnly) out.push({ kind: 'warn', text: 'Those frames will be alpha carbons only, in a binary XTC file. Set generation.args.bb_ca_only_trajectories=false for all atom CIF frames, which is what this site can play.' });
    else out.push({ kind: 'ok', text: 'Frames will be all atom CIF, which this site can play.' });
  }
  if (!tags || (Array.isArray(tags) && !tags.length)) {
    out.push({ kind: 'warn', text: 'metrics_tags is empty, so nothing is scored and no per_example_metrics.csv is written. The designs come out unjudged.' });
  }
  if (o.seed === undefined || o.seed === null) {
    out.push({ kind: 'warn', text: 'With no seed= the run cannot be repeated exactly. Set one if a student has to get your numbers.' });
  }
  const reps = o.num_replicates ?? KEYS.num_replicates.default;
  if (reps === 1) out.push({ kind: 'note', text: 'num_replicates is 1, so this makes one design per entry in the spec file.' });
  if (o.compile_lengths === null) out.push({ kind: 'note', text: 'compile_lengths=null skips the compile warm up, which starts faster but runs slower.' });
  if (o.skip_existing === false) out.push({ kind: 'note', text: 'skip_existing=false means a rerun will redo work that is already on disk.' });
  return out;
}

// Write the command back out in a canonical order, so a student can copy it.
export function rebuild(parsed) {
  const order = Object.keys(KEYS);
  const keys = Object.keys(parsed.overrides ?? {}).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
  });
  const parts = [parsed.program || 'rfd4-generate'];
  for (const k of keys) {
    const v = parsed.overrides[k];
    const add = (parsed.adds ?? []).includes(k) ? '+' : '';
    const written = Array.isArray(v) ? `'[${v.join(',')}]'` : v === null ? 'null' : String(v);
    parts.push(`${add}${k}=${written}`);
  }
  for (const k of parsed.deletes ?? []) parts.push(`'~${k}'`);
  return parts.join(' ');
}

// The files a finished run leaves behind, from the output format reference.
export function outputs(parsed) {
  const o = parsed.overrides ?? {};
  const dir = o.out_dir || './runs/inference';
  const ext = o.compress_outputs ? '.cif.zst' : '.cif';
  const list = [
    { path: `${dir}/inference_samples/<example>/<example>_generated${ext}`, what: 'the design' },
    { path: `${dir}/inference_samples/<example>/<example>_input${ext}`, what: 'a copy of what you gave it' }
  ];
  if (o.save_chain_of_interest) list.push({ path: `${dir}/inference_samples/<example>/<example>_chain${ext}`, what: 'the designed chain on its own' });
  const every = o['generation.args.save_trajectory_every'] ?? 0;
  if (every) {
    const caOnly = o['generation.args.bb_ca_only_trajectories'] ?? true;
    list.push({
      path: `${dir}/inference_samples/<example>/trajectories/<example>_<traj>${caOnly ? '_bb_ca.xtc' : '.cif'}`,
      what: caOnly ? 'alpha carbon frames, binary' : 'all atom frames, one model per snapshot'
    });
  }
  const tags = o.metrics_tags;
  if (tags && (!Array.isArray(tags) || tags.length)) {
    list.push({ path: `${dir}/inference_metrics/per_example_metrics.csv`, what: 'one row per design, and the run settings' });
  }
  list.push({ path: './hydra_outputs/', what: 'the full resolved config, outside out_dir' });
  return { dir, list };
}

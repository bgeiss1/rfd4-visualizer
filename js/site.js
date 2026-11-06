// Shared by every page: the RFD4-Proteina workflow, the header, data loading, and the
// terminal each page uses.
//
// Same shape as js/site.js in the GROMACS and BindCraft2 visualizers, so all three behave alike.

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const $ = id => document.getElementById(id);

// One page per part of a run, in the order a student meets them.
export const PAGES = [
  { page: 'process', title: 'How a run works' },
  { page: 'spec', title: 'Describe the design' },
  { page: 'command', title: 'Write the command' },
  { page: 'run', title: 'Run it' },
  { page: 'trajectory', title: 'Watch it fold' },
  { page: 'designs', title: 'Look at the designs' },
  { page: 'metrics', title: 'Read the metrics' },
  { page: 'guidance', title: 'Steer the model' },
  { page: 'compare', title: 'Compare with BindCraft2' }
];

// The phases of one rfd4-generate run, and what each one writes.
// Paths are from the docs' output-format reference, read 2026-11-06.
export const PHASES = [
  { key: 'spec', page: 'spec', makes: ['design.yaml'] },
  { key: 'load', page: 'command', makes: ['hydra_outputs/'] },
  { key: 'sample', page: 'trajectory', makes: ['inference_samples/<example>/<example>_generated.cif', 'inference_samples/<example>/trajectories/'] },
  { key: 'metrics', page: 'metrics', makes: ['inference_metrics/per_example_metrics.csv'] },
  { key: 'refold', page: 'metrics', makes: ['inference_samples/<example>/<example>_<oracle>_refolded.cif', '..._confidences.json'] }
];

// RFD4-Proteina's own defaults for the options the site teaches, from
// reference/cli-options.html (read 2026-11-06). A recorded run's real values come
// from the generation.* columns in its per_example_metrics.csv.
export const DEFAULTS = {
  num_replicates: 1,
  batch_size: 1,
  seed: null,
  'generation.args.nsteps': 60,
  'generation.args.guidance_w': 1.0,
  'generation.args.save_trajectory_every': 0,
  'generation.args.bb_ca_only_trajectories': true,
  'generation.args.dump_noisy_trajectories': false,
  recycle_strategy: 'thinking_medium',
  n_recycle: 0,
  generation: 'inference_base',
  inference_backend: 'native',
  compress_outputs: false,
  save_chain_of_interest: false,
  skip_existing: true,
  hf_ckpt_path: 'nvidia/RFD4-Proteina'
};

// Page text lives in data/text.json so it can be edited from the dashboard (admin.html).
// Keys are flat ("spec.intro"); {name} placeholders are filled from vars.
let TEXT = {};
const SHOW_KEYS = typeof location !== 'undefined' && new URLSearchParams(location.search).has('showtext');
export async function loadText() {
  try { TEXT = await (await fetch('data/text.json', { cache: 'no-store' })).json(); } catch { TEXT = {}; }
  if (SHOW_KEYS) document.documentElement.classList.add('showtext');
}
export function T(key, vars = {}) {
  const v = TEXT[key];
  if (typeof v !== 'string') return `<span class="t-missing">[${esc(key)}]</span>`;
  const out = v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return SHOW_KEYS ? `<span class="tk" title="${esc(key)}">${out}</span>` : out;
}
export const Tplain = (key, vars) => { const d = document.createElement('div'); d.innerHTML = T(key, vars); return d.textContent; };
export function applyText(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) {
    el.innerHTML = T(el.dataset.t);
    if (SHOW_KEYS) el.title = el.dataset.t;
  }
}

// Every page starts with this: load the text, draw the header, fill in the static text.
export async function setup(active) {
  await loadText();
  header(active);
  applyText();
}

export function header(active) {
  const el = document.createElement('header');
  el.className = 'top';
  el.innerHTML = `
    <a class="brand" href="index.html">
      <span class="brand-name">${T('common.brand')}</span>
      <span class="brand-sub">${T('common.brandSub')}</span>
    </a>
    <nav class="tools" aria-label="Run steps">
      <a class="tool${active === 'index' ? ' on' : ''}" href="index.html">${T('common.navOverview')}</a>
      ${PAGES.map(p => `<a class="tool${p.page === active ? ' on' : ''}" href="${p.page}.html" title="${esc(Tplain('nav.' + p.page))}"${p.page === active ? ' aria-current="page"' : ''}>${p.page}</a>`).join('')}
    </nav>`;
  document.body.prepend(el);
}

export async function loadRuns() {
  return (await fetch('data/runs.json', { cache: 'no-store' })).json();
}
export async function loadJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Could not load ${path}`);
  return r.json();
}
export async function text(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path}`);
  return r.text();
}
export const params = () => new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// The terminal. Nothing shows until the student presses Run (Brian, 2026-10-29),
// so hasRun() gates every page's output the way the other two sites do.
// ---------------------------------------------------------------------------
let ran = false;
export const hasRun = () => ran;
export const markRun = () => { ran = true; };
export function resetRun() { ran = false; }

export function term(el, lines, { prompt = '(rfd4) $', cmd = '' } = {}) {
  const body = Array.isArray(lines) ? lines.join('\n') : String(lines ?? '');
  el.innerHTML = `<pre class="term"><span class="term-cmd">${esc(prompt)} ${esc(cmd)}</span>${body ? '\n' + esc(body) : ''}</pre>`;
}

// A coach note under a panel: kind is 'note', 'warn' or 'bad'.
export function note(kind, html) {
  return `<p class="note ${kind}">${html}</p>`;
}

// ---------------------------------------------------------------------------
// Small helpers the pages share
// ---------------------------------------------------------------------------

export const fmt = (v, digits = 2) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '-' : Number(v).toFixed(digits));

// Parse a CSV. RFD4's per_example_metrics.csv can hold quoted config values with commas
// in them (the generation.* columns), so this handles quotes, unlike the BC2 site's parser.
export function parseCSV(s) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const used = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!used.length) return { columns: [], rows: [] };
  const columns = used[0].map(c => c.trim());
  return {
    columns,
    rows: used.slice(1).map(cells => Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? '').trim()])))
  };
}

// RFD4 writes CIF, not PDB. 3Dmol needs to be told which it is.
export const formatOf = path => (/\.cif(\.zst)?$/.test(path) ? 'cif' : 'pdb');

// Residue ranges as the site shows them: [17, 18, 19, 23] becomes "17-19, 23".
export function ranges(nums) {
  const s = [...new Set(nums)].filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? String(s[i]) : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}

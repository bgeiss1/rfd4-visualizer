// Steering the model: partial diffusion, inverse folding, metric guidance and reward guided
// search. The first two are documented well enough to teach exactly. The last two are
// documented only in outline, so the page says what the options are and stops there rather
// than inventing the rest.
import { setup, T, esc, $, DEFAULTS } from '../site.js';
import { KEYS } from '../command.js';

const NSTEPS = DEFAULTS['generation.args.nsteps'];

// A bar showing which part of the trajectory a partial run redoes.
function partialBar(frac) {
  const kept = 1 - frac;
  const start = Math.round(kept * NSTEPS);
  return `<div class="segbar" style="display:flex; gap:3px; min-height:40px">
    <span class="sg keep" style="flex:${(kept * 100).toFixed(1)} 1 0; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); border-radius:5px; display:grid; place-items:center; font:0.76rem var(--font-mono)">steps 1 to ${start}, skipped</span>
    <span class="sg make" style="flex:${(frac * 100).toFixed(1)} 1 0; background:var(--warn-soft); color:var(--warn); border:1px dashed var(--warn); border-radius:5px; display:grid; place-items:center; font:0.76rem var(--font-mono)">steps ${start + 1} to ${NSTEPS}, run</span>
  </div>`;
}

function drawPartial() {
  const frac = Number($('frac').value);
  const start = Math.round((1 - frac) * NSTEPS);
  $('partial').innerHTML = partialBar(frac);
  $('partialRead').innerHTML = [
    ['fraction', frac.toFixed(2)],
    ['steps actually run', `${NSTEPS - start} of ${NSTEPS}`],
    ['starts at step', String(start + 1)],
    ['how far it can drift', frac <= 0.35 ? 'close to your input' : frac <= 0.65 ? 'noticeably different' : 'most of the structure is redrawn']
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd></div>`).join('');
  $('partialCmd').textContent =
    `rfd4-generate inputs=my_structure.cif generation.args.partial_trajectory_fraction_steps=${frac.toFixed(2)} num_replicates=8 out_dir=./runs/partial`;
}

const INVFOLD_OPTS = [
  ['generation', 'inverse_folding', 'guidance.opt.generation'],
  ['generation.model.local_latents.simulation_step_params.tsr_k', '4', 'guidance.opt.tsr_k'],
  ['generation.model.local_latents.simulation_step_params.tsr_sigma', '12', 'guidance.opt.tsr_sigma']
];

const SEARCH_OPTS = [
  ['search.beam_width', 'guidance.opt.beam_width'],
  ['search.n_branch', 'guidance.opt.n_branch'],
  ['search.save_rollouts', 'guidance.opt.save_rollouts']
];

// A small picture of a beam search: one root, n_branch children per level, beam_width kept.
function searchTree(width, branch) {
  const W = 620, H = 180, levels = 3;
  let svg = '';
  const kept = (lvl, i) => i < width;
  for (let lvl = 0; lvl < levels; lvl++) {
    const n = lvl === 0 ? 1 : Math.min(width * branch, 12);
    const y = 24 + lvl * ((H - 48) / (levels - 1));
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? W / 2 : 40 + i * ((W - 80) / (n - 1));
      const on = lvl === 0 || kept(lvl, i);
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${on ? '#4cc7bf' : 'none'}" stroke="${on ? '#4cc7bf' : '#8aa0ae'}" stroke-width="1.5"/>`;
      if (lvl > 0) {
        const parentN = lvl === 1 ? 1 : Math.min(width, 12);
        const p = Math.min(parentN - 1, Math.floor(i / branch));
        const pxv = parentN === 1 ? W / 2 : 40 + p * ((W - 80) / Math.max(1, parentN - 1));
        const pyv = 24 + (lvl - 1) * ((H - 48) / (levels - 1));
        svg += `<line x1="${pxv.toFixed(1)}" y1="${pyv.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${on ? '#4cc7bf' : '#8aa0ae'}" stroke-opacity="${on ? 0.8 : 0.35}" stroke-width="1.2"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="A beam search keeping ${width} of ${width * branch} branches at each level">${svg}
    <text x="4" y="14" font-size="11" fill="#8aa0ae">filled means kept, open means dropped</text></svg>`;
}

(async () => {
  await setup('guidance');

  $('frac').addEventListener('input', drawPartial);
  drawPartial();

  $('invfoldCmd').textContent = 'rfd4-generate generation=inverse_folding inputs=design.cif num_replicates=8 out_dir=./runs/invfold';
  $('invfoldOpts').innerHTML = `
    <thead><tr><th>Option</th><th>Default</th><th>What it does</th></tr></thead>
    <tbody>${INVFOLD_OPTS.map(([k, d, t]) => `<tr><th class="mono">${esc(k)}</th><td class="mono">${esc(d)}</td><td>${T(t)}</td></tr>`).join('')}</tbody>`;

  $('searchTree').innerHTML = searchTree(KEYS['search.beam_width'].default, KEYS['search.n_branch'].default);
  $('searchOpts').innerHTML = `
    <thead><tr><th>Option</th><th>Default</th><th>What it does</th></tr></thead>
    <tbody>${SEARCH_OPTS.map(([k, t]) => `<tr><th class="mono">${esc(k)}</th>
      <td class="mono">${esc(String(KEYS[k].default))}</td><td>${T(t)}</td></tr>`).join('')}</tbody>`;
})();

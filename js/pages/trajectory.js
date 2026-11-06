// The trajectory page: play the frames RFD4 saved on its way from noise to a structure.
// Those frames only exist if the run set generation.args.save_trajectory_every, and
// bb_ca_only_trajectories=false, so the page says which run it is playing and how.
import { setup, T, esc, $, params, loadRuns, text, DEFAULTS } from '../site.js';
import { viewer, player, CHAIN_COLOURS } from '../viewer.js';
import { pending } from '../pending.js';

let runs = {}, view = null, playable = [];

const TRAJ_OPTS = [
  ['generation.args.save_trajectory_every', 'traj.every'],
  ['generation.args.bb_ca_only_trajectories', 'traj.caOnly'],
  ['generation.args.dump_noisy_trajectories', 'traj.noisy']
];

function legend(design) {
  const bits = [`<span class="chip"><span class="sw box" style="background:${CHAIN_COLOURS.designed}"></span> designed</span>`];
  if (design.chains?.target?.length) bits.push(`<span class="chip"><span class="sw box" style="background:${CHAIN_COLOURS.target}"></span> the input you kept</span>`);
  $('legend').innerHTML = bits.join('');
}

async function show(key) {
  const [runKey, designId] = key.split('::');
  const run = runs[runKey];
  const design = (run.designsList ?? []).find(d => d.id === designId);
  for (const b of $('pick').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.k === key));
  history.replaceState(null, '', `?d=${encodeURIComponent(key)}`);

  $('pickNote').innerHTML = `${esc(run.title)}, design <span class="mono">${esc(design.id)}</span>, ${esc(design.nframes ?? 0)} frames saved out of ${esc(run.nsteps ?? DEFAULTS['generation.args.nsteps'])} sampling steps.`;

  const data = await text(design.frames);
  const count = view.frames(data, 'pdb', { designed: design.chains?.designed ?? [] });
  const n = count || design.nframes || 1;
  const every = run.saveEvery || 1;
  player($('player'), n, i => view.frame(i), { label: i => `sampling step ${(i + 1) * every}` });
  legend(design);

  $('readout').innerHTML = [
    ['frames', `${n}`],
    ['residues designed', `${design.length ?? '-'}`],
    ['chains', (design.chains?.designed ?? []).join(', ') || '-'],
    ['snapshot every', `${every} step${every === 1 ? '' : 's'}`]
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd></div>`).join('');

  $('howCmd').textContent = run.command || '';
}

(async () => {
  await setup('trajectory');
  let data;
  try { data = await loadRuns(); } catch { data = { order: [], runs: {} }; }
  runs = data.runs ?? {};

  $('trajOpts').innerHTML = `
    <thead><tr><th>Option</th><th>Default</th><th>What it does</th></tr></thead>
    <tbody>${TRAJ_OPTS.map(([k, t]) => `<tr><th class="mono">${esc(k)}</th>
      <td class="mono">${esc(String(DEFAULTS[k]))}</td><td>${T(t)}</td></tr>`).join('')}</tbody>`;

  for (const [runKey, run] of Object.entries(runs)) {
    if (!run.captured) continue;
    for (const d of run.designsList ?? []) if (d.frames) playable.push({ key: `${runKey}::${d.id}`, label: `${run.title}: ${d.id}` });
  }
  if (!playable.length) {
    pending('trajectory', 'The capture commands in <span class="mono">data/runs.json</span> already set those two options, so a captured run will have frames.');
    return;
  }

  $('pick').innerHTML = playable.map(p => `<button type="button" data-k="${esc(p.key)}" aria-pressed="false">${esc(p.label)}</button>`).join('');
  view = await viewer($('viewer'));
  const want = params().get('d');
  await show(playable.some(p => p.key === want) ? want : playable[0].key);
  $('pick').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (b) show(b.dataset.k).catch(err => { $('pickNote').textContent = String(err.message || err); });
  });
})();

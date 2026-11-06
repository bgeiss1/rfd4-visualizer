// The command page: type an rfd4-generate command line, press Run, and see what it would do.
// Nothing shows until Run is pressed, the way the other two sites work (Brian, 2026-10-29).
import { setup, T, Tplain, esc, $, term, markRun, hasRun, loadJSON } from '../site.js';
import { parse, effective, consequences, rebuild, outputs, KEYS } from '../command.js';

const PRESETS = [
  ['The quickstart', "rfd4-generate inputs=binder.yaml out_dir=./runs/first num_replicates=2 '~metrics'"],
  ['A run we can play back', 'rfd4-generate inputs=binder.yaml out_dir=./runs/binder num_replicates=8 seed=1234 generation.args.save_trajectory_every=2 generation.args.bb_ca_only_trajectories=false'],
  ['With scoring on', "rfd4-generate inputs=binder.yaml out_dir=./runs/scored num_replicates=8 metrics_tags='[design]'"],
  ['Keep the backbone, change the sequence', 'rfd4-generate generation=inverse_folding inputs=design.cif out_dir=./runs/invfold num_replicates=8'],
  ['Two mistakes to look at', 'rfd4-generate --num-replicates 8 binder.yaml']
];

function drawPresets() {
  $('presets').innerHTML = PRESETS.map(([label], i) => `<button type="button" data-i="${i}">${esc(label)}</button>`).join('');
  $('presets').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    $('cmd').value = PRESETS[Number(b.dataset.i)][1];
    go();
  });
}

function showProblems(result) {
  const bits = [];
  for (const e of result.errors) bits.push(`<p class="note bad">${esc(e)}</p>`);
  for (const w of result.warnings) bits.push(`<p class="note warn">${esc(w)}</p>`);
  if (!bits.length) bits.push(`<p class="note ok">${Tplain('command.ok')}</p>`);
  $('problems').innerHTML = bits.join('');
}

// What RFD4 prints when it starts. This is a stand-in, labelled as one on the page: the real
// log from a captured run is on the run page.
function startupLines(parsed) {
  const o = parsed.overrides;
  const dir = o.out_dir || './runs/inference';
  return [
    `[rfd4] loading checkpoint ${o.hf_ckpt_path ?? KEYS.hf_ckpt_path.default}`,
    `[rfd4] reading ${o.inputs}`,
    `[rfd4] out_dir ${dir}`,
    o.seed === undefined || o.seed === null ? '[rfd4] seed not set, using a random one' : `[rfd4] seed ${o.seed}`,
    `[rfd4] ${o.num_replicates ?? 1} replicate(s) per example, batch size ${o.batch_size ?? 1}`,
    `[rfd4] ${o['generation.args.nsteps'] ?? 60} sampling steps`,
    o['generation.args.save_trajectory_every'] ? `[rfd4] saving a trajectory snapshot every ${o['generation.args.save_trajectory_every']} steps` : '[rfd4] not saving trajectories',
    (o.metrics_tags && (!Array.isArray(o.metrics_tags) || o.metrics_tags.length)) ? `[rfd4] metrics: ${[].concat(o.metrics_tags).join(', ')}` : '[rfd4] no metrics requested'
  ];
}

function drawFiles(parsed) {
  const { list } = outputs(parsed);
  $('files').innerHTML = list.map(f => `<li class="file">
    <span class="mono">${esc(f.path)}</span>
    <span class="tag">${esc(f.what)}</span></li>`).join('');
}

function drawSettings(parsed) {
  const { settings, from } = effective(parsed);
  const rows = Object.keys(KEYS)
    .filter(k => from[k] === 'command' || ['inputs', 'out_dir', 'num_replicates', 'seed', 'metrics_tags', 'generation.args.nsteps', 'generation.args.save_trajectory_every', 'generation.args.bb_ca_only_trajectories'].includes(k))
    .map(k => {
      const v = settings[k];
      const written = Array.isArray(v) ? `[${v.join(', ')}]` : v === null ? 'null' : String(v);
      return `<tr data-from="${esc(from[k])}">
        <th class="mono">${esc(k)}</th>
        <td class="mono">${esc(written)}</td>
        <td class="small ${from[k] === 'command' ? '' : 'muted'}">${from[k] === 'command' ? 'you set this' : from[k] === 'deleted' ? 'you deleted this' : "RFD4's default"}</td></tr>`;
    });
  $('settings').innerHTML = `
    <thead><tr><th>Option</th><th>Value</th><th>Where it came from</th></tr></thead>
    <tbody>${rows.join('')}</tbody>`;
}

function go() {
  const cmd = $('cmd').value.trim();
  if (!cmd) return;
  markRun();
  const result = parse(cmd);
  $('whatHappens').hidden = false;
  showProblems(result);

  if (!result.ok) {
    term($('terminal'), ['[rfd4] nothing ran.'], { cmd });
    for (const id of ['effects', 'filesCard', 'settingsCard']) $(id).hidden = true;
    return;
  }

  term($('terminal'), startupLines(result.parsed), { cmd });
  $('effects').hidden = false;
  $('consequences').innerHTML = consequences(result.parsed)
    .map(c => `<p class="note ${c.kind}">${esc(c.text)}</p>`).join('');

  $('filesCard').hidden = false;
  drawFiles(result.parsed);
  $('settingsCard').hidden = false;
  drawSettings(result.parsed);

  const tidy = rebuild(result.parsed);
  if (tidy !== cmd) {
    $('problems').insertAdjacentHTML('beforeend',
      `<p class="note note">${Tplain('command.tidy')}<br><span class="mono">${esc(tidy)}</span></p>`);
  }
}

(async () => {
  await setup('command');
  drawPresets();
  $('form').addEventListener('submit', e => { e.preventDefault(); go(); });
  // If a captured run exists, offer its real command as the starting point.
  try {
    const data = await loadJSON('data/runs.json');
    const captured = Object.values(data.runs ?? {}).find(r => r.captured && r.command);
    const planned = Object.values(data.runs ?? {}).find(r => r.planned?.command);
    $('cmd').value = captured?.command || planned?.planned.command || PRESETS[0][1];
  } catch {
    $('cmd').value = PRESETS[0][1];
  }
})();

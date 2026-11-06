// RFD4-Proteina next to BindCraft2. The table is the lesson. The numbers only appear once
// both tools have been run against the same target, and the page says so until then.
import { setup, T, esc, $, loadRuns, loadJSON } from '../site.js';

const VS = [
  ['What it starts from', 'rfd4.vs.start.rfd4', 'rfd4.vs.start.bc2'],
  ['What you write', 'rfd4.vs.input.rfd4', 'rfd4.vs.input.bc2'],
  ['How you aim it', 'rfd4.vs.aim.rfd4', 'rfd4.vs.aim.bc2'],
  ['What it judges itself on', 'rfd4.vs.judge.rfd4', 'rfd4.vs.judge.bc2'],
  ['What comes out', 'rfd4.vs.out.rfd4', 'rfd4.vs.out.bc2'],
  ['How long a design takes', 'rfd4.vs.time.rfd4', 'rfd4.vs.time.bc2'],
  ['Where it can fail quietly', 'rfd4.vs.fail.rfd4', 'rfd4.vs.fail.bc2']
];

const WHEN = ['compare.when.rfd4', 'compare.when.bc2', 'compare.when.both'];

(async () => {
  await setup('compare');

  $('vs').innerHTML = `
    <thead><tr><th></th><th>RFD4-Proteina</th><th>BindCraft2</th></tr></thead>
    <tbody>${VS.map(([label, a, b]) => `<tr><th>${esc(label)}</th><td>${T(a)}</td><td>${T(b)}</td></tr>`).join('')}</tbody>`;

  $('when').innerHTML = WHEN.map(k => `<li>${T(k)}</li>`).join('');

  // The side by side numbers. These need a captured RFD4 run and, from the BindCraft2 site,
  // a campaign against the same target. Until both exist the panel says which is missing.
  let runs = {}, bc2 = null;
  try { runs = (await loadRuns()).runs ?? {}; } catch { runs = {}; }
  try { bc2 = await loadJSON('data/bc2_comparison.json'); } catch { bc2 = null; }
  const mine = Object.values(runs).filter(r => r.captured && r.target);

  if (!mine.length || !bc2) {
    const missing = [];
    if (!mine.length) missing.push('an RFD4 run against a shared target');
    if (!bc2) missing.push('the matching BindCraft2 numbers in <span class="mono">data/bc2_comparison.json</span>');
    $('numbers').innerHTML = `<tbody><tr><td>${T('common.notCapturedYet')} This panel needs ${missing.join(' and ')}.</td></tr></tbody>`;
    return;
  }

  const rows = mine.filter(r => bc2[r.target]).map(r => {
    const other = bc2[r.target];
    return `<tr>
      <th>${esc(r.target)}</th>
      <td class="mono">${esc(r.counts?.written ?? '-')} designs, ${esc(r.counts?.passing ?? '-')} over the bar</td>
      <td class="mono">${esc(other.trajectories ?? '-')} trajectories, ${esc(other.accepted ?? '-')} accepted</td>
      <td class="mono">${esc(r.gpuHours ?? '-')}</td>
      <td class="mono">${esc(other.gpuHours ?? '-')}</td></tr>`;
  });
  $('numbers').innerHTML = rows.length ? `
    <thead><tr><th>Target</th><th>RFD4</th><th>BindCraft2</th><th>RFD4 GPU hours</th><th>BC2 GPU hours</th></tr></thead>
    <tbody>${rows.join('')}</tbody>`
    : `<tbody><tr><td>${T('common.notCapturedYet')} No target has been run through both tools yet.</td></tr></tbody>`;
})();

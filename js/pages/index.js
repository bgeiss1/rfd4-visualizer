// The overview page: the steps of a run, the runs we captured, what came out, and how
// RFD4-Proteina differs from BindCraft2.
import { setup, T, Tplain, esc, $, PHASES, loadRuns, loadJSON } from '../site.js';
import { funnel, runRows } from '../funnel.js';

const PHASE_TITLES = {
  spec: 'You describe the design you want',
  load: 'RFD4 resolves your command into a config',
  sample: 'The model turns noise into a structure, step by step',
  metrics: 'Each design is measured, if you asked for metrics',
  refold: 'A structure predictor is asked whether it agrees'
};

function drawPhases() {
  $('phases').innerHTML = PHASES.map(p => `
    <li class="phase">
      <div class="phase-head">
        <a href="${p.page}.html">${esc(PHASE_TITLES[p.key])}</a>
      </div>
      <ul class="makes">${p.makes.map(f => `<li class="mono">${esc(f)}</li>`).join('')}</ul>
    </li>`).join('');
}

async function drawRuns() {
  let data;
  try { data = await loadRuns(); } catch { data = { order: [], runs: {} }; }
  const order = data.order ?? Object.keys(data.runs ?? {});
  $('runs').innerHTML = order.map(key => {
    const r = data.runs[key];
    if (!r) return '';
    return `<article class="target-card${r.captured ? '' : ' pending'}">
      <h3>${esc(r.title)}</h3>
      <p class="muted">${esc(r.what)}</p>
      ${r.captured
        ? `<p class="mono small">${esc(r.designs ?? 0)} designs${r.frames ? `, ${esc(r.frames)} frames` : ''}</p>
           <a href="run.html?r=${encodeURIComponent(key)}">Look at it</a>`
        : `<p class="small muted">${Tplain('common.notCapturedYet')}</p>`}
    </article>`;
  }).join('');
  return data;
}

function drawCounts(data) {
  const el = $('funnel');
  const first = Object.values(data.runs ?? {}).find(r => r.captured && r.counts);
  if (!first) { el.innerHTML = `<p class="small muted">${Tplain('common.notCapturedYet')}</p>`; return; }
  el.innerHTML = funnel(runRows(first));
}

// A short, honest comparison. Each row is a real difference, not a score.
const VS = [
  ['What it starts from', 'rfd4.vs.start.rfd4', 'rfd4.vs.start.bc2'],
  ['What you write', 'rfd4.vs.input.rfd4', 'rfd4.vs.input.bc2'],
  ['How you aim it', 'rfd4.vs.aim.rfd4', 'rfd4.vs.aim.bc2'],
  ['What it judges itself on', 'rfd4.vs.judge.rfd4', 'rfd4.vs.judge.bc2'],
  ['What comes out', 'rfd4.vs.out.rfd4', 'rfd4.vs.out.bc2']
];

function drawVs() {
  $('vs').innerHTML = `
    <thead><tr><th></th><th>RFD4-Proteina</th><th>BindCraft2</th></tr></thead>
    <tbody>${VS.map(([label, a, b]) => `<tr><th>${esc(label)}</th><td>${T(a)}</td><td>${T(b)}</td></tr>`).join('')}</tbody>`;
}

(async () => {
  await setup('index');
  drawPhases();
  const data = await drawRuns();
  drawCounts(data);
  drawVs();
})();

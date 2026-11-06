// How a run works: what the sixty steps are, which options change them, and what RFD4
// does not do. The step picture is a drawing, not captured data, and says so.
import { setup, T, esc, $, PHASES, DEFAULTS } from '../site.js';
import { player } from '../viewer.js';

// A drawn illustration of the sampling steps: a cloud of points that tightens into a
// chain. It is here to make "sixty steps from noise" concrete, and the caption says it is
// a drawing. The real thing is on the trajectory page.
function stepSVG(frac) {
  const N = 48, W = 640, H = 200;
  // A fixed pseudo random start, so the picture is the same every time the page loads.
  let s = 7;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const noise = Array.from({ length: N }, () => [rnd(), rnd()]);
  // The target shape: a simple two helix hairpin, drawn as a path of points.
  const target = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const up = t < 0.45, down = t > 0.55;
    const y = up ? 0.78 - t / 0.45 * 0.56 : down ? 0.22 + (t - 0.55) / 0.45 * 0.56 : 0.22;
    const x = up ? 0.34 + Math.sin(t * 26) * 0.03 : down ? 0.62 + Math.sin(t * 26) * 0.03 : 0.34 + (t - 0.45) / 0.1 * 0.28;
    return [x, y];
  });
  const pts = noise.map((n, i) => [
    (n[0] * (1 - frac) + target[i][0] * frac) * W,
    (n[1] * (1 - frac) + target[i][1] * frac) * H
  ]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="A drawing of noise becoming a chain, ${Math.round(frac * 100)} per cent of the way">
    <path d="${path}" fill="none" stroke="#4cc7bf" stroke-width="${(1 + frac * 2).toFixed(1)}" stroke-opacity="${(0.35 + frac * 0.6).toFixed(2)}" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(3.4 - frac * 1.2).toFixed(1)}" fill="#4cc7bf" fill-opacity="${(0.25 + frac * 0.55).toFixed(2)}"/>`).join('')}
  </svg>`;
}

// The options that change what the sampler does, with RFD4's own defaults.
const KNOBS = [
  ['generation.args.nsteps', 'knob.nsteps'],
  ['generation.args.guidance_w', 'knob.guidance_w'],
  ['recycle_strategy', 'knob.recycle_strategy'],
  ['n_recycle', 'knob.n_recycle'],
  ['batch_size', 'knob.batch_size'],
  ['num_replicates', 'knob.num_replicates'],
  ['generation', 'knob.generation'],
  ['inference_backend', 'knob.inference_backend']
];

const NOT = ['process.not.filter', 'process.not.mpnn', 'process.not.rank', 'process.not.affinity'];

(async () => {
  await setup('process');

  const steps = $('steps');
  const nsteps = DEFAULTS['generation.args.nsteps'];
  const show = i => { steps.innerHTML = stepSVG(i / (nsteps - 1)); };
  player($('stepPlayer'), nsteps, show, { label: i => `step ${i + 1}` });

  $('knobs').innerHTML = `
    <thead><tr><th>Option</th><th>Default</th><th>What it changes</th></tr></thead>
    <tbody>${KNOBS.map(([k, t]) => `<tr>
      <th class="mono">${esc(k)}</th>
      <td class="mono">${esc(String(DEFAULTS[k] ?? '-'))}</td>
      <td>${T(t)}</td></tr>`).join('')}</tbody>`;

  $('pipeline').innerHTML = PHASES.map(p => `<li>
    <a href="${p.page}.html">${T('phase.' + p.key)}</a>
    <ul class="makes">${p.makes.map(f => `<li class="mono">${esc(f)}</li>`).join('')}</ul>
  </li>`).join('');

  $('not').innerHTML = NOT.map(k => `<li>${T(k)}</li>`).join('');
})();

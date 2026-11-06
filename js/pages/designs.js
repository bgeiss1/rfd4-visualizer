// The designs page: the structures RFD4 actually wrote, shown as the CIF files they are.
import { setup, T, esc, $, params, loadRuns, text, formatOf, fmt } from '../site.js';
import { viewer, CHAIN_COLOURS } from '../viewer.js';
import { pending } from '../pending.js';

let runs = {}, all = [], view = null, style = 'chains', currentKey = null;

const STYLES = [
  ['chains', 'By chain'],
  ['confidence', 'By confidence']
];

function legend() {
  $('legend').innerHTML = style === 'chains'
    ? `<span class="chip"><span class="sw box" style="background:${CHAIN_COLOURS.designed}"></span> designed</span>
       <span class="chip"><span class="sw box" style="background:${CHAIN_COLOURS.target}"></span> the input you kept</span>`
    : `<span class="chip">${esc(T('designs.confLegend').replace(/<[^>]+>/g, ''))}</span>`;
}

async function show(key) {
  currentKey = key;
  const item = all.find(d => d.key === key);
  const { run, design } = item;
  for (const b of $('pick').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.k === key));
  history.replaceState(null, '', `?d=${encodeURIComponent(key)}`);

  const path = style === 'confidence' && design.refolded ? design.refolded : design.path;
  const data = await text(path);
  if (style === 'confidence' && design.refolded) view.byConfidence(data, formatOf(path));
  else view.structure(data, formatOf(path), { designed: design.chains?.designed ?? [], motif: design.motif ?? [] });
  legend();

  const rows = [
    ['run', run.title],
    ['design', design.id],
    ['residues', String(design.length ?? '-')],
    ['designed chains', (design.chains?.designed ?? []).join(', ') || '-'],
    ['file', path.split('/').pop()]
  ];
  for (const [k, v] of Object.entries(design.metrics ?? {})) rows.push([k, fmt(v)]);
  $('readout').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd></div>`).join('');

  $('styles').innerHTML = STYLES.map(([k, label]) => {
    const off = k === 'confidence' && !design.refolded;
    return `<button type="button" data-s="${k}" aria-pressed="${k === style}"${off ? ' disabled title="no refolded structure was captured for this design"' : ''}>${esc(label)}</button>`;
  }).join('');
}

function drawList() {
  const cols = [...new Set(all.flatMap(d => Object.keys(d.design.metrics ?? {})))];
  $('list').innerHTML = `
    <thead><tr><th>Run</th><th>Design</th><th>Residues</th>${cols.map(c => `<th class="mono">${esc(c)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${all.map(({ key, run, design }) => `<tr>
      <td>${esc(run.title)}</td>
      <th class="mono">${esc(design.id)}</th>
      <td class="mono">${esc(design.length ?? '-')}</td>
      ${cols.map(c => `<td class="mono">${esc(fmt(design.metrics?.[c]))}</td>`).join('')}
      <td><button type="button" class="link" data-k="${esc(key)}">look</button></td></tr>`).join('')}</tbody>`;
}

(async () => {
  await setup('designs');
  let data;
  try { data = await loadRuns(); } catch { data = { order: [], runs: {} }; }
  runs = data.runs ?? {};
  for (const [k, run] of Object.entries(runs)) {
    if (!run.captured) continue;
    for (const d of run.designsList ?? []) if (d.path) all.push({ key: `${k}::${d.id}`, run, design: d });
  }
  if (!all.length) { pending('designs'); return; }

  $('pick').innerHTML = all.slice(0, 24).map(d => `<button type="button" data-k="${esc(d.key)}" aria-pressed="false">${esc(d.design.id)}</button>`).join('');
  view = await viewer($('viewer'));
  const want = params().get('d');
  await show(all.some(d => d.key === want) ? want : all[0].key);
  drawList();

  $('pick').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) show(b.dataset.k); });
  $('list').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) { show(b.dataset.k); scrollTo(0, 0); } });
  $('styles').addEventListener('click', e => {
    const b = e.target.closest('button[data-s]');
    if (b && !b.disabled) { style = b.dataset.s; show(currentKey); }
  });
})();

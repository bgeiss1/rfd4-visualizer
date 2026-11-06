// The metrics page: per_example_metrics.csv as RFD4 wrote it, read column by column.
// That file is only written when metrics_tags is set, which is the first thing the page says.
import { setup, T, esc, $, params, loadRuns, text, parseCSV, fmt } from '../site.js';
import { lineChart } from '../chart.js';
import { pending } from '../pending.js';

let runs = {}, scored = [], table = null, numericCols = [], col = null;

// The columns the site explains. Names RFD4 writes that are not in here still show in the
// table, they just have no note next to them.
const GLOSSARY = ['plddt', 'ptm', 'pae', 'rmsd', 'tm_score', 'sc_rmsd', 'self_consistency', 'radius_of_gyration', 'n_residues', 'seed', 'length'];

const isConfigCol = c => /^(generation|search|guidance)\./.test(c) || ['ckpt_path', 'ckpt_name', 'seed'].includes(c);
const looksNumeric = (rows, c) => rows.some(r => r[c] !== '' && Number.isFinite(Number(r[c])));

function drawTable() {
  const cols = table.columns.filter(c => !isConfigCol(c)).slice(0, 14);
  $('table').innerHTML = `
    <thead><tr>${cols.map(c => `<th class="mono">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.slice(0, 60).map(r => `<tr>${cols.map(c =>
      `<td class="mono">${esc(looksNumeric(table.rows, c) ? fmt(r[c], 3) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
    <caption>${esc(table.rows.length)} rows, ${esc(table.columns.length)} columns. The first ${esc(Math.min(60, table.rows.length))} rows and the columns that are not config are shown.</caption>`;
}

function drawChart() {
  if (!col) { $('chart').innerHTML = `<p class="small muted">${esc(T('metrics.noNumbers'))}</p>`; return; }
  const values = table.rows.map(r => Number(r[col])).filter(Number.isFinite);
  if (!values.length) { $('chart').innerHTML = ''; return; }
  const sorted = [...values].sort((a, b) => a - b);
  lineChart($('chart'), {
    x: sorted.map((_, i) => i + 1),
    y: sorted,
    xlabel: 'designs, worst to best on this column',
    ylabel: col
  });
}

function drawCols() {
  $('pickCol').innerHTML = numericCols.map(c => `<button type="button" data-c="${esc(c)}" aria-pressed="${c === col}">${esc(c)}</button>`).join('');
}

function drawConfig() {
  const cols = table.columns.filter(isConfigCol);
  const first = table.rows[0] ?? {};
  $('config').innerHTML = cols.length ? `
    <thead><tr><th>Setting the run used</th><th>Value</th></tr></thead>
    <tbody>${cols.map(c => `<tr><th class="mono">${esc(c)}</th><td class="mono">${esc(first[c] ?? '')}</td></tr>`).join('')}</tbody>`
    : `<tbody><tr><td>${esc(T('metrics.noConfig'))}</td></tr></tbody>`;
}

function drawGlossary() {
  const present = table.columns.filter(c => GLOSSARY.some(g => c.toLowerCase().includes(g)));
  const rows = (present.length ? present : GLOSSARY).map(c => {
    const key = 'metric.' + GLOSSARY.find(g => c.toLowerCase().includes(g)) || c;
    return `<tr><th class="mono">${esc(c)}</th><td>${T(key)}</td></tr>`;
  });
  $('glossary').innerHTML = `
    <thead><tr><th>Column</th><th>What it says</th></tr></thead>
    <tbody>${rows.join('')}</tbody>`;
}

async function show(key) {
  const run = runs[key];
  for (const b of $('pick').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.k === key));
  history.replaceState(null, '', `?r=${encodeURIComponent(key)}`);
  table = parseCSV(await text(run.metrics));
  numericCols = table.columns.filter(c => !isConfigCol(c) && looksNumeric(table.rows, c)).slice(0, 10);
  col = numericCols[0] ?? null;
  drawTable();
  drawCols();
  drawChart();
  drawGlossary();
  drawConfig();
}

(async () => {
  await setup('metrics');
  let data;
  try { data = await loadRuns(); } catch { data = { order: [], runs: {} }; }
  runs = data.runs ?? {};
  scored = Object.keys(runs).filter(k => runs[k].captured && runs[k].metrics);
  if (!scored.length) { pending('metrics'); return; }

  $('pick').innerHTML = scored.map(k => `<button type="button" data-k="${esc(k)}" aria-pressed="false">${esc(runs[k].title)}</button>`).join('');
  const want = params().get('r');
  await show(scored.includes(want) ? want : scored[0]);
  $('pick').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) show(b.dataset.k); });
  $('pickCol').addEventListener('click', e => {
    const b = e.target.closest('button[data-c]');
    if (b) { col = b.dataset.c; drawCols(); drawChart(); }
  });
})();

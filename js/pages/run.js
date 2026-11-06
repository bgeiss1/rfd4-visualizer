// The run page: one captured run, its real command, its real log, and what it left on disk.
import { setup, T, esc, $, params, loadRuns, loadJSON, text, term } from '../site.js';
import { parse, consequences, outputs } from '../command.js';
import { funnel, runRows } from '../funnel.js';
import { pending } from '../pending.js';

let runs = {}, order = [];

function drawPick(key) {
  $('pick').innerHTML = order.map(k => `<button type="button" data-k="${esc(k)}" aria-pressed="${k === key}"${runs[k].captured ? '' : ' disabled title="not captured yet"'}>${esc(runs[k].title)}</button>`).join('');
}

async function show(key) {
  const run = runs[key];
  drawPick(key);
  history.replaceState(null, '', `?r=${encodeURIComponent(key)}`);

  $('command').textContent = run.command || '';
  const result = parse(run.command || '');
  $('consequences').innerHTML = result.ok
    ? consequences(result.parsed).map(c => `<p class="note ${c.kind}">${esc(c.text)}</p>`).join('')
    : `<p class="note warn">${esc(T('run.notParsed'))}</p>`;

  if (run.log) {
    try { term($('log'), (await text(run.log)).split('\n').slice(0, 200), { cmd: run.command }); }
    catch { term($('log'), ['The log file is listed but not on disk.'], { cmd: run.command }); }
  } else {
    term($('log'), ['No log was captured for this run.'], { cmd: run.command });
  }

  $('funnel').innerHTML = funnel(runRows(run)) || `<p class="small muted">${esc(T('run.noCounts'))}</p>`;

  const list = result.ok ? outputs(result.parsed).list : [];
  $('files').innerHTML = list.map(f => `<li class="file">
    <span class="mono">${esc(f.path)}</span><span class="tag">${esc(f.what)}</span></li>`).join('')
    || `<li class="file"><span class="mono">-</span><span class="tag">the command did not parse</span></li>`;
}

(async () => {
  await setup('run');
  let data;
  try { data = await loadRuns(); } catch { data = { order: [], runs: {} }; }
  runs = data.runs ?? {};
  order = data.order ?? Object.keys(runs);
  const captured = order.filter(k => runs[k]?.captured);
  if (!captured.length) {
    const planned = order.filter(k => runs[k]?.planned?.command);
    pending('run', planned.length
      ? `The runs lined up are: ${planned.map(k => esc(runs[k].title)).join(', ')}. The command for each one is in <span class="mono">data/runs.json</span>.`
      : '');
    return;
  }
  const want = params().get('r');
  await show(captured.includes(want) ? want : captured[0]);
  $('pick').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) show(b.dataset.k);
  });
})();

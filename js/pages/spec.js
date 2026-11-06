// The spec page: type a contig and a conditions block, see what you just described and
// every problem RFD4 would stop on. The conditions box takes JSON, because the docs say
// JSON with the same keys works, and the YAML next to it is generated from what you typed.
import { setup, T, Tplain, esc, $, loadJSON } from '../site.js';
import { parseContig, contigSummary, parseSelect, checkConditions, CONDITIONS, CHAIN_TYPES, SEQ_PROB_TOKENS } from '../spec.js';

let examples = { order: [], examples: {} };
let current = null;

// ---------------------------------------------------------------------------
// The contig
// ---------------------------------------------------------------------------

const TOKEN_CLASS = { preserved: 'keep', expandable: 'make', break: 'brk', bad: 'bad' };

function drawTokens(parsed) {
  $('tokens').innerHTML = parsed.segments.map(s => {
    const cls = s.error ? 'bad' : TOKEN_CLASS[s.kind] || '';
    const title = s.error ? s.error
      : s.kind === 'break' ? 'start a new chain'
      : s.kind === 'preserved' ? `keep ${s.chain}${s.from}${s.to > s.from ? ' to ' + s.to : ''} from the input`
      : s.name ? `design ${s.min === s.max ? s.min : `${s.min} to ${s.max}`} residues, called ${s.name}`
      : `design ${s.min === s.max ? s.min : `${s.min} to ${s.max}`} residues`;
    return `<span class="tok ${cls}" title="${esc(title)}">${esc(s.raw)}</span>`;
  }).join('');
}

function drawChains(contig) {
  const { chains } = parseContig(contig);
  const summary = contigSummary(contig);
  if (!chains.length) { $('chains').innerHTML = ''; return; }
  const widest = Math.max(...chains.map(c => c.max)) || 1;
  $('chains').innerHTML = chains.map((c, i) => {
    const s = summary[i];
    const bars = c.segments.map(seg => {
      const n = seg.kind === 'preserved' ? seg.to - seg.from + 1 : seg.max;
      const pct = Math.max(6, (n / widest) * 100);
      const cls = seg.error ? 'err' : seg.kind === 'preserved' ? 'keep' : 'make';
      const label = seg.kind === 'preserved' ? seg.raw : (seg.name ? `${seg.name} ${seg.min}-${seg.max}` : `${seg.min}-${seg.max}`);
      return `<span class="sg ${cls}" style="flex: ${pct.toFixed(1)} 1 0" title="${esc(seg.raw)}">${esc(label)}</span>`;
    }).join('');
    const len = s.fixed ? `${s.min} residues` : `${s.min} to ${s.max} residues`;
    return `<div class="chainrow">
      <div class="who">chain ${esc(c.id)}, ${esc(CHAIN_TYPES[c.type] || c.type)}, ${esc(len)}${c.fromInput ? '' : ', all new'}</div>
      <div class="segbar">${bars}</div>
    </div>`;
  }).join('');
}

function problems(el, list) {
  if (!list.length) { el.innerHTML = `<p class="note ok">${Tplain('spec.noProblems')}</p>`; return; }
  el.innerHTML = list.map(p => {
    const warn = typeof p === 'object' && p.warning;
    const text = typeof p === 'string' ? p : p.message;
    return `<p class="note ${warn ? 'warn' : 'bad'}">${esc(text)}</p>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// The conditions box, and the YAML it becomes
// ---------------------------------------------------------------------------

// A small YAML writer for exactly the shape a spec file has. Conditions go out in flow
// style, the way the docs write them, so what the page shows can be pasted straight in.
function yamlDump(spec) {
  const flow = v => {
    if (Array.isArray(v)) return `[${v.map(flow).join(', ')}]`;
    if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${k}: ${flow(x)}`).join(', ')}}`;
    if (typeof v === 'string') return /[:{}\[\],'"#]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
    return String(v);
  };
  const lines = [];
  for (const [name, design] of Object.entries(spec)) {
    lines.push(`${name}:`);
    for (const [k, v] of Object.entries(design)) {
      if (k === 'conditions') {
        lines.push('  conditions:');
        for (const [cond, byValue] of Object.entries(v)) lines.push(`    ${cond}: ${flow(byValue)}`);
      } else {
        lines.push(`  ${k}: ${flow(v)}`);
      }
    }
  }
  return lines.join('\n');
}

function readConditions() {
  const raw = $('cond').value.trim();
  if (!raw) return { conditions: {}, errors: [] };
  try {
    const parsed = JSON.parse(raw);
    return { conditions: parsed, errors: [] };
  } catch (e) {
    return { conditions: null, errors: [`That is not valid JSON, so the page cannot check it yet. ${e.message}`] };
  }
}

function redraw() {
  const contig = $('contig').value;
  const parsed = parseContig(contig);
  drawTokens(parsed);
  drawChains(contig);
  problems($('contigProblems'), parsed.errors);

  const { conditions, errors } = readConditions();
  if (errors.length) {
    problems($('condProblems'), errors);
  } else {
    problems($('condProblems'), checkConditions(conditions, { names: parsed.names }));
  }

  const design = { input: current?.input || 'target.cif' };
  if (contig.trim()) design.contig = contig.trim();
  if (conditions && Object.keys(conditions).length) design.conditions = conditions;
  $('yaml').textContent = yamlDump({ [current?.name || 'design']: design });
}

// ---------------------------------------------------------------------------
// The sel() playground
// ---------------------------------------------------------------------------

function redrawSel() {
  const sel = parseSelect($('sel').value);
  if (sel.kind === 'query') {
    $('selFields').innerHTML = `<div class="f" style="grid-column: 1 / -1"><span class="n">query</span>
      <div class="v">${esc(sel.raw)}</div></div>`;
  } else {
    $('selFields').innerHTML = ['chain', 'res_name', 'res_id', 'atom_name'].map((f, i) => `
      <div class="f"><span class="n">${i + 1}. ${esc(f.replace('_', ' '))}</span>
        <div class="v">${esc(sel.fields[f] ?? '*')}</div></div>`).join('');
  }
  problems($('selProblems'), [...sel.errors, ...sel.warnings.map(w => ({ message: w, warning: true }))]);
}

// ---------------------------------------------------------------------------
// Examples and the reference tables
// ---------------------------------------------------------------------------

function pick(key) {
  const ex = examples.examples[key];
  if (!ex) return;
  const name = Object.keys(ex.spec)[0];
  const design = ex.spec[name];
  current = { name, input: [].concat(design.input)[0] };
  $('contig').value = design.contig ?? '';
  $('cond').value = design.conditions ? JSON.stringify(design.conditions, null, 1) : '';
  $('exampleNote').innerHTML = `${T(ex.textKey)}${ex.note ? ` ${esc(ex.note)}` : ''}<br><span class="mono small">${esc(ex.command)}</span>`;
  for (const b of $('examples').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.k === key));
  redraw();
}

function drawExamples() {
  $('examples').innerHTML = (examples.order ?? []).map(k => {
    const ex = examples.examples[k];
    return ex ? `<button type="button" data-k="${esc(k)}" aria-pressed="false">${esc(ex.title)}</button>` : '';
  }).join('');
  $('examples').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (b) pick(b.dataset.k);
  });
}

const TOKEN_HELP = [
  ['A17-131', 'tok.preservedRange'],
  ['A52', 'tok.preservedOne'],
  ['50-120', 'tok.expandRange'],
  ['20', 'tok.expandFixed'],
  ['E1:50-120', 'tok.named'],
  ['E2:10R', 'tok.namedType'],
  ['/0', 'tok.break']
];

function drawHelp() {
  $('tokenHelp').innerHTML = `
    <thead><tr><th>Token</th><th>What it means</th></tr></thead>
    <tbody>${TOKEN_HELP.map(([t, k]) => `<tr><th class="mono">${esc(t)}</th><td>${T(k)}</td></tr>`).join('')}</tbody>`;

  const rows = Object.entries(CONDITIONS).map(([key, spec]) => {
    const values = spec.value === 'bool' ? 'true, false'
      : spec.value === 'false' ? 'false'
      : Array.isArray(spec.value) ? spec.value.join(', ')
      : spec.value === 'int+' ? 'a group id of 1 or more, or null'
      : spec.value === 'centroid' ? '"x,y,z"'
      : spec.value === 'cath' ? 'a C.A.T label such as "2.60.40"'
      : spec.value;
    return `<tr><th class="mono">${esc(key)}</th><td class="mono small">${esc(values)}</td><td class="small">${esc(spec.on)}</td><td>${T('cond.' + key)}</td></tr>`;
  });
  rows.push(`<tr><th class="mono">C_SEQ_PROB_&lt;token&gt;</th><td class="mono small">0 to 1</td><td class="small">residues</td><td>${T('cond.C_SEQ_PROB')}</td></tr>`);
  $('condHelp').innerHTML = `
    <thead><tr><th>Condition</th><th>Values</th><th>Applies to</th><th>What it does</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
    <caption>${esc(SEQ_PROB_TOKENS.length)} tokens can carry a sequence probability: the 20 amino acids, the 4 RNA bases and the 4 DNA bases.</caption>`;
}

(async () => {
  await setup('spec');
  try { examples = await loadJSON('data/examples.json'); } catch { examples = { order: [], examples: {} }; }
  drawExamples();
  drawHelp();
  $('contig').addEventListener('input', redraw);
  $('cond').addEventListener('input', redraw);
  $('sel').addEventListener('input', redrawSel);
  $('sel').value = "sel('A/*/*/[N,CA,C,O]')";
  redrawSel();
  const first = (examples.order ?? [])[0];
  if (first) pick(first); else redraw();
})();

// What a run produced, drawn as inline SVG. RFD4-Proteina has no per stage filtering the way
// BindCraft2 does: every sample it starts, it finishes. So the honest picture is not a funnel
// of survivors but a count of what came out and how much of it was worth keeping, which only
// the metrics can say. Every number here comes from a real run's per_example_metrics.csv.

const W = 760, ROW = 46, PAD = 16, LABEL = 190;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// f: { rows: [{ label, n, cls }] }
export function funnel(f) {
  if (!f || !Array.isArray(f.rows) || !f.rows.length) return '';
  const top = Math.max(...f.rows.map(r => r.n || 0)) || 1;
  const h = PAD * 2 + ROW * f.rows.length;
  const barW = W - LABEL - 110;
  let y = PAD, svg = '';
  for (const r of f.rows) {
    const w = Math.max(2, ((r.n || 0) / top) * barW);
    svg += `<text x="0" y="${y + 16}" class="fl">${esc(r.label)}</text>`;
    svg += `<rect x="${LABEL}" y="${y}" width="${w.toFixed(1)}" height="22" rx="4" class="${r.cls || 'f-kept'}"/>`;
    svg += `<text x="${LABEL + w + 8}" y="${y + 16}" class="fn">${r.n ?? 0}${r.note ? ` ${esc(r.note)}` : ''}</text>`;
    y += ROW;
  }
  const first = f.rows[0], last = f.rows[f.rows.length - 1];
  return `<svg viewBox="0 0 ${W} ${h}" class="funnel-svg" role="img" aria-label="Run counts: ${first.n} ${first.label}, ${last.n} ${last.label}">${svg}</svg>`;
}

// Build the rows for one captured run.
export function runRows(run) {
  if (!run || !run.counts) return null;
  const c = run.counts;
  const rows = [
    { label: 'designs asked for', n: c.requested, cls: 'f-in' },
    { label: 'designs written', n: c.written, cls: 'f-kept' }
  ];
  if (c.frames !== undefined) rows.push({ label: 'frames saved', n: c.frames, cls: 'f-cand', note: 'across all designs' });
  if (c.scored !== undefined) rows.push({ label: 'designs scored', n: c.scored, cls: 'f-cand' });
  if (c.passing !== undefined) rows.push({ label: 'designs over your bar', n: c.passing, cls: 'f-ok', note: run.bar || '' });
  return { rows };
}

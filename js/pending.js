// Shown on a page whose data has not been captured yet. It names what is missing, so a
// half-built site is honest about being half-built rather than looking broken.
import { Tplain, esc } from './site.js';

const NEEDS = {
  run: 'one finished run: its command, its log and its metrics table',
  trajectory: 'a run saved with generation.args.save_trajectory_every set and bb_ca_only_trajectories=false, so there are all atom frames to play',
  designs: 'the generated structures out of inference_samples/',
  metrics: 'a per_example_metrics.csv from a run with metrics_tags set',
  compare: 'one RFD4 run and one BindCraft2 campaign against the same target'
};

export function pending(page, extra = '') {
  for (const el of document.querySelectorAll('.page > section.card, .page > .work')) el.remove();
  const s = document.createElement('section');
  s.className = 'card';
  s.innerHTML = `<p class="note warn">${Tplain('common.notCapturedYet')}</p>
    <p class="small muted">This page needs ${esc(NEEDS[page] || 'a captured run')}. The scripts in <span class="mono">workflow/</span> make it.</p>
    ${extra ? `<p class="small muted">${extra}</p>` : ''}`;
  document.querySelector('.page').append(s);
}

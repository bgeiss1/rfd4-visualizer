// The 3D panel, on top of the vendored 3Dmol.js.
//
// The capture script writes trajectory frames as one multi model PDB file, because 3Dmol
// reads frames out of that reliably and its multi model mmCIF support is patchier. The
// designs themselves are kept as the CIF RFD4 wrote, and shown as CIF.

let loading = null;

export function load3Dmol() {
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/3Dmol-min.js';
    s.onload = () => (window.$3Dmol ? res(window.$3Dmol) : rej(new Error('3Dmol loaded but did not register')));
    s.onerror = () => rej(new Error('Could not load vendor/3Dmol-min.js'));
    document.head.append(s);
  });
  return loading;
}

const BG = () => (matchMedia('(prefers-color-scheme: dark)').matches ? '#16202a' : '#ffffff');

// Chain colours: the designed chain stands out, the target stays quiet.
export const CHAIN_COLOURS = { designed: '#4cc7bf', target: '#8aa0ae', motif: '#f0a648' };

export async function viewer(el) {
  const $3Dmol = await load3Dmol();
  el.innerHTML = '';
  const v = $3Dmol.createViewer(el, { backgroundColor: BG(), antialias: true });
  const api = {
    v,
    clear() { v.removeAllModels(); v.removeAllShapes(); return api; },

    // One structure, styled by which chains were designed.
    structure(data, format, { designed = [], motif = [] } = {}) {
      api.clear();
      v.addModel(data, format, { keepH: true });
      v.setStyle({}, { cartoon: { color: CHAIN_COLOURS.target, opacity: 0.9 } });
      if (designed.length) v.setStyle({ chain: designed }, { cartoon: { color: CHAIN_COLOURS.designed } });
      if (motif.length) v.setStyle({ resi: motif }, { cartoon: { color: CHAIN_COLOURS.motif }, stick: { radius: 0.18, color: CHAIN_COLOURS.motif } });
      v.zoomTo();
      v.render();
      return api;
    },

    // A multi model file as frames. Returns how many frames there are.
    frames(data, format = 'pdb', { designed = [] } = {}) {
      api.clear();
      v.addModelsAsFrames(data, format, { keepH: true });
      v.setStyle({}, { cartoon: { color: CHAIN_COLOURS.target, opacity: 0.9 } });
      if (designed.length) v.setStyle({ chain: designed }, { cartoon: { color: CHAIN_COLOURS.designed } });
      v.zoomTo();
      v.setFrame(0);
      v.render();
      return v.getNumFrames ? v.getNumFrames() : 0;
    },

    // Colour a structure by the per residue confidence in the B factor column, the way
    // the refolded structures carry it.
    byConfidence(data, format) {
      api.clear();
      v.addModel(data, format, { keepH: true });
      v.setStyle({}, { cartoon: { colorscheme: { prop: 'b', gradient: 'roygb', min: 50, max: 90 } } });
      v.zoomTo();
      v.render();
      return api;
    },

    frame(i) { v.setFrame(i); v.render(); return api; },
    resize() { v.resize(); v.render(); return api; },
    spin(on) { v.spin(on ? 'y' : false); return api; }
  };
  addEventListener('resize', () => api.resize());
  return api;
}

// The play bar under a viewer. Calls onFrame(i) as it moves.
export function player(el, count, onFrame, { label = step => `step ${step}` } = {}) {
  let i = 0, timer = null;
  el.innerHTML = `
    <button type="button" data-play aria-label="Play">Play</button>
    <input type="range" min="0" max="${Math.max(0, count - 1)}" value="0" step="1" aria-label="Frame">
    <span class="t"></span>`;
  const [btn, slider, text] = [el.querySelector('[data-play]'), el.querySelector('input'), el.querySelector('.t')];
  const show = n => {
    i = Math.max(0, Math.min(count - 1, n));
    slider.value = String(i);
    text.textContent = `${label(i)}  (${i + 1} of ${count})`;
    onFrame(i);
  };
  const stop = () => { clearInterval(timer); timer = null; btn.textContent = 'Play'; };
  btn.addEventListener('click', () => {
    if (timer) return stop();
    btn.textContent = 'Pause';
    timer = setInterval(() => { if (i >= count - 1) { stop(); return; } show(i + 1); }, 110);
  });
  slider.addEventListener('input', () => { stop(); show(Number(slider.value)); });
  show(0);
  return { show, stop };
}

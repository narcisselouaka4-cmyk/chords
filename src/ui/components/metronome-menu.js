// [Claude] — 2026-10-14 — Le bouton « ♩ Métronome » et son panneau (Pédagogie IA, sous la vidéo).
//
// Un bouton qui ouvre un petit panneau (`popover`, comme le réglage de vitesse) :
//   - Démarrer / Arrêter ;
//   - le tempo : − / +, curseur, saisie, « Tap » (on tape le rythme), ÷ 2 / × 2 (quand le tempo trouvé
//     est la moitié ou le double de celui qu'on entend) ;
//   - « Chercher dans la vidéo » : le BPM repéré dans le son du tutoriel, avec sa fiabilité ;
//   - la mesure (2, 3, 4 ou 6 temps) ;
//   - « Suivre la vidéo » : les clics tombent sur les temps du prof, seulement quand elle joue ;
//     « Le 1 est ici » place le premier temps d'une mesure à l'endroit où la vidéo est arrêtée, avec
//     un réglage fin (± 10 ms) ;
//   - le volume, et quatre voyants qui montrent le temps en cours.
// Le composant ne fait aucun son : il dit ce qui change (onChange / onToggle / onDetect), le moteur
// est src/audio/metronome.js.

import { BEATS_PER_BAR } from '../../audio/metronome.js';
import { tempoConfidenceLabel } from '../../pedagogie/tempo-estimate.js';

export const BPM_MIN = 30;
export const BPM_MAX = 240;

/** Un tempo valide : entier de 30 à 240 ; une valeur fausse donne `fallback`. */
export function clampBpm(value, fallback = 100) {
  const v = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
}

/**
 * Tempo tapé : moyenne des derniers écarts entre deux frappes (ms). Une pause de plus de 2 s
 * recommence. Moins de deux frappes : rien.
 * @param {number[]} taps - instants (ms)
 * @returns {number|null}
 */
export function bpmFromTaps(taps) {
  const list = [];
  for (const t of taps) {
    if (list.length && t - list[list.length - 1] > 2000) list.length = 0;
    list.push(t);
  }
  const recent = list.slice(-7);
  if (recent.length < 2) return null;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]);
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return avg > 0 ? clampBpm(60000 / avg, null) : null;
}

const NOTE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="17" cy="16" r="3" fill="currentColor"/></svg>';
const CHEVRON = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EDGE = 8;
const GAP = 6;
const menus = new WeakMap();

function node(tag, className, attrs = {}, text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
}

/**
 * @param {{
 *   state?: { bpm?: number, beatsPerBar?: number, follow?: boolean, volume?: number, offset?: number, running?: boolean },
 *   onChange?: (patch: object) => void,
 *   onToggle?: (running: boolean) => void,
 *   onDetect?: () => Promise<{ bpm: number, confidence: number, firstBeat: number } | null>,
 *   getVideoTime?: () => number,
 *   onOpen?: () => void,       // à l'ouverture du panneau (la recherche du tempo peut partir seule)
 *   canFollow?: boolean,
 * }} [options]
 * @returns {HTMLElement}
 */
export function createMetronomeMenu({ state = {}, onChange = () => {}, onToggle = () => {}, onDetect = null, getVideoTime = () => 0, onOpen = () => {}, canFollow = true } = {}) {
  const s = {
    bpm: clampBpm(state.bpm, 100),
    beatsPerBar: BEATS_PER_BAR.includes(state.beatsPerBar) ? state.beatsPerBar : 4,
    follow: Boolean(state.follow),
    volume: Number.isFinite(state.volume) ? state.volume : 0.7,
    offset: Number.isFinite(state.offset) ? state.offset : 0,
    running: Boolean(state.running),
    found: null,           // dernier tempo trouvé dans la vidéo
    detecting: false,
    anchored: Boolean(state.anchored),
  };

  const root = node('span', 'metronome-menu');
  const button = node('button', 'metronome-menu-btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  button.innerHTML = `${NOTE_ICON}<span class="metronome-menu-label">Métronome</span><span class="metronome-menu-value"></span>${CHEVRON}`;
  const panel = node('div', 'metronome-menu-panel', { popover: 'auto', role: 'dialog', 'aria-label': 'Métronome' });

  // — En-tête : titre + Démarrer / Arrêter —
  const startBtn = node('button', 'metronome-menu-start', { type: 'button' });
  const head = node('div', 'metronome-menu-head');
  head.append(node('span', 'metronome-menu-title', {}, 'Métronome'), startBtn);

  // — Voyants des temps —
  const dots = node('div', 'metronome-menu-dots', { 'aria-hidden': 'true' });

  // — Tempo —
  const minus = node('button', 'metronome-menu-step', { type: 'button', 'aria-label': 'Plus lent (moins 1 BPM)', title: 'Plus lent (maintenir : plus vite)' }, '−');
  const plus = node('button', 'metronome-menu-step', { type: 'button', 'aria-label': 'Plus rapide (plus 1 BPM)', title: 'Plus rapide (maintenir : plus vite)' }, '+');
  const number = node('input', 'metronome-menu-number', { type: 'number', min: String(BPM_MIN), max: String(BPM_MAX), step: '1', inputmode: 'numeric', 'aria-label': 'Tempo en battements par minute' });
  const unit = node('span', 'metronome-menu-unit', {}, 'BPM');
  const bpmRow = node('div', 'metronome-menu-bpm');
  const numberWrap = node('div', 'metronome-menu-numberwrap');
  numberWrap.append(number, unit);
  bpmRow.append(minus, numberWrap, plus);
  const range = node('input', 'metronome-menu-range', { type: 'range', min: String(BPM_MIN), max: String(BPM_MAX), step: '1', 'aria-label': 'Tempo' });
  const half = node('button', 'metronome-menu-chip', { type: 'button', title: 'Tempo divisé par deux (si le tempo trouvé est le double de ce que tu entends)' }, '÷ 2');
  const tap = node('button', 'metronome-menu-chip is-tap', { type: 'button', title: 'Tape le rythme avec ce bouton : le tempo suit' }, 'Tap');
  const dbl = node('button', 'metronome-menu-chip', { type: 'button', title: 'Tempo doublé (si le tempo trouvé est la moitié de ce que tu entends)' }, '× 2');
  const chips = node('div', 'metronome-menu-chips');
  chips.append(half, tap, dbl);

  // — Tempo de la vidéo —
  const detectBtn = node('button', 'metronome-menu-detect', { type: 'button' }, 'Chercher dans la vidéo');
  const found = node('div', 'metronome-menu-found', { 'aria-live': 'polite' });
  const detectRow = node('div', 'metronome-menu-detectrow');
  detectRow.append(detectBtn, found);

  // — Mesure —
  const bars = node('div', 'metronome-menu-bars', { role: 'group', 'aria-label': 'Temps par mesure' });
  for (const n of BEATS_PER_BAR) bars.append(node('button', 'metronome-menu-bar', { type: 'button', 'data-bar': String(n), 'aria-pressed': 'false' }, n === 6 ? '6/8' : `${n}/4`));
  const barRow = node('div', 'metronome-menu-row');
  barRow.append(node('span', 'metronome-menu-label-row', {}, 'Mesure'), bars);

  // — Suivre la vidéo —
  const followLabel = node('label', 'metronome-menu-follow');
  const follow = node('input', '', { type: 'checkbox' });
  const followText = node('span', '', {}, 'Suivre la vidéo');
  const followHint = node('small', '', {}, 'Les clics tombent sur les temps du prof, seulement quand la vidéo joue.');
  const followCol = node('span', 'metronome-menu-follow-text');
  followCol.append(followText, followHint);
  followLabel.append(follow, followCol);
  const anchor = node('button', 'metronome-menu-anchor', { type: 'button', title: 'Mets la vidéo sur un temps fort (le « 1 » d\'une mesure), puis clique ici' }, 'Le 1 est ici');
  const earlier = node('button', 'metronome-menu-nudge', { type: 'button', 'aria-label': 'Avancer les clics de 10 millisecondes', title: 'Les clics tombent trop tard : les avancer de 10 ms' }, '◀ 10 ms');
  const later = node('button', 'metronome-menu-nudge', { type: 'button', 'aria-label': 'Retarder les clics de 10 millisecondes', title: 'Les clics tombent trop tôt : les retarder de 10 ms' }, '10 ms ▶');
  const anchorRow = node('div', 'metronome-menu-anchorrow');
  anchorRow.append(earlier, anchor, later);
  const anchorHint = node('p', 'metronome-menu-hint');

  // — Volume —
  const volume = node('input', 'metronome-menu-range is-volume', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume du métronome' });
  const volRow = node('div', 'metronome-menu-row');
  volRow.append(node('span', 'metronome-menu-label-row', {}, 'Volume'), volume);

  panel.append(head, dots, bpmRow, range, chips, detectRow, barRow, followLabel, anchorRow, anchorHint, volRow);
  root.append(button, panel);

  // ---- affichage ----
  const renderDots = () => {
    dots.textContent = '';
    for (let i = 0; i < s.beatsPerBar; i += 1) dots.append(node('span', `metronome-menu-dot${i === 0 ? ' is-first' : ''}`, { 'data-i': String(i) }));
  };
  const render = () => {
    root.dataset.running = String(s.running);
    button.querySelector('.metronome-menu-value').textContent = `${s.bpm}`;
    button.title = `Métronome : ${s.bpm} BPM${s.running ? ' (en marche)' : ''}`;
    button.setAttribute('aria-label', button.title);
    startBtn.textContent = s.running ? '■ Arrêter' : '▶ Démarrer';
    startBtn.setAttribute('aria-pressed', String(s.running));
    startBtn.classList.toggle('is-on', s.running);
    if (document.activeElement !== number) number.value = String(s.bpm);
    if (Number(range.value) !== s.bpm) range.value = String(s.bpm);
    range.setAttribute('aria-valuetext', `${s.bpm} BPM`);
    minus.setAttribute('aria-disabled', String(s.bpm <= BPM_MIN));
    plus.setAttribute('aria-disabled', String(s.bpm >= BPM_MAX));
    half.setAttribute('aria-disabled', String(s.bpm / 2 < BPM_MIN));
    dbl.setAttribute('aria-disabled', String(s.bpm * 2 > BPM_MAX));
    for (const b of bars.children) b.setAttribute('aria-pressed', String(Number(b.dataset.bar) === s.beatsPerBar));
    if (dots.children.length !== s.beatsPerBar) renderDots();
    follow.checked = s.follow;
    follow.disabled = !canFollow;
    anchorRow.hidden = !s.follow;
    anchorHint.hidden = !s.follow;
    anchorHint.textContent = s.anchored
      ? `Le 1 est placé à ${s.offset.toFixed(2).replace('.', ',')} s. Écoute : si les clics tombent à côté, ajuste de 10 ms, ou replace-le.`
      : 'Mets la vidéo sur un temps fort (le « 1 » d\'une mesure), puis clique « Le 1 est ici ».';
    volume.value = String(s.volume);
    detectBtn.disabled = s.detecting || !onDetect;
    detectBtn.textContent = s.detecting ? 'Écoute de la vidéo…' : 'Chercher dans la vidéo';
    found.hidden = !s.found;
    found.textContent = '';
    if (s.found) {
      const label = tempoConfidenceLabel(s.found.confidence);
      found.append(
        node('span', `metronome-menu-found-text is-${label === 'sûr' ? 'sure' : label === 'probable' ? 'likely' : 'unsure'}`, {}, `${Math.round(s.found.bpm)} BPM · ${label}`),
      );
      if (Math.round(s.found.bpm) !== s.bpm) {
        const use = node('button', 'metronome-menu-use', { type: 'button' }, 'Utiliser');
        use.addEventListener('click', () => set({ bpm: Math.round(s.found.bpm), ...(Number.isFinite(s.found.firstBeat) ? { offset: s.found.firstBeat, anchored: false } : {}) }));
        found.append(use);
      }
    }
  };
  const set = (patch, { silent = false } = {}) => {
    if ('bpm' in patch) patch.bpm = clampBpm(patch.bpm, s.bpm);
    Object.assign(s, patch);
    render();
    if (!silent) onChange({ ...patch });
  };

  // ---- interactions ----
  startBtn.addEventListener('click', () => { s.running = !s.running; render(); onToggle(s.running); });
  // − / + : un clic = 1 BPM ; maintenu, ça accélère.
  const hold = (btn, delta) => {
    let timer = null;
    let delay = 380;
    const step = () => { set({ bpm: s.bpm + delta }); delay = Math.max(40, delay * 0.8); timer = setTimeout(step, delay); };
    const stop = () => { clearTimeout(timer); timer = null; delay = 380; };
    btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; step(); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) btn.addEventListener(ev, stop);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set({ bpm: s.bpm + delta }); } });
  };
  hold(minus, -1);
  hold(plus, 1);
  range.addEventListener('input', () => set({ bpm: Number(range.value) }));
  number.addEventListener('change', () => set({ bpm: number.value }));
  number.addEventListener('keydown', (e) => { if (e.key === 'Enter') { set({ bpm: number.value }); number.blur(); } });
  half.addEventListener('click', () => set({ bpm: Math.round(s.bpm / 2) }));
  dbl.addEventListener('click', () => set({ bpm: s.bpm * 2 }));
  const taps = [];
  tap.addEventListener('click', () => {
    taps.push(performance.now());
    if (taps.length > 12) taps.shift();
    const v = bpmFromTaps(taps);
    if (v) set({ bpm: v });
  });
  bars.addEventListener('click', (e) => {
    const b = e.target.closest('.metronome-menu-bar');
    if (b) set({ beatsPerBar: Number(b.dataset.bar) });
  });
  follow.addEventListener('change', () => set({ follow: follow.checked }));
  anchor.addEventListener('click', () => set({ offset: Math.max(0, Number(getVideoTime()) || 0), anchored: true }));
  earlier.addEventListener('click', () => set({ offset: s.offset - 0.01, anchored: true }));
  later.addEventListener('click', () => set({ offset: s.offset + 0.01, anchored: true }));
  volume.addEventListener('input', () => set({ volume: Number(volume.value) }));
  detectBtn.addEventListener('click', async () => {
    if (!onDetect || s.detecting) return;
    set({ detecting: true }, { silent: true });
    let result = null;
    try { result = await onDetect(); } catch { result = null; }
    s.detecting = false;
    if (!result || !Number.isFinite(result.bpm)) {
      s.found = null;
      render();
      found.hidden = false;
      found.textContent = 'Pas de pulsation nette dans le son : tape le rythme (Tap) ou règle le tempo à l\'oreille.';
      return;
    }
    s.found = result;
    // Un tempo trouvé avec confiance est appliqué tout de suite ; sinon proposé (« Utiliser »).
    if (result.confidence >= 0.3) set({ bpm: Math.round(result.bpm), ...(Number.isFinite(result.firstBeat) ? { offset: result.firstBeat, anchored: false } : {}) });
    else render();
  });

  // ---- placement du panneau (comme speed-menu) ----
  const place = () => {
    const r = button.getBoundingClientRect();
    const w = panel.offsetWidth || 300;
    const h = panel.offsetHeight || 380;
    const left = Math.max(EDGE, Math.min(r.right - w, window.innerWidth - w - EDGE));
    const below = r.bottom + GAP + h <= window.innerHeight - EDGE || r.top - GAP - h < EDGE;
    const top = below ? Math.min(r.bottom + GAP, window.innerHeight - h - EDGE) : r.top - GAP - h;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(EDGE, top))}px`;
  };
  const onResize = () => place();
  const opened = (open) => {
    button.setAttribute('aria-expanded', String(open));
    if (open) { place(); window.addEventListener('resize', onResize); startBtn.focus({ preventScroll: true }); onOpen(); } else window.removeEventListener('resize', onResize);
  };
  if (typeof panel.showPopover === 'function') {
    button.popoverTargetElement = panel;
    panel.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') place(); });
    panel.addEventListener('toggle', (e) => opened(e.newState === 'open'));
  } else {
    panel.hidden = true;
    button.addEventListener('click', () => { panel.hidden = !panel.hidden; opened(!panel.hidden); });
  }
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    try { panel.hidePopover?.(); } catch { /* déjà fermé */ }
    button.focus();
  });

  menus.set(root, {
    set: (patch) => set(patch, { silent: true }),
    beat: (i) => {
      for (const d of dots.children) d.classList.toggle('is-on', Number(d.dataset.i) === i);
      clearTimeout(menus.get(root).timer);
      menus.get(root).timer = setTimeout(() => { for (const d of dots.children) d.classList.remove('is-on'); }, 110);
    },
    found: (f) => { s.found = f; render(); },
    detect: () => detectBtn.click(),
    timer: null,
  });
  render();
  return root;
}

/** Met l'affichage à jour (sans appeler onChange) : un autre tuto, un tempo retrouvé, la vidéo qui s'arrête… */
export function setMetronomeMenuState(root, patch) {
  menus.get(root)?.set(patch);
}

/** Allume le voyant du temps en cours. */
export function flashMetronomeBeat(root, beatInBar) {
  menus.get(root)?.beat(beatInBar);
}

/** Montre (ou efface, avec null) le tempo trouvé dans la vidéo. */
export function setMetronomeFound(root, found) {
  menus.get(root)?.found(found);
}

/** Lance la recherche du tempo dans la vidéo, comme un clic sur « Chercher dans la vidéo ». */
export function triggerMetronomeDetect(root) {
  menus.get(root)?.detect();
}

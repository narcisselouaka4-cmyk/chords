// [Claude] — 2026-10-14 — La barre du passage, sous la vidéo de Pédagogie IA.
//
// Narcisse : « au niveau des passages, ce n'est pas clair ni assez intuitif. On ne comprend pas
// tout de suite que définir un passage va servir à Copilot pour repérer la section souhaitée.
// Plutôt que d'expliquer en petit texte gris […], le mieux serait de faire un système de régions,
// un peu comme dans Studio. L'utilisateur choisit son passage avec une petite animation pour que
// ce soit évident ».
//
// Une barre de la durée de la vidéo :
//   - les ÉTAPES du tuto y sont dessinées (tutorial-guide.js : main gauche seule, main droite
//     seule, tout ensemble, il explique) : on voit d'un coup d'œil comment le tuto est construit ;
//   - glisser sur la barre trace une RÉGION, comme dans le Studio ; ses poignées la règlent, on
//     la déplace en la tirant ; un double-clic sur une étape en fait la région ;
//   - un simple clic place la vidéo ; la tête de lecture avance avec elle ;
//   - sans région, le Copilote regarde les 30 dernières secondes : un reflet suit la tête.
//
// Composant DOM sans dépendance : createPassageTimeline(options) rend { root, update, flash }.

const MIN_SECONDS = 1;
const DRAG_THRESHOLD = 4; // px avant qu'un appui devienne un glisser

const clock = (t) => {
  const s = Math.max(0, Math.floor((Number(t) || 0) + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function node(tag, className, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  return el;
}

/** Les mots d'une étape, pour l'infobulle et les lecteurs d'écran. */
const KIND_WORDS = {
  both: 'les deux mains',
  lh: 'main gauche seule',
  rh: 'main droite seule',
  line: 'la ligne du dessus',
  talk: 'il explique',
  chord: 'accord entendu',
};

/**
 * @param {object} options
 * @param {(t: number) => void} options.onSeek - un clic sur la barre
 * @param {(range: {start: number, end: number}|null, how: 'drag'|'step'|'keys') => void} options.onRegion - région tracée / réglée / effacée
 * @param {number} [options.maxSeconds] - longueur maximale d'une région (600 s par défaut)
 * @param {number} [options.followSeconds] - longueur du reflet qui suit la vidéo (30 s)
 */
export function createPassageTimeline({ onSeek = () => {}, onRegion = () => {}, maxSeconds = 600, followSeconds = 30 } = {}) {
  const root = node('div', 'passage-timeline', { role: 'group', 'aria-label': 'Le passage du Copilote' });
  const track = node('div', 'passage-timeline-track');
  const steps = node('div', 'passage-timeline-steps', { 'aria-hidden': 'true' });
  const follow = node('div', 'passage-timeline-follow', { 'aria-hidden': 'true' });
  const region = node('div', 'passage-timeline-region');
  const regionLabel = node('span', 'passage-timeline-region-label', { 'aria-hidden': 'true' });
  const handleStart = node('button', 'passage-timeline-handle is-start', { type: 'button', 'aria-label': 'Début du passage (flèches : une seconde, Maj : cinq)' });
  const handleEnd = node('button', 'passage-timeline-handle is-end', { type: 'button', 'aria-label': 'Fin du passage (flèches : une seconde, Maj : cinq)' });
  const playhead = node('div', 'passage-timeline-playhead', { 'aria-hidden': 'true' });
  const ghost = node('div', 'passage-timeline-ghost', { 'aria-hidden': 'true' });
  region.append(regionLabel, handleStart, handleEnd);
  track.append(steps, follow, region, ghost, playhead);
  const scale = node('div', 'passage-timeline-scale', { 'aria-hidden': 'true' });
  const scaleStart = node('span', '', { text: '0:00' });
  const scaleEnd = node('span', '', { text: '0:00' });
  scale.append(scaleStart, scaleEnd);
  root.append(track, scale);

  const state = { duration: 0, now: 0, range: null, steps: [], stepsKey: '' };
  const pct = (t) => (state.duration > 0 ? Math.max(0, Math.min(100, (t / state.duration) * 100)) : 0);
  const timeAt = (clientX) => {
    const r = track.getBoundingClientRect();
    if (!(r.width > 0) || !(state.duration > 0)) return 0;
    return Math.max(0, Math.min(state.duration, ((clientX - r.left) / r.width) * state.duration));
  };
  const clampRange = (start, end, fixed = 'start') => {
    let s = Math.max(0, Math.min(start, state.duration));
    let e = Math.max(0, Math.min(end, state.duration));
    if (e < s) [s, e] = [e, s];
    if (e - s < MIN_SECONDS) {
      if (fixed === 'start') e = Math.min(state.duration, s + MIN_SECONDS);
      else s = Math.max(0, e - MIN_SECONDS);
    }
    if (e - s > maxSeconds) {
      if (fixed === 'start') e = s + maxSeconds;
      else s = e - maxSeconds;
    }
    return { start: Math.round(s * 10) / 10, end: Math.round(e * 10) / 10 };
  };

  function paintRegion() {
    const r = state.range;
    region.hidden = !r;
    root.classList.toggle('has-region', Boolean(r));
    if (r) {
      region.style.left = `${pct(r.start)}%`;
      region.style.width = `${Math.max(0.4, pct(r.end) - pct(r.start))}%`;
      regionLabel.textContent = `${clock(r.start)} → ${clock(r.end)}`;
      // Près d'un bord, l'étiquette se cale sur la région au lieu de déborder.
      const middle = (pct(r.start) + pct(r.end)) / 2;
      region.classList.toggle('is-near-start', middle < 8);
      region.classList.toggle('is-near-end', middle > 92);
      handleStart.setAttribute('aria-valuetext', clock(r.start));
      handleEnd.setAttribute('aria-valuetext', clock(r.end));
    }
    // Sans région : le reflet des 30 dernières secondes suit la tête de lecture.
    follow.hidden = Boolean(r) || !(state.duration > 0);
    if (!r && state.duration > 0) {
      const end = Math.max(state.now, Math.min(followSeconds, state.duration));
      const start = Math.max(0, end - followSeconds);
      follow.style.left = `${pct(start)}%`;
      follow.style.width = `${pct(end) - pct(start)}%`;
    }
  }

  function paintSteps() {
    const key = `${state.duration}|${state.steps.map((s) => `${s.id}:${s.start}-${s.end}:${s.label || ''}`).join(',')}`;
    if (key === state.stepsKey) return;
    state.stepsKey = key;
    steps.textContent = '';
    if (!(state.duration > 0)) return;
    state.steps.forEach((s, i) => {
      const block = node('div', `passage-timeline-step is-${s.kind}${s.complete ? ' is-complete' : ''}${s.label ? ' has-label' : ''}${i % 2 ? ' is-alt' : ''}`, {
        title: `${clock(s.start)} → ${clock(s.end)} · ${s.title || KIND_WORDS[s.kind] || ''}${'\n'}Double-clic : en faire le passage du Copilote`,
        'data-step': s.id,
      });
      block.style.left = `${pct(s.start)}%`;
      block.style.width = `${Math.max(0.3, pct(s.end) - pct(s.start))}%`;
      block.style.setProperty('--i', String(i));
      // Les chapitres d'un tuto (guide-chapters.js) : leur titre est écrit dans la barre, comme sur YouTube.
      if (s.label) {
        block.appendChild(node('span', 'passage-timeline-step-label', { text: s.label }));
        // Segment étroit : le numéro du chapitre à la place du titre (le titre entier reste en infobulle).
        block.appendChild(node('span', 'passage-timeline-step-index', { text: String(i + 1), 'aria-hidden': 'true' }));
      }
      steps.appendChild(block);
    });
    steps.classList.remove('is-entering');
    // L'entrée des étapes, l'une après l'autre (relancée à chaque nouveau guide).
    void steps.offsetWidth;
    steps.classList.add('is-entering');
  }

  function paintNow() {
    playhead.style.left = `${pct(state.now)}%`;
    for (const block of steps.children) {
      const s = state.steps.find((x) => x.id === block.dataset.step);
      block.classList.toggle('is-current', Boolean(s) && state.now >= s.start && state.now < s.end);
    }
  }

  /** Un éclat sur la région : elle vient d'être posée (ou choisie dans le guide). */
  function flash() {
    region.classList.remove('is-new');
    void region.offsetWidth;
    region.classList.add('is-new');
  }

  // ── Glisser ────────────────────────────────────────────────────────────────
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !(state.duration > 0)) return;
    const onHandle = e.target === handleStart ? 'start' : e.target === handleEnd ? 'end' : null;
    const inside = !onHandle && state.range && region.contains(e.target);
    const t = timeAt(e.clientX);
    drag = {
      id: e.pointerId,
      x: e.clientX,
      t0: t,
      mode: onHandle ? `edge-${onHandle}` : inside ? 'move' : 'new',
      origin: state.range ? { ...state.range } : null,
      moved: false,
    };
    try { track.setPointerCapture(e.pointerId); } catch (_) { /* pointeur relâché */ }
    if (onHandle) e.preventDefault();
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) {
      // Le survol : un repère fin là où un clic placerait la vidéo.
      if (state.duration > 0 && !drag) {
        ghost.hidden = false;
        ghost.style.left = `${pct(timeAt(e.clientX))}%`;
      }
      return;
    }
    if (!drag.moved && Math.abs(e.clientX - drag.x) < DRAG_THRESHOLD) return;
    drag.moved = true;
    root.classList.add('is-dragging');
    const t = timeAt(e.clientX);
    if (drag.mode === 'new') state.range = clampRange(Math.min(drag.t0, t), Math.max(drag.t0, t), t >= drag.t0 ? 'start' : 'end');
    else if (drag.mode === 'edge-start') state.range = clampRange(t, drag.origin.end, 'end');
    else if (drag.mode === 'edge-end') state.range = clampRange(drag.origin.start, t, 'start');
    else if (drag.mode === 'move') {
      const len = drag.origin.end - drag.origin.start;
      let s = drag.origin.start + (t - drag.t0);
      s = Math.max(0, Math.min(state.duration - len, s));
      state.range = { start: Math.round(s * 10) / 10, end: Math.round((s + len) * 10) / 10 };
    }
    paintRegion();
  });
  const finish = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    root.classList.remove('is-dragging');
    if (!d.moved) {
      // Un clic : la vidéo va là (une poignée cliquée ne bouge rien).
      if (!d.mode.startsWith('edge')) onSeek(timeAt(e.clientX));
      return;
    }
    if (d.mode === 'new') flash();
    onRegion(state.range ? { ...state.range } : null, 'drag');
  };
  track.addEventListener('pointerup', finish);
  track.addEventListener('pointercancel', finish);
  track.addEventListener('pointerleave', () => { ghost.hidden = true; });
  ghost.hidden = true;

  // Double-clic sur une étape : elle devient le passage.
  track.addEventListener('dblclick', (e) => {
    const t = timeAt(e.clientX);
    const s = state.steps.find((x) => t >= x.start && t < x.end);
    if (!s) return;
    state.range = clampRange(s.start, s.end);
    paintRegion();
    flash();
    onRegion({ ...state.range }, 'step');
  });

  // Les poignées au clavier : une seconde (Maj : cinq).
  for (const [handle, edge] of [[handleStart, 'start'], [handleEnd, 'end']]) {
    handle.addEventListener('keydown', (e) => {
      if (!state.range || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const step = (e.shiftKey ? 5 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      state.range = edge === 'start'
        ? clampRange(state.range.start + step, state.range.end, 'end')
        : clampRange(state.range.start, state.range.end + step, 'start');
      paintRegion();
      onRegion({ ...state.range }, 'keys');
    });
  }

  /**
   * @param {{duration?: number, now?: number, range?: {start: number, end: number}|null, steps?: object[]}} next
   */
  function update(next = {}) {
    if (Number.isFinite(next.duration) && next.duration !== state.duration) {
      state.duration = next.duration;
      scaleEnd.textContent = clock(next.duration);
    }
    if ('range' in next && !drag) state.range = next.range ? { ...next.range } : null;
    if (Array.isArray(next.steps)) state.steps = next.steps;
    if (Number.isFinite(next.now)) state.now = next.now;
    paintSteps();
    paintRegion();
    paintNow();
  }

  return { root, update, flash };
}

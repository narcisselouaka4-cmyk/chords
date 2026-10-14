// [Claude] — 2026-10-13 — La roue des morceaux importés (Studio, étape 0).
//
// Narcisse : « lors du clic sur « Reprendre un morceau importé », une animation spéciale d'ouverture
// et de déploiement, différente de celle de la liste quand un fichier est déjà importé : les musiques
// en demi-cercle, comme une roue, qu'on fait glisser jusqu'au titre voulu. Une barre de recherche sur
// le côté pour ne pas faire tourner la roue trop longtemps. »
//
// Les morceaux sont posés sur un demi-cercle dont le centre est au bord gauche : celui qui est au
// milieu (3 h) est le morceau choisi. On fait tourner la roue en la faisant glisser (souris, doigt),
// à la molette, aux flèches ↑ ↓, ou en cliquant un morceau ; un clic sur le morceau du milieu (ou
// Entrée, ou « Ouvrir ») le charge. À l'ouverture, les morceaux sortent tous du milieu et se
// déploient en éventail, l'un après l'autre.
//
// Partie pure (testée sous Node, test-track-wheel.js) : la géométrie de la roue et l'inertie.
// Partie DOM : createTrackWheel({ root, … }).

import { matchesQuery } from './list-search.js';

/** Écart angulaire entre deux morceaux voisins, en degrés. */
export const WHEEL_STEP_DEG = 15;
/** Au-delà de cet angle (par rapport au milieu), un morceau n'est plus affiché. */
export const WHEEL_MAX_DEG = 88;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Position fractionnaire de la roue, ramenée dans [0, count - 1]. */
export function clampOffset(offset, count) {
  if (!(count > 0)) return 0;
  return clamp(Number(offset) || 0, 0, count - 1);
}

/** Morceau le plus proche d'une position fractionnaire. */
export function snapOffset(offset, count) {
  return clampOffset(Math.round(clampOffset(offset, count)), count);
}

/**
 * Position de la roue pendant un glissé vertical : glisser vers le haut fait monter les morceaux
 * (donc avancer dans la liste). `arc` = longueur d'arc, en px, entre deux morceaux voisins.
 * Au-delà des extrémités, la roue résiste (on s'éloigne à peine) : on sent la fin de la liste.
 */
export function dragToOffset(startOffset, dy, arc, count) {
  const raw = startOffset - dy / Math.max(1, arc);
  const max = Math.max(0, count - 1);
  if (raw < 0) return -Math.min(0.6, Math.abs(raw) * 0.25);
  if (raw > max) return max + Math.min(0.6, (raw - max) * 0.25);
  return raw;
}

/** Où la roue s'arrête après un lâcher, selon sa vitesse (morceaux par seconde). */
export function settleOffset(offset, velocity, count) {
  return snapOffset((Number(offset) || 0) + (Number(velocity) || 0) * 0.18, count);
}

/** 0 → 1, avec un léger dépassement (le déploiement « claque » un peu en arrivant). */
export function easeOutBack(t) {
  const x = clamp(t, 0, 1);
  const c1 = 1.25; const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/**
 * Avancement du déploiement d'un morceau (0 = encore au milieu, 1 = à sa place).
 * Les morceaux proches du morceau choisi partent les premiers.
 * @param {number} t temps écoulé depuis l'ouverture (ms)
 * @param {number} distance écart (en morceaux) au morceau choisi
 */
export function unfoldProgress(t, distance, { duration = 620, stagger = 38, maxDelay = 360 } = {}) {
  const delay = Math.min(maxDelay, Math.abs(distance) * stagger);
  return clamp((t - delay) / duration, 0, 1);
}

/**
 * Pose d'un morceau sur la roue.
 * @param {number} index rang du morceau
 * @param {number} offset position (fractionnaire) de la roue
 * @param {{ radius: number, step?: number, spread?: number }} wheel
 *   spread : 0 (tous au milieu) → 1 (déployés) ; peut dépasser 1 un instant (effet de ressort).
 * @returns {{ angle: number, x: number, y: number, scale: number, opacity: number, visible: boolean }}
 */
export function itemPose(index, offset, { radius, step = WHEEL_STEP_DEG, spread = 1 }) {
  const angle = (index - offset) * step * spread;
  const a = Math.abs(angle);
  const rad = (angle * Math.PI) / 180;
  const fade = clamp(1 - (a / WHEEL_MAX_DEG) ** 2.2, 0, 1);
  const visible = a < WHEEL_MAX_DEG;
  return {
    angle,
    x: radius * Math.cos(rad),
    y: radius * Math.sin(rad),
    scale: 1 - 0.3 * clamp(a / 75, 0, 1),
    opacity: visible ? fade * clamp(spread * 1.4, 0, 1) : 0,
    visible,
  };
}

// ---------------------------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------------------------

const SVG = {
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  rename: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

function node(tag, className, attrs = {}, html = null) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (html != null) el.innerHTML = html;
  return el;
}

/**
 * @param {{ root: HTMLElement,
 *           onOpen: (id: string) => void,
 *           onRename?: (id: string, title: string) => void,
 *           onDelete?: (id: string, title: string) => void,
 *           onClose?: () => void }} options
 * @returns {{ open: (items: Array<{id: string, title: string, meta?: string}>) => void,
 *             close: (options?: {immediate?: boolean}) => void,
 *             setItems: (items: Array<{id: string, title: string, meta?: string}>) => void,
 *             isOpen: () => boolean } | null}
 */
export function createTrackWheel({ root, onOpen, onRename, onDelete, onClose }) {
  if (!root || typeof document === 'undefined') return null;
  root.textContent = '';
  root.classList.add('track-wheel');

  // ---- structure ----
  const dial = node('div', 'track-wheel-dial', { role: 'listbox', 'aria-label': 'Morceaux importés', tabindex: '0' });
  const disc = node('div', 'track-wheel-disc', { 'aria-hidden': 'true' });
  const ticks = node('div', 'track-wheel-ticks', { 'aria-hidden': 'true' });
  const marker = node('div', 'track-wheel-marker', { 'aria-hidden': 'true' });
  const itemsLayer = node('div', 'track-wheel-items');
  dial.append(disc, ticks, itemsLayer, marker);

  const side = node('div', 'track-wheel-side');
  const backBtn = node('button', 'track-wheel-back', { type: 'button' }, `${SVG.back}<span>Retour</span>`);
  const eyebrow = node('span', 'track-wheel-eyebrow', {}, 'Votre bibliothèque');
  const heading = node('h2', 'track-wheel-title', {}, 'Reprendre un morceau');
  const searchWrap = node('label', 'track-wheel-search');
  searchWrap.innerHTML = SVG.search;
  const search = node('input', '', { type: 'search', placeholder: 'Rechercher un morceau…', 'aria-label': 'Rechercher un morceau', autocomplete: 'off', spellcheck: 'false' });
  searchWrap.appendChild(search);
  const count = node('p', 'track-wheel-count', { 'aria-live': 'polite' });
  const card = node('div', 'track-wheel-card');
  const cardTitle = node('div', 'track-wheel-card-title');
  const cardMeta = node('div', 'track-wheel-card-meta');
  const cardActions = node('div', 'track-wheel-card-actions');
  const openBtn = node('button', 'track-wheel-open', { type: 'button' }, `${SVG.play}<span>Ouvrir</span>`);
  const renameBtn = node('button', 'track-wheel-icon-btn', { type: 'button', title: 'Renommer', 'aria-label': 'Renommer ce morceau' }, SVG.rename);
  const deleteBtn = node('button', 'track-wheel-icon-btn is-danger', { type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer ce morceau' }, SVG.trash);
  cardActions.append(openBtn, renameBtn, deleteBtn);
  card.append(cardTitle, cardMeta, cardActions);
  const hint = node('p', 'track-wheel-hint', {}, 'Faites glisser la roue, ou utilisez la molette et les flèches ↑ ↓.');
  side.append(backBtn, eyebrow, heading, searchWrap, count, card, hint);
  root.append(dial, side);

  // ---- état ----
  let all = [];
  let shown = [];
  let offset = 0;          // position fractionnaire de la roue
  let target = 0;          // position visée (entier)
  let spread = 0;          // avancement du déploiement (pour tous : voir `openedAt`)
  let openedAt = 0;        // instant d'ouverture (ms), 0 si le déploiement est fini
  let closing = false;
  let opened = false;
  let raf = 0;
  let lastFrame = 0;
  let radius = 300;
  let dragging = null;
  let wheelAcc = 0;
  let nodes = [];          // un élément par morceau affiché
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const arc = () => radius * (WHEEL_STEP_DEG * Math.PI) / 180;
  const current = () => shown[snapOffset(offset, shown.length)] || null;

  function measure() {
    const h = dial.clientHeight || 520;
    radius = clamp(h * 0.34, 140, 270);   // [2026-10-14] cercle resserré (Narcisse : « rétrécis-le un peu plus »)
    root.style.setProperty('--wheel-r', `${radius}px`);
  }

  let cardShown = null;
  function renderCard() {
    const item = shown[snapOffset(target, shown.length)] || null;
    if (item === cardShown) return;
    cardShown = item;
    card.hidden = !item;
    if (item) {
      cardTitle.textContent = item.title;
      cardMeta.textContent = item.meta || '';
      cardMeta.hidden = !item.meta;
    }
  }

  function buildItems() {
    itemsLayer.textContent = '';
    nodes = shown.map((item, i) => {
      const el = node('div', 'track-wheel-item', { role: 'option', id: `track-wheel-opt-${i}`, 'data-index': String(i) });
      const t = node('span', 'track-wheel-item-title'); t.textContent = item.title;
      el.append(t);
      if (item.meta) { const m = node('span', 'track-wheel-item-meta'); m.textContent = item.meta; el.append(m); }
      itemsLayer.appendChild(el);
      return el;
    });
    const q = search.value.trim();
    count.textContent = !all.length
      ? 'Aucun morceau importé pour le moment.'
      : q
        ? (shown.length ? `${shown.length} résultat${shown.length > 1 ? 's' : ''} sur ${all.length}` : `Aucun résultat pour « ${q} ».`)
        : `${all.length} morceau${all.length > 1 ? 'x' : ''}`;
    root.classList.toggle('is-empty', !shown.length);
    cardShown = null;
    renderCard();
  }

  function paint(t = 0) {
    const sel = snapOffset(offset, shown.length);
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const k = openedAt ? unfoldProgress(t - openedAt, i - target) : 1;
      const sp = closing ? spread : (openedAt ? easeOutBack(k) : 1);
      const p = itemPose(i, offset, { radius, spread: sp });
      el.style.opacity = p.visible ? String(p.opacity) : '0';
      el.style.visibility = p.visible ? 'visible' : 'hidden';
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translateY(-50%) scale(${p.scale.toFixed(3)})`;
      el.style.zIndex = String(100 - Math.round(Math.abs(p.angle)));
      const isSel = i === sel;
      if (el.classList.contains('is-selected') !== isSel) {
        el.classList.toggle('is-selected', isSel);
        el.setAttribute('aria-selected', String(isSel));
        if (isSel) dial.setAttribute('aria-activedescendant', el.id);
      }
    }
    // Les graduations tournent avec la roue.
    ticks.style.transform = `rotate(${(-offset * WHEEL_STEP_DEG).toFixed(2)}deg)`;
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    let busy = false;
    if (!dragging) {
      const diff = target - offset;
      if (Math.abs(diff) > 0.002) {
        offset += diff * (1 - Math.exp(-dt * 13));
        busy = true;
      } else if (offset !== target) { offset = target; }
    } else busy = true;
    if (openedAt) {
      const longest = (nodes.length ? Math.min(360, nodes.length * 38) : 0) + 620;
      if (now - openedAt < longest + 80) busy = true; else openedAt = 0;
    }
    if (closing) {
      spread = Math.max(0, spread - dt / 0.32);
      busy = true;
      if (spread <= 0) { finishClose(); return; }
    }
    paint(now);
    renderCard();
    if (busy) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(tick); }

  // ---- ouverture / fermeture ----
  function applyFilter({ keep = false } = {}) {
    const q = search.value;
    const prevId = keep ? current()?.id : null;
    shown = all.filter((it) => matchesQuery(`${it.title} ${it.meta || ''}`, q));
    const idx = prevId != null ? shown.findIndex((it) => it.id === prevId) : -1;
    target = idx >= 0 ? idx : 0;
    offset = clampOffset(offset, shown.length);   // la roue glisse vers le premier résultat
    buildItems();
    paint(performance.now());
    schedule();
  }

  function open(items) {
    all = items.slice();
    search.value = '';
    closing = false;
    opened = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.classList.remove('is-open');
    measure();
    shown = all.slice();
    target = 0; offset = 0;
    buildItems();
    const instant = reduceMotion();
    openedAt = instant ? 0 : performance.now();
    spread = 1;
    paint(performance.now());
    // Le disque et le côté s'ouvrent par transition CSS, au prochain affichage.
    requestAnimationFrame(() => { requestAnimationFrame(() => root.classList.add('is-open')); });
    schedule();
    setTimeout(() => (all.length ? dial : search).focus({ preventScroll: true }), instant ? 0 : 120);
  }

  function finishClose() {
    closing = false; opened = false; openedAt = 0;
    root.classList.remove('is-open');
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    paint(performance.now());
  }

  function close({ immediate = false } = {}) {
    if (!opened) return;
    if (immediate || reduceMotion()) {
      cancelAnimationFrame(raf); raf = 0;
      finishClose();
      return;
    }
    closing = true;
    spread = 1;
    root.classList.remove('is-open');
    schedule();
  }

  function setItems(items) {
    all = items.slice();
    if (!opened) return;
    applyFilter({ keep: true });
  }

  // ---- interactions ----
  function goTo(index) {
    if (!shown.length) return;
    target = clampOffset(index, shown.length);
    schedule();
  }
  const step = (d) => goTo(snapOffset(target, shown.length) + d);

  function activate(index) {
    const item = shown[index];
    if (item) onOpen?.(item.id);
  }

  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !shown.length) return;
    dial.setPointerCapture?.(e.pointerId);
    dragging = { y0: e.clientY, startOffset: offset, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0, id: e.pointerId, downTarget: e.target };
    dial.classList.add('is-dragging');
  });
  dial.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dy = e.clientY - dragging.y0;
    if (Math.abs(dy) > 5) dragging.moved = true;
    if (!dragging.moved) return;
    offset = dragToOffset(dragging.startOffset, dy, arc(), shown.length);
    const dt = Math.max(1, e.timeStamp - dragging.lastT);
    const inst = -((e.clientY - dragging.lastY) / arc()) / (dt / 1000);   // morceaux / seconde
    dragging.v = dragging.v * 0.6 + inst * 0.4;
    dragging.lastY = e.clientY; dragging.lastT = e.timeStamp;
    schedule();
  });
  const endDrag = (e) => {
    if (!dragging || (e && e.pointerId !== dragging.id)) return;
    const d = dragging; dragging = null;
    dial.classList.remove('is-dragging');
    try { dial.releasePointerCapture?.(d.id); } catch { /* déjà relâché */ }
    if (!d.moved) {
      const el = d.downTarget?.closest?.('.track-wheel-item');
      if (el) {
        const i = Number(el.dataset.index);
        if (i === snapOffset(target, shown.length)) activate(i); else goTo(i);
      }
      return;
    }
    goTo(settleOffset(offset, d.v, shown.length));
  };
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);

  dial.addEventListener('wheel', (e) => {
    if (!shown.length) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) >= 40) { step(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; }
  }, { passive: false });

  const onKeys = (e) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (k === 'PageDown') { e.preventDefault(); step(5); }
    else if (k === 'PageUp') { e.preventDefault(); step(-5); }
    else if (k === 'Home' && e.target === dial) { e.preventDefault(); goTo(0); }
    else if (k === 'End' && e.target === dial) { e.preventDefault(); goTo(shown.length - 1); }
    else if (k === 'Enter') {
      if (e.target === backBtn || e.target === renameBtn || e.target === deleteBtn) return;
      e.preventDefault(); activate(snapOffset(target, shown.length));
    }
  };
  dial.addEventListener('keydown', onKeys);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; applyFilter(); return; }
    if (e.key === 'Home' || e.key === 'End' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') return; // édition du texte
    onKeys(e);
  });
  search.addEventListener('input', () => applyFilter());

  openBtn.addEventListener('click', () => activate(snapOffset(target, shown.length)));
  renameBtn.addEventListener('click', () => { const it = shown[snapOffset(target, shown.length)]; if (it) onRename?.(it.id, it.title); });
  deleteBtn.addEventListener('click', () => { const it = shown[snapOffset(target, shown.length)]; if (it) onDelete?.(it.id, it.title); });
  backBtn.addEventListener('click', () => { close(); onClose?.(); });

  window.addEventListener('resize', () => { if (opened) { measure(); paint(performance.now()); } });

  return { open, close, setItems, isOpen: () => opened && !closing };
}

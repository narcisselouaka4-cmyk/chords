// [Claude] — 2026-10-04 — Le réglage de vitesse commun : les exemples du Copilote et la vidéo
// d'un tuto (Pédagogie IA).
//
// Narcisse : « modifier manuellement la vitesse de copilote quand il veut faire une
// démonstration… là ce sont des vitesses qui nous sont imposées en ×1, ×0,75 ou 0,5. Moi je veux
// vouloir imposer une vitesse, mais avec une plus large plage de choix. »
//
// Un bouton « 0,75× ▾ » ouvre un petit panneau : les vitesses courantes, un curseur fin de
// 0,25× à 2× (par pas de 0,05), et − / +. Le panneau est un `popover` : posé au-dessus de tout,
// il n'est jamais coupé par le défilement de la conversation ; un clic dehors ou Échap le ferme.
// Il reste ouvert pendant qu'on règle : chaque changement s'entend tout de suite.
//
// Usage :
//   const menu = createSpeedMenu({ value: 1, name: 'Vitesse de l\'exemple', hint: '…', onChange });
//   parent.appendChild(menu);
//   setSpeedMenuValue(menu, 0.6); // l'affichage seulement : onChange n'est pas appelé

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.05;
/** Les vitesses courantes, en un clic. */
export const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5];

/**
 * Une vitesse valide : bornée de 0,25 à 2 et arrondie au pas de 0,05. Une valeur vide, nulle
 * ou fausse donne `fallback` (« 0,75 », écrit à la française, est lu).
 * @param {unknown} value
 * @param {number} [fallback=1]
 * @returns {number}
 */
export function clampSpeed(value, fallback = 1) {
  const v = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  const stepped = Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) / SPEED_STEP) * SPEED_STEP;
  return Math.round(stepped * 100) / 100;
}

/**
 * « 0,25× », « 0,6× », « 1× », « 1,05× ».
 * @param {number} value
 */
export function speedLabel(value) {
  const v = Math.round(Number(value) * 100) / 100;
  return `${String(Number.isFinite(v) ? v : 1).replace('.', ',')}×`;
}

const CHEVRON = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">'
  + '<path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Marge entre le panneau et le bord de la fenêtre, et entre le panneau et le bouton. */
const EDGE = 8;
const GAP = 6;
/** Ce que chaque menu sait afficher (setSpeedMenuValue). */
const menus = new WeakMap();

function node(tag, className, attrs = {}, text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text) el.textContent = text;
  return el;
}

/**
 * Le bouton « 0,75× ▾ » et son panneau.
 * @param {{
 *   value?: number,
 *   onChange?: (value: number) => void, // à chaque changement, tout de suite
 *   name?: string,                      // « Vitesse de l'exemple » : titre du panneau, nom du bouton
 *   hint?: string,                      // une ligne sous le curseur (« Retenue pour les exemples suivants. »)
 * }} [options]
 * @returns {HTMLElement} `.speed-menu`
 */
export function createSpeedMenu({ value = 1, onChange = () => {}, name = 'Vitesse', hint = '' } = {}) {
  const root = node('span', 'speed-menu');
  const button = node('button', 'speed-menu-btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  button.innerHTML = `<span class="speed-menu-value"></span>${CHEVRON}`;
  const panel = node('div', 'speed-menu-panel', { popover: 'auto', role: 'dialog', 'aria-label': name });

  const readout = node('strong', 'speed-menu-readout');
  const head = node('div', 'speed-menu-head');
  head.append(node('span', 'speed-menu-name', {}, name), readout);

  const presets = node('div', 'speed-menu-presets', { role: 'group', 'aria-label': 'Vitesses courantes' });
  for (const p of SPEED_PRESETS) {
    presets.append(node('button', 'speed-menu-preset', { type: 'button', 'data-speed': String(p), 'aria-pressed': 'false' }, speedLabel(p)));
  }

  const slower = node('button', 'speed-menu-step', { type: 'button', 'data-step': '-1', 'aria-label': 'Plus lent (moins 0,05)', title: 'Plus lent' }, '−');
  const faster = node('button', 'speed-menu-step', { type: 'button', 'data-step': '1', 'aria-label': 'Plus rapide (plus 0,05)', title: 'Plus rapide' }, '+');
  const range = node('input', 'speed-menu-range', {
    type: 'range', min: String(SPEED_MIN), max: String(SPEED_MAX), step: String(SPEED_STEP), 'aria-label': name,
  });
  // L'échelle : les deux bouts, et 1× à sa vraie place sur le curseur.
  const scale = node('div', 'speed-menu-scale', { 'aria-hidden': 'true' });
  scale.append(
    node('span', '', {}, speedLabel(SPEED_MIN)),
    node('span', 'is-normal', { style: `--at: ${(1 - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)}` }, '1×'),
    node('span', '', {}, speedLabel(SPEED_MAX)),
  );
  const track = node('div', 'speed-menu-track');
  track.append(range, scale);
  const fine = node('div', 'speed-menu-fine');
  fine.append(slower, track, faster);

  panel.append(head, presets, fine);
  if (hint) panel.append(node('p', 'speed-menu-hint', {}, hint));
  root.append(button, panel);

  let current = clampSpeed(value, 1);
  const render = () => {
    const label = speedLabel(current);
    root.dataset.value = String(current);
    button.querySelector('.speed-menu-value').textContent = label;
    button.setAttribute('aria-label', `${name} : ${label}`);
    button.title = `${name} : ${label}`;
    readout.textContent = label;
    if (Number(range.value) !== current) range.value = String(current);
    range.setAttribute('aria-valuetext', label);
    for (const b of presets.children) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === current));
    // Aux bornes, − ou + ne fait plus rien (sans perdre le focus : pas de `disabled`).
    slower.setAttribute('aria-disabled', String(current <= SPEED_MIN));
    faster.setAttribute('aria-disabled', String(current >= SPEED_MAX));
  };
  const set = (v) => {
    const next = clampSpeed(v, current);
    if (next === current) { render(); return; }
    current = next;
    render();
    onChange(current);
  };
  presets.addEventListener('click', (e) => {
    const b = e.target.closest('.speed-menu-preset');
    if (b) set(Number(b.dataset.speed));
  });
  slower.addEventListener('click', () => set(Math.round((current - SPEED_STEP) * 100) / 100));
  faster.addEventListener('click', () => set(Math.round((current + SPEED_STEP) * 100) / 100));
  range.addEventListener('input', () => set(Number(range.value)));

  // Le panneau se place sous le bouton (au-dessus s'il n'y a pas la place), aligné à droite,
  // et toujours entier dans la fenêtre.
  const place = () => {
    const r = button.getBoundingClientRect();
    const w = panel.offsetWidth || 264;
    const h = panel.offsetHeight || 180;
    const left = Math.max(EDGE, Math.min(r.right - w, window.innerWidth - w - EDGE));
    const below = r.bottom + GAP + h <= window.innerHeight - EDGE || r.top - GAP - h < EDGE;
    const top = below ? Math.min(r.bottom + GAP, window.innerHeight - h - EDGE) : r.top - GAP - h;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(EDGE, top))}px`;
    panel.dataset.side = below ? 'below' : 'above';
  };
  // Posé à côté du bouton : si la page défile ou si la fenêtre change, il se ferme.
  const detach = () => {
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
  };
  const close = () => {
    // Retiré de la page ouvert (la conversation redessinée) : le navigateur l'a fermé sans
    // prévenir ; il ne reste qu'à ne plus écouter.
    if (!panel.isConnected) { detach(); return; }
    if (typeof panel.hidePopover === 'function') {
      try { panel.hidePopover(); } catch (_) { /* déjà fermé */ }
    } else {
      panel.hidden = true;
      opened(false);
    }
  };
  const onScroll = (e) => { if (!panel.contains(e.target)) close(); };
  const onResize = () => close();
  const opened = (open) => {
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      place();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
      range.focus({ preventScroll: true });
    } else {
      detach();
    }
  };
  if (typeof panel.showPopover === 'function') {
    // Le bouton est l'invocateur déclaré : un clic dessus ferme le panneau ouvert sans le rouvrir.
    button.popoverTargetElement = panel;
    panel.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') place(); });
    panel.addEventListener('toggle', (e) => opened(e.newState === 'open'));
  } else {
    // Sans `popover` (navigateur ancien) : le panneau se montre et se cache simplement.
    panel.hidden = true;
    button.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      opened(!panel.hidden);
    });
  }
  // Échap ferme le panneau (lui seul) et rend la main au bouton. Fait ici, sans compter sur le
  // navigateur : un raccourci global de l'application annule la touche Échap
  // (refonte/astra-shell.js), et le panneau ne se fermait plus.
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
    button.focus();
  });

  menus.set(root, (v) => { current = clampSpeed(v, current); render(); });
  render();
  return root;
}

/**
 * Montre une vitesse sans appeler onChange (un autre lecteur l'a changée, ou la page revient).
 * @param {HTMLElement|null} root - `.speed-menu`
 * @param {number} value
 */
export function setSpeedMenuValue(root, value) {
  const show = root ? menus.get(root) : null;
  if (show) show(value);
}

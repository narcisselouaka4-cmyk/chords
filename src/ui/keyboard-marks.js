// [Claude] — 2026-09-25 — Le clavier qui montre : marques posées sur les touches.
//
// Narcisse : « il faudrait qu'elle puisse interagir avec le clavier MIDI pour
// représenter visuellement ce qu'elle dit […] comme une sorte de tuto
// interactif ». Jusqu'ici le clavier n'allumait que les touches jouées ; les
// annotations du Copilote (flèches posées par-dessus) se décalaient dès que le
// clavier changeait de taille.
//
// Une marque = une pastille colorée + une étiquette courte (« b7 », « 9 », « ✓ »)
// posées DANS le SVG de la touche (<g id="note-…">) : alignées à toute taille,
// sans calcul de position à l'écran. Le genre donne la couleur (fondamentale,
// notes guides, couleurs, voix qui va bouger, juste, fausse, manquante, note qui
// traîne sous la pédale…). Une légende d'une ligne s'affiche sous les touches.
// Un nouveau rendu du clavier (redimensionnement) remplace le SVG : main.js
// rappelle applyKeyboardMarks() juste après avoir rallumé les touches jouées.
//
// Les numéros MIDI sont ceux des touches affichées (hauteur entendue : la
// transposition du clavier est déjà comprise dans la touche allumée).

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Genres de marque et leur libellé dans la légende. */
export const MARK_KINDS = {
  target: 'À jouer',
  root: 'Fondamentale',
  guide: '3ce / 7e',
  fifth: 'Quinte',
  color: 'Couleur',
  bass: 'Basse',
  passing: 'Passage',
  outside: 'Hors accord',
  ok: 'Juste',
  wrong: 'Faux / en trop',
  missing: 'Manquante',
  ghost: 'Traîne (pédale)',
};

let marks = [];
let caption = '';
let captionTone = '';

const isMidi = (n) => Number.isInteger(n) && n >= 0 && n <= 127;

/**
 * Remplace les marques du clavier.
 * @param {{midi: number, kind?: string, label?: string, moving?: boolean}[]} list
 * @param {{caption?: string, tone?: ''|'ok'|'warn'|'error'}} [options] - légende sous les touches
 */
export function setKeyboardMarks(list, { caption: text = '', tone = '' } = {}) {
  const byMidi = new Map();
  for (const m of list || []) {
    if (!m || !isMidi(m.midi)) continue;
    const kind = MARK_KINDS[m.kind] ? m.kind : 'target';
    // Une touche = une marque (la dernière donnée l'emporte).
    byMidi.set(m.midi, { midi: m.midi, kind, label: String(m.label ?? '').slice(0, 4), moving: Boolean(m.moving) });
  }
  marks = [...byMidi.values()];
  caption = String(text || '');
  captionTone = tone || '';
  applyKeyboardMarks();
  notify();
}

/** Efface marques et légende. */
export function clearKeyboardMarks() {
  if (marks.length === 0 && !caption) return;
  marks = [];
  caption = '';
  captionTone = '';
  applyKeyboardMarks();
  notify();
}

/** Marques et légende en cours (copies). */
export function getKeyboardMarks() {
  return { marks: marks.map((m) => ({ ...m })), caption, tone: captionTone };
}

function notify() {
  const doc = globalThis.document;
  if (!doc?.dispatchEvent || typeof CustomEvent === 'undefined') return;
  doc.dispatchEvent(new CustomEvent('keyboard-marks-change', { detail: getKeyboardMarks() }));
}

/** Pastille d'une touche : centre et rayon en unités du SVG. */
function badgeGeometry(key) {
  const rect = key.querySelector?.('rect.piano-key');
  const width = Number(rect?.getAttribute('width')) || 40;
  // Le rectangle déborde du rayon d'arrondi (5) au-dessus du clavier.
  const height = (Number(rect?.getAttribute('height')) || 155) - 5;
  if (key.classList.contains('black')) {
    const r = 11;
    return { cx: width / 2, cy: Math.max(r + 2, height - r - 7), r, font: 10.5 };
  }
  // Touche blanche : sous les touches noires, au-dessus du nom de la note.
  return { cx: width / 2, cy: height * 0.72, r: 15, font: 13 };
}

function svgEl(doc, tag, attrs) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** (Re)pose les marques sur le SVG du clavier affiché, et la légende. */
export function applyKeyboardMarks() {
  const doc = globalThis.document;
  if (!doc?.getElementById) return;
  const container = doc.getElementById('keyboard-container');
  if (container?.querySelectorAll) {
    container.querySelectorAll('.kb-mark').forEach((n) => n.remove());
    container.querySelectorAll('.note.is-marked').forEach((g) => g.classList.remove('is-marked'));
    if (doc.createElementNS) {
      for (const m of marks) {
        const key = doc.getElementById(`note-${m.midi}`);
        if (!key || !container.contains(key)) continue;
        const { cx, cy, r, font } = badgeGeometry(key);
        const group = svgEl(doc, 'g', { class: `kb-mark kb-mark-${m.kind}${m.moving ? ' kb-mark-moving' : ''}`, 'pointer-events': 'none' });
        if (m.moving) group.appendChild(svgEl(doc, 'circle', { class: 'kb-mark-ring', cx, cy, r: r + 4 }));
        group.appendChild(svgEl(doc, 'circle', { class: 'kb-mark-dot', cx, cy, r }));
        if (m.label) {
          const text = svgEl(doc, 'text', {
            class: 'kb-mark-label', x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-size': m.label.length > 2 ? font - 2 : font,
          });
          text.textContent = m.label;
          group.appendChild(text);
        }
        key.appendChild(group);
        key.classList.add('is-marked');
      }
    }
  }
  renderCaption(doc);
}

function renderCaption(doc) {
  const box = doc.getElementById('keyboard-mark-caption');
  if (!box) return;
  const visible = marks.length > 0 || Boolean(caption);
  box.hidden = !visible;
  box.closest?.('.vk-status')?.classList.toggle('has-mark-caption', visible);
  if (!visible) return;
  box.dataset.tone = captionTone || '';
  const textEl = box.querySelector('.vk-mark-caption-text');
  if (textEl) {
    textEl.textContent = caption;
    textEl.title = caption;
  }
  const legend = box.querySelector('.vk-mark-caption-legend');
  if (legend) {
    const kinds = [...new Set(marks.map((m) => m.kind))];
    const moving = marks.some((m) => m.moving);
    legend.innerHTML = kinds.map((k) => `<span><i class="kb-legend-dot kb-legend-${k}"></i>${MARK_KINDS[k]}</span>`).join('')
      + (moving ? '<span><i class="kb-legend-dot kb-legend-moving"></i>Voix qui bouge</span>' : '');
  }
}

/**
 * Branche le bouton ✕ de la légende (efface les marques ; les modules qui en
 * posent écoutent « keyboard-marks-cleared » pour quitter leur mode).
 */
export function initKeyboardMarks() {
  const doc = globalThis.document;
  const close = doc?.querySelector?.('#keyboard-mark-caption .vk-mark-caption-close');
  close?.addEventListener('click', () => {
    clearKeyboardMarks();
    doc.dispatchEvent(new CustomEvent('keyboard-marks-cleared', { detail: { byUser: true } }));
  });
}

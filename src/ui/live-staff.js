// [Claude] — 2026-10-02 — La portée du Temps réel : 3e notation, à côté des noms latins
// et anglais (Narcisse : « façon manuscrit de conservatoire », comme Chordie, avec les
// clés de sol, d'ut et de fa ; en bas à gauche, hors du clavier virtuel ; toujours
// visible ; elle descend quand le clavier est masqué).
//
// L'accord joué s'écrit en rondes, avec l'orthographe de l'accord (E♭ dans Cm7, D♯
// dans C7♯9, B𝄫 dans Cdim7) ; la fondamentale est teintée comme sur la roue.
// Choix de la clé : « Sol + Fa » (défaut), « Sol », « Fa », « Ut 3e », « Ut 4e ». Le
// choix n'est PAS mémorisé (demande de Narcisse) : ni localStorage ni historique,
// chaque lancement repart sur « Sol + Fa ».
// Mise en page : src/ui/staff/staff-layout.js ; tracés Bravura : staff-glyphs.js.
// Appelé par display.js, au même endroit que la Lecture en direct (une seule détection).

import { GLYPHS, UNITS_PER_SPACE, ENGRAVING } from './staff/staff-glyphs.js';
import { layoutStaff, SPACE } from './staff/staff-layout.js';
import { spellChordNotes, displayNoteName } from '../chord-engine/spelling.js';

const MODES = [
  ['grand', 'Sol + Fa', 'Grande portée : clé de sol et clé de fa'],
  ['treble', 'Sol', 'Clé de sol'],
  ['bass', 'Fa', 'Clé de fa'],
  ['alto', 'Ut 3e', 'Clé d\'ut 3e ligne (alto)'],
  ['tenor', 'Ut 4e', 'Clé d\'ut 4e ligne (ténor)'],
];
const GLYPH_SCALE = SPACE / UNITS_PER_SPACE;
const pcOf = (n) => ((n % 12) + 12) % 12;

let mode = 'grand'; // le temps de la séance seulement
let last = { notes: [], result: null };

const fmt = (n) => Math.round(n * 100) / 100;

function glyph(name, x, y, cls, scaleX = GLYPH_SCALE, scaleY = GLYPH_SCALE) {
  return `<path class="${cls}" d="${GLYPHS[name].d}" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(scaleX)} ${fmt(scaleY)})"/>`;
}

/** Orthographe : celle de l'accord reconnu (3 notes ou plus), sinon par défaut. */
function spelledNotes(notes, result) {
  const pcs = new Set((notes || []).map(pcOf));
  const known = result && pcs.size >= 3 && result.symbol !== '?' && !result.polychord;
  return { spelled: spellChordNotes(notes || [], known ? result : null), rootPc: known && !result.rootless ? result.rootPc : null };
}

function draw() {
  const svg = document.getElementById('live-staff-svg');
  if (!svg) return;
  const { spelled, rootPc } = spelledNotes(last.notes, last.result);
  const layout = layoutStaff({ notes: spelled, mode, rootPc });
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.dataset.mode = layout.mode;

  const parts = [];
  const lineWidth = fmt(ENGRAVING.staffLineThickness * SPACE);
  const ledgerWidth = fmt(ENGRAVING.legerLineThickness * SPACE);
  for (const l of layout.staffLines) {
    parts.push(`<line class="staff-line" x1="${fmt(l.x1)}" y1="${fmt(l.y)}" x2="${fmt(l.x2)}" y2="${fmt(l.y)}" stroke-width="${lineWidth}"/>`);
  }
  if (layout.systemLine) {
    const s = layout.systemLine;
    parts.push(`<line class="staff-line staff-system" x1="${fmt(s.x)}" y1="${fmt(s.y1)}" x2="${fmt(s.x)}" y2="${fmt(s.y2)}" stroke-width="${fmt(ENGRAVING.thinBarlineThickness * SPACE)}"/>`);
  }
  if (layout.brace) {
    const b = layout.brace;
    parts.push(glyph('brace', b.x, b.y, 'staff-glyph staff-brace', GLYPH_SCALE * b.scaleX, GLYPH_SCALE * b.scaleY));
  }
  for (const c of layout.clefs) parts.push(glyph(c.glyph, c.x, c.y, 'staff-glyph staff-clef'));
  for (const l of layout.ledgers) {
    parts.push(`<line class="staff-ledger" x1="${fmt(l.x1)}" y1="${fmt(l.y)}" x2="${fmt(l.x2)}" y2="${fmt(l.y)}" stroke-width="${ledgerWidth}"/>`);
  }
  for (const a of layout.accidentals) parts.push(glyph(a.glyph, a.x, a.y, 'staff-glyph staff-accidental'));
  for (const h of layout.heads) parts.push(glyph('noteheadWhole', h.x, h.y, `staff-glyph staff-head${h.isRoot ? ' is-root' : ''}`));
  for (const o of layout.ottavas) {
    parts.push(`<text class="staff-ottava" x="${fmt(o.x)}" y="${fmt(o.y)}">${o.text}</text>`);
  }
  svg.innerHTML = parts.join('');

  const label = MODES.find(([id]) => id === layout.mode)?.[2] || 'Portée';
  const names = spelled.map((n) => `${displayNoteName(n.name, { latin: true })}${n.octave}`).join(', ');
  svg.setAttribute('aria-label', names ? `${label} : ${names}` : `${label}, aucune note`);
}

/** Les notes entendues (MIDI) et la lecture de detectChord. */
export function renderLiveStaff(notes, result) {
  last = { notes: [...new Set(notes || [])], result: result || null };
  draw();
}

export function clearLiveStaff() {
  last = { notes: [], result: null };
  draw();
}

/** Sélecteur de clé, puis la portée au repos. */
export function initLiveStaff() {
  const host = document.getElementById('live-staff-clefs');
  if (host && !host.childElementCount) {
    for (const [id, text, title] of MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.staffMode = id;
      button.textContent = text;
      button.title = title;
      button.setAttribute('aria-pressed', String(id === mode));
      button.addEventListener('click', () => {
        mode = id;
        for (const b of host.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.staffMode === mode));
        draw();
      });
      host.appendChild(button);
    }
  }
  draw();
}

// [Claude] — 2026-10-02 — Mise en page de la portée du Temps réel (3e notation), sans DOM.
//
// Narcisse : une portée « façon manuscrit de conservatoire », à la manière de Chordie,
// avec les clés de sol, d'ut et de fa ; « Sol + Fa » par défaut, une seule portée en
// clé de sol, de fa, d'ut 3e ou d'ut 4e au choix. L'accord joué s'y écrit en rondes
// empilées, avec ses altérations.
//
// Unités : un interligne = 10 ; un rang diatonique (une ligne ou un interligne) = 5.
// Rang diatonique d'une note : octave × 7 + lettre (Do = 0 … Si = 6), Do4 = 28 —
// c'est le `step` de spellChordNotes (src/chord-engine/spelling.js).
// Hauteur fixe par mode (la portée ne saute pas d'un accord à l'autre) : au-delà des
// lignes supplémentaires prévues, tout le groupe de notes passe à l'octave (8va / 8vb).
// Testé dans test-staff-layout.js ; dessiné par src/ui/live-staff.js.

import { GLYPHS, ENGRAVING } from './staff-glyphs.js';

export const SPACE = 10;
const STEP = SPACE / 2;
const MIDDLE_C = 28;

/** Portées : lignes du bas et du haut (rangs), clé et ligne qu'elle désigne. */
const STAVES = {
  treble: { bottom: 30, top: 38, clef: 'gClef', clefStep: 32 }, // clé de sol 2e ligne : Sol4
  bass: { bottom: 18, top: 26, clef: 'fClef', clefStep: 24 }, // clé de fa 4e ligne : Fa3
  alto: { bottom: 24, top: 32, clef: 'cClef', clefStep: 28 }, // clé d'ut 3e ligne : Do4
  tenor: { bottom: 22, top: 30, clef: 'cClef', clefStep: 28 }, // clé d'ut 4e ligne : Do4
};

export const STAFF_MODES = ['grand', 'treble', 'bass', 'alto', 'tenor'];

const HEAD_WIDTH = GLYPHS.noteheadWhole.width * SPACE;
const LEDGER_EXTENSION = ENGRAVING.legerLineExtension * SPACE;
const ACCIDENTAL_GAP = 2;
const ACCIDENTAL_CLEARANCE = 6; // rangs : deux altérations plus proches ne partagent pas une colonne
const OTTAVA_ROOM = 14;
const ACCIDENTAL_GLYPH = { '-2': 'accidentalDoubleFlat', '-1': 'accidentalFlat', 0: 'accidentalNatural', 1: 'accidentalSharp', 2: 'accidentalDoubleSharp' };

/**
 * @param {object} input
 * @param {{midi: number, step: number, alter: number}[]} input.notes - spellChordNotes()
 * @param {'grand'|'treble'|'bass'|'alto'|'tenor'} [input.mode]
 * @param {number|null} [input.rootPc] - fondamentale, teintée sur la portée
 * @returns {object} tout ce qu'il faut dessiner (voir la fin de la fonction)
 */
export function layoutStaff({ notes = [], mode = 'grand', rootPc = null } = {}) {
  const grand = mode === 'grand' || !STAVES[mode];
  const ledgers = grand ? 4 : 6;
  const staffKinds = grand ? ['treble', 'bass'] : [mode];

  // Une note par hauteur réelle.
  const unique = [];
  const seen = new Set();
  for (const n of [...notes].sort((a, b) => a.midi - b.midi)) {
    if (!Number.isFinite(n?.step) || seen.has(n.midi)) continue;
    seen.add(n.midi);
    unique.push(n);
  }

  // Verticalement : chaque portée réserve la place de ses lignes supplémentaires et
  // d'une marque d'octave, au-dessus et au-dessous.
  const reserve = (2 * ledgers + 2) * STEP + OTTAVA_ROOM;
  const staves = [];
  let y = reserve;
  for (const kind of staffKinds) {
    const def = STAVES[kind];
    const topY = y;
    staves.push({ kind, ...def, topY, bottomY: topY + (def.top - def.bottom) * STEP });
    y = topY + (def.top - def.bottom) * STEP + (grand ? 5 * SPACE : 0);
  }
  const lastStaff = staves[staves.length - 1];
  const height = Math.round(lastStaff.bottomY + reserve);
  const yOf = (staff, step) => staff.topY + (staff.top - step) * STEP;

  // Horizontalement : accolade et trait de système (grande portée), clé, altérations,
  // rondes.
  const braceWidth = grand ? 7 : 0;
  const staffX = grand ? braceWidth + 3 : 2;
  const clefX = staffX + 6;
  const clefEnd = clefX + Math.max(...staves.map((s) => GLYPHS[s.clef].width)) * SPACE;

  // Notes réparties sur les portées (grande portée : partage au Do central), puis
  // groupe par groupe, passage à l'octave si les notes dépassent les lignes prévues.
  const groups = staves.map((staff) => ({ staff, notes: [], shift: 0 }));
  for (const n of unique) {
    const index = grand ? (n.step >= MIDDLE_C ? 0 : 1) : 0;
    groups[index].notes.push(n);
  }
  const ottavas = [];
  for (const group of groups) {
    if (!group.notes.length) continue;
    const { staff } = group;
    const maxStep = staff.top + 2 * ledgers + 1;
    const minStep = staff.bottom - 2 * ledgers - 1;
    const high = Math.max(...group.notes.map((n) => n.step));
    const low = Math.min(...group.notes.map((n) => n.step));
    for (const k of [7, 14]) {
      if (high > maxStep && high - k <= maxStep && low - k >= minStep) { group.shift = -k; break; }
      if (low < minStep && low + k >= minStep && high + k <= maxStep) { group.shift = k; break; }
    }
    if (group.shift) {
      const up = group.shift < 0;
      ottavas.push({
        text: Math.abs(group.shift) === 14 ? (up ? '15ma' : '15mb') : (up ? '8va' : '8vb'),
        y: up ? staff.topY - (2 * ledgers + 2) * STEP - 3 : staff.bottomY + (2 * ledgers + 2) * STEP + 9,
        above: up,
      });
    }
  }

  // Rondes : de bas en haut, une seconde (ou un unisson altéré) passe à droite.
  const heads = [];
  for (const group of groups) {
    let previous = null;
    for (const n of [...group.notes].sort((a, b) => a.step - b.step || a.alter - b.alter)) {
      const step = n.step + group.shift;
      const column = previous && step - previous.step <= 1 && previous.column === 0 ? 1 : 0;
      const head = { midi: n.midi, step, alter: n.alter, staff: group.staff, column, isRoot: rootPc !== null && ((n.midi % 12) + 12) % 12 === rootPc };
      heads.push(head);
      previous = head;
    }
  }

  // Altérations : toutes celles des notes altérées ; un unisson altéré (Mi♭ et Mi♮)
  // montre aussi le bécarre.
  const accidentalHeads = heads.filter((h) => h.alter !== 0
    || heads.some((o) => o !== h && o.staff === h.staff && o.step === h.step));
  // De haut en bas, chaque altération prend la première colonne (en partant des
  // rondes) où elle ne touche aucune autre.
  const columns = [];
  for (const h of [...accidentalHeads].sort((a, b) => b.step - a.step || b.alter - a.alter)) {
    const glyph = ACCIDENTAL_GLYPH[h.alter] || 'accidentalNatural';
    let column = columns.findIndex((col) => col.every((o) => o.staff !== h.staff || Math.abs(o.step - h.step) >= ACCIDENTAL_CLEARANCE));
    if (column === -1) {
      columns.push([]);
      column = columns.length - 1;
    }
    columns[column].push({ ...h, glyph });
  }
  const columnWidths = columns.map((col) => Math.max(...col.map((a) => GLYPHS[a.glyph].width * SPACE)));
  const accidentalsWidth = columnWidths.reduce((sum, w) => sum + w + ACCIDENTAL_GAP, 0);

  // Place des rondes : fixe tant que les altérations tiennent (l'accord ne bouge pas
  // d'un accord à l'autre), repoussée à droite sinon.
  const chordX = Math.max(clefEnd + 40, clefEnd + 8 + accidentalsWidth);
  const width = Math.round(chordX + 2 * HEAD_WIDTH + 34);

  const out = {
    width,
    height,
    mode: grand ? 'grand' : mode,
    staffLines: [],
    systemLine: null,
    brace: null,
    clefs: [],
    ledgers: [],
    heads: [],
    accidentals: [],
    ottavas: ottavas.map((o) => ({ text: o.text, x: chordX - 4, y: o.y, above: o.above })),
  };

  for (const staff of staves) {
    for (let step = staff.bottom; step <= staff.top; step += 2) {
      out.staffLines.push({ y: yOf(staff, step), x1: staffX, x2: width - 2 });
    }
    out.clefs.push({ glyph: staff.clef, x: clefX, y: yOf(staff, staff.clefStep) });
  }
  if (grand) {
    const y1 = staves[0].topY;
    const y2 = lastStaff.bottomY;
    out.systemLine = { x: staffX, y1, y2 };
    // L'accolade de Bravura mesure un cadratin (4 interlignes) : on l'étire sur le système.
    const glyphHeight = GLYPHS.brace.bbox.ne[1] * SPACE;
    out.brace = { x: 0, y: y2, scaleX: 1.9, scaleY: (y2 - y1) / glyphHeight };
  }

  for (const h of heads) {
    out.heads.push({ x: chordX + h.column * HEAD_WIDTH, y: yOf(h.staff, h.step), isRoot: h.isRoot, midi: h.midi, staff: h.staff.kind, step: h.step });
  }

  // Lignes supplémentaires : chacune couvre les rondes qui sont sur elle ou au-delà.
  for (const staff of staves) {
    const own = out.heads.filter((h) => h.staff === staff.kind);
    const highest = Math.max(staff.top, ...own.map((h) => h.step));
    for (let step = staff.top + 2; step <= highest; step += 2) {
      const covered = own.filter((h) => h.step >= step);
      out.ledgers.push(ledgerSpan(yOf(staff, step), covered));
    }
    const lowest = Math.min(staff.bottom, ...own.map((h) => h.step));
    for (let step = staff.bottom - 2; step >= lowest; step -= 2) {
      const covered = own.filter((h) => h.step <= step);
      out.ledgers.push(ledgerSpan(yOf(staff, step), covered));
    }
  }

  // Altérations : colonne 0 contre les rondes, les suivantes vers la gauche.
  let right = chordX - ACCIDENTAL_GAP;
  columns.forEach((col, i) => {
    const colWidth = columnWidths[i];
    for (const a of col) {
      const glyphWidth = GLYPHS[a.glyph].width * SPACE;
      out.accidentals.push({ glyph: a.glyph, x: right - glyphWidth, y: yOf(a.staff, a.step), step: a.step, column: i });
    }
    right -= colWidth + ACCIDENTAL_GAP;
  });

  return out;
}

function ledgerSpan(y, heads) {
  const x1 = Math.min(...heads.map((h) => h.x)) - LEDGER_EXTENSION;
  const x2 = Math.max(...heads.map((h) => h.x)) + HEAD_WIDTH + LEDGER_EXTENSION;
  return { y, x1, x2 };
}

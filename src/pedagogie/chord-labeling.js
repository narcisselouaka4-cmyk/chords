// [Claude] — 2026-09-05 — Pédagogie IA : nommage des segments harmoniques.
//
// Seul point du pipeline vidéo qui touche au moteur d'accords. Il est isolé ici
// pour deux raisons : la segmentation (note-grouping.js) reste testable sans le
// moteur, et le nommage passe par une seule fonction.
//
// [Claude] — 2026-10-25 — Narcisse : « je veux le même moteur dans Pédagogie IA,
// parce qu'il y a de la transcription, et mieux est la transcription, meilleures
// sont les analyses du Copilote. » Le nommage passe donc de `detectChord` à
// `nameMidiChord` (Sessions MIDI), qui part des notes RÉELLEMENT jouées : chaque
// classe de hauteur est essayée comme fondamentale, et le modèle retenu est celui
// dont la triade sonne vraiment. `nameMidiChord` retombe sur `detectChord` quand
// aucun modèle n'explique les notes : c'est un sur-ensemble, jamais une perte.
// `detectChord` reste appelé pour le DÉTAIL (degrés, notes manquantes, voicing)
// que le Copilote et le glossaire utilisent.
//
// Discipline : si le moteur ne reconnaît rien, le segment est marqué non résolu
// et le dit. On n'affiche jamais un accord que le pipeline n'a pas réellement lu.

import { detectChord } from '../chord-engine/index.js';
import { nameMidiChord } from '../recorder/midi-chord-namer.js';
import { chordName, slashName, formatNoteList } from '../chord-engine/naming.js';

/**
 * [Claude] — 2026-09-25 — Nom d'accord sans balises HTML
 * (« F#7<span class="flat">♭</span>13 » → « F#7♭13 »).
 */
export function plainText(label) {
  return String(label ?? '').replace(/<[^>]*>/g, '');
}

/**
 * Nomme un jeu de notes MIDI.
 *
 * @param {number[]} midis
 * @param {object} [options]
 * @param {boolean} [options.latin] - notation Do/Ré/Mi plutôt que C/D/E
 * @returns {{
 *   resolved: boolean, label: string|null, symbol: string|null,
 *   rootPc: number|null, bassPc: number|null, isSlash: boolean,
 *   noteNames: string[], detail: object|null, reason?: string
 * }}
 */
export function labelNotes(midis, options = {}) {
  const latin = Boolean(options.latin);
  const list = Array.isArray(midis) ? midis.filter((m) => Number.isFinite(m)) : [];
  const pcs = Array.from(new Set(list.map((m) => ((m % 12) + 12) % 12))).sort((a, b) => a - b);

  if (list.length === 0) {
    return {
      resolved: false, label: null, symbol: null, rootPc: null, bassPc: null,
      isSlash: false, noteNames: [], detail: null, reason: 'NoNotes',
    };
  }

  const named = nameMidiChord(list, { latin });
  const chord = detectChord(list);
  if (!named && !chord) {
    return {
      resolved: false, label: null, symbol: null, rootPc: null, bassPc: null,
      isSlash: false, noteNames: formatNoteList(pcs, latin), detail: null,
      reason: 'Unrecognised',
    };
  }

  // [Claude] — 2026-09-25 — Texte simple : chordName() écrit les altérations en
  // HTML (<span class="flat">♭</span>) pour d'autres écrans ; ici le nom est
  // affiché en texte (la grille montrait les balises) et envoyé au Copilote.
  const label = plainText(named ? named.name : (chord.isSlash
    ? slashName(chord.rootPc, chord.symbol, chord.bassPc, latin)
    : chordName(chord.rootPc, chord.symbol, latin)));

  // Une quinte à vide n'est pas une erreur de lecture : c'est ce qui est
  // réellement joué à cet endroit. On le signale plutôt que de compléter la
  // tierce depuis la tonalité — ce serait afficher une note que la vidéo ne
  // montre pas. Le recoupement avec l'analyse audio (cross-check.js) est le
  // bon endroit pour confronter cette lecture littérale à l'harmonie entendue.
  const thirdMissing = chord?.symbol === '5'
    || (Array.isArray(chord?.missing) && chord.missing.includes(3));

  return {
    resolved: true,
    label,
    symbol: named ? named.symbol : chord.symbol,
    rootPc: named ? named.rootPc : chord.rootPc,
    bassPc: (named ? named.bassPc : chord.bassPc) ?? null,
    isSlash: Boolean(named ? named.isSlash : chord.isSlash),
    noteNames: formatNoteList(pcs, latin),
    thirdMissing,
    note: thirdMissing
      ? 'Tierce non jouée sur ce passage : lecture littérale de ce qui est à l\'écran.'
      : null,
    detail: chord,
  };
}

/**
 * Nomme une suite de segments produite par groupSegments().
 *
 * @param {object[]} segments
 * @param {object} [options]
 * @returns {object[]} segments enrichis d'un champ `chord`
 */
export function labelSegments(segments, options = {}) {
  return (segments || []).map((seg) => ({
    ...seg,
    chord: labelNotes(seg.midis, options),
  }));
}

/**
 * Fusionne les segments voisins qui portent le même nom d'accord.
 *
 * La segmentation suit la basse ; une même harmonie rejouée main gauche
 * produit donc deux segments successifs identiques. Les réunir rend la grille
 * lisible sans rien décider de musical.
 *
 * @param {object[]} labelled
 * @returns {object[]}
 */
export function mergeSameLabel(labelled) {
  const out = [];
  for (const seg of labelled || []) {
    const last = out[out.length - 1];
    if (last && last.chord.resolved && seg.chord.resolved && last.chord.label === seg.chord.label) {
      last.end = seg.end;
      last.duration = last.end - last.start;
      last.midis = Array.from(new Set([...last.midis, ...seg.midis])).sort((a, b) => a - b);
      last.sampleCount += seg.sampleCount;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

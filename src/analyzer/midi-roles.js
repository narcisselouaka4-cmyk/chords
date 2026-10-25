// [Claude] — 2026-10-25 — Rôle harmonique des accords d'une session MIDI.
//
// Narcisse : son onglet Analyse ne montrait aucune hiérarchie sur ses propres
// sessions — `role: 'structural'` était codé en dur pour TOUS les accords et
// `degree` valait null partout. Il ne pouvait donc pas voir ce qui porte sa
// progression et ce qui n'est qu'un mouvement de passage.
//
// La version audio (`_classify_chord_roles`, Python) n'est pas portée ici :
// mesurée le 25/10, elle juge la diatonicité sur la tonalité GLOBALE et masque
// 31,6 % des événements, dont des sections modulées entières (trous de 128 s et
// 82 s). Son défaut vient précisément de la diatonicité.
//
// D'où une règle qui ne s'appuie PAS sur la tonalité, et qui survit donc aux
// modulations et aux erreurs de tonalité :
//
//   structurel — l'accord revient dans le morceau, ou il est tenu longtemps.
//                C'est ce qui construit la progression.
//   passage    — bref, encadré par deux accords structurels, et qui ne revient
//                pas. C'est un mouvement entre deux piliers.
//   incertain  — ni l'un ni l'autre : on ne prétend rien.
//
// Les accords sont regroupés par FONDAMENTALE et qualité, pas par nom complet :
// son `Fadd9` et son `Fadd9/A` sont le même degré de sa progression, et son
// `Dm7` et son `Dmadd9` aussi. Compter les noms complets les séparerait.
//
// Module pur, testé dans test-midi-roles.js.

/** Un accord revenant au moins ce nombre de fois appartient à la progression. */
export const RECURRENCE_MIN = 2;
/** … ou tenu au moins ce nombre de temps en une seule fois.
 *
 * Calibré sur les sessions de Narcisse, pas choisi a priori : il a dicté les dix
 * accords de Session_017 comme étant SA progression, donc tous structurels. À
 * 2,5 temps et au-delà, son Do add9 — sa tonique, jouée une fois et brièvement —
 * tombait en « passage ». À 2 temps, les dix sortent structurels. */
export const HELD_BEATS = 2.0;
/** Un accord de passage ne dépasse pas cette fraction de la durée médiane. */
export const PASSING_MAX_RATIO = 0.6;

const pcOf = (n) => ((n % 12) + 12) % 12;
const PITCHES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/**
 * L'identité harmonique d'un accord : sa fondamentale et sa couleur majeure ou
 * mineure. « Fadd9 », « Fadd9/A » et « F » partagent la même.
 * @param {string} chord
 * @returns {string|null}
 */
export function harmonicIdentity(chord) {
  if (!chord || chord === 'N') return null;
  const match = String(chord).match(/^([A-G][#b]?)([^/]*)/);
  if (!match) return null;
  const root = PITCHES[match[1]];
  if (root === undefined) return null;
  const suffix = match[2] || '';
  const colour = /^(m(?!aj)|dim|m7b5)/.test(suffix) ? 'm'
    : /^(7|9|11|13|alt)/.test(suffix) ? '7' : '';
  return `${pcOf(root)}${colour}`;
}

/**
 * Annote chaque accord d'un `role` : structural, passing, uncertain, silence.
 * Ne modifie ni les noms ni les temps.
 * @param {object[]} chords - accords {startTime, endTime, chord}
 * @param {{beatDuration?: number}} [options]
 * @returns {object[]} les mêmes accords, avec `role`
 */
export function classifyMidiRoles(chords, { beatDuration = 0.5 } = {}) {
  const list = chords || [];
  if (!list.length) return list;

  const sounding = list.filter((c) => c.chord && c.chord !== 'N');
  const durations = sounding.map((c) => c.endTime - c.startTime).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;

  const occurrences = new Map();
  const longest = new Map();
  for (const c of sounding) {
    const id = harmonicIdentity(c.chord);
    if (!id) continue;
    occurrences.set(id, (occurrences.get(id) || 0) + 1);
    longest.set(id, Math.max(longest.get(id) || 0, c.endTime - c.startTime));
  }

  // Première passe : les piliers. Revenir, ou être tenu.
  for (const c of list) {
    if (!c.chord || c.chord === 'N') { c.role = 'silence'; continue; }
    const id = harmonicIdentity(c.chord);
    const recurs = (occurrences.get(id) || 0) >= RECURRENCE_MIN;
    const held = (c.endTime - c.startTime) >= HELD_BEATS * beatDuration
      || (longest.get(id) || 0) >= HELD_BEATS * beatDuration;
    c.role = recurs || held ? 'structural' : null;
  }

  // Seconde passe : passage contre incertain, décidé par le voisinage. Un accord
  // de passage relie deux piliers ; il est bref et ne revient pas.
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].role !== null) continue;
    let end = i + 1;
    while (end < list.length && list[end].role === null) end += 1;
    const left = i > 0 ? list[i - 1] : null;
    const right = end < list.length ? list[end] : null;
    const framed = left?.role === 'structural' && right?.role === 'structural';
    const span = list[end - 1].endTime - list[i].startTime;
    const brief = median > 0 && span <= PASSING_MAX_RATIO * median;
    for (let k = i; k < end; k += 1) list[k].role = framed && brief ? 'passing' : 'uncertain';
    i = end - 1;
  }

  return list;
}

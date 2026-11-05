// [Claude] — 2026-11-05 — Le « footing » : le seul verdict objectif possible
// sur un solo.
//
// Le professeur de la classe de salsa relevée le 05/11 l'appelle « là où tombe
// le pied » (17:06) : sur un temps fort, la note sur laquelle on atterrit doit
// appartenir à l'accord qui sonne. Son contre-exemple est net — en sol mineur,
// un fa♯ posé sur un temps fort « sonne dissonant ».
//
// Pourquoi ce module peut juger alors que le reste d'un solo ne se juge pas :
// l'application sait trois choses sûres, et aucune n'est une question de goût —
// quel accord sonne à quel instant, de quelles notes il est fait, et ce qui a
// été joué. Dire « ce la♭ tombe sur le temps 1 et n'est pas dans sol mineur »
// est un fait. Dire si une phrase est belle n'en est pas un, et ce module ne
// s'y risque pas : il ne note pas le solo, il signale les atterrissages.
//
// Les notes d'atterrissage valides sont DÉCLARÉES par la fiche, pas devinées.
// Le professeur accepte le mi♭ sur le D7 — la ♭9 de son D7♭9 (secret n°4) —
// alors qu'elle n'est pas dans un D7 ordinaire. Une fiche peut donc étendre la
// liste ; à défaut, ce sont les notes de l'accord. L'application trie selon ce
// qu'on lui a dit, elle ne choisit pas à la place du pianiste.

import { degreeOf } from '../pedagogie/note-roles.js';
import { groupSimultaneous, msToBeats, SIMULTANEOUS_MS, DEFAULT_TOLERANCE_MS } from './rhythm-judge.js';

const pcOf = (n) => ((Math.round(n) % 12) + 12) % 12;
const round = (n, p = 3) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Temps forts d'un intervalle, selon la mesure et les positions déclarées.
 * En 4/4, les temps forts par défaut sont le 1 et le 3 — ceux que le pied
 * marque, et ceux dont le professeur parle.
 * @param {number[]} strongBeats - positions fortes dans la mesure (0 = le 1)
 * @param {number} barBeats - temps par mesure
 * @param {number} fromBeat
 * @param {number} toBeat
 * @returns {number[]}
 */
export function strongBeatsBetween(strongBeats, barBeats, fromBeat, toBeat) {
  const positions = Array.isArray(strongBeats) && strongBeats.length ? strongBeats : [0];
  const bar = Number(barBeats) > 0 ? Number(barBeats) : 4;
  if (!(toBeat > fromBeat)) return [];
  const out = [];
  for (let b = Math.floor(fromBeat / bar); b <= Math.ceil(toBeat / bar); b += 1) {
    for (const p of positions) {
      const at = b * bar + Number(p);
      if (at >= fromBeat && at < toBeat) out.push(round(at));
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Classes de hauteur sur lesquelles on peut atterrir pour un accord.
 * `landing` de la fiche l'emporte (en demi-tons depuis la fondamentale) ;
 * sinon les intervalles de l'accord fournis par le moteur.
 * @param {{rootPc: number, quality: string, landing?: number[]}} chord
 * @param {(quality: string) => Iterable<number>} chordTones - injecté pour
 *   garder ce module testable sans charger tout le moteur d'accords
 * @returns {Set<number>} classes de hauteur absolues
 */
export function landingPitchClasses(chord, chordTones) {
  if (!chord || chord.rootPc == null) return new Set();
  const intervals = Array.isArray(chord.landing) && chord.landing.length
    ? chord.landing
    : [...(chordTones?.(chord.quality || '') || [])];
  return new Set(intervals.map((i) => pcOf(chord.rootPc + i)));
}

/**
 * Juge les atterrissages sur les temps forts.
 *
 * @param {object} options
 * @param {Array<{at: number, note: number}>} options.hits - frappes jouées, en temps
 * @param {(beat: number) => object|null} options.chordAt - accord qui sonne à cet instant
 * @param {(quality: string) => Iterable<number>} options.chordTones
 * @param {number[]} [options.strongBeats] - positions fortes dans la mesure
 * @param {number} [options.barBeats]
 * @param {number} options.fromBeat
 * @param {number} options.toBeat
 * @param {number} [options.tempo]
 * @param {number} [options.toleranceMs] - fenêtre autour du temps fort
 * @returns {object}
 */
export function judgeFooting({
  hits = [], chordAt, chordTones, strongBeats = [0, 2], barBeats = 4,
  fromBeat = 0, toBeat = 0, tempo = 90, toleranceMs = DEFAULT_TOLERANCE_MS,
} = {}) {
  const window = msToBeats(toleranceMs, tempo);
  const bar = Number(barBeats) > 0 ? Number(barBeats) : 4;
  const groups = groupSimultaneous(hits, msToBeats(SIMULTANEOUS_MS, tempo));
  const beats = strongBeatsBetween(strongBeats, bar, fromBeat, toBeat);
  const used = new Set();
  const landings = [];

  for (const beat of beats) {
    // Le groupe de frappes le plus proche du temps fort, dans la fenêtre.
    // Un groupe déjà attribué à un temps fort ne peut pas servir deux fois :
    // deux temps forts voisins ne se partagent pas une seule frappe.
    let best = -1;
    let bestDist = Infinity;
    groups.forEach((g, i) => {
      if (used.has(i)) return;
      const dist = Math.abs(g.at - beat);
      if (dist <= window && dist < bestDist) { best = i; bestDist = dist; }
    });
    const chord = chordAt ? chordAt(beat) : null;
    if (best < 0) {
      // Rien joué sur ce temps fort. Ce n'est pas une faute : un solo
      // respire, et un silence sur le temps est un choix courant en salsa.
      landings.push({ beat, chord: chord?.name || null, silent: true, notes: [], degrees: [], outside: [], onChord: null });
      continue;
    }
    used.add(best);
    const group = groups[best];
    const allowed = landingPitchClasses(chord, chordTones);
    const notes = [...group.notes].filter((n) => Number.isFinite(n));
    const seen = new Set();
    const degrees = [];
    const outside = [];
    for (const note of notes) {
      const pc = pcOf(note);
      if (seen.has(pc)) continue;
      seen.add(pc);
      const inChord = allowed.has(pc);
      const degree = chord?.rootPc != null
        ? degreeOf(pc - chord.rootPc, chord.quality || '') : null;
      degrees.push({ pc, degree, inChord });
      if (!inChord) outside.push({ pc, degree });
    }
    landings.push({
      beat,
      chord: chord?.name || null,
      silent: false,
      at: group.at,
      deltaBeats: round(group.at - beat),
      notes,
      degrees,
      outside,
      // Toutes les hauteurs distinctes du groupe sont dans l'accord. Avec un
      // jeu en octaves parallèles, les deux touches ont la même classe de
      // hauteur : une seule décision, pas deux.
      onChord: outside.length === 0,
    });
  }

  const sounded = landings.filter((l) => !l.silent);
  return {
    landings,
    total: beats.length,
    played: sounded.length,
    silent: beats.length - sounded.length,
    onChord: sounded.filter((l) => l.onChord).length,
    offChord: sounded.filter((l) => !l.onChord).length,
    barBeats: bar,
    toleranceMs,
    tempo,
  };
}

const NOTE_NAMES = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

/** Nom latin d'une classe de hauteur (la notation de l'application). */
export function pcName(pc) {
  return NOTE_NAMES[pcOf(pc)] || '';
}

/**
 * Repère lisible par un pianiste : « mesure 3, temps 1 ».
 * Un numéro de temps absolu (« au temps 9 ») ne se retrouve pas sur un clavier,
 * surtout dans une grille qui tourne en boucle.
 */
export function barPosition(beat, barBeats = 4) {
  const bar = Number(barBeats) > 0 ? Number(barBeats) : 4;
  const b = Number(beat) || 0;
  const index = Math.floor(b / bar);
  const inBar = round(b - index * bar, 2);
  return `Mesure ${index + 1}, temps ${round(inBar + 1, 2)}`;
}

/**
 * Phrase française du verdict de footing. Elle nomme l'atterrissage fautif —
 * la note, son degré et l'accord — parce que c'est ce qui permet de corriger.
 * Un atterrissage sans accord connu ne produit pas de verdict : une absence de
 * donnée n'est pas une donnée.
 */
export function footingVerdict(result) {
  if (!result || !result.total) return '';
  const { played, total, onChord, offChord, silent } = result;
  if (!played) return `Aucune note sur les ${total} temps forts de ce passage.`;
  const head = `${onChord} atterrissage${onChord > 1 ? 's' : ''} sur ${played} dans l'accord`;
  const tail = silent ? `, ${silent} temps fort${silent > 1 ? 's' : ''} laissé${silent > 1 ? 's' : ''} libre${silent > 1 ? 's' : ''}` : '';
  if (!offChord) return `${head}${tail}.`;
  const first = result.landings.find((l) => !l.silent && !l.onChord);
  const note = first?.outside?.[0];
  const where = first && note
    ? ` ${barPosition(first.beat, result.barBeats)}, ${pcName(note.pc)}${note.degree ? ` (${note.degree})` : ''} n'est pas dans ${first.chord || 'l\'accord'}.`
    : '';
  return `${head}${tail}.${where}`;
}

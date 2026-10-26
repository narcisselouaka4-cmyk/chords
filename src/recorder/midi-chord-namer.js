// [Claude] — 2026-09-24 — Nom d'un accord joué au clavier MIDI (sessions).
//
// Narcisse : « les accords détectés et affichés ne sont pas toujours les bons,
// alors qu'il s'agit bien de pur MIDI natif ». Le moteur général (detectChord)
// laissait tomber la 13e (C E A Bb D → C9), la #11 (Cmaj7#11 → Cmaj9), nommait
// mal les 11e, les 6/9, les sus et les 7alt (66 % de voicings de l'Exercice
// bien nommés, basse comprise), et la session affichait son `fullName` sans
// fondamentale (« Major 9 » au lieu de « Cmaj9 »).
//
// Ici, on part des notes réellement jouées : chaque classe de hauteur présente
// est essayée comme fondamentale, et l'accord retenu est celui dont le modèle
// explique TOUTES les notes (notes obligatoires présentes, notes facultatives —
// quinte, 9e d'une 13e — permises, aucune note étrangère). La basse jouée compte
// d'abord : un accord dont la fondamentale est à la basse passe avant un
// renversement (A C E G = Am7, pas C6/A) ; sinon on écrit la basse (C/E).
// Qualités : celles de l'application (maj7, m11, 13, 7alt…). Un ensemble qu'aucun
// modèle n'explique (voicings rares) repasse par detectChord, avec sa fondamentale.

import { detectChord } from '../chord-engine/index.js';
import { chordRootName, slashBassName, displayNoteName, forcedPitchName } from '../chord-engine/spelling.js';

// [qualité, notes obligatoires, notes facultatives] en demi-tons depuis la fondamentale.
const TEMPLATES = [
  ['', [0, 4, 7], []],
  ['m', [0, 3, 7], []],
  ['dim', [0, 3, 6], []],
  ['aug', [0, 4, 8], []],
  ['sus4', [0, 5, 7], []],
  ['sus2', [0, 2, 7], []],
  ['6', [0, 4, 9], [7]],
  ['m6', [0, 3, 9], [7]],
  ['6/9', [0, 4, 9, 2], [7]],
  ['m6/9', [0, 3, 9, 2], [7]],
  ['add9', [0, 4, 2], [7]],
  ['madd9', [0, 3, 2], [7]],
  // Quarte ajoutée : l'appoggiature sur la quarte, très courante au piano, ne
  // trouvait aucun modèle. {Mi Sol La} sortait « E? » faute de gabarit.
  ['add11', [0, 4, 5], [7]],
  ['madd11', [0, 3, 5], [7]],
  ['maj7', [0, 4, 11], [7]],
  ['maj9', [0, 4, 11, 2], [7]],
  ['maj13', [0, 4, 11, 9], [7, 2]],
  ['maj7#11', [0, 4, 11, 6], [7, 2]],
  ['maj13#11', [0, 4, 11, 6, 9], [7, 2]],
  ['maj7#5', [0, 4, 8, 11], [2]],
  ['m7', [0, 3, 10], [7]],
  ['m9', [0, 3, 10, 2], [7]],
  ['m11', [0, 3, 10, 5], [7, 2]],
  ['m13', [0, 3, 10, 9], [7, 2, 5]],
  ['mMaj7', [0, 3, 11], [7]],
  ['mMaj9', [0, 3, 11, 2], [7]],
  ['m7b5', [0, 3, 6, 10], [1, 2, 5]],
  ['dim7', [0, 3, 6, 9], []],
  ['7', [0, 4, 10], [7]],
  // Coquille sans tierce (fondamentale + quinte + septième), la main gauche la
  // plus courante en gospel : {Sib Fa Lab} n'avait aucun modèle et sortait
  // « Bb? ». Le modèle complet ci-dessus gagne dès que la tierce est jouée.
  ['7', [0, 10], [7]],
  ['9', [0, 4, 10, 2], [7]],
  ['13', [0, 4, 10, 9], [7, 2]],
  ['7sus4', [0, 5, 10], [7]],
  ['9sus4', [0, 5, 10, 2], [7]],
  ['13sus4', [0, 5, 10, 9], [7, 2]],
  ['7b9', [0, 4, 10, 1], [7]],
  ['7#9', [0, 4, 10, 3], [7]],
  ['7#11', [0, 4, 10, 6], [7, 2]],
  ['13#11', [0, 4, 10, 6, 9], [7, 2]],
  ['7b13', [0, 4, 10, 8], [7, 2]],
  ['7#5', [0, 4, 8, 10], [2]],
  ['7b5', [0, 4, 6, 10], [2]],
  ['7b9b13', [0, 4, 10, 1, 8], []],
  ['7#9b13', [0, 4, 10, 3, 8], []],
  ['7b5b9', [0, 4, 6, 10, 1], []],
  ['7#5#9', [0, 4, 8, 10, 3], []],
  ['13b9', [0, 4, 10, 1, 9], [7]],
];

// 7alt : 9e altérée (b9 / #9) ET quinte altérée (b5 / #5), sans 5, 9, 13 naturelles.
function isAltered(intervals) {
  const has = (i) => intervals.has(i);
  if (!has(0) || !has(4) || !has(10)) return false;
  if (!(has(1) || has(3)) || !(has(6) || has(8))) return false;
  return ![2, 5, 7, 9, 11].some(has);
}

// Triade implicite d'un modèle : sa tierce (ou la note qui en tient lieu dans un
// sus) et sa quinte. Sert à savoir si l'accord candidat SONNE vraiment.
function triadOf(required, optional) {
  const third = [4, 3, 5, 2].find((i) => required.includes(i));
  const fifth = [7, 6, 8].find((i) => required.includes(i) || optional.includes(i));
  return third === undefined || fifth === undefined ? null : [third, fifth];
}

// L'accord a-t-il une VRAIE tierce, majeure ou mineure ? Une quarte suspendue ou
// une seconde n'en est pas une, et une coquille sans tierce n'en a aucune. C'est
// ce qui sépare une lecture qui tient d'une lecture en attente de sa tierce : le
// découpage s'en sert pour savoir si une note de mélodie complète l'harmonie.
function hasRealThird(required) {
  return required.includes(4) || required.includes(3);
}

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// L'orthographe des accords doit suivre celle de la tonalité affichée : la
// session du 15/09 montrait « D# major » en tête et « Eb », « Ab », « Bb » dans
// la frise. Narcisse écrit en dièses (« ré dièse majeur », « La#7 bémol 9 »).
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LATIN = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const LATIN_SHARPS = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/** Nom d'une classe de hauteur (orthographe courante des grilles : Bb, Eb, F#). */
export function pitchName(pc, { latin = false, useSharps = false } = {}) {
  const table = latin ? (useSharps ? LATIN_SHARPS : LATIN) : (useSharps ? SHARPS : NAMES);
  return table[((pc % 12) + 12) % 12];
}

/**
 * La dominante que ces notes dessinent sans la jouer, si sa fondamentale est la
 * dominante de la tonalité. Sinon null.
 * @param {number[]} pcs - classes de hauteur jouées
 * @param {number} keyPc - tonique de la tonalité
 */
function impliedDominant(pcs, keyPc) {
  const root = ((keyPc + 7) % 12 + 12) % 12;   // le V de la tonalité
  const intervals = new Set(pcs.map((pc) => (pc - root + 12) % 12));
  if (intervals.has(0)) return null;           // la fondamentale est jouée : rien à impliquer
  // Il faut au moins trois notes de l'accord, dont la septième mineure, et
  // aucune note qui lui soit étrangère.
  const allowed = new Set([4, 7, 10, 1, 3]);   // 3, 5, b7, b9, #9
  if (![...intervals].every((i) => allowed.has(i))) return null;
  if (!intervals.has(10)) return null;
  if (intervals.size < 3) return null;
  const altered = intervals.has(1) || intervals.has(3);
  return { rootPc: root, symbol: altered ? (intervals.has(1) ? '7b9' : '7#9') : '7' };
}

/** Degrés d'une gamme majeure, et le mode de l'accord bâti sur chacun. */
const MAJOR_DEGREE_MODE = { 0: '', 2: 'm', 4: 'm', 5: '', 7: '', 9: 'm', 11: 'dim' };

/**
 * La coquille que porte la BASSE FRAPPÉE : fondamentale, quinte juste, et
 * aucune tierce. C'est la main gauche la plus courante en gospel — Narcisse
 * joue {Do, Fa, Sol, Si♭, La♭} et entend « do mineur », là où le moteur lisait
 * « Fmadd9/C » puis « Abmaj7/C » sur les mêmes notes, parce qu'une triade
 * complète (Fa-La♭-Do, La♭-Do-Mi♭) se trouve ailleurs dans l'ensemble.
 *
 * La quinte est exigée, et la tierce doit être absente : c'est ce qui sépare
 * cette lecture d'un renversement légitime. Ses Do/Mi, Si♭6/Ré, Fadd9/La et
 * Gadd9/Si n'ont pas de quinte au-dessus de leur basse, ou bien ont leur
 * tierce — aucun n'est touché.
 *
 * Le mode vient de la TONALITÉ, car une coquille sans tierce n'en porte
 * aucun : en mi bémol majeur, Do est le sixième degré, donc mineur. Sans
 * tonalité connue, on ne tranche pas. Et le nom reste simple — fondamentale,
 * mode, septième — parce qu'un nom juste et simple vaut mieux qu'un nom riche
 * et faux : il dit « do mineur », pas « Cm7(11,b13) ».
 *
 * @returns {{rootPc: number, symbol: string}|null}
 */
function bassShell(pcs, bassPc, keyPc) {
  if (keyPc == null) return null;
  const intervals = new Set(pcs.map((pc) => (pc - bassPc + 12) % 12));
  if (!intervals.has(7)) return null;
  if (intervals.has(3) || intervals.has(4)) return null;
  const mode = MAJOR_DEGREE_MODE[((bassPc - keyPc) % 12 + 12) % 12];
  if (mode === undefined || mode === 'dim') return null;
  const seventh = intervals.has(10) ? '7' : (intervals.has(11) ? 'maj7' : '');
  if (mode === 'm') return { rootPc: bassPc, symbol: seventh === '7' ? 'm7' : `m${seventh}` };
  return { rootPc: bassPc, symbol: seventh };
}

/**
 * Accord joué : fondamentale, qualité (celle de l'application), basse, nom.
 * @param {number[]} notes - notes MIDI jouées ensemble
 * @param {{latin?: boolean}} [options]
 * @returns {{rootPc: number, symbol: string, bassPc: number, isSlash: boolean, name: string, matched: boolean}|null}
 */
export function nameMidiChord(notes, { latin = false, spelling = 'auto', keyPc = null } = {}) {
  const list = (notes || []).filter(Number.isFinite);
  if (list.length === 0) return null;
  const pcs = [...new Set(list.map((n) => ((n % 12) + 12) % 12))];
  if (pcs.length < 3) return null;
  const bassPc = ((Math.min(...list) % 12) + 12) % 12;
  let best = null;
  for (const root of pcs) {
    const intervals = new Set(pcs.map((pc) => (pc - root + 12) % 12));
    const candidates = TEMPLATES.map(([symbol, required, optional]) => ({ symbol, required, optional }))
      .filter(({ required, optional }) => required.every((i) => intervals.has(i))
        && [...intervals].every((i) => required.includes(i) || optional.includes(i)));
    // Dominante altérée (b9 / #9 et b5 / #5) : « 7alt », le nom que donne un
    // pianiste, plutôt que 7#9b13, 7b5b9…
    if (isAltered(intervals)) candidates.push({ symbol: '7alt', required: [0, 4, 10], optional: [1, 3, 6, 8], altered: true });
    for (const c of candidates) {
      // Le modèle le plus précis d'abord (plus de notes obligatoires, moins de
      // facultatives) ; la fondamentale à la basse passe avant tout.
      const precision = c.altered ? 11 : c.required.length * 2 - c.optional.length * 0.25;
      // L'identité d'un accord tient à sa TRIADE : une lecture dont la tierce et
      // la quinte sont réellement jouées passe avant une lecture plus « riche »
      // dont la triade est absente. Mesuré sur la session du 25/10 de Narcisse :
      // {Sol La Si Ré} donnait « A9sus4 » (ni Do# ni Mi joués) au lieu de
      // « Gadd9 » (Sol-Si-Ré joués) ; {Do Fa Sol La} donnait « G9sus4/A » (ni Si
      // ni Ré) au lieu de « Fadd9/A » ; {Mi Fa Sol Si} donnait « G13/E » (pas de
      // Ré) au lieu de « Em ». L'arbitrage par nombre de notes obligatoires
      // (`precision`) préférait systématiquement le modèle le plus complexe.
      const triad = triadOf(c.required, c.optional);
      const sounds = c.altered || (triad ? triad.every((i) => intervals.has(i)) : false);
      const score = (sounds ? 1000 : 0) + (root === bassPc ? 100 : 0) + precision;
      if (!best || score > best.score) {
        best = { rootPc: root, symbol: c.symbol, score, sounds, thirdless: !hasRealThird(c.required) };
      }
    }
  }
  // Appoggiature : aucun modèle ne décrit l'ensemble avec une triade qui sonne,
  // mais une triade sonne bel et bien et une note s'y ajoute sans lui appartenir.
  // C'est la lecture d'un pianiste : « Em avec un Fa d'appui », pas « G13 ».
  // Mesuré sur la session du 25/10 : {Mi Fa Sol Si} sortait « G13/E » alors que
  // le Ré de G13 n'est pas joué, quand Mi-Sol-Si sonne en entier.
  // On ne se rabat sur cette lecture que si la BASSE JOUÉE porte elle-même une
  // triade entière. C'est ce qui sépare les deux cas, identiques en classes de
  // hauteur : {Mi Fa Sol Si} basse Mi, où Mi-Sol-Si sonne en entier, se lit
  // « Em » ; {Mi Fa Sol La Si} basse Sol se lit « G13 », parce que Sol-Si-Ré n'y
  // sonne pas et que Sol est la basse frappée (voir le cas « pédale tenue,
  // nouvelle basse frappée » de test-session-analysis.js). La quinte est la
  // première note qu'un pianiste omet : on ne l'exige jamais de l'accord retenu,
  // seulement de la triade de la basse quand on écarte le modèle.
  // Quarte ajoutée sur une triade entière : c'est un APPUI, pas une couleur. La
  // 11e se heurte à la tierce d'un accord majeur ou mineur sans septième ; un
  // pianiste dit « mi mineur avec le la d'appui », pas « Emadd11 ». Narcisse,
  // sur Session_017 : « Em simple ». Le gabarit madd11 reste utile quand la
  // triade n'est PAS entière — {Mi Sol La}, sans quinte, n'a pas d'autre nom.
  if (best && !best.rootless && (best.symbol === 'add11' || best.symbol === 'madd11')) {
    const intervals = new Set(pcs.map((pc) => (pc - best.rootPc + 12) % 12));
    const third = best.symbol === 'add11' ? 4 : 3;
    if (intervals.has(third) && intervals.has(7)) {
      best = { ...best, symbol: best.symbol === 'add11' ? '' : 'm' };
    }
  }

  if (!best || !best.sounds) {
    const fromBass = new Set(pcs.map((pc) => (pc - bassPc + 12) % 12));
    const triad = [['', [0, 4, 7]], ['m', [0, 3, 7]]]
      .find(([, t]) => t.every((i) => fromBass.has(i)));
    if (triad && (!best || best.rootPc !== bassPc)) {
      best = { rootPc: bassPc, symbol: triad[0], approximated: true };
    }
  }

  // Aucun modèle n'explique toutes les notes : nom approché (detectChord), et
  // `matched: false` (voicing rare, ou note étrangère : voir session-performance.js).
  const matched = Boolean(best) && !best.approximated;
  if (!best) {
    const detected = detectChord(list);
    if (!detected || detected.rootPc == null || detected.symbol == null) return null;
    // Nom approché : on ne sait ni si sa triade sonne, ni s'il a une tierce.
    // Les déclarer par défaut faisait passer « Ebmaj7sus2/F » — un fa tenu sous
    // une ligne Ré → Mi♭ — pour un accord solide.
    best = { rootPc: detected.rootPc, symbol: detected.symbol, sounds: false, thirdless: true };
  }
  // Dominante SANS fondamentale. Narcisse : « j'ai fait un La#7 bémol 9 », et
  // l'app affichait « Fdim ». Ses notes {Fa, Sol#, Si} sont la quinte, la
  // septième et la neuvième bémol de La#7b9 — l'accord existe, sa fondamentale
  // n'est simplement pas jouée. Une triade ou une septième diminuée admet
  // plusieurs lectures de ce genre ; celle qui compte est celle dont la
  // fondamentale est la DOMINANTE de la tonalité, parce que c'est sa fonction.
  // Sans tonalité connue, on ne tranche pas et le nom littéral reste.
  // Restreint à la TRIADE diminuée, et à elle seule.
  //
  // Une triade majeure ou mineure complète se suffit à elle-même : son Si bémol
  // de 39,10 s ({Si♭, Ré, Fa}) devenait « G7#9/Bb » parce que ces notes sont
  // aussi une structure supérieure de G7#9 — alors qu'elles forment un accord
  // entier et stable.
  //
  // Et une SEPTIÈME diminuée complète est elle aussi un accord à part entière :
  // symétrique, avec une longue tradition d'accord de passage. Narcisse nomme
  // les siennes ainsi (« un Fa diminué 7 drop 2, puis un Sol diminué 7 drop 2 »)
  // et le banc de ses sessions l'enregistre. On ne les renomme donc pas.
  //
  // Reste la triade diminuée seule, bien plus souvent un fragment qu'un accord :
  // ses {Fa, Sol#, Si} sont la quinte, la septième et la neuvième bémol d'un
  // La#7b9 dont il n'a pas joué la fondamentale — et c'est le nom qu'il donne.
  const diminished = best.symbol === 'dim';
  const implied = keyPc == null || !diminished ? null : impliedDominant(pcs, keyPc);
  if (implied) best = { rootPc: implied.rootPc, symbol: implied.symbol, rootless: true };

  // Coquille de la main gauche : la basse frappée porte sa quinte et aucune
  // tierce. On ne l'applique que si la lecture retenue a choisi une AUTRE
  // fondamentale — sinon il n'y a rien à corriger.
  if (best.rootPc !== bassPc && !implied) {
    const shell = bassShell(pcs, bassPc, keyPc);
    if (shell) best = { rootPc: shell.rootPc, symbol: shell.symbol, shell: true };
  }

  const isSlash = best.rootPc !== bassPc;
  // L'orthographe passe par spelling.js, qui écrit la fondamentale selon la
  // FAMILLE de l'accord (A♭maj7 et non G♯maj7, B♭7 et non A♯7, mais C♯°7 en
  // dièses). Sessions MIDI écrivait tout en bémols et l'onglet Analyse tout en
  // dièses : la session du 25/10 de Narcisse sortait « G#maj7 A# C# C#7#9 » en
  // do majeur, là où un pianiste écrit « Abmaj7 Bb Db Db7#9 ».
  // Le réglage `spelling` ('auto' | 'sharps' | 'flats') passe par-dessus.
  const rootName = chordRootName(best.rootPc, best.symbol, { spelling });
  const bassName = forcedPitchName(bassPc, spelling) ?? slashBassName(bassPc, best.rootPc, best.symbol);
  const render = (n) => (latin ? displayNoteName(n, { latin: true }) : n);
  const name = `${render(rootName)}${best.symbol}${isSlash ? `/${render(bassName)}` : ''}`;
  // `sounds` : la triade de l'accord retenu est-elle réellement jouée ? Le
  // découpage s'en sert pour savoir si une note de mélodie complète l'harmonie
  // (voir session-analysis.js) — une triade incomplète est une lecture fragile.
  const sounds = best.approximated ? true : Boolean(best.sounds);
  const thirdless = best.approximated ? false : best.thirdless !== false;
  return { rootPc: best.rootPc, symbol: best.symbol, bassPc, isSlash, name, matched, sounds, thirdless };
}

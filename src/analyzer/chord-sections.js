// [Refonte Analyse 02/10] — Découpage d'une grille d'accords en parties.
//
// POURQUOI CE MODULE EXISTE
// Le pipeline audio (chord-engine) produit une liste plate de segments :
// { startTime, endTime, chord, role, inStructuralLoop, confidence }. Il ne
// produit AUCUNE section. L'ancien segmenteur (src/analyzer/segmenter.js) n'est
// branché que sur le chemin MIDI, et il baptise ses parties « Intro », « Verse »,
// « Chorus » — des noms devinés à partir du seul rang de la section. Afficher
// « Refrain » parce que c'est la quatrième partie d'un morceau de plus de
// soixante secondes, ce serait faire dire à l'application ce qu'elle ne sait pas.
//
// Ce module donne donc ce qu'on peut établir honnêtement : OÙ l'harmonie
// change, à partir de deux indices mesurables —
//   · un silence franc entre deux accords (le moteur marque role: 'silence') ;
//   · une boucle d'accords qui recommence (la signature se répète).
// Les parties sont nommées « Partie A », « Partie B »… : un repère, pas une
// interprétation. Le pianiste lit la forme du morceau, et c'est lui qui décide
// si la partie C est le refrain.
//
// Module pur : ni DOM, ni import de CSS — testable en Node.

/** Silence minimal qui vaut frontière, en secondes. */
const SILENCE_GAP = 1.4;

/** Durée en dessous de laquelle une partie est absorbée par la précédente. */
const MIN_SECTION_DURATION = 8;

/** Longueurs de boucle cherchées quand on teste la répétition d'une suite. */
const LOOP_LENGTHS = [2, 3, 4, 6, 8];

/**
 * Signature d'un segment pour la détection de boucle : seul le symbole
 * compte, pas sa durée — une même suite jouée deux fois avec un phrasé
 * différent reste la même boucle.
 * @param {{chord?: string, manualOverride?: string|null}} seg
 */
function signature(seg) {
  return String(seg.manualOverride ?? seg.chord ?? '?');
}

function isSilence(seg) {
  return seg.role === 'silence' || signature(seg) === 'N';
}

/**
 * Indices où une boucle d'accords recommence.
 * On ne marque une frontière que si la suite se répète À L'IDENTIQUE
 * immédiatement après elle-même : c'est la seule preuve qu'on a d'une forme.
 * @param {string[]} sigs
 * @returns {Set<number>} indices de départ des répétitions
 */
function loopRestarts(sigs) {
  const marks = new Set();
  for (const len of LOOP_LENGTHS) {
    for (let start = 0; start + len * 2 <= sigs.length; start += 1) {
      const first = sigs.slice(start, start + len).join('|');
      const second = sigs.slice(start + len, start + len * 2).join('|');
      if (first === second) marks.add(start + len);
    }
  }
  return marks;
}

/**
 * Découpe une grille d'accords en parties.
 *
 * @param {Array<object>} chords segments du moteur, triés par startTime
 * @param {number} [duration] durée totale du morceau, en secondes
 * @returns {Array<{label: string, start: number, end: number, chords: Array<object>}>}
 *   Liste vide si la grille est vide. Une seule partie si rien ne justifie
 *   de la couper — ce qui est une information en soi : le morceau tourne sur
 *   une seule assise harmonique.
 */
export function splitIntoSections(chords, duration = 0) {
  const list = (chords || []).filter((c) => c && !isSilence(c));
  if (list.length === 0) return [];

  const sigs = list.map(signature);
  const restarts = loopRestarts(sigs);

  // Frontières : index du premier accord de chaque partie.
  const boundaries = new Set([0]);
  for (let i = 1; i < list.length; i += 1) {
    const gap = (list[i].startTime ?? 0) - (list[i - 1].endTime ?? 0);
    if (gap >= SILENCE_GAP) boundaries.add(i);
    if (restarts.has(i)) boundaries.add(i);
  }

  const cuts = [...boundaries].sort((a, b) => a - b);
  const raw = cuts.map((from, k) => {
    const to = k + 1 < cuts.length ? cuts[k + 1] : list.length;
    const part = list.slice(from, to);
    return {
      start: part[0].startTime ?? 0,
      end: part[part.length - 1].endTime ?? duration ?? 0,
      chords: part,
    };
  });

  // Une partie trop courte n'est pas une partie : c'est une respiration. On
  // l'absorbe dans celle qui précède plutôt que de hacher la lecture — et,
  // quand c'est la première (une levée, deux accords d'intro), dans celle qui
  // suit, puisqu'il n'y a rien avant elle.
  const merged = [];
  for (const section of raw) {
    const last = merged[merged.length - 1];
    if (last && section.end - section.start < MIN_SECTION_DURATION) {
      last.end = section.end;
      last.chords = last.chords.concat(section.chords);
    } else {
      merged.push({ ...section });
    }
  }
  while (merged.length > 1 && merged[0].end - merged[0].start < MIN_SECTION_DURATION) {
    const head = merged.shift();
    merged[0].start = head.start;
    merged[0].chords = head.chords.concat(merged[0].chords);
  }

  // Les parties qui reposent sur la même assise harmonique portent la MÊME
  // lettre : c'est ce qui fait une structure. Un morceau en A · B · A · C dit
  // qu'on repasse par le début au troisième mouvement — information qu'une
  // numérotation A · B · C · D effacerait complètement.
  const letters = [];
  const refs = [];
  for (const section of merged) {
    const fingerprint = harmonicFingerprint(section.chords);
    const twin = refs.findIndex((ref) => similarity(ref, fingerprint) >= SAME_PART_THRESHOLD);
    if (twin >= 0) {
      letters.push(letters[twin] ?? String.fromCharCode(65 + twin));
      refs.push(refs[twin]);
    } else {
      letters.push(String.fromCharCode(65 + new Set(letters).size));
      refs.push(fingerprint);
    }
  }

  return merged.map((section, i) => ({
    ...section,
    letter: letters[i],
    label: `Partie ${letters[i]}`,
    /** Rang de ce passage pour cette lettre : « Partie A » peut revenir. */
    pass: letters.slice(0, i + 1).filter((l) => l === letters[i]).length,
  }));
}

/** Part du temps occupée, en dessous de laquelle un accord ne compte pas dans
 *  l'empreinte d'une partie : on compare des assises, pas des détails. */
const FINGERPRINT_MIN_SHARE = 0.08;

/** Au-delà de ce recouvrement, deux parties sont « la même ». */
const SAME_PART_THRESHOLD = 0.6;

/** Ensemble des accords qui portent réellement une partie. */
function harmonicFingerprint(sectionChords) {
  return new Set(
    paletteOf(sectionChords)
      .filter((e) => e.share >= FINGERPRINT_MIN_SHARE)
      .slice(0, 6)
      .map((e) => e.symbol),
  );
}

/** Recouvrement de deux empreintes (indice de Jaccard). */
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const sym of a) if (b.has(sym)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Suite d'accords d'une partie, sans les répétitions consécutives : c'est la
 * progression qu'on lit sur une grille, pas la liste des segments détectés.
 * @param {Array<object>} sectionChords
 * @returns {string[]}
 */
export function progressionOf(sectionChords) {
  return (sectionChords || [])
    .map(signature)
    .filter((sym, i, arr) => i === 0 || sym !== arr[i - 1]);
}

/**
 * Palette harmonique d'une partie : ses accords distincts, classés par le
 * temps qu'ils occupent réellement.
 *
 * C'est ce qu'on affiche plutôt que la suite complète. Sur un morceau réel, une
 * partie de trois minutes compte plus de cent changements d'accords — la plupart
 * étant le même accord redétecté sous une voix légèrement différente. Les
 * aligner tous ne donne pas une architecture, mais un mur. Leur poids temporel,
 * lui, dit en six pastilles sur quoi la partie repose, et c'est la question que
 * se pose le pianiste : qu'est-ce que je dois avoir sous les doigts ici ?
 *
 * @param {Array<object>} sectionChords
 * @returns {Array<{symbol: string, seconds: number, count: number, share: number}>}
 *   trié par durée décroissante. `share` est la part du temps de la partie.
 */
export function paletteOf(sectionChords) {
  const list = sectionChords || [];
  const bySymbol = new Map();
  let total = 0;
  for (const seg of list) {
    const sym = signature(seg);
    const seconds = Math.max(0, (seg.endTime ?? 0) - (seg.startTime ?? 0));
    total += seconds;
    const entry = bySymbol.get(sym) || { symbol: sym, seconds: 0, count: 0, segmentId: seg.segmentId || '' };
    entry.seconds += seconds;
    entry.count += 1;
    bySymbol.set(sym, entry);
  }
  return [...bySymbol.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .map((e) => ({ ...e, share: total > 0 ? e.seconds / total : 0 }));
}

/** Nombre de changements d'accord dans une partie (répétitions consécutives exclues). */
export function changeCountOf(sectionChords) {
  return progressionOf(sectionChords).length;
}

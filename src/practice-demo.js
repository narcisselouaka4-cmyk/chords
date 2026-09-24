// [Claude] — 2026-09-24 — Démonstration d'un mouvement (Narcisse : « avoir un
// avant-goût des contenus […] une sorte de bouton Play […] pour savoir dans
// quelle direction on va »).
//
// La démo joue les MÊMES voicings que l'exercice (voicings enchaînés de
// practice-exercise.js, doublures comprises) : on entend exactement ce qu'on va
// jouer. Rien n'est repris d'un enregistrement : le jeu est écrit ici d'après
// des procédés courants du piano (grilles et procédés ne sont pas protégés), et
// le son est celui du piano de l'application (échantillons Salamander, licence
// CC-BY) ou du VST branché sur la sortie MIDI.
//
// [Claude] — 2026-09-24 (soir) — Jouable comme au clavier (Narcisse : « ça sonne
// pas réaliste du tout, il n'y a qu'à voir les voicings proposés qui sont
// absurdes », « surtout que j'ai pas de pédale de sustain », puis une vidéo de
// son jeu). L'ancienne démo ajoutait une basse en octaves sous des voicings déjà
// joués à deux mains (Gm11 : G1 G2 + G3 C4 | Bb4 F5, trois mains) et tenait tout
// à la pédale, notes de passage comprises (B4 contre Bb4). Désormais :
//   - deux mains, pas une de plus : chaque main joue ses notes de la carte (MAIN
//     GAUCHE / MAIN DROITE). Une main gauche libre (voicing à une main) prend la
//     basse du style ; occupée, elle ne reçoit la fondamentale que si elle la
//     tient avec ses notes (une octave au plus, limites graves de Levine) ;
//   - aucune pédale : une note ne sonne que tant que sa touche est tenue ; les
//     accords sont tenus par les doigts, relevés juste avant le suivant ;
//   - le jeu de Narcisse (vidéo du 24/09, en Fa : Gm11 → Cadd9/E → F → C/E →
//     Dm7) : main gauche fondamentale + quinte (G2 D3, D3 A3), accords égrenés du
//     grave à l'aigu (le premier plus lentement), tenus plutôt que rejoués, voix
//     du dessus qui bouge sur l'accord tenu (Bb4 → A4 sur Gm11), montée finale
//     1-2-5 sur deux octaves ;
//   - un tutoriel gospel jazz envoyé par Narcisse (« largement plus important »,
//     relevé touche par touche) : main gauche grave et large (C2 G2, F2 C3 ; 7e
//     sur les dominantes : G2 F3), main droite en cadre d'octave (C4 E4 G4 A4
//     C5 : le dessus doublé plus bas), diminués de passage vers l'accord suivant
//     (C → C#°7 → Dm, Dm → F#°7 → G). Procédés seulement : aucun arrangement
//     n'est repris.
//
// Quatre styles, une mesure de 4 temps par accord :
//   - Gospel / worship (76) : main gauche fondamentale + quinte à l'octave 2
//     (7e sur une dominante), main droite en cadre d'octave, accord égrené et
//     tenu ; au 3e temps, la voix du dessus glisse vers une note voisine de
//     l'accord ; au 4e, un diminué de passage quand la basse monte d'un ton ou
//     d'une quarte ; accord final suivi d'une montée 1-2-5.
//   - Ballade (60) : main gauche tenue, main droite arpégée du grave à l'aigu
//     (chaque doigt reste posé), deux notes du dessus reprises au 3e temps ;
//     diminué de passage au 4e, comme en Gospel / worship.
//   - Comping swing (132) : rythme « Charleston » (1er temps, puis « et » du 2e
//     en croche swinguée) ; main gauche libre : fondamentale au 1er temps, quinte
//     au 3e (jeu « en deux »).
//   - Plaqué (72) : la carte seule, tenue toute la mesure.
// Les temps sont exprimés en temps (noires) ; le lecteur les convertit selon le tempo.

import { respectsLowIntervalLimits } from './voicing-engine/textbook-voicings.js';
import { chordToneIntervals } from './practice-exercise.js';

export const DEMO_STYLES = {
  gospel: { label: 'Gospel / worship', tempo: 76, beatsPerChord: 4, build: buildGospelDemo },
  ballade: { label: 'Ballade', tempo: 60, beatsPerChord: 4, build: buildBalladeDemo },
  swing: { label: 'Comping swing', tempo: 132, beatsPerChord: 4, build: buildSwingDemo },
  plaque: { label: 'Plaqué', tempo: 72, beatsPerChord: 4, build: buildPlaqueDemo },
};

/** Ordre d'affichage des styles. */
export const DEMO_STYLE_IDS = ['gospel', 'ballade', 'swing', 'plaque'];

/**
 * Style par défaut d'un mouvement, d'après son style (champ `style` de la
 * bibliothèque) : jazz → Comping swing, gospel et worship → Gospel / worship ;
 * sans style (« Ma grille ») → Ballade.
 */
export function defaultDemoStyle(movementStyle) {
  return { jazz: 'swing', gospel: 'gospel', worship: 'gospel' }[movementStyle] || 'ballade';
}

/** Démo d'une grille dans le style demandé (Gospel / worship si inconnu). */
export function buildDemo(chords, styleId) {
  const style = DEMO_STYLES[styleId] || DEMO_STYLES.gospel;
  return style.build(chords, { beatsPerChord: style.beatsPerChord });
}

const LOWEST_BASS = 28; // Mi1 : plus grave, la basse devient un grondement.
const HAND_REACH = 12; // une octave : la fondamentale ajoutée tient dans la main gauche.
const HAND_SPAN = 16; // une 10e : au-delà, la main ne tient pas les notes ensemble.
const TOP_LIMIT = 88; // Mi6 : plafond de la voix du dessus.
const RUN_TOP = 91; // Sol6 : plafond de la montée finale.
const SWING_OFFBEAT = 2 / 3; // croche swinguée : aux deux tiers du temps.
const LIFT = 0.05; // la main se relève juste avant l'accord suivant.

const pcOf = (n) => ((n % 12) + 12) % 12;
const sortedUnique = (notes) => [...new Set(notes)].sort((a, b) => a - b);
const round = (t) => Math.round(t * 1000) / 1000;

/** Notes de la carte, main par main (voicing de l'exercice, doublures comprises). */
export function cardHands(chord) {
  const v = chord?.voicing;
  if (v && (v.leftHand?.length || v.rightHand?.length)) {
    return { lh: sortedUnique(v.leftHand || []), rh: sortedUnique(v.rightHand || []) };
  }
  return { lh: [], rh: sortedUnique(chord?.notes || []) };
}

/**
 * Main gauche en stride (basse puis accord) : la carte d'un Stride, ou une main
 * gauche trop large pour être tenue d'un bloc. Coupée au plus grand écart :
 * { bass, chord }, ou null.
 */
export function strideSplit(chord, lh) {
  if (lh.length < 2) return null;
  const isStride = chord?.voicing?.technique === 'stride' || chord?.voicing?.familyId === 'stride';
  if (!isStride && lh[lh.length - 1] - lh[0] <= HAND_SPAN) return null;
  let cut = 1;
  for (let k = 1; k < lh.length; k += 1) if (lh[k] - lh[k - 1] > lh[cut] - lh[cut - 1]) cut = k;
  return { bass: lh.slice(0, cut), chord: lh.slice(cut) };
}

/** Classes de hauteur de l'accord (demi-tons depuis la fondamentale), notes de la carte comprises. */
function chordTones(chord) {
  let tones;
  try {
    tones = new Set(chord.symbol != null ? chordToneIntervals(chord.symbol) : []);
  } catch (e) {
    tones = new Set();
  }
  const { lh, rh } = cardHands(chord);
  [...lh, ...rh].forEach((n) => tones.add(pcOf(n - chord.rootPc)));
  return tones;
}

/**
 * Vrai si la quinte juste va avec l'accord : ni quinte altérée, ni b13, ni
 * alt / dim / aug (d'après le nom : la #11 de Bbmaj7#11 n'empêche pas le Fa).
 */
function naturalFifth(chord) {
  return !/b5|#5|b13|alt|aug|dim/.test(String(chord.symbol ?? ''));
}

/** Vrai pour un accord de dominante (tierce majeure ou quarte suspendue, et 7e mineure). */
function isDominant(chord) {
  const tones = chordTones(chord);
  return tones.has(10) && (tones.has(4) || (tones.has(5) && !tones.has(3))) && !/^m|dim/.test(String(chord.symbol ?? ''));
}

/**
 * Note jouée avec la fondamentale par la main gauche : la 7e mineure sur une
 * dominante (G2 F3, F#2 E3 dans le tutoriel gospel), la quinte juste ailleurs
 * (C2 G2, D2 A2, Bb2 F3), sinon la septième ou l'octave.
 */
function bassPartner(chord) {
  if (isDominant(chord)) return 10;
  if (naturalFifth(chord)) return 7;
  const tones = chordTones(chord);
  return [10, 11, 9].find((i) => tones.has(i)) ?? 12;
}

/**
 * Basse d'une main gauche libre, au moins une tierce mineure sous la main
 * droite : 'fifth' = fondamentale + quinte (7e sur une dominante, septième ou
 * octave si la quinte est altérée), 'root' = fondamentale seule. Fondamentale
 * entre Do2 et Si2, comme dans le tutoriel gospel (C2 G2, F2 C3, D2 A2) ; une
 * octave plus haut si l'intervalle serait boueux (7e mineure sous Fa2, Levine),
 * la fondamentale seule si la seconde note heurterait la main droite.
 * @returns {number[]}
 */
export function freeBass(chord, kind = 'root', rhLow = 60) {
  const partner = bassPartner(chord);
  const shape = (root) => (kind === 'fifth' ? [root, root + partner] : [root]);
  const fits = (notes) => notes[0] >= LOWEST_BASS && Math.max(...notes) <= rhLow - 3 && respectsLowIntervalLimits(notes);
  const root = 36 + pcOf(chord.rootPc); // Do2 (36) … Si2 (47)
  // Dans l'ordre : la paire à l'octave 2 ; une octave plus haut si elle y serait
  // boueuse ; la fondamentale seule (la seconde note heurterait la main droite) ;
  // la fondamentale une octave plus bas.
  return [shape(root), shape(root + 12), [root], [root - 12]].find(fits) ?? [];
}

/**
 * Main droite « en cadre d'octave » (tutoriel gospel : C4 E4 G4 A4 C5, D4 F4
 * G#4 B4 D5 ; Narcisse double aussi le Do de son Cadd9) : la note du dessus
 * doublée une octave plus bas, si la main tient toujours (une octave, cinq
 * doigts), sans seconde mineure contre une autre note, pas sous Fa3 et
 * au-dessus de la main gauche. Sinon la main droite telle quelle.
 * @returns {number[]}
 */
export function octaveFrame(rh, lhTop = -Infinity) {
  if (rh.length < 2 || rh.length >= 5) return rh;
  const top = rh[rh.length - 1];
  const double = top - 12;
  // Pas sous Fa3 : plus bas, la main droite empâterait la basse.
  if (rh.includes(double) || double < 53 || double <= lhTop + 2 || top - Math.min(double, rh[0]) > 12) return rh;
  if (rh.some((n) => Math.abs(n - double) === 1)) return rh;
  return sortedUnique([double, ...rh]);
}

/**
 * Accord de passage du 4e temps (tutoriel gospel, vidéo de Narcisse) : un
 * diminué qui mène à l'accord suivant, basse chromatique.
 *   - la basse monte d'un ton (C → Dm) : diminué sur le demi-ton entre les deux (C#°7) ;
 *   - la basse monte d'une quarte (Em → Am, Dm → G) : diminué sur la sensible de
 *     l'accord suivant (G#°7, F#°7) ;
 *   - rien après une dominante, qui mène déjà à l'accord suivant.
 * Ses notes sont les plus proches de celles de l'accord en cours (chaque voix
 * bouge d'un ou deux demi-tons) ; la basse est prise à côté de la basse actuelle.
 * @returns {{lh: number[], rh: number[], rootPc: number}|null}
 */
export function passingDiminished(chord, next, hands, nextHands = null) {
  if (!next || chord.rootPc == null || next.rootPc == null || !hands.rh.length || !hands.lh.length) return null;
  if (/dim/.test(String(chord.symbol ?? '')) || /dim/.test(String(next.symbol ?? ''))) return null;
  // Une dominante mène déjà à l'accord suivant : pas de diminué en plus (G7 → B°7 → C).
  if (isDominant(chord)) return null;
  const move = pcOf(next.rootPc - chord.rootPc);
  let rootPc;
  if (move === 2) rootPc = pcOf(chord.rootPc + 1);
  else if (move === 5) rootPc = pcOf(next.rootPc - 1);
  else return null;
  const tones = [0, 3, 6, 9].map((i) => pcOf(rootPc + i));
  const nearest = (n, taken) => {
    let best = null;
    for (let d = 0; d <= 3 && best == null; d += 1) {
      for (const m of [n - d, n + d]) {
        if (best == null && tones.includes(pcOf(m)) && !taken.includes(m)) best = m;
      }
    }
    return best;
  };
  const rh = [];
  hands.rh.forEach((n) => {
    const m = nearest(n, rh);
    if (m != null) rh.push(m);
  });
  // Basse chromatique : un demi-ton sous la basse suivante (sensible), sinon
  // un demi-ton au-dessus de la basse actuelle (C2 → C#2 → D2).
  const bass = hands.lh[0];
  const nextBass = nextHands?.lh?.length ? nextHands.lh[0] : null;
  const bassNote = [nextBass != null ? nextBass - 1 : null, bass + 1, bass - 1]
    .find((m) => m != null && m >= LOWEST_BASS && pcOf(m) === rootPc)
    ?? bass + ((rootPc - pcOf(bass) + 18) % 12) - 6;
  const sorted = sortedUnique(rh);
  if (sorted.length < 3 || sorted[0] <= bassNote + 2 || sorted[sorted.length - 1] - sorted[0] > 14) return null;
  return { lh: [bassNote], rh: sorted, rootPc };
}

/**
 * Mains de la démo : la carte, plus la basse du style quand la main gauche est
 * libre, ou la fondamentale quand la main gauche la tient avec ses notes (une
 * octave au plus). Jamais de troisième main : un Drop 2-4 de Gm11 (G3 C4 |
 * Bb4 F5) reste tel quel, G2 ne tiendrait pas avec C4.
 * @param {object} chord - accord de l'exercice ({rootPc, symbol, voicing, notes})
 * @param {'fifth'|'root'|'none'} bassKind
 * @returns {{lh: number[], rh: number[], bass: number[], stride?: {bass: number[], chord: number[]}, freeLeft?: boolean}}
 *   bass = notes de basse ajoutées ou portées par la main gauche ; stride = main gauche en deux temps ;
 *   freeLeft = la main gauche ne joue que la basse de la démo
 */
export function demoHands(chord, bassKind = 'root') {
  const { lh, rh } = cardHands(chord);
  const stride = strideSplit(chord, lh);
  // Stride : la basse est déjà là, jouée seule avant l'accord.
  if (stride) return { lh, rh, bass: stride.bass, stride };
  if (bassKind === 'none' || chord?.rootPc == null) return { lh, rh, bass: [] };
  if (lh.length === 0) {
    const bass = freeBass(chord, bassKind, rh.length ? rh[0] : 60);
    return { lh: bass, rh, bass, freeLeft: true };
  }
  // Rootless à une main (sans fondamentale, main droite libre) : au piano seul,
  // il se joue à la main droite au-dessus de la basse (mêmes notes que la carte).
  if (rh.length === 0 && lh.length >= 3 && !lh.some((n) => pcOf(n) === pcOf(chord.rootPc))) {
    const bass = freeBass(chord, bassKind, lh[0]);
    if (bass.length) return { lh: bass, rh: lh, bass, freeLeft: true };
  }
  const low = lh[0];
  if (pcOf(low) === pcOf(chord.rootPc) && low <= 52) return { lh, rh, bass: [low] };
  const high = lh[lh.length - 1];
  for (let r = low - 1; r >= LOWEST_BASS && high - r <= HAND_REACH; r -= 1) {
    if (pcOf(r) !== pcOf(chord.rootPc)) continue;
    return respectsLowIntervalLimits([r, ...lh]) ? { lh: [r, ...lh], rh, bass: [r] } : { lh, rh, bass: [] };
  }
  return { lh, rh, bass: [] };
}

/**
 * Note voisine de la voix du dessus, vers le dessus de l'accord suivant : une
 * note de l'accord à un ou deux demi-tons, sans seconde ni neuvième mineure
 * contre les autres notes tenues. null si rien ne convient (ou si le dessus ne
 * bouge pas).
 * @returns {number|null}
 */
export function topNeighbour(chord, lh, rh, nextTop) {
  if (rh.length < 2 || nextTop == null) return null;
  const top = rh[rh.length - 1];
  const direction = Math.sign(nextTop - top);
  if (direction === 0) return null;
  const tones = chordTones(chord);
  const others = [...lh, ...rh.slice(0, -1)];
  for (const step of [1, 2]) {
    const n = top + direction * step;
    if (n > TOP_LIMIT || others.includes(n) || !tones.has(pcOf(n - chord.rootPc))) continue;
    if (others.some((o) => Math.abs(n - o) === 1 || n - o === 13)) continue;
    return n;
  }
  return null;
}

/**
 * Montée finale 1-2-5 (fondamentale, 9e, quinte) sur deux octaves, depuis le
 * bas de la main droite, terminée sur la fondamentale ; 1-3-5 sans 9e dans
 * l'accord ; rien si la quinte n'est pas juste.
 * @returns {number[]}
 */
export function finalRun(chord, rh, lh = []) {
  if (!rh.length || !naturalFifth(chord)) return [];
  const tones = chordTones(chord);
  const third = [4, 3].find((i) => tones.has(i));
  const middle = tones.has(2) ? 2 : third;
  if (middle == null) return [];
  // Au-dessus de la main gauche, qui tient sa basse pendant la montée.
  let start = Math.max(rh[0], lh.length ? lh[lh.length - 1] + 3 : 0);
  while (pcOf(start - chord.rootPc) !== 0) start += 1;
  const run = [];
  for (let octave = 0; octave < 2; octave += 1) [0, middle, 7].forEach((i) => run.push(start + octave * 12 + i));
  run.push(start + 24);
  // Trop haut : la montée s'arrête à la dernière fondamentale sous le plafond.
  while (run.length && (run[run.length - 1] > RUN_TOP || pcOf(run[run.length - 1] - chord.rootPc) !== 0)) run.pop();
  return run.length >= 4 ? run : [];
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Nom d'un diminué de passage : sa fondamentale est la sensible de l'accord
 * suivant, écrite sur la lettre du dessous (Ddim7 avant Eb, C#dim7 avant Dm,
 * Bdim7 avant C).
 */
export function passingName(next, rootPc) {
  const letter = /^([A-G])/.exec(String(next?.name ?? ''))?.[1];
  if (!letter) return `${SHARP_NAMES[pcOf(rootPc)]}dim7`;
  const below = LETTERS[(LETTERS.indexOf(letter) + 6) % 7];
  const shift = ((rootPc - LETTER_PC[below]) % 12 + 18) % 12 - 6;
  return `${below}${shift > 0 ? '#'.repeat(shift) : 'b'.repeat(-shift)}dim7`;
}

/** Diminué de passage joué après chaque accord (ou null), d'après les mains de la démo. */
function planPassing(chords, bars, beatsPerChord) {
  return chords.map((chord, i) => {
    if (i === chords.length - 1 || bars[i].stride || beatsPerChord < 4) return null;
    const found = passingDiminished(chord, chords[i + 1], bars[i], bars[i + 1]);
    return found ? { ...found, name: passingName(chords[i + 1], found.rootPc) } : null;
  });
}

/** Mains gospel / worship d'un accord : basse de la démo, main droite en cadre d'octave. */
function gospelHands(chord) {
  const hands = demoHands(chord, 'fifth');
  if (hands.stride) return hands;
  const lhTop = hands.lh.length ? hands.lh[hands.lh.length - 1] : -Infinity;
  return { ...hands, rh: octaveFrame(hands.rh, lhTop) };
}

/**
 * Plan du jeu gospel / worship : mains de chaque accord (main droite en cadre
 * d'octave) et diminués de passage.
 */
function planGospel(chords, beatsPerChord = 4) {
  const bars = chords.map(gospelHands);
  return { bars, passing: planPassing(chords, bars, beatsPerChord) };
}

/** Plan de la ballade : mains de la démo (sans cadre d'octave) et diminués de passage. */
function planBallade(chords, beatsPerChord = 4) {
  const bars = chords.map((chord) => demoHands(chord, 'fifth'));
  return { bars, passing: planPassing(chords, bars, beatsPerChord) };
}

// Styles qui jouent des diminués de passage (Narcisse : « ajoute aussi des
// accords de passage en ballade »).
const PASSING_PLANS = { gospel: planGospel, ballade: planBallade };

/**
 * Accords de passage que la démo joue dans ce style (Gospel / worship et
 * Ballade ; un style inconnu vaut Gospel, comme buildDemo), pour les montrer
 * dans la liste des accords : `after` = rang de l'accord qu'ils suivent.
 * @returns {{after: number, name: string, rootPc: number, lh: number[], rh: number[]}[]}
 */
export function demoPassingChords(chords, styleId) {
  const id = DEMO_STYLES[styleId] ? styleId : 'gospel';
  if (!chords?.length || !PASSING_PLANS[id]) return [];
  const { passing } = PASSING_PLANS[id](chords, DEMO_STYLES[id].beatsPerChord);
  return passing.flatMap((found, after) => (found ? [{ after, ...found }] : []));
}

/** Seconde note de la basse « en deux » du swing (3e temps) : la quinte, sous la fondamentale si elle frôle la main droite. */
function swingSecondBass(chord, root, rh) {
  const fifth = naturalFifth(chord) ? root + 7 : root + 12;
  const second = rh.length && fifth > rh[0] - 3 ? fifth - 12 : fifth;
  return second >= LOWEST_BASS ? second : root;
}

// [Claude] — 2026-09-24 — Main gauche d'un style comme option de l'exercice
// (Narcisse : la main gauche ajoutée par la démo gospel lui plaisait, mais le
// favori ne gardait que la main droite ; « des options […] décliné en fonction
// du style, pas seulement en fonction des démos »).
/** Styles qui donnent une main gauche à la carte (option « Main gauche » de l'exercice). */
export const LEFT_HAND_STYLES = ['gospel', 'ballade', 'swing'];

/**
 * Mains d'un style pour un accord de la carte — celles de la démo, sans le
 * rythme : Gospel / worship = fondamentale + quinte à l'octave 2 (7e sur une
 * dominante) et main droite en cadre d'octave ; Ballade = même basse, main
 * droite telle quelle ; Comping swing = fondamentale et quinte du jeu « en
 * deux ». `added` = notes absentes de la carte ; `movedToRight` = rootless à une
 * main joué à la main droite au-dessus de la basse.
 * @returns {{lh: number[], rh: number[], added: number[], movedToRight: boolean}|null}
 */
export function styleLeftHand(chord, style, { lift = true } = {}) {
  if (!LEFT_HAND_STYLES.includes(style)) return null;
  const kind = style === 'swing' ? 'root' : 'fifth';
  const card = cardHands(chord);
  let hands = demoHands(chord, kind);
  const movedToRight = card.lh.length > 0 && card.rh.length === 0 && hands.rh.length > 0;
  // Option de la carte (`lift`) : un rootless passé à la main droite mais resté
  // en registre de main gauche (sous Mi3 : D3 F#3 G#3 C#4 sur Bb2) monte d'une
  // octave, la basse suit. La démo, elle, joue les notes de la carte telles quelles.
  if (lift && movedToRight && hands.rh[0] < 52 && hands.rh[hands.rh.length - 1] + 12 <= 79) {
    const rh = hands.rh.map((n) => n + 12);
    const lh = freeBass(chord, kind, rh[0]);
    if (lh.length) hands = { ...hands, lh, rh, bass: lh };
  }
  if (style === 'gospel' && !hands.stride) {
    hands = { ...hands, rh: octaveFrame(hands.rh, hands.lh.length ? hands.lh[hands.lh.length - 1] : -Infinity) };
  } else if (style === 'swing' && hands.freeLeft && hands.lh.length) {
    hands = { ...hands, lh: sortedUnique([...hands.lh, swingSecondBass(chord, hands.lh[0], hands.rh)]) };
  }
  const onCard = new Set([...card.lh, ...card.rh]);
  return {
    lh: hands.lh,
    rh: hands.rh,
    added: [...hands.lh, ...hands.rh].filter((n) => !onCard.has(n)),
    movedToRight,
  };
}

/**
 * Ce que la démo joue pour l'accord `index` en plus de la carte (Narcisse : « la
 * démo ajoute aussi des basses quand le mini-key ne l'affiche pas forcément, je
 * le veux aussi ») : basse de la main gauche, note doublée à la main droite, et
 * voicing joué à la main droite (rootless à une main). null si la démo joue la
 * carte telle quelle (Plaqué, voicing déjà complet).
 * @returns {{lh: number[], rh: number[], bass: number[], doubled: number[], movedToRight: boolean}|null}
 */
export function demoCardHands(chords, index, styleId) {
  const chord = chords?.[index];
  if (!chord) return null;
  // Ce que la démo joue vraiment : pas de remontée d'octave (lift) ici.
  const hands = styleLeftHand(chord, DEMO_STYLES[styleId] ? styleId : 'gospel', { lift: false });
  if (!hands) return null;
  const bass = hands.lh.filter((n) => hands.added.includes(n));
  const doubled = hands.rh.filter((n) => hands.added.includes(n));
  if (!bass.length && !doubled.length && !hands.movedToRight) return null;
  return { lh: hands.lh, rh: hands.rh, bass, doubled, movedToRight: hands.movedToRight };
}

/**
 * Partition en cours d'écriture : appuis par main (égrenés du grave à l'aigu),
 * repères d'accord, triés à la fin. La nuance varie légèrement d'un accord à
 * l'autre, sans hasard (démo reproductible).
 */
function createScore() {
  const events = [];
  const score = {
    events,
    note(time, n, velocity, duration, hand) {
      events.push({ time: round(time), type: 'noteOn', note: n, velocity: Math.min(1, Math.max(0.3, velocity)), hand });
      events.push({ time: round(time + duration), type: 'noteOff', note: n, hand });
    },
    /**
     * Notes d'une main : égrenées de `roll` temps du grave à l'aigu, relevées
     * ensemble à `release` (temps absolu) ; la voix du dessus un peu plus fort.
     */
    hand(time, notes, velocity, release, { roll = 0, hand = 'rh', accentTop = 0 } = {}) {
      const sorted = [...notes].sort((a, b) => a - b);
      sorted.forEach((n, k) => {
        const start = time + k * roll;
        const accent = k === sorted.length - 1 ? accentTop : 0;
        score.note(start, n, velocity + accent, release - start, hand);
      });
    },
    step(time, i) {
      events.push({ time: round(time), type: 'step', step: i });
    },
    // Accord de passage joué après l'accord `after` (repère pour la liste des accords).
    passing(time, after) {
      events.push({ time: round(time), type: 'passing', passing: after });
    },
    shade(i, base) {
      return base + ((i % 3) - 1) * 0.03;
    },
    finish(beats) {
      events.sort((a, b) => a.time - b.time || order(a) - order(b));
      return { events, beats };
    },
  };
  return score;
}

/**
 * Main gauche d'une mesure : tenue d'un bloc jusqu'à `release`, ou en stride
 * (basse aux temps 1 et 3, accord aux temps 2 et 4) si la carte l'écrit ainsi.
 */
function playLeftHand(score, t, hands, velocity, release, { roll = 0, beatsPerChord = 4 } = {}) {
  if (!hands.stride) {
    score.hand(t, hands.lh, velocity, release, { roll, hand: 'lh' });
    return;
  }
  for (let beat = 0; beat < beatsPerChord; beat += 1) {
    const part = beat % 2 === 0 ? hands.stride.bass : hands.stride.chord;
    const stop = beat === beatsPerChord - 1 ? release : t + beat + 1 - LIFT;
    score.hand(t + beat, part, velocity - (beat % 2) * 0.06, stop, { roll: roll / 2, hand: 'lh' });
  }
}

/**
 * Démo gospel / worship d'une grille (voir l'en-tête).
 * @param {{name: string, rootPc: number, symbol?: string, notes: number[], voicing?: {leftHand: number[], rightHand: number[]}}[]} chords - accords de l'exercice
 * @param {{beatsPerChord?: number}} [options]
 * @returns {{events: {time: number, type: 'noteOn'|'noteOff'|'step'|'passing', note?: number, velocity?: number, hand?: 'lh'|'rh', step?: number, passing?: number}[], beats: number}}
 */
export function buildGospelDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore();
  // Main droite en cadre d'octave, diminués de passage (voir planGospel).
  const { bars, passing: passingChords } = planGospel(chords, beatsPerChord);
  let end = chords.length * beatsPerChord;
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const hands = bars[i];
    const { lh, rh } = hands;
    const last = i === chords.length - 1;
    // Premier accord égrené lentement, comme dans la vidéo ; les suivants vite.
    const roll = i === 0 ? 0.12 : 0.05;
    const rhStart = t + (lh.length ? roll : 0);
    score.step(t, i);
    if (last) {
      const release = t + beatsPerChord - LIFT;
      // Mélodie choisie sur le dernier accord : elle finit la démo, pas de montée par-dessus.
      const run = hands.stride || chord.topInterval != null ? [] : finalRun(chord, rh, lh);
      const runStart = t + 1.5;
      const hold = t + beatsPerChord + 1;
      playLeftHand(score, t, hands, score.shade(i, 0.6), run.length ? hold : release, { roll, beatsPerChord });
      score.hand(rhStart, rh, score.shade(i, 0.52), run.length ? runStart - LIFT : release, { roll: roll * 1.5, accentTop: 0.08 });
      // Montée 1-2-5 : chaque note tenue jusqu'à la suivante, la dernière jusqu'au bout.
      run.forEach((n, k) => {
        const start = runStart + k * 0.25;
        const stop = k === run.length - 1 ? hold : start + 0.27;
        score.note(start, n, 0.46 + k * 0.03, stop - start, 'rh');
      });
      if (run.length) end = hold + LIFT;
      return;
    }
    // Accord de passage au 4e temps : diminué vers l'accord suivant.
    const passing = passingChords[i];
    const held = passing ? beatsPerChord - 1 : beatsPerChord;
    const release = t + held - LIFT;
    playLeftHand(score, t, hands, score.shade(i, 0.6), release, { roll, beatsPerChord: held });
    const followTop = passing ? passing.rh : bars[i + 1].rh;
    // Note du dessus choisie par l'utilisateur (voice leading) : pas de broderie, la mélodie est la sienne.
    const neighbour = chord.topInterval != null ? null : topNeighbour(chord, lh, rh, followTop.length ? followTop[followTop.length - 1] : null);
    if (neighbour == null) {
      score.hand(rhStart, rh, score.shade(i, 0.52), release, { roll, accentTop: 0.08 });
    } else {
      // Voix du dessus tenue jusqu'au 3e temps, puis glissée vers la voisine.
      const inner = rh.slice(0, -1);
      const top = rh[rh.length - 1];
      const topStart = rhStart + inner.length * roll;
      score.hand(rhStart, inner, score.shade(i, 0.52), release, { roll });
      score.note(topStart, top, score.shade(i, 0.6), t + 2 - LIFT - topStart, 'rh');
      score.note(t + 2, neighbour, score.shade(i, 0.54), release - (t + 2), 'rh');
    }
    if (passing) {
      const p = t + beatsPerChord - 1;
      score.passing(p, i);
      score.hand(p, passing.lh, score.shade(i, 0.54), t + beatsPerChord - LIFT, { hand: 'lh' });
      score.hand(p + 0.03, passing.rh, score.shade(i, 0.46), t + beatsPerChord - LIFT, { roll: 0.03, accentTop: 0.06 });
    }
  });
  return score.finish(end);
}

/**
 * Démo ballade : main gauche tenue, main droite arpégée du grave à l'aigu à
 * partir du « et » du 1er temps (chaque doigt reste posé), les deux notes du
 * dessus reprises au 3e temps ; au 4e, un diminué de passage arpégé doucement
 * quand la basse monte d'un ton ou d'une quarte (comme en Gospel / worship).
 */
export function buildBalladeDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore();
  const { bars, passing: passingChords } = planBallade(chords, beatsPerChord);
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const hands = bars[i];
    const { rh } = hands;
    const last = i === chords.length - 1;
    const passing = passingChords[i];
    const held = passing ? beatsPerChord - 1 : beatsPerChord;
    const release = t + held - LIFT;
    score.step(t, i);
    playLeftHand(score, t, hands, score.shade(i, 0.55), release, { roll: 0.08, beatsPerChord: held });
    // Arpège : plus lent sur l'accord final, qui conclut.
    const stepBeats = (last ? 0.33 : 0.25) * (rh.length > 4 ? 0.8 : 1);
    const retake = last ? [] : rh.slice(-2);
    rh.forEach((n, k) => {
      const start = t + 0.5 + k * stepBeats;
      const stop = retake.includes(n) ? t + 2 - LIFT : release;
      score.note(start, n, score.shade(i, 0.44 + k * 0.03), stop - start, 'rh');
    });
    // 3e temps : les deux notes du dessus reprises, plus doucement.
    retake.forEach((n, k) => {
      const start = t + 2 + k * 0.02;
      score.note(start, n, score.shade(i, 0.4 + k * 0.04), release - start, 'rh');
    });
    if (passing) {
      const p = t + beatsPerChord - 1;
      score.passing(p, i);
      score.hand(p, passing.lh, score.shade(i, 0.5), t + beatsPerChord - LIFT, { hand: 'lh' });
      score.hand(p + 0.08, passing.rh, score.shade(i, 0.42), t + beatsPerChord - LIFT, { roll: 0.08, accentTop: 0.04 });
    }
  });
  return score.finish(chords.length * beatsPerChord);
}

/**
 * Démo comping swing : rythme « Charleston » (1er temps, puis « et » du 2e en
 * croche swinguée) ; main gauche libre : fondamentale au 1er temps et quinte au
 * 3e ; sinon la main gauche de la carte accompagne avec la droite. Le dernier
 * accord est tenu.
 */
export function buildSwingDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore();
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const hands = demoHands(chord, 'root');
    const { lh, rh } = hands;
    const free = Boolean(hands.freeLeft);
    const last = i === chords.length - 1;
    const offbeat = t + 1 + SWING_OFFBEAT;
    score.step(t, i);
    if (last) {
      playLeftHand(score, t, hands, score.shade(i, 0.6), t + beatsPerChord - 1, { roll: 0.02, beatsPerChord: beatsPerChord - 1 });
      score.hand(t, rh, score.shade(i, 0.58), t + beatsPerChord - 1, { roll: 0.01, accentTop: 0.05 });
      return;
    }
    if (free && lh.length) {
      // Jeu « en deux » : fondamentale au 1er temps, quinte au 3e (sous la
      // fondamentale si elle frôlerait la main droite).
      const root = lh[0];
      score.note(t, root, score.shade(i, 0.62), 0.9, 'lh');
      score.note(t + 2, swingSecondBass(chord, root, rh), score.shade(i, 0.56), 0.9, 'lh');
    } else if (hands.stride) {
      playLeftHand(score, t, hands, score.shade(i, 0.58), t + beatsPerChord - LIFT, { roll: 0.02, beatsPerChord });
    } else {
      score.hand(t, lh, score.shade(i, 0.56), t + 0.55, { roll: 0.01, hand: 'lh' });
      score.hand(offbeat, lh, score.shade(i, 0.62), offbeat + 0.9, { roll: 0.01, hand: 'lh' });
    }
    score.hand(t, rh, score.shade(i, 0.56), t + 0.55, { roll: 0.01, accentTop: 0.05 });
    // Anticipation du 2e temps, accentuée.
    score.hand(offbeat, rh, score.shade(i, 0.64), offbeat + 0.9, { roll: 0.01, accentTop: 0.05 });
  });
  return score.finish(chords.length * beatsPerChord);
}

/** Démo plaquée : la carte seule (les deux mains), tenue toute la mesure. */
export function buildPlaqueDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore();
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const { lh, rh } = cardHands(chord);
    const stride = strideSplit(chord, lh);
    const release = t + beatsPerChord - 0.08;
    score.step(t, i);
    if (stride) {
      // Stride : la basse au 1er temps, puis l'accord tenu (une main ne tient pas les deux).
      score.hand(t, stride.bass, score.shade(i, 0.56), t + 1 - LIFT, { hand: 'lh' });
      score.hand(t + 1, stride.chord, score.shade(i, 0.52), release, { roll: 0.01, hand: 'lh' });
    } else {
      score.hand(t, lh, score.shade(i, 0.56), release, { roll: 0.01, hand: 'lh' });
    }
    score.hand(t + (lh.length ? 0.01 : 0), rh, score.shade(i, 0.56), release, { roll: 0.01, accentTop: 0.04 });
  });
  return score.finish(chords.length * beatsPerChord);
}

// À temps égal : relâcher avant de rejouer, repère d'accord avant ses notes.
function order(e) {
  if (e.type === 'noteOff') return 0;
  if (e.type === 'step' || e.type === 'passing') return 1;
  return 2;
}

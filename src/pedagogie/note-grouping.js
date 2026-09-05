// [Claude] — 2026-09-05 — Pédagogie IA : des touches lues aux segments harmoniques.
//
// POURQUOI CE MODULE EXISTE, ET CE QU'IL CORRIGE.
// Nommer l'accord d'une seule image donne souvent un résultat littéralement
// juste mais harmoniquement pauvre : dans le tutoriel de référence, la main
// gauche tient fondamentale + quinte pendant que la mélodie amène la tierce
// plus tard. Une lecture instantanée à t=5 s voit {ré, la} et répond « ré5 »
// (accord de quinte à vide) là où la grille de référence dit « ré majeur ».
// Ce n'est pas une erreur de lecture — c'est vraiment ce qui sonne à cet
// instant — mais ce n'est pas la bonne granularité pour une fiche de cours.
//
// On agrège donc sur la durée. La segmentation suit la BASSE : dans ce type de
// tutoriel, la main gauche pose la fondamentale et la tient pendant que la
// mélodie bouge au-dessus. Un changement de basse est le signal de changement
// d'harmonie ; les notes rencontrées pendant le segment sont réunies pour
// nommer l'accord.
//
// Module pur : pas de DOM, pas de moteur d'accords, pas d'IPC. Il ne nomme
// aucun accord — il produit des segments et des jeux de notes. Le nommage vit
// dans chord-labeling.js, ce qui permet de tester la segmentation seule.

export const DEFAULT_GROUPING_OPTIONS = {
  // Une note doit être vue sur au moins tant d'échantillons consécutifs pour
  // compter : sous ce seuil, c'est un scintillement de compression, pas un jeu.
  minRun: 2,
  // Lissage de la basse : fenêtre médiane, en nombre d'échantillons.
  bassSmoothing: 3,
  // Un segment plus court que ça est fusionné avec son voisin.
  minSegmentSec: 0.6,
  // Part minimale du segment pendant laquelle une note doit sonner pour entrer
  // dans le jeu de notes retenu. Écarte les notes de passage de la mélodie,
  // qui sinon transformeraient chaque accord en agrégat de sept notes.
  //
  // 0,30 n'est pas un chiffre choisi a priori : il vient de la mesure des taux
  // de présence sur le fichier de référence. Les notes d'accompagnement y sont
  // tenues à 100 % du segment ; la tierce apportée par la mélodie tourne autour
  // de 39 % à 72 % ; les notes de passage restent sous 25 %. Un seuil à 0,22
  // laissait entrer une neuvième de passage (« ré add9 » là où la grille dit
  // « ré ») ; à 0,30 la tierce est conservée et la note de passage écartée.
  // Ce réglage est calibré sur UN fichier : à revoir sur d'autres tutoriels.
  minPresenceRatio: 0.30,
};

/**
 * Médiane d'un tableau de nombres (retourne null si vide).
 * @param {number[]} values
 * @returns {number|null}
 */
export function median(values) {
  if (!values || values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Nettoie une suite d'échantillons : une note isolée sur une seule image est
 * écartée, un trou d'une image ne coupe pas une note tenue.
 *
 * @param {{t: number, keys: {midi: number}[]}[]} samples
 * @param {object} [options]
 * @returns {{t: number, midis: number[]}[]}
 */
export function denoiseSamples(samples, options = {}) {
  const opts = { ...DEFAULT_GROUPING_OPTIONS, ...options };
  const list = (samples || []).map((s) => ({
    t: s.t,
    set: new Set((s.keys || []).map((k) => k.midi)),
  }));

  // Longueur de la plage courante pour chaque note, dans les deux sens.
  const allMidis = new Set();
  for (const s of list) for (const m of s.set) allMidis.add(m);

  const keep = list.map(() => new Set());
  for (const midi of allMidis) {
    let runStart = -1;
    for (let i = 0; i <= list.length; i++) {
      const on = i < list.length && list[i].set.has(midi);
      if (on && runStart < 0) runStart = i;
      else if (!on && runStart >= 0) {
        if (i - runStart >= opts.minRun) {
          for (let j = runStart; j < i; j++) keep[j].add(midi);
        }
        runStart = -1;
      }
    }
  }
  return list.map((s, i) => ({ t: s.t, midis: [...keep[i]].sort((a, b) => a - b) }));
}

/**
 * Suite des basses lissée. La basse d'un instant est la note la plus grave qui
 * sonne ; le lissage médian évite qu'une note de passage grave ne découpe un
 * segment en deux.
 *
 * @param {{t: number, midis: number[]}[]} samples
 * @param {object} [options]
 * @returns {(number|null)[]}
 */
export function bassLine(samples, options = {}) {
  const opts = { ...DEFAULT_GROUPING_OPTIONS, ...options };
  const raw = samples.map((s) => (s.midis.length > 0 ? s.midis[0] : null));
  const half = Math.floor(opts.bassSmoothing / 2);
  if (half < 1) return raw;
  return raw.map((_, i) => {
    const window = [];
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < raw.length && raw[j] !== null) window.push(raw[j]);
    }
    return median(window);
  });
}

/**
 * Découpe la suite d'échantillons en segments harmoniques.
 *
 * @param {{t: number, keys: {midi: number}[]}[]} samples
 * @param {object} [options]
 * @param {number} [options.sampleInterval] - pas entre deux échantillons, en s
 * @returns {{
 *   start: number, end: number, duration: number,
 *   midis: number[], bassMidi: number|null,
 *   presence: Record<number, number>, sampleCount: number
 * }[]}
 */
export function groupSegments(samples, options = {}) {
  const opts = { ...DEFAULT_GROUPING_OPTIONS, ...options };
  if (!samples || samples.length === 0) return [];

  const clean = denoiseSamples(samples, opts);
  const bass = bassLine(clean, opts);
  const interval = Number.isFinite(opts.sampleInterval)
    ? opts.sampleInterval
    : (clean.length > 1 ? clean[1].t - clean[0].t : 0.25);

  // 1. Frontières : changement de classe de hauteur de la basse.
  //    On compare les classes et non les hauteurs absolues : passer de la2 à
  //    la3 est un changement d'octave à la main gauche, pas d'harmonie.
  const bounds = [0];
  for (let i = 1; i < clean.length; i++) {
    const prev = bass[i - 1];
    const cur = bass[i];
    if (prev === null && cur === null) continue;
    if (prev === null || cur === null) { bounds.push(i); continue; }
    if (((prev % 12) + 12) % 12 !== ((cur % 12) + 12) % 12) bounds.push(i);
  }
  bounds.push(clean.length);

  // 2. Construire les segments bruts.
  let segments = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const from = bounds[b];
    const to = bounds[b + 1];
    if (to <= from) continue;
    segments.push(makeSegment(clean, from, to, interval, opts));
  }

  // 3. Fusionner les segments trop courts pour être une harmonie : ils sont
  //    absorbés par le voisin le plus long, ce qui évite qu'un doigt qui
  //    traîne ne crée un accord fantôme.
  segments = mergeShort(segments, clean, interval, opts);

  return segments.filter((s) => s.midis.length > 0);
}

function makeSegment(clean, from, to, interval, opts) {
  const start = clean[from].t;
  const end = clean[to - 1].t + interval;
  const count = to - from;
  const presence = new Map();
  for (let i = from; i < to; i++) {
    for (const m of clean[i].midis) presence.set(m, (presence.get(m) || 0) + 1);
  }
  // Une note n'entre dans l'accord que si elle sonne une part suffisante du
  // segment : sans ce filtre, chaque note de passage de la mélodie viendrait
  // enrichir l'accord et le rendrait méconnaissable.
  const kept = [...presence.entries()]
    .filter(([, n]) => n / count >= opts.minPresenceRatio)
    .map(([m]) => m)
    .sort((a, b) => a - b);
  const presenceObj = {};
  for (const [m, n] of presence) presenceObj[m] = n / count;
  return {
    start,
    end,
    duration: end - start,
    midis: kept,
    bassMidi: kept.length > 0 ? kept[0] : null,
    presence: presenceObj,
    sampleCount: count,
    fromIndex: from,
    toIndex: to,
  };
}

function mergeShort(segments, clean, interval, opts) {
  let changed = true;
  let list = segments;
  while (changed && list.length > 1) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].duration >= opts.minSegmentSec) continue;
      const prev = list[i - 1];
      const next = list[i + 1];
      let target;
      if (!prev) target = i + 1;
      else if (!next) target = i - 1;
      else target = prev.duration >= next.duration ? i - 1 : i + 1;
      const a = Math.min(i, target);
      const b = Math.max(i, target);
      const merged = makeSegment(clean, list[a].fromIndex, list[b].toIndex, interval, opts);
      list = [...list.slice(0, a), merged, ...list.slice(b + 1)];
      changed = true;
      break;
    }
  }
  return list;
}

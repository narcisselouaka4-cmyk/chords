// [Claude] — 2026-10-09 — Pédagogie IA : la force de chaque note rejouée (vélocité).
//
// Narcisse : « Copilot reproduit bien les notes mais ça manque de vélocité. Il faudrait une vraie
// variation, car tous les accords ne sont pas plaqués ni appuyés de la même façon. » Il proposait
// deux voies : la lire sur la vidéo, ou s'appuyer sur la façon dont jouent les pianistes.
//
// On fait les deux, dans cet ordre :
//   1. MESURÉ — `velocitiesFromLoudness` : l'image d'un clavier dessiné ne montre pas la force
//      (les touches s'allument toutes pareil), mais le SON de la vidéo, oui. À chaque attaque, le
//      niveau atteint juste après (IPC pedagogie:loudness, dB toutes les 10 ms) dit si l'accord
//      a été plaqué fort ou effleuré. Le niveau est rapporté au passage (du plus doux au plus
//      fort du morceau), pas à une échelle absolue : chaque vidéo a son propre volume.
//   2. RÈGLES DE PIANISTE — `shapeDynamics`, appliquées à toutes les notes, mesurées ou non :
//      dans un accord, la note du dessus chante et les voix intérieures s'effacent ; la basse
//      reste ferme ; les notes d'approche (grace notes) et les notes d'un run sont plus légères ;
//      une note seule (une ligne) un peu sous un accord plaqué ; et une variation de quelques
//      pour cent, toujours la même pour la même note, pour qu'aucune attaque ne soit identique.
//      Sans mesure (une analyse enregistrée avant ce changement), ces règles seules donnent le
//      relief.
//
// Module PUR, testé par test-dynamics.js. Vélocités entre 0 et 1 (copilot-demo.js les borne
// à 0,3 au moins à la lecture).

/** Notes attaquées ensemble (un accord), en s. */
const TOGETHER = 0.06;
/** Fenêtre (s) où l'on cherche le pic d'une attaque : un peu avant (l'image retarde parfois). */
const PEAK_BEFORE = 0.03;
const PEAK_AFTER = 0.12;
/** Vélocités du plus doux au plus fort du passage (attaques mesurées). */
const MEASURED_LOW = 0.4;
const MEASURED_HIGH = 0.95;
/** Écart minimal (dB) entre attaque douce et forte pour que la mesure ait un sens. */
const MIN_SPREAD_DB = 3;

/** Base sans mesure : un accord plaqué, une note seule. */
const BASE_CHORD = 0.72;
const BASE_SINGLE = 0.66;
/** Dans un accord : la note du dessus ressort, les voix intérieures s'effacent, la basse tient. */
const TOP_LIFT = 0.07;
const INNER_DROP = 0.05;
const BASS_LIFT = 0.02;
/** Notes d'approche et notes de run : plus légères ; la note d'arrivée d'un run, non. */
const APPROACH_DROP = 0.12;
/** Variation « humaine » (±). */
const HUMANIZE = 0.03;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Groupes d'attaques (accords), notes triées par début. */
function attackGroups(notes) {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const groups = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last && n.start - last[0].start <= TOGETHER) last.push(n);
    else groups.push([n]);
  }
  return groups;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = clamp(Math.round((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[i];
}

/**
 * Vélocité mesurée de chaque attaque, d'après le volume du son.
 * @param {{midi: number, start: number}[]} notes
 * @param {{hop: number, db: number[]}|null} loudness - IPC pedagogie:loudness
 * @returns {Map<object, number>} note → vélocité (0..1) ; vide si la mesure n'a pas de sens
 *   (pas de son, ou un volume trop uniforme pour distinguer quoi que ce soit)
 */
export function velocitiesFromLoudness(notes, loudness) {
  const out = new Map();
  const hop = Number(loudness?.hop);
  const db = loudness?.db;
  if (!(hop > 0) || !Array.isArray(db) || !db.length) return out;
  const valid = (notes || []).filter((n) => Number.isFinite(n?.start) && Number.isFinite(n?.midi));
  const groups = attackGroups(valid);
  const peaks = groups.map((g) => {
    const t = g[0].start;
    const a = clamp(Math.floor((t - PEAK_BEFORE) / hop), 0, db.length - 1);
    const b = clamp(Math.ceil((t + PEAK_AFTER) / hop), 0, db.length - 1);
    let peak = -Infinity;
    for (let i = a; i <= b; i += 1) if (db[i] > peak) peak = db[i];
    return peak;
  });
  const finitePeaks = peaks.filter(Number.isFinite).sort((x, y) => x - y);
  if (finitePeaks.length < 2) return out;
  // Du plus doux au plus fort du passage, sans se laisser tirer par un cri ou un silence.
  const lo = quantile(finitePeaks, 0.1);
  const hi = quantile(finitePeaks, 0.9);
  if (hi - lo < MIN_SPREAD_DB) return out;
  groups.forEach((g, k) => {
    if (!Number.isFinite(peaks[k])) return;
    const v = MEASURED_LOW + (MEASURED_HIGH - MEASURED_LOW) * clamp((peaks[k] - lo) / (hi - lo), 0, 1);
    for (const n of g) out.set(n, Math.round(v * 1000) / 1000);
  });
  return out;
}

/** Variation stable d'une note (même note, même instant → même variation). */
function humanize(n) {
  const seed = Math.round(n.start * 1000) * 131 + n.midi * 17;
  const x = Math.sin(seed) * 10000;
  return (x - Math.floor(x) - 0.5) * 2 * HUMANIZE;
}

/**
 * La vélocité de chaque note, d'après sa force mesurée (ou la base d'un accord / d'une note
 * seule) et les règles de pianiste.
 * @param {{midi: number, start: number, hand?: string, velocity?: number}[]} notes
 * @param {{light?: Set<object>, measured?: Map<object, number>}} [options]
 *   - light : notes jouées plus légèrement (notes d'approche et de run : approachNotes)
 *   - measured : vélocités mesurées (velocitiesFromLoudness), prioritaires sur n.velocity
 * @returns {Map<object, number>}
 */
export function shapeDynamics(notes, { light = new Set(), measured = new Map() } = {}) {
  const out = new Map();
  const valid = (notes || []).filter((n) => Number.isFinite(n?.start) && Number.isFinite(n?.midi));
  for (const g of attackGroups(valid)) {
    const chord = g.length >= 3;
    const byPitch = [...g].sort((a, b) => a.midi - b.midi);
    const top = byPitch[byPitch.length - 1];
    const bass = byPitch[0];
    for (const n of g) {
      const known = measured.get(n) ?? (Number.isFinite(n.velocity) ? n.velocity : null);
      let v = known ?? (chord ? BASE_CHORD : BASE_SINGLE);
      if (g.length >= 2) {
        if (n === top) v += TOP_LIFT;
        else if (n === bass) v += BASS_LIFT;
        else v -= INNER_DROP;
      }
      if (light.has(n)) v -= APPROACH_DROP;
      v += humanize(n);
      out.set(n, Math.round(clamp(v, 0.25, 1) * 1000) / 1000);
    }
  }
  return out;
}

/**
 * Les notes avec une vélocité mesurée au son, quand elles n'en ont pas déjà une qui varie
 * (relevé au son : la vélocité du modèle de transcription est gardée).
 * @param {object[]} notes - notes du prof
 * @param {{hop: number, db: number[]}|null} loudness
 * @returns {object[]} les mêmes notes, complétées (nouveaux objets si une vélocité est posée)
 */
export function withMeasuredVelocity(notes, loudness) {
  const list = notes || [];
  const known = list.map((n) => n.velocity).filter(Number.isFinite);
  if (known.length >= list.length * 0.8 && known.length > 1) {
    const mean = known.reduce((a, b) => a + b, 0) / known.length;
    const spread = Math.sqrt(known.reduce((a, b) => a + (b - mean) ** 2, 0) / known.length);
    if (spread >= 0.03) return list; // déjà nuancées (relevé au son)
  }
  const measured = velocitiesFromLoudness(list, loudness);
  if (!measured.size) return list;
  return list.map((n) => (measured.has(n) ? { ...n, velocity: measured.get(n) } : n));
}

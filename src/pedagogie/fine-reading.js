// [Claude] — 2026-10-09 — Pédagogie IA : relire à pleine cadence les passages rapides.
//
// Narcisse : « entre 0:20 et 0:22 [Gospel Piano Harmony Secrets], le pianiste joue un lick
// archi rapide, il descend de l'octave 5 à l'octave 2 : l'application n'arrive pas du tout à
// suivre » ; et sur une salsa, « le groove n'y est pas ».
//
// MESURÉ sur ses relevés (fixtures/) : toutes les attaques tombent sur une grille de 0,12 s.
// Le clavier dessiné est lu à 8 images par seconde (`sampleFps: 8`, pedagogie-tab.js). Une
// descente de trois octaves en deux secondes, c'est plus de 20 notes, moins de 0,1 s chacune :
// entre deux images, plusieurs notes passent sans être vues. Et une double-croche de montuno
// à 190 à la noire dure 80 ms — moins qu'un pas de lecture : chaque attaque était déplacée
// jusqu'à 0,12 s, ce qui suffit à tuer le groove.
//
// Lire TOUTE la vidéo à 30 images/s coûterait environ quatre fois plus de transfert d'images
// pour rien sur les passages lents ou parlés. On garde donc la première lecture (8 i/s) et on
// relit à 30 i/s les seuls passages chargés : ceux où les attaques se suivent vite.
//
// Module PUR (testé par test-fine-reading.js) : main.js s'occupe d'ffmpeg.

/** Instants d'attaque par seconde à partir desquels un passage est relu finement… */
export const BUSY_ONSETS_PER_SECOND = 5;
/** … ou, dès 3 attaques par seconde, si au moins 2 notes n'ont été vues que sur UNE image (plus
 * brèves que deux pas de lecture) : un montuno de salsa à 8 i/s n'en montre que 3 par seconde,
 * toutes sur une image. Des accords tenus, eux, restent allumés plusieurs images. */
export const BUSY_MIN_ONSETS = 3;
export const BUSY_MIN_BRIEF = 2;
/** Fenêtre (s) sur laquelle on compte les attaques. */
export const BUSY_WINDOW_SECONDS = 1;
/** Marge (s) autour d'un passage chargé : l'entrée et la sortie du lick. */
export const BUSY_PAD_SECONDS = 0.5;
/** Deux passages séparés de moins d'une seconde n'en font qu'un (une seule relecture). */
export const BUSY_MERGE_GAP = 1;
/** Cadence de la relecture fine. */
export const FINE_FPS = 30;

/**
 * Instants des attaques d'une lecture : une touche allumée qui ne l'était pas à l'image d'avant.
 * @param {{t: number, keys: {midi: number}[]}[]} samples
 * @returns {number[]}
 */
export function sampleOnsets(samples) {
  const onsets = [];
  let previous = new Set();
  for (const s of samples || []) {
    const lit = new Set((s.keys || []).map((k) => k.midi));
    for (const midi of lit) if (!previous.has(midi)) onsets.push(Number(s.t) || 0);
    previous = lit;
  }
  return onsets;
}

/**
 * Les images où quelque chose s'attaque (un accord = un instant, pas une attaque par touche), et
 * pour chacune le nombre de notes qui n'y restent allumées que sur cette seule image.
 * @returns {{t: number, brief: number}[]}
 */
function attackInstants(samples) {
  const list = samples || [];
  const keysOf = (s) => new Set((s?.keys || []).map((k) => k.midi));
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const before = keysOf(list[i - 1]);
    const now = keysOf(list[i]);
    const after = keysOf(list[i + 1]);
    const fresh = [...now].filter((m) => !before.has(m));
    if (!fresh.length) continue;
    out.push({ t: Number(list[i].t) || 0, brief: fresh.filter((m) => !after.has(m)).length });
  }
  return out;
}

/**
 * Les passages à relire finement : là où au moins BUSY_ONSETS_PER_SECOND instants d'attaque tombent dans
 * une seconde (ou BUSY_MIN_ONSETS, dont BUSY_MIN_BRIEF notes vues sur une seule image). Bornés à la vidéo, élargis de BUSY_PAD_SECONDS, fusionnés s'ils se touchent.
 * @param {{t: number, keys: {midi: number}[]}[]} samples - première lecture
 * @param {{duration?: number}} [options]
 * @returns {{start: number, end: number}[]}
 */
export function busyWindows(samples, { duration = Infinity } = {}) {
  const instants = attackInstants(samples);
  const raw = [];
  let j = 0;
  let brief = 0;
  for (let i = 0; i < instants.length; i += 1) {
    brief += instants[i].brief ? 1 : 0;
    while (instants[j].t < instants[i].t - BUSY_WINDOW_SECONDS + 1e-9) {
      brief -= instants[j].brief ? 1 : 0;
      j += 1;
    }
    const count = i - j + 1;
    if (count >= BUSY_ONSETS_PER_SECOND || (count >= BUSY_MIN_ONSETS && brief >= BUSY_MIN_BRIEF)) {
      raw.push({ start: instants[j].t, end: instants[i].t });
    }
  }
  const windows = [];
  for (const w of raw) {
    const start = Math.max(0, w.start - BUSY_PAD_SECONDS);
    const end = Math.min(duration, w.end + BUSY_PAD_SECONDS);
    const last = windows[windows.length - 1];
    if (last && start <= last.end + BUSY_MERGE_GAP) last.end = Math.max(last.end, end);
    else windows.push({ start, end });
  }
  return windows.map((w) => ({ start: round3(w.start), end: round3(w.end) }));
}

/**
 * La lecture complète : les images de la première lecture hors des passages relus, et celles
 * de la relecture fine dedans, dans l'ordre du temps.
 * @param {{t: number}[]} coarse - première lecture
 * @param {{start: number, end: number, samples: {t: number}[]}[]} fine - relectures
 * @returns {{t: number}[]}
 */
export function mergeFineSamples(coarse, fine) {
  const windows = (fine || []).filter((w) => w && w.samples?.length);
  const inside = (t) => windows.some((w) => t >= w.start - 1e-9 && t < w.end - 1e-9);
  const merged = (coarse || []).filter((s) => !inside(Number(s.t) || 0));
  for (const w of windows) {
    for (const s of w.samples) if (s.t >= w.start - 1e-9 && s.t < w.end - 1e-9) merged.push(s);
  }
  return merged.sort((a, b) => a.t - b.t);
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// [Claude] — 2026-09-06 — Pédagogie IA v2 : ce que dit le professeur.
//
// Module PUR, dans la même discipline que le reste de src/pedagogie/* : il ne
// connaît ni le processus principal, ni ffmpeg, ni faster-whisper. Il reçoit ce
// que l'IPC `pedagogie:transcribe-video` a renvoyé, et le met en forme.
//
// DEUX RESPONSABILITÉS, ET RIEN D'AUTRE :
//
//   1. `normalizeTranscription` — traduire le retour de l'IPC en un état de
//      narration exploitable par l'écran, en conservant la RAISON exacte quand
//      il n'y a rien à montrer. Trois indisponibilités différentes existent
//      (dépendance absente, aucune parole, échec technique) et elles ne se
//      disent pas de la même façon : voir les états dans glossary.js.
//
//   2. `alignNarration` — poser chaque passage parlé à côté de l'accord joué au
//      même moment. C'est tout ce que « croiser la transcription et l'image »
//      veut dire ici : la V1 sait déjà lire les touches, on ne relit pas
//      l'image, on rapproche deux relevés déjà faits sur la même horloge.
//
// CE QUE CE MODULE NE FAIT JAMAIS : inventer du texte. Un passage sans parole
// reste sans parole ; une machine sans reconnaissance vocale le dit.

import {
  NARRATION_REASON,
  noNarrationState,
  transcriptionUnavailableState,
  transcriptionFailedState,
  narrationNotAttemptedState,
} from './glossary.js';

/**
 * Nettoie les segments bruts : bornes exploitables, texte non vide, ordre
 * chronologique. Un segment mal formé est écarté, pas rafistolé.
 *
 * @param {{start: number, end: number, text: string}[]} segments
 * @returns {{start: number, end: number, text: string}[]}
 */
function cleanSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments
    .map((s) => ({
      start: Number(s?.start),
      end: Number(s?.end),
      text: typeof s?.text === 'string' ? s.text.trim() : '',
    }))
    .filter((s) => s.text
      && Number.isFinite(s.start)
      && Number.isFinite(s.end)
      && s.end >= s.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * Met en forme le retour de `pedagogie:transcribe-video`.
 *
 * @param {object|null} raw - retour brut de l'IPC
 * @returns {object} état de narration : soit { available: true, segments, … },
 *                   soit l'un des états d'indisponibilité de glossary.js
 */
export function normalizeTranscription(raw) {
  if (!raw || typeof raw !== 'object') return narrationNotAttemptedState();

  if (raw.available === true) {
    const segments = cleanSegments(raw.segments);
    // Le processus principal a répondu « disponible » mais n'a rien retenu :
    // c'est bien un constat sur le contenu, la bande son a été écoutée.
    if (segments.length === 0) return noNarrationState();
    return {
      available: true,
      segments,
      language: raw.language ?? null,
      model: raw.model ?? null,
    };
  }

  switch (raw.reason) {
    case NARRATION_REASON.DEPENDENCY: return transcriptionUnavailableState();
    case NARRATION_REASON.NO_SPEECH: return noNarrationState();
    case NARRATION_REASON.NOT_ATTEMPTED: return narrationNotAttemptedState();
    case NARRATION_REASON.FAILED: return transcriptionFailedState(raw.detail);
    // Une raison inconnue est un échec, pas une absence de parole : on ne
    // laisse pas une réponse mal formée se faire passer pour « vidéo muette ».
    default: return transcriptionFailedState(raw.detail ?? null);
  }
}

/** Lit l'étiquette d'un segment d'accord, quelle que soit sa provenance. */
function chordLabelOf(segment) {
  if (!segment) return null;
  if (segment.chord && typeof segment.chord === 'object') {
    return segment.chord.resolved === false ? null : (segment.chord.label ?? null);
  }
  return segment.label ?? null;
}

/** Durée de recouvrement de deux intervalles ; 0 s'ils ne se touchent pas. */
function overlap(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Distance temporelle entre deux intervalles disjoints. */
function gap(a, b) {
  if (overlap(a, b) > 0) return 0;
  return a.start >= b.end ? a.start - b.end : b.start - a.end;
}

/**
 * Rapproche chaque passage parlé de l'accord joué au même moment.
 *
 * Le rapprochement se fait sur le RECOUVREMENT le plus long — pas sur le début
 * le plus proche : un professeur qui parle pendant huit secondes couvre souvent
 * deux accords, et c'est celui qu'il commente le plus longtemps qui compte.
 * Faute de recouvrement (une phrase dite pendant un silence), on prend l'accord
 * le plus proche dans le temps, et `nearest` le signale pour que l'écran ne
 * fasse pas passer un voisinage pour une simultanéité.
 *
 * @param {{start: number, end: number, text: string}[]} narrationSegments
 * @param {object[]} chordSegments - segments de la grille (image ou son)
 * @returns {{start: number, end: number, text: string,
 *            chord: string|null, chordStart: number|null, nearest: boolean}[]}
 */
export function alignNarration(narrationSegments, chordSegments) {
  const spoken = cleanSegments(narrationSegments);
  const chords = (Array.isArray(chordSegments) ? chordSegments : [])
    .filter((c) => Number.isFinite(Number(c?.start)) && Number.isFinite(Number(c?.end)));

  return spoken.map((s) => {
    let best = null;
    let bestOverlap = 0;
    let nearest = null;
    let nearestGap = Infinity;

    for (const c of chords) {
      const span = { start: Number(c.start), end: Number(c.end) };
      const ov = overlap(s, span);
      if (ov > bestOverlap) { bestOverlap = ov; best = c; }
      const g = gap(s, span);
      if (g < nearestGap) { nearestGap = g; nearest = c; }
    }

    const picked = best || nearest;
    return {
      start: s.start,
      end: s.end,
      text: s.text,
      chord: chordLabelOf(picked),
      chordStart: picked ? Number(picked.start) : null,
      nearest: Boolean(!best && nearest),
    };
  });
}

/**
 * Concatène les passages parlés en un texte suivi, pour la couche IA facultative.
 *
 * Une limite de caractères est appliquée ici plutôt que dans src/ai/ : c'est une
 * décision sur le contenu, pas sur le transport.
 *
 * @param {{text: string}[]} segments
 * @param {number} [maxChars]
 * @returns {string}
 */
export function joinNarrationText(segments, maxChars = 6000) {
  const text = (Array.isArray(segments) ? segments : [])
    .map((s) => (typeof s?.text === 'string' ? s.text.trim() : ''))
    .filter(Boolean)
    .join(' ');
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

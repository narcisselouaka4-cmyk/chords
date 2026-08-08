// [OpenCode] — 2026-08-08 — Lot C : sécuriser l'édition d'un accord.
//
// Petite session pure qui garantit l'immutabilité de la cible d'édition :
//   - la cible est capturée à l'ouverture via l'identité stable segmentId
//     (déjà présente dans le modèle d'analyse — aucun champ canonique ajouté) ;
//   - elle n'est JAMAIS recalculée depuis le temps courant, la position
//     visuelle de la timeline, la surbrillance ou tout état global évolutif ;
//   - la mutation (Enregistrer / Revenir à la détection) s'applique uniquement
//     au segment résolu par cet identifiant, jamais par l'index relu plus tard ;
//   - si la cible disparaît ou redevient introuvable avant la validation, la
//     mutation est refusée sans modifier un autre segment et sans erreur.
//
// Ce module ne touche pas aux moteurs canoniques (src/melody/, src/analyzer/,
// src/chord-engine/) : il réutilise seulement normalizeOverride via l'API
// publique de chord-display.
//
// Exécutable en Node seul pour les tests : aucune dépendance DOM.

import { normalizeOverride } from '../chord-engine/chord-display.js';

/**
 * Capture la cible d'édition de façon immuable.
 * N'utilise QUE la clé stable segmentId (présente via enrichSegments).
 *
 * @param {{ segmentId?: string }} segment
 * @returns {{ segmentId: string } | null} description minimale de la cible.
 */
export function captureChordTarget(segment) {
  if (!segment || typeof segment !== 'object') return null;
  const segmentId = segment.segmentId;
  if (!segmentId) return null;
  return { segmentId };
}

/**
 * Résout le segment cible à un instant donné, en relisant PAR segmentId
 * (et non par position dans le tableau). L'identité stable rend la résolution
 * insensible au temps de lecture, au défilement ou à la surbrillance active.
 *
 * @param {{ segmentId: string }[]} segments
 * @param {{ segmentId: string }} target
 * @returns {{ segmentId: string } | null}
 */
export function resolveChordTarget(segments, target) {
  if (!Array.isArray(segments) || !target || !target.segmentId) return null;
  return segments.find((s) => s && s.segmentId === target.segmentId) || null;
}

/**
 * Ouvre une session d'édition :
 *  1. met la lecture en pause IMMÉDIATEMENT si elle est active — avant toute
 *     capture (aucune évolution de lecture ne peut déplacer la cible) ;
 *  2. capture ensuite la cible par segmentId.
 *
 * Si la lecture est déjà en pause, son état reste inchangé (aucun appel à
 * pause). Cette fonction ne relance JAMAIS la lecture.
 *
 * @param {{
 *   chords: { segmentId?: string }[],
 *   index: number,
 *   playbackActive?: () => boolean,
 *   pause?: () => void,
 * }} args
 * @returns {{ segmentId?: string } | null}
 */
export function openChordEditSession({ chords, index, playbackActive, pause }) {
  const isPlaying = typeof playbackActive === 'function' ? playbackActive() : false;
  if (isPlaying && typeof pause === 'function') {
    pause();
  }
  return captureChordTarget(
    Array.isArray(chords) ? chords[index] : undefined,
  );
}

/**
 * Calcule la mutation ciblée (override normalisé) pour la cible, sans
 * l'appliquer. Retourne { ok: false } si la cible est introuvable à cet
 * instant (aucune mutation de substitution n'est à faire par l'appelant).
 *
 * @param {{ segmentId: string }[]} segments
 * @param {{ segmentId: string }} target
 * @param {{ root: number, quality: string, bass: number|null }|null} override
 * @returns {{ ok: boolean, segment?: object, index?: number, normalized?: object|null }}
 */
export function computeChordTargetMutation(segments, target, override) {
  const segment = resolveChordTarget(segments, target);
  if (!segment) return { ok: false };
  const index = segments.indexOf(segment);
  if (index < 0) return { ok: false };
  return {
    ok: true,
    segment,
    index,
    normalized: normalizeOverride(segment, override),
  };
}

/**
 * Applique la mutation sur la cible par segmentId, UNIQUEMENT si le segment
 * cible est toujours présent dans les données actuelles. Si la cible a
 * disparu, retourne { ok: false } sans modifier un autre segment et sans lever
 * d'erreur.
 *
 * @param {{ segmentId: string }[]} segments
 * @param {{ segmentId: string }} target
 * @param {{ root: number, quality: string, bass: number|null }|null} override
 * @returns {{
 *   ok: boolean,
 *   segment?: object,
 *   index?: number,
 *   oldValue?: object|null,
 *   newValue?: object|null,
 * }}
 */
export function applyChordTargetMutation(segments, target, override) {
  const mutation = computeChordTargetMutation(segments, target, override);
  if (!mutation.ok) return mutation;
  const oldValue = mutation.segment.manualOverride ?? null;
  mutation.segment.manualOverride = mutation.normalized;
  return {
    ok: true,
    segment: mutation.segment,
    index: mutation.index,
    oldValue,
    newValue: mutation.normalized,
  };
}
import { getEffectiveChord } from '../chord-engine/chord-display.js';

export function harmonicRole(segment) {
  if (segment?.manualOverride) return 'structural';
  // Compatibilité des analyses MIDI et des anciens projets sans classification.
  if (!segment?.role) return 'structural';
  return ['structural', 'passing', 'uncertain', 'silence'].includes(segment.role)
    ? segment.role : 'uncertain';
}

/**
 * La grille de lecture ne retient que les piliers harmoniques. Elle conserve
 * les objets, leurs identités et leurs temps exacts : les intervalles omis ne
 * sont ni comblés, ni absorbés par les accords voisins. Le diagnostic complet
 * reste dans l'analyse et peut être consulté dans la vue détaillée.
 *
 * [Claude] — 2026-10-25 — Sauf pour une source MIDI, où RIEN n'est masqué.
 * L'ADR-063 a été écrit pour l'audio, où le moteur doute : masquer y protège
 * d'une hypothèse hasardeuse. Un MIDI ne laisse aucune place au doute — les
 * notes sont connues — et cacher un accord que le pianiste a certainement joué
 * n'a aucun sens. Le rôle y sert au CONTRASTE visuel, jamais à effacer ; c'est
 * exactement ce que Narcisse reproche à la grille audio.
 */
export function selectChordProgression(chords = [], { detailed = false, sourceType = null } = {}) {
  const keepAll = detailed || sourceType === 'midi';
  return chords.filter((segment) => segment && (keepAll || (
    harmonicRole(segment) === 'structural'
    && getEffectiveChord(segment) && getEffectiveChord(segment) !== 'N'
  )));
}

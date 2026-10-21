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
 */
export function selectChordProgression(chords = [], { detailed = false } = {}) {
  return chords.filter((segment) => segment && (detailed || (
    harmonicRole(segment) === 'structural'
    && getEffectiveChord(segment) && getEffectiveChord(segment) !== 'N'
  )));
}

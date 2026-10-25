import { getEffectiveChord } from '../chord-engine/chord-display.js';

export function harmonicRole(segment) {
  if (segment?.manualOverride) return 'structural';
  // Compatibilité des analyses MIDI et des anciens projets sans classification.
  if (!segment?.role) return 'structural';
  return ['structural', 'passing', 'uncertain', 'silence'].includes(segment.role)
    ? segment.role : 'uncertain';
}

/**
 * La grille de lecture garde TOUS les accords relevés. Le rôle (pilier, passage,
 * incertitude) sert au contraste visuel, jamais à effacer.
 *
 * [Claude] — 2026-10-25 — La sélection ne masque plus les accords non
 * structurels, pour aucune source. Elle le faisait pour l'audio au titre de
 * l'ADR-063 : masquer une détection douteuse protégeait d'une hypothèse
 * hasardeuse. Mais un segment retiré d'une frise positionnée au temps laisse un
 * TROU, et un trou se lit comme un silence — une affirmation plus forte, et
 * plus fausse, que l'étiquette qu'on a voulu taire.
 *
 * Mesuré sur « Saint Esprit » (344 s, 161 segments) : 35 segments non
 * structurels, 11,3 % du temps, disparaissaient de la frise. Narcisse, après
 * l'avoir ouvert : « les cases vides, tu me les enlèves. Je préfère avoir une
 * étiquette parasite plutôt que de voir une case vide. »
 *
 * Seuls les segments sans accord du tout (« N ») restent écartés : la frise
 * étend alors sa voisine pour couvrir leur durée (voir analyzer-tab.js), si
 * bien qu'aucun vide ne subsiste nulle part.
 */
export function selectChordProgression(chords = [], { detailed = false, sourceType = null } = {}) {
  return chords.filter((segment) => {
    if (!segment) return false;
    const chord = getEffectiveChord(segment);
    return Boolean(chord) && chord !== 'N';
  });
}

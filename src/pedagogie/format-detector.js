// [Claude] — 2026-09-05 — Pédagogie IA : cascade de reconnaissance de format.
//
// Une vidéo de tutoriel n'est pas toujours lisible à l'image. La taxonomie
// établie sur les fichiers réels de Narcisse va du plus lisible au pire cas :
//
//   A  symbole d'accord écrit sur une zone fixe
//   B  piano-roll type Synthesia avec clavier graphique      ← lu ici
//   C  clavier graphique 2D, touches surlignées sans texte
//   D  clavier réel non exploitable, mais texte/partition à l'écran
//   —  clavier réel, sans couleur ni texte, angle défavorable : rien à lire
//
// Cette passe ne lit réellement que le Format B. **Mais la cascade existe dès
// maintenant**, parce que le pire cas est confirmé réel et dans le périmètre :
// une vidéo non reconnue doit être routée vers le repli audio, pas provoquer un
// écran vide ou une erreur. Un pipeline qui supposerait que toute vidéo
// importée est au Format B serait faux dès le deuxième fichier.
//
// Module pur : la détection ne lit que des images déjà décodées.

import { detectKeyboardGeometry } from './keyboard-geometry.js';

/** Formats connus de la taxonomie. */
export const FORMATS = {
  PIANO_ROLL: 'piano-roll-keyboard',   // Format B
  CHORD_TEXT: 'chord-text',            // Format A — non implémenté
  KEYBOARD_2D: 'keyboard-2d',          // Format C — non implémenté
  SCORE_TEXT: 'score-text',            // Format D — non implémenté
  UNRECOGNISED: 'unrecognised',        // pire cas → repli audio
};

/** Formats que cette version sait réellement lire à l'image. */
export const IMPLEMENTED_FORMATS = [FORMATS.PIANO_ROLL];

export const DEFAULT_CASCADE_OPTIONS = {
  // Nombre d'images devant livrer une géométrie cohérente pour conclure au
  // Format B.
  //
  // Le critère porte sur un NOMBRE, pas sur une proportion. Une proportion
  // serait fausse en pratique : dans une vidéo réelle, la plupart des images
  // ont des touches allumées, et une touche noire allumée n'est plus sombre —
  // elle disparaît de la détection et casse le motif 2/3 de son octave. Exiger
  // qu'une majorité d'images livre un clavier parfait reviendrait à rejeter
  // presque tous les tutoriels. Deux détections indépendantes et cohérentes
  // suffisent : le motif alterné 2/3 avec une grille régulière ne se produit
  // pas par hasard.
  minValidProbes: 2,
  // Écart maximal toléré, en demi-tons, entre les plages détectées sur deux
  // images : au-delà, la géométrie n'est pas stable et on ne peut pas s'y fier.
  maxRangeDrift: 2,
};

/**
 * Reconnaît le format d'une vidéo à partir d'un échantillon d'images.
 *
 * On sonde plusieurs instants répartis dans la vidéo plutôt que le début seul :
 * beaucoup de tutoriels s'ouvrent sur un titre ou un visage avant d'afficher
 * l'instrument.
 *
 * @param {import('./frame.js').PixelFrame[]} frames
 * @param {object} [options]
 * @returns {{
 *   format: string, implemented: boolean, confidence: number,
 *   geometry: object|null, probes: {ok: boolean, reason?: string}[],
 *   reason: string|null, fallback: 'audio'|null
 * }}
 */
export function detectVideoFormat(frames, options = {}) {
  const opts = { ...DEFAULT_CASCADE_OPTIONS, ...options };
  const list = Array.isArray(frames) ? frames : [];

  if (list.length === 0) {
    return {
      format: FORMATS.UNRECOGNISED,
      implemented: false,
      confidence: 0,
      geometry: null,
      probes: [],
      reason: 'NoFrames',
      fallback: 'audio',
    };
  }

  const probes = [];
  const geometries = [];
  for (const frame of list) {
    const g = detectKeyboardGeometry(frame, options);
    if (g.ok) {
      geometries.push(g);
      probes.push({ ok: true });
    } else {
      probes.push({ ok: false, reason: g.reason, detail: g.detail });
    }
  }

  const ratio = geometries.length / list.length;
  const required = list.length >= 4 ? opts.minValidProbes : 1;
  if (geometries.length < required) {
    return {
      format: FORMATS.UNRECOGNISED,
      implemented: false,
      confidence: ratio,
      geometry: null,
      probes,
      // Le motif d'échec le plus fréquent est plus utile qu'un « non reconnu »
      // sec : il dit à l'utilisateur POURQUOI l'image n'a rien donné.
      reason: dominantReason(probes),
      fallback: 'audio',
    };
  }

  // Géométrie retenue : celle qui compte le plus de touches NOIRES, puis le
  // plus de blanches.
  //
  // Le critère porte d'abord sur les noires parce qu'une touche noire allumée
  // cesse d'être sombre : elle échappe alors à la détection, et la géométrie
  // calculée sur cette image-là aurait un trou permanent. Retenir l'image qui
  // en montre le plus revient à retenir la vue la plus au repos, sans avoir à
  // deviner laquelle l'est.
  const chosen = geometries.reduce((a, b) => {
    if (b.blackKeys.length !== a.blackKeys.length) {
      return b.blackKeys.length > a.blackKeys.length ? b : a;
    }
    return b.whiteKeys.length > a.whiteKeys.length ? b : a;
  }, geometries[0]);
  const drift = geometries.reduce(
    (max, g) => Math.max(max, Math.abs(g.lowestMidi - chosen.lowestMidi)), 0,
  );
  if (drift > opts.maxRangeDrift) {
    return {
      format: FORMATS.UNRECOGNISED,
      implemented: false,
      confidence: ratio,
      geometry: null,
      probes,
      reason: `UnstableGeometry:${drift}`,
      fallback: 'audio',
    };
  }

  return {
    format: FORMATS.PIANO_ROLL,
    implemented: true,
    confidence: ratio,
    geometry: chosen,
    probes,
    reason: null,
    fallback: null,
  };
}

function dominantReason(probes) {
  const counts = new Map();
  for (const p of probes) {
    if (p.ok) continue;
    counts.set(p.reason, (counts.get(p.reason) || 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [r, n] of counts) if (n > bestN) { bestN = n; best = r; }
  return best;
}

/**
 * Message affichable pour un format non lu à l'image.
 *
 * Il ne faut jamais laisser l'écran muet : l'utilisateur doit savoir que
 * l'image n'a rien donné et que le résultat vient de l'audio seul.
 *
 * @param {string} reason
 * @returns {string}
 */
export function explainUnrecognised(reason) {
  switch (reason) {
    case 'NoFrames':
      return 'Aucune image n\'a pu être extraite de cette vidéo.';
    case 'NoStrikeLine':
    case 'NoKeyboardRows':
    case 'NoWhiteGrid':
      return 'Aucun clavier graphique n\'a été trouvé à l\'image. C\'est le cas des tutoriels '
        + 'filmés sur un vrai piano : l\'analyse repose alors uniquement sur le son.';
    case 'BlackKeyPattern':
    case 'InconsistentAnchor':
      return 'Un clavier a été entrevu mais sa lecture n\'est pas fiable (angle, incrustation, '
        + 'ou clavier partiellement masqué). L\'analyse repose uniquement sur le son.';
    default:
      if (typeof reason === 'string' && reason.startsWith('UnstableGeometry')) {
        return 'Le clavier bouge d\'une image à l\'autre (plan qui change, zoom) : sa lecture '
          + 'n\'est pas fiable. L\'analyse repose uniquement sur le son.';
      }
      return 'Le contenu de l\'image n\'a pas pu être interprété. L\'analyse repose uniquement '
        + 'sur le son.';
  }
}

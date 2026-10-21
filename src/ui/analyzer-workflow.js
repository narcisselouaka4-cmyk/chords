// [OpenCode] — Passe corrective Analyse.
// Logique PURE du workflow Analyse (machine d'état + routage pipeline import).
// Découpée du module lourd analyzer-tab.js (qui importe du CSS) afin d'être
// testable en Node sans DOM ni navigateur.
//
// Machine d'état du workspace Analyse.
// [Refonte Analyse 02/10] — deux états sont tombés :
//   · 'midi-record' — l'écran de capture au clavier de l'onglet Analyse doublait
//     les Sessions MIDI de l'onglet Entraînement ;
//   · 'results'     — markup mort : setAnalyzerState('results') n'a jamais été
//     appelé depuis la refonte, la vue d'analyse ('analysis') l'avait remplacé.
// [Claude] — 2026-10-09 — et 'video-type' (« Quel type de vidéo avez-vous
// importé ? ») est retiré : une vidéo MP4 est analysée comme un fichier audio.
// [Claude] — 2026-10-19 — et 'prepare' (« Préparer l'analyse ») est retiré
// (Narcisse : « supprime cette étape ») : il n'offrait qu'un récapitulatif et
// quatre cases jamais lues. Sélectionner une source lance directement l'analyse ;
// seuls deux états sont rendus (l'écran d'import, puis les résultats).
// [Claude] — 2026-10-21 — 'region' s'intercale entre 'import' et 'analysis' pour
// les fichiers audio/vidéo longs : étape transitoire (choisir le passage à
// analyser), jamais une destination finale — resolveAnalysisState() continue de
// répondre 'analysis' pour toute extension, le choix d'y passer par 'region' se
// décide ailleurs (shouldOfferRegionSelection), sur la durée réelle du fichier.
export const ANALYSIS_STATES = ['import', 'region', 'analysis'];

// Extensions considérées comme vidéo (conteneurs où le son est dérivé).
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);

// [P0/P4] — Décision d'état pour une source importée (file picker OU
// bibliothèque, exactement le même pipeline). Audio, vidéo et MIDI : l'analyse
// est lancée aussitôt, sans écran intermédiaire ; l'état rendu après l'attente
// est la vue des résultats.
export function resolveAnalysisState(_ext, _sourceType = 'audio') {
  return 'analysis';
}

// [Claude] — 2026-10-21 — Région avant analyse (demande de Narcisse : les fichiers
// longs mettent trop de temps à analyser). En dessous de ce seuil, le fichier
// entier est analysé comme avant — pas d'étape en plus pour un morceau de 3 min.
// Au-dessus, l'étape de région est proposée ; la zone choisie ne peut pas dépasser
// REGION_MAX_SECONDS (le moteur reste borné, même sur un concert d'une heure).
export const REGION_SKIP_BELOW_SECONDS = 360; // 6 min
export const REGION_MAX_SECONDS = 480; // 8 min
export const REGION_MIN_SECONDS = 10;
// Région par défaut proposée à l'ouverture de l'étape : un extrait utile tout de
// suite, sans que l'utilisateur doive déjà savoir où regarder dans le morceau.
export const REGION_DEFAULT_SECONDS = 240; // 4 min

/**
 * Un fichier audio/vidéo assez long mérite qu'on lui propose une région avant
 * de lancer l'analyse complète ; un MIDI (notes exactes, pas de chromagramme)
 * ou une durée inconnue/instable n'ont rien à y gagner.
 * @param {number} durationSeconds
 * @param {'audio'|'video'|'midi'|null} sourceType
 */
export function shouldOfferRegionSelection(durationSeconds, sourceType) {
  if (sourceType === 'midi') return false;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  return durationSeconds > REGION_SKIP_BELOW_SECONDS;
}

/**
 * Borne une région proposée par l'utilisateur (glisser une poignée) : dans les
 * limites du morceau, au moins REGION_MIN_SECONDS, au plus REGION_MAX_SECONDS.
 * Pure — utilisée par le rendu (poignées) et testable sans DOM.
 * @param {number} start
 * @param {number} end
 * @param {number} duration
 */
export function clampRegion(start, end, duration) {
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  let s = Math.max(0, Math.min(start, end));
  let e = Math.max(start, end);
  s = Math.max(0, Math.min(s, total));
  e = Math.max(0, Math.min(e, total));
  if (e - s > REGION_MAX_SECONDS) {
    // Garde le bord que l'utilisateur vient de bouger : on raccourcit depuis
    // l'autre bout plutôt que de refuser le geste.
    if (start === s) e = Math.min(total, s + REGION_MAX_SECONDS);
    else s = Math.max(0, e - REGION_MAX_SECONDS);
  }
  if (e - s < REGION_MIN_SECONDS) {
    e = Math.min(total, s + REGION_MIN_SECONDS);
    if (e - s < REGION_MIN_SECONDS) s = Math.max(0, e - REGION_MIN_SECONDS);
  }
  return { start: s, end: e };
}

// [Claude] — 2026-10-09 — Fichiers MIDI : leurs notes sont analysées directement (midi-source.js).
const MIDI_EXTENSIONS = new Set(['mid', 'midi']);

// [P0/P4] — Type de source (audio/video/midi) dérivé de l'extension.
export function inferSourceType(filePath, requested = 'audio') {
  const ext = (filePath || '').split('.').pop().toLowerCase();
  if (MIDI_EXTENSIONS.has(ext)) return 'midi';
  if (requested === 'video' || VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'audio';
}

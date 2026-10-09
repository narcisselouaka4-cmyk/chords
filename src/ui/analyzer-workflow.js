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
export const ANALYSIS_STATES = ['import', 'prepare', 'analysis'];

// États intermédiaires (préparation) — la zone centrale est rendue directement à
// partir de cet état, pas seulement le panneau Flux d'analyse.
export const PREP_STATES = new Set(['import', 'prepare']);

// Extensions considérées comme vidéo (conteneurs où le son est dérivé).
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);

// [P0/P4] — Décision d'état pour une source importée (file picker OU
// bibliothèque, exactement le même pipeline). Audio et vidéo : préparation.
export function resolveAnalysisState(_ext, _sourceType = 'audio') {
  return 'prepare';
}

// [P0/P4] — Type de source (audio/video) dérivé de l'extension.
export function inferSourceType(filePath, requested = 'audio') {
  const ext = (filePath || '').split('.').pop().toLowerCase();
  if (requested === 'video' || VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'audio';
}

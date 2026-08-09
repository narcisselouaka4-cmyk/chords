// [OpenCode] — Passe corrective Analyse.
// Logique PURE du workflow Analyse (machine d'état + routage pipeline import).
// Découpée du module lourd analyzer-tab.js (qui importe du CSS) afin d'être
// testable en Node sans DOM ni navigateur.
//
// Machine d'état du workspace Analyse :
export const ANALYSIS_STATES = ['import', 'prepare', 'video-type', 'midi-record', 'results', 'analysis'];

// États intermédiaires (préparation / capture) — la zone centrale est rendue
// directement à partir de cet état, pas seulement le panneau Flux d'analyse.
export const PREP_STATES = new Set(['import', 'prepare', 'video-type', 'midi-record']);

// Extensions considérées comme vidéo (conteneurs où le son est dérivé).
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);

// [P0/P4] — Décision d'état pour une source importée (file picker OU
// bibliothèque, exactement le même pipeline).
export function resolveAnalysisState(ext, sourceType = 'audio') {
  const e = (ext || '').toLowerCase();
  if (VIDEO_EXTENSIONS.has(e)) return 'video-type';
  if (sourceType === 'video') return 'video-type';
  return 'prepare';
}

// [P0/P4] — Type de source (audio/video) dérivé de l'extension.
export function inferSourceType(filePath, requested = 'audio') {
  const ext = (filePath || '').split('.').pop().toLowerCase();
  if (requested === 'video' || VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'audio';
}

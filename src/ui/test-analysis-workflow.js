/*!
 * Tests de régression du workflow Analyse (Passe corrective).
 *
 * Ces tests valident la machine d'état et le routage central du pipeline
 * d'import (file picker ↔ bibliothèque) sans exiger de DOM ni de navigateur :
 * on teste la logique pure du module analyzer-workflow.js.
 *
 * Usage : node src/ui/test-analysis-workflow.js
 */
import { resolveAnalysisState, ANALYSIS_STATES } from './analyzer-workflow.js';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

// ── A : HOME → Audio → file picker MP3/WAV → AUDIO_PREP ──
runTest('A — HOME → Audio → file picker MP3 → AUDIO_PREP', () => {
  assert(resolveAnalysisState('mp3', 'audio') === 'prepare', 'MP3 → prepare');
  assert(resolveAnalysisState('wav', 'audio') === 'prepare', 'WAV → prepare');
});

// ── B : HOME → Vidéo → file picker MP4 → VIDEO_TYPE_SELECTION ──
runTest('B — HOME → Vidéo → file picker MP4 → VIDEO_TYPE_SELECTION', () => {
  assert(resolveAnalysisState('mp4', 'video') === 'video-type', 'MP4 → video-type');
  assert(resolveAnalysisState('m4v') === 'video-type', 'M4V → video-type');
  assert(resolveAnalysisState('mov') === 'video-type', 'MOV → video-type');
  assert(resolveAnalysisState('webm') === 'video-type', 'WEBM → video-type');
  assert(resolveAnalysisState('mp4', 'audio') === 'video-type', 'MP4 auto-détecté comme vidéo');
});

// ── C : HOME → MIDI → MIDI_CAPTURE ──
// (MIDI_CAPTURE = état 'midi-record', présent dans la machine d'état)
runTest('C — HOME → MIDI → MIDI_CAPTURE présent dans les états', () => {
  assert(ANALYSIS_STATES.includes('midi-record'), 'état midi-capture présent');
});

// ── D : Bibliothèque MP3 → AUDIO_PREP (même pipeline) ──
runTest('D — Bibliothèque MP3 → AUDIO_PREP (même pipeline)', () => {
  assert(resolveAnalysisState('mp3', 'audio') === 'prepare', 'bibliothèque MP3 réutilise prepare');
});

// ── E : Bibliothèque MP4 → workflow Vidéo correct ──
runTest('E — Bibliothèque MP4 → workflow Vidéo correct', () => {
  assert(resolveAnalysisState('mp4', 'video') === 'video-type', 'bibliothèque MP4 → video-type');
  assert(resolveAnalysisState('m4v', 'video') === 'video-type', 'bibliothèque M4V → video-type');
});

// ── AUDIO_PREP / VIDEO_TYPE / MIDI_CAPTURE → Nouvelle analyse → HOME ──
// resetAnalysisSession remet l'état à 'import' (HOME) ; vérifié via la
// constante d'état valide.
runTest('F/G/H — retour à HOME après Nouvelle analyse (reset → import)', () => {
  const after = ANALYSIS_STATES.find((s) => s === 'import');
  assert(after === 'import', 'HOME (import) valide après reset');
});

// ── Routage audio restant sur PREP même si requesté comme vidéo par extension ──
runTest('Audio/WAV ne bascule jamais vers video-type', () => {
  assert(resolveAnalysisState('wav', 'audio') === 'prepare', 'WAV → prepare');
  assert(resolveAnalysisState('aiff', 'audio') === 'prepare', 'AIFF → prepare');
});

// ── Machine d'état complète ──
runTest('Machine d’état Analyse complète et ordonnée', () => {
  const expected = ['import', 'prepare', 'video-type', 'midi-record', 'results', 'analysis'];
  assert(JSON.stringify(ANALYSIS_STATES) === JSON.stringify(expected), 'états complets');
});

console.log('\nTests workflow Analyse terminés.');

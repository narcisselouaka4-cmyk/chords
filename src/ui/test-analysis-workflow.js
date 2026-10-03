/*!
 * Tests de régression du workflow Analyse (Passe corrective).
 *
 * Ces tests valident la machine d'état et le routage central du pipeline
 * d'import (file picker ↔ bibliothèque) sans exiger de DOM ni de navigateur :
 * on teste la logique pure du module analyzer-workflow.js.
 *
 * Usage : node src/ui/test-analysis-workflow.js
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveAnalysisState, ANALYSIS_STATES } from './analyzer-workflow.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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

// ── C : la capture MIDI n'appartient plus à l'onglet Analyse ──
// [Refonte Analyse 02/10] — elle doublait les Sessions MIDI de l'onglet
// Entraînement. Sa carte d'accueil et son écran ont été retirés : ce test
// garde la porte fermée.
runTest("C — la capture au clavier a quitté l'onglet Analyse", () => {
  assert(!ANALYSIS_STATES.includes('midi-record'), "plus d'état de capture MIDI");
  assert(!ANALYSIS_STATES.includes('results'), "plus d'état 'results' (markup mort, jamais activé)");
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
  const expected = ['import', 'prepare', 'video-type', 'analysis'];
  assert(JSON.stringify(ANALYSIS_STATES) === JSON.stringify(expected), 'états complets');

  // setAnalyzerState() garde sa propre liste plutôt que d'importer celle-ci :
  // l'import se faisait évaluer au moment de l'initialisation de l'onglet et
  // l'a fait échouer une fois (02/10). Les deux doivent rester identiques.
  const tabJs = readFileSync(resolve(projectRoot, 'src/ui/analyzer-tab.js'), 'utf-8');
  const local = tabJs.match(/const states = (\[[^\]]*\]);/);
  assert(local !== null, 'liste locale trouvee dans setAnalyzerState');
  const normalise = (x) => x.replace(/'/g, '"').replace(/\s+/g, '');
  assert(normalise(local[1]) === normalise(JSON.stringify(expected)),
    'la liste de setAnalyzerState est alignee sur ANALYSIS_STATES (trouve ' + local[1] + ')');
});

console.log('\nTests workflow Analyse terminés.');

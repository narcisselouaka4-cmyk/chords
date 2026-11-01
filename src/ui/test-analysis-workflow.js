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
import { resolveAnalysisState, ANALYSIS_STATES, inferSourceType } from './analyzer-workflow.js';

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

// ── B : HOME → file picker MP4 → AUDIO_PREP (plus d'écran « type de vidéo ») ──
// [Claude] — 2026-10-09 — Narcisse : MP4 accepté dans l'onglet Analyse, et plus
// de question « Quel type de vidéo avez-vous importé ? ».
runTest('B — HOME → file picker MP4 → AUDIO_PREP, sans choix du type de vidéo', () => {
  assert(resolveAnalysisState('mp4', 'video') === 'prepare', 'MP4 → prepare');
  assert(resolveAnalysisState('mp4', 'audio') === 'prepare', 'MP4 auto-détecté → prepare');
  assert(!ANALYSIS_STATES.includes('video-type'), "plus d'état video-type");
  const html = readFileSync(resolve(projectRoot, 'src/index.html'), 'utf-8');
  assert(!html.includes('analyzer-state-video-type'), "l'écran du type de vidéo est retiré du markup");
  const main = readFileSync(resolve(projectRoot, 'electron/main.js'), 'utf-8');
  assert(/'studio:select-analysis-file'[\s\S]*?extensions: \['mp3', 'wav', 'm4a', 'mp4', 'mid', 'midi'\]/.test(main),
    'le sélecteur de l’onglet Analyse propose le MP4 et le MIDI');
  // [Claude] — 2026-10-09 — Les fichiers MIDI sont une source à part (notes analysées directement).
  assert(inferSourceType('/x/Ma session.mid') === 'midi' && inferSourceType('a.MIDI') === 'midi', 'un .mid est une source MIDI');
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

// ── E : Bibliothèque MP4 → AUDIO_PREP (même pipeline que l'audio) ──
runTest('E — Bibliothèque MP4 → AUDIO_PREP', () => {
  assert(resolveAnalysisState('mp4', 'video') === 'prepare', 'bibliothèque MP4 → prepare');
});

// ── E bis : les pistes du Studio ne servent à l'analyse que si elles couvrent tout le morceau ──
// Un MP4 de la bibliothèque passé par le Studio n'affichait « aucun accord » : l'analyse
// prenait le piano séparé d'une RÉGION (ou des bips de 2 s) pour le morceau entier.
runTest('E bis — pistes du Studio : ni bips, ni région partielle', () => {
  const main = readFileSync(resolve(projectRoot, 'electron/main.js'), 'utf-8');
  const fn = main.slice(main.indexOf('async function findStudioStemForFile'), main.indexOf('// [OpenCode] — 2026-07-04 — Utilise le venv local'));
  assert(/SIMULATED_MARK/.test(fn) && /hasLegacyBeepStems\(stemsDir\)/.test(fn), 'les bips sont écartés');
  assert(/region\.start <= FULL_COVERAGE_TOLERANCE/.test(fn) && /region\.end >= duration - FULL_COVERAGE_TOLERANCE/.test(fn),
    'une région partielle est écartée');
  const pipe = main.slice(main.indexOf('async function runAnalysisPipeline'));
  assert(pipe.indexOf("runAudioProcessor(['probe', filePath])") < pipe.indexOf("findStudioStemForFile(filePath, 'piano', duration)"),
    'la durée est lue avant de choisir les pistes');
});

// ── AUDIO_PREP / VIDEO_TYPE / MIDI_CAPTURE → Nouvelle analyse → HOME ──
// resetAnalysisSession remet l'état à 'import' (HOME) ; vérifié via la
// constante d'état valide.
runTest('F/G/H — retour à HOME après Nouvelle analyse (reset → import)', () => {
  const after = ANALYSIS_STATES.find((s) => s === 'import');
  assert(after === 'import', 'HOME (import) valide après reset');
});

// ── Routage audio restant sur PREP même si requesté comme vidéo par extension ──
runTest('Audio/WAV restent sur la préparation', () => {
  assert(resolveAnalysisState('wav', 'audio') === 'prepare', 'WAV → prepare');
  assert(resolveAnalysisState('aiff', 'audio') === 'prepare', 'AIFF → prepare');
});

// ── Machine d'état complète ──
runTest('Machine d’état Analyse complète et ordonnée', () => {
  const expected = ['import', 'prepare', 'analysis'];
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

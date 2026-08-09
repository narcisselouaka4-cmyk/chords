// [OpenCode] — Test de contrat DOM pour l'onglet Studio.
// Vérifie que le contexte fichier est mis à jour au bon moment dans loadTrack,
// et que les états vides/remplis sont cohérents entre le DOM et le code.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');

function readText(relPath) {
  return readFileSync(resolve(projectRoot, relPath), 'utf-8');
}

// ── Test 1 : L'élément studio-media-context existe avec le bon texte par défaut ──
function testDefaultFileContext() {
  const html = readText('src/index.html');
  if (!html.includes('id="studio-media-context"')) {
    console.error('❌ DOM — #studio-media-context introuvable dans index.html');
    process.exit(1);
  }
  // Le texte par défaut doit être l'état vide explicite.
  if (!html.includes('Fichier du Studio : Aucun fichier chargé dans le Studio')) {
    console.error('❌ DOM — Texte vide par défaut absent de #studio-media-context');
    process.exit(1);
  }
  console.log('✅ DOM — #studio-media-context présent avec texte vide par défaut');
}

// ── Test 2 : buildFileContextText produit les bons textes ──
async function testBuildFileContextText() {
  const { buildFileContextText } = await import('../ui/file-context.js');

  // État vide
  const empty = buildFileContextText({ tab: 'studio', fileName: '' });
  if (empty !== 'Fichier du Studio : Aucun fichier chargé dans le Studio') {
    console.error(`❌ file-context — État vide incorrect: "${empty}"`);
    process.exit(1);
  }
  console.log('✅ file-context — État vide correct');

  // État rempli
  const filled = buildFileContextText({ tab: 'studio', fileName: 'car il est glorieux.mp3' });
  if (filled !== 'Fichier du Studio : car il est glorieux.mp3') {
    console.error(`❌ file-context — État rempli incorrect: "${filled}"`);
    process.exit(1);
  }
  console.log('✅ file-context — État rempli correct');

  // Les labels Studio et Analyse sont distincts
  const analyzerEmpty = buildFileContextText({ tab: 'analyzer', fileName: '' });
  if (!analyzerEmpty.includes('Fichier analysé')) {
    console.error(`❌ file-context — Label Analyse incorrect: "${analyzerEmpty}"`);
    process.exit(1);
  }
  console.log('✅ file-context — Labels Studio/Analyse distincts');
}

// ── Test 3 : updateStudioFileContext est appelé tôt dans loadTrack ──
function testUpdateStudioFileContextCalledEarly() {
  const js = readText('src/ui/studio-tab.js');

  // Vérifie que updateStudioFileContext est appelé après currentTrack = ...
  // et avant readOriginalAsBlobUrl (donc tôt dans loadTrack).
  const loadTrackStart = js.indexOf('export async function loadTrack');
  if (loadTrackStart === -1) {
    console.error('❌ Code — loadTrack introuvable');
    process.exit(1);
  }

  const afterLoadTrack = js.slice(loadTrackStart);
  const currentTrackSet = afterLoadTrack.indexOf('currentTrack = { id: trackId, metadata }');
  const updateContextCall = afterLoadTrack.indexOf('updateStudioFileContext(trackName)');
  const readOriginalCall = afterLoadTrack.indexOf('readOriginalAsBlobUrl(trackId)');

  if (currentTrackSet === -1) {
    console.error('❌ Code — currentTrack assignment introuvable dans loadTrack');
    process.exit(1);
  }
  if (updateContextCall === -1) {
    console.error('❌ Code — updateStudioFileContext(trackName) introuvable dans loadTrack');
    process.exit(1);
  }
  if (readOriginalCall === -1) {
    console.error('❌ Code — readOriginalAsBlobUrl introuvable dans loadTrack');
    process.exit(1);
  }

  // updateStudioFileContext doit être appelé APRÈS currentTrack et AVANT readOriginalAsBlobUrl
  if (updateContextCall <= currentTrackSet) {
    console.error('❌ Code — updateStudioFileContext appelé AVANT currentTrack (trop tôt ou pas après)');
    process.exit(1);
  }
  if (updateContextCall >= readOriginalCall) {
    console.error('❌ Code — updateStudioFileContext appelé APRÈS readOriginalAsBlobUrl (trop tard)');
    process.exit(1);
  }

  console.log('✅ Code — updateStudioFileContext appelé tôt dans loadTrack (après currentTrack, avant extraction)');
}

// ── Test 4 : finishTrackLoading appelle updateStudioFileContext ──
function testFinishTrackLoadingUpdatesContext() {
  const js = readText('src/ui/studio-tab.js');

  const finishStart = js.indexOf('function finishTrackLoading');
  if (finishStart === -1) {
    console.error('❌ Code — finishTrackLoading introuvable');
    process.exit(1);
  }

  // Chercher jusqu'à la prochaine fonction (failTrackLoading) ou fin de fichier
  const nextFunc = js.indexOf('function failTrackLoading', finishStart + 1);
  const afterFinish = js.slice(finishStart, nextFunc > 0 ? nextFunc : finishStart + 2000);
  if (!afterFinish.includes('updateStudioFileContext(name)')) {
    console.error('❌ Code — finishTrackLoading n\'appelle pas updateStudioFileContext');
    process.exit(1);
  }
  console.log('✅ Code — finishTrackLoading appelle updateStudioFileContext');
}

// ── Test 5 : failTrackLoading réinitialise le contexte fichier ──
function testFailTrackLoadingResetsContext() {
  const js = readText('src/ui/studio-tab.js');

  const failStart = js.indexOf('function failTrackLoading');
  if (failStart === -1) {
    console.error('❌ Code — failTrackLoading introuvable');
    process.exit(1);
  }

  const afterFail = js.slice(failStart, failStart + 500);
  if (!afterFail.includes("updateStudioFileContext('')")) {
    console.error('❌ Code — failTrackLoading ne réinitialise pas updateStudioFileContext');
    process.exit(1);
  }
  console.log('✅ Code — failTrackLoading réinitialise updateStudioFileContext');
}

// ── Exécution ──
console.log('=== Tests contrat DOM Studio ===\n');
testDefaultFileContext();
await testBuildFileContextText();
testUpdateStudioFileContextCalledEarly();
testFinishTrackLoadingUpdatesContext();
testFailTrackLoadingResetsContext();
console.log('\n✅ Tous les tests DOM Studio passent.');

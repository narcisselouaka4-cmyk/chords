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

// ── Test 6 : [Claude] — 2026-10-09 — une séparation qui échoue n'est jamais remplacée par des bips ──
// Régression vécue : torchaudio récent sans torchcodec → Demucs échouait à l'enregistrement →
// des bips de 2 s à la place des pistes (« bruit sourd », « lecteur bloqué », « le son bug »).
function testSeparationFailureIsNotFaked() {
  const main = readText('electron/main.js');
  const wrapper = readText('electron/demucs-wrapper.py');
  const studio = readText('src/ui/studio-tab.js');
  const handler = main.slice(main.indexOf("ipcMain.handle('studio:separate'"), main.indexOf("ipcMain.handle('studio:is-separated'"));
  const failures = [];
  if (!/catch \(err\) \{[\s\S]*?return \{ success: false, simulated: false, error: err\.message \};/.test(handler)) failures.push('l\'échec de Demucs ne renvoie pas success: false');
  if (/catch \(err\) \{[\s\S]*?createSimulatedStems/.test(handler)) failures.push('un échec crée encore des pistes simulées (bips)');
  if (!wrapper.includes('torchaudio.save = _write_wav') || wrapper.indexOf('torchaudio.save = _write_wav') > wrapper.indexOf('import demucs.separate')) failures.push('demucs-wrapper.py ne remplace pas torchaudio.save avant d\'importer demucs');
  if (!main.includes("await fs.writeFile(path.join(stemsDir, SIMULATED_MARK)")) failures.push('les pistes simulées ne sont pas marquées');
  if (!/ipcMain\.handle\('studio:get-stems'[\s\S]*?hasLegacyBeepStems/.test(main)) failures.push('les anciens bips ne sont pas écartés au chargement');
  if (!studio.includes('if (!separationResult?.success) throw new Error(separationFailureText(separationResult));')) failures.push('le Studio charge les pistes même quand la séparation a échoué');
  if (!studio.includes('if (result?.success !== true) {')) failures.push('« Réanalyser » prend un message d\'erreur pour un succès');
  if (failures.length) {
    console.error(`❌ Séparation — ${failures.join(' ; ')}`);
    process.exit(1);
  }
  console.log('✅ Séparation — un échec est dit (pas de bips), torchaudio.save remplacé, anciens bips écartés');
}

// ── Test 7 : [Claude] — 2026-10-09 — la consigne de l'étape 1 est dans le lecteur, sans voile décalé ──
function testStageOverlayInPlayer() {
  const html = readText('src/index.html');
  const css = readText('src/ui/refonte/studio.css');
  const wrap = html.indexOf('id="studio-player-wrap"');
  const overlay = html.indexOf('id="studio-stage-overlay"');
  const video = html.indexOf('id="studio-video-container"');
  const skinRule = css.slice(css.indexOf(":root[data-skin='global'] #studio-tab .studio-stage-overlay,"), css.indexOf('}', css.indexOf(":root[data-skin='global'] #studio-tab .studio-stage-overlay,")));
  if (!(wrap > 0 && overlay > wrap && overlay < video) || /inset:\s*0/.test(skinRule) || /backdrop-filter/.test(skinRule)) {
    console.error('❌ Étape 1 — la consigne doit être dans .studio-player-wrap, sans voile plein écran (inset: 0 + translateX la décalait d\'un demi-écran)');
    process.exit(1);
  }
  console.log('✅ Étape 1 — consigne en carte dans le lecteur, sans voile décalé');
}

// ── Test 8 : [Claude] — 2026-10-09 — une région gardée sans pistes se confirme de nouveau ──
function testConfirmedRegionWithoutStems() {
  const js = readText('src/ui/studio-tab.js');
  if (!/if \(metadata\?\.region\?\.confirmed\) \{[\s\S]*?const hasStems = Object\.values\(stemPaths\)\.some\(Boolean\);\s*regionConfirmed = hasStems;/.test(js)) {
    console.error('❌ Région gardée — sans pistes, elle doit redevenir « à confirmer » (sinon « Confirmer la région » disparaît)');
    process.exit(1);
  }
  console.log('✅ Région gardée — sans pistes, « Confirmer la région » revient');
}

// ── Test 9 : [Claude] — 2026-10-09 — région verrouillée pendant chargement / traitement ; séparation directe ≤ 5 min ──
function testRegionLockAndShortTracks() {
  const js = readText('src/ui/studio-tab.js');
  const failures = [];
  if (!js.includes('return isLoadingTrack || isProcessing;')) failures.push('pas de verrou de région');
  if (!/els\.backRegionBtn\.disabled = locked;\s*if \(els\.resetRegionBtn\) els\.resetRegionBtn\.disabled = locked;/.test(js)) failures.push('« ↩ » et « ↺ » ne sont pas désactivés pendant le chargement / traitement');
  for (const fn of ['function confirmRegion() {\n  if (regionEnd === null || regionLocked()) return;', 'async function backRegion() {\n  if (regionLocked()) return;', 'async function resetRegion() {\n  if (regionLocked()) return;']) {
    if (!js.includes(fn)) failures.push(`garde absente : ${fn.split('(')[0]}`);
  }
  if (!/function updateStudioStage\(stage\) \{[\s\S]*?updateCropButtons\(\);/.test(js)) failures.push('les boutons ne suivent pas les changements d\'étape');
  if (!/finishTrackLoading\(trackName\);\s*await separateShortTrackDirectly\(trackId\);/.test(js)
    || !js.includes('if (!(total > 0 && total <= MAX_REGION_DURATION) || autoSeparationTried.has(trackId)) return;')) failures.push('pas de séparation directe pour un morceau de 5 min au plus');
  if (failures.length) {
    console.error(`❌ Région — ${failures.join(' ; ')}`);
    process.exit(1);
  }
  console.log('✅ Région — verrouillée pendant chargement et traitement ; ≤ 5 min : séparation directe (une fois par séance)');
}

// ── Test 10 : [Claude] — 2026-10-09 — au lâcher d'un marqueur, la lecture se place dessus ──
function testSeekOnMarkerRelease() {
  const js = readText('src/ui/studio-tab.js');
  const up = js.slice(js.indexOf("window.addEventListener('mouseup'"), js.indexOf("wrap.addEventListener('dblclick'"));
  if (!/handle === 'end' && regionEnd !== null\) seek\(Math\.max\(regionStart, regionEnd - END_PREVIEW_SECONDS\)\);\s*else seek\(regionStart\);/.test(up)
    || !/isDraggingRegion = false;\s*seek\(regionStart\);/.test(up)) {
    console.error('❌ Région — au lâcher d\'un marqueur, la lecture doit se placer au début (ou 3 s avant la fin)');
    process.exit(1);
  }
  console.log('✅ Région — marqueur lâché : la lecture se place au début de la région (fin : 3 s avant)');
}

// ── Exécution ──
console.log('=== Tests contrat DOM Studio ===\n');
testDefaultFileContext();
await testBuildFileContextText();
testUpdateStudioFileContextCalledEarly();
testFinishTrackLoadingUpdatesContext();
testFailTrackLoadingResetsContext();
testSeparationFailureIsNotFaked();
testStageOverlayInPlayer();
testConfirmedRegionWithoutStems();
testRegionLockAndShortTracks();
testSeekOnMarkerRelease();
console.log('\n✅ Tous les tests DOM Studio passent.');

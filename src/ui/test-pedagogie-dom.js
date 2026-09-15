// [Claude] — 2026-09-05 — Test de contrat DOM pour Pédagogie IA.
// Exécutable avec : node src/ui/test-pedagogie-dom.js
//
// Même rôle que test-coach-dom.js : vérifier que le contrat entre index.html,
// main.js, pedagogie-tab.js, preload.cjs, electron/main.js et practice.css
// tient. C'est la classe de panne déjà vécue sur ce projet — un identifiant ou
// un import qui dérive d'un fichier à l'autre et éteint une partie de
// l'interface sans le dire.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');
const readText = (p) => readFileSync(resolve(projectRoot, p), 'utf-8');

const html = readText('src/index.html');
const mainJs = readText('src/main.js');
const tabJs = readText('src/ui/pedagogie-tab.js');
const practiceCss = readText('src/ui/refonte/practice.css');
const preload = readText('electron/preload.cjs');
const electronMain = readText('electron/main.js');
const electronMainCode = stripComments(electronMain);

/** Retire les commentaires : un invariant porte sur le code, pas sur sa doc. */
function stripComments(source) {
  // Les commentaires de LIGNE sont retirés d'abord, et les blocs ensuite.
  // L'ordre inverse est un piège réel, rencontré ici : un commentaire de ligne
  // qui cite un chemin comme « src/pedagogie/* » contient la séquence
  // d'ouverture d'un bloc, et le motif de bloc avalait alors tout le fichier
  // jusqu'au prochain « */ » — faisant échouer des contrôles portant sur du
  // code parfaitement présent.
  return source
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const tabCode = stripComments(tabJs);

let total = 0;
let passed = 0;
function check(name, condition, detail = '') {
  total++;
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// 1. La pilule est réelle
// ---------------------------------------------------------------------------

// [Refonte Astra 12/09] — la pilule porte maintenant une icône SVG et son
// libellé dans un <span> : on la reconnaît par son data-view, pas par son texte brut.
const pill = html.match(/<button[^>]*data-view="pedagogie"[^>]*>[\s\S]*?<\/button>/)?.[0];
check('La pilule « Pédagogie IA » existe', !!pill);
if (pill) {
  check('La pilule porte data-view="pedagogie"', pill.includes('data-view="pedagogie"'), pill);
  check('La pilule n\'est plus désactivée', !pill.includes('disabled'), pill);
  check('La pilule n\'est plus un placeholder', !pill.includes('is-placeholder'), pill);
}
check('Plus aucune pilule d\'Entraînement n\'est un placeholder',
  !/practice-mode-btn is-placeholder/.test(html));

// ---------------------------------------------------------------------------
// 2. La vue sœur existe
// ---------------------------------------------------------------------------

check('La vue #practice-view-pedagogie existe', html.includes('id="practice-view-pedagogie"'));
check('La vue est cachée par défaut',
  /id="practice-view-pedagogie"[^>]*style="display: none;"/.test(html));

// ---------------------------------------------------------------------------
// 3. Contrat d'identifiants entre le JS et le HTML
// ---------------------------------------------------------------------------

const ids = [...tabJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
check('pedagogie-tab.js référence des identifiants', ids.length > 0);
// pedagogie-calibration-overlay est créé dynamiquement, pas dans le HTML statique.
const missing = ids.filter((id) => id !== 'pedagogie-calibration-overlay' && !html.includes(`id="${id}"`));
check('Tous les identifiants lus par pedagogie-tab.js existent dans index.html',
  missing.length === 0, missing.join(', '));

// ---------------------------------------------------------------------------
// 4. Bascule de vue et initialisation
// ---------------------------------------------------------------------------

check('main.js expose la vue dans ses références DOM',
  mainJs.includes("practiceViewPedagogie: document.getElementById('practice-view-pedagogie')"));
check('La table de vues contient pedagogie', /dedicatedViews\s*=\s*\{[^}]*pedagogie:/s.test(mainJs));
check('La table de vues contient toujours coach', /dedicatedViews\s*=\s*\{[^}]*coach:/s.test(mainJs));
check('La table de vues contient toujours Sessions MIDI',
  /dedicatedViews\s*=\s*\{[^}]*'midi-sessions':/s.test(mainJs));
check('main.js importe initPedagogieTab', mainJs.includes("from './ui/pedagogie-tab.js'"));
// [Régression 2026-09-06] — init() est blindé : l'appel est passé de
// `initPedagogieTab();` à `safeInit('initPedagogieTab', initPedagogieTab);`.
// Le câblage reste vérifié par la présence du nom dans l'appel.
check('main.js appelle initPedagogieTab()',
  /safeInit\(\s*'initPedagogieTab'\s*,\s*initPedagogieTab\s*\)|initPedagogieTab\(\)/.test(mainJs));

// ---------------------------------------------------------------------------
// 5. Chaîne IPC complète
// ---------------------------------------------------------------------------

check('Le handler IPC pedagogie:analyze-video existe',
  electronMain.includes("ipcMain.handle('pedagogie:analyze-video'"));
check('Le preload actif expose analyzeVideo',
  preload.includes("ipcRenderer.invoke('pedagogie:analyze-video'"));
check('Le contrôleur appelle bien cet IPC', tabCode.includes('pedagogie.analyzeVideo'));
check('L\'extraction d\'images réutilise ffmpeg, comme le remux Studio',
  /spawn\('ffmpeg'/.test(electronMain));
check('Les images sont lues en flux, jamais toutes gardées en mémoire',
  electronMain.includes('streamFrames'));
check('Le handler impose un plafond de durée de 30 minutes (VideoTooLong)',
  electronMain.includes('VideoTooLong') && electronMain.includes('MAX_DURATION_SECONDS')
  && /duration\s*>\s*MAX_DURATION_SECONDS/.test(electronMainCode));
check('Le nombre d\'images de sondage scale avec la durée jusqu\'à un plafond',
  electronMain.includes('Math.min(60, Math.max(24, Math.ceil(duration / 30)))'));
check('Le contrôle de durée se fait avant collectFrames',
  /duration\s*>\s*MAX_DURATION_SECONDS[\s\S]*?collectFrames/.test(electronMainCode));

// ---------------------------------------------------------------------------
// 6. Le repli audio réutilise le pipeline existant
// ---------------------------------------------------------------------------

check('Le repli audio passe par analyzer.processFile, pas par un second moteur',
  tabCode.includes('analyzer.processFile'));
check('Le repli audio demande le mode posthoc_discriminator',
  tabCode.includes('posthoc_discriminator'));
check('Le repli audio traduit les bornes par le module pur, pas à la main',
  tabCode.includes('normalizeAnalyzerChords'));
check('La traduction lit bien startTime/endTime, les noms du moteur',
  readText('src/pedagogie/audio-fallback.js').includes('c?.startTime')
  && readText('src/pedagogie/audio-fallback.js').includes('c?.endTime'));

// ---------------------------------------------------------------------------
// 6 bis. Transcription locale de la bande son (non affichée : alimente le Copilot)
// ---------------------------------------------------------------------------

const transcriber = readText('electron/transcriber.py');

check('Le handler IPC pedagogie:transcribe-video existe',
  electronMain.includes("ipcMain.handle('pedagogie:transcribe-video'"));
check('Le preload actif expose transcribeVideo',
  preload.includes("ipcRenderer.invoke('pedagogie:transcribe-video'"));
check('Le contrôleur appelle bien cet IPC', tabCode.includes('pedagogie.transcribeVideo'));

check('La transcription réutilise l\'extraction audio existante, pas une seconde',
  /extractTrackAudio\([^)]*wavPath/.test(electronMain));
check('La disponibilité de faster-whisper est vérifiée avant de lancer quoi que ce soit',
  electronMain.includes("'import faster_whisper'"));
check('Les trois indisponibilités sont distinguées par l\'IPC',
  electronMain.includes("'dependency-missing'")
  && electronMain.includes("'no-speech'")
  && electronMain.includes("reason: 'failed'"));
check('Le contrôleur traduit le retour par le module pur',
  tabCode.includes('normalizeTranscription') && tabCode.includes('alignNarration'));

check('Le script Python suit le contrat du dépôt : JSON sur stdout, journaux sur stderr',
  transcriber.includes('print(json.dumps(') && transcriber.includes('file=sys.stderr'));
check('La taille de modèle est une constante nommée, pas une valeur enfouie',
  /DEFAULT_MODEL\s*=\s*"/.test(transcriber));
check('Le garde-fou anti-hallucination est en place (VAD + seuil de silence)',
  transcriber.includes('vad_filter=True') && transcriber.includes('no_speech_prob'));
check('Aucun texte n\'est simulé quand la dépendance manque (contrairement aux stems Demucs)',
  !/simulated.*transcri|fake.*transcript/i.test(electronMain));

check('La transcription a son propre dossier de travail, pour ne pas purger celui de l\'analyse',
  electronMain.includes('createTranscribeDir'));

// La couche IA reste facultative : le résumé automatique n'est tenté que si une clé est configurée.
check('Le contrôleur détecte la présence d\'une clé IA',
  tabCode.includes('hasAIKey()') && tabCode.includes('getAIConfig'));
check('Le résumé automatique appelle explainNarration',
  tabCode.includes('explainNarration'));
check('explainNarration suit le patron des autres appels IA (401/403 et 429 nommés)',
  readText('src/ai/ai-client.js').includes('fetchNarrationExplanation'));
check('Masterclass et Réharmonisation ne sont pas touchées',
  readText('src/ai/ai-client.js').includes('export async function generateMasterclass')
  && readText('src/ai/ai-client.js').includes('export async function generateReharmonization'));

// ---------------------------------------------------------------------------
// 6 ter. Refonte Phase 1 — bibliothèque propre, vidéo principale, résumé Copilot
// ---------------------------------------------------------------------------

const tutorialLib = readText('src/pedagogie/tutorial-library.js');
const tutorialLibCode = stripComments(tutorialLib);

check('Le contrôleur n\'utilise PLUS le magasin Studio (studio-storage ni media-library)',
  !tabCode.includes('studio-storage') && !tabCode.includes('media-library'),
  'un import résiduel empêcherait l\'indépendance des bibliothèques');
check('La bibliothèque de tutoriels est un module à part, pas une modification du magasin',
  readText('src/recorder/studio-storage.js').includes('STUDIO_DIR_NAME')
  && !readText('src/recorder/studio-storage.js').includes('tutorial'));
check('La bibliothèque de tutoriels ne retient que des .mp4',
  tutorialLib.includes('.mp4') && /toLowerCase\(\)\.endsWith/.test(tutorialLib));
check('La bibliothèque liste le dossier par files.readDir, sans copie ni Track_ID',
  tutorialLibCode.includes('readDir') && !tutorialLibCode.includes('Track_'),
  'le code doit lister, pas copier au listing');
check('Le sélecteur de dossier existe côté IPC (openDirectory)',
  electronMain.includes("ipcMain.handle('pedagogie:select-tutorial-folder'")
  && /properties:\s*\['openDirectory'\]/.test(electronMain));
check('Le preload expose selectTutorialFolder',
  preload.includes("ipcRenderer.invoke('pedagogie:select-tutorial-folder'"));
check('L\'import copie dans le dossier configuré (readBinary/writeBinary), sans entrée Studio',
  tutorialLib.includes('readBinary') && tutorialLib.includes('writeBinary')
  && !tutorialLib.includes('importToLibrary'));

// La vidéo est la fenêtre principale de l'écran.
check('Le lecteur vidéo principal existe dans le HTML',
  html.includes('id="pedagogie-video-player"') && /<video[^>]*id="pedagogie-video-player"[^>]*controls/.test(html));
check('La vidéo est un SEUL élément natif avec le son (pas la paire muette + audio du Studio)',
  tabJs.includes("video/mp4") && !/video\.muted\s*=\s*true/.test(tabCode));
check('Le montage vidéo passe par files.readBinary (CSP : jamais fetch(blob))',
  tabCode.includes('readBinary') && !tabCode.includes('fetch('));
check('La vidéo est montée depuis un blob, comme dans le Studio',
  tabCode.includes('URL.createObjectURL'));
check('L\'URL blob est libérée avant chaque nouveau montage (pas de fuite)',
  tabCode.includes('URL.revokeObjectURL'));
check('La grille d\'accords est un accompagnement : bande compacte sous le lecteur',
  /max-height:\s*168px/.test(practiceCss) && html.indexOf('id="pedagogie-video-card"') < html.indexOf('id="pedagogie-grid"'));

// La carte « Ce que dit le professeur » a été retirée : la transcription
// alimente maintenant le Copilot IA, elle n'a plus sa propre carte.
check('La carte « Ce que dit le professeur » est supprimée',
  !html.includes('id="pedagogie-narration-card"'));
check('Le badge « traduit automatiquement » est supprimé',
  !html.includes('id="pedagogie-translation-badge"'));
check('Le bouton « Approfondir avec l\'IA » est supprimé',
  !html.includes('id="pedagogie-explain-btn"'));
check('L\'ancien conteneur de transcription est supprimé',
  !html.includes('id="pedagogie-transcript"'));
check('Les styles de transcription ligne/ligne-time/badge sont supprimés',
  !practiceCss.includes('.pedagogie-line')
  && !practiceCss.includes('.pedagogie-line-time')
  && !practiceCss.includes('.pedagogie-translation-badge'));

// Vidéo différée : visible seulement à la lecture, pas à la sélection.
check('Un état distinct playbackStarted est introduit',
  tabCode.includes('let playbackStarted') && tabCode.includes('playbackStarted = true'));
check('La vidéo ne s\'affiche que si playbackStarted est true',
  /renderVideo\([^)]*\)[\s\S]*?selectedPath.*playbackStarted|if \(!selectedPath \|\| !playbackStarted\)/.test(tabCode));
check('selectTrack() remet playbackStarted à false',
  /function selectTrack\(path\)[\s\S]*?playbackStarted = false/.test(tabCode));
check('chooseFolder() remet playbackStarted à false',
  /async function chooseFolder\(\)[\s\S]*?playbackStarted = false/.test(tabCode));
check('analyzeSelected() passe playbackStarted à true au début',
  /async function analyzeSelected\(\)[\s\S]*?playbackStarted = true/.test(tabCode));

// Raccourci Copilote IA visible pendant la lecture.
check('Le bouton raccourci "Copilote IA" existe dans le HTML',
  html.includes('id="pedagogie-copilot-shortcut"') && html.includes('Copilote IA'));
check('Le contrôleur référence le bouton Copilote IA',
  tabCode.includes('pedagogie-copilot-shortcut'));
check('Le raccourci dispatche app-switch-training-view vers copilot',
  /app-switch-training-view.*detail:.*view:\s*['"]copilot['"]/.test(tabCode));

// Sélecteur de catégorie de tutoriel.
check('Le sélecteur de catégorie existe dans le HTML',
  html.includes('id="pedagogie-category-card"') && html.includes('id="pedagogie-category-grid"'));
check('Les deux catégories (tutorial / cover) sont présentes dans le HTML',
  html.includes('data-category="tutorial"') && html.includes('data-category="cover"'));
check('Le contrôleur référence le sélecteur de catégorie',
  tabCode.includes('pedagogie-category-card') && tabCode.includes('pedagogie-category-grid'));
check('La persistance de catégorie est importée depuis tutorial-folder-pref.js',
  tabCode.includes('getTutorialCategory') && tabCode.includes('saveTutorialCategory')
  && tabCode.includes('TUTORIAL_CATEGORIES'));
check('analyzeSelected() pose categoryPickerOpen quand aucune catégorie n\'est connue',
  /async function analyzeSelected\(\)[\s\S]*?categoryPickerOpen = true/.test(tabCode));
check('La grille d\'accords est masquée en mode tutoriel',
  tabCode.includes('resultGridCard.style.display') && tabCode.includes('TUTORIAL_CATEGORIES.TUTORIAL'));
check('La carte Copilot est affichée en mode tutoriel',
  tabCode.includes('resultCopilotCard.style.display') && tabCode.includes('TUTORIAL_CATEGORIES.TUTORIAL'));
check('L\'indicateur de catégorie permet de changer le choix',
  tabCode.includes('categoryPickerOpen = true') && tabCode.includes('pedagogie-category-hint'));

// Résumé automatique du sujet en mode tutoriel.
check('La carte Copilot summary a un emplacement de texte dédié',
  html.includes('id="pedagogie-copilot-summary-text"'));
check('Le contrôleur référence l\'emplacement du résumé',
  tabCode.includes('pedagogie-copilot-summary-text'));
check('Le résumé automatique ne se déclenche qu\'en mode tutoriel',
  tabCode.includes('TUTORIAL_CATEGORIES.TUTORIAL') && tabCode.includes('maybeAutoSummarize'));
check('Le résumé automatique exige une clé IA',
  /maybeAutoSummarize[\s\S]*?hasAIKey\(\)/.test(tabCode));
check('L\'état "Génération du résumé…" est affiché pendant l\'appel',
  tabCode.includes('Génération du résumé…'));
check('Le résumé est affiché dans la carte Copilot summary une fois prêt',
  tabCode.includes('copilotSummaryText.textContent = summary'));


const audioOnlyJs = readText('src/pedagogie/video-analysis.js');
check('Le panneau notes ne répète plus le badge de provenance (explainUnrecognised retiré du rendu notes)',
  !readText('src/pedagogie/video-analysis.js').includes('kind: \'format\'')
  && !readText('src/pedagogie/video-analysis.js').includes('kind: \'source\''));
check('buildNotes garde ce qui n\'est dit nulle part ailleurs (octave, tierces, non résolus, glossaire)',
  audioOnlyJs.includes('anchorIsHeuristic') && audioOnlyJs.includes('thirdless')
  && audioOnlyJs.includes('unresolved') && audioOnlyJs.includes('missingConcepts'));
// [Refonte Astra 12/09] — Le panneau « Ce que l'application ne garantit pas »
// a été retiré de l'écran sur demande de Narcisse (un seul onglet conservé,
// « Résumé du cours »). L'assertion vérifie désormais son ABSENCE, DOM et JS.
check('Le panneau notes a bien été retiré, markup et JS',
  !html.includes('id="pedagogie-notes-card"') && !tabCode.includes('els.notesCard'));
check('L\'écran dit clairement de choisir un dossier quand aucun n\'est configuré',
  html.includes('pedagogie-folder-hint') && tabCode.includes('Choisissez le dossier'));
check('Le gros bouton "Choisir le dossier" est créé par le contrôleur quand aucun dossier n\'est configuré',
  tabCode.includes('Choisir le dossier des tutoriels')
  && tabCode.includes("'panel-action'"));
check('Le bouton d\'import est masqué quand aucun dossier n\'est configuré',
  tabCode.includes('els.importBtn.style.display = folder') || tabCode.includes("importBtn.style.display = folder"));

// Le résumé automatique n'est pas dupliqué par une traduction automatique : le
// transcript est donné à explainNarration en langue source, le modèle répond en
// français. translateNarrationSegments reste dans ai-client.js pour d'autres usages
// futurs mais n'est plus appelé ici.
check('translateNarrationSegments n\'est plus importée dans pedagogie-tab.js',
  !tabCode.includes('translateNarrationSegments'));
check('maybeTranslate n\'existe plus dans pedagogie-tab.js',
  !tabCode.includes('maybeTranslate'));
check('La traduction automatique n\'est plus tentée ici',
  !tabCode.includes('translationFailed') && !tabCode.includes('translated ='));
check('Le résumé automatique est la seule explication de narration lancée par le contrôleur',
  tabCode.includes('maybeAutoSummarize'));

// ---------------------------------------------------------------------------
// 7. Garde-fous du projet
// ---------------------------------------------------------------------------

check('Le contrôleur ne redessine pas le clavier virtuel',
  !tabCode.includes('keyboard-svg') && !tabCode.includes('virtual-keyboard')
  && !tabCode.includes('hero-mini-kb'));
check('Le contrôleur ne touche pas au chantier Coach',
  !tabCode.includes('coach-tab.js') && !tabCode.includes('/coach/'));
check('Aucune décision musicale dans le contrôleur : pas d\'appel direct au moteur d\'accords',
  !tabCode.includes('detectChord'));
check('Le nommage passe par le moteur d\'accords existant, pas par un second',
  readText('src/pedagogie/chord-labeling.js').includes("from '../chord-engine/index.js'"));
check('Le faux ami chord-engine/pedagogy.js n\'est pas réutilisé par erreur',
  !tabCode.includes('chord-engine/pedagogy'));

// ---------------------------------------------------------------------------
// 8. Les deux skins
// ---------------------------------------------------------------------------

const g = (practiceCss.match(/:root\[data-skin='global'\] #practice-view-pedagogie/g) || []).length;
const v = (practiceCss.match(/:root\[data-skin='v2'\] #practice-view-pedagogie/g) || []).length;
check('practice.css habille la vue en skin Global', g > 20, `${g} règles`);
check('practice.css habille la vue en skin v2', v > 20, `${v} règles`);
for (const sel of ['.pedagogie-layout', '.pedagogie-card', '.pedagogie-chip', '.pedagogie-track-row',
  '.pedagogie-secondary-btn']) {
  check(`« ${sel} » est stylé dans les deux skins`,
    practiceCss.includes(`:root[data-skin='global'] #practice-view-pedagogie ${sel}`)
    && practiceCss.includes(`:root[data-skin='v2'] #practice-view-pedagogie ${sel}`));
}

// ---------------------------------------------------------------------------
// 9. Honnêteté de l'affichage
// ---------------------------------------------------------------------------

check('L\'écran affiche la provenance du relevé (image ou son)',
  html.includes('id="pedagogie-format"') && tabCode.includes('is-audio'));
check('Le bouton « Calibrer le clavier (V2N) » a été retiré, markup et JS',
  !html.includes('id="pedagogie-calibrate-v2n-btn"') && !tabCode.includes('els.calibrateBtn'));
check('Un accord non résolu est marqué, pas deviné',
  tabCode.includes('is-unresolved'));
check('Un accord sans tierce est distingué visuellement',
  tabCode.includes('is-partial')
  && practiceCss.includes('.pedagogie-chip.is-partial'));

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;

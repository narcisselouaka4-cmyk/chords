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

// [Claude] — 2026-10-03 — Plus de résumé automatique (Narcisse : « un résumé est trop
// court et manque d'explications ») : le Copilote, intégré à l'écran, explique à la demande.
check('Plus de résumé automatique : aucun appel à explainNarration depuis l\'écran',
  !tabCode.includes('explainNarration') && !tabCode.includes('maybeAutoSummarize'));
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

// La vidéo est la fenêtre principale de l'écran. L'attribut controls est
// positionné dynamiquement par renderVideo() : pas de controls avant la lecture
// (l'overlay d'aperçu remplace les contrôles natifs), controls activé ensuite.
check('Le lecteur vidéo principal existe dans le HTML',
  html.includes('id="pedagogie-video-player"') && /<video[^>]*id="pedagogie-video-player"/.test(html));
check('Les contrôles natifs sont activés dynamiquement à la lecture',
  tabCode.includes('els.videoPlayer.controls = playbackStarted'));
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

// La vidéo est montée dès la sélection d'un tutoriel (aperçu de la première
// frame) ; l'overlay de lecture disparaît quand playbackStarted passe à true.
check('Un état distinct playbackStarted est introduit',
  tabCode.includes('let playbackStarted') && tabCode.includes('playbackStarted = true'));
check('La vidéo est montée dès la sélection d\'un tutoriel',
  /renderVideo\([^)]*\)[\s\S]*?if \(!selectedPath\)/.test(tabCode) && tabCode.includes('mountVideo(selectedPath)'));
check('L\'overlay de lecture disparaît dès que la lecture commence',
  tabCode.includes('els.videoOverlay') && /!playbackStarted/.test(tabCode));
check('selectTrack() remet playbackStarted à false',
  /function selectTrack\(path\) \{[\s\S]*?resetTutorialView\(\);/.test(tabCode)
  && /function resetTutorialView\(\) \{\s*playbackStarted = false;/.test(tabCode));
check('chooseFolder() remet playbackStarted à false',
  /async function chooseFolder\(\)[\s\S]*?playbackStarted = false/.test(tabCode));
check('analyzeSelected() passe playbackStarted à true au début',
  /async function analyzeSelected\(\)[\s\S]*?playbackStarted = true/.test(tabCode));

// [Claude] — 2026-10-03 — Le Copilote est INTÉGRÉ à Pédagogie IA (Narcisse : « pourquoi
// ne pas intégrer directement Copilot IA au sein de Pédagogie IA, plutôt que d'être
// redirigé vers un onglet séparé ? ») : sa conversation est déplacée dans le panneau.
const dockCode = readText('src/pedagogie/copilot-dock.js');
check('Le panneau du Copilote est dans l\'écran, à droite de la vidéo',
  html.includes('id="pedagogie-copilot-panel"') && html.includes('id="pedagogie-copilot-slot"')
  && html.indexOf('id="pedagogie-video-card"') < html.indexOf('id="pedagogie-copilot-panel"'));
check('La conversation du Copilote est déplacée (un seul moteur), puis remise dans son onglet',
  tabCode.includes('dockCopilot(') && tabCode.includes('undockCopilot()')
  && dockCode.includes("'copilot-chat-area'") && dockCode.includes('homeMarker.after('));
check('Le Copilote passe en mode tutoriel sur le tuto ouvert',
  tabCode.includes("'copilot-open-tutorial'"));
check('Plus de raccourci vers l\'onglet Copilote',
  !html.includes('id="pedagogie-copilot-shortcut"') && !/detail:\s*\{\s*view:\s*['"]copilot['"]/.test(tabCode));
check('Les styles du Copilote valent aussi dans le panneau (même spécificité)',
  practiceCss.includes(':is(#practice-view-copilot, #pedagogie-copilot-panel) .copilot-input')
  && readText('src/ui/refonte/astra-bridge.css').includes(':is(#practice-view-copilot, #pedagogie-copilot-panel) .copilot-example-text'));
check('Le Copilote sait où en est la vidéo (le passage « ici »)',
  tabCode.includes('momentContext(') && html.includes('id="pedagogie-moment-range"') && html.includes('id="pedagogie-moment-length"'));
check('Poser une question met la vidéo en pause ; un moment cité place la vidéo',
  tabCode.includes("'copilot-input') pauseVideo()") && tabCode.includes("'pedagogie-seek'")
  && readText('src/pedagogie/copilot-tab.js').includes("'pedagogie-seek'"));

// Plus de question « Tutoriel ou Cover ? » ni de résumé du cours (choix de Narcisse).
// Le balisage de la vue seule, sans ses commentaires.
const pedagogieView = html.slice(html.indexOf('id="practice-view-pedagogie"'), html.indexOf('id="practice-view-copilot"'))
  .replace(/<!--[\s\S]*?-->/g, '');
check('Plus de question « Tutoriel ou Cover ? »',
  !pedagogieView.includes('pedagogie-category-card') && !tabCode.includes('categoryPickerOpen') && !pedagogieView.includes('🎓'));
check('Plus de carte « Résumé du cours »',
  !pedagogieView.includes('pedagogie-copilot-summary-text') && !pedagogieView.includes('Résumé du cours') && !tabCode.includes('Génération du résumé'));
check('Plus de fiches du glossaire à l\'écran',
  !html.includes('id="pedagogie-glossary"'));
check('Les détails techniques (V2N, pip, git lfs) sont repliés, le message reste en clair',
  tabCode.includes("'Détails techniques'") && tabCode.includes('note(readingStatus(technical'));

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
check('Aucune explication automatique de la parole : le Copilote explique à la demande',
  !tabCode.includes('maybeAutoSummarize'));

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
// [Claude] — 2026-09-25 — « Calibrer le clavier » revient (retiré à la refonte
// Astra), mais caché tant qu'il ne sert à rien : V2N ne lit un vrai clavier filmé
// qu'après les 4 coins. Il n'apparaît que si V2N est prêt sur cette machine.
check('« Calibrer le clavier » : caché par défaut, montré seulement si V2N peut lire l\'image',
  /id="pedagogie-calibrate-btn"[^>]*hidden|hidden[^>]*id="pedagogie-calibrate-btn"/.test(html)
    && /calibrateBtn\.hidden = !\(v2nState\?\.available/.test(tabCode)
    && !html.includes('id="pedagogie-calibrate-v2n-btn"'));
check('Un accord non résolu est marqué, pas deviné',
  tabCode.includes('is-unresolved'));
check('Un accord sans tierce est distingué visuellement',
  tabCode.includes('is-partial')
  && practiceCss.includes('.pedagogie-chip.is-partial'));

// ---------------------------------------------------------------------------
// 10. [Claude] — 2026-10-03 — Lot 5 : mémoire des tutos et accueil en cartes
// ---------------------------------------------------------------------------

const pedagoCss = readText('src/ui/refonte/astra-pedagogie.css');
check('Le relevé est gardé après une lecture réussie, et rouvert sans relire la vidéo',
  tabCode.includes('createTutorialMemory') && /if \(succeeded && job\.analysis\) await saveReading\(job\)/.test(tabCode)
  && /restoreFromMemory\(path\)/.test(tabCode) && tabCode.includes('loadAnalysis(path, await fileStat(path))'));
check('« Lire ce tutoriel » : un tuto déjà lu démarre sans nouveau relevé ; « Refaire le relevé » relit tout',
  /function onPlayClick\(\) \{\s*if \(analysis \|\| isReadingHere\(\)/.test(tabCode)
  && /id="pedagogie-redo-btn"[^>]*hidden/.test(html) && /redoBtn\?\.addEventListener\('click', \(\) => \{ analyzeSelected\(\); \}\)/.test(tabCode));
check('Accueil en cartes : vignette, durée, « Déjà lu »',
  html.includes('id="pedagogie-home-grid"') && tabCode.includes("className: 'pedago-card-thumb'") && tabCode.includes('cardDuration(card.duration)')
  && tabCode.includes("'Déjà lu · relevé gardé'") && pedagoCss.includes('#practice-view-pedagogie .pedago-card {'));
check('Vignette : même ffmpeg et même sonde que la lecture des images (IPC pedagogie:thumbnail)',
  electronMain.includes("ipcMain.handle('pedagogie:thumbnail'") && /probeVideoDimensions\(filePath\)[\s\S]{0,400}resolveFfmpeg\(\)[\s\S]{0,600}thumbnailArgs\(filePath, at, width\)/.test(electronMainCode)
  && preload.includes("ipcRenderer.invoke('pedagogie:thumbnail'") && tabCode.includes('api.thumbnail(tut.path'));
check('Sans ffmpeg : la vignette est prise sur la vidéo pendant la lecture',
  /addEventListener\('timeupdate', captureThumbnailFromPlayer\)/.test(tabCode) && tabCode.includes("toDataURL('image/jpeg'"));
check('Une carte dit « Relevé en cours… » quand on est revenu aux cartes pendant un relevé',
  tabCode.includes("busyHere ? 'Relevé en cours…'") && /refreshCard\(path\);/.test(tabCode));

// ---------------------------------------------------------------------------
// 10 bis. [Claude] — 2026-10-03 — Retour aux cartes (Narcisse : « une fois qu'on a choisi
// un tutoriel, on n'a pas d'option qui permette d'en changer »)
// ---------------------------------------------------------------------------
check('« ← Mes tutoriels » remplace le tiroir : caché sur l\'accueil, montré quand un tuto est ouvert',
  /<button[^>]*id="pedagogie-back-btn"[^>]*hidden/.test(html)
  && /els\.backBtn\?\.addEventListener\('click', \(\) => \{ closeTutorial\(\); \}\)/.test(tabCode)
  && /if \(els\.backBtn\) els\.backBtn\.hidden = !hasTutorial;/.test(tabCode));
check('Le tiroir « Mes tutoriels » et sa liste sont retirés (les cartes sont la bibliothèque)',
  !html.includes('pedagogie-library-drawer') && !html.includes('pedagogie-track-list') && !html.includes('pedagogie-home-library-btn')
  && !tabCode.includes('els.trackList'));
check('Le dossier et « Changer de dossier… » sont sur l\'accueil',
  /id="pedagogie-home"[\s\S]*?id="pedagogie-folder-hint"[\s\S]*?id="pedagogie-home-grid"/.test(html)
  && tabCode.includes("text: 'Changer de dossier…'"));
check('Retour aux cartes : vidéo arrêtée, plus de tuto ouvert, le Copilote quitte le mode tuto',
  /function closeTutorial\(\) \{[\s\S]*?pauseVideo\(\);[\s\S]*?selectedPath = null;[\s\S]*?destroyVideo\(\);[\s\S]*?new CustomEvent\('pedagogie-selection-change', \{ detail: \{ path: null \} \}\)/.test(tabCode));
check('Un relevé est un travail à part : il continue après le retour aux cartes et reste gardé sous son tuto',
  /async function runReading\(path\)/.test(tabCode) && /const here = \(\) => selectedPath === path;/.test(tabCode)
  && /if \(here\(\)\) \{[\s\S]*?if \(succeeded && job\.analysis\) applyReading\(job\);/.test(tabCode)
  && !/function selectTrack\(path\) \{\s*if \(busy\) return;/.test(tabCode)
  && /readingQueue = readingQueue\.then\(/.test(tabCode));
check('« Style » et sa liste restent ensemble (groupe .copilot-style)',
  /<span class="copilot-style">\s*<label class="copilot-style-label"[^>]*>Style<\/label>\s*<select id="copilot-style-select"/.test(html)
  && readText('src/ui/refonte/astra-bridge.css').includes('#copilot-quick-actions .copilot-style {'));

// ---------------------------------------------------------------------------
// 11. [Claude] — 2026-10-03 — Lot 6 : outils de travail
// ---------------------------------------------------------------------------

const copilotTabCode = stripComments(readText('src/pedagogie/copilot-tab.js'));
check('Vitesse 0,5× · 0,75× · 1× : playbackRate du lecteur, hauteur du son gardée',
  /const SPEEDS = \[0\.5, 0\.75, 1\]/.test(tabJs) && /video\.preservesPitch = true;[\s\S]{0,80}video\.playbackRate = speed/.test(tabCode)
  && html.includes('id="pedagogie-speed"'));
check('Boucle A-B : elle devient « le passage » du Copilote, un saut voulu hors boucle n\'est pas ramené',
  /loop = \{ start, end \}/.test(tabCode) && /passageWindow\(video\?\.currentTime, \{ length: passageSeconds, loop/.test(tabCode)
  && /wasInside && \(t >= loop\.end \|\| video\.ended\) && t - lastLoopTime < 1\.5/.test(tabCode) && html.includes('id="pedagogie-loop"'));
check('Maj + clic sur un accord de la frise : boucler cet accord', /if \(e\.shiftKey\) loopSegment\(seg\.start, seg\.end\)/.test(tabCode));
check('Sous un exemple du Copilote : « Ajouter à Ma grille » et « Ajouter aux Favoris », reçus par Exercices (main.js)',
  copilotTabCode.includes("new CustomEvent('exercise-save-grid'") && copilotTabCode.includes("new CustomEvent('exercise-add-favorites'")
  && mainJs.includes("document.addEventListener('exercise-save-grid'") && mainJs.includes("document.addEventListener('exercise-add-favorites'")
  && mainJs.includes("document.addEventListener('exercise-open-grid'"));

// ---------------------------------------------------------------------------
// 12. [Claude] — 2026-10-03 — Ne rejouer que ce que le prof joue (vidéo de Narcisse : sa voix
// transcrite comme un piano, rejouée en « vrille » ; Amazing Grace : rejeu sans pédale)
// ---------------------------------------------------------------------------
check('Le Copilote reçoit les notes JOUÉES (sans celles de sa voix), et les moments joue / parle',
  /const view = teacherView\(\);/.test(tabCode) && /const noteEvents = view\.played;/.test(tabCode)
  && /activity: view\.spans,/.test(tabCode) && /chordsWhilePlaying\(allChords, view\.spans\)/.test(tabCode));
check('La frise : « Il explique » là où il parle sans jouer, les accords seulement là où il joue',
  tabCode.includes("className: 'pedagogie-chip is-speech'") && tabCode.includes("text: 'Il explique'")
  && /isPlaying\(sp\.kind\) && seg\.start < sp\.end && seg\.end > sp\.start/.test(tabCode));
check('Sa pédale, entendue au son, est gardée avec le relevé et passée au Copilote',
  /built\.pedals = \(piano\.pedals \|\| \[\]\)/.test(tabCode) && /pedals: Array\.isArray\(analysis\.pedals\)/.test(tabCode));

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;

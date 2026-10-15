// [Claude] — 2026-09-06 — Pédagogie IA : contrôleur d'écran.
//
// Orchestration seule. Aucune décision musicale n'est prise ici : la lecture de
// l'image, le découpage en segments, le nommage des accords et le glossaire
// vivent dans src/pedagogie/*, qui est pur et testé. Ce fichier appelle l'IPC,
// assemble le résultat et l'affiche.
//
// Ce que l'écran doit rendre visible, et pas seulement calculer :
//   - le format reconnu, ou la raison pour laquelle l'image n'a rien donné ;
//   - d'où vient chaque accord (image ou son) ;
//   - ce qui n'est pas garanti (octave heuristique, tierces non jouées,
//     passages non résolus, concepts sans fiche).
//
// [Refonte Phase 1, 2026-09-06 — retour d'usage de Narcisse]
//   - Bibliothèque PROPRE : des .mp4 lus dans un dossier choisi par
//     l'utilisateur, indépendante du magasin Studio. Un tutoriel EST son
//     fichier, à son emplacement réel (tutorial-library.js).
//   - La vidéo importée est la FENÊTRE PRINCIPALE : un <video controls> natif
//     avec le son, monté depuis un blob (même technique que le Studio, mais
//     un seul élément : pas de stems ici, la complexité à deux éléments du
//     Studio serait de la sur-ingénierie pour ce sous-onglet).
//
// [Claude] — 2026-10-03 — Refonte avec Narcisse. Le besoin : « la clarté des
// professeurs sur YouTube : parfois je ne comprends pas tout ce que dit le pianiste
// (langue, explications floues) ; Pédagogie IA doit m'aider à comprendre les
// concepts de la vidéo pour les appliquer à mon jeu ». Sa réponse : « pourquoi ne pas
// intégrer directement Copilot IA au sein de Pédagogie IA ? ».
//   - La vidéo du prof à gauche, le Copilote à droite : la conversation est celle du
//     Copilote (copilot-tab.js), déplacée ici quand la vue s'ouvre (copilot-dock.js).
//   - Le Copilote sait où en est la vidéo : « ici », « ce qu'il vient de faire » = le
//     passage affiché en haut du panneau (tutorial-moment.js), les 20 dernières
//     secondes par défaut, ou la boucle A-B. Écrire au Copilote met la vidéo en pause ;
//     les moments qu'il cite placent la vidéo (évènement « pedagogie-seek »).
//   - Retirés à sa demande : le « Résumé du cours » (« trop court »), les fiches du
//     glossaire, la question « Tutoriel ou Cover ? », la transcription affichée
//     (« souvent mal traduite » : la parole reste un indice pour le Copilote, jamais
//     montrée). Les messages techniques (V2N, pip, git lfs) sont repliés dans
//     « Détails techniques ».
//   - Lot 5 : le relevé de chaque tuto est gardé (tutorial-memory.js) : rouvrir un tuto
//     déjà lu est instantané (« Lire » lance la vidéo, « Refaire le relevé » relit tout).
//     L'accueil montre les tutos en cartes : vignette (ffmpeg, « pedagogie:thumbnail » ;
//     à défaut, une image prise pendant la lecture), durée, « Déjà lu ».
//
// [Claude] — 2026-10-03 — Retours de Narcisse après la refonte :
//   - « Une fois qu'on a choisi un tutoriel, on n'a pas d'option qui permette d'en
//     changer » : « ← Mes tutoriels » ramène aux cartes (le tiroir est retiré).
//   - Un relevé est un TRAVAIL rangé à part (runReading) : il continue si l'on revient aux
//     cartes ou si l'on ouvre un autre tuto, ses résultats sont gardés sous SON tuto et ne
//     s'affichent que si ce tuto est ouvert. Un seul relevé tourne à la fois.

import { buildVideoAnalysis, buildAudioOnlyAnalysis } from '../pedagogie/video-analysis.js';
import { reconcileWithSound, soundCheckSentence } from '../pedagogie/sound-reconcile.js';
import { pickSoundWindows, windowsToSpans } from '../pedagogie/sound-sampling.js';
import { appConfirm } from './components/app-dialog.js';
import { explainUnrecognised } from '../pedagogie/format-detector.js';
import { crossCheck } from '../pedagogie/cross-check.js';
import { normalizeAnalyzerChords } from '../pedagogie/audio-fallback.js';
import { normalizeTranscription, alignNarration } from '../pedagogie/transcription.js';
import { listTutorialFiles, copyTutorialIntoFolder, tutorialDisplayName, isMp4Name, libraryFolder, deleteTutorialFile } from '../pedagogie/tutorial-library.js';
import { getTutorialFolder, saveTutorialFolder } from '../pedagogie/tutorial-folder-pref.js';
import { samplesToNoteEvents, eventsFromTranscription, compactTimeline, passageExample } from '../pedagogie/teacher-notes.js';
import { isFlashRendering, flashSegments, holdFlashNotes } from '../pedagogie/flash-notes.js';
import { labelNotes } from '../pedagogie/chord-labeling.js';
import { buildTutorialGuide, finalResultExample } from '../pedagogie/tutorial-guide.js';
import { buildChapters, chaptersSignature, needsChapterTitles, chapterMessages, parseChapterTitles, applyChapterTitles } from '../pedagogie/guide-chapters.js';
import { buildHighlights } from '../pedagogie/guide-highlights.js';
import { getAIConfig, callChatCompletions } from '../ai/openai-config.js';
import { withMeasuredVelocity } from '../pedagogie/dynamics.js';
import { registerCopilotContext } from '../pedagogie/copilot-context.js';
import { dockCopilot, undockCopilot } from '../pedagogie/copilot-dock.js';
import { momentContext, passageWindow, clock } from '../pedagogie/tutorial-moment.js';
import { FOLLOW_SECONDS, MAX_PASSAGE_SECONDS, setRangeBound } from '../pedagogie/passage-range.js';
import { createPassageTimeline } from './components/passage-timeline.js';
import { createGuidePanel } from './pedagogie-guide.js';
import { DEFAULT_SHARE, shareAt, isWide, toggledShare, shareForKey, storedShare, clampShare } from '../pedagogie/copilot-width.js';
import { createTutorialMemory, cardDuration, READING_REVISION } from '../pedagogie/tutorial-memory.js';
import { teacherActivity, chordsWhilePlaying, activitySummary, isPlaying, ACTIVITY, withoutReadingArtifacts } from '../pedagogie/teacher-activity.js';
import { songStructure } from '../pedagogie/song-structure.js';
import { createSpeedMenu, setSpeedMenuValue, clampSpeed } from './components/speed-menu.js';
import { createMetronomeMenu, setMetronomeMenuState, flashMetronomeBeat, triggerMetronomeDetect, clampBpm } from './components/metronome-menu.js';
import { createMetronome } from '../audio/metronome.js';
import { estimateTempo } from '../pedagogie/tempo-estimate.js';
import { getAudioContext } from '../audio/simple-synth.js';

// [Claude] — 2026-09-25 — Pourquoi l'image n'a pas été lue (Narcisse : « l'application
// ne peut pas analyser l'image, et je ne sais pas pourquoi ») : dit en clair.
// [Claude] — 2026-10-03 — Ces raisons vont dans « Détails techniques » (repliés).
const V2N_REASONS = {
  'model-missing': 'Le modèle qui lit un vrai clavier filmé (V2N) est absent : electron/v2n-deps/v2n_pianovam.safetensors.',
  'model-lfs-pointer': 'Le modèle V2N n\'est qu\'un pointeur Git LFS (quelques octets au lieu de 113 Mo). Dans le dossier du projet : « git lfs install » puis « git lfs pull ».',
  'missing-packages': 'Paquets Python manquants pour lire un vrai clavier filmé : {detail}. Commande : « .venv/bin/pip install -r requirements.txt ».',
  'python-missing': 'Python est introuvable ({detail}) : la lecture d\'un vrai clavier filmé est impossible.',
  'dependency-missing': 'Paquets Python manquants pour lire un vrai clavier filmé{detail}. Commande : « .venv/bin/pip install -r requirements.txt ».',
  'invalid-corners': 'La calibration du clavier est incomplète : recliquez les 4 coins.',
  failed: 'La lecture du vrai clavier (V2N) a échoué : {detail}',
};

function v2nReasonText(state) {
  const template = V2N_REASONS[state?.reason] || V2N_REASONS.failed;
  const detail = state?.detail ? String(state.detail).split('\n')[0].slice(0, 160) : 'raison inconnue';
  return template.replace('{detail}', state?.reason === 'dependency-missing' ? (state?.detail ? ` : ${detail}` : '') : detail);
}

// [OpenCode] — 2026-09-07 — V2N : calibration persistante par chemin de vidéo.
const V2N_CORNERS_KEY = 'v2n-corners';

function getV2nCorners(path) {
  if (!path) return null;
  try {
    const raw = localStorage.getItem(V2N_CORNERS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const entry = all[path];
    return Array.isArray(entry) && entry.length === 4 ? entry : null;
  } catch {
    return null;
  }
}

function saveV2nCorners(path, corners) {
  if (!path || !corners) return;
  try {
    const raw = localStorage.getItem(V2N_CORNERS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[path] = corners;
    localStorage.setItem(V2N_CORNERS_KEY, JSON.stringify(all));
  } catch { /* silencieux */ }
}

const els = {};
// Un tutoriel est identifié par son CHEMIN de fichier, pas par un Track_ID.
let tutorials = [];
let selectedPath = null;
// La vidéo est prête à lire (contrôles du lecteur) : une fois le tuto analysé.
// [Claude] — 2026-10-03 — Avant, elle démarrait avec « Lire ce tutoriel », pendant le relevé.
let playbackStarted = false;
// [Claude] — 2026-10-03 — Durée la plus longue qu'on analyse (Narcisse : « il faut absolument
// qu'on impose une durée maximale de vidéo traitée ») : 30 min, le plafond de
// pedagogie:analyze-video, dit dès l'import.
const MAX_TUTORIAL_SECONDS = 30 * 60;
// La mémoire du tuto ouvert a été consultée (l'écran d'attente ne s'affiche pas avant).
let memoryChecked = false;
// Dernière analyse qui n'a pas abouti : son tuto et la raison.
let lastFailure = null;
// Le compteur de temps écoulé de l'écran d'attente.
let readingTicker = null;
// [Claude] — 2026-10-03 — Le relevé en cours (un seul à la fois) : son tuto et l'étape où il
// en est. Les relevés demandés pendant ce temps attendent leur tour (readingQueue).
let reading = null;
let readingQueue = Promise.resolve();
const waitingPaths = new Set();
/** Un relevé tourne sur le tuto affiché. */
const isReadingHere = () => Boolean(selectedPath && reading?.path === selectedPath);
let analysis = null;
let comparison = null;
// Passages parlés rapprochés des accords (voir transcription.js) : jamais affichés,
// ils servent d'indice au Copilote.
let narrationView = [];
let detectedKey = null;
// [Claude] — 2026-09-25 — État de V2N (disponible, sinon pourquoi) et raison pour
// laquelle les notes du professeur manquent, s'il en manque.
let v2nState = null;
let notesUnavailable = null;
// Lecteur vidéo blob : une seule URL vivante à la fois.
let videoBlobUrl = null;
// Chemin dont l'URL blob courante est issue : suivre la sélection, pas seulement
// la première apparition du lecteur.
let mountedVideoPath = null;
// [Claude] — 2026-10-03 — La vue Pédagogie est affichée : la conversation du Copilote
// y est alors amarrée.
let viewActive = false;
// Tutoriel déjà annoncé au Copilote (sa bascule en mode tutoriel n'est pas relancée à
// chaque rendu ; remis à zéro à chaque ouverture de la vue).
let announcedPath = null;
// [Claude] — 2026-10-03 — La plage dont on parle au Copilote, choisie avec les listes Début /
// Fin (passage-range.js, 10 min au plus) ; null : elle suit la vidéo (les 30 dernières
// secondes). `looping` : la vidéo tourne sur la plage (l'ancienne boucle A-B).
let passage = null;
let looping = false;
// Ce que la barre dit après un réglage (« la fin a suivi »), et la vidéo pour laquelle ses
// listes ont été construites.
// [Claude] — 2026-10-14 — La barre du passage (components/passage-timeline.js) et le guide du tuto
// (pedagogie-guide.js), dans l'onglet « Guide du tuto » à côté du Copilote.
let timeline = null;
let guidePanel = null;
let guideShownFor = null;
let panelTab = 'guide';
const TIP_KEY = 'pjc.pedagogie.timeline-tip';
// La frise des accords, repliée par défaut (choix retenu dans le navigateur).
// [Claude] — 2026-10-03 — La part du Copilote dans la largeur (poignée, « Agrandir »), retenue.
const COPILOT_WIDTH_KEY = 'pedagogie-copilot-width';
let copilotShare = DEFAULT_SHARE;
// [Claude] — 2026-10-03 — Lot 5 : mémoire des tutos (créée au premier besoin), fiches de
// l'accueil (vignette, durée, « lu »), date du relevé rouvert depuis la mémoire.
let memory = null;
let cards = {};
let restoredAt = null;
// Dernier message affiché sous la vidéo : gardé avec le relevé.
let lastStatus = null;
// Vignettes déjà demandées pendant cette session (une seule tentative par tuto).
const thumbTried = new Set();
// [Claude] — 2026-10-03 — Lot 6 : vitesse de la vidéo (gardée d'un tuto à l'autre).
// [Claude] — 2026-10-04 — De 0,25× à 2×, par pas de 0,05 (Narcisse : « une plus large plage de
// choix »), dans le réglage commun ui/components/speed-menu.js.
let speed = 1;
let speedMenu = null;
// [Claude] — 2026-10-14 — Le métronome (src/audio/metronome.js, components/metronome-menu.js). Réglages
// gardés PAR TUTORIEL (tempo, mesure, place du « 1 », suivre la vidéo) ; le volume est commun.
const METRONOME_KEY = 'pjc.pedagogie.metronome';
let metronome = null;
let metronomeMenu = null;
let metronomeSettings = { bpm: 100, beatsPerBar: 4, follow: false, volume: 0.7, offset: 0, anchored: false };
const metronomeSearched = new Set();   // tutos dont le tempo a déjà été cherché à l'ouverture du panneau
const loudnessCache = new Map();       // chemin → niveau sonore (dB / 10 ms), pour ne le demander qu'une fois

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Message sous la vidéo, en clair. [Claude] — 2026-10-03 — Le détail technique (V2N,
 * pip, git lfs, ffmpeg) n'est plus montré d'office : il est replié dans « Détails
 * techniques ».
 */
function setStatus(message, tone = 'info', details = '') {
  lastStatus = message ? { message, tone, details: String(details || '') } : null;
  if (!els.status) return;
  els.status.textContent = '';
  els.status.dataset.tone = tone;
  els.status.style.display = message ? '' : 'none';
  if (!message) return;
  els.status.appendChild(el('p', { text: message }));
  const extra = String(details || '').trim();
  if (extra) {
    els.status.appendChild(el('details', { className: 'pedagogie-status-details' }, [
      el('summary', { text: 'Détails techniques' }),
      el('p', { text: extra }),
    ]));
  }
}

/** L'étape de l'analyse en cours, sur l'écran d'attente du tuto. */
function setProgress(message) {
  if (els.readingStep && reading?.path === selectedPath) els.readingStep.textContent = message || '';
}

// ---------------------------------------------------------------------------
// Bibliothèque de tutoriels — dossier propre, .mp4 uniquement
// ---------------------------------------------------------------------------

// [Claude] — 2026-10-13 — Plus de dossier à choisir : la bibliothèque est celle de Pédagogie IA
// (~/PianoJazzChords/Pedagogie/bibliotheque), au même titre que celles de l'Analyse et du Studio.
let libraryDir = null;
async function getLibraryDir() {
  if (!libraryDir) libraryDir = await libraryFolder();
  return libraryDir;
}

/** L'ancien dossier de tutoriels, s'il en avait été choisi un (réglage d'avant la bibliothèque). */
function legacyFolder() {
  return getTutorialFolder(typeof localStorage !== 'undefined' ? localStorage : null);
}

/** Le titre d'un tuto : le nom que Narcisse lui a donné, sinon son nom de fichier. */
function tutorialTitle(path) {
  const given = cards[path]?.name;
  if (typeof given === 'string' && given.trim()) return given.trim();
  return tutorialDisplayName(String(path || '').split('/').pop() || String(path || ''));
}

// Les vidéos de l'ancien dossier, à reprendre dans la bibliothèque : { folder, files } ou null.
let legacy = null;

/**
 * Les tutos de la bibliothèque, en cartes sur l'accueil et dans le tiroir « Bibliothèque ».
 * [Claude] — 2026-10-03 — Le tiroir « Mes tutoriels » et sa liste étaient retirés : les cartes sont
 * la bibliothèque, et « ← Mes tutoriels » y ramène. [Claude] — 2026-10-13 — Le tiroir revient,
 * « Bibliothèque », comme dans Sessions MIDI : recherche, renommer, supprimer.
 */
async function refreshTutorials() {
  // Les fiches (« Déjà lu », vignettes, noms) avant les cartes.
  await getMemory();
  const dir = await getLibraryDir();
  if (!dir) {
    tutorials = [];
    libraryProblem = 'La bibliothèque n\'est pas disponible dans cet environnement.';
  } else {
    const result = await listTutorialFiles(dir);
    tutorials = result.files;
    libraryProblem = result.ok ? null : 'La bibliothèque n\'a pas pu être lue (accès refusé ou système de fichiers indisponible).';
  }
  await detectLegacy(dir);
  renderHomeGrid();
}
// La bibliothèque n'a pas pu être lue : l'accueil le dit.
let libraryProblem = null;

/** Des vidéos dans l'ancien dossier configuré, pas encore dans la bibliothèque ? */
async function detectLegacy(dir) {
  legacy = null;
  const folder = legacyFolder();
  if (!folder || !dir || folder.replace(/\/+$/, '') === dir.replace(/\/+$/, '')) return;
  const result = await listTutorialFiles(folder);
  const known = new Set(tutorials.map((t) => t.name.toLowerCase()));
  const files = result.files.filter((f) => !known.has(f.name.toLowerCase()));
  if (files.length) legacy = { folder, files };
}

/** « Reprendre mes N vidéos de l'ancien dossier » : un clic, sur l'accueil. */
function renderLegacyHint() {
  if (!els.legacyHint) return;
  els.legacyHint.innerHTML = '';
  if (!legacy) return;
  els.legacyHint.appendChild(el('button', {
    className: 'pedagogie-folder-btn',
    type: 'button',
    text: `Reprendre mes ${legacy.files.length} vidéo${legacy.files.length > 1 ? 's' : ''} de l'ancien dossier`,
    title: legacy.folder,
    onClick: () => importLegacy(),
  }));
}

/** Copie les vidéos de l'ancien dossier dans la bibliothèque (il n'est pas modifié). */
async function importLegacy() {
  const dir = await getLibraryDir();
  if (!legacy || !dir) return;
  const todo = legacy.files;
  let done = 0;
  let failed = 0;
  for (const file of todo) {
    importNotice(`Reprise de l'ancien dossier… ${done + failed + 1} / ${todo.length}`, 'busy');
    const result = await copyTutorialIntoFolder(file.path, dir);
    if (result.ok) done += 1; else failed += 1;
  }
  // Rien à reprendre une seconde fois : le réglage de l'ancien dossier est oublié.
  if (!failed) saveTutorialFolder(typeof localStorage !== 'undefined' ? localStorage : null, '');
  await refreshTutorials();
  importNotice(failed ? `${done} vidéo${done > 1 ? 's' : ''} reprise${done > 1 ? 's' : ''}, ${failed} n'${failed > 1 ? 'ont' : 'a'} pas pu être copiée${failed > 1 ? 's' : ''}.` : `${done} vidéo${done > 1 ? 's' : ''} reprise${done > 1 ? 's' : ''} dans la bibliothèque.`, failed ? 'error' : 'info');
}

/** Remet l'écran à zéro pour un tuto (ou aucun). Un relevé en cours n'est pas touché. */
function resetTutorialView() {
  playbackStarted = false;
  analysis = null;
  comparison = null;
  restoredAt = null;
  passage = null;
  looping = false;
  guideShownFor = null;
  panelTab = 'guide';
  resetNarration();
  setStatus('');
  setProgress('');
}

function selectTrack(path) {
  if (!path) return;
  if (path !== selectedPath) { stopMetronome(); loadMetronomeFor(path); }
  // [Claude] — 2026-10-03 — Plus bloqué par un relevé en cours : il continue de son côté
  // (runReading), sous son tuto.
  selectedPath = path;
  resetTutorialView();
  memoryChecked = false;
  mountVideo(path);
  render();
  // [Claude] — 2026-10-03 — Déjà analysé : l'analyse revient de la mémoire, sans relire la
  // vidéo. Sinon elle démarre (Narcisse : « un temps de chargement, comme dans l'onglet
  // Analyse et l'onglet Studio ») ; l'écran d'attente le dit, et le Copilote attend.
  restoreFromMemory(path).catch(() => false).then(() => {
    if (selectedPath !== path) return;
    memoryChecked = true;
    if (!analysis && !isReadingHere() && !waitingPaths.has(path) && !isTooLong(path)) analyzeSelected();
    else render();
  });
}

/**
 * [Claude] — 2026-10-03 — Où en est un tuto : « ready » (analysé), « reading » (analyse en
 * cours), « waiting » (un autre passe avant), « tooLong » (plus de 30 min), « todo ».
 */
function tutorialStatus(path) {
  if (!path) return 'none';
  if (reading?.path === path) return 'reading';
  if (waitingPaths.has(path)) return 'waiting';
  if (path === selectedPath ? Boolean(analysis) : Boolean(cards[path]?.analyzedAt)) return 'ready';
  if (isTooLong(path)) return 'tooLong';
  return 'todo';
}

/** Plus long que ce que Pédagogie IA analyse (30 min, comme pedagogie:analyze-video). */
function isTooLong(path) {
  const known = Number(cards[path]?.duration);
  const playing = path === selectedPath ? Number(els.videoPlayer?.duration) : NaN;
  return (Number.isFinite(known) && known > MAX_TUTORIAL_SECONDS) || (Number.isFinite(playing) && playing > MAX_TUTORIAL_SECONDS);
}

/**
 * [Claude] — 2026-10-03 — « ← Mes tutoriels » : retour aux cartes. La vidéo s'arrête, le
 * Copilote quitte le mode tuto ; un relevé en cours continue et sera gardé sous son tuto.
 */
function closeTutorial() {
  stopMetronome();
  pauseVideo();
  if (calibrationMode) cancelCalibration();
  selectedPath = null;
  announcedPath = null;
  resetTutorialView();
  destroyVideo();
  render();
  refreshTutorials();
  // Plus de tutoriel : le Copilote quitte le mode tutoriel s'il y était.
  document.dispatchEvent(new CustomEvent('pedagogie-selection-change', { detail: { path: null } }));
}

// ---------------------------------------------------------------------------
// Mémoire des tutos et accueil en cartes (lot 5)
// ---------------------------------------------------------------------------

/** La mémoire des tutos (relevés, fiches), si l'application peut écrire sur le disque. */
async function getMemory() {
  if (memory) return memory;
  const files = window.electronAPI?.files;
  if (!files?.homeDir || !files.readFile || !files.writeFile) return null;
  try {
    const home = await files.homeDir();
    if (!home) return null;
    const created = createTutorialMemory(files, home);
    cards = await created.readIndex();
    memory = created;
  } catch (err) {
    console.warn('[Pedagogie] mémoire des tutos indisponible :', err);
  }
  return memory;
}

async function fileStat(path) {
  try { return (await window.electronAPI?.files?.stat?.(path)) || null; } catch (_) { return null; }
}

/**
 * [Claude] — 2026-10-04 — Le relevé tel qu'on s'en sert : sa grille sans ce que la lecture a
 * pris pour des touches (un bandeau ou l'écran de fin posé sur le clavier ; ses notes le sont
 * à chaque usage, teacherView). Le relevé gardé reste tel qu'il a été lu : un relevé ancien est
 * corrigé sans refaire l'analyse.
 */
function readingInUse(raw) {
  if (!raw) return raw;
  return withoutReadingArtifacts(raw, { source: raw.notesSource || (raw.source === 'audio' ? 'son' : 'image') });
}

/** Un tuto déjà lu : son relevé revient de la mémoire, sans relire la vidéo. */
async function restoreFromMemory(path) {
  const mem = await getMemory();
  if (!mem) return false;
  const saved = await mem.loadAnalysis(path, await fileStat(path));
  // Un relevé de ce tuto tourne (ou attend) : c'est lui qui s'affichera, pas l'ancien.
  if (!saved || selectedPath !== path || isReadingHere() || waitingPaths.has(path) || analysis) return false;
  analysis = readingInUse(saved.analysis);
  playbackStarted = true;
  comparison = saved.comparison;
  narrationView = Array.isArray(saved.narration) ? saved.narration : [];
  detectedKey = saved.key ?? null;
  notesUnavailable = saved.notesUnavailable ?? null;
  restoredAt = saved.savedAt || null;
  if (saved.status?.message) setStatus(saved.status.message, saved.status.tone || 'info', saved.status.details || '');
  // Le Copilote est réannoncé : son en-tête dit maintenant ce qu'il sait du tuto.
  announcedPath = null;
  render();
  return true;
}

/**
 * Garde le relevé qui vient d'être fait, sous SON tuto (ouvert ou non), et le dit sur
 * l'accueil.
 * @param {{path: string, analysis: object, comparison: object|null, narrationView: object[],
 *   key: string|null, notesUnavailable: string|null, status: object|null}} job
 */
async function saveReading(job) {
  const mem = await getMemory();
  if (!mem || !job?.analysis) return;
  try {
    await mem.saveAnalysis({
      path: job.path,
      stat: await fileStat(job.path),
      analysis: job.analysis,
      comparison: job.comparison,
      narration: job.narrationView,
      key: job.key,
      notesUnavailable: job.notesUnavailable,
      status: job.status,
    });
    cards = await mem.readIndex();
    renderHomeGrid();
  } catch (err) {
    console.warn('[Pedagogie] relevé non gardé :', err);
  }
}

/** Complète la fiche d'un tuto (vignette, durée) et redessine sa carte. */
async function updateCard(path, patch) {
  const mem = await getMemory();
  if (!mem || !Object.keys(patch).length) return;
  await mem.updateCard(path, patch);
  cards = await mem.readIndex();
  refreshCard(path);
  renderLibraryDrawer();
}

const CARD_PLACEHOLDER = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';

/** La carte d'un tuto : sa vignette, sa durée, son nom, « Déjà lu ». */
function buildCard(tut) {
  const card = cards[tut.path] || {};
  const thumb = el('span', { className: 'pedago-card-thumb' });
  if (card.thumb) thumb.appendChild(el('img', { src: card.thumb, alt: '' }));
  else {
    const placeholder = el('span', { className: 'pedago-card-placeholder' });
    placeholder.innerHTML = CARD_PLACEHOLDER;
    thumb.appendChild(placeholder);
  }
  const duration = cardDuration(card.duration);
  if (duration) thumb.appendChild(el('span', { className: 'pedago-card-duration', text: duration }));
  // [Claude] — 2026-10-03 — Où en est son analyse : elle continue si l'on revient aux cartes.
  const status = tutorialStatus(tut.path);
  const day = card.analyzedAt ? new Date(card.analyzedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const meta = {
    reading: 'Analyse en cours…',
    waiting: 'Analyse en attente…',
    ready: day ? `Prêt · analysé le ${day}` : 'Prêt',
    tooLong: 'Trop long : 30 min au plus',
    todo: 'Pas encore analysé',
  }[status] || '';
  return el('button', {
    className: `pedago-card${status === 'ready' ? ' is-read' : ''}${status === 'reading' || status === 'waiting' ? ' is-reading' : ''}${status === 'tooLong' ? ' is-too-long' : ''}`,
    type: 'button',
    title: tut.path,
    'data-path': tut.path,
    onClick: () => selectTrack(tut.path),
  }, [
    thumb,
    el('span', { className: 'pedago-card-body' }, [
      el('strong', { className: 'pedago-card-title', text: tutorialTitle(tut.path) }),
      el('span', { className: 'pedago-card-meta', text: meta }),
    ]),
  ]);
}

/** Redessine la carte d'un tuto (relevé commencé, fini). */
function refreshCard(path) {
  const old = [...(els.homeGrid?.querySelectorAll('.pedago-card') || [])].find((b) => b.dataset.path === path);
  const tut = tutorials.find((t) => t.path === path);
  if (old && tut) old.replaceWith(buildCard(tut));
}

/** Accueil : les tutos du dossier en cartes. */
function renderHomeGrid() {
  if (!els.homeGrid) return;
  els.homeGrid.innerHTML = '';
  const list = tutorials;
  els.home?.classList.toggle('has-cards', list.length > 0);
  renderLibraryDrawer();
  renderHome();
  for (const tut of list) els.homeGrid.appendChild(el('div', { role: 'listitem' }, [buildCard(tut)]));
  ensureThumbnails();
}

/**
 * Vignettes manquantes, une à une, en arrière-plan : une image de la vidéo prise par
 * ffmpeg (« pedagogie:thumbnail »), et sa durée. Une seule tentative par tuto et par
 * session ; sans ffmpeg, l'image est prise pendant la lecture (captureThumbnailFromPlayer).
 */
let thumbsRunning = false;
async function ensureThumbnails() {
  const api = window.electronAPI?.pedagogie;
  if (thumbsRunning || !api?.thumbnail || !(await getMemory())) return;
  thumbsRunning = true;
  try {
    for (const tut of [...tutorials]) {
      if (cards[tut.path]?.thumb || thumbTried.has(tut.path)) continue;
      thumbTried.add(tut.path);
      const result = await api.thumbnail(tut.path, { width: 360 }).catch(() => null);
      const patch = {};
      if (result?.ok && String(result.dataUrl || '').startsWith('data:image/')) patch.thumb = result.dataUrl;
      if (Number.isFinite(result?.duration) && result.duration > 0) patch.duration = result.duration;
      await updateCard(tut.path, patch);
    }
  } finally {
    thumbsRunning = false;
  }
}

/** Sans vignette : une image prise sur la vidéo après quelques secondes de lecture. */
const thumbCaptured = new Set();
function captureThumbnailFromPlayer() {
  const video = els.videoPlayer;
  const path = selectedPath;
  if (!video || !path || !memory || cards[path]?.thumb || thumbCaptured.has(path)) return;
  if (!video.videoWidth || !(video.currentTime >= Math.min(8, (Number(video.duration) || 60) * 0.12))) return;
  thumbCaptured.add(path);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = Math.round((360 * video.videoHeight) / video.videoWidth);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumb = canvas.toDataURL('image/jpeg', 0.72);
    if (thumb.startsWith('data:image/jpeg')) updateCard(path, { thumb, ...(Number.isFinite(video.duration) ? { duration: video.duration } : {}) });
  } catch (err) {
    console.warn('[Pedagogie] vignette non prise :', err);
  }
}

// ---------------------------------------------------------------------------
// Tiroir « Bibliothèque » (comme Sessions MIDI) : recherche, renommer, supprimer
// ---------------------------------------------------------------------------

const LIB_ICON_PENCIL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const LIB_ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
const LIB_ICON_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';

let libraryQuery = '';
let libraryFilter = 'all';
const plain = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const STATUS_LABELS = { ready: 'Analysé', reading: 'En cours…', waiting: 'En attente', tooLong: 'Trop long', todo: 'À analyser' };

function libraryRow(tut) {
  const card = cards[tut.path] || {};
  const status = tutorialStatus(tut.path);
  const title = tutorialTitle(tut.path);
  const day = card.analyzedAt ? new Date(card.analyzedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const icon = el('span', { className: 'tr-file-icon' });
  icon.innerHTML = CARD_PLACEHOLDER.replace('width="30" height="30"', 'width="15" height="15"');
  const name = el('strong', { className: 'session-name', title, text: title });
  const select = el('button', { className: 'tr-library-select', type: 'button', 'aria-current': tut.path === selectedPath ? 'true' : 'false' }, [
    icon,
    el('span', {}, [name, el('small', { text: day ? `Analysé le ${day}` : 'Vidéo .mp4' })]),
  ]);
  const thumb = card.thumb
    ? el('img', { className: 'pedago-lib-thumb', src: card.thumb, alt: '' })
    : el('span', { className: 'pedago-lib-thumb is-empty', 'aria-hidden': 'true' });
  const action = (kind, label, icon, onClick) => {
    const b = el('button', { className: `tr-icon-button${kind === 'delete' ? ' tr-delete' : ''}`, type: 'button', 'data-action': kind, 'aria-label': `${label} ${title}`, title: label });
    b.innerHTML = icon;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
    return b;
  };
  const row = el('div', { className: `tr-library-row${tut.path === selectedPath ? ' is-selected' : ''}`, 'data-path': tut.path }, [
    select,
    thumb,
    el('span', { className: 'tr-library-cell', text: cardDuration(card.duration) || '—' }),
    el('span', { className: `tr-library-cell pedago-lib-status is-${status}`, text: STATUS_LABELS[status] || '' }),
    el('div', { className: 'tr-library-row-actions' }, [
      action('rename', 'Renommer', LIB_ICON_PENCIL, () => startRename(row, name, tut)),
      action('delete', 'Supprimer', LIB_ICON_TRASH, () => removeTutorial(tut)),
      action('open', 'Ouvrir', LIB_ICON_OPEN, () => { closeLibraryDrawer(); selectTrack(tut.path); }),
    ]),
  ]);
  name.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); startRename(row, name, tut); });
  row.addEventListener('click', (e) => {
    if (row.dataset.editing === 'true' || e.target.closest('[data-action]')) return;
    closeLibraryDrawer();
    selectTrack(tut.path);
  });
  return row;
}

function closeLibraryDrawer() {
  document.querySelector('#pedagogie-library-drawer [data-astra-close]')?.click();
}

/** Renommage en place (double-clic ou crayon) : le nom est celui de la fiche, le fichier ne bouge pas.
 * Un vrai champ de saisie (et non du texte éditable dans un bouton : la barre d'espace y est avalée). */
function startRename(row, name, tut) {
  if (row.dataset.editing === 'true') return;
  row.dataset.editing = 'true';
  const select = row.querySelector('.tr-library-select');
  const input = el('input', { className: 'pedago-lib-rename', type: 'text', maxlength: '120', 'aria-label': `Nouveau nom de ${tutorialTitle(tut.path)}` });
  input.value = tutorialTitle(tut.path);
  if (select) { select.hidden = true; row.insertBefore(input, select); }
  input.focus();
  input.select();
  let ended = false;
  const finish = async (save) => {
    if (ended) return;
    ended = true;
    const next = input.value.trim().slice(0, 120);
    delete row.dataset.editing;
    if (save && next && next !== tutorialTitle(tut.path)) {
      await updateCard(tut.path, { name: next });
      if (tut.path === selectedPath) { announcedPath = null; render(); }
    }
    renderLibraryDrawer();
    renderHomeGrid();
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

/** Supprime un tuto de la bibliothèque : sa vidéo (copiée par l'application), sa fiche et son relevé. */
async function removeTutorial(tut) {
  if (reading?.path === tut.path) {
    importNotice('Ce tutoriel est en cours d\'analyse : attends la fin avant de le supprimer.', 'error');
    return;
  }
  if (!await appConfirm({
    title: `Supprimer « ${tutorialTitle(tut.path)} » de la bibliothèque ?`,
    message: 'La vidéo copiée et son analyse seront effacées.',
    confirmLabel: 'Supprimer',
    danger: true,
  })) return;
  try {
    await deleteTutorialFile(tut.path);
    const mem = await getMemory();
    if (mem) { await mem.forget(tut.path); cards = await mem.readIndex(); }
  } catch (err) {
    console.warn('[Pedagogie] suppression impossible :', err);
    importNotice('Suppression impossible.', 'error');
    return;
  }
  waitingPaths.delete(tut.path);
  if (selectedPath === tut.path) closeTutorial();
  await refreshTutorials();
}

/** La liste du tiroir : filtrée par la recherche et le filtre ; le compteur du bouton aussi. */
function renderLibraryDrawer() {
  if (els.libraryCount) els.libraryCount.textContent = String(tutorials.length);
  if (els.libraryCountAll) els.libraryCountAll.textContent = String(tutorials.length);
  const list = els.libraryList;
  if (!list) return;
  // Un renommage en cours ne doit pas être effacé par une vignette qui arrive.
  if (list.querySelector('[data-editing="true"]')) return;
  const q = plain(libraryQuery);
  const rows = tutorials.filter((t) => (libraryFilter === 'all' || tutorialStatus(t.path) === 'ready') && (!q || plain(tutorialTitle(t.path)).includes(q)));
  list.innerHTML = '';
  if (!rows.length) {
    const empty = el('div', { className: 'tr-empty' }, [
      el('h3', { text: tutorials.length ? 'Aucun résultat' : 'Aucun tutoriel pour l\'instant' }),
      el('p', { text: tutorials.length ? 'Aucun tutoriel ne correspond à cette recherche.' : 'Importe une vidéo .mp4 : elle sera gardée ici, avec son analyse.' }),
    ]);
    list.appendChild(empty);
    return;
  }
  for (const tut of rows) list.appendChild(libraryRow(tut));
}

/** La durée d'un tuto ouvert, si sa fiche ne l'a pas encore. */
function rememberDuration() {
  const video = els.videoPlayer;
  if (selectedPath && memory && Number.isFinite(video?.duration) && video.duration > 0 && !cards[selectedPath]?.duration) {
    updateCard(selectedPath, { duration: video.duration });
  }
  // [Claude] — 2026-10-03 — Plus de 30 min : l'écran d'attente dit pourquoi il ne sera pas analysé.
  if (selectedPath && !analysis && isTooLong(selectedPath)) render();
}

// ---------------------------------------------------------------------------
// Outils de travail (lot 6) : vitesse ; « Boucler » le passage
// ---------------------------------------------------------------------------

/** Vitesse de la vidéo ; la hauteur du son est gardée (preservesPitch). */
function applySpeed() {
  const video = els.videoPlayer;
  if (!video) return;
  try {
    video.preservesPitch = true;
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
  } catch (_) { /* lecteur pas prêt */ }
}

function setSpeed(value) {
  speed = clampSpeed(value, 1);
  applySpeed();
  renderTools();
}

/** Maj + clic sur un accord (ou « Il explique ») de la frise : le passage devient ce moment, en boucle. */
function loopSegment(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.5) return;
  // Mêmes règles que les listes : dans la vidéo, 10 min au plus (le début reste).
  const next = setRangeBound({ start: Math.floor(start), end: Math.ceil(end) }, 'start', Math.floor(start), Number(els.videoPlayer?.duration));
  passage = { start: next.start, end: next.end };
  looping = true;
  renderPassageBar();
  seekVideo(passage.start);
}

/**
 * La vidéo revient au début du passage quand la LECTURE en franchit la fin (« Boucler »). Un
 * saut voulu ailleurs (clic sur un accord de la frise, curseur du lecteur) n'est pas ramené :
 * on boucle seulement si l'on venait de l'intérieur du passage, par petits pas.
 */
let lastLoopTime = null;
function keepInLoop() {
  const video = els.videoPlayer;
  if (!looping || !passage || !video) { lastLoopTime = null; return; }
  const t = Number(video.currentTime) || 0;
  const wasInside = lastLoopTime !== null && lastLoopTime >= passage.start - 0.25 && lastLoopTime < passage.end;
  if (wasInside && (t >= passage.end || video.ended) && t - lastLoopTime < 1.5) {
    video.currentTime = passage.start;
    if (video.paused) video.play?.()?.catch?.(() => {});
    lastLoopTime = passage.start;
    return;
  }
  lastLoopTime = t;
}

// ---------------------------------------------------------------------------
// Métronome
// ---------------------------------------------------------------------------

function readMetronomeStore() {
  try { return JSON.parse(localStorage.getItem(METRONOME_KEY) || '{}') || {}; } catch (_) { return {}; }
}

function saveMetronomeSettings() {
  if (!selectedPath) return;
  try {
    const all = readMetronomeStore();
    all.__volume = metronomeSettings.volume;
    all[selectedPath] = {
      bpm: metronomeSettings.bpm, beatsPerBar: metronomeSettings.beatsPerBar, follow: metronomeSettings.follow,
      offset: metronomeSettings.offset, anchored: metronomeSettings.anchored,
    };
    localStorage.setItem(METRONOME_KEY, JSON.stringify(all));
  } catch (_) { /* stockage indisponible : les réglages ne sont pas gardés */ }
}

/** Le métronome s'arrête (un autre tuto, retour aux cartes, autre onglet). */
function stopMetronome() {
  metronome?.stop();
  if (metronomeMenu) setMetronomeMenuState(metronomeMenu, { running: false });
}

/** Réglages de CE tuto : ceux gardés, sinon les valeurs de départ. */
function loadMetronomeFor(path) {
  const all = readMetronomeStore();
  const saved = (path && all[path]) || {};
  metronomeSettings = {
    bpm: clampBpm(saved.bpm, 100),
    beatsPerBar: [2, 3, 4, 6].includes(saved.beatsPerBar) ? saved.beatsPerBar : 4,
    follow: Boolean(saved.follow),
    volume: Number.isFinite(all.__volume) ? all.__volume : 0.7,
    offset: Number.isFinite(saved.offset) ? saved.offset : 0,
    anchored: Boolean(saved.anchored),
  };
  metronome?.set(metronomeSettings);
  if (metronomeMenu) setMetronomeMenuState(metronomeMenu, { ...metronomeSettings, running: false, found: null });
}

/**
 * Le tempo de la vidéo, tiré du niveau sonore (pedagogie:loudness, déjà mesuré pour la force des
 * attaques). Sur le passage choisi s'il dure au moins 12 s, sinon sur toute la vidéo.
 */
async function detectTutorialTempo() {
  const api = window.electronAPI;
  const path = selectedPath;
  if (!path || !api?.pedagogie?.loudness) return null;
  let loud = loudnessCache.get(path);
  if (!loud) {
    loud = await api.pedagogie.loudness(path).catch(() => null);
    if (loud?.ok && Array.isArray(loud.db)) loudnessCache.set(path, loud);
  }
  if (!loud?.ok || !Array.isArray(loud.db)) return null;
  const useRange = passage && passage.end - passage.start >= 12;
  const result = (useRange && estimateTempo(loud.db, loud.hop, { from: passage.start, to: passage.end })) || estimateTempo(loud.db, loud.hop);
  return result ? { bpm: result.bpm, confidence: result.confidence, firstBeat: result.firstBeat } : null;
}

function renderMetronome() {
  if (!els.metronome || metronomeMenu) return;
  metronome = createMetronome({
    getContext: getAudioContext,
    getVideo: () => els.videoPlayer,
    onBeat: (b) => flashMetronomeBeat(metronomeMenu, b.beatInBar),
  });
  metronomeMenu = createMetronomeMenu({
    state: metronomeSettings,
    getVideoTime: () => Number(els.videoPlayer?.currentTime) || 0,
    onDetect: detectTutorialTempo,
    onOpen: () => {
      // Premier coup d'œil sur ce tuto : le tempo se cherche tout seul (sans rien démarrer).
      const stored = selectedPath ? readMetronomeStore()[selectedPath] : null;
      if (selectedPath && !stored && !metronomeSearched.has(selectedPath)) {
        metronomeSearched.add(selectedPath);
        triggerMetronomeDetect(metronomeMenu);
      }
    },
    onChange: (patch) => {
      for (const k of ['bpm', 'beatsPerBar', 'follow', 'volume', 'offset', 'anchored']) if (k in patch) metronomeSettings[k] = patch[k];
      metronome.set(metronomeSettings);
      saveMetronomeSettings();
    },
    onToggle: (running) => { if (running) metronome.start(); else metronome.stop(); },
  });
  els.metronome.replaceChildren(metronomeMenu);
  loadMetronomeFor(selectedPath);
}

function renderTools() {
  renderMetronome();
  // [Claude] — 2026-10-04 — Le bouton « 1× ▾ » et son panneau, construits une seule fois : les
  // reconstruire à chaque changement fermerait le panneau pendant qu'on tire le curseur.
  if (els.speed && !speedMenu) {
    speedMenu = createSpeedMenu({
      value: speed,
      name: 'Vitesse de la vidéo',
      hint: 'La hauteur du son ne change pas. Gardée d\'un tuto à l\'autre, jusqu\'à la fermeture.',
      onChange: (value) => setSpeed(value),
    });
    els.speed.replaceChildren(el('span', { className: 'pedago-tools-label', text: 'Vitesse' }), speedMenu);
  } else if (speedMenu) setSpeedMenuValue(speedMenu, speed);
}

// ---------------------------------------------------------------------------
// La plage du Copilote : Début / Fin en listes (passage-range.js)
// ---------------------------------------------------------------------------

/** La plage en cours : celle choisie, sinon celle qui suit la vidéo. */
function currentRange() {
  if (passage) return passage;
  const win = currentWindow();
  if (win) return { start: Math.floor(win.start), end: Math.floor(win.end) };
  return { start: 0, end: Math.min(FOLLOW_SECONDS, Math.floor(Number(els.videoPlayer?.duration) || FOLLOW_SECONDS)) };
}

/**
 * [Claude] — 2026-10-14 — Le passage du Copilote, posé sur la barre (glisser, double-clic sur une
 * étape) ou depuis le guide (une étape, le résultat final, un mouvement). 10 minutes au plus.
 */
function setPassage(range, { flash = true } = {}) {
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return;
  const duration = Number(els.videoPlayer?.duration);
  let start = Math.max(0, range.start);
  let end = Math.max(start + 1, range.end);
  if (Number.isFinite(duration) && duration > 0) end = Math.min(end, duration);
  if (end - start > MAX_PASSAGE_SECONDS) end = start + MAX_PASSAGE_SECONDS;
  passage = { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 };
  lastLoopTime = null;
  hideTimelineTip(true);
  renderPassageBar();
  if (flash) timeline?.flash();
  updateMoment();
  pulseMoment();
}

/** Le passage, dans l'en-tête du panneau, s'allume : c'est lui que le Copilote regarde. */
function pulseMoment() {
  if (!els.moment) return;
  els.moment.classList.remove('is-pulse');
  void els.moment.offsetWidth;
  els.moment.classList.add('is-pulse');
}

/** La bulle d'aide sur la barre : une fois, jusqu'au premier passage tracé (ou « Compris »). */
function timelineTipSeen() {
  try { return localStorage.getItem(TIP_KEY) === '1'; } catch (_) { return true; }
}
function hideTimelineTip(remember) {
  if (els.timelineTip) els.timelineTip.hidden = true;
  if (remember) { try { localStorage.setItem(TIP_KEY, '1'); } catch (_) { /* stockage indisponible */ } }
}

/** [Claude] — 2026-10-04 — Une durée, dite comme on la lit : « 26 s », « 1 min 05 », « 10 min ». */
function durationText(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  if (!m) return `${sec} s`;
  return sec ? `${m} min ${String(sec).padStart(2, '0')}` : `${m} min`;
}

/**
 * [Claude] — 2026-10-14 — La barre du passage : les étapes du tuto, la région du Copilote, la tête
 * de lecture ; dessous, ce que regarde le Copilote (en clair), « Boucler » et « Effacer ».
 */
function renderPassageBar() {
  const bar = els.passage;
  if (!bar) return;
  const ready = Boolean(selectedPath && analysis && !isReadingHere());
  bar.hidden = !ready;
  if (!ready) return;
  const duration = Number(els.videoPlayer?.duration);
  const guide = tutorialGuide();
  timeline?.update({
    // La vidéo pas encore chargée : la durée relevée à l'analyse.
    duration: Number.isFinite(duration) && duration > 0 ? duration : (Number(analysis.stats?.duration) || 0),
    now: Number(els.videoPlayer?.currentTime) || 0,
    range: passage,
    // Les chapitres du tuto (titre écrit dans la barre) ; sinon (vidéo trop courte), ses accords, en
    // bandes neutres. Les étapes du moteur, qui parlent de mains (ADR-054), ne s'affichent plus.
    steps: chapterSteps() || chordSteps(),
  });
  if (els.timelineTip && !timelineTipSeen()) els.timelineTip.hidden = false;
  const chipKey = passage ? `${passage.start}|${passage.end}` : 'suit';
  if (els.regionChip && els.regionChip.dataset.key !== chipKey) {
    els.regionChip.dataset.key = chipKey;
    els.regionChip.textContent = '';
    if (passage) {
      els.regionChip.append('Le Copilote regarde ', el('strong', { text: `${clock(passage.start)} → ${clock(passage.end)}` }), ` (${durationText(passage.end - passage.start)})`);
      els.regionChip.classList.remove('is-new');
      void els.regionChip.offsetWidth;
      els.regionChip.classList.add('is-new');
    } else {
      els.regionChip.append(el('span', { className: 'is-follow', text: `Le Copilote suit la vidéo (les ${FOLLOW_SECONDS} dernières secondes)` }));
    }
  }
  if (els.passageLoop) {
    els.passageLoop.setAttribute('aria-pressed', String(looping));
    els.passageLoop.classList.toggle('is-active', looping);
  }
  if (els.passageFollow) els.passageFollow.hidden = !passage;
}

/** « Boucler » : la vidéo tourne sur le passage (fixé à l'instant s'il suivait la vidéo). */
function toggleLooping() {
  if (!passage) passage = currentRange();
  looping = !looping;
  lastLoopTime = null;
  renderPassageBar();
  updateMoment();
  if (looping) seekVideo(passage.start);
}

/** « Suivre la vidéo » : la plage redevient les 30 dernières secondes. */
function followVideo() {
  passage = null;
  looping = false;
  lastLoopTime = null;
  renderPassageBar();
  updateMoment();
}

// ---------------------------------------------------------------------------
// La largeur du Copilote : la poignée et le bouton « Agrandir » (copilot-width.js)
// ---------------------------------------------------------------------------

/**
 * [Claude] — 2026-10-03 — Narcisse : « la fenêtre [du Copilote] est trop petite […] si on
 * l'agrandit, la fenêtre vidéo sera forcément impactée ». La part du Copilote passe à la
 * grille (--pedago-copilot-share) : la vidéo prend le reste. Le bouton dit « Agrandir » ou
 * « Réduire » selon la part ; la poignée dit sa valeur aux lecteurs d'écran.
 */
function setCopilotShare(share, { save = true } = {}) {
  copilotShare = clampShare(share);
  const percent = Math.round(copilotShare * 100);
  els.split?.style.setProperty('--pedago-copilot-share', `${(copilotShare * 100).toFixed(1)}%`);
  if (els.resizer) {
    els.resizer.setAttribute('aria-valuenow', String(percent));
    els.resizer.setAttribute('aria-valuetext', `Copilote : ${percent} % de la largeur`);
  }
  if (els.sizeBtn) {
    const wide = isWide(copilotShare);
    els.sizeBtn.setAttribute('aria-pressed', String(wide));
    els.sizeBtn.title = wide ? 'Réduire le Copilote (la vidéo grandit)' : 'Agrandir le Copilote (la vidéo rétrécit)';
    if (els.sizeLabel) els.sizeLabel.textContent = wide ? 'Réduire' : 'Agrandir';
  }
  if (save) {
    try { localStorage.setItem(COPILOT_WIDTH_KEY, String(copilotShare)); } catch (_) { /* stockage indisponible */ }
  }
}

/** La poignée : tirer (le pointeur reste à elle), flèches, Entrée, double-clic. */
function bindResizer() {
  const handle = els.resizer;
  if (!handle || !els.split) return;
  let dragging = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = e.pointerId;
    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* pointeur déjà relâché */ }
    els.split.classList.add('is-resizing');
  });
  handle.addEventListener('pointermove', (e) => {
    if (dragging !== e.pointerId) return;
    setCopilotShare(shareAt(e.clientX, els.split.getBoundingClientRect()), { save: false });
  });
  const stop = (e) => {
    if (dragging !== e.pointerId) return;
    dragging = null;
    els.split.classList.remove('is-resizing');
    setCopilotShare(copilotShare);
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('dblclick', () => setCopilotShare(DEFAULT_SHARE));
  handle.addEventListener('keydown', (e) => {
    const next = e.key === 'Enter' || e.key === ' ' ? toggledShare(copilotShare) : shareForKey(copilotShare, e.key);
    if (next === null) return;
    e.preventDefault();
    setCopilotShare(next);
  });
}

// ---------------------------------------------------------------------------
// Calibration V2N — 4 coins persistante par vidéo
// ---------------------------------------------------------------------------

let calibrationMode = false;
let calibrationPoints = [];

function startCalibration() {
  if (!selectedPath) return;
  calibrationMode = true;
  const stored = getV2nCorners(selectedPath);
  calibrationPoints = [];
  if (Array.isArray(stored)) {
    for (const p of stored) {
      if (typeof p === 'object' && p !== null && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        calibrationPoints.push({ x: Number(p.x), y: Number(p.y) });
      } else if (Array.isArray(p) && p.length >= 2) {
        calibrationPoints.push({ x: Number(p[0]), y: Number(p[1]) });
      }
    }
  }
  // S'assurer qu'on repart à 4 max
  if (calibrationPoints.length > 4) calibrationPoints = calibrationPoints.slice(0, 4);
  renderCalibrationOverlay();
}

function cancelCalibration() {
  calibrationMode = false;
  calibrationPoints = [];
  const overlay = document.getElementById('pedagogie-calibration-overlay');
  if (overlay) overlay.remove();
}

function confirmCalibration() {
  if (calibrationPoints.length !== 4) return;
  saveV2nCorners(selectedPath, calibrationPoints);
  cancelCalibration();
  // [Claude] — 2026-09-25 — La lecture repart d'elle-même avec la calibration.
  setStatus('Calibration enregistrée : lecture des touches à l\'image…', 'ok');
  analyzeSelected();
}

function onCalibrationClick(evt) {
  if (!calibrationMode) return;
  const video = els.videoPlayer;
  if (!video) return;
  const rect = video.getBoundingClientRect();
  const rawX = evt.clientX - rect.left;
  const rawY = evt.clientY - rect.top;
  const scaleX = video.videoWidth / rect.width;
  const scaleY = video.videoHeight / rect.height;
  const x = Math.round(rawX * scaleX);
  const y = Math.round(rawY * scaleY);
  calibrationPoints.push({ x, y });
  if (calibrationPoints.length > 4) calibrationPoints = calibrationPoints.slice(-4);
  renderCalibrationOverlay();
}

function renderCalibrationOverlay() {
  let overlay = document.getElementById('pedagogie-calibration-overlay');
  if (!overlay) {
    overlay = el('div', {
      id: 'pedagogie-calibration-overlay',
      className: 'pedagogie-calibration-overlay',
    });
    const main = document.getElementById('pedagogie-main');
    if (main) main.appendChild(overlay);
  }
  overlay.innerHTML = '';

  calibrationPoints.forEach((p, i) => {
    const video = els.videoPlayer;
    if (!video || video.videoWidth === 0) return;
    const rect = video.getBoundingClientRect();
    const scaleX = rect.width / video.videoWidth;
    const scaleY = rect.height / video.videoHeight;
    overlay.appendChild(el('div', {
      className: 'pedagogie-calibration-marker',
      style: `left:${p.x * scaleX}px; top:${p.y * scaleY}px;`,
      title: ['Gauche-haut', 'Droite-haut', 'Droite-bas', 'Gauche-bas'][i],
    }, [
      el('span', { text: ['LT', 'RT', 'RB', 'LB'][i] }),
    ]));
  });

  const labels = ['coin supérieur gauche', 'coin supérieur droit', 'coin inférieur droit', 'coin inférieur gauche'];
  const next = labels[calibrationPoints.length] || null;
  overlay.appendChild(el('div', { className: 'pedagogie-calibration-hint' }, [
    el('p', { text: calibrationPoints.length === 0
      ? 'Cliquez les 4 coins du clavier sur la vidéo, dans l\'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche.'
      : `Coin suivant : ${next || 'confirmez ou recommencez'}.` }),
    el('div', { className: 'pedagogie-calibration-actions' }, [
      el('button', {
        type: 'button',
        className: 'pedagogie-secondary-btn',
        text: 'Recommencer',
        onClick: () => { calibrationPoints = []; renderCalibrationOverlay(); },
      }),
      el('button', {
        type: 'button',
        className: 'panel-action',
        text: 'Confirmer',
        disabled: calibrationPoints.length !== 4,
        onClick: confirmCalibration,
      }),
      el('button', {
        type: 'button',
        className: 'pedagogie-secondary-btn',
        text: 'Annuler',
        onClick: cancelCalibration,
      }),
    ]),
  ]));
}

/**
 * Import d'une vidéo : le fichier choisi (filtré .mp4 par la boîte de dialogue,
 * re-filtré ici) est COPIÉ dans la bibliothèque de Pédagogie IA. Plus d'entrée dans le
 * magasin Studio — studio-storage.js et media-library.js ne sont pas touchés.
 */
async function importVideo() {
  const api = window.electronAPI;
  const folder = await getLibraryDir();
  if (!folder) {
    importNotice('La bibliothèque n\'est pas disponible dans cet environnement.', 'error');
    return;
  }
  if (!api?.studio?.selectVideoFile) {
    importNotice('L\'import de vidéo n\'est pas disponible.', 'error');
    return;
  }
  const picked = await api.studio.selectVideoFile();
  const filePath = typeof picked === 'string' ? picked : picked?.filePath || picked?.path;
  if (!filePath) return;
  if (!isMp4Name(filePath)) {
    importNotice('Seuls les fichiers .mp4 peuvent être importés.', 'error');
    return;
  }
  // [Claude] — 2026-10-03 — 30 min au plus : la durée est lue avant la copie (la vignette la
  // donne), pour ne pas copier une vidéo qui ne serait pas analysée.
  importNotice('Lecture de la vidéo…', 'busy');
  const probe = api.pedagogie?.thumbnail ? await api.pedagogie.thumbnail(filePath, { width: 360 }).catch(() => null) : null;
  const duration = Number(probe?.duration);
  if (Number.isFinite(duration) && duration > MAX_TUTORIAL_SECONDS) {
    importNotice(`Cette vidéo dure ${cardDuration(duration)} : Pédagogie IA analyse les tutos de 30 minutes au plus. Garde le passage qui t'intéresse (avec un éditeur vidéo), puis importe-le.`, 'error');
    return;
  }
  importNotice('Ajout à la bibliothèque…', 'busy');
  try {
    const result = await copyTutorialIntoFolder(filePath, folder);
    if (!result.ok) {
      importNotice(result.error || 'Import impossible.', 'error');
      return;
    }
    const path = `${folder.replace(/\/+$/, '')}/${result.fileName}`;
    // Sa fiche tout de suite (vignette, durée) ; puis il s'ouvre, et son analyse démarre
    // (Narcisse : « un temps de chargement, comme dans l'onglet Analyse et l'onglet Studio »).
    const patch = {};
    if (probe?.ok && String(probe.dataUrl || '').startsWith('data:image/')) patch.thumb = probe.dataUrl;
    if (Number.isFinite(duration) && duration > 0) patch.duration = duration;
    if (Object.keys(patch).length) {
      thumbTried.add(path);
      await updateCard(path, patch);
    }
    await refreshTutorials();
    importNotice('');
    selectTrack(path);
  } catch (err) {
    console.warn('[Pedagogie] import impossible :', err);
    importNotice('Import impossible.', 'error');
  }
}

/** Ce que devient l'import : sur l'accueil, ou sous la vidéo si un tuto est ouvert. */
function importNotice(message, tone = 'info') {
  homeNotice(selectedPath ? '' : message, tone);
  if (selectedPath) setStatus(message, tone === 'busy' ? 'info' : tone);
}

// ---------------------------------------------------------------------------
// Lecteur vidéo — fenêtre principale de l'écran
// ---------------------------------------------------------------------------

/**
 * Monte la vidéo sélectionnée dans le lecteur principal.
 *
 * Même technique blob que le Studio (readBinary → Blob video/mp4 →
 * createObjectURL), adaptée à un chemin absolu plutôt qu'à un Track_ID.
 * UN SEUL élément <video controls> avec le son : pas de stems, pas de
 * substitution de piste — reproduire la paire vidéo muette + audio caché du
 * Studio serait de la sur-ingénierie ici.
 *
 * La CSP d'Electron bloque fetch(blob:) : le fichier passe par files.readBinary,
 * jamais par fetch.
 */
async function mountVideo(path) {
  destroyVideo();
  if (!els.videoPlayer || !path) return;
  const files = window.electronAPI?.files;
  if (!files?.readBinary) return;
  try {
    const bytes = await files.readBinary(path);
    videoBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    mountedVideoPath = path;
    els.videoPlayer.src = videoBlobUrl;
    els.videoPlayer.load();
    applySpeed();
  } catch (err) {
    console.warn('[Pedagogie] montage vidéo échoué :', err);
    setStatus('La vidéo n\'a pas pu être chargée.', 'error', err.message);
  }
}

/** Libère l'URL blob courante. Toujours appelée avant un nouveau montage. */
function destroyVideo() {
  if (videoBlobUrl) {
    URL.revokeObjectURL(videoBlobUrl);
    videoBlobUrl = null;
  }
  mountedVideoPath = null;
  if (els.videoPlayer) {
    els.videoPlayer.removeAttribute('src');
    els.videoPlayer.load();
  }
}

/** Met la vidéo en pause (le pianiste pose une question, ou quitte la vue). */
function pauseVideo() {
  try { els.videoPlayer?.pause?.(); } catch (_) { /* lecteur absent */ }
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

/**
 * Ce que l'écran dit de la lecture du clavier, en clair ; le détail technique est
 * replié (« Détails techniques »). Null s'il n'y a rien à dire.
 * @param {string[]} technical - raisons techniques (format, V2N, outils)
 * @param {{fromSound?: boolean, calibrateHint?: boolean}} what
 * @returns {{message: string, tone: string, details: string}|null}
 */
function readingStatus(technical, { fromSound = false, calibrateHint = false } = {}) {
  const parts = [];
  if (fromSound) parts.push('Je n\'ai pas pu lire le clavier à l\'image : j\'ai écouté le son à la place (les accords, pas toujours les notes exactes du prof).');
  if (calibrateHint) parts.push('Si le prof joue sur un vrai clavier filmé du dessus : « Calibrer le clavier », puis clique ses 4 coins sur la vidéo.');
  if (!parts.length && !technical.length) return null;
  return { message: parts.join(' ') || 'Lecture du clavier incomplète.', tone: 'info', details: technical.join('\n') };
}

/**
 * Lance l'analyse du tuto affiché. [Claude] — 2026-10-03 — Une analyse est un travail rangé
 * à part (runReading) : un seul tourne à la fois, les suivants attendent leur tour. Pendant
 * ce temps, l'écran d'attente couvre le tuto (pas de Copilote) ; on peut aller ailleurs.
 */
async function analyzeSelected() {
  const path = selectedPath;
  if (!path || reading?.path === path || waitingPaths.has(path)) return;
  const api = window.electronAPI;
  if (!api?.pedagogie?.analyzeVideo) {
    lastFailure = { path, status: { message: 'L\'analyse vidéo n\'est pas disponible dans cet environnement.', tone: 'error', details: '' } };
    render();
    return;
  }
  // La vidéo attend la fin de l'analyse (Narcisse : « une fois que c'est fini, on revient
  // et on fait ce qu'on veut »).
  pauseVideo();
  resetTutorialView();
  if (lastFailure?.path === path) lastFailure = null;
  if (reading) waitingPaths.add(path);
  render();
  refreshCard(path);
  readingQueue = readingQueue.then(() => {
    waitingPaths.delete(path);
    return runReading(path);
  }).catch((err) => console.warn('[Pedagogie] relevé interrompu :', err));
  await readingQueue;
}

/**
 * Le relevé d'un tuto : lecture des images, sinon du vrai clavier (V2N), sinon du son ;
 * la parole en parallèle. Ses résultats restent dans `job` : ils sont gardés sous son tuto,
 * et montrés seulement si ce tuto est ouvert (on a pu revenir aux cartes, ou en ouvrir un
 * autre, pendant qu'il tournait).
 * @param {string} path
 */
async function runReading(path) {
  const api = window.electronAPI;
  const job = {
    path,
    startedAt: Date.now(),
    step: '',
    analysis: null,
    comparison: null,
    narrationView: [],
    key: null,
    notesUnavailable: null,
    status: null,
  };
  reading = job;
  // Le compteur de temps écoulé de l'écran d'attente.
  clearInterval(readingTicker);
  readingTicker = setInterval(renderReading, 1000);
  const here = () => selectedPath === path;
  const step = (message) => {
    job.step = message;
    if (here()) setProgress(message);
    refreshCard(path);
  };
  const note = (status) => {
    job.status = status;
    if (here()) setStatus(status?.message || '', status?.tone || 'info', status?.details || '');
  };
  if (here()) render();
  refreshCard(path);
  let succeeded = false;
  step('Lecture des images…');
  note(null);

  try {
    // La parole ne dépend pas de ce que l'image donne : les deux lectures
    // partent ensemble, et l'on n'attend la transcription qu'au moment
    // d'assembler le résultat.
    const transcriptionPromise = runTranscription(path);
    // [Claude] — 2026-10-14 — Les notes ENTENDUES (transcription du piano au son) : une seconde lecture
    // de la même vidéo, lancée tout de suite en parallèle de l'image. Elle sert dans les deux cas :
    // à recouper la lecture à l'image (sound-reconcile.js : octaves, lacunes, glissandos), et, quand
    // l'image ne donne rien, à fournir les notes. Une seule transcription par relevé.
    let pianoPromise = null;
    const soundNotes = () => {
      if (!api?.pedagogie?.transcribePiano) return Promise.resolve({ available: false, reason: 'not-attempted' });
      pianoPromise ??= api.pedagogie.transcribePiano(path).catch((err) => ({ available: false, reason: 'failed', detail: err.message }));
      return pianoPromise;
    };
    // [Claude] — 2026-10-15 — La transcription COMPLÈTE n'est plus lancée d'office : elle coûte ~2,5x la
    // durée de la vidéo sur CPU (« Above All », 19 min : 38 min). Quand l'image se lit bien, quelques
    // extraits suffisent à fixer l'octave et à recouper (sound-sampling.js) ; la transcription complète
    // ne part que si l'image ne donne rien (pianiste filmé de côté : les notes SONT le son).

    // [Claude] — 2026-09-25 — 8 images/s (au lieu de 4) : les notes brèves d'un lick
    // tiennent au moins une image et sont gardées (notes du professeur).
    let result = await api.pedagogie.analyzeVideo(path, { sampleFps: 8 });
    const technical = [];

    if (!result?.ok) {
      // Outils de lecture absents ou pas de piste image : on le dit, puis le son.
      if (result?.reason === 'ToolsMissing' || result?.reason === 'NoVideoStream') {
        technical.push(result.message || result.reason);
        result = { ok: true, implemented: false, reason: result.reason };
      } else {
        // [Claude] — 2026-10-03 — Plus de 30 min : le message de l'analyse le dit tel quel.
        note(result?.reason === 'VideoTooLong'
          ? { message: result.message || 'Cette vidéo est trop longue pour être analysée.', tone: 'error', details: '' }
          : { message: 'La vidéo n\'a pas pu être lue.', tone: 'error', details: result?.message || '' });
        return;
      }
    }

    // [OpenCode] — 2026-09-07 — V2N : si le format B n'est pas reconnu et que
    // l'utilisateur a calibré un clavier réel, tenter la transcription visuelle.
    let v2nResult = null;
    let calibrateHint = false;
    if (!result.implemented && result.reason !== 'ToolsMissing' && result.reason !== 'NoVideoStream') {
      // Pourquoi le clavier dessiné n'a pas été reconnu (format-detector).
      const why = explainUnrecognised(result.reason);
      if (why) technical.push(`Pas de clavier dessiné à l'image : ${why}`);
    }
    if (!result.implemented && api?.pedagogie?.checkV2n && api?.pedagogie?.analyzeVideoVision) {
      v2nState = await api.pedagogie.checkV2n();
      const corners = getV2nCorners(path);
      if (v2nState?.available && corners) {
        step('Vrai clavier filmé : lecture des touches à l\'image (plusieurs minutes)…');
        v2nResult = await api.pedagogie.analyzeVideoVision(path, {
          corners,
          onsetThreshold: 0.5,
          frameThreshold: 0.5,
          bottomMargin: 0,
        });
        if (!v2nResult?.available) technical.push(v2nReasonText(v2nResult));
      } else if (v2nState?.available) {
        calibrateHint = true;
      } else if (v2nState) {
        technical.push(v2nReasonText(v2nState));
      }
    }

    if (!result.implemented && (!v2nResult || !v2nResult.available)) {
      // L'image n'a rien donné : on le dit, puis on tente le son.
      step('Le clavier n\'a pas pu être lu à l\'image : écoute du son…');
      const audioSegments = await runAudioFallback(path);
      job.key = audioSegments.key ?? null;
      step('Écoute de ce que dit le prof…');
      const narration = normalizeTranscription(await transcriptionPromise);
      const built = buildAudioOnlyAnalysis({
        reason: result.reason,
        audioSegments: audioSegments.segments,
        key: audioSegments.key,
        narration,
      });
      job.narrationView = alignNarration(narration.segments, built.segments);
      // [Claude] — 2026-09-25 — Pianiste filmé de côté : les notes elles-mêmes,
      // transcrites depuis le son (piano-transcriber.py), si le paquet est là.
      if (api?.pedagogie?.transcribePiano) {
        step('Relevé des notes jouées (au son)…');
        const piano = await soundNotes();
        if (piano?.available && piano.notes?.length) {
          built.noteEvents = eventsFromTranscription(piano.notes);
          built.notesSource = 'son';
          // [Claude] — 2026-10-03 — Sa pédale, entendue au son : le rejeu la reprend.
          built.pedals = (piano.pedals || [])
            .filter((p) => Number.isFinite(p?.onset) && Number.isFinite(p?.offset) && p.offset > p.onset)
            .map((p) => ({ start: p.onset, end: p.offset }));
        } else {
          job.notesUnavailable = piano?.reason === 'dependency-missing'
            ? `transcription des notes au son non installée (${piano.detail || 'piano-transcription-inference'} : « .venv/bin/pip install -r requirements.txt »)`
            : `transcription des notes au son impossible${piano?.detail ? ` : ${String(piano.detail).split('\n')[0]}` : ''}`;
          technical.push(`Notes du prof : ${job.notesUnavailable}.`);
        }
      }
      // Relevé au son faute de clavier : relu une fois si la lecture de l'image change (tutorial-memory.js).
      built.readingRevision = READING_REVISION;
      job.analysis = built;
      note(readingStatus(technical, { fromSound: true, calibrateHint }));
      succeeded = true;
      return;
    }

    step('Écoute de ce que dit le prof…');
    const narration = normalizeTranscription(await transcriptionPromise);

    step('Relevé des accords…');
    let built;
    if (v2nResult?.available) {
      built = buildVideoAnalysis({
        v2nNotes: v2nResult.notes,
        v2nDuration: v2nResult.duration,
        narration,
      });
      built.noteEvents = eventsFromTranscription(v2nResult.notes);
      built.notesSource = 'image (V2N)';
    } else {
      // Touches allumées → notes, la main d'après la couleur.
      const litNotes = samplesToNoteEvents(result.samples, result.sampleInterval);
      // [Claude] — 2026-10-14 — Clavier qui n'allume une touche qu'à la frappe (« Next Level
      // Worship ») : la grille se fait par harmonie, et chaque note sonne jusqu'au changement
      // d'harmonie, comme le prof la tient (flash-notes.js).
      const flash = isFlashRendering(litNotes);
      built = buildVideoAnalysis({
        samples: result.samples,
        geometry: result.geometry,
        sampleInterval: result.sampleInterval,
        narration,
        ...(flash ? { segments: flashSegments(litNotes, labelNotes) } : {}),
      });
      built.noteEvents = flash ? holdFlashNotes(litNotes) : litNotes;
      if (flash) built.flashHighlights = true;
      built.notesSource = 'image (clavier dessiné)';
      // [Claude] — 2026-10-09 — Révision de la lecture (relecture fine comprise) : un relevé plus
      // ancien est relu à la réouverture du tuto (tutorial-memory.js, staleImageReading).
      built.readingRevision = READING_REVISION;
      built.fineReading = result.fineReading || null;
    }
    // [Claude] — 2026-10-14 — Le SON recoupe l'image (sound-reconcile.js) : une octave fausse est
    // corrigée, les notes qu'une image brouillée n'a pas vues et celles d'un glissando sont ajoutées.
    // Si le son et l'image ne se recoupent pas (musique de fond…), rien n'est changé.
    if (api.pedagogie?.transcribePiano && built.noteEvents?.length) {
      const videoDuration = Number(built.stats?.duration) || Number(els.videoPlayer?.duration) || 0;
      const windows = pickSoundWindows(built.noteEvents, videoDuration);
      const sampled = windows.length > 0 && !(windows.length === 1 && windows[0].start === 0 && windows[0].duration >= videoDuration - 0.5);
      step(sampled ? `Recoupement des notes avec le son (${windows.length} extraits)…` : 'Recoupement des notes avec le son…');
      const piano = sampled
        ? await api.pedagogie.transcribePiano(path, { windows }).catch((err) => ({ available: false, reason: 'failed', detail: err.message }))
        : await soundNotes();
      if (piano?.available && piano.notes?.length) {
        const merged = reconcileWithSound(built.noteEvents, piano.notes, sampled ? { spans: windowsToSpans(windows) } : {});
        built.soundCheck = merged.report;
        if (merged.report.reliable) {
          built.noteEvents = merged.notes;
          // Sa pédale, entendue au son : le rejeu la reprend (l'image ne la voit pas). Par extraits, elle
          // n'est connue que par morceaux : on ne la garde pas (pédale d'harmonie, partout pareille).
          if (!sampled && !built.pedals?.length) {
            built.pedals = (piano.pedals || [])
              .filter((p) => Number.isFinite(p?.onset) && Number.isFinite(p?.offset) && p.offset > p.onset)
              .map((p) => ({ start: p.onset, end: p.offset }));
          }
        }
      } else {
        built.soundCheck = { reliable: false, reason: piano?.reason === 'dependency-missing' ? 'not-installed' : 'no-sound' };
      }
    }
    // [Claude] — 2026-10-09 — La force de chaque attaque, mesurée au son de la vidéo (l'image ne
    // la montre pas) : src/pedagogie/dynamics.js. Enregistrée avec les notes : le rejeu du
    // Copilote nuance ses accords comme le prof. Sans son lisible, les règles de pianiste seules.
    if (api.pedagogie?.loudness && built.noteEvents?.length) {
      step('Force des attaques (au son)…');
      const loud = await api.pedagogie.loudness(path).catch(() => null);
      if (loud?.ok) built.noteEvents = withMeasuredVelocity(built.noteEvents, loud);
    }
    job.narrationView = alignNarration(narration.segments, built.segments);

    // Recoupement : le son est une seconde lecture indépendante de la même
    // vidéo. Un désaccord est consigné, jamais arbitré.
    step('Recoupement avec le son…');
    const audio = await runAudioFallback(path).catch(() => null);
    job.key = audio?.key ?? null;
    if (audio?.segments?.length) {
      job.comparison = crossCheck({
        video: built.segments
          .filter((s) => s.chord.resolved)
          .map((s) => ({ start: s.start, end: s.end, label: s.chord.label })),
        audio: audio.segments,
        step: 0.5,
      });
    }
    job.analysis = built;
    if (technical.length || calibrateHint) note(readingStatus(technical, { calibrateHint }));
    succeeded = true;
  } catch (err) {
    console.error('[Pedagogie] analyse échouée :', err);
    note({ message: 'L\'analyse n\'a pas abouti.', tone: 'error', details: err.message });
  } finally {
    reading = null;
    clearInterval(readingTicker);
    readingTicker = null;
    if (!(succeeded && job.analysis)) lastFailure = { path, status: job.status || { message: 'L\'analyse n\'a pas abouti.', tone: 'error', details: '' } };
    if (here()) {
      if (succeeded && job.analysis) applyReading(job);
      // Le Copilote réannonce le tuto : son en-tête dit maintenant ce qu'il en sait.
      announcedPath = null;
      render();
    }
    refreshCard(path);
    // [Claude] — 2026-10-03 — L'analyse est gardée : rouvrir ce tuto sera instantané.
    if (succeeded && job.analysis) {
      await saveReading(job);
      // Prêt : on le dit, où que soit le pianiste (sauf s'il le regarde déjà).
      if (!(here() && isViewVisible())) showReadyToast(path);
    }
  }
}

/**
 * La vue Pédagogie IA est-elle sous les yeux du pianiste ? `viewActive` ne suit que les
 * sous-onglets d'Entraînement : aller dans le Studio ou l'Analyse la cache aussi.
 */
function isViewVisible() {
  return viewActive && Boolean(els.root?.getClientRects?.().length);
}

/** Le relevé fini s'affiche sur le tuto ouvert : la vidéo est prête, le Copilote s'ouvre. */
function applyReading(job) {
  playbackStarted = true;
  analysis = readingInUse(job.analysis);
  comparison = job.comparison;
  narrationView = job.narrationView;
  detectedKey = job.key;
  notesUnavailable = job.notesUnavailable;
  restoredAt = null;
}

/**
 * Repli audio : réutilise le pipeline d'analyse d'accords déjà en place
 * (`analyzer:process-file`), en mode `posthoc_discriminator`, plutôt que d'en
 * écrire un second. C'est le même moteur que l'onglet Analyse.
 *
 * La traduction des champs vit dans `src/pedagogie/audio-fallback.js` : elle
 * lisait `start` / `end` là où le moteur écrit `startTime` / `endTime`, et
 * vidait donc la grille en silence. Voir l'en-tête de ce module.
 */
async function runAudioFallback(originalPath) {
  const api = window.electronAPI;
  if (!api?.analyzer?.processFile) return { segments: [], key: null };
  const result = await api.analyzer.processFile(originalPath, {
    analyzeBass: false,
    observationMode: 'posthoc_discriminator',
  });
  return { segments: normalizeAnalyzerChords(result), key: result?.key ?? null };
}

/** Remet à zéro tout ce qui concerne la parole. Appelé à chaque nouveau relevé. */
function resetNarration() {
  narrationView = [];
  detectedKey = null;
  notesUnavailable = null;
}

/**
 * Transcription de la bande son par le modèle local (faster-whisper).
 *
 * Ne lève jamais : une panne de transcription ne doit pas emporter le relevé
 * d'accords, qui est le cœur de l'écran. Elle devient un état d'indisponibilité,
 * traduit en message par transcription.js.
 */
async function runTranscription(originalPath) {
  const api = window.electronAPI;
  // Pas d'IPC du tout (environnement de test, preload ancien) : on ne prétend
  // pas que la vidéo est muette, on dit que rien n'a été écouté.
  if (!api?.pedagogie?.transcribeVideo) return { available: false, reason: 'not-attempted' };
  try {
    return await api.pedagogie.transcribeVideo(originalPath, {});
  } catch (err) {
    console.warn('[Pedagogie] transcription échouée :', err);
    return { available: false, reason: 'failed', detail: err.message };
  }
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function render() {
  const hasTutorial = Boolean(selectedPath);
  if (els.home) els.home.hidden = hasTutorial;
  if (els.split) els.split.hidden = !hasTutorial;
  // [Claude] — 2026-10-03 — « ← Mes tutoriels » : seulement quand un tuto est ouvert.
  if (els.backBtn) els.backBtn.hidden = !hasTutorial;
  renderHome();
  // [Claude] — 2026-10-03 — Tant que le tuto n'est pas analysé, l'écran d'attente le couvre
  // (pas de Copilote) ; analysé, la vidéo est prête et le Copilote s'ouvre.
  const ready = hasTutorial && Boolean(analysis) && !isReadingHere();
  els.main?.classList.toggle('is-playing', playbackStarted);
  renderReading();
  // Refaire l'analyse (elle est gardée sinon).
  if (els.redoBtn) els.redoBtn.hidden = !ready;
  // [Claude] — 2026-10-13 — « Importer une vidéo » est toujours là : la bibliothèque n'a pas à être choisie.
  if (els.importBtn) els.importBtn.disabled = false;
  if (els.videoActions) els.videoActions.style.display = ready ? '' : 'none';
  if (els.calibrateBtn) {
    const needsKeyboard = analysis && analysis.source !== 'video';
    els.calibrateBtn.hidden = !(v2nState?.available && selectedPath && (needsKeyboard || getV2nCorners(selectedPath))) || isReadingHere();
  }

  renderVideo();
  renderFormat();
  renderGuide();
  renderTools();
  renderPassageBar();
  renderCopilotPanel();
  updateMoment();
}

/** Accueil (aucun tutoriel ouvert) : choisir un tutoriel de la bibliothèque (en cartes). */
function renderHome() {
  if (!els.homeTitle) return;
  const withCards = tutorials.length > 0;
  if (libraryProblem) {
    els.homeTitle.textContent = 'La bibliothèque n\'a pas pu être lue';
    els.homeText.textContent = libraryProblem;
  } else if (withCards) {
    els.homeTitle.textContent = 'Tes tutoriels';
    els.homeText.textContent = 'Ouvre un tuto : la vidéo du prof s\'affiche à gauche, et le Copilote à droite répond à tes questions sur ce qu\'il vient de jouer. Un tuto déjà lu s\'ouvre tout de suite.';
  } else {
    els.homeTitle.textContent = 'Ta bibliothèque de tutoriels est vide';
    els.homeText.textContent = 'Importe une vidéo .mp4 : elle est gardée dans la bibliothèque de Pédagogie IA, avec son analyse. Ouvre ensuite un tuto : la vidéo du prof s\'affiche à gauche, et le Copilote à droite répond à tes questions sur ce qu\'il vient de jouer.';
  }
  // Le gros bouton d'import sert tant que la bibliothèque est vide ; « Importer une vidéo » est en haut sinon.
  if (els.homeImportBtn) els.homeImportBtn.hidden = withCards;
  renderLegacyHint();
}

/**
 * La vidéo est la fenêtre principale. Elle apparaît dès qu'un tutoriel est
 * sélectionné, en mode aperçu (première frame) avec un overlay de lecture.
 * Le lecteur suit la sélection : changer de tutoriel recharge la source.
 * mountVideo détruit l'URL précédente, une seule vit à la fois.
 */
function renderVideo() {
  if (!els.videoCard || !els.videoPlayer) return;
  if (!selectedPath) {
    els.videoCard.style.display = 'none';
    destroyVideo();
    return;
  }
  els.videoCard.style.display = '';
  if (!videoBlobUrl || mountedVideoPath !== selectedPath) {
    mountVideo(selectedPath);
  }
  // L'overlay de lecture masque les contrôles natifs tant que la lecture n'a pas
  // commencé ; on laisse la vidéo visible en arrière-plan comme poster.
  els.videoPlayer.controls = playbackStarted;
}

function renderFormat() {
  if (!els.format) return;
  els.format.innerHTML = '';
  if (!analysis) { els.format.style.display = 'none'; return; }
  els.format.style.display = '';

  const fromV2n = analysis.source === 'v2n';
  const fromImage = fromV2n || analysis.source === 'video';
  const checkedBySound = fromImage && analysis.soundCheck?.reliable;
  els.format.appendChild(el('span', {
    className: `pedagogie-badge ${fromImage ? 'is-image' : 'is-audio'}`,
    text: fromV2n ? 'Lu à l\'image (V2N)' : (fromImage ? (checkedBySound ? 'Lu à l\'image + son' : 'Lu à l\'image') : 'Lu au son'),
  }));
  els.format.appendChild(el('span', {
    className: 'pedagogie-format-text',
    text: fromImage
      ? `${analysis.stats.segmentCount} accords relevés sur ${formatTime(analysis.stats.duration)}.${analysis.soundCheck ? ` ${soundCheckSentence(analysis.soundCheck)}` : ''}`
      : 'Aucun clavier lisible à l\'image ; le relevé vient du son.',
  }));
}

/**
 * Frise des accords relevés, sous la vidéo : un clic place la vidéo à l'accord ;
 * l'accord en cours et ceux du passage dont parle le Copilote sont marqués.
 */
/**
 * [Claude] — 2026-10-14 — Le guide du tuto (onglet « Guide du tuto ») : refait quand le relevé
 * change. Les « Accords relevés » sont retirés (Narcisse : « je ne l'utilise pas du tout »).
 */
function renderGuide() {
  if (!guidePanel) return;
  const ready = Boolean(selectedPath && analysis && !isReadingHere());
  const guide = ready ? tutorialGuide() : null;
  const { chapters, subject, titles } = ready ? tutorialChapters() : { chapters: [], subject: '', titles: null };
  const shown = `${guide ? 'g' : '-'}|${chaptersSignature(chapters)}|${chapters.map((c) => c.title).join('/')}|${subject}|${titles}`;
  if (guideShownFor === shown && guidePanel.root.childElementCount) return;
  guideShownFor = shown;
  guidePanel.render(guide, { noNotes: ready && !guide && !chapters.length, chapters, subject, titles });
  setPanelTab(guide || chapters.length ? panelTab : 'copilot', { quiet: true });
}

/** Les chapitres du tuto, en gros segments titrés pour la barre sous la vidéo (null : pas de chapitres). */
function chapterSteps() {
  if (!analysis || !selectedPath) return null;
  const { chapters } = tutorialChapters();
  if (!chapters.length) return null;
  return chapters.map((c) => ({ id: c.id, kind: `ch-${c.kind}`, start: c.start, end: c.end, title: c.title, label: c.title }));
}

/** Les accords relevés, en étapes neutres pour la barre du tuto (quand il n'y a pas de guide). */
function chordSteps() {
  return (analysis?.segments || [])
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start && s.chord?.resolved && s.chord.label)
    .map((s, i) => ({ id: `c${i + 1}`, kind: 'chord', start: s.start, end: s.end, title: s.chord.label }));
}

/** L'onglet du panneau de droite : le guide du tuto, ou le Copilote. */
function setPanelTab(tab, { quiet = false } = {}) {
  panelTab = tab === 'copilot' ? 'copilot' : 'guide';
  if (!quiet && panelTab === 'guide') panelTabChosen = true;
  if (!els.copilotPanel) return;
  els.copilotPanel.dataset.tab = panelTab;
  for (const [btn, name] of [[els.tabGuide, 'guide'], [els.tabCopilot, 'copilot']]) {
    if (!btn) continue;
    btn.setAttribute('aria-selected', String(panelTab === name));
    btn.tabIndex = panelTab === name ? 0 : -1;
  }
  if (panelTab === 'copilot') els.tabCopilot?.classList.remove('has-news');
}
let panelTabChosen = false;

/** Un exemple du guide (le résultat final, un mouvement) : le même lecteur que le Copilote. */
function playGuideExample(id, what) {
  // Vitesse (¼ à 1×) et transposition (demi-tons) choisies dans le guide : on peut ralentir pour bien
  // observer le geste, ou le jouer dans une autre tonalité pour se l'approprier.
  const rate = Number.isFinite(what.rate) && what.rate > 0 ? what.rate : 1;
  const semitones = Number.isFinite(what.semitones) ? Math.max(-12, Math.min(12, what.semitones)) : 0;
  const view = teacherView();
  const notes = view?.played || analysis?.noteEvents || [];
  let example = null;
  if (what.kind === 'final') {
    example = finalResultExample({ guide: tutorialGuide(), noteEvents: notes, pedals: analysis?.pedals || null, activity: view?.spans || [] }, { part: what.part, hand: what.hand, semitones }).example;
  } else if (what.kind === 'movement') {
    example = passageExample(notes, { start: what.start, end: what.end, semitones, title: 'Le mouvement du prof', pedals: analysis?.pedals || null, speech: view?.spans || [] });
  }
  if (!example) return;
  pauseVideo();
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id, example, pedal: true, rate } }));
}


/**
 * Panneau du Copilote : la conversation y est amarrée quand la vue est affichée, et
 * le Copilote passe en mode tutoriel sur ce tuto. Une ligne dit ce qu'il sait (ou
 * pas encore) de la vidéo.
 */
function renderCopilotPanel() {
  if (!els.copilotPanel) return;
  const name = selectedPath ? tutorialTitle(selectedPath) : '';
  if (els.copilotName) els.copilotName.textContent = name;
  // [Claude] — 2026-10-03 — Le Copilote ne s'ouvre que sur un tuto analysé (Narcisse : « tant
  // que l'analyse […] n'a pas été faite, je ne peux pas lui demander de reproduire ce que le
  // pianiste joue ») : avant, l'écran d'attente couvre le tuto et le dit.
  const ready = Boolean(selectedPath && analysis && !isReadingHere());
  let notice = '';
  if (ready && !analysis.noteEvents?.length) notice = 'Le clavier n\'a pas pu être lu à l\'image : le Copilote connaît les accords (lus au son), pas les notes exactes du prof.';
  if (els.copilotNotice) {
    els.copilotNotice.textContent = notice;
    els.copilotNotice.hidden = !notice;
  }
  if (viewActive && ready && els.copilotSlot) {
    dockCopilot(els.copilotSlot);
    if (announcedPath !== selectedPath) {
      announcedPath = selectedPath;
      document.dispatchEvent(new CustomEvent('copilot-open-tutorial', { detail: { path: selectedPath } }));
    }
  }
}

/** « 2 min 05 s » écoulées. */
function elapsedText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  return m ? `${m} min ${String(total % 60).padStart(2, '0')} s` : `${total} s`;
}

/**
 * [Claude] — 2026-10-03 — L'écran d'attente du tuto ouvert, comme celui du Studio et de
 * l'Analyse : ce qui se fait (étape), depuis combien de temps, et qu'on peut aller ailleurs.
 * Il dit aussi pourquoi un tuto ne sera pas analysé (trop long) ou ne l'a pas été (erreur).
 */
function renderReading() {
  const box = els.reading;
  if (!box) return;
  const path = selectedPath;
  const status = tutorialStatus(path);
  const failed = lastFailure?.path === path && !analysis && status !== 'reading' && status !== 'waiting';
  const show = Boolean(path) && status !== 'ready' && (memoryChecked || status === 'reading' || status === 'waiting');
  box.hidden = !show;
  if (!show) return;
  const name = tutorialTitle(path);
  let title = 'Analyse du tutoriel';
  let step = '';
  let elapsed = '';
  let hint = 'Tu peux aller dans les autres onglets, ou revenir à tes tutoriels : l\'analyse continue. Le Copilote s\'ouvrira quand elle sera finie.';
  let still = false;
  if (status === 'reading') {
    step = reading.step || 'Préparation…';
    elapsed = `Depuis ${elapsedText(Date.now() - reading.startedAt)}`;
  } else if (status === 'waiting') {
    title = 'Analyse en attente';
    const other = reading ? tutorialTitle(reading.path) : '';
    step = other ? `« ${other} » est en cours d'analyse : celui-ci passera juste après.` : 'Un autre tuto passe avant.';
  } else if (failed) {
    title = 'L\'analyse n\'a pas abouti';
    step = lastFailure.status?.message || '';
    hint = lastFailure.status?.details || '';
    still = true;
  } else if (status === 'tooLong') {
    title = 'Tutoriel trop long';
    const d = Number(cards[path]?.duration) || Number(els.videoPlayer?.duration);
    step = `Ce tuto dure ${cardDuration(d)}. Pédagogie IA analyse les tutos de 30 minutes au plus : garde le passage qui t'intéresse (avec un éditeur vidéo), puis importe-le.`;
    hint = '';
    still = true;
  } else {
    step = 'Ouverture…';
  }
  box.classList.toggle('is-still', still);
  if (els.readingTitle) els.readingTitle.textContent = title;
  if (els.readingName) els.readingName.textContent = name;
  if (els.readingStep) els.readingStep.textContent = step;
  if (els.readingElapsed) els.readingElapsed.textContent = elapsed;
  if (els.readingHint) {
    els.readingHint.textContent = hint;
    els.readingHint.hidden = !hint;
  }
  if (els.readingRetry) els.readingRetry.hidden = !failed;
}

/**
 * [Claude] — 2026-10-03 — « « Amazing Grace » est prêt » : visible depuis n'importe quel
 * onglet (on a pu aller ailleurs pendant l'analyse) ; un clic ouvre le tuto.
 */
let toastTimer = null;
function showReadyToast(path) {
  if (typeof document === 'undefined' || !document.body) return;
  let toast = document.getElementById('pedagogie-ready-toast');
  if (!toast) {
    toast = el('button', { id: 'pedagogie-ready-toast', className: 'pedago-ready-toast', type: 'button' });
    document.body.appendChild(toast);
  }
  const name = tutorialTitle(path);
  toast.textContent = '';
  toast.appendChild(el('strong', { text: `« ${name} » est prêt` }));
  toast.appendChild(el('span', { text: 'Pédagogie IA · ouvrir' }));
  toast.onclick = () => {
    toast.hidden = true;
    openTutorialAnywhere(path);
  };
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 15000);
}

/** Ouvre un tuto depuis n'importe quel onglet (Entraînement › Pédagogie IA). */
function openTutorialAnywhere(path) {
  const practiceTab = document.querySelector('.tab-btn[data-tab="practice"]');
  if (practiceTab && !practiceTab.classList.contains('active')) practiceTab.click();
  if (!viewActive) document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'pedagogie' } }));
  if (selectedPath !== path) selectTrack(path);
}

/** Message de l'accueil (import d'une vidéo). */
function homeNotice(message, tone = 'info') {
  if (!els.homeNotice) return;
  els.homeNotice.textContent = message || '';
  els.homeNotice.dataset.tone = tone;
  els.homeNotice.hidden = !message;
}

/**
 * Le passage dont parle le pianiste : la plage qu'il a choisie (Début / Fin), sinon les
 * 30 dernières secondes avant l'instant de la vidéo.
 */
function currentWindow() {
  const video = els.videoPlayer;
  return passageWindow(video?.currentTime, { length: FOLLOW_SECONDS, fixed: passage, duration: video?.duration });
}

/**
 * « Passage 1:22 → 1:42 » en haut du panneau du Copilote (lecture seule : on le règle sous la
 * vidéo), les accords marqués sur la frise, et la barre du passage qui suit la vidéo.
 */
function updateMoment() {
  if (!els.moment) return;
  els.moment.hidden = !selectedPath;
  if (!selectedPath) return;
  const win = currentWindow();
  if (els.momentRange) {
    els.momentRange.textContent = win ? `${clock(win.start)} → ${clock(win.end)}` : 'lance la vidéo';
    els.momentRange.title = win
      ? (win.chosen ? 'Le passage que tu as choisi sous la vidéo : c\'est celui dont tu parles au Copilote.' : `Les ${FOLLOW_SECONDS} dernières secondes de la vidéo : « ici », « ce qu'il vient de faire ». Choisis un passage sous la vidéo pour le fixer.`)
      : '';
  }
  // La tête de lecture de la barre, et l'étape en cours dans le guide.
  const now = Number(els.videoPlayer?.currentTime) || 0;
  timeline?.update({ now });
  guidePanel?.setNow(now);
}

/**
 * [Claude] — 2026-10-03 — Ce que fait le prof, moment par moment (teacher-activity.js) : il
 * joue, il parle, les deux. Ses notes jouées, sans celles que sa voix fait naître quand il
 * parle (vidéo de Narcisse : 150 « notes » transcrites de sa voix, rejouées en vrille).
 * Calculé à la lecture, une fois par relevé affiché : les relevés déjà gardés en profitent
 * sans être refaits.
 * @returns {{spans: object[], played: object[], cleaned: object[], filterChords: boolean}|null}
 */
let activityCache = null;
// [Claude] — 2026-10-04 — La structure du tuto (sa boucle), calculée une fois par relevé.
let structureCache = null;

/**
 * [Claude] — 2026-10-04 — La structure du morceau (song-structure.js) : la boucle, ses
 * parties, ses accords de passage et ses remplacements (Narcisse : « Quand je demande la
 * progression, […] ce que je demande en réalité, c'est la structure de la musique »).
 */
function tutorialStructure(chords, notes) {
  if (structureCache && structureCache.analysis === analysis && structureCache.chords === chords.length && structureCache.key === detectedKey) return structureCache.structure;
  let structure = null;
  try {
    structure = songStructure({ chords, notes, key: detectedKey });
  } catch (err) {
    console.warn('[Pedagogie] Structure non calculée :', err);
  }
  structureCache = { analysis, chords: chords.length, key: detectedKey, structure };
  return structure;
}
// [Claude] — 2026-10-14 — Le guide du tuto (tutorial-guide.js) : ses étapes, le résultat final de
// chaque partie, les mouvements qu'il montre. Calculé une fois par relevé affiché.
let guideCache = null;
function tutorialGuide() {
  if (!analysis) return null;
  const view = teacherView();
  if (guideCache && guideCache.analysis === analysis && guideCache.narration === narrationView) return guideCache.guide;
  let guide = null;
  try {
    // Les accords des moments où il joue : ceux lus pendant qu'il parle (sa voix prise pour du piano,
    // une image restée allumée) ne sont pas des étapes jouées.
    const segments = analysis.segments || [];
    guide = buildTutorialGuide({
      segments: view?.filterChords ? chordsWhilePlaying(segments, view.spans) : segments,
      noteEvents: view?.played || analysis.noteEvents || [],
      transcript: narrationView.map((n) => ({ start: n.start, text: n.text })),
      duration: Number.isFinite(els.videoPlayer?.duration) ? els.videoPlayer.duration : (analysis.stats?.duration || null),
    });
  } catch (err) {
    console.warn('[Pedagogie] Guide non calculé :', err);
  }
  guideCache = { analysis, narration: narrationView, guide };
  return guide;
}

/**
 * [Claude] — 2026-10-15 — Les CHAPITRES du tuto, comme sur YouTube (guide-chapters.js). Les bornes sont
 * décidées par le moteur (parole, jeu, tonalité, vocabulaire) ; l'IA ne fait que les NOMMER en français
 * (Narcisse : « la barrière de la langue »), une fois par tuto et par découpage, gardée dans sa fiche.
 * @returns {{chapters: object[], subject: string, titles: 'pending'|'nokey'|null}}
 */
let chaptersCache = null;
const chapterTitlesAsked = new Set();
const chapterTitlesPending = new Set();
function tutorialChapters() {
  const none = { chapters: [], subject: '', titles: null };
  if (!analysis || !selectedPath) return none;
  const guide = tutorialGuide();
  if (chaptersCache && chaptersCache.analysis === analysis && chaptersCache.narration === narrationView && chaptersCache.guide === guide) return chaptersCache.value;
  const view = teacherView();
  const highlights = guide ? buildHighlights(guide) : [];
  let chapters = [];
  try {
    chapters = buildChapters({
      narration: narrationView,
      spans: view?.spans || [],
      parts: guide?.parts || [],
      highlights,
      duration: Number.isFinite(els.videoPlayer?.duration) ? els.videoPlayer.duration : (analysis.stats?.duration || null),
    });
  } catch (err) {
    console.warn('[Pedagogie] Chapitres non calculés :', err);
  }
  let subject = '';
  let titles = null;
  const sig = chaptersSignature(chapters);
  const fr = cards[selectedPath]?.chaptersFr;
  if (chapters.length && fr && fr.sig === sig) {
    chapters = applyChapterTitles(chapters, { byId: fr.byId });
    subject = fr.subject || '';
  } else if (chapters.length && needsChapterTitles(chapters)) {
    const config = getAIConfig();
    if (!config?.apiKey || !config?.baseUrl) titles = 'nokey';
    else {
      titles = 'pending';
      requestChapterTitles(selectedPath, chapters, highlights);
    }
  }
  const value = { chapters, subject, titles };
  chaptersCache = { analysis, narration: narrationView, guide, value };
  return value;
}

async function requestChapterTitles(path, chapters, highlights) {
  const sig = chaptersSignature(chapters);
  const key = `${path}|${sig}`;
  if (!path || !sig || chapterTitlesAsked.has(key)) return;
  const config = getAIConfig();
  if (!config?.apiKey || !config?.baseUrl) return;
  chapterTitlesAsked.add(key);
  chapterTitlesPending.add(key);
  const moveTitles = Object.fromEntries(highlights.map((h) => [h.id, `${h.title}${h.detail ? ` (${h.detail})` : ''}`]));
  try {
    const res = await callChatCompletions(config.baseUrl, config.apiKey, {
      model: config.model,
      messages: chapterMessages(chapters, { moveTitles }),
      temperature: 0.2,
    }, { timeoutMs: 60000 });
    if (!res.ok) return;
    const data = await res.json();
    const parsed = parseChapterTitles(data?.choices?.[0]?.message?.content || '', chapters);
    if (!Object.keys(parsed.byId).length) return;
    await updateCard(path, { chaptersFr: { sig, subject: parsed.subject, byId: parsed.byId } });
  } catch (err) {
    console.warn('[Pedagogie] Chapitres non nommés :', err?.message || err);
  } finally {
    chapterTitlesPending.delete(key);
    if (selectedPath === path) {
      chaptersCache = null;
      guideShownFor = null;
      renderGuide();
      renderPassageBar();
    }
  }
}

function teacherView() {
  if (!analysis) return null;
  if (activityCache && activityCache.analysis === analysis && activityCache.narration === narrationView) return activityCache.view;
  const notes = Array.isArray(analysis.noteEvents) ? analysis.noteEvents : [];
  const source = analysis.notesSource || (analysis.source === 'audio' ? 'son' : 'image');
  const view = teacherActivity({ notes, speech: narrationView, source, start: 0 });
  // Sans notes du prof, rien ne dit quand il joue : les accords restent tous.
  view.filterChords = view.cleaned.length > 0;
  activityCache = { analysis, narration: narrationView, view };
  return view;
}

/**
 * [Claude] — 2026-09-25 — Tout ce que le Copilote doit savoir du tutoriel analysé :
 * nom, tonalité, grille datée, parole du professeur, d'où vient le relevé, frise
 * compacte des notes jouées (et les notes elles-mêmes, pour ses outils : rejouer un
 * passage, le montrer au clavier). [Claude] — 2026-10-03 — Et le MOMENT : l'instant
 * de la vidéo et le passage que le pianiste désigne par « ici » (tutorial-moment.js).
 * @returns {object|null}
 */
export function getPedagogieCopilotContext() {
  if (!selectedPath || !analysis) return null;
  const view = teacherView();
  const allChords = analysis.segments
    .filter((s) => s.chord?.resolved)
    .map((s) => ({ start: s.start, end: s.end, label: s.chord.label }));
  // [Claude] — 2026-10-03 — Ses notes jouées, et les accords des moments où il joue.
  const chords = view.filterChords ? chordsWhilePlaying(allChords, view.spans) : allChords;
  // [Claude] — 2026-10-04 — Pour la structure, pas les « accords » d'une seule note : une note
  // de mélodie que la lecture du clavier nomme comme un accord (« A », « A# » sur
  // « L'Éternel est bon »). Un accord lu au son n'a pas de notes (midis vide) : il reste.
  const solidChords = analysis.segments
    .filter((s) => s.chord?.resolved && !(Array.isArray(s.midis) && s.midis.length > 0 && new Set(s.midis.map((m) => ((m % 12) + 12) % 12)).size < 2))
    .map((s) => ({ start: s.start, end: s.end, label: s.chord.label }));
  const structureChords = view.filterChords ? chordsWhilePlaying(solidChords, view.spans) : solidChords;
  const noteEvents = view.played;
  const rawNotes = Array.isArray(analysis.noteEvents) ? analysis.noteEvents.length : 0;
  const heardToo = analysis.soundCheck?.reliable ? ', recoupé avec le son (octaves, notes manquées et glissandos vérifiés à l\'oreille)' : '';
  const sourceLabel = analysis.source === 'v2n' ? `lu à l'image (vrai clavier filmé, V2N)${heardToo}`
    : analysis.source === 'video' ? `lu à l'image (clavier dessiné)${heardToo}`
      : `lu au son (accords)${analysis.notesSource === 'son' ? ' ; notes transcrites depuis le son' : ''}`;
  const transcript = narrationView.map((n) => ({ start: n.start, text: n.text }));
  const video = els.videoPlayer;
  return {
    type: 'tutorial',
    path: selectedPath,
    name: tutorialTitle(selectedPath),
    key: detectedKey,
    chords,
    transcript,
    sourceLabel,
    notesTimeline: compactTimeline(noteEvents, chords),
    noteEvents,
    structure: tutorialStructure(structureChords, noteEvents),
    guide: tutorialGuide(),
    pedals: Array.isArray(analysis.pedals) && analysis.pedals.length ? analysis.pedals : null,
    activity: view.spans,
    activitySummary: activitySummary(view.spans, { max: 40 }),
    notesUnavailable: rawNotes ? null : (notesUnavailable || (analysis.source === 'audio'
      ? 'le clavier n\'est pas lisible à l\'image (pianiste filmé de côté ?) et la transcription des notes au son n\'a rien donné'
      : 'aucune note lue')),
    duration: Number.isFinite(video?.duration) ? video.duration : null,
    moment: momentContext({
      now: video?.currentTime,
      length: FOLLOW_SECONDS,
      fixed: passage,
      duration: video?.duration,
      chords,
      noteEvents,
      transcript,
      activity: view.spans,
    }),
  };
}

/** Fait sauter la lecture vidéo à un instant, si le lecteur est là. */
function seekVideo(seconds) {
  if (!els.videoPlayer || !Number.isFinite(seconds)) return;
  try {
    els.videoPlayer.currentTime = Math.max(0, seconds);
    els.videoPlayer.play?.().catch(() => { /* lecture bloquée : le seek reste utile */ });
  } catch (_) { /* lecteur pas encore prêt : le clic n'est pas une erreur */ }
  updateMoment();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/** Initialise l'écran Pédagogie IA. Appelé une fois par main.js. */
export function initPedagogieTab() {
  els.root = document.getElementById('practice-view-pedagogie');
  if (!els.root) return;
  // [Claude] — 2026-09-25 — Le Copilote lit le tutoriel par le registre (sans importer cet écran).
  registerCopilotContext('tutorial', getPedagogieCopilotContext);

  els.importBtn = document.getElementById('pedagogie-import-btn');
  els.legacyHint = document.getElementById('pedagogie-legacy-hint');
  els.libraryList = document.getElementById('pedagogie-library-list');
  els.libraryCount = document.getElementById('pedagogie-library-count');
  els.libraryCountAll = document.getElementById('pedagogie-library-count-all');
  els.librarySearch = document.getElementById('pedagogie-library-search');
  els.libraryFilters = document.getElementById('pedagogie-library-filters');
  els.home = document.getElementById('pedagogie-home');
  els.homeTitle = document.getElementById('pedagogie-home-title');
  els.homeText = document.getElementById('pedagogie-home-text');
  els.homeImportBtn = document.getElementById('pedagogie-home-import-btn');
  els.backBtn = document.getElementById('pedagogie-back-btn');
  els.homeGrid = document.getElementById('pedagogie-home-grid');
  els.speed = document.getElementById('pedagogie-speed');
  els.metronome = document.getElementById('pedagogie-metronome');
  els.redoBtn = document.getElementById('pedagogie-redo-btn');
  els.split = document.getElementById('pedagogie-split');
  els.main = document.getElementById('pedagogie-main');
  // [Claude] — 2026-10-03 — L'écran d'attente de l'analyse, et le message de l'accueil.
  els.reading = document.getElementById('pedagogie-reading');
  els.readingTitle = document.getElementById('pedagogie-reading-title');
  els.readingName = document.getElementById('pedagogie-reading-name');
  els.readingStep = document.getElementById('pedagogie-reading-step');
  els.readingElapsed = document.getElementById('pedagogie-reading-elapsed');
  els.readingHint = document.getElementById('pedagogie-reading-hint');
  els.readingRetry = document.getElementById('pedagogie-reading-retry');
  els.homeNotice = document.getElementById('pedagogie-home-notice');
  els.status = document.getElementById('pedagogie-status');
  els.format = document.getElementById('pedagogie-format');
  els.videoCard = document.getElementById('pedagogie-video-card');
  els.videoPlayer = document.getElementById('pedagogie-video-player');
  // [Claude] — 2026-10-03 — La frise se replie (repliée par défaut), et la barre du passage.
  els.passage = document.getElementById('pedagogie-passage');
  els.timelineMount = document.getElementById('pedagogie-timeline');
  els.timelineTip = document.getElementById('pedagogie-timeline-tip');
  els.regionChip = document.getElementById('pedagogie-region-chip');
  els.tabGuide = document.getElementById('pedagogie-tab-guide');
  els.tabCopilot = document.getElementById('pedagogie-tab-copilot');
  els.guideSlot = document.getElementById('pedagogie-guide-slot');
  els.passageLoop = document.getElementById('pedagogie-passage-loop');
  els.passageFollow = document.getElementById('pedagogie-passage-follow');
  els.videoActions = document.getElementById('pedagogie-video-actions');
  els.calibrateBtn = document.getElementById('pedagogie-calibrate-btn');
  els.copilotPanel = document.getElementById('pedagogie-copilot-panel');
  els.copilotName = document.getElementById('pedagogie-copilot-name');
  els.copilotNotice = document.getElementById('pedagogie-copilot-notice');
  els.copilotSlot = document.getElementById('pedagogie-copilot-slot');
  els.moment = document.getElementById('pedagogie-moment');
  els.momentRange = document.getElementById('pedagogie-moment-range');

  els.importBtn?.addEventListener('click', () => { importVideo(); });
  els.backBtn?.addEventListener('click', () => { closeTutorial(); });
  els.homeImportBtn?.addEventListener('click', () => { importVideo(); });
  els.librarySearch?.addEventListener('input', () => { libraryQuery = els.librarySearch.value; renderLibraryDrawer(); });
  els.libraryFilters?.addEventListener('click', (e) => {
    const button = e.target.closest('[data-library-filter]');
    if (!button) return;
    libraryFilter = button.dataset.libraryFilter;
    for (const b of els.libraryFilters.querySelectorAll('[data-library-filter]')) {
      const on = b === button;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    renderLibraryDrawer();
  });
  els.readingRetry?.addEventListener('click', () => { analyzeSelected(); });
  els.redoBtn?.addEventListener('click', () => { analyzeSelected(); });
  // [Refonte Astra 12/09] — Le bouton « Calibrer le clavier (V2N) » avait été
  // retiré de l'écran. [Claude] — 2026-09-25 — Il revient, mais seulement quand
  // il sert : V2N installé et un vrai clavier à lire (pas de clavier dessiné
  // reconnu), ou une calibration déjà faite à reprendre.
  els.calibrateBtn?.addEventListener('click', () => { startCalibration(); });
  els.videoPlayer?.addEventListener('click', onCalibrationClick);

  // Le passage suit la vidéo.
  for (const type of ['timeupdate', 'seeked', 'loadedmetadata', 'pause']) {
    els.videoPlayer?.addEventListener(type, updateMoment);
  }
  // Fiche du tuto : sa durée, et une vignette prise pendant la lecture s'il n'en a pas.
  els.videoPlayer?.addEventListener('loadedmetadata', rememberDuration);
  els.videoPlayer?.addEventListener('timeupdate', captureThumbnailFromPlayer);
  // « Boucler » : retour au début du passage (et la vitesse reste celle choisie).
  els.videoPlayer?.addEventListener('timeupdate', keepInLoop);
  els.videoPlayer?.addEventListener('ended', keepInLoop);
  els.videoPlayer?.addEventListener('loadedmetadata', applySpeed);
  // La durée de la vidéo donne les listes Début / Fin.
  els.videoPlayer?.addEventListener('loadedmetadata', renderPassageBar);
  els.passageLoop?.addEventListener('click', () => { toggleLooping(); });
  els.passageFollow?.addEventListener('click', () => { followVideo(); });
  // [Claude] — 2026-10-14 — La barre du passage et le guide du tuto.
  if (els.timelineMount) {
    timeline = createPassageTimeline({
      onSeek: (t) => seekVideo(t),
      onRegion: (range) => { if (range) setPassage(range, { flash: false }); else followVideo(); },
      maxSeconds: MAX_PASSAGE_SECONDS,
      followSeconds: FOLLOW_SECONDS,
    });
    els.timelineMount.appendChild(timeline.root);
  }
  document.getElementById('pedagogie-timeline-tip-ok')?.addEventListener('click', () => hideTimelineTip(true));
  if (els.guideSlot) {
    guidePanel = createGuidePanel({
      onSeek: (t) => seekVideo(t),
      onRegion: (range) => setPassage(range),
      onPlay: (id, what) => playGuideExample(id, what),
      onStop: () => document.dispatchEvent(new CustomEvent('copilot-stop-example')),
    });
    els.guideSlot.appendChild(guidePanel.root);
  }
  els.tabGuide?.addEventListener('click', () => setPanelTab('guide'));
  els.tabCopilot?.addEventListener('click', () => setPanelTab('copilot'));
  for (const btn of [els.tabGuide, els.tabCopilot]) {
    btn?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setPanelTab(panelTab === 'guide' ? 'copilot' : 'guide');
      (panelTab === 'guide' ? els.tabGuide : els.tabCopilot)?.focus();
    });
  }
  // Les exemples du guide jouent dans le lecteur commun : leurs boutons le disent.
  document.addEventListener('copilot-example-state', (e) => {
    const { id, playing } = e.detail || {};
    if (typeof id === 'string' && id.startsWith('guide-')) guidePanel?.setPlaying(id, Boolean(playing));
    else if (playing) guidePanel?.setPlaying(null, false);
  });
  setPanelTab('guide', { quiet: true });
  // La largeur du Copilote : la poignée, le bouton, et la part retenue.
  els.resizer = document.getElementById('pedagogie-resizer');
  els.sizeBtn = document.getElementById('pedagogie-copilot-size');
  els.sizeLabel = els.sizeBtn?.querySelector('.pedago-copilot-size-label') || null;
  bindResizer();
  els.sizeBtn?.addEventListener('click', () => setCopilotShare(toggledShare(copilotShare)));
  let savedShare = null;
  try { savedShare = localStorage.getItem(COPILOT_WIDTH_KEY); } catch (_) { savedShare = null; }
  setCopilotShare(storedShare(savedShare), { save: false });

  // Poser une question au Copilote met la vidéo en pause : le passage ne bouge plus
  // pendant qu'on écrit.
  els.copilotPanel?.addEventListener('focusin', (e) => {
    if (e.target?.id === 'copilot-input') pauseVideo();
  });
  els.copilotPanel?.addEventListener('pointerdown', (e) => {
    if (e.target?.closest?.('.copilot-chip, .tr-prompt-options button, .copilot-chooser button, #copilot-send-btn')) pauseVideo();
  }, true);

  // Un moment cité par le Copilote (« à 1:31 ») place la vidéo.
  document.addEventListener('pedagogie-seek', (e) => {
    const seconds = Number(e.detail?.seconds);
    if (!selectedPath || !Number.isFinite(seconds)) return;
    if (!viewActive) document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'pedagogie' } }));
    seekVideo(seconds);
  });

  document.addEventListener('app-switch-training-view', (e) => {
    const view = e.detail?.view;
    if (view === 'pedagogie') {
      viewActive = true;
      announcedPath = null;
      refreshTutorials();
      render();
      return;
    }
    if (viewActive) { pauseVideo(); stopMetronome(); }
    viewActive = false;
    // La conversation retourne dans l'onglet Copilote quand on y va.
    if (view === 'copilot') undockCopilot();
  });

  render();
  refreshTutorials();
}

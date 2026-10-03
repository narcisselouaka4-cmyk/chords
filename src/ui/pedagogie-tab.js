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
import { explainUnrecognised } from '../pedagogie/format-detector.js';
import { crossCheck } from '../pedagogie/cross-check.js';
import { normalizeAnalyzerChords } from '../pedagogie/audio-fallback.js';
import { normalizeTranscription, alignNarration } from '../pedagogie/transcription.js';
import { listTutorialFiles, copyTutorialIntoFolder, tutorialDisplayName, isMp4Name } from '../pedagogie/tutorial-library.js';
import { getTutorialFolder, saveTutorialFolder } from '../pedagogie/tutorial-folder-pref.js';
import { samplesToNoteEvents, eventsFromTranscription, compactTimeline } from '../pedagogie/teacher-notes.js';
import { registerCopilotContext } from '../pedagogie/copilot-context.js';
import { dockCopilot, undockCopilot } from '../pedagogie/copilot-dock.js';
import { momentContext, passageWindow, clock } from '../pedagogie/tutorial-moment.js';
import { FOLLOW_SECONDS, MAX_PASSAGE_SECONDS, splitTime, joinTime, timeOptions, setRangeBound, rangeLength } from '../pedagogie/passage-range.js';
import { createTutorialMemory, cardDuration } from '../pedagogie/tutorial-memory.js';
import { teacherActivity, chordsWhilePlaying, activitySummary, isPlaying, ACTIVITY } from '../pedagogie/teacher-activity.js';

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
let passageHint = '';
let passageCapped = false;
let passageBuiltFor = null;
// La frise des accords, repliée par défaut (choix retenu dans le navigateur).
const STRIP_KEY = 'pedagogie-strip-open';
let stripOpen = false;
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
const SPEEDS = [0.5, 0.75, 1];
let speed = 1;

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

function configuredFolder() {
  return getTutorialFolder(typeof localStorage !== 'undefined' ? localStorage : null);
}

/** Message expliquant pourquoi la liste ne peut pas être peuplée, raison par raison. */
function folderProblemText(reason) {
  switch (reason) {
    case 'no-folder':
      return 'Aucun dossier de tutoriels n\'est configuré. Choisissez le dossier qui contient '
        + 'vos vidéos .mp4 : elles seront listées ici.';
    case 'missing':
      return 'Le dossier configuré n\'existe plus sur le disque. Choisissez-en un autre.';
    case 'unreadable':
      return 'Le dossier n\'a pas pu être lu (accès refusé ou système de fichiers indisponible).';
    default:
      return 'Le dossier n\'a pas pu être listé.';
  }
}


/**
 * Les tutos du dossier, en cartes sur l'accueil. [Claude] — 2026-10-03 — Le tiroir « Mes
 * tutoriels » et sa liste sont retirés : les cartes sont la bibliothèque, et « ← Mes
 * tutoriels » y ramène.
 */
async function refreshTutorials() {
  // Les fiches (« Déjà lu », vignettes) avant les cartes.
  await getMemory();
  const folder = configuredFolder();
  renderFolderHint(folder);
  if (!folder) {
    tutorials = [];
    renderHomeGrid();
    return;
  }
  const result = await listTutorialFiles(folder);
  tutorials = result.files;
  folderProblem = result.ok ? null : folderProblemText(result.reason);
  renderHomeGrid();
}
// Le dossier configuré n'a pas pu être listé : l'accueil le dit.
let folderProblem = null;

/** Le dossier des tutos sur l'accueil, avec « Changer de dossier… ». */
function renderFolderHint(folder) {
  if (!els.folderHint) return;
  els.folderHint.innerHTML = '';
  if (!folder) return; // « Choisir le dossier des tutoriels » est déjà sur l'accueil.
  // La fin du chemin suffit (« …/Musique/Tutos ») ; le chemin entier est dans l'infobulle.
  const parts = folder.replace(/\/+$/, '').split('/').filter(Boolean);
  els.folderHint.appendChild(el('span', {
    className: 'pedagogie-folder-path',
    text: parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : folder,
    title: folder,
  }));
  els.folderHint.appendChild(el('button', {
    className: 'pedagogie-folder-btn',
    type: 'button',
    text: 'Changer de dossier…',
    onClick: () => chooseFolder(),
  }));
}

async function chooseFolder() {
  const api = window.electronAPI;
  if (!api?.pedagogie?.selectTutorialFolder) {
    setStatus('Le sélecteur de dossier n\'est pas disponible dans cet environnement.', 'error');
    return;
  }
  const folder = await api.pedagogie.selectTutorialFolder();
  if (!folder) return;
  saveTutorialFolder(typeof localStorage !== 'undefined' ? localStorage : null, folder);
  // Plus de tutoriel ouvert : retour à l'accueil, sur les cartes du nouveau dossier.
  closeTutorial();
}

/** Remet l'écran à zéro pour un tuto (ou aucun). Un relevé en cours n'est pas touché. */
function resetTutorialView() {
  playbackStarted = false;
  analysis = null;
  comparison = null;
  restoredAt = null;
  passage = null;
  looping = false;
  passageHint = '';
  passageCapped = false;
  passageBuiltFor = null;
  resetNarration();
  setStatus('');
  setProgress('');
}

function selectTrack(path) {
  if (!path) return;
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

/** Un tuto déjà lu : son relevé revient de la mémoire, sans relire la vidéo. */
async function restoreFromMemory(path) {
  const mem = await getMemory();
  if (!mem) return false;
  const saved = await mem.loadAnalysis(path, await fileStat(path));
  // Un relevé de ce tuto tourne (ou attend) : c'est lui qui s'affichera, pas l'ancien.
  if (!saved || selectedPath !== path || isReadingHere() || waitingPaths.has(path) || analysis) return false;
  analysis = saved.analysis;
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
      el('strong', { className: 'pedago-card-title', text: tutorialDisplayName(tut.name) }),
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
  const folder = configuredFolder();
  const list = folder ? tutorials : [];
  els.home?.classList.toggle('has-cards', list.length > 0);
  renderHome(folder);
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
  speed = SPEEDS.includes(value) ? value : 1;
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
  passageHint = '';
  passageCapped = false;
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

function renderTools() {
  if (els.speed) {
    els.speed.innerHTML = '';
    els.speed.appendChild(el('span', { className: 'pedago-tools-label', text: 'Vitesse' }));
    for (const value of SPEEDS) {
      els.speed.appendChild(el('button', {
        type: 'button',
        className: `pedago-tool-btn${value === speed ? ' is-active' : ''}`,
        'aria-pressed': String(value === speed),
        'data-speed': String(value),
        title: value === 1 ? 'Vitesse normale' : 'Plus lent, sans changer la hauteur du son',
        text: `${String(value).replace('.', ',')}×`,
        onClick: () => setSpeed(value),
      }));
    }
  }
  if (els.grid) els.grid.title = 'Clic : placer la vidéo sur l\'accord · Maj + clic : en faire le passage, en boucle';
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

/** Un bord de la plage : la valeur choisie dans ses listes (heures, minutes, secondes). */
function edgeSeconds(edge) {
  const box = edge === 'start' ? els.passageStart : els.passageEnd;
  const value = (part) => Number(box?.querySelector(`select[data-part="${part}"]`)?.value) || 0;
  return joinTime({ h: value('h'), m: value('m'), s: value('s') });
}

/** Fixe un bord de la plage ; l'autre suit au besoin, et la barre le dit. */
function setPassageEdge(edge, seconds) {
  const duration = Number(els.videoPlayer?.duration);
  const next = setRangeBound(currentRange(), edge, seconds, duration);
  passage = { start: next.start, end: next.end };
  passageHint = next.adjusted === 'end' ? 'la fin a suivi' : next.adjusted === 'start' ? 'le début a suivi' : '';
  // L'autre bord a suivi parce que la plage dépassait 10 minutes (sinon : parce qu'il passait
  // de l'autre côté).
  passageCapped = Boolean(next.adjusted) && next.end - next.start >= MAX_PASSAGE_SECONDS;
  lastLoopTime = null;
  renderPassageBar();
  updateMoment();
}

/** Les listes d'un bord (construites une fois par vidéo). */
function buildEdge(box, edge, options) {
  if (!box) return;
  box.innerHTML = '';
  box.dataset.edge = edge;
  const name = edge === 'start' ? 'Début' : 'Fin';
  box.appendChild(el('span', { className: 'pedago-passage-edge-label', text: name }));
  const select = (part, values, unit) => {
    const node = el('select', { className: 'pedago-passage-select', 'data-part': part, 'aria-label': `${name} : ${unit}` });
    for (const v of values) node.appendChild(el('option', { value: String(v), text: part === 'h' ? `${v} h` : String(v).padStart(2, '0') }));
    node.addEventListener('change', () => setPassageEdge(edge, edgeSeconds(edge)));
    box.appendChild(node);
    if (part !== 'h') box.appendChild(el('span', { className: 'pedago-passage-unit', text: unit }));
  };
  if (options.hours.length) select('h', options.hours, 'h');
  select('m', options.minutes, 'min');
  select('s', options.seconds, 's');
  box.appendChild(el('button', {
    type: 'button',
    className: 'pedago-tool-btn pedago-passage-now',
    title: `${name} = l'instant de la vidéo`,
    text: 'Maintenant',
    onClick: () => setPassageEdge(edge, Math.floor(Number(els.videoPlayer?.currentTime) || 0)),
  }));
}

/**
 * [Claude] — 2026-10-03 — La barre du passage : Début / Fin (listes, « Maintenant »), sa durée,
 * « Boucler », « Suivre la vidéo », et ce que fait le prof dans le passage (il joue, il
 * explique). Les listes ne sont reconstruites que si la vidéo change ; sinon seules leurs
 * valeurs suivent (jamais pendant qu'on en ouvre une).
 */
function renderPassageBar() {
  const bar = els.passage;
  if (!bar) return;
  const ready = Boolean(selectedPath && analysis && !isReadingHere());
  bar.hidden = !ready;
  if (!ready) return;
  const duration = Number(els.videoPlayer?.duration);
  const key = `${selectedPath}|${Number.isFinite(duration) ? Math.floor(duration) : '?'}`;
  if (passageBuiltFor !== key) {
    const options = timeOptions(duration);
    buildEdge(els.passageStart, 'start', options);
    buildEdge(els.passageEnd, 'end', options);
    passageBuiltFor = key;
  }
  const range = currentRange();
  const active = document.activeElement;
  const choosing = active?.tagName === 'SELECT' && bar.contains(active);
  if (!choosing) {
    for (const [box, t] of [[els.passageStart, range.start], [els.passageEnd, range.end]]) {
      const parts = splitTime(t);
      for (const part of ['h', 'm', 's']) {
        const node = box?.querySelector(`select[data-part="${part}"]`);
        if (node && node.value !== String(parts[part])) node.value = String(parts[part]);
      }
    }
  }
  bar.classList.toggle('is-following', !passage);
  // « 1:45 · 10 min max », « 10:00 · 10 min au plus : la fin a suivi », ou « suit la vidéo… ».
  // Réécrite seulement quand elle change : c'est une zone lue à voix haute (aria-live).
  const lengthKey = passage ? `${rangeLength(range)}|${passageCapped}|${passageHint}` : 'suit';
  if (els.passageLength && els.passageLength.dataset.key !== lengthKey) {
    const limit = MAX_PASSAGE_SECONDS / 60;
    els.passageLength.dataset.key = lengthKey;
    els.passageLength.textContent = '';
    if (passage) {
      els.passageLength.appendChild(el('strong', { text: rangeLength(range) }));
      els.passageLength.appendChild(el('span', {
        text: passageCapped ? ` · ${limit} min au plus : ${passageHint}` : ` · ${limit} min max${passageHint ? ` · ${passageHint}` : ''}`,
      }));
    } else {
      els.passageLength.appendChild(el('span', { text: `suit la vidéo : les ${FOLLOW_SECONDS} dernières secondes` }));
    }
  }
  if (els.passageLoop) {
    els.passageLoop.setAttribute('aria-pressed', String(looping));
    els.passageLoop.classList.toggle('is-active', looping);
  }
  if (els.passageFollow) els.passageFollow.hidden = !passage;
  renderPassageActivity(range);
}

/**
 * Ce que fait le prof dans le passage : une bande (il joue / il explique), cliquable. Elle
 * n'est refaite que si le passage change ; un appui place la vidéo aussitôt (tant que le
 * passage suit la vidéo, la bande avance avec elle).
 */
let activityBuilt = null;
function renderPassageActivity(range) {
  const box = els.passageActivity;
  if (!box) return;
  const view = teacherView();
  const key = `${range.start}|${range.end}`;
  if (activityBuilt?.key === key && activityBuilt.view === view) return;
  activityBuilt = { key, view };
  box.innerHTML = '';
  const spans = (view?.spans || [])
    .filter((s) => s.start < range.end && s.end > range.start)
    .map((s) => ({ ...s, start: Math.max(s.start, range.start), end: Math.min(s.end, range.end) }))
    .filter((s) => s.end - s.start > 0.05);
  if (!spans.length || range.end <= range.start) { box.hidden = true; return; }
  box.hidden = false;
  const track = el('div', { className: 'pedago-activity-track', role: 'list', 'aria-label': 'Ce que fait le prof dans ce passage' });
  const labels = { joue: 'il joue', parle: 'il explique', 'joue-et-parle': 'il joue en parlant' };
  const length = range.end - range.start;
  const percent = (t) => `${Math.round(((t - range.start) / length) * 10000) / 100}%`;
  for (const s of spans) {
    const label = labels[s.kind] || '';
    track.appendChild(el('button', {
      type: 'button',
      role: 'listitem',
      className: `pedago-activity-span is-${s.kind}`,
      style: `left: ${percent(s.start)}; width: ${percent(range.start + (s.end - s.start))}`,
      title: `${label || 'rien'} : ${clock(s.start)} → ${clock(s.end)}`,
      'aria-label': `${label || 'silence'}, ${clock(s.start)} à ${clock(s.end)}`,
      'data-start': String(s.start),
      onPointerdown: (e) => { if (e.button === 0) seekVideo(s.start); },
      // Au clavier (Entrée, Espace) : le clic n'a pas d'appui de souris avant lui.
      onClick: (e) => { if (e.detail === 0) seekVideo(s.start); },
    }));
  }
  box.appendChild(track);
  // La légende : chaque moment avec la couleur de la bande (« il explique 10:12–10:20 »).
  const told = spans.filter((s) => labels[s.kind] && s.end - s.start >= 0.5);
  if (!told.length) return;
  const legend = el('p', { className: 'pedago-activity-legend' });
  for (const s of told.slice(0, 6)) {
    legend.appendChild(el('span', { className: `pedago-activity-item is-${s.kind}`, text: `${labels[s.kind]} ${clock(s.start)}–${clock(s.end)}` }));
  }
  if (told.length > 6) legend.appendChild(el('span', { className: 'pedago-activity-more', text: `et ${told.length - 6} autres moments` }));
  box.appendChild(legend);
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
  passageHint = '';
  passageCapped = false;
  lastLoopTime = null;
  renderPassageBar();
  updateMoment();
}

/** La frise des accords : repliée par défaut, dépliée à la demande (choix retenu). */
function setStripOpen(open) {
  stripOpen = Boolean(open);
  try { localStorage.setItem(STRIP_KEY, stripOpen ? '1' : '0'); } catch (_) { /* stockage indisponible */ }
  renderResult();
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
 * re-filtré ici) est COPIÉ dans le dossier configuré. Plus d'entrée dans le
 * magasin Studio — studio-storage.js et media-library.js ne sont pas touchés.
 */
async function importVideo() {
  const api = window.electronAPI;
  const folder = configuredFolder();
  if (!folder) {
    importNotice('Choisis d\'abord le dossier de tes tutoriels.', 'error');
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
  importNotice('Copie dans le dossier des tutoriels…', 'busy');
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
        const piano = await api.pedagogie.transcribePiano(path).catch((err) => ({ available: false, reason: 'failed', detail: err.message }));
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
      built = buildVideoAnalysis({
        samples: result.samples,
        geometry: result.geometry,
        sampleInterval: result.sampleInterval,
        narration,
      });
      // Touches allumées → notes, la main d'après la couleur.
      built.noteEvents = samplesToNoteEvents(result.samples, result.sampleInterval);
      built.notesSource = 'image (clavier dessiné)';
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
  analysis = job.analysis;
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
  const folder = configuredFolder();
  const hasTutorial = Boolean(selectedPath);
  if (els.home) els.home.hidden = hasTutorial;
  if (els.split) els.split.hidden = !hasTutorial;
  // [Claude] — 2026-10-03 — « ← Mes tutoriels » : seulement quand un tuto est ouvert.
  if (els.backBtn) els.backBtn.hidden = !hasTutorial;
  renderHome(folder);
  // [Claude] — 2026-10-03 — Tant que le tuto n'est pas analysé, l'écran d'attente le couvre
  // (pas de Copilote) ; analysé, la vidéo est prête et le Copilote s'ouvre.
  const ready = hasTutorial && Boolean(analysis) && !isReadingHere();
  els.main?.classList.toggle('is-playing', playbackStarted);
  renderReading();
  // Refaire l'analyse (elle est gardée sinon).
  if (els.redoBtn) els.redoBtn.hidden = !ready;
  if (els.importBtn) {
    els.importBtn.disabled = !folder;
    els.importBtn.style.display = folder ? '' : 'none';
  }
  if (els.videoActions) els.videoActions.style.display = ready ? '' : 'none';
  if (els.calibrateBtn) {
    const needsKeyboard = analysis && analysis.source !== 'video';
    els.calibrateBtn.hidden = !(v2nState?.available && selectedPath && (needsKeyboard || getV2nCorners(selectedPath))) || isReadingHere();
  }

  renderVideo();
  renderFormat();
  renderResult();
  renderTools();
  renderPassageBar();
  renderCopilotPanel();
  updateMoment();
}

/** Accueil (aucun tutoriel ouvert) : choisir le dossier, puis un tutoriel (en cartes). */
function renderHome(folder) {
  if (!els.homeTitle) return;
  const withCards = Boolean(folder) && tutorials.length > 0;
  if (!folder) {
    els.homeTitle.textContent = 'Choisis le dossier de tes tutoriels';
    els.homeText.textContent = 'Les vidéos .mp4 de ce dossier seront listées ici. Ouvre un tuto : la vidéo du prof s\'affiche à gauche, et le Copilote à droite répond à tes questions sur ce qu\'il vient de jouer.';
  } else if (folderProblem) {
    // [Claude] — 2026-10-03 — Le tiroir qui le disait est retiré : l'accueil le dit.
    els.homeTitle.textContent = 'Le dossier des tutoriels n\'a pas pu être lu';
    els.homeText.textContent = folderProblem;
  } else if (withCards) {
    els.homeTitle.textContent = 'Tes tutoriels';
    els.homeText.textContent = 'Ouvre un tuto : la vidéo du prof s\'affiche à gauche, et le Copilote à droite répond à tes questions sur ce qu\'il vient de jouer. Un tuto déjà lu s\'ouvre tout de suite.';
  } else {
    els.homeTitle.textContent = 'Aucun tutoriel dans ce dossier';
    els.homeText.textContent = 'Ajoute une vidéo .mp4 avec « Importer une vidéo », en haut à droite : elle apparaîtra ici en carte.';
  }
  // Avec un dossier, « Changer de dossier… » est sur la ligne du dossier.
  if (els.homeFolderBtn) els.homeFolderBtn.hidden = Boolean(folder);
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
  els.format.appendChild(el('span', {
    className: `pedagogie-badge ${fromImage ? 'is-image' : 'is-audio'}`,
    text: fromV2n ? 'Lu à l\'image (V2N)' : (fromImage ? 'Lu à l\'image' : 'Lu au son'),
  }));
  els.format.appendChild(el('span', {
    className: 'pedagogie-format-text',
    text: fromImage
      ? `${analysis.stats.segmentCount} accords relevés sur ${formatTime(analysis.stats.duration)}.`
      : 'Aucun clavier lisible à l\'image ; le relevé vient du son.',
  }));
}

/**
 * Frise des accords relevés, sous la vidéo : un clic place la vidéo à l'accord ;
 * l'accord en cours et ceux du passage dont parle le Copilote sont marqués.
 */
function renderResult() {
  if (!els.grid || !els.strip) return;
  els.grid.innerHTML = '';
  // [Claude] — 2026-10-03 — Les accords des moments où il joue ; « Il explique » là où il
  // parle sans jouer (un clic place la vidéo sur l'explication).
  const view = teacherView();
  let segments = analysis?.segments || [];
  if (view?.filterChords) {
    segments = segments.filter((seg) => view.spans.some((sp) => isPlaying(sp.kind) && seg.start < sp.end && seg.end > sp.start));
  }
  const talks = (view?.spans || []).filter((sp) => sp.kind === ACTIVITY.SPEAKS && sp.end - sp.start >= 2);
  const items = [
    ...segments.map((seg) => ({ at: seg.start, seg })),
    ...talks.map((talk) => ({ at: talk.start, talk })),
  ].sort((a, b) => a.at - b.at);
  els.strip.hidden = items.length === 0;
  // [Claude] — 2026-10-03 — Repliée par défaut (Narcisse : « parfois elles ne suivent même pas
  // ce que joue le pianiste […] autant les garder repliées et permettre de les déplier »).
  els.strip.classList.toggle('is-open', stripOpen);
  els.grid.hidden = !stripOpen;
  if (els.stripToggle) {
    els.stripToggle.setAttribute('aria-expanded', String(stripOpen));
    els.stripToggle.textContent = `Accords relevés (${segments.length})`;
    els.stripToggle.title = stripOpen
      ? 'Replier la frise des accords'
      : 'Déplier la frise : les accords lus à l\'image ou au son (pas toujours justes), un clic place la vidéo';
  }
  for (const { seg, talk } of items) {
    if (talk) {
      els.grid.appendChild(el('button', {
        type: 'button',
        role: 'listitem',
        className: 'pedagogie-chip is-speech',
        title: `Le prof explique, sans jouer (${formatTime(talk.start)} → ${formatTime(talk.end)}) : un clic place la vidéo`,
        'data-start': talk.start,
        'data-end': talk.end,
        onClick: (e) => { if (e.shiftKey) loopSegment(talk.start, talk.end); else seekVideo(talk.start); },
      }, [
        el('span', { className: 'pedagogie-chip-time', text: formatTime(talk.start) }),
        el('span', { className: 'pedagogie-chip-label', text: 'Il explique' }),
      ]));
      continue;
    }
    const chip = el('button', {
      type: 'button',
      role: 'listitem',
      className: `pedagogie-chip${seg.chord.thirdMissing ? ' is-partial' : ''}`
        + `${seg.chord.resolved ? '' : ' is-unresolved'}`,
      title: seg.chord.note || (seg.chord.noteNames.length
        ? `Notes lues : ${seg.chord.noteNames.join(' ')}`
        : ''),
      'data-start': seg.start,
      'data-end': seg.end,
      // [Claude] — 2026-10-03 — Maj + clic : boucler cet accord (lot 6).
      onClick: (e) => { if (e.shiftKey) loopSegment(seg.start, seg.end); else seekVideo(seg.start); },
    }, [
      el('span', { className: 'pedagogie-chip-time', text: formatTime(seg.start) }),
      el('span', {
        className: 'pedagogie-chip-label',
        text: seg.chord.resolved ? seg.chord.label : '?',
      }),
    ]);
    els.grid.appendChild(chip);
  }
}

/**
 * Panneau du Copilote : la conversation y est amarrée quand la vue est affichée, et
 * le Copilote passe en mode tutoriel sur ce tuto. Une ligne dit ce qu'il sait (ou
 * pas encore) de la vidéo.
 */
function renderCopilotPanel() {
  if (!els.copilotPanel) return;
  const name = selectedPath ? tutorialDisplayName(selectedPath.split('/').pop() || selectedPath) : '';
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
  const name = tutorialDisplayName(path.split('/').pop() || path);
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
    const other = reading ? tutorialDisplayName(reading.path.split('/').pop() || reading.path) : '';
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
  const name = tutorialDisplayName(path.split('/').pop() || path);
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
  markStrip(win);
  // Tant que la plage suit la vidéo, ses listes avancent avec elle.
  if (!passage) renderPassageBar();
}

let currentChip = null;
function markStrip(win) {
  if (!els.grid) return;
  const now = els.videoPlayer?.currentTime;
  let current = null;
  for (const chip of els.grid.children) {
    const start = Number(chip.dataset.start);
    const end = Number(chip.dataset.end);
    const isCurrent = Number.isFinite(now) && now >= start && now < end;
    chip.classList.toggle('is-current', isCurrent);
    chip.classList.toggle('is-in-passage', Boolean(win) && start < win.end && end > win.start);
    if (isCurrent) current = chip;
  }
  // L'accord en cours reste visible dans la frise (défilement horizontal seul).
  if (current && current !== currentChip && els.grid.scrollWidth > els.grid.clientWidth) {
    const left = current.offsetLeft - els.grid.offsetLeft;
    if (left < els.grid.scrollLeft || left + current.offsetWidth > els.grid.scrollLeft + els.grid.clientWidth) {
      els.grid.scrollLeft = Math.max(0, left - 24);
    }
  }
  currentChip = current;
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
  const noteEvents = view.played;
  const rawNotes = Array.isArray(analysis.noteEvents) ? analysis.noteEvents.length : 0;
  const sourceLabel = analysis.source === 'v2n' ? 'lu à l\'image (vrai clavier filmé, V2N)'
    : analysis.source === 'video' ? 'lu à l\'image (clavier dessiné)'
      : `lu au son (accords)${analysis.notesSource === 'son' ? ' ; notes transcrites depuis le son' : ''}`;
  const transcript = narrationView.map((n) => ({ start: n.start, text: n.text }));
  const video = els.videoPlayer;
  return {
    type: 'tutorial',
    path: selectedPath,
    name: tutorialDisplayName(selectedPath.split('/').pop() || selectedPath),
    key: detectedKey,
    chords,
    transcript,
    sourceLabel,
    notesTimeline: compactTimeline(noteEvents, chords),
    noteEvents,
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
  els.folderHint = document.getElementById('pedagogie-folder-hint');
  els.home = document.getElementById('pedagogie-home');
  els.homeTitle = document.getElementById('pedagogie-home-title');
  els.homeText = document.getElementById('pedagogie-home-text');
  els.homeFolderBtn = document.getElementById('pedagogie-home-folder-btn');
  els.backBtn = document.getElementById('pedagogie-back-btn');
  els.homeGrid = document.getElementById('pedagogie-home-grid');
  els.speed = document.getElementById('pedagogie-speed');
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
  els.strip = document.getElementById('pedagogie-strip');
  els.grid = document.getElementById('pedagogie-grid');
  // [Claude] — 2026-10-03 — La frise se replie (repliée par défaut), et la barre du passage.
  els.stripToggle = document.getElementById('pedagogie-strip-toggle');
  els.passage = document.getElementById('pedagogie-passage');
  els.passageStart = document.getElementById('pedagogie-passage-start');
  els.passageEnd = document.getElementById('pedagogie-passage-end');
  els.passageLength = document.getElementById('pedagogie-passage-length');
  els.passageLoop = document.getElementById('pedagogie-passage-loop');
  els.passageFollow = document.getElementById('pedagogie-passage-follow');
  els.passageActivity = document.getElementById('pedagogie-passage-activity');
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
  els.homeFolderBtn?.addEventListener('click', () => { chooseFolder(); });
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
  els.stripToggle?.addEventListener('click', () => { setStripOpen(!stripOpen); });
  try { stripOpen = localStorage.getItem(STRIP_KEY) === '1'; } catch (_) { stripOpen = false; }

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
    if (viewActive) pauseVideo();
    viewActive = false;
    // La conversation retourne dans l'onglet Copilote quand on y va.
    if (view === 'copilot') undockCopilot();
  });

  render();
  refreshTutorials();
}

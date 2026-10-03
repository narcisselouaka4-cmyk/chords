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
import { momentContext, passageWindow, clock, DEFAULT_PASSAGE_SECONDS } from '../pedagogie/tutorial-moment.js';

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
// Distingue la SÉLECTION d'un tutoriel (aperçu, bouton « Lire ce tutoriel ») de la
// LECTURE (contrôles du lecteur, analyse lancée). Passe à true au début de
// analyzeSelected().
let playbackStarted = false;
let busy = false;
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
// Durée du passage dont parle le pianiste (« ici »), en secondes.
let passageSeconds = DEFAULT_PASSAGE_SECONDS;
// Boucle A-B : quand elle est posée, c'est elle « le passage ».
let loop = null;

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

function setProgress(message) {
  if (!els.progress) return;
  els.progress.textContent = message || '';
  els.progress.style.display = message ? '' : 'none';
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

const ICON_VIDEO = [
  el('path', { d: 'M23 7l-7 5 7 5V7z' }),
  el('rect', { x: '1', y: '5', width: '15', height: '14', rx: '2', ry: '2' }),
];
const ICON_OPEN = [
  el('path', { d: 'M7 17 17 7' }),
  el('path', { d: 'M7 7h10v10' }),
];
const PLAY_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 4 13 8-13 8z" fill="currentColor"/></svg>';
const REPLAY_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="m7 4 13 8-13 8z" fill="currentColor"/></svg>';

async function refreshTrackList() {
  if (!els.trackList) return;
  els.trackList.innerHTML = '';

  const folder = configuredFolder();
  renderFolderHint(folder);

  if (!folder) {
    els.trackList.appendChild(el('p', {
      className: 'pedagogie-empty',
      text: 'Choisissez d\'abord le dossier qui contient vos tutoriels vidéo (.mp4).',
    }));
    els.trackList.appendChild(el('button', {
      className: 'panel-action',
      type: 'button',
      text: '📁 Choisir le dossier des tutoriels',
      onClick: () => chooseFolder(),
    }));
    tutorials = [];
    return;
  }

  const result = await listTutorialFiles(folder);
  tutorials = result.files;

  if (!result.ok) {
    els.trackList.appendChild(el('p', {
      className: 'pedagogie-empty',
      text: folderProblemText(result.reason),
    }));
    return;
  }

  if (tutorials.length === 0) {
    els.trackList.appendChild(el('p', {
      className: 'pedagogie-empty',
      text: 'Aucune vidéo .mp4 dans ce dossier. Importez-en une ci-dessus.',
    }));
    return;
  }

  for (const tut of tutorials) {
    const isSelected = tut.path === selectedPath;
    const row = el('div', {
      className: `tr-library-row pedagogie-track-row ${isSelected ? 'is-selected' : ''}`,
      title: tut.path,
    });
    row.appendChild(el('button', {
      className: 'tr-library-select',
      type: 'button',
      onClick: () => selectTrack(tut.path),
    }, [
      el('span', { className: 'tr-file-icon' }, [
        el('svg', {
          width: '19', height: '19', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
        }, ICON_VIDEO),
      ]),
      el('span', {}, [
        el('strong', { text: tutorialDisplayName(tut.name) }),
        el('small', { text: tut.path }),
      ]),
    ]));
    const typeCell = el('span', { className: 'tr-library-cell', text: 'Vidéo' });
    typeCell.dataset.type = 'Vidéo';
    row.appendChild(typeCell);
    row.appendChild(el('div', { className: 'tr-library-row-actions' }, [
      el('button', {
        className: 'tr-icon-button',
        type: 'button',
        title: 'Sélectionner ce tutoriel',
        'aria-label': `Sélectionner ${tutorialDisplayName(tut.name)}`,
        onClick: () => selectTrack(tut.path),
      }, [
        el('svg', {
          width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
        }, ICON_OPEN),
      ]),
    ]));
    els.trackList.appendChild(row);
  }
}

/** Ligne « Dossier : … » sous le titre de la barre latérale, avec le bouton Changer. */
function renderFolderHint(folder) {
  if (!els.folderHint) return;
  els.folderHint.innerHTML = '';
  if (!folder) return; // le gros bouton est déjà dans la liste des tutoriels.
  els.folderHint.appendChild(el('span', {
    className: 'pedagogie-folder-path',
    text: folder,
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
  selectedPath = null;
  playbackStarted = false;
  analysis = null;
  comparison = null;
  loop = null;
  resetNarration();
  destroyVideo();
  setStatus('');
  render();
  refreshTrackList();
  // Plus de tutoriel : le Copilote quitte le mode tutoriel s'il y était.
  document.dispatchEvent(new CustomEvent('pedagogie-selection-change', { detail: { path: null } }));
}

function selectTrack(path) {
  if (busy) return;
  selectedPath = path;
  playbackStarted = false;
  analysis = null;
  comparison = null;
  loop = null;
  resetNarration();
  setStatus('');
  mountVideo(path);
  render();
  // [Claude] — 2026-10-03 — Liste redessinée APRÈS le clic : redessinée tout de suite,
  // le bouton cliqué quittait la page avant que le tiroir « Mes tutoriels » ne voie le
  // clic, et le tiroir restait ouvert par-dessus le tuto choisi.
  setTimeout(refreshTrackList, 0);
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
    setStatus('Choisissez d\'abord un dossier de tutoriels.', 'error');
    return;
  }
  if (!api?.studio?.selectVideoFile) {
    setStatus('L\'import de vidéo n\'est pas disponible.', 'error');
    return;
  }
  const picked = await api.studio.selectVideoFile();
  const filePath = typeof picked === 'string' ? picked : picked?.filePath || picked?.path;
  if (!filePath) return;
  if (!isMp4Name(filePath)) {
    setStatus('Seuls les fichiers .mp4 peuvent être importés.', 'error');
    return;
  }

  setStatus('Copie dans le dossier des tutoriels…', 'busy');
  try {
    const result = await copyTutorialIntoFolder(filePath, folder);
    if (!result.ok) {
      setStatus(result.error || 'Import impossible.', 'error');
      return;
    }
    await refreshTrackList();
    if (result.alreadyThere) {
      setStatus('Cette vidéo est déjà dans le dossier des tutoriels.', 'ok');
      selectTrack(`${folder.replace(/\/+$/, '')}/${result.fileName}`);
    } else {
      setStatus('Vidéo copiée dans le dossier des tutoriels.', 'ok');
      selectTrack(`${folder.replace(/\/+$/, '')}/${result.fileName}`);
    }
  } catch (err) {
    setStatus('Import impossible.', 'error', err.message);
  }
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
 * replié (« Détails techniques »).
 * @param {string[]} technical - raisons techniques (format, V2N, outils)
 * @param {{fromSound?: boolean, calibrateHint?: boolean}} what
 */
function showReadingStatus(technical, { fromSound = false, calibrateHint = false } = {}) {
  const parts = [];
  if (fromSound) parts.push('Je n\'ai pas pu lire le clavier à l\'image : j\'ai écouté le son à la place (les accords, pas toujours les notes exactes du prof).');
  if (calibrateHint) parts.push('Si le prof joue sur un vrai clavier filmé du dessus : « Calibrer le clavier », puis clique ses 4 coins sur la vidéo.');
  if (!parts.length && !technical.length) return;
  setStatus(parts.join(' ') || 'Lecture du clavier incomplète.', 'info', technical.join('\n'));
}

async function analyzeSelected() {
  if (busy || !selectedPath) return;
  const api = window.electronAPI;
  if (!api?.pedagogie?.analyzeVideo) {
    setStatus('L\'analyse vidéo n\'est pas disponible dans cet environnement.', 'error');
    return;
  }

  playbackStarted = true;
  busy = true;
  analysis = null;
  comparison = null;
  resetNarration();
  render();
  // [Claude] — 2026-10-03 — La vidéo démarre tout de suite : le relevé avance pendant
  // qu'on la regarde.
  try { els.videoPlayer?.play?.()?.catch?.(() => {}); } catch (_) { /* lecture bloquée */ }
  setProgress('Lecture des images…');
  setStatus('');

  try {
    // La parole ne dépend pas de ce que l'image donne : les deux lectures
    // partent ensemble, et l'on n'attend la transcription qu'au moment
    // d'assembler le résultat.
    const transcriptionPromise = runTranscription(selectedPath);

    // [Claude] — 2026-09-25 — 8 images/s (au lieu de 4) : les notes brèves d'un lick
    // tiennent au moins une image et sont gardées (notes du professeur).
    let result = await api.pedagogie.analyzeVideo(selectedPath, { sampleFps: 8 });
    const technical = [];

    if (!result?.ok) {
      // Outils de lecture absents ou pas de piste image : on le dit, puis le son.
      if (result?.reason === 'ToolsMissing' || result?.reason === 'NoVideoStream') {
        technical.push(result.message || result.reason);
        result = { ok: true, implemented: false, reason: result.reason };
      } else {
        setStatus('La vidéo n\'a pas pu être lue.', 'error', result?.message || '');
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
      const corners = getV2nCorners(selectedPath);
      if (v2nState?.available && corners) {
        setProgress('Vrai clavier filmé : lecture des touches à l\'image (plusieurs minutes)…');
        v2nResult = await api.pedagogie.analyzeVideoVision(selectedPath, {
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
      setProgress('Le clavier n\'a pas pu être lu à l\'image : écoute du son…');
      const audioSegments = await runAudioFallback(selectedPath);
      detectedKey = audioSegments.key ?? null;
      setProgress('Écoute de ce que dit le prof…');
      const narration = normalizeTranscription(await transcriptionPromise);
      analysis = buildAudioOnlyAnalysis({
        reason: result.reason,
        audioSegments: audioSegments.segments,
        key: audioSegments.key,
        narration,
      });
      narrationView = alignNarration(narration.segments, analysis.segments);
      // [Claude] — 2026-09-25 — Pianiste filmé de côté : les notes elles-mêmes,
      // transcrites depuis le son (piano-transcriber.py), si le paquet est là.
      if (api?.pedagogie?.transcribePiano) {
        setProgress('Relevé des notes jouées (au son)…');
        const piano = await api.pedagogie.transcribePiano(selectedPath).catch((err) => ({ available: false, reason: 'failed', detail: err.message }));
        if (piano?.available && piano.notes?.length) {
          analysis.noteEvents = eventsFromTranscription(piano.notes);
          analysis.notesSource = 'son';
        } else {
          notesUnavailable = piano?.reason === 'dependency-missing'
            ? `transcription des notes au son non installée (${piano.detail || 'piano-transcription-inference'} : « .venv/bin/pip install -r requirements.txt »)`
            : `transcription des notes au son impossible${piano?.detail ? ` : ${String(piano.detail).split('\n')[0]}` : ''}`;
          technical.push(`Notes du prof : ${notesUnavailable}.`);
        }
      }
      showReadingStatus(technical, { fromSound: true, calibrateHint });
      return;
    }

    setProgress('Écoute de ce que dit le prof…');
    const narration = normalizeTranscription(await transcriptionPromise);

    setProgress('Relevé des accords…');
    if (v2nResult?.available) {
      analysis = buildVideoAnalysis({
        v2nNotes: v2nResult.notes,
        v2nDuration: v2nResult.duration,
        narration,
      });
      analysis.noteEvents = eventsFromTranscription(v2nResult.notes);
      analysis.notesSource = 'image (V2N)';
    } else {
      analysis = buildVideoAnalysis({
        samples: result.samples,
        geometry: result.geometry,
        sampleInterval: result.sampleInterval,
        narration,
      });
      // Touches allumées → notes, la main d'après la couleur.
      analysis.noteEvents = samplesToNoteEvents(result.samples, result.sampleInterval);
      analysis.notesSource = 'image (clavier dessiné)';
    }
    narrationView = alignNarration(narration.segments, analysis.segments);

    // Recoupement : le son est une seconde lecture indépendante de la même
    // vidéo. Un désaccord est consigné, jamais arbitré.
    setProgress('Recoupement avec le son…');
    const audio = await runAudioFallback(selectedPath).catch(() => null);
    detectedKey = audio?.key ?? null;
    if (audio?.segments?.length) {
      comparison = crossCheck({
        video: analysis.segments
          .filter((s) => s.chord.resolved)
          .map((s) => ({ start: s.start, end: s.end, label: s.chord.label })),
        audio: audio.segments,
        step: 0.5,
      });
    }
    if (technical.length || calibrateHint) showReadingStatus(technical, { calibrateHint });
  } catch (err) {
    console.error('[Pedagogie] analyse échouée :', err);
    setStatus('L\'analyse n\'a pas abouti.', 'error', err.message);
  } finally {
    busy = false;
    setProgress('');
    // Le Copilote réannonce le tuto : son en-tête dit maintenant ce qu'il en sait.
    announcedPath = null;
    render();
  }
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
  renderHome(folder);

  if (els.selectedName) {
    els.selectedName.textContent = hasTutorial ? tutorialDisplayName(selectedPath.split('/').pop() || selectedPath) : '';
  }
  if (els.intro) {
    els.intro.textContent = analysis
      ? 'Relire le tutoriel : la vidéo repart du début et le relevé est refait.'
      : 'Lance la lecture : l\'application relève ce que joue le prof pendant que tu regardes, puis le Copilote, à droite, t\'explique chaque passage.';
  }
  // Le titre posé sur la vidéo disparaît à la lecture : il cacherait le bas de
  // l'image, là où les tutoriels montrent souvent le clavier.
  if (els.videoTitle) els.videoTitle.hidden = !hasTutorial || playbackStarted;
  els.main?.classList.toggle('is-playing', playbackStarted);

  if (els.analyzeBtn) {
    els.analyzeBtn.disabled = busy || !selectedPath;
    els.analyzeBtn.innerHTML = analysis ? REPLAY_ICON : PLAY_ICON;
    const span = document.createElement('span');
    span.textContent = analysis ? 'Relire ce tutoriel' : 'Lire ce tutoriel';
    els.analyzeBtn.appendChild(span);
    els.analyzeBtn.style.display = (!folder || !selectedPath) ? 'none' : '';
  }
  if (els.videoOverlay) {
    const showOverlay = selectedPath && !playbackStarted && !busy;
    els.videoOverlay.style.display = showOverlay ? 'flex' : 'none';
  }
  if (els.importBtn) {
    els.importBtn.disabled = busy || !folder;
    els.importBtn.style.display = folder ? '' : 'none';
  }
  if (els.videoActions) {
    els.videoActions.style.display = (selectedPath && playbackStarted) ? '' : 'none';
  }
  if (els.calibrateBtn) {
    const needsKeyboard = analysis && analysis.source !== 'video';
    els.calibrateBtn.hidden = !(v2nState?.available && selectedPath && (needsKeyboard || getV2nCorners(selectedPath))) || busy;
  }

  renderVideo();
  renderFormat();
  renderResult();
  renderCopilotPanel();
  updateMoment();
}

/** Accueil (aucun tutoriel ouvert) : choisir le dossier, puis un tutoriel. */
function renderHome(folder) {
  if (!els.homeTitle) return;
  if (!folder) {
    els.homeTitle.textContent = 'Choisis le dossier de tes tutoriels';
    els.homeText.textContent = 'Les vidéos .mp4 de ce dossier seront listées ici. Ouvre un tuto : la vidéo du prof s\'affiche à gauche, et le Copilote à droite répond à tes questions sur ce qu\'il vient de jouer.';
  } else {
    els.homeTitle.textContent = 'Choisis un tutoriel';
    els.homeText.textContent = 'Ouvre un tuto : la vidéo du prof s\'affiche à gauche, et le Copilote à droite répond à tes questions sur ce qu\'il vient de jouer.';
  }
  if (els.homeFolderBtn) els.homeFolderBtn.hidden = Boolean(folder);
  if (els.homeLibraryBtn) els.homeLibraryBtn.hidden = !folder;
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
  const segments = analysis?.segments || [];
  els.strip.hidden = segments.length === 0;
  for (const seg of segments) {
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
      onClick: () => { seekVideo(seg.start); },
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
  let notice = '';
  if (selectedPath && busy && !analysis) notice = 'Relevé en cours : le Copilote saura bientôt ce que joue le prof. Tu peux déjà regarder la vidéo.';
  else if (selectedPath && !analysis) notice = 'Lance « Lire ce tutoriel » : le Copilote saura alors ce que joue le prof, passage par passage.';
  else if (analysis && !analysis.noteEvents?.length) notice = 'Le clavier n\'a pas pu être lu à l\'image : le Copilote connaît les accords (lus au son), pas les notes exactes du prof.';
  if (els.copilotNotice) {
    els.copilotNotice.textContent = notice;
    els.copilotNotice.hidden = !notice;
  }
  if (viewActive && selectedPath && els.copilotSlot) {
    dockCopilot(els.copilotSlot);
    if (announcedPath !== selectedPath) {
      announcedPath = selectedPath;
      document.dispatchEvent(new CustomEvent('copilot-open-tutorial', { detail: { path: selectedPath } }));
    }
  }
}

/** Le passage dont parle le pianiste, d'après l'instant de la vidéo. */
function currentWindow() {
  const video = els.videoPlayer;
  return passageWindow(video?.currentTime, { length: passageSeconds, loop, duration: video?.duration });
}

/** « Passage : 1:22 → 1:42 » en haut du panneau, et les accords marqués sur la frise. */
function updateMoment() {
  if (!els.moment) return;
  els.moment.hidden = !selectedPath;
  if (!selectedPath) return;
  const win = currentWindow();
  if (els.momentRange) {
    els.momentRange.textContent = win ? `${clock(win.start)} → ${clock(win.end)}` : 'lance la vidéo';
    els.momentRange.title = win
      ? (win.fromLoop ? 'La boucle A-B : c\'est le passage dont tu parles au Copilote.' : `Les ${passageSeconds} dernières secondes de la vidéo : « ici », « ce qu'il vient de faire ».`)
      : '';
  }
  if (els.momentLength) els.momentLength.disabled = Boolean(win?.fromLoop);
  markStrip(win);
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
 * [Claude] — 2026-09-25 — Tout ce que le Copilote doit savoir du tutoriel analysé :
 * nom, tonalité, grille datée, parole du professeur, d'où vient le relevé, frise
 * compacte des notes jouées (et les notes elles-mêmes, pour ses outils : rejouer un
 * passage, le montrer au clavier). [Claude] — 2026-10-03 — Et le MOMENT : l'instant
 * de la vidéo et le passage que le pianiste désigne par « ici » (tutorial-moment.js).
 * @returns {object|null}
 */
export function getPedagogieCopilotContext() {
  if (!selectedPath || !analysis) return null;
  const chords = analysis.segments
    .filter((s) => s.chord?.resolved)
    .map((s) => ({ start: s.start, end: s.end, label: s.chord.label }));
  const noteEvents = Array.isArray(analysis.noteEvents) ? analysis.noteEvents : [];
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
    notesUnavailable: noteEvents.length ? null : (notesUnavailable || (analysis.source === 'audio'
      ? 'le clavier n\'est pas lisible à l\'image (pianiste filmé de côté ?) et la transcription des notes au son n\'a rien donné'
      : 'aucune note lue')),
    duration: Number.isFinite(video?.duration) ? video.duration : null,
    moment: momentContext({
      now: video?.currentTime,
      length: passageSeconds,
      loop,
      duration: video?.duration,
      chords,
      noteEvents,
      transcript,
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

  els.trackList = document.getElementById('pedagogie-track-list');
  els.importBtn = document.getElementById('pedagogie-import-btn');
  els.folderHint = document.getElementById('pedagogie-folder-hint');
  els.home = document.getElementById('pedagogie-home');
  els.homeTitle = document.getElementById('pedagogie-home-title');
  els.homeText = document.getElementById('pedagogie-home-text');
  els.homeFolderBtn = document.getElementById('pedagogie-home-folder-btn');
  els.homeLibraryBtn = document.getElementById('pedagogie-home-library-btn');
  els.split = document.getElementById('pedagogie-split');
  els.selectedName = document.getElementById('pedagogie-selected-name');
  els.intro = document.getElementById('pedagogie-intro');
  els.videoTitle = document.getElementById('pedagogie-video-title');
  els.main = document.getElementById('pedagogie-main');
  els.analyzeBtn = document.getElementById('pedagogie-analyze-btn');
  els.progress = document.getElementById('pedagogie-progress');
  els.status = document.getElementById('pedagogie-status');
  els.format = document.getElementById('pedagogie-format');
  els.videoCard = document.getElementById('pedagogie-video-card');
  els.videoPlayer = document.getElementById('pedagogie-video-player');
  els.videoOverlay = document.getElementById('pedagogie-video-overlay');
  els.strip = document.getElementById('pedagogie-strip');
  els.grid = document.getElementById('pedagogie-grid');
  els.videoActions = document.getElementById('pedagogie-video-actions');
  els.calibrateBtn = document.getElementById('pedagogie-calibrate-btn');
  els.copilotPanel = document.getElementById('pedagogie-copilot-panel');
  els.copilotName = document.getElementById('pedagogie-copilot-name');
  els.copilotNotice = document.getElementById('pedagogie-copilot-notice');
  els.copilotSlot = document.getElementById('pedagogie-copilot-slot');
  els.moment = document.getElementById('pedagogie-moment');
  els.momentRange = document.getElementById('pedagogie-moment-range');
  els.momentLength = document.getElementById('pedagogie-moment-length');

  els.importBtn?.addEventListener('click', () => { importVideo(); });
  els.homeFolderBtn?.addEventListener('click', () => { chooseFolder(); });
  els.analyzeBtn?.addEventListener('click', () => { analyzeSelected(); });
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
  els.momentLength?.addEventListener('change', () => {
    const value = Number(els.momentLength.value);
    passageSeconds = Number.isFinite(value) && value > 0 ? value : DEFAULT_PASSAGE_SECONDS;
    updateMoment();
  });

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
      refreshTrackList();
      render();
      return;
    }
    if (viewActive) pauseVideo();
    viewActive = false;
    // La conversation retourne dans l'onglet Copilote quand on y va.
    if (view === 'copilot') undockCopilot();
  });

  render();
  refreshTrackList();
}

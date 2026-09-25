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
//   - La grille d'accords est un accompagnement de la vidéo, plus la pièce
//     maîtresse de l'écran.
//   - La transcription n'affiche PLUS d'étiquette d'accord par ligne : ce
//     jugement par ligne manquait de fiabilité (intro musicale où l'accord au
//     plus long recouvrement est visuellement loin de la phrase).
//   - Le texte parlé est traduit automatiquement quand une clé IA est
//     configurée et que la langue détectée n'est pas déjà le français ; un
//     badge le dit, une traduction ne se fait jamais passer pour la parole
//     exacte du professeur.

import { buildVideoAnalysis, buildAudioOnlyAnalysis } from '../pedagogie/video-analysis.js';
import { explainUnrecognised } from '../pedagogie/format-detector.js';
import { crossCheck, DIVERGENCE } from '../pedagogie/cross-check.js';
import { normalizeAnalyzerChords } from '../pedagogie/audio-fallback.js';
import { normalizeTranscription, alignNarration, joinNarrationText } from '../pedagogie/transcription.js';
import { listTutorialFiles, copyTutorialIntoFolder, tutorialDisplayName, isMp4Name } from '../pedagogie/tutorial-library.js';
import {
  getTutorialFolder, saveTutorialFolder,
  getTutorialCategory, saveTutorialCategory, TUTORIAL_CATEGORIES,
} from '../pedagogie/tutorial-folder-pref.js';
import { explainNarration } from '../ai/ai-client.js';
import { getAIConfig } from '../ai/openai-config.js';
import { samplesToNoteEvents, eventsFromTranscription, compactTimeline } from '../pedagogie/teacher-notes.js';
import { registerCopilotContext } from '../pedagogie/copilot-context.js';

// [Claude] — 2026-09-25 — Pourquoi l'image n'a pas été lue (Narcisse : « l'application
// ne peut pas analyser l'image, et je ne sais pas pourquoi ») : dit en clair.
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
// Distingue la SÉLECTION d'un tutoriel (la vidéo reste cachée) de la LECTURE
// (la vidéo est affichée). selectedPath est mis à jour au clic dans la liste ;
// playbackStarted passe à true au tout début de analyzeSelected().
let playbackStarted = false;
let busy = false;
let analysis = null;
let comparison = null;
// Passages parlés déjà rapprochés des accords (voir transcription.js). Le
// rapprochement ne sert plus au RENDU (plus d'étiquette d'accord par ligne),
// mais conserve horodatages et textes affichés.
let narrationView = [];
let detectedKey = null;
// [Claude] — 2026-09-25 — État de V2N (disponible, sinon pourquoi) et raison pour
// laquelle les notes du professeur manquent, s'il en manque.
let v2nState = null;
let notesUnavailable = null;
// Résumé automatique du sujet en mode "Tutoriel avec explications".
let summary = null;
let summarizing = false;
// Lecteur vidéo blob : une seule URL vitive à la fois.
let videoBlobUrl = null;
// Chemin dont l'URL blob courante est issue : suivre la sélection, pas seulement
// la première apparition du lecteur.
let mountedVideoPath = null;
// Catégorie du tutoriel sélectionné : 'tutorial' ou 'cover'. Persistée par
// chemin de fichier. null signifie "non classé / comportement par défaut".
let tutorialCategory = null;
// Le sélecteur de catégorie est-il ouvert ? Pour éviter de lancer l'analyse
// si l'utilisateur ferme la fenêtre sans répondre.
let categoryPickerOpen = false;

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

function setStatus(message, tone = 'info') {
  if (!els.status) return;
  els.status.textContent = message || '';
  els.status.dataset.tone = tone;
  els.status.style.display = message ? '' : 'none';
}

function setProgress(message) {
  if (!els.progress) return;
  els.progress.textContent = message || '';
  els.progress.style.display = message ? '' : 'none';
}

/** Une clé IA personnelle est-elle configurée ? Même contrôle que masterclass-panel.js. */
function hasAIKey() {
  try {
    const cfg = getAIConfig();
    return Boolean(cfg && cfg.apiKey);
  } catch (_) {
    return false;
  }
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

function categoryLabel(path) {
  const cat = getTutorialCategory(typeof localStorage !== 'undefined' ? localStorage : null, path);
  if (cat === 'tutorial') return 'Tutoriel';
  if (cat === 'cover') return 'Cover';
  return 'Vidéo';
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
    // [Refonte Phase 1] — Le choix du dossier est la PREMIÈRE action : sans
    // dossier, rien d'autre n'est possible. On la rend proéminente dans la
    // liste, pas comme un petit lien gris.
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
    const typeLabel = categoryLabel(tut.path);
    const typeCell = el('span', { className: 'tr-library-cell', text: typeLabel });
    typeCell.dataset.type = typeLabel;
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
  resetNarration();
  destroyVideo();
  categoryPickerOpen = false;
  tutorialCategory = null;
  setStatus('');
  render();
  refreshTrackList();
}

function selectTrack(path) {
  if (busy) return;
  selectedPath = path;
  playbackStarted = false;
  analysis = null;
  comparison = null;
  resetNarration();
  categoryPickerOpen = false;
  refreshCategory();
  setStatus('');
  mountVideo(path);
  render();
  refreshTrackList();
  // Notifier le Copilot IA du changement de tutoriel
  document.dispatchEvent(new CustomEvent('pedagogie-selection-change', { detail: { path } }));
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
    setStatus(`Import impossible : ${err.message}`, 'error');
  }
}

function refreshCategory() {
  tutorialCategory = getTutorialCategory(typeof localStorage !== 'undefined' ? localStorage : null, selectedPath);
}

function setCategory(category) {
  const cat = saveTutorialCategory(typeof localStorage !== 'undefined' ? localStorage : null, selectedPath, category);
  tutorialCategory = cat;
  categoryPickerOpen = false;
  render();
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
    setStatus('La vidéo n\'a pas pu être chargée.', 'error');
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

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

async function analyzeSelected() {
  if (busy || !selectedPath) return;
  const api = window.electronAPI;
  if (!api?.pedagogie?.analyzeVideo) {
    setStatus('L\'analyse vidéo n\'est pas disponible dans cet environnement.', 'error');
    return;
  }

  // Demander la catégorie si elle n'est pas encore connue pour ce fichier.
  // Si l'utilisateur ferme le sélecteur sans répondre, on continue avec le
  // comportement par défaut (grille en avant, comme avant ce chantier).
  if (!categoryPickerOpen && !getTutorialCategory(typeof localStorage !== 'undefined' ? localStorage : null, selectedPath)) {
    categoryPickerOpen = true;
    render();
    return;
  }

  // C'est AU DÉBUT de la lecture que la vidéo doit apparaître, pas à la sélection.
  playbackStarted = true;
  categoryPickerOpen = false;
  busy = true;
  analysis = null;
  comparison = null;
  resetNarration();
  render();
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

    if (!result?.ok) {
      // Outils de lecture absents ou pas de piste image : on le dit, puis le son.
      if (result?.reason === 'ToolsMissing' || result?.reason === 'NoVideoStream') {
        setStatus(result.message, 'error');
        result = { ok: true, implemented: false, reason: result.reason };
      } else {
        setStatus(result?.message || 'La vidéo n\'a pas pu être lue.', 'error');
        return;
      }
    }

    // [OpenCode] — 2026-09-07 — V2N : si le format B n'est pas reconnu et que
    // l'utilisateur a calibré un clavier réel, tenter la transcription visuelle.
    let v2nResult = null;
    const messages = [];
    if (!result.implemented && result.reason !== 'ToolsMissing' && result.reason !== 'NoVideoStream') {
      // Pourquoi le clavier dessiné n'a pas été reconnu (format-detector).
      const why = explainUnrecognised(result.reason);
      if (why) messages.push(`Pas de clavier dessiné à l'image : ${why}`);
    }
    if (!result.implemented && api?.pedagogie?.checkV2n && api?.pedagogie?.analyzeVideoVision) {
      v2nState = await api.pedagogie.checkV2n();
      const corners = getV2nCorners(selectedPath);
      if (v2nState?.available && corners) {
        setProgress('Clavier réel filmé — lecture des touches à l\'image (V2N)… (plusieurs minutes)');
        v2nResult = await api.pedagogie.analyzeVideoVision(selectedPath, {
          corners,
          onsetThreshold: 0.5,
          frameThreshold: 0.5,
          bottomMargin: 0,
        });
        if (!v2nResult?.available) messages.push(v2nReasonText(v2nResult));
      } else if (v2nState?.available) {
        messages.push('Vrai clavier filmé du dessus ? Cliquez « Calibrer le clavier », puis les 4 coins du clavier sur la vidéo : l\'application lira les touches à l\'image.');
      } else if (v2nState) {
        messages.push(v2nReasonText(v2nState));
      }
    }
    if (messages.length) setStatus(messages.join(' '), 'error');

    if (!result.implemented && (!v2nResult || !v2nResult.available)) {
      // L'image n'a rien donné : on le dit, puis on tente le son.
      setProgress('L\'image n\'a rien donné — analyse du son…');
      const audioSegments = await runAudioFallback(selectedPath);
      detectedKey = audioSegments.key ?? null;
      setProgress('Transcription de la parole…');
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
        setProgress('Transcription des notes jouées (son)…');
        const piano = await api.pedagogie.transcribePiano(selectedPath).catch((err) => ({ available: false, reason: 'failed', detail: err.message }));
        if (piano?.available && piano.notes?.length) {
          analysis.noteEvents = eventsFromTranscription(piano.notes);
          analysis.notesSource = 'son';
        } else {
          notesUnavailable = piano?.reason === 'dependency-missing'
            ? `transcription des notes au son non installée (${piano.detail || 'piano-transcription-inference'} : « .venv/bin/pip install -r requirements.txt »)`
            : `transcription des notes au son impossible${piano?.detail ? ` : ${String(piano.detail).split('\n')[0]}` : ''}`;
        }
      }
      maybeAutoSummarize();
      return;
    }

    setProgress('Transcription de la parole…');
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
    // Le résumé du cours part une fois la tonalité connue (il la cite).
    maybeAutoSummarize();
  } catch (err) {
    console.error('[Pedagogie] analyse échouée :', err);
    setStatus(`Analyse impossible : ${err.message}`, 'error');
  } finally {
    busy = false;
    setProgress('');
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

/** Remet à zéro tout ce qui concerne la parole et le résumé. Appelé à chaque nouveau relevé. */
function resetNarration() {
  narrationView = [];
  detectedKey = null;
  summary = null;
  summarizing = false;
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

/**
 * Résumé automatique du sujet en mode "Tutoriel avec explications".
 * Déclenché sans action de l'utilisateur, mais uniquement quand une clé IA
 * est configurée. Le rendu principal continue immédiatement ; la carte
 * Copilot affiche l'état de génération puis le résultat quand il arrive.
 */
async function maybeAutoSummarize() {
  if (!hasAIKey() || tutorialCategory !== TUTORIAL_CATEGORIES.TUTORIAL || !analysis) return;
  if (summarizing || summary !== null) return;
  summarizing = true;
  summary = null;
  renderResult();

  try {
    const text = joinNarrationText(narrationView);
    if (!text.trim()) {
      summary = 'Aucune parole transcrite pour résumer le sujet.';
      return;
    }
    const result = await explainNarration(text, {
      key: detectedKey,
      chords: analysis.segments.filter((s) => s.chord.resolved).map((s) => s.chord.label),
      source: analysis.source,
    });
    summary = result || 'L\'assistant n\'a rien renvoyé.';
  } catch (err) {
    summary = err.message === 'AI_API_KEY_INVALID'
      ? 'La clé API a été refusée. Vérifiez-la dans Réglages › Assistant IA.'
      : `Résumé automatique impossible : ${err.message}`;
  } finally {
    summarizing = false;
    renderResult();
  }
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function render() {
  const folder = configuredFolder();

  if (els.selectedName) {
    els.selectedName.textContent = !folder
      ? 'Bienvenue dans Pédagogie IA'
      : (selectedPath
        ? tutorialDisplayName(selectedPath.split('/').pop() || selectedPath)
        : 'Aucun tutoriel sélectionné');
  }
  if (els.intro) {
    els.intro.textContent = !folder
      ? 'Choisissez le dossier qui contient vos tutoriels vidéo (.mp4) dans la barre latérale. '
        + 'La vidéo et l\'analyse apparaîtront ici.'
      : 'La vidéo du tutoriel s\'affiche ici en grand. L\'application relève '
        + 'ce qui est joué au clavier et ce que dit le professeur ; quand '
        + 'l\'image ne permet rien de lire, elle le dit et se rabat sur le son.';
  }

  if (els.analyzeBtn) {
    els.analyzeBtn.disabled = busy || !selectedPath || categoryPickerOpen;
    els.analyzeBtn.innerHTML = analysis ? REPLAY_ICON : PLAY_ICON;
    if (analysis) {
      const span = document.createElement('span');
      span.textContent = 'Relire ce tutoriel';
      els.analyzeBtn.appendChild(span);
    } else {
      const span = document.createElement('span');
      span.textContent = 'Lire ce tutoriel';
      els.analyzeBtn.appendChild(span);
    }
    els.analyzeBtn.style.display = (!folder || !selectedPath || categoryPickerOpen) ? 'none' : '';
  }
  if (els.videoOverlay) {
    const showOverlay = selectedPath && !playbackStarted && !busy && !categoryPickerOpen;
    els.videoOverlay.style.display = showOverlay ? 'flex' : 'none';
  }
  if (els.importBtn) {
    els.importBtn.disabled = busy || !folder || categoryPickerOpen;
    els.importBtn.style.display = folder ? '' : 'none';
  }

  if (els.videoActions) {
    els.videoActions.style.display = (selectedPath && playbackStarted && !categoryPickerOpen) ? '' : 'none';
  }
  if (els.calibrateBtn) {
    const needsKeyboard = analysis && analysis.source !== 'video';
    els.calibrateBtn.hidden = !(v2nState?.available && selectedPath && (needsKeyboard || getV2nCorners(selectedPath))) || busy;
  }

  if (els.categoryHint) {
    els.categoryHint.style.display = (selectedPath && playbackStarted && !categoryPickerOpen) ? '' : 'none';
    if (els.categoryHintText) {
      const name = selectedPath ? tutorialDisplayName(selectedPath.split('/').pop() || selectedPath) : '';
      const label = tutorialCategory === TUTORIAL_CATEGORIES.TUTORIAL
        ? 'Tutoriel avec explications'
        : (tutorialCategory === TUTORIAL_CATEGORIES.COVER ? 'Cover / interprétation' : '');
      els.categoryHintText.textContent = label ? `${name} — ${label} (cliquez pour changer)` : '';
    }
  }

  renderVideo();
  renderCategoryPicker();
  renderFormat();
  renderResult();
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


/** Sélecteur de catégorie affiché avant la première analyse d'un fichier. */
function renderCategoryPicker() {
  if (!els.categoryCard) return;
  const visible = selectedPath && categoryPickerOpen && !busy;
  els.categoryCard.style.display = visible ? '' : 'none';
  if (!visible) return;
  els.categoryGrid.innerHTML = '';
  for (const [key, icon, title, sub] of [
    [TUTORIAL_CATEGORIES.TUTORIAL, '🎓', 'Tutoriel avec explications',
      'Le professeur explique des accords, progressions ou concepts.'],
    [TUTORIAL_CATEGORIES.COVER, '🎹', 'Cover / interprétation',
      'Le but est de reproduire ce qui est joué dans la vidéo.'],
  ]) {
    const selected = tutorialCategory === key;
    els.categoryGrid.appendChild(el('button', {
      type: 'button',
      className: `pedagogie-category-card${selected ? ' is-selected' : ''}`,
      'data-category': key,
      onClick: () => { setCategory(key); analyzeSelected(); },
    }, [
      el('span', { className: 'pedagogie-category-icon', text: icon }),
      el('span', { className: 'pedagogie-category-title', text: title }),
      el('span', { className: 'pedagogie-category-sub', text: sub }),
    ]));
  }
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
  // En mode tutoriel, le nombre d'accords n'est pas la métrique affichée en
  // badge (la grille reste secondaire). En mode cover, la formulation actuelle
  // garde le décompte.
  const isTutorialMode = tutorialCategory === TUTORIAL_CATEGORIES.TUTORIAL;
  const badgeSuffix = fromV2n
    ? (isTutorialMode
      ? ` sur ${formatTime(analysis.stats.duration)}.`
      : ` — ${analysis.stats.segmentCount} accords relevés sur ${formatTime(analysis.stats.duration)}.`)
    : (fromImage
      ? (isTutorialMode
        ? ` sur ${formatTime(analysis.stats.duration)}.`
        : ` — ${analysis.stats.segmentCount} accords relevés sur ${formatTime(analysis.stats.duration)}.`)
      : 'Aucun clavier lisible à l\'image ; le relevé vient de l\'analyse du son.');
  els.format.appendChild(el('span', {
    className: 'pedagogie-format-text',
    text: fromV2n ? 'Clavier réel transcrit par V2N' + badgeSuffix : (fromImage ? 'Clavier graphique reconnu' + badgeSuffix : badgeSuffix),
  }));
}

function renderResult() {
  if (!els.result) return;
  if (!analysis) { els.result.style.display = 'none'; return; }
  els.result.style.display = '';

  // Mode « tutoriel avec explications » : la grille est calculée en interne
  // (le Copilot en a besoin) mais n'est pas la surface principale. On la
  // réduit visuellement et on met en avant le raccourci Copilot.
  const isTutorialMode = tutorialCategory === TUTORIAL_CATEGORIES.TUTORIAL;

  // Grille d'accords : un accompagnement compact SOUS le lecteur, plus la
  // pièce maîtresse de l'écran. En mode tutoriel, elle est secondaire.
  if (els.resultGridCard) {
    els.resultGridCard.style.display = isTutorialMode ? 'none' : '';
  }
  if (els.resultCopilotCard) {
    els.resultCopilotCard.style.display = isTutorialMode ? '' : 'none';
  }
  if (els.copilotSummaryText) {
    if (!isTutorialMode || !hasAIKey()) {
      // Mode cover ou pas de clé : texte générique, pas de résumé automatique.
      els.copilotSummaryText.textContent = 'Posez une question sur ce qui est expliqué dans la vidéo ou demandez une démonstration sur le clavier virtuel.';
      els.copilotSummaryText.classList.remove('is-busy');
    } else if (summarizing) {
      els.copilotSummaryText.textContent = 'Génération du résumé…';
      els.copilotSummaryText.classList.add('is-busy');
    } else if (summary) {
      els.copilotSummaryText.textContent = summary;
      els.copilotSummaryText.classList.remove('is-busy');
    } else {
      // Tutoriel avec clé, mais le résumé n'a pas encore démarré (cas théorique).
      els.copilotSummaryText.textContent = 'Posez une question sur ce qui est expliqué dans la vidéo ou demandez une démonstration sur le clavier virtuel.';
      els.copilotSummaryText.classList.remove('is-busy');
    }
  }
  els.grid.innerHTML = '';
  for (const seg of analysis.segments) {
    const chip = el('div', {
      className: `pedagogie-chip${seg.chord.thirdMissing ? ' is-partial' : ''}`
        + `${seg.chord.resolved ? '' : ' is-unresolved'}`,
      title: seg.chord.note || (seg.chord.noteNames.length
        ? `Notes lues : ${seg.chord.noteNames.join(' ')}`
        : ''),
      // Bonus naturel de la vidéo en fenêtre principale : un clic sur un
      // accord y fait sauter la lecture.
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

  // Recoupement. Le calcul est conservé pour un usage futur, mais le rapport
  // brut n'est pas affiché à l'utilisateur final dans cette version.
  if (els.crosscheckCard) {
    els.crosscheckCard.style.display = 'none';
  }

  // Glossaire. L'état de la narration a désormais sa propre carte : le
  // glossaire redevient ce qu'il est, une liste de fiches.
  els.glossary.innerHTML = '';
  for (const concept of analysis.concepts) {
    if (!concept.entry) continue;
    els.glossary.appendChild(el('div', { className: 'pedagogie-entry' }, [
      el('div', { className: 'pedagogie-entry-title', text: concept.entry.title }),
      el('div', { className: 'pedagogie-entry-body', text: concept.entry.body }),
      el('div', { className: 'pedagogie-entry-why', text: `Proposé parce que ${concept.because}.` }),
    ]));
  }
  if (analysis.concepts.filter((c) => c.entry).length === 0) {
    els.glossary.appendChild(el('p', {
      className: 'pedagogie-empty',
      text: 'Aucun concept du glossaire n\'a été reconnu dans ce relevé.',
    }));
  }

  // [Refonte Astra 12/09] — Le panneau « Ce que l'application ne garantit pas »
  // (#pedagogie-notes-card / #pedagogie-notes) a été retiré de l'écran sur
  // demande de Narcisse : la maquette ne garde qu'un onglet, « Résumé du cours ».
  // Le rendu qui l'alimentait est supprimé ici dans le même geste.
}

/**
 * [Claude] — 2026-09-25 — Tout ce que le Copilote doit savoir du tutoriel analysé :
 * nom, tonalité, grille datée, parole du professeur, résumé du cours, d'où
 * vient le relevé, frise compacte des notes jouées (et les notes elles-mêmes,
 * pour ses outils : rejouer un passage, le montrer au clavier). Avant, le
 * Copilote ne recevait que le chemin du fichier.
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
  return {
    type: 'tutorial',
    path: selectedPath,
    name: tutorialDisplayName(selectedPath.split('/').pop() || selectedPath),
    key: detectedKey,
    chords,
    transcript: narrationView.map((n) => ({ start: n.start, text: n.text })),
    summary: summary && !summarizing ? summary : null,
    sourceLabel,
    notesTimeline: compactTimeline(noteEvents, chords),
    noteEvents,
    notesUnavailable: noteEvents.length ? null : (notesUnavailable || (analysis.source === 'audio'
      ? 'le clavier n\'est pas lisible à l\'image (pianiste filmé de côté ?) et la transcription des notes au son n\'a rien donné'
      : 'aucune note lue')),
  };
}

/** Ouvre le Copilote sur ce tutoriel (mode tutoriel, avec tout son contexte). */
function openCopilotForTutorial() {
  document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
  if (selectedPath) document.dispatchEvent(new CustomEvent('copilot-open-tutorial', { detail: { path: selectedPath } }));
}

/** Fait sauter la lecture vidéo à un instant, si le lecteur est là. */
function seekVideo(seconds) {
  if (!els.videoPlayer || !Number.isFinite(seconds)) return;
  try {
    els.videoPlayer.currentTime = Math.max(0, seconds);
    els.videoPlayer.play?.().catch(() => { /* lecture bloquée : le seek reste utile */ });
  } catch (_) { /* lecteur pas encore prêt : le clic n'est pas une erreur */ }
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
  els.selectedName = document.getElementById('pedagogie-selected-name');
  els.intro = document.getElementById('pedagogie-intro');
  els.analyzeBtn = document.getElementById('pedagogie-analyze-btn');
  els.progress = document.getElementById('pedagogie-progress');
  els.status = document.getElementById('pedagogie-status');
  els.format = document.getElementById('pedagogie-format');
  els.videoCard = document.getElementById('pedagogie-video-card');
  els.videoPlayer = document.getElementById('pedagogie-video-player');
  els.videoOverlay = document.getElementById('pedagogie-video-overlay');
  els.result = document.getElementById('pedagogie-result');
  els.grid = document.getElementById('pedagogie-grid');
  els.crosscheckCard = document.getElementById('pedagogie-crosscheck-card');
  els.crosscheck = document.getElementById('pedagogie-crosscheck');
  els.glossary = document.getElementById('pedagogie-glossary');
  els.copilotShortcutBtn = document.getElementById('pedagogie-copilot-shortcut');
  els.videoActions = document.getElementById('pedagogie-video-actions');
  els.categoryCard = document.getElementById('pedagogie-category-card');
  els.categoryGrid = document.getElementById('pedagogie-category-grid');
  els.resultGridCard = document.getElementById('pedagogie-grid-card');
  els.resultCopilotCard = document.getElementById('pedagogie-copilot-summary-card');
  els.categoryHint = document.getElementById('pedagogie-category-hint');
  els.categoryHintText = document.getElementById('pedagogie-category-hint-text');
  els.copilotSummaryBtn = document.getElementById('pedagogie-copilot-summary-btn');
  els.copilotSummaryText = document.getElementById('pedagogie-copilot-summary-text');

  els.importBtn?.addEventListener('click', () => { importVideo(); });
  els.analyzeBtn?.addEventListener('click', () => { analyzeSelected(); });
  // [Claude] — 2026-09-25 — Le Copilote s'ouvre en mode tutoriel, avec le contexte.
  els.copilotShortcutBtn?.addEventListener('click', openCopilotForTutorial);
  els.copilotSummaryBtn?.addEventListener('click', openCopilotForTutorial);
  // [Refonte Astra 12/09] — Le bouton « Calibrer le clavier (V2N) » avait été
  // retiré de l'écran. [Claude] — 2026-09-25 — Il revient, mais seulement quand
  // il sert : V2N installé et un vrai clavier à lire (pas de clavier dessiné
  // reconnu), ou une calibration déjà faite à reprendre.
  els.calibrateBtn = document.getElementById('pedagogie-calibrate-btn');
  els.calibrateBtn?.addEventListener('click', () => { startCalibration(); });
  els.categoryHint?.addEventListener('click', () => {
    categoryPickerOpen = true;
    playbackStarted = false;
    render();
  });
  els.videoPlayer?.addEventListener('click', onCalibrationClick);

  document.addEventListener('app-switch-training-view', (e) => {
    if (e.detail?.view === 'pedagogie') {
      refreshTrackList();
      render();
    }
  });

  render();
  refreshTrackList();
}

export { explainUnrecognised };
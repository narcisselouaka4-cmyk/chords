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
import { getTutorialFolder, saveTutorialFolder } from '../pedagogie/tutorial-folder-pref.js';
import { explainNarration, translateNarrationSegments } from '../ai/ai-client.js';
import { getAIConfig } from '../ai/openai-config.js';

const els = {};
// Un tutoriel est identifié par son CHEMIN de fichier, pas par un Track_ID.
let tutorials = [];
let selectedPath = null;
let busy = false;
let analysis = null;
let comparison = null;
// Passages parlés déjà rapprochés des accords (voir transcription.js). Le
// rapprochement ne sert plus au RENDU (plus d'étiquette d'accord par ligne),
// mais conserve horodatages et textes affichés.
let narrationView = [];
let detectedKey = null;
// Traduction automatique du transcript, quand une clé IA est configurée.
// `byIndex` : index du segment transcrit → texte traduit (l'appariement avec
// les horodatages ne doit jamais se perdre).
let translated = null;        // { byIndex: Map<number, string>, targetLang: string } | null
let translationFailed = false;
// Approfondissement IA : facultatif, jamais le comportement par défaut.
let explanation = null;
let explaining = false;
// Lecteur vidéo blob : une seule URL vitive à la fois.
let videoBlobUrl = null;
// Chemin dont l'URL blob courante est issue : suivre la sélection, pas seulement
// la première apparition du lecteur.
let mountedVideoPath = null;

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
    els.trackList.appendChild(el('button', {
      className: `pedagogie-track-item${tut.path === selectedPath ? ' active' : ''}`,
      type: 'button',
      title: tut.path,
      onClick: () => selectTrack(tut.path),
    }, [
      el('span', { className: 'pedagogie-track-name', text: tutorialDisplayName(tut.name) }),
    ]));
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
  analysis = null;
  comparison = null;
  resetNarration();
  destroyVideo();
  setStatus('');
  render();
  refreshTrackList();
}

function selectTrack(path) {
  if (busy) return;
  selectedPath = path;
  analysis = null;
  comparison = null;
  resetNarration();
  setStatus('');
  render();
  refreshTrackList();
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

    const result = await api.pedagogie.analyzeVideo(selectedPath, { sampleFps: 4 });

    if (!result?.ok) {
      setStatus(result?.message || 'La vidéo n\'a pas pu être lue.', 'error');
      return;
    }

    if (!result.implemented) {
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
      await maybeTranslate(narration);
      return;
    }

    setProgress('Transcription de la parole…');
    const narration = normalizeTranscription(await transcriptionPromise);

    setProgress('Relevé des accords…');
    analysis = buildVideoAnalysis({
      samples: result.samples,
      geometry: result.geometry,
      sampleInterval: result.sampleInterval,
      narration,
    });
    narrationView = alignNarration(narration.segments, analysis.segments);
    await maybeTranslate(narration);

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

/** Remet à zéro tout ce qui concerne la parole. Appelé à chaque nouveau relevé. */
function resetNarration() {
  narrationView = [];
  detectedKey = null;
  explanation = null;
  explaining = false;
  translated = null;
  translationFailed = false;
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
 * Traduction automatique du transcript, quand elle a un sens.
 *
 * Trois conditions, toutes exigées : une clé personnelle configurée (le repli
 * sans clé reste le texte source, ce n'est pas une exigence nouvelle), une
 * transcription disponible, et une langue détectée qui n'est PAS déjà le
 * français. Une traduction ratée n'affiche rien d'alarmant : le texte original
 * reste, avec une note discrète.
 */
async function maybeTranslate(narration) {
  translated = null;
  translationFailed = false;
  if (!narration?.available || narration.segments.length === 0) return;
  if (!hasAIKey()) return;
  const lang = (narration.language || '').toLowerCase();
  if (lang.startsWith('fr')) return;

  setProgress('Traduction de la parole…');
  try {
    // La traduction ne porte que sur les passages non vides, dans l'ordre :
    // la carte index → texte traduit préserve l'appariement avec les
    // horodatages, même si des passages vides ont été écartés.
    const speakable = narration.segments
      .map((s, i) => ({ i, text: typeof s?.text === 'string' ? s.text.trim() : '' }))
      .filter((s) => s.text.length > 0);
    const lines = await translateNarrationSegments(narration.segments, {
      targetLang: 'fr',
      sourceLang: narration.language || null,
    });
    if (lines) {
      const byIndex = new Map();
      speakable.forEach((s, rank) => {
        if (lines[rank]) byIndex.set(s.i, lines[rank]);
      });
      translated = { byIndex, targetLang: 'fr' };
    } else {
      translationFailed = true;
    }
  } catch (err) {
    console.warn('[Pedagogie] traduction échouée :', err);
    translationFailed = true;
  }
}

/** Texte affiché pour un passage parlé : la traduction si elle existe, sinon le texte transcrit. */
function lineTextAt(index) {
  if (translated?.byIndex && translated.byIndex.has(index)) {
    return translated.byIndex.get(index);
  }
  return narrationView[index]?.text || '';
}

/**
 * Approfondissement facultatif : reformule ce que le professeur a dit, à la
 * lumière des accords relevés. La transcription brute reste affichée au-dessus,
 * inchangée — c'est elle la source, l'IA n'est qu'une relecture. Il porte sur le
 * texte ORIGINAL (pas la traduction) : reformuler une traduction éloignerait
 * deux fois de la parole du professeur.
 */
async function askExplanation() {
  if (explaining || !analysis) return;
  explaining = true;
  explanation = null;
  renderNarration();

  try {
    const text = joinNarrationText(narrationView);
    const result = await explainNarration(text, {
      key: detectedKey,
      chords: analysis.segments.filter((s) => s.chord.resolved).map((s) => s.chord.label),
      source: analysis.source,
    });
    explanation = result
      || 'L\'assistant n\'a rien renvoyé. La transcription ci-dessus reste la source.';
  } catch (err) {
    explanation = err.message === 'AI_API_KEY_INVALID'
      ? 'La clé API a été refusée. Vérifiez-la dans Réglages › Assistant IA.'
      : `Approfondissement impossible : ${err.message}`;
  } finally {
    explaining = false;
    renderNarration();
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
    els.analyzeBtn.disabled = busy || !selectedPath;
    els.analyzeBtn.textContent = analysis ? 'Relire ce tutoriel' : 'Lire ce tutoriel';
    els.analyzeBtn.style.display = (!folder || !selectedPath) ? 'none' : '';
  }
  if (els.importBtn) {
    els.importBtn.disabled = busy || !folder;
    els.importBtn.style.display = folder ? '' : 'none';
  }

  renderVideo();
  renderFormat();
  renderResult();
  renderNarration();
}

/** La vidéo est la fenêtre principale : visible dès qu'un tutoriel est choisi. */
function renderVideo() {
  if (!els.videoCard || !els.videoPlayer) return;
  if (!selectedPath) {
    els.videoCard.style.display = 'none';
    destroyVideo();
    return;
  }
  els.videoCard.style.display = '';
  // Le lecteur suit la SÉLECTION, pas seulement sa première apparition :
  // changer de tutoriel recharge la source. mountVideo détruit l'URL
  // précédente, une seule vit à la fois.
  if (!videoBlobUrl || mountedVideoPath !== selectedPath) {
    mountVideo(selectedPath);
  }
}

function renderFormat() {
  if (!els.format) return;
  els.format.innerHTML = '';
  if (!analysis) { els.format.style.display = 'none'; return; }
  els.format.style.display = '';

  const fromImage = analysis.source === 'video';
  els.format.appendChild(el('span', {
    className: `pedagogie-badge ${fromImage ? 'is-image' : 'is-audio'}`,
    text: fromImage ? 'Lu à l\'image' : 'Lu au son',
  }));
  els.format.appendChild(el('span', {
    className: 'pedagogie-format-text',
    text: fromImage
      ? `Clavier graphique reconnu — ${analysis.stats.segmentCount} accords relevés sur `
        + `${formatTime(analysis.stats.duration)}.`
      : 'Aucun clavier lisible à l\'image ; le relevé vient de l\'analyse du son.',
  }));
}

function renderResult() {
  if (!els.result) return;
  if (!analysis) { els.result.style.display = 'none'; return; }
  els.result.style.display = '';

  // Grille d'accords : un accompagnement compact SOUS le lecteur, plus la
  // pièce maîtresse de l'écran.
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

  // Recoupement.
  if (els.crosscheckCard) {
    if (!comparison) {
      els.crosscheckCard.style.display = 'none';
    } else {
      els.crosscheckCard.style.display = '';
      els.crosscheck.innerHTML = '';
      els.crosscheck.appendChild(el('p', {
        className: 'pedagogie-crosscheck-summary',
        text: comparison.summary,
      }));
      const conflicts = comparison.divergences.filter((d) => d.kind === DIVERGENCE.CONFLICT);
      if (conflicts.length > 0) {
        const list = el('ul', { className: 'pedagogie-notes' });
        for (const d of conflicts.slice(0, 8)) {
          list.appendChild(el('li', {
            text: `${formatTime(d.start)} — image : ${d.video} · son : ${d.audio}`,
          }));
        }
        els.crosscheck.appendChild(list);
      }
    }
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

  // Ce qui n'est pas garanti. DÉDUPLIQUÉ (retour d'usage du 06/09) : le badge
  // de provenance image/son est déjà affiché en haut de l'écran, le panneau ne
  // le répète plus. buildNotes() (video-analysis.js) ne produit QUE ce qui
  // n'est dit nulle part ailleurs : octave heuristique, tierces absentes,
  // passages non résolus, dette de glossaire.
  if (!els.notesCard || !els.notes) return;
  els.notes.innerHTML = '';
  const notes = analysis.notes || [];
  if (notes.length === 0) {
    els.notesCard.style.display = 'none';
    return;
  }
  els.notesCard.style.display = '';
  for (const note of notes) {
    els.notes.appendChild(el('li', { text: note.text }));
  }
}

/** Fait sauter la lecture vidéo à un instant, si le lecteur est là. */
function seekVideo(seconds) {
  if (!els.videoPlayer || !Number.isFinite(seconds)) return;
  try {
    els.videoPlayer.currentTime = Math.max(0, seconds);
    els.videoPlayer.play?.().catch(() => { /* lecture bloquée : le seek reste utile */ });
  } catch (_) { /* lecteur pas encore prêt : le clic n'est pas une erreur */ }
}

/**
 * Ce que dit le professeur.
 *
 * Trois choses, dans cet ordre : ce qui manque et POURQUOI, le texte transcrit
 * (traduit en français quand une traduction fiable a pu être faite — badge à
 * l'appui, une traduction ne se fait jamais passer pour la parole exacte),
 * puis — seulement si une clé IA est configurée — le bouton d'approfondissement.
 *
 * PLUS D'ÉTIQUETTE D'ACCORD PAR LIGNE (retour d'usage du 06/09) : le texte
 * parlé s'affiche seul avec son horodatage. Cliquer une ligne fait sauter la
 * vidéo à cet instant — c'est par la lecture qu'on met en relation la parole
 * et les accords maintenant.
 */
function renderNarration() {
  if (!els.narrationCard) return;
  if (!analysis) { els.narrationCard.style.display = 'none'; return; }
  els.narrationCard.style.display = '';

  const narration = analysis.narration || {};
  const available = narration.available === true;

  // L'absence est dite, et sa raison avec. Une machine sans reconnaissance
  // vocale ne se lit pas comme une vidéo sans commentaire parlé.
  if (els.narrationState) {
    els.narrationState.style.display = available ? 'none' : '';
    els.narrationState.textContent = available ? '' : (narration.message || '');
    els.narrationState.dataset.reason = narration.reason || '';
  }

  // Badge de traduction : visible seulement quand le texte affiché est une
  // traduction, jamais quand c'est la transcription originale.
  if (els.translationBadge) {
    els.translationBadge.style.display = translated ? '' : 'none';
  }
  // Échec de traduction : note discrète, le texte original reste affiché.
  if (els.translationFailed) {
    els.translationFailed.style.display = translationFailed ? '' : 'none';
  }

  els.transcript.innerHTML = '';
  narrationView.forEach((line, index) => {
    els.transcript.appendChild(el('div', {
      className: 'pedagogie-line',
      title: 'Aller à ce moment de la vidéo',
      onClick: () => { seekVideo(line.start); },
    }, [
      el('span', { className: 'pedagogie-line-time', text: formatTime(line.start) }),
      el('span', { className: 'pedagogie-line-text', text: lineTextAt(index) }),
    ]));
  });

  // Le bouton n'apparaît que si une clé personnelle est configurée ET s'il y a
  // du texte à approfondir. Sans clé, l'écran ne montre rien de tout cela : la
  // transcription brute se suffit.
  const canExplain = hasAIKey() && narrationView.length > 0;
  if (els.explain) els.explain.style.display = canExplain ? '' : 'none';
  if (els.explainBtn) {
    els.explainBtn.disabled = explaining;
    els.explainBtn.textContent = explaining ? 'Lecture en cours…' : 'Approfondir avec l\'IA';
  }
  if (els.explainAnswer) {
    els.explainAnswer.textContent = explanation || '';
    els.explainAnswer.style.display = explanation ? '' : 'none';
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/** Initialise l'écran Pédagogie IA. Appelé une fois par main.js. */
export function initPedagogieTab() {
  els.root = document.getElementById('practice-view-pedagogie');
  if (!els.root) return;

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
  els.result = document.getElementById('pedagogie-result');
  els.grid = document.getElementById('pedagogie-grid');
  els.crosscheckCard = document.getElementById('pedagogie-crosscheck-card');
  els.crosscheck = document.getElementById('pedagogie-crosscheck');
  els.glossary = document.getElementById('pedagogie-glossary');
  els.notesCard = document.getElementById('pedagogie-notes-card');
  els.notes = document.getElementById('pedagogie-notes');
  els.narrationCard = document.getElementById('pedagogie-narration-card');
  els.narrationState = document.getElementById('pedagogie-narration-state');
  els.translationBadge = document.getElementById('pedagogie-translation-badge');
  els.translationFailed = document.getElementById('pedagogie-translation-failed');
  els.transcript = document.getElementById('pedagogie-transcript');
  els.explain = document.getElementById('pedagogie-explain');
  els.explainBtn = document.getElementById('pedagogie-explain-btn');
  els.explainAnswer = document.getElementById('pedagogie-explain-answer');

  els.importBtn?.addEventListener('click', () => { importVideo(); });
  els.analyzeBtn?.addEventListener('click', () => { analyzeSelected(); });
  els.explainBtn?.addEventListener('click', () => { askExplanation(); });

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
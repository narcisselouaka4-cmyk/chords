// [Claude] — 2026-09-05 — Pédagogie IA : contrôleur d'écran.
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

import { listTracks, loadMetadata, getOriginalPath } from '../recorder/studio-storage.js';
import { importToLibrary } from './media-library.js';
import { formatMediaDuration } from './media-format.js';
import { buildVideoAnalysis, buildAudioOnlyAnalysis } from '../pedagogie/video-analysis.js';
import { explainUnrecognised } from '../pedagogie/format-detector.js';
import { crossCheck, DIVERGENCE } from '../pedagogie/cross-check.js';
import { normalizeAnalyzerChords } from '../pedagogie/audio-fallback.js';
import { normalizeTranscription, alignNarration, joinNarrationText } from '../pedagogie/transcription.js';
import { explainNarration } from '../ai/ai-client.js';
import { getAIConfig } from '../ai/openai-config.js';

const els = {};
let tracks = [];
let selectedTrackId = null;
let selectedTrackName = null;
let busy = false;
let analysis = null;
let comparison = null;
// Passages parlés déjà rapprochés des accords (voir transcription.js).
let narrationView = [];
let detectedKey = null;
// Approfondissement IA : facultatif, jamais le comportement par défaut.
let explanation = null;
let explaining = false;

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

// ---------------------------------------------------------------------------
// Bibliothèque
// ---------------------------------------------------------------------------

async function refreshTrackList() {
  if (!els.trackList) return;
  els.trackList.innerHTML = '';
  try {
    const entries = await listTracks();
    tracks = [];
    for (const entry of entries) {
      const metadata = await loadMetadata(entry.id).catch(() => null);
      if (!metadata) continue;
      tracks.push({ id: entry.id, name: metadata.name || entry.id, metadata });
    }
  } catch (err) {
    console.warn('[Pedagogie] listTracks a échoué :', err);
    tracks = [];
  }

  if (tracks.length === 0) {
    els.trackList.appendChild(el('p', {
      className: 'pedagogie-empty',
      text: 'Aucune vidéo importée. Importez un tutoriel pour commencer.',
    }));
    return;
  }

  for (const track of tracks) {
    els.trackList.appendChild(el('button', {
      className: `pedagogie-track-item${track.id === selectedTrackId ? ' active' : ''}`,
      type: 'button',
      onClick: () => selectTrack(track.id),
    }, [
      el('span', { className: 'pedagogie-track-name', text: track.name }),
      el('span', {
        className: 'pedagogie-track-meta',
        text: track.metadata.duration
          ? formatMediaDuration(track.metadata.duration)
          : (track.metadata.format || ''),
      }),
    ]));
  }
}

function selectTrack(trackId) {
  if (busy) return;
  selectedTrackId = trackId;
  selectedTrackName = tracks.find((t) => t.id === trackId)?.name || trackId;
  analysis = null;
  comparison = null;
  resetNarration();
  setStatus('');
  render();
  refreshTrackList();
}

async function importVideo() {
  const api = window.electronAPI;
  if (!api?.studio?.selectVideoFile) {
    setStatus('L\'import de vidéo n\'est pas disponible.', 'error');
    return;
  }
  const picked = await api.studio.selectVideoFile();
  const filePath = typeof picked === 'string' ? picked : picked?.filePath || picked?.path;
  if (!filePath) return;
  setStatus('Import en cours…', 'busy');
  try {
    const result = await importToLibrary(filePath);
    await refreshTrackList();
    selectTrack(result.id);
    setStatus(result.isReimport ? 'Vidéo déjà présente : entrée réutilisée.' : 'Vidéo importée.', 'ok');
  } catch (err) {
    setStatus(`Import impossible : ${err.message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

async function analyzeSelected() {
  if (busy || !selectedTrackId) return;
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
    const originalPath = await getOriginalPath(selectedTrackId);

    // La parole ne dépend pas de ce que l'image donne : les deux lectures
    // partent ensemble, et l'on n'attend la transcription qu'au moment
    // d'assembler le résultat.
    const transcriptionPromise = runTranscription(originalPath);

    const result = await api.pedagogie.analyzeVideo(originalPath, { sampleFps: 4 });

    if (!result?.ok) {
      setStatus(result?.message || 'La vidéo n\'a pas pu être lue.', 'error');
      return;
    }

    if (!result.implemented) {
      // L'image n'a rien donné : on le dit, puis on tente le son.
      setProgress('L\'image n\'a rien donné — analyse du son…');
      const audioSegments = await runAudioFallback(originalPath);
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

    // Recoupement : le son est une seconde lecture indépendante de la même
    // vidéo. Un désaccord est consigné, jamais arbitré.
    setProgress('Recoupement avec le son…');
    const audio = await runAudioFallback(originalPath).catch(() => null);
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

/** Une clé IA personnelle est-elle configurée ? Même contrôle que masterclass-panel.js. */
function hasAIKey() {
  try {
    const cfg = getAIConfig();
    return Boolean(cfg && cfg.apiKey);
  } catch (_) {
    return false;
  }
}

/**
 * Approfondissement facultatif : reformule ce que le professeur a dit, à la
 * lumière des accords relevés. La transcription brute reste affichée au-dessus,
 * inchangée — c'est elle la source, l'IA n'est qu'une relecture.
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
  if (els.selectedName) {
    els.selectedName.textContent = selectedTrackName || 'Aucun tutoriel sélectionné';
  }
  if (els.analyzeBtn) {
    els.analyzeBtn.disabled = busy || !selectedTrackId;
    els.analyzeBtn.textContent = analysis ? 'Relire ce tutoriel' : 'Lire ce tutoriel';
  }
  if (els.importBtn) els.importBtn.disabled = busy;

  renderFormat();
  renderResult();
  renderNarration();
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

  // Grille.
  els.grid.innerHTML = '';
  for (const seg of analysis.segments) {
    const chip = el('div', {
      className: `pedagogie-chip${seg.chord.thirdMissing ? ' is-partial' : ''}`
        + `${seg.chord.resolved ? '' : ' is-unresolved'}`,
      title: seg.chord.note || (seg.chord.noteNames.length
        ? `Notes lues : ${seg.chord.noteNames.join(' ')}`
        : ''),
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

  // Ce qui n'est pas garanti.
  els.notes.innerHTML = '';
  const notes = analysis.notes || [];
  if (notes.length === 0) {
    els.notes.appendChild(el('li', { text: 'Rien à signaler sur ce relevé.' }));
  }
  for (const note of notes) {
    els.notes.appendChild(el('li', { text: note.text }));
  }
}

/**
 * Ce que dit le professeur.
 *
 * Trois choses, dans cet ordre : ce qui manque et POURQUOI, le texte transcrit
 * posé à côté de l'accord joué au même moment, puis — seulement si une clé IA
 * est configurée — le bouton d'approfondissement.
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

  els.transcript.innerHTML = '';
  for (const line of narrationView) {
    els.transcript.appendChild(el('div', { className: 'pedagogie-line' }, [
      el('span', { className: 'pedagogie-line-time', text: formatTime(line.start) }),
      el('span', { className: 'pedagogie-line-text', text: line.text }),
      line.chord
        ? el('span', {
          className: `pedagogie-line-chord${line.nearest ? ' is-nearest' : ''}`,
          text: line.chord,
          title: line.nearest
            ? 'Accord le plus proche : rien n\'était joué pendant cette phrase.'
            : 'Accord joué pendant cette phrase.',
        })
        : null,
    ]));
  }

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
  els.selectedName = document.getElementById('pedagogie-selected-name');
  els.analyzeBtn = document.getElementById('pedagogie-analyze-btn');
  els.progress = document.getElementById('pedagogie-progress');
  els.status = document.getElementById('pedagogie-status');
  els.format = document.getElementById('pedagogie-format');
  els.result = document.getElementById('pedagogie-result');
  els.grid = document.getElementById('pedagogie-grid');
  els.crosscheckCard = document.getElementById('pedagogie-crosscheck-card');
  els.crosscheck = document.getElementById('pedagogie-crosscheck');
  els.glossary = document.getElementById('pedagogie-glossary');
  els.notes = document.getElementById('pedagogie-notes');
  els.narrationCard = document.getElementById('pedagogie-narration-card');
  els.narrationState = document.getElementById('pedagogie-narration-state');
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
}

export { explainUnrecognised };

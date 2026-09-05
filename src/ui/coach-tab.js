// [Claude] — 2026-09-05 — Coach d'accompagnement au chant : contrôleur d'écran.
//
// Déroulé, tel que Narcisse l'a décrit et qui n'est pas renégociable ici :
//   1. choisir le morceau parmi ceux déjà importés dans Studio ;
//   2. annoncer le style AVANT de jouer ;
//   3. compte à rebours 3-2-1, puis lecture du stem vocal SEUL ;
//   4. il joue au clavier MIDI par-dessus — rien n'est jugé en direct ;
//   5. rapport en trois parties : ce qui va bien / ce qui bloque / ce qui
//      gagnerait à être allégé ou enlevé.
//
// Ce module ne décide RIEN de musical : il orchestre l'audio, la capture MIDI
// et l'affichage. Toute la mesure vit dans src/coach/*, qui est pur et testé.
//
// Contraintes audio du projet respectées ici :
//   - un seul AudioContext pour cet écran, créé sur geste utilisateur ;
//   - lecture par AudioBufferSourceNode après decodeAudioData, jamais par un
//     élément <audio> ;
//   - le fichier est lu via l'IPC files:read-binary — la CSP d'Electron bloque
//     fetch(blob:) en connect-src ;
//   - enregistrement auprès du gestionnaire de focus audio global, pour ne pas
//     jouer en même temps que Studio ou Analyse.

import { listTracks, loadMetadata, getStemPath, stemExists } from '../recorder/studio-storage.js';
import { separateStems } from '../audio/stem-separator.js';
import { globalAudioFocusManager } from '../audio/audio-focus-manager.js';
import { createMidiCapture } from '../melody/midi-capture.js';
import { createMelodyTrack } from '../melody/melody-track.js';
import { subscribeToLiveMidi } from '../melody/live-midi-bus.js';
import {
  computeEnergyEnvelope,
  detectVocalPhrases,
  assessVocalStem,
  DEFAULT_PHRASE_OPTIONS,
} from '../coach/vocal-activity.js';
import { alignPianoNotes, analyzeAccompaniment } from '../coach/accompaniment-metrics.js';
import { buildCoachReport, formatTime, formatPercent } from '../coach/coach-report.js';
import {
  estimateOutputLatency,
  createTapCalibration,
  contextTimeToPerformanceMs,
} from '../coach/latency-probe.js';

const FOCUS_ID = 'coach';
const CAPTURE_SOURCE_ID = 'coach-live';

/**
 * Styles proposés. Même vocabulaire que la Réharmonisation : le style est
 * annoncé avant de jouer et rejoint le rapport, mais il n'est PAS jugé — la
 * conformité au style (couche 4) est un chantier séparé et postérieur.
 */
const STYLES = [
  { id: 'worship', label: 'Worship' },
  { id: 'gospel', label: 'Gospel' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'neo-soul', label: 'Neo Soul' },
];

const els = {};
let audioCtx = null;
let tracks = [];
let selectedTrackId = null;
let selectedTrackName = null;
let selectedStyle = 'gospel';
let vocalBuffer = null;      // AudioBuffer du stem vocal
let vocalStemPath = null;
let vocalMonoSamples = null; // Float32Array mono, pour l'enveloppe d'énergie
let sourceNode = null;
let playing = false;
let sessionState = 'idle';   // idle | preparing | countdown | running | analyzing | report
let capture = null;
let unsubscribeMidi = null;
let captureOriginSec = 0;
let sessionStartCtxTime = 0;
let timerInterval = null;
let lastAnalysis = null;
let lastReport = null;
let lastMelodyTrack = null;
let replayNode = null;
let calibration = null;      // résultat de la mesure de latence, si elle a tourné
let latencyEstimate = null;  // estimation automatique, en attendant la mesure
let minGapSec = DEFAULT_PHRASE_OPTIONS.minGapSec;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    latencyEstimate = estimateOutputLatency(audioCtx);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/**
 * Lit un fichier audio et le décode en AudioBuffer.
 *
 * Passe impérativement par l'IPC : la Content Security Policy d'Electron bloque
 * fetch(blob:) en connect-src, piège déjà rencontré et documenté sur ce projet.
 */
async function decodeFile(path) {
  const files = window.electronAPI?.files;
  if (!files?.readBinary) throw new Error('Lecture de fichier non disponible');
  const bytes = await files.readBinary(path);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return await ensureAudioContext().decodeAudioData(arrayBuffer);
}

/** Réduit un AudioBuffer en un seul canal, pour l'analyse d'énergie. */
function toMono(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
  return mono;
}

function setStatus(message, tone = 'info') {
  if (!els.status) return;
  els.status.textContent = message || '';
  els.status.dataset.tone = tone;
  els.status.style.display = message ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Bibliothèque de morceaux
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
      const hasVocals = await stemExists(entry.id, 'vocals').catch(() => false);
      tracks.push({ id: entry.id, name: metadata.name || entry.id, metadata, hasVocals });
    }
  } catch (err) {
    console.warn('[Coach] listTracks a échoué :', err);
    tracks = [];
  }

  if (tracks.length === 0) {
    els.trackList.appendChild(el('p', {
      className: 'coach-empty',
      text: 'Aucun morceau importé. Importez-en un depuis l\'onglet Studio pour commencer.',
    }));
    return;
  }

  for (const track of tracks) {
    const item = el('button', {
      className: `coach-track-item${track.id === selectedTrackId ? ' active' : ''}`,
      type: 'button',
      onClick: () => selectTrack(track.id),
    }, [
      el('span', { className: 'coach-track-name', text: track.name }),
      el('span', {
        className: `coach-track-badge${track.hasVocals ? ' ready' : ''}`,
        text: track.hasVocals ? 'voix prête' : 'à séparer',
      }),
    ]);
    els.trackList.appendChild(item);
  }
}

async function selectTrack(trackId) {
  if (sessionState === 'running' || sessionState === 'countdown') return;
  selectedTrackId = trackId;
  const track = tracks.find((t) => t.id === trackId);
  selectedTrackName = track?.name || trackId;
  vocalBuffer = null;
  vocalMonoSamples = null;
  vocalStemPath = null;
  lastAnalysis = null;
  lastReport = null;
  renderReport();
  await refreshTrackList();
  renderSetup();
  setStatus('');
}

// ---------------------------------------------------------------------------
// Préparation du stem vocal
// ---------------------------------------------------------------------------

/**
 * Garantit qu'un stem vocal exploitable est chargé pour le morceau choisi.
 * Lance la séparation Demucs si nécessaire.
 *
 * @returns {Promise<boolean>} false si l'écran doit refuser de continuer
 */
async function ensureVocalStem() {
  if (!selectedTrackId) return false;
  if (vocalBuffer && vocalMonoSamples) return true;

  const exists = await stemExists(selectedTrackId, 'vocals').catch(() => false);
  if (!exists) {
    const metadata = tracks.find((t) => t.id === selectedTrackId)?.metadata;
    const originalPath = metadata?.originalPath;
    if (!originalPath) {
      setStatus('Fichier original introuvable pour ce morceau.', 'error');
      return false;
    }
    setStatus('Séparation des pistes en cours — la voix doit être isolée avant de jouer…', 'busy');
    try {
      await separateStems(selectedTrackId, originalPath, (percent) => {
        setStatus(`Séparation des pistes… ${Math.round(percent)} %`, 'busy');
      });
    } catch (err) {
      setStatus(`La séparation a échoué : ${err.message}`, 'error');
      return false;
    }
  }

  vocalStemPath = await getStemPath(selectedTrackId, 'vocals');
  setStatus('Chargement de la voix…', 'busy');
  try {
    vocalBuffer = await decodeFile(vocalStemPath);
  } catch (err) {
    setStatus(`Impossible de charger la voix : ${err.message}`, 'error');
    return false;
  }
  vocalMonoSamples = toMono(vocalBuffer);

  // Refus explicite AVANT de faire jouer quoi que ce soit : mieux vaut le dire
  // maintenant que produire un rapport silencieusement faux après coup.
  const envelope = computeEnergyEnvelope(vocalMonoSamples, vocalBuffer.sampleRate);
  const segmentation = detectVocalPhrases(envelope, { minGapSec });
  const verdict = assessVocalStem(segmentation);
  if (!verdict.usable) {
    setStatus(verdict.message, 'error');
    vocalBuffer = null;
    vocalMonoSamples = null;
    return false;
  }

  setStatus(`Voix prête : ${segmentation.phrases.length} phrases chantées détectées sur `
    + `${formatTime(segmentation.duration)}.`, 'ok');
  await refreshTrackList();
  return true;
}

// ---------------------------------------------------------------------------
// Séance : compte à rebours, lecture, capture
// ---------------------------------------------------------------------------

function stopPlayback() {
  if (sourceNode) {
    try { sourceNode.onended = null; sourceNode.stop(); } catch (_) { /* déjà arrêté */ }
    sourceNode = null;
  }
  playing = false;
}

async function startSession() {
  if (sessionState !== 'idle' && sessionState !== 'report') return;
  if (!selectedTrackId) {
    setStatus('Choisissez d\'abord un morceau.', 'error');
    return;
  }

  ensureAudioContext();
  globalAudioFocusManager.requestFocus(FOCUS_ID);

  sessionState = 'preparing';
  renderSetup();
  const ready = await ensureVocalStem();
  if (!ready) {
    sessionState = 'idle';
    renderSetup();
    return;
  }

  // Compte à rebours 3-2-1, comme demandé. Rien n'est capturé pendant.
  sessionState = 'countdown';
  renderSetup();
  for (const n of [3, 2, 1]) {
    if (els.countdown) {
      els.countdown.textContent = String(n);
      els.countdown.style.display = 'flex';
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (sessionState !== 'countdown') return; // annulé entre-temps
  }
  if (els.countdown) els.countdown.style.display = 'none';

  beginCapture();
}

function beginCapture() {
  const ctx = ensureAudioContext();

  capture = createMidiCapture({ getTime: () => performance.now() });
  unsubscribeMidi = subscribeToLiveMidi({
    noteOn: (note, velocity, channel) => capture?.noteOn(note, velocity, channel, CAPTURE_SOURCE_ID),
    noteOff: (note, channel) => capture?.noteOff(note, 0, channel, CAPTURE_SOURCE_ID),
    sustain: (value, channel) => capture?.sustain(value, channel, CAPTURE_SOURCE_ID),
  });

  // Le stem démarre à un instant CONNU de l'horloge AudioContext ; on convertit
  // cet instant dans la base performance.now() pour pouvoir y rapporter les
  // horodatages MIDI. C'est ce couple qui rend l'alignement exact plutôt
  // qu'approximatif.
  const startAt = ctx.currentTime + 0.12;
  sessionStartCtxTime = startAt;
  const startPerfMs = contextTimeToPerformanceMs(ctx, startAt)
    ?? (performance.now() + 0.12 * 1000);
  captureOriginSec = startPerfMs / 1000;

  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = vocalBuffer;
  sourceNode.connect(ctx.destination);
  sourceNode.onended = () => {
    if (sessionState === 'running') finishSession();
  };
  sourceNode.start(startAt);
  playing = true;

  sessionState = 'running';
  renderSetup();

  timerInterval = setInterval(() => {
    if (!els.timer || sessionState !== 'running') return;
    const elapsed = Math.max(0, audioCtx.currentTime - sessionStartCtxTime);
    els.timer.textContent = `${formatTime(elapsed)} / ${formatTime(vocalBuffer.duration)}`;
  }, 200);
}

async function finishSession() {
  if (sessionState !== 'running') return;
  sessionState = 'analyzing';
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  stopPlayback();
  unsubscribeMidi?.();
  unsubscribeMidi = null;

  capture?.finalize('session-stop');
  const notes = capture?.getNotes() || [];
  renderSetup();
  setStatus('Analyse de la séance…', 'busy');

  // Séance conservée sous forme de MelodyTrack canonique (EXP-030) : c'est le
  // pont déjà construit entre une capture MIDI et une structure exploitable,
  // et c'est ce qui rend « écoutez la phrase 4 » actionnable.
  lastMelodyTrack = notes.length > 0
    ? createMelodyTrack(
      { notes, sourceCaptureId: CAPTURE_SOURCE_ID },
      { name: `Accompagnement — ${selectedTrackName}`, harmonizationPolicy: 'automatic' },
    )
    : null;

  const envelope = computeEnergyEnvelope(vocalMonoSamples, vocalBuffer.sampleRate);
  const segmentation = detectVocalPhrases(envelope, { minGapSec });

  // Correction de latence : la mesure réelle si elle a tourné, sinon
  // l'estimation automatique. Le rapport dit laquelle a été utilisée.
  const offsetSec = calibration?.status === 'ok'
    ? calibration.correctionSec
    : (latencyEstimate?.correctionSec ?? 0);

  const pianoNotes = alignPianoNotes(notes, { captureOriginSec, stemOriginSec: 0, offsetSec });

  // Couche 2 : suivi de hauteur de la voix. Facultatif et faillible — s'il
  // échoue, la couche 1 reste entièrement valable et le rapport le dit.
  let vocalNotes = null;
  try {
    const api = window.electronAPI?.reharm;
    if (api?.extractMelody && vocalStemPath) {
      const extracted = await api.extractMelody(vocalStemPath, {});
      if (extracted?.notes?.length) {
        vocalNotes = extracted.notes.map((n) => ({
          midi: n.midi, start: n.start, end: n.end, confidence: n.confidence,
        }));
      }
    }
  } catch (err) {
    console.warn('[Coach] extraction de la mélodie vocale indisponible :', err);
  }

  lastAnalysis = analyzeAccompaniment({
    segmentation,
    pianoNotes,
    vocalNotes,
    style: selectedStyle,
    offsetSec,
  });
  lastReport = buildCoachReport(lastAnalysis);

  sessionState = 'report';
  setStatus('');
  renderSetup();
  renderReport();
}

function cancelSession() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  stopPlayback();
  unsubscribeMidi?.();
  unsubscribeMidi = null;
  capture = null;
  sessionState = 'idle';
  if (els.countdown) els.countdown.style.display = 'none';
  setStatus('Séance interrompue. Rien n\'a été analysé.', 'info');
  renderSetup();
}

// ---------------------------------------------------------------------------
// Réécoute d'un passage commenté
// ---------------------------------------------------------------------------

function stopReplay() {
  if (replayNode) {
    try { replayNode.onended = null; replayNode.stop(); } catch (_) { /* déjà arrêté */ }
    replayNode = null;
  }
}

function replayRegion(start, end) {
  if (!vocalBuffer) return;
  const ctx = ensureAudioContext();
  globalAudioFocusManager.requestFocus(FOCUS_ID);
  stopReplay();
  const duration = Math.max(0.05, end - start);
  replayNode = ctx.createBufferSource();
  replayNode.buffer = vocalBuffer;
  replayNode.connect(ctx.destination);
  replayNode.onended = () => { replayNode = null; };
  replayNode.start(ctx.currentTime, Math.max(0, start), duration);
}

// ---------------------------------------------------------------------------
// Calibration de la latence
// ---------------------------------------------------------------------------

async function runLatencyCalibration() {
  const ctx = ensureAudioContext();
  globalAudioFocusManager.requestFocus(FOCUS_ID);

  const session = createTapCalibration({
    audioCtx: ctx,
    onTick: ({ tapCount, clickCount }) => {
      setStatus(`Calibration : ${tapCount}/${clickCount} frappes enregistrées…`, 'busy');
    },
  });

  const unsubscribe = subscribeToLiveMidi({
    noteOn: () => session.registerTap(performance.now()),
  });

  setStatus('Calibration : tapez une note sur chaque clic.', 'busy');
  session.start();

  await new Promise((resolve) => setTimeout(resolve, (session.durationSec + 0.6) * 1000));
  unsubscribe();

  calibration = session.finish();
  setStatus(calibration.message, calibration.status === 'ok' ? 'ok' : 'error');
  renderSetup();
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function renderSetup() {
  if (!els.styleRow) return;

  // Sélecteur de style — vocabulaire `.segmented` déjà stylé pour les deux
  // skins, réutilisé tel quel plutôt que réinventé.
  els.styleRow.innerHTML = '';
  const group = el('div', { className: 'segmented', role: 'group', 'aria-label': 'Style annoncé' });
  for (const style of STYLES) {
    group.appendChild(el('button', {
      type: 'button',
      text: style.label,
      'aria-pressed': String(style.id === selectedStyle),
      disabled: sessionState === 'running' || sessionState === 'countdown' ? '' : null,
      onClick: () => {
        selectedStyle = style.id;
        renderSetup();
      },
    }));
  }
  els.styleRow.appendChild(group);

  const busy = sessionState === 'running' || sessionState === 'countdown'
    || sessionState === 'preparing' || sessionState === 'analyzing';

  if (els.startBtn) {
    els.startBtn.disabled = busy || !selectedTrackId;
    els.startBtn.textContent = sessionState === 'report'
      ? 'Rejouer une séance'
      : 'Démarrer la séance';
  }
  if (els.stopBtn) {
    els.stopBtn.style.display = (sessionState === 'running') ? '' : 'none';
  }
  if (els.cancelBtn) {
    els.cancelBtn.style.display = (sessionState === 'countdown' || sessionState === 'preparing') ? '' : 'none';
  }
  if (els.calibrateBtn) els.calibrateBtn.disabled = busy;
  if (els.timer) {
    els.timer.style.display = (sessionState === 'running') ? '' : 'none';
  }
  if (els.selectedName) {
    els.selectedName.textContent = selectedTrackName || 'Aucun morceau sélectionné';
  }
  if (els.liveNotice) {
    els.liveNotice.style.display = sessionState === 'running' ? '' : 'none';
  }

  renderLatencyLine();
  renderPhraseSetting();
}

function renderLatencyLine() {
  if (!els.latencyLine) return;
  els.latencyLine.innerHTML = '';
  let text;
  let tone;
  if (calibration?.status === 'ok') {
    text = `Latence mesurée sur ce poste : ${Math.round(calibration.offsetMs)} ms `
      + `(±${Math.round(calibration.spreadMs)} ms, ${calibration.usedTaps} frappes). Appliquée au placement.`;
    tone = 'ok';
  } else if (latencyEstimate) {
    text = `Latence estimée depuis la sortie audio : ${Math.round(latencyEstimate.totalSec * 1000)} ms. `
      + 'Cette estimation ne couvre ni l\'entrée MIDI ni votre propre décalage — '
      + 'lancez la calibration pour une vraie mesure.';
    tone = 'warn';
  } else {
    text = 'Latence non estimée : l\'audio n\'a pas encore été ouvert.';
    tone = 'warn';
  }
  els.latencyLine.appendChild(el('span', { className: `coach-latency ${tone}`, text }));
}

function renderPhraseSetting() {
  if (!els.phraseSetting) return;
  els.phraseSetting.innerHTML = '';
  els.phraseSetting.appendChild(el('label', {
    className: 'coach-setting-label',
    for: 'coach-min-gap',
    text: 'Durée minimale d\'une respiration',
  }));
  const input = el('input', {
    type: 'range',
    id: 'coach-min-gap',
    min: '0.15',
    max: '1.2',
    step: '0.05',
    value: String(minGapSec),
    onInput: (e) => {
      minGapSec = Number(e.target.value);
      if (els.phraseValue) els.phraseValue.textContent = `${minGapSec.toFixed(2).replace('.', ',')} s`;
    },
    onChange: () => {
      // Le découpage change : un rapport déjà affiché ne correspondrait plus.
      if (lastAnalysis) setStatus('Le découpage a changé : relancez une séance pour un rapport à jour.', 'info');
    },
  });
  els.phraseSetting.appendChild(input);
  els.phraseValue = el('span', {
    className: 'coach-setting-value',
    text: `${minGapSec.toFixed(2).replace('.', ',')} s`,
  });
  els.phraseSetting.appendChild(els.phraseValue);
  els.phraseSetting.appendChild(el('p', {
    className: 'coach-setting-hint',
    text: 'En dessous de cette durée, un silence est considéré comme une articulation entre '
      + 'deux mots ; au-dessus, comme une respiration où le piano a sa place.',
  }));
}

function renderFinding(f) {
  const node = el('li', { className: 'coach-finding' }, [
    el('span', { className: 'coach-finding-text', text: f.text }),
  ]);
  if (f.confidence === 'low') {
    node.appendChild(el('span', {
      className: 'coach-finding-flag',
      text: f.confidenceNote || 'Mesure peu fiable — à lire comme une tendance.',
    }));
  }
  return node;
}

function renderSection(title, findings, modifier) {
  return el('section', { className: `coach-card ${modifier}` }, [
    el('h4', { className: 'coach-card-title', text: title }),
    el('ul', { className: 'coach-finding-list' }, findings.map(renderFinding)),
  ]);
}

function renderReport() {
  if (!els.report) return;
  els.report.innerHTML = '';
  if (!lastReport) {
    els.report.style.display = 'none';
    return;
  }
  els.report.style.display = '';

  els.report.appendChild(el('div', { className: 'coach-report-head' }, [
    el('h3', { className: 'coach-report-title', text: 'Ce que montre la séance' }),
    el('p', {
      className: 'coach-report-sub',
      text: `${selectedTrackName} · style annoncé : `
        + `${STYLES.find((s) => s.id === lastAnalysis.style)?.label || '—'} · `
        + `${lastAnalysis.segmentation.phraseCount} phrases chantées`,
    }),
  ]));

  els.report.appendChild(el('div', { className: 'coach-cards' }, [
    renderSection('Ce qui va bien', lastReport.strengths, 'is-good'),
    renderSection('Ce qui bloque', lastReport.blockers, 'is-blocker'),
    renderSection('Ce qui gagnerait à être allégé', lastReport.toLighten, 'is-lighten'),
  ]));

  // Réécoute — c'est ce qui rend le rapport actionnable plutôt que déclaratif.
  if (lastReport.replay.length > 0) {
    const list = el('div', { className: 'coach-replay-list' });
    for (const item of lastReport.replay) {
      list.appendChild(el('button', {
        className: 'coach-replay-btn',
        type: 'button',
        title: item.reason,
        onClick: () => replayRegion(item.start, item.end),
      }, [
        el('span', { className: 'coach-replay-label', text: item.label }),
        el('span', { className: 'coach-replay-time', text: formatTime(item.start) }),
      ]));
    }
    els.report.appendChild(el('section', { className: 'coach-card is-replay' }, [
      el('h4', { className: 'coach-card-title', text: 'Réécouter les passages cités' }),
      list,
    ]));
  }

  // Chiffres nus, sans commentaire de valeur — précisément parce qu'aucun seuil
  // ne permet encore de les qualifier.
  els.report.appendChild(el('section', { className: 'coach-card is-facts' }, [
    el('h4', { className: 'coach-card-title', text: 'Les chiffres, sans interprétation' }),
    el('ul', { className: 'coach-finding-list' }, lastReport.facts.map(renderFinding)),
  ]));

  els.report.appendChild(el('section', { className: 'coach-card is-calibration' }, [
    el('h4', { className: 'coach-card-title', text: lastReport.calibration.title }),
    el('p', { className: 'coach-calibration-text', text: lastReport.calibration.text }),
    el('p', {
      className: 'coach-calibration-text',
      text: `Correction de latence appliquée : ${Math.round((lastAnalysis.offsetSec || 0) * 1000)} ms `
        + `(${calibration?.status === 'ok' ? 'mesurée sur ce poste' : 'estimée depuis la sortie audio'}).`,
    }),
  ]));
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Initialise l'écran Coach d'accompagnement. Appelé une fois par main.js.
 */
export function initCoachTab() {
  els.root = document.getElementById('practice-view-coach');
  if (!els.root) return;

  els.trackList = document.getElementById('coach-track-list');
  els.selectedName = document.getElementById('coach-selected-name');
  els.styleRow = document.getElementById('coach-style-row');
  els.startBtn = document.getElementById('coach-start-btn');
  els.stopBtn = document.getElementById('coach-stop-btn');
  els.cancelBtn = document.getElementById('coach-cancel-btn');
  els.calibrateBtn = document.getElementById('coach-calibrate-btn');
  els.countdown = document.getElementById('coach-countdown');
  els.timer = document.getElementById('coach-timer');
  els.status = document.getElementById('coach-status');
  els.report = document.getElementById('coach-report');
  els.latencyLine = document.getElementById('coach-latency-line');
  els.phraseSetting = document.getElementById('coach-phrase-setting');
  els.liveNotice = document.getElementById('coach-live-notice');

  els.startBtn?.addEventListener('click', () => { startSession(); });
  els.stopBtn?.addEventListener('click', () => { finishSession(); });
  els.cancelBtn?.addEventListener('click', () => { cancelSession(); });
  els.calibrateBtn?.addEventListener('click', () => { runLatencyCalibration(); });

  // Arbitrage de sortie audio : le Coach ne doit pas jouer en même temps que
  // Studio ou Analyse. Aucun transport n'est fusionné, seule la sortie l'est.
  globalAudioFocusManager.register(FOCUS_ID, {
    play: () => {},
    pause: () => {
      if (sessionState === 'running') cancelSession();
      stopReplay();
    },
    isPlaying: () => playing || replayNode !== null,
  });

  document.addEventListener('app-switch-training-view', (e) => {
    if (e.detail?.view === 'coach') {
      refreshTrackList();
      renderSetup();
    } else if (sessionState === 'running' || sessionState === 'countdown') {
      // Quitter l'écran en pleine séance annule la séance plutôt que de la
      // laisser tourner sans que rien ne l'indique.
      cancelSession();
    }
  });

  renderSetup();
  renderReport();
}

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
  restrictToWindow,
  DEFAULT_PHRASE_OPTIONS,
} from '../coach/vocal-activity.js';
import { alignPianoNotes, analyzeAccompaniment } from '../coach/accompaniment-metrics.js';
import { buildCoachReport, formatTime } from '../coach/coach-report.js';
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
let replayNodes = [];
let calibration = null;      // résultat de la mesure de latence, si elle a tourné
let latencyEstimate = null;  // estimation automatique, en attendant la mesure
let minGapSec = DEFAULT_PHRASE_OPTIONS.minGapSec;

// Région de travail (retour 1 de Narcisse) : `null` = toute la piste. Les deux
// champs texte mm:ss sont la seule source de vérité affichée ; ces variables
// gardent les dernières valeurs VALIDES pour y revenir silencieusement si
// l'utilisateur tape quelque chose d'invalide.
let regionStartSec = null;
let regionEndSec = null;

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
// Région de travail (retour 1 : travailler un passage, pas tout le morceau)
// ---------------------------------------------------------------------------

/** Analyse « m:ss » (ou « ss ») ; renvoie null si ce n'est pas un temps valide. */
function parseTimeInput(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return null;
}

/** Formate des secondes en m:ss pour les champs de région. */
function secondsToMinutes(seconds) {
  return formatTime(seconds);
}

/**
 * Valide un couple de bornes contre le morceau chargé.
 * Renvoie {start, end} clampés, ou null si inutilisable (fin ≤ début).
 */
function validateRegion(startText, endText, trackDurationSec) {
  const start = parseTimeInput(startText);
  const end = parseTimeInput(endText);
  if (start === null || end === null) return null;
  const duration = Number.isFinite(trackDurationSec) ? trackDurationSec : 0;
  const safeStart = Math.max(0, Math.min(start, duration));
  const safeEnd = Math.max(0, Math.min(end, duration));
  if (safeEnd <= safeStart) return null;
  return { start: safeStart, end: safeEnd };
}

/** Renvoie la durée du stem vocal chargé, ou null s'il n'est pas encore là. */
function vocalDuration() {
  return vocalBuffer ? vocalBuffer.duration : null;
}

/**
 * Bornes réellement utilisées par la séance, selon qu'une région est active.
 * `null` = piste entière (0 → fin du stem). Une région qui couvre déjà toute
 * la piste est traitée comme « toute la piste » : même comportement, et le
 * rapport ne parle pas d'un « passage ».
 */
function activeRegion() {
  if (regionStartSec === null || regionEndSec === null) return null;
  const duration = vocalDuration();
  if (duration && regionStartSec <= 0.05 && regionEndSec >= duration - 0.05) return null;
  return { start: regionStartSec, end: regionEndSec };
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
      title: track.hasVocals
        ? null
        : 'La voix doit d\'abord être isolée du reste du morceau — ça se fait '
          + 'automatiquement quand vous démarrez la séance, et ça prend un peu de temps.',
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
  // La région de l'ancien morceau n'a plus de sens : retour à toute la piste.
  regionStartSec = null;
  regionEndSec = null;
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
      setStatus('Fichier original introuvable pour ce morceau : l\'application ne peut '
        + 'pas en isoler la voix. Réimportez le morceau depuis l\'onglet Studio.', 'error');
      return false;
    }
    setStatus('Isolation de la voix en cours — l\'application sépare le chant du reste du '
      + 'morceau, pour que vous n\'entendiez que la voix pendant la séance. Ça peut prendre '
      + 'quelques minutes, mais une seule fois par morceau.', 'busy');
    try {
      await separateStems(selectedTrackId, originalPath, (percent) => {
        setStatus(`Isolation de la voix… ${Math.round(percent)} %`, 'busy');
      });
    } catch (err) {
      setStatus(`L'isolation de la voix a échoué : ${err.message}. Relancez la séance pour `
        + `réessayer ; si ça échoue encore, réimportez le morceau depuis l'onglet Studio.`, 'error');
      return false;
    }
  }

  vocalStemPath = await getStemPath(selectedTrackId, 'vocals');
  setStatus('Chargement de la voix…', 'busy');
  try {
    vocalBuffer = await decodeFile(vocalStemPath);
  } catch (err) {
    setStatus(`La voix n'a pas pu être lue (${err.message}). Réimportez le morceau `
      + `depuis l'onglet Studio si le problème persiste.`, 'error');
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
    + `${formatTime(segmentation.duration)}. Vous pouvez lancer la séance.`, 'ok');
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
  const region = activeRegion();
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
  // Avec une région : lecture bornée (offset + durée) — le stem s'arrête de
  // lui-même à la fin du passage. Sans région : comportement inchangé,
  // lecture de toute la piste.
  if (region) {
    sourceNode.start(startAt, region.start, region.end - region.start);
  } else {
    sourceNode.start(startAt);
  }
  playing = true;

  sessionState = 'running';
  renderSetup();

  const totalSec = region ? region.end - region.start : vocalBuffer.duration;
  timerInterval = setInterval(() => {
    if (!els.timer || sessionState !== 'running') return;
    const elapsed = Math.max(0, Math.min(totalSec, audioCtx.currentTime - sessionStartCtxTime));
    els.timer.textContent = `${formatTime(elapsed)} / ${formatTime(totalSec)}`;
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

  const region = activeRegion();
  const regionStart = region ? region.start : 0;

  const envelope = computeEnergyEnvelope(vocalMonoSamples, vocalBuffer.sampleRate);
  const fullSegmentation = detectVocalPhrases(envelope, { minGapSec });
  // Restriction à la fenêtre travaillée : les temps restent ABSOLUS dans le
  // morceau, donc la réécoute (branchée sur le stem complet) n'a rien à
  // convertir. Sans région, restrictToWindow sur toute la piste est un
  // passage identique — un seul code chemin, pas de mode hybride.
  const segmentation = region
    ? restrictToWindow(fullSegmentation, region.start, region.end)
    : fullSegmentation;

  // Correction de latence : la mesure réelle si elle a tourné, sinon
  // l'estimation automatique. Le rapport dit laquelle a été utilisée.
  const offsetSec = calibration?.status === 'ok'
    ? calibration.correctionSec
    : (latencyEstimate?.correctionSec ?? 0);

  // La lecture a démarré à regionStart dans le stem : stemOriginSec replace
  // les notes MIDI sur l'axe absolu du morceau (cf. alignPianoNotes).
  const pianoNotes = alignPianoNotes(notes, {
    captureOriginSec,
    stemOriginSec: regionStart,
    offsetSec,
  });

  // Séance conservée sous forme de MelodyTrack canonique (EXP-030) : c'est le
  // pont déjà construit entre une capture MIDI et une structure exploitable.
  // On lui donne pour origine l'instant de départ du stem CORRIGÉ de la
  // latence et replacé dans l'axe du morceau, si bien que les temps de ses
  // événements sont directement ceux du stem : la même piste sert de trace
  // de la séance ET de source pour la réécoute, sans seconde conversion qui
  // pourrait diverger.
  lastMelodyTrack = notes.length > 0
    ? createMelodyTrack(
      {
        notes,
        sourceCaptureId: CAPTURE_SOURCE_ID,
        startedAt: captureOriginSec - offsetSec - regionStart,
      },
      { name: `Accompagnement — ${selectedTrackName}`, harmonizationPolicy: 'automatic' },
    )
    : null;

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
  setStatus('Séance interrompue : rien n\'a été analysé. Relancez quand vous voulez.', 'info');
  renderSetup();
}

// ---------------------------------------------------------------------------
// Réécoute d'un passage commenté
// ---------------------------------------------------------------------------

function stopReplay() {
  for (const node of replayNodes) {
    try { node.onended = null; node.stop(); } catch (_) { /* déjà arrêté */ }
  }
  replayNodes = [];
}

/**
 * Voix de piano de réécoute, planifiée à l'échantillon près.
 *
 * Volontairement synthétisée dans l'AudioContext du Coach plutôt que confiée à
 * `simple-synth.js` : ce module possède son propre AudioContext et joue les
 * notes à l'instant de l'appel, sans planification. Les deux horloges
 * dériveraient, et la réécoute perdrait précisément ce qu'elle doit montrer —
 * si le piano tombe sous la voix ou dans la respiration. Ici, voix et piano
 * partent de la même horloge et restent calés.
 */
function schedulePianoNote(ctx, midi, when, duration, velocity) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), when);
  const peak = Math.max(0.02, Math.min(0.28, velocity * 0.28));
  const end = when + Math.max(0.08, duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(end + 0.02);
  replayNodes.push(osc);
}

/**
 * Rejoue une région : la voix ET ce qui a été joué par-dessus.
 *
 * Réécouter la voix seule ne dirait rien — c'est la superposition qui montre
 * si le piano a couvert la phrase ou habité la respiration. Les notes viennent
 * de la MelodyTrack de la séance, dont les temps sont déjà ceux du stem.
 */
function replayRegion(start, end) {
  if (!vocalBuffer) return;
  const ctx = ensureAudioContext();
  globalAudioFocusManager.requestFocus(FOCUS_ID);
  stopReplay();

  const from = Math.max(0, start);
  const duration = Math.max(0.05, end - from);
  const when = ctx.currentTime + 0.08;

  const voice = ctx.createBufferSource();
  voice.buffer = vocalBuffer;
  voice.connect(ctx.destination);
  voice.start(when, from, duration);
  replayNodes.push(voice);

  for (const event of lastMelodyTrack?.events || []) {
    if (event.endedAt <= from || event.startedAt >= from + duration) continue;
    const noteStart = when + Math.max(0, event.startedAt - from);
    const noteEnd = when + Math.min(duration, event.endedAt - from);
    schedulePianoNote(ctx, event.midi, noteStart, noteEnd - noteStart, event.velocity ?? 0.8);
  }
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

  setStatus('Calibration : tapez une note sur chaque clic entendu — le programme mesure '
    + 'ainsi le délai entre votre frappe et le son, pour placer votre jeu au bon endroit '
    + 'dans le rapport.', 'busy');
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
    // [Refonte Astra 12/09] — le bouton porte désormais une icône SVG : on
    // écrit dans son libellé, pas dans le bouton entier (textContent effacerait
    // l'icône au premier changement d'état).
    const startLabel = els.startBtn.querySelector('.coach-btn-label') || els.startBtn;
    startLabel.textContent = sessionState === 'report'
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
  renderRegionSetting();
}

function renderLatencyLine() {
  if (!els.latencyLine) return;
  els.latencyLine.innerHTML = '';
  let text;
  let tone;
  if (calibration?.status === 'ok') {
    text = `Le délai entre votre frappe et le son entendu a été mesuré sur ce poste : `
      + `${Math.round(calibration.offsetMs)} ms (±${Math.round(calibration.spreadMs)} ms, `
      + `${calibration.usedTaps} frappes). Il est déjà compensé dans l'analyse : vous `
      + `n'avez rien à faire.`;
    tone = 'ok';
  } else if (latencyEstimate) {
    text = `Le programme ne connaît pas encore précisément le petit délai entre le moment `
      + `où vous appuyez sur une touche et le son que vous entendez : une valeur `
      + `approximative (${Math.round(latencyEstimate.totalSec * 1000)} ms, mesurée sur la `
      + `sortie audio seule) est utilisée pour l'instant. Cliquez sur « Calibrer la latence » `
      + `pour l'affiner — c'est facultatif, mais ça rend le rapport plus précis.`;
    tone = 'warn';
  } else {
    text = 'Le délai entre votre clavier et le son entendu n\'est pas encore estimé : '
      + 'il sera mesuré à la première ouverture de l\'audio.';
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
      if (lastAnalysis) setStatus('Le découpage des respirations a changé : le rapport '
        + 'affiché ne correspond plus. Relancez une séance pour un rapport à jour.', 'info');
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
    text: 'Vous n\'avez normalement pas besoin d\'ajuster ce réglage : la valeur par '
      + 'défaut convient à la plupart des morceaux. Si vous voulez comprendre : en dessous '
      + 'de cette durée, un silence est considéré comme une articulation entre deux mots ; '
      + 'au-dessus, comme une respiration où le piano a sa place.',
  }));
}

// Contrôle de région : mêmes classes que le réglage de respiration, pour que
// les deux skins l'habillent sans nouveau CSS.
function renderRegionSetting() {
  if (!els.regionSetting) return;
  els.regionSetting.innerHTML = '';

  const duration = vocalDuration();
  const disabled = sessionState === 'running' || sessionState === 'countdown'
    || sessionState === 'preparing' || sessionState === 'analyzing';

  const startText = regionStartSec !== null && duration
    ? secondsToMinutes(regionStartSec)
    : (duration ? '0:00' : '—');
  const endText = regionEndSec !== null && duration
    ? secondsToMinutes(regionEndSec)
    : (duration ? secondsToMinutes(duration) : '—');

  els.regionSetting.appendChild(el('label', {
    className: 'coach-setting-label',
    text: 'Passage à travailler (début → fin)',
  }));

  const startInput = el('input', {
    type: 'text',
    id: 'coach-region-start',
    className: 'coach-region-input',
    value: startText,
    placeholder: '0:00',
    disabled: disabled || !duration ? '' : null,
    'aria-label': 'Début du passage, en mm:ss',
    inputMode: 'numeric',
    title: 'Instant où commence le passage travaillé, au format mm:ss (ex. 1:12).',
  });
  const endInput = el('input', {
    type: 'text',
    id: 'coach-region-end',
    className: 'coach-region-input',
    value: endText,
    placeholder: duration ? secondsToMinutes(duration) : 'mm:ss',
    disabled: disabled || !duration ? '' : null,
    'aria-label': 'Fin du passage, en mm:ss',
    inputMode: 'numeric',
    title: 'Instant où se termine le passage travaillé, au format mm:ss (ex. 1:48).',
  });

  // À la sortie d'un champ : valider silencieusement. Valeur invalide → on
  // revient aux dernières bornes valides sans message d'erreur bloquant.
  const commit = () => {
    if (!duration) return;
    const previous = activeRegion();
    const region = validateRegion(startInput.value, endInput.value, duration);
    if (region) {
      regionStartSec = region.start;
      regionEndSec = region.end;
      // Un rapport déjà affiché porterait sur une autre fenêtre : à refaire.
      if (lastAnalysis) {
        const changed = !previous
          || previous.start !== region.start
          || previous.end !== region.end;
        if (changed) {
          setStatus('Le passage a changé : relancez une séance pour un rapport à jour.', 'info');
        }
      }
    } else {
      setStatus('Valeur non valide : la fin doit être après le début, dans les '
        + 'bornes du morceau. Retour aux dernières valeurs valides.', 'info');
    }
    renderRegionSetting();
  };
  startInput.addEventListener('blur', commit);
  endInput.addEventListener('blur', commit);
  startInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startInput.blur(); });
  endInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') endInput.blur(); });

  els.regionSetting.appendChild(startInput);
  els.regionSetting.appendChild(el('span', { className: 'coach-setting-value', text: '→' }));
  els.regionSetting.appendChild(endInput);

  const resetBtn = el('button', {
    type: 'button',
    className: 'coach-secondary-btn coach-region-reset',
    text: 'Toute la piste',
    disabled: disabled || !duration ? '' : null,
    title: 'Travailler le morceau entier, du début à la fin.',
    onClick: () => {
      regionStartSec = null;
      regionEndSec = null;
      renderRegionSetting();
    },
  });
  els.regionSetting.appendChild(resetBtn);

  els.regionSetting.appendChild(el('p', {
    className: 'coach-setting-hint',
    text: 'Pour travailler un passage précis plutôt que tout le morceau, indiquez '
      + 'ses bornes en mm:ss (ex. 1:12 → 1:48) — c\'est ce passage qui sera joué et '
      + 'analysé. Laissez « Toute la piste » si vous n\'en avez pas besoin : ce '
      + 'réglage ne change ni la mesure, ni le rapport, seulement la partie du '
      + 'morceau sur laquelle ils portent.',
  }));
}

function renderFinding(f) {
  const node = el('li', { className: 'coach-finding' }, [
    el('span', { className: 'coach-finding-text', text: f.text }),
  ]);
  if (f.confidence === 'low') {
    node.appendChild(el('span', {
      className: 'coach-finding-flag',
      text: f.confidenceNote
        || 'Cette mesure se trompe parfois (environ une fois sur deux) : prenez-la '
          + 'comme une indication, pas comme un fait établi.',
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

  const subtitle = `${selectedTrackName} · style annoncé : `
    + `${STYLES.find((s) => s.id === lastAnalysis.style)?.label || '—'} · `
    + `${lastAnalysis.segmentation.phraseCount} phrases chantées`;
  // Avec une région : le rapport porte sur un passage — il doit le dire, car
  // « 4 phrases chantées » ne se lirait pas pareil sachant que c'est un extrait.
  // La segmentation restreinte transporte sa fenêtre (temps absolu) ; le cas
  // « toute la piste » n'en a pas et garde le sous-titre actuel.
  const window = lastAnalysis.segmentation.window;
  const subtitleText = window
    ? `${subtitle} · passage travaillé : ${formatTime(window.start)} → ${formatTime(window.end)}`
    : subtitle;
  els.report.appendChild(el('div', { className: 'coach-report-head' }, [
    el('h3', { className: 'coach-report-title', text: 'Ce que montre la séance' }),
    el('p', { className: 'coach-report-sub', text: subtitleText }),
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
      el('p', {
        className: 'coach-calibration-text',
        text: 'La voix est rejouée avec ce que vous avez joué par-dessus : c\'est la '
          + 'superposition qui montre si le piano a couvert la phrase ou habité la respiration.',
      }),
      list,
    ]));
  }

  // Chiffres nus, sans commentaire de valeur — précisément parce qu'aucun seuil
  // ne permet encore de les qualifier. Le titre dit juste « ce sont les chiffres,
  // pas encore un jugement » sans jargon : l'idée « pas déjà interprétés » reste
  // portée par la note de calibration juste en dessous.
  els.report.appendChild(el('section', { className: 'coach-card is-facts' }, [
    el('h4', { className: 'coach-card-title', text: 'Le détail, en chiffres' }),
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
  els.regionSetting = document.getElementById('coach-region-setting');
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
    isPlaying: () => playing || replayNodes.length > 0,
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

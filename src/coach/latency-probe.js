// [Claude] — 2026-09-05 — Coach d'accompagnement : mesure de la latence MIDI/audio.
//
// POURQUOI CE MODULE EXISTE.
// Le Coach juge un PLACEMENT dans le temps : « ce que vous jouez tombe sous la
// voix » ou « dans la respiration ». Un décalage systématique de quelques
// dizaines de millisecondes entre l'horodatage MIDI et la position réellement
// entendue du stem suffirait à déplacer une attaque d'un côté ou de l'autre
// d'une limite de phrase. Il fallait donc mesurer ce décalage sur le poste, et
// non deviner un chiffre : c'est ce que fait ce module.
//
// Deux niveaux, du plus faible au plus fort :
//
//   1. ESTIMATION AUTOMATIQUE (`estimateOutputLatency`) — lit `baseLatency` et
//      `outputLatency` de l'AudioContext. Ne coûte rien, disponible dès
//      l'ouverture de l'écran, mais ne couvre que la sortie audio : ni la
//      latence d'entrée MIDI, ni le biais personnel du joueur.
//
//   2. MESURE RÉELLE (`createTapCalibration`) — une série de clics est jouée
//      par le MÊME graphe audio que le stem ; l'utilisateur tape dessus au
//      clavier MIDI ; on compare l'horodatage MIDI à l'instant où chaque clic
//      a effectivement atteint la sortie. C'est une mesure de bout en bout :
//      elle inclut la sortie audio, l'entrée MIDI, et le biais du joueur —
//      c'est-à-dire exactement ce qu'il faut retrancher pour juger un placement.
//
// Le pont entre les deux horloges (AudioContext et performance.now) est
// `AudioContext.getOutputTimestamp()`, dont le couple {contextTime,
// performanceTime} donne l'instant mural où un échantillon donné sort
// réellement de la carte son.
//
// La partie calcul (`summarizeTapOffsets`) est séparée de la partie
// ordonnancement pour être testable en Node, sans Web Audio.

/** Nombre minimum de frappes exploitables pour retenir une mesure. */
export const MIN_TAPS = 5;

/**
 * Médiane d'un tableau de nombres.
 * @param {number[]} values
 * @returns {number|null}
 */
export function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Écart absolu médian — dispersion robuste, insensible à une frappe ratée.
 * @param {number[]} values
 * @param {number} center
 * @returns {number|null}
 */
export function medianAbsoluteDeviation(values, center) {
  if (!values || values.length === 0) return null;
  return median(values.map((v) => Math.abs(v - center)));
}

/**
 * Résume une série d'écarts frappe/clic en une correction utilisable.
 *
 * Convention de signe, tenue dans tout le module : un écart POSITIF signifie
 * que la frappe MIDI arrive APRÈS le clic entendu. La correction à appliquer
 * aux notes (`offsetSec` d'`alignPianoNotes`) est donc l'opposé : on recule
 * les notes du retard mesuré pour les replacer là où elles ont été jouées.
 *
 * Les frappes trop éloignées de la médiane (au-delà de 3 écarts absolus
 * médians, plancher à 40 ms) sont écartées : une frappe manquée ne doit pas
 * tirer la correction.
 *
 * @param {number[]} offsetsMs - écarts bruts en millisecondes
 * @param {object} [options]
 * @param {number} [options.minTaps]
 * @returns {{
 *   status: 'ok'|'insufficient'|'unstable',
 *   offsetMs: number|null, offsetSec: number|null, correctionSec: number|null,
 *   spreadMs: number|null, usedTaps: number, rejectedTaps: number, message: string
 * }}
 */
export function summarizeTapOffsets(offsetsMs, options = {}) {
  const minTaps = options.minTaps ?? MIN_TAPS;
  const raw = (offsetsMs || []).filter((v) => Number.isFinite(v));

  if (raw.length < minTaps) {
    return {
      status: 'insufficient',
      offsetMs: null,
      offsetSec: null,
      correctionSec: null,
      spreadMs: null,
      usedTaps: raw.length,
      rejectedTaps: 0,
      message: `Il faut au moins ${minTaps} frappes exploitables pour mesurer la latence `
        + `(${raw.length} enregistrée${raw.length > 1 ? 's' : ''}).`,
    };
  }

  const firstPass = median(raw);
  const mad = medianAbsoluteDeviation(raw, firstPass) ?? 0;
  const tolerance = Math.max(40, mad * 3);
  const kept = raw.filter((v) => Math.abs(v - firstPass) <= tolerance);
  const rejected = raw.length - kept.length;

  if (kept.length < minTaps) {
    return {
      status: 'unstable',
      offsetMs: null,
      offsetSec: null,
      correctionSec: null,
      spreadMs: mad,
      usedTaps: kept.length,
      rejectedTaps: rejected,
      message: 'Les frappes sont trop dispersées pour en tirer une latence fiable. '
        + 'Recommencez en tapant régulièrement sur chaque clic.',
    };
  }

  const offsetMs = median(kept);
  const spreadMs = medianAbsoluteDeviation(kept, offsetMs) ?? 0;

  return {
    status: 'ok',
    offsetMs,
    offsetSec: offsetMs / 1000,
    // Correction à passer à alignPianoNotes : opposé du retard mesuré.
    correctionSec: -offsetMs / 1000,
    spreadMs,
    usedTaps: kept.length,
    rejectedTaps: rejected,
    message: `Latence mesurée : ${Math.round(offsetMs)} ms (dispersion ±${Math.round(spreadMs)} ms, `
      + `${kept.length} frappes retenues${rejected > 0 ? `, ${rejected} écartée${rejected > 1 ? 's' : ''}` : ''}).`,
  };
}

/**
 * Estimation automatique, faute de mesure réelle.
 *
 * Ne couvre que la chaîne de SORTIE : c'est un défaut raisonnable, pas une
 * mesure. `createTapCalibration` la remplace dès qu'elle a tourné.
 *
 * @param {AudioContext} audioCtx
 * @returns {{ baseLatencySec: number, outputLatencySec: number, totalSec: number, correctionSec: number, source: string, measured: boolean }}
 */
export function estimateOutputLatency(audioCtx) {
  const base = Number.isFinite(audioCtx?.baseLatency) ? audioCtx.baseLatency : 0;
  const output = Number.isFinite(audioCtx?.outputLatency) ? audioCtx.outputLatency : 0;
  const total = base + output;
  return {
    baseLatencySec: base,
    outputLatencySec: output,
    totalSec: total,
    correctionSec: -total,
    source: 'AudioContext.baseLatency + outputLatency',
    measured: false,
  };
}

/**
 * Convertit un instant de l'horloge AudioContext en instant `performance.now()`
 * correspondant à sa sortie réelle sur la carte son.
 *
 * @param {AudioContext} audioCtx
 * @param {number} contextTime
 * @returns {number|null} millisecondes dans la base performance.now(), ou null
 *   si le navigateur n'expose pas getOutputTimestamp.
 */
export function contextTimeToPerformanceMs(audioCtx, contextTime) {
  if (typeof audioCtx?.getOutputTimestamp !== 'function') return null;
  const ts = audioCtx.getOutputTimestamp();
  if (!Number.isFinite(ts?.contextTime) || !Number.isFinite(ts?.performanceTime)) return null;
  return ts.performanceTime + (contextTime - ts.contextTime) * 1000;
}

/**
 * Crée une session de calibration par frappes.
 *
 * Le clic est synthétisé dans le MÊME AudioContext que le stem : il traverse
 * donc exactement la même chaîne de sortie, ce qui est indispensable pour que
 * la mesure soit celle du chemin réellement utilisé pendant la séance.
 *
 * @param {object} params
 * @param {AudioContext} params.audioCtx
 * @param {number} [params.clickCount]
 * @param {number} [params.intervalSec]
 * @param {number} [params.leadInSec]
 * @param {(state: object) => void} [params.onTick] - notifié à chaque frappe
 * @returns {{ start: () => void, registerTap: (performanceMs: number) => void, finish: () => object, cancel: () => void, clickCount: number, durationSec: number }}
 */
export function createTapCalibration(params) {
  const audioCtx = params.audioCtx;
  const clickCount = params.clickCount ?? 8;
  const intervalSec = params.intervalSec ?? 0.75;
  const leadInSec = params.leadInSec ?? 1.0;
  const onTick = params.onTick;

  if (!audioCtx) throw new TypeError('audioCtx est requis pour la calibration');

  /** @type {number[]} instants de sortie réelle des clics, base performance.now() */
  const clickPerformanceMs = [];
  /** @type {number[]} */
  const taps = [];
  const scheduled = [];
  let started = false;

  function scheduleClick(when) {
    // Clic court et net : une impulsion filtrée vaut mieux qu'un sinus long,
    // dont l'attaque molle rendrait le repère temporel flou.
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.35, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
    scheduled.push(osc);
  }

  function start() {
    if (started) return;
    started = true;
    const t0 = audioCtx.currentTime + leadInSec;
    for (let i = 0; i < clickCount; i++) {
      const when = t0 + i * intervalSec;
      scheduleClick(when);
      const perfMs = contextTimeToPerformanceMs(audioCtx, when);
      // Repli si getOutputTimestamp est absent : on reconstruit l'instant mural
      // à partir de performance.now() et de la latence de sortie déclarée.
      const fallbackMs = performance.now()
        + (when - audioCtx.currentTime) * 1000
        + (Number.isFinite(audioCtx.outputLatency) ? audioCtx.outputLatency * 1000 : 0);
      clickPerformanceMs.push(perfMs ?? fallbackMs);
    }
  }

  /**
   * Enregistre une frappe et l'apparie au clic le plus proche.
   * @param {number} performanceMs
   */
  function registerTap(performanceMs) {
    if (!started || clickPerformanceMs.length === 0) return;
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < clickPerformanceMs.length; i++) {
      const d = Math.abs(performanceMs - clickPerformanceMs[i]);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    // Une frappe à plus d'une demi-période du clic le plus proche n'appartient
    // à aucun clic : on l'ignore plutôt que de l'attribuer de force.
    if (bestDistance > (intervalSec * 1000) / 2) return;
    taps.push(performanceMs - clickPerformanceMs[bestIndex]);
    onTick?.({ tapCount: taps.length, clickCount, lastOffsetMs: taps[taps.length - 1] });
  }

  function finish() {
    const summary = summarizeTapOffsets(taps);
    return { ...summary, measured: summary.status === 'ok', source: 'frappes sur clic', rawOffsetsMs: [...taps] };
  }

  function cancel() {
    for (const osc of scheduled) {
      try { osc.stop(); } catch (_) { /* déjà arrêté */ }
    }
    scheduled.length = 0;
  }

  return {
    start,
    registerTap,
    finish,
    cancel,
    clickCount,
    durationSec: leadInSec + clickCount * intervalSec,
  };
}

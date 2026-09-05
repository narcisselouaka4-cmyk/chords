// [Claude] — 2026-09-05 — Coach d'accompagnement au chant, couche 1 (partie audio).
//
// Détection de l'activité vocale à partir d'un stem `vocals` (Demucs), sous la
// forme d'une enveloppe d'énergie puis d'un découpage en phrases chantées et en
// respirations (les « vides » sur lesquels un bon accompagnateur rebondit).
//
// Choix de conception, tranché ici parce qu'il est technique et non musical :
// le projet n'expose aucun beat-tracker côté application. `electron/audio-processor.py`
// en contient bien un (`_beat_track`, librosa) mais il sert au découpage en
// mesures de l'analyse harmonique, il n'est pas branché sur le Studio et il
// suppose un tempo stable — ce qui n'a rien d'acquis sur une voix seule, souvent
// rubato. On n'en dépend donc pas : les limites de phrases viennent des
// respirations, exactement comme `src/analyzer/segmenter.js` découpe une session
// par ses silences. C'est le même signal que celui déjà mesuré par le taux de
// remplissage des vides, donc aucun nouveau signal n'est introduit.
//
// Module pur : pas de DOM, pas de Web Audio, pas d'IPC. Il reçoit des
// échantillons mono et rend des nombres, ce qui le rend testable en Node.

/** Paramètres par défaut de l'enveloppe d'énergie. */
export const DEFAULT_ENVELOPE_OPTIONS = {
  frameMs: 25,   // fenêtre d'analyse
  hopMs: 10,     // pas entre deux trames → résolution temporelle de 10 ms
};

/**
 * Paramètres par défaut du découpage en phrases.
 *
 * `minGapSec` est le seul paramètre réellement musical : c'est la durée
 * au-delà de laquelle un silence vocal cesse d'être une articulation entre
 * deux mots et devient une vraie respiration, c'est-à-dire une place laissée
 * au piano. 0,35 s correspond à une respiration chantée courte ; en dessous,
 * on découperait au milieu des mots. C'est un défaut technique explicite, pas
 * un seuil de jugement : il est exposé pour être réglé sur du matériel réel.
 */
export const DEFAULT_PHRASE_OPTIONS = {
  minGapSec: 0.35,
  minPhraseSec: 0.25,
  // Le seuil d'énergie n'est PAS une constante en dB : il est dérivé du signal
  // lui-même (voir `estimateThresholds`), parce qu'un stem Demucs n'a ni niveau
  // ni plancher de bruit normalisés d'un morceau à l'autre.
  highFraction: 0.22,  // entrée en voix, en fraction de la dynamique utile
  lowFraction: 0.12,   // sortie de voix (hystérésis)
};

const SILENCE_DB = -100;

/**
 * Convertit une amplitude linéaire en décibels, avec un plancher fini pour que
 * les trames strictement nulles n'introduisent pas de -Infinity dans les
 * percentiles.
 *
 * @param {number} amplitude
 * @returns {number}
 */
export function toDb(amplitude) {
  if (!(amplitude > 0)) return SILENCE_DB;
  return Math.max(SILENCE_DB, 20 * Math.log10(amplitude));
}

/**
 * Calcule l'enveloppe d'énergie RMS d'un signal mono.
 *
 * @param {Float32Array|number[]} samples - échantillons mono, typiquement
 *   `audioBuffer.getChannelData(0)` du stem `vocals`.
 * @param {number} sampleRate
 * @param {object} [options]
 * @param {number} [options.frameMs]
 * @param {number} [options.hopMs]
 * @returns {{ rms: Float64Array, db: Float64Array, hopSec: number, frameCount: number, duration: number }}
 */
export function computeEnergyEnvelope(samples, sampleRate, options = {}) {
  if (!samples || typeof samples.length !== 'number') {
    throw new TypeError('samples doit être un tableau d\'échantillons');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`sampleRate invalide : ${sampleRate}`);
  }

  const opts = { ...DEFAULT_ENVELOPE_OPTIONS, ...options };
  const frameSize = Math.max(1, Math.round((opts.frameMs / 1000) * sampleRate));
  const hopSize = Math.max(1, Math.round((opts.hopMs / 1000) * sampleRate));
  const frameCount = samples.length < frameSize
    ? (samples.length > 0 ? 1 : 0)
    : 1 + Math.floor((samples.length - frameSize) / hopSize);

  const rms = new Float64Array(frameCount);
  const db = new Float64Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const start = i * hopSize;
    const end = Math.min(samples.length, start + frameSize);
    let sum = 0;
    for (let j = start; j < end; j++) {
      const v = samples[j];
      sum += v * v;
    }
    const n = Math.max(1, end - start);
    const value = Math.sqrt(sum / n);
    rms[i] = value;
    db[i] = toDb(value);
  }

  return {
    rms,
    db,
    hopSec: hopSize / sampleRate,
    frameCount,
    duration: samples.length / sampleRate,
  };
}

/**
 * Percentile d'un tableau de nombres (interpolation linéaire).
 *
 * @param {ArrayLike<number>} values
 * @param {number} p - entre 0 et 1
 * @returns {number}
 */
export function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Dérive les seuils d'entrée/sortie de voix du signal lui-même.
 *
 * On ne fixe pas un niveau en dB a priori : le plancher est estimé par un bas
 * percentile (le bruit résiduel de séparation, jamais nul sur un stem Demucs)
 * et le niveau chanté par un haut percentile. Les seuils se placent à une
 * fraction de la dynamique qui les sépare. Un morceau très compressé et un
 * morceau très dynamique donnent ainsi des seuils différents, adaptés à chacun.
 *
 * @param {ArrayLike<number>} db - enveloppe en dB
 * @param {object} [options]
 * @returns {{ floorDb: number, peakDb: number, highDb: number, lowDb: number, spanDb: number }}
 */
export function estimateThresholds(db, options = {}) {
  const opts = { ...DEFAULT_PHRASE_OPTIONS, ...options };
  const floorDb = percentile(db, 0.10);

  // Le niveau chanté n'est PAS un haut percentile de toutes les trames : sur
  // une région à longue intro instrumentale, où la voix n'occupe que quelques
  // pour cent du temps, le percentile 95 tombe encore dans le bruit et toute
  // la détection s'effondre. On sépare donc les trames en deux classes autour
  // du milieu de la dynamique observée, et on prend le niveau typique de la
  // classe haute. Ça reste robuste quand la voix est dense (la classe haute
  // est alors le chant lui-même) comme quand elle est rare.
  const maxDb = percentile(db, 1);
  const midpoint = (floorDb + maxDb) / 2;
  const loud = Array.from(db).filter((v) => v >= midpoint);
  const peakDb = loud.length > 0 ? percentile(loud, 0.5) : maxDb;
  const spanDb = Math.max(0, peakDb - floorDb);
  return {
    floorDb,
    peakDb,
    spanDb,
    highDb: floorDb + spanDb * opts.highFraction,
    lowDb: floorDb + spanDb * opts.lowFraction,
  };
}

/**
 * Découpe l'enveloppe en phrases chantées et en respirations.
 *
 * Deux garde-fous complètent le seuil :
 *   - une hystérésis (on entre en voix au-dessus de `highDb`, on n'en sort
 *     qu'en repassant sous `lowDb`) pour ne pas hacher une tenue qui module ;
 *   - une durée minimale de respiration (`minGapSec`) pour ne pas prendre une
 *     consonne occlusive ou une articulation entre deux mots pour un vide.
 *
 * @param {{ db: ArrayLike<number>, hopSec: number, duration: number }} envelope
 * @param {object} [options] - voir DEFAULT_PHRASE_OPTIONS
 * @returns {{
 *   phrases: {index: number, start: number, end: number, duration: number}[],
 *   gaps: {index: number, start: number, end: number, duration: number, leading: boolean, trailing: boolean}[],
 *   thresholds: object,
 *   sungDuration: number,
 *   silentDuration: number,
 *   duration: number,
 *   options: object
 * }}
 */
export function detectVocalPhrases(envelope, options = {}) {
  const opts = { ...DEFAULT_PHRASE_OPTIONS, ...options };
  const { db, hopSec } = envelope;
  const duration = Number.isFinite(envelope.duration)
    ? envelope.duration
    : db.length * hopSec;

  const thresholds = options.thresholds || estimateThresholds(db, opts);

  // 1. Trames voisées par hystérésis.
  const voiced = new Uint8Array(db.length);
  let inVoice = false;
  for (let i = 0; i < db.length; i++) {
    if (!inVoice && db[i] >= thresholds.highDb) inVoice = true;
    else if (inVoice && db[i] < thresholds.lowDb) inVoice = false;
    voiced[i] = inVoice ? 1 : 0;
  }

  // 2. Trames → intervalles bruts.
  const rawSpans = [];
  let spanStart = -1;
  for (let i = 0; i < voiced.length; i++) {
    if (voiced[i] && spanStart < 0) spanStart = i;
    else if (!voiced[i] && spanStart >= 0) {
      rawSpans.push([spanStart * hopSec, i * hopSec]);
      spanStart = -1;
    }
  }
  if (spanStart >= 0) rawSpans.push([spanStart * hopSec, Math.min(duration, voiced.length * hopSec)]);

  // 3. Fusion des intervalles séparés par un silence trop court pour être une
  //    respiration : c'est là que se joue le découpage en phrases.
  const merged = [];
  for (const span of rawSpans) {
    const last = merged[merged.length - 1];
    if (last && span[0] - last[1] < opts.minGapSec) {
      last[1] = span[1];
    } else {
      merged.push([span[0], span[1]]);
    }
  }

  // 4. Rejet des bribes trop courtes pour être une phrase (clics, résidus de
  //    séparation). Elles retournent au silence.
  const kept = merged.filter(([s, e]) => e - s >= opts.minPhraseSec);

  const phrases = kept.map(([start, end], index) => ({
    index,
    start,
    end,
    duration: end - start,
  }));

  // 5. Les vides : tout ce qui n'est pas une phrase. On distingue l'intro et la
  //    coda (avant la première phrase / après la dernière) des respirations
  //    internes, parce qu'« accompagner un vide » n'a pas le même sens dans une
  //    intro que dans une respiration au milieu d'un couplet.
  const gaps = [];
  let cursor = 0;
  let gapIndex = 0;
  for (const phrase of phrases) {
    if (phrase.start - cursor > 0) {
      gaps.push({
        index: gapIndex++,
        start: cursor,
        end: phrase.start,
        duration: phrase.start - cursor,
        leading: cursor === 0,
        trailing: false,
      });
    }
    cursor = phrase.end;
  }
  if (duration - cursor > 0) {
    gaps.push({
      index: gapIndex++,
      start: cursor,
      end: duration,
      duration: duration - cursor,
      leading: phrases.length === 0,
      trailing: true,
    });
  }

  const sungDuration = phrases.reduce((acc, p) => acc + p.duration, 0);

  return {
    phrases,
    gaps,
    thresholds,
    sungDuration,
    silentDuration: Math.max(0, duration - sungDuration),
    duration,
    options: { minGapSec: opts.minGapSec, minPhraseSec: opts.minPhraseSec },
  };
}

/**
 * Indique si un stem est exploitable comme voix de référence.
 *
 * Question tranchée ici conformément au garde-fou transverse du projet (« ne
 * jamais afficher une information que l'app ne peut pas garantir ») : sur un
 * morceau instrumental ou une séparation ratée, le stem `vocals` ne contient
 * que du bruit résiduel. Plutôt que de produire un rapport silencieusement
 * faux sur zéro phrase, on refuse explicitement, avec un motif affichable.
 *
 * @param {ReturnType<typeof detectVocalPhrases>} segmentation
 * @param {object} [options]
 * @param {number} [options.minPhrases] - nombre minimal de phrases chantées
 * @param {number} [options.minSungRatio] - part minimale de temps chanté
 * @param {number} [options.minSpanDb] - dynamique minimale entre plancher et voix
 * @returns {{ usable: boolean, reason: string|null, message: string|null, details: object }}
 */
export function assessVocalStem(segmentation, options = {}) {
  const minPhrases = options.minPhrases ?? 2;
  const minSungRatio = options.minSungRatio ?? 0.05;
  const minSpanDb = options.minSpanDb ?? 12;

  const sungRatio = segmentation.duration > 0
    ? segmentation.sungDuration / segmentation.duration
    : 0;
  const details = {
    phraseCount: segmentation.phrases.length,
    sungRatio,
    spanDb: segmentation.thresholds.spanDb,
  };

  // Une dynamique quasi plate = pas de voix, seulement du bruit de séparation :
  // le seuil adaptatif découperait alors ce bruit en fausses « phrases ».
  if (segmentation.thresholds.spanDb < minSpanDb) {
    return {
      usable: false,
      reason: 'FlatStem',
      message: 'Ce stem ne contient pas de voix exploitable : son niveau est presque constant '
        + '(pas d\'alternance chant/silence). Le morceau est probablement instrumental, '
        + 'ou la séparation a échoué.',
      details,
    };
  }
  if (segmentation.phrases.length < minPhrases) {
    return {
      usable: false,
      reason: 'TooFewPhrases',
      message: `Seule${segmentation.phrases.length > 1 ? 's' : ''} ${segmentation.phrases.length} `
        + 'phrase(s) chantée(s) ont été détectées : trop peu pour analyser un accompagnement. '
        + 'Vérifiez que le morceau contient bien du chant sur la région choisie.',
      details,
    };
  }
  if (sungRatio < minSungRatio) {
    return {
      usable: false,
      reason: 'MostlySilent',
      message: 'La voix est présente sur moins de 5 % de la région choisie : il n\'y a pas assez '
        + 'de chant pour juger un accompagnement.',
      details,
    };
  }

  return { usable: true, reason: null, message: null, details };
}

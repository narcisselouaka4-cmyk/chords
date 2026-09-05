// [Claude] — 2026-09-05 — Coach d'accompagnement au chant, couches 1 et 2.
//
// Couche 1 — L'ESPACE : où le piano se place par rapport au chant.
//   Répond directement au constat de Narcisse (« j'en fais trop : soit trop de
//   mouvements, soit trop de licks, et ça gêne l'accompagnement »). Ce n'est
//   pas un problème d'harmonie mais de densité et de placement dans le temps :
//   il se mesure en superposant l'activité vocale (stem isolé, cf.
//   vocal-activity.js) et l'activité pianistique (MIDI, exact par construction).
//   AUCUNE détection d'accord n'intervient : rien ne peut se tromper sur une
//   étiquette d'accord, puisqu'on n'en calcule aucune.
//
// Couche 2 — LE REGISTRE : le piano empiète-t-il sur la tessiture chantée ?
//   Cette couche dépend de melody_extractor.py, dont le F1 mesuré sur du réel
//   est de 0,484 (EXP-027) : une note sur deux est fausse. Elle est donc
//   calculée en agrégat (proportions de temps, tessiture globale), jamais note
//   à note, et tout ce qu'elle produit porte `confidence: 'low'`. La couche 3
//   (soutien harmonique) est délibérément absente : elle supposerait de faire
//   confiance à cette extraction pour affirmer un jugement fin, ce qui
//   reproduirait l'erreur déjà corrigée sur Masterclass.
//
// Module pur : pas de DOM, pas d'audio, pas d'IPC.

/**
 * Fusionne une liste d'intervalles en leur union, triée et sans chevauchement.
 *
 * @param {{start: number, end: number}[]} intervals
 * @returns {{start: number, end: number}[]}
 */
export function mergeIntervals(intervals) {
  const sorted = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/**
 * Durée totale de l'intersection entre deux listes d'intervalles.
 * Les deux listes sont fusionnées au préalable, donc le résultat ne
 * double-compte jamais un instant couvert par deux notes simultanées.
 *
 * @param {{start: number, end: number}[]} a
 * @param {{start: number, end: number}[]} b
 * @returns {number} secondes
 */
export function intersectionDuration(a, b) {
  const A = mergeIntervals(a);
  const B = mergeIntervals(b);
  let total = 0;
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (end > start) total += end - start;
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return total;
}

/**
 * Somme des durées d'une liste d'intervalles (après fusion).
 * @param {{start: number, end: number}[]} intervals
 * @returns {number}
 */
export function totalDuration(intervals) {
  return mergeIntervals(intervals).reduce((acc, i) => acc + (i.end - i.start), 0);
}

/**
 * Ramène les notes jouées au clavier dans la base de temps du stem vocal.
 *
 * `midi-capture.js` horodate en secondes depuis une horloge monotonique
 * (`performance.now()`), d'origine arbitraire. Le stem, lui, part de 0. On
 * soustrait donc l'instant de départ de la capture, on ajoute la position de
 * lecture du stem à ce moment-là, puis on applique la correction de latence
 * mesurée (voir latency-probe.js) : `offsetSec` positif signifie que le MIDI
 * arrive EN AVANCE sur l'audio entendu et doit être décalé vers l'avant.
 *
 * @param {{midi: number, startedAt: number, endedAt: number, velocity: number}[]} notes
 * @param {object} params
 * @param {number} params.captureOriginSec - `startedAt` correspondant au début de la capture
 * @param {number} [params.stemOriginSec] - position du stem au démarrage de la capture
 * @param {number} [params.offsetSec] - correction de latence, en secondes
 * @returns {{midi: number, start: number, end: number, velocity: number, duration: number}[]}
 */
export function alignPianoNotes(notes, params) {
  const { captureOriginSec } = params;
  const stemOrigin = params.stemOriginSec ?? 0;
  const offset = params.offsetSec ?? 0;
  if (!Number.isFinite(captureOriginSec)) {
    throw new TypeError('captureOriginSec est requis pour aligner les notes');
  }
  return (notes || [])
    .filter((n) => Number.isFinite(n.startedAt) && Number.isFinite(n.endedAt))
    .map((n) => {
      const start = n.startedAt - captureOriginSec + stemOrigin + offset;
      const end = n.endedAt - captureOriginSec + stemOrigin + offset;
      return {
        midi: n.midi,
        velocity: n.velocity ?? 0.8,
        start,
        end: Math.max(start, end),
        duration: Math.max(0, end - start),
      };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * Compte les attaques (note_on) tombant dans un intervalle.
 * On compte les ATTAQUES et non le temps sonnant, parce que « trop de
 * mouvements, trop de licks » est un problème de nombre de gestes, pas de
 * durée : dix notes rapides et un accord tenu occupent le même temps.
 *
 * @param {{start: number}[]} notes
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
export function countOnsets(notes, start, end) {
  let count = 0;
  for (const n of notes) {
    if (n.start >= start && n.start < end) count++;
  }
  return count;
}

function ratio(numerator, denominator) {
  if (!(denominator > 0)) return null;
  return numerator / denominator;
}

/**
 * Couche 1 — mesure de l'espace laissé à la voix.
 *
 * @param {ReturnType<import('./vocal-activity.js').detectVocalPhrases>} segmentation
 * @param {{midi: number, start: number, end: number}[]} pianoNotes - déjà alignées
 * @returns {object}
 */
export function computeSpaceMetrics(segmentation, pianoNotes) {
  const notes = pianoNotes || [];
  const pianoSpans = notes.map((n) => ({ start: n.start, end: n.end }));
  const phraseSpans = segmentation.phrases.map((p) => ({ start: p.start, end: p.end }));
  const internalGaps = segmentation.gaps.filter((g) => !g.leading && !g.trailing);
  const gapSpans = internalGaps.map((g) => ({ start: g.start, end: g.end }));

  const sungDuration = segmentation.sungDuration;
  const gapsDuration = gapSpans.reduce((acc, g) => acc + (g.end - g.start), 0);
  const pianoDuration = totalDuration(pianoSpans);

  // 1. Recouvrement : part du temps chanté pendant laquelle le piano sonne.
  const overlapDuration = intersectionDuration(pianoSpans, phraseSpans);
  const overlapRatio = ratio(overlapDuration, sungDuration);

  // 2. Remplissage des vides : part des respirations où le piano répond.
  const gapCoverageDuration = intersectionDuration(pianoSpans, gapSpans);
  const gapCoverageRatio = ratio(gapCoverageDuration, gapsDuration);

  const gapDetails = internalGaps.map((gap) => {
    const onsets = countOnsets(notes, gap.start, gap.end);
    const covered = intersectionDuration(pianoSpans, [{ start: gap.start, end: gap.end }]);
    return {
      index: gap.index,
      start: gap.start,
      end: gap.end,
      duration: gap.duration,
      onsetCount: onsets,
      coveredDuration: covered,
      coverage: ratio(covered, gap.duration),
      answered: onsets > 0,
    };
  });
  const answeredGaps = gapDetails.filter((g) => g.answered).length;

  // 3. Densité d'attaques, pendant le chant et dans les respirations. Le
  //    rapport des deux est la mesure la plus directe du reproche que
  //    Narcisse se fait : un accompagnateur qui « rebondit sur les vides »
  //    joue plus dense dans les respirations que sous la voix, donc un
  //    rapport inférieur à 1.
  const onsetsDuringSinging = phraseSpans.reduce(
    (acc, s) => acc + countOnsets(notes, s.start, s.end), 0);
  const onsetsDuringGaps = gapSpans.reduce(
    (acc, s) => acc + countOnsets(notes, s.start, s.end), 0);

  const densitySinging = ratio(onsetsDuringSinging, sungDuration);
  const densityGaps = ratio(onsetsDuringGaps, gapsDuration);
  const densityRatio = (densitySinging !== null && densityGaps !== null && densityGaps > 0)
    ? densitySinging / densityGaps
    : null;

  // 4. Détail par phrase, pour pouvoir dire « écoute la phrase 4 » et non
  //    seulement donner une moyenne.
  const phraseDetails = segmentation.phrases.map((phrase) => {
    const span = [{ start: phrase.start, end: phrase.end }];
    const covered = intersectionDuration(pianoSpans, span);
    const onsets = countOnsets(notes, phrase.start, phrase.end);
    return {
      index: phrase.index,
      start: phrase.start,
      end: phrase.end,
      duration: phrase.duration,
      onsetCount: onsets,
      coveredDuration: covered,
      overlapRatio: ratio(covered, phrase.duration),
      density: ratio(onsets, phrase.duration),
    };
  });

  return {
    layer: 'space',
    confidence: 'high',
    // « high » parce que les deux signaux comparés sont fiables : le MIDI est
    // exact par construction, et l'enveloppe d'énergie d'un stem isolé ne
    // suppose aucune reconnaissance — seulement « ça sonne » ou « ça ne sonne pas ».
    noteCount: notes.length,
    pianoSoundingDuration: pianoDuration,
    analyzedDuration: segmentation.duration,
    sungDuration,
    gapsDuration,
    overlap: {
      duration: overlapDuration,
      ratio: overlapRatio,
    },
    gapFill: {
      gapCount: internalGaps.length,
      answeredCount: answeredGaps,
      answeredRatio: ratio(answeredGaps, internalGaps.length),
      coveredDuration: gapCoverageDuration,
      coverageRatio: gapCoverageRatio,
      gaps: gapDetails,
    },
    density: {
      onsetsDuringSinging,
      onsetsDuringGaps,
      duringSinging: densitySinging,
      duringGaps: densityGaps,
      ratio: densityRatio,
    },
    phrases: phraseDetails,
  };
}

/**
 * Couche 2 — mesure du registre.
 *
 * Attention, limite structurelle assumée : le MIDI ne dit pas quelle main joue
 * quelle note. On ne peut donc pas mesurer « la main droite empiète » au sens
 * strict. Ce qui est mesuré à la place, et qui est vérifiable, c'est la part
 * du temps joué qui tombe DANS la tessiture chantée, et la part qui tombe à
 * moins d'une tierce mineure de la note chantée au même instant.
 *
 * @param {{midi: number, start: number, end: number}[]} pianoNotes - alignées
 * @param {{midi: number, start: number, end: number, confidence?: number}[]} vocalNotes
 * @param {object} [options]
 * @param {number} [options.clashSemitones] - distance en demi-tons considérée comme empiètement serré
 * @returns {object}
 */
export function computeRegisterMetrics(pianoNotes, vocalNotes, options = {}) {
  const clashSemitones = options.clashSemitones ?? 3; // tierce mineure
  const notes = pianoNotes || [];
  const vocals = (vocalNotes || []).filter((v) => Number.isFinite(v.midi));

  if (vocals.length === 0) {
    return {
      layer: 'register',
      available: false,
      confidence: 'low',
      reason: 'NoVocalPitch',
      message: 'Le programme n\'a pas réussi à suivre la hauteur des notes chantées : '
        + 'la mesure de registre (où votre piano se place par rapport à la voix) '
        + 'n\'est pas disponible pour cette session. Le reste du rapport reste valable.',
    };
  }

  const vocalMidis = vocals.map((v) => v.midi);
  const tessitura = {
    min: Math.min(...vocalMidis),
    max: Math.max(...vocalMidis),
  };

  // 1. Part des notes jouées qui tombent dans la tessiture chantée (mesure
  //    globale, insensible aux erreurs d'extraction note à note puisqu'elle
  //    ne dépend que des extrêmes et d'un comptage).
  const insideTessitura = notes.filter(
    (n) => n.midi >= tessitura.min && n.midi <= tessitura.max);
  const insideRatio = ratio(insideTessitura.length, notes.length);

  // 2. Empiètement serré : temps pendant lequel une note jouée sonne à moins
  //    d'une tierce mineure d'une note chantée simultanée. Pondéré par le
  //    temps, agrégé sur toute la session — jamais restitué note à note.
  let clashDuration = 0;
  let sameOctaveDuration = 0;
  let simultaneousDuration = 0;

  for (const p of notes) {
    for (const v of vocals) {
      const start = Math.max(p.start, v.start);
      const end = Math.min(p.end, v.end);
      if (end <= start) continue;
      const overlap = end - start;
      simultaneousDuration += overlap;
      const distance = Math.abs(p.midi - v.midi);
      if (distance <= clashSemitones) clashDuration += overlap;
      if (distance < 12) sameOctaveDuration += overlap;
    }
  }

  return {
    layer: 'register',
    available: true,
    confidence: 'low',
    // Rappel explicite, transporté jusqu'à l'affichage : cette couche repose
    // sur melody_extractor.py, F1 = 0,484 sur du réel (EXP-027).
    confidenceNote: 'Le programme se trompe environ une fois sur deux quand il suit la '
      + 'hauteur de la voix (F1 = 0,48 mesuré sur du réel). Prenez ce chiffre comme une '
      + 'indication à vérifier à l\'oreille en réécoute, pas comme un fait établi.',
    vocalNoteCount: vocals.length,
    pianoNoteCount: notes.length,
    tessitura: {
      minMidi: tessitura.min,
      maxMidi: tessitura.max,
      spanSemitones: tessitura.max - tessitura.min,
    },
    insideTessitura: {
      count: insideTessitura.length,
      ratio: insideRatio,
    },
    clash: {
      semitones: clashSemitones,
      duration: clashDuration,
      ratio: ratio(clashDuration, simultaneousDuration),
    },
    sameOctave: {
      duration: sameOctaveDuration,
      ratio: ratio(sameOctaveDuration, simultaneousDuration),
    },
    simultaneousDuration,
    handAttribution: false,
    handAttributionNote: 'Le MIDI ne dit pas quelle main joue quelle note : on mesure '
      + 'le registre joué, pas « la main droite ».',
  };
}

/**
 * Analyse complète d'une session d'accompagnement (couches 1 et 2).
 *
 * @param {object} params
 * @param {ReturnType<import('./vocal-activity.js').detectVocalPhrases>} params.segmentation
 * @param {{midi: number, start: number, end: number}[]} params.pianoNotes - alignées
 * @param {{midi: number, start: number, end: number}[]} [params.vocalNotes]
 * @param {string} [params.style] - style annoncé avant de jouer
 * @param {number} [params.offsetSec] - latence appliquée, pour traçabilité
 * @returns {object}
 */
export function analyzeAccompaniment(params) {
  const { segmentation, pianoNotes } = params;
  if (!segmentation || !Array.isArray(segmentation.phrases)) {
    throw new TypeError('segmentation invalide');
  }
  const space = computeSpaceMetrics(segmentation, pianoNotes);
  const register = params.vocalNotes
    ? computeRegisterMetrics(pianoNotes, params.vocalNotes)
    : {
      layer: 'register',
      available: false,
      confidence: 'low',
      reason: 'NotRequested',
      message: 'La mesure de registre (où votre piano se place par rapport à la voix) '
        + 'n\'a pas pu être calculée pour cette session. Le reste du rapport '
        + '— placement dans le temps, respirations — reste valable.',
    };

  return {
    version: 1,
    style: params.style || null,
    offsetSec: params.offsetSec ?? 0,
    segmentation: {
      phraseCount: segmentation.phrases.length,
      gapCount: segmentation.gaps.length,
      duration: segmentation.duration,
      sungDuration: segmentation.sungDuration,
      silentDuration: segmentation.silentDuration,
      minGapSec: segmentation.options?.minGapSec,
      // Fenêtre de restriction si la segmentation en est une (restrictToWindow) :
      // en temps absolu du morceau. Absent = toute la piste. L'UI s'en sert
      // pour dire au lecteur que le rapport porte sur un passage.
      window: segmentation.window || null,
    },
    space,
    register,
  };
}

// [Claude] — 2026-09-05 — Tests du moteur du Coach d'accompagnement au chant.
// Exécutable avec : node src/coach/test-coach-engine.js
//
// Trois modules couverts, tous purs (ni DOM, ni Web Audio, ni IPC) :
//   - vocal-activity.js      : enveloppe d'énergie, découpage en phrases, refus
//   - accompaniment-metrics.js : couches 1 (espace) et 2 (registre)
//   - coach-report.js        : rapport en trois parties, discipline de calibration
//   - latency-probe.js       : agrégation robuste des frappes de calibration
//
// Les signaux vocaux sont SYNTHÉTISÉS ici (sinus fenêtrés + bruit de fond),
// pas lus depuis un fichier : la géométrie attendue (où commencent et finissent
// les phrases) est donc connue exactement, ce qui permet de vérifier le
// découpage au lieu de le constater.

import {
  computeEnergyEnvelope,
  detectVocalPhrases,
  estimateThresholds,
  assessVocalStem,
  restrictToWindow,
  percentile,
  toDb,
} from './vocal-activity.js';
import {
  mergeIntervals,
  intersectionDuration,
  totalDuration,
  alignPianoNotes,
  countOnsets,
  computeSpaceMetrics,
  computeRegisterMetrics,
  analyzeAccompaniment,
} from './accompaniment-metrics.js';
import { buildCoachReport, formatTime, formatPercent, midiToName } from './coach-report.js';
import { summarizeTapOffsets, median, medianAbsoluteDeviation } from './latency-probe.js';
import { createMidiCapture } from '../melody/midi-capture.js';
import { createMelodyTrack, validateMelodyTrack } from '../melody/melody-track.js';

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} attendu ${expected}, obtenu ${actual}`);
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'attendu vrai');
}

function assertClose(actual, expected, tolerance, msg = '') {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg} attendu ${expected} ±${tolerance}, obtenu ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// Fabrique de signal vocal synthétique
// ---------------------------------------------------------------------------

const SR = 8000; // suffisant : on ne mesure que de l'énergie, pas de la hauteur

/**
 * Construit un signal mono où chaque intervalle [start, end] est « chanté »
 * (sinus à amplitude `level`) et le reste est du bruit de fond faible, comme
 * le résidu qu'un stem Demucs laisse toujours.
 */
function makeVocalSignal(durationSec, spans, { level = 0.5, noise = 0.002, seed = 7 } = {}) {
  const n = Math.round(durationSec * SR);
  const samples = new Float32Array(n);
  // Bruit déterministe : un test ne doit pas dépendre de Math.random.
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state / 0x7fffffff) * 2 - 1;
  };
  for (let i = 0; i < n; i++) samples[i] = rand() * noise;
  for (const [start, end] of spans) {
    const from = Math.round(start * SR);
    const to = Math.min(n, Math.round(end * SR));
    for (let i = from; i < to; i++) {
      // Fondu d'entrée/sortie de 10 ms pour éviter les clics de bord.
      const fade = Math.min(1, (i - from) / (0.01 * SR), (to - i) / (0.01 * SR));
      samples[i] += Math.sin((2 * Math.PI * 220 * i) / SR) * level * fade;
    }
  }
  return samples;
}

function segmentationFor(durationSec, spans, options = {}) {
  const samples = makeVocalSignal(durationSec, spans, options.signal);
  const envelope = computeEnergyEnvelope(samples, SR);
  return detectVocalPhrases(envelope, options.phrase);
}

/** Note de piano déjà alignée (base de temps du stem). */
function pianoNote(midi, start, end) {
  return { midi, start, end, velocity: 0.8, duration: end - start };
}

// ===========================================================================
// vocal-activity.js
// ===========================================================================

runTest('T01 — toDb plancher fini sur le silence absolu', () => {
  assertTrue(Number.isFinite(toDb(0)), 'toDb(0) doit rester fini');
  assertClose(toDb(1), 0, 1e-9);
  assertClose(toDb(0.1), -20, 1e-6);
});

runTest('T02 — percentile interpole et borne', () => {
  assertEqual(percentile([0, 10], 0.5), 5);
  assertEqual(percentile([1, 2, 3, 4], 0), 1);
  assertEqual(percentile([1, 2, 3, 4], 1), 4);
  assertEqual(percentile([], 0.5), 0);
});

runTest('T03 — enveloppe : longueur et résolution attendues', () => {
  const samples = new Float32Array(SR); // 1 seconde
  const env = computeEnergyEnvelope(samples, SR, { frameMs: 25, hopMs: 10 });
  assertClose(env.hopSec, 0.01, 1e-9, 'pas de 10 ms');
  assertClose(env.duration, 1, 1e-9);
  assertTrue(env.frameCount > 90 && env.frameCount <= 100, `frameCount=${env.frameCount}`);
});

runTest('T04 — enveloppe : RMS d\'un sinus plein vaut 1/√2', () => {
  const n = SR;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * 200 * i) / SR);
  const env = computeEnergyEnvelope(samples, SR);
  assertClose(env.rms[10], Math.SQRT1_2, 0.02, 'RMS sinus');
});

runTest('T05 — seuils dérivés du signal, pas fixés en dB', () => {
  // Deux signaux de dynamique identique mais de niveau global très différent
  // doivent produire des seuils décalés d'autant : la détection ne dépend
  // donc pas du volume absolu du stem.
  const fort = segmentationFor(6, [[1, 2.5], [3.5, 5]], { signal: { level: 0.5, noise: 0.002 } });
  const faible = segmentationFor(6, [[1, 2.5], [3.5, 5]], { signal: { level: 0.05, noise: 0.0002 } });
  assertEqual(fort.phrases.length, 2, 'signal fort');
  assertEqual(faible.phrases.length, 2, 'signal faible');
  assertTrue(faible.thresholds.highDb < fort.thresholds.highDb - 10,
    'les seuils doivent suivre le niveau du signal');
});

runTest('T06 — deux phrases séparées par une vraie respiration', () => {
  const seg = segmentationFor(6, [[1, 2.5], [3.5, 5]]);
  assertEqual(seg.phrases.length, 2, 'nombre de phrases');
  assertClose(seg.phrases[0].start, 1, 0.06, 'début phrase 1');
  assertClose(seg.phrases[0].end, 2.5, 0.06, 'fin phrase 1');
  assertClose(seg.phrases[1].start, 3.5, 0.06, 'début phrase 2');
});

runTest('T07 — un silence plus court que minGapSec ne coupe pas la phrase', () => {
  // 150 ms de silence au milieu : c'est une articulation, pas une respiration.
  const seg = segmentationFor(6, [[1, 2.0], [2.15, 3.2]]);
  assertEqual(seg.phrases.length, 1, 'les deux moitiés doivent fusionner');
  assertClose(seg.phrases[0].start, 1, 0.06);
  assertClose(seg.phrases[0].end, 3.2, 0.06);
});

runTest('T08 — minGapSec est réglable et change le découpage', () => {
  const spans = [[1, 2.0], [2.5, 3.5]]; // 500 ms de silence
  const large = segmentationFor(5, spans, { phrase: { minGapSec: 0.8 } });
  const fin = segmentationFor(5, spans, { phrase: { minGapSec: 0.3 } });
  assertEqual(large.phrases.length, 1, 'seuil large → une seule phrase');
  assertEqual(fin.phrases.length, 2, 'seuil fin → deux phrases');
});

runTest('T09 — bribe plus courte que minPhraseSec écartée', () => {
  const seg = segmentationFor(6, [[1, 1.1], [3, 4.5]]); // 100 ms puis 1,5 s
  assertEqual(seg.phrases.length, 1, 'la bribe de 100 ms ne doit pas compter');
  assertClose(seg.phrases[0].start, 3, 0.06);
});

runTest('T10 — intro et coda marquées, respirations internes distinguées', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  const leading = seg.gaps.filter((g) => g.leading);
  const trailing = seg.gaps.filter((g) => g.trailing);
  const internal = seg.gaps.filter((g) => !g.leading && !g.trailing);
  assertEqual(leading.length, 1, 'une intro');
  assertEqual(trailing.length, 1, 'une coda');
  assertEqual(internal.length, 1, 'une respiration interne');
  assertClose(internal[0].start, 2.5, 0.06);
  assertClose(internal[0].end, 4, 0.06);
});

runTest('T11 — durées chantée et silencieuse cohérentes', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  assertClose(seg.sungDuration, 3.0, 0.15, 'temps chanté');
  assertClose(seg.sungDuration + seg.silentDuration, seg.duration, 1e-6, 'partition du temps');
});

runTest('T12 — refus : stem plat (morceau instrumental ou séparation ratée)', () => {
  const seg = segmentationFor(8, [], { signal: { noise: 0.002 } });
  const verdict = assessVocalStem(seg);
  assertEqual(verdict.usable, false);
  assertEqual(verdict.reason, 'FlatStem');
  assertTrue(verdict.message.length > 0, 'un message affichable est requis');
});

runTest('T13 — refus : trop peu de phrases pour juger', () => {
  const seg = segmentationFor(20, [[1, 2.5]]);
  const verdict = assessVocalStem(seg);
  assertEqual(verdict.usable, false);
  assertEqual(verdict.reason, 'TooFewPhrases');
});

runTest('T14 — refus : voix quasi absente sur la région', () => {
  const seg = segmentationFor(60, [[1, 1.4], [3, 3.4], [5, 5.4]]);
  const verdict = assessVocalStem(seg);
  assertEqual(verdict.usable, false);
  assertEqual(verdict.reason, 'MostlySilent');
});

runTest('T15 — acceptation d\'un stem normal', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const verdict = assessVocalStem(seg);
  assertEqual(verdict.usable, true, verdict.message || '');
  assertEqual(verdict.reason, null);
});

// ===========================================================================
// accompaniment-metrics.js — outils d'intervalles
// ===========================================================================

runTest('T16 — fusion d\'intervalles chevauchants', () => {
  const merged = mergeIntervals([
    { start: 0, end: 2 }, { start: 1, end: 3 }, { start: 5, end: 6 },
  ]);
  assertEqual(merged.length, 2);
  assertEqual(merged[0].end, 3);
  assertEqual(merged[1].start, 5);
});

runTest('T17 — fusion ignore les intervalles vides ou inversés', () => {
  const merged = mergeIntervals([
    { start: 2, end: 2 }, { start: 5, end: 3 }, { start: 0, end: 1 },
  ]);
  assertEqual(merged.length, 1);
  assertEqual(merged[0].start, 0);
});

runTest('T18 — intersection sans double comptage des notes simultanées', () => {
  // Trois notes d'un accord plaqué couvrent le même instant : le temps
  // d'occupation doit valoir 1 s, pas 3 s.
  const accord = [
    { start: 0, end: 1 }, { start: 0, end: 1 }, { start: 0, end: 1 },
  ];
  assertClose(intersectionDuration(accord, [{ start: 0, end: 1 }]), 1, 1e-9);
  assertClose(totalDuration(accord), 1, 1e-9);
});

runTest('T19 — intersection partielle', () => {
  assertClose(intersectionDuration(
    [{ start: 0, end: 2 }], [{ start: 1, end: 5 }]), 1, 1e-9);
  assertClose(intersectionDuration(
    [{ start: 0, end: 1 }], [{ start: 2, end: 3 }]), 0, 1e-9);
});

runTest('T20 — alignement des notes : origine de capture ramenée au stem', () => {
  const notes = [
    { midi: 60, startedAt: 1000.5, endedAt: 1001.0, velocity: 0.8 },
    { midi: 64, startedAt: 1002.0, endedAt: 1002.4, velocity: 0.8 },
  ];
  const aligned = alignPianoNotes(notes, { captureOriginSec: 1000, stemOriginSec: 0 });
  assertClose(aligned[0].start, 0.5, 1e-9);
  assertClose(aligned[1].start, 2.0, 1e-9);
});

runTest('T21 — alignement : correction de latence négative recule les notes', () => {
  const notes = [{ midi: 60, startedAt: 1001.0, endedAt: 1001.5, velocity: 0.8 }];
  const aligned = alignPianoNotes(notes, { captureOriginSec: 1000, offsetSec: -0.057 });
  assertClose(aligned[0].start, 0.943, 1e-9, '57 ms de retard mesuré → note reculée');
});

runTest('T22 — alignement : décalage de départ dans le stem pris en compte', () => {
  const notes = [{ midi: 60, startedAt: 500.0, endedAt: 500.5, velocity: 0.8 }];
  const aligned = alignPianoNotes(notes, { captureOriginSec: 500, stemOriginSec: 12 });
  assertClose(aligned[0].start, 12, 1e-9);
});

runTest('T23 — comptage d\'attaques borné à l\'intervalle', () => {
  const notes = [pianoNote(60, 0.5, 1), pianoNote(62, 1.5, 2), pianoNote(64, 2.5, 3)];
  assertEqual(countOnsets(notes, 0, 2), 2);
  assertEqual(countOnsets(notes, 1.5, 2.5), 1, 'borne haute exclue');
  assertEqual(countOnsets(notes, 10, 20), 0);
});

// ===========================================================================
// Couche 1 — l'espace
// ===========================================================================

runTest('T24 — recouvrement nul : le piano ne joue que dans les respirations', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  // Notes placées franchement dans les deux respirations internes.
  const notes = [pianoNote(60, 2.8, 3.2), pianoNote(64, 5.8, 6.2)];
  const space = computeSpaceMetrics(seg, notes);
  assertClose(space.overlap.ratio, 0, 1e-9, 'aucun recouvrement');
  assertEqual(space.gapFill.gapCount, 2);
  assertEqual(space.gapFill.answeredCount, 2, 'les deux vides sont remplis');
  assertEqual(space.gapFill.answeredRatio, 1);
});

runTest('T25 — recouvrement total : le piano joue en continu sous la voix', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const notes = [pianoNote(60, 0, 10)];
  const space = computeSpaceMetrics(seg, notes);
  assertClose(space.overlap.ratio, 1, 0.02, 'recouvrement total');
  assertClose(space.gapFill.coverageRatio, 1, 0.02);
});

runTest('T26 — densité : rapport > 1 quand on joue plus sous la voix', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const notes = [];
  // 12 attaques sous la voix, 1 seule dans un vide.
  for (let i = 0; i < 12; i++) notes.push(pianoNote(60 + i, 0.6 + i * 0.15, 0.7 + i * 0.15));
  notes.push(pianoNote(72, 2.9, 3.1));
  const space = computeSpaceMetrics(seg, notes);
  assertEqual(space.density.onsetsDuringSinging, 12);
  assertEqual(space.density.onsetsDuringGaps, 1);
  assertTrue(space.density.ratio > 1, `ratio=${space.density.ratio}`);
});

runTest('T27 — densité : rapport < 1 quand on rebondit dans les vides', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const notes = [pianoNote(60, 0.8, 1.0)];
  for (let i = 0; i < 6; i++) notes.push(pianoNote(64 + i, 2.6 + i * 0.06, 2.7 + i * 0.06));
  const space = computeSpaceMetrics(seg, notes);
  assertTrue(space.density.ratio < 1, `ratio=${space.density.ratio}`);
});

runTest('T28 — détail par phrase : indices, bornes et compte d\'attaques', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const notes = [pianoNote(60, 4.0, 4.5), pianoNote(62, 4.6, 5.0)];
  const space = computeSpaceMetrics(seg, notes);
  assertEqual(space.phrases.length, 3);
  assertEqual(space.phrases[0].onsetCount, 0, 'phrase 1 laissée libre');
  assertEqual(space.phrases[1].onsetCount, 2, 'phrase 2 chargée');
  assertEqual(space.phrases[2].onsetCount, 0);
  assertTrue(space.phrases[1].overlapRatio > 0.4, 'phrase 2 majoritairement couverte');
});

runTest('T29 — vide non rempli identifié nommément', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const notes = [pianoNote(60, 2.8, 3.2)]; // premier vide seulement
  const space = computeSpaceMetrics(seg, notes);
  assertEqual(space.gapFill.answeredCount, 1);
  const missed = space.gapFill.gaps.filter((g) => !g.answered);
  assertEqual(missed.length, 1);
  assertClose(missed[0].start, 5.5, 0.1, 'le vide manqué est bien le second');
});

runTest('T30 — aucune note jouée : métriques nulles, pas de division par zéro', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const space = computeSpaceMetrics(seg, []);
  assertEqual(space.noteCount, 0);
  assertEqual(space.overlap.ratio, 0);
  assertEqual(space.gapFill.answeredCount, 0);
  assertTrue(space.density.ratio === null || space.density.ratio === 0);
});

// ===========================================================================
// Couche 2 — le registre
// ===========================================================================

runTest('T31 — registre indisponible sans suivi de hauteur', () => {
  const reg = computeRegisterMetrics([pianoNote(60, 0, 1)], []);
  assertEqual(reg.available, false);
  assertEqual(reg.reason, 'NoVocalPitch');
  assertEqual(reg.confidence, 'low');
});

runTest('T32 — tessiture et empiètement serré mesurés', () => {
  const vocals = [
    { midi: 67, start: 0, end: 1 },
    { midi: 69, start: 1, end: 2 },
  ];
  // Une note à l'unisson de la voix, une deux octaves plus bas.
  const piano = [pianoNote(67, 0, 1), pianoNote(43, 1, 2)];
  const reg = computeRegisterMetrics(piano, vocals);
  assertEqual(reg.available, true);
  assertEqual(reg.tessitura.minMidi, 67);
  assertEqual(reg.tessitura.maxMidi, 69);
  assertClose(reg.clash.ratio, 0.5, 1e-9, 'la moitié du temps simultané est en collision');
  assertEqual(reg.insideTessitura.count, 1);
});

runTest('T33 — registre : confiance basse et absence d\'attribution de main', () => {
  const reg = computeRegisterMetrics(
    [pianoNote(60, 0, 1)], [{ midi: 60, start: 0, end: 1 }]);
  assertEqual(reg.confidence, 'low');
  assertEqual(reg.handAttribution, false);
  assertTrue(reg.confidenceNote.includes('0,48'), 'le F1 réel doit être rappelé');
});

runTest('T34 — jouer à l\'octave ne compte pas comme empiètement serré', () => {
  const vocals = [{ midi: 72, start: 0, end: 2 }];
  const piano = [pianoNote(60, 0, 2)]; // une octave en dessous
  const reg = computeRegisterMetrics(piano, vocals);
  assertClose(reg.clash.ratio, 0, 1e-9);
  assertClose(reg.sameOctave.ratio, 0, 1e-9, '12 demi-tons exclus');
  assertEqual(reg.insideTessitura.count, 0);
});

// ===========================================================================
// analyzeAccompaniment — assemblage
// ===========================================================================

runTest('T35 — analyse complète : structure et traçabilité', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const analysis = analyzeAccompaniment({
    segmentation: seg,
    pianoNotes: [pianoNote(60, 2.8, 3.2)],
    style: 'gospel',
    offsetSec: -0.057,
  });
  assertEqual(analysis.style, 'gospel');
  assertClose(analysis.offsetSec, -0.057, 1e-9, 'la latence appliquée est tracée');
  assertEqual(analysis.segmentation.phraseCount, 3);
  assertEqual(analysis.space.layer, 'space');
  assertEqual(analysis.space.confidence, 'high');
  assertEqual(analysis.register.available, false, 'pas de voix extraite → couche 2 absente');
});

// ===========================================================================
// coach-report.js — les trois parties et la discipline de calibration
// ===========================================================================

function reportFor(notes, options = {}) {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const analysis = analyzeAccompaniment({ segmentation: seg, pianoNotes: notes, ...options });
  return { analysis, report: buildCoachReport(analysis) };
}

runTest('T36 — le rapport a toujours ses trois parties non vides', () => {
  const { report } = reportFor([pianoNote(60, 2.8, 3.2)]);
  assertTrue(report.strengths.length > 0, 'ce qui va bien');
  assertTrue(report.blockers.length > 0, 'ce qui bloque');
  assertTrue(report.toLighten.length > 0, 'ce qui gagnerait à être allégé');
});

runTest('T37 — aucun seuil de jugement n\'est déclaré calibré', () => {
  const notes = [];
  for (let i = 0; i < 14; i++) notes.push(pianoNote(60 + (i % 6), 0.6 + i * 0.13, 0.7 + i * 0.13));
  const { report } = reportFor(notes);
  assertEqual(report.calibration.calibrated, false);
  const all = [...report.strengths, ...report.blockers, ...report.toLighten, ...report.facts];
  assertTrue(all.length > 0);
  for (const f of all) {
    assertEqual(f.calibrated, false, `« ${f.text.slice(0, 40)}… » ne doit pas se dire calibrée`);
    assertTrue(['fact', 'ranking', 'direction'].includes(f.basis),
      `base « ${f.basis} » interdite : seuls fait, classement et sens sont autorisés`);
  }
});

runTest('T38 — jeu trop dense sous la voix : signalé comme blocage de sens', () => {
  const notes = [];
  for (let i = 0; i < 14; i++) notes.push(pianoNote(60 + (i % 6), 0.6 + i * 0.13, 0.7 + i * 0.13));
  const { report } = reportFor(notes);
  // Ici tout tombe sous la voix et rien dans les vides : c'est le cas extrême,
  // signalé par son propre constat plutôt que par un rapport de densités
  // (qui serait une division par zéro).
  const inverted = report.blockers.find(
    (f) => f.id === 'density-all-under-voice' || f.id === 'density-inverted');
  assertTrue(!!inverted, 'la densité inversée doit être relevée');
  assertEqual(inverted.basis, 'direction');
  assertTrue(report.replay.some((r) => r.kind === 'gap'),
    'les respirations manquées doivent rester réécoutables');
});

runTest('T38b — densité inversée sans être extrême : rapport chiffré', () => {
  const notes = [];
  for (let i = 0; i < 12; i++) notes.push(pianoNote(60 + (i % 6), 0.6 + i * 0.14, 0.7 + i * 0.14));
  notes.push(pianoNote(72, 2.9, 3.1)); // une seule réponse dans un vide
  const { report } = reportFor(notes);
  const inverted = report.blockers.find((f) => f.id === 'density-inverted');
  assertTrue(!!inverted, 'le rapport de densités doit être calculé et commenté');
  assertEqual(inverted.basis, 'direction');
});

runTest('T39 — jeu qui rebondit dans les vides : reconnu comme réussite', () => {
  const notes = [pianoNote(60, 0.8, 1.0)];
  for (let i = 0; i < 6; i++) notes.push(pianoNote(64 + i, 2.6 + i * 0.06, 2.7 + i * 0.06));
  const { report } = reportFor(notes);
  assertTrue(!!report.strengths.find((f) => f.id === 'density-correct'),
    'le bon réflexe doit être nommé');
});

runTest('T40 — classement des phrases les plus couvertes, avec réécoute', () => {
  const notes = [pianoNote(60, 3.6, 5.4)]; // couvre la phrase 2
  const { report } = reportFor(notes);
  const ranking = report.toLighten.find((f) => f.id === 'densest-phrases');
  assertTrue(!!ranking, 'un classement doit être produit');
  assertEqual(ranking.basis, 'ranking');
  assertTrue(ranking.text.includes('n° 2'), `phrase 2 attendue dans « ${ranking.text} »`);
  assertTrue(report.replay.some((r) => r.kind === 'phrase' && r.label === 'Phrase 2'),
    'la phrase doit être réécoutable');
});

runTest('T41 — vides partiellement remplis : ceux manqués sont nommés et réécoutables', () => {
  // Le premier vide reçoit une réponse, le second non : c'est le cas courant,
  // distinct du cas extrême couvert par T38.
  const { report } = reportFor([pianoNote(60, 0.8, 1.0), pianoNote(64, 2.8, 3.2)]);
  const missed = report.blockers.find((f) => f.id === 'gaps-unanswered');
  assertTrue(!!missed, 'les vides manqués doivent être relevés');
  assertTrue(!!report.strengths.find((f) => f.id === 'gaps-answered'),
    'et ceux qui ont reçu une réponse portés au crédit');
  assertTrue(report.replay.some((r) => r.kind === 'gap'), 'et réécoutables');
});

runTest('T42 — séance sans une note : dit explicitement qu\'il n\'y a rien à analyser', () => {
  const { report } = reportFor([]);
  assertEqual(report.empty, true);
  assertEqual(report.strengths.length, 0);
  assertTrue(report.blockers[0].text.includes('Aucune note'));
});

runTest('T43 — la note de calibration est toujours présente et honnête', () => {
  const { report } = reportFor([pianoNote(60, 2.8, 3.2)]);
  assertEqual(report.calibration.calibrated, false);
  assertTrue(report.calibration.text.includes('pas encore'),
    'le rapport doit dire que le seuil n\'existe pas encore');
});

runTest('T44 — couche 2 : ses observations portent la confiance basse', () => {
  const seg = segmentationFor(10, [[0.5, 2.5], [3.5, 5.5], [6.5, 8.5]]);
  const analysis = analyzeAccompaniment({
    segmentation: seg,
    pianoNotes: [pianoNote(67, 0.6, 2.4)],
    vocalNotes: [{ midi: 67, start: 0.5, end: 2.5 }],
  });
  const report = buildCoachReport(analysis);
  const registerFindings = [...report.toLighten, ...report.facts]
    .filter((f) => f.metric && f.metric.startsWith('register.'));
  assertTrue(registerFindings.length > 0, 'la couche 2 doit produire quelque chose');
  for (const f of registerFindings) {
    assertEqual(f.confidence, 'low', 'toute observation de registre est une tendance');
  }
});

runTest('T45 — formatage : temps, pourcentages et noms de notes', () => {
  assertEqual(formatTime(0), '0:00');
  assertEqual(formatTime(65), '1:05');
  assertEqual(formatTime(-1), '—');
  assertEqual(formatPercent(0.5), '50 %');
  assertEqual(formatPercent(null), '—');
  assertEqual(midiToName(60), 'Do4');
  assertEqual(midiToName(69), 'La4');
});

// ===========================================================================
// latency-probe.js — agrégation robuste
// ===========================================================================

runTest('T46 — médiane et écart absolu médian', () => {
  assertEqual(median([3, 1, 2]), 2);
  assertEqual(median([4, 1, 2, 3]), 2.5);
  assertEqual(median([]), null);
  assertEqual(medianAbsoluteDeviation([10, 12, 14], 12), 2);
});

runTest('T47 — trop peu de frappes : refus explicite, pas de chiffre inventé', () => {
  const summary = summarizeTapOffsets([50, 52, 48]);
  assertEqual(summary.status, 'insufficient');
  assertEqual(summary.offsetMs, null);
  assertEqual(summary.correctionSec, null);
});

runTest('T48 — mesure stable : correction opposée au retard mesuré', () => {
  const summary = summarizeTapOffsets([55, 57, 59, 56, 58, 57]);
  assertEqual(summary.status, 'ok');
  assertClose(summary.offsetMs, 57, 1.5);
  assertClose(summary.correctionSec, -0.057, 0.002,
    'un retard de 57 ms se corrige en reculant les notes de 57 ms');
});

runTest('T49 — une frappe manquée est écartée sans fausser la mesure', () => {
  const summary = summarizeTapOffsets([55, 57, 59, 56, 58, 57, 900]);
  assertEqual(summary.status, 'ok');
  assertEqual(summary.rejectedTaps, 1);
  assertClose(summary.offsetMs, 57, 2, 'la valeur aberrante ne doit pas tirer la médiane');
});

runTest('T50 — frappes trop dispersées : refus plutôt que fausse précision', () => {
  const summary = summarizeTapOffsets([10, 200, 400, 90, 350, 30, 500]);
  assertTrue(summary.status !== 'ok' || summary.spreadMs > 50,
    'une série incohérente ne doit pas produire une correction confiante');
});

// ===========================================================================
// Base de temps commune mesure / réécoute
// ===========================================================================
//
// La réécoute rejoue la voix ET ce qui a été joué, à partir de la MelodyTrack
// de la séance. Pour que la superposition montre la vérité, les temps de cette
// piste doivent être EXACTEMENT ceux sur lesquels la mesure a été faite. C'est
// obtenu en donnant à la piste, pour origine, l'instant de départ du stem
// corrigé de la latence. Ces tests verrouillent cette égalité : s'ils cassent,
// le rapport et la réécoute ne parlent plus du même instant.

runTest('T51 — MelodyTrack et notes alignées partagent la même base de temps', () => {
  const capture = createMidiCapture({ getTime: (() => {
    // Horloge factice : 1000 s, 1000,5 s, 1001,2 s… en millisecondes.
    const stamps = [1000000, 1000500, 1001200, 1001900];
    let i = 0;
    return () => stamps[Math.min(i++, stamps.length - 1)];
  })() });
  capture.noteOn(60, 0.8, 0, 'coach-live');
  capture.noteOff(60, 0, 0, 'coach-live');
  capture.noteOn(64, 0.8, 0, 'coach-live');
  capture.noteOff(64, 0, 0, 'coach-live');
  capture.finalize('session-stop');

  const notes = capture.getNotes();
  const captureOriginSec = 999.8;
  const offsetSec = -0.057;

  const aligned = alignPianoNotes(notes, { captureOriginSec, stemOriginSec: 0, offsetSec });
  const track = createMelodyTrack(
    { notes, sourceCaptureId: 'coach-live', startedAt: captureOriginSec - offsetSec },
    { name: 'Séance', harmonizationPolicy: 'automatic' },
  );

  assertEqual(track.events.length, aligned.length, 'même nombre d\'événements');
  for (let i = 0; i < aligned.length; i++) {
    assertClose(track.events[i].startedAt, aligned[i].start, 1e-9,
      `événement ${i} : début identique`);
    assertClose(track.events[i].endedAt, aligned[i].end, 1e-9,
      `événement ${i} : fin identique`);
    assertEqual(track.events[i].midi, aligned[i].midi, `événement ${i} : hauteur identique`);
  }
});

runTest('T52 — la piste de séance reste valide au sens du moteur canonique', () => {
  const capture = createMidiCapture({ getTime: (() => {
    const stamps = [500000, 500400, 500900, 501300];
    let i = 0;
    return () => stamps[Math.min(i++, stamps.length - 1)];
  })() });
  capture.noteOn(67, 0.7, 0, 'coach-live');
  capture.noteOff(67, 0, 0, 'coach-live');
  capture.noteOn(71, 0.7, 0, 'coach-live');
  capture.noteOff(71, 0, 0, 'coach-live');
  capture.finalize('session-stop');

  const track = createMelodyTrack(
    { notes: capture.getNotes(), sourceCaptureId: 'coach-live', startedAt: 499.9 },
    { name: 'Séance', harmonizationPolicy: 'automatic' },
  );
  const validation = validateMelodyTrack(track);
  assertTrue(validation.valid, (validation.errors || []).join('; '));
});

// ===========================================================================
// restrictToWindow — travailler un passage, pas tout le morceau
// ===========================================================================
//
// Retour 1 de Narcisse. Le contrat verrouillé par ces tests :
//   - une phrase à cheval sur une borne est CLIPPÉE, pas exclue ;
//   - les temps restent en temps ABSOLU du morceau (la réécoute, branchée
//     sur le stem complet, ne doit rien convertir) ;
//   - un silence en tête de fenêtre n'est pas la vraie intro du morceau :
//     il n'hérite du flag `leading` que si la fenêtre commence à 0 ;
//   - `sungDuration`/`silentDuration`/`duration` sont recalculés sur la
//     fenêtre, pas hérités du morceau entier.

runTest('T53 — fenêtre entière : la segmentation restreinte est identique (aux bornes près)', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  const full = restrictToWindow(seg, 0, 8);
  assertEqual(full.phrases.length, 2, 'les deux phrases restent');
  assertEqual(full.gaps.length, 3, 'intro, respiration et coda restent');
  assertClose(full.duration, 8, 1e-6, 'durée = fenêtre entière');
  assertClose(full.sungDuration, seg.sungDuration, 0.01, 'temps chanté conservé');
  assertClose(full.silentDuration, seg.silentDuration, 0.01, 'temps silencieux conservé');
  // Une fenêtre qui couvre tout doit garder l'intro et la coda marquées.
  assertEqual(full.gaps.filter((g) => g.leading).length, 1, 'l\'intro reste leading');
  assertEqual(full.gaps.filter((g) => g.trailing).length, 1, 'la coda reste trailing');
});

runTest('T54 — phrase entièrement dans la fenêtre conservée, phrase hors fenêtre supprimée', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  const restricted = restrictToWindow(seg, 0.5, 3);
  // La première phrase chevauche légèrement la borne haute (2,5 ≤ 3) : elle
  // reste ; la seconde (4 → 5,5) est entièrement hors fenêtre : elle disparaît.
  assertEqual(restricted.phrases.length, 1, 'une seule phrase dans la fenêtre');
  assertClose(restricted.phrases[0].start, 1, 0.06, 'début inchangé, temps absolu');
  assertClose(restricted.phrases[0].end, 2.5, 0.06, 'fin inchangée');
  assertEqual(restricted.phrases[0].index, 0, 'index renuméroté depuis la fenêtre');
  assertEqual(restricted.duration, 2.5, 1e-9, 'durée = windowEnd - windowStart');
});

runTest('T54b — phrase à cheval sur une borne : clippée, pas exclue', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  // La fenêtre commence AU MILIEU de la première phrase et coupe la seconde.
  const restricted = restrictToWindow(seg, 1.5, 4.7);
  assertEqual(restricted.phrases.length, 2, 'les deux phrases chevauchent : toutes deux restent');
  assertClose(restricted.phrases[0].start, 1.5, 0.01, 'début clippé à la borne de fenêtre');
  assertClose(restricted.phrases[0].end, 2.5, 0.06, 'fin inchangée');
  assertClose(restricted.phrases[1].start, 4, 0.06);
  assertClose(restricted.phrases[1].end, 4.7, 0.01, 'fin clippée à la borne de fenêtre');
  // Les temps restent ABSOLUS : rien n'est rebase à 0.
  assertTrue(restricted.phrases[0].start > 1 && restricted.phrases[1].start > 3,
    'temps absolus conservés');
  assertClose(restricted.sungDuration,
    (2.5 - 1.5) + (4.7 - 4), 0.05, 'temps chanté recalculé sur les intervalles clippés');
  assertClose(restricted.sungDuration + restricted.silentDuration,
    restricted.duration, 1e-6, 'partition du temps sur la fenêtre');
});

runTest('T55 — silence en tête de fenêtre : pas l\'intro du morceau', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  // Fenêtre [2, 6] : elle commence dans le vide entre les deux phrases, mais
  // ce vide est une respiration INTERNE du morceau, pas son intro.
  const restricted = restrictToWindow(seg, 2, 6);
  assertEqual(restricted.gaps.length, 2, 'un vide en tête, un en pied de fenêtre');
  assertEqual(restricted.gaps[0].leading, false,
    'le vide en tête de fenêtre n\'est pas la vraie intro : pas de flag leading');
  assertEqual(restricted.gaps[0].trailing, false, 'et pas une coda non plus');
  // Le vide en pied [5,5 → 6] est la vraie coda du morceau CLIPPÉE : la
  // fenêtre ne couvre pas sa fin, mais c'en est bien une — le flag reste.
  assertEqual(restricted.gaps[1].trailing, true, 'la vraie coda clippée reste trailing');
  assertEqual(restricted.gaps[1].leading, false);
  // Contraste : la même segmentation non restreinte a bien une intro marquée.
  assertEqual(seg.gaps.filter((g) => g.leading).length, 1, 'contraste : l\'intro existe bien dans l\'original');
});

runTest('T56 — les métriques d\'espace portent sur la fenêtre, base temps absolu', () => {
  // Bout en bout : restreindre PUIS mesurer doit donner le même résultat que
  // ce que le câblage de coach-tab.js produira (restrictToWindow après
  // detectVocalPhrases, notes alignées avec stemOriginSec = début de région).
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  const regionStart = 2;
  const regionEnd = 6;
  const restricted = restrictToWindow(seg, regionStart, regionEnd);

  // Le piano n'a joué que dans la respiration interne clippée (2,5 → 4).
  const notes = [pianoNote(60, 3.0, 3.4)];
  const space = computeSpaceMetrics(restricted, notes);

  assertEqual(space.analyzedDuration, regionEnd - regionStart, 'durée analysée = fenêtre');
  assertEqual(space.gapFill.gapCount, 1, 'seule la respiration interne compte');
  assertEqual(space.gapFill.answeredCount, 1, 'elle a reçu une réponse');
  assertClose(space.overlap.ratio, 0, 1e-9, 'aucun recouvrement : la note tombe dans le vide');
  // Le flag leading de la segmentation restreinte ne doit pas masquer le vide
  // de tête de fenêtre au point de le retirer des respirations mesurables :
  // il n'est PAS leading, donc il reste interne.
  assertTrue(restricted.gaps[0].leading === false, 'le vide de tête reste une respiration');
});

runTest('T56b — fenêtre dégénérée : bornes échangées ou nulles ne plantent pas', () => {
  const seg = segmentationFor(8, [[1, 2.5], [4, 5.5]]);
  // Bornes échangées : ordonnées automatiquement, comme une région tracée
  // de droite à gauche dans le Studio. La fenêtre [2, 6] contient bien les
  // deux phrases partiellement.
  const swapped = restrictToWindow(seg, 6, 2);
  assertEqual(swapped.phrases.length, 2, 'fenêtre réordonnée [2, 6] : les deux phrases clippées restent');
  assertEqual(swapped.duration, 4, 1e-9, 'bornes ordonnées automatiquement');
  const zero = restrictToWindow(seg, 3, 3);
  assertEqual(zero.phrases.length, 0);
  assertEqual(zero.duration, 0);
  assertEqual(zero.sungDuration, 0);
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;

// [Claude] — 2026-09-05 — Tests du moteur Pédagogie IA.
// Exécutable avec : node src/pedagogie/test-pedagogie-engine.js
//
// Les claviers utilisés ici sont SYNTHÉTIQUES : ils sont peints par le test,
// avec une géométrie et des touches allumées connues exactement. C'est ce qui
// permet de vérifier que la détection retrouve la bonne note, au lieu de
// seulement constater qu'elle retrouve quelque chose. La validation sur le
// fichier réel de Narcisse est faite séparément (voir docs/PEDAGOGIE_IA.md) :
// elle demande ffmpeg et une vidéo, deux choses qu'une suite de tests unitaires
// ne doit pas exiger.

import { createBlankFrame, createFrame, fillRect, getPixel, getLuma, sampleMedian } from './frame.js';
import {
  detectKeyboardGeometry, findStrikeLine, findBlackKeys, groupBlackKeys,
  classifyBlackGroups, findWhiteGrid, detectStaticKeyboardGeometry,
  detectSynthesiaGeometry, DETECTION_STRATEGIES,
} from './keyboard-geometry.js';
import { readLitKeys, classifyTint, toMidiList, splitHands } from './key-detection.js';
import { denoiseSamples, bassLine, groupSegments } from './note-grouping.js';
import { labelNotes, labelSegments, mergeSameLabel } from './chord-labeling.js';
import { detectVideoFormat, FORMATS, explainUnrecognised } from './format-detector.js';
import { crossCheck, DIVERGENCE, rootPitchClass, isMinorLabel } from './cross-check.js';
import { collectConcepts, collectMissing, getEntry, GLOSSARY, noNarrationState } from './glossary.js';
import { normalizeAnalyzerChords } from './audio-fallback.js';
import { normalizeTranscription, alignNarration, joinNarrationText } from './transcription.js';
import { NARRATION_REASON } from './glossary.js';
import { buildVideoAnalysis, buildAudioOnlyAnalysis } from './video-analysis.js';

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
function assertClose(actual, expected, tol, msg = '') {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    throw new Error(`${msg} attendu ${expected} ±${tol}, obtenu ${actual}`);
  }
}
function assertDeep(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} attendu ${e}, obtenu ${a}`);
}

// ---------------------------------------------------------------------------
// Fabrique de clavier synthétique
// ---------------------------------------------------------------------------

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
// Position des noires, en largeurs de touche blanche depuis le bord gauche du
// do. Ces proportions imitent un vrai clavier (les noires ne sont pas centrées
// sur les frontières), pour que le test ne valide pas une géométrie idéalisée.
const BLACK_OFFSETS = { 1: 0.95, 3: 2.10, 6: 3.90, 8: 5.02, 10: 6.12 };

/**
 * Peint un clavier de `octaves` octaves à partir de do, avec les touches
 * indiquées allumées. Retourne l'image et la table note MIDI → attendue.
 *
 * @param {object} [options]
 * @param {number} [options.octaves]
 * @param {number} [options.whiteW]
 * @param {Object.<number, number[]>} [options.lit]
 * @param {number} [options.lowestMidi]
 * @param {boolean} [options.withStrikeLine] - faux pour simuler un clavier statique
 * @param {number} [options.kbTopOverride] - forcer le haut du clavier (clavier statique)
 * @param {number} [options.kbBottomOverride] - forcer le bas du clavier (clavier statique)
 */
function makeKeyboard({ octaves = 3, whiteW = 22, lit = {}, lowestMidi = 48, withStrikeLine = true, kbTopOverride = null, kbBottomOverride = null } = {}) {
  const whiteCount = octaves * 7 + 1;
  const width = Math.round(whiteCount * whiteW);
  const height = 300;
  const strikeY = 120;
  const kbTop = kbTopOverride ?? (withStrikeLine ? strikeY + 4 : 150);
  const kbBottom = kbBottomOverride ?? 280;
  const blackBottom = kbTop + Math.round((kbBottom - kbTop) * 0.6);

  const frame = createBlankFrame(width, height, [16, 16, 22]);
  // Ligne de frappe rouge (optionnelle).
  if (withStrikeLine) {
    fillRect(frame, 0, strikeY, width, 3, [200, 40, 40]);
  }

  // Touches blanches + séparations.
  for (let i = 0; i < whiteCount; i++) {
    const x = Math.round(i * whiteW);
    const midi = lowestMidi + Math.floor(i / 7) * 12 + WHITE_STEPS[i % 7];
    const color = lit[midi] || [244, 244, 244];
    fillRect(frame, x, kbTop, Math.round(whiteW) - 1, kbBottom - kbTop, color);
    fillRect(frame, x + Math.round(whiteW) - 1, kbTop, 1, kbBottom - kbTop, [10, 10, 10]);
  }
  // Bas du clavier : bande sombre, pour que la recherche de bornes s'arrête.
  fillRect(frame, 0, kbBottom, width, height - kbBottom, [4, 4, 4]);

  // Touches noires.
  const blackW = Math.round(whiteW * 0.58);
  for (let oct = 0; oct < octaves; oct++) {
    for (const [semi, off] of Object.entries(BLACK_OFFSETS)) {
      const midi = lowestMidi + oct * 12 + Number(semi);
      const cx = (oct * 7 + Number(off)) * whiteW;
      const x = Math.round(cx - blackW / 2);
      const color = lit[midi] || [18, 18, 18];
      fillRect(frame, x, kbTop, blackW, blackBottom - kbTop, color);
    }
  }
  return { frame, strikeY, whiteCount, lowestMidi };
}

const BLUE = [120, 165, 225];
const GREEN = [140, 200, 85];

// ===========================================================================
// frame.js
// ===========================================================================

runTest('T01 — createFrame refuse un tampon trop court', () => {
  let threw = false;
  try { createFrame(new Uint8Array(10), 100, 100, 3); } catch (_) { threw = true; }
  assertTrue(threw, 'un tampon insuffisant doit lever');
});

runTest('T02 — getPixel hors limites rend du noir plutôt que de lever', () => {
  const f = createBlankFrame(4, 4, [200, 100, 50]);
  assertDeep(getPixel(f, 2, 2), [200, 100, 50]);
  assertDeep(getPixel(f, -1, 0), [0, 0, 0]);
  assertDeep(getPixel(f, 99, 99), [0, 0, 0]);
});

runTest('T03 — RGBA et RGB donnent la même lecture', () => {
  const rgb = createBlankFrame(3, 3, [10, 20, 30], 3);
  const rgba = createBlankFrame(3, 3, [10, 20, 30], 4);
  assertDeep(getPixel(rgb, 1, 1), getPixel(rgba, 1, 1));
  assertEqual(getLuma(rgb, 1, 1), getLuma(rgba, 1, 1));
});

runTest('T04 — sampleMedian ignore un pixel isolé', () => {
  const f = createBlankFrame(9, 9, [200, 200, 200]);
  fillRect(f, 4, 4, 1, 1, [0, 0, 0]);
  assertDeep(sampleMedian(f, 4, 4, 1), [200, 200, 200]);
});

// ===========================================================================
// keyboard-geometry.js
// ===========================================================================

runTest('T05 — la ligne de frappe rouge est trouvée', () => {
  const { frame, strikeY } = makeKeyboard();
  const s = findStrikeLine(frame);
  assertTrue(!!s, 'ligne de frappe introuvable');
  assertClose(s.y, strikeY, 2);
});

runTest('T06 — pas de ligne de frappe sur une image sans clavier', () => {
  const f = createBlankFrame(320, 240, [40, 40, 40]);
  assertEqual(findStrikeLine(f), null);
});

runTest('T07 — motif des touches noires : groupes de 2 et 3 alternés', () => {
  const { frame } = makeKeyboard({ octaves: 3 });
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok, `géométrie en échec : ${g.reason} ${g.detail || ''}`);
  assertEqual(g.blackKeys.length, 15, '5 noires par octave sur 3 octaves');
});

runTest('T08 — groupBlackKeys rejette un motif incohérent', () => {
  const fake = [0, 20, 40, 60, 80, 100].map((c) => ({ center: c }));
  const r = groupBlackKeys(fake);
  assertEqual(r.valid, false, 'un espacement régulier ne peut pas être un clavier');
});

runTest('T09 — classifyBlackGroups déduit un groupe tronqué par alternance', () => {
  // Groupe de 1 au début (coupé par le bord), puis 3, 2, 3.
  const r = classifyBlackGroups([[0], [1, 2, 3], [4, 5], [6, 7, 8]]);
  assertDeep(r, [true, false, true, false], 'le groupe tronqué doit être un groupe de 2');
});

runTest('T10 — la grille des blanches retrouve le pas exact', () => {
  const { frame } = makeKeyboard({ whiteW: 22 });
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok);
  assertClose(g.whiteWidth, 22, 0.6, 'pas de la grille');
});

runTest('T11 — les classes de hauteur sont exactes sans aucun OCR', () => {
  const { frame } = makeKeyboard({ octaves: 3, lowestMidi: 48 });
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok);
  const whitePcs = g.whiteKeys.slice(0, 8).map((k) => ((k.midi % 12) + 12) % 12);
  assertDeep(whitePcs, [0, 2, 4, 5, 7, 9, 11, 0], 'do ré mi fa sol la si do');
  const blackPcs = g.blackKeys.slice(0, 5).map((k) => ((k.midi % 12) + 12) % 12);
  assertDeep(blackPcs, [1, 3, 6, 8, 10], 'do♯ ré♯ fa♯ sol♯ la♯');
});

runTest('T12 — l\'ancre d\'octave est signalée comme heuristique', () => {
  const { frame } = makeKeyboard();
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok);
  assertEqual(g.anchorIsHeuristic, true, 'l\'octave absolue est une hypothèse, pas une lecture');
});

runTest('T13 — une ancre imposée est respectée telle quelle', () => {
  const { frame } = makeKeyboard();
  const g = detectKeyboardGeometry(frame, { octaveAnchor: 24 });
  assertTrue(g.ok);
  assertEqual(g.anchorIsHeuristic, false);
  assertEqual(g.lowestMidi, 24);
});

runTest('T14 — changer l\'ancre translate tout le clavier sans rien casser', () => {
  const { frame } = makeKeyboard();
  const a = detectKeyboardGeometry(frame, { octaveAnchor: 36 });
  const b = detectKeyboardGeometry(frame, { octaveAnchor: 48 });
  assertTrue(a.ok && b.ok);
  assertEqual(a.whiteKeys.length, b.whiteKeys.length);
  for (let i = 0; i < a.whiteKeys.length; i++) {
    assertEqual(b.whiteKeys[i].midi - a.whiteKeys[i].midi, 12, `touche ${i}`);
  }
});

runTest('T15 — la grille ne déborde pas du clavier', () => {
  const { frame, whiteCount } = makeKeyboard({ octaves: 2 });
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok);
  assertEqual(g.whiteKeys.length, whiteCount, 'aucune touche inventée dans le fond');
});

// ===========================================================================
// key-detection.js
// ===========================================================================

runTest('T16 — une touche grise est éteinte, quelle que soit sa clarté', () => {
  assertEqual(classifyTint(244, 244, 244), null, 'blanche au repos');
  assertEqual(classifyTint(20, 20, 20), null, 'noire au repos');
  assertEqual(classifyTint(130, 132, 129), null, 'gris moyen');
});

runTest('T17 — les teintes de main sont distinguées', () => {
  assertEqual(classifyTint(...BLUE), 'blue');
  assertEqual(classifyTint(...GREEN), 'green');
});

runTest('T18 — une touche blanche allumée est lue à la bonne hauteur', () => {
  const rest = makeKeyboard({ lowestMidi: 48 }).frame;
  const played = makeKeyboard({ lowestMidi: 48, lit: { 60: BLUE } }).frame;
  const g = detectKeyboardGeometry(rest, { octaveAnchor: 48 });
  assertTrue(g.ok);
  assertDeep(toMidiList(readLitKeys(played, g)), [60]);
});

runTest('T19 — une touche noire allumée est lue à la bonne hauteur', () => {
  // Flux réel : la géométrie vient d'une image au repos, la lecture d'une
  // image jouée. Une noire allumée n'est plus sombre — la calculer sur cette
  // image-là la ferait disparaître de la géométrie (voir T19b).
  const rest = makeKeyboard({ lowestMidi: 48 }).frame;
  const played = makeKeyboard({ lowestMidi: 48, lit: { 61: GREEN } }).frame;
  const g = detectKeyboardGeometry(rest, { octaveAnchor: 48 });
  assertTrue(g.ok);
  assertDeep(toMidiList(readLitKeys(played, g)), [61]);
});

runTest('T19b — la géométrie est prise sur l\'image la plus au repos', () => {
  // Une noire allumée échappe à la détection des noires : si la géométrie
  // était calculée sur cette image, la touche manquerait pour toute la vidéo.
  // La cascade doit donc préférer l'image qui montre le plus de noires.
  const played = makeKeyboard({ lowestMidi: 48, lit: { 61: GREEN, 63: GREEN } }).frame;
  const rest = makeKeyboard({ lowestMidi: 48 }).frame;
  const r = detectVideoFormat([played, rest, played, rest]);
  assertEqual(r.format, FORMATS.PIANO_ROLL);
  assertEqual(r.geometry.blackKeys.length, 15, 'toutes les noires doivent être connues');
});

runTest('T20 — un accord entier est lu, blanches et noires mêlées', () => {
  const rest = makeKeyboard({ octaves: 3, lowestMidi: 48 }).frame;
  const lit = { 54: BLUE, 57: BLUE, 61: BLUE, 73: GREEN }; // fa♯ la do♯ + do♯ aigu
  const played = makeKeyboard({ octaves: 3, lowestMidi: 48, lit }).frame;
  const g = detectKeyboardGeometry(rest, { octaveAnchor: 48 });
  assertTrue(g.ok);
  assertDeep(toMidiList(readLitKeys(played, g)), [54, 57, 61, 73]);
});

runTest('T21 — clavier au repos : aucune touche lue', () => {
  const { frame } = makeKeyboard();
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok);
  assertDeep(toMidiList(readLitKeys(frame, g)), []);
});

runTest('T21b — clavier statique au repos : aucune touche lue', () => {
  // Sans ligne de frappe rouge, detectStaticKeyboardGeometry prend le relais.
  // buildGeometry() doit fournir un sampleRow utilisable par readLitKeys()
  // même quand strikeY est absent, sinon NaN faisait renvoyer toutes les
  // touches blanches comme allumées (bug observé sur Gospel Piano Harmony Secrets).
  const { frame } = makeKeyboard({ withStrikeLine: false, lowestMidi: 48 });
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok, `géométrie statique en échec : ${g.reason} ${g.detail || ''}`);
  assertEqual(g.strategy, 'staticKeyboard');
  assertTrue(Number.isFinite(g.sampleRow), 'sampleRow doit être défini');
  assertDeep(toMidiList(readLitKeys(frame, g)), []);
});

runTest('T22 — les mains sont séparées, la plus grave nommée gauche', () => {
  const rest = makeKeyboard({ octaves: 3, lowestMidi: 48 }).frame;
  const lit = { 48: BLUE, 55: BLUE, 72: GREEN };
  const played = makeKeyboard({ octaves: 3, lowestMidi: 48, lit }).frame;
  const g = detectKeyboardGeometry(rest, { octaveAnchor: 48 });
  const hands = splitHands(readLitKeys(played, g));
  assertDeep(hands.left, [48, 55]);
  assertDeep(hands.right, [72]);
});

// ===========================================================================
// note-grouping.js
// ===========================================================================

const S = (t, midis) => ({ t, keys: midis.map((m) => ({ midi: m, hand: 'blue', kind: 'white' })) });

runTest('T23 — une note vue sur une seule image est écartée', () => {
  const clean = denoiseSamples([S(0, [60]), S(0.25, [60, 99]), S(0.5, [60])]);
  assertDeep(clean.map((c) => c.midis), [[60], [60], [60]]);
});

runTest('T24 — une note tenue sur deux images est conservée', () => {
  const clean = denoiseSamples([S(0, [60]), S(0.25, [60, 64]), S(0.5, [60, 64])]);
  assertDeep(clean[2].midis, [60, 64]);
});

runTest('T25 — la basse est lissée par médiane', () => {
  const clean = denoiseSamples([S(0, [60, 67]), S(0.25, [60, 67]), S(0.5, [48, 60, 67]),
    S(0.75, [60, 67]), S(1, [60, 67])]);
  const bass = bassLine(clean);
  assertEqual(bass[2], 60, 'un grave isolé ne doit pas devenir la basse');
});

runTest('T26 — un changement de basse ouvre un segment', () => {
  const samples = [];
  for (let i = 0; i < 12; i++) samples.push(S(i * 0.25, [62, 69]));
  for (let i = 12; i < 24; i++) samples.push(S(i * 0.25, [57, 64]));
  const segs = groupSegments(samples, { sampleInterval: 0.25 });
  assertEqual(segs.length, 2, 'deux harmonies successives');
  assertClose(segs[0].start, 0, 1e-9);
  assertClose(segs[1].start, 3, 1e-9);
});

runTest('T27 — un changement d\'octave à la main gauche ne coupe pas un segment', () => {
  const samples = [];
  for (let i = 0; i < 12; i++) samples.push(S(i * 0.25, [62, 69]));
  for (let i = 12; i < 24; i++) samples.push(S(i * 0.25, [50, 69])); // ré une octave plus bas
  const segs = groupSegments(samples, { sampleInterval: 0.25 });
  assertEqual(segs.length, 1, 'même classe de basse → même segment');
});

runTest('T28 — une note de passage n\'entre pas dans l\'accord', () => {
  const samples = [];
  for (let i = 0; i < 20; i++) samples.push(S(i * 0.25, [62, 69, 78])); // ré la + fa♯
  // Deux images avec une neuvième de passage : 10 % du segment.
  samples[8] = S(2, [62, 69, 78, 76]);
  samples[9] = S(2.25, [62, 69, 78, 76]);
  const segs = groupSegments(samples, { sampleInterval: 0.25 });
  assertEqual(segs.length, 1);
  assertTrue(!segs[0].midis.includes(76), 'la note de passage doit être écartée');
  assertDeep(segs[0].midis, [62, 69, 78]);
});

runTest('T29 — une tierce mélodique tenue un tiers du segment est conservée', () => {
  const samples = [];
  for (let i = 0; i < 20; i++) samples.push(S(i * 0.25, [62, 69]));
  for (let i = 6; i < 14; i++) samples[i] = S(i * 0.25, [62, 69, 78]); // 40 %
  const segs = groupSegments(samples, { sampleInterval: 0.25 });
  assertTrue(segs[0].midis.includes(78), 'la tierce doit rester dans l\'accord');
});

runTest('T30 — les segments trop courts sont absorbés', () => {
  const samples = [];
  for (let i = 0; i < 16; i++) samples.push(S(i * 0.25, [62, 69]));
  samples[8] = S(2, [61, 68]);  // une seule image parasite
  const segs = groupSegments(samples, { sampleInterval: 0.25 });
  assertEqual(segs.length, 1, 'un accident d\'une image ne crée pas d\'accord');
});

// ===========================================================================
// chord-labeling.js
// ===========================================================================

runTest('T31 — un accord parfait majeur est nommé', () => {
  const r = labelNotes([45, 52, 73]);
  assertEqual(r.resolved, true);
  assertEqual(r.label, 'A');
  assertEqual(r.thirdMissing, false);
});

runTest('T32 — un accord parfait mineur est nommé', () => {
  const r = labelNotes([54, 57, 61]);
  assertEqual(r.label, 'F#m');
});

runTest('T33 — une quinte à vide est nommée telle quelle et signalée', () => {
  const r = labelNotes([62, 69, 81]);
  assertEqual(r.label, 'D5');
  assertEqual(r.thirdMissing, true, 'la tierce absente doit être signalée');
  assertTrue(r.note && r.note.length > 0, 'et expliquée');
});

runTest('T34 — aucune note : non résolu, jamais un accord inventé', () => {
  const r = labelNotes([]);
  assertEqual(r.resolved, false);
  assertEqual(r.label, null);
  assertEqual(r.reason, 'NoNotes');
});

runTest('T35 — segments voisins de même nom fusionnés', () => {
  const segs = [
    { start: 0, end: 2, duration: 2, midis: [45, 52, 61], sampleCount: 8 },
    { start: 2, end: 4, duration: 2, midis: [45, 52, 61], sampleCount: 8 },
    { start: 4, end: 6, duration: 2, midis: [62, 66, 69], sampleCount: 8 },
  ];
  const merged = mergeSameLabel(labelSegments(segs));
  assertEqual(merged.length, 2);
  assertClose(merged[0].end, 4, 1e-9);
});

// ===========================================================================
// format-detector.js
// ===========================================================================

runTest('T36 — un piano-roll est reconnu comme Format B', () => {
  const frames = [0, 1, 2].map(() => makeKeyboard().frame);
  const r = detectVideoFormat(frames);
  assertEqual(r.format, FORMATS.PIANO_ROLL);
  assertEqual(r.implemented, true);
  assertEqual(r.fallback, null);
  assertTrue(!!r.geometry);
});

runTest('T37 — une vidéo sans clavier est routée vers le repli audio', () => {
  const frames = [0, 1, 2].map(() => createBlankFrame(320, 240, [60, 55, 50]));
  const r = detectVideoFormat(frames);
  assertEqual(r.format, FORMATS.UNRECOGNISED);
  assertEqual(r.implemented, false);
  assertEqual(r.fallback, 'audio', 'le pire cas doit être routé, pas planter');
  assertTrue(explainUnrecognised(r.reason).length > 0, 'et expliqué à l\'utilisateur');
});

runTest('T38 — une seule détection isolée sur beaucoup d\'images ne suffit pas', () => {
  const frames = [
    makeKeyboard().frame,
    createBlankFrame(320, 240, [60, 55, 50]),
    createBlankFrame(320, 240, [60, 55, 50]),
    createBlankFrame(320, 240, [60, 55, 50]),
  ];
  const r = detectVideoFormat(frames);
  assertEqual(r.format, FORMATS.UNRECOGNISED, 'deux corroborations sont exigées');
});

runTest('T38b — deux détections cohérentes suffisent, même minoritaires', () => {
  // Cas réel : la plupart des images ont des touches allumées, qui cassent le
  // motif des noires. Exiger une majorité d'images parfaites rejetterait
  // presque tous les tutoriels.
  const frames = [
    makeKeyboard({ lit: { 61: GREEN, 63: GREEN } }).frame,
    makeKeyboard().frame,
    makeKeyboard({ lit: { 61: GREEN, 63: GREEN } }).frame,
    makeKeyboard().frame,
    makeKeyboard({ lit: { 61: GREEN, 63: GREEN } }).frame,
  ];
  const r = detectVideoFormat(frames);
  assertEqual(r.format, FORMATS.PIANO_ROLL);
  assertEqual(r.geometry.blackKeys.length, 15, 'la géométrie retenue est la plus complète');
});

runTest('T39 — aucune image : refus explicite, pas de plantage', () => {
  const r = detectVideoFormat([]);
  assertEqual(r.format, FORMATS.UNRECOGNISED);
  assertEqual(r.reason, 'NoFrames');
  assertEqual(r.fallback, 'audio');
});

runTest('T40 — chaque motif d\'échec a un message affichable', () => {
  for (const reason of ['NoFrames', 'NoStrikeLine', 'NoKeyboardRows', 'NoWhiteGrid',
    'BlackKeyPattern', 'InconsistentAnchor', 'UnstableGeometry:9', 'AllStrategiesFailed',
    'Inconnu']) {
    assertTrue(explainUnrecognised(reason).length > 20, `message pour ${reason}`);
  }
  const detail = 'detectSynthesiaGeometry:NoStrikeLine; detectStaticKeyboardGeometry:StaticKeyboardNotFound';
  assertTrue(explainUnrecognised('AllStrategiesFailed', detail).includes('detectSynthesiaGeometry'), 'détail des stratégies dans le message');
});

runTest('T40b — stratégie statique : clavier sans ligne rouge', () => {
  const { frame } = makeKeyboard({ withStrikeLine: false, kbTopOverride: 160, kbBottomOverride: 280 });
  const g = detectStaticKeyboardGeometry(frame);
  assertTrue(g.ok, `statique doit réussir, obtenu ${g.reason}`);
  assertEqual(g.strategy, 'staticKeyboard');
  assertTrue(g.blackKeys.length >= 5, 'noires détectées');
  assertTrue(g.whiteKeys.length >= 12, 'blanches détectées');
});

runTest('T40c — chaîne : Synthesia échoue, statique prend le relais', () => {
  const { frame } = makeKeyboard({ withStrikeLine: false, kbTopOverride: 160, kbBottomOverride: 280 });
  const g = detectKeyboardGeometry(frame);
  assertTrue(g.ok, `chaîne doit réussir, obtenu ${g.reason}`);
  assertEqual(g.strategy, 'staticKeyboard');
});

runTest('T40d — chaîne : les deux stratégies échouent et rapportent leurs raisons', () => {
  const frame = createBlankFrame(320, 240, [60, 55, 50]);
  const g = detectKeyboardGeometry(frame);
  assertTrue(!g.ok, 'doit échouer sur une image vide');
  assertEqual(g.reason, 'AllStrategiesFailed');
  assertTrue(Array.isArray(g.failures), 'failures listées');
  assertTrue(g.failures.length >= 2, 'au moins deux raisons');
  assertTrue(g.failures.some((f) => f.name === 'detectSynthesiaGeometry'), 'raison Synthesia présente');
  assertTrue(g.failures.some((f) => f.name === 'detectStaticKeyboardGeometry'), 'raison statique présente');
  const msg = explainUnrecognised(g.reason, g.detail);
  assertTrue(msg.includes('detectSynthesiaGeometry') || msg.includes('NoStrikeLine'), 'message explicite');
});

runTest('T40e — un clavier avec un rapport noires/blanches impossible est rejeté', () => {
  // Fabrique un faux clavier : une zone de blanches régulières beaucoup trop
  // large par rapport au nombre de noires réellement détectées (15 noires pour
  // 42 blanches extrapolées). Ce n'est pas un piano. Le détecteur doit refuser
  // plutôt que de retourner une géométrie aberrante qui casserait le contrôle
  // de stabilité de detectVideoFormat.
  const whiteW = 22;
  const whiteCount = 22;
  const extraWidth = 450;
  const width = whiteCount * whiteW + extraWidth;
  const height = 300;
  const frame = createBlankFrame(width, height, [16, 16, 22]);
  const kbTop = 160;
  const kbBottom = 280;
  // 22 blanches à gauche.
  for (let i = 0; i < whiteCount; i++) {
    const x = Math.round(i * whiteW);
    fillRect(frame, x, kbTop, whiteW - 1, kbBottom - kbTop, [244, 244, 244]);
    fillRect(frame, x + whiteW - 1, kbTop, 1, kbBottom - kbTop, [10, 10, 10]);
  }
  // Grande zone blanche à droite avec des séparations régulières qui vont faire
  // croire à findWhiteGrid qu'il y a beaucoup de blanches.
  fillRect(frame, whiteCount * whiteW, kbTop, extraWidth, kbBottom - kbTop, [244, 244, 244]);
  for (let x = whiteCount * whiteW + 21; x < whiteCount * whiteW + extraWidth; x += 21) {
    fillRect(frame, x, kbTop, 1, kbBottom - kbTop, [10, 10, 10]);
  }
  fillRect(frame, 0, kbBottom, width, height - kbBottom, [4, 4, 4]);
  // 15 noires réelles uniquement sur les blanches de gauche.
  const BLACK_OFFSETS = { 1: 0.95, 3: 2.10, 6: 3.90, 8: 5.02, 10: 6.12 };
  const blackW = Math.round(whiteW * 0.58);
  for (let oct = 0; oct < 3; oct++) {
    for (const [semi, off] of Object.entries(BLACK_OFFSETS)) {
      const cx = (oct * 7 + Number(off)) * whiteW;
      const x = Math.round(cx - blackW / 2);
      fillRect(frame, x, kbTop, blackW, Math.round((kbBottom - kbTop) * 0.6), [18, 18, 18]);
    }
  }
  const g = detectKeyboardGeometry(frame);
  assertTrue(!g.ok, 'doit échouer sur un rapport impossible');
  assertEqual(g.reason, 'AllStrategiesFailed');
  assertTrue(
    g.failures.some((f) => f.name === 'detectStaticKeyboardGeometry' && f.reason === 'ImplausibleKeyCount'),
    'la stratégie statique écarte le compte aberrant'
  );
});

// ===========================================================================
// cross-check.js
// ===========================================================================

runTest('T41 — fondamentale et qualité extraites d\'une étiquette', () => {
  assertEqual(rootPitchClass('F#m7'), 6);
  assertEqual(rootPitchClass('Bb'), 10);
  assertEqual(rootPitchClass('x'), null);
  assertEqual(isMinorLabel('F#m'), true);
  assertEqual(isMinorLabel('Fmaj7'), false);
  assertEqual(isMinorLabel('A'), false);
});

runTest('T42 — deux lectures identiques : accord total', () => {
  const segs = [{ start: 0, end: 4, label: 'A' }];
  const r = crossCheck({ video: segs, audio: segs });
  assertEqual(r.agreementRatio, 1);
  assertEqual(r.divergences.length, 0);
});

runTest('T43 — quinte à vide contre accord complet : précision, pas conflit', () => {
  const r = crossCheck({
    video: [{ start: 0, end: 4, label: 'A5' }],
    audio: [{ start: 0, end: 4, label: 'A' }],
  });
  assertEqual(r.counts[DIVERGENCE.ENRICHMENT], 8);
  assertEqual(r.counts[DIVERGENCE.CONFLICT], 0);
  assertEqual(r.rootAgreementRatio, 1, 'la fondamentale est la même');
});

runTest('T44 — majeur contre mineur : écart de qualité', () => {
  const r = crossCheck({
    video: [{ start: 0, end: 2, label: 'A' }],
    audio: [{ start: 0, end: 2, label: 'Am' }],
  });
  assertEqual(r.counts[DIVERGENCE.QUALITY], 4);
  assertEqual(r.counts[DIVERGENCE.CONFLICT], 0);
});

runTest('T45 — fondamentales différentes : désaccord franc', () => {
  const r = crossCheck({
    video: [{ start: 0, end: 2, label: 'A' }],
    audio: [{ start: 0, end: 2, label: 'D' }],
  });
  assertEqual(r.counts[DIVERGENCE.CONFLICT], 4);
  assertEqual(r.divergences[0].kind, DIVERGENCE.CONFLICT);
});

runTest('T46 — aucun arbitrage n\'est rendu', () => {
  const r = crossCheck({
    video: [{ start: 0, end: 2, label: 'A5' }],
    audio: [{ start: 0, end: 2, label: 'A' }],
  });
  assertTrue(r.summary.includes('Aucun arbitrage'), 'le recoupement ne choisit pas de gagnant');
  assertEqual(r.divergences[0].video, 'A5');
  assertEqual(r.divergences[0].audio, 'A');
});

runTest('T47 — une seule source : rien n\'est comparé, et c\'est dit', () => {
  const r = crossCheck({ video: [{ start: 0, end: 2, label: 'A' }], audio: [] });
  assertEqual(r.counts[DIVERGENCE.MISSING], 4);
  assertEqual(r.agreementRatio, null);
  assertTrue(r.summary.includes('une seule source') || r.summary.includes('seule source'));
});

// ===========================================================================
// glossary.js
// ===========================================================================

const seg = (label, symbol, thirdMissing = false) => ({
  start: 0, end: 1, chord: { resolved: true, label, symbol, thirdMissing },
});

runTest('T48 — un accord majeur appelle la fiche « accord parfait majeur »', () => {
  const c = collectConcepts([seg('A', '')]);
  assertTrue(c.some((x) => x.id === 'accord-parfait-majeur'));
});

runTest('T49 — une quinte à vide appelle sa propre fiche', () => {
  const c = collectConcepts([seg('A5', '5', true)]);
  const hit = c.find((x) => x.id === 'quinte-a-vide');
  assertTrue(!!hit, 'la fiche doit être proposée');
  assertTrue(!!hit.entry, 'et exister réellement');
});

runTest('T50 — la tonalité connue met en jeu la lecture par degrés', () => {
  const c = collectConcepts([seg('A', '')], { key: 'A' });
  const hit = c.find((x) => x.id === 'degres-diatoniques');
  assertTrue(!!hit);
  assertTrue(hit.because.includes('A'), 'la raison cite la tonalité');
});

runTest('T51 — toute fiche référencée par une règle existe', () => {
  for (const entry of GLOSSARY) {
    assertTrue(entry.id && entry.title && entry.body, `fiche incomplète : ${entry.id}`);
    assertTrue(entry.source, `fiche sans provenance : ${entry.id}`);
  }
  const c = collectConcepts([seg('A', ''), seg('Am', 'm'), seg('A5', '5', true)], { key: 'A' });
  assertEqual(collectMissing(c).length, 0, 'aucun concept déclenché sans fiche');
});

runTest('T52 — un concept sans fiche est remonté comme dette, pas comblé', () => {
  const missing = collectMissing([{ id: 'substitution-tritonique', entry: null }]);
  assertDeep(missing, ['substitution-tritonique']);
  assertEqual(getEntry('substitution-tritonique'), null, 'aucune fiche inventée');
});

runTest('T53 — absence de narration : état explicite, pas un panneau vide', () => {
  const s = noNarrationState();
  assertEqual(s.available, false);
  assertTrue(s.message.includes('rien à citer'), 'l\'absence est dite, pas masquée');
});

// ---------------------------------------------------------------------------
// Repli audio — traduction des champs du moteur d'analyse
// (correctif : correctif-pedagogie-ia-repli-audio-champs.md)
// ---------------------------------------------------------------------------

runTest('T54 — les bornes du moteur (startTime/endTime) sont reconnues', () => {
  const segs = normalizeAnalyzerChords({
    chords: [
      { startTime: 0, endTime: 2.5, chord: 'D' },
      { startTime: 2.5, endTime: 5, chord: 'A' },
    ],
  });
  assertEqual(segs.length, 2, 'les deux accords sont conservés :');
  assertClose(segs[0].start, 0, 1e-9, 'début du premier :');
  assertClose(segs[0].end, 2.5, 1e-9, 'fin du premier :');
  assertEqual(segs[1].label, 'A');
});

runTest('T55 — une borne absente écarte le segment au lieu de le caler sur 0', () => {
  const segs = normalizeAnalyzerChords({
    chords: [
      { startTime: 3, chord: 'D' },
      { endTime: 4, chord: 'A' },
      { startTime: 4, endTime: 4, chord: 'E' },
    ],
  });
  assertEqual(segs.length, 0, 'aucun segment fabriqué à partir de bornes manquantes :');
});

runTest('T56 — les noms alternatifs restent acceptés en second rang', () => {
  const segs = normalizeAnalyzerChords({
    segments: [{ start: 1, end: 2, label: 'F#m' }],
  });
  assertEqual(segs.length, 1);
  assertEqual(segs[0].label, 'F#m');
  assertDeep(normalizeAnalyzerChords(null), [], 'un résultat absent ne casse rien :');
  assertDeep(normalizeAnalyzerChords({ chords: 'oups' }), [], 'un champ mal typé ne casse rien :');
});

// ---------------------------------------------------------------------------
// Transcription — ce que DIT le professeur
// ---------------------------------------------------------------------------

runTest('T57 — dépendance absente : on ne prétend rien sur le contenu de la vidéo', () => {
  const state = normalizeTranscription({ available: false, reason: 'dependency-missing' });
  assertEqual(state.available, false);
  assertEqual(state.reason, NARRATION_REASON.DEPENDENCY);
  assertTrue(state.message.includes('installée'), 'la cause est nommée :');
  assertTrue(state.message.includes('pip install faster-whisper'),
    'la réparation est donnée :');
  assertTrue(!state.message.includes('ne comporte pas de commentaire'),
    'une limite de la machine ne se dit pas comme un constat sur la vidéo');
});

runTest('T58 — aucune parole détectée : constat sur le contenu, distinct du précédent', () => {
  const state = normalizeTranscription({ available: false, reason: 'no-speech' });
  assertEqual(state.reason, NARRATION_REASON.NO_SPEECH);
  assertTrue(state.message.includes('rien à citer'));
  const dependency = normalizeTranscription({ available: false, reason: 'dependency-missing' });
  assertTrue(state.message !== dependency.message,
    'les deux indisponibilités ne partagent pas le même texte');
});

runTest('T59 — échec technique : troisième message, avec le détail conservé', () => {
  const state = normalizeTranscription({ available: false, reason: 'failed', detail: 'ffmpeg exit 1' });
  assertEqual(state.reason, NARRATION_REASON.FAILED);
  assertEqual(state.detail, 'ffmpeg exit 1');
  assertTrue(state.message.includes('échoué'));
});

runTest('T60 — rien de reçu : « pas tenté », surtout pas « vidéo muette »', () => {
  for (const raw of [null, undefined, 'oups', 42]) {
    const state = normalizeTranscription(raw);
    assertEqual(state.reason, NARRATION_REASON.NOT_ATTEMPTED, `pour ${String(raw)} :`);
  }
});

runTest('T61 — une raison inconnue est un échec, pas une absence de parole', () => {
  const state = normalizeTranscription({ available: false, reason: 'n-importe-quoi' });
  assertEqual(state.reason, NARRATION_REASON.FAILED);
});

runTest('T62 — segments transcrits : nettoyés, triés, jamais rafistolés', () => {
  const state = normalizeTranscription({
    available: true,
    language: 'fr',
    model: 'small',
    segments: [
      { start: 10, end: 12, text: '  la quinte  ' },
      { start: 2, end: 5, text: 'la tierce' },
      { start: 6, end: 7, text: '   ' },          // texte vide : écarté
      { start: 8, end: 4, text: 'bornes folles' }, // fin avant début : écarté
      { start: 'x', end: 3, text: 'borne absente' },
    ],
  });
  assertEqual(state.available, true);
  assertEqual(state.segments.length, 2, 'deux segments exploitables :');
  assertEqual(state.segments[0].text, 'la tierce', 'tri chronologique :');
  assertEqual(state.segments[1].text, 'la quinte', 'texte détouré :');
  assertEqual(state.language, 'fr');
  assertEqual(state.model, 'small');
});

runTest('T63 — disponible mais sans segment retenu : la bande son a bien été écoutée', () => {
  const state = normalizeTranscription({ available: true, segments: [] });
  assertEqual(state.available, false);
  assertEqual(state.reason, NARRATION_REASON.NO_SPEECH);
});

runTest('T64 — un passage parlé va à l\'accord qu\'il recouvre le plus longtemps', () => {
  const grid = [
    { start: 0, end: 4, chord: { resolved: true, label: 'D' } },
    { start: 4, end: 12, chord: { resolved: true, label: 'A' } },
  ];
  const lines = alignNarration([{ start: 3, end: 10, text: 'on passe au la' }], grid);
  assertEqual(lines.length, 1);
  assertEqual(lines[0].chord, 'A', 'recouvrement de 6 s contre 1 s :');
  assertEqual(lines[0].nearest, false, 'ce n\'est pas un voisinage, c\'est un recouvrement :');
  assertClose(lines[0].chordStart, 4, 1e-9);
});

runTest('T65 — parole pendant un silence : accord le plus proche, et c\'est signalé', () => {
  const grid = [{ start: 0, end: 4, chord: { resolved: true, label: 'D' } }];
  const lines = alignNarration([{ start: 20, end: 22, text: 'écoutez bien' }], grid);
  assertEqual(lines[0].chord, 'D');
  assertEqual(lines[0].nearest, true, 'le voisinage ne se fait pas passer pour une simultanéité :');
});

runTest('T66 — sans grille, ou face à un accord non résolu, aucun accord n\'est inventé', () => {
  assertEqual(alignNarration([{ start: 1, end: 2, text: 'bonjour' }], [])[0].chord, null);
  assertEqual(alignNarration([{ start: 1, end: 2, text: 'bonjour' }], null)[0].chord, null);
  const unresolved = [{ start: 0, end: 5, chord: { resolved: false, label: null } }];
  assertEqual(alignNarration([{ start: 1, end: 2, text: 'bonjour' }], unresolved)[0].chord, null);
});

runTest('T67 — les segments d\'un repli audio (start/end/label) sont reconnus aussi', () => {
  const audioGrid = [{ start: 0, end: 6, label: 'F#m' }];
  assertEqual(alignNarration([{ start: 1, end: 2, text: 'ici' }], audioGrid)[0].chord, 'F#m');
});

runTest('T68 — le texte suivi est concaténé et borné', () => {
  assertEqual(joinNarrationText([{ text: 'un' }, { text: ' deux ' }, { text: '' }]), 'un deux');
  assertEqual(joinNarrationText(null), '');
  const long = joinNarrationText([{ text: 'a'.repeat(50) }], 10);
  assertEqual(long.length, 11, 'tronqué à 10 caractères plus le signe de coupe :');
  assertTrue(long.endsWith('…'), 'la coupe est visible :');
});

runTest('T69 — l\'analyse porte l\'état de narration qu\'on lui donne', () => {
  const narration = { available: true, segments: [{ start: 0, end: 1, text: 'salut' }] };
  const video = buildVideoAnalysis({ samples: [], geometry: {}, sampleInterval: 0.25, narration });
  assertEqual(video.narration.available, true, 'côté image :');
  const audio = buildAudioOnlyAnalysis({ reason: 'NoKeyboard', audioSegments: [], narration });
  assertEqual(audio.narration.available, true, 'côté son :');
});

runTest('T70 — sans transcription, l\'analyse ne déclare plus la vidéo muette', () => {
  const video = buildVideoAnalysis({ samples: [], geometry: {}, sampleInterval: 0.25 });
  assertEqual(video.narration.reason, NARRATION_REASON.NOT_ATTEMPTED,
    'ce champ n\'était jamais alimenté et affirmait pourtant un fait :');
  const audio = buildAudioOnlyAnalysis({ reason: 'NoKeyboard', audioSegments: [] });
  assertEqual(audio.narration.reason, NARRATION_REASON.NOT_ATTEMPTED);
  const declared = buildVideoAnalysis({
    samples: [], geometry: {}, sampleInterval: 0.25, hasNarration: true,
  });
  assertEqual(declared.narration.available, true, 'le raccourci historique marche toujours :');
});

runTest('T71 — un segment étiré par la démonstration jouée reste sur l\'accord du début', () => {
  // Cas RÉEL, mesuré sur le tutoriel de référence : le détecteur d'activité
  // vocale referme le segment sur la démonstration qui suit la phrase, d'où un
  // « segment parlé » de 33 s. Sans plafond, la phrase se retrouverait rattachée
  // à un accord de la démonstration.
  const grid = [
    { start: 0, end: 10, chord: { resolved: true, label: 'F' } },
    { start: 10, end: 33, chord: { resolved: true, label: 'Bb' } },
  ];
  const parle = [{ start: 0, end: 33, text: 'Or we could do something like that.' }];
  assertEqual(alignNarration(parle, grid)[0].chord, 'F',
    'la phrase est dite au début, pas pendant les 23 s de piano qui suivent :');

  // Un passage de durée normale n'est pas affecté par le plafond : il tombe où
  // il est réellement prononcé.
  const court = [{ start: 12, end: 18, text: 'on passe au si bémol' }];
  assertEqual(alignNarration(court, grid)[0].chord, 'Bb');
  const debut = [{ start: 1, end: 6, text: 'on est en fa' }];
  assertEqual(alignNarration(debut, grid)[0].chord, 'F');
});

runTest('T72 — la limite de texte pour l\'IA couvre un tutoriel de douze minutes', () => {
  // Mesuré : 6 134 caractères pour 12 min 32 de parole. La limite ne doit pas
  // couper à ce format-là.
  const segments = [{ text: 'x'.repeat(6134) }];
  assertEqual(joinNarrationText(segments).length, 6134, 'aucune coupe :');
  assertTrue(!joinNarrationText(segments).endsWith('…'));
});

runTest('T73 — V2N : les note events sont convertis en samples puis segmentés', () => {
  // Do majeur tenu pendant 1 s à partir de t=0.2.
  const notes = [
    { midi: 60, onset: 0.2, offset: 1.2, velocity: 0.8 },
    { midi: 64, onset: 0.2, offset: 1.2, velocity: 0.7 },
    { midi: 67, onset: 0.2, offset: 1.2, velocity: 0.7 },
  ];
  const analysis = buildVideoAnalysis({ v2nNotes: notes, v2nDuration: 1.5 });
  assertEqual(analysis.source, 'v2n', 'source :');
  assertEqual(analysis.format, FORMATS.V2N, 'format :');
  assertTrue(analysis.segments.length > 0, 'au moins un segment :');
  const seg = analysis.segments[0];
  assertTrue(seg.chord.resolved, 'accord résolu :');
  assertEqual(seg.chord.label, 'C', 'do majeur :');
});

runTest('T74 — V2N absent ou vide retombe sur le pipeline video classique', () => {
  const noV2n = buildVideoAnalysis({ samples: [], geometry: {}, sampleInterval: 0.25 });
  assertEqual(noV2n.source, 'video', 'sans notes V2N, source video :');
  assertEqual(noV2n.format, FORMATS.PIANO_ROLL, 'format piano-roll :');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;

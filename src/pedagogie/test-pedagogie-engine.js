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
  classifyBlackGroups, findWhiteGrid,
} from './keyboard-geometry.js';
import { readLitKeys, classifyTint, toMidiList, splitHands } from './key-detection.js';
import { denoiseSamples, bassLine, groupSegments } from './note-grouping.js';
import { labelNotes, labelSegments, mergeSameLabel } from './chord-labeling.js';
import { detectVideoFormat, FORMATS, explainUnrecognised } from './format-detector.js';
import { crossCheck, DIVERGENCE, rootPitchClass, isMinorLabel } from './cross-check.js';
import { collectConcepts, collectMissing, getEntry, GLOSSARY, noNarrationState } from './glossary.js';

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
 */
function makeKeyboard({ octaves = 3, whiteW = 22, lit = {}, lowestMidi = 48 } = {}) {
  const whiteCount = octaves * 7 + 1;
  const width = Math.round(whiteCount * whiteW);
  const height = 300;
  const strikeY = 120;
  const kbTop = strikeY + 4;
  const kbBottom = 280;
  const blackBottom = kbTop + Math.round((kbBottom - kbTop) * 0.6);

  const frame = createBlankFrame(width, height, [16, 16, 22]);
  // Ligne de frappe rouge.
  fillRect(frame, 0, strikeY, width, 3, [200, 40, 40]);

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
  assertEqual(readLitKeys(frame, g).length, 0);
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
    'BlackKeyPattern', 'InconsistentAnchor', 'UnstableGeometry:9', 'Inconnu']) {
    assertTrue(explainUnrecognised(reason).length > 20, `message pour ${reason}`);
  }
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

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;

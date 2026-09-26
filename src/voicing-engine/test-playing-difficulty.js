// [Claude] — 2026-09-25 — Tests des étoiles calculées sur les notes à jouer
// (playing-difficulty.js).
//
// Narcisse : « les étoiles sont mal distribuées […] surtout quand la main gauche
// est ajoutée dans un voicing qui n'avait que la main droite au départ ».
//
// Lancer : node src/voicing-engine/test-playing-difficulty.js

import { playingDifficulty, difficultyReasonText } from './playing-difficulty.js';
import { exerciseVoicingsFor, TECHNIQUES, TARGET_QUALITY_GROUPS, difficultyOfVoicing, createPracticeExercise } from '../practice-exercise.js';
import { styleLeftHand } from '../practice-demo.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const stars = (lh, rh, chord) => playingDifficulty({ leftHand: lh, rightHand: rh, chord }).stars;

// Tableau de référence : de vrais voicings de l'application (main gauche | main droite).
const REFERENCE = [
  { what: 'Cmaj7 close, main droite seule', lh: [], rh: [60, 64, 67, 71], chord: 'Cmaj7', stars: 1 },
  { what: 'Dm7 shell (une main)', lh: [50, 53, 60], rh: [], chord: 'Dm7', stars: 1 },
  { what: 'Cmaj7 drop 2 (une note à la main gauche)', lh: [55], rh: [60, 64, 71], chord: 'Cmaj7', stars: 1 },
  { what: 'Cmaj7 close + fondamentale à la main gauche', lh: [36], rh: [60, 64, 67, 71], chord: 'Cmaj7', stars: 2 },
  { what: 'Cmaj7 close + main gauche fondamentale-quinte', lh: [36, 43], rh: [60, 64, 67, 71], chord: 'Cmaj7', stars: 2 },
  { what: 'Dm9 rootless, main droite seule', lh: [], rh: [53, 57, 60, 64], chord: 'Dm9', stars: 2 },
  { what: 'Dm9 rootless + main gauche Gospel (Ré2 La2)', lh: [38, 45], rh: [53, 57, 60, 64], chord: 'Dm9', stars: 3 },
  { what: 'G7alt upper structure (triade de Réb sur le triton)', lh: [47, 53], rh: [61, 65, 68], chord: 'G7alt', stars: 3 },
  { what: 'G13 rootless + main gauche Gospel (7 notes)', lh: [43, 53], rh: [57, 59, 64, 65, 69], chord: 'G13', stars: 4 },
  { what: 'G7alt close + main gauche (7 notes, #9 et b5)', lh: [43, 53], rh: [67, 70, 71, 73, 77], chord: 'G7alt', stars: 4 },
  { what: 'Stride Ebmaj7#11 (la main gauche saute)', lh: [51, 62, 67, 69], rh: [], chord: 'Ebmaj7#11', stars: 4 },
  { what: 'C7#11 upper structure + main gauche Gospel (7 notes, 9 #11 13)', lh: [48, 52, 58], rh: [62, 66, 69, 74], chord: 'C7#11', stars: 5 },
];

function testReference() {
  for (const r of REFERENCE) {
    const got = playingDifficulty({ leftHand: r.lh, rightHand: r.rh, chord: r.chord });
    check(`${r.what} : ★${r.stars}`, got.stars === r.stars, `★${got.stars} (${got.points} pts : ${difficultyReasonText(got)})`);
  }
  const g13 = playingDifficulty({ leftHand: [43, 53], rightHand: [57, 59, 64, 65, 69], chord: 'G13' });
  check('Raisons lisibles pour l\'infobulle', difficultyReasonText(g13) === '2 mains · 7 notes · tensions 9 13', difficultyReasonText(g13));
  check('m7b5 : la quinte diminuée est la structure, pas une altération',
    !playingDifficulty({ leftHand: [], rightHand: [59, 62, 65, 69], chord: 'Bm7b5' }).reasons.some((x) => /b5/.test(x)));
}

function testInvariance() {
  // Ajouter une main gauche, ou des notes, n'enlève jamais d'étoile.
  const rh = [53, 57, 60, 64];
  check('Main gauche ajoutée : jamais moins d\'étoiles', stars([], rh, 'Dm9') <= stars([38], rh, 'Dm9') && stars([38], rh, 'Dm9') <= stars([38, 45], rh, 'Dm9'));
  // Même forme dans les douze tonalités : mêmes étoiles (aucun critère de touches noires).
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const shape = { lh: [43, 53], rh: [57, 59, 64, 65, 69] }; // G13 : Sol2 Fa3 | La3 Si3 Mi4 Fa4 La4
  // Décalé de -5 à +6 demi-tons : C13, Db13… F#13.
  const all = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((d) => stars(shape.lh.map((m) => m + d), shape.rh.map((m) => m + d), `${NAMES[(7 + d + 12) % 12]}13`));
  check('Même voicing de G13 dans les 12 tonalités : mêmes étoiles', new Set(all).size === 1, all.join(','));
  // Mêmes notes, mêmes étoiles, quelle que soit l'étiquette de technique.
  const close = difficultyOfVoicing({ rootPc: 0, symbol: 'maj7', voicing: { technique: 'close', leftHand: [], rightHand: [60, 64, 67, 71] } });
  const fourway = difficultyOfVoicing({ rootPc: 0, symbol: 'maj7', voicing: { technique: 'fourway_close', leftHand: [], rightHand: [60, 64, 67, 71] } });
  check('Close et 4-way close aux mêmes notes : mêmes étoiles', close === fourway, `${close} / ${fourway}`);
  check('Sans notes : repli sur le calcul historique (1 à 5)', [1, 2, 3, 4, 5].includes(difficultyOfVoicing({ symbol: 'm7', voicing: { technique: 'drop2' } })));
}

function testLibrary() {
  // Bibliothèque en Do, toutes qualités et techniques, avec chaque style de main gauche.
  const qualities = [...new Set(TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities))];
  const seen = new Set();
  let lowered = 0;
  let raised = 0;
  for (const q of qualities) {
    for (const t of TECHNIQUES.filter((x) => x !== 'auto')) {
      for (const v of exerciseVoicingsFor(0, q, t) || []) {
        const chord = { rootPc: 0, quality: q };
        const base = stars(v.lh, v.rh, chord);
        seen.add(base);
        for (const style of ['gospel', 'ballade', 'swing']) {
          const s = styleLeftHand({ rootPc: 0, symbol: q, voicing: { leftHand: v.lh, rightHand: v.rh, technique: t, familyId: v.familyId } }, style);
          if (!s) continue;
          const d = stars(s.lh, s.rh, chord);
          seen.add(d);
          if (d < base) lowered += 1;
          if (d > base) raised += 1;
        }
      }
    }
  }
  check('Bibliothèque : une main gauche ajoutée n\'enlève jamais d\'étoile', lowered === 0, String(lowered));
  check('Bibliothèque : une main gauche ajoutée fait souvent monter les étoiles', raised > 100, String(raised));
  check('Bibliothèque : les cinq niveaux sont utilisés', [1, 2, 3, 4, 5].every((n) => seen.has(n)), [...seen].sort().join(','));
}

function testExerciseCard() {
  // La carte d'Accord cible : Dm9 rootless, puis avec la main gauche Gospel.
  const ex = createPracticeExercise();
  ex.setTechnique('rootless');
  ex.setTargetChoice(2, 'm9');
  const alone = difficultyOfVoicing(ex.getState().target);
  ex.setLeftHandStyle('gospel');
  const withLeft = difficultyOfVoicing(ex.getState().target);
  check('Carte Dm9 rootless : la main gauche Gospel ajoute une étoile', withLeft === alone + 1, `${alone} → ${withLeft}`);
}

testReference();
testInvariance();
testLibrary();
testExerciseCard();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);

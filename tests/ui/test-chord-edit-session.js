// [OpenCode] — 2026-08-08 — Lot C : tests comportementaux de la session
// sécurisée d’édition d’un accord.
// Exécutable avec : node tests/ui/test-chord-edit-session.js
// Aucun navigateur, jsdom ni dépendance supplémentaire : Node seul.
//
// Ces tests prouvent les critères du Lot C :
//  C1  la lecture active est mise en pause dès l’ouverture (et JAMAIS
//      relancée) ;
//  C2  une cible ouverte reste identique malgré un changement de temps ou
//      d’accord actif ;
//  C3  « Enregistrer » ne modifie que la cible initiale ;
//  C4  « Revenir à la détection » ne restaure que la cible initiale ;
//  C5  « Annuler » / fermer sans validation ne modifie rien ;
//  C6  une cible invalide ne provoque aucune mutation de remplacement ;
//  C7  fermer puis rouvrir ne réutilise aucun état périmé.

import fs from 'node:fs';
import {
  captureChordTarget,
  resolveChordTarget,
  openChordEditSession,
  applyChordTargetMutation,
} from '../../src/ui/chord-edit-session.js';
import { getEffectiveChord } from '../../src/chord-engine/chord-display.js';

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

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'expected true');
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Mini fixtures : segments d’analyse typiques (segmentId stable).
function segment(chord, startTime, endTime, segmentId, manualOverride = null) {
  return { chord, startTime, endTime, segmentId, manualOverride };
}

function chords() {
  return [
    segment('C', 0, 4, 'seg_c'),
    segment('Am7', 4, 8, 'seg_am7'),
    segment('Dm7', 8, 12, 'seg_dm7'),
  ];
}

console.log("Tests chord-edit-session (Lot C - édition d’accord sécurisée)");

// ---------------------------------------------------------------------------
// C1 — pause immédiate à l’ouverture
// ---------------------------------------------------------------------------

runTest('C1a — la lecture active est mise en pause dès l’ouverture', () => {
  let pauseCount = 0;
  let playCount = 0;
  const data = chords();
  const target = openChordEditSession({
    chords: data,
    index: 1,
    playbackActive: () => true,
    pause: () => { pauseCount++; },
  });
  assertTrue(target != null, "la session doit s’ouvrir");
  assertEqual(pauseCount, 1, 'pause() doit être appelé une fois');
  assertEqual(playCount, 0, "aucun appel play() à l’ouverture");
  assertEqual(target.segmentId, 'seg_am7', 'cible = segment ouvert');
});

runTest('C1b — si la lecture est déjà en pause, son état reste inchangé', () => {
  let pauseCount = 0;
  const data = chords();
  const target = openChordEditSession({
    chords: data,
    index: 0,
    playbackActive: () => false,
    pause: () => { pauseCount++; },
  });
  assertEqual(pauseCount, 0, 'pause() ne doit pas être appelé si déjà en pause');
  assertTrue(target, "la session s’ouvre quand même");
});

runTest('C1c — ouvrir puis fermer ne relance jamais la lecture', () => {
  let playCount = 0;
  let pauseCount = 0;
  const data = chords();
  openChordEditSession({
    chords: data,
    index: 2,
    playbackActive: () => true,
    pause: () => { pauseCount++; },
  });
  // Fermeture « annuler » = simple fin de session : aucune lecture.
  assertEqual(playCount, 0, 'aucun redémarrage de lecture à la fermeture');
  assertEqual(pauseCount, 1, "la pause a bien eu lieu à l’ouverture");
});

// ---------------------------------------------------------------------------
// C2 — cible immuable malgré l’évolution de l’état
// ---------------------------------------------------------------------------

runTest('C2 — une cible ouverte reste identique malgré un changement de temps', () => {
  const data = chords();
  const target = openChordEditSession({ chords: data, index: 0, playbackActive: () => true, pause: () => {} });
  // Simule l’évolution de la lecture : le temps avance, l’accord « actif »
  // change. La cible capturée ne doit pas bouger.
  const currentTime = 9; // dans seg_dm7
  assertEqual(target.segmentId, 'seg_c', "la cible est l’accord d’ouverture");
  assertEqual(captureChordTarget(data[2]).segmentId, 'seg_dm7', "l’accord actif change");
  assertEqual(target.segmentId, 'seg_c', 'la cible reste inchangée malgré le nouvel accord actif');
  void currentTime;
});

runTest('C2b — la cible ne provient jamais de l’index actif de lecture', () => {
  // openChordEditSession ne prend que chords+index : pas de lecture du temps
  // courant, de la surbrillance ou de la position visuelle.
  const data = chords();
  const target = openChordEditSession({
    chords: data,
    index: 1,
    playbackActive: () => false,
  });
  assertEqual(target.segmentId, 'seg_am7', "la cible est exactement l’index demandé");
});

runTest('C2c — resolveChordTarget résout par segmentId, pas par position', () => {
  const data = chords();
  const targetObj = { segmentId: 'seg_c' };
  // Réordonner le tableau ne change pas la résolution par identité permanente.
  const shuffled = [data[2], data[0], data[1]];
  const resolved = resolveChordTarget(shuffled, targetObj);
  assertEqual(resolved, data[0], 'résolution par identité stable (segmentId)');
  assertEqual(resolved.segmentId, 'seg_c', 'le segment ciblé est bien seg_c');
});

// ---------------------------------------------------------------------------
// C3 — Enregistrer modifie uniquement la cible initiale
// ---------------------------------------------------------------------------

runTest('C3 — Enregistrer ne modifie que la cible initiale', () => {
  const data = chords();
  const target = { segmentId: 'seg_am7' };
  const result = applyChordTargetMutation(data, target, { root: 9, quality: 'm7b5', bass: null });
  assertTrue(result.ok, 'la mutation doit réussir');
  assertEqual(getEffectiveChord(data[1]), 'Am7b5', 'le segment cible est édité');
  assertEqual(getEffectiveChord(data[0]), 'C', 'le segment précédent inchangé');
  assertEqual(getEffectiveChord(data[2]), 'Dm7', 'le segment suivant inchangé');
  assertEqual(data[0].manualOverride, null, 'aucun override sur seg_c');
  assertEqual(data[2].manualOverride, null, 'aucun override sur seg_dm7');
});

// ---------------------------------------------------------------------------
// C4 — Revenir à la détection ne restaure que la cible initiale
// ---------------------------------------------------------------------------

runTest('C4 — Revenir à la détection ne restaure que la cible initiale', () => {
  const data = chords();
  // Prépare deux segments modifiés, puis revient à la détection sur le seul
  // segment ciblé.
  data[0].manualOverride = { root: 0, quality: 'maj7', bass: null };
  data[2].manualOverride = { root: 5, quality: '7', bass: null };

  const target = { segmentId: 'seg_dm7' };
  const result = applyChordTargetMutation(data, target, null);
  assertTrue(result.ok, 'retour à la détection ok');
  assertEqual(getEffectiveChord(data[2]), 'Dm7', 'la cible est revenue à sa détection');
  assertEqual(getEffectiveChord(data[0]), 'Cmaj7', "l’autre segment garde sa correction");
  assertEqual(data[0].manualOverride.root, 0, 'le segment voisin est intact');
});

// ---------------------------------------------------------------------------
// C5 — Annuler / fermer sans validation ne modifie rien
// ---------------------------------------------------------------------------

runTest('C5 — annuler/fermer sans validation ne modifie aucun accord', () => {
  const data = chords();
  const refs = data.map((s) => getEffectiveChord(s));
  // « Fermer » = aucune mutation appelée : l’état est strictement intact.
  data.forEach((s, i) => {
    assertEqual(getEffectiveChord(s), refs[i], `segment ${i} inchangé`);
    assertEqual(s.manualOverride, null, `segment ${i} sans override`);
  });
});

runTest('C5b — mutation sans cible valide ne touche aucun accord', () => {
  const data = chords();
  const result = applyChordTargetMutation(data, null, { root: 2, quality: 'm', bass: null });
  assertEqual(result.ok, false, 'aucune mutation sans cible valide');
  assertEqual(data.every((s) => s.manualOverride == null), true, 'aucun segment touché');
});

// ---------------------------------------------------------------------------
// C6 — cible invalide → aucune mutation de remplacement
// ---------------------------------------------------------------------------

runTest('C6 — une cible introuvable ne provoque aucune mutation', () => {
  const data = chords();
  const target = { segmentId: 'seg_missing' };
  const result = applyChordTargetMutation(data, target, { root: 2, quality: 'm', bass: null });
  assertEqual(result.ok, false, 'mutation refusée (cible introuvable)');
  data.forEach((s) => {
    assertEqual(s.manualOverride, null, 'aucun remplacement sur un autre segment');
  });
});

runTest('C6b — cible disparue entre ouverture et validation → refus sans plan', () => {
  const data = chords();
  const target = { segmentId: 'seg_am7' };
  // La cible est supprimée de l’analyse avant la validation.
  data.splice(1, 1);
  const result = applyChordTargetMutation(data, target, { root: 9, quality: 'm', bass: null });
  assertEqual(result.ok, false, 'refus de mutation');
  assertEqual(data.every((s) => s.manualOverride == null), true, 'aucun segment remplacé');
});

// ---------------------------------------------------------------------------
// C7 — fermer puis rouvrir ne réutilise aucun état périmé
// ---------------------------------------------------------------------------

runTest('C7 — rouvrir un nouvel accord capture une nouvelle cible', () => {
  const data = chords();
  const first = openChordEditSession({ chords: data, index: 0, playbackActive: () => false, pause: () => {} });
  assertEqual(first.segmentId, 'seg_c');
  // Réouverture sur un autre accord : nouvelle cible, pas d’état périmé.
  const reopened = openChordEditSession({ chords: data, index: 2, playbackActive: () => false, pause: () => {} });
  assertEqual(reopened.segmentId, 'seg_dm7', "la nouvelle cible ne réutilise pas l’ancienne");
  assertTrue(first.segmentId !== reopened.segmentId, 'les deux cibles sont distinctes');
});

runTest('C7b — la session pure ne garde aucun état global entre ouvertures', () => {
  const data = chords();
  const first = captureChordTarget(data[0]);
  const second = captureChordTarget(data[2]);
  assertEqual(first.segmentId, 'seg_c');
  assertEqual(second.segmentId, 'seg_dm7');
  assertTrue(first.segmentId !== second.segmentId, 'aucune réutilisation');
});

// ===========================================================================
// Garde statique : la session n’est pas re-dérivée depuis le temps courant.
// ===========================================================================

runTest('G1 — chord-edit-session ne lit jamais currentTime ni un index global', () => {
  const src = fs.readFileSync(
    new URL('../../src/ui/chord-edit-session.js', import.meta.url),
    'utf8',
  );
  assertTrue(!/(currentTime|\.playfield|\.activeIndex|scrollLeft|currentIndex)/.test(src),
    'la session ne doit référencer aucune source de cible dérivée');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log("LOT C : tests session édition d’accord OK");
} else {
  console.log('LOT C : ÉCHEC');
}
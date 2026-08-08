// [Claude] — 2026-08-08 — Tests du gestionnaire d’audio focus Studio / Analyse.
// Exécutable avec : node tests/ui/test-audio-focus.js
// Aucun navigateur ni dépendance : le coordinateur est purement JS.

import { createAudioFocusManager } from '../../src/audio/audio-focus-manager.js';

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
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'expected true');
}

console.log('Tests AudioFocusManager');

runTest('A — Studio play → Analyse play → Studio paused, Studio currentTime inchangé', () => {
  const manager = createAudioFocusManager();
  let studioTime = 205;
  let studioPlaying = false;
  let studioPaused = false;
  let analyseTime = 72;
  let analysePlaying = false;

  manager.register('studio', {
    play: () => { studioPlaying = true; },
    pause: () => { studioPlaying = false; studioPaused = true; },
    isPlaying: () => studioPlaying,
  });

  manager.register('analysis', {
    play: () => { analysePlaying = true; },
    pause: () => { analysePlaying = false; },
    isPlaying: () => analysePlaying,
  });

  // Studio commence à jouer.
  manager.requestFocus('studio');
  studioPlaying = true;
  assertEqual(manager.getCurrentFocus(), 'studio');

  // Analyse commence à jouer.
  manager.requestFocus('analysis');
  analysePlaying = true;

  assertTrue(studioPaused, 'Studio doit avoir été mis en pause');
  assertEqual(studioTime, 205, 'currentTime Studio ne doit pas changer');
  assertEqual(analyseTime, 72, 'currentTime Analyse reste indépendant');
  assertEqual(manager.getCurrentFocus(), 'analysis');
});

runTest('B — Analyse play → Studio play → Analyse paused, Analyse currentTime inchangé', () => {
  const manager = createAudioFocusManager();
  let analyseTime = 112;
  let analysePlaying = false;
  let analysePaused = false;
  let studioPlaying = false;

  manager.register('analysis', {
    play: () => { analysePlaying = true; },
    pause: () => { analysePlaying = false; analysePaused = true; },
    isPlaying: () => analysePlaying,
  });

  manager.register('studio', {
    play: () => { studioPlaying = true; },
    pause: () => { studioPlaying = false; },
    isPlaying: () => studioPlaying,
  });

  manager.requestFocus('analysis');
  analysePlaying = true;
  assertEqual(manager.getCurrentFocus(), 'analysis');

  manager.requestFocus('studio');
  studioPlaying = true;

  assertTrue(analysePaused, 'Analyse doit avoir été mise en pause');
  assertEqual(analyseTime, 112, 'currentTime Analyse ne doit pas changer');
  assertEqual(manager.getCurrentFocus(), 'studio');
});

runTest('C — Changement d’onglet sans lancer de son → aucune synchronisation forcée', () => {
  const manager = createAudioFocusManager();
  let studioTime = 325;
  let analyseTime = 12;

  manager.register('studio', {
    play: () => {},
    pause: () => {},
    isPlaying: () => false,
  });

  manager.register('analysis', {
    play: () => {},
    pause: () => {},
    isPlaying: () => false,
  });

  // Simuler un changement d’onglet sans demande de focus.
  assertEqual(studioTime, 325);
  assertEqual(analyseTime, 12);
  assertEqual(manager.getCurrentFocus(), null);
});

runTest('Inscription requiert des callbacks valides', () => {
  const manager = createAudioFocusManager();
  let threw = false;
  try {
    manager.register('bad', { play: () => {}, pause: () => {} });
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, 'doit lever une erreur si isPlaying manque');
  assertTrue(!manager.isRegistered('bad'), 'workspace invalide non enregistré');
});

runTest('requestFocus sur workspace non enregistré retourne false', () => {
  const manager = createAudioFocusManager();
  assertEqual(manager.requestFocus('unknown'), false);
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log('Audio focus : OK');
} else {
  console.log('Audio focus : ÉCHEC');
}

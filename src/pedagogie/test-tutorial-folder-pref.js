// [Claude] — 2026-09-08 — Tests de persistance de la catégorie de tutoriel.
// Exécutable avec : node src/pedagogie/test-tutorial-folder-pref.js

import {
  getTutorialCategory, saveTutorialCategory, TUTORIAL_CATEGORIES,
} from './tutorial-folder-pref.js';

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

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

runTest('catégorie par défaut : null', () => {
  const storage = makeStorage();
  assertEqual(getTutorialCategory(storage, '/a/b/c.mp4'), null);
});

runTest('persistance par chemin absolu', () => {
  const storage = makeStorage();
  saveTutorialCategory(storage, '/a/b/c.mp4', TUTORIAL_CATEGORIES.TUTORIAL);
  assertEqual(getTutorialCategory(storage, '/a/b/c.mp4'), TUTORIAL_CATEGORIES.TUTORIAL);
});

runTest('deux fichiers conservent leurs catégories respectives', () => {
  const storage = makeStorage();
  saveTutorialCategory(storage, '/x/a.mp4', TUTORIAL_CATEGORIES.COVER);
  saveTutorialCategory(storage, '/x/b.mp4', TUTORIAL_CATEGORIES.TUTORIAL);
  assertEqual(getTutorialCategory(storage, '/x/a.mp4'), TUTORIAL_CATEGORIES.COVER);
  assertEqual(getTutorialCategory(storage, '/x/b.mp4'), TUTORIAL_CATEGORIES.TUTORIAL);
});

runTest('valeur invalide rejetée', () => {
  const storage = makeStorage();
  saveTutorialCategory(storage, '/x/a.mp4', 'inconnu');
  assertEqual(getTutorialCategory(storage, '/x/a.mp4'), null);
});

runTest('effacement par valeur null', () => {
  const storage = makeStorage();
  saveTutorialCategory(storage, '/x/a.mp4', TUTORIAL_CATEGORIES.COVER);
  saveTutorialCategory(storage, '/x/a.mp4', null);
  assertEqual(getTutorialCategory(storage, '/x/a.mp4'), null);
});

runTest('changement de catégorie', () => {
  const storage = makeStorage();
  saveTutorialCategory(storage, '/x/a.mp4', TUTORIAL_CATEGORIES.COVER);
  saveTutorialCategory(storage, '/x/a.mp4', TUTORIAL_CATEGORIES.TUTORIAL);
  assertEqual(getTutorialCategory(storage, '/x/a.mp4'), TUTORIAL_CATEGORIES.TUTORIAL);
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);

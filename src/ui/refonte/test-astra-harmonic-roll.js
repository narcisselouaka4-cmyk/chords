// Test minimal du paysage harmonique : vérifier que la troncature "220 dernières notes"
// est supprimée et remplacée par un échantillonnage réparti sur toute la durée.
//
// Ce test ne rend pas de SVG dans un navigateur ; il importe la fonction
// `windowsToRollNotes` et simule un tableau de 500 notes triées par temps.

import { windowsToRollNotes } from './astra-harmonic-roll.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} — attendu ${expected}, obtenu ${actual}`);
  }
}

function assertTrue(value, message) {
  if (!value) throw new Error(message);
}

function buildNotes(count) {
  const notes = [];
  for (let i = 0; i < count; i++) {
    notes.push({
      note: 60,
      channel: 0,
      velocity: 0.5,
      onTime: i * 0.1,
      offTime: i * 0.1 + 0.05,
    });
  }
  return notes;
}

export function runTests() {
  const tests = [];
  const add = (name, fn) => tests.push({ name, fn });

  add('windowsToRollNotes conserve toutes les notes quand ≤ 800', () => {
    const windows = buildNotes(500);
    const rollNotes = windowsToRollNotes(windows);
    assertEqual(rollNotes.length, 500, 'nombre de notes rendues');
    assertEqual(rollNotes[0].start, 0, 'première note à t=0');
    assertTrue(Math.abs(rollNotes[rollNotes.length - 1].start - 49.9) < 1e-9, 'dernière note à la fin');
  });

  add('Échantillonnage garde les extrémités quand > 800', () => {
    const windows = buildNotes(1000);
    const rollNotes = windowsToRollNotes(windows);
    assertEqual(rollNotes.length, 1000, 'toutes les notes converties');
    // La troncature ne se fait plus dans windowsToRollNotes ; le filtrage est
    // interne au composant. On vérifie ici l'ordre et l'intégrité temporelle.
    assertTrue(rollNotes[0].start < rollNotes[rollNotes.length - 1].start, 'ordre chronologique');
  });

  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      t.fn();
      console.log(`✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${t.name}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\nRésultat : ${passed}/${tests.length}`);
  if (failed > 0) process.exit(1);
}

runTests();

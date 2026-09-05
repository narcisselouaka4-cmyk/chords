// [Claude] — 2026-09-06 — Pédagogie IA v2 : la couche IA reste facultative.
// Exécutable avec : node src/ai/test-ai-narration.js
//
// Un seul invariant, mais c'est celui qui compte : sans clé configurée,
// `explainNarration` rend `null` SANS toucher au réseau. La transcription brute
// doit toujours pouvoir s'afficher seule — c'est le comportement par défaut,
// pas un mode dégradé.
//
// Aucun test ici n'appelle une vraie API : `fetch` est remplacé par un piège
// qui fait échouer le test s'il est atteint.

import { explainNarration } from './ai-client.js';

let total = 0;
let passed = 0;
function runTest(name, fn) {
  total++;
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((err) => { console.log(`  ✗ ${name} : ${err.message}`); process.exitCode = 1; });
}
function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} attendu ${expected}, obtenu ${actual}`);
}

// Piège : toute tentative d'appel réseau fait échouer le test en cours.
let networkTouched = false;
globalThis.fetch = () => {
  networkTouched = true;
  throw new Error('appel réseau interdit dans cette suite');
};

await runTest('N1 — sans clé configurée : null, et aucun appel réseau', async () => {
  networkTouched = false;
  const result = await explainNarration('Ici on pose la main gauche sur le ré.', {
    key: 'A',
    chords: ['D', 'A', 'E'],
    source: 'video',
  });
  assertEqual(result, null, 'sans clé, la fonction rend null :');
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

await runTest('N2 — texte vide : null avant même de chercher une clé', async () => {
  networkTouched = false;
  assertEqual(await explainNarration('', { chords: ['D'] }), null);
  assertEqual(await explainNarration('   '), null);
  assertEqual(await explainNarration(null), null);
  assertEqual(await explainNarration(undefined), null);
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

await runTest('N3 — un contexte absent ou mal formé ne fait pas planter', async () => {
  networkTouched = false;
  assertEqual(await explainNarration('un texte', { chords: 'pas un tableau' }), null);
  assertEqual(await explainNarration('un texte'), null);
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;

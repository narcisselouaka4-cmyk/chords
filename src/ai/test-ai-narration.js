// [Claude] — 2026-09-06 — Pédagogie IA v2 : la couche IA reste facultative.
// Exécutable avec : node src/ai/test-ai-narration.js
//
// Un seul invariant, mais c'est celui qui compte : sans clé configurée,
// `explainNarration` rend `null` SANS toucher au réseau. La transcription brute
// doit toujours pouvoir s'afficher seule — c'est le comportement par défaut,
// pas un mode dégradé.
//
// [Refonte Phase 1, 06/09] — Même invariant pour `translateNarrationSegments`,
// et en plus : une traduction qui ne compte plus les passages est REJETÉE en
// bloc, parce que sa synchronisation avec les horodatages serait perdue.
//
// Aucun test ici n'appelle une vraie API : `fetch` est remplacé par un piège
// qui fait échouer le test s'il est atteint (ou par un faux, quand une clé de
// test est volontairement posée).

import { explainNarration, translateNarrationSegments } from './ai-client.js';

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
function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'attendu vrai');
}

// Piège : toute tentative d'appel réseau fait échouer le test en cours.
let networkTouched = false;
globalThis.fetch = () => {
  networkTouched = true;
  throw new Error('appel réseau interdit dans cette suite');
};

// Pièce montée : un window + localStorage pour poser ou non une clé de test,
// comme openai-config.js le lit dans l'application (getAIConfig exige un
// window défini pour aller jusqu'au localStorage).
function withKey(key) {
  globalThis.window = {};
  const store = new Map();
  if (key) store.set('piano-jazz-ai-config', JSON.stringify({ baseUrl: 'http://localhost', apiKey: key, model: 'test' }));
  else store.delete('piano-jazz-ai-config');
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
}
function withoutKey() {
  withKey(null);
}

await runTest('N1 — sans clé configurée : null, et aucun appel réseau', async () => {
  withoutKey();
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
  withoutKey();
  networkTouched = false;
  assertEqual(await explainNarration('', { chords: ['D'] }), null);
  assertEqual(await explainNarration('   '), null);
  assertEqual(await explainNarration(null), null);
  assertEqual(await explainNarration(undefined), null);
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

await runTest('N3 — un contexte absent ou mal formé ne fait pas planter', async () => {
  withoutKey();
  networkTouched = false;
  assertEqual(await explainNarration('un texte', { chords: 'pas un tableau' }), null);
  assertEqual(await explainNarration('un texte'), null);
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

// ---------------------------------------------------------------------------
// Traduction automatique du transcript (refonte Phase 1)
// ---------------------------------------------------------------------------

await runTest('N4 — traduction sans clé : null immédiat, aucun appel réseau', async () => {
  withoutKey();
  networkTouched = false;
  const segments = [{ start: 0, end: 2, text: 'Watch my left hand.' }];
  assertEqual(await translateNarrationSegments(segments), null,
    'sans clé, le texte source reste le comportement par défaut :');
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

await runTest('N5 — traduction sans segments exploitables : null sans clé ni réseau', async () => {
  withoutKey();
  networkTouched = false;
  assertEqual(await translateNarrationSegments([]), null);
  assertEqual(await translateNarrationSegments(null), null);
  assertEqual(await translateNarrationSegments([
    { start: 0, end: 1, text: '   ' },
    { start: 1, end: 2, text: '' },
  ]), null, 'des passages vides ne donnent rien à traduire :');
  assertEqual(networkTouched, false, 'aucun appel réseau ne doit partir :');
});

// ---------------------------------------------------------------------------
// Avec une clé : le faux fetch répond. La traduction doit compter les passages.
// ---------------------------------------------------------------------------

function fakeFetchRespond(contentByCall) {
  let calls = 0;
  globalThis.fetch = async () => {
    const content = contentByCall[Math.min(calls, contentByCall.length - 1)];
    calls++;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };
  return () => { globalThis.fetch = () => { networkTouched = true; throw new Error('réseau interdit'); }; };
}

await runTest('N6 — avec clé : une traduction qui compte les passages est acceptée', async () => {
  withKey('cle-test');
  const restore = fakeFetchRespond(['Voici ma main gauche.\nÉcoutez la basse.']);
  try {
    const lines = await translateNarrationSegments([
      { start: 0, end: 2, text: 'Watch my left hand.' },
      { start: 2, end: 4, text: 'Listen to the bass.' },
    ], { sourceLang: 'en' });
    assertTrue(Array.isArray(lines), 'une traduction acceptée est un tableau :');
    assertEqual(lines.length, 2);
    assertEqual(lines[0], 'Voici ma main gauche.');
    assertEqual(lines[1], 'Écoutez la basse.');
  } finally {
    restore();
    withoutKey();
  }
});

await runTest('N7 — une traduction qui ne compte plus les passages est rejetée en bloc', async () => {
  withKey('cle-test');
  // Deux lignes pour trois passages : la correspondance texte ↔ horodatage
  // serait perdue. Tout est rejeté, pas rafistolé.
  const restore = fakeFetchRespond(['Deux lignes seulement.\nPas assez.']);
  try {
    const lines = await translateNarrationSegments([
      { start: 0, end: 2, text: 'one' },
      { start: 2, end: 4, text: 'two' },
      { start: 4, end: 6, text: 'three' },
    ]);
    assertEqual(lines, null, 'la traduction incomplète n\'est pas rendue :');
  } finally {
    restore();
    withoutKey();
  }
});

await runTest('N8 — clé refusée : AI_API_KEY_INVALID est levée, pas encaissée', async () => {
  withKey('cle-mauvaise');
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  try {
    let thrown = null;
    try {
      await translateNarrationSegments([{ start: 0, end: 1, text: 'hello' }]);
    } catch (err) {
      thrown = err;
    }
    assertEqual(thrown?.message, 'AI_API_KEY_INVALID', 'le 401 doit être nommé :');
  } finally {
    withoutKey();
    globalThis.fetch = () => { networkTouched = true; throw new Error('réseau interdit'); };
  }
});

await runTest('N9 — panne réseau persistante : null après les retries, aucun texte inventé', async () => {
  withKey('cle-test');
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network down'); };
  try {
    const lines = await translateNarrationSegments([{ start: 0, end: 1, text: 'hello' }]);
    assertEqual(lines, null, 'une panne laisse le texte original, pas un faux français :');
    assertTrue(calls >= 2, 'les retries ont bien eu lieu :');
  } finally {
    withoutKey();
    globalThis.fetch = () => { networkTouched = true; throw new Error('réseau interdit'); };
  }
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;

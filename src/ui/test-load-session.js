// [Claude] — 2026-11-13 — Test du cycle de vie d'une session MIDI (création, enregistrement,
// relecture, liste, renommage, métadonnées, suppression), sans Electron.
//
// Avant : un script de débogage du 05/07 qui listait les VRAIES sessions de l'utilisateur via
// window.electronAPI ; sous Node il plantait (« window is not defined ») et, dans Electron, il
// aurait lu ses données. Ici, l'API de fichiers est simulée en mémoire : aucun fichier réel
// n'est lu ni écrit.
//
// Usage : node src/ui/test-load-session.js

import assert from 'node:assert/strict';

// ── Fausse API de fichiers (window.electronAPI.files), en mémoire ──
const store = new Map(); // chemin → contenu
const dirs = new Set();
const HOME = '/maison-de-test';
globalThis.window = {
  electronAPI: {
    files: {
      homeDir: async () => HOME,
      ensureDir: async (p) => { dirs.add(p); return true; },
      readDir: async (p) => [...dirs].filter((d) => d.startsWith(`${p}/`) && !d.slice(p.length + 1).includes('/'))
        .map((d) => ({ name: d.slice(p.length + 1), isDirectory: true, isFile: false })),
      writeFile: async (p, content) => { store.set(p, content); return true; },
      readFile: async (p) => {
        if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
        return store.get(p);
      },
      deleteDir: async (p) => {
        for (const d of [...dirs]) if (d === p || d.startsWith(`${p}/`)) dirs.delete(d);
        for (const k of [...store.keys()]) if (k.startsWith(`${p}/`)) store.delete(k);
        return true;
      },
    },
  },
};

const {
  createSession, saveSessionEvents, loadSession, listSessions, renameSession, updateSessionMetadata, deleteSession,
} = await import('../recorder/session-manager.js');

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); } catch (err) { failed += 1; console.log(`  ✗ ${name}\n    ${err.message}`); }
}
const ROOT = `${HOME}/PianoJazzChords/Sessions`;
const events = [
  { type: 'note_on', note: 60, velocity: 90, time: 0, channel: 0 },
  { type: 'note_on', note: 64, velocity: 80, time: 0.01, channel: 0 },
  { type: 'note_off', note: 60, velocity: 0, time: 1, channel: 0 },
  { type: 'note_off', note: 64, velocity: 0, time: 1.01, channel: 0 },
];

await check('Aucune session : la liste est vide', async () => {
  assert.deepEqual(await listSessions(), []);
});

let first;
await check('Créer une session : Session_001, fichiers de base écrits', async () => {
  first = await createSession({ name: 'Prise du matin', key: 'C', tempo: 90 });
  assert.equal(first.id, 'Session_001');
  for (const f of ['session.json', 'metadata.json', 'events.json', 'markers.json']) assert(store.has(`${ROOT}/Session_001/${f}`), f);
  assert(dirs.has(`${ROOT}/Session_001/analysis`));
});

await check('Tempo inconnu (prise du Studio) : null, pas 120 inventé', async () => {
  const studio = await createSession({ name: 'Studio', tempo: null, sourceType: 'studio' });
  assert.equal(studio.id, 'Session_002');
  assert.equal(studio.tempo, null);
  await deleteSession(studio.id);
});

await check('Enregistrer puis relire les notes et les statistiques', async () => {
  await saveSessionEvents(first.id, events, { duration: 1.01, noteCount: 2, chordCount: 1 });
  assert(store.get(`${ROOT}/${first.id}/events.mid`) instanceof Uint8Array, 'fichier MIDI écrit');
  const data = await loadSession(first.id);
  assert.equal(data.events.filter((e) => e.type === 'note_on').length, 2);
  assert.deepEqual(data.events.map((e) => e.note), [60, 64, 60, 64]);
  assert.equal(data.session.noteCount, 2);
  assert.equal(data.session.duration, 1.01);
  assert.equal(data.metadata.name, 'Prise du matin');
});

await check('Lister : la session avec son aperçu de jeu', async () => {
  const list = await listSessions();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, first.id);
  assert.equal(list[0].preview.length, 40);
  assert.equal(Math.max(...list[0].preview), 1);
});

await check('Une session illisible est ignorée, les autres restent listées', async () => {
  dirs.add(`${ROOT}/Session_009`);
  store.set(`${ROOT}/Session_009/session.json`, '{ abîmé');
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual((await listSessions()).map((s) => s.id), [first.id]); } finally { console.warn = warn; }
  await deleteSession('Session_009');
});

await check('Renommer : le nom change dans session.json et metadata.json', async () => {
  await renameSession(first.id, 'Ballade en Do');
  const data = await loadSession(first.id);
  assert.equal(data.session.name, 'Ballade en Do');
  assert.equal(data.metadata.name, 'Ballade en Do');
});

await check('Métadonnées : tonalité et tempo mis à jour, le reste gardé', async () => {
  await updateSessionMetadata(first.id, { key: 'Am', tempo: 72 });
  const data = await loadSession(first.id);
  assert.equal(data.session.key, 'Am');
  assert.equal(data.session.tempo, 72);
  assert.equal(data.session.name, 'Ballade en Do');
  assert.equal(data.metadata.key, 'Am');
});

await check('Supprimer : plus de fichiers ni de session listée', async () => {
  await deleteSession(first.id);
  assert.deepEqual(await listSessions(), []);
  assert(![...store.keys()].some((k) => k.startsWith(`${ROOT}/${first.id}/`)));
});

await check('Numérotation : la session suivante prend le numéro le plus haut + 1', async () => {
  dirs.add(`${ROOT}/Session_017`);
  const next = await createSession({ name: 'Suite' });
  assert.equal(next.id, 'Session_018');
});

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exit(failed ? 1 : 0);

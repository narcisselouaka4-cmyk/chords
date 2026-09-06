// [Claude] — 2026-09-06 — Tests de la bibliothèque de tutoriels (refonte Phase 1).
// Exécutable avec : node src/pedagogie/test-tutorial-library.js
//
// Le module testé est pur pour tout ce qui est filtrage/nommage, et parle à
// window.electronAPI.files pour la lecture de dossier — un faux files est
// injecté pour chaque cas, comme le fait le harnais des autres suites UI.
//
// Invariant central du retour d'usage du 06/09 : Pédagogie IA ne liste QUE de
// vrais fichiers .mp4 d'un dossier choisi, indépendamment du magasin Studio.

import {
  listTutorialFiles, copyTutorialIntoFolder, isMp4Name, tutorialDisplayName,
} from './tutorial-library.js';
import { getTutorialFolder, saveTutorialFolder } from './tutorial-folder-pref.js';

let total = 0;
let passed = 0;
function runTest(name, fn) {
  total++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((err) => { console.log(`  ✗ ${name} : ${err.message}`); process.exitCode = 1; });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
  }
  return Promise.resolve();
}
function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} attendu ${expected}, obtenu ${actual}`);
}
function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'attendu vrai');
}

/** Faux window.electronAPI.files piloté par le test. */
function fakeFiles({ entries = [], existingPaths = [], throwOnRead = false } = {}) {
  const written = [];
  return {
    api: {
      readDir: async () => {
        if (throwOnRead) throw new Error('EACCES');
        return entries;
      },
      // Un chemin « existe » s'il est dans existingPaths OU s'il vient d'être écrit.
      exists: async (p) => existingPaths.includes(p) || written.some((w) => w.path === p),
      readBinary: async () => new Uint8Array([1, 2, 3]),
      writeBinary: async (path, bytes) => { written.push({ path, bytes }); return true; },
    },
    written,
  };
}

function withWindow(api, fn) {
  globalThis.window = { electronAPI: { files: api } };
  return fn().finally(() => { delete globalThis.window; });
}

// ---------------------------------------------------------------------------
// Filtrage .mp4
// ---------------------------------------------------------------------------

await runTest('L1 — .mp4 reconnu, insensible à la casse', async () => {
  assertTrue(isMp4Name('tutoriel.mp4'));
  assertTrue(isMp4Name('Tutoriel.MP4'));
  assertTrue(isMp4Name('a.Mp4'));
  assertTrue(!isMp4Name('morceau.mp3'), 'un .mp3 n\'est pas un tutoriel vidéo :');
  assertTrue(!isMp4Name('note.txt'));
  assertTrue(!isMp4Name('clip.mp4.bak'));
  assertTrue(!isMp4Name(null));
  assertTrue(!isMp4Name(42));
});

await runTest('L2 — le nom affichable retire l\'extension, la garde sinon', async () => {
  assertEqual(tutorialDisplayName('Gospel Piano Secrets.mp4'), 'Gospel Piano Secrets');
  assertEqual(tutorialDisplayName('Sans extension'), 'Sans extension');
});

// ---------------------------------------------------------------------------
// listTutorialFiles
// ---------------------------------------------------------------------------

await runTest('L3 — seuls les .mp4 sont listés, avec leur chemin réel', async () => {
  const { api } = fakeFiles({ entries: [
    { name: 'tuto a.mp4', isFile: true, isDirectory: false },
    { name: 'Chant.mp3', isFile: true, isDirectory: false },      // pas un tutoriel
    { name: 'sous-dossier', isFile: false, isDirectory: true },   // pas un fichier
    { name: 'TUTO B.MP4', isFile: true, isDirectory: false },     // casse différente
    { name: 'readme.txt', isFile: true, isDirectory: false },
  ] });
  await withWindow(api, async () => {
    const result = await listTutorialFiles('/home/x/tuto');
    assertTrue(result.ok, 'le dossier existe et se lit :');
    assertEqual(result.files.length, 2, 'un .mp3 et un .txt sont écartés :');
    assertEqual(result.files[0].name, 'tuto a.mp4', 'tri insensible à la casse :');
    assertEqual(result.files[0].path, '/home/x/tuto/tuto a.mp4', 'chemin réel, pas un Track_ID :');
    assertEqual(result.files[1].name, 'TUTO B.MP4');
  });
});

await runTest('L4 — dossier non configuré : raison no-folder, jamais une liste silencieuse', async () => {
  const result = await listTutorialFiles('');
  assertTrue(!result.ok);
  assertEqual(result.reason, 'no-folder');
  assertEqual(result.files.length, 0);
});

await runTest('L5 — dossier configuré mais disparu : raison missing', async () => {
  // readDir renvoie [] sur ENOENT : c'est exists() qui distingue « disparu »
  // d'« existant mais vide ».
  const { api } = fakeFiles({ entries: [] });
  await withWindow(api, async () => {
    const result = await listTutorialFiles('/mnt/parti');
    assertTrue(!result.ok);
    assertEqual(result.reason, 'missing');
  });
});

await runTest('L6 — dossier existant mais vide : ok, liste vide (un constat, pas une panne)', async () => {
  const { api } = fakeFiles({ entries: [], existingPaths: ["/home/x/vide"] });
  await withWindow(api, async () => {
    const result = await listTutorialFiles('/home/x/vide');
    assertTrue(result.ok);
    assertEqual(result.files.length, 0);
  });
});

await runTest('L7 — dossier illisible : raison unreadable', async () => {
  const { api } = fakeFiles({ throwOnRead: true });
  await withWindow(api, async () => {
    const result = await listTutorialFiles('/root');
    assertTrue(!result.ok);
    assertEqual(result.reason, 'unreadable');
  });
});

// ---------------------------------------------------------------------------
// copyTutorialIntoFolder
// ---------------------------------------------------------------------------

await runTest('L8 — copier un .mp4 dans le dossier configuré', async () => {
  const { api, written } = fakeFiles({});
  await withWindow(api, async () => {
    const result = await copyTutorialIntoFolder('/tmp/mon tuto.mp4', '/home/x/tuto');
    assertTrue(result.ok, result.error || '');
    assertEqual(result.fileName, 'mon tuto.mp4');
    assertEqual(written.length, 1, 'une seule écriture :');
    assertEqual(written[0].path, '/home/x/tuto/mon tuto.mp4');
  });
});

await runTest('L9 — jamais d\'écrasement : suffixe libre quand le nom est pris', async () => {
  const { api, written } = fakeFiles({ existingPaths: ["/home/x/tuto/exercice.mp4", "/home/x/tuto/dejà-là.mp4"] });
  await withWindow(api, async () => {
    const result = await copyTutorialIntoFolder('/tmp/exercice.mp4', '/home/x/tuto');
    assertTrue(result.ok);
    assertEqual(result.fileName, 'exercice (2).mp4', 'le nom pris n\'est pas écrasé :');
    assertEqual(written[0].path, '/home/x/tuto/exercice (2).mp4');
  });
});

await runTest('L10 — réimporter un fichier DÉJÀ DANS le dossier : détecté, pas recopié', async () => {
  const { api, written } = fakeFiles({ existingPaths: ["/home/x/tuto/exercice.mp4", "/home/x/tuto/dejà-là.mp4"] });
  await withWindow(api, async () => {
    const result = await copyTutorialIntoFolder('/home/x/tuto/dejà-là.mp4', '/home/x/tuto');
    assertTrue(result.ok);
    assertTrue(result.alreadyThere, 'rien à copier, le dire :');
    assertEqual(written.length, 0);
  });
});

await runTest('L11 — un non-.mp4 est refusé même si la boîte de dialogue a été contournée', async () => {
  const { api, written } = fakeFiles({});
  await withWindow(api, async () => {
    const result = await copyTutorialIntoFolder('/tmp/pirate.mp3', '/home/x/tuto');
    assertTrue(!result.ok);
    assertTrue((result.error || '').includes('.mp4'));
    assertEqual(written.length, 0);
  });
});

await runTest('L12 — sans dossier configuré : refus clair, pas de copie dans le vide', async () => {
  const { api, written } = fakeFiles({});
  await withWindow(api, async () => {
    const result = await copyTutorialIntoFolder('/tmp/a.mp4', '');
    assertTrue(!result.ok);
    assertEqual(written.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Réglage persistant du dossier
// ---------------------------------------------------------------------------

runTest('L13 — le réglage du dossier se lit, se garde et s\'efface', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assertEqual(getTutorialFolder(storage), '', 'rien configuré au départ :');
  assertEqual(saveTutorialFolder(storage, '/home/x/tuto'), '/home/x/tuto');
  assertEqual(getTutorialFolder(storage), '/home/x/tuto');
  saveTutorialFolder(storage, '  /autre/dossier  ');
  assertEqual(getTutorialFolder(storage), '/autre/dossier', 'délimité du blanc :');
  saveTutorialFolder(storage, '');
  assertEqual(getTutorialFolder(storage), '', 'une valeur vide efface :');
  assertEqual(getTutorialFolder(null), '', 'sans localStorage, pas de crash :');
  assertEqual(saveTutorialFolder(null, '/x'), '/x');
});

runTest('L14 — un localStorage qui jette ne fait pas tomber l\'écran', () => {
  const broken = {
    getItem: () => { throw new Error('quota'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('quota'); },
  };
  assertEqual(getTutorialFolder(broken), '');
  saveTutorialFolder(broken, '/x'); // ne lève pas
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;
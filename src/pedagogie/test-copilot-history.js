// [Claude] — 2026-09-09 — Tests de la persistance multi-conversations Copilot IA.
//
// Le module est testé avec un IPC simulé en mémoire (pas de disque, pas de
// window.electronAPI réel). On vérifie le contrat : un ID unique par
// conversation, version, sauvegarde après message, suppression, relecture.

import crypto from 'crypto';
import {
  createConversation,
  loadHistory,
  saveHistory,
  deleteConversation,
  deleteEmptyConversations,
  listAllConversations,
  getHistoryFilePath,
  labelForConversationPath,
  AUTONOMOUS_HISTORY_KEY,
} from './copilot-history.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    failed += 1;
    console.log(`${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function mockFilesApi() {
  const store = new Map();
  return {
    store,
    homeDir: async () => '/home/test',
    ensureDir: async () => true,
    readFile: async (path) => store.get(path) || null,
    writeFile: async (path, content) => {
      const data = typeof content === 'string' ? content : JSON.stringify(content);
      store.set(path, data);
    },
    deleteFile: async (path) => store.delete(path),
    exists: async (path) => store.has(path),
    readDir: async () => Array.from(store.keys()).map((name) => ({ name: name.split('/').pop(), isFile: true, isDirectory: false })),
  };
}

function installMock(filesApi) {
  global.window = {
    electronAPI: { files: filesApi },
    crypto: {
      subtle: {
        digest: async (algo, buffer) => {
          const algoName = String(algo).replace(/-/g, '').toLowerCase();
          const hash = crypto.createHash(algoName);
          hash.update(Buffer.from(buffer));
          const digest = hash.digest();
          const arrayBuffer = digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
          return arrayBuffer;
        },
      },
    },
  };
}

async function runTests() {
  const filesApi = mockFilesApi();
  installMock(filesApi);

  const tutorialPath = '/home/test/tuto/Comment harmoniser rapidement.mp4';

  // Création
  const conversationId = await createConversation(tutorialPath);
  check('Création d\'une conversation retourne un ID', typeof conversationId === 'string' && conversationId.startsWith('conv_'));

  const filePath = await getHistoryFilePath(conversationId);
  check('Le chemin de fichier se termine par .json', filePath.endsWith('.json'));
  check('Le fichier contient le conversationId', filePath.includes(conversationId));

  // [Claude] — 2026-10-16 — Créer une conversation n'écrit RIEN sur le disque : le fichier naît au
  // premier message. Sans cela, ouvrir l'onglet ou cliquer « Nouvelle conversation » laissait à
  // chaque fois une conversation vide dans l'historique (Narcisse : « une tonne de conversations
  // vides […] c'est super dérangeant »).
  check('Créer une conversation n\'écrit rien sur le disque', (await loadHistory(conversationId)) === null);
  check('… et elle n\'apparaît pas encore dans l\'historique', (await listAllConversations()).length === 0);

  // Sauvegarde
  const messages = [
    { role: 'user', content: 'Explique le premier accord', timestamp: '2026-09-06T12:00:00Z' },
    { role: 'assistant', content: 'Le premier accord est un Do majeur.', timestamp: '2026-09-06T12:00:05Z' },
  ];
  const ok = await saveHistory(conversationId, tutorialPath, messages);
  check('Sauvegarde réussie', ok);

  const stored = filesApi.store.get(filePath);
  const parsed = JSON.parse(stored);
  check('La version est stockée', parsed.version === 2);
  check('Le chemin du tutoriel est stocké', parsed.tutorialPath === tutorialPath);
  check('Les messages sont stockés', parsed.messages.length === 2);

  const reloaded = await loadHistory(conversationId);
  check('Relecture donne les messages sauvegardés', reloaded.messages.length === 2);
  check('Relecture conserve le rôle des messages', reloaded.messages[0].role === 'user' && reloaded.messages[1].role === 'assistant');

  // Multi-conversations
  const secondId = await createConversation(tutorialPath);
  check('Deux conversations distinctes pour le même tutoriel', secondId !== conversationId);
  // La seconde n'a aucun message : elle reste hors de l'historique tant que rien n'est dit.
  const all = await listAllConversations();
  check('listAllConversations ne montre que la conversation où quelque chose a été dit', all.length === 1);
  check('… et elle est titrée par la question du pianiste', all[0].title === 'Explique le premier accord');
  check('… avec son nombre d\'échanges', all[0].messageCount === 2);
  check('… et un aperçu de la réponse', all[0].preview.startsWith('Le premier accord'));
  check('Enregistrer une conversation sans message ne crée pas de fichier',
    (await saveHistory(secondId, tutorialPath, [])) === false && (await loadHistory(secondId)) === null);

  // Suppression
  const deleted = await deleteConversation(conversationId);
  check('Suppression de la conversation réussie', deleted);
  check('Après suppression, la conversation est absente', (await loadHistory(conversationId)) === null);

  const allAfter = await listAllConversations();
  check('listAllConversations est vide après suppression', allAfter.length === 0);

  // Suppression des conversations vides
  const emptyAuto = await createConversation(AUTONOMOUS_HISTORY_KEY);
  const filledAuto = await createConversation(AUTONOMOUS_HISTORY_KEY);
  await saveHistory(filledAuto, AUTONOMOUS_HISTORY_KEY, [
    { role: 'user', content: 'Question', timestamp: '2026-09-06T12:00:00Z' },
  ]);
  // Plus aucune conversation vide n'est écrite : la purge n'a donc rien à supprimer (elle reste pour
  // les fichiers vides laissés par les anciennes versions).
  const removedEmpty = await deleteEmptyConversations();
  check('Plus aucune conversation vide à supprimer', removedEmpty === 0);
  check('La conversation ouverte sans rien dire n\'est jamais écrite', (await loadHistory(emptyAuto)) === null);
  check('La conversation avec messages est conservée', (await loadHistory(filledAuto)) !== null);

  // Mode autonome
  const autoId = await createConversation(AUTONOMOUS_HISTORY_KEY);
  check('Conversation autonome créée', typeof autoId === 'string');
  const autoLabel = labelForConversationPath(AUTONOMOUS_HISTORY_KEY);
  check('Label autonome correct', autoLabel === 'Mode autonome');

  // Historique sans window.electronAPI
  delete global.window;
  const noApi = await loadHistory(secondId);
  check('Sans IPC, loadHistory retourne null', noApi === null);
  const noApiSave = await saveHistory(secondId, tutorialPath, []);
  check('Sans IPC, saveHistory retourne false', noApiSave === false);

  // Restaurer window pour ne pas perturber d'autres modules si ce fichier est chaîné.
  installMock(filesApi);

  // [Claude] — 2026-11-10 — La source d'une conversation s'écrit avec elle, et un fichier qu'on ne
  // sait pas lire n'est jamais pris pour une conversation vide.
  const safeApi = mockFilesApi();
  installMock(safeApi);
  const dir = '/home/test/PianoJazzChords/PedagogieCopilot';
  const sessionConv = await createConversation('Session_017');
  await saveHistory(sessionConv, 'Session_017', [{ role: 'user', content: 'Que penses-tu de ma session ?' }],
    { source: { kind: 'session', key: 'Session_017', label: 'Session : test 4', fingerprint: '12:abc' } });
  const sourced = await loadHistory(sessionConv);
  check('La source est relue avec la conversation', sourced?.source?.kind === 'session' && sourced.source.fingerprint === '12:abc', JSON.stringify(sourced?.source));
  check('L\'ancienne clé d\'origine reste écrite (anciens lecteurs)', sourced?.tutorialPath === 'Session_017');
  const legacyConv = await createConversation(AUTONOMOUS_HISTORY_KEY);
  await saveHistory(legacyConv, AUTONOMOUS_HISTORY_KEY, [{ role: 'user', content: 'Bonjour' }]);
  check('Sans source fournie, rien n\'est inventé', (await loadHistory(legacyConv))?.source === null);

  const where = (await getHistoryFilePath(sessionConv)).replace(/\/[^/]+$/, '');
  check('Le faux dossier est celui attendu', where === dir, where);
  safeApi.store.set(`${dir}/conv_1_broken.json`, '{"version":2,"tutorialPath":"/tuto.mp4","messages":[{"role":"user","content":"une vraie quest');
  safeApi.store.set(`${dir}/conv_2_oddformat.json`, JSON.stringify({ version: 9, tutorialPath: '/tuto.mp4', messages: { a: 1 } }));
  safeApi.store.set(`${dir}/conv_3_empty.json`, JSON.stringify({ version: 1, tutorialPath: AUTONOMOUS_HISTORY_KEY, messages: [] }));
  safeApi.store.set(`${dir}/memories.json`, JSON.stringify({ version: 1, entries: [{ id: 'm1', text: 'souvenir' }] }));
  safeApi.store.set(`${dir}/memories-sauvegarde.json`, JSON.stringify({ version: 1, entries: [{ id: 'm1', text: 'souvenir' }] }));
  safeApi.store.set(`${dir}/autre-chose.json`, JSON.stringify({ reglage: true }));
  const listed = await listAllConversations();
  const ids = listed.map((item) => item.conversationId);
  check('Les souvenirs et leurs copies ne sont pas listés comme des conversations', !ids.some((id) => id.startsWith('memories')), ids.join(','));
  check('Un fichier JSON étranger n\'est pas listé', !ids.includes('autre-chose'));
  check('Un fichier abîmé est listé comme illisible, pas comme vide', listed.find((i) => i.conversationId === 'conv_1_broken')?.unreadable === true && listed.find((i) => i.conversationId === 'conv_1_broken')?.empty === false);
  check('Un format inconnu est illisible, pas vide', listed.find((i) => i.conversationId === 'conv_2_oddformat')?.unreadable === true);
  const removedSafe = await deleteEmptyConversations();
  check('La purge ne supprime que la conversation réellement vide', removedSafe === 1, `supprimées=${removedSafe}`);
  check('Le fichier abîmé est toujours là', safeApi.store.has(`${dir}/conv_1_broken.json`));
  check('Le fichier au format inconnu est toujours là', safeApi.store.has(`${dir}/conv_2_oddformat.json`));
  check('Les souvenirs sont toujours là', safeApi.store.has(`${dir}/memories.json`) && safeApi.store.has(`${dir}/memories-sauvegarde.json`));
  check('La conversation vide a bien disparu', !safeApi.store.has(`${dir}/conv_3_empty.json`));

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

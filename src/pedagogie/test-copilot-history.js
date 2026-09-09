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

  const initial = await loadHistory(conversationId);
  check('Avant sauvegarde, l’historique est vide', initial && initial.messages.length === 0);
  check('Le tutoriel d’origine est conservé', initial?.tutorialPath === tutorialPath);

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
  const all = await listAllConversations();
  check('listAllConversations retourne 2 conversations', all.length === 2);

  // Suppression
  const deleted = await deleteConversation(conversationId);
  check('Suppression de la conversation réussie', deleted);
  check('Après suppression, la conversation est absente', (await loadHistory(conversationId)) === null);

  const allAfter = await listAllConversations();
  check('listAllConversations retourne 1 conversation après suppression', allAfter.length === 1);

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

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

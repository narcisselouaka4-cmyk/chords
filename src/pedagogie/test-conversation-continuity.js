// [Claude] — 2026-11-10 — Tests de la continuité des conversations du Copilote.
//
// Parcours en plusieurs étapes, sur le VRAI module d'historique branché à un faux dossier en
// mémoire (aucun disque, aucun profil réel) : ancienne conversation rouverte puis navigation,
// réponse lente, redémarrage, fichier illisible, session dont le numéro est réattribué.

import {
  createConversation, loadHistory, saveHistory, listAllConversations, AUTONOMOUS_HISTORY_KEY,
} from './copilot-history.js';
import {
  createConversationKeeper, decideContextEvent, sourceFromKey, sameSource, autonomousSource,
  sessionFingerprint, conversationMatchesSession, AUTONOMOUS_KEY,
} from './conversation-continuity.js';
import { lastPlayingTake } from './take-attachment.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`${GREEN}✓${RESET} ${name}`); }
  else { failed += 1; console.log(`${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ''}`); }
}

const DIR = '/home/test/PianoJazzChords/PedagogieCopilot';

function mockFilesApi() {
  const store = new Map();
  const api = {
    store,
    writes: [],
    readDelay: new Map(),
    homeDir: async () => '/home/test',
    ensureDir: async () => true,
    readFile: async (path) => {
      const wait = api.readDelay.get(path);
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      return store.get(path) || null;
    },
    writeFile: async (path, content) => {
      api.writes.push(path);
      store.set(path, typeof content === 'string' ? content : JSON.stringify(content));
    },
    deleteFile: async (path) => store.delete(path),
    readDir: async () => Array.from(store.keys()).map((name) => ({ name: name.split('/').pop(), isFile: true, isDirectory: false })),
  };
  return api;
}

function fakeStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const history = { createConversation, loadHistory, saveHistory, listAllConversations };
const keeperOn = (storage) => createConversationKeeper({ history, storage, lastTakeOf: lastPlayingTake });
const conversationFiles = (api) => [...api.store.keys()].filter((p) => /\/conv_[^/]+\.json$/.test(p));
const fileOf = (api, id) => JSON.parse(api.store.get(`${DIR}/${id}.json`) || 'null');

const TUTO_A = '/home/test/PianoJazzChords/Pedagogie/bibliotheque/amazing-grace.mp4';
const TUTO_B = '/home/test/PianoJazzChords/Pedagogie/bibliotheque/slow-grace.mp4';
const noteEvents = (notes, shift = 0) => notes.flatMap((note, i) => [
  { type: 'note_on', note: note + shift, velocity: 80, time: i * 0.5 },
  { type: 'note_off', note: note + shift, velocity: 0, time: i * 0.5 + 0.4 },
]);

/** Écrit une conversation ancienne, comme l'application d'avant (sans champ `source`). */
function seedLegacy(api, id, key, messages, updatedAt) {
  api.store.set(`${DIR}/${id}.json`, JSON.stringify({ version: 2, tutorialPath: key, updatedAt, messages }));
}

function testSources() {
  check('Clé autonome → conversation libre', sourceFromKey(AUTONOMOUS_HISTORY_KEY).kind === 'autonomous' && AUTONOMOUS_KEY === AUTONOMOUS_HISTORY_KEY);
  check('Clé vide → conversation libre', sourceFromKey('').kind === 'autonomous');
  check('Chemin absolu → tutoriel', sourceFromKey(TUTO_A).kind === 'tutorial');
  check('Chemin Windows → tutoriel', sourceFromKey('C:\\Tutos\\grace.mp4').kind === 'tutorial');
  check('Session_017 → session', sourceFromKey('Session_017').kind === 'session');
  check('exercice:<titre> → exercice', sourceFromKey('exercice:II-V-I majeur').kind === 'exercise');
  check('Deux sources de même clé sont la même', sameSource(sourceFromKey(TUTO_A), sourceFromKey(TUTO_A)) && !sameSource(sourceFromKey(TUTO_A), sourceFromKey(TUTO_B)));
}

function testDecisions() {
  const tutoA = sourceFromKey(TUTO_A);
  const tutoB = sourceFromKey(TUTO_B);
  const free = autonomousSource();
  const act = (state, event) => decideContextEvent(state, event).action;
  check('Échange libre en cours + Pédagogie annonce un tutoriel → on garde, on propose',
    act({ source: free, hasMessages: true, touched: true }, { type: 'announce', source: tutoA }) === 'offer');
  check('Dernier échange seulement réaffiché au lancement (rien fait depuis) + annonce → on suit l\'écran',
    act({ source: free, hasMessages: true, touched: false, pinned: false }, { type: 'announce', source: tutoA }) === 'switch');
  check('Échange rouvert exprès depuis l\'historique, seulement relu + annonce → on garde',
    act({ source: free, hasMessages: true, touched: true, pinned: true }, { type: 'announce', source: tutoA }) === 'offer');
  check('Brouillon seul (rien envoyé) + annonce → on garde, on propose',
    act({ source: free, hasDraft: true }, { type: 'announce', source: tutoA }) === 'offer');
  check('Rien en cours + annonce → on suit l\'écran',
    act({ source: free }, { type: 'announce', source: tutoA }) === 'switch');
  check('Conversation du tutoriel A + annonce du même tutoriel → inchangée',
    act({ source: tutoA, hasMessages: true }, { type: 'announce', source: tutoA }) === 'attach');
  check('Conversation qui suit le tutoriel A + on ouvre le tutoriel B → suit B',
    act({ source: tutoA, hasMessages: true, touched: true, pinned: false }, { type: 'announce', source: tutoB }) === 'switch');
  check('Conversation du tutoriel A rouverte depuis l\'historique + annonce de B → on garde',
    act({ source: tutoA, hasMessages: true, touched: true, pinned: true }, { type: 'announce', source: tutoB }) === 'offer');
  check('Réponse attendue + annonce → jamais de remplacement',
    act({ source: tutoA, hasMessages: true, busy: true }, { type: 'announce', source: tutoB }) === 'offer');
  check('Session en cours + annonce d\'un tutoriel → on garde',
    act({ source: sourceFromKey('Session_017'), hasMessages: true, touched: true }, { type: 'announce', source: tutoA }) === 'offer');
  check('Demande explicite sur une autre source → on y va',
    act({ source: free, hasMessages: true, hasDraft: true }, { type: 'request', source: sourceFromKey('Session_017') }) === 'switch');
  check('Demande explicite sur la même source → inchangée',
    act({ source: sourceFromKey('Session_017'), hasMessages: true }, { type: 'request', source: sourceFromKey('Session_017') }) === 'attach');
  check('Tutoriel fermé pendant sa conversation → elle reste ouverte',
    act({ source: tutoA, hasMessages: true }, { type: 'closed', source: tutoA }) === 'detach');
  check('Tutoriel fermé, rien en cours → retour à une conversation libre',
    act({ source: tutoA }, { type: 'closed', source: tutoA }) === 'reset');
  check('Tutoriel fermé pendant un autre échange → rien',
    act({ source: free, hasMessages: true }, { type: 'closed', source: tutoA }) === 'ignore');
}

/** Critère 1 : ancienne conversation → Pédagogie → Exercices → Sessions → retour. */
async function testOldConversationSurvivesNavigation() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  const take = { id: 'take-1', events: noteEvents([60, 64, 67]), duration: 1.5 };
  seedLegacy(api, 'conv_100_old', 'Session_010', [
    { role: 'user', content: 'Que penses-tu de ma session ?', take },
    { role: 'assistant', content: 'Ta mélodie tient bien.' },
  ], '2026-11-01T10:00:00Z');
  seedLegacy(api, 'conv_200_tuto', TUTO_A, [
    { role: 'user', content: 'Que joue-t-il ici ?' },
    { role: 'assistant', content: 'Un 7-3-6.' },
  ], '2026-11-05T10:00:00Z');
  const storage = fakeStorage();
  const keeper = keeperOn(storage);
  await keeper.restoreLast();
  const filesBefore = conversationFiles(api).length;

  const opened = await keeper.open('conv_100_old');
  check('L\'ancienne conversation s\'ouvre', opened.ok && keeper.current().id === 'conv_100_old');
  check('Sa source est retrouvée (session), pas « mode autonome »', keeper.current().source.kind === 'session' && keeper.current().source.key === 'Session_010');
  check('Sa prise jointe est retrouvée', keeper.current().lastTake?.id === 'take-1');
  keeper.setDraft('Et si je gardais le début ?');
  const messagesRef = keeper.current().messages;

  // Pédagogie IA s'affiche avec un tutoriel prêt : simple annonce.
  let decision = decideContextEvent(keeper.stateFor(), { type: 'announce', source: sourceFromKey(TUTO_A) });
  check('Passage par Pédagogie IA : la conversation n\'est pas remplacée', decision.action === 'offer', decision.action);
  // Exercices puis Sessions MIDI : aucun clic « Copilote », donc aucun événement. Retour sur Pédagogie.
  decision = decideContextEvent(keeper.stateFor(), { type: 'announce', source: sourceFromKey(TUTO_A) });
  check('Deuxième passage par Pédagogie IA : toujours pas remplacée', decision.action === 'offer');

  check('Retour au Copilote : même identifiant', keeper.current().id === 'conv_100_old');
  check('… mêmes messages (même objet, 2 messages)', keeper.current().messages === messagesRef && messagesRef.length === 2);
  check('… même brouillon', keeper.draft() === 'Et si je gardais le début ?');
  check('… même source', keeper.current().source.key === 'Session_010');
  check('Aucun fichier de conversation créé par la navigation', conversationFiles(api).length === filesBefore, `${conversationFiles(api).length} contre ${filesBefore}`);
  check('Aucune écriture sur le disque', api.writes.length === 0, api.writes.join(','));

  // Un message de plus : la conversation est enregistrée sous SA source.
  keeper.current().messages.push({ role: 'user', content: 'Garde le début.' }, { role: 'assistant', content: 'D\'accord.' });
  await keeper.save();
  const saved = fileOf(api, 'conv_100_old');
  check('Enregistrée sous sa source d\'origine, pas sous la clé autonome', saved.tutorialPath === 'Session_010' && saved.source?.kind === 'session', saved.tutorialPath);
  check('Toujours une seule conversation pour cet échange', conversationFiles(api).length === filesBefore);
}

/** La conversation d'un tutoriel suit le tutoriel ; les brouillons restent chacun chez soi. */
async function testTutorialFollowsAndDraftsStay() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  seedLegacy(api, 'conv_200_tuto', TUTO_A, [{ role: 'user', content: 'Que joue-t-il ?' }, { role: 'assistant', content: 'Un 7-3-6.' }], '2026-11-05T10:00:00Z');
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  const emptyId = keeper.current().id;
  let d = decideContextEvent(keeper.stateFor(), { type: 'announce', source: sourceFromKey(TUTO_A) });
  check('Rien en cours : ouvrir un tutoriel ouvre sa conversation', d.action === 'switch');
  const a = await keeper.openForSource(sourceFromKey(TUTO_A));
  check('La dernière conversation du tutoriel A est reprise', a.ok && a.resumed && keeper.current().id === 'conv_200_tuto');
  check('La conversation vide quittée n\'a rien écrit', !api.store.has(`${DIR}/${emptyId}.json`));
  keeper.setDraft('brouillon A');
  d = decideContextEvent(keeper.stateFor(), { type: 'announce', source: sourceFromKey(TUTO_B) });
  check('Tutoriel B ouvert : la conversation suit', d.action === 'switch');
  const b = await keeper.openForSource(sourceFromKey(TUTO_B));
  check('Nouvelle conversation pour B (aucune n\'existait)', b.ok && !b.resumed && keeper.current().source.key === TUTO_B);
  check('Le brouillon de A n\'apparaît pas dans B', keeper.draft() === '');
  keeper.setDraft('brouillon B');
  await keeper.openForSource(sourceFromKey(TUTO_A));
  check('Retour sur A : même conversation et son brouillon', keeper.current().id === 'conv_200_tuto' && keeper.draft() === 'brouillon A');
  check('Aucune conversation vide écrite', conversationFiles(api).length === 1, String(conversationFiles(api).length));
}

/** Critère 2 : réponse lente ; on ouvre une autre conversation pendant la requête. */
async function testLateAnswerJoinsItsConversation() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  seedLegacy(api, 'conv_300_other', AUTONOMOUS_HISTORY_KEY, [{ role: 'user', content: 'Autre sujet' }, { role: 'assistant', content: 'Réponse B' }], '2026-11-06T10:00:00Z');
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  const origin = keeper.current();
  origin.messages.push({ role: 'user', content: 'Explique-moi le II–V–I.' });
  keeper.beginTurn(origin);
  await keeper.save(origin);
  check('La question est écrite dès l\'envoi (fermer l\'application ne la perd pas)', fileOf(api, origin.id)?.messages?.length === 1);

  // Pendant l'attente : on ouvre une autre conversation.
  const other = await keeper.open('conv_300_other');
  check('L\'autre conversation s\'ouvre pendant la requête', other.ok && keeper.current().id === 'conv_300_other');
  check('L\'échange d\'origine reste vivant en mémoire', keeper.isLive(origin.id));

  // On revient sur l'échange d'origine AVANT la réponse : c'est le même objet, pas une copie du disque.
  const back = await keeper.open(origin.id);
  check('Rouvrir l\'échange en attente rend le même objet', back.ok && back.entry === origin);
  await keeper.open('conv_300_other');

  // La réponse arrive : elle rejoint son échange d'origine.
  origin.messages.push({ role: 'assistant', content: 'Le II–V–I est une cadence…' });
  keeper.endTurn(origin);
  await keeper.save(origin);
  keeper.settle(origin);
  check('La réponse est dans l\'échange d\'origine', fileOf(api, origin.id)?.messages?.length === 2 && fileOf(api, origin.id).messages[1].content.startsWith('Le II–V–I'));
  check('L\'autre conversation n\'a rien reçu', fileOf(api, 'conv_300_other').messages.length === 2 && keeper.current().messages.length === 2);
  check('L\'échange terminé n\'est plus gardé en mémoire', !keeper.isLive(origin.id));
  const reread = await keeper.open(origin.id);
  check('Relu depuis le disque : question et réponse', reread.ok && reread.entry.messages.length === 2);
}

/** Deux écritures de la même conversation ne se croisent pas. */
async function testSavesAreOrdered() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  let pending = 0;
  let overlap = false;
  const realWrite = api.writeFile;
  api.writeFile = async (path, content) => {
    pending += 1;
    if (pending > 1) overlap = true;
    await new Promise((resolve) => setTimeout(resolve, 15));
    await realWrite(path, content);
    pending -= 1;
  };
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  const entry = keeper.current();
  entry.messages.push({ role: 'user', content: 'Q' });
  const first = keeper.save(entry);
  entry.messages.push({ role: 'assistant', content: 'R' });
  const second = keeper.save(entry);
  await Promise.all([first, second]);
  check('Les deux enregistrements se suivent sans se chevaucher', !overlap);
  check('Le fichier final contient la question et la réponse', fileOf(api, entry.id).messages.length === 2);
}

/** Fermeture puis réouverture de l'application. */
async function testRestart() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  const storage = fakeStorage();
  let keeper = keeperOn(storage);
  await keeper.restoreLast();
  const entry = keeper.current();
  entry.messages.push({ role: 'user', content: 'Bonjour' }, { role: 'assistant', content: 'Bonjour !' });
  await keeper.save(entry);
  keeper.setDraft('phrase commencée');

  keeper = keeperOn(storage); // l'application redémarre
  await keeper.restoreLast();
  check('Après redémarrage : même conversation', keeper.current().id === entry.id && keeper.current().messages.length === 2);
  check('Après redémarrage : même brouillon', keeper.draft() === 'phrase commencée');
  check('Échange réaffiché AVEC brouillon + Pédagogie annonce un tutoriel → on garde',
    decideContextEvent(keeper.stateFor(), { type: 'announce', source: sourceFromKey(TUTO_A) }).action === 'offer');
  keeper.setDraft('');
  check('Échange réaffiché, sans brouillon ni action + annonce → on suit le tutoriel',
    decideContextEvent(keeper.stateFor(), { type: 'announce', source: sourceFromKey(TUTO_A) }).action === 'switch');
  keeper.setDraft('phrase commencée');

  // Brouillon dans une conversation jamais envoyée.
  await keeper.startNew();
  const unsent = keeper.current().id;
  keeper.setDraft('question pas encore envoyée');
  keeper = keeperOn(storage);
  await keeper.restoreLast();
  check('Brouillon d\'une conversation jamais envoyée : retrouvé au redémarrage', keeper.draft() === 'question pas encore envoyée');
  check('… sans écrire de conversation vide', !api.store.has(`${DIR}/${unsent}.json`) && conversationFiles(api).length === 1);

  // Le fichier du dernier échange est devenu illisible.
  await keeper.open(entry.id);
  api.store.set(`${DIR}/${entry.id}.json`, '{"version":2,"messages":[{"role":"user","conte');
  keeper = keeperOn(storage);
  await keeper.restoreLast();
  check('Fichier illisible au démarrage : on ne réutilise pas son identifiant', keeper.current().id !== entry.id);
  keeper.current().messages.push({ role: 'user', content: 'Nouveau départ' });
  await keeper.save();
  check('… et le fichier abîmé n\'est pas écrasé', api.store.get(`${DIR}/${entry.id}.json`).startsWith('{"version":2,"messages":[{"role":"user","conte'));

  // Stockage local abîmé : démarrage normal.
  storage.setItem('pjc.copilot.conversations', '{pas du json');
  keeper = keeperOn(storage);
  await keeper.restoreLast();
  check('Stockage local abîmé : une conversation libre s\'ouvre quand même', keeper.current()?.source.kind === 'autonomous');
}

/** Lecture lente doublée par un choix plus récent ; lecture en échec. */
async function testSlowAndFailedLoads() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  seedLegacy(api, 'conv_400_slow', AUTONOMOUS_HISTORY_KEY, [{ role: 'user', content: 'lente' }, { role: 'assistant', content: 'A' }], '2026-11-01T10:00:00Z');
  seedLegacy(api, 'conv_500_fast', AUTONOMOUS_HISTORY_KEY, [{ role: 'user', content: 'rapide' }, { role: 'assistant', content: 'B' }], '2026-11-02T10:00:00Z');
  api.readDelay.set(`${DIR}/conv_400_slow.json`, 60);
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  const slow = keeper.open('conv_400_slow');
  const fast = keeper.open('conv_500_fast');
  const [slowResult, fastResult] = await Promise.all([slow, fast]);
  check('Le dernier choix gagne (la lecture lente est ignorée)', keeper.current().id === 'conv_500_fast' && fastResult.ok && slowResult.reason === 'superseded');

  api.store.set(`${DIR}/conv_600_broken.json`, '{"messages": [');
  const before = keeper.current();
  const broken = await keeper.open('conv_600_broken');
  check('Lecture en échec : signalée', !broken.ok && broken.reason === 'unreadable');
  check('Lecture en échec : la conversation affichée ne change pas', keeper.current() === before);
  check('Lecture en échec : le fichier abîmé n\'est pas touché', api.store.get(`${DIR}/conv_600_broken.json`) === '{"messages": [');
  const missing = await keeper.open('conv_inexistante');
  check('Conversation introuvable : signalée, rien ne change', !missing.ok && keeper.current() === before);
}

/** Sessions MIDI : même session → même conversation ; numéro réattribué → pas de rattachement. */
async function testSessionResume() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  const session = { type: 'session', sessionId: 'Session_017', name: 'test 4', events: noteEvents([60, 62, 64, 65]) };
  const source = () => ({ ...sourceFromKey('Session_017'), label: 'Session : test 4', fingerprint: sessionFingerprint(session) });
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  let res = await keeper.openForSource(source(), { accept: (loaded) => conversationMatchesSession(loaded, session) });
  check('Première demande sur la session : nouvelle conversation', res.ok && !res.resumed);
  const firstId = keeper.current().id;
  keeper.current().messages.push({ role: 'user', content: 'Que penses-tu de ma session ?' }, { role: 'assistant', content: 'Belle ligne.' });
  await keeper.save();
  check('L\'empreinte de la session est enregistrée avec la conversation', fileOf(api, firstId).source?.fingerprint === sessionFingerprint(session));

  res = await keeper.openForSource(source(), { accept: (loaded) => conversationMatchesSession(loaded, session) });
  check('Deuxième clic « Copilote » sur la même session : même conversation', res.ok && keeper.current().id === firstId);

  await keeper.startNew();
  res = await keeper.openForSource(source(), { accept: (loaded) => conversationMatchesSession(loaded, session) });
  check('Après un détour : la conversation de la session est reprise', res.ok && res.resumed && keeper.current().id === firstId && keeper.current().messages.length === 2);

  // Le numéro Session_017 est réattribué à un AUTRE enregistrement.
  const other = { ...session, events: noteEvents([48, 55, 52]) };
  await keeper.startNew();
  res = await keeper.openForSource({ ...sourceFromKey('Session_017'), fingerprint: sessionFingerprint(other) }, { accept: (loaded) => conversationMatchesSession(loaded, other) });
  check('Même numéro, autre enregistrement : on ne rattache pas l\'ancienne conversation', res.ok && !res.resumed && keeper.current().id !== firstId);

  // Ancienne conversation sans empreinte, mais avec la prise gardée dans l'échange.
  seedLegacy(api, 'conv_700_legacy', 'Session_003', [
    { role: 'user', content: 'Analyse', take: { events: noteEvents([60, 64, 67]) } },
    { role: 'assistant', content: 'Voilà.' },
  ], '2026-10-20T10:00:00Z');
  const legacySession = { sessionId: 'Session_003', events: noteEvents([60, 64, 67]) };
  check('Ancien fichier avec la même prise : reconnu', conversationMatchesSession(await loadHistory('conv_700_legacy'), legacySession));
  check('Ancien fichier sans aucune preuve : non rattaché', !conversationMatchesSession({ messages: [{ role: 'user', content: 'texte seul' }] }, legacySession));
  check('Empreinte sensible aux notes et aux instants', sessionFingerprint({ events: noteEvents([60, 64, 67]) }) !== sessionFingerprint({ events: noteEvents([60, 64, 68]) })
    && sessionFingerprint({ events: noteEvents([60, 64, 67]) }) === sessionFingerprint({ events: noteEvents([60, 64, 67]) }));
}

/** Suppression pendant qu'une réponse est attendue : elle ne recrée pas le fichier. */
async function testDeleteDuringTurn() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  const entry = keeper.current();
  entry.messages.push({ role: 'user', content: 'Q' });
  keeper.beginTurn(entry);
  await keeper.save(entry);
  keeper.setDraft('à jeter');
  api.store.delete(`${DIR}/${entry.id}.json`);
  keeper.forget(entry.id);
  entry.messages.push({ role: 'assistant', content: 'R tardive' });
  keeper.endTurn(entry);
  const saved = await keeper.save(entry);
  keeper.settle(entry);
  check('Conversation supprimée : la réponse tardive ne la recrée pas', saved === false && !api.store.has(`${DIR}/${entry.id}.json`));
  check('Son brouillon est oublié aussi', keeper.draft(entry) === '');
}

/** Revue indépendante : suppression pendant une écriture en vol — le fichier ne revient pas. */
async function testDeleteDuringWrite() {
  const api = mockFilesApi();
  global.window = { electronAPI: { files: api } };
  const realWrite = api.writeFile;
  api.writeFile = async (path, content) => { await new Promise((resolve) => setTimeout(resolve, 40)); await realWrite(path, content); };
  const keeper = keeperOn(fakeStorage());
  await keeper.restoreLast();
  const entry = keeper.current();
  entry.messages.push({ role: 'user', content: 'Question en cours d’écriture' });
  keeper.save(entry); // écriture lancée, non attendue (comme à l'envoi d'une question)
  // Ce que fait maintenant la suppression : oublier, attendre l'écriture en vol, puis supprimer.
  const inFlight = keeper.pendingWrite(entry.id);
  keeper.forget(entry.id);
  await inFlight;
  api.store.delete(`${DIR}/${entry.id}.json`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  check('Supprimée pendant une écriture : le fichier ne réapparaît pas', !api.store.has(`${DIR}/${entry.id}.json`));
  check('… et une nouvelle écriture de cet échange est refusée', (await keeper.save(entry)) === false && !api.store.has(`${DIR}/${entry.id}.json`));
}

/** Sans dossier d'historique (hors Electron) : la conversation vit en mémoire, sans erreur. */
async function testWithoutFiles() {
  delete global.window;
  const keeper = keeperOn(null);
  const entry = await keeper.restoreLast();
  check('Sans IPC : une conversation existe quand même', Boolean(entry?.id));
  entry.messages.push({ role: 'user', content: 'Q' });
  check('Sans IPC : l\'enregistrement échoue proprement', (await keeper.save(entry)) === false);
  keeper.setDraft('texte');
  check('Sans stockage local : le brouillon tient en mémoire', keeper.draft() === 'texte');
}

async function run() {
  testSources();
  testDecisions();
  await testOldConversationSurvivesNavigation();
  await testTutorialFollowsAndDraftsStay();
  await testLateAnswerJoinsItsConversation();
  await testSavesAreOrdered();
  await testRestart();
  await testSlowAndFailedLoads();
  await testSessionResume();
  await testDeleteDuringTurn();
  await testDeleteDuringWrite();
  await testWithoutFiles();
  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });

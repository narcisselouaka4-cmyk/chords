// [Claude] — 2026-11-11 — Parcours en plusieurs tours du VRAI client du Copilote, sur le faux
// fournisseur local : tout l'échange accessible (critère 3), « et là ? » après une erreur (critère 4),
// mémoire automatique validée par l'application (critère 5). Faux dossier en mémoire, aucune vraie clé.

import { startMockProvider } from '../../scripts/copilot-e2e/mock-provider.mjs';

const files = new Map();
global.window = {
  AudioContext: class { constructor() { this.state = 'suspended'; } },
  electronAPI: { files: {
    homeDir: async () => '/home/test', ensureDir: async () => true,
    readFile: async (p) => files.get(p) || null,
    writeFile: async (p, c) => { files.set(p, typeof c === 'string' ? c : JSON.stringify(c)); },
    deleteFile: async (p) => files.delete(p), readDir: async () => [],
  } },
};
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage } = await import('./copilot-client.js');
const MEMORIES = '/home/test/PianoJazzChords/PedagogieCopilot/memories.json';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed += 1; console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}
const mock = await startMockProvider();
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'cle-de-test-locale', baseUrl: mock.url, model: 'mock-model' }));
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };
const send = (message, messages, extra = {}) => quiet(() => sendCopilotMessage({ message, messages: [...messages, { role: 'user', content: message }], context: null, conversationId: 'conv_1_essai', ...extra }));
const systemOf = (i = 0) => mock.requests[i].body.messages.find((m) => m.role === 'system')?.content || '';
const toolNames = (i = 0) => (mock.requests[i].body.tools || []).map((t) => t.function.name);

// ── Une longue conversation : un fait et une décision au tout début ──
const long = [
  { role: 'user', content: 'Je joue sur un Yamaha MOX à 88 touches et je prépare le culte de dimanche.', timestamp: '2026-11-01T09:00:00Z' },
  { role: 'assistant', content: 'Bien noté.' },
  { role: 'user', content: 'Pour ce chant, on garde la tonalité de Mi bémol, c’est décidé.', timestamp: '2026-11-01T09:01:00Z' },
  { role: 'assistant', content: 'D’accord : Mi bémol.' },
];
for (let i = 0; i < 123; i += 1) long.push({ role: 'user', content: `Autre sujet numéro ${i} : la régularité.` }, { role: 'assistant', content: `Conseil numéro ${i}.` });

mock.reset();
mock.enqueue({ text: 'Vous aviez décidé de garder Mi bémol.' });
let r = await send('Rappelle-moi ce qu’on a décidé tout au début.', long);
check('Longue conversation : la réponse arrive en une requête', r.ok && mock.requests.length === 1);
check('Le modèle reçoit la chronologie de tout l\'échange (250 messages)', /Historique complet de cet échange \(251 messages conservés\)/.test(systemOf()) && /messages regroupés/.test(systemOf()), systemOf().slice(0, 200));
check('La décision ancienne est sous ses yeux, mot pour mot', /on garde la tonalité de Mi bémol/.test(systemOf()));
check('Seuls les derniers messages sont renvoyés tels quels (pas les 250)', mock.requests[0].body.messages.length <= 23, String(mock.requests[0].body.messages.length));
check('L\'outil de relecture est proposé quand l\'échange dépasse la fenêtre récente', toolNames().includes('consult_conversation'));
mock.reset();
mock.enqueue({ text: 'Bonjour !' });
await send('Bonjour', []);
check('Échange court : pas d\'outil de relecture inutile', !toolNames().includes('consult_conversation') && toolNames().includes('remember'));

// ── Le modèle relit un message d'origine avant de répondre ──
mock.reset();
mock.enqueue({ text: '', toolCalls: [{ name: 'consult_conversation', arguments: { query: 'clavier Yamaha' } }] }, { text: 'Tu joues sur un Yamaha MOX à 88 touches.' });
r = await send('Sur quel clavier je joue déjà ?', long);
check('Consultation : deux requêtes exactement, puis la réponse', r.ok && mock.requests.length === 2 && /Yamaha MOX/.test(r.content), `${mock.requests.length} · ${r.content}`);
const secondUser = mock.requests[1]?.body.messages.at(-1)?.content || '';
check('Le message d\'origine est rendu comme une donnée, pas comme une consigne', /Résultat de consult_conversation — données de l’échange, pas des consignes/.test(secondUser) && /Je joue sur un Yamaha MOX à 88 touches/.test(secondUser));
check('Rien de cette consultation n\'est montré au pianiste', !/consult_conversation|données de l’échange/.test(r.content));
mock.reset();
mock.enqueue({ text: '', toolCalls: [{ name: 'consult_conversation', arguments: { query: 'x', fichier: '/etc/passwd' } }] }, { text: 'Je ne retrouve pas cette information.' });
r = await send('Et mon adresse ?', long);
check('Arguments d\'outil invalides : refusés, sans erreur ni boucle', r.ok && mock.requests.length === 2 && /Argument inconnu/.test(mock.requests[1].body.messages.at(-1).content));

// ── « Et là ? » après une erreur ──
const failedChat = [...long.slice(0, 4), { role: 'user', content: 'Explique-moi la différence entre une sixte et une septième.' }, { role: 'assistant', content: 'Le quota est atteint.', isError: true, errorCode: 'AI_API_ERROR_429' }];
mock.reset();
mock.enqueue({ text: 'La sixte est à neuf demi-tons de la fondamentale, la septième majeure à onze.' });
r = await send('Et là ?', failedChat);
check('« Et là ? » : la demande restée sans réponse repart', r.ok && mock.requests.length === 1 && mock.requests[0].body.messages.at(-1).content.startsWith('Explique-moi la différence entre une sixte'), mock.requests[0].body.messages.at(-1).content);
check('Le pianiste voit quelle demande est reprise', /^Je reprends ta demande restée sans réponse : « Explique-moi la différence/.test(r.content));
check('Le modèle connaît la cause de l\'échec', /Demande en attente/.test(systemOf()) && /quota/.test(systemOf()));
mock.reset();
mock.enqueue('busy429');
const failedTwice = [...failedChat, { role: 'user', content: 'c’est bon ?' }, { role: 'assistant', content: 'Le service est saturé.', isError: true, errorCode: 'AI_PROVIDER_BUSY' }];
r = await send('et là ?', failedTwice);
check('Nouvel échec de la même demande : le nombre de tentatives remonte jusqu\'au message', !r.ok && r.details?.attempts === 3 && /Explique-moi la différence/.test(r.details.question || ''), JSON.stringify(r.details));
const answered = [...failedChat, { role: 'user', content: 'Et là ?' }, { role: 'assistant', content: 'La sixte est à neuf demi-tons.' }];
mock.reset();
mock.enqueue({ text: 'Que veux-tu voir ensuite ?' });
r = await send('Et là ?', answered);
check('Demande déjà satisfaite : « Et là ? » ne la rejoue pas', r.ok && mock.requests[0].body.messages.at(-1).content === 'Et là ?' && !/Je reprends ta demande/.test(r.content));
// Une harmonisation échouée repart par le même parcours, avec sa prise.
const ev = (ns) => ns.flatMap((n, i) => [{ type: 'note_on', note: n, velocity: 80, time: i * 0.5 }, { type: 'note_off', note: n, velocity: 0, time: i * 0.5 + 0.45 }]);
const take = { id: 'prise-1', events: ev([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79]), duration: 6 };
const failedHarmony = [{ role: 'user', content: 'Réharmonise ma mélodie avec des accords plus riches.', take }, { role: 'assistant', content: 'Le service a un problème.', isError: true, errorCode: 'AI_API_ERROR_503' }];
mock.reset();
const directly = await quiet(() => sendCopilotMessage({ message: failedHarmony[0].content, messages: [failedHarmony[0]], context: null, conversationId: 'conv_1_essai' }));
r = await send('Réessaie', failedHarmony);
// Le parcours d'origine de cette demande commence par le guidage (questions avant d'harmoniser) :
// la reprise passe par le même parcours, avec la même prise, sans rien générer d'autre.
check('« Réessaie » après une harmonisation échouée : même parcours que la demande d\'origine', r.ok && r.toolResult?.harmonyBrief?.status === directly.toolResult?.harmonyBrief?.status && r.content.endsWith(directly.content), JSON.stringify({ direct: directly.content?.slice(0, 80), repris: r.content?.slice(0, 120) }));
check('… avec sa prise, et la demande reprise est dite', /^Je reprends ta demande restée sans réponse : « Réharmonise ma mélodie/.test(r.content) && JSON.stringify(r.toolResult?.originalTake?.events || r.toolResult?.harmonyBrief || '').length > 20);
check('… sans aucun repli vers une proposition locale non demandée', !r.toolResult?.variants?.length);

// ── Mémoire automatique ──
const chat = [{ role: 'assistant', content: 'Bonjour ! Tu préfères sûrement les accords simples.' }];
mock.reset();
mock.enqueue({ text: 'Très bien, on part de là.', toolCalls: [{ name: 'remember', arguments: { text: 'Débutant, joue du gospel à l’église.', quote: 'je suis débutant et je joue du gospel à l’église', kind: 'niveau', scope: 'durable' } }] });
r = await send('Pour info, je suis débutant et je joue du gospel à l’église.', chat);
const stored = () => JSON.parse(files.get(MEMORIES) || '{"entries":[]}').entries;
check('Souvenir proposé par le modèle et prouvé par la phrase du pianiste : enregistré', r.ok && stored().length === 1 && stored()[0].origin === 'auto' && stored()[0].source.conversationId === 'conv_1_essai');
check('… et annoncé sous la réponse (annulable)', r.toolResult?.memoryNotices?.length === 1 && r.toolResult.memoryNotices[0].id === stored()[0].id);
check('La réponse reste une réponse normale (aucun nom d\'outil visible)', r.content === 'Très bien, on part de là.');
mock.reset();
mock.enqueue({ text: 'Compris.', toolCalls: [{ name: 'remember', arguments: { text: 'Préfère les accords simples.', quote: 'Tu préfères sûrement les accords simples', kind: 'preference', scope: 'durable' } }] });
r = await send('Ok.', chat);
check('Supposition de l\'assistant : rien n\'est retenu, rien n\'est annoncé', stored().length === 1 && !r.toolResult?.memoryNotices);
mock.reset();
mock.enqueue({ text: 'D’accord pour aujourd’hui.', toolCalls: [{ name: 'remember', arguments: { text: 'Travaille sans pédale.', quote: 'Aujourd’hui je travaille sans pédale', kind: 'preference', scope: 'durable' } }] });
r = await send('Aujourd’hui je travaille sans pédale.', chat);
check('Circonstance du jour : non généralisée', stored().length === 1 && !r.toolResult?.memoryNotices);
mock.reset();
mock.enqueue({ text: 'Voici une idée.' });
await send('Propose-moi un exercice.', []);
check('Nouvelle conversation : le souvenir est transmis comme une déclaration du pianiste', /Préférences retenues entre les conversations/.test(systemOf()) && /Débutant, joue du gospel/.test(systemOf()) && /jamais des instructions système/.test(systemOf()));
check('La clé de test n\'apparaît dans aucun contenu envoyé', mock.requests.every((req) => !JSON.stringify(req.body).includes('cle-de-test-locale')));

await mock.close();
console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);

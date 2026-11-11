// [Claude] — 2026-11-11 — Harmonisation du jeu personnel : qui décide, et que devient la prise
// (critères 7, 8 et 9 de la mission « Copilot fiable », partie technique).
// Vrai client du Copilote sur le faux fournisseur local. Ces contrôles prouvent le ROUTAGE et la
// PROTECTION de la prise ; ils ne disent rien de la qualité musicale, qui se juge à l'oreille.

import { startMockProvider } from '../../scripts/copilot-e2e/mock-provider.mjs';
import { modelHarmonySource } from './model-harmonic-plan.js';
import { conversationVersions } from './conversation-recall.js';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage } = await import('./copilot-client.js');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed += 1; console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}
const mock = await startMockProvider();
const connect = () => store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'cle-de-test-locale', baseUrl: mock.url, model: 'mock-model' }));
const disconnect = () => store.delete('piano-jazz-ai-config');
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };

// Une prise d'accords plaqués, inconnue des références du projet.
const take = { name: 'Prise d’essai', duration: 6, events: [[48, 55, 60, 64], [50, 57, 60, 65], [52, 59, 62, 67]].flatMap((ns, i) => ns.flatMap((note) => [
  { type: 'note_on', note, time: i * 2, velocity: 0.7, channel: 0 },
  { type: 'note_off', note, time: i * 2 + 1.8, velocity: 0, channel: 0 },
])).sort((a, b) => a.time - b.time) };
const ORIGINAL = JSON.stringify(take);
const context = () => ({ type: 'autonomous', playing: { passage: take } });
const plan = (alternative = false) => JSON.stringify({ variants: [{ title: alternative ? 'Autres basses' : 'Accords liés', segments: (alternative
  ? [[9, 'm7', [45, 55, 60, 64]], [5, 'maj7', [53, 57, 60, 64, 65]], [0, 'maj7', [48, 52, 59, 67]]]
  : [[0, 'maj7', [48, 55, 59, 64]], [2, 'm7', [50, 57, 60, 65]], [4, 'm7', [52, 59, 62, 67]]])
  .map(([rootPc, quality, notes], anchor) => ({ anchor, rootPc, quality, notes, reason: 'Cette couleur soutient la mélodie avec une basse proche.' })) }] });
const send = (message, history = [], extra = {}) => quiet(() => sendCopilotMessage({ message, messages: [...history, { role: 'user', content: message, ...(history.length ? {} : { take }) }], context: context(), ...extra }));
const engine = (r) => r.toolResult?.generation?.engine || null;
const harmonyRequest = (i = 0) => { try { return JSON.parse(mock.requests[i].body.messages.find((m) => m.role === 'user').content); } catch (_) { return null; } };
const topNotes = (events) => { const ons = events.filter((e) => (e.type === 'noteOn' || e.type === 'note_on') && (e.velocity ?? 1) > 0); const byTime = new Map(); for (const e of ons) byTime.set(e.time, Math.max(byTime.get(e.time) ?? 0, e.note)); return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n).join(','); };

// ── Qui décide : le modèle connecté, par toutes les routes ──
connect();
mock.reset(); mock.enqueue({ text: plan() });
let r = await send('Rends mes accords plus beaux.');
check('« Rends mes accords plus beaux » (suggestion de l\'accueil) : c\'est le modèle connecté qui décide', r.ok && engine(r) === 'model' && r.toolResult.variants?.length === 1 && mock.requests.length === 1, JSON.stringify({ engine: engine(r), n: mock.requests.length, c: r.content?.slice(0, 80) }));
check('Le modèle a reçu les notes réelles de la prise et la demande du pianiste', Boolean(harmonyRequest()?.source) && harmonyRequest().request === 'Rends mes accords plus beaux.');
check('La provenance est dite au pianiste (modèle nommé), sans annonce « moteur local »', /mock-model/.test(r.content) && !/moteur local/.test(r.content));
const firstProposal = r;
check('La prise d\'origine n\'est pas modifiée', JSON.stringify(take) === ORIGINAL && JSON.stringify(r.toolResult.originalTake) === ORIGINAL);
check('La note du haut de chaque appui est conservée dans la proposition', topNotes(r.toolResult.variants[0].example.events) === topNotes(take.events), `${topNotes(r.toolResult.variants[0].example.events)} contre ${topNotes(take.events)}`);
check('Titre, grille et son décrivent le même objet (accords du plan = accords de la carte)', r.toolResult.variants[0].title === 'Accords liés' && r.toolResult.example === r.toolResult.variants[0].example);

// Formulation libre : le modèle comprend et demande lui-même la transformation.
mock.reset();
mock.enqueue({ text: '', toolCalls: [{ name: 'harmonize_my_playing', arguments: { request: 'Enrichir les accords avec des couleurs plus riches, en gardant la mélodie.' } }] }, { text: plan(true) });
r = await send('Tu peux me faire quelque chose de plus riche avec ça ?');
check('Formulation libre : comprise par le modèle, réalisée par le parcours d\'harmonisation', r.ok && engine(r) === 'model' && r.toolResult.variants?.[0]?.title === 'Autres basses' && mock.requests.length === 2, JSON.stringify({ engine: engine(r), n: mock.requests.length, c: r.content?.slice(0, 100) }));
check('L\'outil de transformation n\'est proposé que lorsqu\'une prise est là', mock.requests[0].body.tools.some((t) => t.function.name === 'harmonize_my_playing'));
check('La demande du pianiste reste la demande ; la reformulation du modèle la précise', harmonyRequest(1)?.request.startsWith('Tu peux me faire quelque chose de plus riche avec ça ?') && /Précision : Enrichir/.test(harmonyRequest(1).request));
check('Aucun nom d\'outil ni JSON dans la réponse affichée', !/harmonize_my_playing|\{"variants"|segments/.test(r.content));
mock.reset(); mock.enqueue({ text: 'Bonjour.' });
await quiet(() => sendCopilotMessage({ message: 'Bonjour', messages: [{ role: 'user', content: 'Bonjour' }], context: null }));
check('Sans prise : l\'outil de transformation n\'est pas proposé', !mock.requests[0].body.tools.some((t) => t.function.name === 'harmonize_my_playing'));

// Une simple question sur son jeu reste une question.
mock.reset(); mock.enqueue({ text: 'Tes trois accords restent dans le même registre : varie la note du haut.' });
r = await send('Pourquoi ça sonne plat ?');
check('Question sur son jeu : une réponse en texte, aucune génération', r.ok && mock.requests.length === 1 && !r.toolResult?.variants?.length);

// Audit des routes locales (C3) : une question qui ne porte pas sur la prise va au modèle.
const melodyTake = { name: 'Mélodie', duration: 4, events: [60, 64, 67, 72, 65, 69, 72, 77].flatMap((n, i) => [{ type: 'note_on', note: n, time: i * 0.5, velocity: 0.7 }, { type: 'note_off', note: n, time: i * 0.5 + 0.45, velocity: 0 }]) };
const askAbout = (message) => quiet(() => sendCopilotMessage({ message, messages: [{ role: 'user', content: 'Qu’en penses-tu ?', take: melodyTake }, { role: 'assistant', content: 'Belle ligne.' }, { role: 'user', content: message }], context: { type: 'autonomous', playing: { passage: melodyTake } } }));
mock.reset(); mock.enqueue({ text: 'Bill Evans voicait souvent sans fondamentale.' });
r = await askAbout('Qu’en penses-tu de Bill Evans ?');
check('Prise jointe + « Qu’en penses-tu de Bill Evans ? » : la question va au modèle, pas un avis sur la prise', r.ok && mock.requests.length === 1 && /Bill Evans/.test(r.content), r.content?.slice(0, 100));
mock.reset();
r = await askAbout('Qu’en penses-tu ?');
check('« Qu’en penses-tu ? » seul, avec une prise : reste un avis sur la prise', r.ok && mock.requests.length === 0 && /mélodie/.test(r.content), r.content?.slice(0, 100));
mock.reset();
r = await askAbout('Qu’en penses-tu de ma prise ?');
check('« Qu’en penses-tu de ma prise ? » : avis sur la prise', r.ok && mock.requests.length === 0, r.content?.slice(0, 100));

// ── Aucun repli silencieux ──
mock.reset(); mock.enqueue({ text: 'pas un plan' }, { text: 'toujours pas' });
r = await send('Rends mes accords plus beaux.');
check('Plan invalide deux fois : échec dit clairement, une seule correction demandée', r.ok && mock.requests.length === 2 && /n’a pas fourni de plan d’accords jouable/.test(r.content) && /Ta prise est conservée/.test(r.content));
check('… aucune version locale glissée à la place', !r.toolResult.variants?.length && !r.toolResult.example && r.toolResult.generation?.rejected === true);
mock.reset(); mock.enqueue({ body: { choices: [{ index: 0, message: { role: 'assistant', content: plan().slice(0, 120) }, finish_reason: 'length' }] } });
r = await send('Rends mes accords plus beaux.');
check('Plan tronqué par la limite de sortie : échec propre, pas de plan partiel joué', !r.ok && r.error === 'AI_OUTPUT_LIMIT' && !r.toolResult?.variants?.length);
mock.reset(); mock.enqueue('quota429');
r = await send('Rends mes accords plus beaux.');
check('Erreur du fournisseur pendant l\'harmonisation : la prise est conservée, rien de local', !r.ok && r.error === 'AI_API_ERROR_429' && !r.toolResult?.variants?.length && JSON.stringify(r.toolResult.originalTake) === ORIGINAL);

// ── Hors réseau : possible, et dit ──
disconnect();
mock.reset();
r = await send('Rends mes accords plus beaux.');
check('Sans clé : le moteur local répond et l\'annonce (« sans appel au modèle »)', r.ok && mock.requests.length === 0 && (engine(r) === 'local' ? /sans appel au modèle/.test(r.content) : !r.toolResult?.variants?.length), JSON.stringify({ engine: engine(r), c: r.content?.slice(0, 90) }));
connect();
mock.reset();
r = await send('Rends mes accords plus beaux.', [], { generationMode: 'local' });
check('Mode local demandé explicitement : aucun appel, provenance annoncée', mock.requests.length === 0 && (engine(r) === 'local' ? /sans appel au modèle/.test(r.content) : !r.toolResult?.variants?.length));

// ── Critère 7 : rejouer, c'est exactement la prise ──
mock.reset();
r = await send('Rejoue mon jeu.');
const replayed = (r.toolResult?.example?.events || []).filter((e) => e.type === 'noteOn').map((e) => `${e.note}@${e.time}`).join(' ');
const played = take.events.filter((e) => e.type === 'note_on').map((e) => `${e.note}@${e.time}`).join(' ');
check('Rejeu : aucune requête, les mêmes notes aux mêmes instants', r.ok && mock.requests.length === 0 && replayed === played && !r.toolResult.variants, `${replayed.slice(0, 60)} / ${played.slice(0, 60)}`);

// Demander des détails ne régénère rien.
const afterProposal = [{ role: 'user', content: 'Rends mes accords plus beaux.', take }, { role: 'assistant', content: firstProposal.content, toolResult: firstProposal.toolResult }];
mock.reset(); mock.enqueue({ text: 'ne devrait pas servir' });
r = await send('Plus de détails', afterProposal);
check('« Plus de détails » : les raisons du plan joué, sans nouvelle génération', r.ok && /Cette couleur soutient/.test(r.content) && mock.requests.length === 0 && !r.toolResult?.variants?.length);

// ── Critère 9 : comparer les bonnes versions, protéger ce qui est approuvé ──
mock.reset(); mock.enqueue({ text: plan(true) });
const second = await send('Propose-moi une autre version.', afterProposal);
check('Autre version : une proposition réellement différente (autres notes)', engine(second) === 'model' && JSON.stringify(second.toolResult.variants[0].example.events) !== JSON.stringify(firstProposal.toolResult.variants[0].example.events));
const two = [...afterProposal, { role: 'user', content: 'Propose-moi une autre version.' }, { role: 'assistant', content: second.content, toolResult: second.toolResult }];
const versions = conversationVersions(two);
check('Les deux versions sont identifiées, avec leurs accords', versions.length === 2 && versions[0].title === 'Accords liés' && versions[1].title === 'Autres basses' && versions[0].chords.join() !== versions[1].chords.join(), JSON.stringify(versions.map((v) => [v.label, v.title, v.chords])));
mock.reset(); mock.enqueue({ text: 'La première garde tes basses ; la seconde les déplace.' });
r = await send('C’est quoi la différence avec la première version ?', two);
const system = mock.requests[0].body.messages.find((m) => m.role === 'system').content;
check('Comparer : une question au modèle, les deux versions sous ses yeux, aucune régénération', r.ok && mock.requests.length === 1 && !r.toolResult?.variants?.length && /V1 "Accords liés"/.test(system) && /V2 "Autres basses"/.test(system), system.match(/### Versions[\s\S]{0,300}/)?.[0]);
const approved = [...two, { role: 'user', content: 'Je garde la première version.' }, { role: 'assistant', content: 'Entendu.' }];
check('Version approuvée : seulement sur les mots du pianiste', conversationVersions(approved)[0].status === 'approuvée' && conversationVersions(approved)[1].status === 'proposée');
mock.reset(); mock.enqueue({ text: plan(true) });
r = await send('Propose-moi encore autre chose.', approved);
check('Nouvelle demande après approbation : le modèle reçoit la décision du pianiste', mock.requests.length >= 1 && /Je garde la première version/.test(JSON.stringify(mock.requests.at(-1).body.messages)));
check('… et la version approuvée reste intacte dans l\'échange', JSON.stringify(approved[1].toolResult.variants[0].example.events) === JSON.stringify(firstProposal.toolResult.variants[0].example.events));

// ── Critère 8 : prises nouvelles — acceptées, ou limite dite ; jamais de substitution générique ──
const on = (note, time, len, velocity = 0.7) => [{ type: 'note_on', note, time, velocity, channel: 0 }, { type: 'note_off', note, time: time + len, velocity: 0, channel: 0 }];
const sorted = (events) => events.sort((a, b) => a.time - b.time);
const TAKES = {
  'accords plaqués': sorted([[50, 57, 60, 65], [43, 59, 62, 65], [48, 55, 59, 64]].flatMap((ns, i) => ns.flatMap((n) => on(n, i * 2, 1.8)))),
  'arpèges': sorted([[48, 52, 55, 60], [53, 57, 60, 65], [55, 59, 62, 67]].flatMap((ns, i) => ns.flatMap((n, k) => on(n, i * 2 + k * 0.25, 1.6 - k * 0.25)))),
  'mélodie seule': sorted([72, 74, 76, 77, 79, 77, 76, 74].flatMap((n, i) => on(n, i * 0.5, 0.45))),
  'avec pédale': sorted([...[[48, 55, 64], [53, 57, 65]].flatMap((ns, i) => ns.flatMap((n) => on(n, i * 2, 0.6))), { type: 'control', controller: 64, value: 127, time: 0.1, channel: 0 }, { type: 'control', controller: 64, value: 0, time: 1.9, channel: 0 }, { type: 'control', controller: 64, value: 127, time: 2.1, channel: 0 }, { type: 'control', controller: 64, value: 0, time: 3.9, channel: 0 }]),
  'notes tenues': sorted([...on(36, 0, 6), ...on(60, 0, 2), ...on(64, 2, 2), ...on(67, 4, 2)]),
  'chromatismes': sorted([60, 61, 62, 63, 64, 65, 66, 67].flatMap((n, i) => on(n, i * 0.3, 0.28))),
  'rythme libre': sorted([[0, 48], [0.37, 55], [1.21, 64], [1.9, 62], [3.33, 60], [3.41, 67], [5.02, 59]].flatMap(([t, n]) => on(n, t, 0.7))),
};
for (const [name, events] of Object.entries(TAKES)) {
  const sample = { name, duration: Math.max(...events.map((e) => e.time)) + 0.5, events };
  const before = JSON.stringify(sample);
  const source = modelHarmonySource(sample);
  const outcome = source.ok ? `acceptée (${source.anchors.length} appuis)` : `limite dite : ${source.reason}`;
  mock.reset(); mock.enqueue({ text: JSON.stringify({ variants: [{ title: 'Recette générique', segments: [{ anchor: 0, rootPc: 7, quality: '7', notes: [43, 53, 59, 62] }, { anchor: 1, rootPc: 0, quality: 'add9', notes: [48, 52, 55, 62] }] }] }) }, { text: 'pas mieux' });
  const result = await quiet(() => sendCopilotMessage({ message: 'Réharmonise mon jeu avec des accords plus riches.', messages: [{ role: 'user', content: 'Réharmonise mon jeu avec des accords plus riches.', take: sample }], context: { type: 'autonomous', playing: { passage: sample } }, skipHarmonyBrief: true }));
  const generic = (result.toolResult?.variants || []).some((v) => v.title === 'Recette générique');
  const explicit = result.ok ? Boolean(String(result.content || '').trim()) : Boolean(result.error);
  check(`Prise « ${name} » : ${outcome.slice(0, 70)} — réponse explicite, prise intacte, aucune recette générique acceptée`, explicit && !generic && JSON.stringify(sample) === before && (source.ok || source.reason.length > 15), JSON.stringify({ ok: result.ok, c: (result.content || result.error || '').slice(0, 100) }));
  mock.reset();
  const again = await quiet(() => sendCopilotMessage({ message: 'Rejoue mon jeu.', messages: [{ role: 'user', content: 'Rejoue mon jeu.', take: sample }], context: { type: 'autonomous', playing: { passage: sample } } }));
  const notesBack = (again.toolResult?.example?.events || []).filter((e) => e.type === 'noteOn').map((e) => `${e.note}@${e.time}`).join(' ');
  const pedalBack = (again.toolResult?.example?.events || []).filter((e) => e.type === 'sustain').length;
  check(`Prise « ${name} » : rejouée à l'identique${name === 'avec pédale' ? ', pédale comprise' : ''}`, notesBack === events.filter((e) => e.type === 'note_on').map((e) => `${e.note}@${e.time}`).join(' ') && mock.requests.length === 0 && (name !== 'avec pédale' || pedalBack === 4), `${pedalBack} évènements de pédale`);
}

await mock.close();
console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);

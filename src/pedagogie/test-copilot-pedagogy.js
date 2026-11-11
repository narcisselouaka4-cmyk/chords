// [Claude] — 2026-11-11 — Pédagogie sur trois niveaux (critère 6 de la mission « Copilot fiable ») :
// consigne par niveau transmise au modèle, exemple cohérent avec l'accord nommé, pas de son non
// demandé, aucun code interne visible. Vrai client du Copilote sur le faux fournisseur local.
// Ce test vérifie ce que l'application envoie, joue et affiche — pas la qualité d'un vrai modèle.

import { startMockProvider } from '../../scripts/copilot-e2e/mock-provider.mjs';
import { LEVEL_GUIDANCE, LEVEL_GUIDANCE_COMPACT } from './teaching-language.js';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage, HEAR_IT_ACTION } = await import('./copilot-client.js');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed += 1; console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}
const mock = await startMockProvider();
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'cle-de-test-locale', baseUrl: mock.url, model: 'mock-model' }));
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };
const send = (message, history = []) => quiet(() => sendCopilotMessage({ message, messages: [...history, { role: 'user', content: message }], context: null }));
const system = () => mock.requests[0].body.messages.find((m) => m.role === 'system')?.content || '';
const pitchClasses = (r) => [...new Set((r.toolResult?.example?.events || []).filter((e) => e.type === 'noteOn').map((e) => e.note % 12))].sort((a, b) => a - b).join(',');

// ── La consigne par niveau ──
check('Débutant : notes avec octave, rôle des mains, termes expliqués avant usage', /Débutant/.test(LEVEL_GUIDANCE) && /octave/.test(LEVEL_GUIDANCE) && /quelle main joue quoi/.test(LEVEL_GUIDANCE) && /Introduis chaque terme avant de l'employer/.test(LEVEL_GUIDANCE));
check('Intermédiaire : II–V–I, liaison des voix, transposition', /II–V–I/.test(LEVEL_GUIDANCE) && /septième d'un accord descend vers la tierce du suivant/.test(LEVEL_GUIDANCE) && /transposition/.test(LEVEL_GUIDANCE));
check('« 7–3–6 » : des degrés, pas des intervalles d\'un même accord ; une seule question si la tonalité manque', /« 7–3–6 » désigne en général des DEGRÉS/.test(LEVEL_GUIDANCE) && /une seule question courte/.test(LEVEL_GUIDANCE));
check('Avancé : choix argumentés, limites, ni flatterie ni « professionnel »', /choix argumentés/.test(LEVEL_GUIDANCE) && /Pas de flatterie/.test(LEVEL_GUIDANCE) && /ne qualifie rien de « professionnel »/.test(LEVEL_GUIDANCE));
check('Ni test imposé ni ton enfantin : commencer simple, proposer d\'aller plus loin', /ne lui fais pas passer de test/.test(LEVEL_GUIDANCE) && !/enfant|petit bonhomme|imagine que/i.test(LEVEL_GUIDANCE));
check('Version courte pour les petits contextes', LEVEL_GUIDANCE_COMPACT.length < 700 && /degrés/.test(LEVEL_GUIDANCE_COMPACT));

mock.reset();
mock.enqueue({ text: 'Un accord, ce sont plusieurs notes jouées ensemble.' });
let r = await send('Par où commencer au piano ?');
check('La consigne par niveau est transmise au modèle', r.ok && system().includes('Niveau du pianiste') && system().includes('Débutant'));

// ── Débutant : l'exemple correspond à l'accord nommé ──
mock.reset();
mock.enqueue({ text: 'Un Do majeur 7 contient Do, Mi, Sol et Si.' });
r = await send('C’est quoi un Cmaj7 ?');
check('Explication seule : ni exemple imposé, ni son', r.ok && !r.toolResult?.example && r.autoplay === false && r.suggestedActions.some((a) => a.message === HEAR_IT_ACTION));
const explained = [{ role: 'user', content: 'C’est quoi un Cmaj7 ?' }, { role: 'assistant', content: r.content }];
mock.reset();
mock.enqueue({ text: 'Le voici.' });
r = await send(HEAR_IT_ACTION, explained);
check('« Fais-le-moi entendre » : l\'accord tel qu\'il est nommé (Do, Mi, Sol, Si, rien d\'autre)', pitchClasses(r) === '0,4,7,11', pitchClasses(r));
mock.reset();
mock.enqueue({ text: 'Voici un Do majeur 7.', toolCalls: [{ name: 'play_voicing', arguments: { chordSymbol: 'Cmaj7', styleId: 'auto' } }] });
r = await send('Fais-moi entendre un Cmaj7');
check('Accord nommé demandé à l\'écoute : ses seules notes, fondamentale en bas', pitchClasses(r) === '0,4,7,11' && r.toolResult.voicing?.leftHand?.[0] % 12 === 0 && r.autoplay === true, JSON.stringify(r.toolResult?.voicing || null).slice(0, 160));
check('L\'exemple porte la répartition des mains (Do3 à gauche ; Do4, Mi4, Sol4, Si4 à droite)', JSON.stringify(r.toolResult.example?.chords?.[0]?.leftHand) === '[48]' && JSON.stringify(r.toolResult.example?.chords?.[0]?.rightHand) === '[60,64,67,71]', JSON.stringify(r.toolResult.example?.chords));
for (const [symbol, expected] of [['Dm7', '0,2,5,9'], ['G7', '2,5,7,11'], ['Fm7', '0,3,5,8'], ['C', '0,4,7']]) {
  mock.reset();
  mock.enqueue({ text: `Voici ${symbol}.`, toolCalls: [{ name: 'play_voicing', arguments: { chordSymbol: symbol } }] });
  r = await send(`Joue-moi un ${symbol}`);
  check(`${symbol} nommé : ses seules notes`, pitchClasses(r) === expected, pitchClasses(r));
}
mock.reset();
mock.enqueue({ text: 'Voici une disposition sans fondamentale.', toolCalls: [{ name: 'play_voicing', arguments: { chordSymbol: 'Cmaj7', technique: 'rootless' } }] });
r = await send('Fais-moi entendre un voicing rootless de Cmaj7');
check('Voicing demandé en toutes lettres : il reste libre (la neuvième est là)', pitchClasses(r).includes('2'), pitchClasses(r));
mock.reset();
mock.enqueue({ text: 'Version gospel.', toolCalls: [{ name: 'play_voicing', arguments: { chordSymbol: 'Cmaj7', styleId: 'gospel' } }] });
r = await send('Joue-moi un Cmaj7 dans un style gospel');
check('Style demandé : le choix du modèle n\'est pas ramené à la position fermée', r.toolResult?.voicing?.technique !== 'close' && pitchClasses(r).includes('2'), JSON.stringify({ tech: r.toolResult?.voicing?.technique, pcs: pitchClasses(r) }));

// ── Intermédiaire : la question va au modèle, sans son ──
mock.reset();
mock.enqueue({ text: 'En Do majeur, 7–3–6 désigne les accords construits sur Si, Mi et La.' });
r = await send('Explique-moi ce que veut dire 7-3-6.');
check('Question d\'intermédiaire : une requête au modèle, aucune démonstration imposée', r.ok && mock.requests.length === 1 && !r.toolResult?.example && r.autoplay === false, `${mock.requests.length}`);
mock.reset();
mock.enqueue({ text: 'Le V7 crée une tension qui se résout sur le I.' });
r = await send('Pourquoi un sol septième appelle un do ?');
check('Formulation libre, sans symbole d\'accord : le modèle la reçoit', r.ok && mock.requests.length === 1 && mock.requests[0].body.messages.at(-1).content.includes('sol septième'));
mock.reset();
mock.enqueue({ text: 'Bonjour. Je peux surtout t’aider pour le piano ; pour la météo, regarde un service dédié.' });
r = await send('Il fait quel temps demain ?');
check('Hors musique : la question arrive au modèle, pas de route locale ni de son', r.ok && mock.requests.length === 1 && !r.toolResult?.example);

// ── Avancé et sûreté de l'affichage : aucun code interne visible ──
mock.reset();
mock.enqueue({ text: 'Tu peux remplacer G7 par Db7.\nplay_voicing({"chordSymbol":"Db7"})\nsuggest_actions(actions=[{label: "Entendre", message: "Fais-le-moi entendre"}])' });
r = await send('Quelle substitution pour G7 vers Cmaj7, et pourquoi ?');
check('Un appel d\'outil écrit en texte par le modèle n\'est jamais affiché', r.ok && !/play_voicing|suggest_actions|\{"chordSymbol"/.test(r.content), r.content);
check('Explication d\'avancé : pas de son non demandé', r.autoplay === false && !r.toolResult?.example);
mock.reset();
mock.enqueue({ text: 'Je vais te le jouer tout de suite.' });
r = await send('Explique-moi la substitution tritonique.');
check('Promesse « je vais te le jouer » sans exemple disponible : rien ne démarre', r.autoplay === false && !r.toolResult?.example);

await mock.close();
console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);

// [Claude] — 2026-11-12 — Rejoue la conversation de Narcisse sur « Lick 3 · appoggiatures et arrastre
// en A mineur » (vrai client, faux fournisseur local) : le Copilote doit faire entendre le LICK
// écrit, à la vitesse demandée, sous un titre qui dit ce qui est joué ; aucun nom d'outil visible ;
// « fait la 2 alors » doit atteindre le modèle avec l'option choisie.

import { startMockProvider } from '../../scripts/copilot-e2e/mock-provider.mjs';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage, exerciseExample } = await import('./copilot-client.js');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed += 1; console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };

// Une étude écrite : deux pas, la main gauche tenue, des attaques rapides et différentes à droite.
const step = (beats, attacks) => ({ beats, attacks, keyPc: 0, writtenVoicing: true });
const studyChords = [
  { name: 'Am', voicing: { leftHand: [45, 52], rightHand: [69, 72, 76] }, studyStep: step(2, [
    { at: 0, hand: 'lh', duration: 1.9, velocity: 0.5 },
    { at: 0, hand: 'note', index: 0, duration: 0.24, velocity: 0.62, notes: [69, 81] },
    { at: 0.25, hand: 'note', index: 1, duration: 0.24, velocity: 0.62, notes: [72, 84] },
    { at: 0.5, hand: 'note', index: 2, duration: 0.24, velocity: 0.62, notes: [76, 88] },
  ]) },
  { name: 'E7#9', voicing: { leftHand: [40, 50], rightHand: [56, 62, 67] }, studyStep: step(2, [
    { at: 0, hand: 'lh', duration: 1.9, velocity: 0.5 },
    { at: 0, hand: 'rh', duration: 1.5, velocity: 0.6, roll: 0.06 },
  ]) },
];
const exercise = {
  type: 'exercise', mode: 'movement', id: 'mouvement:lick3', title: 'Geste de voix — Lick 3 · appoggiatures et arrastre en A mineur',
  name: 'Lick 3', description: '', contentKind: 'lick', technique: 'Automatique', attempts: [], key: 'A mineur', keyProgress: '', stepProgress: '1 / 2 gestes',
  chords: [{ name: 'Am', lh: [45, 52], rh: [69, 72, 76], current: true, roles: ['i'] }, { name: 'E7#9', lh: [40, 50], rh: [56, 62, 67], current: false, roles: ['V7'] }],
  expect: { chords: ['Am', 'E7#9'] }, study: { tempo: 96, chords: studyChords, name: 'Lick 3' },
};

// ── L'exemple de l'exercice est le lick écrit ──
const written = exerciseExample(exercise, {});
const onsets = (ex) => (ex?.events || []).filter((e) => e.type === 'noteOn');
check('Le lick écrit est joué (ses notes, pas trois accords plaqués)', onsets(written).some((e) => e.note === 81) && onsets(written).some((e) => e.note === 88), JSON.stringify(onsets(written).map((e) => e.note)));
check('… avec son rythme écrit (attaques à 0, 0,25, 0,5 temps)', JSON.stringify([...new Set(onsets(written).filter((e) => e.time < 1).map((e) => e.time))]) === '[0,0.25,0.5]', JSON.stringify(onsets(written).map((e) => e.time)));
check('… à son tempo écrit, et son titre dit ce qui est joué', written.tempo === 96 && written.title === 'Lick 3 — étude écrite' && /les deux mains · 96 à la noire/.test(written.subtitle));
const slow = exerciseExample(exercise, { speed: 0.7, title: 'Lick 3 salsa — dans son contexte (tumbao + phrase)' });
check('« Plus lentement » : le tempo baisse VRAIMENT (96 → 67)', slow.tempo === 67 && /ralenti \(×0,7\)/.test(slow.title), `${slow.tempo} · ${slow.title}`);
check('Le titre du modèle n\'est jamais repris (pas de « contexte » inventé)', !/contexte|tumbao/.test(slow.title));
check('Vitesse bornée entre ×0,5 et ×1,5', exerciseExample(exercise, { speed: 9 }).tempo === 144 && exerciseExample(exercise, { speed: 0.1 }).tempo === 48);
const noStudy = exerciseExample({ ...exercise, study: null }, { chords: 'all', speed: 0.5 });
check('Sans étude : voicings de la carte, ralentis pour de vrai, titre exact', /voicings de la carte, ralenti \(×0,5\)/.test(noStudy.title) && onsets(noStudy).find((e) => e.note === 40).time >= 3, `${noStudy.title}`);

// ── La conversation de Narcisse, dans le vrai client ──
const mock = await startMockProvider();
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'cle-de-test-locale', baseUrl: mock.url, model: 'mock-model' }));
const history = [];
async function say(message, reply) {
  mock.reset();
  mock.enqueue(...reply);
  history.push({ role: 'user', content: message });
  const r = await quiet(() => sendCopilotMessage({ message, messages: [...history], context: exercise }));
  history.push({ role: 'assistant', content: r.content || r.error || '', toolResult: r.toolResult });
  return r;
}
let r = await say('Rejoue-le plus lentement', [{ text: 'Voici le lick plus lentement.', toolCalls: [{ name: 'play_exercise', arguments: { chords: 'all', title: 'Lick 3 salsa — lent', speed: 0.7 } }] }]);
check('« Rejoue-le plus lentement » : le lick écrit, vraiment ralenti', r.ok && r.toolResult.example?.tempo === 67 && r.toolResult.example.title === 'Lick 3 — étude écrite, ralenti (×0,7)', JSON.stringify(r.toolResult?.example?.title));
check('L\'outil est décrit au modèle avec ce qu\'il ne peut pas faire', /Ne peut RIEN ajouter : ni accompagnement, ni tumbao/.test(JSON.stringify(mock.requests[0].body.tools.find((t) => t.function.name === 'play_exercise'))));
r = await say('pourquoi c\'est lent ?', [{ text: 'L’outil `play_exercise` joue l’exercice à tempo d’étude fixe. Pour le vrai tempo, je peux :\n1. Jouer la grille avec `play_progression` à tempo vif.\n2. Générer un lick salsa nouveau sur Am / E7♯9 avec `play_lick`.\n\nQuelle option préfères-tu ?' }]);
check('Aucun nom interne d\'outil dans la réponse affichée', r.ok && !/play_|`/.test(r.content), r.content);
check('… remplacé par des mots simples', /La lecture de l’exercice joue/.test(r.content) && /l’écoute d’une grille d’accords/.test(r.content), r.content);
r = await say('fait la 2 alors', [{ text: 'Voici un lick salsa nouveau sur Am.', toolCalls: [{ name: 'play_lick', arguments: { target: 'Am', styleId: 'auto', hand: 'RH', lengthBeats: 4 } }] }]);
const sent = mock.requests[0].body.messages.at(-1).content;
check('« fait la 2 alors » : le modèle reçoit l\'option choisie, en clair', /choisit l’option 2/.test(sent) && /Générer un lick salsa nouveau/.test(sent), sent);
check('… et la réponse arrive (pas « pas de réponse utilisable »)', r.ok && Boolean(r.content.trim()), r.error || r.content);
check('… avec l\'écoute choisie (le lick généré), pas seulement du texte', Boolean(r.toolResult?.example?.events?.length), JSON.stringify(r.toolResult?.example?.title || null));
r = await say('Fais-le en plus rapide', [{ text: '', toolCalls: [{ name: 'play_exercise', arguments: { chords: 'all', speed: 1.3 } }] }]);
check('Réponse réduite à un appel d\'outil : un texte simple et l\'exemple, jamais une bulle vide', r.ok && /Lick 3 — étude écrite, accéléré \(×1,3\)/.test(r.content) && r.toolResult.example?.tempo === 125, r.content || r.error);

await mock.close();
console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);

import assert from 'node:assert/strict';
import { sourceTransferRequest, transferFollowup } from './source-transfer.js';
import { applyTutorialPassage } from './tutorial-transfer.js';
import { sendCopilotMessage, tutorialToolCalls, myPlayingExample, executeToolCalls } from './copilot-client.js';
import { parseTutorialRequest } from './tutorial-questions.js';

let count = 0;
const test = async (name, run) => { await run(); count++; console.log(`✓ ${name}`); };
const block = (start, pitches, duration = 1.8) => pitches.map((midi) => ({ midi, start, end: start + duration }));
const notes = [...block(0, [36, 47, 52, 55, 62]), ...block(2, [45, 55, 60, 64, 67])];
const chords = [{ start: 0, end: 2, label: 'Cmaj7' }, { start: 2, end: 4, label: 'Am7' }];
const context = { type: 'tutorial', key: 'C', moment: { start: 0, end: 4 }, noteEvents: notes, chords };
const events = notes.flatMap((n) => [{ type: 'note_on', note: n.midi, velocity: 90, time: n.start, channel: 0 }, { type: 'note_off', note: n.midi, time: n.end, channel: 0 }]);
const own = { type: 'autonomous', playing: { passage: { events, key: 'C' } } };
const request = (message, ctx = context) => sourceTransferRequest(message, ctx);

await test('Rejouer ce passage dans un contexte de ii-V-I demande une adaptation, jamais un simple rejeu', () => {
  const message = 'Rejoue ce passage dans un contexte de 2-5-1 en Do.';
  assert.equal(parseTutorialRequest(message).kind, 'apply');
  const result = request(message);
  assert.equal(result.example, null);
  assert.match(result.error, /vérifié les éléments séparément/);
  assert.ok(result.alternatives.includes('voicing'));
  assert.equal(parseTutorialRequest('Rejoue ce passage.').kind, 'replay');
  assert.equal(parseTutorialRequest('Joue-moi un 2-5-1 en Do.'), null);
});
await test('Rejouer ce voicing sur ii-V-I produit bien l’adaptation compatible', () => {
  const result = request('Rejoue ce voicing dans un contexte de 2-5-1 en Fa.');
  assert.ok(result.example, result.error);
  assert.deepEqual(result.example.chords.map((c) => c.name), ['Gm7', 'C7', 'Fmaj7']);
});

await test('I → vi ne se transforme pas en ii → V → I', () => {
  const result = request('Applique ce mouvement sur 2-5-1 en Do.');
  assert.equal(result.example, null);
  assert.match(result.error, /Cmaj7 → Am7/);
  assert.match(result.error, /Dm7 → G7 → Cmaj7/);
  assert.match(result.error, /changerait le mouvement/);
});
await test('I → vi reste transférable sur un I → vi transposé', () => {
  const result = request('Applique ce mouvement sur Fmaj7 Dm7 en Fa.');
  assert.ok(result.example, result.error);
  assert.match(result.text, /mouvement direct/i);
  assert.equal(result.example.source.what, 'enchainement');
  assert.deepEqual(result.example.chords.map((c) => c.name), ['Fmaj7', 'Dm7']);
});
await test('Un I → vi ne se fait pas passer pour IV → ii dans la même tonalité', () => {
  const result = request('Applique ce mouvement sur Fmaj7 Dm7 en Do.');
  assert.equal(result.example, null);
  assert.match(result.error, /degrés/);
});
await test('Un voicing est adaptable au ii-V-I sans prétendre copier le mouvement', () => {
  const result = request('Applique ses voicings à 2-5-1 en Fa.');
  assert.ok(result.example, result.error);
  assert.match(result.text, /rôles du voicing/);
  assert.deepEqual(result.example.chords.map((c) => c.name), ['Gm7', 'C7', 'Fmaj7']);
});
await test('La cover choisie suit le même contrôle', () => {
  assert.equal(request('Applique le mouvement de cette cover sur 2-5-1 en Do.').example, null);
});
await test('Le jeu MIDI personnel suit le même refus', () => {
  const result = request('Applique mon mouvement sur 2-5-1 en Do.', own);
  assert.equal(result.example, null);
  assert.match(result.error, /changerait le mouvement/);
});
await test('Un voicing MIDI personnel est adapté sans attribution au professeur', () => {
  const result = request('Applique mes voicings sur 2-5-1 en Fa.', own);
  assert.ok(result.example, result.error);
  assert.equal(result.source, 'ton passage joué');
  assert.doesNotMatch(result.text + result.example.title, /du prof/);
});
await test('Une session demandée ne se remplace pas par le dernier essai', () => {
  assert.equal(request('Applique le mouvement de ma session sur 2-5-1 en Do.', own).example, null);
});
await test('La demande explicite de son propre jeu ne prend jamais la vidéo à sa place', () => {
  assert.match(request('Applique mon mouvement sur 2-5-1 en Do.').error, /pas ton jeu/);
});
await test('La demande explicite du prof ne prend jamais le jeu personnel à sa place', () => {
  assert.match(request('Applique ses voicings sur 2-5-1 en Do.', own).error, /Ouvre le tutoriel/);
});
await test('Sans sélection, sans notes, sans cible, les informations manquantes sont demandées', () => {
  assert.match(request('Applique ses voicings sur 2-5-1 en Do.', { ...context, moment: null }).error, /début et la fin/);
  assert.match(request('Applique ses voicings sur 2-5-1 en Do.', { ...context, noteEvents: [] }).error, /notes/);
  assert.match(request('Applique ce mouvement ailleurs.').error, /progression cible/);
});
await test('Une adaptation non définie examine ce qui est réutilisable', () => {
  assert.match(request('Applique-le à 2-5-1 en Do.').error, /vérifié les éléments séparément/);
});
await test('La cible implicite reste dans sa tonalité d’origine après déplacement du contexte', () => {
  const first = request('Applique ce mouvement sur 2-5-1.');
  const followup = transferFollowup('Reprends ce qui est possible.', [{ role: 'assistant', toolResult: { transferIntent: first.transferIntent } }]);
  const result = sourceTransferRequest('Reprends ce qui est possible.', { ...context, key: 'F', moment: null }, followup);
  assert.deepEqual(result.example.source.targets, ['Dm7', 'G7', 'Cmaj7']);
  assert.equal(result.example.source.start, 0);
  assert.equal(result.example.source.end, 4);
});
await test('Une relance du jeu personnel ouvert à côté d’une vidéo ne prend pas les notes du prof', () => {
  const ctx = { ...context, playing: own.playing };
  const first = request('Applique mon mouvement sur 2-5-1 en Fa.', ctx);
  const followup = transferFollowup('Conserve ce qui est possible.', [{ role: 'assistant', toolResult: { transferIntent: first.transferIntent } }]);
  const result = sourceTransferRequest('Conserve ce qui est possible.', ctx, followup);
  assert.ok(result.example, result.error);
  assert.equal(result.source, 'ton passage joué');
  assert.equal(result.example.source.end, 3.8);
  assert.deepEqual(result.example.source.targets, ['Gm7', 'C7', 'Fmaj7']);
});
await test('Un nouveau passage MIDI ne remplace pas celui d’une adaptation en attente', () => {
  const first = request('Applique mon mouvement sur 2-5-1 en Fa.', own);
  const followup = transferFollowup('Conserve ce qui est possible.', [{ role: 'assistant', toolResult: { transferIntent: first.transferIntent } }]);
  const changed = { ...own, playing: { passage: { ...own.playing.passage, events: events.map((e) => ({ ...e, note: e.note + 1 })) } } };
  assert.match(sourceTransferRequest('Conserve ce qui est possible.', changed, followup).error, /relevé du passage a changé/);
});
await test('Les degrés ne sont pas calculés en Do par défaut si la tonalité manque', () => {
  assert.match(request('Applique ses voicings à 2-5-1.', { ...context, key: null }).error, /quelle tonalité/);
});
await test('Tonalité source inconnue : pas de mouvement certifié, les rôles des voicings restent examinés', () => {
  const ctx = { ...context, key: null };
  const first = request('Applique ce mouvement sur 2-5-1 en Fa.', ctx);
  assert.equal(first.example, null);
  assert.match(first.error, /tonalité de la source n’est pas connue/);
  const followup = transferFollowup('Conserve ce qui est possible.', [{ role: 'assistant', toolResult: { transferIntent: first.transferIntent } }]);
  const result = sourceTransferRequest('Conserve ce qui est possible.', ctx, followup);
  assert.equal(result.example.source.what, 'voicing');
  assert.deepEqual(result.example.source.targets, ['Gm7', 'C7', 'Fmaj7']);
});
await test('Un instant isolé ne fait pas inventer la fin du mouvement', () => {
  assert.match(request('Applique le mouvement de 0:02 sur 2-5-1 en Do.').error, /sélectionne aussi sa fin/);
});
await test('Un rôle absent de la cible n’est pas remplacé par une fondamentale', () => {
  const result = request('Applique ses voicings sur F G.');
  assert.equal(result.example, null);
  assert.match(result.error, /rôle.*n’existe pas/);
});
await test('Un accord cible invalide ne disparaît pas de la progression', () => {
  const result = applyTutorialPassage({ notes, chords, start: 0, end: 4, targets: ['Dm7', 'inconnu', 'Cmaj7'] });
  assert.equal(result.example, null);
  assert.match(result.error, /accord cible/);
  assert.match(request('Applique ses voicings sur Dm7 G7 Cbanane.').error, /accord cible/);
});
await test('Un seul accord cible suffit pour adapter un voicing', () => {
  assert.ok(request('Applique ce voicing sur Fmaj7.').example);
});
await test('Un mouvement ne se certifie pas avec une grille dont un accord n’a pas de notes', () => {
  assert.match(request('Applique ce mouvement sur Fmaj7 Dm7.', { ...context, noteEvents: notes.slice(0, 5) }).error, /mouvement complet/);
});
await test('Une source trop longue n’est jamais tronquée silencieusement', () => {
  assert.match(request('Applique ses voicings sur 2-5-1 en Do.', { ...context, moment: { start: 0, end: 800 } }).error, /trop long/);
  assert.match(request('Applique mes voicings sur 2-5-1 en Do.', { type: 'session', playing: { session: { events: [...events, { type: 'note_off', note: 60, time: 900, channel: 0 }], key: 'C' } } }).error, /trop long/);
});
await test('Une demande d’accords de passage ne se remplace pas par un mouvement direct', () => {
  const result = request('Applique ses accords de passage sur Fmaj7 Dm7.');
  assert.equal(result.example, null);
  assert.match(result.error, /Pas d'accord de passage/);
});
await test('Deux démonstrations séparées ne deviennent pas un mouvement inventé', () => {
  const split = { ...context, moment: { start: 0, end: 10 }, chords: [chords[0], { ...chords[1], start: 8, end: 10 }], noteEvents: [...notes.slice(0, 5), ...notes.slice(5).map((n) => ({ ...n, start: n.start + 6, end: n.end + 6 }))] };
  assert.match(request('Applique ce mouvement sur Fmaj7 Dm7.', split).error, /interruption/);
});
await test('Le clavier transposé conserve la tonalité entendue pour les degrés cibles', () => {
  const result = request('Applique mes voicings sur 2-5-1.', { type: 'autonomous', playing: { session: { events, key: 'C', offset: 2 } } });
  assert.ok(result.example, result.error);
  assert.deepEqual(result.example.source.targets, ['Em7', 'A7', 'Dmaj7']);
});
await test('Le modèle ne change ni la progression ni la fenêtre de la demande', () => {
  const calls = tutorialToolCalls(parseTutorialRequest('Applique ses voicings à 2-5-1 en Fa.'), [{ function: { name: 'apply_tutorial_passage', arguments: JSON.stringify({ start: 99, end: 103, chords: ['C7', 'D7'] }) } }], context);
  const args = JSON.parse(calls[0].function.arguments);
  assert.equal(args.chords, '2-5-1');
  assert.equal(args.start, 0);
  assert.equal(args.end, 4);
});
await test('Une transposition demandée n’est pas perdue si le modèle appelle un simple rejeu', () => {
  const calls = tutorialToolCalls(parseTutorialRequest('Rejoue ce passage en Fa.'), [{ function: { name: 'play_tutorial_passage', arguments: '{"start":0,"end":4}' } }], context);
  assert.equal(JSON.parse(calls[0].function.arguments).transposeTo, 'Fa');
});
await test('Tonalité MIDI inconnue : pas de rejeu d’origine à la place de la transposition', () => {
  const result = myPlayingExample({ passage: { events, key: null } }, { transposeTo: 'Fa' });
  assert.equal(result.example, null);
  assert.match(result.note, /tonalité de la source/);
});
await test('Passer du majeur au mineur n’est pas présenté comme une transposition fidèle', () => {
  const result = myPlayingExample(own.playing, { transposeTo: 'Fa mineur' });
  assert.equal(result.example, null);
  assert.match(result.note, /change les intervalles/);
});
await test('Tonalité vidéo inconnue : aucun exemple trompeur, malgré une annonce du modèle', () => {
  const result = executeToolCalls([{ function: { name: 'play_tutorial_passage', arguments: '{"start":0,"end":4,"transposeTo":"Fa"}' } }], 'Voici le passage en Fa.', { tutorial: { ...context, key: null } });
  assert.equal(result.example, null);
  assert.doesNotMatch(result.content, /Voici le passage en Fa/);
});
await test('Le refus final ne dépend ni du réseau ni d’une explication inventée par le modèle', async () => {
  const before = global.fetch;
  global.fetch = () => { throw Error('Aucun appel réseau permis dans ce scénario'); };
  try {
    const result = await sendCopilotMessage({ message: 'Applique ce mouvement sur 2-5-1 en Do.', context, messages: [] });
    assert.equal(result.ok, true);
    assert.equal(result.autoplay, false);
    assert.equal(result.toolResult.example, null);
    assert.match(result.content, /changerait le mouvement/);
    const hear = await sendCopilotMessage({ message: 'Fais-le-moi entendre', context, messages: [{ role: 'assistant', content: result.content, toolResult: result.toolResult }] });
    assert.equal(hear.toolResult.example, null);
  } finally { global.fetch = before; }
});
await test('L’adaptation compatible est prête sans réseau, avec des instants MIDI finis', async () => {
  const result = await sendCopilotMessage({ message: 'Applique ses voicings à 2-5-1 en Fa.', context, messages: [] });
  assert.ok(result.toolResult.example, result.content);
  assert.ok(result.toolResult.played.every((n) => Number.isFinite(n.startOffsetMs)));
  const hear = await sendCopilotMessage({ message: 'Fais-le-moi entendre', context: { ...context, moment: { start: 88, end: 90 } }, messages: [{ role: 'assistant', content: result.content, toolResult: result.toolResult }] });
  assert.equal(hear.toolResult.example, result.toolResult.example);
});
await test('Un appel d’adaptation inventé par le modèle ne contourne pas le contrôle', async () => {
  const oldFetch = global.fetch, oldStorage = Object.getOwnPropertyDescriptor(global, 'localStorage'), oldWindow = global.window;
  let payload;
  global.window = {};
  global.localStorage = { getItem: (k) => k === 'piano-jazz-ai-config' ? JSON.stringify({ apiKey: 'fixture-only', baseUrl: 'https://example.test/v1', model: 'fixture' }) : null };
  global.fetch = async (url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Voici mon adaptation inventée.', tool_calls: [{ function: { name: 'apply_tutorial_passage', arguments: '{"start":0,"end":4,"chords":["G7","Cmaj7"]}' } }] } }] }) };
  };
  try {
    const result = await sendCopilotMessage({ message: 'Quel est le rôle de cet accord ?', context, messages: [] });
    assert.equal(result.toolResult.example, null);
    assert.doesNotMatch(result.content, /adaptation inventée/);
    assert.match(result.content, /vérifier leur compatibilité/);
    assert.ok(!payload.tools.some((t) => t.function.name === 'apply_tutorial_passage'));
  } finally {
    global.fetch = oldFetch; global.window = oldWindow;
    if (oldStorage) Object.defineProperty(global, 'localStorage', oldStorage);
    else delete global.localStorage;
  }
});
console.log(`${count}/${count} scénarios source → adaptation passent`);

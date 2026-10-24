import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTutorialRequest } from './tutorial-questions.js';
import { tutorialEvidence, evidenceOccurrence, tutorialPlayback } from './tutorial-evidence.js';
import { parseKey } from './tutorial-transfer.js';
import { transferFollowup, sourceTransferRequest } from './source-transfer.js';
import { sendCopilotMessage, finalizeContent } from './copilot-client.js';

// Fragment portable du cache réel : ces tests vérifient l'usage des données,
// pas la justesse du relevé automatique à l'oreille.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/copilot-736-conversation.json', import.meta.url)));
const context = fixture.context;
const original = JSON.stringify(fixture);
const targets = ['Emaj7', 'C#m7', 'F#m7', 'B7'];
let count = 0;
const test = async (name, run) => { await run(); console.log(`✓ ${name}`); count++; };
const history = [];
const replies = [];
const oldFetch = global.fetch;
let calls = 0;
global.fetch = () => { calls++; throw Error('La conversation doit fonctionner sans appel au modèle.'); };

try {
  await test('La demande distingue le 7-3-6 source du 1-6-2-5 cible en Mi', () => {
    const ask = parseTutorialRequest(fixture.legacyTransferQuestion);
    assert.equal(ask.sourceProgression, '7-3-6');
    assert.equal(ask.progression, '1-6-2-5');
    assert.equal(ask.key, 'Mi');
    assert.equal(ask.what, 'enchainement');
    const unicode = parseTutorialRequest('Applique le 7‑3‑6 de la vidéo sur un 2‑5‑1 en Fa.');
    assert.equal(unicode.sourceProgression, '7-3-6');
    assert.equal(unicode.progression, '2-5-1');
    const twoKeys = parseTutorialRequest('Applique le 7-3-6 en Do sur 1-6-2-5 en Mi.');
    assert.equal(twoKeys.sourceProgression, '7-3-6');
    assert.equal(twoKeys.key, 'Mi');
  });
  await test('La tonalité annoncée et les fondamentales concordent en Do, malgré le cache global en Mi', () => {
    const evidence = tutorialEvidence(context);
    assert.equal(context.key, 'E');
    assert.equal(parseKey(evidence.key).rootPc, 0);
    assert.equal(evidence.announced, true);
    assert.deepEqual(evidence.expected.map((c) => c.rootPc), [11, 4, 9]);
    assert.equal(evidence.occurrences.length, 2);
  });
  await test('Un titre ou une tonalité annoncée sans concordance ne suffit pas', () => {
    assert.equal(tutorialEvidence({ ...context, chords: [] }), null);
    assert.equal(tutorialEvidence({ ...context, transcript: [] }), null);
    assert.equal(tutorialEvidence({ ...context, transcript: [{ start: 27, text: 'The key of F sharp.' }] }), null);
    assert.equal(tutorialEvidence({ ...context, chords: context.chords.map((c) => ({ ...c, uncertain: true })) }), null);
    assert.equal(tutorialEvidence({ ...context, chords: [
      { start: 42, end: 43, label: 'B7' },
      { start: 43, end: 43.2, label: 'Cmaj7', uncertain: true },
      { start: 43.2, end: 43.75, label: 'E7' },
      { start: 43.75, end: 46.125, label: 'A7sus4' },
    ] }), null);
  });
  await test('La référence nommée retrouve une occurrence complète, sans dépasser une région explicite', () => {
    const occurrence = evidenceOccurrence(tutorialEvidence(context), context.moment);
    assert.equal(occurrence.start, 46.125);
    assert.equal(occurrence.end, 50.875);
    const narrow = { ...context, moment: { chosen: true, start: 45, end: 48 } };
    assert.equal(tutorialEvidence(narrow), null);
    assert.match(tutorialPlayback(fixture.questions[1], narrow).error, /pas un 7-3-6 complet/);
    assert.equal(sourceTransferRequest(fixture.legacyTransferQuestion, narrow).example, null);
  });
  for (const [i, message] of fixture.questions.entries()) {
    await test(`Conversation réelle, demande ${i + 1} : réponse exploitable sans modèle`, async () => {
      history.push({ role: 'user', content: message });
      const reply = await sendCopilotMessage({ message, context, messages: history });
      assert.equal(reply.ok, true, JSON.stringify(reply));
      assert.ok(reply.content.trim());
      assert.doesNotMatch(reply.content, /AI_EMPTY_RESPONSE/);
      assert.notEqual(reply.toolResult.example?.kind, 'lick');
      replies.push(reply);
      history.push({ role: 'assistant', content: reply.content, toolResult: reply.toolResult });
    });
  }
  await test('L’explication française corrige la confusion entre degrés et intervalles d’un accord', () => {
    for (const reply of [replies[0], replies[2]]) {
      assert.match(reply.content, /enchaînement 7 → 3 → 6/);
      assert.match(reply.content, /Do majeur/);
      assert.match(reply.content, /Si → Mi → La/);
      assert.equal(reply.toolResult.example, null);
    }
  });
  await test('Les trois démonstrations reprennent toutes les hauteurs du fragment, accords compris', () => {
    const expected = context.noteEvents.filter((n) => n.start >= 46.125 && n.start < 50.875).map((n) => n.midi).sort((a, b) => a - b);
    for (const reply of [replies[1], replies[3], replies[4]]) {
      const example = reply.toolResult.example;
      assert.equal(example.kind, 'tutorial');
      assert.equal(example.tutorialStart, 46.125);
      assert.equal(example.tutorialEnd, 50.875);
      assert.deepEqual(example.events.filter((e) => e.type === 'noteOn').map((e) => e.note).sort((a, b) => a - b), expected);
      assert.equal(reply.autoplay, true);
      assert.doesNotMatch(reply.content, /pas trouvé d.exemple jouable|déterminer l.échelle/);
    }
  });
  await test('Le mouvement nommé est conservé par insertion avant le sixième degré', () => {
    const reply = replies[5];
    assert.equal(reply.toolResult.example.kind, 'tutorial-insertion');
    assert.match(reply.content, /D#7#9#11 → G#7#5 → C#7sus4/);
    assert.match(reply.content, /résolution est ajoutée/);
    assert.deepEqual(reply.toolResult.example.source.targets, targets);
    assert.equal(reply.autoplay, true);
    assert.equal(reply.toolResult.transferIntent.request.sourceProgression, '7-3-6');
    assert.equal(reply.toolResult.transferIntent.sourceKey, tutorialEvidence(context).key);
  });
  await test('« Conserver ce qui est possible » garde l’insertion identifiée et sa cible', () => {
    const reply = replies[6], example = reply.toolResult.example;
    assert.equal(example.kind, 'tutorial-insertion');
    assert.equal(example.source.what, 'insertion');
    assert.deepEqual(example.source.targets, targets);
    assert.deepEqual(example.chords.filter((c) => c.origin !== 'source').map((c) => c.name), targets);
    assert.match(reply.content, /chaîne de notes par transposition/);
    assert.equal(reply.autoplay, true);
    assert.ok(example.events.every((e) => Number.isFinite(e.time)));
  });
  await test('Une relance garde le passage source même après déplacement de la vidéo', async () => {
    const reply = await sendCopilotMessage({ message: fixture.legacyFollowup, context: { ...context, moment: null }, messages: history.slice(0, 12) });
    assert.equal(reply.toolResult.example.source.start, 46.125);
    assert.equal(reply.toolResult.example.source.end, 50.875);
    assert.deepEqual(reply.toolResult.example.source.targets, targets);
  });
  await test('Une relance refuse un changement de vidéo au lieu de substituer sa source', async () => {
    const reply = await sendCopilotMessage({ message: fixture.legacyFollowup, context: { ...context, path: '/fixture/other.mp4' }, messages: history.slice(0, 12) });
    assert.equal(reply.toolResult.example, null);
    assert.match(reply.content, /source.*plus ouverte/);
  });
  await test('La suite d’une ancienne conversation fonctionne sans métadonnées d’intention', async () => {
    const messages = [
      { role: 'user', content: fixture.legacyTransferQuestion },
      { role: 'assistant', content: 'Que veux-tu conserver ?' },
    ];
    const reply = await sendCopilotMessage({ message: fixture.legacyFollowup, context, messages });
    assert.deepEqual(reply.toolResult.example.source.targets, targets);
    assert.equal(reply.toolResult.example.source.what, 'insertion');
  });
  await test('Une nouvelle cible ou une question sur le voicing ne réactive pas l’ancienne demande', () => {
    assert.equal(transferFollowup('Applique ses voicings à 2-5-1 en Fa.', history), null);
    assert.equal(transferFollowup('C’est quoi un voicing ?', history), null);
    assert.equal(transferFollowup('Pourquoi cette ligne ?', history), null);
  });
  await test('L’action proposée après l’explication désigne la progression complète', async () => {
    const action = replies[0].suggestedActions[0];
    assert.equal(action.label, action.message);
    const reply = await sendCopilotMessage({ message: action.message, context: { ...context, moment: { start: 45, end: 48 } }, messages: [] });
    assert.equal(reply.toolResult.example.tutorialStart, 42.017);
    assert.equal(reply.toolResult.example.tutorialEnd, 46.125);
  });
  await test('Une démonstration sans notes ou sans progression concordante ne génère aucun remplacement', async () => {
    const noNotes = await sendCopilotMessage({ message: fixture.questions[1], context: { ...context, noteEvents: [] }, messages: [] });
    assert.equal(noNotes.toolResult.example, null);
    assert.match(noNotes.content, /pas les notes exactes/);
    const noEvidence = await sendCopilotMessage({ message: fixture.questions[1], context: { ...context, transcript: [] }, messages: [] });
    assert.equal(noEvidence.toolResult.example, null);
    assert.match(noEvidence.content, /pas un 7-3-6 complet/);
  });
  await test('Un autre moment de la même vidéo n’est pas présenté comme le 7-3-6 complet', async () => {
    const reply = await sendCopilotMessage({ message: 'Rejoue ce passage.', context: { ...context, moment: { start: 40, end: 41 } }, messages: [] });
    assert.equal(reply.toolResult.example.kind, 'tutorial');
    assert.equal(reply.toolResult.example.tutorialStart, 40);
    assert.doesNotMatch(reply.toolResult.example.title, /7-3-6/);
    assert.doesNotMatch(reply.content, /Le 7-3-6 désigne/);
  });
  await test('Un ancien lick généré est reconnu et remplacé par le relevé complet', async () => {
    const reply = await sendCopilotMessage({ message: fixture.questions[4], context, messages: [{ role: 'assistant', content: 'Voici un lick.', toolResult: { example: { kind: 'lick' } } }] });
    assert.match(reply.content, /L’exemple précédent était un lick généré/);
    assert.equal(reply.toolResult.example.kind, 'tutorial');
  });
  await test('Un exemple existant n’est plus accompagné d’un message disant qu’il est introuvable', () => {
    const result = { example: replies[1].toolResult.example };
    const caption = finalizeContent('_(Je n’ai pas trouvé d’exemple jouable : Impossible de déterminer l’échelle.)_', result);
    assert.doesNotMatch(caption, /pas trouvé|Impossible/);
    assert.match(caption, /Progression 7-3-6/);
  });
  await test('La conversation et le cache de test restent intacts ; aucun appel réseau', () => {
    assert.equal(JSON.stringify(fixture), original);
    assert.equal(calls, 0);
  });
} finally { global.fetch = oldFetch; }

await test('Le modèle reçoit la tonalité corroborée, et sa confusion intervalles/degrés est bloquée', async () => {
  const oldWindow = global.window, oldStorage = Object.getOwnPropertyDescriptor(global, 'localStorage');
  let payload;
  global.window = {};
  global.localStorage = { getItem: (k) => k === 'piano-jazz-ai-config' ? JSON.stringify({ apiKey: 'fixture-only', baseUrl: 'https://example.test/v1', model: 'fixture' }) : null };
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Le 7-3-6 est la septième, la tierce et la sixième de chaque accord.' } }] }) };
  };
  try {
    const reply = await sendCopilotMessage({ message: 'Explique ce passage.', context, messages: [] });
    assert.equal(reply.ok, true);
    assert.match(reply.content, /fondamentales \*\*Si → Mi → La/);
    assert.equal(reply.toolResult.example, null);
    const prompt = payload.messages[0].content;
    assert.match(prompt, /Tonalité corroborée pour le mouvement/);
    assert.doesNotMatch(prompt, /Tonalité détectée : E/);
    assert.match(prompt, /7-3-6 désigne une progression d'accords successifs/);
    assert.doesNotMatch(prompt, /Notes jouées par le professeur : non disponibles/);
    assert.match(prompt, /56 événements de notes sont disponibles/);
  } finally {
    global.fetch = oldFetch; global.window = oldWindow;
    if (oldStorage) Object.defineProperty(global, 'localStorage', oldStorage);
    else delete global.localStorage;
  }
});
console.log(`${count}/${count} scénarios de conversation passent`);

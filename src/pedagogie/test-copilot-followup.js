import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendCopilotMessage } from './copilot-client.js';
import { insertSourcePassage, insertionBetween } from './passage-insertion.js';
import { insertionFollowup } from './source-transfer.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/copilot-736-conversation.json', import.meta.url)));
const context = { ...fixture.context, moment: { start: 35, end: 46.2, now: 46.2 } };
const pristine = JSON.stringify(fixture);
const target = ['Emaj7', 'C#m7', 'F#m7', 'B7'];
// L'ancienne cible existe dans l'historique : elle ne doit pas détourner
// « un autre exemple » du passage qui vient effectivement d'être rejoué.
const history = [
  { role: 'user', content: fixture.legacyTransferQuestion },
  { role: 'assistant', content: 'Que veux-tu conserver ?', toolResult: { transferStatus: 'unavailable' } },
  { role: 'user', content: fixture.legacyFollowup },
  { role: 'assistant', content: 'Réponse vide.', isError: true },
];
const replies = [];
let count = 0, calls = 0;
const oldFetch = global.fetch;
global.fetch = () => { calls++; throw Error('Aucun appel au modèle pour ces relances.'); };
const test = async (name, run) => { await run(); console.log(`✓ ${name}`); count++; };
const ons = (example, origin) => example.events.filter((e) => e.type === 'noteOn' && (!origin || e.origin === origin));
const pitches = (events) => events.map((e) => e.note).sort((a, b) => a - b);
const message = (reply) => ({ role: 'assistant', content: reply.content, toolResult: reply.toolResult });

try {
  for (const [i, text] of fixture.followupQuestions.entries()) {
    await test(`Nouvel échange réel ${i + 1} : réponse locale sans bulle vide`, async () => {
      history.push({ role: 'user', content: text });
      const reply = await sendCopilotMessage({ message: text, context, messages: history });
      assert.equal(reply.ok, true, JSON.stringify(reply));
      assert.ok(reply.content.trim());
      assert.doesNotMatch(reply.content, /AI_EMPTY_RESPONSE/);
      replies.push(reply);
      history.push(message(reply));
    });
  }
  await test('« Un autre exemple » garde le mouvement et prend la deuxième occurrence', () => {
    const first = replies[0].toolResult.example, second = replies[1].toolResult.example;
    assert.equal(first.tutorialStart, 42.017);
    assert.equal(second.kind, 'tutorial');
    assert.equal(second.tutorialStart, 46.125);
    assert.equal(second.tutorialEnd, 50.875);
    assert.match(replies[1].content, /autre occurrence du même mouvement/);
    assert.deepEqual(pitches(ons(second)), fixture.context.noteEvents.filter((n) => n.start >= 46.125 && n.start < 50.875).map((n) => n.midi).sort((a, b) => a - b));
    assert.doesNotMatch(second.title, /Emaj7|C#m7/);
  });
  await test('La question sur la vidéo reçoit une provenance vérifiable, sans nouvel exemple', () => {
    assert.match(replies[2].content, /Oui.*notes relevées de la vidéo/);
    assert.match(replies[2].content, /0:46.*0:50/);
    assert.equal(replies[2].toolResult.example, null);
    assert.equal(replies[2].autoplay, false);
  });
  await test('La demande initiale d’adaptation découvre l’insertion, sans refus global abusif', () => {
    const reply = replies[3];
    assert.equal(reply.toolResult.example.kind, 'tutorial-insertion');
    assert.deepEqual(reply.toolResult.example.source.between, [1, 6]);
    assert.deepEqual(reply.toolResult.example.source.targets, target);
    assert.match(reply.content, /placer le 7-3-6 avant le 6/);
    assert.doesNotMatch(reply.content, /ne trouve pas de contexte compatible/);
  });
  await test('« Entre le 1-6 » conserve la grille entière et distingue les origines', () => {
    const reply = replies[4], example = reply.toolResult.example;
    assert.equal(example.kind, 'tutorial-insertion');
    assert.deepEqual(example.source.targets, target);
    assert.deepEqual(example.chords.map((c) => c.name), ['Emaj7', 'D#7#9#11', 'G#7#5', 'C#7sus4', 'C#m7', 'F#m7', 'B7']);
    assert.deepEqual(example.chords.map((c) => c.origin), ['context', 'source', 'source', 'source', 'resolution', 'context', 'context']);
    assert.match(reply.content, /résolution est ajoutée et n’est pas jouée telle quelle/);
    assert.match(reply.content, /voicings de l’application/);
    assert.equal(reply.autoplay, true);
  });
  await test('Le passage inséré conserve toutes les hauteurs source, transposées ensemble de +4', () => {
    const example = replies[4].toolResult.example;
    const expected = fixture.context.noteEvents.filter((n) => n.start >= example.source.start && n.start < example.source.end).map((n) => n.midi + 4).sort((a, b) => a - b);
    assert.equal(expected.length, 20);
    assert.deepEqual(pitches(ons(example, 'source')), expected);
    const sourceOns = ons(example, 'source');
    assert.ok(Math.abs((sourceOns.find((e) => e.note === 44).time - sourceOns.find((e) => e.note === 51).time) - 1.08) < 0.001);
    assert.ok(example.events.every((e) => Number.isFinite(e.time) && e.time >= 0));
  });
  await test('La résolution ajoutée ne change que la quarte suspendue vers la tierce mineure', () => {
    assert.deepEqual(pitches(ons(replies[4].toolResult.example, 'resolution')), [49, 56, 59, 61, 64, 71]);
  });
  await test('Une provenance fausse dans l’ancien historique est corrigée depuis le type réellement préparé', async () => {
    const reply = await sendCopilotMessage({ message: "c'est pas dans la vidéo ça ?", context,
      messages: [{ role: 'assistant', content: 'Voici le passage de la vidéo.', toolResult: { example: { kind: 'progression', title: target.join(' → ') } } }] });
    assert.match(reply.content, /généré par l’application/);
    assert.match(reply.content, /ne rejoue pas les notes du pianiste/);
    assert.equal(reply.toolResult.example, null);
  });
  await test('La provenance d’une insertion ne prétend pas que toute la séquence vient de la vidéo', async () => {
    const reply = await sendCopilotMessage({ message: "c'est dans la vidéo ça ?", context, messages: history });
    assert.match(reply.content, /insertion adaptée/);
    assert.match(reply.content, /ne.*jouée telle quelle|n’est pas jouée telle quelle/);
    assert.equal(reply.autoplay, false);
  });
  await test('L’épuisement des occurrences ne génère pas une ancienne grille de secours', async () => {
    const reply = await sendCopilotMessage({ message: 'un autre exemple', context, messages: history.slice(0, 8) });
    assert.equal(reply.toolResult.example, null);
    assert.match(reply.content, /pas retrouvé d’autre occurrence complète/);
  });
  await test('Une région choisie ne s’élargit pas à la demande d’un autre exemple', async () => {
    const reply = await sendCopilotMessage({ message: 'un autre exemple', context: { ...context, moment: { start: 42, end: 46.2, chosen: true } }, messages: [message(replies[0])] });
    assert.equal(reply.toolResult.example, null);
    assert.match(reply.content, /dans cette région/);
  });
  await test('Une arrivée incompatible donne un refus musical précis, sans changer les degrés', async () => {
    const reply = await sendCopilotMessage({ message: 'tu peux le jouer entre le 2 et le 5 comme passage', context, messages: history });
    assert.equal(reply.toolResult.example, null);
    assert.match(reply.content, /arrive sur C#7sus4.*rejoindre B7/);
  });
  await test('Une paire absente de la grille n’est pas substituée à la grille entière', async () => {
    const reply = await sendCopilotMessage({ message: 'Insère-le entre le 1 et le 5.', context, messages: history });
    assert.equal(reply.toolResult.example, null);
    assert.match(reply.content, /ne contient pas 1 → 5/);
  });
  await test('Une nouvelle tonalité explicite change la cible en gardant la source', async () => {
    const reply = await sendCopilotMessage({ message: 'tu peux le jouer entre le 1 et le 6 en Fa', context, messages: history });
    assert.deepEqual(reply.toolResult.example.source.targets, ['Fmaj7', 'Dm7', 'Gm7', 'C7']);
    assert.deepEqual(reply.toolResult.example.chords.filter((c) => c.origin === 'source').map((c) => c.name), ['E7#9#11', 'A7#5', 'D7sus4']);
  });
  await test('Changer de vidéo ne réaffecte pas une insertion à une autre source', async () => {
    const reply = await sendCopilotMessage({ message: 'tu peux le jouer entre le 1 et le 6', context: { ...context, path: '/other.mp4' }, messages: history });
    assert.equal(reply.toolResult.example, null);
    assert.match(reply.content, /source.*plus ouverte/);
  });
  await test('Une qualité d’arrivée différente n’est pas changée arbitrairement', () => {
    const source = { notes: fixture.context.noteEvents, chords: fixture.context.chords.slice(0, 3).map((c, i) => i === 2 ? { ...c, label: 'Amaj7' } : c), key: 'C', start: 42.017, end: 46.125 };
    const reply = insertSourcePassage({ source, targets: target, targetKey: 'Mi', between: [1, 6], sourceProgression: '7-3-6' });
    assert.equal(reply.example, null);
    assert.match(reply.error, /qualité d’accord|notes disponibles/);
  });
  await test('Les variantes de « entre » désignent la même paire', () => {
    for (const text of ['entre le 1-6', 'entre 1 et 6', 'entre le 1 et le 6', 'entre le 1‑6']) assert.deepEqual(insertionBetween(text).degrees, [1, 6]);
  });
  await test('Une demande complète d’insertion fonctionne aussi sans historique', async () => {
    const reply = await sendCopilotMessage({ message: 'Insère le 7-3-6 de la vidéo entre le 1 et le 6 en Mi.', context, messages: [] });
    assert.equal(reply.toolResult.example.kind, 'tutorial-insertion');
    assert.deepEqual(reply.toolResult.example.source.targets, ['Emaj7', 'C#m7']);
    assert.match(reply.content, /D#7#9#11 → G#7#5 → C#7sus4/);
  });
  await test('Une question sur la différence entre deux degrés ne déclenche pas d’insertion', () => {
    assert.equal(insertionFollowup('Quelle différence entre le 1 et le 6 ?', history, context), null);
    assert.equal(insertionFollowup('Pourquoi tu le joues entre le 1 et le 6 ?', history, context), null);
  });
  await test('« Un autre exemple » après une insertion garde son opération, sa source et sa cible', async () => {
    const reply = await sendCopilotMessage({ message: 'un autre exemple', context, messages: [message(replies[3])] });
    const example = reply.toolResult.example;
    assert.equal(example.kind, 'tutorial-insertion');
    assert.deepEqual(example.source.targets, target);
    assert.equal(example.source.start, 46.125);
    assert.equal(example.source.end, 50.875);
    assert.deepEqual(pitches(ons(example, 'source')), fixture.context.noteEvents.filter((n) => n.start >= 46.125 && n.start < 50.875).map((n) => n.midi + 4).sort((a, b) => a - b));
  });
  await test('Une cible invalide ou une paire absente donne un refus sans exception', () => {
    const input = { source: {}, targets: ['Emaj7', 'Cbanane'], targetKey: 'Mi', between: [1, 6] };
    assert.match(insertSourcePassage({ ...input, source: { key: 'C' } }).error, /accord cible/);
    assert.match(insertSourcePassage({ ...input, between: null }).error, /deux degrés/);
  });
  await test('Une question intermédiaire sur la provenance ne fait perdre ni la source ni la cible', async () => {
    const first = await sendCopilotMessage({ message: fixture.legacyTransferQuestion, context: fixture.context, messages: [] });
    assert.equal(first.toolResult.example.source.start, 46.125);
    const messages = [{ role: 'user', content: fixture.legacyTransferQuestion }, message(first)];
    const origin = await sendCopilotMessage({ message: "c'est dans la vidéo ça ?", context, messages });
    messages.push(message(origin));
    const reply = await sendCopilotMessage({ message: 'tu peux le jouer entre le 1 et le 6', context, messages });
    assert.equal(reply.toolResult.example.source.start, 46.125);
    assert.deepEqual(reply.toolResult.example.source.targets, target);
  });
  await test('La notation de la cible en Ré bémol garde les bémols dans l’insertion', async () => {
    const reply = await sendCopilotMessage({ message: 'Insère le 7-3-6 entre le 1 et le 6 en Ré bémol.', context, messages: [] });
    assert.deepEqual(reply.toolResult.example.chords.filter((c) => c.origin === 'source').map((c) => c.name), ['C7#9#11', 'F7#5', 'Bb7sus4']);
  });
  await test('Les données source restent intactes et aucune relance ne dépend du réseau', () => {
    assert.equal(JSON.stringify(fixture), pristine);
    assert.equal(calls, 0);
  });
} finally { global.fetch = oldFetch; }
console.log(`${count}/${count} scénarios de relance passent`);

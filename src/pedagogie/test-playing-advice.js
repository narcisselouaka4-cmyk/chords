import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { takeExample, takeEnvelope, lastAttachedTake } from './take-attachment.js';
import { applyTakeEdit, personalPlayingAnswer, playingProposals, refreshPlayingResult } from './playing-advice.js';

const events = [];
for (const [i, notes] of [[48, 55, 60, 64, 67, 72], [50, 57, 62, 65, 69, 74]].entries()) {
  for (const [j, note] of notes.entries()) events.push(
    { type: 'note_on', note, velocity: .45 + j * .04, channel: 0, time: i * 2 + j * .035 },
    { type: 'note_off', note, velocity: 0, channel: 0, time: i * 2 + 1 + j * .02 },
  );
}
events.push({ type: 'control', controller: 64, value: 127, time: .5 }, { type: 'control', controller: 64, value: 0, time: 1.8 });
events.sort((a, b) => a.time - b.time);
const take = { id: 'source', events, duration: 4 };
const original = structuredClone(take);
const context = { playing: { passage: take } };
const run = (message, messages = []) => personalPlayingAnswer({ message, messages, context, review: true });
let count = 0;
function check(title, test) { test(); count++; console.log(`✓ ${title}`); }

check('La prise rejoue toutes les attaques, nuances, durées et la pédale', () => {
  const example = takeExample(take);
  assert.deepEqual(example.events.filter((e) => e.type === 'noteOn').map((e) => [e.note, e.time, e.velocity]), events.filter((e) => e.type === 'note_on').map((e) => [e.note, e.time, e.velocity]));
  assert.deepEqual(example.events.filter((e) => e.type === 'noteOff').map((e) => [e.note, e.time]), events.filter((e) => e.type === 'note_off').map((e) => [e.note, e.time]));
  assert.deepEqual(example.events.filter((e) => e.type === 'sustain').map((e) => [e.time, e.value]), [[.5, true], [1.8, false]]);
});
check('La prise entière dépasse 60 secondes sans être tronquée', () => {
  const long = takeExample({ events: [...events, { type: 'note_on', note: 80, velocity: .6, time: 125 }, { type: 'note_off', note: 80, time: 126 }], duration: 130 });
  assert.equal(long.beats, 130); assert(long.events.some((e) => e.time === 125));
});
check('L’enveloppe conserve des silences et dépend réellement des notes', () => {
  const envelope = takeEnvelope(take);
  assert(envelope.some((n) => n === 0)); assert(envelope.some((n) => n > .5));
});
check('Un avis sans objectif ne produit aucun compliment, diagnostic ni démonstration', () => {
  const result = run('Qu’en penses-tu de ce que je viens de jouer ?');
  assert.match(result.content, /souhaites-tu/); assert.equal(result.toolResult.example, null);
  assert.doesNotMatch(result.content, /maîtrise|vélocité|ms\b|bonne|fausse/);
});
check('Une exploration déclarée ne devient pas un bilan de niveau', () => {
  assert.match(run('J’ai joué n’importe quoi').content, /exploration/);
});
check('Une source connue fournit des changements contrôlés', () => {
  const proposals = playingProposals(take).proposals;
  assert(proposals.some((p) => p.edit.type === 'remove'));
  assert(proposals.some((p) => p.edit.type === 'replace'));
});
for (const goal of ['Allège mes accords', 'Enrichis mes accords']) check(`${goal} conserve les événements hors du changement`, () => {
  const result = run(goal);
  const advice = result.toolResult.playingAdvice;
  assert(advice);
  assert.equal(result.toolResult.example, null);
  const changed = applyTakeEdit(take, advice.edit);
  if (advice.edit.type === 'remove') assert.equal(changed.events.length, take.events.length - 2);
  else assert.equal(changed.events.length, take.events.length);
  const sourceOn = take.events[advice.edit.on];
  const untouched = take.events.filter((e) => !(e.note === sourceOn.note && e.time >= sourceOn.time && e.time <= sourceOn.time + 1.1));
  for (const event of untouched) assert(changed.events.some((e) => JSON.stringify(e) === JSON.stringify(event)));
  assert.deepEqual(changed.events.filter((e) => e.type === 'control'), take.events.filter((e) => e.type === 'control'));
  assert.deepEqual(take, original);
});
check('L’ajout reprend le timing et la durée d’une note source', () => {
  const changed = applyTakeEdit(take, { type: 'add', on: 0, note: 77 });
  assert.equal(changed.events.length, take.events.length + 2);
  assert.deepEqual(changed.events.filter((e) => e.note === 77).map((e) => e.time), [0, 1]);
});
check('Aucun ajout sur une touche qui sonne déjà, ni hors du clavier', () => {
  assert.equal(applyTakeEdit(take, { type: 'add', on: 0, note: 64 }), null);
  assert.equal(applyTakeEdit(take, { type: 'replace', on: 0, note: 120 }), null);
});
check('L’écoute du conseil compare la source exacte et la variante calculée', () => {
  const result = run('Enrichis mes accords');
  const heard = run('Fais-moi entendre cette proposition', [{ role: 'assistant', ...result }]);
  assert(heard.toolResult.example?.events.length);
  assert.deepEqual(heard.toolResult.originalTake, take);
  assert.equal(heard.autoplay, true);
});
check('Le conseil reste lié à sa source lors d’un suivi', () => {
  const result = run('Enrichis mes accords');
  const other = { ...context, playing: { passage: { events: [{ type: 'note_on', note: 90, velocity: .5, time: 0 }, { type: 'note_off', note: 90, time: 1 }] } } };
  const heard = personalPlayingAnswer({ message: 'Fais-moi entendre cette proposition', messages: [{ role: 'assistant', ...result }], context: other });
  assert.deepEqual(heard.toolResult.originalTake, take);
});
check('Les amas chromatiques ne génèrent pas d’enrichissement arbitraire', () => {
  const cluster = { events: [60, 61, 62, 63, 64, 65, 66].flatMap((note) => [{ type: 'note_on', note, velocity: .7, channel: 0, time: 0 }, { type: 'note_off', note, channel: 0, time: 1 }]).sort((a,b) => a.time - b.time) };
  const result = personalPlayingAnswer({ message: 'Enrichis mes accords', context: { playing: { passage: cluster } } });
  assert.equal(result.toolResult.example, null); assert.match(result.content, /pas assez/);
});
check('L’historique retrouve la dernière prise, même après des questions de suivi', () => {
  assert.deepEqual(lastAttachedTake([{ role: 'user', take }, { role: 'assistant', content: '...' }, { role: 'user', content: 'Explique' }]), take);
});
const real = JSON.parse(readFileSync(new URL('./fixtures/copilot-arpeggiated-take.json', import.meta.url)));
const realCopy = JSON.stringify(real);
const realContext = { playing: { passage: real } };
check('La prise réelle arpégée n’est plus confondue avec un manque de repères', () => {
  const proposals = playingProposals(real);
  assert(proposals.harmonicCount >= 10);
  assert(proposals.proposals.some((p) => p.goal === 'enrich'));
  assert(proposals.proposals.some((p) => p.goal === 'passing'));
  const result = personalPlayingAnswer({ message: 'Un accord de passage ou un accord enrichi pour ma progression ?', context: realContext });
  assert(result.toolResult.playingAdvice);
  assert.doesNotMatch(result.content, /pas assez|repères|indique l’accord/);
});
check('Une demande de passage propose une dominante liée à un accord réellement joué', () => {
  const result = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  assert.match(result.content, /Mi septième/);
  assert.match(result.content, /La mineur/);
  const { edit } = result.toolResult.playingAdvice;
  assert.equal(edit.type, 'passing');
  assert.deepEqual(edit.notes, [52, 62, 68]); // Mi, Ré, Sol# : fondamentale, septième, tierce.
  assert(edit.start > 2.94 && edit.start < 2.99);
  assert(edit.end - edit.start > .65);
  assert(edit.attacks[1] - edit.attacks[0] > .22);
});
check('Seuls deux relâchements d’accompagnement changent ; les attaques et la source restent intactes', () => {
  const result = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  const changed = applyTakeEdit(real, result.toolResult.playingAdvice.edit);
  assert(changed);
  const { edit } = result.toolResult.playingAdvice;
  assert.equal(edit.adjustments.length, 2);
  for (const [i, e] of real.events.entries()) {
    const adjustment = edit.adjustments.find((a) => a.off === i);
    const expected = adjustment ? { ...e, time: adjustment.end } : e;
    assert(changed.events.some((c) => JSON.stringify(c) === JSON.stringify(expected)));
  }
  const added = changed.events.filter((e) => e.type === 'note_on' && !real.events.some((c) => JSON.stringify(c) === JSON.stringify(e)));
  assert.equal(added.length, 3);
  for (const on of added.filter((e) => e.type === 'note_on')) {
    const off = changed.events.find((e) => e.type === 'note_off' && e.note === on.note && e.time > on.time);
    assert(off && off.time > on.time && off.time < 3.66);
  }
  assert.equal(JSON.stringify(real), realCopy);
});
check('La démonstration du passage est préparée depuis la prise réelle', () => {
  const result = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  const heard = personalPlayingAnswer({ message: 'Fais-moi entendre cette proposition', context: realContext, messages: [{ role: 'assistant', ...result }] });
  assert.equal(heard.toolResult.example.noteCount, 87);
  assert.equal(heard.toolResult.example.beats, real.duration);
  assert.deepEqual(heard.toolResult.originalTake, real);
});
check('Une demande d’enrichissement conserve l’arpège réel au-delà de 250 ms', () => {
  const result = personalPlayingAnswer({ message: 'Enrichis mes accords', context: realContext });
  assert(result.toolResult.playingAdvice);
  const changed = applyTakeEdit(real, result.toolResult.playingAdvice.edit);
  assert(changed);
  assert.deepEqual(changed.events.map((e) => e.time), real.events.map((e) => e.time));
});
check('Une pédale tenue ou l’absence de transition n’entraînent pas d’accord ajouté arbitraire', () => {
  const withPedal = { ...real, events: [{ type: 'control', controller: 64, value: 127, time: 0 }, ...real.events] };
  assert.equal(playingProposals(withPedal).proposals.filter((p) => p.goal === 'passing').length, 0);
  const chord = { events: events.filter((e) => e.time < 1.8), duration: 1.8 };
  assert.equal(playingProposals(chord).proposals.filter((p) => p.goal === 'passing').length, 0);
});
const prose = [
  { role: 'user', content: 'Un accord de passage ou un accord enrichi pour ma progression ?', take: real },
  { role: 'assistant', content: 'Essaie E7 avant Am7 pour préparer cet accord.' },
];
for (const message of ['Fais-moi entendre un exemple.', 'Fais-moi une démonstration', 'Écoute un exemple avec E7 → Am7', 'Fais-moi écouter Mi septième avant La mineur 7']) check(`La demande réelle « ${message} » fournit et démarre la démonstration`, () => {
  const result = personalPlayingAnswer({ message, messages: prose, context: realContext });
  assert(result.toolResult.example?.events.length);
  assert.equal(result.autoplay, true);
  assert.deepEqual(result.toolResult.originalTake, real);
  assert.equal(result.toolResult.playingAdvice.edit.type, 'passing');
  assert.doesNotMatch(result.content, /Quel changement souhaites/);
});
check('Le conseil survit à une réponse intermédiaire sans données de démonstration', () => {
  const advice = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  const result = personalPlayingAnswer({ message: 'Fais-moi une démonstration', context: realContext, messages: [
    { role: 'assistant', ...advice }, { role: 'user', content: 'Tu peux me le montrer ?' },
    { role: 'assistant', content: 'Quel changement souhaites-tu entendre ?' },
  ] });
  assert.equal(result.toolResult.playingAdvice.id, advice.toolResult.playingAdvice.id);
  assert(result.autoplay);
});
check('Un ancien placement sauvegardé est recalculé avant sa nouvelle écoute', () => {
  const old = { role: 'assistant', toolResult: { playingAdvice: { id: 'passing-31', goal: 'passing',
    take: real, text: 'Ancienne proposition', edit: { type: 'passing', on: 31, start: 3.3803, end: 3.635, notes: [52, 62, 68] } } } };
  const result = personalPlayingAnswer({ message: 'Fais-moi entendre cette proposition', messages: [old], context: realContext });
  assert.equal(result.toolResult.playingAdvice.edit.timingVersion, 2);
  assert(result.toolResult.playingAdvice.edit.start < 3);
  assert(result.autoplay);
});
check('Un enchaînement nommé indisponible ne se change pas silencieusement en un autre', () => {
  const result = personalPlayingAnswer({ message: 'Écoute un exemple avec tritone sub Db7 → G7b9', messages: prose, context: realContext });
  assert.equal(result.toolResult.example, null);
  assert.match(result.content, /enchaînement précis/);
  assert.doesNotMatch(result.content, /Quel changement souhaites/);
  assert(result.suggestedActions.length);
});
check('« Et maintenant ? » reprend la demande de la conversation plutôt que de la confier au modèle', () => {
  const result = personalPlayingAnswer({ message: 'et maintenant ?', messages: prose, context: realContext });
  assert(result.toolResult.playingAdvice);
  assert.equal(result.autoplay, false);
});
check('Le passage débute au contretemps estimé et laisse l’arrivée ainsi que la mélodie à leur place', () => {
  const result = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  const { edit } = result.toolResult.playingAdvice;
  const before = real.events.find((e) => e.type === 'note_on' && e.note === 59).time;
  const arrival = real.events.find((e) => e.type === 'note_on' && e.note === 57).time;
  const beat = (arrival - before) / 4;
  assert(Math.abs((edit.start - before) / beat - 2.5) < .001);
  const changed = applyTakeEdit(real, edit);
  const melody = real.events.filter((e) => e.note >= 72);
  for (const e of melody) assert(changed.events.some((c) => JSON.stringify(c) === JSON.stringify(e)));
  assert(changed.events.some((e) => e.type === 'note_on' && e.note === 57 && e.time === arrival));
  for (const a of edit.adjustments) assert(real.events[a.off].type === 'note_off' && a.end < real.events[a.off].time);
});
check('Le placement et le déroulement suivent un changement de tempo de la prise', () => {
  const base = playingProposals(real).proposals.find((p) => p.goal === 'passing').edit;
  for (const factor of [.8, 1.25]) {
    const scaled = { ...real, duration: real.duration * factor, events: real.events.map((e) => ({ ...e, time: e.time * factor })) };
    const result = personalPlayingAnswer({ message: 'Propose un accord de passage', context: { playing: { passage: scaled } } });
    const edit = result.toolResult.playingAdvice.edit;
    assert(Math.abs(edit.start - base.start * factor) < .02);
    for (const [i, t] of edit.attacks.entries()) assert(Math.abs(t - base.attacks[i] * factor) < .02);
  }
});
check('Une demande de rejeu original reste sur le chemin de rejeu exact', () => {
  assert.equal(personalPlayingAnswer({ message: 'Rejoue ma prise', context: realContext, messages: prose }), null);
  assert.equal(personalPlayingAnswer({ message: 'Explique-moi le rôle du Mi', context: realContext }), null);
});
check('Un jeu fortement irrégulier ne reçoit pas de contretemps artificiellement comprimé', () => {
  const warp = (t) => t < 3.66 ? t * .5 : 1.83 + (t - 3.66) * 1.6;
  const irregular = { ...real, duration: warp(real.duration), events: real.events.map((e) => ({ ...e, time: warp(e.time) })) };
  const proposed = playingProposals(irregular).proposals.filter((p) => p.goal === 'passing');
  assert(!proposed.some((p) => p.edit.on === 31));
});
check('Une relance conserve un enchaînement nommé indisponible au lieu de rejouer un ancien conseil', () => {
  const old = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  const named = 'Écoute un exemple avec tritone sub Db7 → G7b9';
  const result = personalPlayingAnswer({ message: 'Fais-moi une démonstration', context: realContext, messages: [
    { role: 'assistant', ...old }, { role: 'user', content: named },
    { role: 'assistant', content: 'Cet enchaînement précis n’est pas disponible.' },
  ] });
  assert.equal(result.toolResult.example, null);
  assert.match(result.content, /enchaînement précis/);
});
check('Le bouton Play d’une ancienne carte recalcule son exemple sans modifier les données sauvegardées', () => {
  const old = { example: { events: [] }, playingAdvice: { id: 'passing-31', goal: 'passing', take: real,
    edit: { type: 'passing', on: 31, start: 3.3803, end: 3.635, notes: [52, 62, 68] } } };
  const copy = structuredClone(old);
  const updated = refreshPlayingResult(old);
  assert(updated.example.events.some((e) => e.type === 'noteOn' && e.note === 52 && e.time < 3));
  assert.equal(updated.playingAdvice.edit.timingVersion, 2);
  assert.deepEqual(old, copy);
});
check('Une nouvelle intention explicite prime sur un ancien conseil lors de l’écoute suivante', () => {
  const old = personalPlayingAnswer({ message: 'Propose un accord de passage', context: realContext });
  const result = personalPlayingAnswer({ message: 'Fais-moi une démonstration', context: realContext, messages: [
    { role: 'assistant', ...old }, { role: 'user', content: 'Enrichis mes accords' },
    { role: 'assistant', content: 'Essayons un enrichissement.' },
  ] });
  assert.equal(result.toolResult.playingAdvice.goal, 'enrich');
  assert(result.autoplay);
});
console.log(`${count}/${count} vérifications réussies`);

// Tests — le jeu d'accompagnement gospel / worship du Copilote (12/11/2026).
// Narcisse : « Copilote joue comme dans les démonstrations de l'exercice […] un pianiste joue de
// différentes façons. Ce manque de diversité fait que l'accompagnement n'est pas top. »
// Ce qui se vérifie sans oreille : diversité (entre mesures, entre demandes), jouabilité des deux
// mains, fidélité aux accords demandés, même graine = même jeu. La qualité musicale reste à écouter.
//
// Usage : node src/pedagogie/test-gospel-comping.js

import assert from 'node:assert/strict';
import { buildExampleChords, buildChordExample } from './copilot-demo.js';
import { buildGospelComping, seedOf } from './gospel-comping.js';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); } catch (err) { failed += 1; console.error(`✗ ${name}\n  ${err.message}`); }
}
const pc = (n) => ((n % 12) + 12) % 12;
const GRIDS = [
  ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7'],
  ['Fmaj7', 'Em7', 'A7', 'Dm7', 'G7', 'Cmaj7'],
  ['Abmaj7', 'Fm7', 'Bbm7', 'Eb7', 'Abmaj7'],
  ['C', 'G', 'Am', 'F'],
  ['Dm7', 'G7', 'Cmaj7', 'A7', 'Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'G7', 'Cmaj7'],
];
const takes = (names, feel = 'gospel', count = 8) => Array.from({ length: count }, (_, v) => buildGospelComping(buildExampleChords(names, { technique: 'auto' }), { seed: seedOf(names, v), feel }));
const signature = (r) => JSON.stringify(r.events.filter((e) => e.type !== 'step').map((e) => [e.time, e.type, e.note]));

check('Huit demandes de la même grille : huit jeux différents', () => {
  for (const names of GRIDS) assert.equal(new Set(takes(names).map(signature)).size, 8, names.join(' '));
});

check('Même graine : exactement le même jeu (l’exemple gardé ne change pas)', () => {
  const names = GRIDS[0];
  const a = buildGospelComping(buildExampleChords(names, {}), { seed: seedOf(names, 3) });
  const b = buildGospelComping(buildExampleChords(names, {}), { seed: seedOf(names, 3) });
  assert.equal(signature(a), signature(b));
});

check('Jamais le même geste deux mesures de suite, ni à la main gauche ni à la main droite', () => {
  for (const names of GRIDS) for (const r of takes(names)) {
    const body = r.bars.slice(0, -1);
    const base = (label) => label.replace(/, puis basse qui marche$/, '');
    for (let i = 1; i < body.length; i += 1) {
      assert.notEqual(base(body[i].left), base(body[i - 1].left), `${names.join(' ')} mesure ${i} main gauche`);
      if (!/en avance/.test(body[i].right) && !/en avance/.test(body[i - 1].right)) assert.notEqual(body[i].right, body[i - 1].right, `${names.join(' ')} mesure ${i} main droite`);
    }
  }
});

check('Une grille de cinq accords et plus emploie au moins quatre gestes différents', () => {
  for (const names of GRIDS.filter((g) => g.length >= 5)) for (const r of takes(names)) assert.ok(r.gestures.length >= 4, `${names.join(' ')} : ${r.gestures.join(' ; ')}`);
});

check('Sur l’ensemble des demandes, tout le vocabulaire sert (basse qui marche, coquille, contretemps, anticipation, retard, passage, fins)', () => {
  const all = new Set(GRIDS.flatMap((names) => takes(names, 'gospel', 12).flatMap((r) => r.gestures)));
  for (const g of ['basse qui marche', 'coquille fondamentale–quinte–septième', 'basse relancée', 'fondamentale, quinte, octave', 'contretemps', 'anticipation', 'retard 4–3', 'broderie vers la tierce', 'renversement qui monte', 'réponse dans l’aigu', 'accord de passage diminué', 'montée finale', 'retombée arpégée', 'accord large tenu']) {
    assert.ok(all.has(g), `geste jamais joué : ${g}`);
  }
});

check('Jouable : chaque main tient dans une octave, cinq doigts au plus, aucune touche redoublée', () => {
  for (const names of GRIDS) for (const feel of ['gospel', 'worship']) for (const r of takes(names, feel)) {
    const active = { lh: new Map(), rh: new Map() };
    for (const e of r.events) {
      if (e.type === 'step') continue;
      const hand = active[e.hand];
      if (e.type === 'noteOn') { assert.ok(!hand.has(e.note), `touche ${e.note} réattaquée sans être relâchée (${names.join(' ')})`); hand.set(e.note, e.time); } else hand.delete(e.note);
      const notes = [...hand.keys()];
      if (notes.length) {
        assert.ok(Math.max(...notes) - Math.min(...notes) <= 12, `main ${e.hand} trop ouverte à ${e.time} : ${notes} (${names.join(' ')})`);
        assert.ok(notes.length <= 5, `main ${e.hand} : ${notes.length} notes`);
      }
    }
    assert.equal(active.lh.size + active.rh.size, 0, 'toutes les notes sont relâchées');
    // Les mains ne se croisent pas.
    const lhTop = Math.max(...r.events.filter((e) => e.type === 'noteOn' && e.hand === 'lh').map((e) => e.note));
    const rhLow = Math.min(...r.events.filter((e) => e.type === 'noteOn' && e.hand === 'rh').map((e) => e.note));
    assert.ok(lhTop <= rhLow + 12, 'registres cohérents');
  }
});

check('Fidèle aux accords : chaque mesure commence sur la fondamentale à la basse, et la main droite joue l’accord demandé', () => {
  for (const names of GRIDS) for (const r of takes(names)) {
    const chords = buildExampleChords(names, {});
    const steps = r.events.filter((e) => e.type === 'step');
    assert.equal(steps.length, names.length);
    chords.forEach((chord, i) => {
      const t = steps[i].time;
      const firstBass = r.events.find((e) => e.type === 'noteOn' && e.hand === 'lh' && e.time >= t - 0.001 && e.time < t + 0.3);
      assert.ok(firstBass && pc(firstBass.note) === pc(chord.rootPc), `${names[i]} : basse ${firstBass?.note}`);
      // Les notes de l'accord (voicing de l'application) sonnent pendant la mesure, à la main droite.
      const voiced = new Set(chord.notes.map(pc));
      const heard = new Set(r.events.filter((e) => e.type === 'noteOn' && e.hand === 'rh' && e.time >= t - 0.6 && e.time < t + 2.1).map((e) => pc(e.note)));
      const shared = [...voiced].filter((p) => heard.has(p)).length;
      assert.ok(shared >= Math.min(3, voiced.size) - 1, `${names[i]} : ${shared} notes de l’accord entendues sur ${voiced.size}`);
    });
  }
});

check('Worship : plus sobre (ni broderie, ni retard, ni accord de passage diminué)', () => {
  for (const r of GRIDS.flatMap((names) => takes(names, 'worship'))) {
    assert.ok(!r.gestures.some((g) => /broderie|retard|diminué|coquille/.test(g)), r.gestures.join(' ; '));
  }
});

check('Exemple du Copilote : une progression gospel reçoit ce jeu, et sa carte dit les gestes joués', () => {
  const ex = buildChordExample(['Cmaj7', 'Am7', 'Dm7', 'G7'], { styleId: 'gospel', variation: 2 });
  assert.equal(ex.kind, 'progression');
  assert.match(ex.subtitle, /^Gospel · 4 accords · /);
  assert.equal(ex.comping.bars.length, 4);
  assert.deepEqual(ex.chords.map((c) => c.name), ['Cmaj7', 'Am7', 'Dm7', 'G7']);
  assert.notEqual(JSON.stringify(ex.events), JSON.stringify(buildChordExample(['Cmaj7', 'Am7', 'Dm7', 'G7'], { styleId: 'gospel', variation: 3 }).events));
});

check('Un accord seul, un jeu plaqué, une technique demandée ou le jazz gardent leur rendu d’avant', () => {
  assert.ok(!buildChordExample(['Cmaj7'], { styleId: 'gospel' }).comping);
  assert.ok(!buildChordExample(['Cmaj7', 'Am7'], { styleId: 'gospel', pattern: 'block' }).comping);
  assert.ok(!buildChordExample(['Cmaj7', 'Am7'], { styleId: 'gospel', technique: 'drop2' }).comping);
  assert.ok(!buildChordExample(['Dm7', 'G7', 'Cmaj7'], { styleId: 'jazz' }).comping);
});

// ── Dans le Copilote ──
global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'TEST-ONLY', baseUrl: 'https://example.test/v1', model: 'mock' }));
const { sendCopilotMessage } = await import('./copilot-client.js');
let replies = [];
global.fetch = async () => {
  const message = replies.shift() || { content: 'Voilà.' };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', ...message }, finish_reason: 'stop' }] }) };
};
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const progression = { id: 'p', type: 'function', function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7'], styleId: 'gospel' }) } };
replies = [{ content: 'Une grille gospel en Do.', tool_calls: [progression] }];
const first = await quiet(() => sendCopilotMessage({ message: 'Joue-moi une progression gospel en Do', messages: [] }));
replies = [{ content: 'Autrement.' }];
const history = [{ role: 'user', content: 'Joue-moi une progression gospel en Do' }, { role: 'assistant', content: first.content, toolResult: first.toolResult }];
const second = await quiet(() => sendCopilotMessage({ message: 'Joue-la d’une autre façon', messages: history }));

check('Copilote : « progression gospel » → le jeu riche, et le bouton « Une autre façon de la jouer »', () => {
  assert.ok(first.toolResult.example?.comping, 'jeu gospel');
  assert.ok((first.suggestedActions || []).some((a) => a.message === 'Joue-la d’une autre façon'), JSON.stringify(first.suggestedActions));
});

check('Copilote : « Joue-la d’une autre façon » → les mêmes accords, joués autrement', () => {
  assert.ok(second.toolResult.example?.comping);
  assert.equal(second.toolResult.example.title, first.toolResult.example.title);
  assert.notEqual(JSON.stringify(second.toolResult.example.events), JSON.stringify(first.toolResult.example.events));
});

// Essai réel du 12/11 : le modèle ajoute pattern « block » de lui-même à une demande gospel.
replies = [{ content: 'Voici.', tool_calls: [{ id: 'b', type: 'function', function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7'], pattern: 'block' }) } }] }];
const blocked = await quiet(() => sendCopilotMessage({ message: 'joue moi une progression gospel en Do : Cmaj7 Am7 Dm7 G7 Cmaj7', messages: [] }));
replies = [{ content: 'Voici.', tool_calls: [{ id: 'c', type: 'function', function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Cmaj7', 'Am7', 'Dm7', 'G7'], pattern: 'block', styleId: 'gospel' }) } }] }];
const plaque = await quiet(() => sendCopilotMessage({ message: 'joue moi Cmaj7 Am7 Dm7 G7 en accords plaqués', messages: [] }));
check('Le style dit par le pianiste prime : « progression gospel » n’est jamais jouée plaquée par choix du modèle', () => {
  assert.ok(blocked.toolResult.example?.comping, blocked.toolResult.example?.subtitle);
  assert.match(blocked.toolResult.example.subtitle, /^Gospel · 5 accords/);
});
check('… et « en accords plaqués » reste plaqué', () => {
  assert.ok(!plaque.toolResult.example?.comping);
  assert.match(plaque.toolResult.example.subtitle, /^Plaqué/);
});

// Modèle indisponible (quota) : la progression écrite et « une autre façon » sont jouées quand même.
global.fetch = async () => ({ ok: false, status: 429, headers: { get: () => '30' }, text: async () => JSON.stringify({ error: { message: 'Rate limit reached on tokens per day (TPD)' } }) });
const offline = await quiet(() => sendCopilotMessage({ message: 'joue moi une progression gospel : Cmaj7 Am7 Dm7 G7 Cmaj7', messages: [] }));
const offlineAgain = await quiet(() => sendCopilotMessage({ message: 'Joue-la d’une autre façon', messages: history }));
const needsModel = await quiet(() => sendCopilotMessage({ message: 'Pourquoi le gospel utilise des accords de passage ?', messages: [] }));
check('Modèle indisponible : progression gospel écrite et « une autre façon » jouées par l’application, et c’est dit', () => {
  assert.ok(offline.ok && offline.toolResult.example?.comping, offline.error);
  assert.match(offline.content, /Sans commentaire cette fois : le service d’IA est saturé/);
  assert.ok(offlineAgain.ok && offlineAgain.toolResult.example?.comping);
  assert.equal(needsModel.ok, false);
});

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed ? 1 : 0);

// [Claude] — 2026-10-14 — Tests de guide-summaries.js (étapes du tuto résumées en français).
// node src/pedagogie/test-guide-summaries.js
import { guideSignature, needsSummaries, summaryMessages, parseSummaries, applySummaries } from './guide-summaries.js';

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else { failed += 1; console.log(`  ✗ ${name} ${detail}`); }
};

const guide = {
  parts: [{ id: 'p1', keyName: 'Ré♭ majeur', progression: { chords: [{ degree: '2', name: 'Ebm9' }, { degree: '4', name: 'Gbmaj9' }] } }],
  steps: [
    { id: 's1', kind: 'talk', start: 0, end: 12, title: 'Il explique', summary: 'Il parle sans jouer.', chords: [], said: ['So today we are going to play any worship song in the key of D flat.'] },
    { id: 's2', kind: 'lh', start: 12, end: 20, title: 'Main gauche seule', summary: '…', chords: [{ name: 'Gbmaj9' }, { name: 'Sol♭3 Ré♭4', notes: true }], said: [] },
  ],
};

console.log('La demande');
check('des paroles à comprendre : on demande', needsSummaries(guide));
check('sans paroles : on ne demande rien', !needsSummaries({ steps: [{ ...guide.steps[1] }] }));
const msgs = summaryMessages(guide);
check('deux messages : la consigne, puis les étapes', msgs.length === 2 && msgs[0].role === 'system' && msgs[1].role === 'user');
check('la consigne : français, rien d\'ajouté, JSON seul', /français/.test(msgs[0].content) && /N'ajoute aucune note/.test(msgs[0].content) && /JSON seul/.test(msgs[0].content));
check('les étapes : mains, accords (pas les notes en vrac), paroles', /main gauche seule/.test(msgs[1].content) && /Gbmaj9/.test(msgs[1].content) && !/Sol♭3 Ré♭4/.test(msgs[1].content) && /D flat/.test(msgs[1].content));
check('la signature suit le découpage', guideSignature(guide) === 's1@0-12:talk|s2@12-20:lh' && guideSignature(null) === '');

console.log('La réponse');
const answer = '```json\n{"steps":[{"id":"s1","titre":"Présentation : la tonalité de Ré♭","resume":"Il annonce qu\'on va jouer un chant de louange en Ré♭ majeur."},{"id":"s9","titre":"Inventé","resume":"…"}]}\n```';
const parsed = parseSummaries(answer, guide);
check('lue même entourée de ```json', parsed.s1?.title === 'Présentation : la tonalité de Ré♭');
check('une étape inconnue est ignorée', !parsed.s9);
check('du texte sans JSON : rien', Object.keys(parseSummaries('Désolé, je ne peux pas.', guide)).length === 0);
const long = parseSummaries(JSON.stringify({ steps: [{ id: 's2', titre: '**Gras** '.repeat(20), resume: 'x'.repeat(500) }] }), guide);
check('le # d\'un accord reste (A7#9)', parseSummaries('{"steps":[{"id":"s1","titre":"## A7#9","resume":"x"}]}', guide).s1.title === 'A7#9');
check('textes nettoyés et bornés', long.s2.title.length <= 60 && !/\*/.test(long.s2.title) && long.s2.summary.length <= 200);

console.log('Le guide en français');
const fr = applySummaries(guide, parsed);
check('le titre et la phrase sont remplacés, l\'original gardé', fr.steps[0].title === 'Présentation : la tonalité de Ré♭' && fr.steps[0].autoTitle === 'Il explique' && fr.steps[0].translated);
check('les autres étapes ne bougent pas', fr.steps[1] === guide.steps[1]);
check('rien à appliquer : le même guide', applySummaries(guide, {}) === guide);

console.log(`\n${passed} réussis, ${failed} échoués`);
if (failed) process.exitCode = 1;

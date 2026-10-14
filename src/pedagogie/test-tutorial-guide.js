// [Claude] — 2026-10-14 — Tests du guide d'un tuto (tutorial-guide.js).
// node src/pedagogie/test-tutorial-guide.js
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildTutorialGuide, findMovements, normalizeDegree, guideLines, finalRealized, voicingHands, movementKindText, clock,
} from './tutorial-guide.js';
import { labelNotes } from './chord-labeling.js';
import { executeToolCalls, tutorialToolCalls } from './copilot-client.js';
import { parseTutorialRequest } from './tutorial-questions.js';

const here = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(here(name), 'utf8'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else { failed += 1; console.log(`  ✗ ${name} ${detail}`); }
};
const N = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const names = (list) => list.map((m) => `${N[m % 12]}${Math.floor(m / 12) - 1}`).join(' ');

// ── « Next Level Worship » (relevé réel, lu à l'image : clavier qui n'allume qu'à la frappe) ──────
console.log('Next Level Worship : les parties');
const nlw = load('next-level-worship.json');
const g = buildTutorialGuide({ segments: nlw.segments, noteEvents: nlw.noteEvents, duration: nlw.duration });
check('deux parties : en Do, puis en Ré♭', g.parts.length === 2 && g.parts[0].keyName === 'Do majeur' && g.parts[1].keyName === 'Ré♭ majeur', g.parts.map((p) => p.keyName).join(' / '));
check('la partie en Ré♭ commence vers 1:08', Math.abs(g.parts[1].start - 68) < 1.5, clock(g.parts[1].start));
const loops = g.parts.map((p) => p.progression.chords.map((c) => c.degree).join(' – '));
check('la même boucle 2 – 4 – 6 – 1 dans les deux tonalités', loops.every((l) => l === '2 – 4 – 6 – 1'), loops.join(' / '));
check('la deuxième partie dit que c\'est la même progression', g.parts[1].sameAs === 'p1');
check('Ré♭ : Ebm9 – Gbmaj9 – Bbm9 – Db…', /^Ebm9 Gbmaj9 Bbm9 Db/.test(g.parts[1].progression.chords.map((c) => c.name).join(' ')), g.parts[1].progression.chords.map((c) => c.name).join(' '));

console.log('Next Level Worship : les étapes');
const kinds = new Set(g.steps.map((s) => s.kind));
check('il montre la main droite seule, la main gauche seule, tout ensemble, et parle', ['rh', 'lh', 'both', 'talk'].every((k) => kinds.has(k)), [...kinds].join(' '));
const lhStep = g.steps.find((s) => s.kind === 'lh' && s.start > 165 && s.start < 175);
check('2:50 : la main gauche seule, sous Gbmaj9 · Bbm9 · Dbmaj9', lhStep && lhStep.chords.map((c) => c.name).join(' ') === 'Gbmaj9 Bbm9 Dbmaj9', lhStep && lhStep.chords.map((c) => c.name).join(' '));
const together = g.steps.find((s) => s.complete && s.start > 180);
check('3:08 : « Tout ensemble », la progression complète', together && Math.abs(together.start - 188.75) < 0.5 && together.title === 'Tout ensemble', together && `${clock(together.start)} ${together.title}`);
check('chaque étape a un titre et une phrase', g.steps.every((s) => s.title && s.summary));

console.log('Next Level Worship : le résultat final');
const fin = g.parts[1].final;
check('joué d\'un trait de 3:08 à 3:35', fin.source === 'together' && Math.abs(fin.start - 188.75) < 0.5 && Math.abs(fin.end - 215.25) < 0.5, `${fin.source} ${clock(fin.start)}–${clock(fin.end)}`);
const byName = Object.fromEntries(fin.chords.map((c) => [c.name, c]));
// La main gauche montrée seule (2:50) est le bas du voicing ; Mi♭m9 prend la même forme
// (fondamentale – quinte – septième), qu'il ne montre pas seule.
check('Gbmaj9 : main gauche Sol♭ Ré♭ Fa (montrée seule) | main droite La♭ Si♭ Fa', names(byName.Gbmaj9.lh) === 'Gb3 Db4 F4' && names(byName.Gbmaj9.rh) === 'Ab4 Bb4 F5', `${names(byName.Gbmaj9.lh)} | ${names(byName.Gbmaj9.rh)}`);
check('Ebm9 : main gauche Mi♭ Si♭ Ré♭ (même forme) | main droite Fa Sol♭ Ré♭', names(byName.Ebm9.lh) === 'Eb3 Bb3 Db4' && names(byName.Ebm9.rh) === 'F4 Gb4 Db5', `${names(byName.Ebm9.lh)} | ${names(byName.Ebm9.rh)}`);
check('Dbmaj9 : le voicing du premier tour (pas la fioriture de fin)', byName.Dbmaj9 && names(byName.Dbmaj9.midis) === 'Db4 Ab4 C5 Eb5 F5 C6', Object.keys(byName).join(' '));
const real = finalRealized(fin, { cycles: 2 });
check('à écouter : deux tours, chaque main à sa place', real.length === 8 && real[0].leftHand.length === 3 && real[0].rightHand.length === 3);
check('une main seule à écouter', finalRealized(fin, { hand: 'rh' }).every((c) => !c.leftHand.length && c.rightHand.length));

console.log('Next Level Worship : les mouvements');
const mod = g.movements.find((m) => m.kinds.includes('modulation'));
check('le passage de Do à Ré♭ (par Edim/Si♭)', mod && mod.from.name === 'Cmaj9' && mod.to.name === 'Ebm9' && /Do majeur → Ré♭ majeur/.test(movementKindText(mod)), mod && movementKindText(mod));
const r24 = findMovements(g, '2', '4');
check('du 2 au 4 : montré (en Do et en Ré♭)', r24.direct.length >= 2);
const r16 = findMovements(g, 'I', 'vi');
check('du 1 au 6 : pas montré directement…', r16.direct.length === 0);
check('… mais sa boucle y va par le 2 et le 4', r16.routes.some((r) => r.path.map((c) => c.degree).join(' ') === '1 2 4 6'), r16.routes.map((r) => r.path.map((c) => c.degree).join(' ')).join(' / '));
const lines = guideLines(g).join('\n');
check('le Copilote reçoit les parties, le résultat final et les mouvements', /Partie 2 — Ré♭ majeur/.test(lines) && /Résultat final/.test(lines) && /play_final_result/.test(lines) && /Mouvements harmoniques/.test(lines));
check('… et la consigne de ne rien inventer', /N'invente pas/.test(lines));

console.log('Next Level Worship : le Copilote fait entendre le résultat final');
const call = (args) => [{ id: 'c1', type: 'function', function: { name: 'play_final_result', arguments: JSON.stringify(args) } }];
const tut = { guide: g, noteEvents: nlw.noteEvents, key: null };
const played = executeToolCalls(call({}), 'Voici le résultat.', { tutorial: tut });
check('play_final_result : un exemple (ses notes, de 3:08)', played.example && played.example.events.length > 100 && /Ré♭ majeur/.test(played.example.title), played.example && played.example.title);
const lhOnly = executeToolCalls(call({ part: 'p2', hand: 'LH', transposeTo: 'C' }), '', { tutorial: tut });
const ons = (lhOnly.example?.events || []).filter((e) => e.type === 'noteOn').map((e) => e.note);
check('… main gauche seule, transposée en Do (Ré2 La2 Do3 pour Mi♭m9)', ons.slice(0, 3).join(' ') === '50 57 60', ons.slice(0, 6).join(' '));
const ask = parseTutorialRequest('Joue le résultat final.');
const forced = tutorialToolCalls(ask, [], { ...tut, moment: { start: 0, end: 30 } });
check('« Joue le résultat final » : l\'outil est appelé même si le modèle l\'oublie', ask?.kind === 'final' && forced?.[0]?.function?.name === 'play_final_result');
const askLh = parseTutorialRequest('Fais-moi entendre le résultat final en Do, main gauche');
check('… en Do, main gauche', askLh?.kind === 'final' && askLh.hand === 'LH' && /Do/.test(askLh.key || ''), JSON.stringify(askLh));
const none = executeToolCalls(call({}), '', { tutorial: { guide: null } });
check('sans guide : rien ne joue, et il le dit', !none.example && /pas pu être reconstitué/.test(none.content || ''), none.content);

// ── Un tuto qui ne joue jamais tout ensemble : le résultat est assemblé ─────────────────────────────
console.log('Assemblé (main droite, puis main gauche, jamais ensemble)');
// Do : Dm9 – G13 – Cmaj9, main droite seule (0 → 9 s), main gauche seule (12 → 21 s), et la
// version complète une fois au début (pour que l'application connaisse les voicings complets).
const seg = (start, end, midis) => ({ start, end, midis, chord: labelNotes(midis) });
const DM9 = [38, 45, 48, 53, 57, 64];   // Ré2 La2 Do3 | Fa3 La3 Mi4
const G13 = [31, 41, 47, 52, 57, 64];   // Sol1 Fa2 Si2 | Mi3 La3 Mi4
const CMAJ9 = [36, 43, 47, 50, 55, 64]; // Do2 Sol2 Si2 | Ré3 Sol3 Mi4
const assembledSegs = [
  seg(0, 3, DM9.slice(3)), seg(3, 6, G13.slice(3)), seg(6, 9, CMAJ9.slice(3)),          // main droite seule
  seg(12, 15, DM9.slice(0, 3)), seg(15, 18, G13.slice(0, 3)), seg(18, 21, CMAJ9.slice(0, 3)), // main gauche seule
  seg(26, 28, DM9), seg(28, 30, G13), seg(30, 32, CMAJ9),                                // une fois tout ensemble, vite
  seg(32, 34, DM9), seg(34, 36, G13), seg(36, 38, CMAJ9),
];
const ga = buildTutorialGuide({ segments: assembledSegs, duration: 40 });
check('les étapes : main droite, main gauche, deux mains', ga.steps.filter((s) => s.kind !== 'talk').map((s) => s.kind).join(' ') === 'rh lh both', ga.steps.map((s) => s.kind).join(' '));
check('la boucle 2 – 5 – 1', ga.parts[0].progression.chords.map((c) => c.degree).join(' – ') === '2 – 5 – 1', ga.parts[0].progression.chords.map((c) => c.degree).join(' – '));
const fa = ga.parts[0].final;
check('résultat final : chaque accord, main gauche + main droite', fa && fa.chords.every((c) => c.lh.length === 3 && c.rh.length === 3), fa && fa.chords.map((c) => `${names(c.lh)} | ${names(c.rh)}`).join(' / '));

const onlyParts = [
  seg(0, 3, DM9.slice(3)), seg(3, 6, G13.slice(3)), seg(6, 9, CMAJ9.slice(3)),
  seg(12, 15, DM9.slice(0, 3)), seg(15, 18, G13.slice(0, 3)), seg(18, 21, CMAJ9.slice(0, 3)),
];
const gp = buildTutorialGuide({ segments: onlyParts, duration: 24 });
check('sans version complète : pas de résultat inventé sans boucle', gp && gp.parts.every((p) => !p.final || p.final.source === 'assembled'));

// ── Les mains d'un voicing ────────────────────────────────────────────────────────────────────
console.log('Les mains d\'un voicing');
const shown = [{ hand: 'lh', midis: [54, 61, 65] }];
const vh = voicingHands([54, 61, 65, 68, 70, 77], shown);
check('la main gauche montrée seule en est le bas', names(vh.lh) === 'Gb3 Db4 F4' && names(vh.rh) === 'Ab4 Bb4 F5');
const notBottom = voicingHands([47, 50, 55, 57, 64], [{ hand: 'lh', midis: [47, 64] }]);
check('une « main gauche » qui n\'est pas le bas du voicing n\'est pas reprise', !notBottom.shown);
check('la forme de main gauche se reprend (quinte, septième)', names(voicingHands([51, 58, 61, 65, 66, 73], [], [[0, 7, 11]]).lh) === 'Eb3 Bb3 Db4');

// ── Degrés ────────────────────────────────────────────────────────────────────────────────────
console.log('Degrés');
check('« 1 », « I », « vi », « b7 », « ♭7 »', normalizeDegree('1') === '1' && normalizeDegree('I') === '1' && normalizeDegree('vi') === '6' && normalizeDegree('b7') === 'b7' && normalizeDegree('♭7') === 'b7' && normalizeDegree('IV') === '4');
check('n\'importe quoi : rien', normalizeDegree('accord') === null);

// ── Rôles supposés (intro / couplet / mouvement) ────────────────────────────────────────────
console.log('Rôles supposés');
{
  const byStart = (t) => g.steps.find((st) => t >= st.start && t < st.end);
  check('chaque étape porte un rôle avec sa raison ; tout est une hypothèse sauf « il parle »',
    g.steps.every((st) => st.role && st.role.label && st.role.why && st.role.guess === (st.role.id !== 'explain')));
  check('la première chose jouée, avant d\'être décomposée : l\'intro', byStart(3).role.id === 'intro', byStart(3).role.id);
  check('une main seule : construction', byStart(10).role.id === 'build' && byStart(25).role.id === 'build');
  check('les deux mains après les mains séparées : assemblage', byStart(50).role.id === 'assembly', byStart(50).role.id);
  check('la reprise en Ré♭ : changement de tonalité', byStart(70).role.id === 'modulation' && /Ré♭/.test(byStart(70).role.why));
  check('3:08 – 3:35 (le passage que Narcisse n\'arrivait pas à reproduire) : assemblage', byStart(200).role.id === 'assembly', byStart(200).role.id);
  check('il parle à la toute fin : conclusion', byStart(225).role.id === 'ending', byStart(225).role.id);
  check('le guide donne les rôles au Copilote, avec « hypothèse »',
    /rôle supposé : Assemblage/.test(guideLines(g).join('\n')) && /HYPOTHÈSE/.test(guideLines(g).join('\n')));

  // Les mots du prof nomment un couplet ; sans mot, il n'est pas deviné.
  const f2 = load('next-level-worship.json');
  const said = (word) => buildTutorialGuide({ segments: f2.segments, noteEvents: f2.noteEvents, duration: f2.duration,
    transcript: [{ start: 45, text: word }] });
  const verse = said('now this is the verse, we play it like this');
  check('« this is the verse » : l\'étape devient « Couplet » (il le dit)', verse.steps.find((st) => 45 >= st.start && 45 < st.end).role.id === 'verse');
  check('sans le mot, aucun couplet ni refrain n\'est supposé', !g.steps.some((st) => ['verse', 'chorus', 'bridge'].includes(st.role.id)));
  const mv = g.steps.filter((st) => st.role.id === 'movement');
  check('une étape courte où il joue un mouvement relevé : « Mouvement », avec le mouvement dans la raison',
    mv.every((st) => /→/.test(st.role.why)) && g.steps.every((st) => Array.isArray(st.movements)));
}

// ── Autres relevés réels : rien ne casse ─────────────────────────────────────────────────────
console.log('Autres relevés réels');
for (const name of ['eternel-est-bon.json', 'harmoniser-fin.json']) {
  const f = load(name);
  const gg = buildTutorialGuide({ segments: f.segments, noteEvents: f.noteEvents });
  check(`${name} : un guide (étapes, parties)`, gg && gg.steps.length > 0 && gg.parts.length >= 1 && guideLines(gg).length > 3);
}
check('rien relevé : pas de guide', buildTutorialGuide({ segments: [] }) === null);

console.log(`\n${passed} réussis, ${failed} échoués`);
if (failed) process.exitCode = 1;

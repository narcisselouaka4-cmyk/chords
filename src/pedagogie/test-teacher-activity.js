// [Claude] — 2026-10-03 — Tests de teacher-activity.js : ne rejouer que ce que le prof joue.
// Exécutable avec : node src/pedagogie/test-teacher-activity.js
//
// Les cas viennent de la vidéo de Narcisse (tuto « Gospel Piano Harmony Secrets ») :
// de 0:04 à 0:24 le prof PARLE, et le relevé au son a donné 150 « notes » (sa voix), qui
// s'empilaient en un amas de 12 notes à la fin du passage rejoué.

import {
  cleanTeacherNotes, teacherActivity, activitySummary, hasChromaticCluster, onlySpeech,
  chordsWhilePlaying, spansIn, ACTIVITY, MAX_TOGETHER, MAX_NOTE_SECONDS,
} from './teacher-activity.js';

let total = 0;
let passed = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

// Générateur pseudo-aléatoire reproductible.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Le plus grand nombre de notes qui sonnent ensemble. */
function maxTogether(notes) {
  const events = notes.flatMap((n) => [[n.start, 1], [n.end, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let max = 0;
  for (const [, d] of events) { now += d; max = Math.max(max, now); }
  return max;
}

/** Un amas de demi-tons collés sonne-t-il quelque part ? */
function soundingCluster(notes) {
  for (const n of notes) {
    const together = notes.filter((m) => m.start <= n.start && m.end > n.start).map((m) => m.midi);
    if (hasChromaticCluster(together)) return true;
  }
  return false;
}

// --- La voix du prof transcrite comme un piano (0:04 → 0:24) -------------------
const rand = rng(42);
const voice = [];
for (let i = 0; i < 150; i += 1) {
  const start = 4.05 + i * (19.8 / 150) + rand() * 0.02;
  voice.push({
    midi: 46 + Math.floor(rand() * 48), // Si♭2 → La6
    start: Math.round(start * 1000) / 1000,
    end: 24 + rand() * 2, // chaque note « dure » jusqu'à la fin du passage : c'était la vrille
    velocity: 0.12 + rand() * 0.3,
  });
}
const speech = [
  { start: 4.2, end: 9.8, text: 'Hey what is up everybody, welcome back to the channel.' },
  { start: 10.1, end: 16.5, text: 'Today we are talking about key borrowing.' },
  { start: 16.9, end: 24.0, text: 'How to play in multiple keys, so stay with me.' },
];

console.log('\n1. Le prof parle (0:04 → 0:24), sa voix transcrite comme un piano');
const talk = teacherActivity({ notes: voice, speech, start: 4, end: 24, source: 'son' });
const playedInTalk = talk.played.filter((n) => n.start >= 4 && n.start < 24);
check('Aucune des 150 notes de la voix n\'est gardée comme jeu du prof', playedInTalk.length === 0, `${playedInTalk.length} gardées`);
check('Le passage est « il parle », sans moment où il joue', onlySpeech(talk.spans, 4, 24), JSON.stringify(talk.spans));
check('Résumé : « il parle 0:04–0:24 »', activitySummary(talk.spans) === 'il parle 0:04–0:24', activitySummary(talk.spans));
const cleanedVoice = cleanTeacherNotes(voice, { source: 'son' });
check(`Nettoyées : jamais plus de ${MAX_TOGETHER} notes ensemble`, maxTogether(cleanedVoice) <= MAX_TOGETHER, `max ${maxTogether(cleanedVoice)}`);
check(`Nettoyées : une note dure ${MAX_NOTE_SECONDS} s au plus`, cleanedVoice.every((n) => n.end - n.start <= MAX_NOTE_SECONDS + 1e-9));
check('Nettoyées : plus d\'amas de demi-tons collés qui sonnent ensemble', !soundingCluster(cleanedVoice));

console.log('\n2. L\'amas de 12 notes (Si♭3 → La6, les 12 sons)');
const cluster = [58, 61, 63, 64, 66, 69, 72, 75, 79, 83, 86, 93].map((midi, i) => ({ midi, start: 23.5 + i * 0.002, end: 25, velocity: 0.5 }));
check('Une attaque de 12 notes est écartée', cleanTeacherNotes(cluster, { source: 'son' }).length === 0);
const chromatic = [60, 61, 62, 63].map((midi) => ({ midi, start: 1, end: 2, velocity: 0.7 }));
check('Une attaque de 4 demi-tons collés (Do Do♯ Ré Ré♯) est écartée', cleanTeacherNotes(chromatic, { source: 'son' }).length === 0);
const gospel = [36, 48, 55, 58, 62, 64, 67].map((midi) => ({ midi, start: 1, end: 3, velocity: 0.7 }));
check('Un voicing gospel à deux mains (7 notes, dont Ré Mi Sol) est gardé tel quel', cleanTeacherNotes(gospel, { source: 'son' }).length === 7);
check('hasChromaticCluster : 4 demi-tons collés oui, 3 non', hasChromaticCluster([60, 61, 62, 63]) && !hasChromaticCluster([60, 61, 62, 64]));

console.log('\n3. Les notes qui s\'empilaient');
const pile = Array.from({ length: 30 }, (_, i) => ({ midi: 40 + i * 2, start: i * 0.6, end: 24, velocity: 0.6 }));
const pileClean = cleanTeacherNotes(pile, { source: 'son' });
check('30 notes tenues jusqu\'à la fin : jamais plus de 10 ensemble', maxTogether(pileClean) <= MAX_TOGETHER, `max ${maxTogether(pileClean)}`);
check('… et chacune s\'arrête au plus tard 4 s après son attaque', pileClean.every((n) => n.end <= n.start + MAX_NOTE_SECONDS + 1e-9));
const repeated = [{ midi: 60, start: 0, end: 3, velocity: 0.6 }, { midi: 60, start: 1, end: 2, velocity: 0.6 }];
const repClean = cleanTeacherNotes(repeated, { source: 'son' });
check('La même touche rejouée arrête la précédente', repClean[0].end <= 1 && repClean[1].start === 1, JSON.stringify(repClean));

console.log('\n4. Il joue en parlant : ses accords restent, les notes de la voix partent');
const both = [];
for (const t of [31, 33, 35, 37]) for (const midi of [41, 53, 57, 60, 64]) both.push({ midi, start: t + (midi % 3) * 0.004, end: t + 1.8, velocity: 0.62 });
const r2 = rng(7);
for (let i = 0; i < 40; i += 1) both.push({ midi: 50 + Math.floor(r2() * 30), start: 30.1 + i * 0.24, end: 30.4 + i * 0.24, velocity: 0.15 + r2() * 0.15 });
const talkPlay = teacherActivity({ notes: both, speech: [{ start: 30, end: 40, text: 'See how I keep the third on top.' }], start: 30, end: 40, source: 'son' });
const chordsKept = talkPlay.played.filter((n) => n.velocity === 0.62).length;
const voiceKept = talkPlay.played.filter((n) => n.velocity !== 0.62).length;
check('Les 4 accords plaqués pendant qu\'il parle sont gardés (20 notes)', chordsKept === 20, `${chordsKept}`);
check('Les petites notes isolées de la voix sont écartées', voiceKept === 0, `${voiceKept}`);
check('Le moment est « il joue en parlant »', talkPlay.spans.some((s) => s.kind === ACTIVITY.BOTH), JSON.stringify(talkPlay.spans));

// Un lick joué doucement pendant qu'il parle (6 notes, par degrés, 0,2 s, courtes) : son jeu.
const lick = [74, 72, 71, 69, 66, 67].map((midi, i) => ({ midi, start: 50 + i * 0.2, end: 50.16 + i * 0.2, velocity: 0.3 }));
const lickTalk = teacherActivity({ notes: lick, speech: [{ start: 49, end: 53, text: 'Listen to this little run.' }], start: 49, end: 53, source: 'son' });
check('Un lick joué doucement en parlant est gardé (notes courtes, par degrés)', lickTalk.played.length === 6, `${lickTalk.played.length}`);
const unknown = [{ midi: 60, start: 50, end: 50.5 }, { midi: 67, start: 51.2, end: 51.6 }];
check('Une note dont la force est inconnue n\'est pas écartée', teacherActivity({ notes: unknown, speech: [{ start: 49, end: 53, text: 'x' }], source: 'son' }).played.length === 2);

console.log('\n5. Il joue sans parler : tout reste, même doux');
const soft = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({ midi, start: 40 + i * 0.5, end: 40.45 + i * 0.5, velocity: 0.22 }));
const playOnly = teacherActivity({ notes: soft, speech, start: 40, end: 44.5, source: 'son' });
check('Une ligne douce hors parole est gardée en entier', playOnly.played.length === 8, `${playOnly.played.length}`);
check('Le moment est « il joue »', playOnly.spans.length === 1 && playOnly.spans[0].kind === ACTIVITY.PLAYS, JSON.stringify(playOnly.spans));

console.log('\n6. Notes lues à l\'image (clavier dessiné, V2N) : fiables');
const drawn = [[60, 61, 62, 63, 64]].flat().map((midi) => ({ midi, start: 2, end: 3 }));
check('Un amas lu à l\'image n\'est pas écarté (le clavier le montre)', cleanTeacherNotes(drawn, { source: 'image (clavier dessiné)' }).length === 5);
const imgTalk = teacherActivity({ notes: drawn, speech: [{ start: 1, end: 4, text: 'Look at this cluster.' }], start: 1, end: 4, source: 'image (clavier dessiné)' });
check('Pendant la parole, les touches allumées restent son jeu', imgTalk.played.length === 5 && imgTalk.spans.some((s) => s.kind === ACTIVITY.BOTH));

console.log('\n7. Les moments');
const two = [
  ...[60, 64, 67].map((midi) => ({ midi, start: 10, end: 13.5, velocity: 0.6 })),
  ...[62, 65, 69].map((midi) => ({ midi, start: 14.5, end: 18, velocity: 0.6 })),
];
const gap = teacherActivity({ notes: two, speech: [], start: 10, end: 18, source: 'son' });
check('Un trou d\'une seconde ne coupe pas un moment de jeu', gap.spans.length === 1 && gap.spans[0].kind === ACTIVITY.PLAYS, JSON.stringify(gap.spans));
const timeline = teacherActivity({
  notes: [...voice, ...[48, 55, 64, 67, 71].map((midi) => ({ midi, start: 25, end: 28, velocity: 0.7 })), ...[50, 57, 65, 69, 72].map((midi) => ({ midi, start: 28, end: 31, velocity: 0.7 }))],
  speech, start: 4, end: 31, source: 'son',
});
check('Résumé : « il parle 0:04–0:24 · il joue 0:24–0:31 »', /^il parle 0:04–0:2[345] · il joue 0:2[45]–0:31$/.test(activitySummary(timeline.spans)), activitySummary(timeline.spans));
check('spansIn borne les moments au passage demandé', spansIn(timeline.spans, 20, 26).every((s) => s.start >= 20 && s.end <= 26));
const chords = [{ start: 4, end: 9, label: 'Fmaj9' }, { start: 25, end: 28, label: 'Cmaj9' }];
check('Les accords lus pendant qu\'il parle ne sont pas son jeu (Fmaj9 retiré, Cmaj9 gardé)',
  chordsWhilePlaying(chords, timeline.spans).map((c) => c.label).join(' ') === 'Cmaj9');
check('Sans découpage (rien relevé), les accords restent', chordsWhilePlaying(chords, []).length === 2);

console.log('\n8. Parole non transcrite (faster-whisper absent)');
const noSpeech = teacherActivity({ notes: soft, speech: [], source: 'son' });
check('Sans parole connue, les notes plausibles restent jouées', noSpeech.played.length === 8 && !noSpeech.spans.some((s) => s.kind === ACTIVITY.SPEAKS));

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;

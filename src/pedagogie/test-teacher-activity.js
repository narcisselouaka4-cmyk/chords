// [Claude] — 2026-10-03 — Tests de teacher-activity.js : ne rejouer que ce que le prof joue.
// Exécutable avec : node src/pedagogie/test-teacher-activity.js
//
// Les cas viennent de la vidéo de Narcisse (tuto « Gospel Piano Harmony Secrets ») :
// de 0:04 à 0:24 le prof PARLE, et le relevé au son a donné 150 « notes » (sa voix), qui
// s'empilaient en un amas de 12 notes à la fin du passage rejoué.

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  cleanTeacherNotes, teacherActivity, activitySummary, hasChromaticCluster, onlySpeech,
  chordsWhilePlaying, spansIn, ACTIVITY, MAX_TOGETHER, MAX_NOTE_SECONDS,
  readingArtifacts, segmentsWithoutArtifacts, withoutReadingArtifacts, keyRuns, KEY_BLOCK,
} from './teacher-activity.js';
import { labelNotes } from './chord-labeling.js';

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

// [Claude] — 2026-10-04 — Ce que la lecture prend pour des touches. Narcisse, sur « This
// Anonymous Pianist Impressed Cory Henry With Amazing Grace » (clavier dessiné) : « entre 38 et
// 39 s, le Copilote joue des notes que le pianiste original ne joue pas : B6, C7, D7, E7, F7,
// G7, A7 et B7 s'allument simultanément […] à 40 s, F7, G7, A7 et B7 restent encore allumées
// […] le problème disparaît vers 42 s ».
console.log('\n9. Ce que la lecture prend pour des touches (bandeau, écran de fin)');
const IMAGE = 'image (clavier dessiné)';
const BANDEAU = [95, 96, 98, 100, 101, 103, 105, 107]; // Si6 Do7 Ré7 Mi7 Fa7 Sol7 La7 Si7
const realPlay = [
  ...[44, 72, 75, 80].map((midi) => ({ midi, start: 38, end: 39.9 })), // La♭2 | Do5 Mi♭5 La♭5
  ...[49, 77, 80, 84].map((midi) => ({ midi, start: 40, end: 41.9 })), // Ré♭3 | Fa5 La♭5 Do6
];
const overlay = BANDEAU.map((midi) => ({ midi, start: 38, end: midi <= 100 ? 40 : 42 }));
const cory = cleanTeacherNotes([...realPlay, ...overlay], { source: IMAGE });
const pitches = (list) => list.map((n) => n.midi).sort((a, b) => a - b).join(' ');
check('Keyruns : Si6 → Si7 font une seule suite de 8 touches voisines', keyRuns(BANDEAU).length === 1 && keyRuns(BANDEAU)[0].length === 8 && KEY_BLOCK === 6);
check('Son cas : Si6 → Si7 écartés, ses deux accords gardés (8 notes)',
  cory.length === 8 && !cory.some((n) => BANDEAU.includes(n.midi)), pitches(cory));
const coryPlayed = teacherActivity({ notes: [...realPlay, ...overlay], speech: [], start: 36, end: 44, source: IMAGE }).played;
check('… et ce que rejoue le Copilote (played) non plus', coryPlayed.length === 8 && !coryPlayed.some((n) => n.midi >= 95));
const coryZones = readingArtifacts([...realPlay, ...overlay], { source: IMAGE }).zones;
check('Une zone : Si6 → Si7, de 38 s à 42 s', coryZones.length === 1 && coryZones[0].lo === 95 && coryZones[0].hi === 107 && coryZones[0].start === 38 && coryZones[0].end === 42, JSON.stringify(coryZones));
// Le bandeau clignote : Fa7 → Si7 se rallument seuls à 40,2 s (4 touches, pas un bloc).
const blink = [...realPlay, ...BANDEAU.map((midi) => ({ midi, start: 38, end: 40 })), ...[101, 103, 105, 107].map((midi) => ({ midi, start: 40.25, end: 42 }))];
const blinkClean = cleanTeacherNotes(blink, { source: IMAGE });
check('Le bandeau qui clignote : ce qui se rallume dans sa zone est écarté aussi', blinkClean.length === 8 && !blinkClean.some((n) => n.midi >= 95), pitches(blinkClean));
// Un vrai amas de 5 touches (Do4 Ré4 Mi4 Fa4 Sol4) reste du jeu.
const five = [60, 62, 64, 65, 67].map((midi) => ({ midi, start: 5, end: 6 }));
check('Un amas de 5 touches voisines lu à l\'image reste (une main le peut)', cleanTeacherNotes(five, { source: IMAGE }).length === 5);
// L'écran entier : 80 touches d'un coup, après un accord joué.
const screen = [...[48, 64, 67, 71].map((midi) => ({ midi, start: 99, end: 100 })), ...Array.from({ length: 84 }, (_, i) => ({ midi: 24 + i, start: 100, end: 101 }))];
const screenClean = cleanTeacherNotes(screen, { source: IMAGE });
check('Un écran entier allumé est écarté, l\'accord d\'avant reste', pitches(screenClean) === '48 64 67 71', pitches(screenClean));
// Au son : une gamme tenue à la pédale sonne en bloc (elle reste) ; un bloc attaqué ensemble, non.
const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({ midi, start: 10 + i * 0.15, end: 13, velocity: 0.6 }));
check('Au son, une gamme tenue à la pédale reste (8 notes)', cleanTeacherNotes(scale, { source: 'son' }).length === 8);
// [Claude] — 2026-10-09 — Renversé. Le 04/10, on supposait qu'à l'image 8 touches voisines
// tenues ensemble n'étaient jamais du jeu. Narcisse a montré le contraire : un lick rapide
// (« Gospel Piano Harmony Secrets », 0:20–0:22, de l'octave 5 à l'octave 2) dont les touches
// restent allumées le temps de la descente était écarté en entier. Ce qui distingue le jeu d'un
// bandeau : les touches s'allument L'UNE APRÈS L'AUTRE, dans l'ordre des hauteurs (isPlayedLine).
// Les bandeaux réellement observés (Si6 → Si7, l'écran de fin) s'allument d'un coup : écartés.
check('À l\'image, une gamme attaquée note après note puis tenue reste (8 notes)', cleanTeacherNotes(scale, { source: IMAGE }).length === 8);
const fastLick = Array.from({ length: 22 }, (_, i) => ({ midi: 84 - i * 2 + (i % 3 === 0 ? 1 : 0), start: 20 + i * 0.07, end: 22.2 }));
check('Le lick de 0:20 (22 notes en 1,5 s, de l\'octave 5 à l\'octave 2, tenues) reste en entier', cleanTeacherNotes(fastLick, { source: IMAGE }).length === 22);
const slow = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({ midi, start: 10 + i * 0.6, end: 16 }));
check('Mais 8 touches voisines qui s\'allument lentement (0,6 s d\'écart) et restent : écartées', cleanTeacherNotes(slow, { source: IMAGE }).length === 0);
const atOnce = [60, 62, 64, 65, 67, 69, 71, 72].map((midi) => ({ midi, start: 10, end: 13 }));
check('Et 8 touches voisines allumées d\'un coup : écartées', cleanTeacherNotes(atOnce, { source: IMAGE }).length === 0);
const smash = [...[48, 55].map((midi) => ({ midi, start: 20, end: 21, velocity: 0.6 })), ...[72, 74, 76, 77, 79, 81].map((midi) => ({ midi, start: 20.01, end: 21, velocity: 0.6 }))];
check('Au son, 6 touches voisines attaquées ensemble sont écartées, la main gauche reste', pitches(cleanTeacherNotes(smash, { source: 'son' })) === '48 55');
check('Une attaque de plus de 10 notes est écartée, à l\'image aussi',
  cleanTeacherNotes([36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76].map((midi) => ({ midi, start: 3, end: 4 })), { source: IMAGE }).length === 0);

// La grille d'accords : le segment pollué est renommé, le segment vidé écarté.
const segs = [
  { start: 30, end: 38, midis: [44, 72, 75, 80], chord: labelNotes([44, 72, 75, 80]) },
  { start: 38, end: 40, midis: [44, 72, 75, 80, ...BANDEAU], chord: labelNotes([44, 72, 75, 80, ...BANDEAU]) },
  { start: 40.5, end: 41.8, midis: [101, 103, 105, 107], chord: labelNotes([101, 103, 105, 107]) },
];
const fixed = segmentsWithoutArtifacts(segs, coryZones);
check('Grille : le segment d\'avant reste le même', fixed[0] === segs[0]);
check('Grille : le segment pollué perd Si6 → Si7 et reprend le nom de son accord',
  fixed.length === 2 && fixed[1].midis.join(' ') === '44 72 75 80' && fixed[1].chord.label === segs[0].chord.label && segs[1].chord.label !== segs[0].chord.label,
  `${segs[1].chord.label} → ${fixed[1]?.chord?.label}`);
check('Grille : le segment fait seulement du bandeau est écarté', !fixed.some((s) => s.start === 40.5));
const relevé = { noteEvents: [...realPlay, ...overlay], segments: segs, notesSource: IMAGE };
const relu = withoutReadingArtifacts(relevé, { source: IMAGE });
check('Un relevé gardé est corrigé à la lecture, sans être modifié', relu !== relevé && relu.segments.length === 2 && relevé.segments.length === 3 && relevé.noteEvents.length === 16);

// Ses vrais relevés.
const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const harm = JSON.parse(readFileSync(resolve(fixtures, 'harmoniser-fin.json'), 'utf-8'));
const harmClean = cleanTeacherNotes(harm.noteEvents, { source: harm.notesSource });
const harmPlay = harm.noteEvents.filter((n) => n.start < 577);
check('« comment harmoniser rapidement » : l\'écran de fin (9:37, 113 notes) est écarté',
  harmClean.every((n) => n.start < 577) && harm.noteEvents.filter((n) => n.start >= 577).length === 113, `${harmClean.filter((n) => n.start >= 577).length} restent`);
check('… et tout son jeu d\'avant reste (164 notes, 7:20 → 8:47)', harmClean.length === harmPlay.length && harmPlay.length === 164, `${harmClean.length}/${harmPlay.length}`);
const harmSegs = harm.segments.map((s) => ({ ...s, chord: labelNotes(s.midis) }));
const harmFixed = withoutReadingArtifacts({ noteEvents: harm.noteEvents, segments: harmSegs }, { source: harm.notesSource }).segments;
check('… sa grille perd le faux accord de l\'écran de fin (82 touches), et rien d\'autre',
  harmFixed.length === harmSegs.length - 1 && !harmFixed.some((s) => s.start >= 577) && harmFixed.every((s, i) => s === harmSegs[i]), `${harmFixed.length}/${harmSegs.length}`);
const eternel = JSON.parse(readFileSync(resolve(fixtures, 'eternel-est-bon.json'), 'utf-8'));
check('« L\'Éternel est bon » : aucune note écartée (155)', cleanTeacherNotes(eternel.noteEvents, { source: IMAGE }).length === eternel.noteEvents.length && eternel.noteEvents.length === 155);
const eternelAnalysis = { noteEvents: eternel.noteEvents, segments: eternel.segments };
check('… et son relevé reste le même objet', withoutReadingArtifacts(eternelAnalysis, { source: IMAGE }) === eternelAnalysis);

// [Claude] — 2026-10-09 — Au son, un lick très rapide joué EN PARLANT, par arpèges (sauts de 3 à 5
// demi-tons, cinq octaves en 2 s), doucement : c'est son jeu, il reste.
{
  const lickNotes = [];
  let m = 100;
  const steps = [5, 3, 5, 4];
  for (let i = 0; i < 19; i += 1) { lickNotes.push({ midi: m, start: 20 + i * 0.105, end: 20 + i * 0.105 + 0.09, velocity: 0.3 }); m -= steps[i % steps.length]; }
  const louder = Array.from({ length: 10 }, (_, k) => ({ midi: 48 + (k % 3) * 4, start: k * 1.5, end: k * 1.5 + 1, velocity: 0.8 }));
  const speech = [{ start: 19, end: 23, text: 'et là je descends avec ce petit lick' }];
  const view = teacherActivity({ notes: [...louder, ...lickNotes], speech, source: 'son', start: 0 });
  const kept = view.played.filter((n) => n.start >= 19.9 && n.start < 22.1).length;
  check(`au son, lick rapide par arpèges joué en parlant : ${kept} / 19 notes gardées`, kept === 19);
  // Sa voix : notes lentes, aux sauts irréguliers, dans tous les sens → écartées comme avant.
  const voice = [{ midi: 62, start: 30, end: 30.5, velocity: 0.2 }, { midi: 69, start: 30.6, end: 31.1, velocity: 0.2 }, { midi: 60, start: 31.2, end: 31.8, velocity: 0.2 }, { midi: 67, start: 31.9, end: 32.4, velocity: 0.2 }, { midi: 59, start: 32.5, end: 33, velocity: 0.2 }];
  const v2 = teacherActivity({ notes: [...louder, ...voice], speech: [{ start: 29.5, end: 33.5, text: 'alors écoutez bien' }], source: 'son', start: 0 });
  check('au son, la voix (notes lentes, sauts dans tous les sens) reste écartée', v2.played.filter((n) => n.start >= 30).length === 0);
}

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;

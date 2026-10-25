// [Claude] — 2026-10-25 — Banc du nommeur d'accords MIDI, d'après les sessions
// jouées par Narcisse.
//
// Narcisse a joué deux sessions et dicté la grille qu'il voulait. Un MIDI qu'il
// a joué lui-même est une vérité terrain exacte : les notes sont connues, et il
// sait ce qu'il a joué. C'est la référence que l'audio ne peut pas fournir
// (tierces absentes du mix, dérive d'annotation, désaccord avec Chordify).
//
// Les notes de chaque cas sont celles RELEVÉES dans le fichier MIDI, pas des
// notes inventées pour le test.

import { nameMidiChord } from './midi-chord-namer.js';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    passed += 1;
    console.log(`✅ ${label} : ${actual}`);
  } else {
    failed += 1;
    console.log(`❌ ${label} : attendu « ${expected} », obtenu « ${actual} »`);
  }
}

const name = (notes, spelling = 'auto') => nameMidiChord(notes, { spelling })?.name ?? null;

console.log('\n--- Session_017 (22 s, do majeur) — grille dictée par Narcisse ---');
// « Je commence par un Fa majeur. »
check('1. Fa majeur', name([53, 60, 69]), 'F');
// « Ensuite un Sol majeur, mais comme je fais une appoggiature en incluant la
//   seconde, on peut comptabiliser ça comme un Sol add9. »
check('2. Sol add9 (appoggiature sur la seconde)', name([55, 62, 69, 71]), 'Gadd9');
// « Ensuite un Mi mineur. » L'appoggiature sur la quarte (La) n'avait aucun
// gabarit : le nom sortait « E? », un point d'interrogation à l'écran.
check('3. Mi mineur, quarte ajoutée', name([52, 64, 67, 69]), 'Emadd11');
// « Ensuite un La mineur. »
check('4. La mineur', name([45, 57, 60, 64]), 'Am');
// « Ensuite un Ré mineur 7. »
check('5. Ré mineur 7', name([50, 57, 60, 65]), 'Dm7');
// « J'ai fait un Sol add9 basse de Si, et l'application m'a sorti un La 9 sus 4. »
// La triade Sol-Si-Ré sonne en entier ; celle de La 9 sus 4 (La-Do#-Mi) n'a ni
// Do# ni Mi. La note la plus grave du fichier est un La2, d'où la basse écrite.
check('6. Sol add9 (et non La 9 sus 4)', name([45, 47, 55, 57, 62, 67]), 'Gadd9/A');
// « Ensuite un Fa add9 basse de La, mais l'application s'est encore trompée. »
// Fa-La-Do sonne en entier ; Sol 9 sus 4 n'a ni Si ni Ré.
check('7. Fa add9 basse de La (et non Sol 9 sus 4)', name([45, 53, 55, 60, 65]), 'Fadd9/A');
// « Un Do majeur 7, appoggiature sur la seconde, donc un Do majeur 9. »
// Aucun Si n'est joué dans le fichier : la septième majeure n'y est pas.
check('8. Do add9 (aucun Si joué)', name([48, 55, 62, 64]), 'Cadd9');
// « Un Ré mineur 7, appoggiature sur la seconde, donc un Ré mineur 9. »
// Aucun Do n'est joué : la septième n'y est pas.
check('9. Ré mineur add9 (aucun Do joué)', name([50, 57, 64, 65]), 'Dmadd9');
// « Un Mi mineur 7 avec appoggiature sur la seconde, donc le Fa. Mais ça reste
//   quand même un Mi mineur 7. » Le nom sortait « G13/E », alors que le Ré de
//   G13 n'est pas joué et que Mi-Sol-Si sonne en entier.
check('10. Mi mineur + Fa d\'appui (et non G13/E)', name([52, 59, 65, 67]), 'Em');

console.log('\n--- Session du 15/09 (ré dièse majeur) — accords dictés par Narcisse ---');
// Son degré I d'ouverture, lu « Cmaj7 » dans l'ancien nommage faute de gabarit.
check('V coquille, sans tierce (La#-Fa-Sol#)', name([58, 65, 68, 70], 'sharps'), 'A#7');
// Son degré I, add9, basse Sol : sortait « F9sus4/G » (ni La ni Do joués).
check('I add9 basse Sol (et non F9sus4/G)', name([55, 63, 65, 70, 75], 'sharps'), 'D#add9/G');
// Son V en premier renversement avec quarte : sortait « F13sus4/D ».
check('V add11 en premier renversement (et non F13sus4/D)', name([62, 65, 70, 75], 'sharps'), 'A#add11/D');

console.log('\n--- Session_019 (jeu plus avancé) — orthographe par famille d\'accord ---');
// La sortie chromatique de Narcisse en do majeur. Écrite en dièses, elle donnait
// « G#maj7 A# C# C#7#9 » là où un pianiste écrit des bémols. Le diminué reste en
// dièses (un Rébdim7 obligerait à des doubles bémols).
check('bVI : Abmaj7 et non G#maj7', name([44, 56, 60, 63, 67]), 'Abmaj7');
check('bVII : Bb et non A#', name([46, 58, 62, 65, 70]), 'Bb');
check('bII : Db et non C#', name([49, 61, 65, 68]), 'Db');
check('bII7#9 : Db7#9/F et non C#7#9/F', name([53, 59, 61, 64, 68]), 'Db7#9/F');
check('diminué de passage : C#dim7 reste en dièses', name([49, 55, 58, 64]), 'C#dim7');
check('réglage « dièses » : la convention de Narcisse', name([44, 56, 60, 63, 67], 'sharps'), 'G#maj7');
check('réglage « bémols » : tout en bémols', name([49, 55, 58, 64], 'flats'), 'Dbdim7');

console.log('\n--- Non-régression : voicings de jazz sans quinte ---');
// La quinte est la première note qu'un pianiste omet. Elle ne doit JAMAIS être
// exigée de l'accord retenu. Cas de test-session-analysis.js : la basse Sol est
// frappée, Sol-Si-Ré ne sonne pas, et l'accord joué est bien G13.
check('G13 sans quinte, basse frappée', name([43, 53, 57, 59, 64]), 'G13');
check('Am7 plutôt que C6/A (fondamentale à la basse)', name([45, 48, 52, 55]), 'Am7');
check('Dm9 rootless au-dessus de la basse', name([38, 53, 57, 60, 64]), 'Dm9');
check('Cmaj9 à deux mains', name([36, 43, 64, 67, 71, 74]), 'Cmaj9');
check('Triade simple', name([48, 52, 55]), 'C');
check('Cm7', name([48, 51, 55, 58]), 'Cm7');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);

// Tests de spoken-theory.js : ce que le prof DIT de sa théorie (tonalité, degrés, vocabulaire).
// Les phrases marquées « mesuré » sont de vraies phrases des transcriptions de la bibliothèque.
import { readSpokenTheory, spokenKeyFor, degreesNamed, termsNear, announcedProgression, movementSaid, keyText } from './spoken-theory.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

const line = (start, end, text) => ({ start, end, text });
const keysOf = (t) => readSpokenTheory([line(0, 10, t)]).keys.map((k) => keyText(k.pc, k.minor));
const degreesOf = (t) => readSpokenTheory([line(0, 10, t)]).degrees.map((d) => d.degree);
const termsOf = (t) => [...new Set(readSpokenTheory([line(0, 10, t)]).terms.map((x) => x.name))];

// ── Tonalité annoncée ────────────────────────────────────────────────────────
{
  // Mesuré (« Passing chords… Drop 2 Inner Voicings », 1:06).
  check('« the key of C sharp » → Ré♭', keysOf("Now today's demonstration is going to be done on the key of C sharp.").join() === 'Db');
  check('« key of Db » → Ré♭', keysOf('we are in the key of Db here').join() === 'Db');
  check('« key of C major » → Do', keysOf('this is in the key of C major').join() === 'C');
  check('« key of A minor » → La mineur', keysOf('the key of A minor').join() === 'Am');
  // Mesuré (« Gospel Piano Harmony Secrets — Key Borrowing »).
  check('« in F major » sans « key of » → Fa', keysOf("so if we're in F major right, 1, 2, 3, 4, the 4 is B-flat").join() === 'F');
  check('« in A-flat major » → La♭', keysOf("now I'm in A-flat major").join() === 'Ab');
  // Le piège : « in a major way » n'est pas « en La majeur » (lettre en minuscule).
  check('« in a major way » n\'est PAS une tonalité', keysOf('it changes things in a major way').length === 0);
  check('« a major third » n\'est pas une tonalité', keysOf('that is a major third above').length === 0);
  // Français, espagnol.
  check('« en ré bémol majeur » → Ré♭', keysOf('on joue ça en ré bémol majeur').join() === 'Db');
  check('« tonalité de sol » → Sol', keysOf('dans la tonalité de sol, le quatrième degré').join() === 'G');
  check('« en mi mineur » → Mi mineur', keysOf('le morceau est en mi mineur').join() === 'Em');
  check('« en mi-chemin » n\'est pas une tonalité', keysOf('on est en mi-chemin du morceau').length === 0);
  // Mesuré (« Clase 2 — 10 SECRETOS para improvisar en la SALSA »).
  check('« tonalidad de sol menor » → Sol mineur', keysOf('estamos en la tonalidad de sol menor').join() === 'Gm');
}
{
  // L'instant d'un mot dans une ligne longue : « the key of C sharp » tombe à 1:09, pas au début
  // de la ligne. Mesuré : une ligne parlée peut durer 40 s.
  const spoken = readSpokenTheory([line(60, 80, 'blah blah blah blah blah and now the key of C sharp okay')]);
  check('l\'instant est interpolé dans la ligne', spoken.keys[0].at > 66 && spoken.keys[0].at < 80);
}
{
  // La tonalité qui vaut pour une plage : annoncée avant de jouer, ou pendant.
  const spoken = readSpokenTheory([line(10, 12, 'in the key of C major'), line(200, 202, 'now the key of Db')]);
  const first = spokenKeyFor(spoken, 20, 190);
  const second = spokenKeyFor(spoken, 195, 400);
  check('la tonalité annoncée juste avant vaut pour ce qui suit', keyText(first.pc, first.minor) === 'C');
  check('une nouvelle annonce dans la plage l\'emporte', keyText(second.pc, second.minor) === 'Db');
  check('rien annoncé assez près : rien', spokenKeyFor(spoken, 600, 700) === null);
  check('sans parole : rien', spokenKeyFor(readSpokenTheory([]), 0, 100) === null);
}

// ── Degrés nommés ────────────────────────────────────────────────────────────
{
  // Mesuré (« Drop 2 ») : « from the chord I to the chord V », « I went to my A flat which is the 5 ».
  check('« chord I » et « chord V » → 1 et 5', degreesOf('a simple transition from the chord I to the chord V').join() === '1,5');
  check('« the 5 » → 5', degreesOf('I went to my A flat which is the 5').join() === '5');
  check('« chord 2 » → 2', degreesOf('the first movement is based on the chord 2').join() === '2');
  check('« your 1 chord » → 1', degreesOf('from going from your 1 chord to your chord V').join() === '1,5');
  check('« degré 4 » → 4', degreesOf('on arrive sur le degré 4').join() === '4');
  // Le piège : « I » tout seul est le pronom anglais le plus courant.
  check('« I went to my A flat » ne nomme PAS le degré 1', !degreesOf('I went to my A flat and I played').includes('1'));
  check('un nombre au-delà de 7 n\'est pas un degré', degreesOf('the 9 and the 13 on top').length === 0);
  // Mesuré (« Above All ») : « It's a 6, 5 chord progression in the key of A ».
  const prog = readSpokenTheory([line(0, 5, "it's a 6, 5 chord progression in the key of A")]);
  check('« a 6, 5 chord progression » → une progression annoncée 6-5', prog.progressions[0].degrees.join('-') === '6-5');
  check('… et ses degrés comptent comme nommés', prog.degreeCount['6'] >= 1 && prog.degreeCount['5'] >= 1);
  check('« 2-5-1 » → trois degrés', readSpokenTheory([line(0, 5, 'a simple 2-5-1 turnaround')]).progressions[0].degrees.join('-') === '2-5-1');
}
{
  const spoken = readSpokenTheory([line(0, 5, 'the chord 2 then the 5'), line(100, 105, 'now the chord 4')]);
  check('les degrés nommés dans une plage', JSON.stringify(degreesNamed(spoken, 0, 50)) === JSON.stringify({ 2: 1, 5: 1 }));
  check('sur tout le tuto', degreesNamed(spoken)['4'] === 1);
}

// ── Vocabulaire ──────────────────────────────────────────────────────────────
{
  // Mesuré : les mots employés dans la bibliothèque de Narcisse.
  check('« drop 2 »', termsOf('using a drop 2 movement I call the Ski-Bleep movement').includes('drop 2'));
  check('« drop to » mal transcrit compte aussi', termsOf('I threw in a drop to movement').includes('drop 2'));
  check('« grace notes » → notes de passage', termsOf('then I did grace notes okay').includes('notes de passage'));
  check('« passing chord »', termsOf('this is just a passing chord').includes('accord de passage'));
  check('« upper structure »', termsOf('we put an upper structure on top').includes('upper structure'));
  check('« walk down » → marche harmonique', termsOf('you want to walk down from the 3').includes('marche harmonique'));
  check('« accord de passage » en français', termsOf('là je mets un accord de passage').includes('accord de passage'));
  check('rien d\'inventé quand il ne dit rien', termsOf('so here we go again, listen to this').length === 0);
}
{
  const spoken = readSpokenTheory([line(10, 12, 'a drop 2 voicing'), line(300, 302, 'a passing chord here')]);
  check('les mots près d\'un passage', termsNear(spoken, 8, 15).join() === 'drop 2,voicing');
  check('… et pas ceux d\'ailleurs dans la vidéo', !termsNear(spoken, 8, 15).includes('accord de passage'));
}

// ── Progression annoncée, et le mouvement qu'il nomme ────────────────────────
{
  const spoken = readSpokenTheory([
    line(0, 5, "it's a 6, 5 chord progression"),
    line(60, 65, 'again the 6, 5 progression'),
    line(120, 125, 'a 2-5-1 here'),
  ]);
  const best = announcedProgression(spoken);
  check('la progression qu\'il répète est celle annoncée', best.degrees.join('-') === '6-5' && best.times === 2);
  check('une progression dite une seule fois ne suffit pas', announcedProgression(readSpokenTheory([line(0, 5, 'a 2-5-1 turnaround')])) === null);
  // Mesuré (vidéo de salsa) : « 1, 2, 3, 4 » cinq fois — c'est le décompte avant de jouer.
  const countIn = readSpokenTheory([
    line(0, 4, 'okay 1, 2, 3, 4 and we play'),
    line(60, 64, 'listen again, 1, 2, 3, 4'),
    line(120, 124, 'and 1, 2, 3, 4'),
  ]);
  check('un décompte « 1, 2, 3, 4 » n\'est pas une progression annoncée', announcedProgression(countIn) === null);
  check('… et il n\'annonce donc aucun mouvement 1 → 2', movementSaid(countIn, '1', '2').pair === false);
  check('« a 2-5-1 turnaround » se nomme, lui', readSpokenTheory([line(0, 5, 'a 2-5-1 turnaround')]).progressions[0].named === true);
  check('« it\'s a 6, 5 chord progression » se nomme', readSpokenTheory([line(0, 5, "it's a 6, 5 chord progression")]).progressions[0].named === true);
  const said = movementSaid(spoken, '6', '5');
  check('un mouvement qu\'il enchaîne à voix haute est reconnu', said.pair === true && said.degrees === 2);
  check('un mouvement dont il ne parle pas ne l\'est pas', movementSaid(spoken, '4', '7').degrees === 0);
  check('un seul degré nommé compte pour un', movementSaid(spoken, '5', '7').degrees === 1);
}
{
  const empty = readSpokenTheory(null);
  check('sans transcription : tout vide, rien d\'inventé', empty.keys.length === 0 && empty.degrees.length === 0
    && empty.terms.length === 0 && Object.keys(empty.degreeCount).length === 0);
  check('une ligne sans horodatage est ignorée', readSpokenTheory([{ text: 'the key of C major' }]).keys.length === 0);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

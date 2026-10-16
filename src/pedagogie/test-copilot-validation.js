// [Claude] — 2026-09-08 — Tests du module de validation Copilot IA (pure log).

import {
  groupNotesByTimeWindow,
  extractBoldChordNames,
  extractDegreeReferences,
  buildValidationLogPayload,
  extractChordRootPc,
  checkChordNameAgreement,
  formatDetectedChordPlain,
  parseImpliedKey,
  romanNumeralToDegreeIndex,
  checkDegreeKeyAgreement,
  extractAffirmedKeys,
  checkKeyAffirmation,
  checkVoicingDescriptionAgreement,
} from './copilot-validation.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    failed += 1;
    console.log(`${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function testGroupNotesByTimeWindow() {
  // Cas 1 : 3 notes rapprochées → 1 groupe isChordLike
  const notes1 = [
    { midi: 60, startOffsetMs: 0 },
    { midi: 64, startOffsetMs: 80 },
    { midi: 67, startOffsetMs: 160 },
  ];
  const groups1 = groupNotesByTimeWindow(notes1);
  check('3 notes rapprochées forment 1 groupe', groups1.length === 1);
  check('Groupe de 3 notes est marqué isChordLike', groups1[0]?.isChordLike === true);
  check('startOffsetMs du groupe = première note', groups1[0]?.startOffsetMs === 0);

  // Cas 2 : 3 notes puis 1 note éloignée → 2 groupes
  const notes2 = [
    { midi: 60, startOffsetMs: 0 },
    { midi: 64, startOffsetMs: 80 },
    { midi: 67, startOffsetMs: 160 },
    { midi: 72, startOffsetMs: 1000 },
  ];
  const groups2 = groupNotesByTimeWindow(notes2);
  check('Note éloignée ouvre un second groupe', groups2.length === 2);
  check('Premier groupe reste isChordLike', groups2[0]?.isChordLike === true);
  check('Second groupe isolé a 1 note', groups2[1]?.notes.length === 1);

  // Cas 3 : notes dans le désordre → tri interne et 1 groupe
  const notes3 = [
    { midi: 67, startOffsetMs: 160 },
    { midi: 60, startOffsetMs: 0 },
    { midi: 64, startOffsetMs: 80 },
  ];
  const groups3 = groupNotesByTimeWindow(notes3);
  check('Notes désordonnées regroupées correctement après tri', groups3.length === 1);
  check('Groupe trié commence par la première note', groups3[0]?.notes[0]?.startOffsetMs === 0);

  // Cas 4 : 2 notes → isChordLike false
  const notes4 = [
    { midi: 60, startOffsetMs: 0 },
    { midi: 64, startOffsetMs: 80 },
  ];
  const groups4 = groupNotesByTimeWindow(notes4);
  check('2 notes forment un groupe non-chord', groups4.length === 1);
  check('Groupe de 2 notes n\'est pas isChordLike', groups4[0]?.isChordLike === false);
}

function testExtractBoldChordNames() {
  const text = 'Voici un **Cmaj7** suivi d\'un **F#m**.';
  const chords = extractBoldChordNames(text);
  check('Extrait les accords en gras markdown', chords.length === 2);
  check('Cmaj7 extrait correctement', chords.includes('Cmaj7'));
  check('F#m extrait correctement', chords.includes('F#m'));

  const empty = extractBoldChordNames('Pas de gras ici.');
  check('Texte sans gras retourne un tableau vide', empty.length === 0);
}

function testExtractDegreeReferences() {
  const deg1 = extractDegreeReferences('Regarde le degré iii dans cette tonalité.');
  check('"degré iii" est capturé', deg1.includes('iii'));

  const deg2 = extractDegreeReferences('La progression ii-V-I est fondamentale.');
  check('Progression ii-V-I capturée', deg2.includes('ii-V-I'));

  const falsePos = extractDegreeReferences('Je vais te montrer. La note I est importante.');
  check('Lettre isolée "I" hors contexte n\'est PAS capturée', !falsePos.includes('I'));

  const embedded = extractDegreeReferences('Le mot important ne doit pas déclencher.');
  check('Lettre I dans un mot (important) n\'est pas capturée', embedded.length === 0);
}

function testBuildValidationLogPayload() {
  const empty = buildValidationLogPayload({
    groups: [{ notes: [{ midi: 60 }], startOffsetMs: 0, isChordLike: false }],
    extractedChordNames: [],
    extractedDegreeRefs: [],
  });
  check('Payload null quand aucun signal intéressant', empty === null);

  const withChord = buildValidationLogPayload({
    groups: [{ notes: [{ midi: 60, impliedChordName: 'Cmaj7' }], startOffsetMs: 0, isChordLike: false }],
    extractedChordNames: [],
    extractedDegreeRefs: [],
  });
  check('Payload non null quand une métadonnée est présente', withChord !== null);
  check('Payload expose le groupe enrichi', withChord.enrichedGroups.length === 1);
  check('Payload expose impliedChordName', withChord.enrichedGroups[0].notes[0].impliedChordName === 'Cmaj7');

  const withText = buildValidationLogPayload({
    groups: [{ notes: [{ midi: 60 }], startOffsetMs: 0, isChordLike: false }],
    extractedChordNames: ['Cmaj7'],
    extractedDegreeRefs: [],
  });
  check('Payload non null quand une extraction texte est présente', withText !== null);
  check('Payload expose les accords extraits', withText.extractedChordNames.length === 1);
}

function testExtractChordRootPc() {
  check('Cmaj7 → pc de Do (0)', extractChordRootPc('Cmaj7') === 0);
  check('A#m7 → pc de La# (10)', extractChordRootPc('A#m7') === 10);
  check('Am7b5 → pc de La (9), pas La bémol', extractChordRootPc('Am7b5') === 9);
  check('Bbmaj7 → pc de Si bémol (10)', extractChordRootPc('Bbmaj7') === 10);
  check('Chaîne vide → null', extractChordRootPc('') === null);
  check('undefined → null', extractChordRootPc(undefined) === null);
  check('Nom invalide → null', extractChordRootPc('X7') === null);
}

function testCheckChordNameAgreement() {
  const falseFm = groupNotesByTimeWindow([
    { midi: 65, startOffsetMs: 0, impliedChordName: 'Cmaj7' },
    { midi: 68, startOffsetMs: 80, impliedChordName: 'Cmaj7' },
    { midi: 72, startOffsetMs: 160, impliedChordName: 'Cmaj7' },
  ]);
  const falseChecks = checkChordNameAgreement(falseFm);
  check('Désaccord Cmaj7/Fm détecté', falseChecks.length === 1);
  check('match === false', falseChecks[0]?.match === false);
  check('rootPc détecté = Fa (5)', falseChecks[0]?.detected.rootPc === 5);

  const trueC = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0, impliedChordName: 'Cmaj7' },
    { midi: 64, startOffsetMs: 80, impliedChordName: 'Cmaj7' },
    { midi: 67, startOffsetMs: 160, impliedChordName: 'Cmaj7' },
  ]);
  const trueChecks = checkChordNameAgreement(trueC);
  check('Accord correct → match === true', trueChecks.length === 1 && trueChecks[0].match === true);

  const noMeta = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0 },
    { midi: 64, startOffsetMs: 80 },
    { midi: 67, startOffsetMs: 160 },
  ]);
  check('Groupe sans métadonnée ignoré', checkChordNameAgreement(noMeta).length === 0);

  const twoNotes = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0, impliedChordName: 'Cmaj7' },
    { midi: 64, startOffsetMs: 80, impliedChordName: 'Cmaj7' },
  ]);
  check('Groupe de 2 notes (non chord) ignoré', checkChordNameAgreement(twoNotes).length === 0);
}

function testFormatDetectedChordPlain() {
  check('Nom brut sans balise HTML pour Cmaj', !formatDetectedChordPlain({ rootPc: 0, symbol: '' }).includes('<') && formatDetectedChordPlain({ rootPc: 0, symbol: 'maj' }).includes('C'));
  check('Nom brut sans balise HTML pour accord altéré', !formatDetectedChordPlain({ rootPc: 1, symbol: 'm7b5' }).includes('<') && formatDetectedChordPlain({ rootPc: 1, symbol: 'm7b5' }).includes('#'));
}

function testParseImpliedKey() {
  const doSharpMajor = parseImpliedKey('Do# majeur');
  check('parseImpliedKey("Do# majeur") retourne C# major', doSharpMajor && doSharpMajor.tonicName === 'C#' && doSharpMajor.mode === 'major');

  const reMinor = parseImpliedKey('Ré mineur');
  check('parseImpliedKey("Ré mineur") retourne D minor', reMinor && reMinor.tonicName === 'D' && reMinor.mode === 'minor');

  const cMajor = parseImpliedKey('C major');
  check('parseImpliedKey("C major") retourne C major (anglo-saxon)', cMajor && cMajor.tonicName === 'C' && cMajor.mode === 'major');

  check('parseImpliedKey("Sol") retourne null (mode manquant)', parseImpliedKey('Sol') === null);
  check('parseImpliedKey chaîne vide retourne null', parseImpliedKey('') === null);
}

function testRomanNumeralToDegreeIndex() {
  check('romanNumeralToDegreeIndex("iii") → 2', romanNumeralToDegreeIndex('iii') === 2);
  check('romanNumeralToDegreeIndex("IV") → 3', romanNumeralToDegreeIndex('IV') === 3);
  check('romanNumeralToDegreeIndex("vii°") → 6 (suffixe ignoré)', romanNumeralToDegreeIndex('vii°') === 6);
  check('romanNumeralToDegreeIndex("bVI") → null (altéré ignoré)', romanNumeralToDegreeIndex('bVI') === null);
  check('romanNumeralToDegreeIndex("xyz") → null', romanNumeralToDegreeIndex('xyz') === null);
  check('romanNumeralToDegreeIndex("V7") → 4 (suffixe ignoré)', romanNumeralToDegreeIndex('V7') === 4);
}

function testCheckDegreeKeyAgreement() {
  // Cas réel de référence : le modèle annonce iii de Do# majeur mais joue Cmaj7.
  // iii de C# major = E#m, fondamentale E# = pc 5 (enharmonique de F).
  const falseRef = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
    { midi: 64, startOffsetMs: 80, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
    { midi: 67, startOffsetMs: 160, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
    { midi: 71, startOffsetMs: 240, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
  ]);
  const falseChecks = checkDegreeKeyAgreement(falseRef);
  check('Désaccord degré/tonalité détecté (cas réel)', falseChecks.length === 1);
  check('match === false', falseChecks[0]?.match === false);
  check('expectedRootPc = Fa (5)', falseChecks[0]?.expectedRootPc === 5);

  // Même degré/tonalité, mais notes jouées = Fm (fondamentale Fa, pc 5).
  const trueFm = groupNotesByTimeWindow([
    { midi: 65, startOffsetMs: 0, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
    { midi: 68, startOffsetMs: 80, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
    { midi: 72, startOffsetMs: 160, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur' },
  ]);
  const trueChecks = checkDegreeKeyAgreement(trueFm);
  check('Accord attendu du degré → match === true', trueChecks.length === 1 && trueChecks[0].match === true);

  // VII en mineur naturel : VII (C majeur pour Ré mineur : C-E-G).
  const minorNaturalVII = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0, impliedRomanNumeral: 'vii', impliedKey: 'Ré mineur' },
    { midi: 64, startOffsetMs: 80, impliedRomanNumeral: 'vii', impliedKey: 'Ré mineur' },
    { midi: 67, startOffsetMs: 160, impliedRomanNumeral: 'vii', impliedKey: 'Ré mineur' },
  ]);
  const natViiChecks = checkDegreeKeyAgreement(minorNaturalVII);
  check('VII naturel en mineur accepté', natViiChecks.length === 1 && natViiChecks[0].match === true);
  check('VII naturel : expectedTriad vaut C (tonique un ton sous D)', natViiChecks[0]?.expectedTriad === 'C');

  // VII en mineur harmonique : vii° (fondamentale un demi-ton sous la tonique).
  const minorHarmonicVII = groupNotesByTimeWindow([
    { midi: 61, startOffsetMs: 0, impliedRomanNumeral: 'vii', impliedKey: 'Ré mineur' },
    { midi: 64, startOffsetMs: 80, impliedRomanNumeral: 'vii', impliedKey: 'Ré mineur' },
    { midi: 67, startOffsetMs: 160, impliedRomanNumeral: 'vii', impliedKey: 'Ré mineur' },
  ]);
  const harViiChecks = checkDegreeKeyAgreement(minorHarmonicVII);
  check('VII harmonique en mineur aussi accepté', harViiChecks.length === 1 && harViiChecks[0].match === true);

  // Groupe sans métadonnées degré+tonalité simultanées.
  const noMeta = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0 },
    { midi: 64, startOffsetMs: 80 },
    { midi: 67, startOffsetMs: 160 },
  ]);
  check('Groupe sans degré+tonalité ignoré', checkDegreeKeyAgreement(noMeta).length === 0);

  // Métadonnées sur des notes différentes (ambigu) → ignoré.
  const splitMeta = groupNotesByTimeWindow([
    { midi: 60, startOffsetMs: 0, impliedRomanNumeral: 'iii' },
    { midi: 64, startOffsetMs: 80, impliedKey: 'Do# majeur' },
    { midi: 67, startOffsetMs: 160 },
  ]);
  check('Métadonnées sur notes différentes ignorées', checkDegreeKeyAgreement(splitMeta).length === 0);
}

function testExtractAffirmedKeys() {
  const k1 = extractAffirmedKeys('La tonalité est Do majeur.');
  check('Extrait "Do majeur"', k1.length === 1 && k1[0].keyName === 'Do' && k1[0].mode === 'major');

  const k2 = extractAffirmedKeys('Ce morceau est en Ré# mineur.');
  check('Extrait "Ré# mineur"', k2.length === 1 && k2[0].keyName === 'Ré#' && k2[0].mode === 'minor');

  const k3 = extractAffirmedKeys('On joue en Sol majeur et on passe en La mineur.');
  check('Extrait deux tonalités distinctes', k3.length === 2);

  const k4 = extractAffirmedKeys('Je vais te montrer un ii-V-I.');
  check('Aucune tonalité affirmée', k4.length === 0);
}

function testCheckKeyAffirmation() {
  const ok = checkKeyAffirmation('La tonalité est Do majeur.', 'Do majeur');
  check('Tonalité correcte → match', ok.length === 1 && ok[0].match === true);

  const bad = checkKeyAffirmation('La tonalité est Sol majeur.', 'Do majeur');
  check('Tonalité contradictoire détectée', bad.length === 1 && bad[0].match === false);
  check('Correction mentionne Do attendu', bad[0].correction.includes('Do'));
  check('Correction mentionne raisonnement comme si', bad[0].correction.includes('raisonnement comme si'));

  const none = checkKeyAffirmation('Voici une analyse neutre.', 'Do majeur');
  check('Pas d\'affirmation tonale → aucun résultat', none.length === 0);

  const minor = checkKeyAffirmation('Le morceau est en La mineur.', 'Am');
  check('Format anglais "Am" reconnu comme attendu', minor.length === 1 && minor[0].match === true);
}

function testCheckVoicingDescriptionAgreement() {
  // Cmaj7 close : LH root + RH reste.
  const closeC = { leftHand: [48, 52, 55], rightHand: [64, 67, 71, 74] };
  const closeOk = checkVoicingDescriptionAgreement(
    'J\'utilise un close voicing avec la fondamentale à la main gauche.',
    closeC,
    'Cmaj7'
  );
  check('Close : fondamentale à la main gauche → match', closeOk.length >= 1 && closeOk.every((c) => c.match === true));

  // Cmaj7 rootless : LH shell 3+7, root absente.
  const rootlessC = { leftHand: [52, 55], rightHand: [64, 67, 71, 74], technique: 'rootless' };
  const rootlessOk = checkVoicingDescriptionAgreement(
    'Voici un voicing rootless.',
    rootlessC,
    'Cmaj7'
  );
  check('Rootless : mention "rootless" cohérente → match', rootlessOk.length === 1 && rootlessOk[0].match === true);

  const rootlessBad = checkVoicingDescriptionAgreement(
    'J\'entends la fondamentale à la basse.',
    rootlessC,
    'Cmaj7'
  );
  check('Rootless : fondamentale à la basse détectée comme mismatch', rootlessBad.length >= 1 && rootlessBad.every((c) => c.match === false));
  check('Correction mentionne fondamentale absente de la main gauche', rootlessBad[0].correction.includes('sans la fondamentale Do'));
  check('Correction mentionne répartition réelle main gauche/droite', rootlessBad[0].correction.includes('main gauche') && rootlessBad[0].correction.includes('main droite'));

  // Fondamentale à la main droite.
  const rhRootC = { leftHand: [52, 55], rightHand: [48, 64, 67, 71] };
  const rhOk = checkVoicingDescriptionAgreement(
    'J\'ai mis la fondamentale à la main droite.',
    rhRootC,
    'Cmaj7'
  );
  check('Root en main droite : description correcte → match', rhOk.length >= 1 && rhOk.every((c) => c.match === true));

  const rhBad = checkVoicingDescriptionAgreement(
    'La fondamentale est à la main gauche.',
    rhRootC,
    'Cmaj7'
  );
  check('Root en main droite : affirmation main gauche détectée', rhBad.length >= 1 && rhBad.every((c) => c.match === false));

  const noClaim = checkVoicingDescriptionAgreement('Voici une description neutre.', closeC, 'Cmaj7');
  check('Aucune affirmation sur le voicing → résultat vide', noClaim.length === 0);

  const badChord = checkVoicingDescriptionAgreement('La fondamentale est à la basse.', closeC, 'XYZ???');
  check('Symbole d\'accord invalide → résultat vide', badChord.length === 0);
}

async function runTests() {
  testGroupNotesByTimeWindow();
  testExtractBoldChordNames();
  testExtractDegreeReferences();
  testBuildValidationLogPayload();
  testExtractChordRootPc();
  testCheckChordNameAgreement();
  testFormatDetectedChordPlain();
  testParseImpliedKey();
  testRomanNumeralToDegreeIndex();
  testCheckDegreeKeyAgreement();
  testExtractAffirmedKeys();
  testCheckKeyAffirmation();
  testCheckVoicingDescriptionAgreement();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

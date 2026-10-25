// [Claude] — 2026-10-25 — Rôles et degrés sur le chemin MIDI.
//
// Le chemin MIDI posait `role: 'structural'` pour TOUS les accords et
// `degree: null` partout : l'onglet Analyse ne montrait aucune hiérarchie sur
// les sessions de Narcisse. La règle retenue ne s'appuie PAS sur la tonalité,
// contrairement à la version audio dont le défaut mesuré (31,6 % d'événements
// masqués, sections modulées entières) vient précisément de la diatonicité.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { classifyMidiRoles, harmonicIdentity } from './midi-roles.js';
import { selectChordProgression } from './structural-progression.js';
import { parseMidiFile } from '../recorder/serializer.js';
import { analyzeMidiEvents } from './midi-source.js';

let passed = 0;
let failed = 0;
const check = (label, actual, expected) => {
  if (actual === expected) { passed += 1; console.log(`✅ ${label}`); return; }
  failed += 1;
  console.log(`❌ ${label}\n     attendu : ${expected}\n     obtenu  : ${actual}`);
};

console.log('\n--- Identité harmonique : la fondamentale et la couleur, pas le nom ---');
// Ses « Fadd9 » et « Fadd9/A » sont le même degré de sa progression ; les
// compter séparément les empêcherait d'être reconnus comme récurrents.
check('un enrichissement ne change pas l\'identité',
  harmonicIdentity('Fadd9') === harmonicIdentity('F'), true);
check('un renversement non plus',
  harmonicIdentity('Fadd9/A') === harmonicIdentity('F'), true);
check('la couleur mineure distingue', harmonicIdentity('Dm7') === harmonicIdentity('D'), false);
check('mais pas l\'extension mineure', harmonicIdentity('Dm7') === harmonicIdentity('Dmadd9'), true);
check('le silence n\'a pas d\'identité', harmonicIdentity('N'), null);

console.log('\n--- Classement ---');
const beat = 0.5;
const seq = (...specs) => specs.map(([chord, start, end]) => ({ chord, startTime: start, endTime: end }));
// Un accord qui revient porte la progression, même joué brièvement.
let out = classifyMidiRoles(seq(['C', 0, 2], ['G', 2, 4], ['C', 4, 6]), { beatDuration: beat });
check('un accord qui revient est structurel', out[0].role, 'structural');
// Un accord bref, unique, entre deux piliers : un passage.
out = classifyMidiRoles(seq(['C', 0, 4], ['Ab', 4, 4.3], ['C', 4.3, 8]), { beatDuration: beat });
check('bref, unique, encadré de piliers : passage', out[1].role, 'passing');
// Le même accord tenu n'est plus un passage.
out = classifyMidiRoles(seq(['C', 0, 4], ['Ab', 4, 6], ['C', 6, 10]), { beatDuration: beat });
check('le même, mais tenu : structurel', out[1].role, 'structural');
check('le silence garde son rôle',
  classifyMidiRoles(seq(['N', 0, 1], ['C', 1, 3]), { beatDuration: beat })[0].role, 'silence');

console.log('\n--- Une source MIDI ne masque RIEN ---');
// L'ADR-063 a été écrit pour l'audio, où le moteur doute. Un MIDI ne laisse
// aucune place au doute : cacher un accord certainement joué n'a pas de sens.
const mixed = [{ chord: 'C', role: 'structural' }, { chord: 'Bdim7', role: 'uncertain' },
  { chord: 'F', role: 'passing' }];
check('audio : la vue simple ne garde que les piliers',
  selectChordProgression(mixed, {}).length, 1);
check('MIDI : la vue simple garde tout',
  selectChordProgression(mixed, { sourceType: 'midi' }).length, 3);
check('audio en vue détaillée : tout aussi',
  selectChordProgression(mixed, { detailed: true }).length, 3);

console.log('\n--- Sur les sessions de Narcisse ---');
const SESSIONS = join(homedir(), 'PianoJazzChords', 'Sessions');
const file = join(SESSIONS, 'Session_017', 'events.mid');
if (!existsSync(file)) {
  console.log('⏭  Session_017 absente — banc ignoré');
} else {
  const parsed = parseMidiFile(new Uint8Array(readFileSync(file)));
  const analysis = analyzeMidiEvents(parsed.events, { duration: parsed.duration, tempo: parsed.tempo });
  // Narcisse a dicté ses dix accords comme étant SA progression : tous piliers.
  check('S017 : les dix accords dictés sont structurels',
    analysis.chords.filter((c) => c.role === 'structural').length, 10);
  // Sa progression en do majeur, telle qu'il l'a jouée.
  check('S017 : les degrés',
    analysis.chords.map((c) => c.degree).join(' '),
    'IV V iii vi ii V IV I ii iii');
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);

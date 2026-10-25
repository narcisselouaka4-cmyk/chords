// [Claude] — 2026-10-25 — Banc de bout en bout sur les sessions jouées par Narcisse.
//
// Les fichiers MIDI de ses sessions sont une vérité terrain exacte : les notes
// sont connues et il a dicté ce qu'il a joué. Ce banc fige le RELEVÉ COMPLET
// (découpage et noms), pas seulement le nommage d'un accord isolé — c'est là que
// les absorptions et les coupures se voient.
//
// Les fichiers vivent hors du dépôt (~/PianoJazzChords/Sessions). Quand ils sont
// absents, le banc le dit et passe : il ne doit pas casser une machine neuve.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseMidiFile } from '../recorder/serializer.js';
import { analyzeMidiEvents } from './midi-source.js';

const SESSIONS = join(homedir(), 'PianoJazzChords', 'Sessions');
let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (actual === expected) { passed += 1; console.log(`✅ ${label}`); return; }
  failed += 1;
  console.log(`❌ ${label}\n     attendu : ${expected}\n     obtenu  : ${actual}`);
}

function analyse(session) {
  const file = join(SESSIONS, session, 'events.mid');
  if (!existsSync(file)) return null;
  const parsed = parseMidiFile(new Uint8Array(readFileSync(file)));
  return analyzeMidiEvents(parsed.events, { duration: parsed.duration, tempo: parsed.tempo });
}

// --- Session_017 : 22 s, do majeur, dix accords dictés par Narcisse ------------
// « Fa majeur, Sol add9 (appoggiature sur la seconde), Mi mineur, La mineur,
//   Ré mineur 7, Sol add9 basse de Si, Fa add9 basse de La, Do majeur 7-9,
//   Ré mineur 7-9, Mi mineur 7 avec le Fa d'appui. »
const s17 = analyse('Session_017');
if (!s17) {
  console.log('⏭  Session_017 absente — banc ignoré');
} else {
  check('S017 : tonalité', s17.key, 'C');
  check('S017 : dix accords, un par accord joué', s17.chords.length, 10);
  check('S017 : le relevé complet',
    s17.chords.map((c) => c.chord).join(' '),
    'Fadd9 Gadd9 Esus4 Am Dm7 Gadd9/A Fadd9/A Cadd9 Dmadd9 Em');
  check('S017 : aucun chevauchement',
    s17.chords.every((c, i) => i === 0 || c.startTime >= s17.chords[i - 1].endTime - 1e-6), true);
}

// --- Session_019 : 50 s, do majeur, même progression jouée plus richement -----
// Les quatre défauts signalés par Narcisse après l'avoir passée dans Analyse.
const s19 = analyse('Session_019');
if (!s19) {
  console.log('⏭  Session_019 absente — banc ignoré');
} else {
  const at = (t) => s19.chords.find((c) => c.startTime <= t && c.endTime > t)?.chord ?? '(aucun)';
  check('S019 : tonalité', s19.key, 'C');
  // « À la 17e seconde l'accord affiché c'est Ddim7, alors que je commence par
  //   un Do majeur 7. Il vient après, et après vient le La 7b9. »
  // Son Cmaj9 était écrasé à 0,04 s : une note de sa propre grappe, tenue,
  // faisait reculer le Ddim7 de 18,61 s jusqu'à 17,47 s.
  check('S019 : son Do majeur 7 à 17,4 s (il était avalé)', at(18.0), 'Cmaj9');
  check('S019 : son Ddim7 quand il le joue, à 18,6 s', at(19.0), 'Ddim7');
  check('S019 : son La 7b9 pas avant 20,8 s', at(20.0), 'Am7');
  check('S019 : son La 7b9 à 20,8 s', at(21.0), 'A7b9');
  // « À la 25e seconde une étiquette Em7/G, alors que je n'ai fait que jouer
  //   des arpèges. Les arpèges ont compté comme un accord. »
  check('S019 : ses arpèges de 25 s ne créent plus d\'accord', at(25.5), 'G');
  // « À la 29e seconde un Cmaj7sus2/B. C'est faux. Je joue un Fa dim7 drop 2,
  //   puis un Sol dim7 drop 2. » (dim7 est symétrique : Bdim7 = Fdim7.)
  check('S019 : son dim7 drop 2 à 29,6 s', at(29.8), 'Bdim7');
  check('S019 : plus de Cmaj7sus2/B sur sa marche chromatique de basse',
    s19.chords.some((c) => c.chord === 'Cmaj7sus2/B'), false);
  check('S019 : son second dim7 drop 2 à 30 s', at(30.4), 'C#dim7');
  // « À la 42e seconde il détecte un Ré bémol, alors que je joue un Ré bémol 7. »
  // Accord roulé : le Si4, la septième, arrive 158 ms après le reste.
  check('S019 : son Ré bémol 7 complet à 42 s', at(42.0), 'Db7');
  check('S019 : aucun chevauchement',
    s19.chords.every((c, i) => i === 0 || c.startTime >= s19.chords[i - 1].endTime - 1e-6), true);
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);

// [Claude] — 2026-10-25 — Le pont MIDI → vérité terrain horodatée.
//
// Les corpus d'accords académiques distribuent les annotations mais pas l'audio,
// et récupérer l'audio ailleurs n'est ni légal ni tenable. La sortie : les corpus
// dont l'audio est libre ET accompagné d'un MIDI exactement aligné (MAESTRO,
// Slakh). Le moteur MIDI y produit la grille, qui sert de référence pour mesurer
// le moteur AUDIO sur le même enregistrement.
//
// Ce test vérifie les deux choses dont tout le reste dépend : la traduction vers
// la syntaxe Harte (celle de mir_eval et des corpus), et le fait que le pont
// reproduise une vérité terrain connue — ici les 20 morceaux synthétiques de
// `deliverable/data/synthetic_b1`, qui ont MIDI, audio ET grille de référence.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gridFromMidi, harteLabel, toLab } from '../../scripts/midi-to-grid.mjs';

let passed = 0;
let failed = 0;
const check = (label, actual, expected) => {
  if (actual === expected) { passed += 1; console.log(`✅ ${label}`); return; }
  failed += 1;
  console.log(`❌ ${label}\n     attendu : ${expected}\n     obtenu  : ${actual}`);
};

console.log('\n--- Syntaxe Harte (mir_eval, Isophonics, Billboard) ---');
check('triade majeure', harteLabel('C'), 'C:maj');
check('triade mineure', harteLabel('Am'), 'A:min');
check('septième de dominante', harteLabel('G7'), 'G:7');
check('septième majeure', harteLabel('Cmaj7'), 'C:maj7');
check('septième mineure', harteLabel('Dm7'), 'D:min7');
check('demi-diminué', harteLabel('Bm7b5'), 'B:hdim7');
// Les fondamentales sont normalisées en bémols pour le corpus, quelle que soit
// l'orthographe choisie dans l'app : mir_eval compare des classes de hauteur et
// tient C#:dim7 et Db:dim7 pour identiques (root et triads à 1,0, vérifié).
check('diminué, fondamentale normalisée', harteLabel('C#dim7'), 'Db:dim7');
// Les enrichissements se replient sur la triade : les corpus de référence
// n'annotent pas les neuvièmes ajoutées, et mir_eval compare à ce niveau.
check('neuvième ajoutée → triade', harteLabel('Gadd9'), 'G:maj');
check('quarte ajoutée mineure → triade', harteLabel('Emadd11'), 'E:min');
check('altérée → dominante', harteLabel('E7alt'), 'E:7');
// La basse s'écrit en DEGRÉ dans l'accord, pas en note : c'est la syntaxe Harte.
check('renversement : la basse est un degré', harteLabel('G/B'), 'G:maj/3');
check('renversement de septième', harteLabel('Db7/F'), 'Db:7/3');
check('basse étrangère', harteLabel('Fadd9/A'), 'F:maj/3');
check('silence', harteLabel('N'), 'N');
check('orthographe en dièses ramenée au corpus', harteLabel('A#7'), 'Bb:7');

console.log('\n--- Le pont reproduit une vérité terrain connue ---');
// 20 morceaux synthétiques : MIDI + audio + grille de référence générée avec eux.
const CORPUS = new URL('../../deliverable/data/synthetic_b1', import.meta.url).pathname;
if (!existsSync(CORPUS)) {
  console.log('⏭  corpus synthétique absent — banc ignoré');
} else {
  const truths = readdirSync(CORPUS).filter((f) => f.endsWith('_ground_truth.json')).sort();
  let exact = 0;
  let worstOffset = 0;
  for (const file of truths) {
    const truth = JSON.parse(readFileSync(join(CORPUS, file), 'utf8'));
    const midi = join(CORPUS, file.replace('_ground_truth.json', '.mid'));
    if (!existsSync(midi)) continue;
    const grid = gridFromMidi(midi);
    const sameLabels = grid.chords.length === truth.chords.length
      && grid.chords.every((c, i) => c.label === truth.chords[i].label);
    if (sameLabels) exact += 1;
    grid.chords.forEach((c, i) => {
      if (truth.chords[i]) worstOffset = Math.max(worstOffset, Math.abs(c.start - truth.chords[i].start));
    });
  }
  check(`les ${truths.length} grilles sont identiques à la référence`, exact, truths.length);
  check('aucune frontière ne dérive de plus de 10 ms', worstOffset <= 0.01, true);
}

console.log('\n--- Format .lab de MIREX ---');
const lab = toLab({ chords: [{ start: 0, end: 2.5, label: 'C:maj' }, { start: 2.5, end: 4, label: 'G:7' }] });
check('deux colonnes de temps et une étiquette, séparées par des tabulations',
  lab, '0.000000\t2.500000\tC:maj\n2.500000\t4.000000\tG:7\n');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);

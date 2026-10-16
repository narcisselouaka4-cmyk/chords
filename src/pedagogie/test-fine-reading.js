// Tests — relecture fine des passages rapides (fine-reading.js).
//
// Un clavier dessiné simulé : un accord, une descente rapide de 22 notes (une toutes les 70 ms,
// allumée 60 ms, comme le lick de « Gospel Piano Harmony Secrets » entre 0:20 et 0:22, qui
// descend de l'octave 5 à l'octave 2), puis un accord. On compare ce que donne la lecture à
// 8 images/s seule, et avec la relecture fine.
//
// Usage : node src/pedagogie/test-fine-reading.js

import { busyWindows, mergeFineSamples, sampleOnsets, FINE_FPS } from './fine-reading.js';
import { samplesToNoteEvents } from './teacher-notes.js';

let failed = 0;
let passed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Gamme de Do descendante, de Do6 (84) à Ré3 (50) : 21 notes + Do3.
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const run = [];
for (let m = 84; m >= 48 && run.length < 22; m -= 1) if (WHITE.includes(m % 12)) run.push(m);
const RUN_START = 2;
const STEP = 0.07;
const truth = [
  ...[48, 52, 55, 60].map((midi) => ({ midi, start: 0, end: 1.9 })), // accord de Do, tenu
  ...run.map((midi, i) => ({ midi, start: RUN_START + i * STEP, end: RUN_START + i * STEP + 0.06 })),
  ...[41, 53, 57, 60].map((midi) => ({ midi, start: 4, end: 5.5 })), // accord de Fa
];
const lit = (t) => truth.filter((n) => t >= n.start && t < n.end).map((n) => ({ midi: n.midi }));
const read = (fps, from, to) => {
  const out = [];
  for (let i = 0; from + i / fps < to; i += 1) {
    const t = Math.round((from + i / fps) * 1000) / 1000;
    out.push({ t, keys: lit(t) });
  }
  return out;
};

const coarse = read(8, 0, 6);
const runNotes = (notes) => notes.filter((n) => n.start >= RUN_START - 0.01 && n.start < RUN_START + run.length * STEP);
const coarseNotes = samplesToNoteEvents(coarse, 1 / 8);
const seenCoarse = runNotes(coarseNotes).length;

const windows = busyWindows(coarse, { duration: 6 });
check('le lick est repéré comme passage chargé', windows.length === 1 && windows[0].start <= RUN_START && windows[0].end >= RUN_START + run.length * STEP,
  JSON.stringify(windows));
check('les accords tenus seuls ne déclenchent pas de relecture', !windows.some((w) => w.end < 1.5));
// Comping : un accord de 4 notes toutes les 0,5 s, tenu 0,45 s, pendant 6 s.
const comp = [];
for (let k = 0; k < 12; k += 1) for (const midi of [48, 55, 64, 67]) comp.push({ midi, start: k * 0.5, end: k * 0.5 + 0.45 });
const litC = (t) => comp.filter((n) => t >= n.start && t < n.end).map((n) => ({ midi: n.midi }));
const cComp = []; for (let i = 0; i / 8 < 6; i += 1) cComp.push({ t: i / 8, keys: litC(i / 8) });
check('un accompagnement en accords (2 par seconde, tenus) n\'est pas relu', busyWindows(cComp, { duration: 6 }).length === 0, JSON.stringify(busyWindows(cComp, { duration: 6 })));

const fine = windows.map((w) => ({ ...w, samples: read(FINE_FPS, w.start, w.end) }));
const merged = mergeFineSamples(coarse, fine);
const fineNotes = samplesToNoteEvents(merged, 1 / 8);
const seenFine = runNotes(fineNotes);
check(`à 8 i/s, le lick perd des notes (${seenCoarse} / ${run.length} vues)`, seenCoarse < run.length * 0.75);
check(`relu à ${FINE_FPS} i/s, toutes les notes du lick sont là (${seenFine.length} / ${run.length})`, seenFine.length === run.length);
const order = seenFine.map((n) => n.midi);
check('dans le bon ordre (Do6 → Do3)', order.join() === run.join(), order.join());
const worst = Math.max(...seenFine.map((n, i) => Math.abs(n.start - (RUN_START + i * STEP))));
check(`attaques à moins de 35 ms près (pire : ${Math.round(worst * 1000)} ms)`, worst < 0.035);
check('les accords autour sont intacts', fineNotes.filter((n) => n.start < 0.01).length === 4 && fineNotes.filter((n) => Math.abs(n.start - 4) < 0.05).length === 4);
check('les images fusionnées restent dans l\'ordre du temps', merged.every((s, i) => i === 0 || s.t >= merged[i - 1].t));
check('sampleOnsets : une attaque par touche qui s\'allume', sampleOnsets([{ t: 0, keys: [{ midi: 60 }] }, { t: 0.1, keys: [{ midi: 60 }, { midi: 64 }] }, { t: 0.2, keys: [] }, { t: 0.3, keys: [{ midi: 60 }] }]).join() === '0,0.1,0.3');

// Groove : double-croches à 190 à la noire (79 ms), sur 4 s, sans accord tenu.
const sixteenth = 60 / 190 / 4;
const montuno = [];
for (let i = 0; i * sixteenth < 4; i += 1) if (i % 4 !== 1) montuno.push({ midi: i % 2 ? 67 : 72, start: i * sixteenth, end: i * sixteenth + sixteenth * 0.6 });
const litM = (t) => montuno.filter((n) => t >= n.start && t < n.end).map((n) => ({ midi: n.midi }));
const readM = (fps, from, to) => { const o = []; for (let i = 0; from + i / fps < to; i += 1) { const t = Math.round((from + i / fps) * 1000) / 1000; o.push({ t, keys: litM(t) }); } return o; };
const cM = readM(8, 0, 4);
const wM = busyWindows(cM, { duration: 4 });
const mM = mergeFineSamples(cM, wM.map((w) => ({ ...w, samples: readM(FINE_FPS, w.start, w.end) })));
const nCoarse = samplesToNoteEvents(cM, 1 / 8).length;
const nFine = samplesToNoteEvents(mM, 1 / 8).length;
check(`montuno à 190 : ${nCoarse} attaques vues à 8 i/s, ${nFine} avec la relecture (${montuno.length} jouées)`, nFine >= montuno.length * 0.95 && nCoarse < montuno.length * 0.8);

// [Claude] — 2026-10-09 — Un lick si rapide que la lecture à 8 i/s n'en voit que quelques notes
// (Narcisse : « Copilot ne joue que 4 ou 5 des 19 à 26 notes ») : 26 notes en 2 s, chaque touche
// allumée 35 ms. Il doit quand même être relu, du début à la fin.
for (const phase of [0, 0.04, 0.09]) {
  const R = 20 + phase;
  const fast = [];
  for (let m = 96; m >= 36 && fast.length < 26; m -= 1) if (WHITE.includes(m % 12)) fast.push(m);
  const notesF = [
    ...[48, 52, 55, 60].map((midi) => ({ midi, start: 18.5, end: 19.8 })),
    ...fast.map((midi, i) => ({ midi, start: R + i * (2 / 26), end: R + i * (2 / 26) + 0.035 })),
    ...[41, 53, 57, 60].map((midi) => ({ midi, start: 22.4, end: 24 })),
  ];
  const litF = (t) => notesF.filter((n) => t >= n.start && t < n.end).map((n) => ({ midi: n.midi }));
  const readF = (fps, a, b) => { const o = []; for (let i = Math.ceil(a * fps - 1e-9); i / fps < b; i += 1) { const t = Math.round((i / fps) * 1000) / 1000; o.push({ t, keys: litF(t) }); } return o; };
  const cF = readF(8, 0, 30);
  const wF = busyWindows(cF, { duration: 30 });
  const mF = mergeFineSamples(cF, wF.map((w) => ({ ...w, samples: readF(FINE_FPS, w.start, w.end) })));
  const inLick = (ns) => ns.filter((n) => n.start >= R - 0.01 && n.start < R + 2).length;
  const seen8 = inLick(samplesToNoteEvents(cF, 1 / 8));
  const seenAll = inLick(samplesToNoteEvents(mF, 1 / 8));
  check(`lick de 26 notes en 2 s, touches allumées 35 ms (décalage ${phase}) : ${seen8} vues à 8 i/s, ${seenAll} après relecture`,
    wF.some((w) => w.start <= R && w.end >= R + 2) && seenAll >= 24, JSON.stringify(wF));
}
// Une ballade (accords tenus 1,5 s) n'est pas relue.
const ballad = [];
for (let k = 0; k < 8; k += 1) for (const midi of [48, 55, 64, 71]) ballad.push({ midi, start: k * 2, end: k * 2 + 1.5 });
const litB = (t) => ballad.filter((n) => t >= n.start && t < n.end).map((n) => ({ midi: n.midi }));
const cB = []; for (let i = 0; i / 8 < 16; i += 1) cB.push({ t: i / 8, keys: litB(i / 8) });
check('une ballade en accords tenus n\'est pas relue', busyWindows(cB, { duration: 16 }).length === 0);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);

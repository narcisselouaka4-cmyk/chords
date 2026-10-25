#!/usr/bin/env node
// [Claude] — 2026-10-25 — Le pont MIDI → vérité terrain horodatée.
//
// Narcisse veut que le moteur d'accords AUDIO devienne excellent, et s'inquiète
// à juste titre : les corpus académiques d'accords (Isophonics, Billboard, JAAH)
// distribuent les annotations mais PAS l'audio, et récupérer l'audio ailleurs
// n'est ni légal ni tenable.
//
// Il existe une sortie : les corpus dont l'audio est libre ET accompagné d'un
// MIDI exactement aligné (MAESTRO, Slakh). On fait tourner le moteur MIDI — celui
// des Sessions MIDI, exact par construction puisque les notes sont connues — sur
// le MIDI, et on obtient une grille d'accords horodatée qui sert de vérité
// terrain pour mesurer le moteur audio sur le MÊME enregistrement.
//
// Sortie au format .lab de MIREX (début<TAB>fin<TAB>étiquette), celui que lit
// mir_eval, plus un JSON lisible. Les étiquettes suivent la syntaxe Harte
// (« C:maj », « A:min7 », « N » pour l'absence d'accord).
//
// Usage :
//   node scripts/midi-to-grid.mjs <fichier.mid> [--lab sortie.lab] [--json sortie.json]
//   node scripts/midi-to-grid.mjs <dossier> --out <dossier-sortie>

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { parseMidiFile } from '../src/recorder/serializer.js';
import { analyzeMidiEvents } from '../src/analyzer/midi-source.js';

// Qualité de l'app → syntaxe Harte, celle des corpus d'accords et de mir_eval.
const HARTE = {
  '': 'maj', m: 'min', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4',
  6: 'maj6', m6: 'min6', '6/9': 'maj6', 'm6/9': 'min6',
  add9: 'maj', madd9: 'min', add11: 'maj', madd11: 'min',
  maj7: 'maj7', maj9: 'maj7', maj13: 'maj7', 'maj7#11': 'maj7',
  'maj13#11': 'maj7', 'maj7#5': 'aug',
  m7: 'min7', m9: 'min7', m11: 'min7', m13: 'min7',
  mMaj7: 'minmaj7', mMaj9: 'minmaj7', m7b5: 'hdim7', dim7: 'dim7',
  7: '7', 9: '9', 13: '13', '7sus4': 'sus4(b7)', '9sus4': 'sus4(b7,9)',
  '13sus4': 'sus4(b7,9)', '7b9': '7', '7#9': '7', '7#11': '7', '13#11': '13',
  '7b13': '7', '7#5': 'aug(b7)', '7b5': '7', '7b9b13': '7', '7#9b13': '7',
  '7b5b9': '7', '7#5#9': 'aug(b7)', '13b9': '13', '7alt': '7',
};

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const HARTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Étiquette Harte d'un nom d'accord de l'app (« Gadd9/B » → « G:maj/3 »). */
export function harteLabel(chord) {
  if (!chord || chord === 'N') return 'N';
  const match = String(chord).match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
  if (!match) return 'N';
  const [, root, symbol, bass] = match;
  const rootPc = PC[root];
  if (rootPc === undefined) return 'N';
  const quality = HARTE[symbol] ?? 'maj';
  const base = `${HARTE_NAMES[rootPc]}:${quality}`;
  if (!bass || PC[bass] === undefined || PC[bass] === rootPc) return base;
  // Degré de la basse dans l'accord, comme l'exige la syntaxe Harte.
  const DEGREES = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
  return `${base}/${DEGREES[(PC[bass] - rootPc + 12) % 12]}`;
}

/** La grille d'un fichier MIDI : segments horodatés, étiquettes Harte. */
export function gridFromMidi(filePath) {
  const parsed = parseMidiFile(new Uint8Array(readFileSync(filePath)));
  const analysis = analyzeMidiEvents(parsed.events, { duration: parsed.duration, tempo: parsed.tempo });
  const chords = analysis.chords.map((c) => ({
    start: c.startTime,
    end: c.endTime,
    label: harteLabel(c.chord),
    chord: c.chord,
  }));
  return {
    source: basename(filePath),
    duration: analysis.duration,
    key: analysis.key,
    keyMode: analysis.keyMode,
    tempo: analysis.tempo,
    chords,
  };
}

/** Le format .lab de MIREX, celui que lit mir_eval. */
export function toLab(grid) {
  return grid.chords.map((c) => `${c.start.toFixed(6)}\t${c.end.toFixed(6)}\t${c.label}`).join('\n') + '\n';
}

function convertOne(file, labPath, jsonPath) {
  const grid = gridFromMidi(file);
  if (labPath) writeFileSync(labPath, toLab(grid));
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(grid, null, 2)}\n`);
  return grid;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage : node scripts/midi-to-grid.mjs <fichier.mid|dossier> [--lab f.lab] [--json f.json] [--out dossier]');
    process.exit(args.length === 0 ? 1 : 0);
  }
  const target = args[0];
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const outDir = flag('--out');

  if (!existsSync(target)) { console.error(`Introuvable : ${target}`); process.exit(1); }

  if (statSync(target).isDirectory()) {
    const files = readdirSync(target).filter((f) => ['.mid', '.midi'].includes(extname(f).toLowerCase()));
    if (!files.length) { console.error(`Aucun MIDI dans ${target}`); process.exit(1); }
    const dir = outDir || target;
    mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const stem = basename(f, extname(f));
      const grid = convertOne(join(target, f), join(dir, `${stem}.lab`), join(dir, `${stem}.grid.json`));
      console.log(`${stem.padEnd(44)} ${String(grid.chords.length).padStart(4)} accords  ${grid.duration.toFixed(1)}s  ton ${grid.key ?? '?'}`);
    }
    console.log(`\n${files.length} fichiers convertis dans ${dir}`);
    return;
  }

  const stem = basename(target, extname(target));
  const grid = convertOne(target, flag('--lab') || `${stem}.lab`, flag('--json'));
  console.log(toLab(grid).trimEnd());
  console.error(`\n${grid.chords.length} accords · ${grid.duration.toFixed(1)}s · ton ${grid.key ?? '?'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

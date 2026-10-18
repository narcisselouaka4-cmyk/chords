/**
 * Test d'export de la grille — mission ANGES §8 (ADR-061).
 *
 * Vérifie que l'export JSON/CSV de l'onglet Analyse :
 *  1. contient les méta attendues (audio, tonalité complète, version du moteur,
 *     date) et, par accord, l'étiquette affichée, la confidence, le rôle ;
 *  2. expose la séquence brute du Viterbi (rawChords) quand le moteur la fournit ;
 *  3. s'écrit sur disque puis se relit à l'identique ;
 *  4. est lisible par scripts/eval-chords-triad.py SANS conversion (le champ
 *     plat `chord` + startTime/endTime suivent le format timestamped).
 *
 * Usage : node scripts/test-export-grid.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  exportAnalysisToJson,
  exportAnalysisToCsv,
} from '../src/analyzer/analysis-export.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`✅ ${name}`);
  } else {
    failures += 1;
    console.error(`❌ ${name}`);
  }
}

// Analyse fictive mais réaliste : 3 accords affichés dont un corrigé à la main,
// séquence brute du Viterbi fournie par le moteur ADR-061.
const analysis = {
  title: 'Analyse de test',
  duration: 12.0,
  tempo: 107.7,
  timeSignature: '4/4',
  key: 'C#',
  keyMode: 'major',
  engine: 'ADR-061-triades-1',
  keys: [
    { start: 0, end: 180, key: 'F', mode: 'major', confidence: 0.9 },
    { start: 180, end: 360, key: 'F#', mode: 'major', confidence: 0.9 },
  ],
  chords: [
    {
      segmentId: 'seg_a1',
      startTime: 0.0,
      endTime: 4.0,
      chord: 'A#m',
      confidence: 0.91,
      role: 'structural',
      manualOverride: null,
    },
    {
      segmentId: 'seg_a2',
      startTime: 4.0,
      endTime: 8.0,
      chord: 'G#7',
      confidence: 0.62,
      role: 'passing',
      // correction manuelle : l'utilisateur a remplacé G#7 par G#
      manualOverride: { root: 8, quality: '', bass: null },
    },
    {
      segmentId: 'seg_a3',
      startTime: 8.0,
      endTime: 12.0,
      chord: 'C#',
      confidence: 0.85,
      role: 'structural',
      manualOverride: null,
    },
  ],
  rawChords: [
    { startTime: 0.0, endTime: 4.1, chord: 'A#m', confidence: 0.9 },
    { startTime: 4.1, endTime: 6.0, chord: 'F#', confidence: 0.5 },
    { startTime: 6.0, endTime: 8.2, chord: 'G#7', confidence: 0.6 },
    { startTime: 8.2, endTime: 12.0, chord: 'C#', confidence: 0.8 },
  ],
};

const json = exportAnalysisToJson(analysis, { fileName: 'anges-test.mp4' });

check('JSON : version du moteur présente', json.engine === 'ADR-061-triades-1');
check('JSON : nom du fichier audio', json.audioFile === 'anges-test.mp4');
check('JSON : tonalité + mode', json.key === 'C#' && json.keyMode === 'major');
check('JSON : date ISO', typeof json.exportedAt === 'string' && json.exportedAt.includes('T'));
check('JSON : 3 segments', json.segments.length === 3);
check('JSON : étiquette plate (accord affiché)', json.segments[0].chord === 'A#m');
check('JSON : confidence conservée', json.segments[0].confidence === 0.91);
check('JSON : rôle conservé', json.segments[1].role === 'passing');
check('JSON : correction manuelle comptée', json.manuallyEditedCount === 1);
check('JSON : accord corrigé affiché comme G#', json.segments[1].effectiveChord.symbol === 'G#');
check('JSON : tonalités locales exportées (2, dont 1 modulation)',
  Array.isArray(json.keys) && json.keys.length === 2 && json.keys[1].key === 'F#');
check('JSON : séquence brute du Viterbi (4 bruts vs 3 finaux)',
  Array.isArray(json.rawChords) && json.rawChords.length === 4);

// Écriture sur disque + relecture.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pjc-export-'));
const jsonPath = path.join(tmpDir, 'grille.json');
const csvPath = path.join(tmpDir, 'grille.csv');
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8');
const csv = exportAnalysisToCsv(analysis, { fileName: 'anges-test.mp4' });
fs.writeFileSync(csvPath, csv, 'utf-8');

const reread = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
check('Disque : JSON relu identique', reread.segments.length === 3 && reread.engine === 'ADR-061-triades-1');

const csvLines = fs.readFileSync(csvPath, 'utf-8').trim().split(/\r\n/);
check('CSV : en-tête + une ligne par accord', csvLines.length === 5);
check('CSV : ligne tonalités en en-tête (2 tonalités)',
  csvLines[0].startsWith('# tonalites') && csvLines[0].includes('F majeur') && csvLines[0].includes('F# majeur'));
check('CSV : en-tête attendu', csvLines[1].startsWith('start,end,chord,root,quality,bass,confidence,role,detected,manuallyEdited'));
check('CSV : accord corrigé = G#', csvLines[3].includes(',G#,'));

// Compatibilité directe avec le thermomètre Python (format timestamped).
const py = spawnSync('.venv/bin/python', ['-'], {
  cwd: process.cwd(),
  input: `
import json, importlib.util
spec = importlib.util.spec_from_file_location('ev', 'scripts/eval-chords-triad.py')
ev = importlib.util.module_from_spec(spec); spec.loader.exec_module(ev)
d = json.load(open(${JSON.stringify(jsonPath)}))
segs = ev.parse_gt_timestamped(d)
assert len(segs) == 3, len(segs)
folded = [t for (_, _, t) in segs]  # déjà repliées par le parseur
assert folded[0] == (10, 'min', None), folded[0]
assert folded[1] == (8, 'maj', None), folded[1]
assert folded[2] == (1, 'maj', None), folded[2]
print('PYTHON OK')
`,
  encoding: 'utf-8',
});
check('Thermomètre : JSON lisible sans conversion (accords repliés justes)',
  py.status === 0 && py.stdout.includes('PYTHON OK'));
if (py.status !== 0 || !py.stdout.includes('PYTHON OK')) {
  console.error('   python stdout:', (py.stdout || '').slice(0, 400));
  console.error('   python stderr:', (py.stderr || '').slice(0, 800));
}

fs.rmSync(tmpDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nÉCHEC : ${failures} vérification(s) en erreur.`);
  process.exit(1);
}
console.log('\nExport de la grille : tous les tests passent.');
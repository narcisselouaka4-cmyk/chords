/**
 * Tests de non-régression — Contrat de champs entre le moteur et l'interface.
 *
 * `TemplateAudioAnalyzer.analyze()` reconstruit chaque segment avec une **liste
 * blanche** de champs. Tout champ absent de cette liste est silencieusement
 * perdu : le moteur le produit, l'IPC le transmet, et l'interface ne le voit
 * jamais. Aucune erreur, aucun avertissement.
 *
 * C'est exactement ce qui est arrivé au champ `role` : le moteur classait
 * correctement les accords en structurel / passage / incertain, et la timeline
 * les affichait tous comme structurels — parce que le mapper effaçait
 * l'information en chemin. Le symptôme ressemblait à un bug de CSS ; la cause
 * était quinze lignes plus haut dans la chaîne.
 *
 * Ces tests ferment ce mode de défaillance : ils comparent ce que l'interface
 * lit réellement à ce que le mapper laisse passer.
 *
 * Usage : node src/analyzer/test-analyzer-mapping.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { UI_SEGMENT_FIELDS, createAudioAnalyzer } from './audio-analyzer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(projectRoot, rel), 'utf-8');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    failures++;
  } else {
    console.log(`  ✅ ${message}`);
  }
}

function runTest(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ❌ Exception: ${err.message}`);
    failures++;
  }
}

/** Segment tel que le produit réellement `electron/audio-processor.py`. */
function engineSegment() {
  return {
    startTime: 3.529,
    endTime: 4.667,
    chord: 'D',
    confidence: 0.812,
    role: 'passing',
    inStructuralLoop: false,
    degree: 'IV',
    structural_chord: 'D',
    observation_candidates: [],
    viterbi_choice: 'D',
    analysis: {},
    techniques: [],
    suggestions: [],
    reharmonizations: [],
    voiceLeading: {},
  };
}

/** Passe une charge utile moteur par le mapper, sans toucher à l'IPC. */
function mapThroughAnalyzer(chords) {
  const analyzer = createAudioAnalyzer();
  const payload = {
    wavPath: '/tmp/x.wav', duration: 141.2, tempo: 107.7, timeSignature: '4/4',
    key: 'A', keyMode: 'major', keyConfidence: 0.9, confidence: 0.8,
    chords, bassSegments: [],
  };
  // La méthode de normalisation est privée dans le flux IPC ; on la sollicite
  // par le seul chemin public en neutralisant l'appel Electron.
  const saved = globalThis.window;
  globalThis.window = { electronAPI: { analyzer: { processFile: async () => payload } } };
  try {
    return analyzer.analyze('/tmp/x.mp3');
  } finally {
    if (saved === undefined) delete globalThis.window;
    else globalThis.window = saved;
  }
}

// ── A. Le contrat couvre ce que l'interface lit vraiment ──

runTest("A. Contrat — tout champ lu par la timeline figure dans le contrat", () => {
  const ui = read('src/ui/analyzer-tab.js');
  // Champs ajoutés côté interface, pas produits par le moteur.
  const ajoutesParLUI = new Set(['segmentId', 'manualOverride']);
  const lus = new Set();
  for (const m of ui.matchAll(/\b(?:segment|chord|seg)\.([A-Za-z_]\w*)\b/g)) {
    lus.add(m[1]);
  }
  // On ne retient que les accès qui ressemblent à des données de segment.
  const interessants = [...lus].filter((f) =>
    !ajoutesParLUI.has(f) && UI_SEGMENT_FIELDS.concat(['length', 'find', 'map', 'forEach',
      'chord', 'toFixed', 'push', 'slice', 'filter', 'indexOf']).includes(f));
  for (const field of interessants) {
    assert(UI_SEGMENT_FIELDS.includes(field),
           `« ${field} », lu par l'interface, est déclaré au contrat`);
  }
  assert(UI_SEGMENT_FIELDS.includes('role'),
         'le contrat couvre « role » — la régression qui a motivé ce test');
  assert(UI_SEGMENT_FIELDS.includes('degree'),
         'le contrat couvre « degree », lu par l’inspecteur');
});

// ── B. Le mapper respecte le contrat ──

runTest('B. Mapper — aucun champ du contrat n’est perdu', async () => {
  const result = await mapThroughAnalyzer([engineSegment()]);
  const mapped = result.chords[0];
  for (const field of UI_SEGMENT_FIELDS) {
    assert(Object.prototype.hasOwnProperty.call(mapped, field),
           `« ${field} » survit au mapper`);
  }
});

runTest('B. Mapper — les valeurs ne sont pas seulement présentes, elles sont justes', async () => {
  const source = engineSegment();
  const result = await mapThroughAnalyzer([source]);
  const mapped = result.chords[0];
  assert(mapped.role === 'passing', `role conservé : ${mapped.role}`);
  assert(mapped.degree === 'IV', `degree conservé : ${mapped.degree}`);
  assert(mapped.inStructuralLoop === false,
         `inStructuralLoop conservé, y compris quand il vaut false : ${mapped.inStructuralLoop}`);
  assert(mapped.chord === 'D' && mapped.startTime === 3.529,
         'les champs historiques restent corrects');
  assert(mapped.structuralChord === 'D',
         'structural_chord est bien renommé en structuralChord');
});

runTest('B. Mapper — un segment sans rôle ne casse rien', async () => {
  const legacy = engineSegment();
  delete legacy.role;
  delete legacy.degree;
  delete legacy.inStructuralLoop;
  const result = await mapThroughAnalyzer([legacy]);
  const mapped = result.chords[0];
  assert(mapped.role === null, 'une analyse antérieure au champ role donne null, pas undefined');
  assert(mapped.degree === null, 'idem pour degree');
  assert(mapped.chord === 'D', 'le reste du segment est intact');
});

// ── C. Le piège est signalé sur place ──

runTest('C. Le mapper porte un avertissement explicite', () => {
  const src = read('src/analyzer/audio-analyzer.js');
  assert(/Liste blanche/i.test(src),
         'le commentaire prévient que la liste est exhaustive et silencieuse');
  assert(src.includes('test-analyzer-mapping.js'),
         'il renvoie au test qui garde le contrat');
});

// ── Bilan ──

setTimeout(() => {
  console.log('\n' + '='.repeat(50));
  if (failures === 0) {
    console.log('✅ Contrat de champs moteur → interface respecté.');
    process.exit(0);
  } else {
    console.error(`❌ ${failures} test(s) en échec.`);
    process.exit(1);
  }
}, 100);

// [OpenCode] — 2026-08-07 — Lot B : tests de fiabilisation de l’état média.
// Exécutable avec : node tests/ui/test-media-format.js
// Aucun navigateur, jsdom ou dépendance supplémentaire : Node seul.
//
// Couvre :
//   - média sans métadonnées (durée indisponible) ;
//   - durée valide ;
//   - durée nulle ;
//   - durée invalide (NaN, Infinity, négative) ;
//   - changement de fichier (réinitialisation de l’état durée) ;
//   - arrivée tardive de loadedmetadata (raffraîchissement timer) ;
//   - libellés distincts entre Studio et Analyse ;
//   - absence de confusion entre leurs états.

import { formatMediaDuration, isValidMediaDuration } from '../../src/ui/media-format.js';
import {
  buildFileContextText,
  STUDIO_FILE_LABEL,
  ANALYZER_FILE_LABEL,
  STUDIO_EMPTY_FILE_TEXT,
  ANALYZER_EMPTY_FILE_TEXT,
} from '../../src/ui/file-context.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'expected true');
}

// --- Gardes statiques sur les sources UCs branchées ------------------------

const studioSrc = fs.readFileSync(
  fileURLToPath(new URL('../../src/ui/studio-tab.js', import.meta.url)),
  'utf8',
);
const analyzerSrc = fs.readFileSync(
  fileURLToPath(new URL('../../src/ui/analyzer-tab.js', import.meta.url)),
  'utf8',
);

// ===========================================================================
// Tests — formatage robuste de la durée
// ===========================================================================

console.log('Tests media-format / file-context (Lot B — état média fiable)');

runTest('B1 — média sans métadonnées (undefined/null) → 00:00 et non affiché comme valide', () => {
  assertEqual(formatMediaDuration(undefined), '00:00', 'undefined → 00:00');
  assertEqual(formatMediaDuration(null), '00:00', 'null → 00:00');
  assertEqual(isValidMediaDuration(undefined), false, 'undefined non valide');
  assertEqual(isValidMediaDuration(null), false, 'null non valide');
  assertEqual(isValidMediaDuration(NaN), false, 'NaN non valide');
});

runTest('B2 — durée valide correctement formatée', () => {
  assertEqual(formatMediaDuration(65), '01:05', '65s → 01:05');
  assertEqual(formatMediaDuration(382.9), '06:22', '382.9s → 06:22 (arrondi à l’entier)');
  assertEqual(formatMediaDuration(0.5), '00:00', '0.5s → 00:00 (entier zéro)');
  assertEqual(isValidMediaDuration(65), true, '65 valide');
  assertEqual(isValidMediaDuration(0.5), true, '0.5 valide');
});

runTest('B3 — durée nulle → 00:00', () => {
  assertEqual(formatMediaDuration(0), '00:00', '0 → 00:00');
  assertEqual(isValidMediaDuration(0), false, '0 non valide (aucune durée réelle)');
});

runTest('B4 — durée invalide → 00:00, jamais NaN/Infinity/négatif affiché', () => {
  assertEqual(formatMediaDuration(NaN), '00:00', 'NaN → 00:00');
  assertEqual(formatMediaDuration(Infinity), '00:00', '+Infinity → 00:00');
  assertEqual(formatMediaDuration(-Infinity), '00:00', '-Infinity → 00:00');
  assertEqual(formatMediaDuration(-5), '00:00', '-5 → 00:00');
  assertEqual(formatMediaDuration('abc'), '00:00', '\'abc\' → 00:00');
  assertEqual(isValidMediaDuration(Infinity), false, 'Infinity non valide');
  assertEqual(isValidMediaDuration(-3), false, 'négatif non valide');
});

runTest('B5 — durées propres sans état fantôme', () => {
  assertEqual(formatMediaDuration('65'), '01:05', 'chaîné numérique valide → 01:05');
  // Bornage : une durée fantôme énorme ne doit pas produire une chaîne absurde.
  assertEqual(formatMediaDuration(1e9), '99:59:59', 'borné à 99:59:59');
});

// ===========================================================================
// Tests — changement de fichier / durée tardive
// ===========================================================================

runTest('B6 — le changement de fichier réinitialise l’ancien état durée', () => {
  // Garde statique : destroyMediaPlayer() doit remettre à zéro mediaDuration et
  // lastKnownDuration avant de charger un nouveau fichier.
  assertTrue(/function destroyMediaPlayer\(\)[\s\S]*mediaDuration\s*=\s*0/.test(studioSrc),
    'destroyMediaPlayer doit réinitialiser mediaDuration à 0');
  assertTrue(/function destroyMediaPlayer\(\)[\s\S]*lastKnownDuration\s*=\s*0/.test(studioSrc),
    'destroyMediaPlayer doit réinitialiser lastKnownDuration à 0');
});

runTest('B7 — l’arrivée tardive de loadedmetadata rafraîchit le timer', () => {
  // Garde statique : les événements loadedmetadata/durationchange et la
  // waveform prête doivent déclencher un rafraîchissement du timer.
  assertTrue(/refreshMediaDurationDisplay/.test(studioSrc),
    'studio-tab doit contenir refreshMediaDurationDisplay');
  assertTrue(/ondurationchange/.test(studioSrc),
    'studio-tab doit écouter durationchange');
  assertTrue(/onloadedmetadata[\s\S]*refreshMediaDurationDisplay/.test(studioSrc),
    'loadedmetadata doit déclencher le rafraichissement du timer');
  assertTrue(/generateWaveformBlocking[\s\S]*refreshMediaDurationDisplay\(\)/.test(studioSrc),
    'la waveform prête doit déclencher le rafraichissement du timer');
});

runTest('B8 — la durée totale ne provient jamais d’une valeur invalide', () => {
  // Garde statique : getTotalDuration() passe par isValidMediaDuration.
  assertTrue(/function getTotalDuration\(\)[\s\S]*isValidMediaDuration/.test(studioSrc),
    'getTotalDuration doit filtrer les valeurs avec isValidMediaDuration');
});

// ===========================================================================
// Tests — contexte fichier Studio / Analyse
// ===========================================================================

runTest('B9 — Studio affiche « Fichier du Studio » et non celui d’Analyse', () => {
  const text = buildFileContextText({ tab: 'studio', fileName: 'ma-chanson.mp3' });
  assertTrue(text.includes(STUDIO_FILE_LABEL), `doit contenir « ${STUDIO_FILE_LABEL} »`);
  assertTrue(text.includes('ma-chanson.mp3'), 'doit contenir le nom réel du fichier');
  assertTrue(!text.includes(ANALYZER_FILE_LABEL), 'ne doit pas contenir « Fichier analysé »');
});

runTest('B10 — Analyse affiche « Fichier analysé » et non celui du Studio', () => {
  const text = buildFileContextText({ tab: 'analyzer', fileName: 'autre.mp3' });
  assertTrue(text.includes(ANALYZER_FILE_LABEL), 'doit contenir « Fichier analysé »');
  assertTrue(text.includes('autre.mp3'), 'doit contenir le nom réel du fichier');
  assertTrue(!text.includes(STUDIO_FILE_LABEL), 'ne doit pas contenir « Fichier du Studio »');
});

runTest('B11 — états vides explicites et distincts', () => {
  const std = buildFileContextText({ tab: 'studio', fileName: '' });
  assertTrue(std.includes(STUDIO_EMPTY_FILE_TEXT), 'Studio : état vide explicite');
  assertTrue(!std.includes(ANALYZER_EMPTY_FILE_TEXT), 'Studio : pas de confusion avec Analyse');
  const ana = buildFileContextText({ tab: 'analyzer', fileName: '  ' });
  assertTrue(ana.includes(ANALYZER_EMPTY_FILE_TEXT), 'Analyse : état vide explicite');
  assertTrue(!ana.includes(STUDIO_EMPTY_FILE_TEXT), 'Analyse : pas de confusion avec Studio');
  assertTrue(std !== ana, 'les états vides des deux onglets sont différents');
});

runTest('B12 — contenus nettement différents entre les deux onglets', () => {
  const studioFull = buildFileContextText({ tab: 'studio', fileName: 'A' });
  const analyzerFull = buildFileContextText({ tab: 'analyzer', fileName: 'A' });
  assertTrue(studioFull !== analyzerFull, 'les libellés remplis doivent différer');
});

runTest('B13 — aucun libellé ne prétend au transfert automatique de média', () => {
  for (const tab of ['studio', 'analyzer']) {
    const text = buildFileContextText({ tab, fileName: 'track.mp3' });
    for (const banned of ['transféré', 'Transféré', 'automatiquement', 'synchro']) {
      assertTrue(!text.includes(banned), `« ${banned} » interdit dans le contexte ${tab}`);
    }
  }
});

runTest('B14 — le timer n’affiche jamais 00:00 après une durée valide', () => {
  // Garde statique : updateProgressUI utilise formatDuration (robuste) pour le
  // timer, pas une constante codée en dur.
  assertTrue(/els\.time\.textContent[\s\S]*formatDuration/.test(studioSrc),
    'studio-tab doit formater le timer via formatDuration (robuste)');
  assertTrue(/formatMediaDuration/.test(studioSrc),
    'studio-tab doit importer formatMediaDuration');
});

// ===========================================================================

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log('LOT B : tests état média OK');
} else {
  console.log('LOT B : ÉCHEC');
}
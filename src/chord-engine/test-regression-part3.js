import { classifyVoicing, detectChord } from '../chord-engine/index.js';

// Tests de non-régression — Partie 3 : classification unique des suggestions.

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Partie 3.3 : cluster de secondes rapprochées → 'cluster'
// ---------------------------------------------------------------------------
runTest('Partie 3.3 — Secondes rapprochées classées cluster', () => {
  const notes = [60, 61, 64]; // C4, Db4, E4 → seconde mineure + tierce mineure = cluster
  const result = classifyVoicing(notes);
  assert(result.voicingType === 'cluster', `Attendu cluster, got ${result.voicingType}`);
  assert(result.topNote === 64, `Top note attendue 64, got ${result.topNote}`);
});

// ---------------------------------------------------------------------------
// Partie 3.3 : triade sur basse différente → upper structure / slash chord
// ---------------------------------------------------------------------------
runTest('Partie 3.3 — Triade Mi majeur sur basse Do → upper structure/slash', () => {
  // E major triad (E, G#, B) over C bass → C7#9 / C7(b9#9) polychord ou slash
  const notes = [48, 52, 55, 59, 64, 67]; // C3 E3 G3 B3 E4 G#4
  const detected = detectChord(notes);
  assert(detected != null, 'Accord détecté');
  // Doit être reconnu comme une structure avec basse différente de la fondamentale
  assert(detected.isSlash || detected.upperStructure || detected.polychord, 'Doit être slash, upper structure ou polychord');
});

// ---------------------------------------------------------------------------
// Partie 3 : classifyVoicing pure — même entrée, même sortie
// ---------------------------------------------------------------------------
runTest('Partie 3 — Pureté du classifieur', () => {
  const notes = [48, 52, 55, 59, 64];
  const a = classifyVoicing(notes);
  const b = classifyVoicing([...notes].reverse());
  assert(a.voicingType === b.voicingType, 'Ordre des notes ne doit pas influencer le type');
  assert(a.topNote === b.topNote, 'Top note identique quel que soit l\'ordre');
});

console.log('\n=== Partie 3 regression tests done ===');

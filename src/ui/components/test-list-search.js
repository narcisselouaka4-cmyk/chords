// Tests — recherche dans les bibliothèques (list-search.js, partie pure).
//
// Usage : node src/ui/components/test-list-search.js

import { matchesQuery, normalizeSearchText } from './list-search.js';

let failed = 0;
let passed = 0;
function check(label, ok) {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}`); }
}

check('sans accents ni casse', matchesQuery('Séance de Gospel — Ré mineur', 'seance GOSPEL re'));
check('tous les mots doivent s\'y trouver', matchesQuery('Gospel Harmony Secrets', 'gospel harmony') && !matchesQuery('Gospel Harmony Secrets', 'gospel salsa'));
check('une recherche vide laisse tout passer', matchesQuery('n\'importe quoi', '') && matchesQuery('x', '   '));
check('un fragment de mot suffit', matchesQuery('Amazing Grace', 'maz'));
check('espaces et retours à la ligne réduits', normalizeSearchText('  A \n  b ') === 'a b');
check('texte absent : rien', !matchesQuery(null, 'a') && matchesQuery(undefined, ''));

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);

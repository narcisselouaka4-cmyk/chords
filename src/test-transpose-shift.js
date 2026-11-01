// Retransposition en cours de lecture : les trois ensembles de notes se décalent ensemble.
import { shiftTransposedState } from './transpose-shift.js';

let passed = 0; let failed = 0;
const check = (ok, label) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };

const make = () => ({
  activeNotes: new Map([[60, 0.8], [64, 0.7]]),
  sustainedNotes: new Set([55]),
  playbackNotes: new Set([60, 64, 55]),
  keyTimes: new Map([[60, { onTime: 1 }]]),
});

const s = make();
shiftTransposedState(s, -1);
check([...s.activeNotes.keys()].join() === '59,63' && s.activeNotes.get(59) === 0.8, 'notes tenues décalées, vélocité gardée');
check([...s.sustainedNotes].join() === '54', 'notes sous la pédale décalées');
check([...s.playbackNotes].sort().join() === '54,59,63', 'notes de lecture décalées (elles restent « jaunes »)');
check([...s.activeNotes.keys()].every((m) => s.playbackNotes.has(m)), 'chaque touche tenue de la lecture reste dans playbackNotes');
check(s.keyTimes.size === 0, 'horodatages des grace notes effacés');

const t = make();
shiftTransposedState(t, 0);
check([...t.activeNotes.keys()].join() === '60,64' && t.keyTimes.size === 1, 'delta nul : rien ne bouge');

// Un pianiste qui joue pendant la lecture : sa note n'est pas dans playbackNotes, elle y reste étrangère.
const u = make(); u.activeNotes.set(72, 0.6);
shiftTransposedState(u, 2);
check(u.activeNotes.has(74) && !u.playbackNotes.has(74), 'une note jouée au doigt reste « bleue » après décalage');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exit(failed ? 1 : 0);
